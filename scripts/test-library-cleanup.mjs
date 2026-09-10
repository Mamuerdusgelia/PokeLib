import assert from 'node:assert/strict';
import {
  prepareWorkspaceCleanup,
  deletionJob,
  runFamilyDeletion,
} from '../.test-build/library-cleanup.mjs';
import { demoDrafts } from '../.test-build/demo.mjs';
import { planQuery } from '../.test-build/search.mjs';
import { snapshotRevision } from '../.test-build/domain.mjs';

// Only called by the isolated in-memory D1 and PGlite suites, never a user database.
export async function testLibraryCleanup(store, other, check) {
  const request = (action, p) =>
    action === 'select'
      ? store.list({ ...p, ids_only: true, plan: planQuery(p.query || '') })
      : action.startsWith('collection_')
        ? store.collection(action, p)
        : store.variant(action, p);
  const base = {
    ...demoDrafts[0],
    format: 'gen9ubers',
    tags: ['Old Meta'],
    team_date: '2023',
    team_date_precision: 'year',
  };
  const ids = (
    await store.import(
      Array.from({ length: 42 }, (_, i) => ({
        ...base,
        title: 'Cleanup ' + i,
      })),
    )
  ).ids;
  const keep = await store.get(
    (await store.import([{ ...base, title: 'Keep newer', team_date: '2024' }]))
      .ids[0],
  );
  const otherId = (
    await other.import([{ ...base, title: 'Other owner retained' }])
  ).ids[0];
  const main = await store.get(ids[0]);
  const alt = await store.variant('variant_create', {
    id: main.id,
    name: 'Alternative',
    description: '',
    version_id: main.version.id,
    expected: main.current_version_id,
    expected_revision: snapshotRevision(main.version),
    expected_updated_at: main.updated_at,
    operation_id: crypto.randomUUID(),
  });
  await store.patch(alt.id, { team_date: '2024', team_date_precision: 'year' });
  let selected;
  await check(
    'filtered cleanup selects all 42 families beyond one page and removes all siblings',
    async () => {
      const query = 'format:gen9ubers year:2023 tag:"Old Meta"';
      const page = await store.list({
        group_families: true,
        include_archived: true,
        plan: planQuery(query),
      });
      assert.equal(page.teams.length, 30);
      assert.equal(page.total, 42);
      selected = await request('select', {
        group_families: true,
        include_archived: true,
        query,
      });
      assert.equal(selected.ids.length, 42);
      const job = deletionJob({ ids: selected.ids, collectionIds: [] });
      const progress = [];
      let fail = true;
      const lossy = async (action, p) => {
        const r = await request(action, p);
        if (action === 'family_bulk_delete' && fail) {
          fail = false;
          throw Error('response lost after committed chunk');
        }
        return r;
      };
      await assert.rejects(
        () => runFamilyDeletion(lossy, job, () => {}),
        /response lost/,
      );
      assert.equal(job.next, 0);
      await runFamilyDeletion(request, job, (p) => progress.push(p.next));
      assert.equal(job.next, 42);
      assert.ok(progress.length > 6);
      assert.equal(progress.at(-1), 42);
      await assert.rejects(() => store.get(alt.id));
      assert.deepEqual(await store.get(keep.id), keep);
      assert.ok(await other.get(otherId));
    },
  );
  const collections = [];
  await check(
    'workspace review freezes IDs, paginates collection scope and makes no mutations',
    async () => {
      await store.import(
        Array.from({ length: 37 }, (_, i) => ({
          ...base,
          title: 'Whole workspace ' + i,
          archived: i % 2 === 0,
        })),
      );
      for (let i = 0; i < 31; i++) {
        const c = await store.collection('collection_save', {
          id: crypto.randomUUID(),
          name: 'Cleanup collection ' + i,
          description: 'Retain this saved search',
          definition: {
            query: '',
            filters: [],
            sort: 'title_asc',
            favourite: false,
          },
        });
        await store.collection('collection_share', { id: c.id });
        collections.push(c);
      }
      const scope = await prepareWorkspaceCleanup(request);
      assert.ok(scope.ids.length > 30);
      assert.equal(scope.collectionIds.length, 31);
      assert.ok(scope.ids.includes(keep.id));
      assert.ok(!scope.ids.includes(otherId));
      assert.equal(
        (await store.collection('collection_get', { id: collections[0].id }))
          .has_share,
        true,
      );
      assert.ok(await store.get(keep.id));
    },
  );
  await check(
    'whole workspace cleanup keeps tags/collections and revokes their links, with owner checks',
    async () => {
      const scope = await prepareWorkspaceCleanup(request);
      const job = deletionJob(scope);
      const otherBefore = await other.get(otherId);
      const foreignJob = deletionJob({ ids: [otherId], collectionIds: [] });
      await assert.rejects(() =>
        runFamilyDeletion(request, foreignJob, () => {}),
      );
      assert.equal(foreignJob.next, 0);
      await runFamilyDeletion(request, job, () => {});
      assert.equal(
        (
          await request('select', {
            group_families: true,
            include_archived: true,
            query: '',
          })
        ).total,
        0,
      );
      assert.equal(job.nextLink, 31);
      for (const c of collections) {
        const kept = await store.collection('collection_get', { id: c.id });
        assert.deepEqual(kept.definition, c.definition);
        assert.equal(kept.has_share, false);
      }
      assert.ok(
        (await store.facets({ include_archived: true })).tags.includes(
          'Old Meta',
        ),
      );
      assert.deepEqual(await other.get(otherId), otherBefore);
    },
  );
  for (const c of collections)
    await store.collection('collection_delete', {
      id: c.id,
      expected_updated_at: c.updated_at,
    });
  await other.delete(otherId);
}
