'use client';
import { useState, useEffect } from 'react';
import { Check, Upload, Plus, ArrowRight } from 'lucide-react';
import { api } from '@/lib/client';
import {
  emptyDraft,
  sourceTypes,
  cleanMeta,
  type Draft,
  type TeamRecord,
  type PokemonSet,
  type Precision,
} from '@/lib/domain';
import { Modal, Field, Pick, TagEditor, PokemonLine } from './vault-ui';
export function MetaFields({
  draft,
  setDraft,
  tags = [],
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  tags?: string[];
}) {
  const set = (key: string, value: any) => setDraft({ ...draft, [key]: value });
  return (
    <div className="meta-fields">
      <div className="field-row">
        <Field label="Team name">
          <input
            value={draft.title}
            maxLength={160}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Give this team a name"
          />
        </Field>
        <Field label="Showdown format">
          <input
            value={draft.format}
            onChange={(e) => set('format', e.target.value)}
            placeholder="gen9ou"
          />
        </Field>
      </div>
      <Field label="Tags">
        <TagEditor
          tags={draft.tags}
          suggestions={tags}
          onChange={(v) => set('tags', v)}
        />
      </Field>
      <div className="field-row">
        <Field label="Historical team date">
          <Pick
            label="Date precision"
            value={draft.team_date_precision}
            onChange={(v) =>
              setDraft({
                ...draft,
                team_date_precision: v as Precision,
                team_date: v === 'unknown' ? null : '',
              })
            }
            options={['unknown', 'year', 'month', 'exact'].map(
              (v) =>
                [
                  v,
                  {
                    unknown: 'Unknown',
                    year: 'Year only',
                    month: 'Month and year',
                    exact: 'Exact date',
                  }[v]!,
                ] as [string, string],
            )}
          />
        </Field>
        {draft.team_date_precision !== 'unknown' && (
          <Field
            label={
              draft.team_date_precision === 'year'
                ? 'Year'
                : draft.team_date_precision === 'month'
                  ? 'Month'
                  : 'Date'
            }
          >
            <input
              aria-label="Historical date"
              type={
                draft.team_date_precision === 'exact'
                  ? 'date'
                  : draft.team_date_precision === 'month'
                    ? 'month'
                    : 'text'
              }
              value={draft.team_date || ''}
              placeholder="2022"
              onChange={(e) => set('team_date', e.target.value)}
            />
          </Field>
        )}
      </div>
      <div className="field-row">
        <Field label="Source type">
          <Pick
            label="Source type"
            value={draft.source_type}
            onChange={(v) => set('source_type', v)}
            options={sourceTypes}
          />
        </Field>
        <Field label="Source name">
          <input
            placeholder="Strange Name, Smogon, an event…"
            value={draft.source_name}
            onChange={(e) => set('source_name', e.target.value)}
          />
        </Field>
      </div>
      <details className="metadata-more">
        <summary>Source link & additional context</summary>
        <Field label="Source URL">
          <input
            type="url"
            placeholder="https://…"
            value={draft.source_url}
            onChange={(e) => set('source_url', e.target.value)}
          />
        </Field>
        <Field label="Source note">
          <textarea
            rows={2}
            value={draft.source_note}
            onChange={(e) => set('source_note', e.target.value)}
          />
        </Field>
      </details>
    </div>
  );
}
export function TeamEditor({
  mode,
  team,
  tags,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'version' | 'metadata';
  team?: TeamRecord;
  tags: string[];
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    team
      ? {
          ...team,
          ...team.version,
          version_comment:
            mode === 'version' ? '' : team.version.version_comment,
        }
      : emptyDraft(),
  );
  const [preview, setPreview] = useState<{
    sets: PokemonSet[];
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode === 'metadata' || !draft.showdown_text.trim()) {
      setPreview(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(
      () =>
        api(
          'preview',
          { text: draft.showdown_text, format: draft.format },
          ctrl.signal,
        )
          .then((r) => {
            setPreview(r);
            setError('');
          })
          .catch((e) => {
            if (e.name !== 'AbortError') {
              setPreview(null);
              setError(e.message);
            }
          }),
      450,
    );
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [draft.showdown_text, draft.format, mode]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      cleanMeta(draft);
      if (mode === 'metadata') {
        await api('patch', { id: team!.id, patch: draft });
        onSaved(team!.id);
      } else if (mode === 'version') {
        await api('version', {
          id: team!.id,
          draft,
          expected: team!.current_version_id,
          parent: team!.version.id,
        });
        onSaved(team!.id);
      } else {
        const r = await api('import', { drafts: [draft] });
        onSaved(r.ids[0]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={
        mode === 'new'
          ? 'Create a new team'
          : mode === 'metadata'
            ? 'Edit team details'
            : 'Create a new version'
      }
      description={
        mode === 'version'
          ? 'Save a snapshot. Every previous version stays available.'
          : mode === 'new'
            ? 'Start a team today. Paste your Showdown text and make it your own.'
            : 'Tags, provenance and dates belong to the team across all its versions.'
      }
      onClose={onClose}
    >
      <div className="editor-layout">
        <MetaFields draft={draft} setDraft={setDraft} tags={tags} />
        {mode !== 'metadata' && (
          <div className="showdown-editor">
            <Field label="Pokémon Showdown text">
              <textarea
                className="code-editor"
                spellCheck={false}
                rows={15}
                value={draft.showdown_text}
                onChange={(e) =>
                  setDraft({ ...draft, showdown_text: e.target.value })
                }
                placeholder={
                  'Darkrai @ Heavy-Duty Boots\nAbility: Bad Dreams\nEVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\n- Dark Pulse\n- Ice Beam\n- Sludge Bomb\n- Nasty Plot'
                }
              />
            </Field>
            {preview && (
              <div className="parse-preview">
                <div>
                  <Check size={14} />
                  {preview.sets.length} Pokémon parsed
                </div>
                <PokemonLine sets={preview.sets} />
                {preview.warnings.map((w) => (
                  <p className="warning" key={w}>
                    {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {mode !== 'metadata' && (
        <>
          <Field label="Team notes">
            <textarea
              rows={3}
              value={draft.team_notes}
              onChange={(e) =>
                setDraft({ ...draft, team_notes: e.target.value })
              }
              placeholder="Matchups, game plans, and things to remember…"
            />
          </Field>
          {preview && (
            <details className="set-notes-editor">
              <summary>Pokémon notes · {preview.sets.length} sets</summary>
              <div className="field-row">
                {preview.sets.map((p, i) => (
                  <Field key={i} label={p.species}>
                    <textarea
                      rows={2}
                      value={draft.set_notes[i] || ''}
                      onChange={(e) => {
                        const notes = [...draft.set_notes];
                        notes[i] = e.target.value;
                        setDraft({ ...draft, set_notes: notes });
                      }}
                      placeholder="Benchmarks, matchup reminders, substitutions…"
                    />
                  </Field>
                ))}
              </div>
            </details>
          )}
          <Field label="Version comment">
            <input
              value={draft.version_comment}
              onChange={(e) =>
                setDraft({ ...draft, version_comment: e.target.value })
              }
              placeholder="What changed in this version?"
            />
          </Field>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy || (mode !== 'metadata' && !preview)}
          onClick={save}
        >
          <Plus size={15} />
          {busy
            ? 'Saving…'
            : mode === 'new'
              ? 'Create team'
              : mode === 'metadata'
                ? 'Save details'
                : 'Save new version'}
        </button>
      </div>
    </Modal>
  );
}
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
