# TeamVault performance evidence — 2026-09-10

## Boundary and reproduction

These are measured local adapter timings, not hosted D1 or Supabase service latencies. Node SQLite in-memory database, all incremental D1 migrations, deterministic copies of six-set demo templates, generations, singles/doubles, source names, tags and year/Unknown dates. Each read or bulk measurement has five samples; Save has ten. Values are milliseconds, median / slowest sample. Run from the repository after node scripts/test.mjs to generate .test-build helpers:

    node scripts/benchmark-scale.mjs
    node scripts/benchmark-save.mjs

Scripts write ignored .artifacts/library-scale/current.json and save-current.json and never connect to a user database. Reports include every sample, query count and JSON payload bytes. Existing teams have one conceptual current build; variants and variant expansion are not measured yet. Synthetic IDs are short deterministic strings, so ID-selection payloads are smaller than equivalent UUID payloads. Wall-clock samples vary with other local workloads and are not production percentiles.

## Library, selection and bulk operations

| Operation | 1,000 teams | 5,000 teams | 10,000 teams |
|---|---:|---:|---:|
| initial library | 1.06 / 54.34 | 2.63 / 2.91 | 2.91 / 4.37 |
| last page | 0.81 / 0.95 | 6.85 / 9.49 | 8.64 / 14.39 |
| metadata search | 1.41 / 2.13 | 8.78 / 9.94 | 20.49 / 25.53 |
| same set search | 2.31 / 3.36 | 11.12 / 17.56 | 26.98 / 32.68 |
| format filter | 1.52 / 2.79 | 4.42 / 6.37 | 12.34 / 18.97 |
| facets | 2.83 / 31.79 | 12.2 / 21.97 | 44.3 / 49.57 |
| title sort | 0.95 / 1.18 | 4.28 / 7.99 | 15.11 / 20.37 |
| date sort | 1.44 / 1.63 | 12.05 / 12.89 | 23.98 / 27.28 |
| select all IDs | 0.9 / 3.4 | 8.76 / 11.35 | 22.32 / 30.41 |
| select matching IDs | 0.88 / 2.09 | 11.71 / 14.09 | 33.54 / 62.43 |
| bulk add tag / 100 | 146.55 / 170.61 | 212.52 / 257.7 | 326.87 / 361.52 |
| bulk delete / 100 | 133.7 / 187.78 | 198.38 / 226.3 | 240.05 / 262.32 |

100-team bulk actions comprise twenty replay-safe five-team transactions. Tag operations retain existing tags/history. Delete samples create disposable records outside the timed interval. No data is loaded into the browser by these isolated benchmarks.

The real library API returns at most 30 full current snapshots per page: the 10k initial-page fixture payload was 123447 bytes. Select all returns only IDs (bounded at 10,000). The browser keeps selected IDs, never 10,000 full records. Facets use SQL aggregation and refresh on initial load/mutation, not each keystroke/page change. Read queries first materialize paginated IDs, then join snapshots. Same-set candidates are anchored by the first explicit set term while retaining same version/slot correlation.

## Before/after at 10k (median ms)

| Operation | Before | After |
|---|---:|---:|
| initial library | 82.75 | 2.91 |
| last page | 297.56 | 8.64 |
| metadata search | 62.8 | 20.49 |
| same set search | 2746.05 | 26.98 |
| format filter | 66.91 | 12.34 |
| facets | 37 | 44.3 |
| title sort | 15.43 | 15.11 |
| date sort | 27.94 | 23.98 |

The original same-set query scanned many irrelevant search terms; pagination joined snapshots before limiting. Indexes and query structure fix those bottlenecks. Facets/sorting can still scan matching metadata; do not claim constant-time queries. PG correctness is tested with PGlite, but this benchmark measures the SQLite adapter only.

## Import and browser acceptance

