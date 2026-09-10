# Scale, variants and collections — implemented relationships

## Hosted Supabase verification — 2026-09-10

The existing 12 PostgreSQL migrations are now applied to the real project on PostgreSQL 17.6. Exact catalog and privilege verification passed for 13 RLS tables, 33 indexes, 10 policies, 9 application triggers and 28 application functions. Supabase's separate `public.rls_auto_enable()` event-trigger function was preserved and is not counted as a PokéLib function. No second schema or migration rewrite was introduced.

Real distinct Auth users passed owner isolation through application RPCs and direct table reads. Anonymous table reads and authenticated direct inserts/updates/deletes were denied on all 13 tables; capability resolvers remained available with restricted results. Backup records were restored under the receiving user with fresh IDs, and forged owner fields were rejected. See PROGRESS.md for the complete hosted verification scope and cleanup status.

## Full-fidelity backup/restore additions — 2026-09-10

D1 `0008_talented_rick_jones.sql` and PostgreSQL `202609100007_backups.sql` add `backup_generations` (owner-scoped monotonic portable-data generation), `backup_restores` (owner/operation, validated manifest hashes, namespace, progress, compact active-variant context), and `backup_teams_order` for keyset export. Portable-table insert/update/delete triggers update the generation transactionally; search terms, receipts and capabilities do not belong to portable state. New Drizzle metadata includes the hand-checked expression index.

Restore operations use existing `operation_chunks` for committed chunk receipts. They insert new materialized families, variants and revisions in relationship order without relaxing frozen-history, current-pointer or family guards. Current pointers advance only after the referenced revision exists. Derived current terms and all historical comment words are rebuilt incrementally; tags and live collection definitions are restored without share rows. Whole-file server validation happens before creating an operation, and ownership is always the authenticated adapter owner. Concurrent portable-data changes stop further chunks. The operation reports committed effects, not a global transaction or automatic rollback of earlier chunks.

Backup IDs are sequential archive-local product IDs, not table keys. A fresh per-operation namespace generates UUIDs for every family/variant/revision/collection; normalized reusable tags can reuse an existing destination tag. Source owner IDs, capabilities, hashes, derived query plans/indexes and runtime rows never enter the file. BACKUP_FORMAT.md documents every portable field, validation rule and compatibility/recovery limit. Existing table data is not rewritten by either migration.

Originally designed at c3a93a9; canonical formats, grouped variants, chunked bulk workflows and live collections are implemented through ec42344. PokéLib (formerly TeamVault) preserves existing snapshot rows and IDs. The pre-beta cleanup pass reuses these APIs and requires no database migration.

## Existing boundary

The final search polish adds only PostgreSQL migration `202609100006_team_core_search.sql`, replacing private query helpers to support clause AND and same-slot Mega equivalents. D1 uses its existing schema/indexes. Both engines retain prior collection plans without data rewriting, reindexing or new membership tables.

`teams` currently holds owner, metadata and the current pointer; `team_versions` holds editable current/frozen historical snapshots. Search terms are relational and correlated by team/version/slot. Tags are reusable owner concepts. Capability shares authorize one current team and its numbered history. D1 uses atomic batches; PostgreSQL uses owner-checked RPCs and row locks. Library pages return 30 records but currently contain full current snapshots; facets aggregate metadata in SQL.

## Canonical formats

Ship a pinned, generated metadata-only registry from official Showdown config/formats.ts. No runtime format download or simulator execution. Standard IDs are canonical; labels are presentation. Hierarchy is battle type (Singles/Doubles), generation/game, format. National Dex stays in its battle type. Known input spellings normalize using generation context; a bare Ubers with no context means the registry's current generation, never a historical generation guess. Unrecognized imported identifiers remain byte-for-byte except surrounding whitespace. Custom formats retain explicit generation/battle context as metadata. Historical raw snapshots are not re-parsed by format normalization.

## Families and variants (implemented)

Retain existing `teams` records as the storage unit for a **variant**, preserving every version's existing team_id. Add nullable family_id, default variant_name Main, and optional description. Add `team_families` with owner/title/timestamps. A legacy row with no family_id represents a virtual one-variant family whose ID is its existing team ID; create its family row only when explicitly adding a sibling. This avoids a large data backfill and preserves old links. Both adapters must expose identical effective family IDs.

A family owns the conceptual title; variant metadata (format, tags, provenance and Team Date) can differ between alternate builds. Variant notes/current/history stay in existing snapshots. Create/Duplicate variant copies selected raw body, original source, notes and private authoring flags into a new revision 1, with a new variant ID and no cross-variant parent pointer. Save/new revision/restore keep the current three-token protection. Family grouping is a paginated database query; return the matching variant explicitly and load other matching variants only on expansion.

Delete variant removes only that variant/history/links. Reject deletion of the final variant through this action and direct the user to Delete team family. Whole-family deletion is a separate named confirmation. Existing team share links remain variant scoped and retain numbered-history semantics.

