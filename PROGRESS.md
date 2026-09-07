# TeamVault checkpoint — 2026-09-08

## Resume here

The latest instruction was to stop major feature work, safely checkpoint the repository, document it, and commit. **Do not interpret this checkpoint as completion of the latest Showdown-style UX brief.** No new feature should begin until the user resumes implementation.

- Branch: `main`.
- Application-code baseline: `a2e04be53753e4b5128e546fce2e4351ceda3f52` — Redesign team editing and library search for Showdown workflows.
- Earlier commits: `1614542` — permanent deletion from library cards/rows; `a4420a5` — native Windows packaging; `0305d78` — initial library, versioning, search and sharing.
- The commit containing this checkpoint adds documentation only. The working tree was clean before these documentation edits; no application changes or partial prototype remain. Use `git log -1 --oneline` and `git status --short` to verify the checkpoint commit and current local state.
- Primary source for future scope: the user's attachment beginning “Review the current TeamVault repository and the implementation from commit `a2e…`”, at `C:/Users/24650/.codex/attachments/63bdcf84-1179-4d76-ae8a-610cd1de3b6d/pasted-text.txt` on this machine. The priorities below preserve its actionable requirements if that attachment is unavailable.

## Completed this session

- Reviewed the latest UX brief and the existing editor, library/detail views, metadata, storage contracts and tests before implementation.
- Investigated the installed Pokémon catalogs, lazy learnsets, generation availability and ordinary stat calculation; recorded the useful findings below.
- Reviewed integration risks around history, shared views, inline metadata, empty-team creation and hiding Archive.
- Created an unconnected `lib/builder-data.ts` prototype, then **removed it completely** at the checkpoint request. It was never wired into the app or committed. No partial application-code change needs finishing or reverting.
- Revalidated the existing baseline with the automated suite, local HTTP integration, TypeScript and production build.
- Recorded implementation directions in `DECISIONS.md` and this handoff. No latest-brief UX feature was completed, committed or deployed this session.

## Current working baseline / unfinished scope

`a2e04be` provides a visual six-slot editor with structured fields and secondary Showdown Text mode; raw-line and note preservation; Add tag → suggestions/Create; search chips and `from:` source alias; grouped format navigation. Existing import/bulk import, immutable versions/restoration, notes, dates/provenance, favourites/archive, permanent deletion from library cards/rows, export and revocable sharing remain in place.

The latest requested pass is **planned only**: direct click-to-edit values, richer generation-aware selectors, immediate blank creation, calculated stats and EV controls, denser library, contextual metadata editing, simplified sidebar, archive removal, per-set export and collapsed notes. The current editor still has a metadata-heavy creation flow; selectors are simple and do not provide the requested availability/learnset filtering or stat sorting. No EV-slider/stat-calculator helper from this session exists in the repository.

The stack remains React 19/TypeScript, Next App Router conventions through Vinext `1.0.0-beta.5`, Cloudflare Workers/D1 for the authenticated demo, and an optional Supabase Auth/PostgreSQL/RLS adapter. Pokémon packages are `@pkmn/dex@0.10.11` and `@pkmn/sets@5.2.0`. See README for the full architecture and setup.

## Verification at this checkpoint

These commands completed successfully against unchanged `a2e04be` application code during checkpoint preparation:

| Check | Result |
| --- | --- |
| `node scripts/test.mjs` | PASS: 39 domain/SQLite + 22 PostgreSQL migration/RLS/RPC + 13 UX helper checks; 74 total. |
| `node scripts/test-http.mjs` | PASS against the running local server: authentication, persistence, search, history, sharing/revocation, origin checks and permanent deletion. Disposable team cleaned up. |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS. |
| `pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run build` | PASS: all five production build phases. |

Non-fatal build warnings remain: client chunks over 500 kB, plugin timing warnings, and Vinext classifying `/` as `? Unknown` during static route analysis. The API and share routes built successfully. Treat these as performance/runtime review items, not a claim that the build failed.

Lint was **not rerun for this documentation checkpoint** and is known to be unclean from the prior implementation: scaffold/application explicit `any`, unused imports, React/compiler/effect rules, accessibility and Next-specific link/image rules. The Add tag autofocus warning is also unresolved; an attempted inline suppression did not eliminate it. A clean lint result is not claimed.

