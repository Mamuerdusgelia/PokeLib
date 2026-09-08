import assert from 'node:assert/strict';
const origin = 'http://localhost:3000';
async function req(action, payload = {}, cookie = '') {
  const r = await fetch(origin + '/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ action, payload }),
  });
  return { status: r.status, data: await r.json() };
}
let cookie, disposable;
try {
  assert.equal((await req('list')).status, 401);
  const sign = await fetch(origin + '/signin-with-chatgpt?return_to=%2F', {
    redirect: 'manual',
  });
  cookie = sign.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const config = await (
    await fetch(origin + '/api/config', { headers: { Cookie: cookie } })
  ).json();
  assert.ok(config.user);
  assert.equal((await req('list', {}, cookie)).status, 200);
  const parsed = await req(
    'parse',
    {
      text: 'Darkrai @ Life Orb\nAbility: Bad Dreams\nTimid Nature\n- Dark Pulse\n- Ice Beam\n- Nasty Plot\n- Sludge Bomb',
      format: 'gen9ou',
    },
    cookie,
  );
  assert.equal(parsed.status, 200);
  const title = 'HTTP deletion ' + crypto.randomUUID();
  const imported = await req(
    'import',
    { drafts: [{ ...parsed.data[0].draft, title }] },
    cookie,
  );
  assert.equal(imported.status, 200);
  disposable = imported.data.ids[0];
  const search = await req(
    'list',
    { query: 'team:"' + title + '" Darkrai Ice Beam' },
    cookie,
  );
  assert.equal(search.status, 200);
  assert.equal(search.data.teams[0].id, disposable);
  const detail = await req('get', { id: disposable }, cookie);
  assert.equal(detail.data.history.length, 1);
  await req(
    'patch',
    { id: disposable, patch: { archived: true, favourite: true } },
    cookie,
  );
  const archivedDefault = await req(
    'list',
    { query: 'team:"' + title + '"' },
    cookie,
  );
  assert.equal(archivedDefault.data.total, 0);
  const archivedInclusive = await req(
    'list',
    { query: 'team:"' + title + '"', include_archived: true },
    cookie,
  );
  assert.equal(archivedInclusive.data.total, 1);
  const defaultFacets = await req('facets', {}, cookie),
    inclusiveFacets = await req('facets', { include_archived: true }, cookie);
  assert.ok(inclusiveFacets.data.all > defaultFacets.data.all);
  assert.ok(inclusiveFacets.data.favourites > defaultFacets.data.favourites);
  await req('patch', { id: disposable, patch: { archived: false } }, cookie);
  assert.equal((await req('delete', { id: disposable })).status, 401);
  const cross = await fetch(origin + '/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://unrelated.example',
      Cookie: cookie,
    },
    body: JSON.stringify({ action: 'delete', payload: { id: disposable } }),
  });
  assert.ok([400, 403].includes(cross.status));
  assert.equal((await req('get', { id: disposable }, cookie)).status, 200);
  let link = await req('share', { id: disposable }, cookie);
  assert.equal(link.status, 200);
  assert.equal(
    (await fetch(origin + '/api/share/' + link.data.token)).status,
    200,
  );
  await req('revoke', { id: disposable }, cookie);
  assert.equal(
    (await fetch(origin + '/api/share/' + link.data.token)).status,
    404,
  );
  link = await req('share', { id: disposable }, cookie);
  const deleted = await req('delete', { id: disposable }, cookie);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.deleted, true);
  assert.equal((await req('get', { id: disposable }, cookie)).status, 400);
  assert.equal(
    (await fetch(origin + '/api/share/' + link.data.token)).status,
    404,
  );
  assert.equal(
    (await fetch(origin + '/api/share/' + link.data.token + '?version=1'))
      .status,
    404,
  );
  console.log(
    'HTTP integration: authentication, persistence, search, history, sharing, revocation, origin checks, and permanent deletion passed.',
  );
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  if (cookie && disposable) await req('delete', { id: disposable }, cookie);
}
