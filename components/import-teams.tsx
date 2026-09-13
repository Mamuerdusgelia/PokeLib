'use client';
import { useRef, useState } from 'react';
import { Upload, ArrowRight } from 'lucide-react';
import { extractPokepasteUrls, previewPokepasteBatch } from '@/lib/pokepaste';
import { api } from '@/lib/client';
import { emptyDraft, type Draft } from '@/lib/domain';
import { IMPORT_CHUNK_SIZE } from '@/lib/import-workflow';
import { Modal, Field } from './vault-ui';
import { MetaFields } from './team-metadata-panel';
import { FormatPicker } from './format-picker';
export function ImportTeams({
  tags,
  onClose,
  onSaved,
}: {
  tags: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [failures, setFailures] = useState<{ url: string; reason: string }[]>(
    [],
  );
  const [progress, setProgress] = useState('');
  const [finished, setFinished] = useState(false);
  const [text, setText] = useState('');
  const [method, setMethod] = useState<'text' | 'pokepaste'>('text');
  const [url, setUrl] = useState('');
  const [batch, setBatch] = useState<
    { draft: Draft; warnings: string[] }[] | null
  >(null);
  const [common, setCommon] = useState({
    ...emptyDraft(true),
    title: 'Batch metadata',
    format: '',
  });
  const [page, setPage] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [completed, setCompleted] = useState(0),
    [locked, setLocked] = useState(false);
  const operation = useRef<{
    id: string;
    drafts: Draft[];
    next: number;
  } | null>(null);
  function close() {
    if (busy) return;
    if (completed) onSaved();
    else onClose();
  }
  async function parse() {
    setBusy(true);
    setError('');
    try {
      if (method === 'pokepaste') {
        const urls = extractPokepasteUrls(url);
        if (!urls.length)
          throw Error(
            'No valid PokéPaste links found. Use https://pokepast.es/ followed by a 16-character paste ID.',
          );
        setFailures([]);
        const result = await previewPokepasteBatch(
          urls,
          (link) =>
            api('pokepaste', {
              url: link,
              format: common.format || 'unknown',
              format_context: common.format_context,
            }),
          (done, total) =>
            setProgress('Loading ' + done + ' of ' + total + '…'),
        );
        setFailures(result.failures);
        setProgress('');
        const rows = result.results.flatMap((r) => r.batch);
        if (!rows.length)
          throw Error(
            'No teams could be imported. Review the failed links below.',
          );
        setBatch(rows);
        setPage(0);
        operation.current = null;
        setCompleted(0);
        setLocked(false);
        setFinished(false);
        return;
      }
      const preview = await api('parse', {
        text,
        url,
        format: common.format || 'unknown',
        format_context: common.format_context,
      });
      setBatch(preview);
      setPage(0);
      operation.current = null;
      setCompleted(0);
      setLocked(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!batch || busy) return;
    setBusy(true);
    setError('');
    if (!operation.current)
      operation.current = {
        id: crypto.randomUUID(),
        next: 0,
        drafts: batch.map(({ draft }) =>
          method === 'pokepaste'
            ? draft
            : {
                ...draft,
                tags: common.tags,
                source_type: common.source_type,
                source_name: common.source_name,
                source_url: common.source_url,
                source_note: common.source_note,
                team_date: common.team_date,
                team_date_precision: common.team_date_precision,
                team_notes: common.team_notes,
                ...(draft.format === 'unknown' && common.format
                  ? {
                      format: common.format,
                      format_context: common.format_context,
                    }
                  : {}),
              },
        ),
      };
    const job = operation.current;
    setLocked(true);
    try {
      while (job.next < job.drafts.length) {
        const drafts = job.drafts.slice(job.next, job.next + IMPORT_CHUNK_SIZE);
        await api('import', {
          drafts,
          chunk: {
            operation_id: job.id,
            chunk_index: Math.floor(job.next / IMPORT_CHUNK_SIZE),
          },
        });
        job.next += drafts.length;
        setCompleted(job.next);
      }
      if (method === 'pokepaste') setFinished(true);
      else onSaved();
    } catch (e) {
      setError(
        'Import paused at ' +
          job.next +
          ' / ' +
          job.drafts.length +
          '. Completed teams are saved. Retry continues the same import. ' +
          (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title="Import your teams"
      description="Import Showdown text, a complete backup, or a PokéPaste link."
      onClose={close}
    >
      {!batch ? (
        <>
          <div className="heading-actions" aria-label="Import method">
            <button
              type="button"
              className="button"
              aria-pressed={method === 'text'}
              disabled={busy}
              onClick={() => setMethod('text')}
            >
              Showdown text or file
            </button>
            <button
              type="button"
              className="button"
              aria-pressed={method === 'pokepaste'}
              disabled={busy}
              onClick={() => setMethod('pokepaste')}
            >
              PokéPaste / Text
            </button>
          </div>
          {method === 'pokepaste' ? (
            <Field label="Paste one or more PokéPaste links, or any message containing PokéPaste links.">
              <textarea
                rows={10}
                aria-label="PokéPaste URL"
                value={url}
                maxLength={1000000}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://pokepast.es/…"
              />
            </Field>
          ) : (
            <>
              <div className="import-drop">
                <Upload size={25} />
                <strong>Paste a team or Showdown backup</strong>
                <p>
                  For multiple teams, keep the === [format] Team name ===
                  headers.
                </p>
                <label className="button">
                  Choose a .txt file
                  <input
                    type="file"
                    accept=".txt,.text"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > 20000000) {
                          setError('Choose an archive smaller than 20 MB.');
                          return;
                        }
                        setText(await f.text());
                      }
                    }}
                  />
                </label>
              </div>
              <textarea
                aria-label="Showdown import text"
                className="code-editor"
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste Pokémon Showdown export text here…"
              />
            </>
          )}
          <Field label="Format for teams without a format header">
            <FormatPicker
              label="Fallback import format"
              value={common.format}
              context={common.format_context}
              onChange={(format, format_context) =>
                setCommon({ ...common, format, format_context })
              }
            />
          </Field>
          <p className="picker-hint">
            Imported Team Dates start as Unknown. Import time is recorded
            separately.
          </p>
        </>
      ) : (
        <>
          <div className="import-summary">
            <strong>{batch.length} teams detected</strong>
            {!locked && (
              <button className="text-link" onClick={() => setBatch(null)}>
                Edit import
              </button>
            )}
          </div>
          <fieldset disabled={locked}>
            <div className="batch-preview">
              {batch.slice(page * 50, (page + 1) * 50).map((b, offset) => {
                const i = page * 50 + offset;
                const update = (draft: Draft) =>
                  setBatch(
                    batch.map((x, j) => (j === i ? { ...x, draft } : x)),
                  );
                return (
                  <div key={i}>
                    <span>{i + 1}</span>
                    <input
                      aria-label={'Team ' + (i + 1) + ' name'}
                      value={b.draft.title}
                      onChange={(e) =>
                        update({ ...b.draft, title: e.target.value })
                      }
                    />
                    <FormatPicker
                      label={'Team ' + (i + 1) + ' format'}
                      value={b.draft.format}
                      context={b.draft.format_context}
                      onChange={(format, format_context) =>
                        update({ ...b.draft, format, format_context })
                      }
                    />
                    {!!b.warnings.length && (
                      <span className="warning">{b.warnings.join(' ')}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
          {batch.length > 50 && (
            <div className="import-pagination">
              <button
                className="button"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Previous preview page
              </button>
              <span>
                Showing {page * 50 + 1}–
                {Math.min((page + 1) * 50, batch.length)} of {batch.length}
              </span>
              <button
                className="button"
                disabled={(page + 1) * 50 >= batch.length}
                onClick={() => setPage(page + 1)}
              >
                Next preview page
              </button>
            </div>
          )}
          {method === 'text' && (
            <fieldset disabled={locked}>
              <h3>Apply to all teams</h3>
              <div className="batch-meta">
                <MetaFields
                  importCommon
                  draft={common}
                  setDraft={setCommon}
                  tags={tags}
                />
              </div>
              <Field label="Common team note">
                <textarea
                  rows={2}
                  value={common.team_notes}
                  onChange={(e) =>
                    setCommon({ ...common, team_notes: e.target.value })
                  }
                />
              </Field>
            </fieldset>
          )}
          {locked && (
            <div className="import-progress">
              <progress
                max={batch.length}
                value={completed}
                aria-label="Import progress"
              />
              <output aria-live="polite">
                {busy ? 'Importing' : 'Imported'} {completed} / {batch.length}
              </output>
            </div>
          )}
        </>
      )}
      {progress && <output aria-live="polite">{progress}</output>}
      {finished && (
        <output>
          {completed} teams imported, {failures.length} failed
        </output>
      )}
      {!!failures.length && (
        <div className="paste-failures">
          <strong>{failures.length} failed</strong>
          {failures.map((f) => (
            <p key={f.url}>
              {f.url} — {f.reason}
            </p>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button" disabled={busy} onClick={close}>
          {completed ? 'Close' : 'Cancel'}
        </button>
        <button
          className="button primary"
          disabled={
            finished ||
            busy ||
            (!batch && !(method === 'pokepaste' ? url : text).trim())
          }
          onClick={batch ? save : parse}
        >
          {busy
            ? batch
              ? 'Importing…'
              : method === 'pokepaste'
                ? 'Loading PokéPaste…'
                : 'Parsing…'
            : batch
              ? locked
                ? 'Retry remaining teams'
                : 'Import ' + batch.length + ' teams'
              : 'Preview import'}
          <ArrowRight size={15} />
        </button>
      </div>
    </Modal>
  );
}
