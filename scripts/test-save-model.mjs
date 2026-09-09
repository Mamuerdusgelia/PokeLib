import assert from 'node:assert/strict';
import { snapshotRevision } from '../.test-build/domain.mjs';
import { planQuery } from '../.test-build/search.mjs';

const draftOf = (team, patch = {}) => ({ ...team, ...team.version, ...patch });
const argsFor = (team, draft, parent = team.current_version_id, extra = {}) => [
  team.id,
  draft,
  team.current_version_id,
  parent,
  extra.revision ?? snapshotRevision(team.version),
  extra.updatedAt ?? team.updated_at,
];
export { argsFor, draftOf };

export async function testSaveModel({
  check,
  store,
  template,
  resolve,
  historicalWrite,
  identityWrite,
  rewind,
  otherOwner,
  legacyImport,
}) {
  const raw =
    'Darkrai @ Life Orb\nAbility: Bad Dreams\nTimid Nature\n- Dark Pulse\n- Ice Beam\nCustom Field: preserve this';
  const source = raw + '\nOriginal import marker';
  const authored = { authored: true, attack_iv: 'eligible', tera: 'auto' };
  const initialDraft = {
    ...template,
    title: 'Current save regression',
    showdown_text: raw,
    original_text: source,
    team_notes: 'Initialteamnote',
    set_notes: ['Initialsetnote'],
    set_editing: [authored],
    version_comment: 'Original version comment',
  };
  let team = await store.get((await store.import([initialDraft])).ids[0]);
  const first = structuredClone(team.version);
  const token = (await store.share(team.id)).token;
  const find = async (query) =>
    (await store.list({ plan: planQuery(query) })).teams.some(
      (t) => t.id === team.id,
    );
  await check(
    'Save updates current identity and private authoring state without adding history',
    async () => {
      team = await store.save(
        ...argsFor(
          team,
          draftOf(team, {
            showdown_text: raw.replace('Ice Beam', 'Thunderbolt'),
            team_notes: 'Firstteamnote',
            set_notes: ['Firstsetnote'],
            original_text: 'Must not overwrite original source',
            version_comment: 'Must not rename version',
            set_editing: [
              {
                ...authored,
                attack_iv: 'auto',
                discarded_key: 'not persisted',
              },
            ],
          }),
        ),
      );
      assert.equal(team.history.length, 1);
      assert.equal(team.current_version_id, first.id);
      assert.equal(team.version.version_number, 1);
      assert.equal(team.version.created_at, first.created_at);
      assert.equal(team.version.parent_version_id, null);
      assert.equal(team.version.original_text, source);
      assert.equal(team.version.version_comment, first.version_comment);
      assert.notEqual(snapshotRevision(team.version), snapshotRevision(first));
      assert.deepEqual(team.version.set_editing, [
        { ...authored, attack_iv: 'auto' },
      ]);
      assert.match(team.version.showdown_text, /Custom Field: preserve this/);
      assert.equal(team.version.team_notes, 'Firstteamnote');
      assert.deepEqual(team.version.set_notes, ['Firstsetnote']);
      assert.ok(await find('Darkrai Thunderbolt'));
      assert.equal(await find('Darkrai Ice Beam'), false);
      assert.equal(await find('note:Initialsetnote'), false);
    },
  );
  await check(
    'Repeated Save replaces move/note indexes and rejects stale revision even on same ID',
    async () => {
      const stale = structuredClone(team);
      team = await store.save(
        ...argsFor(
          team,
          draftOf(team, {
            showdown_text: team.version.showdown_text.replace(
              'Thunderbolt',
              'Psychic',
            ),
            team_notes: 'Secondteamnote',
            set_notes: ['Secondsetnote'],
          }),
        ),
      );
      assert.equal(team.history.length, 1);
      assert.notEqual(
        snapshotRevision(team.version),
        snapshotRevision(stale.version),
      );
      assert.ok(await find('Darkrai Psychic'));
      assert.equal(await find('Darkrai Thunderbolt'), false);
      assert.equal(await find('note:Firstteamnote'), false);
      assert.equal(await find('note:Firstsetnote'), false);
      assert.ok(await find('note:Secondsetnote'));
      for (const action of ['save', 'version']) {
        await assert.rejects(
          () =>
            store[action](
              ...argsFor(team, draftOf(stale), undefined, {
                revision: snapshotRevision(stale.version),
              }),
            ),
          /changed/,
        );
      }
      assert.deepEqual(await store.get(team.id), team);
    },
  );
  await check(
    'Living and current-numbered shares follow saves but omit builder-only flags',
    async () => {
      for (const number of [undefined, 1]) {
        const shared = await resolve(token, number);
        assert.equal(shared.version.id, first.id);
        assert.equal(shared.version.team_notes, 'Secondteamnote');
        assert.equal(shared.version.set_editing, undefined);
      }
    },
  );
  const frozen = structuredClone(team.version);
  await check(
    'Save as new version freezes exact raw/note state and accepts a comment',
    async () => {
      team = await store.version(
        ...argsFor(
          team,
          draftOf(team, {
            showdown_text: raw,
            team_notes: 'Newversionnote',
            set_notes: ['Newversionsetnote'],
            version_comment: 'Checkpointcomment',
          }),
        ),
      );
      assert.equal(team.history.length, 2);
      assert.equal(team.version.version_number, 2);
      assert.equal(team.version.parent_version_id, frozen.id);
      assert.equal(team.version.version_comment, 'Checkpointcomment');
      assert.deepEqual(
        team.history.find((v) => v.id === frozen.id),
        frozen,
      );
      assert.ok(await find('Checkpointcomment'));
      assert.ok(await find('Original version comment'));
    },
  );
  await check(
    'Historical Save, direct historical writes, identity changes and pointer rewind are rejected',
    async () => {
      await assert.rejects(
        () => store.save(...argsFor(team, { ...team, ...frozen }, frozen.id)),
        /immutable/i,
      );
      await historicalWrite(team, frozen);
      await identityWrite(team);
      await rewind(team, frozen);
      assert.deepEqual(await store.get(team.id), team);
    },
  );
  await check(
    'Current edits retain frozen history and pinned historical share content',
    async () => {
      team = await store.save(
        ...argsFor(
          team,
          draftOf(team, {
            team_notes: 'Currentaftercheckpoint',
            set_notes: ['Currentsetaftercheckpoint'],
            set_editing: [{ ...authored, attack_iv: 'manual', tera: 'manual' }],
          }),
        ),
      );
      assert.equal(team.history.length, 2);
      assert.deepEqual(
        team.history.find((v) => v.id === frozen.id),
        frozen,
      );
      const shared = await resolve(token, 1);
      assert.equal(shared.version.showdown_text, frozen.showdown_text);
      assert.deepEqual(shared.version.set_notes, frozen.set_notes);
      assert.equal(shared.version.team_notes, frozen.team_notes);
    },
  );
  const second = structuredClone(team.version);
  await check(
    'Restore creates a new current version and copies raw notes and editing state',
    async () => {
      team = await store.version(
        ...argsFor(
          team,
          {
            ...team,
            ...frozen,
            version_comment: 'Restore original saved version',
          },
          frozen.id,
        ),
      );
      assert.equal(team.history.length, 3);
      assert.equal(team.version.version_number, 3);
      assert.equal(team.version.parent_version_id, frozen.id);
      assert.equal(team.version.showdown_text, frozen.showdown_text);
      assert.equal(team.version.original_text, frozen.original_text);
      assert.equal(team.version.team_notes, frozen.team_notes);
      assert.deepEqual(team.version.set_notes, frozen.set_notes);
      assert.deepEqual(team.version.set_editing, frozen.set_editing);
      assert.deepEqual(
        team.history.find((v) => v.id === second.id),
        second,
      );
      assert.equal((await resolve(token)).version.version_number, 3);
    },
  );
  await check(
    'Owner isolation and missing optimistic inputs reject current Save',
    async () => {
      await otherOwner(team);
      await assert.rejects(
        () =>
          store.save(
            team.id,
            draftOf(team),
            team.current_version_id,
            team.current_version_id,
          ),
        /changed/,
      );
      assert.deepEqual(await store.get(team.id), team);
    },
  );
  await check(
    'Concurrent metadata change rejects a stale builder draft without overwriting title',
    async () => {
      const stale = team;
      team = await store.patch(team.id, { title: 'Concurrent title retained' });
      assert.notEqual(team.updated_at, stale.updated_at);
      assert.equal(
        snapshotRevision(team.version),
        snapshotRevision(stale.version),
      );
      for (const action of ['save', 'version'])
        await assert.rejects(
          () => store[action](...argsFor(stale, draftOf(stale))),
          /changed/,
        );
      assert.deepEqual(await store.get(team.id), team);
    },
  );
  await check(
    'Invalid builder metadata is rejected and imported sets remain unmanaged',
    async () => {
      await assert.rejects(
        () =>
          store.save(
            ...argsFor(
              team,
              draftOf(team, {
                set_editing: [
                  { authored: true, attack_iv: 'incorrect', tera: 'auto' },
                ],
              }),
            ),
          ),
        /editing metadata/,
      );
      const imported = await store.get(
        (await store.import([{ ...initialDraft, set_editing: undefined }]))
          .ids[0],
      );
      assert.equal(imported.version.set_editing, undefined);
      await store.delete(imported.id);
      assert.deepEqual(await store.get(team.id), team);
    },
  );
  await check(
    'Legacy snapshots use ID as revision and become editable without rewriting history',
    async () => {
      const legacy = await legacyImport({
        ...initialDraft,
        set_editing: undefined,
      });
      assert.equal(legacy.version.edit_revision, undefined);
      const original = structuredClone(legacy.version);
      const saved = await store.save(
        ...argsFor(legacy, draftOf(legacy, { team_notes: 'Legacy save' })),
      );
      assert.equal(saved.version.id, original.id);
      assert.equal(saved.version.created_at, original.created_at);
      assert.equal(saved.version.original_text, original.original_text);
      assert.equal(saved.history.length, 1);
      assert.notEqual(snapshotRevision(saved.version), original.id);
      await store.delete(saved.id);
    },
  );
  await check(
    'Authored and unmanaged slot metadata remain separate through save version and restore',
    async () => {
      let mixed = await store.get(
        (
          await store.import([
            {
              ...initialDraft,
              showdown_text: raw + '\n\nBlastoise\n- Surf',
              set_editing: [authored],
            },
          ])
        ).ids[0],
      );
      assert.deepEqual(mixed.version.set_editing, [authored, null]);
      mixed = await store.save(
        ...argsFor(
          mixed,
          draftOf(mixed, {
            set_editing: [{ ...authored, attack_iv: 'auto' }, null],
          }),
        ),
      );
      const saved = structuredClone(mixed.version);
      mixed = await store.version(
        ...argsFor(mixed, draftOf(mixed, { version_comment: '' })),
      );
      assert.deepEqual(mixed.version.set_editing, saved.set_editing);
      mixed = await store.version(
        ...argsFor(mixed, { ...mixed, ...saved }, saved.id),
      );
      assert.deepEqual(mixed.version.set_editing, saved.set_editing);
      assert.equal(mixed.version.set_editing[1], null);
      const reopened = await store.get(mixed.id);
      assert.deepEqual(reopened.version.set_editing, saved.set_editing);
      await store.delete(mixed.id);
    },
  );
  await store.delete(team.id);
}
