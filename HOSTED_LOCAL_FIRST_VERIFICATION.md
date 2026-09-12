# Hosted Local-first acceptance — 2026-09-12

This record accompanies the release candidate. Production activation and its exact commit/version/deployment are reported separately after the Sites deployment completes. Existing public access to https://pokelib.app was verified without cookies; the hosting access policy was not changed.

## Database and configuration

- Audited the hosted PostgreSQL schema before writes. All 28 prior application function definitions, arguments and grants matched a replay of the twelve existing migrations. The project used manual SQL, without a Supabase migration ledger; no artificial ledger or destructive reset was introduced.
- Applied, in order: `202609120001_local_first.sql`, `202609120002_cloud_collections.sql`, `202609120003_cloud_history_roots.sql`.
- The first two migrations preserved all six original Auth users and all 548 legacy teams/548 versions. Existing accounts received the fixed display name Trainer and retained their immutable identity.
- The final dashboard SQL audit after all hosted tests again returned 548 legacy teams/548 versions, the history trigger installed, zero invalid Cloud history parents, and no cron extension.
- New public tables have RLS enabled and no anonymous/authenticated direct CRUD grants. Privileged registration, code lookup, rate limit and account deletion RPCs are service-only. Private schema access is denied to browser roles; RPC search paths are constrained.
- `pg_cron` is not installed or newly enabled. Requests enforce the ten-minute undo deadline and purge expired tombstones. A real elapsed-time hosted expiry test passed after more than ten minutes.
- Sites runtime environment revision 2 contains a secret `SUPABASE_SERVICE_ROLE_KEY`; URL and publishable key remain configured. The secret activates with the release deployment. Credential bytes were absent from tracked source, built assets, corresponding-source archives and `/api/config`; `.env` remains ignored and untracked.
- `drizzle/0009_local_snapshots.sql` is packaged with the corrected schema definition, Drizzle snapshot and journal entry. Its hosted application must be verified after the deployment migration phase.
- With Supabase configured, anonymous snapshots use Supabase `lf_shares`. D1 `snapshot_shares` is the independent fallback for D1-only anonymous deployments. This preserves the implemented architecture; no claim is made that this Supabase deployment routes snapshots to D1.

## Actual hosted acceptance

The Auth and RPC checks used the real production Supabase project over HTTP. Their LocalLibrary clients used MemoryDatabase, so they prove backend integration and client contract behavior, not IndexedDB/browser rendering. Temporary deletion fixtures were removed. No legacy account or team was used as a destructive test fixture.

| Area | Result and method |
| --- | --- |
| Signup and identities | Real email and email-free accounts created with the same visible name; immutable IDs and login codes remained distinct. |
| Login | Both codes authenticated with their own passwords. Email-free registration required no deliverable inbox. |
| Email confirmation | User received the actual confirmation email and confirmed its link returned to PokéLib. |
| Recovery | User reset the temporary alias password and confirmed login with that alias and the new password. The previous generated password was independently rejected. The base Gmail address is a separate account and was preserved. |
| Rate limit | Hosted service RPC accepted attempts 1–20 and rejected 21 for an isolated hashed test key; another key remained usable. Source/mocked endpoint tests verify Cloudflare address hashing. Actual shared edge-IP distribution was not load-tested. |
| Cloud | Explicit, new-team automatic, selected/filtered/all uploads passed. Automatic preference changes did not upload existing Local teams. |
| Partial family failure | Injected failure for one variant while another uploaded to the real backend; pending status survived and retry synced the failed variant. |
| Lazy/cache behavior | Login index omitted full payloads; opening fetched a payload; subsequent revision changes refreshed caches. |
| Offline and conflicts | Queued edits survived simulated transport failures; real revision comparison rejected a competing edit; recovery retained a Local copy and reloaded canonical Cloud. |
| Logout/isolation | Cache purge preserved unsynced work as account-scoped Local copies. Anonymous and immutable account namespaces did not merge. |
| Snapshot | Strict public projection, unrelated IDs, omitted private owner/editor/import/history fields, immutable content and source-deletion survival passed. Notes, tags and attribution are explicitly public. |
| Live | Stable URL followed synced updates; current-only default, opt-in history, owner revoke and disable/delete revocation passed. Undo did not restore a revoked link. |
| Collections | Matching Cloud teams only, same-set query behavior, Local exclusion, ownership and revocation passed. |
| Team deletion | Undo worked inside the window; actual elapsed expiry rejected read/restore and removed the record from inventory. |
| Account deletion | Wrong phrase/password rejected; correct password plus exact phrase deleted a disposable Auth account and Cloud data. Live and collection links froze as snapshots; ordinary snapshots stayed unchanged; old session and future mutations failed. |
| Backups | Native and Showdown scopes passed; additive restore retained content/history/metadata using fresh IDs and collision-safe collection names. Complete backup fetched unopened Cloud payloads; uncached offline export rejected rather than silently omitting teams. |
| Cross-account security | Manipulated reads, updates, shares, history settings, revoke, disable, delete and undo were rejected. Direct LF table access and service-only RPC calls were rejected for authenticated browser credentials. |