One six-set-template archive containing 1,000 teams was parsed once and persisted in 200 chunks in the automated SQLite test (observed runs around 1.9–2.5 seconds excluding HTTP/browser). Replaying completed chunks retained exactly 1,000 IDs. A failed chunk wrote neither teams nor receipt; corrected retry succeeded. PostgreSQL exercised the same contracts on ten teams.

The browser imported 1,000 one-set fixtures in one dialog, with 50 editable previews per page and visible 5/1000 then 940/1000 progress. Completion was observed within 37.7 seconds of click; this is an observation upper bound, not a precise latency sample. Format headers normalized, provenance/common notes persisted and imported dates stayed Unknown. Current-page selection gave 30 then 60 records; select all returned 1,001 including the custom-format fixture. Bulk tagging and one-confirmation bulk deletion completed for all 1,001. The six prior teams, thirteen snapshots and two share-link rows were compared byte-for-byte with the SQLite backup and were unchanged. Test team records were removed. Reusable account tags are intentionally retained by deletion.

## Save storage timings

| Sets | Action | Before median / max | After median / max | SQL statements |
|---:|---|---:|---:|---:|
| 1 | save | 1.72 / 2.62 | 1.26 / 2.81 | 74 → 14 |
| 1 | version | 1.36 / 4.91 | 1.56 / 3.44 | 73 → 13 |
| 6 | save | 4.07 / 9.21 | 3.68 / 9.55 | 194 → 14 |
| 6 | version | 4.24 / 6.6 | 3.23 / 4.65 | 193 → 13 |

Grouping search/tag inserts with JSON table expansion reduced statement count substantially, particularly for six sets. A separate after run during development compilation was slower (six-set current Save median 5.67, max 16.73 ms); this variability is why the counts are stronger evidence than small local CPU differences. Three-token stale-write guards, immutable historical rows and actual persistence confirmation remain intact.

Still required: repeated real one/six-set browser current Save, new history and Create variant traces separating click, request start, database commit, response, React and visible Saved. Existing ?profile=1 diagnostics report feedback/persisted/visible plus API/render timings, but database-stage instrumentation and variant measurements are not yet complete. Hosted production timings and mobile/touch percentiles are not established.
# Variant grouping — 2026-09-10

Five repeated samples per operation in isolated Node SQLite, with 1,000 / 5,000 / 10,000 conceptual families plus one sibling for every twentieth family (1,050 / 5,250 / 10,500 stored variants). Six-set fixtures retain formats, dates, tags and provenance. This is adapter latency, excluding browser/network and hosted D1. Run after tests:

`node scripts/benchmark-scale.mjs .artifacts/library-scale/variants-scale-optimized.json --variants`

| Operation | 1k median / max ms | 5k median / max ms | 10k median / max ms |
|---|---:|---:|---:|
| Grouped initial page | 8.93 / 10.42 | 61.07 / 85.66 | 123.90 / 137.66 |
| Grouped last page | 9.13 / 10.97 | 70.53 / 101.95 | 158.51 / 181.67 |
| Grouped same-set search | 5.72 / 13.74 | 33.80 / 36.52 | 71.91 / 92.48 |
| All family IDs | 1.02 / 1.68 | 8.52 / 13.01 | 19.42 / 19.54 |
| Expand two siblings | 0.64 / 1.64 | 0.57 / 0.80 | 0.70 / 0.90 |
| Family facets | 4.92 / 24.34 | 27.18 / 37.69 | 54.51 / 58.88 |

Initial grouped implementation carried full metadata through two window queries: 10k initial median/max 305.24/389.90 ms, last page 432.96/504.58, expansion 10.77/11.03. The measured correction groups narrow rows, counts/selects distinct effective family IDs directly, joins full snapshots only after pagination, and indexes owner + coalesce(family_id,id).

The 10k first page returns 30 current snapshots, 127,412 JSON bytes in these fixtures. Expansion returns two snapshots, 9,117 bytes; selection returns only IDs. Synthetic family IDs are short, so real UUID selection payloads are larger. Large history remains unpaginated on detail, and bulk metadata expansion has a 10,000-variant bound.
