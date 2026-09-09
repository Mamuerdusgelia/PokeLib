import { type Snapshot, type TeamRecord } from './domain';
import { validateChunk, type ChunkKey } from './import-workflow';

/** Narrow the untrusted RPC body before either storage adapter reads it. */
export function variantPayload(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('Invalid variant request.');
  const value = input as Record<string, unknown>;
  const string = (key: string) =>
    typeof value[key] === 'string' ? (value[key] as string) : '';
  let chunk: ChunkKey | undefined;
  if (value.chunk !== undefined) {
    if (!value.chunk || typeof value.chunk !== 'object')
      throw Error('Invalid operation chunk.');
    const c = value.chunk as Record<string, unknown>;
    chunk = {
      operation_id: typeof c.operation_id === 'string' ? c.operation_id : '',
      chunk_index: Number(c.chunk_index),
    };
    validateChunk(chunk);
  }
  return {
    id: string('id'),
    name: string('name'),
    description: string('description'),
    title: string('title'),
    version_id: string('version_id'),
    expected: string('expected'),
    expected_revision: string('expected_revision'),
    expected_updated_at: string('expected_updated_at'),
    operation_id: string('operation_id'),
    chunk,
    ids: value.ids,
  };
}

export const familyKey = (t: TeamRecord) => t.family_key || t.family_id || t.id;
export function variantDetails(p: { name?: unknown; description?: unknown }) {
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.trim().length > 80)
    throw Error('Enter a variant name of 1–80 characters.');
  const name = p.name.trim().replace(/\s+/g, ' ');
  const description =
    typeof p.description === 'string' ? p.description.trim() : '';
  if (description.length > 1000)
    throw Error('Keep the variant description below 1,000 characters.');
  return { name, key: name.toLowerCase(), description };
}
export function cloneSnapshot(source: Snapshot, teamId: string): Snapshot {
  const id = crypto.randomUUID();
  return {
    ...structuredClone(source),
    id,
    edit_revision: id,
    team_id: teamId,
    version_number: 1,
    parent_version_id: null,
    created_at: new Date().toISOString(),
  };
}
export function familySelection(
  ids: unknown,
  maximum = 10000,
): asserts ids is string[] {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > maximum ||
    ids.some((id) => typeof id !== 'string') ||
    new Set(ids).size !== ids.length
  )
    throw Error('Invalid family selection.');
}