## Real browser acceptance before activation

The release candidate ran locally without the QA backend and connected to hosted Supabase. A request-auditing proxy recorded method/action/size/status, without credentials or payload contents. Cloud outage was injected by returning 503 for Cloud requests from one test origin; this was not an operating-system network disconnection.

- Actual IndexedDB persisted anonymous imports, metadata edits, notes, tags and a family variant across reloads and a second tab.
- Cross-tab edits appeared in the second tab, and combined Pokémon/move/tag/source/format/storage searches found the edited team.
- Before explicit Snapshot sharing or Cloud upload, anonymous actions produced only configuration GETs and no team-persistence POST. The private Local note sentinel did not leave the browser during Local actions.
- Snapshot sharing displayed the disclosure and produced a real hosted capability URL.
- Account A login hid anonymous teams; logout restored the anonymous family; Account B login displayed an empty, separate namespace.
- Two separate browser origins gave independent IndexedDB/session stores. Real offline queued edits, competing canonical edits, visible conflict warnings and Local-copy recovery were exercised twice.
- After the refresh fix, the open detail immediately showed canonical Cloud notes, while search/open of the recovered Local copy showed the preserved competing draft.

## Fixes made during acceptance

1. Added missing Drizzle metadata/schema registration for D1 migration 0009 so the deployment migration pipeline can discover it.
2. Added migration 0003 to normalize Cloud history roots after first upload omits Local history. It preserves version content/IDs/numbers, severs only unavailable/non-earlier parents, and advances revisions for repaired rows. Native export can then produce a valid portable history chain. A new regression covers first upload, subsequent Cloud history and uncached backup.
3. Refreshed an open team on storage/sync changes while preserving active editor drafts and selected historical versions. Actual browser conflict recovery verified immediate canonical display and a preserved Local copy.

## Regression and boundaries

- Full automated suite: 316 passing checks, including 22 local-first integration groups.
- TypeScript: passed. Focused lint for new storage/server modules and database schema: passed.
- Repository-wide lint has the existing legacy React/type/accessibility findings; it is not a clean baseline.
- Production build: passed, with the existing large-chunk warning recorded separately.
- Corresponding source and distributable credential scan: passed.
- Browser download completion is unavailable in the controller. Download-ready UI and native archive generation/validation/restore are verified separately.
- Not tested on two physical devices or across every browser engine. Some bulk/family/backup/deletion scenarios were checked through hosted HTTP clients rather than every corresponding UI path. Unsynced logout preservation has hosted client-contract coverage, not a repeated browser walkthrough.
- Final activated-production HTTP/browser smoke and D1 application remain post-deployment checks, not claimed by this pre-activation record.
- Collaboration, invitations, editable public shares, shared ownership, end-to-end encryption, PWA/install support, China-specific hosting and long-term trash remain deliberately deferred.
