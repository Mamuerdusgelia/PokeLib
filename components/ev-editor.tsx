'use client';
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

export function EVEditor({
  set,
  format,
  onPatch,
}: {
  set: PokemonSet;
  format: string;
  onPatch: (patch: Partial<PokemonSet>) => void;
}) {
  const gen = generationFor(format),
    dex = dexFor(format),
    species = dex.species.get(set.species),
    nature = dex.natures.get(set.nature || '');
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
            <input
              aria-label={'EV ' + statNames[stat]}
              type="number"
              min={0}
              max={252}
              value={set.evs?.[stat] ?? (gen < 3 ? 252 : 0)}
              onChange={(e) =>
                onPatch({
                  evs: editEVs(set, format, stat, Number(e.target.value)),
                })
              }
            />
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
          </div>
        ))}
      </div>
      {gen >= 3 && (
        <div className="nature-modifiers">
          <span>Nature</span>
          <select
            aria-label="Nature boosted stat"
            value={nature.plus || ''}
            onChange={(e) => {
              const plus = e.target.value;
              const minus =
                nature.minus && nature.minus !== plus
                  ? nature.minus
                  : statIds.find((s) => s !== 'hp' && s !== plus)!;
              onPatch({ nature: natureForModifiers(plus, minus) });
            }}
          >
            <option value="">Neutral</option>
            {statIds
              .filter((s) => s !== 'hp')
              .map((s) => (
                <option value={s} key={s}>
                  + {statNames[s]}
                </option>
              ))}
          </select>
          <select
            aria-label="Nature reduced stat"
            value={nature.minus || ''}
            onChange={(e) => {
              const minus = e.target.value;
              const plus =
                nature.plus && nature.plus !== minus
                  ? nature.plus
                  : statIds.find((s) => s !== 'hp' && s !== minus)!;
              onPatch({ nature: natureForModifiers(plus, minus) });
            }}
          >
            <option value="">Neutral</option>
            {statIds
              .filter((s) => s !== 'hp')
              .map((s) => (
                <option value={s} key={s}>
                  − {statNames[s]}
                </option>
              ))}
          </select>
        </div>
      )}
      <details className="iv-editor">
        <summary>{gen < 3 ? 'IVs (DV × 2)' : 'IV spread'}</summary>
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
                  onPatch({ ivs });
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
