import { toID } from '@pkmn/dex';
import metadata from './showdown-data/champions-formats.json';

export type ChampionsMod = 'champions' | 'championsregma' | 'championsregmb';
type Rules = {
  mod: string;
  name: string;
  rules: string[];
  defaultLevel: number;
  evLimit: number | null;
  bannedSpecies: string[];
  bannedItems: string[];
  bannedMoves: string[];
  bannedAbilities: string[];
};
const formats: Record<string, Rules> = metadata.formats;
export function championsContext(format: string): ChampionsMod | undefined {
  const id = toID(format);
  const known = formats[id];
  if (known) return known.mod as ChampionsMod;
  if (!id.includes('champions')) return undefined;
  // Explicit historical IDs also work for imported/custom format labels.
  if (id.includes('regma')) return 'championsregma';
  if (id.includes('regmb')) return 'championsregmb';
  return 'champions';
}
export function championsRules(format: string) {
  return formats[toID(format)];
}
/** These are simple individual bans, not team or combination validation. */
export function championsFormatBanned(
  format: string,
  kind: string,
  name: string,
) {
  const rules = championsRules(format);
  const key = (
    {
      species: 'bannedSpecies',
      item: 'bannedItems',
      moves: 'bannedMoves',
      ability: 'bannedAbilities',
    } as const
  )[kind as 'species'];
  return !!(rules && key && rules[key].includes(toID(name)));
}
export function championsAvailabilityLabel(
  format: string,
  kind: string,
  name: string,
  available: boolean,
) {
  if (!championsContext(format) || !name) return '';
  if (!available)
    return championsContext(format) === 'champions'
      ? 'Unavailable in Pokémon Champions'
      : 'Unavailable in this Champions regulation';
  return championsFormatBanned(format, kind, name)
    ? 'Available in Champions · banned in this format'
    : '';
}
