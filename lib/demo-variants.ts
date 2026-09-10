import type { D1Database } from '@cloudflare/workers-types';
import type { DemoStore } from './demo-store';
import { cleanMeta, snapshotRevision, words } from './domain';
import { indexTerms } from './search';
import {
  cloneSnapshot,
  familyKey,
  familySelection,
  variantDetails,
} from './variants';
import { requestHash, validateChunk, type ChunkKey } from './import-workflow';
import { variantPayload } from './variants';
import { ServerTiming } from './server-timing';

export class DemoVariants {
  constructor(
    private db: D1Database,
    private owner: string,
    private store: DemoStore,
    private timing = new ServerTiming(),
  ) {}
  private stmt(sql: string, ...args: (string | number | null)[]) {
    return this.db.prepare(sql).bind(...args);
  }
  async run(action: string, input: unknown) {
    const p = variantPayload(input);
    if (action === 'family_expand' || action === 'family_bulk_delete') {
      familySelection(p.ids, action === 'family_bulk_delete' ? 5 : 10000);
      const ids = JSON.stringify(p.ids);
      if (action === 'family_expand') {
        const count = await this.stmt(
          'SELECT count(DISTINCT coalesce(family_id,id)) n FROM teams WHERE owner_id=? AND coalesce(family_id,id) IN (SELECT value FROM json_each(?))',
          this.owner,
          ids,
        ).first<{ n: number }>();
        if (count?.n !== p.ids.length)
          throw Error(
            'A selected family is missing or belongs to another account.',
          );
        const rows = await this.stmt(
          'SELECT id FROM teams WHERE owner_id=? AND coalesce(family_id,id) IN (SELECT value FROM json_each(?)) ORDER BY id LIMIT 10001',
          this.owner,
          ids,
        ).all<{ id: string }>();
        if (rows.results.length > 10000)
          throw Error('Narrow your selection to at most 10,000 variants.');
        return { ids: rows.results.map((r) => r.id), families: count.n };
      }
      validateChunk(p.chunk);
      if (!p.chunk) throw Error('A deletion operation is required.');
      const digest = await requestHash(p.ids);
      const previous = await this.receipt(p.chunk, action, digest);
      if (previous) return previous;
      const result = { count: p.ids.length };
      try {
        await this.db.batch([
          this.stmt(
            'INSERT INTO operation_chunks(owner_id,operation_id,chunk_index,kind,request_hash,result,created_at) SELECT ?,?,?,?,?,CASE WHEN (SELECT count(DISTINCT coalesce(family_id,id)) FROM teams WHERE owner_id=? AND coalesce(family_id,id) IN (SELECT value FROM json_each(?)))=? THEN ? ELSE NULL END,?',
            this.owner,
            p.chunk.operation_id,
            p.chunk.chunk_index,
            action,
            digest,
            this.owner,
            ids,
            p.ids.length,
            JSON.stringify(result),
            new Date().toISOString(),
          ),
          this.stmt(
            'DELETE FROM team_families WHERE owner_id=? AND id IN (SELECT value FROM json_each(?))',
            this.owner,
            ids,
          ),
          this.stmt(
            'DELETE FROM teams WHERE owner_id=? AND family_id IS NULL AND id IN (SELECT value FROM json_each(?))',
            this.owner,
            ids,
          ),
        ]);
      } catch (e) {
        const previous = await this.receipt(p.chunk, action, digest);
        if (previous) return previous;
        if (/NOT NULL/.test((e as Error).message))
          throw Error(
            'A selected family is missing or belongs to another account.',
          );
        throw e;
      }
      return result;
    }
    const t = await this.store.get(p.id);
    if (action === 'variant_delete') {
      if ((t.variant_count || 1) < 2)
        throw Error('Use Delete team family to delete the final variant.');
      return this.store.delete(t.id);
    }
    if (action === 'variant_rename') {
      const d = variantDetails(p);
      await this.stmt(
        'UPDATE teams SET variant_name=?,variant_key=?,variant_description=?,metadata=CASE WHEN updated_at=? THEN metadata ELSE NULL END,updated_at=? WHERE id=? AND owner_id=?',
        d.name,
        d.key,
        d.description,
        p.expected_updated_at,
        new Date(
          Math.max(Date.now(), Date.parse(t.updated_at) + 1),
        ).toISOString(),
        t.id,
        this.owner,
      ).run();
      return this.store.get(t.id);
    }
    if (action === 'family_rename') {
      const title = cleanMeta({ ...t, title: p.title }).title;
      if (t.updated_at !== p.expected_updated_at)
        throw Error('This family changed. Reload before renaming.');
      if (!t.family_id)
        return this.store.patch(t.id, {
          title,
          expected_updated_at: p.expected_updated_at,
        });
      const now = new Date(
        Math.max(Date.now(), Date.parse(t.updated_at) + 1),
      ).toISOString();
      await this.db.batch([
        this.stmt(
          'UPDATE team_families SET title=CASE WHEN EXISTS(SELECT 1 FROM teams WHERE id=? AND owner_id=? AND updated_at=?) THEN ? ELSE NULL END,updated_at=? WHERE id=? AND owner_id=?',
          t.id,
          this.owner,
          p.expected_updated_at,
          title,
          now,
          t.family_id,
          this.owner,
        ),
        this.stmt(
          "UPDATE teams SET title=?,metadata=json_set(metadata,'$.title',?),updated_at=CASE WHEN updated_at>=? THEN strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0.001 seconds') ELSE ? END WHERE family_id=? AND owner_id=?",
          title,
          title,
          now,
          now,
          t.family_id,
          this.owner,
        ),
        this.stmt(
          "DELETE FROM search_terms WHERE version_id='' AND field='team' AND team_id IN (SELECT id FROM teams WHERE family_id=? AND owner_id=?)",
          t.family_id,
          this.owner,
        ),
        this.stmt(
          "INSERT OR IGNORE INTO search_terms(team_id,version_id,slot,field,value) SELECT t.id,'',-1,'team',j.value FROM teams t CROSS JOIN json_each(?) j WHERE t.family_id=? AND t.owner_id=?",
          JSON.stringify(words(title)),
          t.family_id,
          this.owner,
        ),
      ]);
      return this.store.get(t.id);
    }
    if (action !== 'variant_create') throw Error('Unknown variant action.');
    const d = variantDetails(p),
      key = { operation_id: p.operation_id, chunk_index: 0 };
    validateChunk(key);
    const digest = await requestHash(p),
      previous = await this.receipt(key, action, digest);
    if (previous) return this.store.get(previous.id);
    if (
      t.current_version_id !== p.expected ||
      snapshotRevision(t.version) !== p.expected_revision ||
      t.updated_at !== p.expected_updated_at
    )
      throw Error(
        'This team changed in another window. Reload before creating a variant.',
      );
    const source = t.history!.find((v) => v.id === p.version_id);
    if (!source) throw Error('Version not found.');
    const id = crypto.randomUUID(),
      v = cloneSnapshot(source, id),
      m = cleanMeta(t),
      fid = familyKey(t);
    const tags = m.tags.map((name) => ({
      id: crypto.randomUUID(),
      name,
      normalized: name.toLowerCase(),
    }));
    const statements = [
      this.stmt(
        "INSERT INTO operation_chunks(owner_id,operation_id,chunk_index,kind,request_hash,result,created_at) SELECT ?,?,0,?,?,CASE WHEN EXISTS(SELECT 1 FROM teams t JOIN team_versions v ON v.id=t.current_version_id AND v.team_id=t.id WHERE t.id=? AND t.owner_id=? AND t.current_version_id=? AND t.updated_at=? AND coalesce(json_extract(v.snapshot,'$.edit_revision'),v.id)=?) THEN ? ELSE NULL END,?",
        this.owner,
        key.operation_id,
        action,
        digest,
        t.id,
        this.owner,
        p.expected,
        p.expected_updated_at,
        p.expected_revision,
        JSON.stringify({ id }),
        v.created_at,
      ),
      this.stmt(
        'INSERT OR IGNORE INTO team_families(id,owner_id,title,created_at,updated_at) VALUES(?,?,?,?,?)',
        fid,
        this.owner,
        m.title,
        t.created_at,
        v.created_at,
      ),
      this.stmt(
        'UPDATE teams SET family_id=? WHERE id=? AND owner_id=? AND family_id IS NULL',
        fid,
        t.id,
        this.owner,
      ),
      this.stmt(
        'INSERT INTO teams(id,owner_id,family_id,variant_name,variant_key,variant_description,title,format,team_date,source_name,metadata,current_version_id,created_at,updated_at,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id,
        this.owner,
        fid,
        d.name,
        d.key,
        d.description,
        m.title,
        m.format,
        m.team_date,
        m.source_name,
        JSON.stringify(m),
        v.id,
        v.created_at,
        v.created_at,
        t.imported_at,
      ),
      this.stmt(
        'INSERT INTO team_versions(id,team_id,version_number,snapshot,created_at) VALUES(?,?,1,?,?)',
        v.id,
        id,
        JSON.stringify(v),
        v.created_at,
      ),
      this.stmt(
        "INSERT OR IGNORE INTO search_terms(team_id,version_id,slot,field,value) SELECT ?,json_extract(value,'$.version_id'),json_extract(value,'$.slot'),json_extract(value,'$.field'),json_extract(value,'$.value') FROM json_each(?)",
        id,
        JSON.stringify(indexTerms(m, v)),
      ),
      this.stmt(
        "INSERT OR IGNORE INTO tags(id,owner_id,display_name,normalized_name) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.name'),json_extract(value,'$.normalized') FROM json_each(?)",
        this.owner,
        JSON.stringify(tags),
      ),
      this.stmt(
        "INSERT INTO team_tags(team_id,tag_id) SELECT ?,t.id FROM tags t JOIN json_each(?) j ON t.normalized_name=json_extract(j.value,'$.normalized') WHERE t.owner_id=?",
        id,
        JSON.stringify(tags),
        this.owner,
      ),
    ];
    try {
      this.timing.mark('prepared');
      await this.timing.measure('mutation', () => this.db.batch(statements));
      this.timing.mark('mutation_end');
    } catch (e) {
      const previous = await this.receipt(key, action, digest);
      if (previous) return this.store.get(previous.id);
      if (
        /UNIQUE constraint failed: teams.family_id/.test((e as Error).message)
      )
        throw Error('A variant with that name already exists.');
      if (/NOT NULL/.test((e as Error).message))
        throw Error('This team changed. Reload before creating a variant.');
      throw e;
    }
    return this.timing.measure('readback', () => this.store.get(id));
  }
  private async receipt(key: ChunkKey, kind: string, digest: string) {
    const row = await this.stmt(
      'SELECT kind,request_hash,result FROM operation_chunks WHERE owner_id=? AND operation_id=? AND chunk_index=?',
      this.owner,
      key.operation_id,
      key.chunk_index,
    ).first<{ kind: string; request_hash: string; result: string }>();
    if (!row) return null;
    if (row.kind !== kind || row.request_hash !== digest)
      throw Error('This retry differs from the original operation.');
    return JSON.parse(row.result);
  }
}
