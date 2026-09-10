import { storeFor, mutationOrigin } from '@/lib/runtime';
import { BACKUP_LIMITS, validateBackup } from '@/lib/backup-format';
import { operationId, restoreProgress } from '@/lib/backup';
export const dynamic = 'force-dynamic';

/** Validate the COMPLETE stream before the first database write, including the receipt. */
export async function POST(request: Request) {
  try {
    mutationOrigin(request);
    const id = operationId(request.headers.get('X-Pokelib-Backup-Operation'));
    const encoding = request.headers.get('X-Pokelib-Backup-Encoding');
    if (!['gzip', 'identity'].includes(encoding || '') || !request.body)
      throw Error('Choose a supported PokéLib backup file.');
    if (
      Number(request.headers.get('content-length') || 0) >
      BACKUP_LIMITS.compressed
    )
      throw Error('Uploaded backup files must be below 64 MiB.');
    const store = await storeFor(request);
    let bytes = 0;
    const input = request.body.pipeThrough(
      new TransformStream<Uint8Array, BufferSource>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > BACKUP_LIMITS.compressed)
            throw Error('Uploaded backup files must be below 64 MiB.');
          controller.enqueue(chunk as BufferSource);
        },
      }),
    );
    const manifest = await validateBackup(
      encoding === 'gzip'
        ? input.pipeThrough(new DecompressionStream('gzip'))
        : input.pipeThrough(
            new TransformStream<BufferSource, Uint8Array>({
              transform(chunk, controller) {
                controller.enqueue(chunk as Uint8Array);
              },
            }),
          ),
    );
    const state = await store.backup('backup_begin', { id, manifest });
    return Response.json(restoreProgress(state), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : 'Backup validation failed.';
    return Response.json(
      {
        error: /D1_ERROR|SQL|constraint|syntax|internal/i.test(message)
          ? 'The backup could not be validated. No restore chunks were written.'
          : message,
      },
      {
        status: /sign in/i.test(message) ? 401 : 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
