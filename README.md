# PokéLib

Formerly developed as TeamVault. The temporary Sites URL and historical infrastructure identifiers are unchanged.

A private library for competitive Pokémon teams: conceptual team families, alternate variants with independent current builds and history, indexed same-set search, structured provenance, historical dates, notes, bulk import, and revocable read-only sharing.

## What runs now

**Settings → Data** provides full PokéLib backup and additive restore. Export prepares a bounded, compressed `.jsonl.gz` archive, then offers **Download backup**. It includes families, variants, complete history, exact retained raw/source text, notes, private editing provenance, metadata/dates, reusable tags and live collection definitions. Showdown export remains team text only.

Restore validates the entire file for preview, waits for confirmation, validates it again on the authenticated server, and commits bounded, retryable chunks. Existing data stays; new IDs belong to the signed-in account. Share links are omitted and restored data is private. Re-select the same file to resume after reload. Finish restoring before editing the library elsewhere: concurrent portable-data changes stop the operation. Replace-library mode is deferred. See [BACKUP_FORMAT.md](BACKUP_FORMAT.md) for the version-1 contract, included/excluded data, conflict handling, limits and recovery behavior, and PERFORMANCE.md for local 1k/5k/10k evidence.

The Sites deployment uses an account-isolated, persistent Cloudflare D1 **demo workspace**, with ChatGPT sign-in. A first demo account receives six realistic singles/doubles and older-generation examples; nothing is saved in browser storage except the view preference and Supabase's auth session when enabled.

The existing PostgreSQL/Supabase adapter is connected locally to the real project. On 2026-09-10, all 12 migrations and the schema/permission audit passed on hosted PostgreSQL 17.6. Email sign-in and 24 hosted integration test groups passed using two distinct, confirmed Supabase Auth users. Test data was removed and both libraries were verified empty. The deployed Sites version remains the owner-only D1 demo; no Supabase deployment or audience change has been made. See PROGRESS.md for the evidence and production limitations.

## Architecture

- **Families, variants, history:** library rows group sibling builds into one conceptual family. Expand to load matching variants, 30 per request. Create/Duplicate variant copies the displayed snapshot into revision 1 of a sibling; Rename/Delete variant are separate from History. The final variant requires the explicit Delete team family action. Legacy teams appear as Main without changing their IDs or snapshots.
- A family owns its title. Rename the title in the detail heading to update all siblings atomically. Each variant owns its format, tags, source, date, notes and history. Bulk library selection means whole families: metadata expands to all their variants, while family deletion cascades every sibling. Existing share links expose one variant and its numbered history only.

- New Team opens an unsaved blank six-slot builder immediately, inheriting the active format filter. The first nonempty save creates the team; abandoning the draft creates no record.
- Click displayed species, item, ability, nature, move or stats to edit that set. Save updates the current version; Save as new version preserves it in history. Historical edits/restores always create a new version. Generation-aware selectors show types, abilities, base stats, descriptions and move data. Species can be filtered by two types, ability and move, and sorted by each stat or total. Move availability uses pinned Showdown teambuilder tables and adapted traversal, including Gen 9/National Dex differences. This is individual move availability, not full competitive legality; special-mod limits are documented in SHOWDOWN_INTEGRATION.md.
- EV sliders and numeric inputs show ordinary actual stats, a 510 total/252 per-stat cap for modern generations, and nature plus/minus controls. Gen 1/2 use documented stat-experience equivalents without the modern total cap. Unsupported mechanics are hidden by generation while their imported raw fields remain preserved.
- Click title, format, date and source in the team page to edit metadata inline. Tags retain Add tag → suggestions / Create. Metadata applies across versions and does not replace the displayed historical snapshot.
- Compact list view is the default unless a saved grid/list preference exists. Navigation contains All Teams, Favourites and Formats. Archive controls are removed; normal lists and counts include legacy archived records without rewriting their flags. Delete remains directly available in the library.
- Set notes are collapsed with an indicator. Export set copies/downloads the displayed snapshot's preserved raw block.
- components/visual-team-editor.tsx coordinates editor state; pokemon-set-editor.tsx renders slots and fields; lib/visual-team.ts preserves raw lines and stable draft note identities. Raw reorder/replacement reconciles notes; ambiguous notes must be reassigned or explicitly discarded.
- SearchFilters, FormatNavigator, TagPicker, TeamCard, ImportTeams and MetaFields are separate components. The library still owns navigation, fetching and existing detail/history/share flows; it remains a candidate for a later focused extraction.
- TypeScript, React, Tailwind, accessible Shadcn/Base UI primitives.
- Next.js App Router source conventions, built for Cloudflare Workers through the Sites scaffold's Vinext adapter. The scaffold currently pins Vinext 1.0.0-beta.5; it is a beta runtime, a relevant production rollout consideration.
- app/api/vault: authenticated HTTP boundary, input limits, same-origin mutations, server-side Showdown parsing and query planning.
- lib/supabase-store.ts: authenticated Supabase HTTP RPC calls. No service-role key.
- supabase/migrations: production PostgreSQL tables, indexes, RLS, atomic version creation and private helper functions.
- lib/demo-store.ts: D1 demo persistence, parameterized queries, server-side ownership checks, transactional imports/version creation.
- lib/showdown.ts: maintained @pkmn/sets and @pkmn/dex. Original export and structured full set JSON are retained. Unknown lines remain in the stored export.
- lib/search.ts: longest entity matching plus explicit syntax; related Pokémon predicates are correlated to the same version and slot. Metadata words use relational search-term indexes. No library-wide browser scans.
- Versions contain parsed sets, Showdown text, original text, team notes, per-slot notes, parent version ID, revision tokens and optional private authoring-default flags. Tags/provenance/date belong to the variant and apply across its history.

