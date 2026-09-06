import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import {
  cleanMeta,
  normalizeTags,
  type Draft,
  type Snapshot,
  type TeamRecord,
  type QueryPlan,
} from './domain';
import { makeSnapshot } from './snapshot';
import { indexTerms } from './search';
import { demoDrafts } from './demo';
type Row = Record<string, any>;
export class DemoStore {
  constructor(
    private db: D1Database,
    private owner: string,
  ) {}
  private stmt(sql: string, ...args: any[]) {
    return this.db.prepare(sql).bind(...args);
  }
  private hydrate(row: Row): TeamRecord {
    return {
      ...JSON.parse(row.metadata),
      id: row.id,
      current_version_id: row.current_version_id,
      favourite: !!row.favourite,
      archived: !!row.archived,
      created_at: row.created_at,
      updated_at: row.updated_at,
      imported_at: row.imported_at,
      version: JSON.parse(row.snapshot),
    };
  }
  async initialize() {
    const profile = await this.stmt(
      'SELECT id FROM profiles WHERE id=?',
      this.owner,
    ).first();
    if (!profile) {
      const r = await this.stmt(
        'INSERT OR IGNORE INTO profiles(id,created_at) VALUES(?,?)',
        this.owner,
        new Date().toISOString(),
      ).run();
      if (r.meta.changes) {
        await this.import(demoDrafts);
        const { teams } = await this.list({
          page: 0,
          sort: 'created_asc',
          plan: { meta: [], set: [], free: [] },
        });
        for (let i = 0; i < Math.min(3, teams.length); i++) {
          let t = teams[i];
          for (let v = 1; v < [4, 3, 2][i]; v++) {
            t = await this.version(
              t.id,
              {
                ...t,
                ...t.version,
                version_comment:
                  v === 1
                    ? 'Adjusted EVs and notes'
                    : v === 2
                      ? 'Edited for Gliscor matchup'
                      : 'Tournament version',
              },
              t.current_version_id,
              t.current_version_id,
            );
          }
          if (i < 2) await this.patch(t.id, { favourite: true });
        }
      }
    }
  }
  async get(id: string) {
    const row = await this.stmt(
      'SELECT t.*,v.snapshot FROM teams t JOIN team_versions v ON v.id=t.current_version_id AND v.team_id=t.id WHERE t.id=? AND t.owner_id=?',
      id,
      this.owner,
    ).first<Row>();
    if (!row) throw Error('Team not found.');
    const team = this.hydrate(row);
    const h = await this.stmt(
      'SELECT snapshot FROM team_versions WHERE team_id=? ORDER BY version_number DESC',
      id,
    ).all<Row>();
    team.history = h.results.map((r) => JSON.parse(r.snapshot));
    const share = await this.stmt(
      'SELECT id FROM share_links WHERE team_id=? AND revoked_at IS NULL',
      id,
    ).first();
    return { ...team, has_share: !!share };
  }
  private termStatements(meta: any, v: Snapshot, comments: string[] = []) {
    return indexTerms(meta, v, comments).map((t) =>
      this.stmt(
        'INSERT OR IGNORE INTO search_terms(team_id,version_id,slot,field,value) VALUES(?,?,?,?,?)',
        v.team_id,
        t.version_id,
        t.slot,
        t.field,
        t.value,
      ),
    );
  }
  private tagStatements(teamId: string, tags: string[]) {
    const s: D1PreparedStatement[] = [
      this.stmt('DELETE FROM team_tags WHERE team_id=?', teamId),
    ];
    for (const name of tags) {
      const norm = name.toLowerCase();
      s.push(
        this.stmt(
          'INSERT OR IGNORE INTO tags(id,owner_id,display_name,normalized_name) VALUES(?,?,?,?)',
          crypto.randomUUID(),
          this.owner,
          name,
          norm,
        ),
        this.stmt(
          'INSERT INTO team_tags(team_id,tag_id) SELECT ?,id FROM tags WHERE owner_id=? AND normalized_name=?',
          teamId,
          this.owner,
          norm,
        ),
      );
    }
    return s;
  }
  async import(drafts: Draft[]) {
    if (!Array.isArray(drafts) || !drafts.length || drafts.length > 200)
      throw Error('Choose 1–200 teams.');
    const built = drafts.map((d) => {
      const id = crypto.randomUUID();
      return { d, id, m: cleanMeta(d), v: makeSnapshot(d, id, 1, null) };
    });
    const statements: D1PreparedStatement[] = [];
    for (const { d, id, m, v } of built) {
      statements.push(
        this.stmt(
          'INSERT INTO teams(id,owner_id,title,format,team_date,source_name,metadata,current_version_id,created_at,updated_at,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          id,
          this.owner,
          m.title,
          m.format,
          m.team_date,
          m.source_name,
          JSON.stringify(m),
          v.id,
          v.created_at,
          v.created_at,
          d.imported ? v.created_at : null,
        ),
        this.stmt(
          'INSERT INTO team_versions(id,team_id,version_number,snapshot,created_at) VALUES(?,?,?,?,?)',
          v.id,
          id,
          1,
          JSON.stringify(v),
          v.created_at,
        ),
        ...this.termStatements(m, v),
        ...this.tagStatements(id, m.tags),
      );
    }
    await this.db.batch(statements);
    return { ids: built.map((b) => b.id), count: built.length };
  }
  async version(id: string, draft: Draft, expected: string, parent: string) {
    const t = await this.get(id);
    if (t.current_version_id !== expected)
      throw Error(
        'This team changed in another window. Reload it before saving.',
      );
    const base = t.history!.find((v) => v.id === parent);
    if (!base) throw Error('Version not found.');
    const m = cleanMeta(draft);
    const v = makeSnapshot(draft, id, t.version.version_number + 1, parent);
    await this.db.batch([
      this.stmt(
        'INSERT INTO team_versions(id,team_id,version_number,snapshot,created_at) VALUES(?,?,?,?,?)',
        v.id,
        id,
        v.version_number,
        JSON.stringify(v),
        v.created_at,
      ),
      this.stmt(
        'UPDATE teams SET title=?,format=?,team_date=?,source_name=?,metadata=?,current_version_id=?,updated_at=? WHERE id=? AND owner_id=?',
        m.title,
        m.format,
        m.team_date,
        m.source_name,
        JSON.stringify(m),
        v.id,
        v.created_at,
        id,
        this.owner,
      ),
      this.stmt(
        "DELETE FROM search_terms WHERE team_id=? AND version_id=''",
        id,
      ),
      ...this.termStatements(
        m,
        v,
        t.history!.map((x) => x.version_comment),
      ),
      ...this.tagStatements(id, m.tags),
    ]);
    return this.get(id);
  }
  async patch(id: string, p: Row) {
    if (Object.keys(p).every((k) => ['favourite', 'archived'].includes(k))) {
      const fields = Object.keys(p);
      if (fields.length)
        await this.stmt(
          'UPDATE teams SET ' +
            fields.map((k) => k + '=?').join(',') +
            ',updated_at=? WHERE id=? AND owner_id=?',
          ...fields.map((k) => Number(p[k])),
          new Date().toISOString(),
          id,
          this.owner,
        ).run();
      return this.get(id);
    }
    const t = await this.get(id);
    const m = cleanMeta({
      ...t,
      ...p,
      tags: p.tags ? normalizeTags(p.tags) : t.tags,
    });
    await this.db.batch([
      this.stmt(
        'UPDATE teams SET title=?,format=?,team_date=?,source_name=?,metadata=CASE WHEN updated_at=? THEN ? ELSE NULL END,favourite=?,archived=?,updated_at=? WHERE id=? AND owner_id=?',
        m.title,
        m.format,
        m.team_date,
        m.source_name,
        t.updated_at,
        JSON.stringify(m),
        Number(p.favourite ?? t.favourite),
        Number(p.archived ?? t.archived),
        new Date().toISOString(),
        id,
        this.owner,
      ),
      this.stmt(
        "DELETE FROM search_terms WHERE team_id=? AND version_id=''",
        id,
      ),
      ...this.termStatements(
        m,
        t.version,
        t.history!.map((x) => x.version_comment),
      ),
      ...this.tagStatements(id, m.tags),
    ]);
    return this.get(id);
  }
  async bulk(ids: string[], p: Row) {
    if (!ids.length || ids.length > 200) throw Error('Select up to 200 teams.');
    for (const id of ids) await this.get(id);
    for (const id of ids) {
      const t = await this.get(id);
      await this.patch(id, {
        ...p,
        tags: p.tags ? normalizeTags([...t.tags, ...p.tags]) : t.tags,
      });
    }
    return { count: ids.length };
  }
  async list(p: Row) {
    const plan = p.plan as QueryPlan;
    const args: any[] = [this.owner];
    const clauses = [
      't.owner_id=?',
      't.archived=' + Number(p.archived === true),
    ];
    if (p.favourite) clauses.push('t.favourite=1');
    for (const [key, field] of [
      ['format', 'format'],
      ['source', 'source_name'],
    ] as const) {
      if (p[key]) {
        clauses.push('t.' + field + '=?');
        args.push(p[key]);
      }
    }
    if (p.year) {
      clauses.push(
        p.year === 'unknown'
          ? 't.team_date IS NULL'
          : 'substr(t.team_date,1,4)=?',
      );
      if (p.year !== 'unknown') args.push(p.year);
    }
    if (p.tag) {
      clauses.push(
        'EXISTS(SELECT 1 FROM team_tags tt JOIN tags tg ON tg.id=tt.tag_id WHERE tt.team_id=t.id AND tg.normalized_name=?)',
      );
      args.push(p.tag.toLowerCase());
    }
    for (const term of plan.meta) {
      clauses.push(
        "EXISTS(SELECT 1 FROM search_terms m WHERE m.team_id=t.id AND m.version_id='' AND m.field=? AND m.value=?)",
      );
      args.push(term.field, term.value);
    }
    if (plan.set.length || plan.free.length) {
      let parts = [
        's.team_id=t.id',
        's.version_id=t.current_version_id',
        's.slot>=0',
      ];
      for (const term of plan.set) {
        parts.push(
          'EXISTS(SELECT 1 FROM search_terms x WHERE x.team_id=t.id AND x.version_id=s.version_id AND x.slot=s.slot AND x.field=? AND x.value=?)',
        );
        args.push(term.field, term.value);
      }
      for (const value of plan.free) {
        parts.push(
          "EXISTS(SELECT 1 FROM search_terms x WHERE x.team_id=t.id AND (x.version_id='' OR (x.version_id=s.version_id AND x.slot=s.slot)) AND x.value=?)",
        );
        args.push(value);
      }
      let predicate =
        'EXISTS(SELECT 1 FROM search_terms s WHERE ' +
        parts.join(' AND ') +
        ')';
      if (plan.fallback?.length) {
        predicate =
          '(' +
          predicate +
          ' OR (' +
          plan.fallback
            .map((value) => {
              args.push(value);
              return "EXISTS(SELECT 1 FROM search_terms f WHERE f.team_id=t.id AND f.version_id='' AND f.value=?)";
            })
            .join(' AND ') +
          '))';
      }
      clauses.push(predicate);
    }
    const orders: Row = {
      modified_desc: 't.updated_at DESC',
      modified_asc: 't.updated_at ASC',
      title_asc: 't.title COLLATE NOCASE ASC',
      title_desc: 't.title COLLATE NOCASE DESC',
      created_desc: 't.created_at DESC',
      created_asc: 't.created_at ASC',
      date_desc: 't.team_date IS NULL,t.team_date DESC',
      date_asc: 't.team_date IS NULL,t.team_date ASC',
      format: 't.format ASC',
      source: 't.source_name ASC',
    };
    const where = clauses.join(' AND ');
    const count = await this.stmt(
      'SELECT count(*) AS n FROM teams t WHERE ' + where,
      ...args,
    ).first<Row>();
    const rows = await this.stmt(
      'SELECT t.*,v.snapshot FROM teams t JOIN team_versions v ON v.id=t.current_version_id AND v.team_id=t.id WHERE ' +
        where +
        ' ORDER BY ' +
        (orders[p.sort] || orders.modified_desc) +
        ',t.id LIMIT 30 OFFSET ?',
      ...args,
      Math.max(0, Math.min(100000, Number(p.page) || 0)) * 30,
    ).all<Row>();
    return {
      teams: rows.results.map((r) => this.hydrate(r)),
      total: count?.n ?? 0,
    };
  }
  async facets() {
    const rows = await this.stmt(
      'SELECT format,source_name,substr(team_date,1,4) AS year,archived,favourite FROM teams WHERE owner_id=?',
      this.owner,
    ).all<Row>();
    const tags = await this.stmt(
      'SELECT display_name FROM tags WHERE owner_id=? ORDER BY normalized_name',
      this.owner,
    ).all<Row>();
    const unique = (k: string) =>
      [...new Set(rows.results.map((r) => r[k]).filter(Boolean))].sort();
    return {
      formats: unique('format'),
      sources: unique('source_name'),
      years: unique('year'),
      tags: tags.results.map((t) => t.display_name),
      all: rows.results.filter((t) => !t.archived).length,
      favourites: rows.results.filter((t) => t.favourite && !t.archived).length,
      archived: rows.results.filter((t) => t.archived).length,
    };
  }
  async share(id: string, revoke = false) {
    await this.get(id);
    if (revoke) {
      await this.stmt(
        'UPDATE share_links SET revoked_at=? WHERE team_id=? AND revoked_at IS NULL',
        new Date().toISOString(),
        id,
      ).run();
      return { revoked: true };
    }
    const token = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    const hash = await hashToken(token);
    await this.db.batch([
      this.stmt(
        'UPDATE share_links SET revoked_at=? WHERE team_id=? AND revoked_at IS NULL',
        new Date().toISOString(),
        id,
      ),
      this.stmt(
        'INSERT INTO share_links(id,team_id,token_hash,created_at) VALUES(?,?,?,?)',
        crypto.randomUUID(),
        id,
        hash,
        new Date().toISOString(),
      ),
    ]);
    return { token };
  }
}
export async function hashToken(t: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function resolveDemoShare(
  db: D1Database,
  token: string,
  version?: number,
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw Error('This share link is unavailable.');
  const r = await db
    .prepare(
      'SELECT t.*,v.snapshot FROM share_links s JOIN teams t ON t.id=s.team_id JOIN team_versions v ON v.team_id=t.id AND ' +
        (version ? 'v.version_number=?' : 'v.id=t.current_version_id') +
        ' WHERE s.token_hash=? AND s.revoked_at IS NULL',
    )
    .bind(...(version ? [version] : []), await hashToken(token))
    .first<Row>();
  if (!r) throw Error('This share link is unavailable.');
  return {
    ...JSON.parse(r.metadata),
    id: r.id,
    current_version_id: r.current_version_id,
    version: JSON.parse(r.snapshot),
  };
}
