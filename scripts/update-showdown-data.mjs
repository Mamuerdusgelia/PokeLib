// Extract only move-pool data from the official generated table; never run it in the app.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const input = process.argv[2];
if (!input)
  throw Error(
    'Usage: node scripts/update-showdown-data.mjs PATH_TO_TEAMBUILDER_TABLES_JS',
  );
const source = await fs.readFile(input, 'utf8');
// Refreshing data also requires deliberate review/update of the provenance below.
// Do not silently stamp a newer live table with this snapshot's historical metadata.
const sourceHash = createHash('sha256').update(source).digest('hex');
if (
  sourceHash !==
  '36a5dce8c06776affe5cda1a96c65554756218d2de89d2fc940f41ec8875eee3'
)
  throw Error(
    'Unpinned Showdown snapshot. Review and update the hash, dates, revisions and integration notes before refreshing.',
  );
if (
  !source.startsWith(
    '// DO NOT EDIT - automatically built with build-tools/build-indexes',
  )
)
  throw Error('Expected the official Showdown generated table.');
const context = { exports: {} };
vm.runInNewContext(source, context, {
  timeout: 5000,
  contextCodeGeneration: { strings: false, wasm: false },
});
const table = context.exports.BattleTeambuilderTable;
const keys = [
  'standard',
  'gen8bdsp',
  'gen7letsgo',
  'gen5bw1',
  'gen3rs',
  'gen3frlg',
  'gen8dlc1',
  'gen9predlc',
  'gen9dlc1',
  'champions',
  'natdexchampions',
];
await fs.mkdir('lib/showdown-data', { recursive: true });
const files = {};
for (const key of keys) {
  const data = key === 'standard' ? table : table[key];
  if (!data?.learnsets || !Object.keys(data.learnsets).length)
    throw Error('Missing ' + key);
  const text = JSON.stringify({
    learnsets: data.learnsets,
    nonstandardMoves: data.nonstandardMoves || [],
  });
  await fs.writeFile(`lib/showdown-data/${key}.json`, text + '\n');
  files[key] = {
    bytes: Buffer.byteLength(text + '\n'),
    sha256: createHash('sha256')
      .update(text + '\n')
      .digest('hex'),
  };
}
await fs.writeFile(
  'lib/showdown-data/provenance.json',
  JSON.stringify(
    {
      source: 'https://play.pokemonshowdown.com/data/teambuilder-tables.js',
      retrieved: '2026-09-08',
      lastModified: '2026-09-08T02:10:18Z',
      clientCodeRevision: 'eeaec53202425be20761198da837f5fb9b264c51',
      inspectedServerRevision: '6b4bc34e44cc2541929cc4b8fff96e756ab3f268',
      note: 'Official generated snapshot; the live asset does not declare its exact server build revision. Hash pins the data; code revision identifies the inspected adapter source.',
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      files,
    },
    null,
    2,
  ) + '\n',
);
console.log('Extracted ' + keys.length + ' lazy move-pool tables.');
