'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { PokemonSet } from '@/lib/domain';
import type { EditorSlot } from '@/lib/visual-team';
import {
  dexFor,
  generationFor,
  type SelectorKind,
  type SetEditTarget,
} from '@/lib/builder-data';
import { Field, PokemonSprite } from './vault-ui';
import { PokemonSelector } from './pokemon-selector';
import { EVEditor } from './ev-editor';

export function PokemonSlotBar({
  slots,
  selected,
  onSelect,
  onAdd,
}: {
  slots: EditorSlot[];
  selected: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
}) {
  return (
    <fieldset className="pokemon-slot-bar" aria-label="Team Pokémon">
      {Array.from({ length: Math.max(6, slots.length) }, (_, i) => {
        const slot = slots[i];
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
              />
            ) : (
              <Plus size={25} />
            )}
            <strong title={slot.set.species}>
              {slot.set.name || slot.set.species || 'Choose Pokémon'}
            </strong>
            <small>{slot.set.item || 'No item'}</small>
          </button>
        ) : (
          <button
            type="button"
            key={i}
            className="pokemon-slot empty-slot"
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
  onPatch: (p: Partial<PokemonSet>) => void;
  onNote: (note: string) => void;
  onMove: (direction: number) => void;
  onRemove: () => void;
}) {
  const s = slot.set,
    gen = generationFor(format),
    species = dexFor(format).species.get(s.species);
  const [selection, setSelection] = useState<{
    kind: SelectorKind;
    moveIndex?: number;
  } | null>(() =>
    target && target.field !== 'stats'
      ? { kind: target.field, moveIndex: target.moveIndex }
      : !s.species
        ? { kind: 'species' }
        : null,
  );
  const panel = useRef<HTMLElement>(null);
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
        <button
          type="button"
          className={'edit-value ' + (!value ? 'unset' : '')}
          aria-label={'Edit ' + label}
          onClick={() => setSelection({ kind, moveIndex })}
        >
          {value || 'Choose ' + label.toLowerCase()}
        </button>
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
      <div className="set-editor-heading">
        <div className="builder-species">
          {s.species && <PokemonSprite key={s.species} species={s.species} />}
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
                  <span className="type-badge" key={t}>
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
      {selection && (
        <PokemonSelector
          key={selection.kind + ':' + selection.moveIndex}
          kind={selection.kind}
          format={format}
          species={s.species}
          value={selectedValue}
          onClose={() => setSelection(null)}
          onSelect={(value) => {
            if (selection.kind === 'moves') {
              const moves = [...s.moves];
              moves[selection.moveIndex ?? 0] = value;
              onPatch({ moves });
            } else onPatch({ [selection.kind]: value });
            setSelection(null);
          }}
        />
      )}
      <div className="builder-columns">
        <div className="builder-set-values">
          {gen >= 2 && field('Item', 'item', s.item || '')}
          {gen >= 3 && (
            <>
              {field('Ability', 'ability', s.ability || '')}
              {species.exists && (
                <div className="possible-abilities">
                  <small>Possible abilities</small>
                  {[...new Set(Object.values(species.abilities))].map((a) => (
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
          <EVEditor set={s} format={format} onPatch={onPatch} />
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
