import assert from 'node:assert/strict';
import { parseBatch } from '../.test-build/showdown.mjs';
import { demoDrafts } from '../.test-build/demo.mjs';
import { planQuery } from '../.test-build/search.mjs';
export async function testLargeWorkflows(store, other, check, count = 10) {
  const stamp = crypto.randomUUID(),
    operation_id = crypto.randomUUID();
  const text = Array.from({ length: count }, (_, i) => {
    const t = demoDrafts[i % demoDrafts.length];
    return (
      '=== [' +
      t.format +
      '] Scale ' +
      stamp +
      ' ' +
      i +
      ' ===\n\n' +
      t.showdown_text
    );
  }).join('\n\n');
  const parsed = parseBatch(text).map(({ draft }) => ({
    ...draft,
    tags: ['Scale ' + stamp, 'Tournament Grade'],
    source_name: 'Alice',
    source_type: 'Received from',
    team_date: '2024',
    team_date_precision: 'year',
    team_notes: 'Keep common note',
  }));
  const ids = [];
  const start = performance.now();
  await check(
    'one parsed archive persists ' + count + ' teams in replay-safe chunks',
    async () => {
      assert.equal(parsed.length, count);
      for (let i = 0; i < count; i += 5) {
        const batch = parsed.slice(i, i + 5),
          key = { operation_id, chunk_index: i / 5 };
        const r = await store.import(batch, key);
        ids.push(...r.ids);
        if (i === 5 || i === count - 5)
          assert.deepEqual(await store.import(batch, key), r);
      }
      const result = await store.list({
        plan: planQuery('tag:"Scale ' + stamp + '"'),
        include_archived: true,
      });
      assert.equal(result.total, count);
      assert.ok(result.teams.length <= 30);
      assert.equal(new Set(ids).size, count);
      const t = await store.get(ids[0]);
      assert.equal(t.team_date, '2024');
      assert.equal(t.source_name, 'Alice');
      assert.equal(t.version.team_notes, 'Keep common note');
      assert.equal(t.version.original_text, parsed[0].original_text);
    },
  );
  console.log(
    'Import ' +
      count +
      ' measured ' +
      (performance.now() - start).toFixed(1) +
      ' ms (storage adapter, excludes network).',
  );
  await check(
    'changed retry payload is rejected and completed chunks remain',
    async () => {
      await assert.rejects(
        () =>
          store.import([{ ...parsed[0], title: 'Changed' }], {
            operation_id,
            chunk_index: 0,
          }),
        /retry differs/i,
      );
      assert.equal(
        (
          await store.list({
            plan: planQuery('tag:"Scale ' + stamp + '"'),
            include_archived: true,
          })
        ).total,
        count,
      );
    },
  );
  await check(
    'failed import chunk has no receipt or partial teams and can be corrected',
    async () => {
      const key = { operation_id, chunk_index: 9999 };
      await assert.rejects(() =>
        store.import([parsed[0], { ...parsed[1], title: '' }], key),
      );
      const r = await store.import([parsed[0]], key);
      assert.equal(r.count, 1);
      ids.push(...r.ids);
      assert.deepEqual(await store.import([parsed[0]], key), r);
    },
  );
  await check(
    'select all returns authorized IDs without full snapshots',
    async () => {
      const selection = await store.list({
        plan: planQuery('tag:"Scale ' + stamp + '"'),
        include_archived: true,
        ids_only: true,
      });
      assert.equal(selection.ids.length, count + 1);
      assert.equal(selection.teams, undefined);
      assert.equal(
        (
          await other.list({
            plan: planQuery('tag:"Scale ' + stamp + '"'),
            include_archived: true,
            ids_only: true,
          })
        ).ids.length,
        0,
      );
    },
  );
  await check(
    'bulk tags are atomic and replay does not duplicate tags',
    async () => {
      const key = { operation_id: crypto.randomUUID(), chunk_index: 0 };
      const batch = ids.slice(0, 5),
        patch = { tags: ['Bulk Added'] };
      const before = await store.get(batch[0]);
      const r = await store.bulk(batch, patch, key);
      assert.deepEqual(await store.bulk(batch, patch, key), r);
      const t = await store.get(batch[0]);
      assert.ok(t.tags.includes('Tournament Grade'));
      assert.equal(t.tags.filter((x) => x === 'Bulk Added').length, 1);
      assert.deepEqual(t.history, before.history);
    },
  );
  await check(
    'bulk delete checks every owner and does not partly delete',
    async () => {
      const foreign = await other.import([parsed[0]]);
      await assert.rejects(
        () =>
          store.bulkDelete([ids[0], foreign.ids[0]], {
            operation_id: crypto.randomUUID(),
            chunk_index: 0,
          }),
        /missing|another|not found/i,
      );
      assert.ok(await store.get(ids[0]));
      await other.delete(foreign.ids[0]);
    },
  );
  await check(
    'bulk delete is one replay-safe operation including history and links',
    async () => {
      const share = await store.share(ids[0]);
      assert.equal(share.token.length, 64);
      const op = crypto.randomUUID();
      for (let i = 0; i < ids.length; i += 5) {
        const batch = ids.slice(i, i + 5),
          key = { operation_id: op, chunk_index: i / 5 };
        const r = await store.bulkDelete(batch, key);
        assert.deepEqual(await store.bulkDelete(batch, key), r);
      }
      assert.equal(
        (
          await store.list({
            plan: planQuery('tag:"Scale ' + stamp + '"'),
            include_archived: true,
          })
        ).total,
        0,
      );
      await assert.rejects(() => store.get(ids[0]), /not found/i);
    },
  );
}
