# TeamVault
A private library for competitive Pokémon teams: one conceptual team, immutable versions, indexed same-set search, structured provenance, historical dates, notes, bulk import, and revocable read-only sharing.

## What runs now
The Sites deployment uses an account-isolated, persistent Cloudflare D1 **demo workspace**, with ChatGPT sign-in. A first demo account receives six realistic singles/doubles and older-generation examples; nothing is saved in browser storage except the view preference and Supabase's auth session when enabled.

The complete PostgreSQL/Supabase adapter and migration are included. No Supabase project was available during implementation. The migration and RLS/RPC behavior are tested against embedded PostgreSQL (PGlite), but real Supabase email delivery and hosted Supabase connectivity must be checked after you connect your project.

## Architecture
- TypeScript, React, Tailwind, accessible Shadcn/Base UI primitives.
- Next.js App Router source conventions, built for Cloudflare Workers through the Sites scaffold's Vinext adapter. The scaffold currently pins Vinext 1.0.0-beta.5; it is a beta runtime, a relevant production rollout consideration.
- app/api/vault: authenticated HTTP boundary, input limits, same-origin mutations, server-side Showdown parsing and query planning.
- lib/supabase-store.ts: authenticated Supabase HTTP RPC calls. No service-role key.
- supabase/migrations: production PostgreSQL tables, indexes, RLS, atomic version creation and private helper functions.
- lib/demo-store.ts: D1 demo persistence, parameterized queries, server-side ownership checks, transactional imports/version creation.
- lib/showdown.ts: maintained @pkmn/sets and @pkmn/dex. Original export and structured full set JSON are retained. Unknown lines remain in the stored export.
- lib/search.ts: longest entity matching plus explicit syntax; related Pokémon predicates are correlated to the same version and slot. Metadata words use relational search-term indexes. No library-wide browser scans.
- Version snapshots contain parsed sets, Showdown text, original text, team notes, per-slot notes and parent version ID. Tags/provenance/date belong to the conceptual team.

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
2. Apply every SQL file in supabase/migrations in filename order through the SQL editor, or use Supabase CLI migrations with supabase db push. Existing projects should apply only migrations they have not run yet; 202609070001_delete_team.sql adds permanent deletion.
3. In Authentication → URL Configuration, set the site URL to your deployed TeamVault origin. Add that origin's / route and http://localhost:3000/ to the allowed redirect URLs used during development.
4. Enable Email authentication. Magic-link sign-in is implemented. Configure production SMTP and review Auth rate limits before opening registration broadly.
5. Copy .env.example to .env for local development and supply SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. The publishable (or legacy anon) key is public by design; **never use a service-role key**.
6. For hosted Sites, set those two runtime environment values through Sites environment settings/tools, then redeploy. Runtime values are not stored in .openai/hosting.json.
7. Restart local development after changing environment values.
8. Sign in by email. Your production account starts with an empty library; use Import or Settings → Add example teams.
9. Test two distinct accounts and an anonymous share link on your actual project before inviting players. The private Sites access gate still applies until the site's audience is intentionally changed.

Both variables must be supplied together. Demo teams remain in D1 and do not automatically move to Supabase. Export selected demo teams as a Showdown backup and import them into production if desired; Showdown backups do not represent notes or application metadata.

## Database migrations
D1 schema is defined in db/schema.ts. Run pnpm db:generate after schema changes. drizzle/0001_version_guards.sql adds immutable-history and same-team pointer guards. Applied migrations are append-only.

Supabase migrations are separately managed PostgreSQL migrations. They enable RLS on every exposed table. Authenticated clients have owner-scoped reads; all writes go through a narrowly dispatched vault RPC, which independently checks auth.uid(). Version saves lock the owned team and compare the expected current pointer. Private helper functions are not callable by application roles.

Normalized search_terms records are indexed on field/value/team/version/slot. The primary key also supports per-team correlated lookups. Teams have owner/modified, owner/title and owner/historical-date indexes. Search uses exact words and known Pokémon entity names; typo tolerance, Boolean grouping and arbitrary substring matching are not included.

## Search
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
- year:2022
- format:gen9ou
- note:"Trick Room"

Species + move/item/ability/nature/Tera constraints must match a single set. Species mentions can also match team metadata where that does not weaken this rule. Search targets current set data and notes; all historical version comments are indexed. The UI returns 30 teams per page.

## Dates and preservation
New teams default to the browser's local date. Imported teams default to Unknown; imported_at records the real import time. Dates support exact, month, year and Unknown precision. Unknown values sort last in either direction. The historical date never derives from created_at/imported_at.

Normal export returns the stored Showdown body, including unrecognised lines. Download original returns the original source attached to the snapshot. Canonical parsing/export is tested, but saving does not silently replace the user's text with a potentially lossy canonical representation. Import preview is not a legality validator.

## Sharing
Share tokens have 256 bits of randomness and only SHA-256 hashes are stored. A living link resolves the team's current version; ?version=N pins the displayed snapshot. Tokens authorize the conceptual team and its versions, so a pinned URL is not a narrower access grant. The interface explains this. Regeneration and revocation invalidate previous links. Shared projections include notes, tags and source, but exclude owner account fields and full history.

A private Sites deployment restricts access to the site itself. To let arbitrary people open links, first configure Supabase and deliberately change the site's audience. The application still keeps libraries private through RLS and token checks.

## Tests
- pnpm test: 39 domain/SQLite behavior checks and 22 PostgreSQL migration/RLS/RPC checks, including permanent deletion and ownership protection.
- pnpm test:http: integration checks against the running local server; signs into the local simulator, verifies authentication, persistence, search, history, sharing/revocation, and cross-origin rejection.
- pnpm typecheck: TypeScript validation.
- pnpm build: complete Workers production build.

PostgreSQL tests use PGlite with a minimal auth.uid() shim and real anon/authenticated roles. They do not test Supabase's email provider or live hosted policies. Test databases are ephemeral and isolated. HTTP tests create a disposable team, exercise its share links, then delete it.

WebMCP search_teams and import_showdown_teams are registered when the browser supports document.modelContext. No supported WebMCP validation context was available; the optional agent tools are not claimed as verified. No browser screenshot/click QA was performed; validation covers types, domain/database behavior, and HTTP integration.

## Deployment
Use the Sites workflow for the existing project_id in .openai/hosting.json:
1. Run tests, typecheck, and build.
2. Commit and push the exact validated source to the Site's repository with a temporary per-command credential.
3. Package dist with the Sites package-site.sh helper.
4. Save that version and publish privately.
5. Verify terminal deployment success.

Sites provisions the D1 binding and applies packaged migrations. Do not commit credentials, .env files, local databases, build artifacts or temporary archives. .env.example is intentionally tracked.

## MVP boundaries
No battle simulator, full legality checker, EV archetype inference, PokéPaste scraping, AI team analysis or collaborative editing. Imports are bounded to 200 teams/5 MB and 24 sets per team. PostgreSQL bulk changes are atomic; D1 bulk metadata updates preflight ownership and apply per team, so a storage failure partway through requires reviewing the affected selection before retrying. Archive is reversible. Delete is available directly on every library card and list row, and at the bottom of an owned team's detail page. It requires confirmation. It permanently removes all versions, notes, search entries, and share links in one database transaction; reusable account tags and other teams remain intact.

## Asset attribution
Sprites are loaded from Pokémon Showdown's public static sprite directory:
https://play.pokemonshowdown.com/sprites/gen5/
The app falls back to a species abbreviation if a sprite is unavailable. Pokémon and Pokémon character names are trademarks of Nintendo, Game Freak and The Pokémon Company. TeamVault is independent.
