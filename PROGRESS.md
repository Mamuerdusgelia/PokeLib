# TeamVault progress — builder usability correction, 2026-09-09

## Current state

The focused builder usability/performance pass is implemented and undergoing final publication checks. Starting HEAD was 2df25d1, with the previous live application fab8129. Resolve the exact new implementation commit and tree state with git log -3 --oneline and git status --short. Publication result will be recorded below after deployment.

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
- Production build: PASS, all five Vinext phases. Large-chunk and static route-classification warnings remain. Source archive refreshed after final documentation, with 166 files; final packaging/hash validation is recorded with publication.

Browser acceptance performed on localhost:

- Reproduced the old Stealth Rock/Hidden Power bug before editing; after correction Stealth Rock returns only the matching move. Gen 5 Swampert Ice Beam keyboard entry still works.
- Zacian-Crowned selection: Rusted Sword, canonical Intrepid Sword, Fairy Tera, Gen 9 base Attack 150 / Speed 148. Behemoth Blade and cc selection; +Speed/-SpA derives Jolly. Raw tab shows Zacian and Iron Head. No duplicate nature dropdowns.
- Gholdengo: hdb selection, Steel Tera, Shadow Ball/Make It Rain/Nasty Plot/Recover; Attack automatically zero. Reopen confirms persisted 0; replacing Recover with Iron Head restores 31.
- Save keeps v1/history count 1. Manual Attack 0 plus set note saved as v2 with comment. Historical Save disabled. Restore v1 creates v3. v2 still has manual 0 and note (also verified through API). Favourite then Save succeeds.
- Both disposable QA teams deleted after acceptance using exact IDs/title checks; user/demo records and older UX Review record retained. One initial cleanup request used an incorrect payload and failed without deleting anything; corrected contract succeeded.
- Existing published library/editor inspected read-only before deployment; an unsaved new draft was opened and closed. Earlier network-suspended attempts failed, later access succeeded. Hosted acceptance after update will be recorded below.
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

Existing owner-only site: https://teamvault-library.internetscaryuwu.chatgpt.site/. Access reverified before publication: owner, custom allowlist of one account, no external visitors or groups. Prior live implementation is fab8129 (saved version 4). New publication and final build/archive results will be recorded after successful deployment. No access-policy or runtime environment changes are requested.
