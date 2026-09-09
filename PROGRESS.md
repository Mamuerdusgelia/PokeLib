# Active work — 2026-09-10

The large-library brief in attachment efab8b97 is active. User requested continuing after this foundation; do not interpret the older next-task list below as current scope. Starting clean checkpoint was c3a93a9. Source has not yet been republished in this pass; the previous owner-only deployment remains live until final verification/publication.

## Completed foundation

- Canonical Showdown format registry/picker and Singles/Doubles → generation/game → competitive-format navigation; unknown strings preserved, explicit Custom / Other generation/battle context, old format alias search, no raw history rewrite.
- 1k/5k/10k isolated six-set libraries measured. At 10k the same-set median fell from 2746.05 to 26.98 ms; initial-page median 82.75 to 2.91 ms. Pagination selects IDs before joining snapshots. See PERFORMANCE.md for medians/maxima, selection/bulk measurements, payloads and limitations.
- One 1,000-team UI import with 50 previews/page, common metadata, five-team chunks, progress and owner-scoped durable retry receipts. Automated tests prove replay/failed-chunk behavior on D1 and PostgreSQL.
- Page selection accumulates across pages; all matching selection returns at most 10,000 IDs, with actions blocked until selection finishes. Bulk Add tag / metadata and Delete share chunk receipts and progress. One delete confirmation; exact partial counts; atomic ownership/concurrency rechecks.
- Empty Pokémon slot opens the selector with search focused and fewer repeated labels. Format suggestions are computed only while the picker is open.
- D1 grouped search/tag inserts reduce six-set Save statement count 194→14; guards remain. Real request-stage/variant Save profiling remains to do.
- D1 0003 indexes and 0004 operation_chunks plus matching PostgreSQL 202609100001/0002 migrations. Local D1 applied after SQLite backup API. The initial command accidentally created a separate empty default Wrangler state; that directory was moved into ignored .artifacts/library-scale/unused-default-wrangler-state. Correct migrations used --persist-to .wrangler/state.

## Verification at the foundation

Foundation was committed as 9ad90b5 (canonical formats, indexed large libraries and replay-safe bulk workflows).

## Variants completed after the foundation

- Additive D1 0005/0006 and PostgreSQL 202609100003 implement lazy families, legacy Main, sibling names/descriptions and independent current/history. Create/Duplicate copies exact snapshot content into revision 1 with a durable retry receipt; Rename variant and explicit family rename are atomic. Last-variant deletion is guarded at the database boundary.
- Library pages/counts/select-all group families. Expand loads matching siblings only, 30/page. Bulk metadata explicitly resolves all sibling IDs before confirmation; family deletion is a separate atomic chunk including all sibling history/shares. Existing variant shares expose only that variant's name/description and history.
- Both adapters pass the expanded 199-check suite (74 D1/domain, 56 PostgreSQL, other suites unchanged). HTTP variants/clone replay/grouping/expansion/restricted shares/family deletion pass alongside the existing suite. TypeScript PASS; production build PASS across all five Vinext phases with regenerated corresponding source. Lint remains at 66 pre-existing diagnostics, with none in the new variant/bulk components and helpers.
- Browser: imported disposable QA Variant acceptance, renamed Main to Standard, created Anti-Stall, saved Ice Beam only on Anti-Stall, searched same-set and expanded the single matching sibling. Whole-family metadata dialog named 1 family / 2 variants; applying year 2020 updated both without altering either raw build. Family delete confirmation names every variant/history/share and focuses Cancel. QA family removed.
- Exact local backup: .artifacts/library-scale/dev-before-variants.sqlite (SQLite backup API). Original six teams, 13 snapshot rows and share rows compared unchanged after migrations and final HTTP/browser fixture cleanup; foreign_key_check is empty. Local migrations applied with --persist-to .wrangler/state.
- Grouped 1k/5k/10k family benchmarks include 5% extra siblings. Initial 10k-family median 305.24→123.90 ms after narrowing grouping and counting distinct IDs directly; expansion 10.77→0.70 ms after expression index. These are local SQLite measurements, not hosted D1 latency; see PERFORMANCE.md.
- New key files: lib/variants.ts; lib/demo-variants.ts; components/variants.tsx; scripts/test-variants.mjs; both variant migrations. Keep family title/variant metadata/history boundaries and owner write-lock order from DECISIONS.md.

