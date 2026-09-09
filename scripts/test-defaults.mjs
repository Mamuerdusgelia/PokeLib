import assert from 'node:assert/strict';
import {
  newSlot,
  readVisualTeam,
  writeVisualTeam,
} from '../.test-build/visual-team.mjs';
import {
  patchAuthoredSlot,
  completeAuthoredTeam,
} from '../.test-build/builder-defaults.mjs';
import { speciesSelectionPatch } from '../.test-build/showdown-builder.mjs';
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('PASS ' + name);
}
const special = ['Shadow Ball', 'Nasty Plot', 'Recover', 'Make It Rain'];
function authored(species = 'Gholdengo', format = 'gen9ou') {
  const s = newSlot();
  return patchAuthoredSlot(
    s,
    speciesSelectionPatch(format, s.set, species, {
      authored: true,
      teraManaged: true,
    }),
    format,
  );
}
check(
  'new Gen9 species defaults primary Tera and keeps automatic provenance',
  () => {
    const s = authored();
    assert.equal(s.set.teraType, 'Steel');
    assert.equal(s.editing.tera, 'auto');
  },
);
check(
  'forced Tera and manually selected Tera survive later species changes',
  () => {
    let s = authored('Ogerpon-Wellspring');
    assert.equal(s.set.teraType, 'Water');
    s = patchAuthoredSlot(s, { teraType: 'Fire' }, 'gen9ou');
    s = patchAuthoredSlot(
      s,
      speciesSelectionPatch('gen9ou', s.set, 'Gholdengo', {
        authored: true,
        teraManaged: false,
      }),
      'gen9ou',
    );
    assert.equal(s.set.teraType, 'Fire');
    assert.equal(s.editing.tera, 'manual');
  },
);
check('pre-Tera authored sets do not acquire a Tera field', () => {
  const s = authored('Gengar', 'gen5ou');
  assert.equal(s.set.teraType, undefined);
  assert.doesNotMatch(s.raw, /Tera Type/);
});
check('four known special/status moves auto-zero only Attack', () => {
  const s = patchAuthoredSlot(authored(), { moves: special }, 'gen9ou');
  assert.equal(s.set.ivs.atk, 0);
  assert.equal(s.set.ivs.spa ?? 31, 31);
  assert.equal(s.editing.attack_iv, 'auto');
});
check('physical move restores only an automatically zeroed Attack', () => {
  let s = patchAuthoredSlot(authored(), { moves: special }, 'gen9ou');
  s = patchAuthoredSlot(
    s,
    { moves: ['Iron Head', ...special.slice(1)] },
    'gen9ou',
  );
  assert.equal(s.set.ivs.atk, 31);
  assert.equal(s.editing.attack_iv, 'eligible');
});
check(
  'manual Attack zero or explicit default never becomes auto managed',
  () => {
    for (const atk of [0, 31, 17]) {
      let s = patchAuthoredSlot(authored(), { ivs: { atk } }, 'gen9ou', true);
      s = patchAuthoredSlot(s, { moves: special }, 'gen9ou');
      s = patchAuthoredSlot(s, { moves: ['Iron Head'] }, 'gen9ou');
      assert.equal(s.set.ivs.atk, atk);
      assert.equal(s.editing.attack_iv, 'manual');
    }
  },
);
check('manual override after auto-zero survives adding a physical move', () => {
  let s = patchAuthoredSlot(authored(), { moves: special }, 'gen9ou');
  s = patchAuthoredSlot(s, { ivs: { ...s.set.ivs, atk: 0 } }, 'gen9ou', true);
  s = patchAuthoredSlot(s, { moves: ['Iron Head'] }, 'gen9ou');
  assert.equal(s.set.ivs.atk, 0);
});
check(
  'partial authored set defaults at explicit Save without filling move slots',
  () => {
    let s = patchAuthoredSlot(authored(), { moves: ['Shadow Ball'] }, 'gen9ou');
    assert.equal(s.set.ivs?.atk, undefined);
    s = patchAuthoredSlot(s, {}, 'gen9ou', false, true);
    assert.equal(s.set.ivs.atk, 0);
    assert.equal(s.set.moves.length, 1);
  },
);
check(
  'imported raw values and unknown lines receive no automatic IV or Tera changes',
  () => {
    for (const raw of [
      'Gholdengo\n- Shadow Ball\nCustom: retain',
      'Gholdengo\nIVs: 0 Atk\nTera Type: Fire\n- Shadow Ball\nCustom: retain',
    ]) {
      const s = readVisualTeam(raw, 'gen9ou').slots[0];
      const next = patchAuthoredSlot(s, {}, 'gen9ou', false, true);
      assert.equal(next.raw, raw);
      assert.deepEqual(next.set, s.set);
      assert.equal(next.editing, undefined);
    }
  },
);
check(
  'authored IV provenance survives save/reopen and exact raw reorder',
  () => {
    const a = patchAuthoredSlot(authored(), { moves: special }, 'gen9ou');
    const b = authored('Pikachu');
    const saved = readVisualTeam(
      writeVisualTeam([a, b]),
      'gen9ou',
      [],
      ['', ''],
      [a.editing, b.editing],
    );
    const reordered = readVisualTeam(
      writeVisualTeam([saved.slots[1], saved.slots[0]]),
      'gen9ou',
      saved.slots,
    );
    const changed = patchAuthoredSlot(
      reordered.slots[1],
      { moves: ['Iron Head'] },
      'gen9ou',
    );
    assert.equal(changed.set.ivs.atk, 31);
  },
);
check(
  'manual raw replacement drops auto-management even with a matching species',
  () => {
    const a = patchAuthoredSlot(authored(), { moves: special }, 'gen9ou');
    const next = readVisualTeam(a.raw + '\nCustom: manual', 'gen9ou', [a])
      .slots[0];
    assert.equal(next.editing, undefined);
    assert.equal(
      patchAuthoredSlot(next, { moves: ['Iron Head'] }, 'gen9ou').set.ivs.atk,
      0,
    );
  },
);
check(
  'unknown moves, Hidden Power and Gen2 DVs are excluded from automatic IV changes',
  () => {
    for (const [format, moves] of [
      ['gen9ou', ['Unknown Attack', ...special.slice(1)]],
      ['gen5ou', ['Hidden Power Ice', 'Shadow Ball', 'Protect', 'Thunderbolt']],
      ['gen2ou', ['Psychic', 'Recover', 'Thunderbolt', 'Ice Punch']],
    ]) {
      const s = patchAuthoredSlot(
        authored('Gengar', format),
        { moves },
        format,
        false,
        true,
      );
      assert.equal(s.set.ivs?.atk, undefined);
      assert.equal(s.editing.attack_iv, 'eligible');
    }
  },
);
check(
  'no-op Save preserves imported CRLF, blank separators and custom lines exactly',
  () => {
    const text =
      'Gholdengo\r\nCustom: keep exactly\r\n- Shadow Ball\r\n\r\n\r\nZacian @ Rusted Sword\r\n- Iron Head\r\n';
    const { slots } = readVisualTeam(text, 'gen9ubers');
    assert.equal(
      completeAuthoredTeam(slots, text, 'gen9ubers').showdown_text,
      text,
    );
  },
);
console.log(`${passed} authoring-default checks passed.`);
