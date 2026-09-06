import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cleanMeta, type Draft, type TeamRecord } from './domain';
import { makeSnapshot } from './snapshot';
import { indexTerms } from './search';
import { hashToken } from './demo-store';
export class SupabaseStore {
  constructor(private client: SupabaseClient) {}
  async call(action: string, payload: any = {}) {
    const { data, error } = await this.client.rpc('vault', { action, payload });
    if (error) throw Error(error.message);
    return data;
  }
  initialize() {
    return Promise.resolve();
  }
  get(id: string): Promise<TeamRecord> {
    return this.call('get', { id });
  }
  list(p: any) {
    return this.call('list', p);
  }
  facets() {
    return this.call('facets');
  }
  async import(drafts: Draft[]) {
    return this.call('import', {
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
  async version(id: string, d: Draft, expected: string, parent: string) {
    const t = await this.get(id);
    const snapshot = makeSnapshot(d, id, t.version.version_number + 1, parent),
      meta = cleanMeta(d);
    return this.call('version', {
      id,
      expected,
      parent,
      meta,
      snapshot,
      terms: indexTerms(
        meta,
        snapshot,
        t.history?.map((x) => x.version_comment),
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
  async bulk(ids: string[], p: any) {
    return this.call('bulk', { ids, patch: p });
  }
  async delete(id: string) {
    const { data, error } = await this.client.rpc('delete_team', { p_id: id });
    if (error) throw Error(error.message);
    return data;
  }
  async share(id: string, revoke = false) {
    if (revoke) return this.call('revoke', { id });
    const token = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    await this.call('share', { id, token_hash: await hashToken(token) });
    return { token };
  }
}
export const supabaseClient = (url: string, key: string, token?: string) =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: 'Bearer ' + token } : {} },
  });
