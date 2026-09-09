// Optional live-service smoke test; requires localhost and outbound HTTPS.
import assert from 'node:assert/strict';
const origin = 'http://localhost:3000',
  url = 'https://pokepast.es/a47bb2a45883213e';
let cookie = '',
  id;
async function request(action, payload = {}) {
  const response = await fetch(origin + '/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ action, payload }),
  });
  return { status: response.status, data: await response.json() };
}
try {
  assert.equal((await request('pokepaste', { url })).status, 401);
  const sign = await fetch(origin + '/signin-with-chatgpt?return_to=%2F', {
    redirect: 'manual',
  });
  cookie = sign.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(cookie);
  assert.equal(
    (await request('pokepaste', { url: 'https://127.0.0.1/0123456789abcdef' }))
      .status,
    400,
  );
  const preview = await request('pokepaste', { url, format: 'gen9ou' });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.batch.length, 1);
  const draft = preview.data.batch[0].draft;
  assert.equal(draft.title, 'Mono Hoenn');
  assert.equal(draft.source_name, 'Moldy');
  assert.equal(draft.source_url, url);
  assert.equal(draft.source_type, 'PokéPaste');
  assert.equal(draft.team_date, null);
  const saved = await request('import', {
    drafts: [{ ...draft, title: 'HTTP Pokepaste ' + crypto.randomUUID() }],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  id = saved.data.ids[0];
  const team = (await request('get', { id })).data;
  assert.equal(team.source_url, url);
  assert.equal(team.team_date_precision, 'unknown');
  assert.ok(team.version.parsed_team.length);
  assert.equal(team.version.showdown_text, draft.showdown_text);
  console.log(
    'Live PokéPaste HTTP: authenticated preview, title/author/provenance, raw import, Unknown date and invalid-host rejection passed.',
  );
} finally {
  if (id) await request('delete', { id });
}
