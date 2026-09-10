import { config } from '@/lib/runtime';
import { resolveDemoCollection } from '@/lib/demo-collections';
import { sharedSelection } from '@/lib/collections';
import { supabaseClient } from '@/lib/supabase-store';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  try {
    const { token } = await params;
    if (!/^[a-f0-9]{64}$/.test(token)) throw Error();
    const q = new URL(request.url).searchParams;
    const selection = sharedSelection({
      page: q.get('page') ?? undefined,
      family: q.get('family') ?? undefined,
      team: q.get('team') ?? undefined,
    });
    const c = config();
    let result: unknown;
    if (c.url && c.key) {
      const { data, error } = await supabaseClient(c.url, c.key).rpc(
        'resolve_collection',
        { p_token: token, p_selection: selection },
      );
      if (error || !data) throw Error();
      result = data;
    } else result = await resolveDemoCollection(c.db, token, selection);
    return Response.json(result, { headers });
  } catch {
    return Response.json(
      {
        error:
          'This collection or selected team is unavailable. The link may have been revoked.',
      },
      { status: 404, headers },
    );
  }
}
