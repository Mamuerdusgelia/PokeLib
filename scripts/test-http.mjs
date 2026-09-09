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
let cookie, disposable, variantFamily;
const bulkIds = [];
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
  // Current edits and historical checkpoints have distinct persistence contracts.
  let current = (await req('get', { id: disposable }, cookie)).data;
  const payloadFor = (team, draft, parent = team.current_version_id) => ({
    id: team.id,
    draft,
    parent,
    expected: team.current_version_id,
    expected_revision: team.version.edit_revision ?? team.version.id,
    expected_updated_at: team.updated_at,
  });
  const beforeSave = structuredClone(current);
  const saved = await req(
    'save',
    payloadFor(current, {
      ...current,
      ...current.version,
      showdown_text:
        current.version.showdown_text.replace('Ice Beam', 'Thunderbolt') +
        '\nCustom Field: HTTP preserved',
      team_notes: 'Httpcurrentnote',
      set_notes: ['Httpsetnote'],
      set_editing: [{ authored: true, attack_iv: 'auto', tera: 'auto' }],
      version_comment: 'Must keep existing comment',
      original_text: 'Must keep original source',
    }),
    cookie,
  );
  assert.equal(saved.status, 200);
  current = saved.data;
  assert.equal(current.version.id, beforeSave.version.id);
  assert.equal(current.version.version_number, 1);
  assert.equal(current.history.length, 1);
  assert.equal(current.version.original_text, beforeSave.version.original_text);
  assert.equal(
    current.version.version_comment,
    beforeSave.version.version_comment,
  );
  assert.notEqual(
    current.version.edit_revision,
    beforeSave.version.edit_revision ?? beforeSave.version.id,
  );
  assert.equal(current.version.set_editing[0].attack_iv, 'auto');
  assert.equal(
    (
      await req(
        'list',
        { query: 'team:"' + title + '" Darkrai Ice Beam' },
        cookie,
      )
    ).data.total,
    0,
  );
  assert.equal(
    (
      await req(
        'list',
        { query: 'team:"' + title + '" Darkrai Thunderbolt note:Httpsetnote' },
        cookie,
      )
    ).data.total,
    1,
  );
  const stale = await req(
    'save',
    payloadFor(beforeSave, { ...beforeSave, ...beforeSave.version }),
    cookie,
  );
  assert.equal(stale.status, 400);
  assert.match(stale.data.error, /changed/);
  assert.equal(
    (await req('save', payloadFor(current, { ...current, ...current.version })))
      .status,
    401,
  );
  const firstSaved = structuredClone(current.version);
  const checkpoint = await req(
    'version',
    payloadFor(current, {
      ...current,
      ...current.version,
      team_notes: 'Httpnewversionnote',
      set_notes: ['Httpnewsetnote'],
      version_comment: 'HTTP checkpoint',
    }),
    cookie,
  );
  assert.equal(checkpoint.status, 200);
  current = checkpoint.data;
  assert.equal(current.version.version_number, 2);
  assert.equal(current.history.length, 2);
  assert.deepEqual(
    current.history.find((v) => v.id === firstSaved.id),
    firstSaved,
  );
  const forbiddenHistory = await req(
    'save',
    payloadFor(current, { ...current, ...firstSaved }, firstSaved.id),
    cookie,
  );
  assert.equal(forbiddenHistory.status, 400);
  assert.match(forbiddenHistory.data.error, /immutable/i);
  const secondSaved = structuredClone(current.version);
  const restored = await req(
    'version',
    payloadFor(
      current,
      {
        ...current,
        ...firstSaved,
        version_comment: 'HTTP restore',
      },
      firstSaved.id,
    ),
    cookie,
  );
  assert.equal(restored.status, 200);
  current = restored.data;
  assert.equal(current.version.version_number, 3);
  assert.equal(current.history.length, 3);
  assert.equal(current.version.parent_version_id, firstSaved.id);
  assert.equal(current.version.showdown_text, firstSaved.showdown_text);
  assert.deepEqual(current.version.set_notes, firstSaved.set_notes);
  assert.deepEqual(current.version.set_editing, firstSaved.set_editing);
  assert.deepEqual(
    current.history.find((v) => v.id === secondSaved.id),
    secondSaved,
  );
  let link = await req('share', { id: disposable }, cookie);
  assert.equal(link.status, 200);
  assert.equal(
    (await fetch(origin + '/api/share/' + link.data.token)).status,
    200,
  );
  const shared = await (
    await fetch(origin + '/api/share/' + link.data.token)
  ).json();
  assert.equal(shared.version.version_number, 3);
  assert.equal(shared.version.set_editing, undefined);
  const pinned = await (
    await fetch(origin + '/api/share/' + link.data.token + '?version=1')
  ).json();
  assert.equal(pinned.version.showdown_text, firstSaved.showdown_text);
  assert.deepEqual(pinned.version.set_notes, firstSaved.set_notes);
  assert.equal(pinned.version.set_editing, undefined);
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
  const bulkTitle = 'HTTP bulk ' + crypto.randomUUID();
  const batch = Array.from({ length: 7 }, (_, i) => ({
    ...parsed.data[0].draft,
    title: bulkTitle + ' ' + i,
    format: 'Gen 4 Ubers',
  }));
  const operation_id = crypto.randomUUID();
  for (let i = 0; i < batch.length; i += 5) {
    const payload = {
      drafts: batch.slice(i, i + 5),
      chunk: { operation_id, chunk_index: i / 5 },
    };
    const first = await req('import', payload, cookie);
    assert.equal(first.status, 200);
    bulkIds.push(...first.data.ids);
    assert.deepEqual(await req('import', payload, cookie), first);
  }
  assert.equal(
    (await req('get', { id: bulkIds[0] }, cookie)).data.format,
    'gen4ubers',
  );
  const selected = await req(
    'select',
    { query: 'team:"' + bulkTitle + '"' },
    cookie,
  );
  assert.equal(selected.status, 200);
  assert.equal(selected.data.ids.length, 7);
  assert.equal(selected.data.teams, undefined);
  const tags = {
    ids: bulkIds.slice(0, 5),
    patch: { tags: ['HTTP retry'] },
    chunk: { operation_id: crypto.randomUUID(), chunk_index: 0 },
  };
  assert.equal((await req('bulk', tags, cookie)).data.count, 5);
  assert.equal((await req('bulk', tags, cookie)).data.count, 5);
  assert.equal(
    (
      await req(
        'list',
        { query: 'team:"' + bulkTitle + '" tag:"HTTP retry"' },
        cookie,
      )
    ).data.total,
    5,
  );
  const variantImport = await req(
    'import',
    {
      drafts: [
        {
          ...parsed.data[0].draft,
          title: 'HTTP variants ' + crypto.randomUUID(),
        },
      ],
    },
    cookie,
  );
  variantFamily = variantImport.data.ids[0];
  const main = (await req('get', { id: variantFamily }, cookie)).data;
  const variantPayload = {
    id: main.id,
    name: 'Anti-Stall',
    version_id: main.version.id,
    expected: main.current_version_id,
    expected_revision: main.version.edit_revision || main.version.id,
    expected_updated_at: main.updated_at,
    operation_id: crypto.randomUUID(),
  };
  const clone = await req('variant_create', variantPayload, cookie);
  assert.equal(clone.status, 200, JSON.stringify(clone.data));
  assert.equal(
    (await req('variant_create', variantPayload, cookie)).data.id,
    clone.data.id,
  );
  const grouped = await req(
    'families',
    { query: 'team:"' + main.title + '"' },
    cookie,
  );
  assert.equal(grouped.data.total, 1);
  assert.equal(grouped.data.teams[0].variant_count, 2);
  assert.equal(
    (await req('family_variants', { family_id: main.id }, cookie)).data.total,
    2,
  );
  assert.equal(
    (await req('family_expand', { ids: [main.id] }, cookie)).data.ids.length,
    2,
  );
  const shareVariant = await req('share', { id: clone.data.id }, cookie);
  const sharedVariant = await (
    await fetch(origin + '/api/share/' + shareVariant.data.token)
  ).json();
  assert.equal(sharedVariant.variant_name, 'Anti-Stall');
  assert.equal(sharedVariant.family_id, undefined);
  assert.equal(sharedVariant.variant_count, undefined);
  const removeFamily = {
    ids: [main.id],
    chunk: { operation_id: crypto.randomUUID(), chunk_index: 0 },
  };
  assert.equal(
    (await req('family_bulk_delete', removeFamily, cookie)).data.count,
    1,
  );
  assert.equal(
    (await req('family_bulk_delete', removeFamily, cookie)).data.count,
    1,
  );
  assert.equal(
    (await fetch(origin + '/api/share/' + shareVariant.data.token)).status,
    404,
  );
  console.log(
    'HTTP variants: clone replay, grouped library, sibling expansion, restricted shares and family deletion passed.',
  );
  const deletion = crypto.randomUUID();
  for (let i = 0; i < bulkIds.length; i += 5) {
    const payload = {
      ids: bulkIds.slice(i, i + 5),
      chunk: { operation_id: deletion, chunk_index: i / 5 },
    };
    const r = await req('bulk_delete', payload, cookie);
    assert.equal(r.status, 200);
    assert.deepEqual(await req('bulk_delete', payload, cookie), r);
  }
  assert.equal(
    (await req('select', { query: 'team:"' + bulkTitle + '"' }, cookie)).data
      .total,
    0,
  );
  console.log(
    'HTTP canonical formats, chunk replay, ID-only selection, bulk tags and bulk deletion passed.',
  );
  console.log(
    'HTTP integration: authentication, current Save, immutable checkpoints/restoration, private builder state, search, sharing, revocation, origin checks, and permanent deletion passed.',
  );
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  if (cookie && variantFamily)
    await req(
      'family_bulk_delete',
      {
        ids: [variantFamily],
        chunk: { operation_id: crypto.randomUUID(), chunk_index: 0 },
      },
      cookie,
    );
  if (cookie && disposable) await req('delete', { id: disposable }, cookie);
  if (cookie) for (const id of bulkIds) await req('delete', { id }, cookie);
}
