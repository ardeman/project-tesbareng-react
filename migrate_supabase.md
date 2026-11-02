# Task: migrate TesBareng from Firebase to Supabase (free plan)

## Why

The owner has no credit card. Firebase needs the Blaze plan (card required) to deploy Cloud Functions, and this app cannot work without server-side logic (email masking and server-only counters are hard rules). Supabase's free plan needs no card. Decision made on 2026-10-31.

## Decisions already made (do not reopen)

- Backend: **Supabase free plan**. Postgres + Row Level Security + Postgres functions (RPC). No Edge Functions unless something truly cannot be done in SQL.
- Auth: **Google sign-in only**, any Google account (do not restrict to `@gmail.com`; Workspace accounts are valid Play testers). No email/password for real users.
- Dev-only sign-in shortcut for local screen checks must remain (replacement for today's `?devLogin=<uid>`). It must be impossible to use against a non-local Supabase URL.
- Hosting: **Cloudflare Pages** (free, no card). Prepare config only. **Never deploy or create remote projects without asking.**
- Supabase project region when it is created later: `ap-southeast-1` (Singapore), the closest to Indonesia.
- Masking rule is unchanged: first 2 chars of local part (fewer only if shorter) + `*****` + `@domain`. `budi.santoso@gmail.com` → `bu*****@gmail.com`, `ab@gmail.com` → `ab*****@gmail.com`.
- UI and design stay as they are. This is a backend + data-layer migration, not a redesign.

## Ask the user before doing

- **PRD edits.** The PRD (§9 Data Model, §11 Tech Stack) names Firebase. Ask whether to (a) only add a dated note at the top of §9 and §11 saying the stack moved to Supabase and why, or (b) rewrite those sections. Do not edit the PRD before the answer.
- Any PRD §17 open question you run into. Do not invent answers.

## Read first

1. `CLAUDE.md` (project rules, hard rules, domain logic).
2. `PRD-TesBareng.md` §4 Roles, §6 Functional Requirements, §7 Permissions Matrix, §8 Masking, §9 Data Model, §10 Pages.
3. `docs/contract.md`: the current backend contract. Every behaviour in it must survive the move (validation, error cases, rate limits, re-join rules, admin moderation, soft delete one-way for creators).
4. Current backend: `functions/src/*.ts` (callables, triggers, recompute, mask, validate, counters), `firestore.rules`, `scripts/seed.ts`.
5. Current tests: `functions/test/unit/*`, `functions/test/emulator/rules.test.ts`, `functions/test/emulator/callables.test.ts` (104 tests; all pass today). These are the behaviour spec to port.
6. Web data layer: `web/src/lib/firebase.ts`, `auth.tsx`, `data.ts`, `types.ts`, `progress.ts`, `validate.ts`. Pages under `web/src/pages/` consume the hooks in `data.ts`.

## Target architecture

### Schema (`supabase/migrations/*.sql`)

Use snake_case in SQL; map to the existing camelCase TypeScript shapes in one place on the client.

- `profiles` (public read): `id uuid pk references auth.users`, `display_name`, `photo_url`, `masked_email`, `role` (`member` | `admin`), `created_at`. Never holds the full email.
- Full email: do **not** copy it into any public table. Read it from `auth.users` inside `security definer` functions only. If a private copy is needed, put it in a table with no `select` grant to `anon`/`authenticated` except owner + admin via RLS.
- `apps` (public read where `deleted = false`; admin sees all): same fields as the contract minus stored counters. `deleted boolean default false`.
- `testers` (public read): `id uuid pk`, `app_id`, `user_id uuid null` (null for manual entries), `display_name`, `photo_url`, `masked_email`, `opted_in_at`, `left_at`, `status`, `added_by`, `note`, `feedback_sent`, `feedback_sent_at`, `feedback_summary`, `feedback_verified`, `replied`, `created_at`. Unique `(app_id, user_id)` where `user_id is not null`.
- `builds` (public read): `id`, `app_id`, `version_name`, `uploaded_at`, `changelog`, `created_at`.
- Length and format limits as `check` constraints too (name 50, description 280, feedback guide 500, feedback summary 500, note 140, versionName 40, changelog 140, opt-in URL prefix `https://play.google.com/apps/testing/`, package name format), so the database rejects bad data even if a function has a bug.
- Indexes for: apps by creator, apps by status, testers by app, testers by user, builds by app.

### Counters: compute, do not store

Replace stored counters with views (`security_invoker = true`) so no client can tamper with them and there is no trigger fan-out:

- `app_stats`: per app `active_tester_count`, `eligible_count` (active and `now() - opted_in_at >= 14 days`), `feedback_sent_count`, `feedback_verified_count`, `replied_count` (all on active testers only, as the contract defines), `build_count`, `last_build_at`, plus the creator's reciprocity numbers (FR-27b).
- `profile_stats`: per user `apps_created_count`, `testing_count` (Active, or Left with `left_at - opted_in_at >= 14 days`; Removed never; entries on deleted apps never), `feedback_sent_count`, `feedback_verified_count` (status ≠ removed).

`eligible_count` in `app_stats` replaces the collection-group query the list and Tugas saya pages run today (`useAllActiveTesters`). Days active per tester is still computed on the client (CLAUDE.md domain logic).

### Writes: all through RPC

Revoke `insert`, `update` and `delete` on every table from `anon` and `authenticated`. All writes go through `security definer` Postgres functions with `set search_path = ''` and fully qualified names. This replaces both the callables and the direct-write Firestore rules, and makes column-level limits easy (RLS cannot restrict columns per caller).

| RPC | Replaces | Must keep |
|---|---|---|
| `ensure_profile()` | `ensureProfile` | Also a trigger on `auth.users` insert creates the profile; the RPC refreshes name/photo from the Google identity on each sign-in. Masks email server-side. |
| `create_app(...)` | `createApp` | FR-4 validation, `group_confirmed` must be true, duplicate non-deleted package name, 5 apps per user per rolling 24 h. |
| `update_app(app_id, ...)` | rules: app update | Creator or admin; only the editable fields; package uniqueness checked here too (Firestore could not). |
| `delete_app(app_id)` / `restore_app(app_id)` | rules: soft delete | Delete = `deleted = true`. Restore admin only. |
| `join_as_tester(app_id, checklist)` | `joinAsTester` | All 3 checklist items; creator cannot join own app; active → already exists; removed → denied; left → re-activate with new `opted_in_at`, clear `left_at`. |
| `leave_testing(app_id)` | `leaveTesting` | Own active entry only. |
| `mark_feedback_sent(app_id, sent, summary)` | `markFeedbackSent` | Own active entry only; trim; empty summary → null; `sent = false` clears all three fields. |
| `add_manual_tester(app_id, display_name, email, opted_in_at)` | `addManualTester` | Creator or admin; mask and discard the email. |
| `update_tester(tester_id, ...)` | rules: tester update | Creator/admin: status, opted_in_at (not future), left_at, note, feedback_verified, replied. Admin also feedback_sent / _at / summary (moderation). |
| `add_build(app_id, version_name, uploaded_at, changelog)` | `addBuild` | Creator or admin; 10 per app per rolling 24 h. |

`mask_email(text)` is a SQL function, unit-tested.

**Errors:** raise with an Indonesian `message` the UI shows as-is, and put the contract's code (`unauthenticated`, `invalid-argument`, `not-found`, `permission-denied`, `already-exists`, `failed-precondition`, `resource-exhausted`) in `hint` (or a custom SQLSTATE mapped one to one). `errorText` in `web/src/lib/data.ts` maps it back. Never leak raw Postgres error text to the UI.

### Auth

- Supabase Auth, Google provider. Client: `supabase.auth.signInWithOAuth({ provider: 'google' })` (redirect flow; works on phones), then `ensure_profile()`.
- Admin = `profiles.role = 'admin'`, checked in SQL by an `is_admin()` helper. Role is only changeable via SQL by the owner, never by an RPC callable from the client.
- Local `supabase/config.toml`: Google provider wired to env vars (`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `..._SECRET`), plus email/password enabled **locally only** for the dev shortcut. Document that production must have the email provider disabled.
- Dev shortcut: `?devLogin=<seeded user>` signs in with a seeded password, guarded so it only runs when the Supabase URL is `127.0.0.1`/`localhost`. Keep the same ergonomics as today.

### Realtime

Free plan allows 200 concurrent Realtime connections. Use Realtime only on the app detail page (testers, builds and the app row for that `app_id`; on change, refetch `app_stats` for that app). List, profile and Tugas saya refetch on mount and on window focus.

### Web changes

- Replace `web/src/lib/firebase.ts` with `supabase.ts` (`createClient` from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; local defaults from `supabase status`).
- Rewrite `auth.tsx` and `data.ts`. Keep the hook names and return shapes (`{ data, loading, error, retry }`) so pages change as little as possible.
- `types.ts`: replace Firestore `Timestamp` with numbers (ms) or `Date`, converted once in the mapping layer. `progress.ts` and pages use `.toMillis()` about 30 times; update them all. Keep the `id-ID` date formatting.
- Remove `firebase` from `web/package.json`. Add `@supabase/supabase-js`.
- Keep `web/src/lib/validate.ts` as the client mirror of the server checks.
- Bundle: the main chunk is 274 KB gzip today, mostly the Firebase SDK. Report the new size.

### Hosting prep

- `web/public/_redirects` with `/* /index.html 200` for SPA routes on Cloudflare Pages.
- Document the env vars Pages needs. Do not create the Pages project or deploy.

### Seed and local dev

- `supabase init` (CLI is installed at `/opt/homebrew/bin/supabase`; Docker is installed, start Docker Desktop if the daemon is not running).
- Rewrite `scripts/seed.ts` with the service-role key against local Supabase: same 36 members, 14 apps + 1 deleted, 116 tester entries, 26 builds, same admin (Yusuf Hidayat). Create auth users through the admin API so profiles are made by the real trigger path. Sample data only; never seed a remote project.
- Root `package.json` scripts: `db:start` (`supabase start`), `db:reset` (apply migrations), `seed`, `test`.

### Tests

Port every behaviour in the current 104 tests. Suggested split:

- SQL unit: `mask_email`, validation constraints, `app_stats` / `profile_stats` maths (eligibility at 13 vs 14 days, Left-before-14 not counted, Removed never counted, deleted apps excluded).
- Permissions (replaces `rules.test.ts`): as anon, member, tester, creator and admin through `supabase-js` against local Supabase: reads allowed, every direct table write denied, the full email unreadable by anyone but owner and admin.
- RPC (replaces `callables.test.ts`): every row of the RPC table above, including each error code and both rate limits.

Use Vitest with `supabase-js` (closest to the existing tests), or pgTAP via `supabase test db`. Either way, `npm test` runs the whole suite.

### Cleanup: remove all unused Firebase code (only after the new suite passes)

Remove every piece of Firebase that is no longer used. No dead code, no commented-out Firebase blocks, no "kept just in case" files.

- Backend: `functions/` (source, tests, `package.json`, build output), `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, any `*.log` from the emulators, emulator data folders.
- Root `package.json`: `firebase-admin`, `firebase-tools`, and the `emulators`, `build:functions`, `test:rules`, `test:callables` scripts.
- Web: `web/src/lib/firebase.ts`, the `firebase` dependency, every `firebase/*` import, Firestore `Timestamp` types, `COMMUNITY_GROUP` constants moved to a non-Firebase module (they are still used), `VITE_FIREBASE_*` and `VITE_USE_EMULATORS` env handling.
- `.gitignore`: drop Firebase entries, add Supabase ones (`supabase/.temp`, `.env*.local`).
- Docs: no remaining instructions that mention emulators, `demo-tesbareng`, Functions regions or Firestore, except the dated note on why the stack moved.

Verify with `grep -ri "firebase\|firestore" --exclude-dir=node_modules .` and report what is left (only the migration note and this file should match). Then reinstall (`npm install` at the root and in `web/`) and confirm `npm test` and `npm --prefix web run build` still pass. Do not delete anything before its replacement is tested.

## Docs to update

- `CLAUDE.md`: Stack, "Run it", hard rules (rewrite rule 1 for Postgres: "full email never in a public table"; rule 3: counters are computed views; rule 5: permissions are enforced by RLS + RPC, tested against local Supabase), dev shortcut.
- `docs/contract.md`: rewrite as the Supabase contract (tables, views, RPCs, error mapping, masking).
- PRD: only after the user answers the question above.

## UI rule

The UI should not need visual changes. If any UI must change (sign-in button, loading or error states, new data shapes), invoke `/design-taste-frontend` first and follow PRD §13; reuse `.taste-skill/app` (app style accent-ladder) and `.taste-skill/about`. Do not re-deal a style. If you delegate UI work to a subagent, tell it to load `design-taste-frontend` and read PRD §13.

## Done means

1. `npm test` passes with every old behaviour covered. Report counts per suite.
2. Against local Supabase with seed data, the smoke flow works in a real browser: sign in via dev shortcut, join an app through the 3-step checklist, mark feedback sent, counts update on the detail page; creator adds a build and a manual tester; admin soft-deletes and restores.
3. Querying as anon and as a member, no full email is readable from any table or view. Show the query and result.
4. Design regression: run the Taste Skill inspector (`inspect.mjs --app`) on list, detail (visitor, tester, creator), Tugas saya, profile and the forms, and `inspect.mjs` on `/about`, at mobile, tablet and desktop. 0 FAIL, and no new WARN compared with the Firebase build. Inspector needs `CHROME_PATH` set (see `CLAUDE.md`).
5. `CLAUDE.md` and `docs/contract.md` updated; Firebase files removed.
6. Nothing deployed, no remote Supabase or Cloudflare project created.

## Report back

Run commands, test counts, free-plan limits that matter (project pauses after 7 days idle, no automatic backups, 200 Realtime connections, 500 MB database), bundle size before and after, any deviation from this plan and why, and the list of manual setup steps the owner must do later (create Supabase project in `ap-southeast-1`, Google OAuth client and redirect URLs, Cloudflare Pages env vars, disable the email provider in production, set the admin role).
