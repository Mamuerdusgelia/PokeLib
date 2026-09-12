# Local-first architecture — September 2026

PokéLib opens directly into a persistent Local library without an account. This document describes the new implementation; earlier hosted verification in AUTH_VERIFICATION.md and PROGRESS.md describes the previous server-first deployment.

## Data and boundaries

- `lib/local-db.ts`: IndexedDB database `pokelib-library`, schema version 1. Separate `indexes`, `teams`, and `values` stores use composite namespace/ID keys. Full teams and lightweight search summaries commit in one transaction; a successful save means transaction completion. Browser quota/storage errors reject the save.
- `lib/local-library.ts`: the existing library action contract now executes locally. Complete team payloads retain Showdown text, original input, parsed sets, notes, source, formats, tags, variants, historical versions, dates and private editor metadata. Existing search planning and same-set/member matching run over lightweight indexes, including `storage:local` and `storage:cloud`.
- `lib/client.ts` selects `anonymous` or `account/<immutable Auth ID>`. It sends only explicit Cloud/Snapshot operations to `/api/cloud`; normal Local creation, editing, searching and backup do not send teams to the server. Existing `/api/vault` remains for legacy compatibility, separate from the new library.
- Local transactions serialize across tabs with Web Locks; BroadcastChannel refreshes other tabs. The database, rather than events, is authoritative. IndexedDB is durable browser storage, not a substitute for backups: clearing site data or browser eviction can remove Local work.

## Optional accounts

Supabase Auth continues to handle passwords, hashing, session tokens, email confirmation and recovery. No application table stores passwords. `/api/account` delegates to `lib/account-server.ts` using a server-only service credential for optional-email registration, private login-code lookup and password-confirmed account deletion.

Visible names may repeat and are frozen in `lf_accounts`. Authentication uses an email or a unique stable 16-character account login code. Email-free registrations receive a random internal non-deliverable Auth email, which is hidden from normal UI. They sign in with the code and password; the UI explicitly says a lost password cannot be recovered without a recovery email. Public names are secondary source metadata, never credentials. Auth attempts are rate-limited by a hashed Cloudflare client address (20 per 15 minutes).

Manual signed-in drafts default to Self-built plus the account name, and users can override/remove it. Imports keep supplied authorship. Registration does not move or relabel anonymous teams. Existing accounts receive the fixed display name Trainer on migration; they retain their Auth identity and credentials.

## Cloud sync and conflicts

Cloud Sync defaults off. A one-time privacy acknowledgment precedes upload, and optional automatic upload applies only to new teams. Per-team, selected-family, filtered-result and entire-library controls reuse current selection. Bulk status reports synced, pending and conflicted variants.

Login loads a paginated metadata/search-index inventory; opening a team fetches its full payload and caches it. Previously opened payloads refresh when their server revision changes and remain usable during network loss. Cloud polling runs at startup, focus, connectivity restoration and every 30 seconds while open; edits also trigger sync. There is no background service worker.

Queued mutations persist alongside the cached team. The server verifies the bearer token and derives ownership from `auth.uid()`, locks each team and compares a numeric server revision. Mutation IDs make response retries idempotent. A genuine conflict retains the local draft and exposes a warning. “Keep my work as a Local copy and reload Cloud” forks the local current state/history and reloads the canonical Cloud record. Cloud failure never blocks unrelated Local CRUD/search.

First upload sends only the latest state. Subsequent server history grows from server-owned versions, never from a client-supplied historical chain. Cloud family metadata changes sync per variant, so partial failures are visible and retryable rather than globally atomic across the entire family.

## Shares, deletion and isolation

- Share Snapshot sends a strict rendering projection with fresh unrelated IDs. It excludes owner identity, private flags, original import input and version comments/history. Notes, tags and attribution are deliberately public and identified in the dialog. Snapshots are immutable, stable, read-only and survive source deletion.
- Share Live requires an account and Cloud team. Its capability URL stays stable across updates, follows the latest synced state, defaults to current-only viewing, and supports opt-in history and owner revocation. Disabling/deleting the Cloud record revokes Live links. Saved-search collection links include only matching Cloud teams; Local teams are never implicitly uploaded.
- Team deletion creates a 10-minute undo tombstone. Local cleanup occurs while the app runs; Cloud expiry is enforced on requests, with optional minute-level `pg_cron` cleanup. Closing the browser does not extend undo eligibility. Undo does not resurrect revoked links.
- Account deletion requires the current password and exact `DELETE ACCOUNT` confirmation. A service-only transaction freezes individual Live links and Cloud collection links into public snapshots before deleting Auth and cascading Cloud rows. Ordinary snapshots are independent.
- Logout hides all account Local work and removes Cloud summaries/payloads. Unsynced/conflicted work is preserved as account-scoped Local copies before cache removal. Logging back into the same account/browser restores its Local library; the anonymous library and other accounts never merge. Namespace isolation protects normal UI access, not against someone with browser developer tools or arbitrary code access to the same browser profile; no local encryption is claimed.

