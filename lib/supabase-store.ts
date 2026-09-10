import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cleanMeta, type Draft, type TeamRecord } from './domain';
import { makeSnapshot, updateSnapshot } from './snapshot';
import { indexTerms } from './search';
import { canonicalFormat, formatSearchValues } from './formats';
import {
  validateChunk,
  requestHash,
  IMPORT_CHUNK_SIZE,
  type ChunkKey,
} from './import-workflow';
import { hashToken } from './demo-store';
import { variantDetails, familySelection, variantPayload } from './variants';
import { cleanCollection } from './collections';
import { ServerTiming } from './server-timing';
import { prepareRestoreChunk, type BackupPayload } from './backup';
export class SupabaseStore {
  constructor(
    private client: SupabaseClient,
    private timing = new ServerTiming(),
  ) {}
  async backup(action: string, input: unknown = {}) {
    const payload = input as BackupPayload;
    if (action === 'backup_restore') {
      const state = await this.call('backup_status', { id: payload.id });
      const prepared = await prepareRestoreChunk(
        state,
        payload.index,
        payload.text,
      );
      if (prepared.replay) return state;
      return this.call(action, {
        ...payload,
        terms: prepared.records.map((r) => r.terms ?? null),
        definitions: prepared.records.map((r) => r.definition ?? null),
      });
    }
    return this.call(action, payload);
  }
  async call(action: string, payload: any = {}) {
    const { data, error } = await this.timing.measure('rpc', () =>
      Promise.resolve(this.client.rpc('vault', { action, payload })),
    );
    if (error) throw Error(error.message);
    if (['save', 'version', 'variant_create'].includes(action))
      this.timing.mark('mutation_end');
    return data;
  }
  initialize() {
    return Promise.resolve();
  }
  get(id: string): Promise<TeamRecord> {
    return this.call('get', { id });
  }
  list(p: any) {
    return this.call('list', {
      ...p,
      plan: p.plan
        ? {
            ...p.plan,
            meta: p.plan.meta.map((t: { field: string; value: string }) =>
              t.field === 'format'
                ? { ...t, values: formatSearchValues(t.value) }
                : t,
            ),
          }
        : p.plan,
    });
  }
  facets(p: { include_archived?: boolean; group_families?: boolean } = {}) {
    return this.call('facets', p).then((r) => ({
      ...r,
      formats: [
        ...new Set((r.formats as string[]).map((f) => canonicalFormat(f))),
      ],
    }));
  }
  async import(drafts: Draft[], key?: ChunkKey) {
    validateChunk(key);
    if (
      !Array.isArray(drafts) ||
      drafts.length < 1 ||
      drafts.length > 200 ||
      (key && drafts.length > IMPORT_CHUNK_SIZE)
    )
      throw Error(
        'Import request is too large; use the chunked import workflow.',
      );
    return this.call('import', {
      ...(key
        ? { chunk: { ...key, request_hash: await requestHash(drafts) } }
        : {}),
      teams: drafts.map((d) => {
        const id = crypto.randomUUID(),
          snapshot = makeSnapshot(d, id, 1, null),
          meta = cleanMeta(d);
        return {
          id,
          meta,
          snapshot,
          imported: !!d.imported,
          terms: indexTerms(meta, snapshot),
        };
      }),
    });
  }
  async save(
    id: string,
    d: Draft,
    expected: string,
    parent: string,
    expectedRevision: string,
    expectedUpdatedAt: string,
  ) {
    return this.writeVersion(
      id,
      d,
      expected,
      parent,
      expectedRevision,
      expectedUpdatedAt,
      false,
    );
  }
  async version(
    id: string,
    d: Draft,
    expected: string,
    parent: string,
    expectedRevision: string,
    expectedUpdatedAt: string,
  ) {
    return this.writeVersion(
      id,
      d,
      expected,
      parent,
      expectedRevision,
      expectedUpdatedAt,
      true,
    );
  }
  private async writeVersion(
    id: string,
    d: Draft,
    expected: string,
    parent: string,
    expectedRevision: string,
    expectedUpdatedAt: string,
    create: boolean,
  ) {
    const t = await this.get(id);
    const snapshot = create
        ? makeSnapshot(d, id, t.version.version_number + 1, parent)
        : updateSnapshot(d, t.version),
      meta = cleanMeta(d);
    return this.call(create ? 'version' : 'save', {
      id,
      expected,
      expected_revision: expectedRevision,
      expected_updated_at: expectedUpdatedAt,
      parent,
      meta,
      snapshot,
      terms: indexTerms(
        meta,
        snapshot,
        t.history
          ?.filter((x) => create || x.id !== snapshot.id)
          .map((x) => x.version_comment),
      ),
    });
  }
  async patch(id: string, p: any) {
    if (Object.keys(p).every((k) => ['favourite', 'archived'].includes(k))) {
      await this.bulk([id], p);
      return this.get(id);
    }
    const t = await this.get(id),
      meta = cleanMeta({ ...t, ...p });
    return this.call('patch', {
      id,
      meta,
      expected_updated_at: t.updated_at,
      favourite: p.favourite ?? t.favourite,
      archived: p.archived ?? t.archived,
      terms: indexTerms(
        meta,
        t.version,
        t.history?.map((x) => x.version_comment),
      ),
    });
  }
  async bulk(ids: string[], p: any, key?: ChunkKey) {
    validateChunk(key);
    return this.call('bulk', {
      ids,
      patch: p,
      ...(key
        ? {
            chunk: {
              ...key,
              request_hash: await requestHash({ ids, patch: p }),
            },
          }
        : {}),
    });
  }
  async bulkDelete(ids: string[], key: ChunkKey) {
    validateChunk(key);
    if (!key) throw Error('A deletion operation is required.');
    return this.call('bulk_delete', {
      ids,
      chunk: { ...key, request_hash: await requestHash(ids) },
    });
  }
  async delete(id: string) {
    const { data, error } = await this.client.rpc('delete_team', { p_id: id });
    if (error) throw Error(error.message);
    return data;
  }
  async variant(action: string, input: unknown) {
    let p: ReturnType<typeof variantPayload> & {
      variant_key?: string;
      request_hash?: string;
    } = variantPayload(input);
    if (action === 'variant_create' || action === 'variant_rename') {
      const d = variantDetails(p);
      p = {
        ...p,
        name: d.name,
        variant_key: d.key,
        description: d.description,
      };
    }
    if (action === 'family_expand' || action === 'family_bulk_delete')
      familySelection(p.ids, action === 'family_bulk_delete' ? 5 : 10000);
    if (action === 'variant_create') {
      validateChunk({ operation_id: p.operation_id, chunk_index: 0 });
      p = { ...p, request_hash: await requestHash(p) };
    }
    if (action === 'family_bulk_delete') {
      validateChunk(p.chunk);
      if (!p.chunk) throw Error('A deletion operation is required.');
      return this.call(action, {
        ...p,
        chunk: { ...p.chunk, request_hash: await requestHash(p.ids) },
      });
    }
    return this.call(action, p);
  }
  async share(id: string, revoke = false) {
    if (revoke) return this.call('revoke', { id });
    const token = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    await this.call('share', { id, token_hash: await hashToken(token) });
    return { token };
  }
  async collection(action: string, input: unknown) {
    const p = input as Record<string, unknown>;
    if (action === 'collection_save')
      return this.call(action, cleanCollection(p));
    if (action === 'collection_share') {
      const token = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
      await this.call(action, { id: p.id, token_hash: await hashToken(token) });
      return { token };
    }
    return this.call(action, p);
  }
}
export const supabaseClient = (url: string, key: string, token?: string) =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: 'Bearer ' + token } : {} },
  });
