import { Dex } from '@pkmn/dex';
import { normalize, type TeamRecord } from './domain';
import { canonicalFormat } from './formats';
import { familyKey } from './variants';

export const duplicateSuggestionKey = 'duplicate-suggestion-seen-v1';

export function duplicateSignature(team: TeamRecord): string | null {
  const sets = team.version.parsed_team;
  if (sets.length !== 6) return null;
  const identities = sets.map((set) => Dex.species.get(set.species));
  // Unknown species cannot safely be treated as canonical form identities.
  if (identities.some((species) => !species.exists)) return null;
  return JSON.stringify([
    normalize(canonicalFormat(team.format, team.format_context?.generation)),
    identities.map((species) => species.id).sort(),
  ]);
}

/** One linear pass over the entire active scope, never filtered search results. */
export function duplicateGroups(teams: TeamRecord[]): TeamRecord[][] {
  const families = new Map<string, number>();
  for (const team of teams)
    families.set(familyKey(team), (families.get(familyKey(team)) || 0) + 1);
  const groups = new Map<string, TeamRecord[]>();
  for (const team of teams) {
    if (
      familyKey(team) !== team.id ||
      families.get(familyKey(team)) !== 1 ||
      (team.variant_count || 1) > 1
    )
      continue;
    const signature = duplicateSignature(team);
    if (!signature) continue;
    const group = groups.get(signature) || [];
    group.push(team);
    groups.set(signature, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
