import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { DemoStore } from '../.test-build/demo-store.mjs';
import { SupabaseStore } from '../.test-build/supabase-store.mjs';
import { exportBackup } from '../.test-build/backup.mjs';
import {
  backupChunks,
  fileStream,
  validateBackup,
} from '../.test-build/backup-format.mjs';
import { compressedBackup } from '../.test-build/backup-browser.mjs';
export async function sqliteStore(owner = crypto.randomUUID()) {
  const db = new DatabaseSync(':memory:');
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
        const result = [];
        for (const s of ss)
          result.push(
            /^\s*(SELECT|WITH)/i.test(s.sql) ? await s.all() : await s.run(),
          );
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return {
    store: new DemoStore(d1, owner),
    db,
    d1,
    owner,
    close: () => db.close(),
  };
}
export async function postgresStore() {
  const pg = new PGlite();
  await pg.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;",
  );
  for (const name of (await fs.readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    await pg.exec(await fs.readFile('supabase/migrations/' + name, 'utf8'));
  const owner = crypto.randomUUID();
  await pg.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
  await pg.exec('SET ROLE authenticated');
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
  const rpc = async (action, payload = {}) =>
    (
      await pg.query('SELECT public.vault($1,$2::jsonb) data', [
        action,
        JSON.stringify(payload),
      ])
    ).rows[0].data;
  const store = new SupabaseStore({
    rpc: async (_name, args) => {
      try {
        return { data: await rpc(args.action, args.payload), error: null };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    },
  });
  return { pg, store, owner, rpc, close: () => pg.close() };
}
export async function archive(store) {
  return compressedBackup(exportBackup(store));
}
export async function decoded(blob) {
  return (await new Response(fileStream(blob, true)).text())
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
}
export async function restore(
  store,
  blob,
  id = crypto.randomUUID(),
  replay = false,
) {
  const manifest = await validateBackup(fileStream(blob, true));
  let state = await store.backup('backup_begin', { id, manifest }),
    index = 0;
  for await (const text of backupChunks(fileStream(blob, true))) {
    state = await store.backup('backup_restore', { id, index, text });
    if (replay) await store.backup('backup_restore', { id, index, text });
    index++;
  }
  return state;
}
export async function fixture(store) {
  const { emptyDraft, snapshotRevision } =
    await import('../.test-build/domain.mjs');
  const raw =
    'Gengar @ Gengarite\r\nAbility: Shadow Tag\r\nEVs: 4 Def / 252 SpA / 252 Spe\r\nTimid Nature\r\n- Shadow Ball\r\n- Hidden Power [Fire]\r\nMystery Setting: keep me\r\n\r\nZygarde @ Leftovers\r\n- Thousand Arrows\r\n\r\nKyogre\r\n- Origin Pulse\r\n\r\nTornadus\r\n- Tailwind\r\n\r\nIncineroar\r\n\r\nDitto\r\n\r\nMew\r\n\r\n';
  let a = await store.get(
    (
      await store.import([
        {
          ...emptyDraft(true),
          title: 'Family A',
          format: 'gen7ubers',
          showdown_text: raw,
          original_text: raw,
          team_notes: 'Tournament notebook α\r\nKeep both lines.',
          set_notes: ['gengar private note', 'zygarde matchups'],
          tags: ['Tournament Grade'],
          source_type: 'PokéPaste',
          source_name: 'Strange Name',
          source_url: 'https://pokepast.es/0123456789abcdef',
          source_note: 'Retained provenance',
          team_date: '2017-08',
          team_date_precision: 'month',
          set_editing: [{ authored: true, attack_iv: 'manual', tera: 'auto' }],
        },
      ])
    ).ids[0],
  );
  async function revision(t, comment, parent = t.current_version_id) {
    return store.version(
      t.id,
      {
        ...t,
        ...t.version,
        version_comment: comment,
        team_notes: t.version.team_notes + '\r\n' + comment,
      },
      t.current_version_id,
      parent,
      snapshotRevision(t.version),
      t.updated_at,
    );
  }
  a = await revision(a, 'Opening revision');
  const old = a.history.at(-1).id;
  a = await revision(a, 'Final revision', old);
  a = await store.patch(a.id, { favourite: true });
  let sibling = await store.variant('variant_create', {
    id: a.id,
    name: 'Anti-Stall',
    description: 'Independent alternate build',
    version_id: old,
    expected: a.current_version_id,
    expected_revision: snapshotRevision(a.version),
    expected_updated_at: a.updated_at,
    operation_id: crypto.randomUUID(),
  });
  sibling = await store.patch(sibling.id, {
    format: 'gen9nationaldexubers',
    tags: ['Anti Stall ÉTÉ'],
    team_date: '2021',
    team_date_precision: 'year',
  });
  sibling = await revision(sibling, 'Sibling independent history');
  const b = await store.get(
    (
      await store.import([
        {
          ...emptyDraft(true),
          title: 'Family B [BO]',
          format: 'custom',
          format_context: { generation: 4, battle: 'doubles' },
          showdown_text: raw,
          original_text: raw,
          team_notes: 'unusual raw import',
          set_notes: ['note attached to first set'],
          source_type: 'Other',
          source_name: 'Imported source',
        },
      ])
    ).ids[0],
  );
  await store.patch(b.id, { archived: true });
  const collections = [];
  for (const [name, query, favourite] of [
    ['Core prep', 'Mega Gengar + Zygarde', false],
    ['Tournament favourites', 'tag:"Tournament Grade"', true],
  ])
    collections.push(
      await store.collection('collection_save', {
        id: crypto.randomUUID(),
        name,
        description: 'A live saved query',
        definition: {
          query,
          filters: [{ field: 'format', value: 'gen7ubers' }],
          sort: 'date_asc',
          favourite,
        },
      }),
    );
  await store.share(a.id);
  await store.collection('collection_share', { id: collections[0].id });
  return { a: a.id, b: b.id, sibling: sibling.id, raw, collections };
}
export function semantic(records) {
  const tags = [],
    families = [],
    collections = [];
  let family, variant;
  const clean = (value) => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .map(([k, v]) => [
            k,
            k.endsWith('_at') && typeof v === 'string'
              ? new Date(v).toISOString()
              : clean(v),
          ])
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    return value;
  };
  for (const r of records) {
    if (r.type === 'tag') tags.push(r.name);
    if (r.type === 'family') {
      const { id: _id, type: _type, variants: _variants, ...data } = r;
      family = { ...data, variants: [] };
      families.push(family);
    }
    if (r.type === 'variant') {
      const { id: _id, family: _family, type: _type, snapshot, ...data } = r;
      variant = { ...data, history: [snapshot] };
      family.variants.push(variant);
    }
    if (r.type === 'revision') variant.history.push(r.snapshot);
    if (r.type === 'collection') {
      const { id: _id, type: _type, ...data } = r;
      collections.push(data);
    }
  }
  families.forEach((f) =>
    f.variants.sort((a, b) => a.name.localeCompare(b.name)),
  );
  return clean({
    tags: tags.sort((a, b) => a.localeCompare(b)),
    families: families.sort((a, b) => a.title.localeCompare(b.title)),
    collections: collections.sort((a, b) => a.name.localeCompare(b.name)),
  });
}
