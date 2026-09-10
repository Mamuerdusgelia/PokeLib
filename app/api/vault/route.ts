import { storeFor, mutationOrigin } from '@/lib/runtime';
import { planQuery } from '@/lib/search';
import { parseBatch, parseShowdown } from '@/lib/showdown';
import { demoDrafts } from '@/lib/demo';
import { previewPokepaste } from '@/lib/pokepaste';
import { ServerTiming } from '@/lib/server-timing';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const timing = new ServerTiming(
    request.headers.get('X-TeamVault-Profile') === '1',
  );
  try {
    mutationOrigin(request);
    if (Number(request.headers.get('content-length') || 0) > 21000000)
      throw Error('Keep import archives below 20 MB.');
    const raw = await request.text();
    if (raw.length > 21000000) throw Error('Keep import archives below 20 MB.');
    const { action, payload: p = {} } = JSON.parse(raw);
    if (action !== 'parse' && raw.length > 6000000)
      throw Error('Request too large; use smaller chunks.');
    timing.mark('body_end');
    const store = await timing.measure('auth', () => storeFor(request, timing));
    timing.mark('auth_end');
    let result: any;
    switch (action) {
      case 'collection_list':
      case 'collection_get':
      case 'collection_save':
      case 'collection_delete':
      case 'collection_share':
      case 'collection_revoke':
        result = await store.collection(action, p);
        break;
      case 'list':
      case 'families':
      case 'family_variants':
        await store.initialize();
        result = await store.list({
          ...p,
          group_families: action === 'families',
          plan: planQuery(p.query || ''),
        });
        break;
      case 'facets':
        result = await store.facets({
          include_archived: p.include_archived === true,
          group_families: p.group_families === true,
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
      case 'variant_create':
      case 'variant_rename':
      case 'variant_delete':
      case 'family_rename':
      case 'family_expand':
      case 'family_bulk_delete':
        result = await store.variant(action, p);
        break;
      case 'parse':
        result = parseBatch(p.text, p.format, p.format_context);
        break;
      case 'preview':
        result = parseShowdown(p.text, p.format);
        break;
      case 'pokepaste':
        result = await previewPokepaste(p.url, p.format, p.format_context);
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
    timing.mark('server_end');
    return Response.json(result, {
      headers: {
        'Cache-Control': 'no-store',
        ...(timing.header() ? { 'Server-Timing': timing.header() } : {}),
      },
    });
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
