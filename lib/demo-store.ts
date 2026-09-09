import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import {
  cleanMeta,
  normalizeTags,
  snapshotRevision,
  type Draft,
  type Snapshot,
  type TeamRecord,
  type QueryPlan,
} from './domain';
import { makeSnapshot, updateSnapshot } from './snapshot';
import { indexTerms } from './search';
import { demoDrafts } from './demo';
import { canonicalFormat, formatSearchValues } from './formats';
import { DemoVariants } from './demo-variants';
import {
  validateChunk,
  requestHash,
  IMPORT_CHUNK_SIZE,
  type ChunkKey,
} from './import-workflow';
type Row = Record<string, any>;
const editConflict =
  'This team changed in another window. Reload it before saving.';
const timestampAfter = (previous: string) =>
  new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
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
      family_id: row.family_id ?? null,
      family_key: row.family_id || row.id,
      variant_name: row.variant_name || 'Main',
      variant_description: row.variant_description || '',
      variant_count: row.variant_count ?? 1,
      matching_variant_count: row.matching_variant_count ?? 1,
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
              snapshotRevision(t.version),
              t.updated_at,
            );
          }
          if (i < 2) await this.patch(t.id, { favourite: true });
        }
      }
    }
  }
  async get(id: string) {
    const row = await this.stmt(
      'SELECT t.*,v.snapshot,CASE WHEN t.family_id IS NULL THEN 1 ELSE (SELECT count(*) FROM teams s WHERE s.family_id=t.family_id AND s.owner_id=t.owner_id) END variant_count FROM teams t JOIN team_versions v ON v.id=t.current_version_id AND v.team_id=t.id WHERE t.id=? AND t.owner_id=?',
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
    return [
      this.stmt(
        "INSERT OR IGNORE INTO search_terms(team_id,version_id,slot,field,value) SELECT ?,json_extract(value,'$.version_id'),json_extract(value,'$.slot'),json_extract(value,'$.field'),json_extract(value,'$.value') FROM json_each(?)",
        v.team_id,
        JSON.stringify(indexTerms(meta, v, comments)),
      ),
    ];
  }
  private tagStatements(teamId: string, names: string[]) {
    const tags = names.map((name) => ({
      id: crypto.randomUUID(),
      name,
      normalized: name.toLowerCase(),
    }));
    return [
      this.stmt('DELETE FROM team_tags WHERE team_id=?', teamId),
      this.stmt(
        "INSERT OR IGNORE INTO tags(id,owner_id,display_name,normalized_name) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.name'),json_extract(value,'$.normalized') FROM json_each(?)",
        this.owner,
        JSON.stringify(tags),
      ),
      this.stmt(
        "INSERT INTO team_tags(team_id,tag_id) SELECT ?,t.id FROM tags t JOIN json_each(?) j ON t.normalized_name=json_extract(j.value,'$.normalized') WHERE t.owner_id=?",
        teamId,
        JSON.stringify(tags),
        this.owner,
      ),
    ];
  }
  private async receipt(key: ChunkKey, kind: string, digest: string) {
    const row = await this.stmt(
      'SELECT kind,request_hash,result FROM operation_chunks WHERE owner_id=? AND operation_id=? AND chunk_index=?',
      this.owner,
      key.operation_id,
      key.chunk_index,
    ).first<Row>();
    if (!row) return null;
    if (row.kind !== kind || row.request_hash !== digest)
      throw Error(
        'This retry differs from the original operation. Start a new import.',
      );
    return JSON.parse(row.result);
  }
  private receiptStatement(
    key: ChunkKey,
    kind: string,
    digest: string,
    result: unknown,
  ) {
    return this.stmt(
      'INSERT INTO operation_chunks(owner_id,operation_id,chunk_index,kind,request_hash,result,created_at) VALUES(?,?,?,?,?,?,?)',
      this.owner,
      key.operation_id,
      key.chunk_index,
      kind,
      digest,
      JSON.stringify(result),
      new Date().toISOString(),
    );
  }
  async import(drafts: Draft[], key?: ChunkKey) {
    validateChunk(key);
    if (!Array.isArray(drafts) || !drafts.length || drafts.length > 200)
      throw Error(
        'Import request is too large; use the chunked import workflow.',
      );
    if (key && drafts.length > IMPORT_CHUNK_SIZE)
      throw Error('Import chunk is too large.');
    const digest = key ? await requestHash(drafts) : '';
    if (key) {
      const previous = await this.receipt(key, 'import', digest);
      if (previous) return previous;
    }
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
    const result = { ids: built.map((b) => b.id), count: built.length };
    if (key)
      statements.unshift(this.receiptStatement(key, 'import', digest, result));
    try {
      await this.db.batch(statements);
    } catch (e) {
      if (key) {
        const previous = await this.receipt(key, 'import', digest);
        if (previous) return previous;
      }
      throw e;
    }
    return result;
  }
  async save(
    id: string,
    draft: Draft,
    expected: string,
    parent: string,
    expectedRevision: string,
    expectedUpdatedAt: string,
  ) {
    return this.writeVersion(
      id,
      draft,
      expected,
      parent,
      expectedRevision,
      expectedUpdatedAt,
      false,
    );
  }
  async version(
    id: string,
    draft: Draft,
    expected: string,
    parent: string,
    expectedRevision: string,
    expectedUpdatedAt: string,
  ) {
    return this.writeVersion(
      id,
      draft,
      expected,
      parent,
      expectedRevision,
      expectedUpdatedAt,
      true,
    );
  }
  private async writeVersion(
    id: string,
    draft: Draft,
    expected: string,
    parent: string,
    expectedRevision: string,
    expectedUpdatedAt: string,
    create: boolean,
  ) {
    const t = await this.get(id);
    if (
      t.current_version_id !== expected ||
      snapshotRevision(t.version) !== expectedRevision ||
      t.updated_at !== expectedUpdatedAt
    )
      throw Error(editConflict);
    const base = t.history!.find((v) => v.id === parent);
    if (!base) throw Error('Version not found.');
    if (!create && parent !== t.current_version_id)
      throw Error(
        'Historical versions are immutable. Restore as a new version.',
      );
    const m = cleanMeta(draft);
    const v = create
      ? makeSnapshot(draft, id, t.version.version_number + 1, parent)
      : updateSnapshot(draft, t.version);
    const statements: D1PreparedStatement[] = [];
    if (create)
      statements.push(
        this.stmt(
          'INSERT INTO team_versions(id,team_id,version_number,snapshot,created_at) VALUES(?,?,?,?,?)',
          v.id,
          id,
          v.version_number,
          JSON.stringify(v),
          v.created_at,
        ),
      );
    // A failed comparison deliberately violates metadata's NOT NULL constraint.
    // D1 batch rolls back the preceding insert and every following index/tag write.
    statements.push(
      this.stmt(
        `UPDATE teams SET title=?,format=?,team_date=?,source_name=?,
         metadata=CASE WHEN current_version_id=? AND updated_at=? AND EXISTS(
           SELECT 1 FROM team_versions v WHERE v.id=? AND v.team_id=teams.id
           AND coalesce(json_extract(v.snapshot,'$.edit_revision'),v.id)=?
         ) THEN ? ELSE NULL END,current_version_id=coalesce(?,current_version_id),updated_at=? WHERE id=? AND owner_id=?`,
        m.title,
        m.format,
        m.team_date,
        m.source_name,
        expected,
        expectedUpdatedAt,
        expected,
        expectedRevision,
        JSON.stringify(m),
        create ? v.id : null,
        timestampAfter(t.updated_at),
        id,
        this.owner,
      ),
    );
    if (!create)
      statements.push(
        this.stmt(
          'UPDATE team_versions SET snapshot=? WHERE id=? AND team_id=?',
          JSON.stringify(v),
          v.id,
          id,
        ),
        this.stmt(
          'DELETE FROM search_terms WHERE team_id=? AND version_id=?',
          id,
          v.id,
        ),
      );
    statements.push(
      this.stmt(
        "DELETE FROM search_terms WHERE team_id=? AND version_id=''",
        id,
      ),
      ...this.termStatements(
        m,
        v,
        t
          .history!.filter((x) => create || x.id !== v.id)
          .map((x) => x.version_comment),
      ),
      ...this.tagStatements(id, m.tags),
    );
    try {
      const results = await this.db.batch(statements);
      if (!results[create ? 1 : 0].meta.changes) throw Error('Team not found.');
    } catch (e) {
      const message = (e as Error).message;
      if (
        /NOT NULL constraint failed: teams.metadata|UNIQUE constraint failed: team_versions.team_id, team_versions.version_number/i.test(
          message,
        )
      )
        throw Error(editConflict);
      throw e;
    }
    return this.get(id);
  }
  async patch(id: string, p: Row) {
    if (Object.keys(p).every((k) => ['favourite', 'archived'].includes(k))) {
      const fields = Object.keys(p);
      if (fields.length)
        await this.stmt(
          'UPDATE teams SET ' +
            fields.map((k) => k + '=?').join(',') +
            ",updated_at=CASE WHEN updated_at>=? THEN strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0.001 seconds') ELSE ? END WHERE id=? AND owner_id=?",
          ...fields.map((k) => Number(p[k])),
          new Date().toISOString(),
          new Date().toISOString(),
          id,
          this.owner,
        ).run();
      return this.get(id);
    }
    const t = await this.get(id);
    if (p.expected_updated_at && p.expected_updated_at !== t.updated_at)
      throw Error(editConflict);
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
        timestampAfter(t.updated_at),
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
  async bulk(ids: string[], p: Row, key?: ChunkKey) {
    validateChunk(key);
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > (key ? IMPORT_CHUNK_SIZE : 200) ||
      new Set(ids).size !== ids.length
    )
      throw Error('Invalid bulk selection.');
    const digest = key ? await requestHash({ ids, patch: p }) : '';
    if (key) {
      const previous = await this.receipt(key, 'bulk', digest);
      if (previous) return previous;
    }
    const statements: D1PreparedStatement[] = [];
    for (const id of ids) {
      const t = await this.get(id);
      const m = cleanMeta({
        ...t,
        ...p,
        tags: p.tags ? normalizeTags([...t.tags, ...p.tags]) : t.tags,
      });
      statements.push(
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
          timestampAfter(t.updated_at),
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
          t.history!.map((v) => v.version_comment),
        ),
        ...this.tagStatements(id, m.tags),
      );
    }
    const result = { count: ids.length };
    if (key)
      statements.unshift(this.receiptStatement(key, 'bulk', digest, result));
    try {
      await this.db.batch(statements);
    } catch (e) {
      if (key) {
        const previous = await this.receipt(key, 'bulk', digest);
        if (previous) return previous;
      }
      throw e;
    }
    return result;
  }
  async bulkDelete(ids: string[], key: ChunkKey) {
    validateChunk(key);
    if (
      !key ||
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > IMPORT_CHUNK_SIZE ||
      new Set(ids).size !== ids.length
    )
      throw Error('Invalid deletion chunk.');
    const digest = await requestHash(ids),
      previous = await this.receipt(key, 'bulk_delete', digest);
    if (previous) return previous;
    const owned = await this.stmt(
      'SELECT count(*) n FROM teams WHERE owner_id=? AND id IN (SELECT value FROM json_each(?))',
      this.owner,
      JSON.stringify(ids),
    ).first<Row>();
    if (owned?.n !== ids.length)
      throw Error('A selected team is missing or belongs to another account.');
    const result = { count: ids.length };
    // Recheck inside the write transaction: a deletion between preflight and batch
    // must roll the whole chunk back, rather than report an inaccurate success.
    const receipt = this.stmt(
      'INSERT INTO operation_chunks(owner_id,operation_id,chunk_index,kind,request_hash,result,created_at) SELECT ?,?,?,?,?,CASE WHEN (SELECT count(*) FROM teams WHERE owner_id=? AND id IN (SELECT value FROM json_each(?)))=? THEN ? ELSE NULL END,?',
      this.owner,
      key.operation_id,
      key.chunk_index,
      'bulk_delete',
      digest,
      this.owner,
      JSON.stringify(ids),
      ids.length,
      JSON.stringify(result),
      new Date().toISOString(),
    );
    try {
      await this.db.batch([
        receipt,
        this.stmt(
          'DELETE FROM teams WHERE owner_id=? AND id IN (SELECT value FROM json_each(?))',
          this.owner,
          JSON.stringify(ids),
        ),
      ]);
    } catch (e) {
      const previous = await this.receipt(key, 'bulk_delete', digest);
      if (previous) return previous;
      if (
        /NOT NULL constraint failed: operation_chunks.result/i.test(
          (e as Error).message,
        )
      )
        throw Error(
          'A selected team was deleted elsewhere. Refresh your selection.',
        );
      throw e;
    }
    return result;
  }
  list(p: Row & { ids_only: true }): Promise<{ ids: string[]; total: number }>;
  list(p: Row): Promise<{ teams: TeamRecord[]; total: number }>;
  async list(p: Row) {
    const plan = p.plan as QueryPlan;
    const args: any[] = [this.owner];
    const clauses = ['t.owner_id=?'];
    if (p.family_id) {
      clauses.push('coalesce(t.family_id,t.id)=?');
      args.push(p.family_id);
    }
    if (p.include_archived !== true)
      clauses.push('t.archived=' + Number(p.archived === true));
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
        'EXISTS(SELECT 1 FROM search_terms m WHERE m.team_id=t.id AND ' +
          (term.field === 'note'
            ? "(m.version_id='' OR m.version_id=t.current_version_id)"
            : "m.version_id=''") +
          ' AND m.field=? AND m.value IN (' +
          (term.field === 'format'
            ? formatSearchValues(term.value)
            : [term.value]
          )
            .map(() => '?')
            .join(',') +
          '))',
      );
      args.push(
        term.field,
        ...(term.field === 'format'
          ? formatSearchValues(term.value)
          : [term.value]),
      );
    }
    if (plan.set.length || plan.free.length) {
      let parts = [
        's.team_id=t.id',
        's.version_id=t.current_version_id',
        's.slot>=0',
      ];
      if (plan.set.length) {
        parts.push('s.field=?', 's.value=?');
        args.push(plan.set[0].field, plan.set[0].value);
      }
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
    if (p.group_families) {
      const cte =
        "WITH ranked AS (SELECT t.id,t.family_id,t.title,t.format,t.source_name,t.team_date,t.created_at,t.updated_at,count(*) OVER(PARTITION BY coalesce(t.family_id,t.id)) matching_variant_count,row_number() OVER(PARTITION BY coalesce(t.family_id,t.id) ORDER BY CASE WHEN t.variant_key='main' THEN 0 ELSE 1 END,t.updated_at DESC,t.id) rn FROM teams t WHERE " +
        where +
        '), grouped AS (SELECT * FROM ranked WHERE rn=1) ';
      if (p.ids_only) {
        const rows = await this.stmt(
          'SELECT DISTINCT coalesce(t.family_id,t.id) id FROM teams t WHERE ' +
            where +
            ' ORDER BY id LIMIT 10001',
          ...args,
        ).all<Row>();
        if (rows.results.length > 10000)
          throw Error('Narrow the selection to at most 10,000 families.');
        return {
          ids: rows.results.map((r) => r.id),
          total: rows.results.length,
        };
      }
      const count = await this.stmt(
        'SELECT count(DISTINCT coalesce(t.family_id,t.id)) n FROM teams t WHERE ' +
          where,
        ...args,
      ).first<Row>();
      const order = (orders[p.sort] || orders.modified_desc) + ',t.id';
      const rows = await this.stmt(
        cte +
          ' ,page AS MATERIALIZED (SELECT t.* FROM grouped t ORDER BY ' +
          order +
          ' LIMIT 30 OFFSET ?) SELECT t.*,page.matching_variant_count,v.snapshot,CASE WHEN t.family_id IS NULL THEN 1 ELSE (SELECT count(*) FROM teams s WHERE s.family_id=t.family_id AND s.owner_id=t.owner_id) END variant_count FROM page JOIN teams t ON t.id=page.id JOIN team_versions v ON v.id=t.current_version_id AND v.team_id=t.id ORDER BY ' +
          order,
        ...args,
        Math.max(0, Math.min(100000, Number(p.page) || 0)) * 30,
      ).all<Row>();
      return {
        teams: rows.results.map((r) => this.hydrate(r)),
        total: count?.n ?? 0,
      };
    }
    if (p.ids_only === true) {
      const rows = await this.stmt(
        'SELECT t.id FROM teams t WHERE ' +
          where +
          ' ORDER BY t.id LIMIT 10001',
        ...args,
      ).all<Row>();
      if (rows.results.length > 10000)
        throw Error('Narrow the selection to at most 10,000 teams.');
      return { ids: rows.results.map((r) => r.id), total: rows.results.length };
    }
    const count = await this.stmt(
      'SELECT count(*) AS n FROM teams t WHERE ' + where,
      ...args,
    ).first<Row>();
    const rows = await this.stmt(
      'WITH page AS MATERIALIZED (SELECT t.id FROM teams t WHERE ' +
        where +
        ' ORDER BY ' +
        (orders[p.sort] || orders.modified_desc) +
        ',t.id LIMIT 30 OFFSET ?) SELECT t.*,v.snapshot FROM page JOIN teams t ON t.id=page.id JOIN team_versions v ON v.id=t.current_version_id AND v.team_id=t.id ORDER BY ' +
        (orders[p.sort] || orders.modified_desc) +
        ',t.id',
      ...args,
      Math.max(0, Math.min(100000, Number(p.page) || 0)) * 30,
    ).all<Row>();
    return {
      teams: rows.results.map((r) => this.hydrate(r)),
      total: count?.n ?? 0,
    };
  }
  async facets(p: Row = {}) {
    const dimensions = await this.stmt(
      "SELECT 'format' kind,format value FROM teams WHERE owner_id=? GROUP BY format UNION ALL SELECT 'source',source_name FROM teams WHERE owner_id=? AND source_name<>'' GROUP BY source_name UNION ALL SELECT 'year',substr(team_date,1,4) FROM teams WHERE owner_id=? AND team_date IS NOT NULL GROUP BY substr(team_date,1,4)",
      this.owner,
      this.owner,
      this.owner,
    ).all<Row>();
    const counts = await this.stmt(
      p.group_families
        ? 'SELECT count(DISTINCT CASE WHEN ?=1 OR archived=0 THEN coalesce(family_id,id) END) visible_count,count(DISTINCT CASE WHEN favourite=1 AND (?=1 OR archived=0) THEN coalesce(family_id,id) END) favourites,count(DISTINCT CASE WHEN archived=1 THEN coalesce(family_id,id) END) archived FROM teams WHERE owner_id=?'
        : 'SELECT count(*) all_count,coalesce(sum(CASE WHEN ?=1 OR archived=0 THEN 1 ELSE 0 END),0) visible_count,coalesce(sum(CASE WHEN favourite=1 AND (?=1 OR archived=0) THEN 1 ELSE 0 END),0) favourites,coalesce(sum(archived),0) archived FROM teams WHERE owner_id=?',
      Number(p.include_archived === true),
      Number(p.include_archived === true),
      this.owner,
    ).first<Row>();
    const contexts = await this.stmt(
      "SELECT format,json_extract(metadata,'$.format_context') context FROM teams WHERE owner_id=? AND json_type(metadata,'$.format_context')='object' GROUP BY format",
      this.owner,
    ).all<Row>();
    const tags = await this.stmt(
      'SELECT display_name FROM tags WHERE owner_id=? ORDER BY normalized_name',
      this.owner,
    ).all<Row>();
    const unique = (k: string) =>
      [
        ...new Set(
          dimensions.results
            .filter((r) => r.kind === k)
            .map((r) =>
              k === 'format' ? canonicalFormat(r.value) : String(r.value),
            ),
        ),
      ].sort((a, b) => a.localeCompare(b));
    return {
      formats: unique('format'),
      sources: unique('source'),
      years: unique('year'),
      format_contexts: Object.fromEntries(
        contexts.results.map((r) => [r.format, JSON.parse(r.context)]),
      ),
      tags: tags.results.map((t) => t.display_name),
      all: counts?.visible_count || 0,
      favourites: counts?.favourites || 0,
      archived: counts?.archived || 0,
    };
  }
  async delete(id: string) {
    const result = await this.stmt(
      'DELETE FROM teams WHERE id=? AND owner_id=?',
      id,
      this.owner,
    ).run();
    if (!result.meta.changes) throw Error('Team not found.');
    return { deleted: true };
  }
  variant(action: string, payload: unknown) {
    return new DemoVariants(this.db, this.owner, this).run(action, payload);
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
  const publicVersion = JSON.parse(r.snapshot);
  delete publicVersion.set_editing;
  return {
    ...JSON.parse(r.metadata),
    id: r.id,
    variant_name: r.variant_name || 'Main',
    variant_description: r.variant_description || '',
    current_version_id: r.current_version_id,
    version: publicVersion,
  };
}
