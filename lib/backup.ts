import { cleanDefinition } from './collections';
import { indexTerms } from './search';
import type { Snapshot, TeamMeta } from './domain';
import {
  BACKUP_LIMITS,
  BackupValidator,
  checkCounts,
  emptyCounts,
  encoder,
  mappedId,
  parseLine,
  sha256,
  type BackupManifest,
  type BackupRecord,
  type Counts,
  type Header,
  type PortableSnapshot,
  type VariantRecord,
} from './backup-format';

export type BackupStore = {
  backup(action: string, payload?: unknown): Promise<unknown>;
};
export type BackupPayload = {
  id: string;
  manifest: BackupManifest;
  index: number;
  text: string;
  generation: number;
  section: string;
  after: string;
  cursor: { family: string; team: string; version: number };
};
type RevisionRow = {
  id: string;
  family_key: string;
  title: string;
  variant_count: number;
  revision_count: number;
  current_number: number;
  parent_number: number | null;
  tag_names: string[];
  metadata: TeamMeta;
  snapshot: Snapshot;
  variant_name: string;
  variant_description: string;
  favourite: boolean | number;
  archived: boolean | number;
  created_at: string;
  updated_at: string;
  imported_at: string | null;
  family_created_at: string;
  family_updated_at: string;
};
type CollectionRow = {
  id: string;
  name: string;
  description: string;
  definition: ReturnType<typeof cleanDefinition>;
  created_at: string;
  updated_at: string;
};
export type RestoreState = {
  id: string;
  namespace: string;
  manifest: BackupManifest;
  next_chunk: number;
  generation: number;
  counts: Counts;
  family: number;
  variant: number;
  revision: number;
  context: Omit<VariantRecord, 'snapshot'> | null;
  complete: boolean;
};
export const operationId = (value: unknown) => {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
  )
    throw Error('Invalid backup operation.');
  return value;
};
export function restoreState(
  id: string,
  manifest: BackupManifest,
): RestoreState {
  operationId(id);
  checkCounts(manifest.header.counts);
  if (
    manifest.hashes.length > 10000 ||
    manifest.hashes.some((h) => !/^[a-f0-9]{64}$/.test(h))
  )
    throw Error('Invalid backup validation receipt.');
  return {
    id,
    namespace: crypto.randomUUID(),
    manifest,
    next_chunk: 0,
    generation: 0,
    counts: emptyCounts(),
    family: 0,
    variant: 0,
    revision: 0,
    context: null,
    complete: manifest.hashes.length === 0,
  };
}
export function portableSnapshot(
  snapshot: Snapshot,
  parent: number | null,
): PortableSnapshot {
  const {
    id: _id,
    team_id: _team,
    edit_revision: _revision,
    parent_version_id: _parent,
    ...data
  } = snapshot;
  return { ...data, parent_revision: parent };
}
/** Converts bounded adapter pages into product records. No provider IDs leave the archive. */
export async function* exportBackup(
  store: BackupStore,
  progress?: (counts: Counts, total: Counts) => void,
) {
  const start = (await store.backup('backup_info')) as {
    counts: Counts;
    generation: number;
  };
  const counts = checkCounts(start.counts),
    generation = start.generation;
  const header: Header = {
    format: 'pokelib-backup',
    schema_version: 1,
    exported_at: new Date().toISOString(),
    app_version: '0.1.0',
    counts,
  };
  const validator = new BackupValidator();
  let bytes = 0,
    chunkBytes = 0,
    chunkRecords = 0,
    chunks = 1;
  const line = (record: unknown) => {
    validator.accept(record);
    const result = JSON.stringify(record) + '\n',
      size = encoder.encode(result).length;
    bytes += size;
    if (
      (record as { type?: string }).type &&
      (record as { type?: string }).type !== 'end'
    ) {
      if (
        chunkRecords &&
        (chunkBytes + size > BACKUP_LIMITS.chunk ||
          chunkRecords >= BACKUP_LIMITS.records)
      ) {
        chunks++;
        chunkBytes = 0;
        chunkRecords = 0;
      }
      chunkBytes += size;
      chunkRecords++;
      if (chunks > 10000)
        throw Error(
          'Backup exceeds the 10,000 restore-chunk limit. No file was downloaded.',
        );
    }
    if (size > BACKUP_LIMITS.line || bytes > BACKUP_LIMITS.expanded)
      throw Error(
        'Backup exceeds the supported archive limits. No file was downloaded.',
      );
    return result;
  };
  yield line(header);
  let after = '',
    id = 0;
  for (;;) {
    const rows = (await store.backup('backup_page', {
      generation,
      section: 'tags',
      after,
    })) as { id: string; display_name: string }[];
    if (!rows.length) break;
    for (const r of rows)
      yield line({ type: 'tag', id: ++id, name: r.display_name });
    after = rows[rows.length - 1].id;
  }
  let cursor = { family: '', team: '', version: 0 },
    familyId = 0,
    variantId = 0;
  for (;;) {
    const rows = (await store.backup('backup_page', {
      generation,
      section: 'revisions',
      cursor,
    })) as RevisionRow[];
    if (!rows.length) break;
    for (const r of rows) {
      if (r.family_key !== cursor.family) {
        familyId++;
        yield line({
          type: 'family',
          id: familyId,
          title: r.title,
          variants: Number(r.variant_count),
          created_at: r.family_created_at,
          updated_at: r.family_updated_at,
        });
      }
      if (
        r.snapshot.team_id !== r.id ||
        (r.snapshot.parent_version_id !== null && r.parent_number === null)
      )
        throw Error(
          'Stored history relationships are inconsistent. Backup was not downloaded.',
        );
      const names = (values: string[]) =>
        values.map((v) => v.toLowerCase()).sort((a, b) => a.localeCompare(b));
      if (
        JSON.stringify(names(r.tag_names)) !==
        JSON.stringify(names(r.metadata.tags))
      )
        throw Error(
          'Stored tag relationships are inconsistent. Backup was not downloaded.',
        );
      const snapshot = portableSnapshot(
        r.snapshot,
        r.parent_number === null ? null : Number(r.parent_number),
      );
      if (r.id !== cursor.team) {
        variantId++;
        yield line({
          type: 'variant',
          id: variantId,
          family: familyId,
          name: r.variant_name,
          description: r.variant_description,
          meta: r.metadata,
          current_revision: Number(r.current_number),
          revisions: Number(r.revision_count),
          favourite: !!r.favourite,
          archived: !!r.archived,
          created_at: r.created_at,
          updated_at: r.updated_at,
          imported_at: r.imported_at,
          snapshot,
        });
      } else yield line({ type: 'revision', variant: variantId, snapshot });
      cursor = {
        family: r.family_key,
        team: r.id,
        version: snapshot.version_number,
      };
    }
    progress?.({ ...validator.counts }, counts);
  }
  after = '';
  id = 0;
  for (;;) {
    const rows = (await store.backup('backup_page', {
      generation,
      section: 'collections',
      after,
    })) as CollectionRow[];
    if (!rows.length) break;
    for (const r of rows) {
      const { query, filters, sort, favourite } = r.definition;
      yield line({
        type: 'collection',
        id: ++id,
        name: r.name,
        description: r.description,
        definition: { query, filters, sort, favourite },
        created_at: r.created_at,
        updated_at: r.updated_at,
      });
    }
    after = rows[rows.length - 1].id;
  }
  // An edit/delete/import anywhere during pagination makes the entire download fail.
  await store.backup('backup_check', { generation });
  yield line({ type: 'end', counts });
  validator.finish();
  progress?.(counts, counts);
}
export type PreparedRecord = {
  record: BackupRecord;
  id: string;
  familyId?: string;
  teamId?: string;
  snapshot?: Snapshot;
  terms?: ReturnType<typeof indexTerms>;
  definition?: ReturnType<typeof cleanDefinition>;
  expected?: string;
};
export async function prepareRestoreChunk(
  state: RestoreState,
  index: number,
  text: string,
) {
  if (
    typeof text !== 'string' ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.manifest.hashes.length ||
    encoder.encode(text).length > BACKUP_LIMITS.line + 1 ||
    (await sha256(text)) !== state.manifest.hashes[index]
  )
    throw Error('This chunk differs from the fully validated backup.');
  if (index < state.next_chunk)
    return { replay: true as const, state, records: [] };
  if (index !== state.next_chunk)
    throw Error('Restore chunks must be committed in order.');
  const next = structuredClone(state),
    records: PreparedRecord[] = [];
  for (const raw of text.trimEnd().split('\n')) {
    const record = parseLine(raw) as BackupRecord;
    const kind = record.type === 'revision' ? 'version' : record.type;
    let id =
      'id' in record ? await mappedId(state.namespace, kind, record.id) : '';
    const prepared: PreparedRecord = { record, id };
    if (record.type === 'family') {
      next.family = record.id;
      next.counts.families++;
    } else if (record.type === 'tag') next.counts.tags++;
    else if (record.type === 'collection') {
      next.counts.collections++;
      prepared.definition = cleanDefinition(record.definition);
    } else {
      if (record.type === 'variant') {
        const { snapshot: _snapshot, ...context } = record;
        next.context = context;
        next.variant = record.id;
        next.revision = 0;
        next.counts.variants++;
      }
      if (!next.context) throw Error('Missing restore variant context.');
      const teamId = await mappedId(state.namespace, 'variant', next.variant);
      id = await mappedId(
        state.namespace,
        'version',
        `${next.variant}:${record.snapshot.version_number}`,
      );
      const { parent_revision, ...snapshot } = record.snapshot;
      prepared.id = record.type === 'variant' ? teamId : id;
      prepared.familyId = await mappedId(
        state.namespace,
        'family',
        next.context.family,
      );
      prepared.teamId = teamId;
      prepared.snapshot = {
        ...snapshot,
        id,
        team_id: teamId,
        edit_revision: id,
        parent_version_id:
          parent_revision === null
            ? null
            : await mappedId(
                state.namespace,
                'version',
                `${next.variant}:${parent_revision}`,
              ),
      };
      if (next.revision)
        prepared.expected = await mappedId(
          state.namespace,
          'version',
          `${next.variant}:${next.revision}`,
        );
      prepared.terms = indexTerms(next.context.meta, prepared.snapshot);
      next.revision = snapshot.version_number;
      next.counts.revisions++;
    }
    records.push(prepared);
  }
  if (records.length > BACKUP_LIMITS.records)
    throw Error('Too many restore records in one chunk.');
  next.next_chunk++;
  next.complete = next.next_chunk === state.manifest.hashes.length;
  if (next.complete)
    for (const k of Object.keys(next.counts) as (keyof Counts)[])
      if (next.counts[k] !== next.manifest.header.counts[k])
        throw Error('Restore counts do not match the validated backup.');
  return { replay: false as const, state: next, records };
}
export function restoreProgress(state: RestoreState) {
  return {
    id: state.id,
    digest: state.manifest.digest,
    next_chunk: state.next_chunk,
    total_chunks: state.manifest.hashes.length,
    counts: state.counts,
    complete: state.complete,
  };
}
