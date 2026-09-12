import {
  canonicalFormat,
  knownFormat,
  cleanFormatContext,
  type FormatContext,
} from './formats';
export type PokemonSet = {
  name?: string;
  species: string;
  item?: string;
  ability?: string;
  nature?: string;
  teraType?: string;
  moves: string[];
  evs?: Record<string, number>;
  ivs?: Record<string, number>;
  level?: number;
  gender?: string;
  shiny?: boolean;
  happiness?: number;
  [key: string]: unknown;
};
export type Precision = 'exact' | 'month' | 'year' | 'unknown';
export type TeamMeta = {
  title: string;
  format: string;
  format_context?: FormatContext;
  tags: string[];
  source_type: string;
  source_name: string;
  source_url: string;
  source_note: string;
  team_date: string | null;
  team_date_precision: Precision;
};
export type SetEditing = {
  authored: true;
  attack_iv: 'eligible' | 'auto' | 'manual';
  tera: 'auto' | 'manual';
};
export type Snapshot = {
  id: string;
  /** Changes on every current-version save; old snapshots use their id. */
  edit_revision?: string;
  team_id: string;
  version_number: number;
  parent_version_id: string | null;
  version_comment: string;
  showdown_text: string;
  original_text: string;
  parsed_team: PokemonSet[];
  team_notes: string;
  set_notes: string[];
  set_editing?: Array<SetEditing | null>;
  created_at: string;
};
export const snapshotRevision = (snapshot: Snapshot) =>
  snapshot.edit_revision ?? snapshot.id;
export type TeamRecord = TeamMeta & {
  storage?: 'local' | 'cloud';
  sync_status?: 'synced' | 'pending' | 'conflict' | 'error';
  id: string;
  owner_id?: string;
  family_id?: string | null;
  family_key?: string;
  variant_name?: string;
  variant_description?: string;
  variant_count?: number;
  matching_variant_count?: number;
  current_version_id: string;
  favourite: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
  imported_at: string | null;
  version: Snapshot;
  history?: Snapshot[];
};
export type Draft = TeamMeta & {
  showdown_text: string;
  team_notes: string;
  set_notes: string[];
  set_editing?: Array<SetEditing | null>;
  version_comment: string;
  original_text?: string;
  imported?: boolean;
};
export type Term = {
  field: string;
  value: string;
  equivalent?: Array<{ field: string; value: string }>;
};
export type SetClause = {
  set: Term[];
  free: string[];
  fallback?: string[];
};
export type QueryPlan = SetClause & {
  meta: Term[];
  clauses?: SetClause[];
};
export const sourceTypes = ['Built by', 'Given by', 'Found on', 'Other'];
/** Interpret legacy metadata without rewriting stored records or dropping context. */
export function sourceMeta<
  T extends Pick<TeamMeta, 'source_type' | 'source_name'>,
>(meta: T): T {
  const name = meta.source_name || '';
  const type = meta.source_type;
  if (sourceTypes.includes(type)) return meta;
  if (type === 'Self-built') return { ...meta, source_type: 'Built by' };
  if (
    ['Copied from', 'Received from', 'Adapted from', 'PokéPaste'].includes(type)
  )
    return { ...meta, source_type: name ? 'Given by' : 'Other' };
  if (['Website', 'Discord', 'Tournament'].includes(type))
    return { ...meta, source_type: 'Found on', source_name: name || type };
  return { ...meta, source_type: 'Other' };
}
export function readableMeta<T extends TeamMeta>(meta: T): T {
  return {
    ...sourceMeta(meta),
    team_date: meta.team_date?.slice(0, 4) ?? null,
    team_date_precision:
      meta.team_date_precision === 'unknown' ? 'unknown' : 'year',
  };
}
export function sourceLabel(
  meta: Pick<TeamMeta, 'source_type' | 'source_name'>,
) {
  const m = sourceMeta(meta);
  return (
    m.source_type +
    (m.source_type !== 'Other' && m.source_name ? ' ' + m.source_name : '')
  );
}
export const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export const words = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.map(normalize)
    .filter(Boolean) ?? [];
