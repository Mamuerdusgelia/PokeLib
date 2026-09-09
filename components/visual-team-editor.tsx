'use client';
import { useRef, useState } from 'react';
import { Plus, Save, ChevronDown } from 'lucide-react';
import { api } from '@/lib/client';
import {
  cleanMeta,
  type Draft,
  type TeamRecord,
  type PokemonSet,
} from '@/lib/domain';
import { parseShowdown } from '@/lib/showdown';
import { builderDraft, type SetEditTarget } from '@/lib/builder-data';
import { generatedTeamTitle } from '@/lib/showdown-builder';
import {
  newSlot,
  readVisualTeam,
  patchVisualSlot,
  writeVisualTeam,
  moveSlot,
  type EditorSlot,
  type OrphanNote,
} from '@/lib/visual-team';
import { Modal, Field, TagEditor } from './vault-ui';
import { MetaFields } from './team-metadata-panel';
import { PokemonSlotBar, PokemonSetEditor } from './pokemon-set-editor';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

export function TeamEditor({
  mode,
  team,
  tags,
  initialFormat,
  editTarget,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'version' | 'metadata';
  team?: TeamRecord;
  tags: string[];
  initialFormat?: string;
  editTarget?: SetEditTarget;
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
      : { ...builderDraft(initialFormat), title: generatedTeamTitle() },
  );
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [initial] = useState(() => {
    try {
      return {
        ...readVisualTeam(
          draft.showdown_text,
          draft.format,
          [],
          draft.set_notes,
        ),
        error: '',
      };
    } catch (e) {
      return {
        slots: [] as EditorSlot[],
        orphans: [] as OrphanNote[],
        error: (e as Error).message,
      };
    }
  });
  const [slots, setSlots] = useState(initial.slots),
    [active, setActive] = useState(editTarget?.slot ?? 0);
  const [editorMode, setEditorMode] = useState(
    initial.error ? 'text' : 'visual',
  );
  const [orphans, setOrphans] = useState<OrphanNote[]>([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [rawWarning, setRawWarning] = useState(initial.error);
  function updateSlots(next: EditorSlot[]) {
    setSlots(next);
    setDraft((d) => ({
      ...d,
      showdown_text: writeVisualTeam(next),
      set_notes: next.map((s) => s.note),
    }));
  }
  function reconcile() {
    const next = readVisualTeam(
      draft.showdown_text,
      draft.format,
      slots,
      slots.length ? [] : draft.set_notes,
    );
    setSlots(next.slots);
    setDraft((d) => ({ ...d, set_notes: next.slots.map((s) => s.note) }));
    setOrphans((old) => [
      ...old,
      ...next.orphans.filter((n) => !old.some((o) => o.id === n.id)),
    ]);
    setActive((a) => Math.min(a, Math.max(0, next.slots.length - 1)));
    setRawWarning('');
    return next;
  }
  function switchMode(value: string) {
    setError('');
    if (value === 'visual') {
      try {
        reconcile();
      } catch (e) {
        setRawWarning((e as Error).message);
        return;
      }
    }
    setEditorMode(value);
  }
  function patch(p: Partial<PokemonSet>) {
    updateSlots(
      slots.map((s, i) => (i === active ? patchVisualSlot(s, p) : s)),
    );
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      cleanMeta(draft);
      let finalDraft = draft;
      if (mode !== 'metadata') {
        parseShowdown(draft.showdown_text, draft.format);
        if (orphans.length)
          throw Error('Assign or discard the unassigned notes before saving.');
        if (editorMode === 'text') {
          try {
            const next = reconcile();
            if (next.orphans.length) {
              setEditorMode('visual');
              throw Error('Some notes need your review before saving.');
            }
            finalDraft = { ...draft, set_notes: next.slots.map((s) => s.note) };
          } catch (e) {
            if (slots.some((s) => s.note) || draft.set_notes.some(Boolean))
              throw e;
            // Unusual supported input can still be saved directly through the maintained parser.
          }
        } else if (slots.some((s) => !s.set.species.trim()))
          throw Error(
            'Choose a species for each added Pokémon, or remove its empty slot.',
          );
      }
      if (mode === 'metadata') {
        await api('patch', { id: team!.id, patch: finalDraft });
        onSaved(team!.id);
      } else if (mode === 'version') {
        await api('version', {
          id: team!.id,
          draft: finalDraft,
          expected: team!.current_version_id,
          parent: team!.version.id,
        });
        onSaved(team!.id);
      } else {
        const result = await api('import', { drafts: [finalDraft] });
        onSaved(result.ids[0]);
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
      initialFocus={mode === 'new' ? addButtonRef : undefined}
      title={
        mode === 'new'
          ? 'Build a team'
          : mode === 'version'
            ? 'Edit team · new version'
            : 'Team details'
      }
      description={
        mode === 'metadata'
          ? 'Organise this team across all its versions.'
          : mode === 'new'
            ? 'Unsaved team · add your first Pokémon.'
            : team?.version.id !== team?.current_version_id
              ? 'Restore this historical snapshot as a new version. Newer history stays intact.'
              : 'Changes save as a new version.'
      }
      onClose={onClose}
    >
      {mode === 'metadata' ? (
        <MetaFields draft={draft} setDraft={setDraft} tags={tags} />
      ) : (
        <div className="visual-team-workspace">
          <div className="editor-team-header">
            <div className="editor-format">
              <Field label="Format">
                <input
                  aria-label="Team format"
                  value={draft.format}
                  placeholder="Choose a format"
                  onChange={(e) =>
                    setDraft({ ...draft, format: e.target.value })
                  }
                />
              </Field>
            </div>
            {renaming ? (
              <Field label="Team name">
                <input
                  aria-label="Team name"
                  ref={(element) => element?.focus()}
                  value={draft.title}
                  maxLength={160}
                  placeholder="Untitled team"
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  onBlur={() => setRenaming(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setRenaming(false);
                    }
                  }}
                />
              </Field>
            ) : (
              <h3 className="builder-team-title">
                <button
                  type="button"
                  className="edit-value"
                  onClick={() => setRenaming(true)}
                  aria-label="Rename team"
                >
                  {draft.title}
                </button>
              </h3>
            )}
          </div>
          <div className="editor-tag-row">
            <span>Tags</span>
            <TagEditor
              tags={draft.tags}
              suggestions={tags}
              onChange={(v) => setDraft({ ...draft, tags: v })}
            />
          </div>
          <Tabs value={editorMode} onValueChange={(v) => switchMode(String(v))}>
            <TabsList className="editor-mode-tabs">
              <TabsTrigger value="visual">Visual Editor</TabsTrigger>
              <TabsTrigger value="text">Showdown Text</TabsTrigger>
            </TabsList>
          </Tabs>
          {editorMode === 'visual' ? (
            <>
              <PokemonSlotBar
                slots={slots}
                addButtonRef={addButtonRef}
                selected={active}
                onSelect={setActive}
                onAdd={() => {
                  if (slots.length < 24) {
                    updateSlots([...slots, newSlot()]);
                    setActive(slots.length);
                  }
                }}
              />
              {slots[active] ? (
                <PokemonSetEditor
                  key={slots[active].id}
                  slot={slots[active]}
                  index={active}
                  count={slots.length}
                  format={draft.format}
                  target={editTarget?.slot === active ? editTarget : undefined}
                  onPatch={patch}
                  onNote={(note) => {
                    const next = slots.map((s, i) =>
                      i === active ? { ...s, note } : s,
                    );
                    setSlots(next);
                    setDraft({ ...draft, set_notes: next.map((s) => s.note) });
                  }}
                  onMove={(direction) => {
                    updateSlots(moveSlot(slots, active, direction));
                    setActive(active + direction);
                  }}
                  onRemove={() => setRemoveIndex(active)}
                />
              ) : (
                <div className="visual-empty">
                  <Plus size={28} />
                  <h3>Add your first Pokémon</h3>
                  <p>
                    Choose an empty slot above, or paste a team in Showdown
                    Text.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="raw-team-mode">
              <Field label="Pokémon Showdown text">
                <textarea
                  aria-label="Pokémon Showdown text"
                  className="code-editor"
                  rows={15}
                  spellCheck={false}
                  value={draft.showdown_text}
                  onChange={(e) =>
                    setDraft({ ...draft, showdown_text: e.target.value })
                  }
                  placeholder="Paste a Pokémon Showdown team…"
                />
              </Field>
              <p className="muted">
                All imported fields are retained. Switch to Visual Editor to
                apply text changes to the set controls.
              </p>
              {rawWarning && <output className="warning">{rawWarning}</output>}
            </div>
          )}
          {orphans.length > 0 && (
            <section className="orphan-notes">
              <h3>Notes to reassign</h3>
              <p>
                The text changed which Pokémon these notes belonged to. Choose a
                slot above to attach each note, or discard it explicitly.
              </p>
              {orphans.map((n) => (
                <div key={n.id}>
                  <strong>{n.label}</strong>
                  <p>{n.note}</p>
                  <button
                    className="button"
                    type="button"
                    disabled={!slots[active]}
                    onClick={() => {
                      const next = slots.map((s, i) =>
                        i === active
                          ? {
                              ...s,
                              note: [s.note, n.note]
                                .filter(Boolean)
                                .join('\n\n'),
                            }
                          : s,
                      );
                      setSlots(next);
                      setDraft({
                        ...draft,
                        set_notes: next.map((s) => s.note),
                      });
                      setOrphans(orphans.filter((o) => o.id !== n.id));
                    }}
                  >
                    Attach to selected Pokémon
                  </button>
                  <button
                    type="button"
                    className="button danger"
                    onClick={() =>
                      setOrphans(orphans.filter((o) => o.id !== n.id))
                    }
                  >
                    Discard note
                  </button>
                </div>
              ))}
            </section>
          )}
          <details className="team-metadata-panel">
            <summary>
              <ChevronDown size={16} /> Team Date & provenance{' '}
              <span>
                {draft.team_date || 'Unknown date'}
                {draft.source_name ? ' · ' + draft.source_name : ''}
              </span>
            </summary>
            <MetaFields draft={draft} setDraft={setDraft} tags={tags} compact />
          </details>
          <details className="team-metadata-panel" open={!!draft.team_notes}>
            <summary>
              <ChevronDown size={16} /> Team Notes
            </summary>
            <Field label="Team notes">
              <textarea
                aria-label="Team notes"
                rows={3}
                value={draft.team_notes}
                onChange={(e) =>
                  setDraft({ ...draft, team_notes: e.target.value })
                }
                placeholder="Matchups, game plans, and things to remember…"
              />
            </Field>
          </details>
          <Field label="Version comment">
            <input
              aria-label="Version comment"
              value={draft.version_comment}
              onChange={(e) =>
                setDraft({ ...draft, version_comment: e.target.value })
              }
              placeholder="What changed in this version?"
            />
          </Field>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions editor-save">
        <button className="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={
            busy || (mode !== 'metadata' && !draft.showdown_text.trim())
          }
          onClick={() => void save()}
        >
          <Save size={15} />
          {busy
            ? 'Saving…'
            : mode === 'new'
              ? 'Create team'
              : mode === 'metadata'
                ? 'Save details'
                : 'Save new version'}
        </button>
      </div>
      <AlertDialog
        open={removeIndex !== null}
        onOpenChange={(o) => !o && setRemoveIndex(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            Remove{' '}
            {removeIndex !== null
              ? slots[removeIndex]?.set.species || 'this Pokémon'
              : 'Pokémon'}
            ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This removes the Pokémon and its set note from this draft.
            Previously saved versions stay intact.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                updateSlots(slots.filter((_, i) => i !== removeIndex));
                setActive(Math.max(0, Math.min(active, slots.length - 2)));
                setRemoveIndex(null);
              }}
            >
              Remove Pokémon
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Modal>
  );
}
