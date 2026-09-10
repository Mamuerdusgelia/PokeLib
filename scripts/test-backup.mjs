import assert from 'node:assert/strict';
import {
  sqliteStore,
  postgresStore,
  archive,
  decoded,
  restore,
  fixture,
  semantic,
} from './backup-test-support.mjs';
import {
  backupChunks,
  fileStream,
  validateBackup,
  parseLine,
  sha256,
} from '../.test-build/backup-format.mjs';
import { planQuery } from '../.test-build/search.mjs';
import { DemoStore } from '../.test-build/demo-store.mjs';
import { exportBackup } from '../.test-build/backup.mjs';
import { snapshotRevision } from '../.test-build/domain.mjs';
import { compressedBackup } from '../.test-build/backup-browser.mjs';
let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed++;
  console.log('PASS backup ' + name);
};
const source = await sqliteStore(),
  pg = await postgresStore(),
  target = await sqliteStore();
try {
  const ids = await fixture(source.store);
  source.db
    .prepare('INSERT INTO tags VALUES(?,?,?,?)')
    .run(
      crypto.randomUUID(),
      source.owner,
      'Unused Reusable',
      'unused reusable',
    );
  const current = await source.store.get(ids.b),
    rich = structuredClone(current.version);
  rich.edit_revision = crypto.randomUUID();
  rich.parsed_team[0].unknownPreserved = {
    origin: ['odd field', 17],
    enabled: true,
  };
  source.db
    .prepare('UPDATE team_versions SET snapshot=? WHERE id=?')
    .run(JSON.stringify(rich), rich.id);
  const a = await archive(source.store),
    original = await decoded(a);
  await check(
    'versioned archive includes unused tags and omits ownership, capabilities and derived state',
    () => {
      assert.equal(original[0].schema_version, 1);
      assert.deepEqual(original[0].counts, {
        families: 2,
        variants: 3,
        revisions: 6,
        tags: 3,
        collections: 2,
      });
      const text = JSON.stringify(original);
      for (const key of [
        'owner_id',
        'token_hash',
        'search_terms',
        'operation_chunks',
        'edit_revision',
        source.owner,
        ids.a,
      ])
        assert.ok(!text.includes(key));
      assert.ok(text.includes('Unused Reusable'));
    },
  );
  await check(
    'D1 → PostgreSQL semantic round trip preserves all user data',
    async () => {
      const state = await restore(pg.store, a, undefined, true);
      assert.ok(state.complete);
      assert.deepEqual(
        semantic(await decoded(await archive(pg.store))),
        semantic(original),
      );
    },
  );
  const pgArchive = await archive(pg.store);
  await check(
    'PostgreSQL → D1 semantic round trip and exact raw/history preservation',
    async () => {
      await restore(target.store, pgArchive, undefined, true);
      assert.deepEqual(
        semantic(await decoded(await archive(target.store))),
        semantic(original),
      );
      const versions = target.db
        .prepare('SELECT snapshot FROM team_versions')
        .all()
        .map((r) => JSON.parse(r.snapshot));
      assert.equal(versions.length, 6);
      for (const v of versions) {
        assert.equal(v.original_text, ids.raw);
        assert.equal(v.parsed_team.length, 7);
        assert.ok(v.showdown_text.includes('\r\n'));
      }
      assert.ok(
        versions.some(
          (v) => v.parsed_team[0].unknownPreserved?.origin[1] === 17,
        ),
      );
      assert.equal(
        target.db.prepare('SELECT count(*) n FROM share_links').get().n,
        0,
      );
      assert.equal(
        target.db.prepare('SELECT count(*) n FROM collection_shares').get().n,
        0,
      );
      assert.equal(
        (
          await pg.pg.query(
            'SELECT count(*) n FROM public.teams WHERE owner_id<>$1',
            [pg.owner],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        target.db.prepare('PRAGMA foreign_key_check').all().length,
        0,
      );
    },
  );
  for (const { name, store } of [
    { name: 'D1', store: target.store },
    { name: 'PostgreSQL', store: pg.store },
  ]) {
    await check(
      name +
        ' rebuilt free-text/same-set/core/metadata/note searches and live collections',
      async () => {
        for (const [query, count] of [
          ['Strange Name', 2],
          ['Gengar Shadow Ball', 3],
          ['Mega Gengar + Zygarde', 3],
          ['Kyogre + Tornadus + Incineroar', 3],
          ['format:gen7ubers', 1],
          ['tag:"Anti Stall ÉTÉ"', 1],
          ['source:"Strange Name"', 2],
          ['year:2017', 1],
          ['note:"gengar private"', 2],
          ['Opening revision', 1],
        ])
          assert.equal(
            (
              await store.list({
                plan: planQuery(query),
                include_archived: true,
              })
            ).total,
            count,
            query,
          );
        const collections = await store.collection('collection_list');
        assert.equal(collections.total, 2);
        assert.ok(
          collections.collections.every(
            (c) =>
              (!c.has_share && c.definition.plan.clauses?.length === 2) ||
              !c.has_share,
          ),
        );
      },
    );
    await check(
      name +
        ' restored current Save/history immutability/restore-history concurrency remain intact',
      async () => {
        const list = await store.list({
          plan: planQuery('team:"Family A" format:gen7ubers'),
          include_archived: true,
        });
        let t = await store.get(list.teams[0].id);
        const frozen = structuredClone(t.history.at(-1));
        t = await store.save(
          t.id,
          { ...t, ...t.version, team_notes: 'edited after restore' },
          t.current_version_id,
          t.current_version_id,
          snapshotRevision(t.version),
          t.updated_at,
        );
        assert.deepEqual(t.history.at(-1), frozen);
        t = await store.version(
          t.id,
          { ...t, ...frozen },
          t.current_version_id,
          frozen.id,
          snapshotRevision(t.version),
          t.updated_at,
        );
        assert.equal(t.version.version_number, 4);
        assert.equal(t.version.parent_version_id, frozen.id);
      },
    );
  }
  await check(
    'malformed complete files fail before any destination mutation',
    async () => {
      const before = target.db.prepare('SELECT total_changes() n').get().n;
      const cases = [
        (x) => {
          x[0].schema_version = 99;
        },
        (x) => {
          x[0].owner_id = 'attacker';
        },
        (x) => {
          x.find((r) => r.type === 'variant').family = 999;
        },
        (x) => {
          x.find((r) => r.type === 'revision').snapshot.parent_revision = 999;
        },
        (x) => {
          x.find((r) => r.type === 'variant').snapshot.set_notes = [];
        },
        (x) => {
          x.find((r) => r.type === 'tag').id = 2;
        },
        (x) => {
          x.find((r) => r.type === 'variant').meta.source_url =
            'javascript:alert(1)';
        },
        (x) => {
          x.find((r) => r.type === 'variant').meta.source_url =
            'https://user:secret@example.com';
        },
        (x) => {
          x.pop();
        },
        (x) => {
          x[0].counts.revisions--;
        },
        (x) => {
          x.find((r) => r.type === 'variant').snapshot.original_text =
            'x'.repeat(500001);
        },
      ];
      for (const change of cases) {
        const copy = structuredClone(original);
        change(copy);
        const blob = new Blob([
          copy.map((r) => JSON.stringify(r)).join('\n') + '\n',
        ]);
        await assert.rejects(() => validateBackup(blob.stream()));
      }
      assert.throws(
        () => parseLine('{"__proto__":{"polluted":true}}'),
        /Unsafe/,
      );
      assert.throws(
        () => parseLine('['.repeat(17) + '0' + ']'.repeat(17)),
        /nested/,
      );
      assert.equal({}.polluted, undefined);
      assert.equal(
        target.db.prepare('SELECT total_changes() n').get().n,
        before,
      );
    },
  );
  await check(
    'D1 export detects concurrent changes and refuses a completion footer',
    async () => {
      const iterator = exportBackup(source.store);
      await iterator.next();
      await source.store.patch(ids.a, { favourite: false });
      await assert.rejects(async () => {
        for await (const _ of iterator) {
        }
      }, /changed/);
    },
  );
  await check(
    'additive restore preserves old families and renames colliding collection names',
    async () => {
      const before = (await source.store.backup('backup_info')).counts;
      await restore(source.store, a);
      const after = (await source.store.backup('backup_info')).counts;
      assert.equal(after.families, before.families + 2);
      assert.equal(after.revisions, before.revisions + 6);
      assert.ok(
        (await source.store.collection('collection_list')).collections.some(
          (c) => c.name.includes('(restored '),
        ),
      );
      assert.ok(await source.store.get(ids.a));
    },
  );
  await check(
    'receipt replay, tampering, out-of-order and cross-owner rejection',
    async () => {
      const manifest = await validateBackup(fileStream(a, true)),
        id = crypto.randomUUID();
      await target.store.backup('backup_begin', { id, manifest });
      const chunks = [];
      for await (const text of backupChunks(fileStream(a, true)))
        chunks.push(text);
      await assert.rejects(
        () =>
          target.store.backup('backup_restore', {
            id,
            index: 0,
            text: chunks[0] + ' ',
          }),
        /differs/,
      );
      await assert.rejects(
        () =>
          target.store.backup('backup_restore', {
            id,
            index: 1,
            text: chunks[0],
          }),
        /differs|order/,
      );
      const other = new DemoStore(target.d1, crypto.randomUUID());
      await assert.rejects(
        () => other.backup('backup_status', { id }),
        /account/,
      );
      const first = await target.store.backup('backup_restore', {
        id,
        index: 0,
        text: chunks[0],
      });
      const again = await target.store.backup('backup_restore', {
        id,
        index: 0,
        text: chunks[0],
      });
      assert.deepEqual(first.counts, again.counts);
      assert.equal(await sha256(chunks[0]), manifest.hashes[0]);
    },
  );
  const longCounts = {
    families: 1,
    variants: 1,
    revisions: 85,
    tags: 0,
    collections: 0,
  };
  const longVariant = structuredClone(
    original.find((r) => r.type === 'variant'),
  );
  Object.assign(longVariant, {
    id: 1,
    family: 1,
    revisions: 85,
    current_revision: 85,
    name: 'Main',
  });
  longVariant.meta.title = 'Long history';
  longVariant.meta.tags = [];
  const longRecords = [
    { ...original[0], counts: longCounts },
    {
      type: 'family',
      id: 1,
      title: 'Long history',
      variants: 1,
      created_at: longVariant.created_at,
      updated_at: longVariant.updated_at,
    },
    longVariant,
    ...Array.from({ length: 84 }, (_, i) => ({
      type: 'revision',
      variant: 1,
      snapshot: {
        ...longVariant.snapshot,
        version_number: i + 2,
        parent_revision: i + 1,
        team_notes: 'current note ' + (i + 2),
        version_comment: 'history comment ' + (i + 2),
      },
    })),
    { type: 'end', counts: longCounts },
  ];
  const longBlob = await compressedBackup(
    (async function* () {
      for (const r of longRecords) yield JSON.stringify(r) + '\n';
    })(),
  );
  const longManifest = await validateBackup(fileStream(longBlob, true)),
    longChunks = [];
  for await (const text of backupChunks(fileStream(longBlob, true)))
    longChunks.push(text);
  for (const { name, store, raw, sql } of [
    {
      name: 'D1',
      store: target.store,
      raw: target,
      sql: async (text) => target.db.exec(text),
    },
    {
      name: 'PostgreSQL',
      store: pg.store,
      raw: pg,
      sql: async (text) => {
        await pg.pg.exec('RESET ROLE');
        await pg.pg.exec(text);
        await pg.pg.exec('SET ROLE authenticated');
      },
    },
  ]) {
    await check(
      name +
        ' multi-chunk rollback, lost response retry and exact committed counts',
      async () => {
        const id = crypto.randomUUID();
        await store.backup('backup_begin', { id, manifest: longManifest });
        const first = await store.backup('backup_restore', {
          id,
          index: 0,
          text: longChunks[0],
        });
        assert.equal(first.next_chunk, 1);
        assert.equal(first.counts.revisions, 39);
        if (name === 'D1')
          await sql(
            "CREATE TRIGGER backup_test_failure BEFORE INSERT ON team_versions WHEN new.version_number=50 BEGIN SELECT RAISE(ABORT,'Injected restore failure'); END;",
          );
        else
          await sql(
            "CREATE FUNCTION private.backup_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF new.version_number=50 THEN RAISE EXCEPTION 'Injected restore failure'; END IF; RETURN new; END $$; CREATE TRIGGER backup_test_failure BEFORE INSERT ON public.team_versions FOR EACH ROW EXECUTE FUNCTION private.backup_test_failure();",
          );
        await assert.rejects(
          () =>
            store.backup('backup_restore', {
              id,
              index: 1,
              text: longChunks[1],
            }),
          /Injected/,
        );
        const failed = await store.backup('backup_status', { id });
        assert.deepEqual(failed.counts, first.counts);
        assert.equal(failed.next_chunk, 1);
        if (name === 'D1') await sql('DROP TRIGGER backup_test_failure;');
        else
          await sql(
            'DROP TRIGGER backup_test_failure ON public.team_versions; DROP FUNCTION private.backup_test_failure();',
          );
        const committed = await store.backup('backup_restore', {
          id,
          index: 1,
          text: longChunks[1],
        });
        assert.deepEqual(
          (
            await store.backup('backup_restore', {
              id,
              index: 1,
              text: longChunks[1],
            })
          ).counts,
          committed.counts,
        );
        const done = await store.backup('backup_restore', {
          id,
          index: 2,
          text: longChunks[2],
        });
        assert.ok(done.complete);
        assert.deepEqual(done.counts, longCounts);
        if (name === 'D1')
          assert.equal(
            raw.db.prepare('PRAGMA foreign_key_check').all().length,
            0,
          );
      },
    );
    await check(
      name + ' partial restore does not overwrite concurrent current edits',
      async () => {
        const id = crypto.randomUUID();
        await store.backup('backup_begin', { id, manifest: longManifest });
        await store.backup('backup_restore', {
          id,
          index: 0,
          text: longChunks[0],
        });
        const list = await store.list({
          plan: planQuery('team:"Long history" note:"current note 39"'),
          include_archived: true,
        });
        const t = await store.get(
          list.teams.find((t) => t.version.version_number === 39).id,
        );
        const saved = await store.save(
          t.id,
          { ...t, ...t.version, team_notes: 'Concurrent edit survives' },
          t.current_version_id,
          t.current_version_id,
          snapshotRevision(t.version),
          t.updated_at,
        );
        await assert.rejects(
          () =>
            store.backup('backup_restore', {
              id,
              index: 1,
              text: longChunks[1],
            }),
          /edited in another window/,
        );
        assert.equal(
          (await store.get(saved.id)).version.team_notes,
          'Concurrent edit survives',
        );
        assert.equal(
          (await store.backup('backup_status', { id })).counts.revisions,
          39,
        );
      },
    );
  }
  await check(
    'PostgreSQL private restore internals cannot be called or forged across owners',
    async () => {
      await assert.rejects(
        () => pg.pg.query('SELECT state FROM public.backup_restores'),
        /permission denied/,
      );
      await assert.rejects(
        () => pg.pg.query("SELECT private.backup_id('a','b','1')"),
        /permission denied/,
      );
      const before = (await pg.store.backup('backup_info')).counts;
      await assert.rejects(
        () =>
          pg.rpc('backup_restore', {
            id: crypto.randomUUID(),
            index: 0,
            text: longChunks[0],
            owner_id: source.owner,
          }),
        /not found/,
      );
      assert.deepEqual((await pg.store.backup('backup_info')).counts, before);
    },
  );
  console.log(`${passed} backup checks passed.`);
} finally {
  source.close();
  target.close();
  await pg.close();
}
