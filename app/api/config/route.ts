import { config } from '@/lib/runtime';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  const c = config();
  const user = await getChatGPTUser();
  return Response.json(
    {
      demo: !(c.url && c.key),
      supabase_url: c.url,
      supabase_key: c.key,
      user: user
        ? { name: user.fullName || 'Personal library', email: user.email }
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
