import registry from './showdown-data/formats.json';
export type FormatContext = {
  generation: number;
  battle: 'singles' | 'doubles';
};
const idOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const formatRegistry = registry.formats;
// Read the named generation: IDs such as gen91v1 concatenate generation and tier.
export const formatGeneration = (f: { name: string }) =>
  Number(f.name.match(/^\[Gen (\d+)/)?.[1]) || 0;
export const currentGeneration = Math.max(
  ...formatRegistry.map(formatGeneration),
);
const byId = new Map(formatRegistry.map((f) => [f.id, f]));
const aliases = new Map<string, string>();
for (const f of formatRegistry) {
  aliases.set(idOf(f.name), f.id);
  const suffix = f.id.replace(/^gen\d+/, '');
  if (suffix === 'nationaldex') aliases.set(f.id + 'ou', f.id);
  if (suffix === 'nationaldexag')
    aliases.set(f.id.replace(/ag$/, 'anythinggoes'), f.id);
  if (suffix.includes('reg'))
    aliases.set(f.id.replace('reg', 'regulation'), f.id);
}
export function canonicalFormat(
  value: string,
  generation = currentGeneration,
): string {
  const raw = (value || 'unknown').trim();
  const id = idOf(raw);
  if (byId.has(id)) return id;
  if (aliases.has(id)) return aliases.get(id)!;
  if (!/^gen\d/.test(id)) {
    const contextual = `gen${generation}${id}`;
    if (byId.has(contextual)) return contextual;
    if (aliases.has(contextual)) return aliases.get(contextual)!;
  }
  return raw;
}
export function knownFormat(value: string) {
  return byId.get(canonicalFormat(value));
}
export function isOrdinaryFormat(value: string) {
  const f = knownFormat(value);
  if (!f || !['singles', 'doubles'].includes(f.battle)) return false;
  const suffix = f.id.replace(/^gen\d+(?:bdsp|letsgo|champions|dlc\d+)?/, '');
  return /^(?:ou|ubers|uu|ru|nu|pu|zu|lc|nfe|anythinggoes|doublesou|doublesuu|doublesubers|nationaldex(?:ubers|ou|uu|ru|lc|ag|doubles|doublesubers)?|vgc\d+.*|battlestadium(?:singles|doubles).*|battlespot(?:singles|doubles).*)$/.test(
    suffix,
  );
}
export const ordinaryFormats = formatRegistry.filter((f) =>
  isOrdinaryFormat(f.id),
);
/** One search across generations; the registry remains the source of selectable IDs. */
export function searchFormats(query: string) {
  const normalized = query
    .toLowerCase()
    .replace(/\bnat\s*dex\b/g, 'national dex')
    .replace(/gen\s+(\d+)/g, 'gen$1');
  const tokens = normalized.trim().split(/\s+/).map(idOf).filter(Boolean);
  const exact = canonicalFormat(normalized);
  return ordinaryFormats
    .filter((f) => {
      const words = (
        f.name +
        ' ' +
        f.id +
        ' ' +
        (f.id.endsWith('nationaldex') ? 'ou nationaldexou' : '') +
        ' ' +
        f.battle
      )
        .toLowerCase()
        .replace(/gen\s+(\d+)/g, 'gen$1')
        .split(/[^a-z0-9]+/);
      return tokens.every((token) =>
        words.some((word) => word.startsWith(token)),
      );
    })
    .sort(
      (a, b) =>
        Number(b.id === exact) - Number(a.id === exact) ||
        formatGeneration(b) - formatGeneration(a) ||
        a.name.localeCompare(b.name),
    );
}
export function cleanFormatContext(
  context: unknown,
): FormatContext | undefined {
  if (context === undefined || context === null) return undefined;
  const c = context as FormatContext;
  if (
    !Number.isInteger(c.generation) ||
    c.generation < 1 ||
    c.generation > currentGeneration ||
    !['singles', 'doubles'].includes(c.battle)
  )
    throw Error('Choose a valid custom format generation and battle type.');
  return { generation: c.generation, battle: c.battle };
}
export function assistanceFormat(value: string, context?: FormatContext) {
  const f = knownFormat(value);
  return f?.id || (context ? `gen${context.generation}custom` : value);
}
export function formatSearchValues(value: string) {
  const canonical = canonicalFormat(value);
  const result = new Set([idOf(canonical), idOf(value)]);
  for (const [alias, id] of aliases) if (id === canonical) result.add(alias);
  if (canonical.startsWith(`gen${currentGeneration}`)) {
    for (const name of result)
      if (name.startsWith(`gen${currentGeneration}`))
        result.add(name.replace(/^gen[1-9]/, ''));
  }
  return [...result];
}
