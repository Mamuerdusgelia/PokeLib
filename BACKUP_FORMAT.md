# PokéLib backup format v1

This is the portable recovery format for PokéLib product data. It is independent of D1 and PostgreSQL table layouts. Showdown text export is a separate, deliberately smaller interchange format.

## File and version contract

The application prepares a Download backup link for `pokelib-backup-YYYY-MM-DD.jsonl.gz`: a gzip stream of UTF-8 JSON Lines. Each line is one JSON object followed by LF, including the last line. Line separators belong to the archive; embedded CRLF, blank lines, Unicode and other retained team text are JSON strings and are preserved. Gzip reduces repeated structure/history substantially and supports native browser/Worker streaming without another dependency. An uncompressed JSON Lines file below the upload limit is also accepted. A conventional single-object JSON or Showdown export is not this format.

The first line has exactly `format: "pokelib-backup"`, `schema_version: 1`, `exported_at` (ISO timestamp), `app_version` and `counts`. Counts has `families`, `variants`, `revisions` (including current revisions), `tags`, and `collections`. The last line is `{ "type": "end", "counts": ... }` with matching counts. Missing footer, extra content, unsupported versions, broken ordering or mismatched counts reject the file. There is no “successful partial export.”

The decoder dispatch begins with the version check in `lib/backup-format.ts`. Future versions must introduce an explicit decoder/migration into the common restore model; never reinterpret an unsupported future schema as v1. SQL migrations and backup schema versions are separate.

## Ordered product records

Records between the header and footer occur in this order:

1. `tag`: `id`, `name`. Includes unused reusable tags.
2. For each `family`: `id`, `title`, `variants` (count), `created_at`, `updated_at`; followed by all of its variants.
3. Each `variant`: `id`, `family`, `name`, `description`, `meta`, `current_revision`, `revisions`, `favourite`, `archived`, `created_at`, `updated_at`, `imported_at`, and `snapshot` containing revision 1. Its remaining history immediately follows as `revision` records with `variant` and `snapshot`.
4. `collection`: `id`, `name`, `description`, `definition`, `created_at`, `updated_at`.

IDs are sequential positive ordinals within each entity type, starting at 1. They have no authentication meaning and contain no provider identifiers. Family/variant order is arbitrary but a closed family or variant cannot be reopened later. History numbers are the app's contiguous `1..n` sequence; current is `n`. A snapshot's `parent_revision` is null or an earlier number in that same variant, so restoring an older revision can retain its non-adjacent parent. Initial revisions have no parent. These ordering rules allow full graph validation with one active family/variant rather than a library-sized revision-ID map.

`meta` preserves title, format, optional custom `format_context` (`generation`, `battle`), tags, source type/name/URL/note, Team Date and precision. Tag strings reference the reusable tag vocabulary case-insensitively while retaining their variant spelling. Raw metadata is validated, not silently truncated or reparsed.

Each portable snapshot preserves `version_number`, `parent_revision`, `version_comment`, `showdown_text`, `original_text`, `parsed_team`, `team_notes`, `set_notes`, optional private `set_editing`, and `created_at`. Parsed set extension fields are retained as bounded JSON. Set-note and editing-provenance positions remain associated with their sets. Raw/source text is never regenerated from parsed sets during restore. Only database identity fields and `edit_revision` are regenerated.

Collection `definition` contains `query`, `filters` (field/value chips), `sort`, and `favourite`. It represents a live saved search, not copied membership. Compiled query plans and their internal version are excluded and rebuilt through `cleanDefinition` and the current search planner.

## Included and excluded state

Included: conceptual families (including legacy virtual Main families), every variant and complete history, meaningful snapshot and metadata fields above, reusable tags and relationships, favourites, legacy archived flags, collections, creation/update/import timestamps. A legacy singleton becomes an explicit family after restoration without changing its visible meaning.

Excluded: owner/auth/provider IDs; standalone and collection capability secrets, hashes and revocation rows; search terms; operation receipts and restore-run state; generated caches; migration bookkeeping; transient editing/concurrency tokens. Auth sessions, account settings and local view preferences are not library content. No network request is made to an archived provenance URL.

**Share links are not restored. Restored variants and collections are private.** Existing shares in the destination account remain unchanged. Users can create new links explicitly after restoration. No “previously shared” field is exported.

## Validation and ownership

File selection runs a complete streaming validation pass in the browser and displays a preview. No request writes library data at selection. After explicit confirmation, `/api/backup` authenticates the account, checks origin, streams and validates the complete file again, and only then creates an owner-scoped restore receipt. Even a malformed final record creates no database row. This requires no temporary uploaded-file storage or new storage binding.

Validation checks required/unknown fields, scalar types and limits, actual calendar dates/timestamps, IDs/order/counts, family membership and sibling names, history continuity/parents/current pointer, reusable tag references, note/provenance positions, saved queries and index size. Unsupported protocols, URL credentials, NUL/unpaired-surrogate strings, excessive nesting and prototype-pollution keys are rejected. HTTP(S) provenance links are stored without fetching them. Parsed-set extension fields are data, never ownership or query instructions.

On confirmation, a fresh random server-generated namespace maps `(entity type, archive ordinal)` to a new UUID using SHA-256 (UUID version 8 bits). Revision IDs use `(variant ordinal, revision number)`. Ownership always comes from the authenticated adapter, never the archive. Mapping is deterministic only inside that restore operation; another restore receives different IDs. The PostgreSQL RPC independently binds ownership, derives IDs, validates record/order constraints, checks parent/owner foreign keys, and retains existing RLS/private-function permissions. No service-role key is used.

## Additive restore, failures and retries

