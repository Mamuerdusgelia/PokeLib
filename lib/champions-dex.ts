import { Dex, toID, type ModData, type ModdedDex } from '@pkmn/dex';
import snapshot from './showdown-data/champions-builder.json';
import { championsContext, type ChampionsMod } from './champions-context';

const cache = new Map<ChampionsMod, ModdedDex>();
const snapshots = snapshot as unknown as Record<ChampionsMod, ModData>;
export function championsDex(format: string) {
  const context = championsContext(format);
  if (!context) return undefined;
  let dex = cache.get(context);
  if (!dex) {
    const base = snapshots.champions;
    const overrides = snapshots[context];
    const data = Object.fromEntries(
      Object.keys(base).map((key) => {
        const type = key as 'Species' | 'Moves' | 'Items' | 'Abilities';
        return [type, { ...base[type], ...overrides[type] }];
      }),
    ) as ModData;
    // @pkmn merges FormatsData into Species: replace SV's availability and tiers.
    const speciesData = data.Species as unknown as NonNullable<
      ModData['FormatsData']
    >;
    data.FormatsData = Object.fromEntries(
      Object.entries(speciesData).map(([id, s]) => [
        id,
        {
          isNonstandard: s?.isNonstandard ?? null,
          tier: s?.tier || '',
          doublesTier: s?.doublesTier || '',
          natDexTier: s?.natDexTier || '',
        },
      ]),
    );
    dex = Dex.mod(toID('pokelib' + context), {
      ...data,
      Scripts: { inherit: 'gen9' },
    });
    // Resolved cosmetic forms are real entries here. The older library's alias
    // branch mistakes an alias with FormatsData for a special-event ability form.
    // Isolate aliases before removing exact entries; never mutate the global Dex.
    dex.data.Aliases = { ...dex.data.Aliases };
    for (const id of Object.keys(speciesData)) delete dex.data.Aliases[id];
    cache.set(context, dex);
  }
  return dex;
}
