import assert from 'node:assert/strict';
import {
  pokepasteUrl,
  readPokepaste,
  previewPokepaste,
} from '../.test-build/pokepaste.mjs';
const url = 'https://pokepast.es/0123456789abcdef';
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log('PASS PokéPaste ' + name);
}
await check('only canonical HTTPS paste URLs can cause a fetch', async () => {
  assert.equal(pokepasteUrl(' ' + url.toUpperCase() + '/ '), url);
  for (const input of [
    'http://pokepast.es/0123456789abcdef',
    'https://evil.test/0123456789abcdef',
    'https://pokepast.es.evil.test/0123456789abcdef',
    'https://pokepast.es@127.0.0.1/0123456789abcdef',
    'https://user:password@pokepast.es/0123456789abcdef',
    url + '?url=http://127.0.0.1',
    url + '#fragment',
    'https://pokepast.es:8443/0123456789abcdef',
    'https://127.0.0.1/0123456789abcdef',
    'file:///etc/passwd',
    'data:text/plain,example',
    'https://pokepast.es/create',
    'https://pokepast.es/%2f0123456789abcdef',
    null,
    42,
  ]) {
    let called = false;
    await assert.rejects(
      () =>
        readPokepaste(input, async () => {
          called = true;
          return new Response();
        }),
      /PokéPaste URL/,
    );
    assert.equal(called, false);
  }
});
await check(
  'official JSON fields enter existing parser with Unknown date and provenance',
  async () => {
    const raw =
      'Darkrai @ Life Orb\r\nAbility: Bad Dreams\r\n- Ice Beam\r\nCustom Field: untouched';
    const preview = await previewPokepaste(
      url,
      'Gen 4 Ubers',
      undefined,
      async (target, options) => {
        assert.equal(target, url + '/json');
        assert.equal(options.redirect, 'manual');
        assert.equal(options.credentials, 'omit');
        assert.deepEqual(options.headers, { Accept: 'application/json' });
        return Response.json({
          paste: raw,
          title: 'Tournament team',
          author: 'Alice',
          notes: 'Lead notes',
        });
      },
    );
    assert.equal(preview.text, raw);
    assert.equal(preview.batch.length, 1);
    const d = preview.batch[0].draft;
    assert.equal(d.title, 'Tournament team');
    assert.equal(d.format, 'gen4ubers');
    assert.equal(d.source_type, 'PokéPaste');
    assert.equal(d.source_name, 'Alice');
    assert.equal(d.source_url, url);
    assert.equal(d.team_notes, 'Lead notes');
    assert.equal(d.team_date, null);
    assert.equal(d.team_date_precision, 'unknown');
    assert.ok(d.showdown_text.includes('Custom Field: untouched'));
  },
);
await check(
  'redirects and upstream errors never trigger a second fetch',
  async () => {
    for (const status of [301, 302, 307, 404, 429, 500]) {
      let calls = 0;
      await assert.rejects(
        () =>
          readPokepaste(url, async () => {
            calls++;
            return new Response('', {
              status,
              headers: { Location: 'http://127.0.0.1/admin' },
            });
          }),
        /redirected|not found|unavailable/,
      );
      assert.equal(calls, 1);
    }
  },
);
await check('bounds both declared and streamed response size', async () => {
  await assert.rejects(
    () =>
      readPokepaste(
        url,
        async () =>
          new Response('{}', { headers: { 'Content-Length': '1000001' } }),
      ),
    /too large/,
  );
  let cancelled = false;
  await assert.rejects(
    () =>
      readPokepaste(
        url,
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(1000001));
              },
              cancel() {
                cancelled = true;
              },
            }),
          ),
      ),
    /too large/,
  );
  assert.equal(cancelled, true);
});
await check(
  'malformed JSON, empty teams and non-string metadata fail clearly',
  async () => {
    for (const body of [
      '<html>error</html>',
      'null',
      '[]',
      '{}',
      JSON.stringify({ paste: 12 }),
      JSON.stringify({ paste: 'Darkrai\n- Ice Beam', author: 12 }),
    ]) {
      await assert.rejects(
        () => readPokepaste(url, async () => new Response(body)),
        /invalid|supported/,
      );
    }
    await assert.rejects(
      () =>
        readPokepaste(url, async () => {
          throw new TypeError('network unavailable');
        }),
      /Could not reach/,
    );
  },
);
await check(
  'long optional metadata is visibly warned and bounded',
  async () => {
    const preview = await previewPokepaste(url, 'gen9ou', undefined, async () =>
      Response.json({
        paste: 'Darkrai\n- Ice Beam',
        title: 'x'.repeat(200),
        author: 'y'.repeat(250),
        notes: 'z'.repeat(11000),
      }),
    );
    assert.equal(
      preview.batch[0].warnings.filter((w) => w.includes('shortened')).length,
      3,
    );
    assert.equal(preview.batch[0].draft.title.length, 160);
    assert.equal(preview.common.team_notes.length, 10000);
  },
);
console.log(passed + ' PokéPaste checks passed.');
