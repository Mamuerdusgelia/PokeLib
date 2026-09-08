# TeamVault progress — Showdown UX pass, 2026-09-08

## Current state

The user resumed work after several usage checkpoints. The focused Showdown-style UX pass is now implemented and locally verified. No partially wired prototype remains. Do not start the explicitly deferred PokéPaste/folder/AI work without a new request.

Branch: main. Previous checkpoint: d393e6c; previous application baseline: a2e04be. Implementation commit: b9256f1 — Make team building direct with rich selectors, stats and inline metadata. A following documentation commit records publication status. Use `git log -2 --oneline` and `git status --short` to verify the current tree. Tests/typecheck/build passed before the implementation commit.

## Completed in this pass

- Click displayed species, item, ability, nature, move or stats to open the version editor at the selected slot/field. Normal building requires no Showdown syntax.
- New Team immediately opens an unsaved Untitled team with empty slots, today's local date, and the current format filter (or unknown). Empty drafts cannot be saved; cancelling creates no record.
- Rich generation-aware selectors show sprites, types, base stats, possible abilities, item/ability descriptions and move type/category/power/accuracy. Search and keyboard selection work. Species filters support two types, ability text, full move name and ascending/descending stat/total sorting. First 100 results are shown with refinement guidance.
- Learnset suggestions prioritize plausible moves and power species move filters. Data is cached by normalized format/species, with source-generation and form/pre-evolution handling. Smeargle remains an explicit approximation. National Dex allows Past catalog entries; complete legality is not asserted.
- Stats/EV panel shows base/actual stats, sliders, numbers, totals, nature +/- controls and collapsed IVs. Modern caps are 252/stat and 510 total. Gen 1/2 use documented DV/stat-experience equivalents, no modern total cap and no natures; Gen 1 has one Special row. Generation hides unavailable mechanics.
- Inline title/format/source/date editing replaces Edit Team Details. Reusable tags retain Add -> Create. Partial patches retain historical views and independent favourite changes; metadata saves serialize and block version creation while pending.
- Compact list is default unless a valid stored view exists. All Teams/Favourites, Formats and Settings replace the larger sidebar. Archive controls are removed while archived records and counts remain visible through an opt-in include_archived flag in both adapters. Old API defaults remain compatible.
- Set notes collapse with an indicator. Export set uses the displayed snapshot's preserved raw block, with copy/download; unsafe splitting explains that full export is required.
- Fixed verification findings: rapid Enter dropping selector choices; Escape in filters closing the entire draft; Smeargle cache crossing standard/National Dex; zero Gen 1/2 stat experience resetting on reopen; mismatched parser/builder generation detection; stale metadata/favourite/detail merges; mutation refreshes using old filters; emptied last-page pagination.
- Fixed pre-existing explicit note: search excluding set notes. Both adapters now match current team/set note words while excluding historical set tokens. No reindex is needed. Same-set species/move/item/ability semantics are unchanged.
- Added append-only PostgreSQL migrations 202609080001_include_archived.sql and 202609080002_search_set_notes.sql. No dependency changes or D1 schema changes.

## Verification actually completed

| Command | Result |
| --- | --- |
| `node scripts/test.mjs` | PASS: 41 domain/SQLite + 24 PostgreSQL + 13 UX helpers + 10 builder = 88 checks. |
| `node scripts/test-http.mjs` | PASS against localhost:3000: auth, persistence/search/history, archive inclusion/facets, share/revoke, origin checks and permanent deletion. |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS. |
| `pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run build` | PASS, all five phases after the final application changes. |
| `pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run lint` | FAIL: 68 reported errors in existing scaffold/application code. No errors reported in the new selector, metadata, builder-data or EV-editor files. |
| `git diff --check` | PASS; Windows LF/CRLF conversion warnings only. |

Lint includes explicit any, existing unused imports, compiler/effect rules, links/images, chart types and accessibility rules. One narrow selector suppression documents why a noninteractive region handles descendant Escape events. Nonfatal build warnings remain: >500 kB client chunks, plugin timing, and Vinext static analysis classifying / as Unknown. No clean-lint claim is made.

Browser acceptance on the local preview:

