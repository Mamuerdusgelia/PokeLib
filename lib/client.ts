'use client';
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
  const session = client ? (await client.auth.getSession()).data.session : null;
  const r = await fetch('/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
    },
    body: JSON.stringify({ action, payload }),
    signal,
  });
  const d: any = await r.json();
  if (!r.ok) throw Error(d.error || 'Request failed.');
  return d;
}
