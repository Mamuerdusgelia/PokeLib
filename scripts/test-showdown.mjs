import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  learnableMoves,
  learnsetContext,
} from '../.test-build/showdown-learnsets.mjs';
import {
  speciesSelectionPatch,
  requiredItems,
  stepEV,
  adjacentMove,
  generatedTeamTitle,
} from '../.test-build/showdown-builder.mjs';
import { pokemonSprite } from '../.test-build/pokemon-sprites.mjs';
import {
  builderCatalog,
  dexFor,
  matchesSpeciesQuery,
} from '../.test-build/builder-data.mjs';
import {
  readVisualTeam,
  patchVisualSlot,
} from '../.test-build/visual-team.mjs';
let passed = 0;
await check(
  'type words constrain species types without breaking complete ability names',
  () => {
    const dex = dexFor('gen9ou');
    assert.ok(
      matchesSpeciesQuery(
        'gen9ou',
        dex.species.get('Swampert'),
        'water ground',
      ),
    );
    assert.ok(
      !matchesSpeciesQuery(
        'gen9ou',
        dex.species.get('Clodsire'),
        'water ground',
      ),
    );
    assert.ok(
      matchesSpeciesQuery(
        'gen9ou',
        dex.species.get('Clodsire'),
        'Water Absorb',
      ),
    );
    assert.ok(
      matchesSpeciesQuery('gen9ou', dex.species.get('Magmar'), 'Flame Body'),
    );
    assert.ok(
      matchesSpeciesQuery('gen9ou', dex.species.get('Darkrai'), 'darkrai'),
    );
  },
);
async function check(name, run) {
  await run();
  passed++;
  console.log('PASS Showdown ' + name);
}
await check(
  'HOME move reset and National Dex have distinct complete pools',
  async () => {
    const old = await learnableMoves('gen5ou', 'Charizard');
    const current = await learnableMoves('gen9ou', 'Charizard');
    const national = await learnableMoves('gen9nationaldex', 'Charizard');
    assert.ok(old.has('toxic'));
    assert.ok(!current.has('toxic'));
    assert.ok(national.has('toxic'));
    assert.ok(!old.has('scorchingsands'));
    assert.ok(current.has('scorchingsands'));
    assert.ok(old.size > 70 && current.size > 70);
  },
);
await check(
  'older format tables do not apply Gen 9 DLC exclusions',
  async () => {
    for (const format of ['gen5bw1ou', 'gen3rsou', 'gen3frlgou']) {
      const moves = await learnableMoves(format, 'Porygon');
      assert.ok(moves.has('conversion'), format);
      assert.ok(moves.has('conversion2'), format);
    }
  },
);
await check(
  'regional/cosmetic ancestry and form-specific moves are retained',
  async () => {
    assert.deepEqual(
      await learnableMoves('gen9ou', 'Gastrodon-East'),
      await learnableMoves('gen9ou', 'Gastrodon'),
    );
    assert.deepEqual(
      await learnableMoves('gen9ou', 'Sinistea-Antique'),
      await learnableMoves('gen9ou', 'Sinistea'),
    );
    const dusk = await learnableMoves('gen9ou', 'Lycanroc-Dusk');
    assert.ok(dusk.has('accelerock'));
    assert.ok(dusk.has('crushclaw'));
    assert.ok(
      (await learnableMoves('gen5ou', 'Wormadam-Trash')).has('ironhead'),
    );
    assert.ok(!(await learnableMoves('gen5ou', 'Wormadam')).has('ironhead'));
  },
);
await check(
  'Hidden Power typed entries are both learnable and selectable',
  async () => {
    assert.ok((await learnableMoves('gen5ou', 'Raikou')).has('hiddenpowerice'));
    assert.ok(
      builderCatalog('gen5ou').moves.some((m) => m.id === 'hiddenpowerice'),
    );
    assert.ok(
      (await learnableMoves('gen5ou', 'Smeargle')).has('hiddenpowerice'),
    );
    assert.ok(
      (await learnableMoves('gen9nationaldex', 'Smeargle')).has(
        'hiddenpowerice',
      ),
    );
    assert.ok(
      (await learnableMoves('gen5bh', 'Pikachu')).has('hiddenpowerice'),
    );
  },
);
await check(
  'Smeargle expands Sketch without Z/Max or unsketchable moves',
  async () => {
    const moves = await learnableMoves('gen9ou', 'Smeargle');
    assert.ok(moves.has('spore'));
    assert.ok(moves.has('populationbomb'));
    assert.ok(!moves.has('darkvoid'));
    assert.ok(!moves.has('maxguard'));
    assert.ok(!moves.has('breakneckblitz'));
  },
);
await check('Gen 1 pool excludes newer species and moves', async () => {
  const moves = await learnableMoves('gen1ou', 'Gengar');
  assert.ok(moves.has('thunderbolt'));
  assert.ok(!moves.has('shadowball'));
  assert.equal((await learnableMoves('gen1ou', 'Darkrai')).size, 0);
});
await check('default and valid alternate abilities are chosen narrowly', () => {
  const empty = { species: '', moves: [] };
  assert.equal(
    speciesSelectionPatch('gen9ou', empty, 'Darkrai').ability,
    'Bad Dreams',
  );
  assert.equal(
    speciesSelectionPatch('gen9ou', empty, 'Charizard').ability,
    'Blaze',
  );
  assert.equal(
    speciesSelectionPatch(
      'gen9ou',
      { ...empty, ability: 'Solar Power' },
      'Charizard',
    ).ability,
    'Solar Power',
  );
  assert.deepEqual(
    speciesSelectionPatch(
      'gen9ou',
      {
        species: 'Charizard',
        ability: 'Custom Ability',
        item: 'Custom Item',
        moves: [],
      },
      'Charizard',
    ),
    { species: 'Charizard' },
  );
});
await check(
  'required items follow generation and offer multiple choices',
  () => {
    assert.deepEqual(requiredItems('gen5ou', 'Giratina-Origin'), [
      'Griseous Orb',
    ]);
    assert.deepEqual(requiredItems('gen9ou', 'Giratina-Origin'), [
      'Griseous Core',
    ]);
    assert.deepEqual(requiredItems('gen7ou', 'Arceus-Fire'), [
      'Flame Plate',
      'Firium Z',
    ]);
    assert.deepEqual(requiredItems('gen9ou', 'Arceus-Fire'), ['Flame Plate']);
    assert.deepEqual(requiredItems('gen9nationaldex', 'Arceus-Fire'), [
      'Flame Plate',
      'Firium Z',
    ]);
    assert.equal(
      speciesSelectionPatch(
        'gen9ou',
        { species: '', moves: [] },
        'Ogerpon-Wellspring',
      ).item,
      'Wellspring Mask',
    );
  },
);
await check(
  'switching away from required form clears only its former item',
  () => {
    const patch = speciesSelectionPatch(
      'gen9ou',
      { species: 'Giratina-Origin', item: 'Griseous Core', moves: [] },
      'Giratina',
    );
    assert.equal(patch.item, '');
    assert.equal(patch.ability, 'Pressure');
    assert.equal(
      speciesSelectionPatch(
        'gen9ou',
        { species: 'Giratina-Origin', item: 'Leftovers', moves: [] },
        'Giratina',
      ).item,
      undefined,
    );
  },
);
await check('odd EVs stay unchanged until an explicit four-point edit', () => {
  const set = {
    species: 'Charizard',
    moves: [],
    evs: { hp: 1, spa: 252, spe: 252 },
  };
  assert.equal(stepEV(set, 'gen9ou', 'hp', 1).hp, 5);
  assert.equal(set.evs.hp, 1);
  assert.equal(
    stepEV({ ...set, evs: { ...set.evs, hp: 5 } }, 'gen9ou', 'hp', 1).hp,
    6,
  );
  assert.equal(stepEV(set, 'gen9ou', 'spa', 1).spa, 252);
  assert.equal(stepEV(set, 'gen9ou', 'hp', -1).hp, 0);
  assert.equal(
    stepEV({ species: 'Gengar', moves: [] }, 'gen1ou', 'spa', -1).spd,
    248,
  );
});
await check(
  'move traversal terminates and fresh titles do not reuse a counter',
  () => {
    assert.equal(adjacentMove(0, 4, -1), null);
    assert.equal(adjacentMove(3, 4, 1), null);
    assert.equal(adjacentMove(1, 4, -1), 0);
    assert.equal(adjacentMove(1, 4, 1), 2);
    const titles = Array.from({ length: 100 }, generatedTeamTitle);
    assert.equal(new Set(titles).size, 100);
    assert.match(titles[0], /^Untitled [a-f0-9]{8}$/);
  },
);
await check('canonical sprite names cover punctuation and forms', () => {
  for (const [species, filename] of Object.entries({
    'Ho-Oh': 'hooh',
    "Farfetch'd": 'farfetchd',
    'Mr. Mime': 'mrmime',
    'Giratina-Origin': 'giratina-origin',
    'Landorus-Therian': 'landorus-therian',
    'Urshifu-Rapid-Strike': 'urshifu-rapidstrike',
    'Ogerpon-Wellspring': 'ogerpon-wellspring',
    'Indeedee-F': 'indeedee-f',
  }))
    assert.ok(
      pokemonSprite({ species }).url.endsWith('/' + filename + '.png'),
      species,
    );
  assert.equal(pokemonSprite({ species: 'Not a Pokémon' }), null);
});
await check(
  'shiny and real female sprites use independent canonical URLs',
  () => {
    assert.match(
      pokemonSprite({ species: 'Ho-Oh', shiny: true }).url,
      /gen5-shiny\/hooh.png$/,
    );
    assert.match(
      pokemonSprite({ species: 'Pikachu', gender: 'F' }).url,
      /pikachu-f.png$/,
    );
    assert.match(
      pokemonSprite({ species: 'Pikachu', gender: 'M' }).url,
      /pikachu.png$/,
    );
    assert.match(
      pokemonSprite({ species: 'Unfezant', gender: 'F', shiny: true }).url,
      /gen5-shiny\/unfezant-f.png$/,
    );
    assert.match(
      pokemonSprite({ species: 'Gengar', gender: 'F' }).url,
      /gengar.png$/,
    );
  },
);
await check(
  'defaults and EV edits preserve raw lines, Hidden Power and note identity',
  () => {
    const raw =
      'Raikou @ Leftovers\nAbility: Pressure\nEVs: 1 HP\n- Hidden Power Ice\nCustom Field: retained';
    const slot = readVisualTeam(raw, 'gen5ou', [], ['keep note']).slots[0];
    const changed = patchVisualSlot(slot, {
      ...speciesSelectionPatch('gen5ou', slot.set, 'Raikou'),
      evs: stepEV(slot.set, 'gen5ou', 'hp', 1),
    });
    const reopened = readVisualTeam(changed.raw, 'gen5ou').slots[0];
    assert.equal(changed.id, slot.id);
    assert.equal(changed.note, 'keep note');
    assert.ok(changed.raw.includes('Custom Field: retained'));
    assert.deepEqual(reopened.set.ivs, slot.set.ivs);
    assert.equal(reopened.set.evs.hp, 5);
  },
);
await check('vendored data hashes and sizes reproduce provenance', async () => {
  const provenance = JSON.parse(
    await fs.readFile('lib/showdown-data/provenance.json', 'utf8'),
  );
  for (const [name, expected] of Object.entries(provenance.files)) {
    const bytes = await fs.readFile('lib/showdown-data/' + name + '.json');
    assert.equal(bytes.length, expected.bytes, name);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      expected.sha256,
      name,
    );
  }
  assert.equal(learnsetContext('gen8bdspou').table, 'gen8bdsp');
});
console.log(passed + ' Showdown checks passed.');