No new browser QA was performed for this checkpoint. Prior `a2e04be` browser QA verified visual create/edit, custom tag creation, exact unchanged Visual/Text switching, unknown-line and note preservation, v2 creation/export, unchanged historical v1, source autocomplete, combined chips/free text and format selection. Desktop and narrow preview layouts were inspected. The browser connection failed during the final bulk-import preview: final bulk-tag interaction and real touch-device behavior remain unverified. Optional WebMCP calls and live hosted Supabase auth were not exercised.

## Exact local commands

Requires Node >=22.13 and pnpm. Commands below are PowerShell, run from the app checkout:

```powershell
cd C:\Users\24650\.codex\.chatgpt-projects\g-p-6a9d6190c39c8191988ca1de0c290ae4\teamvault

# Fresh checkout only; dependencies are already installed here.
pnpm --config.node-linker=isolated install --frozen-lockfile
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config .openai/wrangler.local.json --persist-to .wrangler/state

# Keep running in one terminal; use the local ChatGPT sign-in simulator.
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run dev

# Run in another terminal from the same directory.
node scripts/test.mjs
node scripts/test-http.mjs
node node_modules/typescript/bin/tsc --noEmit
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run lint
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run build

git status --short
git log -5 --oneline
```

HTTP tests currently hardcode `http://localhost:3000` and require the D1 demo/local sign-in simulator. They are not a hosted Supabase test. Review pnpm build approvals if a fresh install requests them; the runtime/compiler need esbuild, sharp and workerd. The Windows pnpm flags above avoid the dependency-layout recheck that interfered with commands in this environment. No Supabase account, database password or API key is needed to run the local demo.

## Deployment and external setup

- Existing site: https://teamvault-library.internetscaryuwu.chatgpt.site/ — owner-only access at the last successful verification. Site ID is already in `.openai/hosting.json`; reuse it.
- Last known live source is **`16145426ac2488c7a8ae95ab6df421e150d99bd5`**, not `a2e04be`. The redesign source was pushed to the existing Site repository, but both attempts to upload its build archive timed out at the blob-upload step. No version/deployment for that redesign was created. This checkpoint did not retry publication or change site access.
- No Supabase project is configured. The user chose setup instructions. For production Supabase mode, create a project, apply all `supabase/migrations` in order, configure Email/redirect URLs and production SMTP, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, then verify real sign-in and two-account isolation. Never use a service-role key. README and `.env.example` contain the setup details.
- Switching to Supabase opens a separate initially empty library; it does not migrate D1 data. Showdown backup export/import omits application notes and metadata.
- The current deployment target is Sites/Cloudflare. No Vercel deployment or tested Vercel adaptation is present. Public access is a separate deliberate access-setting change; private site access currently also gates share links.

## Known issues and technical debt

1. The deployed site trails the local application baseline because of archive-upload failures. Do not assume browsing the hosted URL shows the redesigned editor or search chips.
2. Repository-wide lint is unclean; large client bundles and the beta Vinext runtime need review before a broader production rollout.
3. `components/library.tsx` remains a large stateful component owning navigation, fetches, details/history, dialogs, sharing and bulk actions. Avoid a broad rewrite during the focused UX pass.
4. Current generation handling is incomplete in the editor. Modern catalogs can offer future/unavailable entries; most older-generation mechanics are not hidden. Imported special fields still depend on raw text editing.
5. Empty saved snapshots are unsupported by parser/snapshot validation and PostgreSQL helpers; search also assumes a matching set slot. The planned unsaved blank draft avoids changing those contracts.
6. Removing Archive UI alone would hide existing archived records. Both storage adapters' default lists and facet counts currently exclude them. This must be addressed as part of the later navigation change.
7. D1 bulk metadata operations preflight ownership but apply per team; a storage failure partway through can leave a partially applied selection. PostgreSQL bulk changes are atomic.
8. Browser coverage has the gaps listed above; a disposable `UX Review` team may remain in local demo data. Helper tests are not a substitute for actual focus, keyboard, overlay and touch interactions.
9. Full legality validation, typo tolerance/Boolean search, a live upstream format registry and per-format counts remain outside current behavior. Format inference has generic fallback grouping.
10. Live Supabase email/auth/RLS integration remains unverified despite passing local PostgreSQL tests. Public sharing must also be tested after intentional deployment access changes.

