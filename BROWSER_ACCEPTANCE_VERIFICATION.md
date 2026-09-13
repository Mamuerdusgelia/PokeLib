# PokéLib browser acceptance — 14 September 2026

Scope: existing localhost:3001 POKELIB_QA browser preview only. Initial library contained zero teams. The run created 18 realistic six-Pokémon fixtures, then nine teams through the real PokéPaste import UI. No production accounts, data, databases, storage, deployments or migrations were accessed or changed.

## Layout measurements

| Check | Observed result |
| --- | --- |
| 1366 × 768, standalone list | Five complete cards. Fifth bottom: 753.2 CSS px. Sixth begins 758.2 px. |
| 1366 × 768, mixed list | Five identifiable teams, including every Pokémon in the fifth row. |
| 1366 × 768, expanded family | Five distinct teams visible: Main, expanded variant(s), and surrounding standalone teams. Final imported-family check: fifth name/sprite region ends at 737.5 px. Earlier three-member family also passed. |
| Previous sprite box | 35 × 40 CSS px. |
| Final desktop sprite box | 63 × 64 CSS px: 180% width / 160% height, approximately 170% linear size (+70%). Aspect ratio retained with object-fit: contain; pixelated rendering. |
| Row height | Standalone rows decreased from 97.6 to 95.6 px despite larger sprites. |
| 390 × 844 populated | Document width 375 px inside 390 px viewport. No horizontal page overflow. Long tournament name, source metadata, six sprites, expanded family and both import/export dialogs visually inspected. |
| 1920 × 1080 | Seven complete parent cards plus an expanded variant visible; no overflow or overlap. |

Heading, local/privacy notice, search, Export matching, collections, sorting, view controls, Favourites/Formats navigation and selection remain available. Bulk actions remain absent until selection begins. Large desktop sprite columns switch to a stacked layout below 1280 px.

## Actual browser interactions

- **Reorder:** actual pointer drag moved Kyogre from slot 1 to 3. Complete raw blocks remained equal apart from ordering, including item, ability, EVs, nature and moves. Its distinctive set note stayed attached. Move-left worked by click and move-right by keyboard. Save/reload and Showdown text preserved the new order. Insertion-side accent styling is implemented; no separate mid-drag screenshot was captured.
- **Imported reorder:** Groudon was dragged to slot 4, saved and reloaded. A sprite-origin drag initially failed; disabling nested artwork hit targets fixed it. A subsequent actual drag from Shuckle artwork moved the complete set to slot 3. Saved/exported order was Diancie-Mega, Lunala, Shuckle, Groudon-Primal, Yveltal, Arceus.
- **Merge:** three fixtures merged with a non-first team selected as Main. Submit was disabled before choosing a Main; radio selection allowed exactly one. Reload preserved the root and members. Merging the existing family with a standalone team represented all four members. A later two-paste merge also chose the non-first team as Main.
- **Detach:** attempting to detach a Main with children produced clear instructions and no mutation. Detaching a variant made it standalone, preserved its raw text, Pokémon order, source, note and history, and survived reload.
- **Search:** a title query found an individual imported variant inside its merged family and identified it as a matching variant. It remained editable/exportable.
- **Exports:** selected-family export produced 18 teams / 12,460 characters in selection order, with Main first within a family. Button copy, manual Ctrl+A/C and actual downloaded UTF-8 file matched. The final full-library export produced 27 teams / 22,316 characters; button copy, manual copy and download again matched exactly after line-ending normalization. Actual downloads were read from disk; the browser download-event observer timed out, but both files were successfully downloaded and verified. Multi-team headers and blank separators remained intact.

## Real PokéPaste batch

The UI received ten unique well-formed paste URLs, one repeated URL, malformed paste text, an unrelated example.com URL, surrounding prose/headings and punctuation. Nine previews/imports succeeded; the unavailable 0000000000000000 paste reported its URL and “Paste not found”. Duplicate URL imported once. Preview order followed first occurrence, and titles/authors came from the pastes, not surrounding prose. Observed progress included “Loading 8 of 10…”, followed by “Imported 9 / 9” and “9 teams imported, 1 failed”.

Successful paste IDs in input order: a6f77c900d467417, 6e7dc0529c61260f, 0b0e3f2c552e3eb6, d02c77c023b28ad4, a47bb2a45883213e, 00d65a0880db3420, be817bd8391bdfde, 11bb1b899f6d5fce, 14a6a4a33b651996. Imported titles began “pdon shuck mdia luna ygod ek”, “pdon gren xern dusk zyg water”, “deos pdon wobb mblaz xern ek”, “pdon dusk xern hooh zyg dark”; remaining titles were Mono Hoenn, Screens Hyper Offense, Gambit Encore Bundle Dirge, Offensive Anti-Meta and Bulky Offense.

## Adjustments and regression checks

- Reduced wasted desktop header/toolbar/card spacing; enlarged sprites; retained legible text and controls; compacted expanded rows and removed the duplicate displayed Main from expansion.
- Collapsed families now display their chosen Main, while filtered searches can still display the matching variant. Family exports preserve selected-family order and put Main first.
- Fixed drag initiation over sprite artwork. Normalized Showdown export CRLF/LF endings across textarea, clipboard and download.
- Added assertions for Main representation, matching-variant search, ordered family expansion/deduplication, and export newline normalization.
- Full automated suite: **325 PASS entries, exit 0**. TypeScript passes. Targeted feature-module lint passes. Wider lint includes **15 baseline diagnostics** in auth-gate, library, vault-ui and showdown; rule/message comparison with HEAD found no new diagnostics. Four unused imports were removed; unrelated legacy lint rewrites were left out of scope.
- Production build passes using source-offer packaging plus vinext build. The Sites build wrapper could not find the package-manager executable, so the equivalent package-script steps were executed directly. Existing chunk-size/route-classification notices remain.

## Cleanup

All 27 teams in 24 family rows were deleted through the normal local UI. After the normal ten-minute undo window expired, a reload confirmed zero team cards, “Your team library is empty”, and no Recently deleted list. The two QA download files were removed and the QA clipboard cleared. No pre-existing local teams were removed. The temporary viewport override was reset. Production was not deployed, mutated, migrated, or accessed for test data.
