import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  builderCatalog,
  dexFor,
  availableIn,
  learnsetSuggestions,
  matchesMoveChoice,
  matchesItemCategory,
  builderMatchRank,
  presentedSpecies,
  actualStat,
  editEVs,
} from '../.test-build/builder-data.mjs';
import {
  championsContext,
  championsRules,
  championsFormatBanned,
  championsAvailabilityLabel,
} from '../.test-build/champions-context.mjs';
import {
  speciesSelectionPatch,
  creationLevel,
  requiredItems,
  stepEV,
} from '../.test-build/showdown-builder.mjs';
import {
  newSlot,
  readVisualTeam,
  patchVisualSlot,
} from '../.test-build/visual-team.mjs';
import {
  completeAuthoredTeam,
  patchAuthoredSlot,
} from '../.test-build/builder-defaults.mjs';
import { assistanceFormat, searchFormats } from '../.test-build/formats.mjs';

const mc = 'gen9championsvgc2026regmc',
  mb = 'gen9championsvgc2026regmb',
  ma = 'gen9championsvgc2026regma';
let passed = 0;
async function check(name, run) {
  await run();
  passed++;
  console.log('PASS Champions ' + name);
}
const has = (format, kind, name) =>
  builderCatalog(format)[kind].some((e) => e.name === name);