## Foundation verification (historical)

- Automated suite PASS: 183 checks (66 D1/domain, 48 PostgreSQL, 13 UX, 10 builder, 25 Showdown, 13 defaults, 8 formats).
- HTTP integration PASS after final functional fixes: authentication, Save/history/restore/share plus format normalization, import replay, ID-only selection, bulk tags/deletion, origin rejection.
- TypeScript PASS. Lint remains FAIL: 66 existing diagnostics (previous checkpoint 67); no diagnostics in the new format/import/bulk/test helpers. Production build PASS (all five Vinext phases; 184-file corresponding-source archive). The Sites 0.1.66 build helper failed in Windows command quoting; the same package build succeeded through PowerShell with a command-scoped safe.directory exception for this checkout. No global Git setting changed.
- Browser: empty-slot autofocus; Gen 4 Ubers; National Dex singles/doubles; stored custom Gen 5 Doubles and local-today date; 1,000 one-set import with progress and Unknown dates; page selection 30→60; select all 1,001 fixtures; bulk tag; one-confirmation deletion. Read-only comparison confirms all 6 original teams, 13 snapshots and 2 share rows unchanged; every QAScale20260910 fixture was removed. Browser navigation had intermittent timeouts and pointer clicks during moving layouts; keyboard activation and subsequent state verification completed checks. Physical touch/assistive tech remains unverified.

## Next work, in priority order

1. Private saved-query Collections CRUD and canonical filters; no duplicate memberships/folders.
2. Live collection capability sharing, rotate/revoke, membership checked at every detail read, matching variants grouped, no client query override.
3. Repeated one/six-set real Save/new history/Create variant timing stages, before/after medians/outliers, preserve persistence-confirmed Saved and three-token guards.
4. Re-run complete adapter/HTTP/type/build verification, update all docs/source offer, commit clean, publish owner-only, verify deployed source and access.

## Limits / decisions to preserve

Variants were committed clean as 28c747a. PokéPaste import is now implemented after that commit: authenticated allowlisted /json read, bounded streaming/timeout/no redirects, normal preview/chunked persistence, title/author/URL/notes and Unknown date. Supabase 202609100004 adds its provenance type; no D1 schema change. Automated tests pass (207 checks: 75 D1/domain, 57 PostgreSQL, 13 UX, 10 builder, 25 Showdown, 13 defaults, 8 formats, 6 PokéPaste). TypeScript and live HTTP PASS; lint remains the existing 66 diagnostics. Production build/source regeneration will run after the remaining scope. The separate real-service test succeeded against https://pokepast.es/a47bb2a45883213e (Mono Hoenn by Moldy). Browser preview/import also retained author/URL/Unknown date; its exact QA family was verified and deleted via HTTP after the browser tab closed. No fixture remains.

- Variants are implemented; collections remain design-only. Existing Save/history now belong to individual variants, and old share links remain variant scoped.
- In-dialog retry works; refreshing/remounting loses the UI operation descriptor. Receipts persist indefinitely for safe replay; retention/expiry and durable UI resumption need design. Legacy unchunked API/WebMCP import and selected export still have a 200-team request bound; large archives use the new Import dialog.
- Custom identifiers are still grouped/searched by name. Reusing one unknown identifier in multiple generation/battle contexts is ambiguous in the single format facet map; preserve per-team context and revisit compound facets if needed.
- Full current snapshot DTOs are returned for each 30-team page. No 10k full objects reach the library browser; selection is ID-only. Large per-team history/detail remains unpaginated. 20 MB is an input ceiling, not a promise that every complex 10,000-block archive fits a hosted isolate's memory/CPU limits.
- Benchmarks are isolated local SQLite, not hosted D1/PG latency. Existing special-format/game parity limits, beta Vinext, client bundle size, lint debt, live Supabase auth/RLS setup and full-fidelity backup migration remain.
- Preserve raw bytes/notes, immutable history, concurrency tokens, local-today vs imported Unknown dates, same-set search, owner checks, reusable tags, source licenses/offer and owner-only site access. No folders, PokéPaste publishing, simulator/AI/social or special-format expansion.

## Key files for continuing

