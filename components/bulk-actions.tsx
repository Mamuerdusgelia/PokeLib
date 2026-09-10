'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { IMPORT_CHUNK_SIZE } from '@/lib/import-workflow';
import { sourceTypes, type TeamMeta } from '@/lib/domain';
import { Modal, Field, Pick, TagEditor } from './vault-ui';
import {
  deletionJob,
  runFamilyDeletion,
  type DeletionJob,
} from '@/lib/library-cleanup';
export function BulkActionDialog({
  ids,
  tags,
  onClose,
  onSaved,
  deleting = false,
  deleteAll = false,
  collectionIds = [],
  filterSummary = '',
  tagsOnly = false,
}: {
  ids: string[];
  tags: string[];
  onClose: () => void;
  onSaved: (count: number, revoked: number) => void;
  deleting?: boolean;
  deleteAll?: boolean;
  collectionIds?: string[];
  filterSummary?: string;
  tagsOnly?: boolean;
}) {
  const [values, setValues] = useState<string[]>([]),
    [source, setSource] = useState(''),
    [name, setName] = useState(''),
    [year, setYear] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(0),
    [started, setStarted] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState('');
  const [revoked, setRevoked] = useState(0);
  const deletion = useRef<DeletionJob | null>(null);
  const [expandedTargets, setTargets] = useState<string[] | null>(null);
  const targets = deleting ? ids : expandedTargets;
  useEffect(() => {
    if (deleting) return;
    const controller = new AbortController();
    api('family_expand', { ids }, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setTargets(r.ids);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [ids, deleting]);
  const job = useRef<{
    id: string;
    ids: string[];
    patch: Partial<TeamMeta>;
    next: number;
  } | null>(null);
  function close() {
    if (busy) return;
    if (done || revoked) onSaved(done, revoked);
    else onClose();
  }
  async function apply() {
    if (busy || !targets) return;
    if (deleteAll && !started && confirmation !== 'DELETE ALL') return;
    setError('');
    setBusy(true);
    try {
      if (deleting) {
        deletion.current ??= deletionJob({
          ids,
          collectionIds: deleteAll ? collectionIds : [],
        });
        setStarted(true);
        await runFamilyDeletion(api, deletion.current, (progress) => {
          setDone(progress.next);
          setRevoked(progress.nextLink);
        });
        onSaved(deletion.current.next, deletion.current.nextLink);
        return;
      }
      if (!job.current) {
        if (year && !/^\d{4}$/.test(year))
          throw Error('Enter a four-digit year.');
        const patch: Partial<TeamMeta> = {};
        if (values.length) patch.tags = values;
        if (source) {
          patch.source_type = source;
          patch.source_name = name;
        }
        if (year) {
          patch.team_date = year;
          patch.team_date_precision = 'year';
        }
        if (!deleting && !Object.keys(patch).length)
          throw Error('Choose a tag or metadata change first.');
        job.current = {
          id: crypto.randomUUID(),
          ids: [...targets],
          patch,
          next: 0,
        };
        setStarted(true);
      }
      const op = job.current;
      while (op.next < op.ids.length) {
        const chunk = op.ids.slice(op.next, op.next + IMPORT_CHUNK_SIZE);
        await api('bulk', {
          ids: chunk,
          patch: op.patch,
          chunk: {
            operation_id: op.id,
            chunk_index: Math.floor(op.next / IMPORT_CHUNK_SIZE),
          },
        });
        op.next += chunk.length;
        setDone(op.next);
      }
      onSaved(op.next, 0);
    } catch (e) {
      setError(
        (e as Error).message +
          ' Completed groups are kept; Retry continues unfinished groups.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      initialFocus={cancelRef}
      title={
        (deleting ? 'Delete ' : 'Update ') +
        ids.length +
        ' team families' +
        (deleting ? '?' : '')
      }
      description={
        deleting
          ? deleteAll
            ? 'Delete all ' +
              ids.length.toLocaleString() +
              ' team families from this workspace? This permanently removes their variants, history, notes and variant share links.'
            : 'Permanently delete every variant in these families, including all their history, notes and share links.'
          : targets
            ? 'Update all ' +
              targets.length +
              ' variants across these families, including siblings outside the current search. Blank fields keep existing values.'
            : 'Resolving all variants in the selected families…'
      }
      onClose={close}
    >
      {filterSummary && (
        <p className="cleanup-scope">Selected from: {filterSummary}</p>
      )}
      {deleteAll && (
        <>
          <p>
            Reusable tags and saved collections stay. Live links for{' '}
            {collectionIds.length} shared collections will be revoked before
            team deletion; re-share them explicitly later.
          </p>
          <p className="muted">
            This covers the families and shared collections counted for this
            review, including archived teams. New families or newly shared
            collections created in another tab afterward are not included. This
            cannot be undone.
          </p>
          <Field label="Type DELETE ALL to confirm">
            <input
              aria-label="Type DELETE ALL to confirm"
              autoComplete="off"
              spellCheck={false}
              disabled={started}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
        </>
      )}
      {!deleting && (
        <fieldset disabled={started}>
          <Field label="Add tags">
            <TagEditor tags={values} suggestions={tags} onChange={setValues} />
          </Field>
          {!tagsOnly && (
            <>
              <div className="field-row">
                <Pick
                  label="Replace source type"
                  value={source}
                  onChange={setSource}
                  options={[['', 'Keep existing'], ...sourceTypes]}
                />
                <Field label="Source name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Set historical year">
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="Keep existing"
                />
              </Field>
            </>
          )}
        </fieldset>
      )}
      {started && (
        <div className="import-progress">
          {deleteAll && (
            <output aria-live="polite">
              {revoked} / {collectionIds.length} collection links revoked
            </output>
          )}
          <progress
            aria-label="Bulk action progress"
            value={done}
            max={targets?.length || ids.length}
          />
          <output aria-live="polite">
            {done} / {targets?.length || ids.length}{' '}
            {deleting ? 'families deleted' : 'variants updated'}
          </output>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="button"
          ref={cancelRef}
          disabled={busy}
          onClick={close}
        >
          Cancel
        </button>
        <button
          type="button"
          className={'button ' + (deleting ? 'danger' : 'primary')}
          disabled={
            busy ||
            !targets ||
            (deleteAll && !started && confirmation !== 'DELETE ALL')
          }
          onClick={apply}
        >
          {busy
            ? 'Working…'
            : started
              ? 'Retry'
              : deleting
                ? 'Delete ' + ids.length + ' team families'
                : 'Apply changes'}
        </button>
      </div>
    </Modal>
  );
}
