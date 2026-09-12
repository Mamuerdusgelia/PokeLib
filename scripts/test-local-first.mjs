import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { MemoryDatabase } from '../.test-build/local-db.mjs';
import { LocalLibrary, UNDO_MS } from '../.test-build/local-library.mjs';
import { LocalBackup } from '../.test-build/local-backup.mjs';
import { cloudPayload } from '../.test-build/cloud-server.mjs';
import { emptyDraft, snapshotRevision } from '../.test-build/domain.mjs';
import { exportBackup } from '../.test-build/backup.mjs';
import { validateBackup, backupChunks } from '../.test-build/backup-format.mjs';
import { backupText, parseBatch } from '../.test-build/showdown.mjs';
import {
  cleanCollection,
  collectionParams,
} from '../.test-build/collections.mjs';
const pg = new PGlite();
await pg.exec(
  "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;",
);
for (const name of (await fs.readdir('supabase/migrations'))
  .filter((n) => n.endsWith('.sql'))
  .sort())
  await pg.exec(await fs.readFile('supabase/migrations/' + name, 'utf8'));
const a = { id: crypto.randomUUID(), name: 'Alice' },
  b = { id: crypto.randomUUID(), name: 'Alice' };
for (const user of [a, b])
  await pg.query('INSERT INTO auth.users VALUES($1,$2,$3)', [
    user.id,
    user.id + '@accounts.pokelib.invalid',
    { display_name: user.name },
  ]);
let chain = Promise.resolve();
function as(role, id, fn) {
  const run = chain.then(async () => {
    await pg.exec('SET ROLE ' + role);
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      id || '',
    ]);
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}
const rpc = (user, action, payload = {}) =>
  as(
    user ? 'authenticated' : 'anon',
    user?.id,
    async () =>
      (
        await pg.query('SELECT public.local_first($1,$2) data', [
          action,
          payload,
        ])
      ).rows[0].data,
  );
const resolve = (token, version = null) =>
  as(
    'anon',
    null,
    async () =>
      (
        await pg.query('SELECT public.lf_resolve_share($1,$2) data', [
          token,
          version,
        ])
      ).rows[0].data,
  );
function connection(account) {
  const state = { offline: false, calls: [], payloads: [] };
  const call = async (action, payload = {}) => {
    state.calls.push(action);
    state.payloads.push(structuredClone(payload));
    if (state.offline) throw Error('Network offline');
    if (action.startsWith('collection_'))
      return as(
        account ? 'authenticated' : 'anon',
        account?.id,
        async () =>
          (
            await pg.query('SELECT public.lf_collection($1,$2) data', [
              action,
              {
                ...payload,
                ...(payload.collection
                  ? { collection: cleanCollection(payload.collection) }
                  : {}),
              },
            ])
          ).rows[0].data,
      );
    return rpc(
      account,
      action,
      action === 'put'
        ? { ...payload, ...cloudPayload(payload.team) }
        : payload,
    );
  };
  return { state, call };
}
const browser = new MemoryDatabase(),
  network = connection(a),
  anonNetwork = connection(null);
const anon = new LocalLibrary(browser, null, anonNetwork.call);
const first = new LocalLibrary(browser, a, network.call);
const secondNetwork = connection(a),
  second = new LocalLibrary(new MemoryDatabase(), a, secondNetwork.call);
const draft = (title = 'Local test') => ({
  ...emptyDraft(true),
  title,
  showdown_text:
    'Kyogre @ Choice Scarf\nAbility: Drizzle\n- Water Spout\n\nTornadus @ Focus Sash\nAbility: Prankster\n- Tailwind',
  tags: ['Rain'],
  source_name: 'Unknown',
  team_notes: 'Trick Room preparation',
  set_notes: ['Lead', 'Speed control'],
});
const create = async (l, d = draft()) =>
  (await l.perform('import', { drafts: [d] })).ids[0];
