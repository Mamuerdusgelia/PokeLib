'use client';
import {
  recordBuilderRequest,
  saveProfilingEnabled,
  saveRequestTrace,
} from './builder-performance';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let client: SupabaseClient | undefined;
export function browserAuth(url: string, key: string) {
  if (!client) client = createClient(url, key);
  return client;
}
export async function api(
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
