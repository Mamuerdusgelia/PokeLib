import { env } from 'cloudflare:workers';
import { config, mutationOrigin } from '@/lib/runtime';
import { handleAccount } from '@/lib/account-server';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    mutationOrigin(request);
    const key =
      (env as unknown as Record<string, string>).SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    return await handleAccount(request, config(), key);
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
