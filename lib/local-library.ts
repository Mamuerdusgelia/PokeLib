import {
  cleanMeta,
  readableMeta,
  sourceLabel,
  words,
  normalize,
  normalizeTags,
  snapshotRevision,
  type Draft,
  type TeamRecord,
  type TeamMeta,
  type QueryPlan,
} from './domain';
import { makeSnapshot, updateSnapshot } from './snapshot';
import { indexTerms, matchesPlan, planQuery } from './search';
import { formatSearchValues } from './formats';
import { familyKey, variantDetails } from './variants';
import {
  cleanCollection,
  type CollectionRecord,
  type CollectionDefinition,
} from './collections';
import type { ChunkKey } from './import-workflow';
import { parseBatch, parseShowdown } from './showdown';
import { demoDrafts } from './demo';
import { snapshotUpload } from './share-data';
import type { LibraryIndex, LocalDatabase, StoredTeam } from './local-db';

export const UNDO_MS = 10 * 60 * 1000;
export type Account = { id: string; name: string };
export type CloudResult = StoredTeam & {
  id: string;
  name: string;
  login_code: string;
  teams: StoredTeam[];
  next?: string;
  token: string;
  conflict?: boolean;
  message?: string;
  autoCloud: boolean;
  acknowledged: boolean;
  show_history?: boolean;
};
export type CloudRequest = (
  action: string,
  payload?: unknown,
) => Promise<CloudResult>;
export type Preferences = { autoCloud: boolean; acknowledged: boolean };
type LocalInput = {
  id: string;
  ids: string[];
  query: string;
  plan: QueryPlan;
  sort: string;
  page: number;
  family_id: string;
  favourite: boolean;
  format: string;
  format_context?: TeamMeta['format_context'];
  source: string;
  tag: string;
  year: string;
  group_families: boolean;
  team: TeamRecord;
  draft: Draft;
  drafts: Draft[];
  patch: Partial<TeamMeta> & { favourite?: boolean; archived?: boolean };
  chunk?: ChunkKey;
  operation_id: string;
  expected: string;
  expected_revision: string;
  expected_updated_at: string;
  parent: string;
  text: string;
  title: string;
  version_id: string;
  autoCloud: boolean;
  acknowledged: boolean;
  name: string;
  description: string;
  definition: CollectionDefinition;
};
export const namespaceFor = (account: Account | null) =>
  account ? 'account/' + account.id : 'anonymous';
export const now = () => new Date().toISOString();
export function indexed(
  payload: TeamRecord,
  sync: Partial<LibraryIndex> = {},
): StoredTeam {
  const { history: _, ...t } = payload;
  const team = {
    ...t,
    version: {
      ...t.version,
      showdown_text: '',
      original_text: '',
      team_notes: '',
      set_notes: [],
      set_editing: undefined,
    },
  };
  return {
    revision: 0,
    ...sync,
    team,
    payload,
    terms: indexTerms(
      payload,
      payload.version,
      payload.history?.map((v) => v.version_comment),
    ),
  };
}
function visible(row: LibraryIndex) {
  return {
    ...readableMeta(row.team),
    sync_status: row.conflict
      ? 'conflict'
      : row.error
        ? 'error'
        : row.dirty
          ? 'pending'
          : 'synced',
  } as TeamRecord;
}

