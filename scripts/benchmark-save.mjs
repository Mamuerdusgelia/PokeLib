import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { DemoStore } from '../.test-build/demo-store.mjs';
import { demoDrafts } from '../.test-build/demo.mjs';
await fs.mkdir('.artifacts/library-scale', { recursive: true });
const db = new DatabaseSync(':memory:');
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

const results = [];
for (const count of [1, 6]) {
  const base = demoDrafts[0];
  const text =
    count === 1 ? base.showdown_text.split(/\n\s*\n/)[0] : base.showdown_text;
  const imported = await store.import([
    { ...base, showdown_text: text, title: 'Save ' + count },
  ]);
  let t = await store.get(imported.ids[0]);
  for (const action of ['save', 'version']) {
    const samples = [];
    const statements = [];
    for (let i = 0; i < 10; i++) {
      const d = { ...t, ...t.version, team_notes: 'Timing sample ' + i };
      sqlCount = 0;
      const start = performance.now();
      t = await store[action](
        t.id,
        d,
        t.current_version_id,
        t.current_version_id,
        t.version.edit_revision || t.version.id,
        t.updated_at,
      );
      samples.push(performance.now() - start);
      statements.push(sqlCount);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    results.push({
      sets: count,
      action,
      median: +((sorted[4] + sorted[5]) / 2).toFixed(2),
      max: +sorted[9].toFixed(2),
      samples: samples.map((x) => +x.toFixed(2)),
      sqlPerCall: statements.reduce((a, b) => a + b) / statements.length,
    });
  }
}
await fs.writeFile(
  process.argv[2] || '.artifacts/library-scale/save-current.json',
  JSON.stringify(
    {
      environment:
        'Isolated Node SQLite storage adapter; excludes browser/network',
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
db.close();