- All Teams blank draft, cancellation without a record, and Gen 5 OU inheritance.
- Full Darkrai set built through selectors with four moves, Focus Sash, Bad Dreams, Timid and 508 EVs; ordinary stats matched expectations. Slider keyboard input stopped at 510; nature +/- changed to Modest correctly.
- Direct detail entry for species/item/ability/nature/move; correct move slot opened. Rapid Enter and arrow-key selection worked. Escape from a species filter closed only the selector.
- Combined Water + Ground + Damp + Ice Beam filter returned Swampert/Quagsire/Marshtomp/Wooper, sorted by descending HP.
- Visual/raw switching, raw edits, unknown custom field, note retention, copy-set clipboard equality, save to v2, historical v1 viewing and restore into v3.
- Inline title/source/year edits while viewing v1 retained history and current v2 data; custom tag creation persisted.
- Combined source/year/species/move/tag search, ordinary note text and corrected explicit note: search passed.
- Two-team Showdown backup imported with reusable Builder QA tag and Unknown dates.
- Inherited narrow desktop preview (~747 px) inspected visually. Full-width desktop density, phone widths and real touch remain a dedicated follow-up; do not claim complete mobile acceptance.

The three disposable acceptance teams were verified and deleted. Reusable Builder QA tag may remain intentionally. The older UX Review team was preserved because the user has interacted with it. Automated tests use isolated databases; HTTP tests clean their own disposable records.

## Partially implemented / known limits

No partial code feature needs reverting. Remaining work concerns verification and production readiness:

1. Full-width desktop and physical phone/touch review is incomplete. Browser reconnections were repeatedly needed; do not treat tool disconnections as product bugs without evidence.
2. Selectors provide availability and approximate learnset suggestions, not tier/ban/event/transfer/combination legality. Item sprites were deliberately omitted. Battle-only forms are excluded from ordinary choices; raw/custom sets remain supported.
3. Shared views retain read-only props and HTTP token tests pass, but this pass did not repeat interactive shared-page browser QA. Optional WebMCP search/import calls remain untested.
4. No live Supabase project: hosted email/auth, two-account RLS integration and production SMTP still require setup despite passing local PostgreSQL tests.
5. Lint debt, large bundles and beta Vinext runtime remain. Library.tsx still owns substantial navigation/detail/dialog state; avoid a broad rewrite merely to extract components.
6. D1 bulk metadata preflights ownership but applies per team, so a partial storage failure may leave some changes applied. PostgreSQL bulk operations are atomic.
7. Format edits are conceptual metadata across versions. Existing parsed snapshots are not automatically reparsed when metadata alone changes generation; review cross-generation editing before promising full historical mechanics support.
8. Search has no typo tolerance or Boolean grouping. note: quoted values are ANDed words across current team/set notes, not exact phrases or a same-slot note constraint. Format groups derive from stored IDs, without upstream live registry/counts.
9. D1-to-Supabase configuration switches to a separate library; no full-fidelity migration is implemented. Showdown backups do not carry application notes/metadata.

## Exact next tasks, in priority order

1. Finish full desktop/phone acceptance: density with many six-Pokémon teams, inline metadata, selector overflow/focus and real touch EV sliders. Fix observed layout issues only.
2. Verify shared-page read-only presentation and optional WebMCP calls; review rapid navigation/async failure recovery in detail and metadata flows.
3. Configure the user's Supabase project when available, apply all migrations, test actual email sign-in, two-account isolation and token sharing. Keep service-role secrets out of the app.
4. Improve initial-load bundle size with measured lazy loading of builder/catalog/learnset code. Preserve cached suggestion behavior and first-use responsiveness.
5. Triage lint by touched application areas, then scaffold debt; extract focused library state only where it reduces real concurrency risks.
6. Add focused cross-generation metadata/edit/reopen coverage, especially imported legacy sets and unusual forms; keep unknown fields intact.
7. Plan full-fidelity library backup/migration and atomic D1 bulk edits before a wider rollout.
8. After product review, choose later PokéPaste or collection scope separately. Folders are not formats/tags, and neither feature belongs in this completed pass.

## Decisions to preserve

Raw text and effective imported values survive edits; unknown lines are not canonicalized away. Notes follow stable draft identities and ambiguous mappings require review. Team/set notes belong to immutable snapshots; title/format/tags/provenance/date belong to the conceptual team. Restore creates a new version. New authored dates default to local today; imports default Unknown. Same-set search stays relational. Archived flags remain stored but normal UI includes those records. Keep partial metadata patches and abortable refreshes. Share tokens authorize the conceptual team and history, while private Sites access remains a separate gate. See DECISIONS.md for rationale.

## Exact local commands

Node >=22.13 and pnpm are required. No Supabase account or API key is needed for the local D1 demo. Run in PowerShell:

