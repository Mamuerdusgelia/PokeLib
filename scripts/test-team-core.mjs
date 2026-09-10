import assert from 'node:assert/strict';
import { planQuery, indexTerms, matchesPlan } from '../.test-build/search.mjs';
import { snapshotRevision } from '../.test-build/domain.mjs';
import {
  cleanDefinition,
  collectionParams,
} from '../.test-build/collections.mjs';
import { argsFor, draftOf } from './test-save-model.mjs';
import { coreDraft, megaCore, rainCore } from './search-fixtures.mjs';

export async function testTeamCore(store, other, resolve, check) {
  const drafts = [
    coreDraft('Core complete'),
    coreDraft(
      'Core swapped',
      'Gengar @ Gengarite\n- Thousand Arrows\n\nZygarde\n- Shadow Ball',
    ),
    coreDraft('Core subset', 'Gengar @ Gengarite\n- Shadow Ball'),
    coreDraft(
      'Core explicit',
      megaCore.replace('Gengar @ Gengarite', 'Gengar-Mega'),
    ),
    coreDraft('Core wrong item', megaCore.replace('Gengarite', 'Black Sludge')),
    coreDraft('Core rain', rainCore),
    coreDraft('Core rain subset', rainCore.split('\n\nIncineroar')[0]),
    coreDraft(
      'Mega Gengar Zygarde Kyogre Tornadus Incineroar',
      'Pikachu\n- Thunderbolt',
    ),
    coreDraft(
      'Core item on another slot',
      'Gengar\n- Shadow Ball\n\nZygarde\n- Thousand Arrows\n\nPikachu @ Gengarite\n- Thunderbolt',
    ),
    coreDraft(
      'Core move-triggered Mega',
      'Rayquaza\n- Dragon Ascent\n\nZygarde\n- Thousand Arrows',
    ),
  ];
  const ids = (await store.import(drafts)).ids;
  const list = (q, extra = {}) =>
    store.list({
      plan: planQuery('tag:Corefixture ' + q),
      include_archived: true,
      group_families: true,
      ...extra,
    });
  const expect = async (q, positions) => {
    const r = await list(q);
    assert.equal(r.total, positions.length, q);
    assert.deepEqual(
      r.teams.map((t) => t.id).sort(),
      positions.map((i) => ids[i]).sort(),
      q,
    );
    for (let i = 0; i < ids.length; i++) {
      const t = await store.get(ids[i]);
      assert.equal(
        matchesPlan(indexTerms(t, t.version), planQuery(q)),
        positions.includes(i),
        'pure matcher: ' + q + '/' + i,
      );
    }
  };
  await check(
    'core search requires both actual members and accepts explicit/builder Mega forms',
    async () => {
      await expect('Mega Gengar + Zygarde', [0, 1, 3]);
      await expect('pokemon:"Mega Gengar"+pokemon:Zygarde', [0, 1, 3]);
      await expect('Gengar+Zygarde', [0, 1, 4, 8]);
      await expect('Mega Rayquaza + Zygarde', [9]);
    },
  );
  await check(
    'three-member core excludes subsets and metadata-only species mentions',
    () => expect('Kyogre + Tornadus + Incineroar', [5]),
  );
  await check(
    'qualified core clauses keep species and moves on their own sets',
    () => expect('Mega Gengar Shadow Ball + Zygarde Thousand Arrows', [0, 3]),
  );
  await check(
    'core metadata, format, tag, source, year and notes remain global',
    async () => {
      for (const filter of [
        'format:gen7ubers',
        'tag:"Tournament Grade"',
        'from:"Core archive"',
        'year:2017',
        'note:evidence',
      ])
        await expect('Mega Gengar + Zygarde ' + filter, [0, 1, 3]);
      assert.equal((await list('Mega Gengar + Zygarde year:2018')).total, 0);
      assert.equal(
        (await list('Kyogre + Tornadus tag:"Tournament Grade"')).total,
        2,
      );
    },
  );
  await check(
    'literal quoted plus, upstream aliases and trailing separator are handled',
    async () => {
      await expect('Mega Gengar + Zygarde tag:"Rain + Sun"', [0, 1, 3]);
      assert.equal(
        planQuery('lando + Tornadus').clauses[0].set[0].value,
        'landorus',
      );
      assert.equal((await list('Mega Gengar +')).total, 4);
      assert.throws(() => planQuery(Array(7).fill('Gengar').join('+')), /six/);
      const definition = cleanDefinition({
        query: 'Mega Gengar format:gen7ubers+Zygarde',
        filters: [],
        sort: 'title_asc',
      });
      assert.equal(definition.plan.clauses.length, 2);
      assert.equal((await store.list(collectionParams(definition))).total, 3);
    },
  );
  const main = await store.get(ids[2]);
  let sibling;
  await check(
    'core cannot combine members across siblings; matching representative is explicit',
    async () => {
      sibling = await store.variant('variant_create', {
        id: main.id,
        name: 'Complete core',
        version_id: main.version.id,
        expected: main.current_version_id,
        expected_revision: snapshotRevision(main.version),
        expected_updated_at: main.updated_at,
        operation_id: crypto.randomUUID(),
      });
      sibling = await store.save(
        ...argsFor(sibling, {
          ...draftOf(sibling),
          showdown_text: 'Zygarde\n- Thousand Arrows',
        }),
      );
      assert.equal(
        (await list('Mega Gengar + Zygarde', { family_id: main.id })).total,
        0,
      );
      sibling = await store.save(
        ...argsFor(sibling, { ...draftOf(sibling), showdown_text: megaCore }),
      );
      const r = await list('Mega Gengar + Zygarde', { family_id: main.id });
      assert.equal(r.total, 1);
      assert.equal(r.teams[0].id, sibling.id);
      assert.equal(r.teams[0].variant_name, 'Complete core');
      assert.equal(r.teams[0].matching_variant_count, 1);
      assert.equal(r.teams[0].variant_count, 2);
      const expanded = await list('Mega Gengar + Zygarde', {
        group_families: false,
        family_id: main.id,
      });
      assert.deepEqual(
        expanded.teams.map((t) => t.id),
        [sibling.id],
      );
      assert.equal(
        (
          await other.list({
            plan: planQuery('tag:Corefixture Mega Gengar + Zygarde'),
            group_families: true,
          })
        ).total,
        0,
      );
    },
  );
  let historical;
  await check(
    'core requires members in the current revision only',
    async () => {
      historical = await store.get(ids[0]);
      await store.version(
        ...argsFor(historical, {
          ...draftOf(historical),
          showdown_text: 'Gengar @ Gengarite\n- Shadow Ball',
        }),
      );
      assert.equal(
        (await list('Mega Gengar + Zygarde', { team_id: historical.id })).total,
        0,
      );
      assert.equal(
        (await store.get(historical.id)).history[1].showdown_text,
        historical.version.showdown_text,
      );
    },
  );
  await check(
    'saved core collections remain live and expose matching current siblings only',
    async () => {
      const c = await store.collection('collection_save', {
        id: crypto.randomUUID(),
        name: 'Core live test',
        description: '',
        definition: {
          query: 'Mega Gengar Shadow Ball + Zygarde Thousand Arrows',
          filters: [{ field: 'tag', value: 'Corefixture' }],
          sort: 'title_asc',
          favourite: false,
        },
      });
      const saved = await store.collection('collection_get', { id: c.id });
      assert.equal(saved.definition.plan.clauses.length, 2);
      assert.equal(
        (await store.list(collectionParams(saved.definition))).total,
        2,
      );
      const { token } = await store.collection('collection_share', {
        id: c.id,
      });
      const shared = await resolve(token, {});
      assert.equal(shared.total, 2);
      const expanded = await resolve(token, { family: main.id });
      assert.deepEqual(
        expanded.teams.map((t) => t.id),
        [sibling.id],
      );
      await assert.rejects(() => resolve(token, { team: main.id }));
      sibling = await store.save(
        ...argsFor(sibling, {
          ...draftOf(sibling),
          showdown_text: 'Gengar @ Gengarite\n- Shadow Ball',
        }),
      );
      assert.equal((await resolve(token, {})).total, 1);
      await assert.rejects(() => resolve(token, { team: sibling.id }));
      await store.collection('collection_delete', {
        id: c.id,
        expected_updated_at: c.updated_at,
      });
    },
  );
  for (const id of ids) {
    if (id === main.id)
      await store.variant('family_bulk_delete', {
        ids: [id],
        chunk: { operation_id: crypto.randomUUID(), chunk_index: 0 },
      });
    else await store.delete(id);
  }
}
