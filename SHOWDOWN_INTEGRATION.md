# Showdown integration

## Implementation plan and boundary

Keep TeamVault's React builder state, surgical Showdown-text patches, stable note identities and all library/storage/auth/search/version/sharing contracts. Adapt focused Showdown move-pool and keyboard/nature behavior into a small builder adapter; do not import the Preact client, room model, battle simulator or local team storage.

1. Replace raw-source-generation learnset guesses with the complete generated Showdown teambuilder learnset table and adapted `BattleMoveSearch` traversal/availability rules. Load the narrow table only when a builder needs it; cache pools by format/species. Keep imported/custom values and an explicit all-generation-moves escape hatch.
2. Adapt `battle-team-editor.tsx` completion to React: arrows highlight, Tab/Enter commit and advance through moves, Shift+Tab reverses, terminal Tab exits and Escape dismisses only the picker. Keep unsupported raw data untouched.
3. Use pinned `@pkmn/img` for canonical species/form/shiny/gender sprite resolution instead of display-name slugging. Keep an explicit fallback that retries when the resolved URL changes.
4. Use Dex requiredItem/requiredItems/requiredAbility and normal ability 0 on explicit species changes; preserve valid imported choices. Keep automatic changes narrowly scoped to affected species requirements.
5. Adapt Showdown's EV/nature interaction with four-point controls and local incomplete +/- state, retaining existing generation/stat and preservation helpers.
6. Prioritize Add Pokémon, put format before generated draft title, and add restrained type/category and surface distinctions.

Adopt AGPL-3.0-only for TeamVault as a conservative compatible combined application. Retain MIT notices on upstream MIT portions. Include license/attribution and a corresponding-source download for interacting users; no private env, databases, credentials or user content belongs in that download. Measure build output before/after and lazy-load the large learnset table.

## Sources inspected

Official client revision: `eeaec53202425be20761198da837f5fb9b264c51` (2026-09-04).
Official server revision: `6b4bc34e44cc2541929cc4b8fff96e756ab3f268` (2026-09-06).

| Upstream source | License / purpose | Reuse decision |
| --- | --- | --- |
| client `play.pokemonshowdown.com/src/battle-dex-search.ts` | Explicit MIT header; full move pool, ancestry, origin marks, filters | Adapt focused learnset methods; omit general search renderer and viability curation. |
| client `play.pokemonshowdown.com/src/battle-team-editor.tsx` | AGPLv3; keyboard completion and EV/nature UI | Adapt behavior/handlers to React and TeamVault's state; no Preact/PS model. |
| client `play.pokemonshowdown.com/src/oldclient/client-teambuilder.js` | Client AGPLv3; prior species/default-item behavior | Inspect for parity; avoid its destructive whole-set resets. |
| client `play.pokemonshowdown.com/src/battle-dex.ts` and `battle-dex-data.ts` | Explicit MIT headers; sprite identifiers and rendering | Use maintained derived `@pkmn/img` implementation instead of another bespoke slug map. |
| client `play.pokemonshowdown.com/src/panel-teambuilder*.tsx` | Client AGPLv3; room/editor integration | Inspect boundary only; not copied. |
| client `build-tools/build-indexes` | Client AGPLv3 conservatively; generated generation/origin learnset marks | Use a pinned snapshot of its official generated table; retain provenance and rebuild instructions. |
| client `build-tools/build-learnsets` | Client AGPLv3 conservatively; older learnsets-g6 output | Inspected, not used; it is not the modern table generator. |
| server `sim/dex-species.ts`, `sim/team-validator.ts`, `data/pokedex.ts` | MIT; inheritance, HOME/transfer behavior and requirements | Inspect to validate boundaries; do not ship simulator/validator. |
| installed `@pkmn/dex@0.10.11`, `@pkmn/sets@5.2.0` | MIT | Retain catalogs/parser. Raw learnsets alone do not encode the client's complete move-pool rules. |
| `@pkmn/img@0.3.4` | MIT; derived Showdown sprite mapping/metadata | New pinned runtime dependency for sprites. |

