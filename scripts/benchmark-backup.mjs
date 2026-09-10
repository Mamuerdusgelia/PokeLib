// Isolated synthetic SQLite only; never opens the app's persistent databases.
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { sqliteStore, archive } from './backup-test-support.mjs';
import {
  backupChunks,
  fileStream,
  validateBackup,
} from '../.test-build/backup-format.mjs';
import { emptyDraft } from '../.test-build/domain.mjs';
import { makeSnapshot } from '../.test-build/snapshot.mjs';
const size = Number(process.argv[2] || 1000);
if (![1000, 5000, 10000].includes(size))
  throw Error('Choose 1000, 5000 or 10000 isolated synthetic families.');
const source = await sqliteStore(),
  target = await sqliteStore();
let maxPageBytes = 0,
  maxRequestBytes = 0,
  maxWriteBytes = 0,
  maxStatements = 0,
  indexSqlMs = 0,
  indexStatements = 0,
  peakHeap = process.memoryUsage().heapUsed;
const sample = () => {
  peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
};
const timer = setInterval(sample, 10);
try {
  const raw =
    'Gengar @ Gengarite\r\n- Shadow Ball\r\n\r\nZygarde @ Leftovers\r\n- Thousand Arrows\r\n\r\nKyogre\r\n- Origin Pulse\r\n\r\nTornadus\r\n- Tailwind\r\n\r\nIncineroar\r\n- Fake Out\r\n\r\nDitto\r\n- Transform\r\n';
  const template = makeSnapshot(
    {
      ...emptyDraft(true),
      title: 'Template',
      showdown_text: raw,
      team_notes: 'Synthetic matchup notes',
      set_notes: ['Lead carefully'],
      version_comment: 'Imported build',
    },
    crypto.randomUUID(),
    1,
    null,
  );
  const now = '2026-09-10T00:00:00.000Z';
  const familyInsert = source.db.prepare(
    'INSERT INTO team_families VALUES(?,?,?,?,?)',
  );
  const teamInsert = source.db.prepare(
    'INSERT INTO teams(id,owner_id,family_id,variant_name,variant_key,title,format,team_date,source_name,metadata,current_version_id,favourite,archived,created_at,updated_at,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  const versionInsert = source.db.prepare(
    'INSERT INTO team_versions VALUES(?,?,?,?,?)',
  );
  let variants = 0,
    revisions = 0;
  source.db.exec('BEGIN');
  for (let i = 0; i < size; i++) {
    const fid = crypto.randomUUID(),
      title = 'Synthetic ' + String(i).padStart(5, '0');
    familyInsert.run(fid, source.owner, title, now, now);
    for (let sibling = 0; sibling < (i % 10 === 0 ? 2 : 1); sibling++) {
      const tid = crypto.randomUUID(),
        count = i % 100 === 0 ? 20 : i % 4 === 0 ? 3 : 1;
      const ids = Array.from({ length: count }, () => crypto.randomUUID());
      const {
        showdown_text: _raw,
        team_notes: _note,
        set_notes: _setNotes,
        version_comment: _comment,
        imported: _imported,
        ...meta
      } = {
        ...emptyDraft(true),
        title,
        format: 'gen7ubers',
        source_name: 'Synthetic provenance ' + (i % 11),
        team_date: '2017',
        team_date_precision: 'year',
      };
      teamInsert.run(
        tid,
        source.owner,
        fid,
        sibling ? 'Anti-Stall' : 'Main',
        sibling ? 'anti-stall' : 'main',
        title,
        'gen7ubers',
        '2017',
        meta.source_name,
        JSON.stringify(meta),
        ids.at(-1),
        i % 3 === 0 ? 1 : 0,
        0,
        now,
        now,
        now,
      );
      for (let n = 1; n <= count; n++) {
        const snapshot = {
          ...template,
          id: ids[n - 1],
          edit_revision: ids[n - 1],
          team_id: tid,
          version_number: n,
          parent_version_id: n > 1 ? ids[n - 2] : null,
          version_comment: 'Revision ' + n,
          created_at: now,
        };
        versionInsert.run(snapshot.id, tid, n, JSON.stringify(snapshot), now);
        revisions++;
      }
      variants++;
    }
  }
  source.db.exec('COMMIT');
  global.gc?.();
  const baselineHeap = process.memoryUsage().heapUsed;
  peakHeap = baselineHeap;
  const exportStore = {
    backup: async (action, p) => {
      const r = await source.store.backup(action, p);
      if (action === 'backup_page')
        maxPageBytes = Math.max(
          maxPageBytes,
          Buffer.byteLength(JSON.stringify(r)),
        );
      sample();
      return r;
    },
  };
  const exportTimes = [];
  let blob;
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    blob = await archive(exportStore);
    exportTimes.push(performance.now() - start);
  }
  const validationStart = performance.now();
  const manifest = await validateBackup(fileStream(blob, true));
  const validationMs = performance.now() - validationStart;
  const originalBatch = target.d1.batch;
  target.d1.batch = async (ss) => {
    maxStatements = Math.max(maxStatements, ss.length);
    maxWriteBytes = Math.max(
      maxWriteBytes,
      Buffer.byteLength(
        JSON.stringify(ss.map((s) => ({ sql: s.sql, args: s.args }))),
      ),
    );
    for (const statement of ss)
      if (
        /^(DELETE FROM|INSERT OR IGNORE INTO) search_terms/.test(statement.sql)
      ) {
        const run = statement.run.bind(statement);
        statement.run = async () => {
          const start = performance.now();
          const result = await run();
          indexSqlMs += performance.now() - start;
          indexStatements++;
          return result;
        };
      }
    const result = await originalBatch(ss);
    sample();
    return result;
  };
  const persistenceStart = performance.now();
  const operation = crypto.randomUUID();
  let state = await target.store.backup('backup_begin', {
      id: operation,
      manifest,
    }),
    index = 0;
  for await (const text of backupChunks(fileStream(blob, true))) {
    const payload = { id: operation, index, text };
    maxRequestBytes = Math.max(
      maxRequestBytes,
      Buffer.byteLength(JSON.stringify({ action: 'backup_restore', payload })),
    );
    state = await target.store.backup('backup_restore', payload);
    index++;
  }
  const restorePersistenceMs = performance.now() - persistenceStart;
  const targetCounts = (await target.store.backup('backup_info')).counts;
  if (
    !state.complete ||
    targetCounts.families !== size ||
    targetCounts.variants !== variants ||
    targetCounts.revisions !== revisions
  )
    throw Error('Scale restore counts do not match.');
  if (target.db.prepare('PRAGMA foreign_key_check').all().length)
    throw Error('Scale restore has broken foreign keys.');
  const report = {
    label:
      'Local isolated Node SQLite, six-set synthetic families; not hosted D1/Supabase latency',
    size,
    variants,
    revisions,
    compressedBytes: blob.size,
    expandedRecordBytes: manifest.bytes,
    chunks: manifest.hashes.length,
    exportMs: exportTimes,
    exportMedianMs: [...exportTimes].sort((a, b) => a - b)[1],
    validationMs,
    restorePersistenceMs,
    indexSqlMs,
    indexStatements,
    maxPageBytes,
    maxRequestBytes,
    maxWriteBytes,
    maxStatements,
    baselineHeap,
    peakHeap,
    incrementalPeakHeap: peakHeap - baselineHeap,
    finalRss: process.memoryUsage().rss,
  };
  await fs.mkdir('.artifacts/backup', { recursive: true });
  await fs.writeFile(
    `.artifacts/backup/scale-${size}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearInterval(timer);
  source.close();
  target.close();
}
