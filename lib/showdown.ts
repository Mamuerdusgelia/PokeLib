import { Team, Teams } from '@pkmn/sets';
import { Dex } from '@pkmn/dex';
import {
  canonicalFormat,
  knownFormat,
  cleanFormatContext,
  assistanceFormat,
  type FormatContext,
} from './formats';
import {
  emptyDraft,
  generationFor,
  type Draft,
  type PokemonSet,
} from './domain';
export function parseShowdown(text: string, format = 'gen9ou') {
  if (typeof text !== 'string' || !text.trim())
    throw Error('Paste a Pokémon Showdown team first.');
  if (text.length > 150000) throw Error('Keep each team below 150 KB.');
  const gen = generationFor(format);
  const parsed = Team.import(
    !text.trim().includes('\n') && !text.includes('|')
      ? text.trim() + '\n\n'
      : text,
    Dex.forGen(Math.max(1, Math.min(9, gen)) as any),
  );
  if (!parsed?.team.length)
    throw Error('No Pokémon sets found. Use Pokémon Showdown export text.');
  if (parsed.team.length > 24)
    throw Error(
      'This block has more than 24 sets. Separate teams with Showdown backup headers.',
    );
  const sets = JSON.parse(JSON.stringify(parsed.team)) as PokemonSet[];
  const warnings: string[] = [];
  for (const p of sets) {
    p.moves ??= [];
    if (!Dex.species.get(p.species).exists)
      warnings.push(
        'Unrecognised species ' + p.species + ' — original text is preserved.',
      );
    if (!p.moves?.length) warnings.push(p.species + ' has no moves.');
  }
  const known =
    /^(Ability:|Level:|Shiny:|Happiness:|Tera Type:|EVs:|IVs:|Gender:|Pokeball:|Poké Ball:|Gigantamax:|Dynamax Level:|Hidden Power:|.* Nature$|- |===)/i;
  for (const block of text.trim().split(/\n\s*\n/)) {
    for (const line of block.split('\n').slice(1)) {
      if (line.trim() && !known.test(line.trim()))
        warnings.push('Preserved unrecognised line: ' + line.trim());
    }
  }
  return { sets, canonical: parsed.export(), warnings: [...new Set(warnings)] };
}
export function parseBatch(
  text: string,
  format = 'gen9ou',
  context?: FormatContext,
): { draft: Draft; warnings: string[] }[] {
  if (typeof text !== 'string' || text.length > 20000000)
    throw Error('Import an archive of at most 20 MB.');
  const headers = [...text.matchAll(/^\s*===\s*(.*?)\s*===\s*$/gm)];
  const blocks = headers.length
    ? headers.map((h, i) => ({
        header: h[1],
        body: text
          .slice(h.index! + h[0].length, headers[i + 1]?.index ?? text.length)
          .trim(),
        original: text
          .slice(h.index!, headers[i + 1]?.index ?? text.length)
          .trim(),
      }))
    : [{ header: '', body: text.trim(), original: text.trim() }];
  if (blocks.length > 10000)
    throw Error(
      'Split archives larger than 10,000 teams into separate imports.',
    );
  return blocks.map((block, i) => {
    // Showdown exportAllTeams: === [format[-box]] [folder/]name ===.
    // Unlike its permissive legacy importer, never consume an unknown name prefix.
    const m = block.header.match(/^\[([^\]]+)\](?:[ \t]+|$)/);
    const candidate = m
      ? canonicalFormat(
          m[1].replace(/-box$/i, ''),
          context?.generation || generationFor(format),
        )
      : '';
    const recognized = candidate && knownFormat(candidate);
    const fallbackContext = !headers.length
      ? cleanFormatContext(context)
      : undefined;
    const f = recognized
      ? candidate
      : headers.length
        ? 'unknown'
        : canonicalFormat(
            format,
            fallbackContext?.generation || generationFor(format),
          );
    const title =
      (recognized ? block.header.slice(m![0].length) : block.header) ||
      'Imported team ' + (i + 1);
    const p = parseShowdown(block.body, assistanceFormat(f, fallbackContext));
    return {
      draft: {
        ...emptyDraft(true),
        title,
        format: f,
        ...(fallbackContext ? { format_context: fallbackContext } : {}),
        showdown_text: block.body,
        original_text: block.original,
        set_notes: p.sets.map(() => ''),
      },
      warnings: p.warnings,
    };
  });
}
export function backupText(
  teams: {
    title: string;
    format: string;
    version: { showdown_text: string };
  }[],
) {
  return teams
    .map(
      (t) =>
        '=== [' +
        t.format +
        '] ' +
        t.title.replace(/[\r\n]/g, ' ') +
        ' ===\n\n' +
        t.version.showdown_text,
    )
    .join('\n\n');
}
export { Dex };
