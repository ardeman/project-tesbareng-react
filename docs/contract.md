# Backend contract (web ⇄ Supabase)

Shared between `web/` (React SPA) and `supabase/migrations/`. PRD §9 is the base (it still describes the old document model; this file is the concrete schema). Change both sides together, and cover the change in `tests/`.

Local stack: `npm run db:start` (Supabase CLI + Docker). API `http://127.0.0.1:54321`, Postgres `54322`, Studio `http://127.0.0.1:54323`. Hosted project (later): region `ap-southeast-1`.

## Tables

Rows are snake_case. The web client maps them to camelCase in one place (`web/src/lib/data.ts`). Timestamps are `timestamptz`; the client turns them into epoch milliseconds. `apps.test_start_date` is a `date`.

```
profiles            select: everyone · write: none (trigger + RPC only)
  id uuid pk → auth.users, display_name (≤ 50), photo_url, masked_email,
  role 'member' | 'admin', created_at

apps                select: everyone where deleted = false; admin sees all · write: none (RPC only)
  id uuid pk, name (≤ 50), description (≤ 280), opt_in_url, store_url?, package_name?,
  creator_id → profiles, status 'recruiting' | 'testing' | 'applied' | 'live',
  test_start_date?, feedback_guide? (≤ 500), created_at, updated_at, deleted bool

testers             select: everyone · write: none (RPC only)
  id uuid pk, app_id → apps, user_id? → profiles (null for manual entries),
  display_name, photo_url?, masked_email, opted_in_at, left_at?,
  status 'active' | 'left' | 'removed', added_by 'self' | 'creator', note? (≤ 140),
  feedback_sent bool, feedback_sent_at?, feedback_summary? (≤ 500),
  feedback_verified bool, replied bool, created_at
  unique (app_id, user_id) where user_id is not null

builds              select: everyone · write: none (RPC only)
  id uuid pk, app_id → apps, version_name (≤ 40), uploaded_at, changelog (≤ 140), created_at
```

`insert`, `update` and `delete` are revoked from `anon` and `authenticated` on every table. Check constraints repeat the limits and formats (opt-in URL prefix `https://play.google.com/apps/testing/`, store URL prefix `https://play.google.com/store/apps/`, package name `^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$`, masked email `^[^@\s]{1,2}\*{5}@…$`), and a partial unique index allows one live app per package name.

The full email exists only in `auth.users`, which the API does not expose. `security definer` functions read it to mask it. The member sees their own address from their session (`supabase.auth.getUser()`).

Realtime publishes `apps`, `testers` and `builds`. The web app subscribes only on the app detail page (one channel per app); other pages refetch on mount and on window focus.

## Computed views (counters)

Both views use `security_invoker = true`, so the RLS of the base tables applies. Nothing stores a counter, so nothing can tamper with one.

`app_stats` (one row per app):

| column | meaning |
|---|---|
| `active_tester_count` | testers with status active |
| `eligible_count` | active and `now() − opted_in_at ≥ 14 days` |
| `feedback_sent_count` / `feedback_verified_count` / `replied_count` | active testers with that flag |
| `build_count`, `last_build_at` | count and max `uploaded_at` of the app's builds |
| `creator_testing_count`, `creator_feedback_sent_count`, `creator_feedback_verified_count` | the creator's `profile_stats` (FR-27b) |

`profile_stats` (one row per profile), entries on soft-deleted apps never count:

| column | meaning |
|---|---|
| `apps_created_count` | the member's apps with `deleted = false` |
| `testing_count` | entries that are Active, or Left with `left_at − opted_in_at ≥ 14 days`; Removed never |
| `feedback_sent_count` / `feedback_verified_count` | entries with that flag and status ≠ removed |

Days active per tester are computed on the client (`web/src/lib/progress.ts`).

## RPCs (`supabase.rpc(name, args)`)

All are `security definer` with `set search_path = ''`. Every one except `mask_email` requires a session and raises `unauthenticated` without one. Date arguments are ISO strings: a bare `YYYY-MM-DD` means midnight UTC; the web client sends full timestamps for dates a member picks (local midnight).

