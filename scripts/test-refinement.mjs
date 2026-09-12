import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  emptyDraft,
  cleanMeta,
  readableMeta,
  sourceTypes,
  sourceLabel,
  snapshotRevision,
} from '../.test-build/domain.mjs';
import { previewPokepaste } from '../.test-build/pokepaste.mjs';
import { MemoryDatabase } from '../.test-build/local-db.mjs';
import { LocalLibrary } from '../.test-build/local-library.mjs';
import { backupText, parseBatch } from '../.test-build/showdown.mjs';
const check = async (name, fn) => {
  await fn();
  console.log('PASS refinement ' + name);
};
await check(
  'legacy source/date compatibility retains hidden context and has exactly four choices',
  () => {
    assert.deepEqual(sourceTypes, [
      'Built by',
      'Given by',
      'Found on',
      'Other',
    ]);
    for (const [old, name, expected] of [
      ['Self-built', 'Alice', 'Built by Alice'],
      ['Received from', 'Bob', 'Given by Bob'],
      ['Copied from', 'Bob', 'Given by Bob'],
      ['Adapted from', 'Bob', 'Given by Bob'],
      ['PokéPaste', 'Bob', 'Given by Bob'],
      ['PokéPaste', '', 'Other'],
      ['Discord', '', 'Found on Discord'],
      ['Website', 'Smogon', 'Found on Smogon'],
      ['unexpected', '', 'Other'],
    ]) {
      const legacy = {
        ...emptyDraft(),
        title: 'Old',
        source_type: old,
        source_name: name,
        source_url: 'old unparseable context',
        source_note: 'Retain this',
        team_date: '2018-06',
        team_date_precision: 'month',
      };
      const cleaned = cleanMeta(legacy);
      assert.equal(sourceLabel(cleaned), expected);
      assert.equal(cleaned.team_date, '2018');
      assert.equal(cleaned.team_date_precision, 'year');
      assert.equal(cleaned.source_note, legacy.source_note);
      assert.equal(cleaned.source_url, legacy.source_url);
      assert.equal(legacy.team_date, '2018-06');
    }
    assert.equal(
      readableMeta({
        ...emptyDraft(),
        team_date: '',
        team_date_precision: 'year',
      }).team_date_precision,
      'year',
    );
  },
);
await check(
  'Pokepaste explicit format metadata and aliases map without becoming notes; unknown/conflicting formats fall back',
  async () => {
    for (const [metadata, expected] of [
      [{ format: '[Gen 4] Ubers' }, 'gen4ubers'],
      [{ format: 'Gen 9 National Dex OU' }, 'gen9nationaldex'],
      [{ notes: 'Format: [Gen 4] Ubers\nLead carefully.' }, 'gen4ubers'],
      [{ format: 'unlisted tier' }, 'gen9ou'],
      [{ notes: 'Format: unlisted tier\nLead carefully.' }, 'gen9ou'],
      [
        { format: 'gen4ubers', notes: 'Format: gen9ou\nLead carefully.' },
        'gen9ou',
      ],
      [{ format: { bad: true } }, 'gen9ou'],
      [{ title: 'gen4ubers' }, 'gen9ou'],
    ]) {
      const result = await previewPokepaste(
        'https://pokepast.es/0123456789abcdef',
        'gen9ou',
        undefined,
        async () =>
          Response.json({
            paste: 'Darkrai\n- Dark Pulse',
            notes: 'Lead carefully.',
            author: 'Alice',
            ...metadata,
          }),
      );
      assert.equal(result.batch[0].draft.format, expected);
      assert.equal(result.common.source_type, 'Given by');
      assert.equal(result.common.team_notes, 'Lead carefully.');
      assert.equal(result.common.source_url, '');
    }
    const unknown = await previewPokepaste(
      'https://pokepast.es/0123456789abcdef',
      'unknown',
      undefined,
      async () => Response.json({ paste: 'Pikachu\n- Thunderbolt' }),
    );
    assert.equal(unknown.common.source_type, 'Other');
    assert.equal(unknown.batch[0].draft.format, 'unknown');
  },
);
await check(
  'Field groups never label a tag remove button; text inputs retain accessible labels',
  async () => {
    const source = await fs.readFile('components/vault-ui.tsx', 'utf8');
    const ast = ts.createSourceFile(
      'ui.tsx',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const field = ast.statements
      .find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'Field')
      .getText(ast)
      .replace('export ', '');
    const compiled = ts.transpileModule(field, {
      compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext },
    }).outputText;
    // Compile the actual component's JSX with its React dependencies for SSR assertions.
    // oxlint-disable-next-line typescript/no-implied-eval
    const Field = new Function(
      'React',
      'useId',
      'Children',
      'isValidElement',
      'cloneElement',
      compiled + ';return Field;',
    )(
      React,
      React.useId,
      React.Children,
      React.isValidElement,
      React.cloneElement,
    );
    const html = renderToStaticMarkup(
      React.createElement(
        Field,
        { label: 'Tags' },
        React.createElement(
          'span',
          null,
          'Rain',
          React.createElement(
            'button',
            { 'aria-label': 'Remove tag Rain' },
            '×',
          ),
        ),
        React.createElement('button', null, 'Add tag'),
      ),
    );
    assert.ok(!html.includes('<label'));
    assert.ok(html.includes('<fieldset'));
    assert.ok(html.includes('aria-labelledby='));
    const input = renderToStaticMarkup(
      React.createElement(
        Field,
        { label: 'Player' },
        React.createElement('input'),
      ),
    );
    assert.ok(input.includes('aria-label="Player"'));
  },
);
await check(
  'filtered Showdown export selects complete intersection across pages and excludes nonmatching siblings',
  async () => {
    const db = new MemoryDatabase();
    const lib = new LocalLibrary(db, null, async () => {
      throw Error('Local-only must not call Cloud');
    });
    const drafts = Array.from({ length: 35 }, (_, i) => ({
      ...emptyDraft(true),
      title: 'Export ' + i,
      format: i < 33 ? 'gen9ou' : 'gen4ubers',
      tags: i % 2 === 0 ? ['Rain'] : [],
      team_date: '2020',
      team_date_precision: 'year',
      source_type: 'Given by',
      source_name: 'Alice',
      showdown_text: i % 2 === 0 ? 'Pikachu\n- Thunderbolt' : 'Pikachu\n- Surf',
    }));
    await lib.perform('import', { drafts });
    const selected = async (query) =>
      (await lib.perform('select', { query, group_families: false, page: 1 }))
        .ids;
    assert.equal((await lib.perform('families', {})).teams.length, 30);
    assert.equal((await selected('')).length, 35);
    assert.equal((await selected('format:gen9ou')).length, 33);
    const ids = await selected(
      'format:gen9ou pokemon:Pikachu move:Thunderbolt tag:Rain source:Alice year:2020',
    );
    assert.equal(ids.length, 17);
    const teams = await Promise.all(
      ids.map((id) => lib.perform('get', { id })),
    );
    const text = backupText(teams);
    const parsed = parseBatch(text);
    assert.equal(parsed.length, 17);
    assert.ok(
      parsed.every((r) => r.draft.showdown_text.includes('Thunderbolt')),
    );
    const original = teams[0];
    const variant = await lib.perform('variant_create', {
      id: original.id,
      name: 'Variant A',
      version_id: original.version.id,
      operation_id: crypto.randomUUID(),
    });
    const changed = await lib.perform('save', {
      id: variant.id,
      draft: {
        ...variant,
        ...variant.version,
        showdown_text: 'Raichu\n- Surf',
        team_notes: 'Variant A notes',
        set_notes: ['A slot'],
        version_comment: 'Changed',
      },
      expected: variant.current_version_id,
      expected_revision: snapshotRevision(variant.version),
      expected_updated_at: variant.updated_at,
    });
    const clone = await lib.perform('variant_create', {
      id: changed.id,
      name: 'Variant B',
      version_id: changed.version.id,
      description: changed.variant_description,
      operation_id: crypto.randomUUID(),
    });
    assert.equal(clone.version.showdown_text, changed.version.showdown_text);
    assert.equal(clone.version.team_notes, 'Variant A notes');
    assert.deepEqual(clone.version.set_notes, ['A slot']);
    assert.deepEqual(clone.tags, changed.tags);
    assert.equal(clone.source_name, changed.source_name);
    assert.equal(
      (await lib.perform('get', { id: original.id })).variant_count,
      3,
    );
    assert.equal((await selected('pokemon:Pikachu')).length, 35);
    // Loading genuinely old persisted metadata is read-only and searchable by new source terminology.
    const stored = await db.get(lib.namespace, original.id);
    stored.team.source_type = 'Received from';
    stored.team.team_date = '2020-06';
    stored.team.team_date_precision = 'month';
    stored.payload.source_type = 'Received from';
    stored.payload.team_date = '2020-06';
    stored.payload.team_date_precision = 'month';
    await db.commit(lib.namespace, [stored], [], {});
    assert.equal(
      (await lib.perform('get', { id: original.id })).team_date,
      '2020',
    );
    assert.ok((await selected('source:given')).includes(original.id));
    assert.equal(
      (await db.get(lib.namespace, original.id)).payload.team_date,
      '2020-06',
    );
    lib.active = false;
  },
);
await check(
  'inline rename consumes Escape before the library shortcut and Enter saves once',
  async () => {
    const source = await fs.readFile('components/variants.tsx', 'utf8');
    const ast = ts.createSourceFile(
      'variants.tsx',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let callback;
    function visit(node) {
      if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onKeyDown')
        callback = node.initializer.expression.getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(callback);
    const compiled = ts.transpileModule('const handler = ' + callback, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    let mode = 'rename',
      saves = 0,
      stopped = 0,
      prevented = 0;
    const cancelled = { current: false };
    // Execute the real JSX handler in isolation, including its bubbling behavior.
    // oxlint-disable-next-line typescript/no-implied-eval
    const handler = new Function(
      'cancelled',
      'setMode',
      'submit',
      compiled + '; return handler;',
    )(
      cancelled,
      (value) => {
        mode = value;
      },
      () => {
        saves++;
      },
    );
    handler({
      key: 'Escape',
      stopPropagation: () => {
        stopped++;
      },
      preventDefault: () => {
        prevented++;
      },
    });
    assert.equal(mode, null);
    assert.equal(cancelled.current, true);
    assert.equal(saves, 0);
    assert.equal(stopped, 1);
    handler({
      key: 'Enter',
      stopPropagation: () => {
        stopped++;
      },
      preventDefault: () => {
        prevented++;
      },
    });
    assert.equal(saves, 1);
    assert.equal(stopped, 2);
    assert.equal(prevented, 2);
  },
);
