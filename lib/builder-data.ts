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
// The maintained Dex already ships Showdown's official aliases. Extensions are
// fallback-only; an upstream alias or a genuine exact name always takes priority.
const competitiveAliases: Partial<
  Record<SelectorKind, Record<string, string>>
> = {
  moves: { cc: 'Close Combat' },
};
export function resolveBuilderAlias(
  kind: SelectorKind,
  format: string,
  query: string,
) {
  const dex = dexFor(format),
    id = toID(query);
  const alias = dex.data.Aliases[id] || competitiveAliases[kind]?.[id];
  if (!alias) return undefined;
  const catalog =
    kind === 'species'
      ? dex.species
      : kind === 'moves'
        ? dex.moves
        : kind === 'item'
          ? dex.items
          : kind === 'ability'
            ? dex.abilities
            : kind === 'nature'
              ? dex.natures
              : dex.types;
  const entry = catalog.get(alias);
  return availableIn(format, entry) ? entry.name : undefined;
}
/** -1 means no name match; metadata/type matching may still include the row. */
export function builderMatchRank(
  kind: SelectorKind,
  format: string,
  name: string,
  query: string,
) {
  const id = toID(query),
    nameId = toID(name);
  if (!id) return 3;
  if (id === nameId) return 0;
  if (toID(resolveBuilderAlias(kind, format, query)) === nameId) return 1;
  if (nameId.startsWith(id)) return 2;
  return nameId.includes(id) ||
    query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .every((token) => name.toLowerCase().includes(token))
    ? 3
    : -1;
}

/** Forms with an unambiguous starting species and an explicit selectable trigger. */
export function selectableBattleForm(format: string, species: Species) {
  if (!species.battleOnly) return true;
  if (typeof species.battleOnly !== 'string' || species.requiredTeraType)
    return false;
  const parent = dexFor(format).species.get(species.battleOnly);
  if (!availableIn(format, parent)) return false;
  const items =
    species.requiredItems ||
    (species.requiredItem ? [species.requiredItem] : []);
  return (
    items.some((item) => availableIn(format, dexFor(format).items.get(item))) ||
    !!(
      species.requiredMove &&
      availableIn(format, dexFor(format).moves.get(species.requiredMove))
    )
  );
}

// Canonical move conversion follows Showdown server team-validator.ts:
// crowned forms use Iron Head in stored teams and transform it during battle.
const battleMoves: Record<string, { stored: string; shown: string }> = {
  zaciancrowned: { stored: 'Iron Head', shown: 'Behemoth Blade' },
  zamazentacrowned: { stored: 'Iron Head', shown: 'Behemoth Bash' },
};
export function presentedSpecies(
  format: string,
  set: PokemonSet,
  preview?: string,
) {
  const dex = dexFor(format),
    stored = dex.species.get(set.species);
  if (!stored.exists || stored.battleOnly) return stored;
  const options = (stored.otherFormes || [])
    .map((name) => dex.species.get(name))
    .filter(
      (forme) =>
        availableIn(format, forme) &&
        selectableBattleForm(format, forme) &&
        (forme.battleOnly === stored.name || forme.changesFrom === stored.name),
    );
  const matches = (forme: Species) => {
    const items =
      forme.requiredItems || (forme.requiredItem ? [forme.requiredItem] : []);
    return (
      // A Z-Crystal can permit an explicitly chosen Arceus type, but holding
      // it does not itself change ordinary Arceus into that type.
      (!items.length ||
        items.some(
          (item) => !item.endsWith('ium Z') && toID(item) === toID(set.item),
        )) &&
      (!forme.requiredMove ||
        set.moves.some((move) => toID(move) === toID(forme.requiredMove)))
    );
  };
  const selected = options.find(
    (forme) => toID(preview) === forme.id && matches(forme),
  );
  if (selected) return selected;
  // This is the available battle-form preview, not a claim that an optional
  // transformation has already happened. The canonical starting set is untouched.
  return (
    options.find(
      (forme) =>
        !!(
          forme.requiredItems?.length ||
          forme.requiredItem ||
          forme.requiredMove
        ) && matches(forme),
    ) || stored
  );
}
export function presentedSet(
  format: string,
  set: PokemonSet,
  preview?: string,
): PokemonSet {
  const species = presentedSpecies(format, set, preview),
    conversion = battleMoves[species.id];
  const moves =
    conversion &&
    set.moves.some((move) => toID(move) === toID(conversion.stored))
      ? set.moves.map((move) =>
          toID(move) === toID(conversion.stored) ? conversion.shown : move,
        )
      : set.moves;
  return species.name === set.species && moves === set.moves
    ? set
    : {
        ...set,
        species: species.name,
        name: set.name === set.species ? species.name : set.name,
        moves,
      };
}
export function canonicalMoveName(
  format: string,
  set: PokemonSet,
  name: string,
  preview?: string,
) {
  const conversion = battleMoves[presentedSpecies(format, set, preview).id];
  return conversion && toID(name) === toID(conversion.shown)
    ? conversion.stored
    : name;
}
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
function createBuilderCatalog(format: string) {
  const dex = dexFor(format),
    available = (e: Parameters<typeof availableIn>[1]) =>
      availableIn(format, e);
  // all() includes typed Hidden Powers whose id is the base 'hiddenpower'.
  // Normalize EVERY variant before deduplication: duplicate React keys left
  // stale Hidden Power rows behind when a later query excluded them.
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
    species: dex.species
      .all()
      .filter((s) => available(s) && selectableBattleForm(format, s)),
    item: dex.items.all().filter(available),
    ability: dex.abilities.all().filter(available),
    moves: [
      ...new Map(
        [...dex.moves.all(), ...hiddenPowerVariants].map((move) => {
          const entry =
            move.id === 'hiddenpower'
              ? // oxlint-disable-next-line typescript/no-misused-spread
                { ...move, id: toID(move.name) }
              : move;
          return [entry.id, entry] as const;
        }),
      ).values(),
    ].filter((m) => available(m) && !m.isZ && !m.isMax && m.id !== 'struggle'),
    nature: dex.natures.all().filter(available),
    teraType: dex.types.all().filter(available),
  };
}

// Availability currently depends only on generation and National Dex. Bound the
// cache to those contexts instead of retaining every arbitrary custom format name.
const catalogCache = new Map<string, ReturnType<typeof createBuilderCatalog>>();
export function builderCatalog(format: string) {
  const key =
    generationFor(format) + ':' + Number(/nationaldex|natdex/i.test(format));
  let catalog = catalogCache.get(key);
  if (!catalog) {
    catalog = createBuilderCatalog(format);
    catalogCache.set(key, catalog);
  }
  return catalog;
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
    species = presentedSpecies(format, set);
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