```powershell
cd C:\Users\24650\.codex\.chatgpt-projects\g-p-6a9d6190c39c8191988ca1de0c290ae4\teamvault
# Fresh checkout only:
pnpm --config.node-linker=isolated install --frozen-lockfile
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config .openai/wrangler.local.json --persist-to .wrangler/state
# Keep running in one terminal; use local Sign in with ChatGPT:
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run dev
# Another terminal:
node scripts/test.mjs
node scripts/test-http.mjs
node node_modules/typescript/bin/tsc --noEmit
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run lint
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run build
git status --short
git log -3 --oneline
```

HTTP tests hardcode localhost:3000 and use the local sign-in simulator. PGlite tests use real application roles plus an Auth shim; they are not hosted Supabase tests. Review dependency build approvals on fresh install. No tests require production credentials.

## External setup and publication

Existing site: https://teamvault-library.internetscaryuwu.chatgpt.site/ . Reuse .openai/hosting.json; do not create another Site. Owner-only access was reverified during this pass. Before this pass the latest live source was 1614542; a2e04be source was pushed but build upload failed twice. Publication succeeded on 2026-09-08 after the user explicitly approved source upload and owner-only publishing. Live version 3 uses source 364446622d766690027381175e538fc02fc4bf92 (application implementation b9256f1 plus handoff notes). Deployment appgdep_6a9f7787b3f48191b4f6f3c6fc0693a7 reached succeeded; saved version appgprj_6a9d7930f9208191b3e0b14aae68961d~appgver_e16ac12048fc819197b77bc8251b4144. Opening the deployed URL in the existing site tab was requested; Codex queued the UI handoff. Owner-only access was retained; no runtime environment values changed.

The initial elevated source push was rejected by automatic approval review; explicit user approval resolved that block. The completed build archive uploaded successfully this time. Native Windows packaging used scripts/package.ps1 and the Sites prepare-site-build.cjs validation helper because bash is unavailable. The bundled Git needs --exec-path=C:/Users/24650/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/mingw64/bin to locate HTTPS. Elevated pushes also need a per-command safe.directory for this exact checkout because sandbox-owned files have a different Windows owner. Keep credentials and trust configuration per command. The following documentation-only commit records this successful outcome and does not change the deployed application build.

For Supabase, apply every migration in filename order, configure Email/redirect URLs/SMTP and set SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY together. Never use service-role keys. README/.env.example describe setup. No Vercel adaptation is implemented; the current runtime is Sites/Cloudflare. Public access is a separate deliberate change and was not requested.

## Important files for review

1. components/library.tsx — navigation, contextual edit targets, partial metadata merges, refresh cancellation and detail/history flows.
2. components/visual-team-editor.tsx — unsaved drafts, version saves, visual/raw state and note reconciliation.
3. components/pokemon-set-editor.tsx — selected slot, clickable values, generation visibility and notes.
4. components/pokemon-selector.tsx — catalogs, filters/sorting, async suggestions, keyboard/focus behavior.
5. components/ev-editor.tsx — synchronized EV inputs/sliders, actual stats and nature modifiers.
6. components/inline-team-metadata.tsx — inline grouped partial patches and form errors.
7. components/vault-ui.tsx — owned/shared set rendering and preserved raw set export.
8. components/team-card.tsx — library row/card actions including direct deletion.
9. app/redesign.css — compact rows, editor/selectors and responsive rules.
10. lib/builder-data.ts — catalogs, learnset caching, ordinary stat calculations and caps.
11. lib/visual-team.ts — surgical raw edits, stable note identities and implied value preservation.
12. lib/domain.ts and lib/showdown.ts — data contracts, dates and shared generation/parser behavior.
13. lib/search.ts — entity planning, same-set matching and indexed current note semantics.
14. lib/demo-store.ts — D1 ownership, versions, search/facets, archive inclusion and deletion.
15. lib/supabase-store.ts — authenticated RPC adapter.
16. supabase/migrations/202609080001_include_archived.sql — backward-compatible inclusive archive list/facets.
17. supabase/migrations/202609080002_search_set_notes.sql — current set-note filter fix without reindexing.
18. app/api/vault/route.ts — auth, origin/input limits and storage dispatch.
19. scripts/test*.mjs — SQLite/PostgreSQL, HTTP, raw preservation and builder regression checks.
20. README.md, DECISIONS.md and .env.example — setup, product invariants and external requirements.