SCHEMA_PLAN.md; PERFORMANCE.md; db/schema.ts; lib/domain.ts; lib/demo-store.ts; lib/supabase-store.ts; lib/snapshot.ts; lib/search.ts; components/library.tsx; components/bulk-actions.tsx; components/import-teams.tsx; components/visual-team-editor.tsx; scripts/test-large-workflows.mjs; scripts/test-save-model.mjs; scripts/benchmark-scale.mjs; scripts/benchmark-save.mjs; new D1/PG migrations. Source-offer allowlist now includes schema/performance documentation.

## Earlier checkpoint (historical, superseded where noted above)

# TeamVault progress — builder usability correction, 2026-09-09

## Current state

The focused builder usability/performance pass is complete and privately published. Implementation commit f2d4245a92289ec5832e2e40b9f5e5b3a96b26a5 (f2d4245), starting from 2df25d1. This documentation-only follow-up records publication; git log -3 --oneline and git status --short resolve its latest commit and clean tree.

No unrelated major feature was started. Supabase external setup, PokéPaste, folders and special-format parity were explicitly excluded. Existing Supabase adapter semantics were updated alongside D1 so the Save contract stays consistent; this did not configure a live Supabase project.

## Completed this session

- Fixed Hidden Power duplicate picker identities and active-query filtering; exact/alias/prefix ranking retains full relevant move availability.
- Reused Showdown aliases across species/items/moves/abilities, with minimal fallback. Browser verified hdb → Heavy-Duty Boots and cc → Close Combat.
- Removed duplicate nature boost/reduce dropdowns. Inline +/- derives the nature; existing direct nature picker and Neutral remain.
- Added general single-parent item/move-triggered battle-form selection/projection. Zacian-Crowned uses Crowned stats and Behemoth Blade in the UI, stores/exports Zacian + Rusted Sword + Iron Head. Required item and canonical parent ability behavior applies generally.
- New authored Gen 9 Tera defaults required/primary type; imported/manual values survive and earlier generations hide Tera.
- Added persistent authored/default provenance. Nonphysical authored sets auto-zero Attack on four moves or Save; physical changes restore 31 only after TeamVault auto-zeroed it. Manual edits/imports, Gen 1/2 DVs, Hidden Power and unknown moves are protected. No automatic SpA zeroing.
- Save updates the current version. Save as new version freezes the prior snapshot and accepts an optional comment. Historical Save is disabled; restore creates a new version. SQLite/PostgreSQL guards and three concurrency tokens protect stale writes and history. Original raw source and historical notes remain fixed.
- Added SQLite 0002 and PostgreSQL 202609090001 migrations; no new columns or data rewrite. Local D1 migration applied successfully. Deployment packages the D1 migration.
- Moved uncommon/custom move controls into lower-emphasis More move options; render first 40 matching rows and allow expansion.
- Measured catalog, learnset, parse, React and request costs; cached stable catalogs, warmed data after editor/species selection, reduced initial result DOM, and reused saved TeamRecord responses to remove redundant get requests.
- Added opt-in ?profile=1 local timings and React/API diagnostics. No payloads, identifiers, remote telemetry or unconfirmed optimistic persistence.
- Review fixes: favourite toggles carry forward updated_at to prevent false save conflicts; no-op Save preserves imported CRLF/blank separators exactly.
- Updated README, DECISIONS and SHOWDOWN_INTEGRATION with storage semantics, authoring rules and measured limitations. Existing upstream pins, licenses and corresponding-source offer remain intact.

## Verification

- node scripts/test.mjs: PASS, 160 checks (58 domain/SQLite + 41 PostgreSQL + 13 UX/raw preservation + 10 builder + 25 Showdown + 13 authoring defaults). Final run includes no-op imported-whitespace regression.
- node scripts/test-http.mjs: PASS after integration: authentication, current Save, immutable history/restore, private authoring flags, search, share/revoke, origin enforcement and permanent deletion.
- node node_modules/typescript/bin/tsc --noEmit: PASS after final functional fixes.
- Full lint: FAIL, 67 pre-existing errors. Compared normalized diagnostics with prior showdown-lint.log; the only new warning (test prefer-const) was fixed. No new lint debt from this pass.
- Production build: PASS, all five Vinext phases. Large-chunk and static route-classification warnings remain. Source archive refreshed after final documentation, with 166 files; final packaging/hash validation passed and is recorded with publication.

Browser acceptance performed on localhost:

