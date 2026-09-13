import assert from 'node:assert/strict';
import { MemoryDatabase } from '../.test-build/local-db.mjs';
import { LocalLibrary } from '../.test-build/local-library.mjs';
import { emptyDraft, snapshotRevision } from '../.test-build/domain.mjs';
import {
  readVisualTeam,
  writeVisualTeam,
  moveSlot,
  reorderSlots,
} from '../.test-build/visual-team.mjs';
import { backupText, parseBatch } from '../.test-build/showdown.mjs';
import {
  previewPokepaste,
  previewPokepasteBatch,
  extractPokepasteUrls,
} from '../.test-build/pokepaste.mjs';
import { LocalBackup } from '../.test-build/local-backup.mjs';
import { exportBackup } from '../.test-build/backup.mjs';
import { validateBackup, backupChunks } from '../.test-build/backup-format.mjs';
const db = new MemoryDatabase();
const offline = async () => {
  throw Error('Network offline');
};
let library = new LocalLibrary(db, null, offline);
await library.perform('trainer_name_save', { name: 'Alice' });
const raw =
  'Kyogre @ Choice Scarf\nAbility: Drizzle\n- Water Spout\n\nTornadus @ Focus Sash\nAbility: Prankster\n- Tailwind\n\nPikachu @ Light Ball\nAbility: Static\n- Thunderbolt';
const create = async (title) =>
  (
    await library.perform('import', {
      drafts: [
        {
          ...emptyDraft(),
          title,
          showdown_text: raw,
          source_name: await library.perform('trainer_name'),
          set_notes: ['rain', 'wind', 'mouse'],
        },
      ],
    })
  ).ids[0];
const a = await create('First');
await library.perform('trainer_name_save', { name: 'Bob' });
const b = await create('Second');
assert.equal((await library.full(a)).source_name, 'Alice');
assert.equal((await library.full(b)).source_name, 'Bob');
assert.equal(
  await new LocalLibrary(db, { id: 'other', name: 'Carol' }, offline).perform(
    'trainer_name',
  ),
  'Carol',
);
for (const id of [a, b]) {
  const t = await library.full(id);
  const slots = readVisualTeam(
    t.version.showdown_text,
    t.format,
    [],
    t.version.set_notes,
  ).slots;
  const reordered = reorderSlots(slots, 0, 2);
  assert.deepEqual(reordered, moveSlot(moveSlot(slots, 0, 1), 1, 1));
  assert.deepEqual(reorderSlots(slots, -1, 2), slots);
  await library.perform('save', {
    id,
    draft: {
      ...t,
      ...t.version,
      showdown_text: writeVisualTeam(reordered),
      set_notes: reordered.map((s) => s.note),
      set_editing: reordered.map((s) => s.editing || null),
    },
    expected: t.current_version_id,
    expected_revision: snapshotRevision(t.version),
    expected_updated_at: t.updated_at,
  });
}
library = new LocalLibrary(db, null, offline);
assert.equal(await library.perform('trainer_name'), 'Bob');
const before = [await library.full(a), await library.full(b)];
await assert.rejects(
  () => library.perform('family_merge', { ids: [a, b] }),
  /Main/,
);
await library.perform('family_merge', { ids: [a, b], id: b });
assert.equal(
  (await library.perform('family_variants', { family_id: b })).teams[0].id,
  b,
);
for (const t of before) {
  const after = await library.full(t.id);
  assert.deepEqual(after.version, t.version);
  assert.deepEqual(after.history, t.history);
  assert.equal(after.title, t.title);
  assert.equal(after.source_name, t.source_name);
}
const c = await create('Third');
assert.deepEqual(
  (await library.perform('family_expand', { ids: [c, b, c] })).ids,
  [c, b, a],
);
assert.equal(
  (await library.list({ query: '', group_families: true })).teams.find(
    (t) => t.family_id === b,
  ).id,
  b,
);
assert.equal(
  (await library.list({ query: 'team:First', group_families: true })).teams[0]
    .id,
  a,
);
await assert.rejects(
  () => library.perform('family_merge', { ids: [a, c], id: c }),
  /every member/,
);
assert.equal((await library.full(a)).family_id, b);
await assert.rejects(
  () => library.perform('family_remove', { id: b }),
  /Main team/,
);
assert.equal((await library.list({ query: 'Tornadus Tailwind' })).total, 3);
const teams = [await library.full(b), await library.full(a)];
assert.deepEqual(
  teams[0].version.parsed_team.map((s) => s.species),
  ['Tornadus', 'Pikachu', 'Kyogre'],
);
assert.deepEqual(teams[0].version.set_notes, ['wind', 'mouse', 'rain']);
const text = backupText(teams);
assert.equal(
  backupText([
    { ...teams[0], version: { showdown_text: raw.replace(/\n/g, '\r\n') } },
  ]),
  backupText([{ ...teams[0], version: { showdown_text: raw } }]),
);
assert.ok(text.indexOf('Tornadus') < text.indexOf('Kyogre'));
assert.equal(parseBatch(text).length, 2);
const backup = new LocalBackup(library);
const lines = [];
for await (const line of exportBackup({
  backup: (action, payload) => backup.run(action, payload),
}))
  lines.push(line);
const blob = new Blob(lines);
const manifest = await validateBackup(blob.stream());
const restored = new LocalLibrary(new MemoryDatabase(), null, offline),
  restore = new LocalBackup(restored),
  op = crypto.randomUUID();
