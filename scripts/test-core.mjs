import { testLargeWorkflows } from './test-large-workflows.mjs';
import { testVariants } from './test-variants.mjs';
import { testCollections } from './test-collections.mjs';
import { resolveDemoCollection } from '../.test-build/demo-collections.mjs';
import { snapshotRevision } from '../.test-build/domain.mjs';
import assert from 'node:assert/strict';
import { testSaveModel, argsFor, draftOf } from './test-save-model.mjs';
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
    snapshotRevision(t.version),
    t.updated_at,
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
    () =>
      a.version(
        id,
        { ...t, ...t.version },
        old.id,
        old.id,
        snapshotRevision(t.version),
        t.updated_at,
      ),
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
      snapshotRevision(t.version),
      t.updated_at,
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
await check(
  'inclusive archive list and facets retain flags, owner isolation and filters',
  async () => {
    const before = await a.get(id),
      active = await a.facets();
    await a.patch(id, { archived: true, favourite: true });
    const defaults = await a.list({ plan: planQuery('') });
    const inclusive = await a.list({
      plan: planQuery(''),
      include_archived: true,
    });
    assert.equal(inclusive.total, defaults.total + 1);
    assert.equal(
      (await a.list({ plan: planQuery(''), include_archived: false })).total,
      defaults.total,
    );
    assert.equal(
      (await a.list({ plan: planQuery(''), include_archived: 'true' })).total,
      defaults.total,
    );
    assert.equal(
      (
        await a.list({
          plan: planQuery(''),
          include_archived: true,
          archived: true,
        })
      ).total,
      inclusive.total,
    );
    assert.equal(
      (
        await a.list({
          plan: planQuery('Darkrai'),
          include_archived: true,
          favourite: true,
        })
      ).teams[0].id,
      id,
    );
    assert.equal(
      (await b.list({ plan: planQuery(''), include_archived: true })).total,
      0,
    );
    const facets = await a.facets({ include_archived: true }),
      defaultFacets = await a.facets();
    assert.equal(facets.all, active.all);
    assert.equal(facets.all, defaultFacets.all + 1);
    assert.equal(facets.favourites, defaultFacets.favourites + 1);
    assert.deepEqual(facets.formats, defaultFacets.formats);
    assert.equal(facets.archived, defaultFacets.archived);
    const after = await a.get(id);
    assert.equal(after.archived, true);
    assert.deepEqual(after.history, before.history);
    await a.patch(id, {
      archived: before.archived,
      favourite: before.favourite,
    });
  },
);
await check('search lookup has indexed query plan', () => {
  const p = db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM search_terms WHERE field='pokemon' AND value='darkrai'",
    )
    .all();
  assert.match(JSON.stringify(p), /terms_lookup/);
});
let deletionTeam = await a.get(
  (await a.import([{ ...demoDrafts[0], title: 'Delete this team' }])).ids[0],
);
const keptTeam = await a.get(id);
for (let i = 0; i < 2; i++) {
  deletionTeam = await a.version(
    deletionTeam.id,
    { ...deletionTeam, ...deletionTeam.version },
    deletionTeam.current_version_id,
    deletionTeam.history.at(-1).id,
    snapshotRevision(deletionTeam.version),
    deletionTeam.updated_at,
  );
}
const deletionToken = (await a.share(deletionTeam.id)).token;
await check(
  'deletion rejects another owner without changing the team',
  async () => {
    await assert.rejects(() => b.delete(deletionTeam.id), /not found/);
    assert.equal((await a.get(deletionTeam.id)).history.length, 3);
    assert.ok(await resolveDemoShare(d1, deletionToken));
  },
);
await check(
  'deletion cascades all history and links while preserving other teams',
  async () => {
    assert.deepEqual(await a.delete(deletionTeam.id), { deleted: true });
    await assert.rejects(() => a.get(deletionTeam.id), /not found/);
    for (const table of [
      'team_versions',
      'search_terms',
      'team_tags',
      'share_links',
    ]) {
      assert.equal(
        db
          .prepare(`SELECT count(*) AS n FROM ${table} WHERE team_id=?`)
          .get(deletionTeam.id).n,
        0,
      );
    }
    await assert.rejects(() => resolveDemoShare(d1, deletionToken));
    await assert.rejects(() => resolveDemoShare(d1, deletionToken, 1));
    assert.deepEqual(await a.get(id), keptTeam);
    assert.ok((await a.facets()).tags.includes('Tournament Grade'));
  },
);
await check(
  'archived teams can be deleted and repeated deletion is rejected',
  async () => {
    const archivedId = (
      await a.import([{ ...demoDrafts[0], title: 'Archived deletion' }])
    ).ids[0];
    await a.patch(archivedId, { archived: true });
    assert.deepEqual(await a.delete(archivedId), { deleted: true });
    await assert.rejects(() => a.delete(archivedId), /not found/);
  },
);
await check(
  'explicit note search includes only current notes and stays owner-scoped',
  async () => {
    const draft = {
      ...demoDrafts[0],
      team_notes: 'Teamnotemarker',
      set_notes: ['Setnotemarker retained'],
    };
    const noteId = (await a.import([draft])).ids[0];
    let team = await a.get(noteId);
    const originalVersion = team.version;
    const find = async (query, store = a) =>
      (await store.list({ plan: planQuery(query) })).teams.some(
        (t) => t.id === noteId,
      );
    for (const q of [
      'note:Teamnotemarker',
      'note:"Setnotemarker retained"',
      'Darkrai note:Setnotemarker',
    ]) {
      assert.ok(await find(q));
      assert.ok(matchesPlan(indexTerms(team, team.version), planQuery(q)));
      assert.equal(await find(q, b), false);
    }
    assert.equal(await find('source:Setnotemarker'), false);
    team = await a.version(
      noteId,
      { ...team, ...team.version, team_notes: '', set_notes: [] },
      team.current_version_id,
      team.current_version_id,
      snapshotRevision(team.version),
      team.updated_at,
    );
    assert.equal(await find('note:Setnotemarker'), false);
    assert.equal(await find('note:Teamnotemarker'), false);
    await a.version(
      noteId,
      { ...team, ...originalVersion },
      team.current_version_id,
      originalVersion.id,
      snapshotRevision(team.version),
      team.updated_at,
    );
    assert.ok(await find('note:Setnotemarker'));
    await a.delete(noteId);
  },
);
await testSaveModel({
  check,
  store: a,
  template: demoDrafts[0],
  resolve: (token, n) => resolveDemoShare(d1, token, n),
  historicalWrite: async (_, old) =>
    assert.throws(
      () =>
        db.prepare('UPDATE team_versions SET snapshot=? WHERE id=?').run(
          JSON.stringify({
            ...old,
            edit_revision: crypto.randomUUID(),
            team_notes: 'Forbidden historical write',
          }),
          old.id,
        ),
      /immutable/i,
    ),
  identityWrite: async (team) => {
    assert.throws(
      () =>
        db
          .prepare('UPDATE team_versions SET version_number=999 WHERE id=?')
          .run(team.version.id),
      /immutable/i,
    );
    assert.throws(
      () =>
        db.prepare('UPDATE team_versions SET snapshot=? WHERE id=?').run(
          JSON.stringify({
            ...team.version,
            edit_revision: crypto.randomUUID(),
            original_text: 'Forbidden source overwrite',
          }),
          team.version.id,
        ),
      /immutable/i,
    );
  },
  rewind: async (team, old) =>
    assert.throws(
      () =>
        db
          .prepare('UPDATE teams SET current_version_id=? WHERE id=?')
          .run(old.id, team.id),
      /pointer/,
    ),
  otherOwner: async (team) => {
    await assert.rejects(
      () => b.save(...argsFor(team, draftOf(team))),
      /not found/,
    );
    await assert.rejects(
      () => b.version(...argsFor(team, draftOf(team))),
      /not found/,
    );
  },
  legacyImport: async (draft) => {
    const teamId = crypto.randomUUID(),
      m = cleanMeta(draft),
      v = makeSnapshot(draft, teamId, 1, null);
    delete v.edit_revision;
    db.prepare(
      'INSERT INTO teams(id,owner_id,title,format,team_date,source_name,metadata,current_version_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    ).run(
      teamId,
      'owner-a',
      m.title,
      m.format,
      m.team_date,
      m.source_name,
      JSON.stringify(m),
      v.id,
      v.created_at,
      v.created_at,
    );
    db.prepare(
      'INSERT INTO team_versions(id,team_id,version_number,snapshot,created_at) VALUES(?,?,?,?,?)',
    ).run(v.id, teamId, 1, JSON.stringify(v), v.created_at);
    return a.get(teamId);
  },
});
for (const [loserAction, winnerAction] of [
  ['save', 'save'],
  ['save', 'version'],
  ['version', 'save'],
  ['version', 'version'],
]) {
  await check(
    `D1 atomic ${loserAction}/${winnerAction} race preserves winning content and indexes`,
    async () => {
      const before = await a.get(
        (await a.import([{ ...demoDrafts[0], title: 'Race regression' }]))
          .ids[0],
      );
      let winner;
      const racing = new DemoStore(
        {
          prepare: d1.prepare,
          batch: async (statements) => {
            winner = await a[winnerAction](
              ...argsFor(
                before,
                draftOf(before, {
                  team_notes: 'Winner marker',
                  tags: ['Winner tag'],
                }),
              ),
            );
            return d1.batch(statements);
          },
        },
        'owner-a',
      );
      await assert.rejects(
        () =>
          racing[loserAction](
            ...argsFor(
              before,
              draftOf(before, {
                team_notes: 'Losing note',
                tags: ['Losing tag'],
              }),
            ),
          ),
        /changed/,
      );
      assert.deepEqual(await a.get(before.id), winner);
      assert.equal(
        (await a.list({ plan: planQuery('note:"Losing note"') })).teams.some(
          (t) => t.id === before.id,
        ),
        false,
      );
      assert.equal((await a.facets()).tags.includes('Losing tag'), false);
      await a.delete(before.id);
    },
  );
}
await check(
  'incremental current-save migration leaves legacy snapshots byte-identical',
  async () => {
    const legacy = new DatabaseSync(':memory:');
    try {
      for (const file of [
        '0000_ordinary_victor_mancha.sql',
        '0001_version_guards.sql',
      ])
        legacy.exec(await fs.readFile('drizzle/' + file, 'utf8'));
      const draft = demoDrafts[0],
        teamId = crypto.randomUUID(),
        m = cleanMeta(draft);
      const v1 = makeSnapshot(draft, teamId, 1, null),
        v2 = makeSnapshot(draft, teamId, 2, v1.id);
      delete v1.edit_revision;
      delete v2.edit_revision;
      legacy
        .prepare(
          'INSERT INTO teams(id,owner_id,title,format,team_date,source_name,metadata,current_version_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          teamId,
          'owner-a',
          m.title,
          m.format,
          m.team_date,
          m.source_name,
          JSON.stringify(m),
          v1.id,
          v1.created_at,
          v1.created_at,
        );
      for (const v of [v1, v2])
        legacy
          .prepare(
            'INSERT INTO team_versions(id,team_id,version_number,snapshot,created_at) VALUES(?,?,?,?,?)',
          )
          .run(v.id, teamId, v.version_number, JSON.stringify(v), v.created_at);
      legacy
        .prepare('UPDATE teams SET current_version_id=? WHERE id=?')
        .run(v2.id, teamId);
      const before = legacy
        .prepare('SELECT * FROM team_versions ORDER BY version_number')
        .all();
      legacy.exec(
        await fs.readFile('drizzle/0002_edit_current_version.sql', 'utf8'),
      );
      assert.deepEqual(
        legacy
          .prepare('SELECT * FROM team_versions ORDER BY version_number')
          .all(),
        before,
      );
      assert.throws(
        () =>
          legacy
            .prepare('UPDATE teams SET current_version_id=? WHERE id=?')
            .run(v1.id, teamId),
        /pointer/,
      );
    } finally {
      legacy.close();
    }
  },
);
await check(
  'bulk deletion rechecks ownership/existence inside its transaction',
  async () => {
    const { ids } = await a.import([demoDrafts[0], demoDrafts[1]]);
    const key = { operation_id: crypto.randomUUID(), chunk_index: 0 };
    const racing = new DemoStore(
      {
        prepare: d1.prepare,
        batch: async (statements) => {
          await a.delete(ids[0]);
          return d1.batch(statements);
        },
      },
      'owner-a',
    );
    await assert.rejects(
      () => racing.bulkDelete(ids, key),
      /deleted elsewhere/,
    );
    assert.ok(await a.get(ids[1]));
    assert.equal(
      db
        .prepare('SELECT count(*) n FROM operation_chunks WHERE operation_id=?')
        .get(key.operation_id).n,
      0,
    );
    await a.delete(ids[1]);
  },
);
await testLargeWorkflows(a, b, check, 1000);
await testVariants(a, b, check);
await testCollections(
  a,
  b,
  (token, p) => resolveDemoCollection(d1, token, p),
  check,
);
console.log('SQLite + domain: ' + passed + ' checks passed.');
