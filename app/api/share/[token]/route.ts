import { config } from '@/lib/runtime';
import { resolveDemoShare, hashToken } from '@/lib/demo-store';
import { supabaseClient } from '@/lib/supabase-store';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!/^[a-f0-9]{64}$/.test(token)) throw Error();
    const q = new URL(request.url).searchParams.get('version');
    const version = q ? Number(q) : undefined;
    if (q && (!Number.isInteger(version) || version! < 1)) throw Error();
    const c = config();
    let result: any;
    if (c.url && c.key) {
      const { data, error } = await supabaseClient(c.url, c.key).rpc(
        'resolve_share',
        { p_token: token, p_version: version ?? null },
      );
      if (error || !data) throw Error();
      result = data;
    } else result = await resolveDemoShare(c.db, token, version);
    return Response.json(result, {
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  } catch {
    return Response.json(
      { error: 'This share link is unavailable or has been revoked.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
