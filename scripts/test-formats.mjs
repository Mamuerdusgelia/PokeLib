import assert from 'node:assert/strict';
import {
  canonicalFormat,
  searchFormats,
  isOrdinaryFormat,
  ordinaryFormats,
  assistanceFormat,
  formatSearchValues,
} from '../.test-build/formats.mjs';
import { groupFormats, describeFormat } from '../.test-build/format-groups.mjs';
import { cleanMeta, emptyDraft } from '../.test-build/domain.mjs';
import { parseBatch } from '../.test-build/showdown.mjs';
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('PASS format ' + name);
}
check('known Gen 4 spelling/case and contextual Ubers share one ID', () => {
  assert.equal(describeFormat('gen91v1').generation, 9);
  for (const input of [
    'Gen 4 Ubers',
    '[Gen 4] Ubers',
    'GEN4UBERS',
    'gen4ubers',
  ])
    assert.equal(canonicalFormat(input), 'gen4ubers');
  assert.equal(canonicalFormat('ubers', 4), 'gen4ubers');
  assert.equal(canonicalFormat('Ubers'), 'gen9ubers');
});
check(
  'National Dex is classified by battle type with canonical OU alias',
  () => {
    assert.equal(canonicalFormat('Gen 9 National Dex OU'), 'gen9nationaldex');
    assert.equal(describeFormat('gen9nationaldex').category, 'Singles');
    assert.equal(describeFormat('gen9nationaldexdoubles').category, 'Doubles');
    assert.ok(ordinaryFormats.some((f) => f.id === 'gen9nationaldexdoubles'));
  },
);
check(
  'navigation deduplicates aliases with battle then generation hierarchy',
  () => {
    const groups = groupFormats([
      'Gen 4 Ubers',
      'gen4ubers',
      'gen9nationaldex',
      'gen9nationaldexdoubles',
    ]);
    assert.deepEqual(
      groups.map((g) => g.category),
      ['Singles', 'Doubles'],
    );
    assert.equal(
      groups[0].groups.find((g) => g.group.startsWith('Gen 4')).formats.length,
      1,
    );
  },
);
check('unknown imports and custom context remain intact', () => {
  const raw = 'Alice Mixed Format / v2';
  assert.equal(canonicalFormat(raw), raw);
  const m = cleanMeta({
    ...emptyDraft(true),
    title: 'Custom',
    format: raw,
    format_context: { generation: 5, battle: 'doubles' },
  });
  assert.equal(m.format, raw);
  assert.equal(assistanceFormat(m.format, m.format_context), 'gen5custom');
  assert.equal(describeFormat(m.format, m.format_context).category, 'Doubles');
  assert.equal(describeFormat(m.format, m.format_context).generation, 5);
});
check('special mods stay outside standard assistance choices', () => {
  assert.equal(isOrdinaryFormat('gen9balancedhackmons'), false);
  assert.equal(isOrdinaryFormat('gen9stabmons'), false);
  assert.ok(ordinaryFormats.length > 80);
  assert.ok(ordinaryFormats.some((f) => f.id === 'gen4vgc2010'));
});
check('import normalization keeps raw header and unknown date', () => {
  const text = '=== [Gen 4 Ubers] Old team ===\n\nKyogre\n- Surf';
  const { draft } = parseBatch(text)[0];
  assert.equal(draft.format, 'gen4ubers');
  assert.equal(draft.original_text, text);
  assert.equal(draft.team_date, null);
});
check(
  'headerless custom imports keep explicit generation and battle context',
  () => {
    const context = { generation: 5, battle: 'doubles' },
      text = 'Kyogre\n- Surf';
    const { draft } = parseBatch(text, 'Mixed custom', context)[0];
    assert.deepEqual(draft.format_context, context);
    assert.equal(draft.format, 'Mixed custom');
    assert.equal(
      parseBatch(
        '=== [gen4ubers] Known ===\n' + text,
        'Mixed custom',
        context,
      )[0].draft.format_context,
      undefined,
    );
    assert.notEqual(
      describeFormat('gen9championsou').fullLabel,
      describeFormat('gen9ou').fullLabel,
    );
  },
);
check('search alternatives cover old bare and National Dex OU strings', () => {
  assert.ok(formatSearchValues('gen9ubers').includes('ubers'));
  assert.ok(
    formatSearchValues('gen9nationaldex').includes('gen9nationaldexou'),
  );
});
check(
  'one format search handles generation fragments, Nat Dex aliases and doubles',
  () => {
    assert.equal(searchFormats('gen 4 ub')[0].id, 'gen4ubers');
    assert.equal(searchFormats('gen 4 ubers')[0].id, 'gen4ubers');
    assert.ok(
      searchFormats('nat dex ou').some((f) => f.id === 'gen9nationaldex'),
    );
    assert.ok(
      searchFormats('doubles ou').some((f) => f.id === 'gen9doublesou'),
    );
    assert.ok(searchFormats('vgc 2026').every((f) => /vgc2026/.test(f.id)));
    assert.deepEqual(searchFormats('not a real format'), []);
  },
);
check(
  'backup shorthand stays in titles; only recognized leading formats are consumed',
  () => {
    for (const title of [
      '[BO] Kyogre balance',
      '[HO] Screens',
      '[Stall] TSS',
      '[Rain] Tour',
      '[Tour] AB',
      'DPP [BO] 2023',
      '[BO] [gen4ubers] Preserve order',
      '[Mystery Format] Unresolved',
      'Old Meta/gen9ou [BO]',
    ]) {
      const text = '=== ' + title + ' ===\n\nKyogre\n- Surf';
      const { draft } = parseBatch(text)[0];
      assert.equal(draft.title, title);
      assert.equal(draft.format, 'unknown');
      assert.equal(draft.original_text, text);
      assert.equal(draft.team_date, null);
    }
    for (const [token, format] of [
      ['gen4ubers', 'gen4ubers'],
      ['Gen 4 Ubers', 'gen4ubers'],
      ['gen9ou-box', 'gen9ou'],
      ['Gen 9 National Dex OU', 'gen9nationaldex'],
    ]) {
      const text =
        '=== [' + token + '] Old Meta/[BO]  Rain [Tour] ===\n\nKyogre\n- Surf';
      const { draft } = parseBatch(text)[0];
      assert.equal(draft.format, format);
      assert.equal(draft.title, 'Old Meta/[BO]  Rain [Tour]');
      assert.equal(draft.original_text, text);
    }
    assert.equal(
      parseBatch('=== [ubers] [BO] ===\nKyogre\n- Surf', 'gen4ou')[0].draft
        .format,
      'gen4ubers',
    );
  },
);
console.log(passed + ' canonical format checks passed.');
