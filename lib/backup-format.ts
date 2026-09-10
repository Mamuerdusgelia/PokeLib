import { cleanMeta, type TeamMeta, type Snapshot } from './domain';
import { cleanDefinition } from './collections';
import { variantDetails } from './variants';
import { indexTerms } from './search';

/** Public v1 is ordered JSON Lines, optionally gzip-compressed. See BACKUP_FORMAT.md. */
export const BACKUP_LIMITS = {
  compressed: 64 * 1024 * 1024,
  expanded: 512 * 1024 * 1024,
  line: 2 * 1024 * 1024,
  chunk: 256 * 1024,
  records: 40,
  families: 10000,
  variants: 50000,
  revisions: 250000,
  tags: 10000,
  collections: 10000,
  history: 10000,
} as const;
export type Counts = {
  families: number;
  variants: number;
  revisions: number;
  tags: number;
  collections: number;
};
export const emptyCounts = (): Counts => ({
  families: 0,
  variants: 0,
  revisions: 0,
  tags: 0,
  collections: 0,
});
export type Header = {
  format: 'pokelib-backup';
  schema_version: 1;
  exported_at: string;
  app_version: string;
  counts: Counts;
};
export type PortableSnapshot = Omit<
  Snapshot,
  'id' | 'team_id' | 'edit_revision' | 'parent_version_id'
> & { parent_revision: number | null };
export type FamilyRecord = {
  type: 'family';
  id: number;
  title: string;
  variants: number;
  created_at: string;
  updated_at: string;
};
export type VariantRecord = {
  type: 'variant';
  id: number;
  family: number;
  name: string;
  description: string;
  meta: TeamMeta;
  current_revision: number;
  revisions: number;
  favourite: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
  imported_at: string | null;
  snapshot: PortableSnapshot;
};
export type RevisionRecord = {
  type: 'revision';
  variant: number;
  snapshot: PortableSnapshot;
};
export type TagRecord = { type: 'tag'; id: number; name: string };
export type CollectionRecord = {
  type: 'collection';
  id: number;
  name: string;
  description: string;
  definition: Omit<ReturnType<typeof cleanDefinition>, 'plan' | 'version'>;
  created_at: string;
  updated_at: string;
};
export type BackupRecord =
  | FamilyRecord
  | VariantRecord
  | RevisionRecord
  | TagRecord
  | CollectionRecord;
