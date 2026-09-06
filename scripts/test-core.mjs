import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import { DemoStore, resolveDemoShare } from '../.test-build/demo-store.mjs';
import {
  emptyDraft,
  cleanMeta,
  normalizeTags,
  localDate,
} from '../.test-build/domain.mjs';
import {
  parseShowdown,
  parseBatch,
  backupText,
} from '../.test-build/showdown.mjs';
import { planQuery, indexTerms, matchesPlan } from '../.test-build/search.mjs';
import { makeSnapshot } from '../.test-build/snapshot.mjs';
import { demoDrafts } from '../.test-build/demo.mjs';
import { publicSupabaseConfig } from '../.test-build/public-config.mjs';
let passed = 0;
const check = (name, fn) =>
  Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log('PASS ' + name);
    });
export const db = new DatabaseSync(':memory:');
await check('reject privileged Supabase configuration', () => {
  assert.throws(() =>
    publicSupabaseConfig(
      'https://test.supabase.co',
      'sb_secret_never-expose-this',
    ),
  );
  const token =
    'eyJhbGciOiJIUzI1NiJ9.' +
    Buffer.from(JSON.stringify({ role: 'service_role' })).toString(
      'base64url',
    ) +
    '.signature';
  assert.throws(() => publicSupabaseConfig('https://test.supabase.co', token));
  assert.throws(() => publicSupabaseConfig('https://test.supabase.co', ''));
  assert.equal(
    publicSupabaseConfig(
      'https://test.supabase.co',
      'sb_publishable_test_public_key_only',
    ).url,
    'https://test.supabase.co',
  );
});
for (const name of (await fs.readdir('drizzle'))
  .filter((n) => n.endsWith('.sql'))
  .sort())
  db.exec(await fs.readFile('drizzle/' + name, 'utf8'));