The prior review's raw-note reorder, moves-less set crash, Hidden Power IV and Frustration happiness findings were fixed in `a2e04be` and have regression checks. Preserve those fixes; do not report them as still-open bugs without new evidence.

## Exact next tasks, in requested priority order

Resume only when the user authorizes further feature work. Complete each increment with focused regression checks instead of starting all ten at once.

1. **Direct click-to-edit set fields.** Add an optional edit callback to `PokemonDetails`; owned species/item/ability/move/nature/stat values open the existing version editor at `{slot, field, moveIndex}`. Keep shared views read-only and historical edits explicit. Verify correct slot/focus, save-as-new-version and unchanged old snapshots.
2. **Rich Pokémon/move/item/ability selectors.** Reuse installed Dex catalogs and existing UI primitives; provide sprites/types/base stats/possible abilities, move type/category/power/accuracy and item/ability descriptions. Filter generation availability and prioritize possible abilities/learnset suggestions. Preserve custom or imported raw values and avoid legality claims.
3. **Immediate blank New Team flow.** Replace the preliminary questionnaire with an unsaved `Untitled team` draft and prominent empty slots. Allow constructing a complete set without Showdown syntax; persist only the first nonempty save through the existing import path. Keep today's authored date and Unknown import dates. Integrate format context in step 7.
4. **Showdown-style set/stat/EV panel.** Display sprite, types, possible abilities, base and ordinary calculated stats together. Add synchronized sliders/numeric EVs, valid totals and nature plus/minus controls. Test level scaling, nature rounding, Shedinja HP, historical generation behavior, and preservation of implied/raw fields before wiring UI.
5. **Compact library.** Make list the default for users without a saved preference; respect existing grid/list preferences. Fit title, format, sprites, tags, source/year, favourite and delete into compact desktop rows, with usable narrow layouts and matching loading skeletons. Keep deletion accessible directly in the library.
6. **Contextual metadata editing.** Replace Edit Team Details with title/format/tag/date/source controls where displayed. Send partial patches, serialize saves, refresh cards/facets and retain the displayed historical snapshot. Explain that metadata applies across versions.
7. **Format context inheritance.** Use the active format chip/navigation selection when opening a new draft; All Teams can default to `unknown`. Verify Gen 5 OU creation inherits `gen5ou`, shows appropriate generation controls, and does not change import defaults.
8. **Simplify navigation and remove Archive UI safely.** Keep All Teams, Favourites, format hierarchy and Settings; remove standalone Tags/Years/Sources/Archived navigation and archive actions/bulk controls. First add backward-compatible inclusion of legacy archived teams/counts in D1 and a new Supabase migration, with pagination and ownership tests. Keep archived flags intact.
9. **Export Set and collapse set notes.** Replace static Full set details with per-set export using the displayed snapshot's raw block; do not silently drop unknown lines if splitting is unsafe. Collapse notes by default with an indicator while preserving edit/search behavior and stable note identities.
10. **Selector filtering and acceptance polish.** Add Pokémon type-combination/ability/move filters and high/low stat sorting where supported. Exercise the complete requested keyboard/mouse/narrow-screen workflows, including imports/tags, historical edits, raw roundtrips and legacy archived visibility. Then run tests/typecheck/build, record lint status, and commit the completed increment. Retry deployment separately if requested.

## Research to reuse, not an implemented helper

- `Dex.forGen(gen)` supports generations 1–9; `.species`, `.moves`, `.items`, `.abilities`, `.types` and `.natures` expose `.all()`/`.get()`. Species include `types`, `abilities`, `baseStats` and `bst`; moves include `type`, `category`, `basePower`, `accuracy`, `pp` and `shortDesc`; natures include `plus`/`minus`.
- `.all()` and `.get()` include future/unavailable entries. Mainstream pools should check generation and `isNonstandard`; National Dex deliberately allows some `Past` entries. Battle-only forms expose setup requirements. These filters are not competitive legality validation.
- Generation Dex handles historical data (for example Gen 3 Shadow Ball is Physical and Gen 4 is Special). Gen 1/2 species still expose ability names despite the absent mechanic, and Gen 1 item catalogs contain items despite no held-item mechanic: hide controls explicitly.
- `await dex.learnsets.get(species.id)` lazily loads bundled local data. Source strings contain generation prefixes, including future sources in older-generation queries. Follow relevant `changesFrom` and valid `prevo` ancestry; do not blindly inherit every `baseSpecies`. Rotom forms, regional forms and Smeargle require care. Source-generation filtering is only a suggestion heuristic.
- No `@pkmn/data` dependency, simulator validator or exported stat calculator is installed. `Dex.stats` exposes names/IDs; the calculator inside `@pkmn/sets` is private. Implement a small tested local helper rather than depending on private exports.
- Ordinary modern stats use `floor((2*base + IV + floor(EV/4))*level/100)`, plus `level+10` for HP or `5` then nature rounding for other stats; Shedinja HP is 1. Defaults and rounding must match the installed parser. Gen 1/2 use DV/stat-experience semantics (IV representation rounded down to an even value, default maximum stat experience, no modern total EV cap, no nature); Gen 1 has one Special display. Do not model battle effects as ordinary stats.

