'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { IMPORT_CHUNK_SIZE } from '@/lib/import-workflow';
import { sourceTypes, type TeamMeta } from '@/lib/domain';
import { Modal, Field, Pick, TagEditor } from './vault-ui';
export function BulkActionDialog({
  ids,
  tags,
  onClose,
  onSaved,
  deleting = false,
}: {
  ids: string[];
  tags: string[];
  onClose: () => void;
  onSaved: (count: number) => void;
  deleting?: boolean;
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
    if (done) onSaved(done);
    else onClose();
  }
  async function apply() {
    if (busy || !targets) return;
    setError('');
    setBusy(true);
    try {
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
        await api(deleting ? 'family_bulk_delete' : 'bulk', {
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
      onSaved(op.next);
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
          ? 'Permanently delete every variant in these families, including all their history, notes and share links.'
          : targets
            ? 'Update all ' +
              targets.length +
              ' variants across these families, including siblings outside the current search. Blank fields keep existing values.'
            : 'Resolving all variants in the selected families…'
      }
      onClose={close}
    >
      {!deleting && (
        <fieldset disabled={started}>
          <Field label="Add tags">
            <TagEditor tags={values} suggestions={tags} onChange={setValues} />
          </Field>
          <div className="field-row">
            <Pick
              label="Replace source type"
              value={source}
              onChange={setSource}
              options={[['', 'Keep existing'], ...sourceTypes]}
            />
            <Field label="Source name">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Field label="Set historical year">
            <input
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="Keep existing"
            />
          </Field>
        </fieldset>
      )}
      {started && (
        <div className="import-progress">
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
          disabled={busy || !targets}
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
