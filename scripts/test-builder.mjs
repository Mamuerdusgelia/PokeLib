import assert from 'node:assert/strict';
import {
  actualStat,
  editEVs,
  generationFor,
  builderCatalog,
  builderDraft,
  learnsetSuggestions,
  natureForModifiers,
  dexFor,
} from '../.test-build/builder-data.mjs';
import {
  readVisualTeam,
  patchVisualSlot,
} from '../.test-build/visual-team.mjs';
import { emptyDraft, localDate } from '../.test-build/domain.mjs';
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log('PASS builder ' + name);
}
await check(
  'blank draft inherits context without changing imported dates',
  () => {
    assert.equal(builderDraft('gen5ou').format, 'gen5ou');
    assert.equal(builderDraft().format, 'unknown');
    assert.equal(builderDraft().title, 'Untitled team');
    assert.equal(builderDraft().team_date, localDate());
    assert.equal(builderDraft().showdown_text, '');
    assert.equal(emptyDraft(true).team_date_precision, 'unknown');
  },
);
await check(
  'modern stats use level, nature and EVs with correct rounding',
  () => {
    const set = {
      species: 'Darkrai',
      moves: [],
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      level: 100,
    };
    assert.equal(actualStat('gen9ou', set, 'spe'), 383);
    assert.equal(actualStat('gen9ou', set, 'spa'), 369);
    assert.equal(actualStat('gen9ou', { ...set, level: 50 }, 'spe'), 194);
    assert.equal(
      actualStat('gen9ou', { ...set, species: 'Shedinja' }, 'hp'),
      1,
    );
    assert.equal(
      actualStat('gen9ou', { ...set, species: 'not a species' }, 'hp'),
      null,
    );
  },
);
await check(
  'generation catalogs omit future entries and preserve National Dex choices',
  () => {
    const gen5 = builderCatalog('gen5ou');
    assert.ok(gen5.species.some((s) => s.name === 'Darkrai'));
    assert.ok(!gen5.species.some((s) => s.name === 'Dragapult'));
    assert.ok(!gen5.moves.some((s) => s.name === 'Tera Blast'));
    assert.ok(
      !builderCatalog('gen9ou').species.some((s) => s.name === 'Butterfree'),
    );
    assert.ok(
      builderCatalog('gen9nationaldex').species.some(
        (s) => s.name === 'Butterfree',
      ),
    );
    assert.equal(
      dexFor('gen3ou').moves.get('Shadow Ball').category,
      'Physical',
    );
    assert.equal(dexFor('gen4ou').moves.get('Shadow Ball').category, 'Special');
    assert.equal(generationFor('unknown'), 9);
  },
);
await check(
  'EV edits enforce modern per-stat/total caps without resetting other values',
  () => {
    const set = { species: 'Darkrai', moves: [], evs: { spa: 252, spe: 252 } };
    assert.deepEqual(editEVs(set, 'gen9ou', 'hp', 252), {
      spa: 252,
      spe: 252,
      hp: 6,
    });
    assert.equal(editEVs(set, 'gen9ou', 'spa', 900).spa, 252);
    assert.equal(editEVs(set, 'gen9ou', 'spa', -4).spa, 0);
  },
);
await check(
  'old-generation defaults, Special and stat experience are respected',
  () => {
    const set = { species: 'Gengar', moves: [], nature: 'Timid' };
    assert.equal(actualStat('gen1ou', set, 'spa'), 358);
    assert.equal(actualStat('gen1ou', set, 'spe'), 318);
    const evs = editEVs(set, 'gen1ou', 'spa', 100);
    assert.equal(evs.spd, 100);
    assert.equal(evs.hp, 252);
    assert.ok(Object.values(evs).reduce((a, b) => a + b, 0) > 510);
    assert.equal(natureForModifiers('spe', 'atk'), 'Timid');
    assert.equal(natureForModifiers('atk', 'atk'), 'Serious');
  },
);
await check(
  'learnset suggestions inherit form moves and filter future sources',
  async () => {
    const moves = await learnsetSuggestions('gen5ou', 'Rotom-Wash');
    assert.ok(moves.has('hydropump'));
    assert.ok(moves.has('thunderbolt'));
    assert.ok(!moves.has('terablast'));
  },
);
await check(
  'Smeargle suggestions do not leak between standard and National Dex formats',
  async () => {
    const standard = await learnsetSuggestions('gen9ou', 'Smeargle');
    const national = await learnsetSuggestions('gen9nationaldex', 'Smeargle');
    assert.ok(!standard.has('hiddenpower'));
    assert.ok(national.has('hiddenpower'));
    assert.equal(
      await learnsetSuggestions('Gen9NationalDex', 'Smeargle'),
      national,
    );
  },
);
await check(
  'EV and nature controls roundtrip without damaging custom fields or notes',
  () => {
    const slot = readVisualTeam(
      'Darkrai\nIVs: 0 Atk\n- Ice Beam\nCustom Field: retained',
      'gen9ou',
      [],
      ['note'],
    ).slots[0];
    let next = patchVisualSlot(slot, {
      evs: editEVs(slot.set, 'gen9ou', 'spa', 252),
      nature: natureForModifiers('spe', 'atk'),
    });
    next = patchVisualSlot(next, { level: 50 });
    const parsed = readVisualTeam(next.raw, 'gen9ou').slots[0].set;
    assert.equal(parsed.evs.spa, 252);
    assert.equal(parsed.nature, 'Timid');
    assert.equal(parsed.level, 50);
    assert.equal(parsed.ivs.atk, 0);
    assert.ok(next.raw.includes('Custom Field: retained'));
    assert.equal(next.note, 'note');
  },
);
await check('zero stat experience survives save/reopen in Gen 1 and 2', () => {
  for (const format of ['gen1ou', 'gen2ou']) {
    let slot = readVisualTeam('Gengar\n- Thunderbolt', format).slots[0];
    for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'])
      slot = patchVisualSlot(slot, { evs: editEVs(slot.set, format, stat, 0) });
    const reopened = readVisualTeam(slot.raw, format).slots[0].set;
    assert.equal(actualStat(format, slot.set, 'spe'), 255);
    assert.equal(actualStat(format, reopened, 'spe'), 255);
    assert.equal(reopened.evs.spe, 0);
  }
});
await check('builder and parser use the same normalized generation', () => {
  const raw = 'Raikou\n- Hidden Power Ice';
  assert.deepEqual(
    readVisualTeam(raw, 'Gen2OU').slots[0].set,
    readVisualTeam(raw, 'gen2ou').slots[0].set,
  );
  assert.equal(generationFor('customgen2'), 9);
  assert.deepEqual(
    readVisualTeam(raw, 'customgen2').slots[0].set,
    readVisualTeam(raw, 'gen9ou').slots[0].set,
  );
});
console.log(passed + ' builder checks passed.');
