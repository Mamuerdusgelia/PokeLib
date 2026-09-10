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
# Repeated Save measurements — 2026-09-10

Five samples per action and team size, before and after the focused change: **60 real browser actions** plus separate localhost HTTP samples. Fixtures used one Darkrai set or a full six-Pokémon team, preserving raw text; current Saves were deliberately repeated no-op saves (they still persist a new edit revision), history saves advanced revisions 1→6, and Create variant copied the displayed snapshot. Fresh comparison fixtures used the same initial content. The library contained the six original teams plus disposable fixtures, not the separate 10k benchmark dataset. All timings below are milliseconds, **median / maximum**. These are Vinext development + local D1 measurements, not hosted Worker, production React or Supabase results.

| Sets / action | Visible Saved before | Visible Saved after | Saving feedback before | Saving feedback after |
|---|---:|---:|---:|---:|
| 1 / Save current | 171.8 / 221.8 | 125.0 / 172.6 | 53.3 / 73.9 | 84.0 / 101.0 |
| 1 / New history | 185.6 / 194.9 | 141.1 / 189.9 | 63.3 / 88.7 | 71.2 / 79.7 |
| 1 / Create variant | 229.8 / 327.3 | 142.9 / 185.7 | 14.4 / 23.2 | 15.3 / 21.0 |
| 6 / Save current | 224.0 / 334.4 | 166.4 / 171.8 | 52.4 / 84.0 | 68.6 / 80.5 |
| 6 / New history | 250.6 / 262.2 | 163.8 / 205.0 | 85.8 / 96.8 | 69.8 / 88.9 |
| 6 / Create variant | 261.0 / 360.5 | 161.5 / 203.0 | 16.3 / 16.8 | 12.3 / 21.2 |

Browser stages are cumulative from the click handler. Each cell below is **before median/max → after median/max**. Request start is after client validation, reconciliation, session lookup and JSON serialization; response means fetch resolved, decoded means its body was read. React commit is captured by a layout effect after the persisted DTO enters detail state. Visible means a subsequent animation-frame/timer checkpoint; it approximates a paint opportunity, not physical pixels. Failed persistence cancels the trace and cannot report Saved.

| Sets / action | Request start | Response | Body decoded | React commit |
|---|---|---|---|---|
| 1 / Save | .4/1.7 → .4/1.8 | 93.5/119.1 → 84.2/112.3 | 96.6/123.6 → 85.4/114.7 | 124.1/148.9 → 117.2/148.3 |
| 1 / History | .6/2.1 → .9/1.4 | 103.3/116 → 89.7/150.4 | 105.9/120.6 → 95.3/152.1 | 130/153 → 127.5/181.5 |
| 1 / Variant | .1/.3 → .2/.4 | 125.2/212 → 91/106.3 | 126.1/212.6 → 91.6/107.7 | 170.7/243 → 125.1/170.3 |
| 6 / Save | 1.1/1.8 → 1.6/2.9 | 97.2/209.7 → 106.7/114.2 | 102.8/212.9 → 108/115.2 | 153.4/270.4 → 147.4/156.5 |
| 6 / History | 1.8/2.2 → 2.4/4.6 | 126.9/176.7 → 105.4/133.6 | 130.5/178.9 → 106.8/137.8 | 176.3/225.4 → 144.4/189.7 |
| 6 / Variant | .1/.2 → .2/.2 | 129/163.9 → 107/119.4 | 130.5/164.7 → 108/120.8 | 199.5/247.4 → 155/181.9 |

Server stages from those browser requests use the server's separate clock. Preparation and mutation-complete are cumulative from request-handler entry; mutation and readback are durations. Server totals exclude transport/response-body serialization. They must not be treated as absolute browser timestamps. Workerd's timing granularity can report zero for short stages.

| Sets / action | Prepared | Mutation duration | Mutation complete | Readback | Server complete |
|---|---|---|---|---|---|
| 1 / Save | 17/33 → 10/11 | 17/27 → 19/23 | 42/58 → 26/34 | 9/27 → 5/13 | 50/67 → 32/43 |
| 1 / History | 16/26 → 12/20 | 15/28 → 19/19 | 38/42 → 32/36 | 11/26 → 9/18 | 50/64 → 41/52 |
| 1 / Variant | 25/60 → 15/21 | 21/38 → 15/25 | 46/98 → 34/42 | 13/49 → 5/7 | 56/147 → 39/48 |
| 6 / Save | 17/28 → 9/15 | 35/37 → 29/43 | 47/62 → 44/52 | 12/14 → 4/7 | 58/67 → 46/57 |
| 6 / History | 22/42 → 9/12 | 29/34 → 33/45 | 55/65 → 41/56 | 12/17 → 7/10 | 68/76 → 46/66 |
| 6 / Variant | 27/45 → 12/19 | 30/33 → 25/33 | 59/72 → 39/42 | 15/18 → 6/8 | 74/87 → 47/48 |

Changes: one owner-scoped D1 detail SQL read replaces three sequential reads for current snapshot/history/share state; hidden family-page/facet refreshes are deferred until returning to the library. Initial sidebar facets still load. Save continues to use the returned persisted DTO, with no extra client get. Both storage adapters retain the three-token stale-write checks; no optimistic Saved message was introduced.

The independent HTTP-only run is noisier and **does not demonstrate an overall request-latency improvement**. Raw samples are in ignored `.artifacts/library-scale/save-http-before.json` and `save-http-after-idle.json`; reproduce with `node scripts/profile-save-http.mjs label`. A first after run overlapped the regression suite and was retained as `save-http-after.json`, but excluded from this comparison due to contention.

| Sets / action | HTTP total before | HTTP total after | Readback before → after |
|---|---:|---:|---|
| 1 / Save | 43.32 / 115.40 | 54.03 / 55.14 | 6/9 → 3/4 |
| 1 / History | 45.71 / 114.24 | 62.93 / 70.31 | 6/8 → 5/10 |
| 1 / Variant | 47.48 / 51.63 | 70.77 / 74.22 | 5/9 → 4/6 |
| 6 / Save | 41.79 / 72.39 | 68.01 / 99.52 | 5/8 → 5/6 |
| 6 / History | 45.13 / 231.08 | 58.83 / 62.42 | 6/11 → 4/6 |
| 6 / Variant | 42.33 / 77.52 | 73.23 / 84.86 | 7/8 → 3/4 |

Limitations: development scheduling, rendering and local D1 contention remain variable. Browser feedback sometimes regressed even while completion improved. These samples did not reproduce earlier multi-second saves and do not prove those outliers eliminated. Hosted D1, real Supabase, long-history teams, cold bundles and repeated real-phone interactions need separate measurements. Profiling is local opt-in only, retains at most 60 traces, and records no contents/IDs or remote telemetry.