Only **Restore into current library** is implemented. Existing families/variants are never matched or overwritten by title. Reusable tags with the same normalized name reuse the destination tag; existing tag spelling is retained in the destination vocabulary, while variant metadata keeps its backed-up spelling. A colliding collection name receives ` (restored <operation-prefix>-<ordinal>)`, with the base shortened to fit 120 characters. Existing collections are unchanged. An exceptional collision with that generated name fails visibly and preserves the committed progress.

Replace-library mode is deferred: deletion plus a large multi-request restore cannot honestly provide global atomic recovery. The existing separately confirmed Delete All flow is unchanged.

The server receipt binds SHA-256 digests of every validated restore chunk. The digest input is the UTF-8 concatenation of `JSON.stringify(parsedRecord) + "\n"` for each record in that chunk, in file order; header/footer are validated separately. The manifest digest is SHA-256 of `JSON.stringify({header, hashes})`. These digests bind retries to the validated input; they are not signatures or proof that a user-supplied file is trustworthy. Gzip supplies its standard corruption check; a separate portable archive-level cryptographic checksum is deferred rather than inventing an ambiguous canonical-JSON signature.

Chunks commit in order, atomically per D1 batch / PostgreSQL transaction, with durable exact counters and receipts. Families precede variants; a variant's first snapshot is inserted with its team, then subsequent revisions advance its current pointer only after insertion. Tag relationships and rebuilt indexes are committed with that revision. Historical comment words remain searchable; current note/set terms replace the previous current terms. Collection plans are recompiled. Final counters and all declared histories are checked before the last transaction succeeds.

A failed chunk rolls back completely. Retrying an acknowledged or unacknowledged successful chunk does not duplicate it. Any concurrent portable-data change in the destination stops later chunks; both adapters compare the generation inside the write transaction, and PostgreSQL locks the generation row. This prevents deletion or editing of earlier restored data from being silently accepted as a complete recovery. Keep the destination unchanged until completion. After a conflicting edit, that operation cannot safely resume; a fresh recovery adds another copy, and restoring into an empty account avoids retaining partial copies. Earlier chunks remain visible; a paused restore can show a family with only some variants or a variant whose latest committed revision precedes the source's final revision. No committed current pointer or parent references a missing version. A family header may exist before its first variant and is not yet visible in the normal library.

The UI saves only the operation ID and manifest digest locally. After reopening/reloading, select the same file and confirm Resume; the server revalidates it and returns durable progress before continuing. Keep the original file. File contents and credentials are not placed in local storage. If local storage is unavailable or cleared, automatic rediscovery of that run is unavailable; the receipt remains server-side. An intentionally new restore adds a new copy. There is no rollback-all or abandoned-run cleanup UI in v1. Receipt retention/garbage collection is deferred; receipts contain hashes/counters and the active variant's metadata context, never share credentials.

## Bounds and consistency

Limits are explicit: 64 MiB compressed/uploaded; 512 MiB expanded; 2 MiB per JSON record (each snapshot is limited to 1,900,000 serialized bytes so its wrappers remain below transport limits); 10,000 families; 50,000 variants; 250,000 revisions; 10,000 revisions per variant; 10,000 tags; 10,000 collections; 10,000 restore chunks. Ordinary records are grouped at 256 KiB or 40 records; an individually larger record uses its own chunk. Field-specific limits include 24 sets, 150k raw-text characters, 500k original-text characters, 50k team-note characters, 10k characters per set note, 2k revision-comment characters, and bounded parsed JSON depth 16. A revision's rebuilt terms must stay within 20k entries and 1.5 MB serialized. Oversized existing data causes an explicit export error instead of a truncated backup.

Export uses keyset database pages, at most 40 snapshot candidates with a roughly 512 KiB byte budget (one larger record allowed). It does not call the unpaginated team-history API. Server responses contain bounded pages; only the browser retains compressed byte chunks for the eventual download Blob, capped at 64 MiB. The browser never assembles all parsed families/history into an array. Validation and restoration re-read the selected file incrementally. Compression/DecompressionStream support is required for gzip files in supported modern browsers.

An owner-scoped monotonic generation changes transactionally with portable-state writes, including current saves, tags and collections. Every page and the final export check must match the starting generation. Concurrent edits/deletes/imports cause the whole export to fail visibly before download. No long database lock or stale apparently-complete archive is used.

The hosted Worker has a 128 MB isolate budget; these limits do not override platform CPU, body, database size, query, or account quotas. The largest restore batch is below the paid D1 invocation query limit; this workflow targets the existing Sites runtime / paid Workers, not D1's 50-query free invocation limit. See [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [Worker limits](https://developers.cloudflare.com/workers/platform/limits/). Local measured heap, archive/page/request sizes and timings are recorded in PERFORMANCE.md; they are not hosted latency or concurrent-isolate guarantees.

## Reproduction and migrations

`node scripts/test.mjs` includes deterministic two-way D1/PostgreSQL round trips, raw/history preservation, sharing omissions, search/editing semantics, invalid-file rejection, chunk rollback/replay/concurrency and private RPC boundaries. `node scripts/test-backup-http.mjs` runs only against the isolated `POKELIB_QA=1` server, creates browser fixtures, and checks the actual upload boundary; use its `cleanup` argument afterward. `node --max-old-space-size=96 --expose-gc scripts/benchmark-backup.mjs 1000` (also 5000 and 10000) uses fresh in-memory databases only.

D1 `0008_talented_rick_jones.sql` and PostgreSQL `202609100007_backups.sql` add receipts, generation tracking and the bounded export index/RPC. Prior migrations and snapshots remain unchanged. PostgreSQL setup outside the isolated test engine is a separate task. This document and every backup source/test/migration file are included in the AGPL corresponding-source offer.