/** All mutations enter through the same serialized namespace lock, including sync responses. */
export class LocalLibrary {
  readonly namespace: string;
  private serial: Promise<unknown> = Promise.resolve();
  private syncing?: Promise<void>;
  private syncRequested = false;
  active = true;
  constructor(
    readonly db: LocalDatabase,
    readonly account: Account | null,
    readonly cloud: CloudRequest,
    readonly changed: () => void = () => {},
  ) {
    this.namespace = namespaceFor(account);
  }
  lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> =>
      typeof navigator !== 'undefined' && navigator.locks
        ? await navigator.locks.request('pokelib/' + this.namespace, fn)
        : await fn();
    const result = this.serial.then(run, run);
    this.serial = result.catch(() => {});
    return result;
  }
  async commit(
    rows: StoredTeam[],
    remove: string[] = [],
    values: Record<string, unknown> = {},
  ) {
    const generation =
      ((await this.db.value<number>(this.namespace, 'generation')) || 0) + 1;
    await this.db.commit(this.namespace, rows, remove, {
      ...values,
      generation,
    });
    this.changed();
  }
  async row(id: string, deleted = false) {
    const row = await this.db.get(this.namespace, id);
    if (!row || (!deleted && row.deletedAt))
      throw Error('Team not found in this library.');
    return row;
  }
  async full(id: string) {
    const row = await this.row(id);
    if (!row.payload) {
      const remote = await this.cloud('get', { id });
      if (!remote.payload) throw Error('Cloud team could not be downloaded.');
      const payload = remote.payload;
      if (!this.active) throw Error('Account changed.');
      await this.lock(async () => {
        const latest = await this.row(id);
        if (!latest.dirty)
          await this.commit([
            {
              ...remote,
              team: { ...remote.team, storage: 'cloud' },
              payload: { ...payload, storage: 'cloud' },
            },
          ]);
      });
    }
    const result = await this.row(id);
    const siblings = (await this.db.indexes(this.namespace)).filter(
      (row) => !row.deletedAt && familyKey(row.team) === familyKey(result.team),
    );
    return {
      ...readableMeta(result.payload!),
      sync_status: visible(result).sync_status,
      variant_count: siblings.length,
      matching_variant_count: siblings.length,
    };
  }
  async list(p: Partial<LocalInput> = {}, action = 'list') {
    const all = (await this.db.indexes(this.namespace)).filter(
      (r) => !r.deletedAt,
    );
    const plan = p.plan || planQuery(p.query || '');
    // Preserve the existing format aliases and same-slot/member semantics.
    const matched = all.filter((r) => {
      const t = readableMeta(r.team);
      const meta = plan.meta.filter(
        (q) => !['format', 'storage', 'year'].includes(q.field),
      );
      return (
        (!p.family_id || familyKey(t) === p.family_id) &&
        (!p.favourite || t.favourite) &&
        (!p.format ||
          formatSearchValues(p.format).includes(normalize(t.format))) &&
        (!p.source || t.source_name === p.source) &&
        (!p.tag ||
          t.tags.some((s) => normalize(s) === normalize(p.tag || ''))) &&
        (!p.year ||
          (p.year === 'unknown'
            ? !t.team_date
            : t.team_date?.startsWith(p.year))) &&
        plan.meta.every((q) =>
          q.field === 'storage'
            ? (t.storage || 'local') === q.value
            : q.field === 'format'
              ? formatSearchValues(q.value).includes(normalize(t.format))
              : q.field === 'year'
                ? q.value === 'unknown'
                  ? !t.team_date
                  : t.team_date?.startsWith(q.value)
                : true,
        ) &&
        matchesPlan(
          [
            ...r.terms,
            ...words(sourceLabel(t)).map((value) => ({
              field: 'source',
              value,
              slot: -1,
              version_id: '',
            })),
          ],
          { ...plan, meta },
        )
      );
    });
    const sort = p.sort || 'modified_desc';
    const field = sort.startsWith('date')
      ? 'team_date'
      : sort.startsWith('created')
        ? 'created_at'
        : sort.startsWith('title')
          ? 'title'
          : sort === 'format'
            ? 'format'
            : sort === 'source'
              ? 'source_name'
              : 'updated_at';
    matched.sort((a, b) => {
      const x = a.team[field],
        y = b.team[field];
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (
        String(x).localeCompare(String(y)) * (sort.endsWith('desc') ? -1 : 1) ||
        a.team.id.localeCompare(b.team.id)
      );
    });
    if (action === 'family_variants')
      matched.sort(
        (a, b) =>
          Number(
            b.team.id === familyKey(b.team) || b.team.variant_name === 'Main',
          ) -
          Number(
            a.team.id === familyKey(a.team) || a.team.variant_name === 'Main',
          ),
      );
    const groups = action === 'families' || p.group_families;
    const mainByFamily = new Map(
      matched
        .filter(
          (r) =>
            r.team.id === familyKey(r.team) || r.team.variant_name === 'Main',
        )
        .map((r) => [familyKey(r.team), r]),
    );
    const found = new Set<string>();
    const rows = matched
      .filter((r) => {
        const k = familyKey(r.team);
        if (!groups) return true;
        if (found.has(k)) return false;
        found.add(k);
        return true;
      })
      .map((r) => (groups ? mainByFamily.get(familyKey(r.team)) || r : r));
    if (action === 'select')
      return {
        ids: rows.map((r) => (groups ? familyKey(r.team) : r.team.id)),
        total: rows.length,
      };
    return {
      teams: rows
        .slice((p.page || 0) * 30, ((p.page || 0) + 1) * 30)
        .map((r) => ({
          ...visible(r),
          family_key: familyKey(r.team),
          variant_count: all.filter(
            (s) => familyKey(s.team) === familyKey(r.team),
          ).length,
          matching_variant_count: matched.filter(
            (s) => familyKey(s.team) === familyKey(r.team),
          ).length,
        })),
      total: rows.length,
    };
  }
  async facets() {
    const rows = (await this.db.indexes(this.namespace))
      .filter((r) => !r.deletedAt)
      .map((r) => readableMeta(r.team));
    const unique = (values: string[]) =>
      [...new Set(values.filter(Boolean))].sort();
    return {
      all: new Set(rows.map(familyKey)).size,
      favourites: new Set(rows.filter((t) => t.favourite).map(familyKey)).size,
      archived: 0,
      formats: unique(rows.map((t) => t.format)),
      sources: unique(rows.map((t) => t.source_name)),
      years: unique(rows.map((t) => t.team_date?.slice(0, 4) || '')),
      tags: unique([
        ...rows.flatMap((t) => t.tags),
        ...((await this.db.value<string[]>(this.namespace, 'tags')) || []),
      ]),
      format_contexts: Object.fromEntries(
        rows
          .filter((t) => t.format_context)
          .map((t) => [t.format, t.format_context]),
      ),
    };
  }
  async perform(action: string, input: unknown = {}): Promise<unknown> {
    const p = input as LocalInput;
    if (!this.active) throw Error('Account changed. Reopen the library.');
    if (action === 'trainer_name')
      return (
        (await this.db.value<string>(this.namespace, 'trainer_name')) ??
        (this.account?.name === 'Trainer' ? '' : this.account?.name || '')
      );
    if (action === 'trainer_name_save') {
      const name = String(p.name || '').trim();
      if (!name || name.length > 80)
        throw Error('Enter a trainer name of 1–80 characters.');
      await this.lock(() => this.commit([], [], { trainer_name: name }));
      return name;
    }
    if (action === 'family_merge' || action === 'family_remove') {
      const ids = p.ids || [p.id];
      for (const id of ids) await this.full(id);
    }
    if (action === 'parse')
      return parseBatch(p.text, p.format, p.format_context);
    if (action === 'preview') return parseShowdown(p.text, p.format);
    if (action === 'pokepaste') return this.cloud('pokepaste', p);
    if (['list', 'families', 'family_variants', 'select'].includes(action))
      return this.list(p, action);
    if (action === 'facets') return this.facets();
    if (action === 'get') return this.full(p.id);
    if (action === 'sync') {
      await this.lock(async () => {
        const expired = (await this.db.indexes(this.namespace)).filter(
          (r) => r.deletedAt && r.deletedAt + UNDO_MS <= Date.now() && !r.dirty,
        );
        if (expired.length)
          await this.commit(
            [],
            expired.map((r) => r.team.id),
          );
      });
      await this.sync();
      return this.status();
    }
    if (action === 'sync_status') return this.status(p.ids);
    if (action === 'preferences')
      return (
        (await this.db.value(this.namespace, 'preferences')) || {
          autoCloud: false,
          acknowledged: false,
        }
      );
    if (action === 'preferences_save') {
      if (!this.account) throw Error('Sign in to manage Cloud Sync.');
      const preferences = {
        autoCloud: p.autoCloud === true,
        acknowledged: p.acknowledged === true,
      };
      await this.cloud('preferences_save', preferences);
      await this.lock(() => this.commit([], [], { preferences }));
      return preferences;
    }
    if (action === 'snapshot')
      return this.cloud('snapshot', {
        team: snapshotUpload(p.team || (await this.full(p.id))),
      });
    if (['share', 'revoke', 'live_settings'].includes(action)) {
      const row = await this.row(p.id);
      if (!this.account || row.team.storage !== 'cloud')
        throw Error('Share Live requires an account and a Cloud-synced team.');
      await this.sync();
      const current = await this.row(p.id);
      if (current.dirty || current.conflict)
        throw Error(
          'Sync this team successfully before changing its Live Share.',
        );
      return this.cloud(action, p);
    }
    if (action === 'cloud_enable') {
      if (!this.account) throw Error('Sign in to enable Cloud Sync.');
      const prefs = (await this.perform('preferences')) as Preferences;
      if (!prefs.acknowledged)
        throw Error('Review the Cloud Sync privacy explanation first.');
      const ids: string[] = p.ids || [p.id];
      await this.lock(async () => {
        const rows = await Promise.all(ids.map((id) => this.row(id)));
        for (const r of rows)
          if (r.team.storage !== 'cloud') {
            r.team.storage = 'cloud';
            r.payload!.storage = 'cloud';
            r.dirty = true;
          }
        await this.commit(rows);
      });
      await this.sync();
      return this.status(ids);
    }
    if (action === 'cloud_disable') {
      await this.full(p.id); // Never remove the only current payload.
      await this.lock(async () => {
        const r = await this.row(p.id);
        if (r.conflict)
          throw Error('Resolve this conflict before disabling Cloud Sync.');
        r.pendingAction = 'disable';
        r.dirty = true;
        await this.commit([r]);
      });
      await this.sync();
      return this.status([p.id]);
    }
    if (action === 'conflict_keep_local') {
      // Preserve both versions: fork the local work, then load the canonical server copy.
      await this.lock(async () => {
        const r = await this.row(p.id, true);
        if (!r.payload) throw Error('No cached work to preserve.');
        const copy = this.fork(
          r.payload,
          r.payload.title + ' (conflict copy)',
          true,
        );
        await this.commit([copy], [p.id]);
      });
      await this.sync();
      return { ok: true };
    }
    // Fetch only affected Cloud payloads before entering the local transaction lock.
    if (
      [
        'save',
        'version',
        'patch',
        'variant_create',
        'variant_rename',
        'family_rename',
        'bulk',
      ].includes(action)
    ) {
      const ids = p.ids || [p.id];
      for (const id of ids) if (id) await this.full(id);
      if (action === 'family_rename') {
        const source = await this.row(p.id);
        for (const r of await this.db.indexes(this.namespace))
          if (!r.deletedAt && familyKey(r.team) === familyKey(source.team))
            await this.full(r.team.id);
      }
    }
    const result = await this.lock(() => this.mutate(action, p));
    if (
      !['family_expand', 'trash', 'collection_list', 'collection_get'].includes(
        action,
      )
    )
      void this.sync();
    return result;
  }
  private fork(
    t: TeamRecord,
    title = t.title,
    preserveHistory = false,
  ): StoredTeam {
    const id = crypto.randomUUID();
    const snapshot = makeSnapshot(
      { ...t, ...t.version, title, imported: true },
      id,
      1,
      null,
    );
    const oldHistory = t.history || [t.version];
    const mapped = new Map(oldHistory.map((v) => [v.id, crypto.randomUUID()]));
    const history = preserveHistory
      ? oldHistory.map((v) => ({
          ...v,
          id: mapped.get(v.id)!,
          team_id: id,
          parent_version_id: v.parent_version_id
            ? mapped.get(v.parent_version_id) || null
            : null,
        }))
      : [snapshot];
    const current = preserveHistory
      ? history.find((v) => v.id === mapped.get(t.version.id)) || snapshot
      : snapshot;
    return indexed({
      ...cleanMeta({ ...t, title }),
      id,
      family_id: id,
      variant_name: 'Main',
      variant_description: '',
      current_version_id: current.id,
      favourite: t.favourite,
      archived: false,
      created_at: now(),
      updated_at: now(),
      imported_at: t.imported_at,
      storage: 'local',
      version: current,
      history,
    });
  }
  private async mutate(action: string, p: LocalInput): Promise<unknown> {
    const rows = (await this.db.indexes(this.namespace)).filter(
      (r) => !r.deletedAt,
    );
    if (action === 'family_merge' || action === 'family_remove') {
      const ids = [...new Set(p.ids || [p.id])];
      if (action === 'family_merge' && (ids.length < 2 || !ids.includes(p.id)))
        throw Error(
          'Select at least two teams and explicitly choose a Main team.',
        );
      const selected = rows.filter((r) => ids.includes(r.team.id));
      if (selected.length !== ids.length)
        throw Error('Selection changed. Reopen the merge dialog.');
      const keys = new Set(selected.map((r) => familyKey(r.team)));
      if (
        action === 'family_merge' &&
        rows.some(
          (r) => keys.has(familyKey(r.team)) && !ids.includes(r.team.id),
        )
      )
        throw Error(
          'Include every member of each existing family. No teams have been moved.',
        );
      if (
        action === 'family_remove' &&
        selected.some(
          (r) =>
            (r.team.id === familyKey(r.team) ||
              r.team.variant_name === 'Main') &&
            rows.some(
              (s) =>
                s.team.id !== r.team.id &&
                familyKey(s.team) === familyKey(r.team),
            ),
        )
      )
        throw Error(
          'The Main team cannot be detached while it has variants. Remove its variants first, or merge the whole family with a different Main.',
        );
      const deletedMembers = (await this.db.indexes(this.namespace)).some(
        (r) => r.deletedAt && keys.has(familyKey(r.team)),
      );
      if (deletedMembers)
        throw Error(
          'This family has recently deleted members. Undo those deletions or wait for cleanup before reorganising it.',
        );
      const changes: StoredTeam[] = [];
      const names = new Set<string>(['main']);
      for (const item of selected) {
        const row = await this.row(item.team.id);
        if (!row.payload || row.conflict || row.pendingAction)
          throw Error(
            'Download all selected teams and resolve pending storage changes or conflicts first.',
          );
        let name = row.payload.variant_name || row.payload.title;
        if (action === 'family_remove' || item.team.id === p.id) name = 'Main';
        else {
          if (normalize(name) === 'main') name = row.payload.title.slice(0, 70);
          const base = name.slice(0, 70);
          let n = 2;
          while (names.has(normalize(name))) name = base + ' (' + n++ + ')';
          names.add(normalize(name));
        }
        changes.push(
          indexed(
            {
              ...row.payload,
              family_id: action === 'family_remove' ? item.team.id : p.id,
              variant_name: name,
              updated_at: now(),
            },
            { ...row, dirty: row.dirty || row.team.storage === 'cloud' },
          ),
        );
      }
      await this.commit(changes);
      return changes.find((r) => r.team.id === p.id)!.payload;
    }
    if (action === 'family_expand') {
      const families = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = familyKey(row.team);
        const members = families.get(key) || [];
        members.push(row);
        families.set(key, members);
      }
      return {
        ids: [...new Set(p.ids)].flatMap((id) =>
          (families.get(id) || [])
            .sort(
              (a, b) =>
                Number(b.team.id === id) - Number(a.team.id === id) ||
                b.team.updated_at.localeCompare(a.team.updated_at) ||
                a.team.id.localeCompare(b.team.id),
            )
            .map((r) => r.team.id),
        ),
      };
    }
    if (action === 'trash')
      return (await this.db.indexes(this.namespace))
        .filter((r) => r.deletedAt && r.deletedAt + UNDO_MS > Date.now())
        .map((r) => ({
          id: r.team.id,
          title: r.team.title,
          deletedAt: r.deletedAt,
        }));
    if (action === 'undo') {
      const row = await this.row(p.id, true);
      if (!row.deletedAt || row.deletedAt + UNDO_MS <= Date.now())
        throw Error('The undo window has ended.');
      row.deletedAt = undefined;
      if (row.team.storage === 'cloud') {
        row.pendingAction = 'restore';
        row.dirty = true;
      }
      await this.commit([row]);
      return { ok: true };
    }
    if (action.startsWith('collection_')) return this.collection(action, p);
    const receipt = p.chunk
      ? `receipt/${action}/${p.chunk.operation_id}/${p.chunk.chunk_index}`
      : action === 'variant_create'
        ? `receipt/${action}/${p.operation_id}`
        : '';
    const fingerprint = JSON.stringify(p);
    if (receipt) {
      const prior = await this.db.value<{
        fingerprint: string;
        result: unknown;
      }>(this.namespace, receipt);
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw Error('Operation was already used for different changes.');
        return prior.result;
      }
    }
    const save = async (changes: StoredTeam[], result: unknown) => {
      await this.commit(
        changes,
        [],
        receipt ? { [receipt]: { fingerprint, result } } : {},
      );
      return result;
    };
    if (action === 'import' || action === 'seed') {
      const drafts: Draft[] = action === 'seed' ? demoDrafts : p.drafts;
      if (!Array.isArray(drafts) || !drafts.length || drafts.length > 200)
        throw Error('Import up to 200 teams per request.');
      const prefs = await this.db.value<Preferences>(
        this.namespace,
        'preferences',
      );
      const created = drafts.map((d) => {
        const id = crypto.randomUUID(),
          version = makeSnapshot(d, id, 1, null);
        const meta = cleanMeta(d);
        // Authorship is set in the manual draft UI so an explicit removal is respected.
        return indexed(
          {
            ...meta,
            id,
            family_id: id,
            variant_name: 'Main',
            variant_description: '',
            current_version_id: version.id,
            favourite: false,
            archived: false,
            created_at: now(),
            updated_at: now(),
            imported_at: d.imported ? now() : null,
            version,
            history: [version],
            storage:
              this.account && prefs?.autoCloud && prefs.acknowledged
                ? 'cloud'
                : 'local',
          },
          { dirty: !!(this.account && prefs?.autoCloud && prefs.acknowledged) },
        );
      });
      return save(created, { ids: created.map((r) => r.team.id) });
    }
    if (
      [
        'delete',
        'bulk_delete',
        'family_bulk_delete',
        'variant_delete',
      ].includes(action)
    ) {
      const ids = p.ids || [p.id];
      const targets = rows.filter((r) =>
        ids.includes(
          action === 'family_bulk_delete' ? familyKey(r.team) : r.team.id,
        ),
      );
      if (
        action === 'variant_delete' &&
        targets.some(
          (r) =>
            rows.filter((s) => familyKey(s.team) === familyKey(r.team))
              .length === 1,
        )
      )
        throw Error('Delete the team family to remove its final variant.');
      const changes = await Promise.all(
        targets.map((r) => this.row(r.team.id)),
      );
      changes.forEach((r) => {
        r.deletedAt = Date.now();
        if (r.team.storage === 'cloud') {
          r.dirty = true;
          r.pendingAction = 'delete';
        }
      });
      return save(changes, {
        deleted: changes.length,
        ids: changes.map((r) => r.team.id),
      });
    }
    if (action === 'variant_create') {
      const original = (await this.row(p.id)).payload!;
      if (
        p.expected_updated_at &&
        p.expected_updated_at !== original.updated_at
      )
        throw Error(
          'This team changed in another tab. Reopen it before creating a variant.',
        );
      const details = variantDetails(p);
      if (
        rows.some(
          (r) =>
            familyKey(r.team) === familyKey(original) &&
            normalize(r.team.variant_name || 'Main') ===
              normalize(details.name),
        )
      )
        throw Error('A variant with this name already exists.');
      const copy = this.fork({
        ...original,
        version:
          original.history?.find((v) => v.id === p.version_id) ||
          original.version,
      });
      copy.payload!.family_id = familyKey(original);
      copy.payload!.variant_name = details.name;
      copy.payload!.variant_description = details.description;
      const prefs = await this.db.value<Preferences>(
        this.namespace,
        'preferences',
      );
      const automatic = !!(
        this.account &&
        prefs?.autoCloud &&
        prefs.acknowledged
      );
      if (automatic) copy.payload!.storage = 'cloud';
      return save([indexed(copy.payload!, { dirty: automatic })], copy.payload);
    }
    if (
      [
        'save',
        'version',
        'patch',
        'bulk',
        'variant_rename',
        'family_rename',
      ].includes(action)
    ) {
      const original = action === 'bulk' ? null : await this.row(p.id);
      if (
        original &&
        p.expected_updated_at &&
        p.expected_updated_at !== original.team.updated_at
      )
        throw Error(
          'This team changed in another tab. Reopen it before applying changes.',
        );
      const targets =
        action === 'bulk'
          ? p.ids
          : action === 'family_rename'
            ? rows
                .filter((r) => familyKey(r.team) === familyKey(original!.team))
                .map((r) => r.team.id)
            : [p.id];
      const changes: StoredTeam[] = [];
      for (const id of targets) {
        const row = await this.row(id),
          t = row.payload!;
        if (!t)
          throw Error('Open this Cloud team while connected before editing.');
        let next = {
          ...t,
          updated_at: new Date(
            Math.max(Date.now(), Date.parse(t.updated_at) + 1),
          ).toISOString(),
        };
        if (action === 'save' || action === 'version') {
          if (
            p.expected !== t.current_version_id ||
            p.expected_revision !== snapshotRevision(t.version) ||
            p.expected_updated_at !== t.updated_at
          )
            throw Error(
              'This team changed in another tab. Your draft is retained; reopen the latest team before saving.',
            );
          const creating = action === 'version';
          const snapshot = creating
            ? makeSnapshot(
                p.draft,
                id,
                Math.max(
                  ...(t.history || [t.version]).map((v) => v.version_number),
                ) + 1,
                p.parent,
              )
            : updateSnapshot(p.draft, t.version);
          next = {
            ...next,
            ...cleanMeta(p.draft),
            version: snapshot,
            current_version_id: snapshot.id,
            history: [
              snapshot,
              ...(t.history || [t.version]).filter((v) => v.id !== snapshot.id),
            ],
          };
        } else if (action === 'variant_rename') {
          const d = variantDetails(p);
          if (
            rows.some(
              (r) =>
                r.team.id !== id &&
                familyKey(r.team) === familyKey(t) &&
                normalize(r.team.variant_name || 'Main') === normalize(d.name),
            )
          )
            throw Error('A variant with this name already exists.');
          next.variant_name = d.name;
          next.variant_description = d.description;
        } else {
          const patch =
            action === 'family_rename' ? { title: p.title } : p.patch;
          next = {
            ...next,
            ...cleanMeta({
              ...t,
              ...patch,
              ...(action === 'bulk' && patch.tags
                ? { tags: normalizeTags([...t.tags, ...patch.tags]) }
                : {}),
            }),
            favourite: patch.favourite ?? t.favourite,
            archived: patch.archived ?? t.archived,
          };
        }
        changes.push(
          indexed(next, {
            ...row,
            dirty: row.team.storage === 'cloud' || row.dirty,
          }),
        );
      }
      const edited = changes.find((r) => r.team.id === p.id) || changes[0];
      return save(
        changes,
        action === 'bulk'
          ? { updated: changes.length }
          : { ...edited.payload, sync_status: visible(edited).sync_status },
      );
    }
    throw Error('Unsupported local action: ' + action);
  }
  private async collection(action: string, p: LocalInput) {
    let collections =
      (await this.db.value<CollectionRecord[]>(
        this.namespace,
        'collections',
      )) || [];
    if (action === 'collection_list')
      return {
        total: collections.length,
        collections: collections.slice(
          (p.page || 0) * 30,
          ((p.page || 0) + 1) * 30,
        ),
      };
    const previous = collections.find((c) => c.id === p.id);
    if (action === 'collection_get') {
      if (!previous) throw Error('Collection not found.');
      return previous;
    }
    if (action === 'collection_share' || action === 'collection_revoke') {
      if (!this.account)
        throw Error(
          'Sign in and Cloud Sync your teams to share a live collection. Local teams are never included.',
        );
      if (!previous) throw Error('Collection not found.');
      const result = await this.cloud(action, {
        id: p.id,
        collection: previous,
        expected_revision: previous.cloud_revision || 0,
      });
      previous.has_share = action === 'collection_share';
      previous.cloud_revision = result.revision;
      await this.commit([], [], { collections });
      return result;
    }
    if (action === 'collection_save') {
      const c = cleanCollection(p);
      if (previous && previous.updated_at !== c.expected_updated_at)
        throw Error('Collection changed; reopen it.');
      if (
        collections.some(
          (r) => r.id !== c.id && r.name.toLowerCase() === c.name.toLowerCase(),
        )
      )
        throw Error('Collection name already exists.');
      const cloud_revision = previous?.has_share
        ? (
            await this.cloud('collection_save', {
              id: c.id,
              collection: c,
              expected_revision: previous.cloud_revision,
            })
          ).revision
        : undefined;
      collections = [
        {
          ...c,
          cloud_revision,
          created_at: previous?.created_at || now(),
          updated_at: now(),
          has_share: previous?.has_share || false,
        },
        ...collections.filter((r) => r.id !== c.id),
      ];
    } else if (action === 'collection_delete') {
      if (previous?.has_share)
        await this.cloud('collection_revoke', { id: p.id });
      collections = collections.filter((r) => r.id !== p.id);
    }
    await this.commit([], [], { collections });
    return { ok: true };
  }
  async status(ids?: string[]) {
    const rows = (await this.db.indexes(this.namespace)).filter(
      (r) => !ids || ids.includes(r.team.id),
    );
    return {
      cloudError:
        (await this.db.value<string>(this.namespace, 'cloudError')) || '',
      synced: rows.filter(
        (r) => r.team.storage === 'cloud' && !r.dirty && !r.conflict,
      ).length,
      pending: rows.filter((r) => r.dirty && !r.conflict).length,
      conflicts: rows
        .filter((r) => r.conflict)
        .map((r) => ({
          id: r.team.id,
          title: r.team.title,
          message: r.conflict,
        })),
      errors: rows
        .filter((r) => r.error)
        .map((r) => ({ id: r.team.id, title: r.team.title, message: r.error })),
    };
  }
  sync() {
    if (!this.account || !this.active) return Promise.resolve();
    this.syncRequested = true;
    if (this.syncing) return this.syncing;
    const run = async () => {
      do {
        this.syncRequested = false;
        if (typeof navigator !== 'undefined' && navigator.locks)
          await navigator.locks.request(
            'pokelib/sync/' + this.namespace,
            async () => {
              if (this.active) await this.synchronize();
            },
          );
        else await this.synchronize();
      } while (this.syncRequested && this.active);
    };
    return (this.syncing ??= run().finally(() => {
      this.syncing = undefined;
    }));
  }
  private async synchronize() {
    try {
      for (const index of await this.db.indexes(this.namespace)) {
        if (!this.active) return;
        if (!index.dirty || index.conflict) continue;
        const sent = await this.row(index.team.id, true);
        try {
          const { history: _history, ...currentState } = sent.payload || {};
          const result = await this.cloud(sent.pendingAction || 'put', {
            id: sent.team.id,
            expected: sent.revision,
            mutation: sent.pendingAction
              ? `${sent.pendingAction}/${sent.deletedAt || ''}/${sent.revision}`
              : `${sent.payload?.version.edit_revision}/${sent.payload?.updated_at}`,
            ...(sent.pendingAction ? {} : { team: currentState }),
          });
          if (!this.active) return;
          await this.lock(async () => {
            const current = await this.db.get(this.namespace, sent.team.id);
            if (!current) return;
            if (
              (result.conflict && current.revision !== sent.revision) ||
              (!result.conflict &&
                current.revision > result.revision &&
                sent.pendingAction !== 'disable')
            )
              return;
            if (result.conflict) {
              current.conflict =
                result.message ||
                'Another device changed this Cloud team. Both copies are safe.';
              current.error = undefined;
            } else {
              current.revision = result.revision;
              const unchanged =
                current.payload?.updated_at === sent.payload?.updated_at &&
                current.pendingAction === sent.pendingAction &&
                current.deletedAt === sent.deletedAt;
              if (unchanged) {
                current.dirty = false;
                current.pendingAction = undefined;
              }
              current.error = undefined;
              if (sent.pendingAction === 'disable') {
                current.team.storage = 'local';
                if (current.payload) current.payload.storage = 'local';
                current.revision = 0;
                current.dirty = false;
              }
              if (
                sent.pendingAction === 'delete' &&
                sent.revision === 0 &&
                result.revision === 0
              ) {
                current.team.storage = 'local';
                if (current.payload) current.payload.storage = 'local';
              }
            }
            await this.commit([current]);
          });
        } catch (error) {
          if (!this.active) return;
          await this.lock(async () => {
            const current = await this.db.get(this.namespace, sent.team.id);
            if (current) {
              current.error =
                'Cloud Sync paused. Changes are saved in this browser. ' +
                (error as Error).message;
              await this.commit([current]);
            }
          });
          break;
        }
      }
      if (!this.active) return;
      // Complete a metadata scan before pruning caches, so a failed page cannot erase work.
      const remote: StoredTeam[] = [];
      for (let after = ''; ;) {
        const page = await this.cloud('index', { after });
        remote.push(...page.teams);
        if (!page.next) break;
        after = page.next;
      }
      if (!this.active) return;
      // Keep previously opened teams usable offline. Refresh their payloads while connected,
      // instead of throwing away a useful cache when the lightweight index changes.
      for (let i = 0; i < remote.length; i++) {
        const local = await this.db.get(this.namespace, remote[i].team.id);
        if (
          local?.payload &&
          !local.dirty &&
          !local.conflict &&
          local.revision !== remote[i].revision
        ) {
          if (remote[i].deletedAt) remote[i].payload = local.payload;
          else remote[i] = await this.cloud('get', { id: remote[i].team.id });
        }
      }
      if (!this.active) return;
      await this.lock(async () => {
        const changes: StoredTeam[] = [],
          remove: string[] = [];
        for (const r of remote) {
          const local = await this.db.get(this.namespace, r.team.id);
          if (
            local?.dirty ||
            local?.conflict ||
            (local && local.revision > r.revision)
          )
            continue;
          if (
            !local ||
            local.revision !== r.revision ||
            !!local.deletedAt !== !!r.deletedAt
          ) {
            changes.push({ ...r, team: { ...r.team, storage: 'cloud' } });
          }
        }
        const known = new Set(remote.map((r) => r.team.id));
        for (const r of await this.db.indexes(this.namespace)) {
          if (r.team.storage === 'cloud' && !known.has(r.team.id)) {
            if (r.dirty && r.revision === 0) continue; // A new upload may have joined after this scan started.
            if (r.dirty || r.conflict) {
              const full = await this.row(r.team.id, true);
              full.conflict =
                'The Cloud record was removed on another device. Keep your work as a Local copy.';
              changes.push(full);
            } else remove.push(r.team.id);
          } else if (
            r.deletedAt &&
            r.deletedAt + UNDO_MS <= Date.now() &&
            !r.dirty
          )
            remove.push(r.team.id);
        }
        if (changes.length || remove.length) await this.commit(changes, remove);
      });
      const preferences = await this.cloud('preferences');
      if (this.active)
        await this.lock(async () => {
          const hadError = await this.db.value(this.namespace, 'cloudError');
          await this.db.commit(this.namespace, [], [], {
            preferences,
            cloudError: '',
          });
          if (hadError) this.changed();
        });
    } catch {
      if (this.active)
        await this.lock(async () => {
          await this.db.commit(this.namespace, [], [], {
            cloudError:
              'Cloud library unavailable. Local teams and cached work remain available.',
          });
          this.changed();
        });
    }
  }
  async clearCloudCache() {
    await this.lock(async () => {
      const indexes = await this.db.indexes(this.namespace);
      const pending = indexes.filter(
        (r) => r.team.storage === 'cloud' && (r.dirty || r.conflict),
      );
      const copies: StoredTeam[] = [];
      for (const r of pending) {
        const full = await this.row(r.team.id, true);
        if (full.payload)
          copies.push(
            this.fork(
              full.payload,
              full.payload.title + ' (unsynced Local copy)',
              true,
            ),
          );
      }
      await this.commit(
        copies,
        indexes.filter((r) => r.team.storage === 'cloud').map((r) => r.team.id),
      );
    });
  }
}
