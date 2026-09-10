import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { DemoStore } from './demo-store';
import { SupabaseStore, supabaseClient } from './supabase-store';
import { publicSupabaseConfig } from './public-config';
import type { ServerTiming } from './server-timing';
export function config() {
  const e = env as unknown as Record<string, any>;
  return {
    ...publicSupabaseConfig(
      e.SUPABASE_URL || process.env.SUPABASE_URL || '',
      e.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
    ),
    db: env.DB,
  };
}
export async function storeFor(request: Request, timing?: ServerTiming) {
  const c = config();
  if (c.url && c.key) {
    const token = request.headers
      .get('authorization')
      ?.replace(/^Bearer /i, '');
    if (!token) throw Error('Please sign in to open your library.');
    const client = supabaseClient(c.url, c.key, token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw Error('Please sign in again.');
    return new SupabaseStore(client, timing);
  }
  const user = await getChatGPTUser();
  if (!user) throw Error('Please sign in to open your library.');
  return new DemoStore(c.db, user.userId, timing);
}
export function mutationOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw Error('Cross-origin request rejected.');
}
