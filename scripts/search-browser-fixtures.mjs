// Disposable HTTP/browser fixtures, guarded against the normal local workspace.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { coreDraft, megaCore, rainCore } from './search-fixtures.mjs';
const origin = 'http://localhost:3000';
const sign = await fetch(origin + '/signin-with-chatgpt?return_to=%2F', {
  redirect: 'manual',
});
const cookie = sign.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
async function api(action, payload = {}) {
  const r = await fetch(origin + '/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      Cookie: cookie,
    },
    body: JSON.stringify({ action, payload }),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
const dir = '.artifacts/prebeta/state/v3/d1/miniflare-D1DatabaseObject';
const file = (await fs.readdir(dir)).find(
  (f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite',
);
assert.ok(file);
const db = new DatabaseSync(dir + '/' + file, { readOnly: true });
const initial = await api('families', { include_archived: true });
for (const t of initial.teams)
  assert.ok(
    db.prepare('SELECT id FROM teams WHERE id=?').get(t.id),
    'Server must use the disposable QA database.',
  );
const output = '.artifacts/search-browser-fixtures.json';
if (process.argv[2] === 'seed') {
  const { ids } = await api('import', {
    drafts: [
      coreDraft('QA Search complete'),
      coreDraft('QA Search subset', 'Gengar @ Gengarite\n- Shadow Ball'),
      coreDraft(
        'QA Search wrong moves',
        'Gengar @ Gengarite\n- Thousand Arrows\n\nZygarde\n- Shadow Ball',
      ),
      coreDraft('QA Search rain', rainCore),
      coreDraft('QA Search rain subset', rainCore.split('\n\nIncineroar')[0]),
    ],
  });
  const t = await api('get', { id: ids[1] });
  let alt = await api('variant_create', {
    id: t.id,
    name: 'Complete core',
    description: '',
    version_id: t.version.id,
    expected: t.current_version_id,
    expected_revision: t.version.edit_revision,
    expected_updated_at: t.updated_at,
    operation_id: crypto.randomUUID(),
  });
  alt = await api('save', {
    id: alt.id,
    draft: { ...alt, ...alt.version, showdown_text: megaCore },
    expected: alt.current_version_id,
    parent: alt.current_version_id,
    expected_revision: alt.version.edit_revision,
    expected_updated_at: alt.updated_at,
  });
  await fs.writeFile(output, JSON.stringify({ ids, alt: alt.id }));
  for (const [query, count] of [
    ['Mega Gengar + Zygarde', 3],
    ['Mega Gengar Shadow Ball + Zygarde Thousand Arrows', 2],
    ['Kyogre + Tornadus + Incineroar', 1],
    ['Mega Gengar + Zygarde year:2017', 3],
    ['Mega Gengar + Zygarde format:gen7ubers tag:"Tournament Grade"', 3],
  ]) {
    const result = await api('families', { query: 'tag:Corefixture ' + query });
    assert.equal(result.total, count, query);
    if (query === 'Mega Gengar + Zygarde') {
      const representative = result.teams.find((r) => r.id === alt.id);
      assert.equal(representative.matching_variant_count, 1);
      assert.equal(representative.variant_count, 2);
    }
  }
  console.log(
    'HTTP core queries passed; five disposable families ready for browser QA.',
  );
} else if (process.argv[2] === 'cleanup') {
  const { ids } = JSON.parse(await fs.readFile(output, 'utf8'));
  for (const id of ids)
    assert.match((await api('get', { id })).title, /^QA Search /);
  await api('family_bulk_delete', {
    ids,
    chunk: { operation_id: crypto.randomUUID(), chunk_index: 0 },
  });
  console.log('Removed the five QA Search families and their sibling.');
} else throw Error('Use seed or cleanup.');
db.close();
