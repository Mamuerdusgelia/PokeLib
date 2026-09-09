/**
 * Focused adaptations of Pokémon Showdown Client battle-team-editor.tsx.
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license AGPLv3
 * Upstream eeaec53202425be20761198da837f5fb9b264c51; TeamVault changes 2026-09-08.
 * Preserve only relevant set fields, supply first normal ability, keep imported odd EVs.
 */
import { toID } from '@pkmn/dex';
import { dexFor, generationFor, editEVs, type StatId } from './builder-data';
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
): Partial<PokemonSet> {
  const species = dexFor(format).species.get(name);
  const patch: Partial<PokemonSet> = {
    species: species.exists ? species.name : name,
  };
  // Re-selecting an imported species must not normalize unusual abilities/items.
  if (!species.exists || toID(set.species) === species.id) return patch;
  if (generationFor(format) >= 3) {
    const abilities = Object.values(species.abilities);
    patch.ability =
      species.requiredAbility ||
      (abilities.some((a) => toID(a) === toID(set.ability))
        ? set.ability
        : species.abilities['0']);
  }
  const items = requiredItems(format, species.name);
  const oldRequirements = requiredItems(format, set.species);
  if (items.length === 1) patch.item = items[0];
  else if (items.length > 1 && !items.some((i) => toID(i) === toID(set.item)))
    patch.item = '';
  else if (
    !items.length &&
    oldRequirements.some((i) => toID(i) === toID(set.item))
  )
    patch.item = '';
  return patch;
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
