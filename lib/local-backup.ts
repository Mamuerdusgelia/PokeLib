import type { LocalLibrary } from './local-library';
import { indexed } from './local-library';
import { cleanMeta, type TeamRecord } from './domain';
import { familyKey } from './variants';
import {
  prepareRestoreChunk,
  restoreProgress,
  restoreState,
  type RestoreState,
  type BackupPayload,
} from './backup';
import type { BackupManifest } from './backup-format';
import type { CollectionRecord } from './collections';

/** Implements the existing v1 streaming backup contract for the active browser namespace. */
export class LocalBackup {
  constructor(private library: LocalLibrary) {}
  private async teams(ids?: string[]) {
    const rows = (await this.library.db.indexes(this.library.namespace)).filter(
      (r) => !r.deletedAt && (!ids || ids.includes(r.team.id)),
    );
    const teams: TeamRecord[] = [];
    for (const r of rows) teams.push(await this.library.full(r.team.id));
    return teams;
  }
  async run(action: string, input: unknown = {}): Promise<unknown> {
    const p = input as BackupPayload & { ids?: string[] };
    const l = this.library,
      db = l.db,
      ns = l.namespace;
    if (action === 'backup_info') {
      // Populate cached Cloud payloads before freezing a generation. Export needs their complete data.
      const teams = await this.teams(p.ids);
      const collections =
        (await db.value<CollectionRecord[]>(ns, 'collections')) || [];
      const tags = [
        ...new Set([
          ...teams.flatMap((t) => t.tags),
          ...((await db.value<string[]>(ns, 'tags')) || []),
        ]),
      ];
      return {
        generation: (await db.value<number>(ns, 'generation')) || 0,
        counts: {
          families: new Set(teams.map(familyKey)).size,
          variants: teams.length,
          revisions: teams.reduce(
            (n, t) => n + (t.history || [t.version]).length,
            0,
          ),
          tags: tags.length,
          collections: p.ids ? 0 : collections.length,
        },
      };
    }
    if (action === 'backup_check' || action === 'backup_page') {
      if (((await db.value<number>(ns, 'generation')) || 0) !== p.generation)
        throw Error('Your library changed while exporting. Try again.');
      if (action === 'backup_check') return { ok: true };
      const teams = await this.teams(p.ids);
      if (p.section === 'tags')
        return [
          ...new Set([
            ...teams.flatMap((t) => t.tags),
            ...((await db.value<string[]>(ns, 'tags')) || []),
          ]),
        ]
          .sort()
          .map((display_name, i) => ({
            id: String(i + 1).padStart(8, '0'),
            display_name,
          }))
          .filter((r) => r.id > p.after)
          .slice(0, 40);
      if (p.section === 'collections')
        return p.ids
          ? []
          : ((await db.value<CollectionRecord[]>(ns, 'collections')) || [])
              .filter((c) => c.id > p.after)
              .sort((a, b) => a.id.localeCompare(b.id))
              .slice(0, 20);
      const records: Record<string, unknown>[] = [];
      for (const t of teams.sort(
        (a, b) =>
          familyKey(a).localeCompare(familyKey(b)) || a.id.localeCompare(b.id),
      )) {
        const history = [...(t.history || [t.version])].sort(
          (a, b) => a.version_number - b.version_number,
        );
        for (let i = 0; i < history.length; i++) {
          const snapshot = { ...history[i], version_number: i + 1 };
          if (
            familyKey(t) < p.cursor.family ||
            (familyKey(t) === p.cursor.family &&
              (t.id < p.cursor.team ||
                (t.id === p.cursor.team && i + 1 <= p.cursor.version)))
          )
            continue;
          records.push({
            id: t.id,
            family_key: familyKey(t),
            title: t.title,
            metadata: cleanMeta(t),
            snapshot,
            variant_count: teams.filter((s) => familyKey(s) === familyKey(t))
              .length,
            revision_count: history.length,
            current_number:
              history.findIndex((v) => v.id === t.current_version_id) + 1,
            parent_number: snapshot.parent_version_id
              ? history.findIndex((v) => v.id === snapshot.parent_version_id) +
                  1 || null
              : null,
            tag_names: t.tags,
            variant_name: t.variant_name || 'Main',
            variant_description: t.variant_description || '',
            favourite: t.favourite,
            archived: t.archived,
            created_at: t.created_at,
            updated_at: t.updated_at,
            imported_at: t.imported_at,
            family_created_at: t.created_at,
            family_updated_at: t.updated_at,
          });
          if (records.length === 40) return records;
        }
      }
      return records;
    }
    if (action === 'backup_begin') {
      return l.lock(async () => {
        const previous = await db.value<RestoreState>(ns, 'restore/' + p.id);
        if (previous) {
          if (previous.manifest.digest !== p.manifest.digest)
            throw Error('Choose the same backup to resume.');
          return restoreProgress(previous);
        }
        const state = restoreState(p.id, p.manifest as BackupManifest);
        state.generation = (await db.value<number>(ns, 'generation')) || 0;
        await db.commit(ns, [], [], { ['restore/' + p.id]: state });
        return restoreProgress(state);
      });
    }
    if (action === 'backup_status') {
      const state = await db.value<RestoreState>(ns, 'restore/' + p.id);
      if (!state) throw Error('Restore not found.');
      return restoreProgress(state);
    }
    if (action === 'backup_restore')
      return l.lock(async () => {
        const state = await db.value<RestoreState>(ns, 'restore/' + p.id);
        if (!state) throw Error('Validate the backup first.');
        const prepared = await prepareRestoreChunk(state, p.index, p.text);
        if (prepared.replay) return restoreProgress(state);
        if (
          ((await db.value<number>(ns, 'generation')) || 0) !== state.generation
        )
          throw Error(
            'Your library changed during restore. Start a new restore or finish editing before retrying.',
          );
        const updated = new Map<string, TeamRecord>();
        const tags = (await db.value<string[]>(ns, 'tags')) || [];
        const collections =
          (await db.value<CollectionRecord[]>(ns, 'collections')) || [];
        for (const entry of prepared.records) {
          const r = entry.record;
          if (r.type === 'tag') tags.push(r.name);
          if (r.type === 'collection')
            collections.push({
              id: entry.id,
              name: collections.some((c) => c.name === r.name)
                ? r.name + ' (restored ' + entry.id.slice(0, 6) + ')'
                : r.name,
              description: r.description,
              definition: entry.definition!,
              created_at: r.created_at,
              updated_at: r.updated_at,
              has_share: false,
            });
          if (r.type === 'variant')
            updated.set(entry.teamId!, {
              ...r.meta,
              id: entry.teamId!,
              family_id: entry.familyId!,
              variant_name: r.name,
              variant_description: r.description,
              current_version_id: entry.snapshot!.id,
              version: entry.snapshot!,
              history: [entry.snapshot!],
              storage: 'local',
              favourite: r.favourite,
              archived: r.archived,
              created_at: r.created_at,
              updated_at: r.updated_at,
              imported_at: r.imported_at,
            });
          if (r.type === 'revision') {
            const t =
              updated.get(entry.teamId!) ||
              (await db.get(ns, entry.teamId!))?.payload;
            if (!t) throw Error('Missing restored variant.');
            t.history = [...(t.history || []), entry.snapshot!];
            t.version = entry.snapshot!;
            t.current_version_id = entry.snapshot!.id;
            updated.set(t.id, t);
          }
        }
        prepared.state.generation = state.generation + 1;
        await l.commit(
          [...updated.values()].map((t) => indexed(t)),
          [],
          {
            tags: [...new Set(tags)],
            collections,
            ['restore/' + p.id]: prepared.state,
          },
        );
        return restoreProgress(prepared.state);
      });
    throw Error('Unknown backup action.');
  }
}
