// Real localhost requests; isolated disposable families. Not hosted D1 timings.
import fs from 'node:fs/promises';
import { demoDrafts } from '../.test-build/demo.mjs';
const origin = 'http://localhost:3000',
  label = process.argv[2] || 'sample';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Use a plain sample label.');
const sign = await fetch(origin + '/signin-with-chatgpt?return_to=%2F', {
    redirect: 'manual',
  }),
  cookie = sign.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw Error('Local sign in unavailable.');
async function api(action, payload) {
  const body = JSON.stringify({ action, payload }),
    start = performance.now();
  const r = await fetch(origin + '/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      Cookie: cookie,
      'X-TeamVault-Profile': '1',
    },
    body,
  });
  const response = performance.now() - start,
    data = await r.json(),
    total = performance.now() - start;
  if (!r.ok) throw Error(data.error);
  const timing = Object.fromEntries(
    [...r.headers.get('server-timing').matchAll(/([a-z_]+);dur=([\d.]+)/g)].map(
      (x) => [x[1], Number(x[2])],
    ),
  );
  return { data, timing: { ...timing, response, total } };
}
const measurements = [];
for (const sets of [1, 6]) {
  let family;
  try {
    const raw =
      sets === 1
        ? 'Darkrai @ Life Orb\nAbility: Bad Dreams\n- Dark Pulse\n- Ice Beam'
        : demoDrafts[0].showdown_text;
    const parsed = (await api('parse', { text: raw, format: 'gen9ou' })).data[0]
      .draft;
    family = (
      await api('import', {
        drafts: [{ ...parsed, title: 'QA Save timing ' + label + ' ' + sets }],
      })
    ).data.ids[0];
    for (const action of ['save', 'version', 'variant_create']) {
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const t = (await api('get', { id: family })).data;
        const guard = {
          id: family,
          expected: t.current_version_id,
          expected_revision: t.version.edit_revision || t.version.id,
          expected_updated_at: t.updated_at,
        };
        const payload =
          action === 'variant_create'
            ? {
                ...guard,
                name: 'Sample ' + i,
                description: 'Timing fixture',
                version_id: t.version.id,
                operation_id: crypto.randomUUID(),
              }
            : {
                ...guard,
                parent: t.version.id,
                draft: {
                  ...t,
                  ...t.version,
                  team_notes: 'Timing ' + action + ' ' + i,
                },
              };
        samples.push((await api(action, payload)).timing);
      }
      const fields = Object.keys(samples[0]);
      const stats = Object.fromEntries(
        fields.map((f) => {
          const v = samples.map((x) => x[f]).sort((a, b) => a - b);
          return [f, { median: +v[2].toFixed(2), max: +v[4].toFixed(2) }];
        }),
      );
      measurements.push({ sets, action, samples, stats });
    }
  } finally {
    if (family)
      await api('family_bulk_delete', {
        ids: [family],
        chunk: { operation_id: crypto.randomUUID(), chunk_index: 0 },
      });
  }
}
await fs.writeFile(
  '.artifacts/library-scale/save-http-' + label + '.json',
  JSON.stringify(
    {
      environment: 'Local Vinext development + local D1',
      measuredAt: new Date().toISOString(),
      measurements,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    measurements.map(({ sets, action, stats }) => ({ sets, action, ...stats })),
    null,
    2,
  ),
);
