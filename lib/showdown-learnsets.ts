/**
 * Adapted from Pokémon Showdown Client battle-dex-search.ts, MIT.
 * Copyright (c) Guangcong Luo and other Pokémon Showdown contributors.
 * Upstream eeaec53202425be20761198da837f5fb9b264c51.
 * See SHOWDOWN_INTEGRATION.md and THIRD_PARTY_NOTICES.md.
 * Changes: async pinned data, @pkmn/dex adapter, Set output, no viability curation.
 */
import { Dex, toID } from '@pkmn/dex';
import { generationFor } from './domain';
type Table = {
  learnsets: Record<string, Record<string, string>>;
  nonstandardMoves: string[];
};
const cache = new Map<string, Promise<Set<string>>>();
export function learnsetContext(format: string) {
  const id = toID(format),
    gen = generationFor(format);
  const rules = id.replace(/^gen\d+/, '');
  const natdex = /nationaldex|natdex/.test(rules);
  const table = /natdexchampions|nationaldexchampions/.test(rules)
    ? 'natdexchampions'
    : /champions/.test(rules)
      ? 'champions'
      : /bdsp/.test(rules)
        ? 'gen8bdsp'
        : /letsgo/.test(rules)
          ? 'gen7letsgo'
          : /bw1/.test(rules)
            ? 'gen5bw1'
            : gen === 3 && rules.startsWith('rs')
              ? 'gen3rs'
              : /frlg/.test(rules)
                ? 'gen3frlg'
                : gen === 8 && /dlc1/.test(rules)
                  ? 'gen8dlc1'
                  : gen === 9 && /predlc/.test(rules)
                    ? 'gen9predlc'
                    : gen === 9 && /dlc1/.test(rules)
                      ? 'gen9dlc1'
                      : 'standard';
  return { gen, rules, natdex, table };
}
async function loadTable(key: string): Promise<Table> {
  switch (key) {
    case 'gen8bdsp':
      return (await import('./showdown-data/gen8bdsp.json')).default;
    case 'gen7letsgo':
      return (await import('./showdown-data/gen7letsgo.json')).default;
    case 'gen5bw1':
      return (await import('./showdown-data/gen5bw1.json')).default;
    case 'gen3rs':
      return (await import('./showdown-data/gen3rs.json')).default;
    case 'gen3frlg':
      return (await import('./showdown-data/gen3frlg.json')).default;
    case 'gen8dlc1':
      return (await import('./showdown-data/gen8dlc1.json')).default;
    case 'gen9predlc':
      return (await import('./showdown-data/gen9predlc.json')).default;
    case 'gen9dlc1':
      return (await import('./showdown-data/gen9dlc1.json')).default;
    case 'champions':
      return (await import('./showdown-data/champions.json')).default;
    case 'natdexchampions':
      return (await import('./showdown-data/natdexchampions.json')).default;
    default:
      return (await import('./showdown-data/standard.json')).default;
  }
}
export function learnableMoves(
  format: string,
  name: string,
): Promise<Set<string>> {
  const key = toID(format) + ':' + toID(name);
  let result = cache.get(key);
  if (result) return result;
  result = computePool(format, name);
  cache.set(key, result);
  result.catch(() => cache.delete(key));
  return result;
}
async function computePool(format: string, name: string) {
  const ctx = learnsetContext(format),
    dex = Dex.forGen(ctx.gen);
  const table = await loadTable(ctx.table),
    species = dex.species.get(name);
  const moves = new Set<string>();
  if (!species.exists || species.gen > ctx.gen) return moves;
  const first = (id: string) => {
    if (id in table.learnsets) return id;
    const p = dex.species.get(id);
    const base = toID(
      typeof p.battleOnly === 'string' && p.battleOnly !== p.baseSpecies
        ? p.battleOnly
        : p.baseSpecies,
    );
    return base in table.learnsets ? base : '';
  };
  const next = (id: string, root: string, checkingMoves = false): string => {
    if (id === 'lycanrocdusk' || (root === 'rockruff' && id === 'rockruff'))
      return 'rockruffdusk';
    const p = dex.species.get(id);
    if (!p.exists) return '';
    const aliases: Record<string, string> = {
      gastrodoneast: 'gastrodon',
      pumpkaboosuper: 'pumpkaboo',
      sinisteaantique: 'sinistea',
      tatsugiristretchy: 'tatsugiri',
    };
    if (aliases[p.id]) return aliases[p.id];
    const parent = p.battleOnly || p.changesFrom || p.prevo;
    if (parent) return toID(Array.isArray(parent) ? parent[0] : parent);
    if (
      checkingMoves &&
      !p.prevo &&
      p.baseSpecies &&
      dex.species.get(p.baseSpecies).prevo
    ) {
      let base = dex.species.get(p.baseSpecies);
      while (base.prevo) base = dex.species.get(base.prevo);
      return base.id;
    }
    return '';
  };
  const eggOnly = (child: string, father: string) => {
    if (
      dex.species.get(child).baseSpecies === dex.species.get(father).baseSpecies
    )
      return false;
    const root = father,
      visited = new Set<string>();
    while (father && !visited.has(father)) {
      if (child === father) return false;
      visited.add(father);
      father = next(father, root);
    }
    return true;
  };
  const originRequired =
    ctx.gen >= 6 &&
    (/^battle(spot|stadium|festival)|^bss|^vgc/.test(ctx.rules) ||
      (ctx.gen === 9 && !ctx.natdex));
  const originCode: Record<number, string> = { 6: 'p', 7: 'q', 8: 'g', 9: 'a' };
  const visited = new Set<string>();
  for (
    let id = first(species.id);
    id && !visited.has(id);
    id = next(id, species.id, true)
  ) {
    visited.add(id);
    for (const [moveId, codes] of Object.entries(table.learnsets[id] || {})) {
      const move = dex.moves.get(moveId);
      if (!move.exists || move.gen > ctx.gen) continue;
      if (originRequired && !codes.includes(originCode[ctx.gen])) continue;
      if (eggOnly(id, species.id) && (!codes.includes('e') || ctx.gen !== 9))
        continue;
      if (
        !codes.includes(String(ctx.gen)) &&
        !(
          ctx.rules.includes('tradebacks') &&
          codes.includes(String(ctx.gen + 1))
        )
      )
        continue;
      if (!ctx.natdex && move.isNonstandard === 'Past') continue;
      // Only the DLC branches apply this list upstream. Older-game tables also
      // contain a generated list, but applying it there removes valid old moves.
      if (
        ['gen8dlc1', 'gen9predlc', 'gen9dlc1'].includes(ctx.table) &&
        table.nonstandardMoves.includes(moveId)
      )
        continue;
      moves.add(moveId);
    }
  }
  if (moves.has('sketch') || /hackmons|bh$/.test(ctx.rules)) {
    const sketch = moves.has('sketch');
    if (!sketch) moves.clear();
    for (const move of dex.moves.all()) {
      if (!move.exists || move.gen > ctx.gen || move.isMax || move.isZ)
        continue;
      if (sketch && move.flags.nosketch) continue;
      if (move.isNonstandard && !(ctx.natdex && move.isNonstandard === 'Past'))
        continue;
      moves.add(move.id);
    }
  }
  // Sketch and unrestricted pools also need the selectable typed variants.
  if (moves.has('hiddenpower'))
    for (const type of dex.types.all()) {
      if (!['Normal', 'Fairy', 'Stellar'].includes(type.name))
        moves.add('hiddenpower' + toID(type.name));
    }
  return moves;
}
