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
  id: string;
  owner_id?: string;
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
export type Term = { field: string; value: string };
export type QueryPlan = {
  meta: Term[];
  set: Term[];
  free: string[];
  fallback?: string[];
};
export const sourceTypes = [
  'Self-built',
  'Copied from',
  'Received from',
  'Adapted from',
  'Tournament',
  'Website',
  'Discord',
  'Other',
];
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
    source_type: imported ? 'Other' : 'Self-built',
    source_name: '',
    source_url: '',
    source_note: '',
    team_date: imported ? null : localDate(),
    team_date_precision: imported ? 'unknown' : 'exact',
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
  if (!sourceTypes.includes(d.source_type))
    throw Error('Choose a source type.');
  if (!['exact', 'month', 'year', 'unknown'].includes(d.team_date_precision))
    throw Error('Choose date precision.');
  if (d.source_url) {
    let u: URL;
    try {
      u = new URL(d.source_url);
    } catch {
      throw Error('Enter a valid source URL.');
    }
    if (!['https:', 'http:'].includes(u.protocol))
      throw Error('Source links must use https or http.');
  }
  return {
    title: d.title.trim(),
    format: (d.format || 'unknown').trim().slice(0, 80),
    tags: normalizeTags(d.tags ?? []),
    source_type: d.source_type,
    source_name: (d.source_name ?? '').slice(0, 200),
    source_note: (d.source_note ?? '').slice(0, 10000),
    source_url: (d.source_url ?? '').slice(0, 2000),
    team_date: validateDate(d.team_date, d.team_date_precision),
    team_date_precision: d.team_date_precision,
  };
}
export function dateLabel(
  t: Pick<TeamMeta, 'team_date' | 'team_date_precision'>,
) {
  return t.team_date_precision === 'unknown' || !t.team_date
    ? 'Unknown'
    : t.team_date_precision === 'year'
      ? t.team_date
      : t.team_date_precision === 'month'
        ? new Date(t.team_date + '-01T12:00:00').toLocaleDateString('en-AU', {
            month: 'short',
            year: 'numeric',
          })
        : new Date(t.team_date + 'T12:00:00').toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
}
export const formatLabel = (f: string) =>
  f
    .replace(/^gen(\d+)/i, 'Gen $1 ')
    .replace(/vgc20(\d{2})/i, 'VGC $1 ')
    .replace(/regulation/i, 'Reg ')
    .toUpperCase();
export function withNotes(t: TeamRecord) {
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
