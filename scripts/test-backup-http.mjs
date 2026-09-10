// HTTP and browser fixtures live only in the explicitly selected disposable QA database.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  sqliteStore,
  fixture,
  archive,
  decoded,
} from './backup-test-support.mjs';
import { compressedBackup } from '../.test-build/backup-browser.mjs';
import { backupChunks, fileStream } from '../.test-build/backup-format.mjs';
const origin = 'http://localhost:3000',
  prefix = 'QA Backup ';
const sign = await fetch(origin + '/signin-with-chatgpt?return_to=%2F', {
  redirect: 'manual',
});
const cookie = sign.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const headers = {
  'Content-Type': 'application/json',
  Origin: origin,
  Cookie: cookie,
};
async function api(action, payload = {}) {
  const response = await fetch(origin + '/api/vault', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload }),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error);
  return value;
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
    'The server must use the disposable QA database.',
  );
assert.ok(
  db
    .prepare("SELECT name FROM sqlite_master WHERE name='backup_restores'")
    .get(),
);
async function upload(blob, id = crypto.randomUUID(), options = {}) {
  const response = await fetch(origin + '/api/backup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      Origin: origin,
      Cookie: cookie,
      'X-Pokelib-Backup-Operation': id,
      'X-Pokelib-Backup-Encoding': 'gzip',
      ...options,
    },
    body: blob,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { status: response.status, data };
}
if (process.argv[2] === 'cleanup') {
  const families = await api('select', {
    query: 'team:"QA Backup"',
    include_archived: true,
    group_families: true,
  });
  const op = crypto.randomUUID();
  for (let i = 0; i < families.ids.length; i += 5) {
    for (const id of families.ids.slice(i, i + 5))
      assert.ok(
        db
          .prepare('SELECT title FROM teams WHERE coalesce(family_id,id)=?')
          .get(id)
          ?.title.startsWith(prefix),
      );
    await api('family_bulk_delete', {
      ids: families.ids.slice(i, i + 5),
      chunk: { operation_id: op, chunk_index: i / 5 },
    });
  }
  let page = 0;
  const collections = [];
  for (;;) {
    const r = await api('collection_list', { page: page++ });
    collections.push(...r.collections.filter((c) => c.name.startsWith(prefix)));
    if (page * 30 >= r.total) break;
  }
  for (const c of collections)
    await api('collection_delete', {
      id: c.id,
      expected_updated_at: c.updated_at,
    });
  console.log(
    `Cleaned ${families.ids.length} isolated QA backup families and ${collections.length} collections.`,
  );
} else {
  const source = await sqliteStore();
  try {
    await fixture(source.store);
    source.db
      .prepare('INSERT INTO tags VALUES(?,?,?,?)')
      .run(
        crypto.randomUUID(),
        source.owner,
        'Unused Reusable',
        'unused reusable',
      );
    const records = await decoded(await archive(source.store));
    for (const r of records) {
      if (r.type === 'family') r.title = prefix + r.title;
      if (r.type === 'variant') {
        r.meta.title = prefix + r.meta.title;
        r.meta.tags = r.meta.tags.map((t) => prefix + t);
      }
      if (r.type === 'tag' || r.type === 'collection') r.name = prefix + r.name;
      if (
        r.type === 'collection' &&
        r.definition.query.includes('Tournament Grade')
      )
        r.definition.query = 'tag:"QA Backup Tournament Grade"';
    }
    const encode = (rs) =>
      compressedBackup(
        (async function* () {
          for (const r of rs) yield JSON.stringify(r) + '\n';
        })(),
      );
    const blob = await encode(records);
    await fs.mkdir('.artifacts/backup', { recursive: true });
    await fs.writeFile(
      '.artifacts/backup/browser-fixture.jsonl.gz',
      Buffer.from(await blob.arrayBuffer()),
    );
    // The delayed loopback proxy can pause this three-chunk fixture after commit.
    const longVariant = structuredClone(
      records.find((r) => r.type === 'variant'),
    );
    Object.assign(longVariant, {
      id: 1,
      family: 1,
      current_revision: 85,
      revisions: 85,
    });
    longVariant.meta.title = prefix + 'Long history';
    const longFamily = structuredClone(
      records.find((r) => r.type === 'family'),
    );
    Object.assign(longFamily, {
      id: 1,
      title: longVariant.meta.title,
      variants: 1,
    });
    const longCounts = {
      families: 1,
      variants: 1,
      revisions: 85,
      tags: records[0].counts.tags,
      collections: 0,
    };
    const longRecords = [
      { ...records[0], counts: longCounts },
      ...records.filter((r) => r.type === 'tag'),
      longFamily,
      longVariant,
      ...Array.from({ length: 84 }, (_, i) => ({
        type: 'revision',
        variant: 1,
        snapshot: {
          ...longVariant.snapshot,
          version_number: i + 2,
          parent_revision: i + 1,
        },
      })),
      { type: 'end', counts: longCounts },
    ];
    await fs.writeFile(
      '.artifacts/backup/browser-long.jsonl.gz',
      Buffer.from(await (await encode(longRecords)).arrayBuffer()),
    );
    const counts = await api('backup_info'),
      receipts = db.prepare('SELECT count(*) n FROM backup_restores').get().n;
    assert.equal(
      (await upload(blob.slice(0, blob.size - 4))).status,
      400,
      'Truncated gzip must fail before any mutation.',
    );
    for (const mutation of [
      (r) => {
        r[0].schema_version = 999;
      },
      (r) => {
        r.at(-2).owner_id = 'forged';
      },
      (r) => {
        r.pop();
      },
    ]) {
      const bad = structuredClone(records);
      mutation(bad);
      const result = await upload(await encode(bad));
      assert.equal(result.status, 400);
      assert.ok(result.data.error);
    }
    assert.deepEqual(
      await api('backup_info'),
      counts,
      'Malformed whole files must not mutate any library rows.',
    );
    assert.equal(
      db.prepare('SELECT count(*) n FROM backup_restores').get().n,
      receipts,
      'Malformed whole files must not create receipts.',
    );
    assert.ok(
      [400, 403].includes(
        (
          await upload(blob, crypto.randomUUID(), {
            Origin: 'https://untrusted.invalid',
          })
        ).status,
      ),
    );
    assert.equal(
      (await upload(blob, crypto.randomUUID(), { Cookie: '' })).status,
      401,
    );
    const id = crypto.randomUUID(),
      start = await upload(blob, id);
    assert.equal(start.status, 200);
    assert.deepEqual(
      (await api('backup_info')).counts,
      counts.counts,
      'Validation creates no library records.',
    );
    let index = 0,
      state;
    for await (const text of backupChunks(fileStream(blob, true))) {
      state = await api('backup_restore', { id, index, text });
      assert.deepEqual(
        (await api('backup_restore', { id, index, text })).counts,
        state.counts,
      );
      index++;
    }
    assert.ok(state.complete);
    assert.deepEqual(state.counts, records[0].counts);
    assert.equal(
      (
        await api('families', {
          query: 'team:"QA Backup" Mega Gengar + Zygarde',
          include_archived: true,
        })
      ).total,
      2,
    );
    const restored = await api('families', {
      query: 'team:"QA Backup"',
      include_archived: true,
    });
    for (const t of restored.teams)
      assert.ok(
        db.prepare('SELECT id FROM teams WHERE id=?').get(t.id),
        'Restored fixture must be in the disposable database.',
      );
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    console.log(
      'HTTP backup full validation, no-mutation rejection, origin/auth, additive restore, replay, core search and private fixtures passed. Browser fixture saved.',
    );
  } finally {
    source.close();
  }
}
db.close();