- Reproduced the old Stealth Rock/Hidden Power bug before editing; after correction Stealth Rock returns only the matching move. Gen 5 Swampert Ice Beam keyboard entry still works.
- Zacian-Crowned selection: Rusted Sword, canonical Intrepid Sword, Fairy Tera, Gen 9 base Attack 150 / Speed 148. Behemoth Blade and cc selection; +Speed/-SpA derives Jolly. Raw tab shows Zacian and Iron Head. No duplicate nature dropdowns.
- Gholdengo: hdb selection, Steel Tera, Shadow Ball/Make It Rain/Nasty Plot/Recover; Attack automatically zero. Reopen confirms persisted 0; replacing Recover with Iron Head restores 31.
- Save keeps v1/history count 1. Manual Attack 0 plus set note saved as v2 with comment. Historical Save disabled. Restore v1 creates v3. v2 still has manual 0 and note (also verified through API). Favourite then Save succeeds.
- Both disposable QA teams deleted after acceptance using exact IDs/title checks; user/demo records and older UX Review record retained. One initial cleanup request used an incorrect payload and failed without deleting anything; corrected contract succeeded.
- Existing published library/editor inspected read-only before deployment; an unsaved new draft was opened and closed. Earlier network-suspended attempts failed, later access succeeded. Hosted source smoke validation after update is recorded below.
- Current pass did not repeat phone-size/physical touch/screen-reader or full sharing-page visual acceptance. Prior 390px layout work remains; HTTP sharing regression passes.

## Measured performance

See SHOWDOWN_INTEGRATION.md for methodology, full numbers and outliers. Local dev first move readiness 1487.1→603.2 ms (~59% reduction); New Team 190.8→167.1; first Add Pokémon 597.6→550.6; two warm move transitions 332.7/351.4→297.3/283.3.

Same one-set Save as new: feedback 133→115.5 ms, persisted 212→416.4, visible 487.8→537.3. Current Save has no equivalent old path: 116.2 feedback / 237.7 persisted / 394.6 visible. A two-set current Save outlier reached 2520.8 ms visible. Persistent Save performance is not claimed improved. Samples are sparse, development-only and not production percentiles. Cold catalog/learnset CPU did not universally improve; warm catalog medians dropped to ~0.001 ms. Raw parsing was already sub-millisecond.

## Partially implemented / known issues

1. Cold catalog/parser/sprite code and editor commits still cost time. Caching/prewarming improve repeated work but do not solve all cold loads; save latency remains variable. Full controlled production request graph / percentile measurements remain open.
2. Full special-format/mod parity remains incomplete (Hackmons, STABmons, Metronome, nd/adv200, VGC era/DLC mapping, mod metadata). Pools are availability guidance, not tier/event/combination legality. Tera-only and multi-parent transformations are not selectable via this new generic form path.
3. No live Supabase project, SMTP/magic-link acceptance or real two-account isolation test; PostgreSQL regressions use a local Auth shim. Apply all documented migrations before enabling that adapter.
4. Existing lint debt, large client chunks, beta Vinext and substantial Library state ownership remain.
5. D1 bulk metadata operations can partially apply on storage failure; single-team Save/version mutations are atomic. No full-fidelity D1→Supabase migration exists.
6. Metadata format changes do not normalize historical snapshots. No typo-tolerant/Boolean search; note: words use current note AND semantics.
7. Raw manual changes deliberately clear auto-default ownership for the changed slot; no attempt to infer author intent. Changing a species does not validate every existing move/item combination. Imported inconsistencies are preserved and may need manual correction.
8. Physical mobile/touch, assistive technology and broad browser coverage remain unverified. Current source/asset licensing distinctions remain in THIRD_PARTY_NOTICES.md.

## Exact next tasks, in priority order

1. Collect repeated cold/warm production-browser timings and request graphs for one/six-set create/current Save/new-version Save. Separate network, D1 commit and React render cost before further performance changes.
2. Profile builder busy/field rerenders and initial catalog/sprite imports; isolate/memoize only measured costs while retaining surgical raw edits and immediate field feedback.
3. Exercise real phone/touch and screen-reader flows, current Save/new-version dialog labels and picker keyboard exits. Fix observed defects.
4. Review special formats only with explicit new scope: central classification, supported/unsupported messaging and parity fixtures before new claims.
5. Triage existing lint/error-recovery debt and design atomic D1 bulk metadata writes / full-fidelity backups.
6. Configure and test live Supabase only when the user provides a project; apply every migration, test sign-in and real two-account RLS/sharing.
7. Choose deferred PokéPaste/folders or other features only after a new product request.

