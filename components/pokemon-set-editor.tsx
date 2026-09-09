'use client';
import { useEffect, useRef, useState, type Ref } from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { startBuilderTiming } from '@/lib/builder-performance';
import type { PokemonSet } from '@/lib/domain';
import type { EditorSlot } from '@/lib/visual-team';
import {
  dexFor,
  presentedSet,
  canonicalMoveName,
  learnsetSuggestions,
  generationFor,
  type SelectorKind,
  type SetEditTarget,
} from '@/lib/builder-data';
import { Field, PokemonSprite } from './vault-ui';
import { PokemonSelector } from './pokemon-selector';
import { EVEditor } from './ev-editor';
import {
  adjacentMove,
  requiredItems,
  speciesSelectionPatch,
} from '@/lib/showdown-builder';

export function PokemonSlotBar({
  slots,
  selected,
  onSelect,
  onAdd,
  addButtonRef,
  format,
}: {
  slots: EditorSlot[];
  selected: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  addButtonRef?: Ref<HTMLButtonElement>;
  format: string;
}) {
  return (
    <fieldset
      className="pokemon-slot-bar"
      aria-label="Team Pokémon"
      data-extra-slots={slots.length > 6}
    >
      {Array.from({ length: Math.max(6, slots.length) }, (_, i) => {
        const original = slots[i];
        const slot = original
          ? { ...original, set: presentedSet(format, original.set) }
          : undefined;
        return slot ? (
          <button
            type="button"
            className={'pokemon-slot ' + (i === selected ? 'active' : '')}
            aria-label={
              'Edit Pokémon ' +
              (i + 1) +
              ': ' +
              (slot.set.species || 'New Pokémon')
            }
            aria-pressed={i === selected}
            onClick={() => onSelect(i)}
            key={slot.id}
          >
            {slot.set.species ? (
              <PokemonSprite
                key={slot.set.species}
                species={slot.set.species}
                shiny={slot.set.shiny}
                gender={slot.set.gender}
              />
            ) : (
              <Plus size={25} />
            )}
            <strong title={slot.set.species}>
              {slot.set.name || slot.set.species || 'Empty slot'}
            </strong>
            {slot.set.species && <small>{slot.set.item || 'No item'}</small>}
          </button>
        ) : (
          <button
            type="button"
            key={i}
            className="pokemon-slot empty-slot"
            ref={i === slots.length ? addButtonRef : undefined}
            aria-label={'Add Pokémon in slot ' + (i + 1)}
            onClick={onAdd}
          >
            <Plus size={20} />
            <span>Add Pokémon</span>
          </button>
        );
      })}
      {slots.length >= 6 && slots.length < 24 && (
        <button
          type="button"
          className="extra-slot-add text-link"
          onClick={onAdd}
        >
          Add another Pokémon
        </button>
      )}
    </fieldset>
  );
}

