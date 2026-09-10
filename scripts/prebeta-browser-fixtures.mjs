// Explicitly disposable local acceptance data; refuses the normal library.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
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
assert.ok(file, 'Initialize the separate pre-beta database first.');
const db = new DatabaseSync(dir + '/' + file, { readOnly: true });
const initial = await api('families', { include_archived: true });
if (initial.total) {
  for (const t of initial.teams)
    assert.ok(
      db.prepare('SELECT id FROM teams WHERE id=?').get(t.id),
      'Refusing a server that does not use the disposable QA database.',
    );
} else assert.equal(db.prepare('SELECT count(*) n FROM teams').get().n, 0);
const path = '.artifacts/prebeta/browser-fixtures.json';
if (process.argv[2] === 'seed') {
  assert.ok(
    initial.total < 15,
    'Refusing to seed over an existing stress library.',
  );
  const raw =
    '=== [gen9ubers] [BO] Rain [Tour] ===\n\nPikachu @ Light Ball\nAbility: Static\n- Thunderbolt';
  const parsed = (await api('parse', { text: raw }))[0].draft;
  assert.equal(parsed.title, '[BO] Rain [Tour]');
  assert.equal(parsed.format, 'gen9ubers');
  const unknown = (
    await api('parse', { text: raw.replace('[gen9ubers] ', '') })
  )[0].draft;
  assert.equal(unknown.title, '[BO] Rain [Tour]');
  assert.equal(unknown.format, 'unknown');
  const ids = [];
  for (let start = 0; start < 72; start += 5) {
    const drafts = Array.from({ length: Math.min(5, 72 - start) }, (_, j) => ({
      ...parsed,
      title: '[BO] QA ' + (start + j),
      tags: ['Old Meta QA'],
      team_date: start + j < 42 ? '2023' : '2024',
      team_date_precision: 'year',
    }));
    ids.push(...(await api('import', { drafts })).ids);
  }
  const t = await api('get', { id: ids[0] });
  const alt = await api('variant_create', {
    id: t.id,
    name: 'Alternate',
    description: 'QA sibling outside filter',
    version_id: t.version.id,
    expected: t.current_version_id,
    expected_revision: t.version.edit_revision || t.version.id,
    expected_updated_at: t.updated_at,
    operation_id: crypto.randomUUID(),
  });
  await api('patch', {
    id: alt.id,
    patch: { team_date: '2024', team_date_precision: 'year' },
  });
  const collection = await api('collection_save', {
    id: crypto.randomUUID(),
    name: '2023 Ubers QA',
    description: 'Disposable pre-beta collection',
    definition: {
      query: '',
      filters: [
        { field: 'format', value: 'gen9ubers' },
        { field: 'year', value: '2023' },
        { field: 'tag', value: 'Old Meta QA' },
      ],
      sort: 'title_asc',
      favourite: false,
    },
  });
  const share = await api('collection_share', { id: collection.id });
  await fs.writeFile(
    path,
    JSON.stringify({
      ids,
      alt: alt.id,
      collection,
      share,
      baseline: initial.teams.map((t) => t.id),
    }),
  );
  console.log(
    'Prepared 42 matching + 30 nonmatching families, an outside-filter sibling and a live collection.',
  );
} else {
  const fixture = JSON.parse(await fs.readFile(path, 'utf8'));
  if (process.argv[2] === 'filtered') {
    const matched = await api('families', {
      query: 'format:gen9ubers year:2023 tag:"Old Meta QA"',
      include_archived: true,
    });
    assert.equal(matched.total, 0);
    await assert.rejects(() => api('get', { id: fixture.alt }));
    for (const id of fixture.ids.slice(42)) assert.ok(await api('get', { id }));
    assert.equal(
      (await api('collection_get', { id: fixture.collection.id })).has_share,
      true,
    );
    console.log(
      'Filtered deletion removed all 42 families + sibling; all 30 nonmatches remain; live collection preserved.',
    );
  } else if (process.argv[2] === 'empty') {
    assert.equal(initial.total, 0);
    const c = await api('collection_get', { id: fixture.collection.id });
    assert.equal(c.has_share, false);
    assert.deepEqual(c.definition, fixture.collection.definition);
    assert.ok(
      (await api('facets', { include_archived: true })).tags.includes(
        'Old Meta QA',
      ),
    );
    assert.equal(db.prepare('SELECT count(*) n FROM teams').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM team_versions').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM share_links').get().n, 0);
    console.log(
      'Delete All verified: zero teams/history/variant links; collection definition and reusable tags retained; collection link revoked.',
    );
  } else throw Error('Use seed, filtered or empty.');
}
db.close();
