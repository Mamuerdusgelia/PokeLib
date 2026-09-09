import { storeFor, mutationOrigin } from '@/lib/runtime';
import { planQuery } from '@/lib/search';
import { parseBatch, parseShowdown } from '@/lib/showdown';
import { demoDrafts } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    mutationOrigin(request);
    if (Number(request.headers.get('content-length') || 0) > 21000000)
      throw Error('Keep import archives below 20 MB.');
    const raw = await request.text();
    if (raw.length > 21000000) throw Error('Keep import archives below 20 MB.');
    const { action, payload: p = {} } = JSON.parse(raw);
    if (action !== 'parse' && raw.length > 6000000)
      throw Error('Request too large; use smaller chunks.');
    const store = await storeFor(request);
    let result: any;
    switch (action) {
      case 'list':
        await store.initialize();
        result = await store.list({ ...p, plan: planQuery(p.query || '') });
        break;
      case 'facets':
        result = await store.facets({
          include_archived: p.include_archived === true,
        });
        break;
      case 'get':
        result = await store.get(p.id);
        break;
      case 'select':
        result = await store.list({
          ...p,
          plan: planQuery(p.query || ''),
          ids_only: true,
        });
        break;
      case 'parse':
        result = parseBatch(p.text, p.format, p.format_context);
        break;
      case 'preview':
        result = parseShowdown(p.text, p.format);
        break;
      case 'import':
        result = await store.import(p.drafts, p.chunk);
        break;
      case 'seed':
        result = await store.import(demoDrafts);
        break;
      case 'version':
        result = await store.version(
          p.id,
          p.draft,
          p.expected,
          p.parent,
          p.expected_revision,
          p.expected_updated_at,
        );
        break;
      case 'save':
        result = await store.save(
          p.id,
          p.draft,
          p.expected,
          p.parent,
          p.expected_revision,
          p.expected_updated_at,
        );
        break;
      case 'patch':
        result = await store.patch(p.id, p.patch);
        break;
      case 'bulk':
        result = await store.bulk(p.ids, p.patch, p.chunk);
        break;
      case 'bulk_delete':
        result = await store.bulkDelete(p.ids, p.chunk);
        break;
      case 'delete':
        result = await store.delete(p.id);
        break;
      case 'share':
        result = await store.share(p.id);
        break;
      case 'revoke':
        result = await store.share(p.id, true);
        break;
      default:
        throw Error('Unknown action.');
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed.';
    return Response.json(
      { error: message },
      {
        status: /sign in/i.test(message) ? 401 : 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
