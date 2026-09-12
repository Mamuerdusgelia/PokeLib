'use client';
import {
  recordBuilderRequest,
  saveProfilingEnabled,
  saveRequestTrace,
} from './builder-performance';
import {
  createClient,
  type SupabaseClient,
  type Session,
} from '@supabase/supabase-js';
import { BrowserDatabase } from './local-db';
import { LocalLibrary, type Account, type CloudResult } from './local-library';
import { LocalBackup } from './local-backup';
import { validateBackup } from './backup-format';
let client: SupabaseClient | undefined;
let library: LocalLibrary | undefined;
const localDb = new BrowserDatabase();
let channel: BroadcastChannel | undefined;
export function currentAccount() {
  return library?.account || null;
}
export function localLibrary() {
  if (!library) configureLibrary(null);
  return library!;
}
export function configureLibrary(account: Account | null) {
  if (library && library.active && library.account?.id === account?.id) {
    if (library.account && account) library.account.name = account.name;
    return library;
  }
  if (library) library.active = false;
  library = new LocalLibrary(
    localDb,
    account,
    (action, payload) => cloudApi(action, payload, account?.id || null),
    () => {
      if (typeof window !== 'undefined')
        window.dispatchEvent(new Event('pokelib-change'));
      channel?.postMessage('changed');
    },
  );
  if (
    typeof window !== 'undefined' &&
    !channel &&
    typeof BroadcastChannel !== 'undefined'
  ) {
    channel = new BroadcastChannel('pokelib-library');
    channel.onmessage = () => window.dispatchEvent(new Event('pokelib-change'));
  }
  return library;
}
export async function accountApi(
  action: string,
  payload: Record<string, unknown> = {},
) {
  const session = client ? (await client.auth.getSession()).data.session : null;
  const r = await fetch('/api/account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = (await r.json()) as {
    error?: string;
    session: Session | null;
    message: string;
    login_code?: string;
    ok?: boolean;
  };
  if (!r.ok) throw Error(data.error || 'Account request failed.');
  return data;
}
export async function cloudApi(
  action: string,
  payload: unknown = {},
  expectedAccount?: string | null,
) {
  const session = client ? (await client.auth.getSession()).data.session : null;
  if (
    expectedAccount !== undefined &&
    (session?.user.id || null) !== expectedAccount
  )
    throw Error('Account changed. Reopen the library.');
  const r = await fetch('/api/cloud', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
    },
    body: JSON.stringify({ action, payload }),
  });
  const data = (await r.json()) as CloudResult & { error?: string };
  if (!r.ok) throw Error(data.error || 'Cloud request failed.');
  return data;
}
export async function backupUpload(
  file: File,
  id: string,
  gzip: boolean,
  signal?: AbortSignal,
) {
  const stream = gzip
    ? file.stream().pipeThrough(new DecompressionStream('gzip'))
    : file.stream();
  const manifest = await validateBackup(stream);
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  return new LocalBackup(localLibrary()).run('backup_begin', {
    id,
    manifest,
  }) as Promise<ReturnType<typeof import('./backup').restoreProgress>>;
}
export function browserAuth(url: string, key: string) {
  if (!client) client = createClient(url, key);
  return client;
}
export async function api(
  action: string,
  payload: any = {},
  signal?: AbortSignal,
): Promise<any> {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const startedLocal = performance.now();
  const active = localLibrary();
  const result = action.startsWith('backup_')
    ? await new LocalBackup(active).run(action, payload)
    : await active.perform(action, payload);
  if (signal?.aborted || !active.active)
    throw new DOMException('Cancelled', 'AbortError');
  recordBuilderRequest(action, performance.now() - startedLocal);
  return result;
}
/** Kept for compatibility tooling; normal library actions never use the legacy server API. */
export async function legacyApi(
  action: string,
  payload: any = {},
  signal?: AbortSignal,
): Promise<any> {
  const started = performance.now();
  const session = client ? (await client.auth.getSession()).data.session : null;
  const body = JSON.stringify({ action, payload });
  saveRequestTrace(action, 'request');
  const r = await fetch('/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(saveProfilingEnabled() ? { 'X-Pokelib-Profile': '1' } : {}),
      ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
    },
    body,
    signal,
  });
  saveRequestTrace(action, 'response');
  const d: any = await r.json();
  recordBuilderRequest(action, performance.now() - started);
  if (!r.ok) throw Error(d.error || 'Request failed.');
  saveRequestTrace(action, 'decoded', r.headers.get('Server-Timing'));
  return d;
}