Implementation refinement before the variant migration: family titles are synchronized into each sibling's existing metadata/title/search index by one explicit family rename transaction. In a materialized family, ordinary snapshot Save cannot rename the family; the family heading supplies that action. Variant names have a normalized sibling-unique key. A nullable single-column family foreign key allows SQLite ALTER ADD COLUMN without rebuilding the teams table; owner checks/guards validate the relationship. Clone uses an exact source snapshot with concurrency checks, revision 1 and no cross-variant history parent. Legacy single-team rows remain virtual families until a sibling is created.

Family library pages and counts group matching variants in SQL, select one matching representative per family, and load matching siblings in separate paginated requests. Legacy `list` remains variant-oriented for API compatibility; explicit `families`/`family_variants` actions provide the new UI projection. Family bulk selection resolves family IDs only. Bulk tagging expands a frozen selection to owned variant IDs before the existing five-variant write chunks; the dialog names the family/variant counts. Whole-family deletion instead deletes owned family IDs with cascading variants in one bounded family chunk so no family is accidentally half-deleted. Existing variant-scoped deletion refuses the last materialized sibling. Implementation uses a PostgreSQL owner advisory write lock before team locks to cover legacy materialization and older RPC delegation safely; this supersedes the planned family-only lock.

Implemented by D1 0005/0006 and PostgreSQL 202609100003. The nullable foreign key has ON DELETE CASCADE, family ownership/title triggers and sibling-name uniqueness. An owner/effective-family expression index makes expansion independent of total library size. Count and ID selection use DISTINCT effective family IDs directly; full metadata/snapshots are not carried through grouping windows.

## Bulk operations

Large input is parsed once, preview is paginated and persistence uses small server-validated chunks. Each import run/chunk uses an owner-scoped idempotency receipt with a request digest; retries return the recorded result, conflicting reuse is rejected. Receipt and team inserts commit together. Successful chunks survive failures; UI retries only unfinished chunks. No browser-only record store.

Bulk selection refers to whole families unless explicitly labeled variants. Selection resolves matching IDs server-side, freezes that bounded ID array in the browser, and rechecks ownership in every atomic chunk. No full snapshots are loaded for selection. One count/name confirmation starts bounded chunks with replay-safe progress. Add-tag unions tags. The in-dialog operation ID survives retry, but not a page reload; durable server receipts remain. Metadata actions expand all owned siblings before review; family deletion cascades all siblings in bounded atomic chunks.

## Collections and shared collections

Implementation refinement before the collection migration: persist a versioned definition containing canonicalized query text, structured filter chips, sort, favourites and a server-compiled query plan. Owner list/manage operations are paginated and optimistic updates compare updated_at. Collection names are unique per owner ignoring case. No membership table or team copies are created.

Live collection links authorize only current snapshots of matching variants, not their historical revisions or unmatched siblings. Public responses include the collection name/description and matching family counts, but omit saved query definitions, owner IDs, private sibling counts and authoring flags. Page/family/variant IDs are selection inputs only; the stored owner/query are always loaded through the hashed capability. PostgreSQL extracts the grouped list query into a revoked private owner-parameterized function, shared by the authenticated list wrapper and the token resolver. Future snapshot collections need separate immutable membership/revision tables.

`collections`: ID, owner, name, optional description, canonical saved query/filter definition, timestamps. Membership is computed, with no duplicate team data or folders. A separate `collection_shares` table stores 256-bit capability token hashes, creation/revocation timestamps and collection ID. Collection management is owner-only with PostgreSQL RLS and narrow RPC dispatch; D1 uses explicit owner predicates.

Anonymous collection resolution loads the saved query server-side using the hash. Client parameters may select a page or a matching variant, never replace the query/owner. Recheck membership for each detail read, including after tags change. Group matching variants under their family and expose only matching siblings. Revocation/regeneration invalidates prior links. Communicate live membership clearly. Future snapshot sharing can add explicit immutable membership/revision rows with a separate mode; do not overload live queries.

## Migration and recovery

Collections are implemented by D1 0007 and PostgreSQL 202609100005. Tables and private helper relationships follow the design above. No existing teams or historical snapshots are rewritten. Local recovery backup is `.artifacts/library-scale/dev-before-collections.sqlite`, created with SQLite's backup API before applying 0007. The mode column currently accepts live semantics only; snapshot membership is intentionally not implemented.

Append D1 and PostgreSQL migrations together; leave prior migrations untouched. Schema-only D1 deltas must be bounded, nullable foreign-key additions and constant defaults. Existing single-variant records remain usable without backfill. Test migration from the old schema with snapshots/notes/shares, ownership and concurrent saves in both engines before applying locally or publishing. Before local application, copy the exact dev SQLite database into ignored .artifacts while the dev server is stopped or use SQLite's backup API; never copy a live WAL database unsafely. Recovery uses that verified backup in development; production recovery is an append-only corrective migration. Deployment may apply migrations before Worker upload, so new nullable/default fields must remain compatible with the old application during rollout. Keep both adapters covered when adding any future migration.

## Scale measurement

Use isolated deterministic synthetic 1k/5k/10k libraries with six-set templates, generations, singles/doubles, dates, tags and provenance. Record database-adapter timings separately from real HTTP/browser measurements; report median/max and payload size, never label local SQLite as hosted D1 latency. Inspect query plans for indexes. No synthetic data goes into the user's library. Preserve raw history and stale-write correctness before optimizing persistence.
