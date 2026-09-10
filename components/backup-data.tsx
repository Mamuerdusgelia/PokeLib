'use client';
import { useEffect, useRef, useState } from 'react';
import { api, backupUpload } from '@/lib/client';
import {
  backupChunks,
  fileStream,
  validateBackup,
  BACKUP_LIMITS,
  type BackupManifest,
  type Counts,
} from '@/lib/backup-format';
import { exportBackup } from '@/lib/backup';
import { compressedBackup } from '@/lib/backup-browser';

type Progress = {
  id: string;
  digest: string;
  next_chunk: number;
  total_chunks: number;
  counts: Counts;
  complete: boolean;
};
const pendingKey = 'pokelib-pending-restore-v1';
const countLabel = (c: Counts) =>
  `${c.families.toLocaleString()} ${c.families === 1 ? 'family' : 'families'} · ${c.variants.toLocaleString()} ${c.variants === 1 ? 'variant' : 'variants'} · ${c.revisions.toLocaleString()} ${c.revisions === 1 ? 'revision' : 'revisions'} · ${c.tags.toLocaleString()} ${c.tags === 1 ? 'tag' : 'tags'} · ${c.collections.toLocaleString()} ${c.collections === 1 ? 'collection' : 'collections'}`;
export function BackupData({
  onBusy,
  onChanged,
}: {
  onBusy: (busy: boolean) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<BackupManifest | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null),
    [pending, setPending] = useState(() => {
      try {
        return (
          typeof window !== 'undefined' && !!localStorage.getItem(pendingKey)
        );
      } catch {
        return false;
      }
    });
  const [cancellable, setCancellable] = useState(false);
  const [download, setDownload] = useState<{
    url: string;
    name: string;
    size: number;
  } | null>(null);
  const controller = useRef<AbortController | null>(null),
    operation = useRef('');
  const gzip = useRef(false),
    paused = useRef(false);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  function running(value: boolean) {
    setBusy(value);
    onBusy(value);
  }
  async function exportFile() {
    running(true);
    setError('');
    setDownload(null);
    setMessage('Preparing your complete backup…');
    const abort = new AbortController();
    controller.current = abort;
    setCancellable(true);
    try {
      const blob = await compressedBackup(
        exportBackup(
          { backup: (action, payload) => api(action, payload, abort.signal) },
          (counts, total) =>
            setMessage(
              `Preparing backup… ${counts.revisions.toLocaleString()} / ${total.revisions.toLocaleString()} revisions`,
            ),
        ),
      );
      setDownload({
        url: URL.createObjectURL(blob),
        name: `pokelib-backup-${new Date().toISOString().slice(0, 10)}.jsonl.gz`,
        size: blob.size,
      });
      setMessage(
        'Complete backup ready. Use Download backup to save the file.',
      );
    } catch (e) {
      setError(
        abort.signal.aborted
          ? 'Export cancelled. No incomplete backup was downloaded.'
          : (e as Error).message,
      );
      setMessage('');
    } finally {
      running(false);
      controller.current = null;
      setCancellable(false);
    }
  }
  async function choose(selected: File | undefined) {
    if (!selected) return;
    running(true);
    setPreview(null);
    setProgress(null);
    setError('');
    setFile(null);
    setMessage('Validating the complete backup…');
    const abort = new AbortController();
    controller.current = abort;
    setCancellable(true);
    try {
      if (selected.size > BACKUP_LIMITS.compressed)
        throw Error(
          'Choose a backup file below 64 MiB. Large backups should use the exported .jsonl.gz format.',
        );
      const magic = new Uint8Array(await selected.slice(0, 2).arrayBuffer());
      gzip.current = magic[0] === 31 && magic[1] === 139;
      const manifest = await validateBackup(
        fileStream(selected, gzip.current, abort.signal),
        (c) =>
          setMessage(
            `Validating backup… ${c.revisions.toLocaleString()} revisions checked`,
          ),
      );
      let previous: { id: string; digest: string } | null = null;
      try {
        previous = JSON.parse(localStorage.getItem(pendingKey) || 'null');
      } catch {}
      operation.current =
        previous?.digest === manifest.digest
          ? previous.id
          : crypto.randomUUID();
      setPreview(manifest);
      setFile(selected);
      setMessage('Backup validated. Review the contents before restoring.');
      if (previous?.digest === manifest.digest) {
        try {
          const state = await api('backup_status', { id: operation.current });
          setProgress(state);
        } catch {
          /* No operation is written until confirmation. */
        }
      }
    } catch (e) {
      setError(
        abort.signal.aborted
          ? 'Validation cancelled. Your library is unchanged.'
          : (e as Error).message,
      );
      setMessage('');
    } finally {
      running(false);
      controller.current = null;
      setCancellable(false);
    }
  }
  async function restore() {
    if (!file || !preview) return;
    running(true);
    setError('');
    paused.current = false;
    const abort = new AbortController();
    controller.current = abort;
    setCancellable(true);
    try {
      try {
        localStorage.setItem(
          pendingKey,
          JSON.stringify({ id: operation.current, digest: preview.digest }),
        );
        setPending(true);
      } catch {}
      setMessage('Checking the complete file on the server before restoring…');
      let state: Progress = await backupUpload(
        file,
        operation.current,
        gzip.current,
        abort.signal,
      );
      if (state.digest !== preview.digest)
        throw Error(
          'The validated file differs from the preview. Select the backup again.',
        );
      setProgress(state);
      let index = 0;
      for await (const text of backupChunks(
        fileStream(file, gzip.current, abort.signal),
      )) {
        if (paused.current) break;
        if (index >= state.next_chunk) {
          setMessage(
            `Restoring… ${state.counts.revisions.toLocaleString()} / ${preview.header.counts.revisions.toLocaleString()} revisions committed`,
          );
          state = await api(
            'backup_restore',
            { id: operation.current, index, text },
            abort.signal,
          );
          setProgress(state);
        }
        index++;
      }
      if (state.complete) {
        setMessage('Restore complete. ' + countLabel(state.counts) + '.');
        try {
          localStorage.removeItem(pendingKey);
          setPending(false);
        } catch {}
      } else
        setMessage(
          'Restore paused. Committed data is kept. Resume with this same file.',
        );
    } catch (e) {
      // A lost response may have committed. Ask the durable operation for exact progress.
      try {
        const state = await api('backup_status', { id: operation.current });
        setProgress(state);
        if (state.complete) {
          setMessage('Restore complete. ' + countLabel(state.counts) + '.');
          try {
            localStorage.removeItem(pendingKey);
            setPending(false);
          } catch {}
          return;
        }
        setMessage(
          'Restore paused. ' + countLabel(state.counts) + ' committed.',
        );
      } catch {
        setMessage(
          'Connection unavailable. Counts below are the last confirmed progress; resume to check the committed state.',
        );
      }
      setError(
        abort.signal.aborted
          ? 'Restore paused. Resume checks the saved operation before continuing.'
          : (e as Error).message,
      );
    } finally {
      onChanged();
      running(false);
      controller.current = null;
      setCancellable(false);
    }
  }
  return (
    <section className="settings-section" aria-label="Data">
      <h3>Data</h3>
      <p>
        <strong>PokéLib backup</strong> includes families, variants, complete
        history, raw team text, notes, editing provenance, metadata, reusable
        tags and saved collections.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => void exportFile()}
        >
          Export PokéLib backup
        </button>
        <label className="button" aria-disabled={busy}>
          Restore PokéLib backup
          <input
            type="file"
            accept=".gz,.jsonl,.ndjson,.json"
            className="sr-only"
            aria-label="Restore PokéLib backup file"
            disabled={busy}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {download && (
        <a
          className="button primary"
          href={download.url}
          download={download.name}
        >
          Download backup (
          {download.size < 1048576
            ? Math.max(1, Math.round(download.size / 1024)) + ' KiB'
            : (download.size / 1048576).toFixed(2) + ' MiB'}
          )
        </a>
      )}
      <p>
        <strong>Showdown export</strong> from the library or team page exports
        team text for Pokémon Showdown. It does not include PokéLib history,
        notes or collections.
      </p>
      {pending && !preview && (
        <p>
          A restore may be paused. Select the same backup file to check progress
          and resume.
        </p>
      )}
      {preview && (
        <div className="callout space-y-3" aria-label="Backup restore preview">
          <p>
            <strong>
              PokéLib backup · version {preview.header.schema_version}
            </strong>
            <br />
            Exported {new Date(preview.header.exported_at).toLocaleString()}
          </p>
          <p>{countLabel(preview.header.counts)}</p>
          <p>
            Restore into your current library. Existing data stays; new families
            and variants are added even when names match. Matching reusable tags
            are reused. Conflicting collection names receive a “restored”
            suffix.
          </p>
          <p>
            <strong>Share links are not restored.</strong> Restored data is
            private until you create new links.
          </p>
          <p>
            Large restores commit in chunks. If interrupted, completed chunks
            stay saved. Keep this file to resume, and finish restoring before
            editing this library in another window.
          </p>
          <button
            type="button"
            className="button primary"
            disabled={busy || progress?.complete}
            onClick={() => void restore()}
          >
            {progress?.complete
              ? 'Restore complete'
              : progress
                ? 'Resume restore'
                : 'Restore into current library'}
          </button>
          {progress && (
            <p>
              {progress.complete ? 'Committed' : 'Confirmed committed'}:{' '}
              {countLabel(progress.counts)}
              <br />
              {progress.next_chunk} / {progress.total_chunks} chunks
            </p>
          )}
        </div>
      )}
      {message && (
        <output className="block" aria-live="polite">
          {message}
        </output>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && cancellable && (
        <button
          type="button"
          className="button"
          onClick={() => {
            paused.current = true;
            controller.current?.abort();
          }}
        >
          Pause / cancel
        </button>
      )}
    </section>
  );
}
