'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { api } from '@/lib/client';
import { type TeamRecord, snapshotRevision } from '@/lib/domain';
import { familyKey } from '@/lib/variants';
import { Field, Modal, PokemonLine } from './vault-ui';
import {
  startSaveTrace,
  feedbackSaveTrace,
  cancelSaveTrace,
} from '@/lib/builder-performance';

export function FamilyVariants({
  team,
  query = '',
  year = '',
  favourite = false,
  omitDisplayed = false,
  expanded = false,
  onOpen,
}: {
  team: TeamRecord;
  query?: string;
  year?: string;
  favourite?: boolean;
  omitDisplayed?: boolean;
  expanded?: boolean;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(0),
    [rows, setRows] = useState<TeamRecord[]>([]),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(false),
    [loadedKey, setLoadedKey] = useState(''),
    [error, setError] = useState('');
  const count = team.variant_count || 1,
    matching = team.matching_variant_count || 1;
  const showRows = expanded || open;
  const requestKey = JSON.stringify([
    familyKey(team),
    team.updated_at,
    query,
    year,
    favourite,
    page,
  ]);
  useEffect(() => {
    if (!showRows || count < 2) return;
    const controller = new AbortController();
    api(
      'family_variants',
      {
        family_id: familyKey(team),
        query,
        year,
        favourite,
        include_archived: true,
        page,
      },
      controller.signal,
    )
      .then((r) => {
        if (!controller.signal.aborted) {
          setRows(r.teams);
          setTotal(r.total);
          setError('');
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBusy(false);
          setLoadedKey(requestKey);
        }
      });
    return () => controller.abort();
  }, [showRows, count, page, team, query, year, favourite, requestKey]);
  if (count < 2) return null;
  return (
    <div className="family-variants">
      {!expanded && (
        <button
          type="button"
          className="text-link"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            setPage(0);
            setBusy(true);
            setError('');
          }}
        >
          {open ? '▾' : '▸'} {count} variants
          {matching < count && (query || year || favourite)
            ? ' · ' + matching + ' matching'
            : ''}
        </button>
      )}
      {showRows && (
        <div className="variant-rows">
          {busy || loadedKey !== requestKey ? (
            <output>Loading variants…</output>
          ) : (
            rows
              .filter((t) => !omitDisplayed || t.id !== team.id)
              .map((t) => (
                <button
                  type="button"
                  className="variant-row"
                  key={t.id}
                  onClick={() => onOpen(t.id)}
                >
                  <strong>
                    ↳ {t.variant_name || 'Main'}
                    {(t.variant_name || 'Main') === 'Main'
                      ? ' · ' + t.title
                      : ''}
                  </strong>
                  <PokemonLine sets={t.version.parsed_team} />
                  <small>{t.variant_description}</small>
                </button>
              ))
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {total > 30 && (
            <div className="variant-pagination">
              <button
                disabled={busy || page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous variants
              </button>
              <span>
                {page + 1} / {Math.ceil(total / 30)}
              </span>
              <button
                disabled={busy || (page + 1) * 30 >= total}
                onClick={() => setPage(page + 1)}
              >
                Next variants
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function VariantActions({
  team,
  onSaved,
  onOpen,
}: {
  team: TeamRecord;
  onSaved: (t: TeamRecord) => void;
  onOpen: (id: string) => void;
}) {
  const [mode, setMode] = useState<'create' | 'rename' | 'delete' | null>(null),
    [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pickerOpen, setPickerOpen] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null),
    operation = useRef(''),
    saving = useRef(false),
    cancelled = useRef(false);
  const variantCount = team.variant_count ?? 1;
  const hasSiblings = variantCount > 1;
  const canDetach = team.id !== familyKey(team) && team.variant_name !== 'Main';
  useEffect(() => {
    if (busy && mode === 'create') feedbackSaveTrace();
  }, [busy, mode]);
  function begin(next: 'create' | 'rename' | 'delete') {
    setName(next === 'rename' ? team.variant_name || 'Main' : '');
    setDescription(next === 'delete' ? '' : team.variant_description || '');
    setError('');
    setMode(next);
    operation.current = crypto.randomUUID();
  }
  async function submit() {
    if (busy || saving.current) return;
    if (
      mode === 'rename' &&
      (!name.trim() || name.trim() === (team.variant_name || 'Main'))
    ) {
      setMode(null);
      return;
    }
    saving.current = true;
    if (mode === 'create')
      startSaveTrace('variant_create', team.version.parsed_team.length);
    setBusy(true);
    setError('');
    try {
      const current =
        team.history?.find((v) => v.id === team.current_version_id) ||
        team.version;
      const updated = await api('variant_' + mode, {
        id: team.id,
        name,
        description,
        operation_id: operation.current,
        version_id: team.version.id,
        expected: team.current_version_id,
        expected_revision: snapshotRevision(current),
        expected_updated_at: team.updated_at,
      });
      if (mode === 'delete') {
        const r = await api('family_variants', {
          family_id: familyKey(team),
          query: '',
          include_archived: true,
        });
        if (r.teams[0]) onSaved(await api('get', { id: r.teams[0].id }));
      } else onSaved(updated);
      setMode(null);
    } catch (e) {
      cancelSaveTrace();
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="variant-actions" aria-label="Variant">
      <div className="variant-name">
        {mode === 'rename' ? (
          <input
            aria-label="Variant name"
            maxLength={80}
            value={name}
            disabled={busy}
            ref={(node) => {
              if (node && !cancelled.current) node.focus();
            }}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (!cancelled.current) void submit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelled.current = true;
                setMode(null);
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                void submit();
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="edit-value"
            title="Click to rename variant"
            aria-label="Edit variant name"
            onClick={() => {
              cancelled.current = false;
              begin('rename');
            }}
          >
            Variant: {team.variant_name || 'Main'} <small>✎</small>
          </button>
        )}
        {mode === 'rename' && error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!hasSiblings && team.variant_description && (
          <p className="variant-description">{team.variant_description}</p>
        )}
      </div>
      {hasSiblings && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger className="button">
            {variantCount} variants <ChevronDown size={14} aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="end" className="variant-picker">
            <PopoverTitle>Team variants</PopoverTitle>
            {team.variant_description && (
              <p className="variant-description">{team.variant_description}</p>
            )}
            <FamilyVariants
              team={team}
              expanded
              onOpen={(id) => {
                setPickerOpen(false);
                onOpen(id);
              }}
            />
            <div className="variant-picker-actions">
              {canDetach && (
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const updated = await api('family_remove', { id: team.id });
                      setPickerOpen(false);
                      onSaved(updated);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Remove from family
                </button>
              )}
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={() => {
                  setPickerOpen(false);
                  begin('delete');
                }}
              >
                Delete variant
              </button>
            </div>
            {error && !mode && <p className="error" role="alert">{error}</p>}
          </PopoverContent>
        </Popover>
      )}
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => begin('create')}
      >
        Create variant
      </button>
      {error && !mode && !pickerOpen && (
        <p className="error" role="alert">{error}</p>
      )}
      {mode && mode !== 'rename' && (
        <Modal
          title={
            mode === 'delete'
              ? 'Delete variant “' + (team.variant_name || 'Main') + '”?'
              : 'Create variant from ' + (team.variant_name || 'Main')
          }
          description={
            mode === 'delete'
              ? 'This deletes only this variant, its history, notes and share links. Other variants remain.'
              : mode === 'create'
                ? 'Copy the displayed snapshot into a sibling build with its own history.'
                : 'Variant names must be unique within this team family.'
          }
          initialFocus={mode === 'delete' ? cancel : undefined}
          onClose={() => {
            if (!busy) setMode(null);
          }}
        >
          {mode !== 'delete' && (
            <fieldset disabled={busy}>
              <Field label="Variant name">
                <input
                  aria-label="Variant name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    operation.current = crypto.randomUUID();
                  }}
                />
              </Field>
              <Field label="Variant description">
                <textarea
                  maxLength={1000}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    operation.current = crypto.randomUUID();
                  }}
                />
              </Field>
            </fieldset>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button"
              ref={cancel}
              disabled={busy}
              onClick={() => setMode(null)}
            >
              Cancel
            </button>
            <button
              className={'button ' + (mode === 'delete' ? 'danger' : 'primary')}
              disabled={busy}
              onClick={submit}
            >
              {busy
                ? 'Saving…'
                : mode === 'delete'
                  ? 'Delete variant'
                  : 'Create variant'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function MergeFamilyDialog({
  ids,
  standalone = false,
  onClose,
  onSaved,
}: {
  ids: string[];
  standalone?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [teams, setTeams] = useState<TeamRecord[]>([]),
    [main, setMain] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    (async () => {
      const expanded = standalone ? { ids } : await api('family_expand', { ids });
      const rows = [];
      for (const id of expanded.ids) rows.push(await api('get', { id }));
      if (active) setTeams(rows);
    })().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [ids, standalone]);
  return (
    <Modal
      wide
      title="Merge into family"
      description="The chosen Main team becomes the root. All other listed teams become variants. Pokémon sets are not combined. Existing families are included in full; team content, history, and shares stay attached to their original teams."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <fieldset disabled={busy} className="merge-choices">
        <legend>Choose exactly one Main team</legend>
        {teams.map((t) => (
          <label key={t.id}>
            <input
              type="radio"
              name="main-team"
              value={t.id}
              checked={main === t.id}
              onChange={() => setMain(t.id)}
            />
            <span>
              <strong>{t.title}</strong> · {t.variant_name || 'Main'} ·{' '}
              {t.format} · {t.team_date || 'Unknown date'} · {t.source_name}
              <small>
                {t.version.parsed_team.map((s) => s.species).join(' / ')} · ID{' '}
                {t.id.slice(0, 8)}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy || !main || teams.length < 2}
          onClick={async () => {
            setBusy(true);
            try {
              await api('family_merge', {
                standalone,
                ids: teams.map((t) => t.id),
                id: main,
              });
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Merge into family
        </button>
      </div>
    </Modal>
  );
}
