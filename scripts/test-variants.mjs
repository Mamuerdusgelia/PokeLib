import assert from 'node:assert/strict';
import { demoDrafts } from '../.test-build/demo.mjs';
import { snapshotRevision } from '../.test-build/domain.mjs';
import { planQuery } from '../.test-build/search.mjs';
import { argsFor, draftOf } from './test-save-model.mjs';
const key = () => ({ operation_id: crypto.randomUUID(), chunk_index: 0 });
const clone = (t, name) => ({
  id: t.id,
  name,
  description: 'Matchup alternative',
  version_id: t.version.id,
  expected: t.current_version_id,
  expected_revision: snapshotRevision(t.version),
  expected_updated_at: t.updated_at,
  operation_id: crypto.randomUUID(),
});
export async function testVariants(store, other, check) {
  await check(
    'PokéPaste provenance persists in the adapter with Unknown date',
    async () => {
      const id = (
        await store.import([
          {
            ...demoDrafts[0],
            title: 'Pokepaste storage fixture',
            source_type: 'PokéPaste',
            source_name: 'Alice',
            source_url: 'https://pokepast.es/0123456789abcdef',
            source_note: 'PokéPaste: Test',
            team_date: null,
            team_date_precision: 'unknown',
            imported: true,
          },
        ])
      ).ids[0];
      const t = await store.get(id);
      assert.equal(t.source_type, 'PokéPaste');
      assert.equal(t.source_name, 'Alice');
      assert.equal(t.team_date, null);
      assert.ok(t.imported_at);
      await store.delete(id);
    },
  );
  let main = await store.get(
    (
      await store.import([
        {
          ...demoDrafts[0],
          title: 'Variantfamilyfixture',
          tags: ['Variantfixture'],
        },
      ])
    ).ids[0],
  );
  const original = structuredClone(main.history);
  let alt, request;
  await check(
    'legacy team is a virtual Main family and clone preserves exact raw/history',
    async () => {
      assert.equal(main.family_key, main.id);
      assert.equal(main.variant_name, 'Main');
      assert.equal(main.family_id, null);
      main = await store.variant('variant_rename', {
        id: main.id,
        name: 'Standard',
        expected_updated_at: main.updated_at,
      });
      request = clone(main, 'Anti-Stall');
      alt = await store.variant('variant_create', request);
      assert.equal(alt.family_key, main.id);
      assert.notEqual(alt.id, main.id);
      assert.equal(alt.history.length, 1);
      assert.equal(alt.version.version_number, 1);
      assert.equal(alt.version.parent_version_id, null);
      for (const field of [
        'showdown_text',
        'original_text',
        'parsed_team',
        'team_notes',
        'set_notes',
        'set_editing',
      ])
        assert.deepEqual(alt.version[field], main.version[field]);
      assert.deepEqual((await store.get(main.id)).history, original);
    },
  );
  await check(
    'variant clone retry is idempotent and sibling names are unique',
    async () => {
      assert.equal((await store.variant('variant_create', request)).id, alt.id);
      await assert.rejects(
        () => store.variant('variant_create', clone(main, 'anti-stall')),
        /name|unique|duplicate/i,
      );
      assert.equal(
        (await store.list({ plan: planQuery(''), family_id: main.id })).total,
        2,
      );
    },
  );
  await check(
    'variants keep independent current saves and numbered history',
    async () => {
      alt = await store.save(
        ...argsFor(
          alt,
          draftOf(alt, {
            showdown_text:
              'Darkrai @ Focus Sash\nAbility: Bad Dreams\n- Ice Beam\n',
            team_notes: 'Alternative only',
          }),
        ),
      );
      alt = await store.version(
        ...argsFor(
          alt,
          draftOf(alt, { version_comment: 'Anti-Stall history' }),
        ),
      );
      assert.equal(alt.history.length, 2);
      assert.deepEqual((await store.get(main.id)).history, original);
      await assert.rejects(
        () =>
          store.variant(
            'variant_create',
            clone({ ...alt, updated_at: '2000-01-01T00:00:00Z' }, 'Stale'),
          ),
        /changed/,
      );
    },
  );
  await check(
    'family grouping returns matching variant and expansion is filtered',
    async () => {
      const plan = planQuery(
        'team:Variantfamilyfixture item:"Focus Sash" pokemon:Darkrai',
      );
      const r = await store.list({ plan, group_families: true });
      assert.equal(r.total, 1);
      assert.equal(r.teams[0].id, alt.id);
      assert.equal(r.teams[0].matching_variant_count, 1);
      assert.equal(r.teams[0].variant_count, 2);
      const expanded = await store.list({ plan, family_id: main.id });
      assert.deepEqual(
        expanded.teams.map((t) => t.id),
        [alt.id],
      );
      const selected = await store.list({
        plan,
        group_families: true,
        ids_only: true,
      });
      assert.deepEqual(selected.ids, [main.id]);
    },
  );
  await check(
    'family selection expands all siblings and owner checks reject guessed IDs',
    async () => {
      assert.deepEqual(
        new Set((await store.variant('family_expand', { ids: [main.id] })).ids),
        new Set([main.id, alt.id]),
      );
      await assert.rejects(
        () => other.variant('family_expand', { ids: [main.id] }),
        /missing|account/,
      );
      await assert.rejects(
        () => other.variant('variant_create', clone(alt, 'Stolen')),
        /not found/,
      );
      await assert.rejects(
        () =>
          other.variant('family_bulk_delete', { ids: [main.id], chunk: key() }),
        /missing|account/,
      );
    },
  );
  await check(
    'family rename synchronizes metadata/search without rewriting snapshots',
    async () => {
      main = await store.get(main.id);
      main = await store.variant('family_rename', {
        id: main.id,
        title: 'Renamedfamilyfixture',
        expected_updated_at: main.updated_at,
      });
      assert.equal((await store.get(alt.id)).title, 'Renamedfamilyfixture');
      assert.equal(
        (
          await store.list({
            plan: planQuery('team:Renamedfamilyfixture'),
            group_families: true,
          })
        ).total,
        1,
      );
      assert.equal(
        (
          await store.list({
            plan: planQuery('team:Variantfamilyfixture'),
            group_families: true,
          })
        ).total,
        0,
      );
      assert.deepEqual(main.history, original);
      alt = await store.get(alt.id);
      await assert.rejects(
        () =>
          store.save(
            ...argsFor(
              alt,
              draftOf(alt, { title: 'Accidental sibling title' }),
            ),
          ),
        /family|Rename/i,
      );
    },
  );
  await check(
    'variant deletion preserves siblings and final variant requires family action',
    async () => {
      await store.variant('variant_delete', { id: alt.id });
      assert.deepEqual((await store.get(main.id)).history, original);
      await assert.rejects(
        () => store.variant('variant_delete', { id: main.id }),
        /final variant/,
      );
      await assert.rejects(() => store.delete(main.id), /final variant/);
      await assert.rejects(
        () => store.bulkDelete([main.id], key()),
        /final variant/,
      );
    },
  );
  await check(
    'family deletion cascades every sibling/history and is replay safe',
    async () => {
      main = await store.get(main.id);
      const third = await store.variant(
        'variant_create',
        clone(main, 'Tournament'),
      );
      const p = { ids: [main.id], chunk: key() };
      assert.equal((await store.variant('family_bulk_delete', p)).count, 1);
      assert.equal((await store.variant('family_bulk_delete', p)).count, 1);
      await assert.rejects(() => store.get(main.id), /not found/);
      await assert.rejects(() => store.get(third.id), /not found/);
    },
  );
}
