# Duplicate-team cleanup verification

Implemented and verified locally on 2026-09-14. Production is unchanged; no remote migration or deployment was performed.

## Behavior and normalization

- Scan all non-deleted indexes in the active LocalLibrary namespace, including cached Cloud indexes and visible records carrying the legacy `archived` flag, independent of search, filters, or pagination. No full-payload downloads or team writes during detection.
- Wait for library loading, account resolution, other dialogs, and any in-flight initial sync before scanning. A 300 ms deferred scan keeps it off the first render. Anonymous users can be scanned offline. Signed-in users with no local dismissal defer the optional suggestion until this session has successfully read the remote account preference; a cached false never bypasses this check. Library loading and manual workflows do not wait for that request.
- Require exactly six parsed Pokémon. Resolve each species through the project's `@pkmn/dex` canonical species ID; skip unknown species. Sort all six IDs, preserving multiplicity. Distinct form IDs stay distinct; nicknames and build details do not affect the key.
- Format key: `normalize(canonicalFormat(format, format_context?.generation))`. This uses the existing registry/aliases and contextual generation, followed by NFKC normalization, lowercase, and removal of non-ASCII alphanumeric characters. Unknown/custom formats use the same final normalization on their retained format text.
- Exclude any team whose family key differs from its ID, whose family has multiple live members, or whose indexed variant count exceeds one. Group the remaining teams with a Map; detection is linear in library size (six identities per team).
- One modal contains all groups, names, formats, dates, and sprites. No team is automatically selected for deletion; at least one must be retained. The existing confirmation dialog remains a separate explicit step.

## Persistence and mutations

`duplicate-suggestion-seen-v1` remains in the existing IndexedDB values store under `anonymous` or `account/<immutable account ID>`. Anonymous dismissal remains browser-local. For signed-in accounts, the additive `202609140001_duplicate_suggestion.sql` migration adds `lf_accounts.duplicate_suggestion_seen`, exposed as `duplicateSuggestionSeen` through the existing `local_first` preferences/preferences_save RPC. Ownership is derived from `auth.uid()`, never a caller-supplied account ID. The old RPC implementation is preserved as a private, non-client-executable helper for unrelated actions.

The existing LocalLibrary sync lifecycle reads the account preference and sends a true-only patch when local dismissal is not yet reflected remotely. The local true bit is durable pending state: no separate sync service, queue, timer, or endpoint is introduced. Existing online/focus/30-second sync retries carry offline dismissals after reconnection and reopening. A dismissal-only patch preserves autoCloud and acknowledgement; server-side OR makes the flag monotonic even when an older device sends false. Locally, incoming false never overwrites a true dismissal.

Each signed-in LocalLibrary instance starts with the optional suggestion gated until a successful remote preference response includes the new boolean field. An already-dismissed account therefore never briefly displays the dialog while preferences load, including when this browser has a stale cached false. A missing/old-server field also safely defers the suggestion. Account switching creates a new library instance and namespace. A local true suppresses immediately even offline; a fresh offline session without known dismissal waits for connectivity only for this suggestion. Cross-device propagation of an offline action necessarily occurs after its originating device reconnects and syncs. Detection performs no network request of its own and does not block normal library rendering.

Dismissal/Not now/cancel writes only this preference. Successful cleanup merges and deletion chunks persist it atomically with their normal local transaction. Detection does not write it when there are no matches.

Merge reuses `MergeFamilyDialog` and `family_merge`, retaining the original records, IDs, snapshots/history, complete set data, notes, tags, source metadata, dates, and shares. Only `family_id` and the existing unique `variant_name` assignment change; the chosen team is Main. Cleanup merges preserve `updated_at` too. Cloud rows follow existing dirty/sync behavior after explicit confirmation.

Because these merges preserve timestamps, the existing upload retry identity and acknowledgement comparison now also include family ID and variant name. This prevents a family-only change being mistaken for an already-uploaded retry, or an older in-flight upload clearing a newer cleanup merge's dirty state. SQL-backed tests verify the merged records and unchanged dates on a second device, including a merge during a delayed upload.

Deletion reuses `BulkActionDialog`, durable chunk receipts, and `family_bulk_delete`: the existing 10-minute undo, Live-share revocation, Snapshot retention, and Local/Cloud rules apply. Transaction-time validation rejects stale or nonmatching selections and prevents accidentally expanding a newly formed family. Replayed deletion receipts remain safe.

## What “archived teams” means

This is a legacy/internal compatibility flag, not an active user-facing archive feature and not deletion/recovery state. `DECISIONS.md` explicitly records that archive controls/navigation were removed, stored flags retained, and ordinary library queries made inclusive (`include_archived: true`). The current LocalLibrary list filters deletion tombstones but does not hide records with `archived: true`; its archived facet is always zero. There is no current archive/unarchive button or archive navigation in the UI.

Storage locations:

