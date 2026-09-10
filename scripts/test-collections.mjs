import assert from 'node:assert/strict';
import { cleanDefinition } from '../.test-build/collections.mjs';
import { demoDrafts } from '../.test-build/demo.mjs';
import { snapshotRevision } from '../.test-build/domain.mjs';
import { argsFor, draftOf } from './test-save-model.mjs';
export async function testCollections(store, other, resolve, check) {
  const definition = {
    query: '',
    filters: [{ field: 'tag', value: 'Collectionfixture' }],
    sort: 'title_asc',
    favourite: false,
  };
  const input = {
    id: crypto.randomUUID(),
    name: 'Collection fixture',
    description: 'Live fixture',
    definition,
  };
  let c, token, main, sibling;
  await check('collection validation and canonical saved formats', async () => {
    const d = cleanDefinition({
      ...definition,
      query: 'format:"Gen 4 Ubers"',
      filters: [{ field: 'format', value: 'Gen 9 National Dex OU' }],
    });
    assert.equal(d.query, 'format:"gen4ubers"');
    assert.equal(d.filters[0].value, 'gen9nationaldex');
    assert.throws(() =>
      cleanDefinition({ ...definition, query: 'x'.repeat(401) }),
    );
    assert.throws(() =>
      cleanDefinition({
        ...definition,
        filters: [{ field: 'owner', value: 'escape' }],
      }),
    );
    c = await store.collection('collection_save', input);
    assert.equal(c.has_share, false);
    assert.equal(c.definition.sort, 'title_asc');
    assert.deepEqual(c.definition.filters, definition.filters);
    assert.equal((await store.collection('collection_save', input)).id, c.id);
    await assert.rejects(
      () =>
        store.collection('collection_save', {
          ...input,
          id: crypto.randomUUID(),
          name: input.name.toUpperCase(),
        }),
      /exists/,
    );
  });
  await check(
    'collections owner isolation and optimistic edit/delete',
    async () => {
      assert.equal((await other.collection('collection_list', {})).total, 0);
      for (const action of [
        'collection_get',
        'collection_share',
        'collection_revoke',
        'collection_delete',
      ])
        await assert.rejects(() =>
          other.collection(action, {
            id: c.id,
            expected_updated_at: c.updated_at,
          }),
        );
      await assert.rejects(() =>
        other.collection('collection_save', {
          ...input,
          expected_updated_at: c.updated_at,
        }),
      );
      const old = c;
      c = await store.collection('collection_save', {
        ...c,
        name: 'Renamed collection',
        expected_updated_at: c.updated_at,
      });
      await assert.rejects(
        () =>
          store.collection('collection_save', {
            ...old,
            expected_updated_at: old.updated_at,
          }),
        /changed/,
      );
      await assert.rejects(
        () =>
          store.collection('collection_delete', {
            id: c.id,
            expected_updated_at: old.updated_at,
          }),
        /changed/,
      );
      assert.equal(
        (await store.collection('collection_get', { id: c.id })).name,
        c.name,
      );
    },
  );
  await check(
    'shared collection groups matching current variants and omits private data',
    async () => {
      main = await store.get(
        (
          await store.import([
            {
              ...demoDrafts[0],
              title: 'Collection Family',
              tags: ['Collectionfixture'],
              team_date: null,
              team_date_precision: 'unknown',
            },
          ])
        ).ids[0],
      );
      sibling = await store.variant('variant_create', {
        id: main.id,
        name: 'Alternative',
        description: 'Sibling',
        version_id: main.version.id,
        expected: main.current_version_id,
        expected_revision: snapshotRevision(main.version),
        expected_updated_at: main.updated_at,
        operation_id: crypto.randomUUID(),
      });
      token = (await store.collection('collection_share', { id: c.id })).token;
      const r = await resolve(token, {
        query: '',
        owner_id: 'forged',
        plan: {},
      });
      assert.equal(r.mode, 'live');
      assert.equal(r.total, 1);
      assert.equal(r.teams[0].matching_variant_count, 2);
      assert.equal((await resolve(token, { family: main.id })).total, 2);
      for (const t of r.teams) {
        for (const field of [
          'owner_id',
          'history',
          'variant_count',
          'has_share',
          'favourite',
          'archived',
        ])
          assert.equal(t[field], undefined);
        assert.equal(t.version.set_editing, undefined);
        assert.equal(t.team_date_precision, 'unknown');
      }
      assert.equal(r.definition, undefined);
      const d = await resolve(token, { team: sibling.id, version: 1 });
      assert.equal(d.id, sibling.id);
      assert.equal(d.family_key, undefined);
    },
  );
  await check(
    'live membership rechecks every detail read and overlapping collections copy no teams',
    async () => {
      const second = await store.collection('collection_save', {
        ...input,
        id: crypto.randomUUID(),
        name: 'Overlapping collection',
      });
      const secondToken = (
        await store.collection('collection_share', { id: second.id })
      ).token;
      assert.equal(
        (await resolve(secondToken, {})).teams[0].family_key,
        main.id,
      );
      const unrelated = (
        await other.import([{ ...demoDrafts[0], tags: ['Collectionfixture'] }])
      ).ids[0];
      await assert.rejects(() => resolve(token, { team: unrelated }));
      await other.delete(unrelated);
      await store.patch(sibling.id, { tags: [] });
      const r = await resolve(token, {});
      assert.equal(r.teams[0].matching_variant_count, 1);
      await assert.rejects(() =>
        resolve(token, { team: sibling.id, query: '', plan: {} }),
      );
      assert.equal((await resolve(token, { family: main.id })).total, 1);
      const added = (
        await store.import([
          {
            ...demoDrafts[0],
            title: 'New member',
            tags: ['Collectionfixture'],
          },
        ])
      ).ids[0];
      assert.equal((await resolve(token, {})).total, 2);
      await store.delete(added);
      const current = await store.get(main.id);
      const saved = await store.version(
        ...argsFor(
          current,
          draftOf(current, { team_notes: 'Current public note' }),
        ),
      );
      assert.equal(
        (await resolve(token, { team: main.id, version: 1 })).version.id,
        saved.version.id,
      );
      const updated = await store.collection('collection_save', {
        ...c,
        definition: {
          ...definition,
          filters: [{ field: 'tag', value: 'No matches' }],
        },
        expected_updated_at: c.updated_at,
      });
      assert.equal((await resolve(token, {})).total, 0);
      assert.equal((await resolve(secondToken, {})).total, 1);
      c = await store.collection('collection_save', {
        ...updated,
        definition,
        expected_updated_at: updated.updated_at,
      });
      await store.collection('collection_delete', {
        id: second.id,
        expected_updated_at: second.updated_at,
      });
      await assert.rejects(() => resolve(secondToken, {}));
    },
  );
  await check(
    'collection regeneration/revocation/deletion invalidate capability links',
    async () => {
      const next = (await store.collection('collection_share', { id: c.id }))
        .token;
      assert.notEqual(next, token);
      await assert.rejects(() => resolve(token, {}));
      assert.equal((await resolve(next, {})).total, 1);
      await store.collection('collection_revoke', { id: c.id });
      await assert.rejects(() => resolve(next, {}));
      token = (await store.collection('collection_share', { id: c.id })).token;
      await store.collection('collection_delete', {
        id: c.id,
        expected_updated_at: c.updated_at,
      });
      await assert.rejects(() => resolve(token, {}));
      assert.ok(await store.get(main.id));
      await store.variant('family_bulk_delete', {
        ids: [main.id],
        chunk: { operation_id: crypto.randomUUID(), chunk_index: 0 },
      });
    },
  );
  await check(
    'collections paginate 30 saved searches and preserve unknown dates/favourites',
    async () => {
      const made = [];
      for (let i = 0; i < 31; i++)
        made.push(
          await store.collection('collection_save', {
            ...input,
            id: crypto.randomUUID(),
            name: 'Page fixture ' + i,
            definition: {
              ...definition,
              filters: [{ field: 'year', value: 'unknown' }],
              favourite: true,
            },
          }),
        );
      assert.equal(
        (await store.collection('collection_list', { page: 0 })).collections
          .length,
        30,
      );
      assert.equal(
        (await store.collection('collection_list', { page: 1 })).collections
          .length,
        1,
      );
      const id = (
        await store.import([
          { ...demoDrafts[0], team_date: null, team_date_precision: 'unknown' },
        ])
      ).ids[0];
      token = (await store.collection('collection_share', { id: made[0].id }))
        .token;
      const before = (await resolve(token, {})).total;
      await store.patch(id, { favourite: true });
      assert.equal((await resolve(token, {})).total, before + 1);
      await store.patch(id, { team_date: '2020', team_date_precision: 'year' });
      assert.equal((await resolve(token, {})).total, before);
      await store.delete(id);
      for (const x of made)
        await store.collection('collection_delete', {
          id: x.id,
          expected_updated_at: x.updated_at,
        });
    },
  );
}
