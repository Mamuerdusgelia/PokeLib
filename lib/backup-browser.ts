import { BACKUP_LIMITS, encoder } from './backup-format';
/** Only compressed bytes are retained for the download; parsed library records are streamed. */
export async function compressedBackup(lines: AsyncIterable<string>) {
  const compression = new CompressionStream('gzip'),
    writer = compression.writable.getWriter();
  const read = (async () => {
    const reader = compression.readable.getReader(),
      parts: BlobPart[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > BACKUP_LIMITS.compressed)
          throw Error(
            'Compressed backup exceeds 64 MiB. No file was downloaded.',
          );
        parts.push(value);
      }
      return new Blob(parts, { type: 'application/gzip' });
    } catch (e) {
      await reader.cancel(e).catch(() => {});
      throw e;
    } finally {
      reader.releaseLock();
    }
  })();
  const write = (async () => {
    try {
      for await (const line of lines) await writer.write(encoder.encode(line));
      await writer.close();
    } catch (e) {
      await writer.abort(e).catch(() => {});
      throw e;
    } finally {
      writer.releaseLock();
    }
  })();
  return (await Promise.all([read, write]))[0];
}
