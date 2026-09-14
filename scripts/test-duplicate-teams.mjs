import assert from 'node:assert/strict';
import {
  duplicateGroups,
  duplicateSignature,
  duplicateSuggestionKey,
} from '../.test-build/duplicate-teams.mjs';
import { MemoryDatabase } from '../.test-build/local-db.mjs';
import { LocalLibrary, indexed } from '../.test-build/local-library.mjs';
import { emptyDraft } from '../.test-build/domain.mjs';

const db = new MemoryDatabase();
let cloudCalls = 0;
const cloud = async () => {
  cloudCalls++;
  throw Error('Offline');
};
const library = new LocalLibrary(db, null, cloud);
const species = [
  'Pikachu',
  'Charizard',
  'Blastoise',
  'Venusaur',
  'Gengar',
  'Dragonite',
];
async function create(title, names = species, format = 'gen9ou') {
  const result = await library.perform('import', {
    drafts: [
      {
        ...emptyDraft(true),
        title,
        format,
        showdown_text: names.map((name) => name + '\n- Tackle').join('\n\n'),
        team_notes: title + ' notes',
        tags: ['variant'],
        source_name: 'Original source',
      },
    ],
  });
  return library.perform('get', { id: result.ids[0] });
}
const a = await create('Original'),
  b = await create('Variant', [...species].reverse());
const copy = structuredClone(a);
copy.id = 'copy';
copy.family_id = 'copy';
assert.equal(duplicateGroups([a, copy]).length, 1);
assert.equal(duplicateGroups([a, b]).length, 1);
assert.equal(duplicateGroups([a, { ...b, format: 'gen9uu' }]).length, 0);
const different = structuredClone(b);
different.version.parsed_team[0].species = 'Mew';
assert.equal(duplicateGroups([a, different]).length, 0);
const build = structuredClone(b);
Object.assign(build.version.parsed_team[0], {
  moves: ['Protect'],
  item: 'Leftovers',
  evs: { hp: 252 },
});
assert.equal(duplicateSignature(a), duplicateSignature(build));
assert.equal(
  duplicateSignature(a),
  duplicateSignature({ ...b, format: '[Gen 9] OU' }),
);
const form = structuredClone(a);
form.version.parsed_team[0].species = 'Rotom-Wash';
const otherForm = structuredClone(form);
otherForm.version.parsed_team[0].species = 'Rotom-Heat';
assert.notEqual(duplicateSignature(form), duplicateSignature(otherForm));
assert.equal(
  duplicateSignature({
    ...a,
    version: { ...a.version, parsed_team: a.version.parsed_team.slice(0, 5) },
  }),
  null,
);
const repeated = structuredClone(a);
repeated.version.parsed_team[0].species = 'Gengar';
assert.notEqual(duplicateSignature(a), duplicateSignature(repeated));
const c = await create('Second group', species, 'gen9uu'),
  d = await create('Second variant', species, 'gen9uu');
const before = await db.indexes(library.namespace);
assert.equal((await library.perform('duplicate_suggestion')).length, 2);
assert.deepEqual(await db.indexes(library.namespace), before);
assert.equal(cloudCalls, 0);
await library.perform('duplicate_suggestion_dismiss');
const reloaded = new LocalLibrary(db, null, cloud);
assert.deepEqual(await reloaded.perform('duplicate_suggestion'), []);
await create('Later duplicate');
assert.deepEqual(await reloaded.perform('duplicate_suggestion'), []);
const account = new LocalLibrary(db, { id: 'one', name: 'One' }, cloud);
const secondAccount = new LocalLibrary(db, { id: 'two', name: 'Two' }, cloud);
await db.commit(account.namespace, [indexed(a), indexed(b)]);
await db.commit(secondAccount.namespace, [indexed(c)]);
// Offline accounts defer the automatic suggestion until remote settings resolve.
assert.equal((await account.perform('duplicate_suggestion')).length, 0);
assert.deepEqual(await secondAccount.perform('duplicate_suggestion'), []);
assert.equal(
  await db.value(account.namespace, duplicateSuggestionKey),
  undefined,
);
await account.perform('family_merge', {
  ids: [a.id, b.id],
  id: b.id,
  standalone: true,
});
for (const original of [a, b]) {
  const after = (await db.get(account.namespace, original.id)).payload;
  assert.equal(after.family_id, b.id);
  const { family_id: _, variant_name: __, ...rest } = after;
  const { family_id: ___, variant_name: ____, ...expected } = original;
  assert.deepEqual(
    rest,
    expected,
    'Merge preserves all other data, dates and IDs',
  );
}
assert.equal((await account.perform('get', { id: b.id })).variant_name, 'Main');
assert.equal(await db.value(account.namespace, duplicateSuggestionKey), true);
assert.equal(
  duplicateGroups([
    await account.perform('get', { id: a.id }),
    await account.perform('get', { id: b.id }),
    copy,
  ]).length,
  0,
);
await assert.rejects(
  library.perform('family_bulk_delete', { ids: [], standalone: true }),
);
await assert.rejects(
  library.perform('family_bulk_delete', {
    ids: [c.id, d.id],
    standalone: true,
  }),
);
const deletion = {
  ids: [d.id],
  standalone: true,
  chunk: { operation_id: crypto.randomUUID(), chunk_index: 0 },
};
await library.perform('family_bulk_delete', deletion);
await library.perform('family_bulk_delete', deletion); // Durable retry receipt.
assert.ok((await db.get(library.namespace, d.id)).deletedAt);
assert.ok(!(await db.get(library.namespace, c.id)).deletedAt);
await assert.rejects(
  account.perform('family_bulk_delete', { ids: [b.id], standalone: true }),
);
console.log(
  'Duplicate detection, persistence, scope isolation, lossless chosen-parent merge, guarded deletion and retry tests passed.',
);
