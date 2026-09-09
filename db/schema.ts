import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', {
  id: text().primaryKey(),
  created_at: text().notNull(),
});
export const teams = sqliteTable(
  'teams',
  {
    id: text().primaryKey(),
    owner_id: text().notNull(),
    title: text().notNull(),
    format: text().notNull(),
    team_date: text(),
    source_name: text().notNull(),
    metadata: text().notNull(),
    current_version_id: text().notNull(),
    favourite: integer().notNull().default(0),
    archived: integer().notNull().default(0),
    created_at: text().notNull(),
    updated_at: text().notNull(),
    imported_at: text(),
  },
  (t) => [
    index('teams_owner_updated').on(t.owner_id, t.archived, t.updated_at),
    index('teams_owner_date').on(t.owner_id, t.team_date),
    index('teams_owner_title').on(t.owner_id, t.title),
    index('teams_owner_modified_id').on(t.owner_id, t.updated_at, t.id),
    index('teams_owner_format_id').on(t.owner_id, t.format, t.id),
    index('teams_owner_created_id').on(t.owner_id, t.created_at, t.id),
  ],
);
export const versions = sqliteTable(
  'team_versions',
  {
    id: text().primaryKey(),
    team_id: text()
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    version_number: integer().notNull(),
    snapshot: text().notNull(),
    created_at: text().notNull(),
  },
  (t) => [
    uniqueIndex('versions_team_number').on(t.team_id, t.version_number),
    uniqueIndex('versions_team_id').on(t.team_id, t.id),
  ],
);
export const searchTerms = sqliteTable(
  'search_terms',
  {
    team_id: text()
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    version_id: text().notNull(),
    slot: integer().notNull(),
    field: text().notNull(),
    value: text().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.team_id, t.version_id, t.slot, t.field, t.value],
    }),
    index('terms_lookup').on(t.field, t.value, t.team_id, t.version_id, t.slot),
  ],
);
export const tags = sqliteTable(
  'tags',
  {
    id: text().primaryKey(),
    owner_id: text().notNull(),
    display_name: text().notNull(),
    normalized_name: text().notNull(),
  },
  (t) => [uniqueIndex('tags_owner_name').on(t.owner_id, t.normalized_name)],
);
export const teamTags = sqliteTable(
  'team_tags',
  {
    team_id: text()
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    tag_id: text()
      .notNull()
      .references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.team_id, t.tag_id] })],
);
export const shares = sqliteTable(
  'share_links',
  {
    id: text().primaryKey(),
    team_id: text()
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    token_hash: text().notNull(),
    created_at: text().notNull(),
    revoked_at: text(),
  },
  (t) => [
    uniqueIndex('share_hash').on(t.token_hash),
    index('share_team').on(t.team_id),
  ],
);
export const operationChunks = sqliteTable(
  'operation_chunks',
  {
    owner_id: text().notNull(),
    operation_id: text().notNull(),
    chunk_index: integer().notNull(),
    kind: text().notNull(),
    request_hash: text().notNull(),
    result: text().notNull(),
    created_at: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner_id, t.operation_id, t.chunk_index] })],
);
