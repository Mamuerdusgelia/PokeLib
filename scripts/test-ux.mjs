import assert from 'node:assert/strict';
import {
  readVisualTeam,
  patchVisualSlot,
  writeVisualTeam,
  moveSlot,
  newSlot,
} from '../.test-build/visual-team.mjs';
import { parseShowdown } from '../.test-build/showdown.mjs';
import { describeFormat, groupFormats } from '../.test-build/format-groups.mjs';
import {
  addSearchChip,
  queryWithFilters,
  activeFilter,
} from '../.test-build/search-filters.mjs';
import { planQuery } from '../.test-build/search.mjs';
import { demoDrafts } from '../.test-build/demo.mjs';
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('PASS UX ' + name);
}
const raw =
  'Dreamer (Darkrai) @ Life Orb\nTrait: Bad Dreams\nShiny: Yes\nHappiness: 42\nEVs: 4 Def / 252 SpA / 252 Spe\nIVs: 0 Atk\nTimid Nature\nTera Type: Poison\nCustom Field: leave this alone\n~ Dark Pulse\n- Ice Beam\n- Nasty Plot\n- Sludge Bomb\n- Protect';
const slot = readVisualTeam(raw, 'gen9ou', [], ['Darkrai note']).slots[0];
check('untouched raw text and all five moves are retained', () => {
  assert.equal(slot.raw, raw);
  assert.equal(slot.set.moves.length, 5);
});
check(
  'item edit preserves unknown lines, alias, gender fields and notes',
  () => {
    const next = patchVisualSlot(slot, { item: 'Focus Sash' });
    assert.equal(next.raw, raw.replace('Life Orb', 'Focus Sash'));
    assert.equal(next.note, 'Darkrai note');
  },
);
check('each structured field round-trips through maintained parser', () => {
  for (const patch of [
    { species: 'Kyogre' },
    { name: 'Test nickname' },
    { item: 'Leftovers' },
    { ability: 'Drizzle' },
    { teraType: 'Water' },
    { level: 50 },
    { nature: 'Modest' },
    { evs: { hp: 252, spa: 252, spd: 4 } },
    { ivs: { atk: 0, spe: 0 } },
    { moves: ['Surf', 'Protect'] },
    { happiness: 0 },
    { shiny: false },
  ]) {
    const next = patchVisualSlot(slot, patch),
      parsed = parseShowdown(next.raw).sets[0];
    const key = Object.keys(patch)[0];
    if (key === 'evs' || key === 'ivs')
      for (const [stat, value] of Object.entries(patch[key]))
        assert.equal(parsed[key][stat], value);
    else if (key === 'shiny') assert.equal(!!parsed.shiny, false);
    else assert.deepEqual(parsed[key], patch[key]);
    assert.ok(next.raw.includes('Custom Field: leave this alone'));
  }
});
check('species changes do not invent nicknames', () => {
  const base = readVisualTeam('Darkrai\n- Ice Beam', 'gen9ou').slots[0];
  const next = patchVisualSlot(base, { species: 'Kyogre' });
  assert.equal(next.raw.split('\n')[0], 'Kyogre');
});
check(
  'old generations preserve extra export properties on unrelated edits',
  () => {
    for (const format of ['gen2ou', 'gen5ou', 'gen8ou', 'gen9ou']) {
      const text =
        'Pikachu @ Light Ball\nAbility: Static\nShiny: Yes\nHappiness: 0\nGigantamax: Yes\nDynamax Level: 5\nPokeball: Great Ball\n- Hidden Power [Ice]\n- Frustration';
      const s = readVisualTeam(text, format).slots[0];
      assert.equal(
        patchVisualSlot(s, { item: 'Leftovers' }).raw,
        text.replace('Light Ball', 'Leftovers'),
      );
    }
  },
);
check(
  'visual reorder moves notes with Pokémon and additions have no note',
  () => {
    const slots = readVisualTeam(
      demoDrafts[0].showdown_text,
      'gen9ou',
      [],
      ['first', 'second'],
    ).slots;
    const next = moveSlot(slots, 0, 1);
    assert.equal(next[1].note, 'first');
    assert.equal(next[1].id, slots[0].id);
    assert.equal(newSlot().note, '');
  },
);
check(
  'raw reorder reattaches notes by identity and removed notes require review',
  () => {
    const slots = readVisualTeam(
      'Darkrai\n- Ice Beam\n\nKyogre\n- Surf',
      'gen9ou',
      [],
      ['darkrai', 'kyogre'],
    ).slots;
    const next = readVisualTeam(
      writeVisualTeam([...slots].reverse()),
      'gen9ou',
      slots,
    );
    assert.deepEqual(
      next.slots.map((s) => s.note),
      ['kyogre', 'darkrai'],
    );
    const replaced = readVisualTeam(
      'Rayquaza\n- Dragon Ascent\n\nKyogre\n- Surf',
      'gen9ou',
      slots,
    );
    assert.equal(replaced.orphans[0].note, 'darkrai');
    assert.equal(replaced.slots[0].note, '');
    assert.deepEqual(
      readVisualTeam('', 'gen9ou', slots).orphans.map((n) => n.note),
      ['darkrai', 'kyogre'],
    );
  },
);
check(
  'seven Pokémon are retained and unsafe packed layout is rejected visually',
  () => {
    const text = Array.from({ length: 7 }, () => 'Pikachu\n- Thunderbolt').join(
      '\n\n',
    );
    assert.equal(readVisualTeam(text, 'gen9ou').slots.length, 7);
    assert.throws(() =>
      readVisualTeam('Pikachu||lightball|static|thunderbolt', 'gen9ou'),
    );
  },
);
check(
  'source alias and compound chips preserve same-set query planning',
  () => {
    const chips = [
      { field: 'from', value: 'Strange Name' },
      { field: 'year', value: '2024' },
      { field: 'pokemon', value: 'Darkrai' },
    ];
    const plan = planQuery(queryWithFilters(chips, 'Ice Beam'));
    assert.ok(
      plan.meta.some((p) => p.field === 'source' && p.value === 'strange'),
    );
    assert.deepEqual(
      plan.set.map((p) => p.field),
      ['pokemon', 'move'],
    );
    assert.deepEqual(activeFilter('Darkrai from:"Strange Name'), {
      field: 'from',
      value: 'Strange Name',
      prefix: 'Darkrai',
    });
  },
);
check('format chip replaces old format while tags and moves combine', () => {
  let chips = addSearchChip(
    [
      { field: 'format', value: 'gen8ou' },
      { field: 'tag', value: 'Rain' },
    ],
    { field: 'format', value: 'gen9ou' },
  );
  assert.equal(chips.filter((c) => c.field === 'format').length, 1);
  chips = addSearchChip(chips, { field: 'tag', value: 'Testing' });
  assert.equal(chips.length, 3);
});
check('formats group automatically with historic and custom fallbacks', () => {
  for (const [value, category] of [
    ['gen9ou', 'Singles'],
    ['gen9vgc2025regi', 'Doubles'],
    ['gen8vgc2022', 'Doubles'],
    ['gen6doublesou', 'Doubles'],
    ['gen9nationaldexubers', 'Singles'],
    ['gen10customformat', 'Singles'],
  ])
    assert.equal(describeFormat(value).category, category);
  assert.equal(describeFormat('gen9vgc2024regg').label, 'VGC 2024 Reg G');
  assert.equal(describeFormat('gen8bdspou').group, 'Gen 8 · BDSP');
  assert.equal(
    describeFormat('gen9championsvgc2026regmabo3').group,
    'Gen 9 · Pokémon Champions',
  );
  assert.ok(groupFormats(['gen9ou', 'gen5ou'])[0].groups.length === 2);
});
check('unfinished sets remain editable without moves', () => {
  for (const text of ['Pikachu', 'Pikachu\nAbility: Static'])
    assert.deepEqual(readVisualTeam(text, 'gen9ou').slots[0].set.moves, []);
});
check('Hidden Power IV edits and move changes retain effective stats', () => {
  const slot = readVisualTeam('Pikachu\n- Hidden Power [Ice]', 'gen5ou')
    .slots[0];
  const changed = patchVisualSlot(slot, { moves: ['Thunderbolt'] });
  assert.deepEqual(
    parseShowdown(changed.raw, 'gen5ou').sets[0].ivs,
    slot.set.ivs,
  );
  const maxed = patchVisualSlot(slot, {
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  });
  assert.equal(parseShowdown(maxed.raw, 'gen5ou').sets[0].ivs.atk, 31);
  const frustrated = readVisualTeam('Pikachu\n- Frustration', 'gen5ou')
    .slots[0];
  assert.equal(
    parseShowdown(
      patchVisualSlot(frustrated, { moves: ['Thunderbolt'] }).raw,
      'gen5ou',
    ).sets[0].happiness,
    0,
  );
});
console.log('UX helpers: ' + passed + ' checks passed.');
