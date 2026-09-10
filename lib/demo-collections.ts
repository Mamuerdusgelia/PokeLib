import type { D1Database } from '@cloudflare/workers-types';
import { DemoStore, hashToken } from './demo-store';
import {
  cleanCollection,
  collectionParams,
  publicTeam,
  sharedSelection,
  type CollectionRecord,
} from './collections';

type Row = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  definition: string;
  created_at: string;
  updated_at: string;
  has_share: number;
};
const projection = (r: Row): CollectionRecord => ({
  id: r.id,
  name: r.name,
  description: r.description,
  definition: JSON.parse(r.definition),
  created_at: r.created_at,
  updated_at: r.updated_at,
  has_share: !!r.has_share,
});
const conflict =
  'This collection changed in another window. Reopen it before saving.';
export class DemoCollections {
  constructor(
    private db: D1Database,
    private owner: string,
  ) {}
  private stmt(sql: string, ...args: (string | number | null)[]) {
    return this.db.prepare(sql).bind(...args);
  }
  private async get(id: string) {
    const r = await this.stmt(
      'SELECT c.*,EXISTS(SELECT 1 FROM collection_shares s WHERE s.collection_id=c.id AND s.revoked_at IS NULL) has_share FROM collections c WHERE id=? AND owner_id=?',
      id,
      this.owner,
    ).first<Row>();
    if (!r) throw Error('Collection not found.');
    return projection(r);
  }
  async run(action: string, input: unknown = {}) {
    const p = input as Record<string, unknown>;
    if (!p || typeof p !== 'object' || Array.isArray(p))
      throw Error('Invalid collection.');
    if (action === 'collection_list') {
      const { page } = sharedSelection({ page: p.page });
      const [rows, count] = await Promise.all([
        this.stmt(
          'SELECT c.*,EXISTS(SELECT 1 FROM collection_shares s WHERE s.collection_id=c.id AND s.revoked_at IS NULL) has_share FROM collections c WHERE owner_id=? ORDER BY updated_at DESC,id LIMIT 30 OFFSET ?',
          this.owner,
          page * 30,
        ).all<Row>(),
        this.stmt(
          'SELECT count(*) n FROM collections WHERE owner_id=?',
          this.owner,
        ).first<{ n: number }>(),
      ]);
      return { collections: rows.results.map(projection), total: count!.n };
    }
    if (action === 'collection_save') {
      const d = cleanCollection(p),
        definition = JSON.stringify(d.definition);
      const current = await this.stmt(
        'SELECT * FROM collections WHERE id=? AND owner_id=?',
        d.id,
        this.owner,
      ).first<Row>();
      if (current && !d.expected_updated_at) {
        if (
          current.name === d.name &&
          current.description === d.description &&
          current.definition === definition
        )
          return this.get(d.id);
        throw Error(conflict);
      }
      const now = new Date(
        Math.max(Date.now(), current ? Date.parse(current.updated_at) + 1 : 0),
      ).toISOString();
      try {
        if (d.expected_updated_at) {
          const r = await this.stmt(
            'UPDATE collections SET name=?,name_key=?,description=?,definition=?,updated_at=? WHERE id=? AND owner_id=? AND updated_at=?',
            d.name,
            d.name.toLowerCase(),
            d.description,
            definition,
            now,
            d.id,
            this.owner,
            d.expected_updated_at,
          ).run();
          if (!r.meta.changes) throw Error(conflict);
        } else
          await this.stmt(
            'INSERT INTO collections(id,owner_id,name,name_key,description,definition,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
            d.id,
            this.owner,
            d.name,
            d.name.toLowerCase(),
            d.description,
            definition,
            now,
            now,
          ).run();
      } catch (e) {
        if (/UNIQUE/.test((e as Error).message))
          throw Error('A collection with that name or ID already exists.');
        throw e;
      }
      return this.get(d.id);
    }
    if (typeof p.id !== 'string') throw Error('Invalid collection ID.');
    if (action === 'collection_get') return this.get(p.id);
    if (action === 'collection_delete') {
      const r = await this.stmt(
        'DELETE FROM collections WHERE id=? AND owner_id=? AND updated_at=?',
        p.id,
        this.owner,
        typeof p.expected_updated_at === 'string' ? p.expected_updated_at : '',
      ).run();
      if (!r.meta.changes) throw Error(conflict);
      return { deleted: true };
    }
    if (action === 'collection_share' || action === 'collection_revoke') {
      await this.get(p.id);
      const revoke = this.stmt(
        'UPDATE collection_shares SET revoked_at=? WHERE collection_id IN (SELECT id FROM collections WHERE id=? AND owner_id=?) AND revoked_at IS NULL',
        new Date().toISOString(),
        p.id,
        this.owner,
      );
      if (action === 'collection_revoke') {
        await revoke.run();
        return { revoked: true };
      }
      const token = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
      const result = await this.db.batch([
        revoke,
        this.stmt(
          'INSERT INTO collection_shares(id,collection_id,token_hash,created_at) SELECT ?,id,?,? FROM collections WHERE id=? AND owner_id=?',
          crypto.randomUUID(),
          await hashToken(token),
          new Date().toISOString(),
          p.id,
          this.owner,
        ),
      ]);
      if (!result[1].meta.changes) throw Error('Collection not found.');
      return { token };
    }
    throw Error('Unknown collection action.');
  }
}
export async function resolveDemoCollection(
  db: D1Database,
  token: string,
  input: Parameters<typeof sharedSelection>[0] = {},
) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Collection unavailable.');
  const selection = sharedSelection(input);
  const c = await db
    .prepare(
      "SELECT c.* FROM collections c JOIN collection_shares s ON s.collection_id=c.id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.mode='live'",
    )
    .bind(await hashToken(token))
    .first<Row>();
  if (!c) throw Error('Collection unavailable.');
  const p = {
    ...collectionParams(JSON.parse(c.definition)),
    page: selection.page,
    ...(selection.family
      ? { family_id: selection.family, group_families: false }
      : {}),
    ...(selection.team
      ? { team_id: selection.team, group_families: false, page: 0 }
      : {}),
  };
  const r = await new DemoStore(db, c.owner_id).list(p);
  if (selection.team) {
    if (!r.teams[0]) throw Error('Team unavailable.');
    return publicTeam(r.teams[0]);
  }
  return {
    name: c.name,
    description: c.description,
    mode: 'live',
    total: r.total,
    teams: r.teams.map((t) => publicTeam(t, true)),
  };
}