## Backups

`lib/local-backup.ts` adapts the existing version-1 JSONL/gzip backup contract to the active browser namespace. Single-team, selected, filtered and complete-library exports support Showdown text or native backup. Native data retains notes, source, dates, formats, variants, tags, history and private editing fields. Restore validates the entire file, then commits additive, retryable chunks with fresh IDs and collision-safe collection names. Restored teams are Local and share capabilities are omitted. Export must download any uncached Cloud payloads, so a full backup of unopened Cloud teams needs connectivity.

## Reproducible rollout

1. Apply unapplied Supabase migrations in filename order, including `202609120001_local_first.sql`, `202609120002_cloud_collections.sql` and `202609120003_cloud_history_roots.sql`. They add `lf_accounts`, `lf_cloud`, `lf_shares`, `lf_collection_links`, rate limits, RLS and constrained RPCs, and normalize parents omitted by first-upload history trimming. They depend on the earlier validation helpers; do not apply to an empty schema in isolation.
2. Configure existing `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, plus **server-only** `SUPABASE_SERVICE_ROLE_KEY` as a Worker secret. Never expose that secret through `/api/config`, client-prefixed variables or source control. Email confirmation/recovery continue to require working Supabase SMTP and allowed redirect origins.
3. For D1-only anonymous Snapshot sharing, apply `drizzle/0009_local_snapshots.sql` with the preceding D1 migrations. It adds the independent `snapshot_shares` table.
4. Enable `pg_cron` before migration if minute-level physical deletion is required; otherwise request-time cleanup still enforces the undo deadline. After enabling it later, schedule `select private.lf_purge()` once per minute as the database administrator.
5. Verify two real hosted accounts, email confirmation/recovery and cross-browser Cloud behavior before rollout. A private hosting audience gate is independent of in-app authentication; it must be changed separately before anonymous people on the public Internet can reach an owner-only deployment.

The three September 12 Supabase migrations were applied to the existing hosted project after a schema/function/grant audit. Existing Auth identities and the 548 legacy teams/548 versions were preserved. The server credential is configured as a Sites runtime secret. D1 migration 0009 is included with its Drizzle schema, snapshot and journal entry for application during deployment. See HOSTED_LOCAL_FIRST_VERIFICATION.md for the dated acceptance record and verification boundaries. The new UI does not automatically import the legacy server library: export from the previous release and restore natively to bring legacy teams into the browser library.

## Validation and limits

`scripts/test-local-first.mjs` exercises the LocalLibrary/MemoryDatabase contract against real PGlite PostgreSQL migrations: namespace isolation, query parity, lazy caches, offline edits, conflicts, ownership, bulk upload, undo, snapshots, Live history, collections, native merge/round-trip and account deletion. `scripts/test-account-server.mjs` checks registration/login/deletion orchestration using mocked Supabase Auth transport; it does not prove hosted email delivery or real credential authentication. The previous full regression suite remains in place.

Initial browser checks used real IndexedDB and isolated local D1. Subsequent release-candidate browser checks connected to real hosted Supabase: anonymous persistence, cross-tab edits/search, Local payload privacy, account namespace switching, lazy Cloud loading, offline edits, revision conflicts and Local-copy recovery passed. Two independent browser origins provided separate IndexedDB/session stores; this was not a test on two physical devices. The user confirmed real signup email delivery, return to PokéLib, password reset and login with the new password for the same test alias. Additional hosted HTTP tests exercised real Auth and RPC authorization, Cloud sharing, account deletion, expiry, backups and per-variant partial upload retries. In-memory client storage used by those HTTP tests is not described as browser acceptance.

Validation results: the full suite passed 316 checks, including 22 local-first integration groups and the mocked account endpoint checks. TypeScript and focused lint of the new modules passed. The production build passed (Vinext reports its existing large-chunk warning). Repository-wide lint still reports legacy React/type/accessibility findings; it is not a clean lint baseline. Native backup generation produced a ready-to-save browser link; archive contents and single/selected/filtered/full scopes were verified by automated round-trips. Browser download completion was not exposed by the controller. Hosted acceptance found and fixed a dangling Cloud history parent that prevented backup export, and a stale open-team view after conflict recovery; both fixes were retested.

Deliberately deferred: collaboration, editable public links, invitations, shared ownership, end-to-end encryption, PWA/install support, China-specific hosting and long-term trash. Local collection definitions remain browser-scoped; their Cloud share definitions are server-backed. New accounts on another device receive Cloud teams, not Local-only teams or local saved-search definitions.
