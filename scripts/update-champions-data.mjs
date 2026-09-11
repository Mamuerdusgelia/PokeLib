// Build-time extraction only. Executes the reviewed, pinned Showdown Dex locally;
// no upstream simulator code or network request is shipped to the browser.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const currentRevision = '524413e8415fe179781e9bbcc7c79a85543b3409';
const historicalRevision = '6b4bc34e44cc2541929cc4b8fff96e756ab3f268';
if (process.argv.length !== 4)
  throw Error(
    'Pass the extracted current and historical pinned Showdown source directories.',
  );
const [current, historical] = process.argv.slice(2).map((p) => path.resolve(p));
const require = createRequire(import.meta.url);
const inputs = {};
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const root = filename.startsWith(current + path.sep) ? current : historical;
  const revision = root === current ? currentRevision : historicalRevision;
  inputs[revision + '/' + path.relative(root, filename).replaceAll('\\', '/')] =
    hash(source);
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText,
    filename,
  );
};
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function pick(entry, fields) {
  return Object.fromEntries(
    fields
      .split(' ')
      .filter((k) => entry[k] !== undefined)
      .map((k) => [k, entry[k]]),
  );
}
const common = 'name num gen isNonstandard';
const fields = {
  Species:
    common +
    ' baseSpecies forme types abilities baseStats bst weightkg heightm gender genderRatio eggGroups prevo evos evoType evoRegion changesFrom battleOnly requiredItem requiredItems requiredAbility requiredMove requiredTeraType otherFormes cosmeticFormes formeOrder isMega isPrimal canGigantamax tier doublesTier natDexTier',
  Moves:
    common +
    ' type category basePower accuracy priority pp target flags isZ isMax noPPBoosts',
  Items:
    common +
    ' megaStone megaEvolves forcedForme itemUser fling isBerry isPokeball zMove zMoveType zMoveFrom onPlate onDrive onMemory',
  Abilities: common + ' flags',
};
const contexts = {};
const formats = {};
const registry = [];
for (const [root, mods, revision] of [
  [current, ['champions', 'championsregmb'], currentRevision],
  [historical, ['championsregma'], historicalRevision],
]) {
  // Dex inheritance and init mutate exported mod tables. Capture their original
  // override keys first so ordinary inherited effects retain their descriptions.
  const overrideKeys = {};
  for (const mod of new Set(['champions', ...mods])) {
    overrideKeys[mod] = {};
    for (const type of ['Moves', 'Items', 'Abilities']) {
      const file = path.join(
        root,
        'data/mods',
        mod,
        type.toLowerCase() + '.ts',
      );
      if (!fs.existsSync(file)) continue;
      overrideKeys[mod][type] = Object.fromEntries(
        Object.entries(require(file)[type]).map(([id, entry]) => [
          id,
          Object.keys(entry || {}),
        ]),
      );
    }
  }
  const { Dex } = require(path.join(root, 'sim/dex.ts'));
  for (const mod of mods) {
    const dex = Dex.mod(mod);
    const data = {};
    for (const [type, catalog] of Object.entries({
      Species: dex.species,
      Moves: dex.moves,
      Items: dex.items,
      Abilities: dex.abilities,
    })) {
      data[type] = Object.fromEntries(
        catalog.all().map((entry) => {
          const value = pick(entry, fields[type]);
          if (type !== 'Species') {
            // Text is resolved from the same upstream revision. Changed mechanics
            // without mod-specific prose must not display an incorrect SV description.
            const text = dex.text?.get(entry) || entry;
            let changedMechanics = false;
            for (const name of ['champions', mod]) {
              const keys = overrideKeys[name]?.[type]?.[entry.id];
              if (
                keys &&
                keys.some(
                  (key) =>
                    ![
                      'inherit',
                      'isNonstandard',
                      'pp',
                      'basePower',
                      'accuracy',
                      'priority',
                    ].includes(key),
                )
              )
                changedMechanics = true;
            }
            value.shortDesc = changedMechanics ? '' : text.shortDesc || '';
            // Do not use a generic long description for an overridden effect.
            value.desc = '';
          }
          return [entry.id, value];
        }),
      );
    }
    const learnsets = {};
    for (const species of dex.species.all()) {
      if (species.isNonstandard) continue;
      learnsets[species.id] = [...dex.species.getMovePool(species.id)]
        .filter((id) => {
          const move = dex.moves.get(id);
          return (
            move.exists &&
            !move.isNonstandard &&
            !move.isZ &&
            !move.isMax &&
            id !== 'struggle'
          );
        })
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    }
    contexts[mod] = { revision, data, learnsets };
    for (const format of Dex.formats
      .all()
      .filter((f) => f.mod === mod && !f.team && f.id.startsWith('gen9'))) {
      if (formats[format.id]) continue;
      const rules = dex.formats.getRuleTable(format);
      formats[format.id] = {
        mod,
        name: format.name,
        rules: [...rules.keys()],
        defaultLevel: rules.adjustLevel || rules.defaultLevel,
        evLimit: rules.evLimit,
        bannedSpecies: dex.species
          .all()
          .filter((s) => !s.isNonstandard && rules.isBannedSpecies(s))
          .map((s) => s.id)
          .sort(),
        bannedItems: dex.items
          .all()
          .filter((i) => !i.isNonstandard && rules.isBanned('item:' + i.id))
          .map((i) => i.id)
          .sort(),
        bannedMoves: dex.moves
          .all()
          .filter(
            (m) =>
              !m.isNonstandard &&
              (rules.isBanned('move:' + m.id) ||
                (rules.has('sleepmovesclause') && m.status === 'slp') ||
                (rules.has('ohkoclause') && m.ohko)),
          )
          .map((m) => m.id)
          .sort(),
        bannedAbilities: dex.abilities
          .all()
          .filter((a) => rules.isBanned('ability:' + a.id))
          .map((a) => a.id)
          .sort(),
      };
      registry.push({
        id: format.id,
        name: format.name,
        mod,
        battle: format.gameType,
        section: 'Champions',
      });
    }
    // Record all mod sources, including mechanics which aren't serialized.
    for (const file of fs.readdirSync(path.join(root, 'data/mods', mod))) {
      const filename = path.join(root, 'data/mods', mod, file);
      inputs[revision + '/data/mods/' + mod + '/' + file] = hash(
        fs.readFileSync(filename),
      );
    }
  }
}
// Historical contexts are deltas against the fully resolved current snapshot.
const base = contexts.champions;
for (const [id, context] of Object.entries(contexts)) {
  if (id === 'champions') continue;
  for (const type of Object.keys(context.data)) {
    const originalIds = new Set(Object.keys(context.data[type]));
    for (const [key, value] of Object.entries(context.data[type])) {
      if (JSON.stringify(value) === JSON.stringify(base.data[type][key]))
        delete context.data[type][key];
    }
    for (const key of Object.keys(base.data[type])) {
      // A missing historical entry is unavailable, never inherited as a new addition.
      if (!originalIds.has(key)) {
        context.data[type][key] = {
          ...base.data[type][key],
          isNonstandard: 'Future',
        };
      }
    }
  }
}
const outputs = {
  'champions-builder.json': Object.fromEntries(
    Object.entries(contexts).map(([id, c]) => [id, c.data]),
  ),
  'champions-learnsets.json': Object.fromEntries(
    Object.entries(contexts).map(([id, c]) => [id, c.learnsets]),
  ),
  'champions-formats.json': { formats, registry },
};
const provenanceFile = 'lib/showdown-data/champions-provenance.json';
if (fs.existsSync(provenanceFile)) {
  const previous = JSON.parse(fs.readFileSync(provenanceFile, 'utf8'));
  if (
    previous.currentRevision === currentRevision &&
    previous.historicalRevision === historicalRevision
  ) {
    for (const [file, digest] of Object.entries(inputs)) {
      if (previous.inputs[file] && previous.inputs[file] !== digest)
        throw Error('Pinned source differs: ' + file);
    }
  }
}
for (const [file, data] of Object.entries(outputs))
  fs.writeFileSync('lib/showdown-data/' + file, JSON.stringify(data) + '\n');
fs.writeFileSync(
  provenanceFile,
  JSON.stringify(
    {
      currentRevision,
      historicalRevision,
      license: 'MIT',
      source: 'https://github.com/smogon/pokemon-showdown',
      generator: 'scripts/update-champions-data.mjs',
      inputs: Object.fromEntries(
        Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b)),
      ),
      artifacts: Object.fromEntries(
        Object.keys(outputs).map((file) => [
          file,
          {
            sha256: hash(fs.readFileSync('lib/showdown-data/' + file)),
            bytes: fs.statSync('lib/showdown-data/' + file).size,
          },
        ]),
      ),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(contexts).map(([id, c]) => [
        id,
        { pokemon: Object.keys(c.learnsets).length, revision: c.revision },
      ]),
    ),
  ),
);
