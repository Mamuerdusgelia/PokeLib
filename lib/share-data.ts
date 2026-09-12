import { cleanMeta, type TeamRecord } from './domain';

/** Construct the upload in the browser: history, raw imports and account/editor metadata never leave it. */
export function snapshotUpload(team: TeamRecord): TeamRecord {
  const id = crypto.randomUUID(),
    versionId = crypto.randomUUID(),
    created = new Date().toISOString();
  const v = team.version;
  return {
    ...cleanMeta(team),
    id,
    current_version_id: versionId,
    variant_name: team.variant_name || 'Main',
    variant_description: team.variant_description || '',
    favourite: false,
    archived: false,
    created_at: created,
    updated_at: created,
    imported_at: null,
    version: {
      id: versionId,
      team_id: id,
      version_number: v.version_number,
      parent_version_id: null,
      version_comment: '',
      showdown_text: v.showdown_text,
      original_text: '',
      parsed_team: v.parsed_team,
      team_notes: v.team_notes,
      set_notes: v.set_notes,
      created_at: created,
    },
  };
}
