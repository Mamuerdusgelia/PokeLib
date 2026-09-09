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
  defaultTeraType,
} from '../.test-build/showdown-builder.mjs';
import { pokemonSprite } from '../.test-build/pokemon-sprites.mjs';
import {
  builderCatalog,
  dexFor,
  matchesSpeciesQuery,
  builderMatchRank,
  resolveBuilderAlias,
  presentedSpecies,
  presentedSet,
  canonicalMoveName,
  actualStat,
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
await check(
  'move rows have unique identities and Hidden Power obeys the current query',
  () => {
    for (const format of [
      'gen1ou',
      'gen2ou',
      'gen5ou',
      'gen8ou',
      'gen9ou',
      'gen9nationaldex',
    ]) {
      const catalog = builderCatalog(format);
      for (const [kind, rows] of Object.entries(catalog))
        assert.equal(
          new Set(rows.map((row) => row.id)).size,
          rows.length,
          format + ':' + kind,
        );
      const stealth = catalog.moves.filter(
        (move) =>
          builderMatchRank('moves', format, move.name, 'stealth rock') >= 0,
      );
      assert.ok(
        stealth.every((move) => move.name === 'Stealth Rock'),
        format,
      );
      if (format !== 'gen1ou' && format !== 'gen2ou')
        assert.ok(stealth.length === 1);
    }
    assert.equal(
      builderCatalog('gen5ou').moves.filter((move) =>
        move.id.startsWith('hiddenpower'),
      ).length,
      17,
    );
    assert.equal(
      builderCatalog('gen9ou').moves.filter((move) =>
        move.id.startsWith('hiddenpower'),
      ).length,
      0,
    );
    assert.equal(
      builderMatchRank('moves', 'gen5ou', 'Hidden Power Ice', 'hpice'),
      1,
    );
    assert.equal(
      builderMatchRank(
        'moves',
        'gen5ou',
        'Hidden Power Ice',
        'hidden power fire',
      ),
      -1,
    );
  },
);
await check(
  'official aliases are kind-aware and rank below genuine names',
  () => {
    for (const [kind, query, name] of [
      ['item', 'hdb', 'Heavy-Duty Boots'],
      ['item', 'boots', 'Heavy-Duty Boots'],
      ['moves', 'cc', 'Close Combat'],
      ['moves', 'eq', 'Earthquake'],
      ['species', 'lando', 'Landorus'],
      ['moves', 'tbolt', 'Thunderbolt'],
    ]) {
      assert.equal(resolveBuilderAlias(kind, 'gen9ou', query), name);
      assert.equal(builderMatchRank(kind, 'gen9ou', name, query), 1);
      assert.equal(builderMatchRank(kind, 'gen9ou', query, query), 0);
    }
    assert.equal(resolveBuilderAlias('species', 'gen9ou', 'hdb'), undefined);
    assert.equal(resolveBuilderAlias('item', 'gen5ou', 'hdb'), undefined);
    assert.equal(
      builderMatchRank('moves', 'gen9ou', 'Close Combat', 'close'),
      2,
    );
    assert.equal(
      builderMatchRank('moves', 'gen9ou', 'Close Combat', 'combat'),
      3,
    );
  },
);
await check(
  'useful triggered battle forms are selectable without ambiguous or Tera states',
  () => {
    const ordinary = builderCatalog('gen9ou').species.map(
      (species) => species.name,
    );
    for (const name of [
      'Zacian-Crowned',
      'Zamazenta-Crowned',
      'Meloetta-Pirouette',
    ])
      assert.ok(ordinary.includes(name), name);
    for (const name of [
      'Ogerpon-Wellspring-Tera',
      'Terapagos-Stellar',
      'Mimikyu-Busted',
      'Zygarde-Complete',
    ])
      assert.ok(!ordinary.includes(name), name);
    const old = builderCatalog('gen7ou').species.map((species) => species.name);
    assert.ok(old.includes('Charizard-Mega-X'));
    assert.ok(old.includes('Rayquaza-Mega'));
    assert.ok(!old.includes('Necrozma-Ultra'));
    assert.ok(!old.includes('Zacian-Crowned'));
  },
);
await check(
  'Crowned selection stores base species and item while presenting Crowned stats and moves',
  () => {
    const empty = { species: '', moves: [] };
    for (const [name, base, item, move] of [
      ['Zacian-Crowned', 'Zacian', 'Rusted Sword', 'Behemoth Blade'],
      ['Zamazenta-Crowned', 'Zamazenta', 'Rusted Shield', 'Behemoth Bash'],
    ]) {
      const set = {
        ...empty,
        ...speciesSelectionPatch('gen9ou', empty, name),
        moves: ['Iron Head'],
      };
      assert.equal(set.species, base);
      assert.equal(set.item, item);
      assert.equal(presentedSpecies('gen9ou', set).name, name);
      assert.deepEqual(presentedSet('gen9ou', set).moves, [move]);
      assert.equal(canonicalMoveName('gen9ou', set, move), 'Iron Head');
      assert.deepEqual(set.moves, ['Iron Head']);
      const hero = { ...set, ...speciesSelectionPatch('gen9ou', set, base) };
      assert.equal(hero.item, '');
      assert.equal(presentedSpecies('gen9ou', hero).name, base);
    }
    const zacian = {
      species: 'Zacian',
      item: 'Rusted Sword',
      moves: ['Iron Head'],
    };
    assert.equal(actualStat('gen9ou', zacian, 'atk'), 336);
    assert.equal(actualStat('gen8ou', zacian, 'atk'), 376);
    assert.equal(actualStat('gen9ou', { ...zacian, item: '' }, 'atk'), 276);
  },
);
await check(
  'generic transformed selections retain parent ability, triggers and untouched fields',
  () => {
    const empty = {
      species: '',
      moves: ['Protect'],
      teraType: 'Water',
      ivs: { atk: 7 },
    };
    const mega = {
      ...empty,
      ...speciesSelectionPatch('gen7ou', empty, 'Charizard-Mega-X'),
    };
    assert.equal(mega.species, 'Charizard');
    assert.equal(mega.ability, 'Blaze');
    assert.equal(mega.item, 'Charizardite X');
    assert.equal(presentedSpecies('gen7ou', mega).name, 'Charizard-Mega-X');
    assert.deepEqual(mega.moves, ['Protect']);
    assert.deepEqual(mega.ivs, { atk: 7 });
    const ray = {
      ...empty,
      ...speciesSelectionPatch('gen7ou', empty, 'Rayquaza-Mega'),
    };
    assert.equal(ray.species, 'Rayquaza');
    assert.ok(ray.moves.includes('Dragon Ascent'));
    assert.equal(
      presentedSpecies('gen7ou', ray, 'Rayquaza-Mega').name,
      'Rayquaza-Mega',
    );
    assert.equal(presentedSpecies('gen7ou', ray).name, 'Rayquaza-Mega');
  },
);
await check(
  'Tera defaults are authored-only, respect forced types, and retain manual values',
  () => {
    const empty = { species: '', moves: [] };
    assert.equal(
      speciesSelectionPatch('gen9ou', empty, 'Garchomp', { authored: true })
        .teraType,
      'Dragon',
    );
    assert.equal(
      speciesSelectionPatch('gen9ou', empty, 'Ogerpon-Wellspring', {
        authored: true,
      }).teraType,
      'Water',
    );
    assert.equal(defaultTeraType('gen9ou', 'Terapagos'), 'Stellar');
    assert.equal(defaultTeraType('gen8ou', 'Garchomp'), undefined);
    assert.equal(
      speciesSelectionPatch('gen8ou', empty, 'Garchomp', { authored: true })
        .teraType,
      undefined,
    );
    assert.equal(
      speciesSelectionPatch('gen9ou', empty, 'Garchomp').teraType,
      undefined,
    );
    assert.equal(
      speciesSelectionPatch(
        'gen9ou',
        { ...empty, teraType: 'Fire' },
        'Ogerpon-Wellspring',
        { authored: true },
      ).teraType,
      undefined,
    );
    assert.equal(
      speciesSelectionPatch(
        'gen9ou',
        { ...empty, teraType: 'Grass' },
        'Ogerpon-Wellspring',
        { authored: true, teraManaged: true },
      ).teraType,
      'Water',
    );
  },
);
await check(
  'Crowned presentation leaves imported raw text and notes unchanged until an explicit edit',
  () => {
    const raw =
      'Zacian @ Rusted Sword\nAbility: Custom Ability\nTera Type: Water\nIVs: 7 Atk\n- Iron Head\nUnknown Line: retained';
    const slot = readVisualTeam(raw, 'gen9ou', [], ['source note']).slots[0];
    assert.equal(presentedSet('gen9ou', slot.set).species, 'Zacian-Crowned');
    assert.equal(slot.raw, raw);
    assert.equal(slot.note, 'source note');
    const changed = patchVisualSlot(slot, {
      moves: [
        canonicalMoveName('gen9ou', slot.set, 'Behemoth Blade'),
        'Protect',
      ],
    });
    assert.ok(changed.raw.includes('Unknown Line: retained'));
    assert.ok(changed.raw.includes('Ability: Custom Ability'));
    assert.ok(changed.raw.includes('Tera Type: Water'));
    assert.ok(changed.raw.includes('- Iron Head'));
    assert.equal(changed.note, 'source note');
    const importedForm = {
      species: 'Zacian-Crowned',
      item: 'Leftovers',
      ability: 'Custom Ability',
      moves: ['Behemoth Blade'],
    };
    assert.deepEqual(
      speciesSelectionPatch('gen9ou', importedForm, importedForm.species),
      { species: importedForm.species },
    );
  },
);
await check(
  'catalog cache shares availability contexts without conflating generations or National Dex',
  () => {
    assert.equal(builderCatalog('gen9ou'), builderCatalog('gen9ubers'));
    assert.equal(builderCatalog('gen9ou'), builderCatalog('gen9customformat'));
    assert.equal(
      builderCatalog('gen9nationaldex'),
      builderCatalog('gen9natdexubers'),
    );
    assert.notEqual(builderCatalog('gen9ou'), builderCatalog('gen8ou'));
    assert.notEqual(
      builderCatalog('gen9ou'),
      builderCatalog('gen9nationaldex'),
    );
  },
);
await check(
  'forme inference does not assign a Z-crystal type and reselection preserves imports',
  () => {
    assert.equal(
      presentedSpecies('gen7ou', {
        species: 'Arceus',
        item: 'Firium Z',
        moves: [],
      }).name,
      'Arceus',
    );
    assert.equal(
      presentedSpecies('gen7ou', {
        species: 'Arceus',
        item: 'Flame Plate',
        moves: [],
      }).name,
      'Arceus-Fire',
    );
    const imported = {
      species: 'Zacian',
      item: 'Rusted Sword',
      ability: 'Custom Ability',
      teraType: 'Water',
      moves: ['Iron Head'],
    };
    assert.deepEqual(
      speciesSelectionPatch('gen9ou', imported, 'Zacian-Crowned'),
      { species: 'Zacian' },
    );
  },
);
console.log(passed + ' Showdown checks passed.');
