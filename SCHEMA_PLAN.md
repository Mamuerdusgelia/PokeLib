# Scale, variants and collections — planned relationships

Reviewed at clean checkpoint c3a93a9. This is the implementation design, not a claim that all tables/features below exist yet. Existing snapshot rows and IDs must not be rewritten.

## Existing boundary

`teams` currently holds owner, metadata and the current pointer; `team_versions` holds editable current/frozen historical snapshots. Search terms are relational and correlated by team/version/slot. Tags are reusable owner concepts. Capability shares authorize one current team and its numbered history. D1 uses atomic batches; PostgreSQL uses owner-checked RPCs and row locks. Library pages return 30 records but currently contain full current snapshots; facets currently materialize all D1 metadata rows on the server.

## Canonical formats

Ship a pinned, generated metadata-only registry from official Showdown config/formats.ts. No runtime format download or simulator execution. Standard IDs are canonical; labels are presentation. Hierarchy is battle type (Singles/Doubles), generation/game, format. National Dex stays in its battle type. Known input spellings normalize using generation context; a bare Ubers with no context means the registry's current generation, never a historical generation guess. Unrecognized imported identifiers remain byte-for-byte except surrounding whitespace. Custom formats retain explicit generation/battle context as metadata. Historical raw snapshots are not re-parsed by format normalization.

## Families and variants (design before migrations)

Retain existing `teams` records as the storage unit for a **variant**, preserving every version's existing team_id. Add nullable family_id, default variant_name Main, and optional description. Add `team_families` with owner/title/timestamps. A legacy row with no family_id represents a virtual one-variant family whose ID is its existing team ID; create its family row only when explicitly adding a sibling. This avoids a large data backfill and preserves old links. Both adapters must expose identical effective family IDs.

A family owns the conceptual title; variant metadata (format, tags, provenance and Team Date) can differ between alternate builds. Variant notes/current/history stay in existing snapshots. Create/Duplicate variant copies selected raw body, original source, notes and private authoring flags into a new revision 1, with a new variant ID and no cross-variant parent pointer. Save/new revision/restore keep the current three-token protection. Family grouping is a paginated database query; return the matching variant explicitly and load other matching variants only on expansion.

Delete variant removes only that variant/history/links. Reject deletion of the final variant through this action and direct the user to Delete team family. Whole-family deletion is a separate named confirmation. Existing team share links remain variant scoped and retain numbered-history semantics.

## Bulk operations

Large input is parsed once, preview is paginated and persistence uses small server-validated chunks. Each import run/chunk uses an owner-scoped idempotency receipt with a request digest; retries return the recorded result, conflicting reuse is rejected. Receipt and team inserts commit together. Successful chunks survive failures; UI retries only unfinished chunks. No browser-only record store.

Bulk selection will refer to whole families unless explicitly labeled variants. The implemented pre-variant selection resolves matching IDs server-side, freezes that bounded ID array in the browser, and rechecks ownership in every atomic chunk. No full snapshots are loaded for selection. One count/name confirmation starts bounded chunks with replay-safe progress. Add-tag unions tags. The in-dialog operation ID survives retry, but not a page reload; durable server receipts remain. Family selection expansion must be designed before introducing siblings so existing destructive actions never silently change scope.

## Collections and shared collections

`collections`: ID, owner, name, optional description, canonical saved query/filter definition, timestamps. Membership is computed, with no duplicate team data or folders. A separate `collection_shares` table stores 256-bit capability token hashes, creation/revocation timestamps and collection ID. Collection management is owner-only with PostgreSQL RLS and narrow RPC dispatch; D1 uses explicit owner predicates.

Anonymous collection resolution loads the saved query server-side using the hash. Client parameters may select a page or a matching variant, never replace the query/owner. Recheck membership for each detail read, including after tags change. Group matching variants under their family and expose only matching siblings. Revocation/regeneration invalidates prior links. Communicate live membership clearly. Future snapshot sharing can add explicit immutable membership/revision rows with a separate mode; do not overload live queries.

## Migration and recovery

Append D1 and PostgreSQL migrations together; leave prior migrations untouched. Schema-only D1 deltas must be bounded, nullable foreign-key additions and constant defaults. Existing single-variant records remain usable without backfill. Test migration from the old schema with snapshots/notes/shares, ownership and concurrent saves in both engines before applying locally or publishing. Before local application, copy the exact dev SQLite database into ignored .artifacts while the dev server is stopped or use SQLite's backup API; never copy a live WAL database unsafely. Recovery uses that verified backup in development; production recovery is an append-only corrective migration. Deployment may apply migrations before Worker upload, so new nullable/default fields must remain compatible with the old application during rollout. Do not start the variant migration unless both adapter implementations and verification can be completed safely.

## Scale measurement

Use isolated deterministic synthetic 1k/5k/10k libraries with six-set templates, generations, singles/doubles, dates, tags and provenance. Record database-adapter timings separately from real HTTP/browser measurements; report median/max and payload size, never label local SQLite as hosted D1 latency. Inspect query plans for indexes. No synthetic data goes into the user's library. Preserve raw history and stale-write correctness before optimizing persistence.
