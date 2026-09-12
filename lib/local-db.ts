import type { TeamRecord } from './domain';
import type { IndexedTerm } from './search';

export type LibraryIndex = {
  team: TeamRecord;
  terms: IndexedTerm[];
  revision: number;
  dirty?: boolean;
  conflict?: string;
  error?: string;
  deletedAt?: number;
  pendingAction?: 'delete' | 'disable' | 'restore';
};
export type StoredTeam = LibraryIndex & { payload?: TeamRecord };
export interface LocalDatabase {
  indexes(namespace: string): Promise<LibraryIndex[]>;
  get(namespace: string, id: string): Promise<StoredTeam | undefined>;
  value<T>(namespace: string, key: string): Promise<T | undefined>;
  commit(
    namespace: string,
    teams: StoredTeam[],
    remove?: string[],
    values?: Record<string, unknown>,
  ): Promise<void>;
}

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
let opened: Promise<IDBDatabase> | undefined;
function database() {
  return (opened ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('pokelib-library', 1);
    r.onupgradeneeded = () => {
      for (const name of ['indexes', 'teams', 'values']) {
        const store = r.result.createObjectStore(name, {
          keyPath: ['namespace', 'id'],
        });
        store.createIndex('namespace', 'namespace');
      }
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => {
        r.result.close();
        opened = undefined;
      };
      resolve(r.result);
    };
    r.onerror = () => {
      opened = undefined;
      reject(
        Error(
          'Browser storage is unavailable. Allow site storage to save your teams.',
        ),
      );
    };
    r.onblocked = () =>
      reject(Error('Close other PokéLib tabs to update browser storage.'));
  }));
}

/** Payloads and lightweight indexes commit together. Success means the IDB transaction completed. */
export class BrowserDatabase implements LocalDatabase {
  async indexes(namespace: string) {
    const db = await database();
    const rows = await request(
      db
        .transaction('indexes')
        .objectStore('indexes')
        .index('namespace')
        .getAll(namespace),
    );
    return rows.map((r) => r.value as LibraryIndex);
  }
  async get(namespace: string, id: string) {
    const db = await database();
    return (
      await request(
        db.transaction('teams').objectStore('teams').get([namespace, id]),
      )
    )?.value as StoredTeam | undefined;
  }
  async value<T>(namespace: string, key: string): Promise<T | undefined> {
    const db = await database();
    return (
      await request(
        db.transaction('values').objectStore('values').get([namespace, key]),
      )
    )?.value;
  }
  async commit(
    namespace: string,
    teams: StoredTeam[],
    remove: string[] = [],
    values: Record<string, unknown> = {},
  ) {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['indexes', 'teams', 'values'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          tx.error ||
            Error('Browser save failed. Your changes were not saved.'),
        );
      tx.onerror = () => {}; // onabort carries the final transaction result (including quota errors).
      for (const row of teams) {
        const { payload: _payload, ...index } = row;
        tx.objectStore('teams').put({ namespace, id: row.team.id, value: row });
        tx.objectStore('indexes').put({
          namespace,
          id: row.team.id,
          value: index,
        });
      }
      for (const id of remove) {
        tx.objectStore('teams').delete([namespace, id]);
        tx.objectStore('indexes').delete([namespace, id]);
      }
      for (const [id, value] of Object.entries(values))
        tx.objectStore('values').put({ namespace, id, value });
    });
  }
}

/** Also used by deterministic integration tests; it has the same clone boundary as IndexedDB. */
export class MemoryDatabase implements LocalDatabase {
  private rows = new Map<string, StoredTeam>();
  private values = new Map<string, unknown>();
  async indexes(ns: string) {
    return structuredClone(
      [...this.rows.entries()]
        .filter(([k]) => k.startsWith(ns + ':'))
        .map(([, { payload: _, ...r }]) => r),
    );
  }
  async get(ns: string, id: string) {
    return structuredClone(this.rows.get(ns + ':' + id));
  }
  async value<T>(ns: string, key: string) {
    return structuredClone(this.values.get(ns + ':' + key)) as T | undefined;
  }
  async commit(
    ns: string,
    rows: StoredTeam[],
    remove: string[] = [],
    values: Record<string, unknown> = {},
  ) {
    rows.forEach((r) =>
      this.rows.set(ns + ':' + r.team.id, structuredClone(r)),
    );
    remove.forEach((id) => this.rows.delete(ns + ':' + id));
    Object.entries(values).forEach(([k, v]) =>
      this.values.set(ns + ':' + k, structuredClone(v)),
    );
  }
}