## Files most relevant to follow-up

- components/visual-team-editor.tsx: Save modes, raw reconciliation, authoring completion and timing.
- lib/builder-defaults.ts / lib/visual-team.ts: narrow automatic defaults and raw/slot provenance.
- lib/builder-performance.ts / lib/client.ts: opt-in interaction/render/request diagnostics.
- lib/demo-store.ts / lib/supabase-store.ts: atomic save/version/search updates and concurrency.
- lib/snapshot.ts / lib/domain.ts: editable current snapshot identity and private editing metadata.
- drizzle/0002_edit_current_version.sql / supabase/migrations/202609090001_edit_current_version.sql: historical/current guards.
- lib/builder-data.ts / lib/showdown-builder.ts: cached catalog, aliases, forms and canonical moves.
- components/pokemon-selector.tsx / pokemon-set-editor.tsx / ev-editor.tsx: picker, form and inline nature UI.
- components/library.tsx: saved-record response reuse, metadata tokens and navigation.
- scripts/test-save-model.mjs / test-defaults.mjs / test-showdown.mjs / test-http.mjs: critical contracts.
- SHOWDOWN_INTEGRATION.md / DECISIONS.md / README.md: provenance, measurements, setup and product constraints.

## Decisions that must not be reversed accidentally

Current version is editable; historical versions are frozen, and restore always creates a new version. Three-token stale-write protection must stay atomic. Original source and raw unknown lines survive. Current team/set notes live in the editable snapshot and freeze with it; title/format/tags/provenance/date belong to the conceptual team. Private authoring flags never reach share/export output. Imported/manual values never get automatic IV/Tera defaults. New dates default local today; imports Unknown. Same-set search stays relational. Owner checks, partial metadata patches, source licenses/offer and owner-only Sites access remain.

## Local commands

Run from C:\Users\24650\.codex\.chatgpt-projects\g-p-6a9d6190c39c8191988ca1de0c290ae4\teamvault with Node >=22.13, pnpm and native tar. Local demo mode needs no external account/key. Existing localhost:3000 dev server may already be running; avoid duplicate servers.

```powershell
pnpm --config.node-linker=isolated install --frozen-lockfile
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config .openai/wrangler.local.json --persist-to .wrangler/state
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run dev
# In another terminal:
node scripts/test.mjs
node scripts/test-http.mjs
node node_modules/typescript/bin/tsc --noEmit
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run lint
# Stage new intended source files before building the corresponding-source archive.
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run build
git diff --check
git status --short
git log -3 --oneline
```

## Publication

Published successfully at https://teamvault-library.internetscaryuwu.chatgpt.site on 2026-09-09T11:16:33Z. Owner-only access reverified after deployment: owner role, custom allowlist with one account, no external visitors/groups. No access-policy or runtime environment change. The new D1 migration was included in the deployment archive.

- Deployed source: f2d4245a92289ec5832e2e40b9f5e5b3a96b26a5, pushed before saving/publishing.
- Saved version: 5; appgprj_6a9d7930f9208191b3e0b14aae68961d~appgver_0886e8fa584081919fa89147ddf63bd1.
- Deployment: appgdep_6aa13fe68e4881919e5f03bc5a914809; terminal status succeeded.
- Packaging: validated Worker entrypoint, static assets, hosting metadata and drizzle/0002_edit_current_version.sql. Source manifest checked all 166 files against source bytes, including new migrations/tests; runtime environment/database/user data excluded.
- Local corresponding-source GET returned 200/exact bytes. Hosted owner-authenticated GET returned 200, 12,501,504 bytes, exactly matching the validated local corresponding-source archive.
- Existing hosted library/editor was inspected before publication without saving a draft. After deployment the Site view was reloaded and open_in_codex returned queued. The browser session then lost its tabs, so post-deploy interactive Save was not repeated; do not conflate source/HTTP deployment smoke with that unperformed check. Full interactive acceptance was performed locally.

The source offer was refreshed after final documentation corrections and copied into the already validated build's static output before packaging; no application JavaScript changed after that successful production build. This publication-status update is a documentation-only follow-up and is not part of the deployed f2d4245 source archive. Retain owner-only access.