await restore.run('backup_begin', { id: op, manifest });
let seq = 0;
for await (const chunk of backupChunks(blob.stream()))
  await restore.run('backup_restore', { id: op, index: seq++, text: chunk });
const restoredTeams = await restored.list({});
assert.equal(restoredTeams.total, 3);
const restoredFull = await Promise.all(
  restoredTeams.teams.map((t) => restored.full(t.id)),
);
const restoredA = restoredFull.find((t) => t.title === 'First'),
  restoredB = restoredFull.find((t) => t.title === 'Second');
assert.equal(restoredA.family_id, restoredB.family_id);
assert.equal(
  (
    await restored.perform('family_variants', {
      family_id: restoredB.family_id,
    })
  ).teams[0].id,
  restoredB.id,
);
assert.deepEqual(restoredB.version.parsed_team, teams[0].version.parsed_team);
await library.perform('family_remove', { id: a });
assert.equal((await library.full(a)).family_id, a);
assert.deepEqual((await library.full(a)).version, before[0].version);
console.log(
  'PASS cohesive workflows: Alice/Bob historical sources, namespace isolation, reordered reload/text/notes, non-first Main, whole-family safeguards, detach, search, native backup restoration',
);
const urls = Array.from(
  { length: 30 },
  (_, i) => 'https://pokepast.es/' + i.toString(16).padStart(16, '0'),
);
for (const count of [1, 10, 30])
  assert.equal(
    extractPokepasteUrls(urls.slice(0, count).join('\n')).length,
    count,
  );
const message =
  'balance best\n' +
  urls
    .map((url, i) => 'Discord commentary ' + i + ': (' + url + '),')
    .join('\n') +
  '\n' +
  urls[0] +
  ' https://example.com/0123456789abcdef https://pokepast.es/invalid https://pokepast.es/0123456789abcdefextra';
assert.deepEqual(extractPokepasteUrls(message), urls);
assert.deepEqual(
  extractPokepasteUrls(urls[0] + ',' + urls[1] + ';' + urls[0]),
  urls.slice(0, 2),
);
let active = 0,
  peak = 0;
const progress = [];
const result = await previewPokepasteBatch(
  extractPokepasteUrls(message),
  async (url) => {
    active++;
    peak = Math.max(peak, active);
    try {
      return await previewPokepaste(
        url,
        'gen9ou',
        undefined,
        async (requested) => {
          if (requested.startsWith(urls[7] + '/'))
            return new Response('', { status: 404 });
          return Response.json({
            title: 'Paste ' + urls.indexOf(url),
            paste: raw,
            author: 'Author ' + urls.indexOf(url),
            notes: 'Actual paste notes',
          });
        },
      );
    } finally {
      active--;
    }
  },
  (done, total) => progress.push([done, total]),
);
assert.equal(result.results.length, 29);
assert.equal(result.failures.length, 1);
assert.equal(result.failures[0].url, urls[7]);
assert.equal(peak, 1);
assert.deepEqual(progress.at(-1), [30, 30]);
const imported = (
  await library.perform('import', {
    drafts: result.results.flatMap((r) => r.batch.map((t) => t.draft)),
  })
).ids;
const importedTeams = await Promise.all(imported.map((id) => library.full(id)));
assert.equal(importedTeams[7].title, 'Paste 8');
assert.equal(importedTeams[0].source_name, 'Author 0');
assert.equal(parseBatch(backupText(importedTeams)).length, 29);
await library.perform('family_merge', { ids: imported, id: imported[10] });
assert.equal(
  (await library.perform('family_variants', { family_id: imported[10] }))
    .teams[0].id,
  imported[10],
);
console.log(
  'PASS mass import: 1/10/30 URLs, commentary and adjacent punctuation, deduplication, 29 successful + 1 unavailable, source order and metadata, concurrency 1, canonical 29-team export, family merge',
);
// Cross-feature checks on the successfully bulk-imported records.
const importedOriginal = await library.full(imported[0]);
const importSlots = reorderSlots(
  readVisualTeam(
    importedOriginal.version.showdown_text,
    importedOriginal.format,
  ).slots,
  0,
  2,
);
await library.perform('save', {
  id: imported[0],
  draft: {
    ...importedOriginal,
    ...importedOriginal.version,
    showdown_text: writeVisualTeam(importSlots),
    set_notes: importSlots.map((s) => s.note),
  },
  expected: importedOriginal.current_version_id,
  expected_revision: snapshotRevision(importedOriginal.version),
  expected_updated_at: importedOriginal.updated_at,
});
const importedReload = await new LocalLibrary(db, null, offline).full(
  imported[0],
);
assert.equal(importedReload.version.parsed_team[0].species, 'Tornadus');
assert.equal(importedReload.family_id, imported[10]);
const copied = await library.perform('variant_create', {
  id: imported[0],
  name: 'Copied reordered paste',
  description: '',
  operation_id: crypto.randomUUID(),
  version_id: importedReload.version.id,
});
assert.deepEqual(
  copied.version.parsed_team,
  importedReload.version.parsed_team,
);
assert.equal(
  parseBatch(backupText([importedReload]))[0].draft.showdown_text,
  importedReload.version.showdown_text,
);
await library.perform('variant_delete', { id: copied.id });
await assert.rejects(
  () => library.perform('family_merge', { ids: imported, id: imported[10] }),
  /recently deleted/,
);
console.log(
  'PASS imported-team reorder, reload, Showdown conversion, variant copy, and deleted-family-member merge guard',
);