| RPC | Args | Returns | Rules |
|---|---|---|---|
| `ensure_profile` | — | `uuid` | Upserts the caller's profile from the Google identity (name, photo, masked email). Never touches `role`. A trigger on `auth.users` insert creates the profile on first sign-in. |
| `create_app` | `p_name, p_description, p_opt_in_url, p_store_url?, p_package_name?, p_test_start_date?, p_feedback_guide?, p_group_confirmed` | `uuid` | FR-4 validation; `p_group_confirmed` must be true (`invalid-argument`); live duplicate package → `already-exists`; 5 apps per member per rolling 24 h → `resource-exhausted`. Starts `recruiting`. |
| `update_app` | `p_app_id`, same fields as create, `p_status?` | — | Creator or admin. Replaces the editable fields; null `p_status` keeps the status. Package uniqueness checked. |
| `delete_app` | `p_app_id` | — | Creator or admin. Soft delete (`deleted = true`); one-way for creators. |
| `restore_app` | `p_app_id` | — | Admin only (`permission-denied`). Refuses if the package name was taken meanwhile (`already-exists`). |
| `join_as_tester` | `p_app_id, p_checklist {joinedGroup, optedIn, installed}` | — | All three must be JSON `true`. Creator → `permission-denied`. Existing entry: active → `already-exists`; removed → `permission-denied`; left → re-activated with a new `opted_in_at` and `left_at` cleared. Masks the email. |
| `leave_testing` | `p_app_id` | — | Own active entry → left, `left_at = now()`. Not active → `failed-precondition`; no entry → `not-found`. |
| `mark_feedback_sent` | `p_app_id, p_sent, p_summary?` | — | Own **active** entry only. `true`: `feedback_sent_at = now()`, summary trimmed (≤ 500, empty → null). `false`: clears all three. |
| `add_manual_tester` | `p_app_id, p_display_name, p_email, p_opted_in_at?` | `uuid` | Creator or admin. Email is masked and discarded. `added_by = 'creator'`, opt-in not in the future (1 day slack). |
| `update_tester` | `p_tester_id, p_patch` (JSON object, snake_case keys) | — | Creator or admin: `status, opted_in_at, left_at, note, feedback_verified, replied`. Admin also: `feedback_sent, feedback_sent_at, feedback_summary` (moderation). Any other key → `permission-denied`. Status change without `left_at`: active clears it, left/removed keep it or set now. |
| `add_build` | `p_app_id, p_version_name, p_uploaded_at, p_changelog` | `uuid` | Creator or admin. ≤ 40 / ≤ 140, date not in the future. 10 per app per rolling 24 h → `resource-exhausted`. |
| `mask_email` | `email` | `text` | Pure helper, callable by anyone. |

Only the admin may act on a soft-deleted app (edit, manage testers, add builds, restore); for everyone else, its creator included, it is `not-found`.

## Errors

RPCs raise SQLSTATE `P0001` with an Indonesian `message` the UI shows as-is and the contract code in `hint`:

`unauthenticated` (no session), `invalid-argument` (validation, checklist, `group_confirmed`), `not-found` (app missing or soft-deleted, no own entry), `permission-denied` (creator joins own app, removed tester re-joins, non-creator manages testers/builds, forbidden patch key), `already-exists` (double join, duplicate package), `failed-precondition` (leave/feedback when the entry is not active), `resource-exhausted` (rate limits).

`errorCode()` / `errorText()` in `web/src/lib/data.ts` map other errors without showing raw Postgres text: `42501` → permission-denied, `22P02` (malformed uuid) and constraint violations → invalid-argument, `23505` → already-exists, network failures → "Server tidak bisa dihubungi…", anything else → a generic server error sentence.

## Masking

`mask_email(email)`: lower-cased, trimmed; the local part's first 2 characters (fewer only if shorter) + `*****` + `@` + domain. `budi.santoso@gmail.com` → `bu*****@gmail.com`; `ab@gmail.com` → `ab*****@gmail.com`. Masked for everyone, including the creator.

## Auth

Google is the only sign-in for real users (any Google account, Workspace included): `supabase.auth.signInWithOAuth({ provider: 'google' })`, redirect flow. Admin = `profiles.role = 'admin'`, checked in SQL by `is_admin()`; the role is set only with SQL by the project owner.

Local only: email/password is enabled in `supabase/config.toml` so `?devLogin=<seeded email>` can sign in seeded members (password in `scripts/local.ts`). The client refuses the shortcut unless the Supabase URL is `127.0.0.1`/`localhost`. **Production must have the Email provider disabled.**
