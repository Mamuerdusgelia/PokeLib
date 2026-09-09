# TeamVault progress — Showdown integration, 2026-09-09

## Current state

The Showdown integration pass is implemented. This document supersedes the older Showdown UX-pass handoff. The existing library, authentication/storage adapters, relational search, metadata, versions, notes, sharing and deletion contracts are retained; no schema migrations were added in this pass.

Branch: main. Starting HEAD: 3f2029d; previous application implementation: b9256f1. Implementation commit fab8129775aaf6c1d8cd1490ed6ed766a0fbbdcd (fab8129) is now privately published. A documentation-only follow-up records that result; use git log -3 --oneline and git status --short to resolve the latest documentation commit and working-tree state.

## Completed this session

- Inspected official Showdown client/server sources and installed @pkmn packages. Added SHOWDOWN_INTEGRATION.md with exact source pins, reuse boundaries, data provenance, licensing, performance measurements and limitations.
- Replaced approximate raw learnset traversal with adapted Showdown generation/origin/ancestry logic and 11 narrowly extracted, lazily imported tables. Ordinary Gen 1–9, National Dex, form/pre-evolution/egg inheritance and Sketch use the generated availability marks. Pickers show the full pool with Show more, plus an explicit all-generation/custom option. Hidden Power variants have unique picker identities and work after Sketch expansion.
- Implemented arrows, Tab/Enter completion, forward/reverse move navigation and terminal exit. Escape closes the picker and returns focus. Restored first-character typing after Escape without selecting away that character.
- Added required/default abilities and required item choices on explicit species changes, while preserving valid abilities and unchanged unusual imported sets. Generation-specific Giratina requirements and multiple Arceus items have regression coverage.
- Added four-point EV buttons/arrows, local incomplete nature +/- selection, neutral choice and visible calculated stats. Existing 252/510 caps, Gen 1/2 behavior and odd imported EV preservation remain.
- Replaced sprite slugging with @pkmn/img 0.3.4, including canonical forms, shiny and gender. The shared sprite component propagates these values throughout library/detail/editor and retries after URL changes.
- Added restrained type/category colors, stronger gray surface levels, format-before-title presentation and generated Untitled titles. New drafts focus Add Pokémon. Phone EV sliders use a separate row; extended imported teams do not retain a covering sticky slot bar.
- Corrected species type-word queries: water ground means actual dual typing, while complete ability names such as Water Absorb still work. Explicit type/ability/move/stat filters remain available.
- Added AGPL-3.0-only LICENSE, upstream/MIT/artwork notices and a visible corresponding-source download. Builds package tracked app/config/docs with SHA256 file manifest; exclude real environments, databases, credentials and user data. Workspace build approvals are included. Source downloads use .tar to avoid the dev server's automatic .gz decoding.
- Fixed findings during verification: Vite JSON-import MIME mismatch, old-generation move blacklists applied outside DLC, absent typed Hidden Power picker/Sketch rows, Gen 1 reverse focus target, sticky multirow slots and crowded phone EV controls.

## Verification

- node scripts/test.mjs: PASS, 104 checks (41 domain/SQLite + 24 PostgreSQL/RLS/RPC + 13 preservation/UX + 10 builder + 16 Showdown integration).
- node scripts/test-http.mjs: PASS: authentication, persistence/search/history, archive inclusion, sharing/revocation, origin enforcement and deletion.
- node node_modules/typescript/bin/tsc --noEmit: PASS.
- pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run build: PASS, all five build phases. Final publication packaging is recorded separately below.
- Full lint remains non-clean: 67 pre-existing errors, down from 68 after removing an unused touched import. No errors in the new helper/selector/EV/source-offer files. Do not describe lint as passing.
- Source archive: manifest hashes checked, required config/license/data files present, no runtime env/database/.git/node_modules files. Repackaging an extracted archive without .git passed. HTTP download returned 200 with exact archive bytes. A first .gz comparison exposed automatic decompression; the final .tar resolves it.
- Read-only upstream parity review reported 8,109 ordinary species/format comparisons with three Necrozma-Ultra parent-array differences through the @pkmn shim. This is separate from the committed regression count; special mods were not certified.

Browser acceptance actually completed on localhost:

- New team inherited Gen 5 OU, generated a title and focused Add Pokémon.
- Swampert and Charizard four-move entry by typing/Tab; arrow selection; terminal focus on EV HP; Shift+Tab and Escape return without losing the draft.
- Charizard Toxic present in Gen 5 and absent in Gen 9 default pool; custom choice remains possible.
- Charizard Blaze, Swampert Torrent and Ho-Oh Pressure defaults; Giratina-Origin Griseous Core + Levitate.
- Odd HP EV 1 → 5 → 9 by keyboard/button; 510 total cap; Timid then Modest changes with calculated stats.
- Move type/category/power/accuracy visible. Species dual types, ability, complete Ice Beam learnset filtering and descending HP sorting verified. Fixed text-type queries exclude misleading Water Absorb matches.
- Actual loaded sprites: Ho-Oh normal/shiny, Farfetch'd, Mr. Mime, Giratina-Origin, Landorus-Therian, Urshifu-Rapid-Strike, Ogerpon-Wellspring and female Pikachu.
- Custom raw line, partial sets, shiny flag and set note survived visual/raw editing and saves. Viewed original v1 after v2; restored v1 into v3 without losing v2. Library presented one conceptual record.
- Desktop 1280×720 and phone-size 390×844 views inspected; narrow EV layout corrected. Physical touch, broad device coverage and assistive-technology testing remain unverified.

The disposable Showdown Integration QA team (d64a9c11-b423-44db-b932-6fcfddadb79e) was deleted after validating its three versions and preserved note/raw field. The older UX Review team and all user/demo records were retained.

