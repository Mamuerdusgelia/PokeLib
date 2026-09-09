import {
  canonicalFormat,
  knownFormat,
  isOrdinaryFormat,
  formatGeneration,
  type FormatContext,
} from './formats';
const games: Record<number, string> = {
  9: 'Scarlet / Violet',
  8: 'Sword / Shield',
  7: 'Sun / Moon',
  6: 'X / Y',
  5: 'Black / White',
  4: 'Diamond / Pearl',
  3: 'Ruby / Sapphire',
  2: 'Gold / Silver',
  1: 'Red / Blue',
};
export function describeFormat(value: string, context?: FormatContext) {
  const canonical = canonicalFormat(value);
  const f = knownFormat(canonical);
  const generation =
    (f
      ? formatGeneration(f)
      : context?.generation || Number(value.match(/gen\s*([1-9])/i)?.[1])) || 0;
  const battle =
    f?.battle ||
    context?.battle ||
    (/doubles|vgc|triples/i.test(value) ? 'doubles' : 'singles');
  const game = canonical.toLowerCase().includes('champions')
    ? 'Pokémon Champions'
    : canonical.toLowerCase().includes('bdsp')
      ? 'BDSP'
      : canonical.toLowerCase().includes('letsgo')
        ? 'Let’s Go'
        : games[generation] || 'Other game';
  const group = generation
    ? 'Gen ' + generation + ' · ' + game
    : 'Unknown generation';
  let label = f?.name.replace(/^\[[^\]]+\]\s*/, '') || value;
  if (label === 'National Dex') label = 'National Dex OU';
  const custom = !isOrdinaryFormat(canonical);
  const namedContext = f?.name.match(/^\[([^\]]+)\]/)?.[1];
  return {
    value: canonical,
    generation,
    group,
    category: battle === 'doubles' ? 'Doubles' : 'Singles',
    label,
    custom,
    fullLabel:
      (namedContext ||
        (generation ? 'Gen ' + generation : 'Unknown generation')) +
      ' ' +
      label,
  };
}
export function groupFormats(
  formats: string[],
  contexts: Record<string, FormatContext> = {},
) {
  const items = [
    ...new Map(
      formats.map((value) => {
        const f = describeFormat(value, contexts[value]);
        return [f.value, f];
      }),
    ).values(),
  ].sort(
    (a, b) =>
      b.generation - a.generation ||
      a.group.localeCompare(b.group) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
  return ['Singles', 'Doubles']
    .map((category) => ({
      category,
      groups: [
        ...new Set(
          items.filter((f) => f.category === category).map((f) => f.group),
        ),
      ].map((group) => ({
        group,
        formats: items.filter(
          (f) => f.category === category && f.group === group,
        ),
      })),
    }))
    .filter((c) => c.groups.length);
}
