'use client';
import { sourceTypes, type Draft, type Precision } from '@/lib/domain';
import { Field, Pick, TagEditor } from './vault-ui';
export function MetaFields({
  draft,
  setDraft,
  tags = [],
  compact = false,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  tags?: string[];
  compact?: boolean;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value });
  return (
    <div className="meta-fields">
      {!compact && (
        <>
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
        </>
      )}
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
