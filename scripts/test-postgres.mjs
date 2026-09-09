import { snapshotRevision } from '../.test-build/domain.mjs';
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { testSaveModel, argsFor, draftOf } from './test-save-model.mjs';
import fs from 'node:fs/promises';
import { SupabaseStore } from '../.test-build/supabase-store.mjs';
import { demoDrafts } from '../.test-build/demo.mjs';
import { planQuery } from '../.test-build/search.mjs';
import { makeSnapshot } from '../.test-build/snapshot.mjs';
const pg = new PGlite();
await pg.exec(
  "CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;",
);
for (const name of (await fs.readdir('supabase/migrations'))
  .filter((n) => n.endsWith('.sql'))
  .sort()) {
  await pg.exec(await fs.readFile('supabase/migrations/' + name, 'utf8'));
}
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222';
await pg.query('INSERT INTO auth.users(id) VALUES($1),($2)', [a, b]);
await pg.exec('SET ROLE authenticated');
await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [a]);
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log('PASS PG ' + name);
}
const rpc = async (action, payload = {}) =>
  (
    await pg.query('SELECT public.vault($1,$2::jsonb) AS data', [
      action,
      JSON.stringify(payload),
    ])
  ).rows[0].data;
const client = {
  rpc: async (name, args) => {
    try {
      const data =
        name === 'delete_team'
          ? (
              await pg.query('SELECT public.delete_team($1) AS data', [
                args.p_id,
              ])
            ).rows[0].data
          : await rpc(args.action, args.payload);
      return { data, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  },
};
const store = new SupabaseStore(client);
let ids = (await store.import(demoDrafts)).ids;
await check('migration, authenticated import and Unknown date', async () => {
  assert.equal(ids.length, 6);
  const t = await store.get(ids[2]);
  assert.equal(t.team_date, null);
  assert.ok(t.imported_at);
});
for (const [q, n] of [
  ['Darkrai Ice Beam', 1],
  ['Focus Sash Rayquaza', 1],
  ['source:"Strange Name"', 3],
  ['year:2022', 1],
  ['Worlds Prep', 1],
  ['gen9ou Darkrai', 1],
])
  await check('indexed search ' + q, async () =>
    assert.equal((await store.list({ plan: planQuery(q) })).total, n),
  );
await check(
  'RLS hides other owners and RPC rejects ownership forgery',
  async () => {
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal((await pg.query('SELECT * FROM public.teams')).rows.length, 0);
    await assert.rejects(() => store.get(ids[0]), /not found/);
    await assert.rejects(() => store.share(ids[0]), /not found/);
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [a]);
  },
);
await check('direct writes denied even to owner', async () => {
  await assert.rejects(
    () =>
      pg.query("UPDATE public.teams SET title='forged' WHERE id=$1", [ids[0]]),
    /permission denied/,
  );
  await assert.rejects(
    () => pg.query("UPDATE public.team_versions SET snapshot='{}'"),
    /permission denied/,
  );
});
let t = await store.get(ids[0]),
  old = t.version;
await check('immutable versions copy notes', async () => {
  t = await store.version(
    t.id,
    { ...t, ...t.version, version_comment: 'Matchup adjustment' },
    t.current_version_id,
    t.current_version_id,
    snapshotRevision(t.version),
    t.updated_at,
  );
  assert.equal(t.version.version_number, 2);
  assert.deepEqual(t.version.set_notes, old.set_notes);
  assert.equal(t.history.length, 2);
});
await check(
  'optimistic stale and missing expected versions rejected',
  async () => {
    await assert.rejects(
      () =>
        store.version(
          t.id,
          { ...t, ...t.version },
          old.id,
          old.id,
          snapshotRevision(t.version),
          t.updated_at,
        ),
      /changed/,
    );
    await assert.rejects(
      () => rpc('version', { id: t.id, parent: old.id }),
      /changed/,
    );
  },
);
let token = (await store.share(t.id)).token;
async function resolve(token, version = null) {
  return (
    await pg.query('SELECT public.resolve_share($1,$2) AS data', [
      token,
      version,
    ])
  ).rows[0].data;
}
await check(
  'anonymous share has a restricted projection and no raw table access',
  async () => {
    await pg.exec('SET ROLE anon');
    const r = await resolve(token);
    assert.equal(r.version.version_number, 2);
    assert.equal(r.owner_id, undefined);
    assert.equal(r.history, undefined);
    assert.equal(r.token_hash, undefined);
    await assert.rejects(
      () => pg.query('SELECT * FROM public.teams'),
      /permission denied/,
    );
    await assert.rejects(() => rpc('list', {}), /permission denied/);
    await pg.exec('SET ROLE authenticated');
  },
);
await check(
  'restore preserves newer history and live link advances',
  async () => {
    t = await store.version(
      t.id,
      { ...t, ...old, version_comment: 'Restore original' },
      t.current_version_id,
      old.id,
      snapshotRevision(t.version),
      t.updated_at,
    );
    assert.equal(t.history.length, 3);
    assert.equal((await resolve(token)).version.version_number, 3);
    assert.equal((await resolve(token, 1)).version.version_number, 1);
  },
);
await check('share rotation and revocation', async () => {
  const oldtoken = token;
  token = (await store.share(t.id)).token;
  assert.equal(await resolve(oldtoken), null);
  await store.share(t.id, true);
  assert.equal(await resolve(token), null);
});
await check(
  'bulk metadata is applied to ten teams and retains tags',
  async () => {
    const ten = await store.import(
      Array.from({ length: 10 }, (_, i) => ({
        ...demoDrafts[0],
        title: 'Bulk ' + i,
      })),
    );
    await store.bulk(ten.ids, {
      tags: ['Tourgrades'],
      source_type: 'Received from',
      source_name: 'Batch Friend',
      team_date: '2024',
      team_date_precision: 'year',
    });
    const r = await store.list({
      plan: planQuery('source:"Batch Friend" year:2024 tag:Tourgrades'),
    });
    assert.equal(r.total, 10);
    for (const team of r.teams)
      assert.ok(team.tags.includes('Tournament Grade'));
  },
);
await check('favourite toggle retains title and versions', async () => {
  const before = await store.get(t.id);
  await store.patch(t.id, { favourite: true });
  const after = await store.get(t.id);
  assert.equal(after.title, before.title);
  assert.deepEqual(after.tags, before.tags);
  assert.equal(after.history.length, before.history.length);
  assert.equal(after.favourite, true);
});
await check('malformed snapshot rollback is atomic', async () => {
  const before = await store.list({ plan: planQuery('') });
  await assert.rejects(
    () =>
      rpc('import', {
        teams: [
          {
            id: crypto.randomUUID(),
            meta: demoDrafts[0],
            snapshot: { id: crypto.randomUUID(), showdown_text: 'Bad' },
            terms: [],
          },
        ],
      }),
    /Invalid team snapshot/,
  );
  assert.equal((await store.list({ plan: planQuery('') })).total, before.total);
});
await check(
  'inclusive archive list and facets retain filters, ownership and history',
  async () => {
    const before = await store.get(t.id),
      active = await store.facets();
    await store.patch(t.id, { archived: true, favourite: true });
    const defaults = await store.list({ plan: planQuery('') });
    const inclusive = await store.list({
      plan: planQuery(''),
      include_archived: true,
    });
    assert.equal(inclusive.total, defaults.total + 1);
    assert.equal(
      (await store.list({ plan: planQuery(''), include_archived: false }))
        .total,
      defaults.total,
    );
    assert.equal(
      (await store.list({ plan: planQuery(''), include_archived: 'true' }))
        .total,
      defaults.total,
    );
    assert.equal(
      (await store.list({ plan: planQuery(''), archived: true })).teams[0].id,
      t.id,
    );
    assert.equal(
      (
        await store.list({
          plan: planQuery(''),
          include_archived: true,
          archived: true,
        })
      ).total,
      inclusive.total,
    );
    assert.ok(
      (
        await store.list({
          plan: planQuery('Darkrai'),
          include_archived: true,
          favourite: true,
        })
      ).teams.some((x) => x.id === t.id),
    );
    const facets = await store.facets({ include_archived: true }),
      defaultFacets = await store.facets();
    assert.equal(facets.all, active.all);
    assert.equal(facets.all, defaultFacets.all + 1);
    assert.equal(facets.favourites, defaultFacets.favourites + 1);
    assert.deepEqual(facets.formats, defaultFacets.formats);
    assert.equal(facets.archived, defaultFacets.archived);
    const after = await store.get(t.id);
    assert.equal(after.archived, true);
    assert.deepEqual(after.history, before.history);
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.ok(
      !(
        await store.list({ plan: planQuery(''), include_archived: true })
      ).teams.some((x) => x.id === t.id),
    );
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [a]);
    await store.patch(t.id, {
      archived: before.archived,
      favourite: before.favourite,
    });
  },
);
await check(
  'private helpers are not callable by authenticated clients',
  async () => {
    await assert.rejects(
      () => pg.query('SELECT private.get_team($1,$2)', [ids[0], a]),
      /permission denied/,
    );
  },
);
await check('unknown dates sort last both directions', async () => {
  for (const sort of ['date_asc', 'date_desc']) {
    const r = await store.list({ sort, plan: planQuery('') });
    assert.equal(r.teams.at(-1).team_date, null);
  }
});
let deletionTeam = await store.get(
  (await store.import([{ ...demoDrafts[0], title: 'Delete this team' }]))
    .ids[0],
);
const keptTeam = await store.get(t.id);
for (let i = 0; i < 2; i++) {
  deletionTeam = await store.version(
    deletionTeam.id,
    { ...deletionTeam, ...deletionTeam.version },
    deletionTeam.current_version_id,
    deletionTeam.history.at(-1).id,
    snapshotRevision(deletionTeam.version),
    deletionTeam.updated_at,
  );
}
const deletionToken = (await store.share(deletionTeam.id)).token;
await check(
  'delete RPC rejects other owners, anonymous access and direct writes',
  async () => {
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [b]);
    await assert.rejects(() => store.delete(deletionTeam.id), /not found/);
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [a]);
    await pg.exec('SET ROLE anon');
    await assert.rejects(
      () => store.delete(deletionTeam.id),
      /permission denied/,
    );
    await pg.exec('SET ROLE authenticated');
    await assert.rejects(
      () => pg.query('DELETE FROM public.teams WHERE id=$1', [deletionTeam.id]),
      /permission denied/,
    );
    assert.equal((await store.get(deletionTeam.id)).history.length, 3);
  },
);
await check(
  'deletion cascades restored history and invalidates live and pinned links',
  async () => {
    assert.deepEqual(await store.delete(deletionTeam.id), { deleted: true });
    await assert.rejects(() => store.get(deletionTeam.id), /not found/);
    assert.equal(await resolve(deletionToken), null);
    assert.equal(await resolve(deletionToken, 1), null);
    await pg.exec('RESET ROLE');
    for (const table of [
      'team_versions',
      'search_terms',
      'team_tags',
      'share_links',
    ]) {
      assert.equal(
        Number(
          (
            await pg.query(
              `SELECT count(*) AS n FROM public.${table} WHERE team_id=$1`,
              [deletionTeam.id],
            )
          ).rows[0].n,
        ),
        0,
      );
    }
    await pg.exec('SET ROLE authenticated');
    assert.deepEqual(await store.get(t.id), keptTeam);
    assert.ok((await store.facets()).tags.includes('Tournament Grade'));
  },
);
await check(
  'archived deletion succeeds and repeated deletion is rejected',
  async () => {
    const archivedId = (
      await store.import([{ ...demoDrafts[0], title: 'Archived deletion' }])
    ).ids[0];
    await store.patch(archivedId, { archived: true });
    assert.deepEqual(await store.delete(archivedId), { deleted: true });
    await assert.rejects(() => store.delete(archivedId), /not found/);
  },
);
await check(
  'explicit note search includes only current notes and stays owner-scoped',
  async () => {
    const noteId = (
      await store.import([
        {
          ...demoDrafts[0],
          team_notes: 'Teamnotemarker',
          set_notes: ['Setnotemarker retained'],
        },
      ])
    ).ids[0];
    let team = await store.get(noteId);
    const originalVersion = team.version;
    const find = async (query) =>
      (await store.list({ plan: planQuery(query) })).teams.some(
        (t) => t.id === noteId,
      );
    for (const q of [
      'note:Teamnotemarker',
      'note:"Setnotemarker retained"',
      'Darkrai note:Setnotemarker',
    ])
      assert.ok(await find(q));
    assert.equal(await find('source:Setnotemarker'), false);
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal(await find('note:Setnotemarker'), false);
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [a]);
    team = await store.version(
      noteId,
      { ...team, ...team.version, team_notes: '', set_notes: [] },
      team.current_version_id,
      team.current_version_id,
      snapshotRevision(team.version),
      team.updated_at,
    );
    assert.equal(await find('note:Setnotemarker'), false);
    assert.equal(await find('note:Teamnotemarker'), false);
    await store.version(
      noteId,
      { ...team, ...originalVersion },
      team.current_version_id,
      originalVersion.id,
      snapshotRevision(team.version),
      team.updated_at,
    );
    assert.ok(await find('note:Setnotemarker'));
    await store.delete(noteId);
  },
);
await testSaveModel({
  check,
  store,
  template: demoDrafts[0],
  resolve,
  historicalWrite: async (_, old) => {
    await pg.exec('RESET ROLE');
    try {
      await assert.rejects(
        () =>
          pg.query(
            'UPDATE public.team_versions SET snapshot=$1::jsonb WHERE id=$2',
            [
              JSON.stringify({
                ...old,
                edit_revision: crypto.randomUUID(),
                team_notes: 'Forbidden historical write',
              }),
              old.id,
            ],
          ),
        /immutable/i,
      );
    } finally {
      await pg.exec('SET ROLE authenticated');
    }
  },
  identityWrite: async (team) => {
    await pg.exec('RESET ROLE');
    try {
      await assert.rejects(
        () =>
          pg.query(
            'UPDATE public.team_versions SET version_number=999 WHERE id=$1',
            [team.version.id],
          ),
        /immutable/i,
      );
      await assert.rejects(
        () =>
          pg.query(
            'UPDATE public.team_versions SET snapshot=$1::jsonb WHERE id=$2',
            [
              JSON.stringify({
                ...team.version,
                edit_revision: crypto.randomUUID(),
                original_text: 'Forbidden source overwrite',
              }),
              team.version.id,
            ],
          ),
        /immutable/i,
      );
    } finally {
      await pg.exec('SET ROLE authenticated');
    }
  },
  rewind: async (team, old) => {
    await pg.exec('RESET ROLE');
    try {
      await assert.rejects(
        () =>
          pg.query(
            'UPDATE public.teams SET current_version_id=$1 WHERE id=$2',
            [old.id, team.id],
          ),
        /pointer/,
      );
    } finally {
      await pg.exec('SET ROLE authenticated');
    }
  },
  otherOwner: async (team) => {
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [b]);
    try {
      await assert.rejects(
        () => store.save(...argsFor(team, draftOf(team))),
        /not found/,
      );
      await assert.rejects(
        () => store.version(...argsFor(team, draftOf(team))),
        /not found/,
      );
      await assert.rejects(() => rpc('save', { id: team.id }), /not found/);
    } finally {
      await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
        a,
      ]);
    }
  },
  legacyImport: async (draft) => {
    const id = crypto.randomUUID(),
      snapshot = makeSnapshot(draft, id, 1, null);
    delete snapshot.edit_revision;
    const imported = await rpc('import', {
      teams: [{ id, meta: draft, snapshot, imported: false, terms: [] }],
    });
    return store.get(imported.ids[0]);
  },
});
await check(
  'direct RPC Save requires revision and metadata timestamp under lock',
  async () => {
    const team = await store.get((await store.import([demoDrafts[0]])).ids[0]);
    for (const patch of [
      { expected_revision: undefined },
      { expected_updated_at: undefined },
      { expected_revision: 'stale-revision' },
      { expected_updated_at: '2000-01-01T00:00:00Z' },
    ])
      await assert.rejects(
        () =>
          rpc('save', {
            id: team.id,
            expected: team.current_version_id,
            parent: team.current_version_id,
            expected_revision: snapshotRevision(team.version),
            expected_updated_at: team.updated_at,
            ...patch,
          }),
        /changed/,
      );
    assert.deepEqual(await store.get(team.id), team);
    await store.delete(team.id);
  },
);
for (const [loserAction, winnerAction] of [
  ['save', 'save'],
  ['save', 'version'],
  ['version', 'save'],
  ['version', 'version'],
]) {
  await check(
    `RPC ${loserAction}/${winnerAction} race rejects stale preparation atomically`,
    async () => {
      const before = await store.get(
        (await store.import([{ ...demoDrafts[0], title: 'RPC race fixture' }]))
          .ids[0],
      );
      let winner;
      const racing = new SupabaseStore({
        rpc: async (name, payload) => {
          if (payload.action === loserAction) {
            winner = await store[winnerAction](
              ...argsFor(
                before,
                draftOf(before, {
                  team_notes: 'Winner note',
                  tags: ['Winner tag'],
                }),
              ),
            );
          }
          return client.rpc(name, payload);
        },
      });
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
      assert.deepEqual(await store.get(before.id), winner);
      assert.equal(
        (
          await store.list({ plan: planQuery('note:"Losing note"') })
        ).teams.some((t) => t.id === before.id),
        false,
      );
      assert.equal((await store.facets()).tags.includes('Losing tag'), false);
      await store.delete(before.id);
    },
  );
}
console.log('PostgreSQL: ' + passed + ' checks passed.');
await pg.close();
