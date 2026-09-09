'use client';
// Nature interactions adapted from Showdown battle-team-editor.tsx (AGPLv3).
// Copyright Guangcong Luo; TeamVault React/preservation adapter, 2026-09-08.
import { useState } from 'react';
import type { PokemonSet } from '@/lib/domain';
import {
  actualStat,
  dexFor,
  editEVs,
  generationFor,
  natureForModifiers,
  statIds,
  statNames,
} from '@/lib/builder-data';
import { Slider } from '@/components/ui/slider';
import { stepEV } from '@/lib/showdown-builder';

export function EVEditor({
  set,
  format,
  onPatch,
  autoAttack = false,
}: {
  set: PokemonSet;
  format: string;
  autoAttack?: boolean;
  onPatch: (patch: Partial<PokemonSet>, manualAttackIv?: boolean) => void;
}) {
  const gen = generationFor(format),
    dex = dexFor(format),
    species = dex.species.get(set.species),
    nature = dex.natures.get(set.nature || '');
  const [pendingNature, setPendingNature] = useState({
    source: set.nature,
    plus: nature.plus || '',
    minus: nature.minus || '',
  });
  const modifiers =
    pendingNature.source === set.nature
      ? pendingNature
      : {
          source: set.nature,
          plus: nature.plus || '',
          minus: nature.minus || '',
        };
  function chooseModifier(side: 'plus' | 'minus', value: string) {
    const next = { ...modifiers, [side]: value };
    const opposite = side === 'plus' ? 'minus' : 'plus';
    if (value && next[opposite] === value) next[opposite] = '';
    if ((next.plus && next.minus) || (!next.plus && !next.minus)) {
      next.source = natureForModifiers(next.plus, next.minus);
      onPatch({ nature: next.source });
    }
    setPendingNature(next);
  }
  const stats = statIds.filter((s) => gen !== 1 || s !== 'spd');
  const total = statIds.reduce(
    (n, s) => n + (set.evs?.[s] ?? (gen < 3 ? 252 : 0)),
    0,
  );
  return (
    <section
      className="ev-panel"
      aria-label="Stats and EVs"
      tabIndex={-1}
      data-edit-stats
    >
      <div className="spread-heading">
        <h4>{gen < 3 ? 'Stats & stat experience' : 'Stats & EVs'}</h4>
        <span className={gen >= 3 && total > 510 ? 'warning' : 'muted'}>
          {gen >= 3 ? `${total} / 510 EVs` : 'No total cap'}
        </span>
      </div>
      <div className="ev-table">
        <div className="ev-row ev-labels">
          <span>Stat</span>
          <span>Base</span>
          <span>Spread</span>
          <span>{gen < 3 ? 'EV eq.' : 'EV'}</span>
          <span>Actual</span>
          <span>{gen >= 3 ? 'Nature' : ''}</span>
        </div>
        {stats.map((stat) => (
          <div className="ev-row" key={stat}>
            <strong>
              {gen === 1 && stat === 'spa' ? 'Spc' : statNames[stat]}
            </strong>
            <span>{species.exists ? species.baseStats[stat] : '—'}</span>
            <Slider
              aria-label={`${statNames[stat]} EV slider`}
              min={0}
              max={252}
              step={4}
              value={[set.evs?.[stat] ?? (gen < 3 ? 252 : 0)]}
              onValueChange={(v) =>
                onPatch({
                  evs: editEVs(set, format, stat, Array.isArray(v) ? v[0] : v),
                })
              }
            />
            <div className="ev-number">
              <button
                type="button"
                aria-label={'Decrease ' + statNames[stat] + ' EVs by 4'}
                onClick={() => onPatch({ evs: stepEV(set, format, stat, -1) })}
              >
                −
              </button>
              <input
                aria-label={'EV ' + statNames[stat]}
                type="number"
                min={0}
                max={252}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    onPatch({
                      evs: stepEV(
                        set,
                        format,
                        stat,
                        e.key === 'ArrowUp' ? 1 : -1,
                      ),
                    });
                  }
                }}
                value={set.evs?.[stat] ?? (gen < 3 ? 252 : 0)}
                onChange={(e) =>
                  onPatch({
                    evs: editEVs(set, format, stat, Number(e.target.value)),
                  })
                }
              />
              <button
                type="button"
                aria-label={'Increase ' + statNames[stat] + ' EVs by 4'}
                onClick={() => onPatch({ evs: stepEV(set, format, stat, 1) })}
              >
                +
              </button>
            </div>
            <strong
              className={
                gen >= 3 && nature.plus === stat
                  ? 'stat-plus'
                  : gen >= 3 && nature.minus === stat
                    ? 'stat-minus'
                    : ''
              }
            >
              {actualStat(format, set, stat) ?? '—'}
              {gen >= 3 && nature.plus === stat
                ? '+'
                : gen >= 3 && nature.minus === stat
                  ? '−'
                  : ''}
            </strong>
            {gen >= 3 && stat !== 'hp' && (
              <div className="stat-nature-buttons">
                <button
                  type="button"
                  aria-label={'Boost ' + statNames[stat] + ' with nature'}
                  aria-pressed={modifiers.plus === stat}
                  onClick={() =>
                    chooseModifier('plus', modifiers.plus === stat ? '' : stat)
                  }
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label={'Reduce ' + statNames[stat] + ' with nature'}
                  aria-pressed={modifiers.minus === stat}
                  onClick={() =>
                    chooseModifier(
                      'minus',
                      modifiers.minus === stat ? '' : stat,
                    )
                  }
                >
                  −
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {gen >= 3 && (
        <div className="nature-modifiers">
          <strong>
            {modifiers.plus && modifiers.minus
              ? set.nature
              : !modifiers.plus && !modifiers.minus
                ? set.nature || 'Neutral nature'
                : modifiers.plus
                  ? 'Choose a reduced stat'
                  : 'Choose a boosted stat'}
          </strong>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setPendingNature({ source: 'Serious', plus: '', minus: '' });
              onPatch({ nature: 'Serious' });
            }}
          >
            Neutral
          </button>
        </div>
      )}
      <details className="iv-editor">
        <summary>{gen < 3 ? 'IVs (DV × 2)' : 'IV spread'}</summary>
        {autoAttack && (
          <p className="picker-hint">
            Attack IV is automatically set to 0. Adding a physical move restores
            31; editing Attack IV keeps your choice.
          </p>
        )}
        <div className="stat-inputs">
          {stats.map((stat) => (
            <label key={stat}>
              {statNames[stat]}
              <input
                aria-label={'IV ' + statNames[stat]}
                type="number"
                min={0}
                max={gen < 3 ? 30 : 31}
                step={gen < 3 ? 2 : 1}
                value={set.ivs?.[stat] ?? (gen < 3 ? 30 : 31)}
                onChange={(e) => {
                  let value = Math.max(
                    0,
                    Math.min(31, Math.trunc(Number(e.target.value))),
                  );
                  if (gen < 3) value = Math.floor(value / 2) * 2;
                  const ivs = { ...set.ivs, [stat]: value };
                  if (gen === 1 && stat === 'spa') ivs.spd = value;
                  onPatch({ ivs }, stat === 'atk');
                }}
              />
            </label>
          ))}
        </div>
      </details>
      <p className="picker-hint">
        At level {set.level ?? 100}, before items, abilities or battle boosts.
        {gen < 3 ? ' EV equivalents represent stat experience.' : ''}
      </p>
    </section>
  );
}
