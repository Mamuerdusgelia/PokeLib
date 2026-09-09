// Extract metadata from official Showdown TypeScript without executing upstream code.
import fs from 'node:fs/promises';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const [input, revision] = process.argv.slice(2);
if (!input || !/^[a-f0-9]{40}$/.test(revision || ''))
  throw Error(
    'Usage: node scripts/update-formats.mjs formats.ts FULL_UPSTREAM_SHA',
  );
const source = await fs.readFile(input, 'utf8');
const ast = ts.createSourceFile(input, source, ts.ScriptTarget.Latest, true);
let entries;
function visit(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(ast) === 'Formats' &&
    node.initializer &&
    ts.isArrayLiteralExpression(node.initializer)
  )
    entries = node.initializer.elements;
  ts.forEachChild(node, visit);
}
visit(ast);
if (!entries) throw Error('Official Formats array not found.');
let section = '';
const formats = [];
for (const node of entries) {
  if (!ts.isObjectLiteralExpression(node)) continue;
  const fields = {};
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText(ast).replace(/['"]/g, '');
    if (!['name', 'section', 'mod', 'gameType', 'team'].includes(key)) continue;
    if (ts.isStringLiteralLike(prop.initializer))
      fields[key] = prop.initializer.text;
  }
  if (fields.section) section = fields.section;
  if (!fields.name || fields.team) continue;
  const id = fields.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!/^gen[1-9]/.test(id)) continue;
  formats.push({
    id,
    name: fields.name,
    mod: fields.mod || '',
    battle: fields.gameType || 'singles',
    section,
  });
}
if (formats.length < 100 || !formats.some((f) => f.id === 'gen4ubers'))
  throw Error('Unexpected registry contents.');
await fs.writeFile(
  'lib/showdown-data/formats.json',
  JSON.stringify(
    {
      source: `https://github.com/smogon/pokemon-showdown/blob/${revision}/config/formats.ts`,
      revision,
      sha256: createHash('sha256').update(source).digest('hex'),
      license: 'MIT',
      formats,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Extracted ${formats.length} named, non-random formats.`);
