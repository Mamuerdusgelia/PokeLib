import assert from 'node:assert/strict';
const origin = 'http://localhost:3000';
let cookie, collection, family;
async function api(action, payload = {}, authenticated = true) {
  const r = await fetch(origin + '/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(authenticated ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ action, payload }),
  });
  const d = await r.json();
  if (!r.ok) throw Error(r.status + ': ' + d.error);
  return d;
}
async function read(token, suffix = '') {
  const r = await fetch(origin + '/api/share/collection/' + token + suffix, {
    cache: 'no-store',
  });
  return { status: r.status, data: await r.json() };
}
try {
  await assert.rejects(() => api('collection_list', {}, false), /401/);
  const sign = await fetch(origin + '/signin-with-chatgpt?return_to=%2F', {
    redirect: 'manual',
  });
  cookie = sign.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const title = 'HTTP collection ' + crypto.randomUUID();
  const parsed = await api('parse', {
    text: 'Darkrai @ Life Orb\nAbility: Bad Dreams\n- Ice Beam',
    format: 'gen4ubers',
  });
  const draft = { ...parsed[0].draft, title, tags: [title] };
  family = (await api('import', { drafts: [draft] })).ids[0];
  collection = await api('collection_save', {
    id: crypto.randomUUID(),
    name: title,
    description: 'Live HTTP test',
    definition: {
      query: '',
      filters: [{ field: 'tag', value: title }],
      sort: 'title_asc',
      favourite: false,
    },
  });
  const { token } = await api('collection_share', { id: collection.id });
  assert.equal((await read(token)).data.total, 1);
  assert.equal(
    (await read(token, '?team=' + family + '&query=anything&owner_id=forged'))
      .data.id,
    family,
  );
  assert.equal((await read(token, '?team=' + crypto.randomUUID())).status, 404);
  const page = await fetch(origin + '/share/collection/' + token);
  assert.equal(page.status, 200);
  const detailPage = await fetch(
    origin + '/share/collection/' + token + '?team=' + family,
  );
  assert.equal(detailPage.status, 200);
  await api('patch', { id: family, patch: { tags: [] } });
  assert.equal((await read(token)).data.total, 0);
  assert.equal((await read(token, '?team=' + family)).status, 404);
  await api('patch', { id: family, patch: { tags: [title] } });
  assert.equal((await read(token)).data.total, 1);
  const next = (await api('collection_share', { id: collection.id })).token;
  assert.equal((await read(token)).status, 404);
  assert.equal((await read(next)).data.total, 1);
  await api('collection_revoke', { id: collection.id });
  assert.equal((await read(next)).status, 404);
  const cross = await fetch(origin + '/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://untrusted.invalid',
      Cookie: cookie,
    },
    body: JSON.stringify({
      action: 'collection_delete',
      payload: {
        id: collection.id,
        expected_updated_at: collection.updated_at,
      },
    }),
  });
  assert.ok([400, 403].includes(cross.status));
  console.log(
    'HTTP collections: authenticated CRUD, read-only routes, anonymous live membership, query/ID tampering, rotate/revoke and origin checks passed.',
  );
} finally {
  if (collection)
    await api('collection_delete', {
      id: collection.id,
      expected_updated_at: collection.updated_at,
    });
  if (family)
    await api('family_bulk_delete', {
      ids: [family],
      chunk: { operation_id: crypto.randomUUID(), chunk_index: 0 },
    });
}
