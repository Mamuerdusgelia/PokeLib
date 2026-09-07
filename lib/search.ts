import { Dex } from '@pkmn/dex';
import {
  normalize,
  words,
  type Term,
  type QueryPlan,
  type TeamMeta,
  type Snapshot,
} from './domain';
let entities: Map<string, Term> | undefined;
function dictionary() {
  if (entities) return entities;
  entities = new Map();
  for (const [field, items] of [
    ['nature', Dex.natures.all()],
    ['ability', Dex.abilities.all()],
    ['item', Dex.items.all()],
    ['move', Dex.moves.all()],
    ['pokemon', Dex.species.all()],
  ] as const) {
    for (const v of items) {
      entities.set(normalize(v.name), { field, value: normalize(v.name) });
    }
  }
  return entities;
}
export function planQuery(q: string): QueryPlan {
  if (q.length > 400) throw Error('Keep search below 400 characters.');
  const plan: QueryPlan = { meta: [], set: [], free: [] };
  const explicit =
    /\b(team|pokemon|move|item|ability|nature|tera|tag|source|from|year|format|note):(?:"([^"]+)"|([^\s]+))/gi;
  const rest = q.replace(explicit, (_, field, quoted, single) => {
    field = field.toLowerCase() === 'from' ? 'source' : field.toLowerCase();
    const value = quoted ?? single;
    const set = [
      'pokemon',
      'move',
      'item',
      'ability',
      'nature',
      'tera',
    ].includes(field);
    if (set || field === 'tag' || field === 'format' || field === 'year') {
      (set ? plan.set : plan.meta).push({ field, value: normalize(value) });
    } else {
      for (const v of words(value)) plan.meta.push({ field, value: v });
    }
    return ' ';
  });
  const explicitSet = plan.set.length;
  const tokens = rest.replace(/"/g, '').trim().split(/\s+/).filter(Boolean);
  const dict = dictionary();
  for (let i = 0; i < tokens.length;) {
    let found = false;
    for (let n = Math.min(5, tokens.length - i); n > 0; n--) {
      const value = normalize(tokens.slice(i, i + n).join(' '));
      const entity = dict.get(value);
      if (entity) {
        plan.set.push(entity);
        i += n;
        found = true;
        break;
      }
    }
    if (found) continue;
    const token = tokens[i++];
    if (/^gen\d/i.test(token))
      plan.meta.push({ field: 'format', value: normalize(token) });
    else if (/^\d{4}$/.test(token))
      plan.meta.push({ field: 'year', value: token });
    else plan.free.push(...words(token));
  }
  if (
    !explicitSet &&
    plan.set.length &&
    !(
      plan.set.some((t) => t.field === 'pokemon') &&
      plan.set.some((t) =>
        ['move', 'item', 'ability', 'nature', 'tera'].includes(t.field),
      )
    )
  )
    plan.fallback = words(rest);
  return plan;
}
export type IndexedTerm = Term & { slot: number; version_id: string };
export function indexTerms(
  meta: TeamMeta,
  version: Snapshot,
  comments: string[] = [],
): IndexedTerm[] {
  const out: IndexedTerm[] = [];
  const add = (field: string, value: string, slot = -1, full = false) => {
    const tokens = full ? [normalize(value)] : words(value);
    for (const token of tokens)
      if (token)
        out.push({
          field,
          value: token,
          slot,
          version_id: slot < 0 ? '' : version.id,
        });
  };
  add('team', meta.title);
  add('format', meta.format, -1, true);
  add(
    'source',
    [
      meta.source_type,
      meta.source_name,
      meta.source_note,
      meta.source_url,
    ].join(' '),
  );
  add('year', meta.team_date?.slice(0, 4) || '', -1, true);
  for (const tag of meta.tags) {
    add('tag', tag, -1, true);
    add('text', tag);
  }
  add('note', version.team_notes);
  add('text', [version.version_comment, ...comments].join(' '));
  version.parsed_team.forEach((p, slot) => {
    for (const [field, value] of [
      ['pokemon', p.species],
      ['item', p.item],
      ['ability', p.ability],
      ['nature', p.nature],
      ['tera', p.teraType],
    ] as const) {
      if (value) {
        add(field, value, slot, true);
        add('text', value, slot);
      }
    }
    add('text', p.name || '', slot);
    for (const move of p.moves) {
      add('move', move, slot, true);
      add('text', move, slot);
    }
    add('note', version.set_notes[slot] || '', slot);
  });
  return [
    ...new Map(
      out.map((t) => [[t.version_id, t.slot, t.field, t.value].join('|'), t]),
    ).values(),
  ];
}
export function matchesPlan(terms: IndexedTerm[], plan: QueryPlan) {
  const metadata = terms.filter((t) => t.slot < 0);
  if (
    !plan.meta.every((q) =>
      metadata.some((t) => t.field === q.field && t.value === q.value),
    )
  )
    return false;
  const slots = [
    ...new Set(terms.filter((t) => t.slot >= 0).map((t) => t.slot)),
  ];
  return (
    (!!plan.fallback?.length &&
      plan.fallback.every((value) =>
        metadata.some((t) => t.value === value),
      )) ||
    slots.some(
      (slot) =>
        plan.set.every((q) =>
          terms.some(
            (t) =>
              t.slot === slot && t.field === q.field && t.value === q.value,
          ),
        ) &&
        plan.free.every((value) =>
          terms.some(
            (t) => (t.slot < 0 || t.slot === slot) && t.value === value,
          ),
        ),
    ) ||
    (!plan.set.length &&
      plan.free.every((value) => metadata.some((t) => t.value === value)))
  );
}