export function normalizeTags(tags: string[]) {
  const found = new Map<string, string>();
  for (const tag of tags) {
    const t = tag.trim().replace(/\s+/g, ' ');
    if (t && t.length <= 60 && !found.has(t.toLowerCase()))
      found.set(t.toLowerCase(), t);
  }
  return [...found.values()].slice(0, 30);
}
export function localDate(d = new Date()) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}
export const generationFor = (format: string) =>
  Math.min(9, Math.max(1, Number(format.trim().match(/^gen(\d+)/i)?.[1] || 9)));
export function emptyDraft(imported = false): Draft {
  return {
    title: '',
    format: 'gen9ou',
    tags: [],
    source_type: imported ? 'Other' : 'Built by',
    source_name: '',
    source_url: '',
    source_note: '',
    team_date: imported ? null : localDate().slice(0, 4),
    team_date_precision: imported ? 'unknown' : 'year',
    showdown_text: '',
    team_notes: '',
    set_notes: [],
    version_comment: imported ? 'Imported team' : 'Initial build',
    imported,
  };
}
export function validateDate(value: string | null, precision: Precision) {
  if (precision === 'unknown') return null;
  if (!value) throw Error('Enter a historical date or choose Unknown.');
  const pattern =
    precision === 'year'
      ? /^\d{4}$/
      : precision === 'month'
        ? /^\d{4}-\d{2}$/
        : /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(value))
    throw Error(
      'Use YYYY, YYYY-MM, or YYYY-MM-DD for the selected date precision.',
    );
  const expanded =
    precision === 'year'
      ? value + '-01-01'
      : precision === 'month'
        ? value + '-01'
        : value;
  const d = new Date(expanded + 'T00:00:00Z');
  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== expanded ||
    Number(value.slice(0, 4)) < 1900
  )
    throw Error('Enter a valid historical date.');
  return value;
}
export function cleanMeta(d: TeamMeta): TeamMeta {
  if (!d.title?.trim() || d.title.length > 160)
    throw Error('Give the team a name of 1–160 characters.');
  if (!['exact', 'month', 'year', 'unknown'].includes(d.team_date_precision))
    throw Error('Choose date precision.');
  return {
    title: d.title.trim(),
    format: canonicalFormat(
      (d.format || 'unknown').trim().slice(0, 80),
      d.format_context?.generation,
    ),
    ...(d.format_context
      ? { format_context: cleanFormatContext(d.format_context) }
      : {}),
    tags: normalizeTags(d.tags ?? []),
    source_type: sourceMeta(d).source_type,
    source_name: (sourceMeta(d).source_name ?? '').slice(0, 200),
    source_note: (d.source_note ?? '').slice(0, 10000),
    source_url: (d.source_url ?? '').slice(0, 2000),
    team_date:
      validateDate(d.team_date, d.team_date_precision)?.slice(0, 4) || null,
    team_date_precision:
      d.team_date_precision === 'unknown' ? 'unknown' : 'year',
  };
}
export function dateLabel(
  t: Pick<TeamMeta, 'team_date' | 'team_date_precision'>,
) {
  return t.team_date_precision === 'unknown' || !t.team_date
    ? 'Unknown'
    : t.team_date.slice(0, 4);
}
export const formatLabel = (f: string) =>
  knownFormat(f)?.name.replace(/\[|\]/g, '') ||
  f
    .replace(/^gen(\d+)/i, 'Gen $1 ')
    .replace(/vgc20(\d{2})/i, 'VGC $1 ')
    .replace(/regulation/i, 'Reg ')
    .toUpperCase();
export function withNotes(t: Pick<TeamRecord, 'title' | 'version'>) {
  return (
    t.version.showdown_text +
    '\n\n# ' +
    t.title +
    ' — v' +
    t.version.version_number +
    '\n' +
    t.version.team_notes +
    t.version.set_notes
      .map((n, i) =>
        n ? '\n\n' + t.version.parsed_team[i]?.species + ':\n' + n : '',
      )
      .join('')
  );
}