function authored(format, species = 'Venusaur') {
  const slot = newSlot();
  return patchAuthoredSlot(
    slot,
    speciesSelectionPatch(format, slot.set, species, { authored: true }),
    format,
  );
}
await check(
  'game species availability is per form, independent of SV and National Dex caches',
  () => {
    assert.ok(has(mc, 'species', 'Venusaur'));
    assert.ok(!has(mc, 'species', 'Koraidon'));
    assert.ok(!has(mc, 'species', 'Bulbasaur'));
    assert.ok(has(mc, 'species', 'Charizard-Mega-X'));
    assert.ok(!has(mc, 'species', 'Charizard-Gmax'));
    assert.ok(has(mc, 'species', 'Absol-Mega-Z'));
    assert.ok(has(mc, 'species', 'Garchomp-Mega-Z'));
    assert.ok(has('gen9ou', 'species', 'Koraidon'));
    assert.ok(!has('gen9ou', 'species', 'Charizard-Mega-X'));
    assert.ok(has('gen9nationaldex', 'species', 'Charizard-Mega-X'));
    assert.notEqual(builderCatalog(mc), builderCatalog(mb));
    assert.equal(builderCatalog(mc), builderCatalog('gen9championsou'));
  },
);
await check(
  'historical rosters and Mega Stones do not inherit later availability',
  () => {
    assert.ok(has(mc, 'species', 'Rillaboom'));
    assert.ok(!has(mb, 'species', 'Rillaboom'));
    assert.ok(!has(ma, 'species', 'Rillaboom'));
    assert.ok(has(mb, 'species', 'Raichu-Mega-X'));
    assert.ok(!has(ma, 'species', 'Raichu-Mega-X'));
    for (const format of [ma, mb, mc])
      assert.ok(has(format, 'species', 'Venusaur'));
    assert.ok(has(mc, 'item', 'Absolite Z'));
    assert.ok(!has(mb, 'item', 'Absolite Z'));
    assert.ok(has(mb, 'item', 'Raichunite X'));
    assert.ok(!has(ma, 'item', 'Raichunite X'));
  },
);
await check('game items and item categories use the same resolved pool', () => {
  assert.ok(has(mc, 'item', 'Leftovers'));
  assert.ok(has(mc, 'item', 'Charizardite X'));
  assert.ok(!has(mc, 'item', 'Assault Vest'));
  assert.ok(has('gen9ou', 'item', 'Assault Vest'));
  const items = builderCatalog(mc).item.filter((i) =>
    matchesItemCategory(i, 'mega'),
  );
  assert.ok(items.some((i) => i.name === 'Absolite Z'));
  assert.ok(!items.some((i) => i.name === 'Leftovers'));
});
await check('game availability and competitive bans are separate', () => {
  const format = 'gen9championsou';
  assert.ok(has(format, 'item', 'Light Clay'));
  assert.ok(availableIn(format, dexFor(format).items.get('Light Clay')));
  assert.ok(championsFormatBanned(format, 'item', 'Light Clay'));
  assert.ok(!championsFormatBanned(mc, 'item', 'Light Clay'));
  assert.ok(has(format, 'species', 'Salamence-Mega'));
  assert.ok(championsFormatBanned(format, 'species', 'Salamence-Mega'));
  assert.ok(!championsFormatBanned(mc, 'species', 'Salamence-Mega'));
  assert.match(
    championsAvailabilityLabel(format, 'item', 'Light Clay', true),
    /Available.*banned/,
  );
  assert.match(
    championsAvailabilityLabel(mc, 'item', 'Assault Vest', false),
    /^Unavailable/,
  );
});
await check(
  'Champions learns its own moves and never inherits SV/pre-evolution moves',
  async () => {
    const sv = await learnsetSuggestions('gen9ou', 'Incineroar');
    const champions = await learnsetSuggestions(mc, 'Incineroar');
    assert.ok(sv.has('uturn') && sv.has('knockoff'));
    assert.ok(!champions.has('uturn') && !champions.has('knockoff'));
    assert.ok(
      champions.has('fakeout') &&
        champions.has('partingshot') &&
        champions.has('superpower'),
    );
    assert.equal((await learnsetSuggestions(mc, 'Koraidon')).size, 0);
    assert.deepEqual(
      await learnsetSuggestions(mc, 'Absol-Mega-Z'),
      await learnsetSuggestions(mc, 'Absol'),
    );
  },
);
await check(
  'move search, STAB, coverage, status, type and completion use the same learnset',
  async () => {
    const learnset = await learnsetSuggestions(mc, 'Incineroar');
    const rows = (query, filters = {}, showAll = false) =>
      builderCatalog(mc).moves.filter(
        (m) =>
          matchesMoveChoice(mc, 'Incineroar', m, learnset, filters, showAll) &&
          builderMatchRank('moves', mc, m.name, query) >= 0,
      );
    assert.ok(rows('fake').some((m) => m.name === 'Fake Out'));
    assert.equal(rows('U-turn').length, 0);
    assert.equal(rows('Knock Off', {}, true).length, 0);
    assert.ok(
      rows('', { role: 'stab' }).every(
        (m) => ['Fire', 'Dark'].includes(m.type) && m.category !== 'Status',
      ),
    );
    assert.ok(
      rows('', { role: 'coverage' }).some((m) => m.name === 'Superpower'),
    );
    assert.ok(
      rows('', { role: 'status' }).some((m) => m.name === 'Parting Shot'),
    );
    assert.equal(rows('Superpower', { category: 'Special' }).length, 0);
    assert.equal(rows('Flare Blitz', { type: 'Water' }).length, 0);
  },
);
await check(
  'historical learnsets and move properties follow upstream mod overrides',
  async () => {
    assert.ok((await learnsetSuggestions(mb, 'Archaludon')).has('metalburst'));
    assert.ok(!(await learnsetSuggestions(mc, 'Archaludon')).has('metalburst'));
    assert.equal(dexFor(mb).moves.get('Wish').pp, 10);
    assert.equal(dexFor(mc).moves.get('Wish').pp, 5);
    assert.equal(dexFor(mc).moves.get('Apple Acid').basePower, 90);
    assert.equal(dexFor('gen9ou').moves.get('Apple Acid').basePower, 80);
    assert.equal(dexFor(mc).moves.get('Clangorous Soul').accuracy, true);
    assert.equal(dexFor(mc).moves.get('Thunder Wave').pp, 20);
  },
);
await check(
  'abilities, base stats and form triggers use the pinned Dex',
  () => {
    const mega = dexFor(mc).species.get('Meganium-Mega');
    assert.equal(mega.abilities['0'], 'Mega Sol');
    assert.equal(mega.baseStats.spa, 143);
    assert.deepEqual(requiredItems(mc, 'Absol-Mega-Z'), ['Absolite Z']);
    const slot = authored(mc, 'Absol-Mega-Z');
    assert.equal(slot.set.species, 'Absol');
    assert.equal(slot.set.item, 'Absolite Z');
    assert.equal(presentedSpecies(mc, slot.set).name, 'Absol-Mega-Z');
    assert.equal(dexFor(mc).abilities.get('Healer').shortDesc, '');
    assert.match(dexFor(mc).moves.get('Flare Blitz').shortDesc, /recoil/i);
  },
);
await check(
  'imported unsupported species, items, moves, fields and explicit levels survive save and format changes',
  () => {
    const raw =
      'Koraidon @ Assault Vest\r\nAbility: Orichalcum Pulse\r\nLevel: 73\r\nTera Type: Fire\r\n- Collision Course\r\n- Custom Move\r\nCustom Field: keep me';
    const slots = readVisualTeam(raw, mc).slots;
    for (const format of [mc, mb, ma, 'gen9ou']) {
      assert.equal(completeAuthoredTeam(slots, raw, format).showdown_text, raw);
      assert.equal(slots[0].set.level, 73);
      assert.equal(slots[0].set.item, 'Assault Vest');
      assert.deepEqual(slots[0].set.moves, ['Collision Course', 'Custom Move']);
    }
    const changed = patchVisualSlot(slots[0], { nature: 'Adamant' });
    assert.match(changed.raw, /^Koraidon @ Assault Vest/);
    assert.match(
      changed.raw,
      /- Collision Course\n- Custom Move\nCustom Field: keep me/,
    );
    assert.equal(changed.set.level, 73);
  },
);
await check(
  'manual unsupported moves stay verbatim and are identified against that species pool',
  async () => {
    const slot = patchAuthoredSlot(
      authored(mc, 'Incineroar'),
      { moves: ['U-turn', 'my Custom Move'] },
      mc,
    );
    assert.deepEqual(slot.set.moves, ['U-turn', 'my Custom Move']);
    assert.match(slot.raw, /- U-turn\n- my Custom Move/);
    const pool = await learnsetSuggestions(mc, slot.set.species);
    assert.ok(!pool.has('uturn'));
    assert.ok(!pool.has('mycustommove'));
    assert.match(
      completeAuthoredTeam([slot], slot.raw, mc).showdown_text,
      /- my Custom Move/,
    );
  },
);
await check(
  'VGC creation defaults apply when selecting each new Pokémon',
  () => {
    for (const format of [mc, mb, ma, 'gen9vgc2026regi', 'gen4vgc2010']) {
      const blank = newSlot();
      assert.equal(blank.set.level, undefined);
      const s = authored(format);
      assert.equal(s.set.level, 50);
      assert.match(s.raw, /Level: 50/);
      assert.equal(readVisualTeam(s.raw, format).slots[0].set.level, 50);
      assert.equal(authored(format, 'Charizard').set.level, 50);
    }
  },
);
await check(
  'Singles and ordinary non-VGC Doubles keep their creation defaults',
  () => {
    for (const format of ['gen9ou', 'gen9doublesou', 'gen7doublesubers']) {
      assert.equal(creationLevel(format), undefined);
      assert.equal(authored(format).set.level, undefined);
      assert.doesNotMatch(authored(format).raw, /Level:/);
    }
    assert.equal(authored('gen9championsou').set.level, 50); // its own upstream rule
  },
);
await check(
  'imported, manual and already populated authored levels are not overwritten by VGC defaults',
  () => {
    for (const level of [1, 42, 50, 73, 100]) {
      const raw = `Venusaur\nLevel: ${level}\n- Protect`;
      const imported = readVisualTeam(raw, mc).slots[0];
      assert.equal(
        speciesSelectionPatch(mc, imported.set, 'Charizard').level,
        undefined,
      );
      assert.equal(
        completeAuthoredTeam([imported], raw, mc).showdown_text,
        raw,
      );
      const manuallySet = patchAuthoredSlot(newSlot(), { level }, mc);
      const s = patchAuthoredSlot(
        manuallySet,
        speciesSelectionPatch(mc, manuallySet.set, 'Venusaur', {
          authored: true,
        }),
        mc,
      );
      assert.equal(s.set.level, level);
      const existing = patchAuthoredSlot(
        authored('gen9ou'),
        { level },
        'gen9ou',
      );
      assert.equal(
        patchAuthoredSlot(
          existing,
          speciesSelectionPatch(mc, existing.set, 'Charizard', {
            authored: true,
          }),
          mc,
        ).set.level,
        level,
      );
    }
    const existing = authored('gen9ou');
    assert.equal(
      speciesSelectionPatch(mc, existing.set, 'Charizard', { authored: true })
        .level,
      undefined,
    );
  },
);
await check(
  'Champions stats use points, fixed IVs and no Tera/Attack-IV authoring defaults',
  () => {
    const set = {
      species: 'Venusaur',
      moves: [],
      level: 73,
      nature: 'Modest',
      evs: { hp: 32, spa: 32, spe: 2 },
      ivs: { hp: 0, spa: 0 },
    };
    assert.equal(actualStat(mc, set, 'hp'), 187);
    assert.equal(actualStat(mc, set, 'spa'), 167);
    assert.equal(editEVs(set, mc, 'spe', 20).spe, 2);
    assert.equal(stepEV({ ...set, evs: { spa: 3 } }, mc, 'spa', 1).spa, 4);
    const s = patchAuthoredSlot(
      authored(mc),
      { moves: ['Protect', 'Energy Ball', 'Sludge Bomb', 'Earth Power'] },
      mc,
    );
    assert.equal(s.set.teraType, undefined);
    assert.equal(s.set.ivs, undefined);
  },
);
await check(
  'every registered Champions format selects its pinned historical/current context',
  () => {
    for (const letter of ['a', 'b', 'c']) {
      for (const suffix of [
        `bssregm${letter}`,
        `vgc2026regm${letter}`,
        `vgc2026regm${letter}bo3`,
      ]) {
        const id = 'gen9champions' + suffix;
        assert.equal(assistanceFormat(id), id);
        assert.equal(
          championsContext(id),
          letter === 'c' ? 'champions' : 'championsregm' + letter,
        );
        assert.ok(championsRules(id));
        assert.ok(searchFormats('Champions').some((f) => f.id === id));
      }
    }
    assert.equal(
      championsContext('gen9champions4v4doublesuu'),
      'championsregmb',
    );
  },
);
await check(
  'snapshot hashes and current/historical roster containment are stable',
  async () => {
    const manifest = JSON.parse(
      await fs.readFile('lib/showdown-data/champions-provenance.json', 'utf8'),
    );
    assert.equal(
      manifest.currentRevision,
      '524413e8415fe179781e9bbcc7c79a85543b3409',
    );
    for (const [name, info] of Object.entries(manifest.artifacts)) {
      const bytes = await fs.readFile('lib/showdown-data/' + name);
      assert.equal(bytes.length, info.bytes);
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        info.sha256,
      );
    }
    const pools = JSON.parse(
      await fs.readFile('lib/showdown-data/champions-learnsets.json', 'utf8'),
    );
    const metadata = JSON.parse(
      await fs.readFile('lib/showdown-data/champions-builder.json', 'utf8'),
    );
    assert.equal(Object.keys(pools.champions).length, 392);
    assert.equal(Object.keys(pools.championsregmb).length, 357);
    assert.equal(Object.keys(pools.championsregma).length, 319);
    for (const id of Object.keys(pools.championsregma))
      assert.ok(pools.championsregmb[id], id);
    for (const id of Object.keys(pools.championsregmb))
      assert.ok(pools.champions[id], id);
    for (const [mod, pool] of Object.entries(pools)) {
      const format =
        mod === 'champions' ? mc : mod === 'championsregmb' ? mb : ma;
      for (const [id, moves] of Object.entries(pool)) {
        const expected =
          metadata[mod].Species[id] || metadata.champions.Species[id];
        const species = dexFor(format).species.get(id);
        assert.equal(species.name, expected.name, id);
        assert.deepEqual(species.abilities, expected.abilities, id);
        assert.deepEqual(species.types, expected.types, id);
        assert.deepEqual(species.baseStats, expected.baseStats, id);
        assert.deepEqual([...(await learnsetSuggestions(format, id))], moves);
        assert.ok(availableIn(format, dexFor(format).species.get(id)), id);
        for (const move of moves)
          assert.ok(
            availableIn(format, dexFor(format).moves.get(move)),
            id + ':' + move,
          );
      }
    }
  },
);
console.log(passed + ' Champions/VGC checks passed.');