export type BackupManifest = {
  header: Header;
  hashes: string[];
  digest: string;
  bytes: number;
};
export const encoder = new TextEncoder();
export async function sha256(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', bytes as BufferSource),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export function object(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Expected a backup object.');
}
function keys(value: unknown, required: string[], optional: string[] = []) {
  object(value);
  if (
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some(
      (k) => !required.includes(k) && !optional.includes(k),
    )
  )
    throw Error('Missing or unexpected backup fields.');
}
function string(value: unknown, max: number, min = 0): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length < min ||
    value.length > max ||
    value.includes('\u0000') ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      value,
    )
  )
    throw Error('Invalid or oversized backup text.');
}
function integer(
  value: unknown,
  max: number,
  min = 1,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    throw Error('Invalid backup count or relationship.');
}
function timestamp(value: unknown) {
  string(value, 35, 20);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw Error('Invalid backup timestamp.');
  const date = new Date(value.slice(0, 10) + 'T00:00:00Z');
  if (
    date.toISOString().slice(0, 10) !== value.slice(0, 10) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    throw Error('Invalid backup timestamp.');
}
function safeTree(value: unknown, depth = 0) {
  if (depth > 16) throw Error('Backup data is nested too deeply.');
  if (typeof value === 'string') string(value, BACKUP_LIMITS.line);
  else if (typeof value === 'number' && !Number.isFinite(value))
    throw Error('Invalid backup number.');
  else if (value && typeof value === 'object') {
    if (Object.keys(value).length > 10000)
      throw Error('Too many nested backup fields.');
    for (const [k, v] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(k))
        throw Error('Unsafe backup object key.');
      safeTree(v, depth + 1);
    }
  }
}
export function parseLine(line: string): unknown {
  // Bound nesting before JSON.parse, including strings with escaped quotes/braces.
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const c of line) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '[' || c === '{') {
      if (++depth > 16) throw Error('Backup data is nested too deeply.');
    } else if (c === ']' || c === '}') depth--;
  }
  let result: unknown;
  try {
    result = JSON.parse(line);
  } catch {
    throw Error('The backup contains invalid JSON.');
  }
  safeTree(result);
  return result;
}
export function checkCounts(value: unknown): Counts {
  keys(value, Object.keys(emptyCounts()));
  const counts = value as Counts;
  for (const k of Object.keys(counts) as (keyof Counts)[])
    integer(counts[k], BACKUP_LIMITS[k], 0);
  return counts;
}
function checkMeta(meta: TeamMeta) {
  keys(
    meta,
    [
      'title',
      'format',
      'tags',
      'source_type',
      'source_name',
      'source_url',
      'source_note',
      'team_date',
      'team_date_precision',
    ],
    ['format_context'],
  );
  string(meta.title, 160, 1);
  string(meta.format, 80, 1);
  string(meta.source_type, 40);
  string(meta.source_name, 200);
  string(meta.source_url, 2000);
  string(meta.source_note, 10000);
  if (!Array.isArray(meta.tags) || meta.tags.length > 30)
    throw Error('Invalid backup tags.');
  for (const tag of meta.tags) string(tag, 60, 1);
  if (new Set(meta.tags.map((t) => t.toLowerCase())).size !== meta.tags.length)
    throw Error('Duplicate variant tags.');
  if (meta.format_context !== undefined)
    keys(meta.format_context, ['generation', 'battle']);
  cleanMeta(meta); // Validate without replacing preserved strings or canonicalizing old data.
  if (meta.source_url) {
    const url = new URL(meta.source_url);
    if (url.username || url.password)
      throw Error('Backup source URLs cannot contain credentials.');
  }
  if (meta.team_date_precision === 'unknown' && meta.team_date !== null)
    throw Error('Unknown Team Date must be null.');
}
export function checkSnapshot(s: PortableSnapshot) {
  keys(
    s,
    [
      'version_number',
      'parent_revision',
      'version_comment',
      'showdown_text',
      'original_text',
      'parsed_team',
      'team_notes',
      'set_notes',
      'created_at',
    ],
    ['set_editing'],
  );
  integer(s.version_number, BACKUP_LIMITS.history);
  if (s.parent_revision !== null)
    integer(s.parent_revision, s.version_number - 1);
  if (s.version_number === 1 && s.parent_revision !== null)
    throw Error('Initial revision cannot have a parent.');
  string(s.version_comment, 2000);
  string(s.showdown_text, 150000, 1);
  string(s.original_text, 500000);
  string(s.team_notes, 50000);
  timestamp(s.created_at);
  if (encoder.encode(JSON.stringify(s)).length > 1900000)
    throw Error('A snapshot exceeds the portable storage size limit.');
  if (
    !Array.isArray(s.parsed_team) ||
    s.parsed_team.length < 1 ||
    s.parsed_team.length > 24 ||
    !Array.isArray(s.set_notes) ||
    s.set_notes.length !== s.parsed_team.length
  )
    throw Error('Invalid backup sets or note relationships.');
  for (const p of s.parsed_team) {
    object(p);
    string(p.species, 200);
    for (const k of ['name', 'item', 'ability', 'nature', 'teraType'])
      if (p[k] !== undefined) string(p[k], 200);
    for (const k of ['level', 'happiness'])
      if (
        p[k] !== undefined &&
        (typeof p[k] !== 'number' || !Number.isFinite(p[k]))
      )
        throw Error('Invalid parsed set number.');
    if (p.shiny !== undefined && typeof p.shiny !== 'boolean')
      throw Error('Invalid parsed set shiny flag.');
    if (p.gender !== undefined) string(p.gender, 20);
    for (const k of ['evs', 'ivs'])
      if (p[k] !== undefined) {
        object(p[k]);
        for (const v of Object.values(p[k]))
          if (typeof v !== 'number' || !Number.isFinite(v))
            throw Error('Invalid parsed set stats.');
      }
    if (!Array.isArray(p.moves) || p.moves.length > 24)
      throw Error('Invalid backup moves.');
    for (const move of p.moves) string(move, 200);
  }
  for (const note of s.set_notes) string(note, 10000);
  if (s.set_editing !== undefined) {
    if (
      !Array.isArray(s.set_editing) ||
      s.set_editing.length !== s.parsed_team.length
    )
      throw Error('Invalid editing provenance.');
    for (const e of s.set_editing)
      if (e !== null) {
        keys(e, ['authored', 'attack_iv', 'tera']);
        if (
          e.authored !== true ||
          !['eligible', 'auto', 'manual'].includes(e.attack_iv) ||
          !['auto', 'manual'].includes(e.tera)
        )
          throw Error('Invalid editing provenance.');
      }
  }
}
function checkIndex(meta: TeamMeta, snapshot: PortableSnapshot) {
  const terms = indexTerms(meta, {
    ...snapshot,
    id: '00000000-0000-4000-8000-000000000000',
    team_id: '',
    parent_version_id: null,
  });
  if (
    terms.length > 20000 ||
    encoder.encode(JSON.stringify(terms)).length > 1500000
  )
    throw Error('A revision exceeds the supported search-index size.');
}
/** Streaming graph validator: ordinal IDs and grouped histories avoid a library-sized ID map. */
export class BackupValidator {
  header?: Header;
  counts = emptyCounts();
  done = false;
  private family?: FamilyRecord;
  private variant?: VariantRecord;
  private familyVariants = 0;
  private revision = 0;
  private phase = 0;
  private names = new Set<string>();
  private tags = new Set<string>();
  private collections = new Set<string>();
  private closeVariant() {
    if (this.variant && this.revision !== this.variant.revisions)
      throw Error('The backup has missing history revisions.');
  }
  private closeFamily() {
    this.closeVariant();
    if (this.family && this.familyVariants !== this.family.variants)
      throw Error('The backup has missing variants.');
  }
  accept(value: unknown): BackupRecord | null {
    object(value);
    if (this.done) throw Error('Unexpected content after the backup footer.');
    if (!this.header) {
      keys(value, [
        'format',
        'schema_version',
        'exported_at',
        'app_version',
        'counts',
      ]);
      if (value.format !== 'pokelib-backup')
        throw Error('Choose a PokéLib backup, not a Showdown export.');
      if (value.schema_version !== 1)
        throw Error(
          'Unsupported PokéLib backup version. Update PokéLib before restoring this file.',
        );
      timestamp(value.exported_at);
      string(value.app_version, 80, 1);
      checkCounts(value.counts);
      this.header = value as Header;
      return null;
    }
    if (value.type === 'end') {
      keys(value, ['type', 'counts']);
      const endCounts = checkCounts(value.counts);
      this.closeFamily();
      for (const key of Object.keys(this.counts) as (keyof Counts)[])
        if (
          this.counts[key] !== this.header.counts[key] ||
          this.counts[key] !== endCounts[key]
        )
          throw Error('The backup is incomplete: item counts do not match.');
      this.done = true;
      return null;
    }
    const r = value as BackupRecord;
    switch (r.type) {
      case 'tag':
        keys(r, ['type', 'id', 'name']);
        string(r.name, 60, 1);
        if (
          this.phase ||
          r.id !== ++this.counts.tags ||
          r.name !== r.name.trim().replace(/\s+/g, ' ') ||
          this.tags.has(r.name.toLowerCase())
        )
          throw Error('Duplicate or unordered backup tag.');
        this.tags.add(r.name.toLowerCase());
        break;
      case 'family':
        keys(r, [
          'type',
          'id',
          'title',
          'variants',
          'created_at',
          'updated_at',
        ]);
        this.closeFamily();
        if (this.phase > 1 || r.id !== ++this.counts.families)
          throw Error('Duplicate or unordered family ID.');
        this.phase = 1;
        string(r.title, 160, 1);
        integer(r.variants, BACKUP_LIMITS.variants);
        timestamp(r.created_at);
        timestamp(r.updated_at);
        this.family = r;
        this.variant = undefined;
        this.familyVariants = 0;
        this.names.clear();
        break;
      case 'variant':
        keys(r, [
          'type',
          'id',
          'family',
          'name',
          'description',
          'meta',
          'current_revision',
          'revisions',
          'favourite',
          'archived',
          'created_at',
          'updated_at',
          'imported_at',
          'snapshot',
        ]);
        this.closeVariant();
        if (
          this.phase !== 1 ||
          !this.family ||
          r.family !== this.family.id ||
          r.id !== ++this.counts.variants ||
          ++this.familyVariants > this.family.variants
        )
          throw Error('Invalid variant/family relationship.');
        string(r.description, 1000);
        const details = variantDetails(r);
        if (details.name !== r.name || this.names.has(details.key))
          throw Error('Duplicate or invalid sibling variant name.');
        this.names.add(details.key);
        checkMeta(r.meta);
        if (
          r.meta.title !== this.family.title ||
          r.meta.tags.some((t) => !this.tags.has(t.toLowerCase()))
        )
          throw Error('Broken variant title or tag relationship.');
        integer(r.revisions, BACKUP_LIMITS.history);
        if (
          r.current_revision !== r.revisions ||
          typeof r.favourite !== 'boolean' ||
          typeof r.archived !== 'boolean'
        )
          throw Error('Invalid current revision or variant state.');
        timestamp(r.created_at);
        timestamp(r.updated_at);
        if (r.imported_at !== null) timestamp(r.imported_at);
        checkSnapshot(r.snapshot);
        if (r.snapshot.version_number !== 1)
          throw Error('Missing initial revision.');
        checkIndex(r.meta, r.snapshot);
        this.variant = r;
        this.revision = 1;
        this.counts.revisions++;
        break;
      case 'revision':
        keys(r, ['type', 'variant', 'snapshot']);
        checkSnapshot(r.snapshot);
        if (
          this.phase !== 1 ||
          !this.variant ||
          r.variant !== this.variant.id ||
          r.snapshot.version_number !== ++this.revision ||
          this.revision > this.variant.revisions
        )
          throw Error('Duplicate, missing or cross-variant history revision.');
        checkIndex(this.variant.meta, r.snapshot);
        this.counts.revisions++;
        break;
      case 'collection':
        keys(r, [
          'type',
          'id',
          'name',
          'description',
          'definition',
          'created_at',
          'updated_at',
        ]);
        this.closeFamily();
        this.phase = 2;
        if (r.id !== ++this.counts.collections)
          throw Error('Duplicate or unordered collection ID.');
        string(r.name, 120, 1);
        string(r.description, 1000);
        timestamp(r.created_at);
        timestamp(r.updated_at);
        if (this.collections.has(r.name.toLowerCase()))
          throw Error('Duplicate collection name.');
        this.collections.add(r.name.toLowerCase());
        keys(r.definition, ['query', 'filters', 'sort', 'favourite']);
        string(r.definition.query, 10000);
        if (
          typeof r.definition.favourite !== 'boolean' ||
          typeof r.definition.sort !== 'string'
        )
          throw Error('Invalid collection state.');
        if (Array.isArray(r.definition.filters))
          for (const f of r.definition.filters) keys(f, ['field', 'value']);
        cleanDefinition(r.definition);
        break;
      default:
        throw Error('Unknown backup record type.');
    }
    checkCounts(this.counts);
    for (const k of Object.keys(this.counts) as (keyof Counts)[])
      if (this.counts[k] > this.header.counts[k])
        throw Error('Backup exceeds its declared item counts.');
    return r;
  }
  finish() {
    if (!this.header || !this.done)
      throw Error(
        'The backup is incomplete: its completion footer is missing.',
      );
    return this.header;
  }
}

