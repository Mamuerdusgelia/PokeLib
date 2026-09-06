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
  const d = await r.json();
  return { status: r.status, data: d };
}
try {
  const anonymous = await req('list');
  assert.equal(anonymous.status, 401);
  const sign = await fetch(origin + '/signin-with-chatgpt?return_to=%2F', {
    redirect: 'manual',
  });
  const cookie = sign.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const c = await (
    await fetch(origin + '/api/config', { headers: { Cookie: cookie } })
  ).json();
  assert.ok(c.user);
  const list = await req('list', {}, cookie);
  if (list.status !== 200) throw Error(JSON.stringify(list));
  assert.ok(list.data.total >= 6);
  const search = await req('list', { query: 'Darkrai Ice Beam' }, cookie);
  assert.equal(search.status, 200);
  assert.ok(search.data.total >= 1);
  const id = search.data.teams[0].id;
  const detail = await req('get', { id }, cookie);
  assert.ok(detail.data.history.length >= 1);
  const share = await req('share', { id }, cookie);
  assert.match(share.data.token, /^[a-f0-9]{64}$/);
  const shared = await fetch(origin + '/api/share/' + share.data.token);
  assert.equal(shared.status, 200);
  await req('revoke', { id }, cookie);
  assert.equal(
    (await fetch(origin + '/api/share/' + share.data.token)).status,
    404,
  );
  const cross = await fetch(origin + '/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://unrelated.example',
      Cookie: cookie,
    },
    body: JSON.stringify({ action: 'get', payload: { id } }),
  });
  assert.ok([400, 403].includes(cross.status));
  console.log(
    'HTTP integration: anonymous rejection, local sign-in, persistent library, same-set search, history, anonymous sharing, revocation, and origin checks passed.',
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
