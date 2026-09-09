import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { DemoStore } from '../.test-build/demo-store.mjs';
import { demoDrafts } from '../.test-build/demo.mjs';
import { makeSnapshot } from '../.test-build/snapshot.mjs';
import { cleanMeta } from '../.test-build/domain.mjs';
import { indexTerms, planQuery } from '../.test-build/search.mjs';
const db = new DatabaseSync(':memory:');
await fs.mkdir('.artifacts/library-scale', { recursive: true });
for (const n of (await fs.readdir('drizzle'))
  .filter((n) => n.endsWith('.sql'))
  .sort())
  db.exec(await fs.readFile('drizzle/' + n, 'utf8'));
let sqlCount = 0;
class Statement {
  constructor(sql) {
    this.sql = sql;
    this.args = [];
  }
  bind(...a) {
    this.args = a;
    return this;
  }
  async first() {
    sqlCount++;
    return db.prepare(this.sql).get(...this.args) || null;
  }
  async all() {
    sqlCount++;
    return { results: db.prepare(this.sql).all(...this.args) };
  }
  async run() {
    sqlCount++;
    return {
      meta: { changes: Number(db.prepare(this.sql).run(...this.args).changes) },
    };
  }
}
const d1 = {
  prepare: (sql) => new Statement(sql),
  batch: async (ss) => {
    db.exec('BEGIN');
    try {
      const result = [];
      for (const s of ss) result.push(await s.run());
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },
};
const store = new DemoStore(d1, 'scale-owner');
const teamInsert = db.prepare(
  'INSERT INTO teams(id,owner_id,title,format,team_date,source_name,metadata,current_version_id,created_at,updated_at,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
);
const versionInsert = db.prepare(
  'INSERT INTO team_versions(id,team_id,version_number,snapshot,created_at) VALUES(?,?,?,?,?)',
);
const termInsert = db.prepare(
  'INSERT OR IGNORE INTO search_terms(team_id,version_id,slot,field,value) VALUES(?,?,?,?,?)',
);
const tagInsert = db.prepare(
  'INSERT OR IGNORE INTO tags(id,owner_id,display_name,normalized_name) VALUES(?,?,?,?)',
);
const joinTag = db.prepare(
  'INSERT OR IGNORE INTO team_tags(team_id,tag_id) SELECT ?,id FROM tags WHERE owner_id=? AND normalized_name=?',
);
const templates = demoDrafts.map((d) => ({
  d,
  m: cleanMeta(d),
  v: makeSnapshot(d, 'template', 1, null),
}));
let seeded = 0;
const results = [];
async function measure(name, fn) {
  const samples = [];
  let value;
  sqlCount = 0;
  for (let j = 0; j < 5; j++) {
    const t = performance.now();
    value = await fn();
    samples.push(performance.now() - t);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    name,
    median: +sorted[2].toFixed(2),
    max: +sorted[4].toFixed(2),
    samples: samples.map((x) => +x.toFixed(2)),
    sqlPerCall: sqlCount / 5,
    bytes: Buffer.byteLength(JSON.stringify(value)),
    returned: value?.teams?.length,
    total: value?.total,
  };
}
for (const n of [1000, 5000, 10000]) {
  const before = performance.now();
  db.exec('BEGIN');
  for (let i = seeded; i < n; i++) {
    const { m, v } = templates[i % templates.length];
    const id = 'team-' + i,
      vid = 'snapshot-' + i;
    const meta = {
      ...m,
      title: m.title + ' ' + i,
      tags: [...m.tags, 'Season ' + (2020 + (i % 7))],
      source_name: ['Alice', 'Bob', 'Tournament archive', 'Strange Name'][
        i % 4
      ],
      team_date: i % 5 ? String(2008 + (i % 19)) : null,
      team_date_precision: i % 5 ? 'year' : 'unknown',
    };
    const snapshot = { ...v, id: vid, edit_revision: vid, team_id: id };
    const time = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    teamInsert.run(
      id,
      'scale-owner',
      meta.title,
      meta.format,
      meta.team_date,
      meta.source_name,
      JSON.stringify(meta),
      vid,
      time,
      time,
      time,
    );
    versionInsert.run(vid, id, 1, JSON.stringify(snapshot), time);
    for (const term of indexTerms(meta, snapshot))
      termInsert.run(id, term.version_id, term.slot, term.field, term.value);
    for (const tag of meta.tags) {
      tagInsert.run(
        'tag-' + tag.toLowerCase(),
        'scale-owner',
        tag,
        tag.toLowerCase(),
      );
      joinTag.run(id, 'scale-owner', tag.toLowerCase());
    }
  }
  db.exec('COMMIT');
  db.exec('PRAGMA optimize');
  seeded = n;
  const run = (q) =>
    store.list({
      include_archived: true,
      plan: planQuery(q),
      page: 0,
      sort: 'modified_desc',
    });
  const measurements = [];
  // Extra sibling fixtures remain outside the n original conceptual families.
  if (process.argv.includes('--variants')) {
    for (let i = 0; i < n; i += 20) {
      const t = await store.get('team-' + i);
      if (t.family_id) continue;
      await store.variant('variant_create', {
        id: t.id,
        name: 'Anti-Stall',
        version_id: t.version.id,
        expected: t.current_version_id,
        expected_revision: t.version.edit_revision || t.version.id,
        expected_updated_at: t.updated_at,
        operation_id: crypto.randomUUID(),
      });
    }
    for (const [name, payload] of [
      ['family initial', { group_families: true }],
      [
        'family last page',
        { group_families: true, page: Math.floor((n - 1) / 30) },
      ],
      [
        'family same-set',
        { group_families: true, plan: planQuery('Darkrai Ice Beam') },
      ],
      ['family select IDs', { group_families: true, ids_only: true }],
      ['expand variants', { family_id: 'team-0' }],
    ])
      measurements.push(
        await measure(name, () =>
          store.list({
            plan: planQuery(''),
            include_archived: true,
            ...payload,
          }),
        ),
      );
    measurements.push(
      await measure('family facets', () =>
        store.facets({ include_archived: true, group_families: true }),
      ),
    );
  }
  for (const [name, fn] of [
    ['initial library', () => run('')],
    [
      'last page',
      () =>
        store.list({
          include_archived: true,
          plan: planQuery(''),
          page: Math.floor((n - 1) / 30),
          sort: 'modified_desc',
        }),
    ],
    ['metadata search', () => run('source:Alice')],
    ['same set search', () => run('Darkrai Ice Beam')],
    ['format filter', () => run('format:gen5ou')],
    ['facets', () => store.facets({ include_archived: true })],
    [
      'title sort',
      () =>
        store.list({
          include_archived: true,
          plan: planQuery(''),
          sort: 'title_asc',
        }),
    ],
    [
      'date sort',
      () =>
        store.list({
          include_archived: true,
          plan: planQuery(''),
          sort: 'date_desc',
        }),
    ],
    [
      'select all IDs',
      () =>
        store.list({
          include_archived: true,
          plan: planQuery(''),
          ids_only: true,
          group_families: process.argv.includes('--variants'),
        }),
    ],
    [
      'select matching IDs',
      () =>
        store.list({
          include_archived: true,
          plan: planQuery('Darkrai Ice Beam'),
          ids_only: true,
          group_families: process.argv.includes('--variants'),
        }),
    ],
    [
      'bulk add tag / 100',
      async () => {
        const operation_id = crypto.randomUUID();
        for (let i = 0; i < 100; i += 5)
          await store.bulk(
            Array.from({ length: 5 }, (_, j) => 'team-' + (i + j)),
            { tags: ['Measured bulk tag'] },
            { operation_id, chunk_index: i / 5 },
          );
        return { count: 100 };
      },
    ],
  ])
    measurements.push(await measure(name, fn));
  // Deletion samples use fresh disposable records; fixture creation is outside the timer.
  const deletionSamples = [];
  for (let sample = 0; sample < 5; sample++) {
    const ids = [];
    for (let i = 0; i < 100; i += 5)
      ids.push(
        ...(
          await store.import(
            Array.from({ length: 5 }, () => ({
              ...demoDrafts[0],
              title: 'Delete timing fixture',
            })),
          )
        ).ids,
      );
    const start = performance.now(),
      operation_id = crypto.randomUUID();
    sqlCount = 0;
    for (let i = 0; i < ids.length; i += 5)
      await store.bulkDelete(ids.slice(i, i + 5), {
        operation_id,
        chunk_index: i / 5,
      });
    deletionSamples.push({ ms: performance.now() - start, sql: sqlCount });
  }
  const deletionTimes = deletionSamples.map((x) => x.ms).sort((a, b) => a - b);
  measurements.push({
    name: 'bulk delete / 100',
    median: +deletionTimes[2].toFixed(2),
    max: +deletionTimes[4].toFixed(2),
    samples: deletionSamples.map((x) => +x.ms.toFixed(2)),
    sqlPerCall: deletionSamples[0].sql,
  });
  results.push({
    teams: n,
    seedMilliseconds: +(performance.now() - before).toFixed(1),
    measurements,
  });
  console.log(JSON.stringify(results.at(-1)));
}
await fs.writeFile(
  process.argv[2] || '.artifacts/library-scale/current.json',
  JSON.stringify(
    {
      environment:
        'Node SQLite adapter; in-memory isolated six-set fixtures, not hosted D1/network',
      results,
    },
    null,
    2,
  ),
);
db.close();
