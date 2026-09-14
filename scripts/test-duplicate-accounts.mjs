import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { MemoryDatabase } from '../.test-build/local-db.mjs';
import { LocalLibrary } from '../.test-build/local-library.mjs';
import { emptyDraft } from '../.test-build/domain.mjs';
import { duplicateSuggestionKey } from '../.test-build/duplicate-teams.mjs';
import { cloudPayload } from '../.test-build/cloud-server.mjs';

const pg = new PGlite();
await pg.exec(
  "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;",
);
for (const name of (await fs.readdir('supabase/migrations'))
  .filter((n) => n.endsWith('.sql'))
  .sort())
  await pg.exec(await fs.readFile('supabase/migrations/' + name, 'utf8'));
let serial = Promise.resolve();
const rpc = (account, action, payload = {}) => {
  if (action === 'put') payload = { ...payload, ...cloudPayload(payload.team) };
  const run = serial.then(async () => {
    await pg.exec('SET ROLE ' + (account ? 'authenticated' : 'anon'));
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      account?.id || '',
    ]);
    return (
      await pg.query('SELECT public.local_first($1,$2) data', [action, payload])
    ).rows[0].data;
  });
  serial = run.catch(() => {});
  return run;
};
const a = { id: crypto.randomUUID(), name: 'A' },
  b = { id: crypto.randomUUID(), name: 'B' };
for (const account of [a, b])
  await pg.query('INSERT INTO auth.users VALUES($1,$2,$3)', [
    account.id,
    account.id + '@example.test',
    {},
  ]);
const draft = {
  ...emptyDraft(true),
  format: 'gen9ou',
  showdown_text: [
    'Pikachu',
    'Charizard',
    'Blastoise',
    'Venusaur',
    'Gengar',
    'Dragonite',
  ]
    .map((s) => s + '\n- Protect')
    .join('\n\n'),
};
const seed = async (db, namespace) => {
  const anonDb = new MemoryDatabase();
  const anon = new LocalLibrary(anonDb, null, async () => {
    throw Error('No anonymous network');
  });
  const { ids } = await anon.perform('import', {
    drafts: [
      { ...draft, title: 'Original' },
      { ...draft, title: 'Variant' },
    ],
  });
  await db.commit(
    namespace,
    await Promise.all(ids.map((id) => anonDb.get('anonymous', id))),
  );
  return ids;
};
try {
  let offline = false,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const firstDb = new MemoryDatabase();
  const first = new LocalLibrary(firstDb, a, async (action, payload) => {
    if (offline) throw Error('Offline');
    await gate;
    return rpc(a, action, payload);
  });
  await seed(firstDb, first.namespace);
  assert.deepEqual(await first.perform('duplicate_suggestion'), []);
  const initial = first.sync();
  const scan = first.perform('duplicate_suggestion');
  assert.equal(
    (await first.perform('list')).total,
    2,
    'Library reads remain available during delayed preferences',
  );
  release();
  await initial;
  assert.equal((await scan).length, 1);
  await rpc(a, 'preferences_save', { autoCloud: true, acknowledged: true });
  offline = true;
  await first.perform('duplicate_suggestion_dismiss');
  await first.sync();
  assert.equal(
    await firstDb.value(first.namespace, duplicateSuggestionKey),
    true,
  );
  assert.equal((await rpc(a, 'preferences')).duplicateSuggestionSeen, false);
  const reopened = new LocalLibrary(firstDb, a, (action, payload) =>
    rpc(a, action, payload),
  );
  await reopened.sync();
  assert.deepEqual(
    await rpc(a, 'preferences'),
    { autoCloud: true, acknowledged: true, duplicateSuggestionSeen: true },
    'Only dismissal is patched, preserving Cloud settings',
  );
  const secondDb = new MemoryDatabase();
  const second = new LocalLibrary(secondDb, a, (action, payload) =>
    rpc(a, action, payload),
  );
  await seed(secondDb, second.namespace);
  assert.deepEqual(
    await second.perform('duplicate_suggestion'),
    [],
    'New browser must not flash before hydration',
  );
  await second.sync();
  assert.deepEqual(await second.perform('duplicate_suggestion'), []);
  assert.equal(
    await secondDb.value(second.namespace, duplicateSuggestionKey),
    true,
  );
  await rpc(a, 'preferences_save', {
    autoCloud: false,
    duplicateSuggestionSeen: false,
  });
  assert.equal(
    (await rpc(a, 'preferences')).duplicateSuggestionSeen,
    true,
    'Stale device cannot clear the flag',
  );
  let holdUpload = false,
    releaseUpload,
    uploadStarted;
  const uploadGate = new Promise((resolve) => {
    releaseUpload = resolve;
  });
  const uploadWaiting = new Promise((resolve) => {
    uploadStarted = resolve;
  });
  const other = new LocalLibrary(secondDb, b, async (action, payload) => {
    if (action === 'put' && holdUpload) {
      holdUpload = false;
      uploadStarted();
      await uploadGate;
    }
    return rpc(b, action, payload);
  });
  const ids = await seed(secondDb, other.namespace);
  await other.sync();
  assert.equal(
    (await other.perform('duplicate_suggestion')).length,
    1,
    'Other account remains independent',
  );
  await rpc(b, 'preferences_save', { acknowledged: true });
  await other.sync();
  const beforeMerge = await Promise.all(
    ids.map((id) => other.perform('get', { id })),
  );
  holdUpload = true;
  const uploading = other.perform('cloud_enable', { ids });
  await uploadWaiting;
  await other.perform('family_merge', { ids, id: ids[1], standalone: true });
  releaseUpload();
  await uploading;
  await other.sync();
  const third = new LocalLibrary(new MemoryDatabase(), b, (action, payload) =>
    rpc(b, action, payload),
  );
  await third.sync();
  for (const original of beforeMerge) {
    const synced = await third.perform('get', { id: original.id });
    assert.equal(
      synced.family_id,
      ids[1],
      'Timestamp-preserving cleanup merge reaches the second device',
    );
    assert.equal(synced.updated_at, original.updated_at);
    assert.deepEqual(synced.version.parsed_team, original.version.parsed_team);
  }
  assert.equal(
    (await rpc(b, 'preferences')).duplicateSuggestionSeen,
    true,
    'Completion uses the same preference sync',
  );
  const anon = new LocalLibrary(secondDb, null, async () => {
    throw Error('Anonymous must not sync');
  });
  await seed(secondDb, anon.namespace);
  assert.equal((await anon.perform('duplicate_suggestion')).length, 1);
  await anon.perform('duplicate_suggestion_dismiss');
  const freshAnonymousDb = new MemoryDatabase();
  await seed(freshAnonymousDb, 'anonymous');
  assert.equal(
    (
      await new LocalLibrary(freshAnonymousDb, null, rpc).perform(
        'duplicate_suggestion',
      )
    ).length,
    1,
    'Anonymous dismissal remains browser-local',
  );
  await assert.rejects(rpc(null, 'preferences'), /sign in/i);
  await assert.rejects(
    rpc(null, 'preferences_save', { duplicateSuggestionSeen: true }),
    /sign in/i,
  );
  await serial;
  await pg.exec('SET ROLE authenticated');
  await assert.rejects(
    pg.query(
      "SELECT private.local_first_before_duplicate_suggestion('preferences','{}')",
    ),
    /permission denied/,
  );
  console.log(
    'PASS account duplicate preference: SQL migration/RPC, delayed hydration, offline dismissal/reload/retry, cross-device suppression, monotonic updates, chosen-parent completion and namespace isolation.',
  );
} finally {
  await serial;
  await pg.close();
}