## Partially implemented / known limits

1. Special formats are not full Showdown simulator mods: STABmons/Metronome and detailed Hackmons rules, official nd/adv200 aliases, VGC era-name-to-DLC mappings and full mod metadata overrides are incomplete. Common generation/National Dex pools are the verified target. Tier bans, event combinations and tournament legality are outside scope; custom raw input remains supported.
2. Main catalog/sprite/parser client code is still large. Large learnset tables are split and lazy, but the old @pkmn learnset chunk is still emitted by the dependency. No claim that every emitted asset belongs to the initial request. See measured chunk changes in SHOWDOWN_INTEGRATION.md.
3. No live Supabase project exists. Hosted magic-link/SMTP and two-account RLS integration still require external setup. Local PostgreSQL tests use an Auth shim.
4. Physical mobile/touch, screen readers and optional WebMCP remain unverified. This pass did not repeat interactive share-page acceptance; HTTP share/revoke and prior read-only wiring remain covered.
5. Existing lint debt and beta Vinext runtime remain. Library.tsx still owns significant navigation/detail/dialog state.
6. Existing D1 bulk metadata writes can partially apply on storage failure; PostgreSQL bulk operations are atomic. Switching D1 to Supabase creates a separate library; no full-fidelity migration exists.
7. Format metadata changes do not reparse historical snapshots automatically. Notes/history/raw-field preservation must not be sacrificed to automatic generation normalization.
8. Search lacks typo tolerance/Boolean grouping. note: quoted terms are ANDed current note words, not exact phrases or a same-slot note constraint.
9. Pokémon artwork licensing is distinct from code; later-generation community sprites have the upstream rights caveat recorded in THIRD_PARTY_NOTICES.md.

## Exact next tasks, in priority order

1. Review special-format support deliberately: shared format classification, explicit unsupported-format messaging, aliases and mod data. Add fixtures before claiming full parity. Avoid growing a second hand-maintained legality engine.
2. Measure initial request graph and first-use latency, then isolate builder/catalog imports where helpful. Preserve global search and sprite rendering.
3. Test real phone/touch and screen reader keyboard flows, including picker no-result Tab and old-generation reverse navigation; change only observed defects.
4. Configure Supabase when the user supplies a project, apply all existing migrations, and verify real sign-in/email, two-account isolation and sharing.
5. Triage touched-area lint and asynchronous error recovery; plan full-fidelity backup/migration and atomic D1 bulk operations before broader rollout.
6. Choose deferred PokéPaste/folder or other product scope only after a new user request.

## Files most relevant to follow-up

SHOWDOWN_INTEGRATION.md; DECISIONS.md; lib/showdown-learnsets.ts; lib/showdown-builder.ts; lib/showdown-data/provenance.json; lib/builder-data.ts; lib/pokemon-sprites.ts; components/pokemon-selector.tsx; components/pokemon-set-editor.tsx; components/ev-editor.tsx; components/visual-team-editor.tsx; lib/visual-team.ts; scripts/test-showdown.mjs; scripts/source-offer.mjs; scripts/update-showdown-data.mjs; app/redesign.css; components/library.tsx; lib/demo-store.ts; lib/supabase-store.ts; THIRD_PARTY_NOTICES.md.

## Decisions that must remain intact

Raw text/effective imported values and unknown lines survive edits. Stable note identities and orphan review are mandatory. Team/set notes belong to immutable snapshots; title/format/tags/provenance/date belong to the conceptual team. Restore creates a new version. New authored dates default to local today, imports to Unknown. Same-set search remains relational. Partial metadata patches and owner checks remain. Private Sites access is separate from app share tokens. Keep AGPL/MIT notices and the corresponding-source offer. See DECISIONS.md for details.

## Local commands

Run in C:\Users\24650\.codex\.chatgpt-projects\g-p-6a9d6190c39c8191988ca1de0c290ae4\teamvault with Node >=22.13, pnpm and native tar. No account/API key is required for local demo mode.

```powershell
pnpm --config.node-linker=isolated install --frozen-lockfile
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config .openai/wrangler.local.json --persist-to .wrangler/state
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run dev
# In another terminal:
node scripts/test.mjs
node scripts/test-http.mjs
node node_modules/typescript/bin/tsc --noEmit
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run lint
# Stage any new intended application files before build.
pnpm --config.node-linker=isolated --config.verify-deps-before-run=false run build
git diff --check
git status --short
git log -3 --oneline
```

## Publication

Published successfully at https://teamvault-library.internetscaryuwu.chatgpt.site/ on 2026-09-09 at 03:04:20 UTC. Owner-only access was reverified after publication (one owner, no external visitors or groups); no access policy, environment or schema changes were made.

- Project ID: appgprj_6a9d7930f9208191b3e0b14aae68961d.
- Saved version: 4, appgprj_6a9d7930f9208191b3e0b14aae68961d~appgver_05a91010266c8191a728ac723ea42577.
- Deployment ID: appgdep_6aa0cc702ac88191ac7e31240776496d; terminal status: succeeded.
- Deployed source commit: fab8129775aaf6c1d8cd1490ed6ed766a0fbbdcd. The exact commit was pushed before the built archive was saved and published.
- Hosted corresponding-source smoke check: authenticated GET /source/teamvault-source.tar returned HTTP 200, 12,390,912 bytes, identical to the locally verified archive containing 160 source files. An initial sandbox network denial and an authorization-header failure were resolved using a fresh owner token with the Bearer prefix.
- App browser handoff was requested; open_in_codex returned queued. Interactive browser acceptance above was performed locally, not repeated on the hosted build.

This publication record is a documentation-only follow-up to fab8129. The deployed source archive correctly describes that application commit rather than the later publication-status notes. Retain owner-only access.