## Decisions that must not be accidentally reversed

- Original raw text, unsupported fields and effective stats survive edits; visual/raw mode switching must not silently canonicalize data.
- Notes follow stable set identity through reorder; ambiguous/orphaned notes need explicit review, not silent deletion or reassignment.
- Team/set notes are snapshot data; tags/provenance/date/title/format are conceptual-team metadata. Restore creates a new version and does not overwrite history.
- Species plus move/item/ability constraints match the same set. Keep server-side indexed search and ownership checks.
- Newly authored Team Date defaults to local today; imports default to Unknown. Creation/import timestamps are not historical Team Date.
- Permanent deletion remains available directly in the library with named confirmation and atomic owner-scoped cascading deletion.
- Blank editor drafts need not create empty database snapshots. Archive UI removal must not strand stored records.
- Supabase is optional external setup, not a configured or verified hosted backend; Sites access remains owner-only. Never commit secrets or local databases.
- Append migrations; do not edit applied migrations. Parent `sources/` contains read-only synced reference files.

## Important files for the next review

1. `components/library.tsx` — navigation, fetching, team/detail/history state, creation/version dialogs, bulk operations and metadata refresh integration.
2. `components/visual-team-editor.tsx` — draft state, active slot, mode switching, save validation and orphan-note reconciliation.
3. `components/pokemon-set-editor.tsx` — current slot/field presentation and the main entry point for selector/stat/EV UI work.
4. `lib/visual-team.ts` — raw block parsing/patching, stable note identities and effective IV/happiness preservation.
5. `components/vault-ui.tsx` and `components/shared-team.tsx` — shared detail rendering; owned editing must remain optional and shared views read-only.
6. `components/team-card.tsx` — grid/list markup and library favourite/delete actions.
7. `components/team-metadata-panel.tsx` and `components/tag-picker.tsx` — reusable metadata/date/source controls and discoverable tag creation.
8. `components/search-filters.tsx` and `lib/search-filters.ts` — chip state, replacement/combination rules and active format context.
9. `components/format-navigator.tsx` and `lib/format-groups.ts` — format hierarchy and fallback grouping.
10. `lib/search.ts` — entity recognition, operators and same-set query plan; preserve this contract during UI work.
11. `lib/showdown.ts` and `lib/domain.ts` — parsing, snapshot/domain contracts and date/default rules.
12. `lib/demo-store.ts` — D1 lists/facets, archival visibility, owner-scoped writes and version concurrency.
13. `lib/supabase-store.ts` — production adapter/API parity for new list behavior.
14. `supabase/migrations/202609060001_teamvault.sql` and `202609070001_delete_team.sql` — PostgreSQL schema, search/RLS/RPCs and deletion; future changes go in a new migration.
15. `scripts/test.mjs`, `test-core.mjs` and `test-postgres.mjs` — suite runner plus SQLite/domain and PostgreSQL role/migration regressions (all under `scripts/`).
16. `scripts/test-ux.mjs` and `scripts/test-http.mjs` — preservation/chip/format helper checks and live local API integration.
17. `app/redesign.css`, `app/workflows.css` and `app/globals.css` — current layout/style layers to inspect before adding another competing override.
18. `app/api/vault/route.ts` — authenticated request dispatch, input limits and mutation boundary.
19. `README.md` and `.env.example` — local setup, external Supabase configuration, current behavior and test scope.
20. `DECISIONS.md` and `.openai/hosting.json` — invariants/planned directions and the existing deployment identity.
