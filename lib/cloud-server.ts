import { cleanMeta, type TeamRecord } from './domain';
import { makeSnapshot } from './snapshot';
import { indexTerms } from './search';
import { indexed } from './local-library';

/** Re-parse untrusted text and whitelist metadata before persisting or sharing. */
export function cleanCloudTeam(input: TeamRecord): TeamRecord {
  const meta = cleanMeta(input);
  if (!/^[a-f0-9-]{36}$/i.test(input.id)) throw Error('Invalid team ID.');
  const v = input.version;
  const parsed = makeSnapshot(
    { ...meta, ...v },
    input.id,
    v.version_number,
    v.parent_version_id,
  );
  if (!Number.isSafeInteger(v.version_number) || v.version_number < 1)
    throw Error('Invalid version.');
  const version = {
    ...parsed,
    id: v.id,
    edit_revision: v.edit_revision || v.id,
    created_at: v.created_at,
  };
  return {
    ...meta,
    id: input.id,
    family_id: input.family_id || input.id,
    variant_name: String(input.variant_name || 'Main').slice(0, 80),
    variant_description: String(input.variant_description || '').slice(0, 1000),
    current_version_id: version.id,
    favourite: input.favourite === true,
    archived: input.archived === true,
    created_at: input.created_at,
    updated_at: input.updated_at,
    imported_at: input.imported_at,
    storage: 'cloud',
    version,
  };
}
export function cloudPayload(input: TeamRecord) {
  const team = cleanCloudTeam(input);
  const { team: summary } = indexed(team);
  return { team, summary, terms: indexTerms(team, team.version) };
}
export function snapshotProjection(input: TeamRecord) {
  const t = cleanCloudTeam(input),
    v = t.version;
  return {
    ...cleanMeta(t),
    id: 'shared',
    current_version_id: 'shared',
    variant_name: t.variant_name,
    variant_description: t.variant_description,
    version: {
      id: 'shared',
      team_id: 'shared',
      version_number: v.version_number,
      parent_version_id: null,
      version_comment: '',
      showdown_text: v.showdown_text,
      original_text: '',
      parsed_team: v.parsed_team,
      team_notes: v.team_notes,
      set_notes: v.set_notes,
      created_at: v.created_at,
    },
  };
}