- `TeamRecord.archived` in `lib/domain.ts`, retained in local IndexedDB team payloads and lightweight indexes.
- Cloud JSON payload/summary in `lf_cloud` (validated/preserved by `lib/cloud-server.ts`).
- Legacy SQL `teams.archived`: integer in the SQLite/Drizzle schema, boolean in the legacy Supabase schema.

Normal current creation, Showdown import, and local copies start with `archived: false` in `lib/local-library.ts`. Existing flagged records may come from the former archive workflow or compatible metadata/bulk APIs (`patch.archived` is still accepted), and native backup restore explicitly preserves the archived field (`lib/local-backup.ts`, `lib/backup-format.ts`). These compatibility paths do not imply that there is still a user-facing archive command. A backup “archive” file is also unrelated to this boolean.

Actual deletion/recovery uses the separate local `deletedAt` tombstone and Cloud `deleted_at`, with pending delete/restore actions and the 10-minute undo window. Such deleted records are excluded from duplicate detection.

Flagged-but-not-deleted records were included because they remain visible, accessible teams in the current library; excluding them would silently omit part of the requested scan. No archive semantics, defaults, controls, persistence, or restoration behavior were changed by this feature.

## Files changed

- `lib/duplicate-teams.ts`: canonical signatures and standalone grouping.
- `lib/local-library.ts`: scoped scan/dismiss actions, transactional seen state, and stale-selection guard.
- `components/duplicate-cleanup.tsx`: automatic compact cleanup experience.
- `components/library.tsx`: loaded-library integration.
- `components/variants.tsx`: optional guarded standalone merge path using original IDs.
- `components/bulk-actions.tsx`: optional guarded cleanup deletion path.
- `app/workflows.css`: bounded group scrolling and row spacing.
- `scripts/test-duplicate-teams.mjs`: domain and local persistence integration coverage.
- `scripts/test-duplicate-accounts.mjs`: actual SQL migration/RPC and cross-device/offline account preference coverage.
- `scripts/test-duplicate-browser.mjs`: real browser/IndexedDB acceptance coverage.
- `supabase/migrations/202609140001_duplicate_suggestion.sql`: additive account setting and compatible preference RPC extension (not applied remotely).
- `scripts/test.mjs`: register new automated suite.
- `DUPLICATE_CLEANUP_VERIFICATION.md`: this report.

## Checks and results

- `node scripts/test.mjs`: PASS, including the new duplicate suite and existing search, families, imports/exports, backup, snapshot/live-link, account isolation, and Local/Cloud sync coverage (all 23 local-first integration groups passed).
- `node node_modules/typescript/bin/tsc --noEmit`: PASS.
- Targeted oxlint on new implementation files, all three duplicate tests, test runner, local-library, variants, and bulk-actions: PASS.
- Full oxlint: 63 existing diagnostics. Eleven in `components/library.tsx` exactly match linting its HEAD version by diagnostic code/message; the other 52 belong to unchanged files. No new diagnostics from this change.
- `git diff --check`: PASS (Git emits only its existing Windows line-ending conversion notices).
- Browser suite: PASS in headless Chrome against `scripts/serve-introduction-test.mjs`, the existing isolated Vite harness running the real AuthGate, Library, styles, and IndexedDB. No production backend used.
- Browser library: five realistic teams in two duplicate groups. Verified one modal, desktop/mobile layout, no preselected deletion, unchanged count before confirmation, confirmed deletion count, non-first Main selection, and suppression after reload and later imports for dismiss, merge, and delete.
- Account integration tests apply the actual complete migration chain to PGlite and exercise the authenticated RPC: delayed initial preference loading while library reads succeed, offline dismissal and retry after reopening, cross-device suppression, settings preservation, monotonic stale writes, family-merge completion sync, independent accounts and anonymous scopes, and denied anonymous/private-helper access.
- Browser account checks use separate browser contexts and a shared mocked settings service: dismiss on the first device, deliberately delay remote preferences on the second with stale cached false, verify no popup before/after resolution and usable library reads, then verify a different account receives its own suggestion.
- Visually inspected the 390 px mobile screenshot. Screenshots are under `.artifacts/duplicates/` (ignored local artifacts).
- Harness-only failures resolved: sandbox localhost connection timeouts required restarting the isolated server outside the sandbox; initial test assertions assumed group order, corrected to select a group by team name. Final browser suite passes all scenarios.
- Signed-in browser checks explicitly wait for the expected active account before seeding its local library. Restart the isolated Vite harness after editing singleton modules: hot reload can otherwise give direct test imports a different client singleton from the app. This caused an intermediate browser-only failure; final checks use a fresh harness.

For browser reruns, set `PLAYWRIGHT_MODULE` to an available Playwright module, start the existing harness, then run `node scripts/test-duplicate-browser.mjs`. Default origin is `http://127.0.0.1:3100`, restricted to localhost, and browser channel is Chrome.

## Final working tree

All thirteen files listed above belong to this feature. Final commit hash and post-commit working-tree status are reported in the task response. Production and remote databases remain unchanged; the additive migration is committed for a future deployment only.
