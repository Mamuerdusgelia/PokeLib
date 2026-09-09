/**
 * Focused adaptations of Pokémon Showdown Client battle-team-editor.tsx.
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license AGPLv3
 * Upstream eeaec53202425be20761198da837f5fb9b264c51; TeamVault changes 2026-09-08.
 * Preserve only relevant set fields, supply first normal ability, keep imported odd EVs.
 */
import { toID } from '@pkmn/dex';
import {
  dexFor,
  generationFor,
  editEVs,
  canonicalMoveName,
  presentedSpecies,
  selectableBattleForm,
  type StatId,
} from './builder-data';
import type { PokemonSet } from './domain';

export function requiredItems(format: string, name: string) {
  const dex = dexFor(format),
    species = dex.species.get(name);
  const items =
    species.requiredItems ||
    (species.requiredItem ? [species.requiredItem] : []);
  return items.filter(
    (item) =>
      (generationFor(format) === 7 ||
        /nationaldex|natdex/i.test(format) ||
        !item.endsWith('ium Z')) &&
      dex.items.get(item).gen <= generationFor(format),
  );
}
export function speciesSelectionPatch(
  format: string,
  set: PokemonSet,
  name: string,
  options: { authored?: boolean; teraManaged?: boolean } = {},
): Partial<PokemonSet> {
  const dex = dexFor(format),
    species = dex.species.get(name);
  const stored =
    typeof species.battleOnly === 'string' &&
    selectableBattleForm(format, species)
      ? dex.species.get(species.battleOnly)
      : species;
  const patch: Partial<PokemonSet> = {
    species: species.exists ? stored.name : name,
  };
  // Re-selecting an imported species must not normalize unusual abilities/items.
  if (!species.exists) return patch;
  if (presentedSpecies(format, set).id === species.id)
    return { species: set.species };
  if (generationFor(format) >= 3) {
    const abilities = Object.values(stored.abilities);
    patch.ability =
      species.requiredAbility ||
      (abilities.some((a) => toID(a) === toID(set.ability))
        ? set.ability
        : stored.abilities['0']);
  }
  const items = requiredItems(format, species.name);
  const oldRequirements = requiredItems(
    format,
    presentedSpecies(format, set).name,
  );
  if (items.length === 1) patch.item = items[0];
  else if (items.length > 1 && !items.some((i) => toID(i) === toID(set.item)))
    patch.item = '';
  else if (
    !items.length &&
    oldRequirements.some((i) => toID(i) === toID(set.item))
  )
    patch.item = '';
  if (
    species.requiredMove &&
    !set.moves.some((move) => toID(move) === toID(species.requiredMove))
  ) {
    // Appending the trigger preserves all existing moves, including custom extras.
    patch.moves = [...set.moves, species.requiredMove];
  }
  const next = { ...set, ...patch };
  const moves = (patch.moves || set.moves).map((move) =>
    canonicalMoveName(
      format,
      next,
      canonicalMoveName(format, set, move),
      species.name,
    ),
  );
  if (moves.some((move, index) => move !== (patch.moves || set.moves)[index]))
    patch.moves = moves;
  if (
    generationFor(format) >= 9 &&
    (options.teraManaged || (options.authored && !set.teraType))
  ) {
    patch.teraType = species.requiredTeraType || species.types[0];
  }
  return patch;
}

/** Display fallback only; callers decide whether an authored default is persisted. */
export function defaultTeraType(format: string, name: string) {
  if (generationFor(format) < 9) return undefined;
  const species = dexFor(format).species.get(name);
  return species.exists
    ? species.requiredTeraType || species.types[0]
    : undefined;
}
export function stepEV(
  set: PokemonSet,
  format: string,
  stat: StatId,
  direction: number,
) {
  const current = set.evs?.[stat] ?? (generationFor(format) < 3 ? 252 : 0);
  return editEVs(set, format, stat, current + direction * 4);
}
export function adjacentMove(index: number, count: number, direction: number) {
  const next = index + direction;
  return next >= 0 && next < count ? next : null;
}
export function generatedTeamTitle() {
  // No library-wide fetch or local counter race; each unsaved draft has its own identifier.
  return 'Untitled ' + crypto.randomUUID().slice(0, 8);
}
