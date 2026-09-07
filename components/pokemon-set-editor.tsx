'use client';
import { useId, useMemo } from 'react';
import { Dex } from '@pkmn/dex';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { PokemonSet } from '@/lib/domain';
import type { EditorSlot } from '@/lib/visual-team';
import { Field, PokemonSprite } from './vault-ui';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox';
const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const statNames = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
export function DexField({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: string[];
  onChange: (value: string) => void;
}) {
  const candidates = useMemo(
    () =>
      choices
        .filter((s) => s.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 45),
    [choices, value],
  );
  return (
    <Field label={label}>
      <Combobox
        items={candidates}
        filter={null}
        value={value || null}
        inputValue={value}
        onInputValueChange={onChange}
        onValueChange={(v) => v && onChange(v)}
      >
        <ComboboxInput
          aria-label={label}
          showTrigger={false}
          placeholder={'Choose ' + label.toLowerCase()}
        />
        <ComboboxContent>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
          {!candidates.length && (
            <p className="picker-hint">
              Custom values are kept. No legality check.
            </p>
          )}
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}
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
  onPatch,
  onNote,
  onMove,
  onRemove,
}: {
  slot: EditorSlot;
  index: number;
  count: number;
  format: string;
  onPatch: (p: Partial<PokemonSet>) => void;
  onNote: (note: string) => void;
  onMove: (direction: number) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const species = Dex.species.get(slot.set.species);
  const catalogs = useMemo(
    () => ({
      species: Dex.species.all().map((s) => s.name),
      items: Dex.items.all().map((s) => s.name),
      abilities: Dex.abilities.all().map((s) => s.name),
      moves: Dex.moves.all().map((s) => s.name),
      natures: Dex.natures.all().map((s) => s.name),
      types: Dex.types.all().map((s) => s.name),
    }),
    [],
  );
  const s = slot.set,
    gen = Number(format.match(/gen(\d+)/i)?.[1] || 9);
  const evTotal = Object.values(s.evs || {}).reduce((a, b) => a + b, 0);
  return (
    <section className="pokemon-set-editor" aria-label="Selected Pokémon set">
      <div className="set-editor-heading">
        <div>
          <span className="eyebrow">
            POKÉMON {index + 1} / {count}
          </span>
          <h3>{s.species || 'Choose your Pokémon'}</h3>
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
            <Trash2 size={14} /> Remove Pokémon
          </button>
        </div>
      </div>
      <div className="set-fields">
        <DexField
          label="Pokémon species"
          value={s.species}
          choices={catalogs.species}
          onChange={(v) => onPatch({ species: v })}
        />
        <Field label="Nickname">
          <input
            aria-label="Nickname"
            value={s.name === s.species ? '' : s.name || ''}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        </Field>
        <DexField
          label="Item"
          value={s.item || ''}
          choices={catalogs.items}
          onChange={(v) => onPatch({ item: v })}
        />
        <DexField
          label="Ability"
          value={s.ability || ''}
          choices={[
            ...new Set([
              ...Object.values(species.abilities || {}),
              ...catalogs.abilities,
            ]),
          ]}
          onChange={(v) => onPatch({ ability: v })}
        />
        {(gen >= 9 || !!s.teraType) && (
          <DexField
            label="Tera Type"
            value={s.teraType || ''}
            choices={catalogs.types}
            onChange={(v) => onPatch({ teraType: v })}
          />
        )}
        <Field label="Level">
          <input
            aria-label="Level"
            type="number"
            min={1}
            max={100}
            value={s.level ?? ''}
            placeholder="100"
            onChange={(e) =>
              onPatch({
                level: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </Field>
        <DexField
          label="Nature"
          value={s.nature || ''}
          choices={catalogs.natures}
          onChange={(v) => onPatch({ nature: v })}
        />
      </div>
      <div className="set-lower">
        <div>
          <div className="spread-heading">
            <h4>EV spread</h4>
            <span className={evTotal > 510 ? 'warning' : 'muted'}>
              {evTotal} / 510
            </span>
          </div>
          <div className="stat-inputs">
            {stats.map((stat, i) => (
              <label key={stat} htmlFor={id + 'ev' + stat}>
                {statNames[i]}
                <input
                  id={id + 'ev' + stat}
                  aria-label={'EV ' + statNames[i]}
                  type="number"
                  min={0}
                  max={252}
                  step={4}
                  placeholder="0"
                  value={s.evs?.[stat] ?? ''}
                  onChange={(e) => {
                    const values = { ...s.evs };
                    if (e.target.value === '') delete values[stat];
                    else values[stat] = Number(e.target.value);
                    onPatch({ evs: values });
                  }}
                />
              </label>
            ))}
          </div>
          <details className="iv-editor">
            <summary>
              IV spread <span className="muted">· 31 unless specified</span>
            </summary>
            <div className="stat-inputs">
              {stats.map((stat, i) => (
                <label key={stat}>
                  {statNames[i]}
                  <input
                    aria-label={'IV ' + statNames[i]}
                    type="number"
                    min={0}
                    max={31}
                    placeholder="31"
                    value={s.ivs?.[stat] ?? ''}
                    onChange={(e) => {
                      const values = { ...s.ivs };
                      if (e.target.value === '') delete values[stat];
                      else values[stat] = Number(e.target.value);
                      onPatch({ ivs: values });
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
          <details className="extra-set-fields">
            <summary>Gender, shiny & other details</summary>
            <div className="set-fields">
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
                  placeholder="255"
                  value={s.happiness ?? ''}
                  onChange={(e) =>
                    onPatch({
                      happiness: e.target.value
                        ? Number(e.target.value)
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
            </div>
            <p className="muted">
              Additional imported fields stay in Showdown Text.
            </p>
          </details>
        </div>
        <div className="move-fields">
          <h4>Moves</h4>
          {Array.from({ length: Math.max(4, s.moves.length) }, (_, i) => (
            <DexField
              key={i}
              label={'Move ' + (i + 1)}
              value={s.moves[i] || ''}
              choices={catalogs.moves}
              onChange={(v) => {
                const moves = [...s.moves];
                moves[i] = v;
                onPatch({ moves });
              }}
            />
          ))}
        </div>
      </div>
      <Field label="Set note">
        <textarea
          aria-label="Set note"
          rows={3}
          value={slot.note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Benchmarks, matchups, and how to use this Pokémon…"
        />
      </Field>
    </section>
  );
}
