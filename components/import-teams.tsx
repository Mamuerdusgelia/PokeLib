'use client';
import { useState } from 'react';
import { Check, Upload, ArrowRight } from 'lucide-react';
import { api } from '@/lib/client';
import { emptyDraft, type Draft } from '@/lib/domain';
import { Modal, Field } from './vault-ui';
import { MetaFields } from './team-metadata-panel';
export function ImportTeams({
  tags,
  onClose,
  onSaved,
}: {
  tags: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [batch, setBatch] = useState<
    { draft: Draft; warnings: string[] }[] | null
  >(null);
  const [common, setCommon] = useState({
    ...emptyDraft(true),
    title: 'Batch metadata',
    format: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function parse() {
    setBusy(true);
    setError('');
    try {
      setBatch(
        await api('parse', { text, format: common.format || 'unknown' }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const drafts = batch!.map(({ draft }) => ({
        ...draft,
        tags: common.tags,
        source_type: common.source_type,
        source_name: common.source_name,
        source_url: common.source_url,
        source_note: common.source_note,
        team_date: common.team_date,
        team_date_precision: common.team_date_precision,
        team_notes: common.team_notes,
        format:
          draft.format === 'unknown'
            ? common.format || 'unknown'
            : draft.format,
      }));
      await api('import', { drafts });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title="Import your teams"
      description="Bring your Showdown exports and backups into one searchable library."
      onClose={onClose}
    >
      {!batch ? (
        <>
          <div className="import-drop">
            <Upload size={25} />
            <strong>Paste a team or an entire Showdown backup</strong>
            <p>
              For multiple teams, keep the === [format] Team name === headers.
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
                    if (f.size > 5000000) {
                      setError('Choose a file smaller than 5 MB.');
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
          <div className="callout">
            Imported teams start with an Unknown historical date. The import
            timestamp is recorded separately.
          </div>
        </>
      ) : (
        <>
          <div className="import-summary">
            <Check size={19} />
            <strong>
              {batch.length} {batch.length === 1 ? 'team' : 'teams'} ready to
              import
            </strong>
            <button className="text-link" onClick={() => setBatch(null)}>
              Edit pasted text
            </button>
          </div>
          <div className="batch-preview">
            {batch.map((b, i) => (
              <div key={i}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <input
                  aria-label={'Team ' + (i + 1) + ' name'}
                  value={b.draft.title}
                  onChange={(e) =>
                    setBatch(
                      batch.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              draft: { ...x.draft, title: e.target.value },
                            }
                          : x,
                      ),
                    )
                  }
                />
                <input
                  aria-label={'Team ' + (i + 1) + ' format'}
                  value={b.draft.format}
                  onChange={(e) =>
                    setBatch(
                      batch.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              draft: { ...x.draft, format: e.target.value },
                            }
                          : x,
                      ),
                    )
                  }
                />
                {b.warnings.length > 0 && (
                  <span className="warning">{b.warnings.join(' ')}</span>
                )}
              </div>
            ))}
          </div>
          <h3>Apply to all teams</h3>
          <div className="batch-meta">
            <MetaFields draft={common} setDraft={setCommon} tags={tags} />
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
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy || (!batch && !text.trim())}
          onClick={batch ? save : parse}
        >
          {busy
            ? 'Working…'
            : batch
              ? 'Import ' + batch.length + ' teams'
              : 'Preview import'}
          <ArrowRight size={15} />
        </button>
      </div>
    </Modal>
  );
}
