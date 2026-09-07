import { Team, Teams } from '@pkmn/sets';
import { Dex } from '@pkmn/dex';
import { emptyDraft, type Draft, type PokemonSet } from './domain';
export function parseShowdown(text: string, format = 'gen9ou') {
  if (typeof text !== 'string' || !text.trim())
    throw Error('Paste a Pokémon Showdown team first.');
  if (text.length > 150000) throw Error('Keep each team below 150 KB.');
  const gen = Number(format.match(/^gen(\d+)/)?.[1] ?? 9);
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
): { draft: Draft; warnings: string[] }[] {
  if (text.length > 5000000) throw Error('Import at most 5 MB at a time.');
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
  if (blocks.length > 200)
    throw Error('Import at most 200 teams in one batch.');
  return blocks.map((block, i) => {
    const m = block.header.match(/^(?:\[([^\]]+)\]\s*)?(.*)$/);
    const f = m?.[1] || format;
    const title = m?.[2]?.trim() || 'Imported team ' + (i + 1);
    const p = parseShowdown(block.body, f);
    return {
      draft: {
        ...emptyDraft(true),
        title,
        format: f,
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
