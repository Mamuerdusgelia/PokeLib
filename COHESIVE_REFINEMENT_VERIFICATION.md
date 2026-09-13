# PokéLib cohesive refinement — verification report

Implementation and populated-browser acceptance are complete following explicit permission to use disposable teams in the existing local POKELIB_QA preview. See BROWSER_ACCEPTANCE_VERIFICATION.md for measurements, real interaction results, and cleanup evidence.

| Requirement | Change and verification |
| --- | --- |
| Merge existing teams | Bulk Merge into family dialog expands selected families, lists names, variant labels, formats, dates, source names, Pokémon and short IDs. Exactly one Main must be explicitly selected. Existing family IDs are reused/reassigned without copying records. Main appears first in expansion, including after native restoration. Automated tests select a non-first Main, reload, search individual members, and preserve snapshots/history/notes/source/title/order. |
| Pokémon order | Slot drag-and-drop uses insertion ordering with a highlighted insertion side. Existing compact keyboard/touch move-left/right buttons remain. The complete slot moves, including raw fields, notes and editing state. Tests cover save/reload, text conversion, variant copying, native restore and Cloud/live-share ordering. |
| Trainer name | Settings and the clickable sidebar identity expose a trainer name. IndexedDB stores it in the anonymous namespace or account/<user ID> namespace. A configured account name supplies the initial fallback. Future manual drafts use Built by plus this name. Alice → Bob tests confirm old sources remain Alice. No team metadata is rewritten by renaming. |
| Copyable exports | Matching, selected-family and entire-library scopes have Showdown text dialogs with a selectable textarea, clipboard copy and Download .txt. Existing download buttons remain. Both paths call showdownExportText → backupText; the modal download uses the exact displayed string. A 29-team export parses back into 29 teams. |
| Density | Five identifiable six-Pokémon teams fit at 1366 × 768 with 63 × 64 px sprites, including standalone/mixed lists and expanded families. Populated 390 × 844 and 1920 × 1080 layouts inspected. Privacy notice, navigation, collections, sorting and selection retained. |
| Arbitrary-text PokéPaste | Existing import flow accepts a large textarea. Extraction validates exact HTTPS pokepast.es URLs, tolerates common surrounding punctuation/quotes, ignores malformed/unrelated URLs, normalizes case/trailing slash, deduplicates and preserves first occurrence. Surrounding prose never becomes metadata. Each link uses existing api('pokepaste') → /api/cloud → previewPokepaste/Showdown parsing. Fetch concurrency is 1. Failures are collected by URL with concise reasons; successes remain available for preview/import. Completion stays open with imported/failed counts. Existing chunk receipts make interrupted saves retryable. |

## Existing-family behavior

- Library selection already selects whole families. The merge dialog lists every included team, including members hidden by a search filter; all are moved together.
- Direct partial-family merges are rejected before any mutation. Concurrently added family members require reopening the dialog.
- Conflicted/pending-storage records and families with recently deleted members cannot be reorganized until resolved. This prevents an Undo from silently restoring a member into an old family.
- Main gets the Main label. Other labels are retained where possible; former Main labels use their team title, and collisions receive numeric suffixes. Team titles, source, date, tags, notes, Pokémon and history remain unchanged.
- Remove from family detaches a variant into a standalone family without deleting or copying it. Removing a root that still has children is rejected with instructions to detach children first or merge the complete family with another Main.
- Existing live share identities remain attached to the same team IDs. Cloud verification uses real local PostgreSQL RPC/migrations and two simulated devices; another account is rejected.

## Storage and compatibility

No database schema change or migration is required. The existing family_id, variant fields, ordered Showdown snapshot and namespace preference store are used.

Native backup validation was adjusted to permit different team titles in one family. It still validates family membership, unique variant labels, tags, snapshots and history. Native backup/restore preserves grouping, Main ordering and Pokémon ordering. Standard Showdown text preserves team content and slot order; use native backups for organisational metadata and history.

Trainer overrides are deliberately browser-local and account-scoped, including for signed-in users. They do not change authentication/login identity or synchronize profile names between devices. Existing account names are used as the initial fallback; the editable trainer name is shown in the library sidebar. Trainer preferences are not included in team backups.

Cloud relationship changes use existing per-team snapshot synchronization and conflict handling; the local multi-team commit is atomic, while remote synchronization is eventual. No remote multi-team transaction or production migration was added.

## Verification results

- `node scripts/test.mjs`: exit 0, 325 PASS entries. Includes SQLite, PostgreSQL/RLS, local-first/account isolation, authentication, builder/Showdown, PokéPaste, search and native backup tests.
- Added `scripts/test-cohesive.mjs` and a cloud family/order/live-share integration group in `scripts/test-local-first.mjs`.
- Mass-import test: 1, 10 and 30 extracted links; commentary, repeated links, malformed/non-PokéPaste links and adjacent punctuation. A mocked 30-paste batch imports 29 successful teams and reports 1 missing paste, preserving order and authors. Peak request concurrency: 1.
- Real endpoint smoke test: all four example PokéPaste links in the brief returned HTTP 200 with one validated team each. This fetched previews only and persisted no browser or production teams.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passes.
- Targeted lint: changed feature modules checked with oxlint.
- Production build: source-offer packaging and vinext build pass. Existing large-chunk and route-classification notices remain.
- Populated browser checks completed on localhost:3001 with 18 realistic fixtures and nine real PokéPaste imports. The separate browser acceptance report supersedes the earlier permission blocker.
- Targeted feature lint passes. A wider run also checks four legacy modules: 15 existing diagnostics remain, with no new rule/message diagnostics compared with HEAD. Four unused imports were removed. This is not a claim that repository-wide lint is clean.

Important files: `lib/local-library.ts`, `lib/visual-team.ts`, `lib/pokepaste.ts`, `lib/backup-format.ts`, `components/library.tsx`, `components/variants.tsx`, `components/pokemon-set-editor.tsx`, `components/visual-team-editor.tsx`, `components/import-teams.tsx`, `components/storage-controls.tsx`, `components/auth-gate.tsx`, `app/redesign.css`, and the regression scripts above.

Production was not deployed, migrated or mutated. Cloud tests ran against disposable local PGlite databases. The browser preview uses the existing POKELIB_QA local-only configuration. No production accounts or team data were used for verification.