async function edit(l, id, patch, action = 'save') {
  const t = await l.perform('get', { id });
  return l.perform(action, {
    id,
    draft: { ...t, ...t.version, ...patch },
    expected: t.current_version_id,
    parent: t.version.id,
    expected_revision: snapshotRevision(t.version),
    expected_updated_at: t.updated_at,
  });
}
let count = 0;
async function check(name, test) {
  await test();
  console.log('PASS local-first ' + ++count + ': ' + name);
}
let anonymousId, id, snapshot, live;
await check(
  'anonymous creation and reload persist complete payload without network',
  async () => {
    anonymousId = await create(anon);
    const reopened = new LocalLibrary(browser, null, anonNetwork.call);
    assert.equal(
      (await reopened.full(anonymousId)).version.team_notes,
      'Trick Room preparation',
    );
    assert.equal((await reopened.full(anonymousId)).storage, 'local');
    assert.equal(anonNetwork.state.calls.length, 0);
  },
);
await check(
  'notes, tags, sources and same-set/member searches remain correct',
  async () => {
    for (const q of [
      'Kyogre Water Spout',
      'Kyogre + Tornadus Tailwind',
      'tag:Rain source:Unknown',
      'note:preparation',
      'storage:local',
    ])
      assert.equal((await anon.list({ query: q })).total, 1, q);
    assert.equal((await anon.list({ query: 'Kyogre Tailwind' })).total, 0);
    assert.equal((await anon.list({ query: 'storage:cloud' })).total, 0);
    await edit(anon, anonymousId, { team_notes: 'Changed locally' });
    assert.equal(
      (await anon.full(anonymousId)).version.team_notes,
      'Changed locally',
    );
  },
);
await check(
  'duplicate display names have unique immutable login identities',
  async () => {
    const pa = await rpc(a, 'profile'),
      pb = await rpc(b, 'profile');
    assert.equal(pa.name, pb.name);
    assert.notEqual(pa.login_code, pb.login_code);
    await assert.rejects(
      () =>
        as('authenticated', a.id, () =>
          pg.query(
            "UPDATE public.lf_accounts SET display_name='Mallory' WHERE id=$1",
            [a.id],
          ),
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        as('anon', null, () =>
          pg.query('SELECT public.lf_login_email($1)', [pa.login_code]),
        ),
      /permission denied/,
    );
  },
);
await check(
  'registration namespaces do not claim anonymous teams or authorship',
  async () => {
    assert.equal((await first.list()).total, 0);
    id = await create(first);
    assert.equal((await first.full(id)).source_name, 'Unknown');
    assert.equal((await anon.list()).total, 1);
    assert.equal((await first.full(id)).storage, 'local');
  },
);
await check(
  'anonymous Snapshot projection is immutable and excludes identity/private source',
  async () => {
    snapshot = (await anon.perform('snapshot', { id: anonymousId })).token;
    const upload = anonNetwork.state.payloads.at(-1).team;
    assert.notEqual(upload.id, anonymousId);
    assert.equal(upload.history, undefined);
    assert.equal(upload.version.original_text, '');
    const before = await resolve(snapshot);
    assert.equal(before.share_mode, 'snapshot');
    assert.equal(before.owner_id, undefined);
    assert.equal(before.version.original_text, '');
    assert.equal(before.version.set_editing, undefined);
    await edit(anon, anonymousId, { title: 'Edited after sharing' });
    assert.deepEqual(await resolve(snapshot), before);
    await anon.perform('delete', { id: anonymousId });
    assert.deepEqual(await resolve(snapshot), before);
  },
);
await check(
  'short undo restores deleted Local work and expires after 10 minutes',
  async () => {
    assert.equal((await anon.list()).total, 0);
    await anon.perform('undo', { id: anonymousId });
    assert.equal((await anon.list()).total, 1);
    await anon.perform('delete', { id: anonymousId });
    const r = await browser.get(anon.namespace, anonymousId);
    r.deletedAt = Date.now() - UNDO_MS - 1;
    await browser.commit(anon.namespace, [r]);
    await assert.rejects(
      () => anon.perform('undo', { id: anonymousId }),
      /window/,
    );
    await anon.perform('sync');
    assert.equal(await browser.get(anon.namespace, anonymousId), undefined);
    assert.ok(await resolve(snapshot));
  },
);
await check(
  'Cloud upload requires account/privacy acknowledgement and leaves unrelated Local teams alone',
  async () => {
    await assert.rejects(
      () => first.perform('cloud_enable', { ids: [id] }),
      /privacy/,
    );
    await first.perform('preferences_save', {
      autoCloud: false,
      acknowledged: true,
    });
    await first.perform('cloud_enable', { ids: [id] });
    assert.equal((await first.status([id])).synced, 1);
    assert.equal((await first.full(id)).storage, 'cloud');
  },
);
await check(
  'second device receives search index without complete payload; opening caches the payload',
  async () => {
    await second.sync();
    const r = await second.db.get(second.namespace, id);
    assert.equal(r.payload, undefined);
    assert.equal(
      (await second.list({ query: 'Kyogre Water Spout storage:cloud' })).total,
      1,
    );
    assert.ok((await second.full(id)).version.showdown_text);
    secondNetwork.state.offline = true;
    assert.ok((await second.full(id)).version.showdown_text);
    secondNetwork.state.offline = false;
  },
);
await check(
  'Live sharing requires account/Cloud ownership and URL remains stable',
  async () => {
    const local = await create(first, draft('Still Local'));
    await assert.rejects(
      () => first.perform('share', { id: local }),
      /requires/,
    );
    live = (await first.perform('share', { id })).token;
    assert.equal((await first.perform('share', { id })).token, live);
    assert.equal((await resolve(live)).title, 'Local test');
    await assert.rejects(() => rpc(b, 'share', { id }), /not found/);
    await assert.rejects(() => rpc(null, 'put', { id }), /sign in/);
  },
);
await check(
  'auto-sync follows edits; historical access is opt-in and read-only',
  async () => {
    await edit(first, id, { team_notes: 'Cloud version two' }, 'version');
    await first.sync();
    assert.equal((await resolve(live)).version.team_notes, 'Cloud version two');
    assert.equal(await resolve(live, 1), null);
    await first.perform('live_settings', { id, show_history: true });
    assert.equal(
      (await resolve(live, 1)).version.team_notes,
      'Trick Room preparation',
    );
    await first.perform('live_settings', { id, show_history: false });
    assert.equal(await resolve(live, 1), null);
  },
);
await check(
  'offline edits persist; real cross-device conflict never overwrites server state',
  async () => {
    await second.sync();
    await second.full(id);
    secondNetwork.state.offline = true;
    await edit(second, id, { team_notes: 'Offline work' });
    await second.sync();
    assert.equal((await second.status()).pending, 1);
    await edit(first, id, { team_notes: 'Other device work' });
    await first.sync();
    secondNetwork.state.offline = false;
    await second.sync();
    assert.equal((await second.status()).conflicts.length, 1);
    assert.equal((await resolve(live)).version.team_notes, 'Other device work');
    assert.equal((await second.full(id)).version.team_notes, 'Offline work');
    await second.perform('conflict_keep_local', { id });
    assert.equal((await second.list({ query: 'storage:local' })).total, 1);
    assert.equal(
      (await second.full(id)).version.team_notes,
      'Other device work',
    );
  },
);
await check(
  'disabling Cloud keeps full current local state, removes remote and revokes Live only',
  async () => {
    const snap = (await first.perform('snapshot', { id })).token;
    await first.perform('cloud_disable', { id });
    assert.equal((await first.full(id)).storage, 'local');
    await assert.rejects(() => rpc(a, 'get', { id }), /not found/);
    assert.equal(await resolve(live), null);
    assert.ok(await resolve(snap));
    await second.sync();
    assert.equal(await second.db.get(second.namespace, id), undefined);
  },
);
await check(
  'preference applies only to new teams; bulk and entire-library upload support storage filters',
  async () => {
    await first.perform('preferences_save', {
      autoCloud: true,
      acknowledged: true,
    });
    assert.equal((await first.full(id)).storage, 'local');
    const next = await create(first, draft('Auto cloud'));
    await first.sync();
    assert.equal((await first.full(next)).storage, 'cloud');
    const variant = await first.perform('variant_create', {
      id: next,
      name: 'Automatic variant',
      description: '',
      operation_id: crypto.randomUUID(),
    });
    await first.sync();
    assert.equal((await first.full(variant.id)).storage, 'cloud');
    await first.perform('preferences_save', {
      autoCloud: false,
      acknowledged: true,
    });
    const ids = (await first.perform('select', { query: 'storage:local' })).ids;
    await first.perform('cloud_enable', { ids });
    assert.equal((await first.list({ query: 'storage:local' })).total, 0);
  },
);
await check(
  'logout purges Cloud caches and preserves account-only Local work; namespaces never mix',
  async () => {
    const local = await create(first, draft('Account local'));
    network.state.offline = true;
    await edit(first, id, { team_notes: 'Pending logout work' });
    await first.sync();
    await first.clearCloudCache();
    assert.equal((await first.list({ query: 'storage:cloud' })).total, 0);
    assert.ok(await first.full(local));
    assert.equal((await anon.list()).total, 0);
    const other = new LocalLibrary(browser, b, connection(b).call);
    assert.equal((await other.list()).total, 0);
    const returning = new LocalLibrary(browser, a, network.call);
    assert.ok(await returning.full(local));
    assert.equal((await returning.list({ query: 'conflict' })).total, 0);
    assert.ok(
      (await returning.list()).teams.some((t) =>
        t.title.includes('unsynced Local copy'),
      ),
    );
    network.state.offline = false;
  },
);
await check(
  'Cloud deletion propagates and undo restores the record without resurrecting Live',
  async () => {
    await first.sync();
    await first.full(id);
    const link = (await first.perform('share', { id })).token;
    await first.perform('delete', { id });
    await first.sync();
    await second.sync();
    assert.equal(
      (await second.list({ query: 'team:"Local test" storage:cloud' })).total,
      0,
    );
    assert.equal(await resolve(link), null);
    await first.perform('undo', { id });
    await first.sync();
    assert.ok(await rpc(a, 'get', { id }));
    assert.equal(await resolve(link), null);
  },
);
await check(
  'variant, family selection, metadata/tag bulk operations and collections remain local-capable',
  async () => {
    const local = await create(anon);
    const t = await anon.full(local);
    const v = await anon.perform('variant_create', {
      id: local,
      name: 'Alternative',
      description: 'Test',
      operation_id: crypto.randomUUID(),
      version_id: t.version.id,
    });
    const renamed = await anon.perform('family_rename', {
      id: v.id,
      title: 'Renamed family',
      expected_updated_at: v.updated_at,
    });
    assert.equal(renamed.id, v.id);
    assert.equal((await anon.full(local)).title, 'Renamed family');
    assert.equal((await anon.perform('families')).total, 1);
    assert.equal(
      (await anon.perform('family_expand', { ids: [local] })).ids.length,
      2,
    );
    await anon.perform('bulk', {
      ids: [local, v.id],
      patch: {
        source_type: 'Self-built',
        source_name: 'Alice',
        tags: ['Competition'],
      },
    });
    assert.equal(
      (await anon.list({ query: 'tag:Rain tag:Competition source:Alice' }))
        .total,
      2,
    );
    await anon.perform('collection_save', {
      id: crypto.randomUUID(),
      name: 'Rain',
      description: '',
      definition: {
        query: 'Kyogre',
        filters: [],
        sort: 'modified_desc',
        favourite: false,
      },
    });
    assert.equal((await anon.perform('collection_list')).total, 1);
  },
);
await check(
  'native backup round-trip merges with fresh IDs, notes, dates, history, tags and collections',
  async () => {
    const ids = (await anon.perform('select', {})).ids;
    await edit(anon, ids[0], { team_notes: 'History retained' }, 'version');
    const backup = new LocalBackup(anon),
      lines = [];
    for await (const line of exportBackup({
      backup: (a, p) => backup.run(a, p),
    }))
      lines.push(line);
    const blob = new Blob(lines),
      manifest = await validateBackup(blob.stream()),
      op = crypto.randomUUID();
    await backup.run('backup_begin', { id: op, manifest });
    let index = 0;
    for await (const chunk of backupChunks(blob.stream()))
      await backup.run('backup_restore', {
        id: op,
        index: index++,
        text: chunk,
      });
    assert.equal((await anon.list()).total, ids.length * 2);
    const text = backupText(await Promise.all(ids.map((id) => anon.full(id))));
    assert.equal(parseBatch(text).length, ids.length);
    const copies = (await anon.list()).teams.filter((t) => !ids.includes(t.id));
    assert.ok(copies.every((t) => t.storage === 'local'));
    assert.equal((await anon.perform('collection_list')).total, 2);
  },
);
let collectionLink;
await check(
  'first Cloud upload excludes local history; later Cloud historical comments stay searchable',
  async () => {
    const fresh = await create(first, draft('History scope'));
    await edit(
      first,
      fresh,
      { version_comment: 'DistinctHistoryNeedle' },
      'version',
    );
    await first.perform('cloud_enable', { ids: [fresh] });
    assert.equal(
      (await rpc(a, 'get', { id: fresh })).payload.history.length,
      1,
    );
    const sent = network.state.payloads.find((p) => p.team?.id === fresh);
    assert.equal(sent.team.history, undefined);
    await edit(first, fresh, { version_comment: 'Current note' }, 'version');
    await first.sync();
    await second.sync();
    assert.equal(
      (await second.list({ query: 'DistinctHistoryNeedle storage:cloud' }))
        .total,
      1,
    );
  },
);
await check(
  'single, selected and filtered native exports contain only the chosen variants',
  async () => {
    const all = (await anon.perform('select')).ids;
    const filtered = (
      await anon.perform('select', { query: 'tag:Competition storage:local' })
    ).ids;
    for (const ids of [[all[0]], all.slice(0, 2), filtered]) {
      const adapter = new LocalBackup(anon),
        lines = [];
      for await (const line of exportBackup({
        backup: (action, p) => adapter.run(action, { ...p, ids }),
      }))
        lines.push(line);
      const blob = new Blob(lines);
      await validateBackup(blob.stream());
      const records = (await blob.text())
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.equal(
        records.filter((r) => r.type === 'variant').length,
        ids.length,
      );
      assert.equal(records.filter((r) => r.type === 'collection').length, 0);
      assert.equal(
        parseBatch(
          backupText(await Promise.all(ids.map((id) => anon.full(id)))),
        ).length,
        ids.length,
      );
    }
  },
);
await check(
  'unopened Cloud backup retains available history after omitting older Local versions',
  async () => {
    const fresh = await create(first, draft('Cloud history root'));
    await edit(first, fresh, { team_notes: 'Local-only earlier state' }, 'version');
    await edit(first, fresh, { team_notes: 'First uploaded state' }, 'version');
    await first.perform('cloud_enable', { ids: [fresh] });
    let remote = (await rpc(a, 'get', { id: fresh })).payload;
    assert.equal(remote.history.length, 1);
    assert.equal(remote.version.parent_version_id, null);
    await edit(first, fresh, { team_notes: 'Second uploaded state' }, 'version');
    await first.sync();
    remote = (await rpc(a, 'get', { id: fresh })).payload;
    assert.equal(remote.history.length, 2);
    const transport = connection(a);
    const uncached = new LocalLibrary(new MemoryDatabase(), a, transport.call);
    await uncached.sync();
    assert.equal((await uncached.db.get(uncached.namespace, fresh)).payload, undefined);
    const backup = new LocalBackup(uncached), lines = [];
    for await (const line of exportBackup({ backup: (action, p) => backup.run(action, { ...p, ids: [fresh] }) })) lines.push(line);
    const blob = new Blob(lines);
    await validateBackup(blob.stream());
    const records = (await blob.text()).trim().split('\n').map(JSON.parse);
    const versions = records.filter((r) => r.snapshot).map((r) => r.snapshot);
    assert.deepEqual(versions.map((v) => v.version_number), [1, 2]);
    assert.deepEqual(versions.map((v) => v.parent_revision), [null, 1]);
    assert.deepEqual(versions.map((v) => v.team_notes), ['First uploaded state', 'Second uploaded state']);
    assert.ok(transport.state.calls.includes('get'));
    const unavailable = new LocalLibrary(new MemoryDatabase(), a, transport.call);
    await unavailable.sync();
    transport.state.offline = true;
    await assert.rejects(() => new LocalBackup(unavailable).run('backup_info', { ids: [fresh] }), /Offline|offline/);
  },
);
const resolveCollection = (token, selection = {}) =>
  as(
    'anon',
    null,
    async () =>
      (
        await pg.query('SELECT public.lf_resolve_collection($1,$2) data', [
          token,
          selection,
        ])
      ).rows[0].data,
  );
await check(
  'saved search plans filter Local collections and Cloud collection shares exclude Local teams',
  async () => {
    const collection = cleanCollection({
      id: crypto.randomUUID(),
      name: 'Public rain',
      description: 'Cloud only',
      definition: {
        query: 'Kyogre Water Spout storage:cloud',
        filters: [],
        sort: 'title_asc',
      },
    });
    assert.equal(
      (await anon.list(collectionParams(collection.definition))).total,
      0,
    );
    await first.perform('collection_save', collection);
    collectionLink = (
      await first.perform('collection_share', { id: collection.id })
    ).token;
    const shared = await resolveCollection(collectionLink);
    assert.ok(shared.total > 0);
    for (const t of shared.teams) {
      assert.equal(t.owner_id, undefined);
      assert.equal(t.version.original_text, '');
      assert.equal((await first.full(t.id)).storage, 'cloud');
    }
    const bad = cleanCollection({
      ...collection,
      id: crypto.randomUUID(),
      name: 'No match',
      definition: { ...collection.definition, query: 'Kyogre Tailwind' },
    });
    await first.perform('collection_save', bad);
    const token = (await first.perform('collection_share', { id: bad.id }))
      .token;
    assert.equal((await resolveCollection(token)).total, 0);
    await assert.rejects(
      () => connection(b).call('collection_revoke', { id: collection.id }),
      /not found/,
    );
    await first.perform('collection_revoke', { id: bad.id });
    assert.equal(await resolveCollection(token), null);
  },
);
await check(
  'account deletion freezes final Live state before Cloud/auth cascades',
  async () => {
    const link = (await first.perform('share', { id })).token,
      before = await resolve(link);
    await assert.rejects(
      () =>
        as('authenticated', a.id, () =>
          pg.query('SELECT public.lf_delete_account($1)', [a.id]),
        ),
      /permission denied/,
    );
    await as('service_role', null, () =>
      pg.query('SELECT public.lf_delete_account($1)', [a.id]),
    );
    const after = await resolve(link);
    assert.equal(after.share_mode, 'snapshot');
    assert.equal(after.version.showdown_text, before.version.showdown_text);
    assert.equal((await resolveCollection(collectionLink)).mode, 'snapshot');
    assert.ok(await resolve(snapshot));
    await assert.rejects(() => rpc(a, 'get', { id }), /not found/);
  },
);
await chain;
await pg.close();
console.log(`${count} local-first integration groups passed.`);
