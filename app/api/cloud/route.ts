import { config, mutationOrigin } from '@/lib/runtime';
import { supabaseClient } from '@/lib/supabase-store';
import { cloudPayload, snapshotProjection } from '@/lib/cloud-server';
import { previewPokepaste } from '@/lib/pokepaste';
import { cleanCollection } from '@/lib/collections';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    mutationOrigin(request);
    const raw = await request.text();
    if (raw.length > 2000000) throw Error('Cloud request too large.');
    const { action, payload = {} } = JSON.parse(raw);
    const c = config();
    if (action === 'pokepaste')
      return Response.json(
        await previewPokepaste(
          payload.url,
          payload.format,
          payload.format_context,
        ),
      );
    if (!c.url || !c.key) {
      if (action !== 'snapshot')
        throw Error(
          'Cloud accounts are not configured on this installation. Local teams are available.',
        );
      const token = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (x) => x.toString(16).padStart(2, '0'),
      ).join('');
      await c.db
        .prepare(
          'INSERT INTO snapshot_shares(token,snapshot,created_at) VALUES(?,?,?)',
        )
        .bind(
          token,
          JSON.stringify(snapshotProjection(payload.team)),
          new Date().toISOString(),
        )
        .run();
      return Response.json(
        { token },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const token = request.headers
      .get('authorization')
      ?.replace(/^Bearer /i, '');
    const client = supabaseClient(c.url, c.key, token);
    if (action !== 'snapshot') {
      if (!token || (await client.auth.getUser(token)).error)
        throw Error('Please sign in to use Cloud Sync.');
    }
    const p =
      action === 'put'
        ? { ...payload, ...cloudPayload(payload.team) }
        : action === 'snapshot'
          ? { team: cloudPayload(payload.team).team }
          : payload;
    if (action.startsWith('collection_') && action !== 'collection_revoke')
      p.collection = cleanCollection(p.collection);
    const { data, error } = await client.rpc(
      action.startsWith('collection_') ? 'lf_collection' : 'local_first',
      { action, payload: p },
    );
    if (error) throw Error(error.message);
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      {
        status: /sign in/i.test((error as Error).message) ? 401 : 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