export async function* backupLines(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '',
    total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > BACKUP_LIMITS.expanded)
        throw Error('Expanded backups must be below 512 MiB.');
      pending += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (!line || encoder.encode(line).length > BACKUP_LIMITS.line)
          throw Error('Invalid or oversized backup record.');
        yield line;
      }
      if (pending.length > BACKUP_LIMITS.line)
        throw Error('Oversized backup record.');
    }
    pending += decoder.decode();
    if (pending)
      throw Error('The backup is incomplete: missing final newline.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function* backupChunks(
  stream: ReadableStream<Uint8Array>,
  validator = new BackupValidator(),
) {
  let lines: string[] = [],
    size = 0;
  for await (const line of backupLines(stream)) {
    const record = validator.accept(parseLine(line));
    if (!record) continue;
    const canonical = JSON.stringify(record) + '\n',
      bytes = encoder.encode(canonical).length;
    if (
      lines.length &&
      (size + bytes > BACKUP_LIMITS.chunk ||
        lines.length >= BACKUP_LIMITS.records)
    ) {
      yield lines.join('');
      lines = [];
      size = 0;
    }
    lines.push(canonical);
    size += bytes;
  }
  validator.finish();
  if (lines.length) yield lines.join('');
}
export async function validateBackup(
  stream: ReadableStream<Uint8Array>,
  progress?: (counts: Counts) => void,
): Promise<BackupManifest> {
  const validator = new BackupValidator(),
    hashes: string[] = [];
  let bytes = 0;
  for await (const chunk of backupChunks(stream, validator)) {
    hashes.push(await sha256(chunk));
    if (hashes.length > 10000)
      throw Error('Backup exceeds the 10,000 restore-chunk limit.');
    bytes += encoder.encode(chunk).length;
    progress?.({ ...validator.counts });
  }
  const header = validator.finish();
  return {
    header,
    hashes,
    bytes,
    digest: await sha256(JSON.stringify({ header, hashes })),
  };
}
export function fileStream(file: Blob, gzip: boolean, signal?: AbortSignal) {
  if (file.size > (gzip ? BACKUP_LIMITS.compressed : BACKUP_LIMITS.expanded))
    throw Error('Backup file exceeds the supported size limit.');
  const stream = file
    .stream()
    .pipeThrough(
      new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>(),
      { signal },
    );
  return gzip ? stream.pipeThrough(new DecompressionStream('gzip')) : stream;
}
export async function mappedId(
  namespace: string,
  kind: string,
  id: number | string,
) {
  const hex = await sha256(namespace + ':' + kind + ':' + id);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
