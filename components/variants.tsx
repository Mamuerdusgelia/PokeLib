'use client';
import { useEffect, useRef, useState } from 'react';
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
  onOpen,
}: {
  team: TeamRecord;
  query?: string;
  year?: string;
  favourite?: boolean;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(0),
    [rows, setRows] = useState<TeamRecord[]>([]),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(false),
    [loadedKey, setLoadedKey] = useState(''),
    [error, setError] = useState('');
  const requestKey = JSON.stringify([
    familyKey(team),
    team.updated_at,
    query,
    year,
    favourite,
    page,
  ]);
  useEffect(() => {
    if (!open) return;
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
  }, [open, page, team, query, year, favourite, requestKey]);
  const count = team.variant_count || 1,
    matching = team.matching_variant_count || 1;
  if (count < 2) return null;
  return (
    <div className="family-variants">
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
        {open ? '▾' : '▸'} {count} {count === 1 ? 'variant' : 'variants'}
        {matching < count && (query || year || favourite)
          ? ' · ' + matching + ' matching'
          : ''}
      </button>
      {open && (
        <div className="variant-rows">
          {busy || loadedKey !== requestKey ? (
            <output>Loading variants…</output>
          ) : (
            rows.map((t) => (
              <button
                type="button"
                className="variant-row"
                key={t.id}
                onClick={() => onOpen(t.id)}
              >
                <strong>↳ {t.variant_name || 'Main'}</strong>
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
  onDeleteFamily,
}: {
  team: TeamRecord;
  onSaved: (t: TeamRecord) => void;
  onOpen: (id: string) => void;
  onDeleteFamily: () => void;
}) {
  const [mode, setMode] = useState<'create' | 'rename' | 'delete' | null>(null),
    [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const cancel = useRef<HTMLButtonElement>(null),
    operation = useRef('');
  useEffect(() => {
    if (busy && mode === 'create') feedbackSaveTrace();
  }, [busy, mode]);
  function begin(next: 'create' | 'rename' | 'delete', duplicate = false) {
    setName(
      next === 'rename'
        ? team.variant_name || 'Main'
        : duplicate
          ? (team.variant_name || 'Main') + ' copy'
          : '',
    );
    setDescription(next === 'delete' ? '' : team.variant_description || '');
    setError('');
    setMode(next);
    operation.current = crypto.randomUUID();
  }
  async function submit() {
    if (busy) return;
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
      setBusy(false);
    }
  }
  return (
    <section className="variant-actions" aria-label="Variant">
      <div>
        <strong>Variant: {team.variant_name || 'Main'}</strong>
        {team.variant_description && <p>{team.variant_description}</p>}
      </div>
      <FamilyVariants team={team} onOpen={onOpen} />
      <div className="variant-toolbar">
        <button className="button" onClick={() => begin('create')}>
          Create variant
        </button>
        <button className="button" onClick={() => begin('create', true)}>
          Duplicate variant
        </button>
        <button className="button" onClick={() => begin('rename')}>
          Rename variant
        </button>
        <button
          className="button danger"
          disabled={(team.variant_count || 1) < 2}
          onClick={() => begin('delete')}
        >
          Delete variant
        </button>
        <button className="text-link danger" onClick={onDeleteFamily}>
          Delete team family
        </button>
      </div>
      {mode && (
        <Modal
          title={
            mode === 'delete'
              ? 'Delete variant “' + (team.variant_name || 'Main') + '”?'
              : mode === 'rename'
                ? 'Rename variant'
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
                  : mode === 'rename'
                    ? 'Save variant name'
                    : 'Create variant'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
