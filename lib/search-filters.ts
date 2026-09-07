export type SearchField =
  | 'from'
  | 'tag'
  | 'year'
  | 'format'
  | 'pokemon'
  | 'move'
  | 'item'
  | 'ability';
export type SearchChip = { field: SearchField; value: string };
export const filterLabels: Record<SearchField, string> = {
  from: 'From',
  tag: 'Tag',
  year: 'Year',
  format: 'Format',
  pokemon: 'Pokémon',
  move: 'Move',
  item: 'Item',
  ability: 'Ability',
};
export function addSearchChip(
  chips: SearchChip[],
  chip: SearchChip,
): SearchChip[] {
  const singleton = [
    'from',
    'year',
    'format',
    'pokemon',
    'item',
    'ability',
  ].includes(chip.field);
  return [
    ...chips.filter(
      (c) =>
        !(
          c.field === chip.field &&
          (singleton || c.value.toLowerCase() === chip.value.toLowerCase())
        ),
    ),
    chip,
  ];
}
export function queryWithFilters(chips: SearchChip[], text: string) {
  const filters = chips
    .filter((c) => !(c.field === 'year' && c.value === 'unknown'))
    .map((c) => `${c.field}:"${c.value.replace(/["\r\n]/g, ' ')}"`);
  return [...filters, text.trim()].filter(Boolean).join(' ');
}
export function activeFilter(text: string) {
  const match = text.match(
    /(?:^|\s)(from|source|tag|year|format|pokemon|move|item|ability):(?:(?:"([^"]*)"?)|([^\s]*))$/i,
  );
  return match
    ? {
        field: (match[1].toLowerCase() === 'source'
          ? 'from'
          : match[1].toLowerCase()) as SearchField,
        value: match[2] ?? match[3] ?? '',
        prefix: text.slice(0, match.index).trim(),
      }
    : null;
}