class Stmt {
  constructor(sql) {
    this.sql = sql;
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }
  async first() {
    return db.prepare(this.sql).get(...this.args) ?? null;
  }
  async all() {
    return { results: db.prepare(this.sql).all(...this.args) };
  }
  async run() {
    const r = db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(r.changes) } };
  }
}
const d1 = {
  prepare: (sql) => new Stmt(sql),
  batch: async (ss) => {
    db.exec('BEGIN');
    try {
      const results = [];
      for (const s of ss) results.push(await s.run());
      db.exec('COMMIT');
      return results;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },
};
const a = new DemoStore(d1, 'owner-a'),
  b = new DemoStore(d1, 'owner-b');
await check('new-team date defaults to local today', () =>
  assert.equal(emptyDraft().team_date, localDate()),
);
await check('import date is Unknown', () =>
  assert.equal(emptyDraft(true).team_date, null),
);
await check('tag normalization deduplicates case', () =>
  assert.deepEqual(
    normalizeTags(['Tournament', 'tournament', ' TOURnament ']),
    ['Tournament'],
  ),
);
await check('invalid calendar date rejected', () =>
  assert.throws(() =>
    cleanMeta({
      ...demoDrafts[0],
      team_date: '2026-02-30',
      team_date_precision: 'exact',
    }),
  ),
);
const original =
  'Sparky (Pikachu) (F) @ Light Ball\nAbility: Static\nLevel: 50\nShiny: Yes\nHappiness: 0\nTera Type: Flying\nEVs: 4 HP / 252 SpA / 252 Spe\nIVs: 0 Atk / 0 Spe\nTimid Nature\n- Thunderbolt\n- Surf\n- Protect\n- Hidden Power [Ice]';
await check('parse detailed Showdown export and round trip', () => {
  const p = parseShowdown(original);
  const q = parseShowdown(p.canonical).sets[0];
  assert.equal(q.name, 'Sparky');
  assert.equal(q.species, 'Pikachu');
  assert.equal(q.ivs.atk, 0);
  assert.equal(q.ivs.spe, 0);
  assert.equal(q.happiness, 0);
  assert.equal(q.gender, 'F');
  assert.equal(q.shiny, true);
  assert.equal(q.teraType, 'Flying');
  assert.deepEqual(q.moves, p.sets[0].moves);
});
await check('unusual fields preserved in stored export', () => {
  const v = makeSnapshot(
    { ...demoDrafts[0], showdown_text: original + '\nCustom Field: keep me' },
    crypto.randomUUID(),
    1,
    null,
  );
  assert.match(v.showdown_text, /Custom Field: keep me/);
});
const imp = await a.import(demoDrafts);
const id = imp.ids[0];
const queries = [
  ['Darkrai', 1],
  ['Darkrai Ice Beam', 1],
  ['Focus Sash Rayquaza', 1],
  ['Gliscor Toxic', 1],
  ['Worlds Prep', 1],
  ['Strange Name', 3],
  ['source:"Strange Name"', 3],
  ['2022', 1],
  ['year:2022', 1],
  ['2022 Yveltal', 1],
  ['gen9ou Darkrai', 1],
  ['tag:"Tournament Grade"', 2],
  ['Altaria Registeel', 1],
];
for (const [q, expected] of queries)
  await check('search ' + q, async () => {
    const r = await a.list({ plan: planQuery(q) });
    assert.equal(r.total, expected);
  });
await check('same-set search excludes another Pokémon’s move', () => {
  const d = {
    ...demoDrafts[0],
    showdown_text:
      demoDrafts[0].showdown_text.replace('- Ice Beam', '- Psychic') +
      '\n\nBlastoise @ Leftovers\nAbility: Torrent\n- Ice Beam',
  };
  const s = makeSnapshot(d, crypto.randomUUID(), 1, null);
  assert.equal(
    matchesPlan(indexTerms(d, s), planQuery('Darkrai Ice Beam')),
    false,
  );
});
await check('unknown date never inherits import year', async () => {
  const t = await a.get(imp.ids[2]);
  assert.equal(t.team_date, null);
  assert.ok(t.imported_at);
  const r = await a.list({ plan: planQuery('year:2026') });
  assert.equal(r.total, 2);
});
await check('other owner cannot read or mutate guessed IDs', async () => {
  await assert.rejects(() => b.get(id), /not found/);
  await assert.rejects(() => b.patch(id, { favourite: true }), /not found/);
  assert.equal((await b.list({ plan: planQuery('') })).total, 0);
});
let t = await a.get(id),
  old = t.version;
await check('new version copies notes and preserves snapshot', async () => {
  t = await a.version(
    id,
    { ...t, ...t.version, version_comment: 'Edited for Gliscor matchup' },
    t.current_version_id,
    t.current_version_id,
  );
  assert.equal(t.version.version_number, 2);
  assert.deepEqual(t.version.set_notes, old.set_notes);
  assert.equal(t.history.length, 2);
  assert.equal(t.history[1].team_notes, old.team_notes);
  assert.equal((await a.list({ plan: planQuery('Darkrai') })).total, 1);
});
await check('historical versions reject in-place writes', () =>
  assert.throws(
    () =>
      db
        .prepare('UPDATE team_versions SET snapshot=? WHERE id=?')
        .run('{}', old.id),
    /immutable/,
  ),
);
await check('stale version save is rejected', async () => {
  await assert.rejects(
    () => a.version(id, { ...t, ...t.version }, old.id, old.id),
    /changed/,
  );
});
let token = (await a.share(id)).token;
await check('live share resolves current and pinned version', async () => {
  assert.equal((await resolveDemoShare(d1, token)).version.version_number, 2);
  assert.equal(
    (await resolveDemoShare(d1, token, 1)).version.version_number,
    1,
  );
});
await check(
  'restore creates a new version without deleting newer history',
  async () => {
    t = await a.version(
      id,
      { ...t, ...old, version_comment: 'Restored v1' },
      t.current_version_id,
      old.id,
    );
    assert.equal(t.history.length, 3);
    assert.equal(t.version.version_number, 3);
    assert.equal((await resolveDemoShare(d1, token)).version.version_number, 3);
  },
);
await check('sharing token is unpredictable and stored hashed', async () => {
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(
    db
      .prepare(
        'SELECT token_hash FROM share_links WHERE team_id=? AND revoked_at IS NULL',
      )
      .get(id).token_hash,
    token,
  );
});
await check('regeneration invalidates previous links', async () => {
  const next = (await a.share(id)).token;
  await assert.rejects(() => resolveDemoShare(d1, token));
  token = next;
});
await check('revocation invalidates link', async () => {
  await a.share(id, true);
  await assert.rejects(() => resolveDemoShare(d1, token));
});
await check(
  'bulk imports 10 teams with shared metadata and Unknown defaults',
  async () => {
    const text = Array.from(
      { length: 10 },
      (_, i) =>
        '=== [gen9ou] Old team ' + i + ' ===\n\n' + demoDrafts[0].showdown_text,
    ).join('\n\n');
    const batch = parseBatch(text);
    assert.equal(batch.length, 10);
    assert.ok(batch.every((x) => x.draft.team_date === null));
    const drafts = batch.map((x) => ({
      ...x.draft,
      source_type: 'Received from',
      source_name: 'Bulk Name',
      tags: ['Tourgrades'],
      team_date: '2024',
      team_date_precision: 'year',
    }));
    const r = await a.import(drafts);
    assert.equal(r.count, 10);
    const found = await a.list({
      plan: planQuery('source:"Bulk Name" year:2024 tag:Tourgrades'),
    });
    assert.equal(found.total, 10);
  },
);
await check('bulk adding tags preserves existing tags', async () => {
  await a.bulk([id], { tags: ['New Tag'] });
  assert.ok((await a.get(id)).tags.includes('Tournament Grade'));
  assert.ok((await a.get(id)).tags.includes('New Tag'));
});
await check('archiving and restoring keeps history', async () => {
  await a.patch(id, { archived: true });
  assert.equal(
    (await a.list({ plan: planQuery('Darkrai'), archived: true })).total,
    1,
  );
  await a.patch(id, { archived: false });
  assert.equal((await a.get(id)).history.length, 3);
});
await check('historical date Unknown sorts last both ways', async () => {
  for (const sort of ['date_asc', 'date_desc']) {
    const r = await a.list({ sort, plan: planQuery('') });
    assert.equal(r.teams.at(-1).team_date, null);
  }
});
await check('search lookup has indexed query plan', () => {
  const p = db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM search_terms WHERE field='pokemon' AND value='darkrai'",
    )
    .all();
  assert.match(JSON.stringify(p), /terms_lookup/);
});
console.log('SQLite + domain: ' + passed + ' checks passed.');
