import { Dex } from '@pkmn/dex';
import { canonicalFormat } from './formats';
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
  for (const species of Dex.species.all()) {
    if (species.forme?.startsWith('Mega')) {
      const entity: Term = {
        field: 'pokemon',
        value: normalize(species.name),
        ...(species.requiredItem || species.requiredMove
          ? {
              equivalent: [
                { field: 'pokemon', value: normalize(species.baseSpecies) },
                species.requiredItem
                  ? { field: 'item', value: normalize(species.requiredItem) }
                  : { field: 'move', value: normalize(species.requiredMove!) },
              ],
            }
          : {}),
      };
      entities.set(normalize(species.name), entity);
      entities.set(
        normalize(`Mega ${species.baseSpecies} ${species.forme.slice(4)}`),
        entity,
      );
    }
  }
  // Resolve upstream aliases to the existing canonical index values; no reindex.
  for (const [alias, name] of Object.entries(Dex.data.Aliases)) {
    if (typeof name !== 'string') continue;
    const entity = entities.get(normalize(name));
    if (entity && !entities.has(normalize(alias)))
      entities.set(normalize(alias), entity);
  }
  return entities;
}
export function planQuery(q: string): QueryPlan {
  if (q.length > 400) throw Error('Keep search below 400 characters.');
  // Only unquoted + separates members. Metadata belongs to the whole variant.
  const parts = [''];
  let quoted = false;
  for (const char of q) {
    if (char === '"') quoted = !quoted;
    if (char === '+' && !quoted) parts.push('');
    else parts[parts.length - 1] += char;
  }
  if (parts.length === 1) return planClause(q);
  const parsed = parts.map(planClause);
  const clauses = parsed
    .filter((p) => p.set.length || p.free.length)
    .map(({ set, free }) => ({ set, free }));
  if (clauses.length > 6)
    throw Error('Use at most six team-member conditions.');
  return { meta: parsed.flatMap((p) => p.meta), set: [], free: [], clauses };
}
function planClause(q: string): QueryPlan {
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
      const entity = set ? dictionary().get(normalize(value)) : undefined;
      (set ? plan.set : plan.meta).push(
        entity && entity.field === field
          ? entity
          : {
              field,
              value: normalize(
                field === 'format' ? canonicalFormat(value) : value,
              ),
            },
      );
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
      plan.meta.push({
        field: 'format',
        value: normalize(canonicalFormat(token)),
      });
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
      (q.field === 'note' ? terms : metadata).some(
        (t) => t.field === q.field && t.value === q.value,
      ),
    )
  )
    return false;
  const slots = [
    ...new Set(terms.filter((t) => t.slot >= 0).map((t) => t.slot)),
  ];
  return [plan, ...(plan.clauses || [])].every(
    (clause) =>
      (!clause.set.length && !clause.free.length) ||
      (!!clause.fallback?.length &&
        clause.fallback.every((value) =>
          metadata.some((t) => t.value === value),
        )) ||
      slots.some(
        (slot) =>
          clause.set.every((q) => {
            const has = (term: Term) =>
              terms.some(
                (t) =>
                  t.slot === slot &&
                  t.field === term.field &&
                  t.value === term.value,
              );
            return (
              has(q) || (!!q.equivalent?.length && q.equivalent.every(has))
            );
          }) &&
          clause.free.every((value) =>
            terms.some(
              (t) => (t.slot < 0 || t.slot === slot) && t.value === value,
            ),
          ),
      ) ||
      (!clause.set.length &&
        clause.free.every((value) => metadata.some((t) => t.value === value))),
  );
}
