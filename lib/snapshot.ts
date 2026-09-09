import {
  cleanMeta,
  type Draft,
  type Snapshot,
  type SetEditing,
} from './domain';
import { parseShowdown } from './showdown';
export function makeSnapshot(
  d: Draft,
  team_id: string,
  version_number: number,
  parent_version_id: string | null,
): Snapshot {
  cleanMeta(d);
  if (
    d.team_notes?.length > 50000 ||
    d.version_comment?.length > 2000 ||
    d.set_notes?.some((n) => typeof n !== 'string' || n.length > 10000)
  )
    throw Error('Notes exceed the storage limit.');
  const { sets } = parseShowdown(d.showdown_text, d.format);
  const id = crypto.randomUUID();
  return {
    id,
    edit_revision: id,
    team_id,
    version_number,
    parent_version_id,
    version_comment: d.version_comment?.trim() || 'Updated team',
    showdown_text: d.showdown_text.trim(),
    original_text: d.original_text ?? d.showdown_text,
    parsed_team: sets,
    team_notes: d.team_notes ?? '',
    set_notes: sets.map((_, i) => d.set_notes?.[i] ?? ''),
    ...(d.set_editing === undefined
      ? {}
      : { set_editing: cleanSetEditing(d.set_editing, sets.length) }),
    created_at: new Date().toISOString(),
  };
}

function cleanSetEditing(
  value: unknown,
  count: number,
): Array<SetEditing | null> {
  if (!Array.isArray(value) || value.length > 24)
    throw Error('Invalid set editing metadata.');
  return Array.from({ length: count }, (_, i) => {
    const entry = value[i];
    if (entry == null) return null;
    if (
      typeof entry !== 'object' ||
      entry.authored !== true ||
      !['eligible', 'auto', 'manual'].includes(entry.attack_iv) ||
      !['auto', 'manual'].includes(entry.tera)
    )
      throw Error('Invalid set editing metadata.');
    return { authored: true, attack_iv: entry.attack_iv, tera: entry.tera };
  });
}

/** Replace authored content while retaining this version's identity and source. */
export function updateSnapshot(d: Draft, current: Snapshot): Snapshot {
  const next = makeSnapshot(
    { ...d, original_text: current.original_text },
    current.team_id,
    current.version_number,
    current.parent_version_id,
  );
  return {
    ...next,
    id: current.id,
    created_at: current.created_at,
    version_comment: current.version_comment,
  };
}
