'use client';
import { useState, type ReactNode } from 'react';
import {
  sourceTypes,
  type TeamMeta,
  type TeamRecord,
  type Precision,
} from '@/lib/domain';
import { Field, Pick } from './vault-ui';

export function InlineTeamMetadata({
  team,
  field,
  children,
  onSave,
}: {
  team: TeamRecord;
  field: 'title' | 'format' | 'source' | 'date';
  children: ReactNode;
  onSave: (patch: Partial<TeamMeta>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<TeamMeta>(team),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const update = <K extends keyof TeamMeta>(key: K, value: TeamMeta[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const Display = field === 'title' ? 'h1' : 'div';
  if (!editing)
    return (
      <Display className={'inline-metadata inline-' + field}>
        <button
          className="edit-value"
          type="button"
          aria-label={'Edit team ' + field}
          onClick={() => {
            setDraft(team);
            setError('');
            setEditing(true);
          }}
        >
          {children}
        </button>
      </Display>
    );
  return (
    <form
      className="inline-metadata-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        const patch: Partial<TeamMeta> =
          field === 'title'
            ? { title: draft.title }
            : field === 'format'
              ? { format: draft.format }
              : field === 'date'
                ? {
                    team_date: draft.team_date,
                    team_date_precision: draft.team_date_precision,
                  }
                : {
                    source_type: draft.source_type,
                    source_name: draft.source_name,
                    source_url: draft.source_url,
                    source_note: draft.source_note,
                  };
        try {
          await onSave(patch);
          setEditing(false);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {field === 'title' && (
        <Field label="Team name">
          <input
            aria-label="Team name"
            value={draft.title}
            maxLength={160}
            required
            onChange={(e) => update('title', e.target.value)}
          />
        </Field>
      )}
      {field === 'format' && (
        <Field label="Team format">
          <input
            aria-label="Team format"
            value={draft.format}
            placeholder="gen5ou"
            onChange={(e) => update('format', e.target.value)}
          />
        </Field>
      )}
      {field === 'date' && (
        <>
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
            options={['unknown', 'year', 'month', 'exact'].map((v) => [
              v,
              (
                {
                  unknown: 'Unknown',
                  year: 'Year only',
                  month: 'Month and year',
                  exact: 'Exact date',
                } as Record<string, string>
              )[v],
            ])}
          />
          {draft.team_date_precision !== 'unknown' && (
            <Field label="Historical date">
              <input
                aria-label="Historical date"
                type={
                  draft.team_date_precision === 'year'
                    ? 'text'
                    : draft.team_date_precision === 'month'
                      ? 'month'
                      : 'date'
                }
                value={draft.team_date || ''}
                onChange={(e) => update('team_date', e.target.value)}
                placeholder="2022"
              />
            </Field>
          )}
        </>
      )}
      {field === 'source' && (
        <>
          <Pick
            label="Source type"
            value={draft.source_type}
            onChange={(v) => update('source_type', v)}
            options={sourceTypes}
          />
          <Field label="Source name">
            <input
              aria-label="Source name"
              value={draft.source_name}
              onChange={(e) => update('source_name', e.target.value)}
            />
          </Field>
          <Field label="Source URL">
            <input
              aria-label="Source URL"
              type="url"
              value={draft.source_url}
              onChange={(e) => update('source_url', e.target.value)}
            />
          </Field>
          <Field label="Source note">
            <textarea
              aria-label="Source note"
              rows={2}
              value={draft.source_note}
              onChange={(e) => update('source_note', e.target.value)}
            />
          </Field>
        </>
      )}
      <p className="metadata-caption">
        Applies across this team&apos;s versions.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
