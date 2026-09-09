export const IMPORT_CHUNK_SIZE = 5;
export type ChunkKey = { operation_id: string; chunk_index: number };
export function validateChunk(key: ChunkKey | undefined) {
  if (!key) return;
  if (
    !/^[a-f0-9-]{36}$/i.test(key.operation_id) ||
    !Number.isInteger(key.chunk_index) ||
    key.chunk_index < 0 ||
    key.chunk_index > 10000
  )
    throw Error('Invalid import operation.');
}
export async function requestHash(value: unknown) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
