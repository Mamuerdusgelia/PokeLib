import { canonicalFormat, formatSearchValues } from './formats';
import { planQuery } from './search';
import {
  queryWithFilters,
  filterLabels,
  type SearchChip,
} from './search-filters';
import {
  cleanMeta,
  type TeamRecord,
  type TeamMeta,
  type Snapshot,
} from './domain';

export const collectionSorts = [
  'modified_desc',
  'modified_asc',
  'title_asc',
  'title_desc',
  'created_desc',
  'created_asc',
  'date_desc',
  'date_asc',
  'format',
  'source',
] as const;
export function cleanDefinition(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('Invalid collection filters.');
  const p = input as Record<string, unknown>;
  if (
    typeof p.query !== 'string' ||
    !Array.isArray(p.filters) ||
    p.filters.length > 30
  )
    throw Error('Invalid collection filters.');
  const query = p.query
    .trim()
    .replace(
      /\b(team|pokemon|move|item|ability|nature|tera|tag|source|from|year|format|note):(?:"([^"]+)"|([^\s]+))/gi,
      (original, field, quoted, single) =>
        field.toLowerCase() !== 'format'
          ? original
          : 'format:"' +
            canonicalFormat(quoted ?? single).replace(/["\r\n]/g, ' ') +
            '"',
    );
  const filters: SearchChip[] = p.filters.map((input) => {
    if (!input || typeof input !== 'object')
      throw Error('Invalid collection filter.');
    const c = input as Record<string, unknown>;
    if (
      typeof c.field !== 'string' ||
      !Object.hasOwn(filterLabels, c.field) ||
      typeof c.value !== 'string' ||
      !c.value.trim() ||
      c.value.length > 200
    )
      throw Error('Invalid collection filter.');
    return {
      field: c.field as SearchChip['field'],
      value: c.field === 'format' ? canonicalFormat(c.value) : c.value.trim(),
    };
  });
  const sort = typeof p.sort === 'string' ? p.sort : 'modified_desc';
  if (!collectionSorts.some((s) => s === sort))
    throw Error('Invalid collection sort.');
  const fullQuery = queryWithFilters(filters, query);
  const plan = planQuery(fullQuery);
  return {
    version: 1 as const,
    query,
    filters,
    sort,
    favourite: p.favourite === true,
    plan: {
      ...plan,
      meta: plan.meta.map((t) =>
        t.field === 'format'
          ? { ...t, values: formatSearchValues(t.value) }
          : t,
      ),
    },
  };
}
export type CollectionDefinition = ReturnType<typeof cleanDefinition>;
export type CollectionRecord = {
  id: string;
  name: string;
  description: string;
  definition: CollectionDefinition;
  created_at: string;
  updated_at: string;
  has_share: boolean;
};
export function cleanCollection(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('Invalid collection.');
  const p = input as Record<string, unknown>;
  if (
    typeof p.id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      p.id,
    )
  )
    throw Error('Invalid collection ID.');
  if (
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    p.name.trim().length > 120
  )
    throw Error('Enter a collection name of 1–120 characters.');
  if (typeof p.description !== 'string' || p.description.length > 1000)
    throw Error('Keep the collection description below 1,000 characters.');
  return {
    id: p.id,
    name: p.name.trim(),
    description: p.description.trim(),
    definition: cleanDefinition(p.definition),
    expected_updated_at:
      typeof p.expected_updated_at === 'string' ? p.expected_updated_at : null,
  };
}
export function collectionParams(definition: CollectionDefinition) {
  return {
    plan: definition.plan,
    sort: definition.sort,
    favourite: definition.favourite,
    include_archived: true,
    year: definition.filters.some(
      (c) => c.field === 'year' && c.value === 'unknown',
    )
      ? 'unknown'
      : '',
    group_families: true,
  };
}
export type PublicTeam = TeamMeta & {
  id: string;
  current_version_id: string;
  variant_name: string;
  variant_description: string;
  version: Snapshot;
  family_key?: string;
  matching_variant_count?: number;
};
export function publicTeam(team: TeamRecord, grouped = false): PublicTeam {
  const version = { ...team.version };
  delete version.set_editing;
  return {
    ...cleanMeta(team),
    id: team.id,
    current_version_id: team.current_version_id,
    variant_name: team.variant_name || 'Main',
    variant_description: team.variant_description || '',
    version,
    ...(grouped
      ? {
          family_key: team.family_key || team.family_id || team.id,
          matching_variant_count: team.matching_variant_count || 1,
        }
      : {}),
  };
}
export function sharedSelection(input: {
  page?: unknown;
  family?: unknown;
  team?: unknown;
}) {
  const page = input.page === undefined ? 0 : Number(input.page);
  if (!Number.isInteger(page) || page < 0 || page > 100000)
    throw Error('Invalid page.');
  for (const value of [input.family, input.team])
    if (
      value !== undefined &&
      (typeof value !== 'string' || !/^[a-f0-9-]{36}$/i.test(value))
    )
      throw Error('Invalid selection.');
  if (input.family && input.team) throw Error('Choose a family or variant.');
  return {
    page,
    family: input.family as string | undefined,
    team: input.team as string | undefined,
  };
}
