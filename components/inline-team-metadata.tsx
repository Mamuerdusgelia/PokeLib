'use client';
import { useState, type ReactNode } from 'react';
import {
  sourceTypes,
  readableMeta,
  type TeamMeta,
  type TeamRecord,
  type Precision,
} from '@/lib/domain';
import { FormatPicker } from './format-picker';
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
    [draft, setDraft] = useState<TeamMeta>(readableMeta(team)),
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
            setDraft(readableMeta(team));
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
              ? { format: draft.format, format_context: draft.format_context }
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
          <FormatPicker
            value={draft.format}
            context={draft.format_context}
            onChange={(format, format_context) =>
              setDraft({ ...draft, format, format_context })
            }
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
            options={[
              ['unknown', 'Unknown'],
              ['year', 'Year only'],
            ]}
          />
          {draft.team_date_precision !== 'unknown' && (
            <Field label="Historical date">
              <input
                aria-label="Historical date"
                type="text"
                inputMode="numeric"
                maxLength={4}
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
          {draft.source_type !== 'Other' && (
            <Field
              label={draft.source_type === 'Found on' ? 'Place' : 'Player'}
            >
              <input
                aria-label="Source name"
                value={draft.source_name}
                onChange={(e) => update('source_name', e.target.value)}
              />
            </Field>
          )}
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
