import { normalize } from './domain';
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
const names: Record<string, string> = {
  anythinggoes: 'Anything Goes',
  doublesou: 'Doubles OU',
  doublesubers: 'Doubles Ubers',
  doublesuu: 'Doubles UU',
  almostanyability: 'Almost Any Ability',
  balancedhackmons: 'Balanced Hackmons',
  mixandmega: 'Mix and Mega',
  stabmons: 'STABmons',
  monotype: 'Monotype',
};
export function describeFormat(value: string) {
  const id = normalize(value),
    match = id.match(/^gen(\d+)(.*)$/);
  const generation = match ? Number(match[1]) : 0;
  let suffix = match?.[2] || id;
  let group =
    games[generation] ||
    (generation ? 'Generation ' + generation : 'Other formats');
  for (const [prefix, name] of [
    ['champions', 'Pokémon Champions'],
    ['bdsp', 'Brilliant Diamond / Shining Pearl'],
    ['letsgo', 'Let’s Go'],
  ]) {
    if (suffix.startsWith(prefix)) {
      group = name;
      suffix = suffix.slice(prefix.length);
      break;
    }
  }
  let category = 'Other formats';
  if (suffix.includes('vgc')) category = 'VGC';
  else if (suffix.startsWith('nationaldex')) category = 'National Dex';
  else if (/battlestadium|battlespot|^bss/.test(suffix))
    category = 'Battle Stadium / Spot';
  else if (/doubles|triples/.test(suffix)) category = 'Doubles / Triples';
  else if (
    /^(ou|ubers|uu|ru|nu|pu|zu|lc|anythinggoes)(?:$|suspect|blitz|bo3)/.test(
      suffix,
    )
  )
    category = 'Singles';
  else if (/draft/.test(suffix)) category = 'Draft';
  else if (
    /almostanyability|balancedhackmons|mixandmega|stabmons|monotype|1v1/.test(
      suffix,
    )
  )
    category = 'Other Metagames';
  let label =
    names[suffix] ||
    (/^(ou|uu|ru|nu|pu|zu|lc)$/.test(suffix)
      ? suffix.toUpperCase()
      : suffix === 'ubers'
        ? 'Ubers'
        : value);
  if (category === 'VGC') {
    const vgc = suffix.slice(suffix.indexOf('vgc') + 3);
    label =
      vgc
        .replace(/^(\d{4})/, '$1 · ')
        .replace(
          /(?:regulation|reg)([a-z]+?)(?=bo\d|$)/,
          (_, r: string) => 'Regulation ' + r.toUpperCase(),
        )
        .replace(/bo(\d)/, ' · Bo$1')
        .replace(/ultraseries/, 'Ultra Series')
        .replace(/sunseries/, 'Sun Series')
        .replace(/moonseries/, 'Moon Series')
        .replace(/ · $/, '') || 'VGC';
  }
  if (category === 'National Dex')
    label =
      names[suffix.slice(11)] ||
      suffix.slice(11).toUpperCase() ||
      'National Dex';
  return {
    value,
    generation,
    group,
    category,
    label,
    fullLabel:
      category === 'VGC'
        ? `Gen ${generation || '?'} VGC ${label}`
        : `Gen ${generation || '?'} ${label === value ? value.replace(/^gen\d+/i, '') : label}`,
  };
}
export function groupFormats(formats: string[]) {
  const items = formats
    .map(describeFormat)
    .sort(
      (a, b) =>
        b.generation - a.generation ||
        a.category.localeCompare(b.category) ||
        a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
  return [...new Set(items.map((f) => f.group))].map((group) => ({
    group,
    categories: [
      ...new Set(items.filter((f) => f.group === group).map((f) => f.category)),
    ].map((category) => ({
      category,
      formats: items.filter(
        (f) => f.group === group && f.category === category,
      ),
    })),
  }));
}