export function PokemonSetEditor({
  slot,
  index,
  count,
  format,
  target,
  onPatch,
  onNote,
  onMove,
  onRemove,
}: {
  slot: EditorSlot;
  index: number;
  count: number;
  format: string;
  target?: SetEditTarget;
  onPatch: (p: Partial<PokemonSet>, manualAttackIv?: boolean) => void;
  onNote: (note: string) => void;
  onMove: (direction: number) => void;
  onRemove: () => void;
}) {
  const stored = slot.set;
  const s = presentedSet(format, stored),
    gen = generationFor(format),
    species = dexFor(format).species.get(s.species);
  const [selection, setSelection] = useState<{
    kind: SelectorKind;
    moveIndex?: number;
    initialQuery?: string;
  } | null>(() =>
    target && target.field !== 'stats'
      ? { kind: target.field, moveIndex: target.moveIndex }
      : !s.species
        ? { kind: 'species' }
        : null,
  );
  useEffect(() => {
    if (s.species) void learnsetSuggestions(format, s.species).catch(() => {});
  }, [format, s.species]);
  const panel = useRef<HTMLElement>(null);
  const skipMoveFocus = useRef(false);
  function focusField(kind: SelectorKind, moveIndex?: number) {
    const label =
      kind === 'moves'
        ? 'Move ' + ((moveIndex ?? 0) + 1)
        : kind === 'species'
          ? 'Edit Pokémon species'
          : 'Edit ' +
            {
              item: 'Item',
              ability: 'Ability',
              nature: 'Nature',
              teraType: 'Tera type',
            }[kind];
    const el = panel.current?.querySelector<HTMLElement>(
      `[aria-label="${label}"]`,
    );
    if (el) {
      skipMoveFocus.current = kind === 'moves';
      el.focus();
    }
  }
  function closeSelector() {
    if (selection) focusField(selection.kind, selection.moveIndex);
    setSelection(null);
  }
  useEffect(() => {
    if (target?.field === 'stats') {
      const stats =
        panel.current?.querySelector<HTMLElement>('[data-edit-stats]');
      stats?.focus();
      stats?.scrollIntoView({ block: 'nearest' });
    }
  }, [target]);
  function field(
    label: string,
    kind: SelectorKind,
    value: string,
    moveIndex?: number,
  ) {
    return (
      <div className="builder-value">
        <span>{label}</span>
        {kind === 'moves' ? (
          <input
            className="move-entry"
            aria-label={label}
            placeholder="Choose move"
            value={value}
            readOnly
            onFocus={() => {
              if (skipMoveFocus.current) {
                skipMoveFocus.current = false;
                return;
              }
              startBuilderTiming('move-results');
              setSelection({ kind, moveIndex });
            }}
            onClick={() => {
              if (kind === 'moves') startBuilderTiming('move-results');
              setSelection({ kind, moveIndex });
            }}
            onKeyDown={(e) => {
              if (
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                (e.key.length === 1 ||
                  e.key === 'Enter' ||
                  e.key === 'ArrowDown')
              ) {
                e.preventDefault();
                startBuilderTiming('move-results');
                setSelection({
                  kind,
                  moveIndex,
                  initialQuery: e.key.length === 1 ? e.key : undefined,
                });
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={'edit-value ' + (!value ? 'unset' : '')}
            aria-label={'Edit ' + label}
            onClick={() => setSelection({ kind, moveIndex })}
          >
            {value || 'Choose ' + label.toLowerCase()}
          </button>
        )}
      </div>
    );
  }
  const selectedValue = selection
    ? selection.kind === 'moves'
      ? s.moves[selection.moveIndex ?? 0] || ''
      : String(s[selection.kind] || '')
    : '';
  return (
    <section
      ref={panel}
      className="pokemon-set-editor"
      aria-label="Selected Pokémon set"
    >
      {s.species && (
        <div className="set-editor-heading">
          <div className="builder-species">
            {s.species && (
              <PokemonSprite
                key={s.species}
                species={s.species}
                shiny={s.shiny}
                gender={s.gender}
              />
            )}
            <div>
              <span className="eyebrow">
                POKÉMON {index + 1} / {count}
              </span>
              <h3>
                <button
                  className="edit-value"
                  type="button"
                  aria-label="Edit Pokémon species"
                  onClick={() => setSelection({ kind: 'species' })}
                >
                  {s.species || 'Choose your Pokémon'}
                </button>
              </h3>
              {species.exists && (
                <span className="type-badges">
                  {species.types.map((t) => (
                    <span className="type-badge" data-pokemon-type={t} key={t}>
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
          <div className="slot-actions">
            <button
              type="button"
              className="button ghost"
              aria-label="Move Pokémon left"
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowLeft size={15} />
            </button>
            <button
              type="button"
              className="button ghost"
              aria-label="Move Pokémon right"
              disabled={index === count - 1}
              onClick={() => onMove(1)}
            >
              <ArrowRight size={15} />
            </button>
            <button type="button" className="button danger" onClick={onRemove}>
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </div>
      )}
      {selection && (
        <PokemonSelector
          key={selection.kind + ':' + selection.moveIndex}
          kind={selection.kind}
          format={format}
          species={s.species}
          value={selectedValue}
          initialQuery={selection.initialQuery}
          onClose={closeSelector}
          onSelect={(value, direction = 0) => {
            if (selection.kind === 'moves') {
              const moves = [...stored.moves];
              moves[selection.moveIndex ?? 0] = canonicalMoveName(
                format,
                stored,
                value,
              );
              onPatch({ moves });
              const next = direction
                ? adjacentMove(
                    selection.moveIndex ?? 0,
                    Math.max(4, moves.length),
                    direction,
                  )
                : null;
              if (next !== null) {
                startBuilderTiming('move-results');
                setSelection({ kind: 'moves', moveIndex: next });
                return;
              }
              if (direction > 0)
                panel.current
                  ?.querySelector<HTMLElement>('[aria-label="EV HP"]')
                  ?.focus();
              else if (direction < 0)
                focusField(
                  gen >= 9
                    ? 'teraType'
                    : gen >= 3
                      ? 'nature'
                      : gen === 2
                        ? 'item'
                        : 'species',
                );
              else focusField('moves', selection.moveIndex);
              setSelection(null);
            } else {
              onPatch(
                selection.kind === 'species'
                  ? speciesSelectionPatch(format, stored, value, {
                      authored: !!slot.editing?.authored,
                      teraManaged: slot.editing?.tera === 'auto',
                    })
                  : { [selection.kind]: value },
              );
              closeSelector();
            }
          }}
        />
      )}
      {s.species !== stored.species && (
        <p className="picker-hint">
          Battle form preview: {s.species}. Stored and exported as{' '}
          {stored.species}
          {stored.item ? ' holding ' + stored.item : ''}.{' '}
          {s.moves.some((m, i) => m !== stored.moves[i])
            ? 'Iron Head becomes the displayed Behemoth move in battle.'
            : ''}
        </p>
      )}
      <div className="builder-columns">
        <div className="builder-set-values">
          {gen >= 2 && field('Item', 'item', s.item || '')}
          {gen >= 2 && requiredItems(format, s.species).length > 1 && (
            <div className="possible-abilities">
              <small>Required item choices</small>
              {requiredItems(format, s.species).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => onPatch({ item })}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          {gen >= 3 && (
            <>
              {field('Ability', 'ability', s.ability || '')}
              {species.exists && (
                <div className="possible-abilities">
                  <small>Possible abilities</small>
                  {[
                    ...new Set(
                      Object.values(
                        dexFor(format).species.get(stored.species).abilities,
                      ),
                    ),
                  ].map((a) => (
                    <button
                      type="button"
                      key={a}
                      title={dexFor(format).abilities.get(a).shortDesc}
                      onClick={() => onPatch({ ability: a })}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}
              {field('Nature', 'nature', s.nature || '')}
            </>
          )}
          {gen >= 9 && field('Tera type', 'teraType', s.teraType || '')}
          {gen >= 9 && species.requiredTeraType && (
            <p className="picker-hint">
              {species.name} requires {species.requiredTeraType} Tera. Existing
              values are preserved until you change them.
            </p>
          )}
          <div className="move-fields">
            <h4>Moves</h4>
            {Array.from({ length: Math.max(4, s.moves.length) }, (_, i) => (
              <div key={i}>
                {field('Move ' + (i + 1), 'moves', s.moves[i] || '', i)}
              </div>
            ))}
          </div>
        </div>
        <div>
          <EVEditor
            set={s}
            format={format}
            onPatch={onPatch}
            autoAttack={slot.editing?.attack_iv === 'auto'}
          />
          <details className="extra-set-fields">
            <summary>Level, nickname & other details</summary>
            <div className="set-fields">
              <Field label="Level">
                <input
                  aria-label="Level"
                  type="number"
                  min={1}
                  max={100}
                  value={s.level ?? 100}
                  onChange={(e) =>
                    onPatch({
                      level: Math.max(
                        1,
                        Math.min(100, Number(e.target.value) || 100),
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Nickname">
                <input
                  aria-label="Nickname"
                  value={s.name === s.species ? '' : s.name || ''}
                  onChange={(e) => onPatch({ name: e.target.value })}
                />
              </Field>
              {gen >= 2 && (
                <>
                  <Field label="Gender">
                    <select
                      aria-label="Gender"
                      value={s.gender || ''}
                      onChange={(e) => onPatch({ gender: e.target.value })}
                    >
                      <option value="">Unspecified</option>
                      <option>M</option>
                      <option>F</option>
                    </select>
                  </Field>
                  <Field label="Happiness">
                    <input
                      aria-label="Happiness"
                      type="number"
                      min={0}
                      max={255}
                      value={s.happiness ?? ''}
                      placeholder="255"
                      onChange={(e) =>
                        onPatch({
                          happiness: e.target.value
                            ? Math.max(0, Math.min(255, Number(e.target.value)))
                            : undefined,
                        })
                      }
                    />
                  </Field>
                  <label className="set-shiny">
                    <input
                      type="checkbox"
                      checked={!!s.shiny}
                      onChange={(e) => onPatch({ shiny: e.target.checked })}
                    />{' '}
                    Shiny
                  </label>
                </>
              )}
            </div>
            <p className="picker-hint">
              Additional imported fields stay in Showdown Text.
            </p>
          </details>
        </div>
      </div>
      <details className="set-note-editor">
        <summary>{slot.note ? 'Set note · has note' : 'Add set note'}</summary>
        <Field label="Set note">
          <textarea
            aria-label="Set note"
            rows={3}
            value={slot.note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Benchmarks, matchups, and how to use this Pokémon…"
          />
        </Field>
      </details>
    </section>
  );
}
