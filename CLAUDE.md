# TesBareng

Shared, transparent tracker for a test-for-test community of indie Android developers. Members help each other pass Google Play's closed-test requirement: **12 testers opted in for 14 continuous days**, plus real engagement (feedback on Play, creator replies, 2–3 new builds).

Community Google Group: `google-tester-indonesia@googlegroups.com`

**Source of truth:** `PRD-TesBareng.md`. Read the relevant PRD section before implementing a feature. If code and PRD disagree, ask; do not silently pick one. Open questions live in PRD §17: do not invent answers to them, ask.

## UI work: Taste Skill is mandatory

Before writing or changing any UI (page, screen, component, styling), invoke `/design-taste-frontend` and follow PRD §13.

- **Page route** (read and scrolled): `/about`, any future landing page.
- **App-screen route** (`draw.mjs --app`, `inspect.mjs --app`): app list, app detail, tester table, build log, member profile, My Testing, add/edit app.
- Deal the app style **once**, then reuse its colours and type on every app screen. Do not re-deal per screen.
- Colour carries data only: progress bars (X/12, Y/12, Z/14), tester status, feedback state (none / sent / verified).
- Tabular numerals for counts and days. Tester table must stay readable on mobile.
- No slop: centred hero over icon cards, soft gradients/glows, icons in tinted squares, rainbow charts, invented vanity numbers.
- Done = passes skill `inspect` at mobile, tablet, desktop widths + one screenshot review-and-fix round.
- When delegating UI work to a subagent, tell it explicitly to load `design-taste-frontend` and read PRD §13. Subagents do not inherit skills.

Requires Node 22+ and Chrome/Edge/Chromium installed.

## Stack

- Frontend: React + Vite (TypeScript) SPA + Tailwind CSS + React Router, in `web/`. Hosting: Vercel (`web/vercel.json` rewrites SPA routes to `index.html`; project root `web`, build `npm run build`, output `dist`).
- Backend: Supabase free plan. Postgres + Row Level Security + Postgres functions (RPC) in `supabase/migrations/`. Auth: Supabase Auth, Google provider only. No Edge Functions unless something truly cannot be done in SQL.
- Stack moved from Firebase on 2026-10-31: Firebase needs the Blaze plan (credit card) to deploy Cloud Functions; Supabase's free plan does not.
- Development runs against the local Supabase stack (Docker). No hosted project exists yet. Never create remote projects or deploy without asking.

## Run it (local Supabase only)

- Install: `npm install && npm --prefix web install`. Needs the Supabase CLI and Docker Desktop running.
- Database: `npm run db:start` (API 54321, Postgres 54322, Studio 54323). `npm run db:reset` re-applies all migrations to an empty database. `npm run db:stop` stops it.
- Seed sample data (stack running, clears and re-seeds; refuses non-local URLs): `npm run seed`
- Web dev server: `npm --prefix web run dev`. With no env vars it talks to the local stack.
- Production-like preview against the local stack: `cd web && npx vite build && npx vite preview`. A deployed build needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (template: `web/.env.example`).
- Tests (stack running; they create and remove their own members, seed data stays): `npm test`
- Local-only sign-in shortcut for checking screens: append `?devLogin=<seeded email>` to any URL (e.g. `?devLogin=yusuf.hidayat.dev@gmail.com`, the seeded admin). It only works when the Supabase URL is 127.0.0.1/localhost; production has the email provider disabled.
- Backend contract between web and database: `docs/contract.md`. Change both sides together, with tests in `tests/`.
- Local Google sign-in needs a real OAuth client in `supabase/.env` (see `supabase/.env.example`); otherwise use `?devLogin`.
- Design state for the Taste Skill: `.taste-skill/app` (app style, accent-ladder) and `.taste-skill/about` (page direction, one-motif). Reuse them; do not re-deal. Inspector needs `CHROME_PATH` set to a Chromium (Playwright's works).

## Hard rules (security and data integrity)

1. **Never store a full email in a public table.** RLS cannot hide columns. Full emails live only in `auth.users`, which the API does not expose; only `security definer` functions read them, to mask them. No public table or view has an email column, and check constraints reject anything that is not a masked address.
2. **Masking format:** first 2 chars of the local part (fewer only if the local part is shorter) + `*****` (always 5) + `@domain`. `budi.santoso@gmail.com` → `bu*****@gmail.com`, `ab@gmail.com` → `ab*****@gmail.com` (user decision 2026-10-31; overrides the PRD §8 example). Masked for everyone, including the creator. Done in SQL by `mask_email()`.
3. **Counters are computed, never stored.** Tester, feedback, build and reciprocity numbers come from the `app_stats` and `profile_stats` views (`security_invoker`). Nobody can write them.
4. **Testers may change only their own feedback fields (`mark_feedback_sent`) and leave (`leave_testing`).** Only creator/admin set `feedback_verified`, `replied`, status, opt-in date, note (`update_tester`). Admin may also moderate feedback fields.
5. Enforce the permissions matrix (PRD §7) in the database: RLS for reads, `insert/update/delete` revoked from `anon` and `authenticated` on every table, all writes through `security definer` RPCs with `set search_path = ''`. Test every rule against the local stack (`tests/permissions.test.ts`, `tests/rpc.test.ts`).
6. App delete = soft delete (`deleted = true`). One-way for creators; only an admin restores (`restore_app`).

## Domain logic

- **Days active** = days from `optedInAt` to today, or to `leftAt` if Left. Computed on the client.
- **Eligible** = status Active AND days active ≥ 14.
- **Ready to apply** badge: eligible ≥ 12. **Low engagement** hint: fewer than half of eligible testers sent feedback, or no build logged.
- **Reciprocity Testing count:** Active entries + entries Left after 14+ days. Removed, or Left before 14 days, do not count.
- A member cannot register twice on one app, and a creator cannot test their own app.
- Opt-in URL must match `https://play.google.com/apps/testing/...`.
- Limits: name 50, description 280, feedback guide 500, feedback summary 500 chars. Rate limits: 5 apps/user/day, 10 build entries/app/day.
- "New build" banner shows for 3 days after a build entry.
- Feedback guide is prompts/questions, never ready-made review text (copy-pasted reviews look inauthentic to Google).
- No Play Console / Google Groups sync exists; all tracking is self-reported.

Data model: PRD §9. Routes: PRD §10.

## Product constraints

- Mobile-first. Most members open opt-in links on their phones.
- App detail page loads under 2 s on 4G.
- UI copy: Bahasa Indonesia primary, English optional. Write user-facing strings in Indonesian.
- MVP scope only (PRD §16). Phase 2/3 items (daily check-in, email reminders, admin panel, CSV export, iOS) are out of scope unless the user asks.
