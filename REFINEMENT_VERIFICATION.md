# PokéLib refinement verification — 13 September 2026

Implemented locally. No production deployment, remote database migration, account change or production data mutation was performed.

## Changes

- All Teams retains its heading and privacy notice, removes the decorative copy, and groups collections, sorting, views and Export matching into a compact toolbar. The large selection banner appears only after selection begins; page selection and all-matching selection remain available.
- Shared Field wrappers are accessible fieldsets instead of labels containing multiple controls. Whitespace can no longer activate the first tag's remove button. Explicit remove buttons also stop click propagation.
- Historical dates use year/Unknown. New manual drafts retain the current local-year default. Existing exact/month strings display as their year and normalize on subsequent metadata saves, without rewriting records when opened.
- Sources are Built by, Given by, Found on and Other. Existing account-name initialization remains in the manual builder; anonymous drafts keep the existing blank identity. Link/context inputs and displays were removed. Existing stored link/context strings remain available for compatibility and native backups; backup input still rejects non-HTTP(S) links.
- Create variant copies the inspected variant and displayed snapshot. Duplicate and modal Rename actions were removed. The name supports click, Enter, blur, Escape, blank-name cancellation and server-side uniqueness errors. Escape is consumed before the library navigation shortcut. Local detail reads now include sibling counts so the variant selector and delete-variant availability reflect the family.
- Export matching uses the same combined query as the library, selects ungrouped matching variant IDs without a page limit, and calls the existing exportTeams/backupText path. Each matching variant contributes its current snapshot once; unrelated siblings are excluded. Existing selected-family export still expands all selected families. Existing Showdown backup headers separate teams and include format/title.

## Compatibility

No storage keys, namespace rules, team/version IDs, snapshot/live semantics or payload ownership rules changed. The TeamMeta shape retains legacy fields and date precision variants for old data.

| Old source | Interpretation |
| --- | --- |
| Self-built | Built by |
| Received from / Copied from / Adapted from / PokéPaste with a name | Given by that name |
| Those types without a name | Other |
| Website / Discord / Tournament | Found on existing name, or legacy type when no name exists |
| Unknown legacy type | Other, retaining stored context |

Read-time source aliases are included in local search even for old cached indexes. New indexing includes the canonical source label. Year search continues to use the first four date characters. Unknown remains available.

The additive `supabase/migrations/202609130001_source_choices.sql` permits the new source names through the legacy vault/backup validator while retaining the earlier validator and privilege restrictions. It has no row updates, table changes or destructive operations. This is needed for new-source archives restored through the legacy PostgreSQL RPC; the current local-first Cloud JSON API needs no schema change. The migration was exercised in isolated PGlite tests only.

## Poképaste detection

The existing URL allowlist, redirect policy, size limits and timeout remain. A nonempty author gives Given by; absent authors give Other. Newly imported URL/context fields are empty.

Explicit JSON `format` and whole `Format:` lines in notes are mapped using existing canonicalFormat/knownFormat. Examples covered: `[Gen 4] Ubers` → `gen4ubers`; `Gen 9 National Dex OU` → `gen9nationaldex`. Existing registry aliases handle punctuation, case and supported regulation spellings. No new format IDs are created. Missing, unknown or conflicting candidates use the current fallback format selection; titles/prose are not guessed. Explicit Format lines are removed from team notes, including unmappable lines, while actual notes are retained. Existing Showdown backup-header parsing remains authoritative for per-team headers.

The official server JSON currently defines paste/title/author/notes; the optional format field is handled when present. Reference: [official Poképaste server](https://github.com/felixphew/pokepaste/blob/v3/server.go).

## Automated validation

- `node scripts/test.mjs`: passed, 321 PASS entries, including all existing local-first, account, D1, PostgreSQL, builder, search, variants, collections, Showdown, Poképaste and backup tests.
- Five new regression groups in `scripts/test-refinement.mjs`: legacy source/date and context retention; known/unknown/conflicting format detection; actual Field JSX output and accessible labels; 35-team filtered/paginated export plus sibling cloning/old persisted records; actual inline-rename Escape/Enter handler behavior.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node scripts/source-offer.mjs` and `node node_modules/vinext/dist/cli.js build`: passed. Existing Vinext route-classification/plugin warnings remain; no build errors.
- `node node_modules/oxlint/bin/oxlint`: exits 1 with 64 existing findings. Compared against an isolated archive of the starting HEAD: same 64 normalized file/rule/message findings, zero new findings. Unrelated existing lint debt was not rewritten.

Logs are in `.artifacts/refinement-tests-final.log`, `refinement-types-final.log`, `refinement-lint-final.log`, `refinement-lint-baseline.log`, and `refinement-build-final.log`.

## Browser verification

Tested the real local application through Codex's browser control, using specifically named QA teams and preserving the pre-existing local team.

Passed:

- Import preview; tag body, field whitespace and whitespace to the right of Add tag preserve the tag. Add a second tag and remove only its explicit ×.
- Date choices are exactly Unknown/Year only; entering 2019 saves and displays 2019.
- Source choices are exactly the specified four, imported text defaults to Other, and Given by QA Player persists with no URL/context controls.
- Existing View/Edit Team workflow still opens and saves. Variant A was edited to Raichu/Leftovers/Surf and its own notes; creating B while viewing A preserved those contents, description, tags, source and year.
- Inline rename Enter and blur persist, Escape cancels without leaving the detail page, blanks retain the previous name, and a duplicate name displays the uniqueness error.
- Normal browsing has no permanent bulk panel; selecting one team reveals contextual actions and Select all matching.
- A combined team/Pokémon/move/format query matched 32 teams with 30 visible. Export matching completed with “32 matching variants exported across all pages.” Serializer validity and exact membership are independently covered by the automated round-trip assertions.
- New anonymous draft defaults: Built by, empty Player and current local year 2026.
- Live Poképaste preview succeeded after restarting the development server with network access: `a47bb2a45883213e` displayed Mono Hoenn, Given by Moldy, Unknown year and the normal Choose format fallback, with no notes added.
- An isolated localhost fixture proxy invoking the same previewPokepaste parser exercised known and unknown metadata through the real import UI. `[Gen 4] Ubers` selected Gen 4 Ubers, Given by Fixture Player, and only “Actual notes”; an unmappable Format line with no author selected Choose format and Other, again retaining only “Actual notes”. The proxy lives in `.artifacts/refinement-browser-proxy.mjs` and is not part of the application or production routes.
- QA cleanup selected only `team:Refinement` (33 families / 35 variants), used the existing 10-minute-undo deletion flow, and left the pre-existing local family untouched. Fixture-proxy previews and the new manual draft were not saved.

Limitations:

- Initial live-service/browser attempts encountered restricted-network and hot-reload failures; successful live preview and fixture-backed format checks were subsequently observed. The real public paste had no format metadata, so successful known-format browser mapping was tested using the isolated fixture proxy.
- Browser validation used the anonymous Local library. Account-local and Cloud-backed storage, namespace isolation, conflicts, sharing and old backups passed the isolated integration suite; no real account credentials were available for signed-in browser checks. No production account was used.
- Browser tool timeouts and development hot reloads interrupted some attempts; successful checks above were subsequently observed in the UI.

The broader always-editable team page, Pokémon set editor design, local-first architecture and sharing semantics were intentionally left unchanged.