Client sources: https://github.com/smogon/pokemon-showdown-client/tree/eeaec53202425be20761198da837f5fb9b264c51

Server sources: https://github.com/smogon/pokemon-showdown/tree/6b4bc34e44cc2541929cc4b8fff96e756ab3f268

## Implemented boundary

| TeamVault file | What changed |
| --- | --- |
| lib/showdown-learnsets.ts | Adapted first/next learnset traversal, regional/form aliases, origin marks, generation/tradeback filtering, Gen 9 egg inheritance, Past/National Dex rules and Sketch expansion. No viability shortlist. |
| lib/showdown-data/*.json | Narrow generated learnset/nonstandard-move tables, split by context and dynamically imported. Standard covers ordinary generations; optional tables cover named game/DLC contexts. |
| lib/builder-data.ts | Replaced approximate raw learnsets with lazy adapter calls; added typed Hidden Power picker entries and exact-type species queries without breaking complete ability-name queries. Existing stat math/caps retained. |
| lib/showdown-builder.ts | Small preservation-aware default ability/required-item, EV step, bounded focus traversal and generated-title helpers. |
| components/pokemon-selector.tsx / pokemon-set-editor.tsx | Showdown-inspired keyboard completion adapted to cmdk/React, full-pool filtering, incremental result expansion, explicit custom choices and required-item choices. |
| components/ev-editor.tsx | Four-point arrows/buttons and local incomplete nature +/- state; complete pairs patch the existing surgical raw editor. |
| lib/pokemon-sprites.ts / components/vault-ui.tsx | @pkmn/img canonical resolution; shiny/gender propagation and URL-sensitive fallback. Correct static female rendering using the package's frontf metadata. |
| components/visual-team-editor.tsx / app/redesign.css | Format-first draft header, generated name, Add Pokémon initial focus, restrained surfaces/type/category colors and responsive controls. |
| scripts/source-offer.mjs / app/layout.tsx | Build-time corresponding-source archive plus visible download, with tracked-file allowlist and per-file SHA256 manifest. |

TeamVault's parser, raw surgical patching, immutable versions, relational library search, ownership, sharing and database interfaces are unchanged. No simulator/Preact/Showdown room or local team-storage implementation is bundled. No new database migrations.

## Data provenance and maintenance

The official generated asset was retrieved on 2026-09-08, Last-Modified 2026-09-08T02:10:18Z. Original asset SHA256: `36a5dce8c06776affe5cda1a96c65554756218d2de89d2fc940f41ec8875eee3`.

The standard extracted table is 1,914,879 bytes, SHA256 `beb855993b6cb87a86a030c58fd68c551476a163d70e25ff295a0b5f82c0e9ab`. All eleven table hashes/sizes are committed in lib/showdown-data/provenance.json and verified in tests. .gitattributes fixes LF bytes across platforms. The live asset does not declare its generating server revision: the server pin above identifies inspected code, not an invented claim about the asset's build.

To reproduce this extraction from the exact downloaded snapshot:

```powershell
node scripts/update-showdown-data.mjs PATH_TO_TEAMBUILDER_TABLES_JS
node scripts/test.mjs
```

The extractor checks the pinned source hash and runs the official generated assignment in an isolated VM only during maintenance, never in the app. It rejects a newer snapshot until a maintainer deliberately updates the hash, retrieval/Last-Modified dates, code revisions and these notes. Re-run ordinary and mod fixtures and review changes before refreshing. Application builds already contain the extracted JSON and do not download live data.

## Licensing and source offer

LICENSE is the full GNU AGPLv3 text. package.json declares AGPL-3.0-only. Adapted files identify upstream authors/license/changes. THIRD_PARTY_NOTICES.md preserves the Showdown and release-specific @pkmn MIT notices and distinguishes remote Pokémon artwork rights, including the upstream community-sprite licensing caveat.

Every build first packages current tracked application/configuration/documentation files into public/source/teamvault-source.tar. A footer offers this to interacting users. Real environment files, credentials, local databases, user content, node_modules and .git are excluded. It includes lockfile, pnpm-workspace.yaml, generated data, extraction/build scripts and a file-hash manifest. Stage newly added source before building. Extracted downloads can repackage using their manifest without Git metadata. Local HTTP .tar downloads were byte-verified; .gz was replaced because the development server treated it as content encoding and decoded it automatically. Native tar and Node are required by this build helper.

## Performance measurement

The final application production build was compared to the saved pre-pass build by reading every emitted client .js chunk and applying Node zlib.gzipSync. Measurements are bytes, not network waterfall estimates:

| Chunk/purpose | Before raw / gzip | Integrated raw / gzip |
| --- | --- | --- |
| Shared vault/catalog/parser UI | 2,061,779 / 424,203 | 2,207,988 / 468,072 |
| Library UI | 376,725 / 106,688 | 381,561 / 108,075 |
| Old raw @pkmn learnset chunk | 3,197,846 / 409,092 | Still emitted by @pkmn, no longer requested by our move-pool helper |
| New standard Showdown pool | — | 1,914,916 / 204,603 |
| New lazy traversal adapter | — | 4,112 / 1,518 |

The measurements include the final behavior/layout fixes. A subsequent type-annotation correction changes only the corresponding-source archive, not the emitted application JavaScript. The standard pool is roughly half the compressed size of the former raw learnset request. Special-context table chunks range from about 6.7 KB to 208 KB gzip; only the selected context is imported. The complete client is not imported, but shared catalog/parser/sprite code remains substantial (about 44 KB extra gzip in the shared chunk, chiefly maintained sprite metadata). The source download is a separate optional asset, not JavaScript. Large-chunk warnings remain; initial-request graph and real cold-start latency require further profiling. Local measurement JSON is ignored under .artifacts/builder-bundle-before.json and builder-bundle-after.json.

## Verification and practical limits

104 committed checks passed: 41 domain/SQLite, 24 PostgreSQL/RLS/RPC, 13 raw/notes/UX, 10 builder and 16 new Showdown checks. HTTP integration, typecheck and production build passed. Lint retains 67 existing errors; new helper/selector/EV/source-offer files have no reported errors. Source archive required files/hashes, reconstruction without .git and exact HTTP download were checked.

Browser acceptance covered four moves by typing/Tab, arrows, terminal exit, reverse movement and Escape; Gen 5 vs Gen 9 Charizard Toxic; automatic abilities/Giratina item; four-point EVs and caps; Timid/Modest nature changes; type/category/stats/filter information; actual loaded awkward-name/form/shiny/female sprites; format inheritance and draft focus; custom raw line/note/partial-set preservation through v1/v2 and restore into v3. Desktop and 390px phone layouts were inspected; physical touch/screen readers were not. See PROGRESS.md for exact results and cleanup.

A read-only comparison against upstream getBaseResults with the same data/installed Dex reported 8,109 ordinary Gen 1–9 OU / Gen 8–9 National Dex species comparisons: 8,106 exact matches and three Necrozma-Ultra differences from array-valued battleOnly behavior in the @pkmn shim. This exploratory review is not included in the automated test count. TeamVault selects a concrete parent where the shim's upstream toID(array) yields empty.

This is individual move availability, not tier/ban/event/combination validation. Full STABmons/Metronome/Hackmons extensions, official nd/adv200 aliases, VGC era-name-to-DLC mapping and complete game-mod species/move/ability overrides are not implemented. Specialized learnset tables currently use ordinary generation Dex metadata. Keep those limitations explicit rather than declaring complete special-format parity. Imported unusual values and custom entry remain possible. No PokéPaste/folders/feeds/AI/simulator/calculator/replay/collaboration work was included.
