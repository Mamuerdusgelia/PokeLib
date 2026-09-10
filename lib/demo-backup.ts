import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import { checkCounts, object, type BackupManifest } from './backup-format';
import {
  operationId,
  prepareRestoreChunk,
  restoreState,
  type RestoreState,
  type BackupPayload,
} from './backup';

type Row = Record<string, unknown>;
const changed =
  'Your library changed while the backup was being prepared. Try exporting again when editing has finished.';
export class DemoBackup {
  constructor(
    private db: D1Database,
    private owner: string,
  ) {}
  private stmt(sql: string, ...args: unknown[]) {
    return this.db.prepare(sql).bind(...args);
  }
  private generation() {
    return this.stmt(
      'SELECT coalesce((SELECT generation FROM backup_generations WHERE owner_id=?),0) generation',
      this.owner,
    );
  }
  private async state(id: string) {
    const row = await this.stmt(
      'SELECT state FROM backup_restores WHERE id=? AND owner_id=?',
      operationId(id),
      this.owner,
    ).first<{ state: string }>();
    if (!row) throw Error('Restore operation not found for this account.');
    return JSON.parse(row.state) as RestoreState;
  }
  async run(action: string, input: unknown = {}) {
    object(input);
    const p = input as BackupPayload;
    if (action === 'backup_info') {
      const r = await this.db.batch<Row>([
        this.generation(),
        this.stmt(
          `SELECT (SELECT count(distinct coalesce(family_id,id)) FROM teams WHERE owner_id=?) families,
          (SELECT count(*) FROM teams WHERE owner_id=?) variants,
          (SELECT count(*) FROM team_versions v JOIN teams t ON t.id=v.team_id WHERE t.owner_id=?) revisions,
          (SELECT count(*) FROM tags WHERE owner_id=?) tags,
          (SELECT count(*) FROM collections WHERE owner_id=?) collections`,
          ...Array(5).fill(this.owner),
        ),
      ]);
      return {
        generation: r[0].results[0].generation,
        counts: checkCounts(r[1].results[0]),
      };
    }
    if (action === 'backup_check') {
      if ((await this.generation().first<Row>())!.generation !== p.generation)
        throw Error(changed);
      return { ok: true };
    }
    if (action === 'backup_page') {
      let query: D1PreparedStatement;
      if (p.section === 'tags' || p.section === 'collections') {
        if (typeof p.after !== 'string' || p.after.length > 36)
          throw Error('Invalid backup cursor.');
        query = this.stmt(
          p.section === 'tags'
            ? 'SELECT id,display_name FROM tags WHERE owner_id=? AND id>? ORDER BY id LIMIT 40'
            : 'SELECT id,name,description,definition,created_at,updated_at FROM collections WHERE owner_id=? AND id>? ORDER BY id LIMIT 20',
          this.owner,
          p.after,
        );
      } else if (p.section === 'revisions') {
        const c = p.cursor;
        if (
          !c ||
          typeof c.family !== 'string' ||
          typeof c.team !== 'string' ||
          c.family.length > 36 ||
          c.team.length > 36 ||
          !Number.isInteger(c.version) ||
          c.version < 0
        )
          throw Error('Invalid backup cursor.');
        query = this.stmt(
          `WITH candidates AS (
          SELECT t.id,coalesce(t.family_id,t.id) family_key,v.id version_id,v.version_number,length(CAST(v.snapshot AS BLOB))+length(CAST(t.metadata AS BLOB))+2000 bytes
          FROM teams t JOIN team_versions v ON v.team_id=t.id
          WHERE t.owner_id=? AND (coalesce(t.family_id,t.id),t.id,v.version_number)>(?,?,?)
          ORDER BY coalesce(t.family_id,t.id),t.id,v.version_number LIMIT 40
        ), bounded AS (SELECT *,sum(bytes) OVER(ORDER BY family_key,id,version_number) size,row_number() OVER(ORDER BY family_key,id,version_number) rn FROM candidates)
        SELECT t.id,t.title,t.metadata,t.variant_name,t.variant_description,t.favourite,t.archived,t.created_at,t.updated_at,t.imported_at,b.family_key,
          coalesce(f.created_at,t.created_at) family_created_at,coalesce(f.updated_at,t.updated_at) family_updated_at,
          (SELECT count(*) FROM teams s WHERE s.owner_id=t.owner_id AND coalesce(s.family_id,s.id)=b.family_key) variant_count,
          (SELECT count(*) FROM team_versions h WHERE h.team_id=t.id) revision_count,
          current.version_number current_number,v.snapshot,parent.version_number parent_number,
          (SELECT coalesce(json_group_array(tg.display_name),'[]') FROM team_tags tt JOIN tags tg ON tg.id=tt.tag_id AND tg.owner_id=t.owner_id WHERE tt.team_id=t.id) tag_names
        FROM bounded b JOIN teams t ON t.id=b.id JOIN team_versions v ON v.id=b.version_id
          JOIN team_versions current ON current.id=t.current_version_id AND current.team_id=t.id
          LEFT JOIN team_families f ON f.id=t.family_id AND f.owner_id=t.owner_id
          LEFT JOIN team_versions parent ON parent.id=json_extract(v.snapshot,'$.parent_version_id') AND parent.team_id=t.id
        WHERE b.size<=524288 OR b.rn=1 ORDER BY b.family_key,b.id,b.version_number`,
          this.owner,
          c.family,
          c.team,
          c.version,
        );
      } else throw Error('Invalid backup section.');
      const result = await this.db.batch<Row>([this.generation(), query]);
      if (result[0].results[0].generation !== p.generation)
        throw Error(changed);
      return result[1].results.map((row: Row) => ({
        ...row,
        ...(typeof row.metadata === 'string' && typeof row.snapshot === 'string'
          ? {
              metadata: JSON.parse(row.metadata),
              snapshot: JSON.parse(row.snapshot),
              tag_names: JSON.parse(String(row.tag_names)),
            }
          : {}),
        ...(typeof row.definition === 'string'
          ? { definition: JSON.parse(row.definition) }
          : {}),
      }));
    }
    if (action === 'backup_begin') {
      const incoming = restoreState(p.id, p.manifest as BackupManifest);
      await this.db.batch([
        this.stmt(
          "INSERT OR IGNORE INTO backup_restores(id,owner_id,state,created_at) VALUES(?,?,json_set(?,'$.generation',coalesce((SELECT generation FROM backup_generations WHERE owner_id=?),0)),?)",
          incoming.id,
          this.owner,
          JSON.stringify(incoming),
          this.owner,
          new Date().toISOString(),
        ),
        this.stmt(
          'INSERT OR IGNORE INTO profiles(id,created_at) VALUES(?,?)',
          this.owner,
          new Date().toISOString(),
        ),
      ]);
      const state = await this.state(incoming.id);
      if (state.manifest.digest !== incoming.manifest.digest)
        throw Error('Choose the same backup to resume this restore.');
      return state;
    }
    if (action === 'backup_status') return this.state(p.id);
    if (action !== 'backup_restore') throw Error('Unknown backup action.');
    const state = await this.state(p.id),
      prepared = await prepareRestoreChunk(state, p.index, p.text);
    if (prepared.replay) return state;
    const ss: D1PreparedStatement[] = [
      this.stmt(
        'UPDATE backup_restores SET state=CASE WHEN coalesce((SELECT generation FROM backup_generations WHERE owner_id=?),0)=? THEN state ELSE NULL END WHERE id=? AND owner_id=?',
        this.owner,
        state.generation,
        state.id,
        this.owner,
      ),
    ];
    let context = state.context;
    for (const entry of prepared.records) {
      const r = entry.record;
      if (r.type === 'tag')
        ss.push(
          this.stmt(
            'INSERT OR IGNORE INTO tags(id,owner_id,display_name,normalized_name) VALUES(?,?,?,?)',
            entry.id,
            this.owner,
            r.name,
            r.name.toLowerCase(),
          ),
        );
      else if (r.type === 'family')
        ss.push(
          this.stmt(
            'INSERT INTO team_families(id,owner_id,title,created_at,updated_at) VALUES(?,?,?,?,?)',
            entry.id,
            this.owner,
            r.title,
            r.created_at,
            r.updated_at,
          ),
        );
      else if (r.type === 'collection') {
        const suffix = ' (restored ' + state.id.slice(0, 8) + '-' + r.id + ')';
        const name = (await this.stmt(
          'SELECT id FROM collections WHERE owner_id=? AND name_key=?',
          this.owner,
          r.name.toLowerCase(),
        ).first())
          ? r.name.slice(0, 120 - suffix.length) + suffix
          : r.name;
        ss.push(
          this.stmt(
            'INSERT INTO collections(id,owner_id,name,name_key,description,definition,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
            entry.id,
            this.owner,
            name,
            name.toLowerCase(),
            r.description,
            JSON.stringify(entry.definition),
            r.created_at,
            r.updated_at,
          ),
        );
      } else {
        const s = entry.snapshot!;
        if (r.type === 'variant') {
          context = r;
          ss.push(
            this.stmt(
              'INSERT INTO teams(id,owner_id,family_id,variant_name,variant_key,variant_description,title,format,team_date,source_name,metadata,current_version_id,favourite,archived,created_at,updated_at,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
              entry.teamId,
              this.owner,
              entry.familyId,
              r.name,
              r.name.toLowerCase(),
              r.description,
              r.meta.title,
              r.meta.format,
              r.meta.team_date,
              r.meta.source_name,
              JSON.stringify(r.meta),
              s.id,
              +r.favourite,
              +r.archived,
              r.created_at,
              r.updated_at,
              r.imported_at,
            ),
          );
          ss.push(
            this.stmt(
              `INSERT INTO team_tags(team_id,tag_id) SELECT ?,t.id FROM tags t JOIN json_each(?) j ON t.normalized_name=j.value WHERE t.owner_id=?`,
              entry.teamId,
              JSON.stringify(r.meta.tags.map((tag) => tag.toLowerCase())),
              this.owner,
            ),
          );
        } else {
          ss.push(
            this.stmt(
              `UPDATE backup_restores SET state=CASE WHEN EXISTS(
            SELECT 1 FROM teams t JOIN team_versions v ON v.id=t.current_version_id AND v.team_id=t.id
            WHERE t.id=? AND t.owner_id=? AND t.current_version_id=? AND coalesce(json_extract(v.snapshot,'$.edit_revision'),v.id)=? AND t.updated_at=?
          ) THEN state ELSE NULL END WHERE id=? AND owner_id=?`,
              entry.teamId,
              this.owner,
              entry.expected,
              entry.expected,
              context!.updated_at,
              state.id,
              this.owner,
            ),
          );
        }
        ss.push(
          this.stmt(
            'INSERT INTO team_versions(id,team_id,version_number,snapshot,created_at) VALUES(?,?,?,?,?)',
            s.id,
            s.team_id,
            s.version_number,
            JSON.stringify(s),
            s.created_at,
          ),
        );
        if (r.type === 'revision')
          ss.push(
            this.stmt(
              'UPDATE teams SET current_version_id=? WHERE id=? AND owner_id=?',
              s.id,
              s.team_id,
              this.owner,
            ),
          );
        // Keep historical comment words, replace current notes and set terms. No history scan.
        ss.push(
          this.stmt(
            "DELETE FROM search_terms WHERE team_id=? AND (version_id<>'' OR field<>'text')",
            s.team_id,
          ),
        );
        ss.push(
          this.stmt(
            "INSERT OR IGNORE INTO search_terms(team_id,version_id,slot,field,value) SELECT ?,json_extract(value,'$.version_id'),json_extract(value,'$.slot'),json_extract(value,'$.field'),json_extract(value,'$.value') FROM json_each(?)",
            s.team_id,
            JSON.stringify(entry.terms),
          ),
        );
      }
    }
    ss.push(
      this.stmt(
        'INSERT OR IGNORE INTO profiles(id,created_at) VALUES(?,?)',
        this.owner,
        new Date().toISOString(),
      ),
    );
    ss.push(
      this.stmt(
        'INSERT INTO operation_chunks(owner_id,operation_id,chunk_index,kind,request_hash,result,created_at) VALUES(?,?,?,?,?,?,?)',
        this.owner,
        state.id,
        p.index,
        'backup_restore',
        state.manifest.hashes[p.index],
        JSON.stringify(prepared.state.counts),
        new Date().toISOString(),
      ),
    );
    ss.push(
      this.stmt(
        "UPDATE backup_restores SET state=json_set(?,'$.generation',coalesce((SELECT generation FROM backup_generations WHERE owner_id=?),0)) WHERE id=? AND owner_id=? AND json_extract(state,'$.next_chunk')=?",
        JSON.stringify(prepared.state),
        this.owner,
        state.id,
        this.owner,
        p.index,
      ),
    );
    ss.push(this.generation());
    try {
      const result = await this.db.batch<Row>(ss);
      prepared.state.generation = Number(
        result[result.length - 1].results[0].generation,
      );
    } catch (e) {
      const latest = await this.state(state.id);
      if (latest.next_chunk > p.index) return latest;
      if (/NOT NULL constraint failed: backup_restores.state/.test(String(e)))
        throw Error(
          'Library data was edited in another window. Restore stopped without overwriting that edit. Earlier chunks remain saved.',
        );
      throw e;
    }
    return prepared.state;
  }
}
