import { cleanMeta, type Draft, type Snapshot } from './domain';
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
  return {
    id: crypto.randomUUID(),
    team_id,
    version_number,
    parent_version_id,
    version_comment: d.version_comment?.trim() || 'Updated team',
    showdown_text: d.showdown_text.trim(),
    original_text: d.original_text ?? d.showdown_text,
    parsed_team: sets,
    team_notes: d.team_notes ?? '',
    set_notes: sets.map((_, i) => d.set_notes?.[i] ?? ''),
    created_at: new Date().toISOString(),
  };
}
