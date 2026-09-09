import { Dex, toID, type Species } from '@pkmn/dex';
import { emptyDraft, generationFor, type PokemonSet } from './domain';
export { generationFor } from './domain';

export const statIds = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatId = (typeof statIds)[number];
export const statNames: Record<StatId, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};
export type SetEditTarget = {
  slot: number;
  field:
    | 'species'
    | 'item'
    | 'ability'
    | 'nature'
    | 'teraType'
    | 'moves'
    | 'stats';
  moveIndex?: number;
};
export type SelectorKind = Exclude<SetEditTarget['field'], 'stats'>;
export const builderDraft = (format = '') => ({
  ...emptyDraft(),
  title: 'Untitled team',
  format: format || 'unknown',
});
export const dexFor = (format: string) => Dex.forGen(generationFor(format));
export function matchesSpeciesQuery(
  format: string,
  species: Species,
  query: string,
) {
  const abilities = Object.values(species.abilities);
  // A complete ability name remains searchable even when it contains a type.
  if (query.trim() && abilities.some((a) => toID(a) === toID(query)))
    return true;
  const haystack = [species.name, ...species.types, ...abilities]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) =>
      dexFor(format).types.get(token).exists
        ? species.types.some((t) => t.toLowerCase() === token)
        : haystack.includes(token),
    );
}
export function availableIn(
  format: string,
  entry: { exists: boolean; gen?: number; isNonstandard?: string | null },
) {
  return (
    entry.exists &&
    (entry.gen || 0) <= generationFor(format) &&
    (!entry.isNonstandard ||
      (/nationaldex|natdex/i.test(format) && entry.isNonstandard === 'Past'))
  );
}
export function builderCatalog(format: string) {
  const dex = dexFor(format),
    available = (e: Parameters<typeof availableIn>[1]) =>
      availableIn(format, e);
  // @pkmn/dex resolves typed Hidden Power names, but all() exposes only the
  // base entry and get() retains its base ID. Give selectable variants unique IDs.
  const hiddenPowerVariants = dex.types
    .all()
    .filter((t) => !['Normal', 'Fairy', 'Stellar'].includes(t.name))
    .map((t) => ({
      // Picker rows intentionally copy enumerable data; no Move methods are used.
      // oxlint-disable-next-line typescript/no-misused-spread
      ...dex.moves.get('Hidden Power ' + t.name),
      id: toID('Hidden Power ' + t.name),
    }));
  return {
    species: dex.species.all().filter((s) => available(s) && !s.battleOnly),
    item: dex.items.all().filter(available),
    ability: dex.abilities.all().filter(available),
    moves: [...dex.moves.all(), ...hiddenPowerVariants].filter(
      (m) => available(m) && !m.isZ && !m.isMax && m.id !== 'struggle',
    ),
    nature: dex.natures.all().filter(available),
    teraType: dex.types.all().filter(available),
  };
}

export function learnsetSuggestions(
  format: string,
  name: string,
): Promise<Set<string>> {
  return import('./showdown-learnsets').then((m) =>
    m.learnableMoves(format, name),
  );
}

export function actualStat(format: string, set: PokemonSet, stat: StatId) {
  const gen = generationFor(format),
    dex = dexFor(format),
    species = dex.species.get(set.species);
  if (!species.exists) return null;
  let iv = set.ivs?.[stat] ?? 31;
  if (gen < 3) iv = Math.floor(iv / 2) * 2;
  const ev = set.evs?.[stat] ?? (gen < 3 ? 252 : 0),
    level = set.level ?? 100;
  const base = species.baseStats[stat];
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  if (stat === 'hp') return base === 1 ? 1 : core + level + 10;
  const nature = gen >= 3 ? dex.natures.get(set.nature || '') : null;
  return Math.floor(
    ((core + 5) *
      (nature?.plus === stat ? 110 : nature?.minus === stat ? 90 : 100)) /
      100,
  );
}
export function editEVs(
  set: PokemonSet,
  format: string,
  stat: StatId,
  value: number,
) {
  const gen = generationFor(format),
    evs = { ...set.evs };
  const others = statIds
    .filter((s) => s !== stat)
    .reduce((n, s) => n + (evs[s] ?? 0), 0);
  evs[stat] = Math.max(
    0,
    Math.min(
      gen < 3 ? 252 : Math.min(252, Math.max(0, 510 - others)),
      Math.trunc(value) || 0,
    ),
  );
  if (gen === 1 && stat === 'spa') evs.spd = evs.spa;
  // Older generations default unspecified EVs to maximum stat experience.
  if (gen < 3) for (const id of statIds) evs[id] ??= 252;
  return evs;
}
export function natureForModifiers(plus: string, minus: string) {
  if (!plus || !minus || plus === minus) return 'Serious';
  return (
    Dex.natures.all().find((n) => n.plus === plus && n.minus === minus)?.name ||
    'Serious'
  );
}
