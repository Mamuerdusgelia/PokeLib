# PokéLib native password authentication verification

Verified on 2026-09-11 against the real hosted Supabase project through the normal owner-only Sites browser gate. The owner opened the confirmation and recovery emails in the intended browser; generated disposable passwords stayed in temporary test-session memory and were cleared after QA. No passwords, email-link tokens, environment values or privileged keys are included in this report.

## Deployment

| Item                        | Result                                                          |
| --------------------------- | --------------------------------------------------------------- |
| Starting HEAD               | `75516f66b287ce20782655b6a14cc9842bda7d7c`                      |
| Deployed application commit | `e52d1e2cbeed4f33665deb80a229e744f74c75a1`                      |
| Site                        | [pokelib.app](https://pokelib.app/)                             |
| Sites version               | 12                                                              |
| Deployment                  | `appgdep_6aa395c8a4d88191942d04ccb7fca9dc`, succeeded           |
| Backend                     | Existing Supabase Auth and PostgreSQL project                   |
| Environment names           | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`                      |
| Environment revision        | 1, unchanged                                                    |
| Access                      | Owner-only; policy revision 1, one owner, no visitors or groups |
| Custom domain               | Active; SSL active                                              |

The application commit was pushed to GitHub and Sites before version creation. This report and the completion documentation were recorded after hosted QA; they do not indicate a subsequent runtime deployment.

## Existing accounts and configuration

Before application edits, the owner ran a read-only query that returned only password-presence booleans and data counts for the two existing accounts. The owner reported both accounts present, email-confirmed and already having passwords. Password hashes were never returned. Existing users keep their Auth IDs and existing passwords; Forgot password offers the same-account setup path for an unknown password or a passwordless magic-link user. Accounts must not be deleted and recreated to migrate authentication.

Public Auth settings confirmed email/signup enabled, email confirmation required and anonymous sign-in disabled. The owner confirmed the redirect allowlist. The application fixes production confirmation/reset redirects to `https://pokelib.app/` and retains `http://localhost:3000/` for that exact development origin. Existing Resend/Supabase custom SMTP was preserved, with actual signup and recovery email delivery verified during this run.

## Requested hosted acceptance

| Check                               | Result and evidence                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. New account signup with password | Passed. A previously unused owner-supplied inbox submitted signup with matching password confirmation; the UI requested email confirmation and did not open the library.                                                                                                                                           |
| 2. Email confirmation               | Passed. Correct-password login before confirmation showed the unconfirmed-email message. Opening the confirmation email returned to `pokelib.app`, showed confirmation success and opened an empty library.                                                                                                        |
| 3. Logout                           | Passed. Settings Sign out returned to the email/password form.                                                                                                                                                                                                                                                     |
| 4. Normal password login            | Passed. The signup password opened the library directly, with no email or link step. Deterministic tests separately verify that this path calls the native password endpoint without an email request.                                                                                                             |
| 5. Wrong-password handling          | Passed. One deliberately incorrect password returned the fixed invalid-credentials message.                                                                                                                                                                                                                        |
| 6. Forgot-password email            | Passed. The form showed conditional, account-private feedback; the owner received and opened the recovery email.                                                                                                                                                                                                   |
| 7. Password reset                   | Passed. The canonical site showed Choose a new password for the expected account. Native password update returned success and signed out the session. Callback credentials were cleared from the visible URL.                                                                                                      |
| 8. Login with new password          | Passed. The old password was rejected; the new password opened the library directly.                                                                                                                                                                                                                               |
| 9. Existing owner-scoped data       | Passed. A team saved before password reset retained its exact ID and contents after reset/login. Original Account A signed in again with its existing password and retained the pre-deployment team's exact ID/content. The new account could not open Account A's private team by exact ID before or after reset. |

The account-isolation check is a focused hosted UI read check. It does not claim a new run of the earlier 24-group security suite, a direct mutation-by-ID test, or verification of every historical user account.

## Cleanup

Only two authored, tagless disposable families were created for this auth change:

- Original account fixture: `f476b8c6-1e0e-4d18-b36c-5cfd80bd4ca3`, **Auth QA b42e70a1 — existing account** (Darkrai).
- Password-reset fixture: `f1b8928c-633e-4106-9625-cfa7d2af9489`, **Auth QA b42e70a1 — password reset retention** (Pikachu).

Both were permanently deleted through their exact named application confirmations, cascading to their associated history. Account A and the new QA account each returned to All teams 0 and the empty-library message. No collections, reusable tags, imports or shares were created. Normal deletion retry receipts and monotonic generation counters remain by design; this is an empty library, not a claim that every internal database table has zero rows.

The two original Auth accounts and the new confirmed QA Auth account are retained. The disposable QA session was signed out and its generated passwords cleared from test memory. The QA inbox can use Forgot password if its owner wants to use that retained account. No existing account password was changed by the agent. The owner reauthenticated Account A privately when its old browser session required login.

## Validation and limits

The complete deterministic test suite, 14 additional native-SDK auth checks, TypeScript and production build passed before deployment. Local browser checks covered password confirmation mismatch, expired-link guidance and URL cleanup, and missing-recovery-session protection. The source offer matched all 239 source-file hashes; both runtime configuration values were absent from 128 checked compiled text files.

No authentication defect was found in this acceptance scope. Existing Vinext beta-runtime/build warnings and the local development-runner startup issue remain; the production build and production-Worker preview succeeded. This run does not establish email deliverability for every provider, load/concurrency performance, or a complete real-device/accessibility audit.

The existing 12 migrations, RLS/ownership architecture, D1 demo data, branding, routes, AGPL source offer, SMTP and owner-only audience remain unchanged. No custom password system, service-role key, schema modification or public release was introduced.

Implementation and account-setup guidance: [README.md](README.md), [DECISIONS.md](DECISIONS.md). Progress: [PROGRESS.md](PROGRESS.md).