## PokéPaste import

Import teams → PokéPaste URL accepts `https://pokepast.es/<16-character hex ID>`. The authenticated server reads the official JSON representation, then uses the existing Showdown parser/preview and chunked import. Title, author, original URL and paste notes are retained as provenance/team notes. Team Date starts Unknown; format is not inferred when the paste supplies none. Review the canonical format picker before saving if needed.

Only the exact HTTPS pokepast.es host is supported, with no credentials, custom ports, queries, fragments or redirects. Responses have a 10-second timeout, 1 MB streaming limit and 150k-character team-text bound. Oversized optional metadata has a visible preview warning. No API key, arbitrary URL proxy, or PokéPaste publishing is introduced. The response contract is verified against [PokéPaste's official server](https://github.com/felixphew/pokepaste/blob/v3/server.go).

Optional live-service test (localhost and outbound HTTPS required): `node scripts/test-pokepaste-http.mjs`. Normal automated tests use deterministic responses and cover invalid hosts, redirects, malformed data, response limits, provenance and both persistence adapters. Supabase must apply `202609100004_pokepaste_source.sql` to allow the named PokéPaste provenance type.

## Local setup

Requires Node 22.13+ (Node 24 recommended) and pnpm.

1. Install: pnpm install
2. Review any dependency build approvals requested by pnpm. The compiler/runtime require esbuild, sharp, and workerd.
3. Apply demo migrations:
   node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config .openai/wrangler.local.json --persist-to .wrangler/state
4. Start: pnpm dev
5. Open the printed local URL and choose **Sign in with ChatGPT**. The Sites development plugin provides a local-only simulated account (Seedy); it strips forged authenticated-user headers. This simulator is not shipped in production.
6. On this Windows runtime, if pnpm reports a dependency layout mismatch, use pnpm --config.node-linker=isolated run dev. The same option can be used for install/build.

Production demo authentication trusts Sites' dispatcher-injected identity headers. Do not expose the Worker directly behind a proxy that lets callers forge those headers. Supabase mode validates bearer tokens against Supabase Auth and relies on RLS in addition to the API checks.

## Connect Supabase

1. Create a Supabase project.
2. Apply every SQL file in supabase/migrations in filename order through the SQL editor, or use Supabase CLI migrations with supabase db push. Existing projects should apply only migrations they have not run yet: 202609070001_delete_team.sql adds permanent deletion, 202609080001_include_archived.sql preserves legacy archived visibility, and 202609080002_search_set_notes.sql fixes explicit note searches; 202609090001_edit_current_version.sql adds current Save, concurrency guards and private authoring flags.
3. In Authentication → URL Configuration, set the site URL to your deployed PokéLib origin. Add that origin's / route and http://localhost:3000/ to the allowed redirect URLs used during development.
4. Enable Email authentication. Magic-link sign-in is implemented. Configure production SMTP and review Auth rate limits before opening registration broadly.
5. Copy .env.example to .env for local development and supply SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. The publishable (or legacy anon) key is public by design; **never use a service-role key**.
6. A future Supabase deployment will need those two runtime values in Sites environment settings. Runtime values are not stored in .openai/hosting.json. Deployment and audience changes remain deferred until the separately requested release review.
7. Restart local development after changing environment values.
8. Sign in by email. Your production account starts with an empty library; use Import or Settings → Add example teams.
9. Test two distinct accounts and an anonymous share link on your actual project before inviting players. The private Sites access gate still applies until the site's audience is intentionally changed.

Both variables must be supplied together in the ignored `.env`; Git tracks only the non-secret `.env.example`. Do not add duplicate `NEXT_PUBLIC_` variables. The local `/api/config` must report `demo: false`, and a private request without a Supabase bearer token must fail with 401. Demo teams remain in D1 and are not automatically moved. This setup did not copy or modify the existing demo library.

The owner configured Site URL `https://teamvault-library.internetscaryuwu.chatgpt.site/` and allowed redirects `http://localhost:3000/` and that deployed URL. The existing magic-link code returns to `/`; it does not use an `/auth/callback` route. Email authentication and sign-up remain enabled, email confirmation remains required, and anonymous sign-in remains disabled.

Supabase's [default email service](https://supabase.com/docs/guides/auth/auth-smtp) only delivers to organization members, currently at two messages per hour with best-effort delivery. Account A completed the app's email-link flow. The owner created a separate confirmed Auth test user B through Authentication → Users, then signed B in with its test password in a temporary local test page. This did not change project-wide confirmation settings or grant B organization access. The application continues to use magic links. Configure production SMTP before testing delivery to ordinary beta users.

## Database migrations

D1 schema is defined in db/schema.ts. Run pnpm db:generate after schema changes. drizzle/0001_version_guards.sql adds the original history/pointer guards; 0002_edit_current_version.sql permits current-only Save with immutable identity and forward-only pointers. Applied migrations are append-only.

Supabase migrations are separately managed PostgreSQL migrations. They enable RLS on every exposed table. Authenticated clients have owner-scoped reads; all writes go through a narrowly dispatched vault RPC, which independently checks auth.uid(). Version saves lock the owned team and compare the expected current pointer, edit revision and metadata timestamp. Private helper functions are not callable by application roles.

The real empty project received these existing files in order, in one audited transaction:

```text
202609060001_teamvault.sql
202609070001_delete_team.sql
202609080001_include_archived.sql
202609080002_search_set_notes.sql
202609090001_edit_current_version.sql
202609100001_scale_formats.sql
202609100002_import_receipts.sql
202609100003_variants.sql
202609100004_pokepaste_source.sql
202609100005_collections.sql
202609100006_team_core_search.sql
202609100007_backups.sql
```

Catalog verification matched 13 RLS tables, 33 indexes, 10 policies, 9 application triggers and 28 application functions, including role privileges. Supabase's existing postgres-owned `public.rls_auto_enable()` event-trigger function was preserved. The empty-project preflight initially stopped on that platform helper; the reviewed setup bundle allowed only its exact no-argument event-trigger signature and verified it was unchanged. Migration source files were unchanged. Do not rerun the empty-project bundle on an initialized project or remove a platform helper to pass a preflight.

Normalized search_terms records are indexed on field/value/team/version/slot. The primary key also supports per-team correlated lookups. Teams have owner/modified, owner/title and owner/historical-date indexes. Search uses exact words and known Pokémon entity names; typo tolerance, Boolean grouping and arbitrary substring matching are not included.

## Search

Use `+` for another team-member condition: `Mega Gengar + Zygarde` requires both in the same current variant; `Kyogre + Tornadus + Incineroar` requires all three. Each clause keeps same-set relationships: `Mega Gengar Shadow Ball + Zygarde Thousand Arrows`. Metadata stays global, e.g. `Mega Gengar + Zygarde year:2017` or `Kyogre + Tornadus tag:"Tournament Grade"`. Spaces around `+` are optional; quote literal plus signs in metadata. Up to six nonempty conditions are supported; repeated conditions may match the same slot. Empty trailing conditions are ignored while typing. Without `+`, `Darkrai Ice Beam` and `Focus Sash Rayquaza` retain their existing meaning.

Known aliases use the pinned Dex. Mega names accept `Mega Gengar` and `Gengar-Mega`, matching either explicit imported forms or their base species with the required item/move on that same set. Base `Gengar` keeps exact base-species matching. Current variants are filtered before family grouping; a matching sibling is named in the row, and expansion shows only matching variants. Existing saved collections remain valid; new core collections are live queries too.

Search keeps its existing 250 ms typing debounce. A request still pending after 200 ms shows a quiet `Searching…` label by the input; fast responses show no loading animation. Existing rows remain usable. Query/navigation changes abort obsolete requests, including a guard against late decoded responses or errors. Dark surfaces now distinguish the page, navigation, workspace, rows, editor, inputs and result panels without expanding compact rows or the builder.

SQLite needs no new schema or reindex. Supabase installations must apply the append-only `202609100006_team_core_search.sql` matcher migration before using core searches. It is applied and verified on the real project along with the other migrations listed above.

The unified search bar offers From, Tag, Year, Format, Pokémon, Move, Item and Ability suggestions. Choose values to create removable chips, then keep typing ordinary text. `from:` is an alias for `source:`. Source/year/format/Pokémon/item/ability chips replace their previous value; tags and moves can combine. Year means historical Team Date; Unknown is an explicit date filter.

The collapsible format navigator uses Singles/Doubles → generation/game → competitive format. National Dex OU/Ubers belong to Singles; National Dex Doubles belongs to Doubles. The searchable picker uses a pinned, generated official Showdown format registry. Known names/case normalize to IDs (including contextual Gen 4 Ubers); bare Ubers with no generation means Gen 9. Existing search-index aliases remain searchable without rewriting historical snapshots. Unknown imported names are preserved; Custom / Other stores explicit generation/battle context and warns that assistance is incomplete. Formats are pinned metadata, not a live registry or full legality engine. Per-format counts are not included.

Free text examples:

- Darkrai Ice Beam
- Focus Sash Rayquaza
- Gliscor Toxic
- Tournament Grade Kyogre
- Strange Name
- 2022 Yveltal
- gen9ou Darkrai

Power syntax:

- team:"Worlds Prep"
- pokemon:Darkrai move:"Ice Beam"
- item:"Focus Sash"
- ability:Drizzle
- nature:Timid
- tera:Grass
- tag:"Tournament Grade"
- source:"Strange Name"
- from:"Strange Name"
- year:2022
- format:gen9ou
- note:"Trick Room"

Species + move/item/ability/nature/Tera constraints must match a single set. Species mentions can also match team metadata where that does not weaken this rule. Search targets current set data and notes; all historical version comments are indexed. Explicit `note:` searches current team and set notes across the team; quoted note values are an AND of words, not an exact phrase. Historical set notes do not match current-library queries. The UI returns 30 teams per page.

## Pre-beta usability and cleanup

The product name is **PokéLib**. Singleton families show no variant-count indicator; initial revisions have no ordinary v1 badge. Multiple variants still expand lazily, and History remains available with its full revision list.

Click Format and type into the focused search field (for example, `gen 4 ub`, `nat dex ou`, `vgc 2026` or `doubles ou`). Arrow keys plus Enter/Tab or clicking select a canonical registry entry across generations. Results reflect the pinned registry. Only Custom / Other exposes generation and battle-type controls.

The compact new-team builder keeps format, secondary editable name, tags/mode controls and six slots together. Empty-slot selection focuses Pokémon search. Type, second type, ability, learnable-move and stat-sort controls are hidden under Filters; active filters are indicated and can be cleared.

Showdown backup parsing recognizes a known format only in the leading `[format]` position, including the official `-box` suffix and known contextual aliases. Unknown prefixes such as `[BO]`, `[HO]` and `[Stall]` remain in the title; format stays Unknown. Folder/name text is retained as title text, without introducing folders. Original input remains available. Ordinary headerless imports keep an explicitly chosen import format/context.

Filter or open a collection, review the result count, then choose **Select current page (30)** or **Select all N matching teams**. Selection spans pages and contains family IDs only. The toolbar shows the selected count, Add tag, Edit metadata and Delete selected. One confirmation names the exact family count and active query; each family includes all sibling variants, even those outside the filter.

**Settings → Danger Zone → Delete all teams** reviews all owned families, including archived teams, without the current filter/favourites restriction. Type **DELETE ALL** to confirm. Families, variants, history, notes and variant share links are deleted. Reusable tags and saved collection definitions remain; reviewed live collection links are revoked before deletion, so future imports require explicitly re-sharing them. The scope freezes family/shared-collection IDs for review; families or newly shared collections added elsewhere afterward are not included. Five-family chunks show progress and use existing owner checks/receipts. A partial failure keeps completed work; Retry resumes in the open dialog. Refreshing loses the in-memory operation descriptor. Selection is bounded at 10,000 families; larger libraries must first use filtered cleanup. No destructive operation runs merely by opening Settings or the review.

For destructive browser acceptance, use an isolated local database (PowerShell, normal dev server stopped):

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config .openai/wrangler.local.json --persist-to .artifacts/prebeta/state
$env:POKELIB_QA = '1'
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run dev
# After stopping the QA server, restore the normal environment:
Remove-Item Env:POKELIB_QA
```

The QA flag only selects a separate local development persistence path; it never affects the production build or changes authentication.

## Large-library workflows

The supported design target is 10,000 stored teams per account with 30-record database pages. Select current page accumulates across pages; Select all matching resolves up to 10,000 owned IDs on the server. Bulk Delete has one confirmation; Add tag unions existing tags. Source/year replacement also remains available. Operations run in five-team atomic chunks with progress; completed chunks survive failures and Retry continues the paused operation without duplicating completed work. A partial close reports the actual completed count. Selections refer to whole team families; bulk metadata resolves every sibling variant before confirmation, including siblings outside the current filter.

Import parses a full Showdown archive once (20 MB / 10,000 blocks maximum), presents 50 editable previews per page, and accepts common tags/source/date/notes. Persistence uses five-team chunks and owner-scoped durable receipts. The UI has been exercised with 1,000 teams; retry correctness is tested on both adapters. Keep a paused dialog open for Retry: navigation/reload loses its in-memory run descriptor even though successful chunks remain saved. A fresh import intentionally creates new records. Legacy unchunked API/WebMCP calls retain a 200-team request bound; use the Import dialog for large archives. Selected Showdown export remains capped at 200 teams.

See [PERFORMANCE.md](PERFORMANCE.md) for measured 1k/5k/10k timing tables, payload limits, before/after query and Save statement counts, and the distinction between local and hosted evidence. [SCHEMA_PLAN.md](SCHEMA_PLAN.md) records the implemented families/variants/collections relationships, their additive migrations and development recovery.

## Dates and preservation

New teams default to the browser's local date. Imported teams default to Unknown; imported_at records the real import time. Dates support exact, month, year and Unknown precision. Unknown values sort last in either direction. The historical date never derives from created_at/imported_at.

Normal export returns the stored Showdown body, including unrecognised lines. Download original returns the original source attached to the snapshot. Canonical parsing/export is tested, but saving does not silently replace the user's text with a potentially lossy canonical representation. Import preview is not a legality validator.

Visual changes rewrite only the edited Showdown field lines; unknown lines and extra moves remain. Implied Hidden Power IVs and Frustration happiness are materialized when needed to preserve their effective values. Explicit zero stat experience survives Gen 1/2 save/reopen. Raw text with a layout the visual editor cannot safely split stays editable in text mode; per-set export asks for full-team export in that case. Special imported fields without dedicated controls remain accessible there. The default picker shows the full Showdown-derived move pool with an explicit advanced generation-bounded browsing/custom-entry option; a full legality checker is not included.

## Sharing

Share tokens have 256 bits of randomness and only SHA-256 hashes are stored. A living link resolves the team's current version; ?version=N stays on that numbered version, following edits while it is current and becoming fixed once historical. Standalone team tokens authorize one variant and its versions, so a pinned URL is not a narrower access grant. The interface explains this. Regeneration and revocation invalidate previous links. Shared projections include notes, tags and source, but exclude owner account fields and full history.

A private Sites deployment restricts access to the site itself. To let arbitrary people open links, first configure Supabase and deliberately change the site's audience. The application still keeps libraries private through RLS and token checks.

## Collections

Use **Save as collection** beside the search controls to save the current text, filter chips, favourites setting and sort. Collections appear in the sidebar and in the mobile-accessible Collections dialog. Selecting one restores its filters; Edit changes its name, description or saved filters; Delete removes the search and revokes its links while retaining all teams. Names are unique per owner ignoring case. Collection management is paginated at 30 entries and edits reject stale timestamps. Known format filters store canonical IDs.

**Share collection** creates a revocable live capability at `/share/collection/<token>`. Membership is reevaluated from the saved owner/query on every read. Families are grouped, only matching variants can be expanded/opened, and details expose current snapshots, notes, tags and provenance. History, unmatched siblings, private sibling counts, saved query definitions, owner fields and authoring flags are omitted. Page/family/team parameters only select within this scope; they cannot replace the saved query. Regenerate invalidates the old token; Revoke and collection deletion remove access. Editing a shared collection changes its exposed membership, with an explicit warning in the editor. The outer owner-only Sites gate still applies.

Collections copy no teams and require no membership table, so one variant may match several. Snapshot collections and folders remain deferred. D1 0007 and PostgreSQL 202609100005 add the tables, owner indexes, unique names, share hashes and cascading revocation. `node scripts/test-collections-http.mjs` tests the real routes against localhost.

## Save diagnostics

Append `profile=1` to the local page URL to enable the local Save timing panel. It records click-handler entry, request start, Saving feedback, response/decode, React commit and a post-paint checkpoint for current Save, new history and Create variant. Requests opt into numeric Server-Timing entries; D1 records preparation, mutation and readback separately, while Supabase reports RPC duration including its network round trip. No content, identifiers or telemetry are recorded. `node scripts/profile-save-http.mjs sample` measures five local HTTP requests for each one/six-set action using disposable fixtures. See PERFORMANCE.md for before/after results and limitations.

D1 detail reads now fetch current state/history/share status in one owner-scoped SQL statement. Hidden library and facet refreshes are deferred until returning to the library; initial sidebar facets still load. Saved remains conditional on confirmed persistence, and all three stale-write tokens remain mandatory.

## Tests

- pnpm test: 263 checks (92 domain/D1, 75 PostgreSQL, 13 UX, 10 builder, 25 Showdown, 13 authored defaults, 10 formats, 6 PokéPaste, 3 delayed-request and 16 backup checks). Includes 1,000-team import/replay, composition/same-set matching, variant/history isolation, collection privacy/live membership, ownership and concurrency.
- pnpm test:http: D1 integration checks against the running local simulator. This is not the real Supabase test suite; do not use it as evidence of hosted Auth/RLS verification.
- pnpm typecheck: TypeScript validation.
- pnpm build: complete Workers production build.

The normal PostgreSQL tests use PGlite with a minimal auth.uid() shim and real anon/authenticated roles. Those databases are ephemeral and isolated. Separate real-service verification on 2026-09-10 passed 24 groups through the Supabase-backed local HTTP routes and direct hosted PostgREST requests using real Auth sessions. It covered authored/imported teams, live PokéPaste, Save/history/variants, tags/search/collections, both directions of owner isolation, role privileges, capability tampering/rotation/revocation, and full backup/additive restore with malicious ownership fields. These 24 groups are separate from the 263 deterministic checks. The temporary runner and its credentials-free results live under ignored `.artifacts/supabase-setup`; session tokens were kept only in runner memory and normal browser session storage. No test endpoint was added to the application.

Prior browser QA covered builder/raw/history workflows documented in PROGRESS.md. That earlier pass inspected 1440×900 desktop and 390×844 mobile library, builder, selectors, import, collections, settings and confirmation dialogs, plus composition, matching siblings and deliberately delayed/superseded requests. Compact geometry was preserved and no horizontal overflow was observed. Real phone/touch and full assistive-technology testing remain unclaimed.

WebMCP search_teams and import_showdown_teams are registered and were visible to the browser, but their calls were not exercised. Real Supabase authentication and isolation are verified as described above; production SMTP and a Supabase-backed deployment remain deferred. Repository-wide lint has 64 previously recorded inherited findings; this setup does not claim a fresh repository-wide lint run.

Relocation verification used a clean tracked-source checkout and a frozen-lockfile install with fresh dependencies; all required generated data/migrations are tracked. Never copy node_modules from another directory: its package-store links can contain absolute paths. Run all commands from the repository root. Normal tests regenerate .test-build and use isolated in-memory databases; source packaging regenerates ignored downloads.

For focused browser reproduction, start the documented POKELIB_QA server, run `node scripts/search-browser-fixtures.mjs seed`, then `node scripts/search-qa-proxy.mjs`. Browse localhost:3001 and write `{"delay":4000}` to `.artifacts/search-delay.json` to delay family-search responses (0 restores normal speed). The proxy is localhost-only test infrastructure, outside the application. After inspection run `node scripts/search-browser-fixtures.mjs cleanup`. Both fixture commands verify the isolated QA database before mutating.

## Deployment

Use the Sites workflow for the existing project_id in .openai/hosting.json:

1. Run tests, typecheck, and build.
2. Commit and push the exact validated source to the Site's repository with a temporary per-command credential.
3. Package dist with the installed Sites package-site.mjs helper.
4. Save that version and publish privately.
5. Verify terminal deployment success.

Sites provisions the D1 binding and applies packaged migrations. Do not commit credentials, .env files, local databases, build artifacts or temporary archives. .env.example is intentionally tracked.

## MVP boundaries

Team variants with independent history, PokéPaste import, saved collections and live collection sharing are implemented. Their schema migrations are included for D1 and PostgreSQL. Battle simulation, full legality checking, EV archetype inference, AI team analysis, folders, snapshot collections and collaborative editing remain outside the implemented scope.

Each imported team remains bounded at 150 KB / 24 sets, while the large-import dialog supports bounded multi-request archives. Both adapters commit each bulk chunk atomically and record retries with the mutation. Legacy archived teams remain visible. Deletion is available in library cards/rows, details and bulk selection, with confirmation. Deleting a team family removes all its variants, versions, notes, search entries and variant share links; reusable account tags remain.

## Asset attribution

Sprites are loaded from Pokémon Showdown's public static sprite directory:
https://play.pokemonshowdown.com/sprites/gen5/
The app falls back to a species abbreviation if a sprite is unavailable. Pokémon and Pokémon character names are trademarks of Nintendo, Game Freak and The Pokémon Company. PokéLib is independent.

## Showdown integration and source license

PokéLib is AGPL-3.0-only, with MIT notices retained for incorporated MIT code. See LICENSE, THIRD_PARTY_NOTICES.md and SHOWDOWN_INTEGRATION.md for exact upstream sources, data provenance and limitations. @pkmn/img resolves form, shiny and gender sprite URLs; artwork rights are separate from source-code licensing.

Move inputs support arrows, Tab/Enter completion and bounded forward/reverse navigation. EV buttons/arrows step by four while preserving imported odd values until edited; nature can be selected directly with +/- controls. Explicit species changes supply default abilities and canonical required items. New drafts show format before a generated title and focus Add Pokémon.

The production build first runs scripts/source-offer.mjs, emitting public/source/pokelib-source.tar (with the historical teamvault-source.tar URL retained as an identical-byte alias). It contains tracked application/configuration/documentation files and a hash manifest, never runtime environments, databases or user content. Stage new source files before building from Git. Downloaded source uses SOURCE_MANIFEST.json without requiring .git; install dependencies with the included pnpm-workspace.yaml, then use the local commands above. Node and a native tar executable are required.

## Builder usability and profiling

Move pickers use official aliases (hdb/boots, cc and other species/item/move abbreviations), exact-name precedence and unique typed Hidden Power rows. More move options contains the uncommon-move/custom-entry controls. All matching results remain accessible in batches of 40.

Useful required-item/move forms such as Zacian-Crowned are selectable and displayed with transformed stats. Canonical Zacian + Rusted Sword + Iron Head remains compatible with Showdown; the preview displays Behemoth Blade. Imported raw text is preserved until an explicit edit. Inline stat +/- controls configure nature without duplicate boosted/reduced-stat dropdowns.

New authored Gen 9 sets receive a required/primary Tera default. Authored special sets can receive managed 0 Attack IV; adding a physical move restores only an automatic zero. Imported/manual values remain untouched. Authoring flags persist privately through Save/version/restore and are invalidated by manual raw changes. No Special Attack zeroing or Gen 1/2/Hidden Power inference occurs.

For local diagnostics open http://localhost:3000/?profile=1. Browser console records New Team, Add Pokémon, move-results, save-feedback, save-persisted and save-visible timings, plus API action durations and development React render timings. No team data/IDs or telemetry is transmitted. See SHOWDOWN_INTEGRATION.md for measured results and limits.
