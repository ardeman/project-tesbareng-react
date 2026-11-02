# PRD — TesBareng

| | |
|---|---|
| **Product** | TesBareng ("test together") |
| **Version** | 2.0 |
| **Status** | Draft |
| **Last updated** | 2 November 2026 |
| **Owner** | Community Admin |
| **Community group** | `google-tester-indonesia@googlegroups.com` |
| **Stack** | Supabase (free plan) + Cloudflare Pages |

---

## Changelog

**v2.0 — 2 November 2026**
- **Stack moved from Firebase to Supabase** (decided 31 October 2026). Firebase needs the Blaze plan, which requires a credit card, to deploy server-side logic. Supabase's free plan needs no card. §9 and §11 are rewritten for Postgres, Row Level Security and RPC.
- **Cohorts with assignment** (§5.6, §6.9): creators are grouped into cohorts and assigned apps to test, so nobody receives testers without testing back.
- **Milestone check-ins** (§6.10): attendance per milestone instead of daily.
- **Reminders** (§6.11): daily email digest through Gmail SMTP, plus a WhatsApp reminder text the admin copies into the cohort group.
- **WhatsApp sub-group per cohort** (§6.12) for discussion.
- Masking rule clarified: `ab@gmail.com` → `ab*****@gmail.com` (§8).
- Any Google account can sign in, not only `@gmail.com` (Workspace accounts are valid Play testers).

**v1.0 — 31 October 2026**: first draft (apps, tester list, progress, Play feedback tracking, reciprocity score).

---

## 1. Background

New personal Google Play developer accounts must run a closed test with **at least 12 testers who stay opted in for 14 continuous days** before they can apply for production access. Indie developers struggle to find and keep enough testers.

Google also checks engagement, not just tester count. Installing is not enough: testers need to leave real feedback through Google Play, and developers are expected to reply to that feedback and ship new builds (typically 2–3 updates) during the test.

The community is made of **creators**: every member of `google-tester-indonesia@googlegroups.com` has their own app to test. Each creator adds the group as the tester list of their closed track, and members opt in to each other's apps. The community also has a WhatsApp Community run by the admin.

Today, progress is invisible, and testing is not fair by default: some members want their app tested without testing others. **TesBareng** is a shared, transparent "spreadsheet" that shows who tests what, for how long, and with what engagement, and organises creators into cohorts where everyone tests everyone they are assigned to.

## 2. Goals

1. Give every app a public page showing its progress toward the 12-tester / 14-day requirement.
2. Let any logged-in member register as a tester for any app in a few clicks.
3. Keep tester lists transparent while protecting privacy (masked emails).
4. Make engagement visible: who sent feedback on Google Play, whether the creator replied, and how many builds the creator shipped.
5. Make testing fair: cohorts assign each creator a balanced set of apps to test, and obligations are tracked publicly.
6. Remind people at the right moments without manual chasing.

## 3. Non-goals

- Automatic sync with Google Play Console or Google Groups. No public API exposes opt-in data, so tracking is self-reported plus creator verification.
- Collecting feedback on TesBareng itself. Feedback is written in Google Play (it lands in the creator's Play Console under *Testing feedback*); TesBareng only tracks that it happened.
- Automated WhatsApp messages (WhatsApp Business API is paid; unofficial bots risk banning the admin's number).
- Native mobile app.
- In-app chat or direct messaging (discussion happens in the cohort WhatsApp group).
- iOS / TestFlight support (later).

## 4. Roles

| Role | Description |
|---|---|
| **Visitor** | Not logged in. Can browse apps, progress, tester lists (masked), engagement status, cohorts and profiles. Read-only. |
| **Member** | Logged in with Google. Can create apps and register as a tester. |
| **Creator** | A member who owns an app. Full edit rights on that app and its tester list. |
| **Tester** | A member registered on a specific app. Updates their own engagement checklist and check-ins on that app. |
| **Cohort member** | A member placed in a cohort, with or without an app. Has assigned apps to test and sees the cohort's WhatsApp link. |
| **Admin** | Community owner. Forms and runs cohorts, sends WhatsApp reminders, moderates any app, tester entry or feedback summary. Role is set only in SQL by the owner. |

A single user can be a Creator of their own app(s), a Tester of other apps and a Cohort member at the same time.

## 5. Core User Flows

### 5.1 Create an app (Creator)
1. Log in with Google.
2. Click **Add App**.
3. Fill in: app name, short description, Play Store opt-in link, optional Play Store listing link, optional package name, and a **feedback guide** (§6.5).
4. Confirm: "I have added `google-tester-indonesia@googlegroups.com` as the tester list in my closed testing track."
5. The app is published with status **Recruiting** and can be added to a cohort by the admin.

### 5.2 Register as a tester (Member)
1. Log in with Google.
2. Open an app page. Apps assigned to the member through a cohort show a **Ditugaskan (Assigned)** badge.
3. Click **Daftar jadi tester / Become a tester**.
4. Confirmation modal with a step checklist:
   - [ ] I have joined `google-tester-indonesia@googlegroups.com` (link provided).
   - [ ] I have opened the opt-in link and tapped "Become a tester" on Google Play (link provided).
   - [ ] I have installed the app.
5. Click **Confirm**. The member is added immediately (no creator approval). `opted_in_at` is set to now. This is the cohort's opt-in milestone.

### 5.3 Send feedback via Google Play (Tester)
1. Use the app for a few days, ideally after at least one build update.
2. Read the app's **feedback guide** on its TesBareng page.
3. Open the app's Play Store page and send feedback in your own words (rating plus a specific comment: what worked, what broke, what to improve).
4. Back on TesBareng, tick **Feedback sent on Play**. Optionally add a short summary (max 500 chars) so other members can see it.
5. Repeat after new builds if the creator asks for it.

### 5.4 Leave testing (Tester)
1. On the app page, click **Stop testing**.
2. Status changes to **Left**. The entry stays visible but no longer counts toward progress.

### 5.5 Manage tester list (Creator)
On their own app only, the creator can:
- Manually add a tester (name + email; the email is masked and discarded) for people who joined outside the website.
- Change a tester's status (Active / Left / Removed) and correct the opt-in date (not in the future).
- Add a short note per tester (max 140 chars, visible to all).
- Mark a tester's feedback **Verified** after seeing it in Play Console *Testing feedback* (it shows the reviewer's name), and **Replied** after replying there.
- Log each new build uploaded to the closed track (§6.5).

### 5.6 Run a cohort (Admin)
1. **Form:** create a cohort (e.g. "Cohort #3") and add members, each with the app they bring. Members without an app can join as **Helpers**. A cohort needs at least **13 apps**, so each app can receive at least 12 testers.
2. **Link:** paste the cohort's WhatsApp sub-group link (§6.12).
3. **Start (Day 0):** all closed tracks must be live. Starting the cohort generates assignments (§6.9) and opens the 48-hour opt-in window.
4. **Run:** members complete milestones (§6.10). The daily digest email and the admin's WhatsApp reminders keep people on schedule (§6.11).
5. **Handle ghosting:** after Day 2, unmet opt-ins show a public "Belum tes" label on that member's app. The admin can reassign an unfilled slot to a member who has finished their own obligations.
6. **Close:** when every app shows "Ready to apply", or at Day 21, the admin closes the cohort. Members with unmet obligations are marked **Owing** and cannot join the next cohort until the admin marks them settled.

### 5.7 Cohort member's journey
1. After Day 0, **Tugas saya (My Testing)** lists the member's assigned apps and obligations, e.g. "9/14 opt-in · 4/14 feedback".
2. Day 0–2: register as tester on every assigned app (§5.2).
3. Around Day 7: check in "Sudah buka app" and send feedback on Play.
4. Each new build: update the app and check in "Sudah update".
5. Day 13: check in "Masih opt-in".
6. Discussion and questions happen in the cohort WhatsApp group.

## 6. Functional Requirements

### 6.1 Authentication
- **FR-1** Login with Supabase Auth, Google provider only, using the redirect flow (works on phones). Any Google account may sign in, including Workspace accounts.
- **FR-2** A trigger on new auth users creates the profile; on each sign-in, `ensure_profile()` refreshes name and photo from the Google identity and stores the masked email.
- **FR-3** Browsing does not require login. Any write action prompts login.
- **FR-3a** A dev-only sign-in shortcut (`?devLogin=<seeded user>`) exists for local screen checks. It runs only when the Supabase URL is `127.0.0.1` or `localhost`. Production has the email/password provider disabled.

### 6.2 App management
- **FR-4** App fields:
  - Name (required, max 50 chars)
  - Short description (required, max 280 chars)
  - Play Store opt-in link (required, must start with `https://play.google.com/apps/testing/`)
  - Play Store listing link (optional)
  - Package name (optional, valid Android package format, unique among non-deleted apps)
  - Test start date (optional, set by creator when the closed track goes live)
  - Status: Recruiting → Testing → Applied for Production → Live (Production)
  - Feedback guide (optional, max 500 chars): focus areas written as prompts or questions, e.g. "Try level 3 on a small screen — is the jump button easy to hit?"
- **FR-5** Only the creator (and Admin) can edit or delete an app.
- **FR-6** A member may create multiple apps, max 5 per rolling 24 hours.
- **FR-7** Deleting an app soft-deletes it (hidden from lists, data retained). Only the admin can restore.

### 6.3 Tester list (the "shared spreadsheet")
- **FR-8** Each app page displays its tester list as a table:

  | # | Name | Email (masked) | Opted in since | Days active | Status | Feedback on Play | Creator replied | Check-ins |
  |---|---|---|---|---|---|---|---|---|

  "Feedback on Play" shows: — (not yet), ✓ Sent (self-reported), ✓✓ Verified (confirmed by creator). "Check-ins" shows the milestones completed (§6.10).

- **FR-9** Emails are always shown masked to everyone, including the creator (§8).
- **FR-10** "Days active" = days between `opted_in_at` and today (or `left_at` if Left), computed on the client.
- **FR-11** A tester with **≥14 days active and status Active** is highlighted as **Eligible**.
- **FR-12** A member cannot hold two entries on the same app. Re-joining after Left re-activates the entry with a new `opted_in_at`. Removed testers cannot re-join.
- **FR-13** A creator cannot register as a tester on their own app.
- **FR-14** The table is sortable by name, opt-in date and days active.

### 6.4 Progress indicators (per app)
- **FR-15** Active testers: `X / 12` with progress bar.
- **FR-16** Eligible testers (Active and ≥14 days): `Y / 12` with progress bar.
- **FR-17** Days since test start: `Z / 14` (if test start date is set).
- **FR-17a** Feedback: active testers with feedback sent / verified, e.g. `9 sent · 7 verified`.
- **FR-17b** Builds shipped during test: `N / 3` (a guideline, not a Google rule).
- **FR-17c** Replies: testers replied to / testers with feedback.
- **FR-18** A "Ready to apply" badge when eligible testers ≥ 12. A softer "Low engagement" hint shows if fewer than half of eligible testers have sent feedback, or no build has been logged.
- **FR-19** App list cards show active, eligible and feedback counts, status, cohort badge, and the "Belum tes" label when applicable.

### 6.5 Engagement tracking
Feedback itself lives in Google Play. TesBareng tracks engagement around it.

- **FR-20** Only Active testers can tick **Feedback sent on Play** on their own entry, with an optional summary (max 500 chars, trimmed; empty becomes null). Unticking clears the timestamp and summary.
- **FR-21** Only the creator (or admin) can set **Verified** and **Replied**. Testers cannot set these on themselves.
- **FR-22** The feedback guide is shown above the "Become a tester" button and in the tester's checklist. It contains questions or focus areas, not ready-made review text: identical copy-pasted reviews from many accounts can look inauthentic to Google.
- **FR-23** **Build log:** the creator adds an entry per closed-track upload (version name max 40 chars, date, changelog max 140 chars), max 10 per app per rolling 24 hours. The app page shows the log newest first and a "New build — update and test again" banner for 3 days after each entry.
- **FR-24** The creator can remove Verified if it was set by mistake.

### 6.6 App discovery
- **FR-25** Home page lists all apps with search by name and filter by status and cohort.
- **FR-26** Default sort: apps needing testers most (lowest active count first).

### 6.7 Reciprocity score
- **FR-27a** Each member has two public numbers instead of one opaque score:
  - **Testing:** apps where they are Active, or Left after 14+ days. Removed entries, Left before 14 days, and entries on deleted apps do not count.
  - **Feedback:** apps where their feedback is marked Sent (Verified shown separately); Removed entries do not count.
- **FR-27b** App cards and the app page show the creator's numbers, e.g. "Creator: testing 8 apps · feedback on 6 (5 verified)".
- **FR-27c** The app list can be sorted by **Creator most active**.
- **FR-27d** Tugas saya shows the member's own numbers, with a nudge when Testing is below the number of apps they have listed.
- **FR-27e** Numbers are computed by database views; nobody can edit them.
- **FR-27f** A public profile page lists the apps a member created, the apps they are testing, and their cohort history (names and status only, no email).

### 6.8 Tugas saya (My Testing)
- **FR-28** Logged-in users see: apps I created, apps I'm testing (days active, feedback status, check-ins), my reciprocity numbers, and a **to-do list** ordered by urgency: assigned apps not yet joined, check-ins due, feedback owed, new builds to test. During a cohort, the top of the page shows obligations, e.g. "9/14 opt-in · 6/14 sudah buka app · 4/14 feedback".

### 6.9 Cohorts and assignment
- **FR-29** Admin creates a cohort with a name. Cohort status: **Forming → Active → Closed**.
- **FR-30** While Forming, the admin adds members, each with one app they own (one app per member per cohort) or as a Helper with no app. An app can be in only one non-closed cohort at a time.
- **FR-31** Starting a cohort requires at least 13 apps and sets Day 0 to the start time.
- **FR-32** **Assignment rule.** Members with apps are shuffled into a random ring order. With N apps:
  - **N = 13–16 → full mesh:** every member tests every other app (k = N − 1).
  - **N > 16 → ring:** the member at position *i* tests the apps at positions *i+1 … i+14* (wrapping around), so k = 14. Every member tests exactly 14 apps and every app receives exactly 14 assigned testers.
- **FR-33** Helpers are each assigned 14 apps (or all apps if fewer), chosen to even out coverage: apps with the fewest assigned testers first.
- **FR-34** An assignment is **fulfilled** when the assigned member has an Active tester entry on that app. Joining uses the normal flow (§5.2).
- **FR-35** **Opt-in deadline:** 48 hours after Day 0. After the deadline, a member with unfulfilled assignments shows as **Behind**, and their own app shows a public **"Belum tes"** label until fulfilled.
- **FR-36** **Slot reassignment:** the admin can move an unfulfilled assignment to another cohort member who has fulfilled all their own assignments. The original assignment is marked Reassigned.
- **FR-37** **Closing:** at close, each member's standing is set to **Good** (all obligations met) or **Owing**. Owing members cannot be added to a new cohort until the admin marks them **Settled**.
- **FR-38** **Cohort page** shows the members, the WhatsApp button (members only, §6.12), the schedule with today's day number, and an **obligation matrix**: rows are members, columns are apps, cells show not joined / opted in / used / feedback sent / feedback verified. Unassigned cells are greyed out.
- **FR-38a** Members outside a cohort can still join any app freely (open pool). Open-pool testing counts toward reciprocity but not toward cohort obligations.

### 6.10 Milestone check-ins (attendance)
Daily attendance on 14 apps would mean 14 taps per person per day and invites careless clicking. Attendance is per milestone instead:

| Milestone | When | Tester action | Creator action |
|---|---|---|---|
| Opt-in | Day 0–2 | Register as tester (§5.2) | — |
| Used the app | From Day 5, due Day 7 | Check in "Sudah buka app" + send feedback on Play | Mark Verified |
| New build | Within 3 days of each build | Check in "Sudah update" | Log the build |
| Still opted in | From Day 12, due Day 13 | Check in "Masih opt-in" | — |

- **FR-39** Check-ins are available to Active testers on their own entry, cohort or open pool, each kind at most once per entry (per build for "Sudah update").
- **FR-40** Check-in windows outside a cohort are relative to the tester's own `opted_in_at`.
- **FR-41** Verified feedback is the strongest signal because the creator can confirm it in Play Console. Opt-in, usage and update check-ins are honesty-based, and the UI says so.
- **FR-42** A member is **Behind** in a cohort when any milestone past its due day is unmet on an assigned app. Behind members are visible in the matrix and in the admin reminder panel.
- **FR-43** Optional daily check-in remains a Phase 2 idea (§14).

### 6.11 Reminders
- **FR-44** **Email digest:** once a day at 19:00 WIB, each member with pending to-dos receives one email listing all of them (assigned apps not joined, check-ins due, feedback owed, new builds). Max one email per member per day.
- **FR-45** Digest triggers:

  | Cohort day | Content |
  |---|---|
  | Day 1 | Assigned apps not yet joined |
  | Day 2 | Opt-in deadline; "Belum tes" label goes live after it |
  | Day 5 | Feedback not sent yet |
  | Day 7 | Used-app check-in and feedback checkpoint |
  | Day 13 | Still-opted-in check-in |
  | Any day | New builds logged in the last 24 hours on apps the member tests |

  Creators also get: unreplied verified feedback older than 3 days, and "Your app reached 12 eligible testers".
- **FR-46** Members can turn digest emails off in Tugas saya (on by default). Every email links to that setting.
- **FR-47** Each sent reminder is logged; the same reminder is never sent twice to the same member on the same day.
- **FR-48** **WhatsApp reminder panel (admin):** for each active cohort, lists Behind members by display name and milestone, with a ready-to-copy Indonesian message mentioning them, e.g. "Halo @Budi @Sari, deadline opt-in Cohort #3 hari ini jam 19.00. Cek tugasmu di TesBareng: <link>". The admin pastes it into the cohort group manually.

### 6.12 WhatsApp sub-group per cohort
- **FR-49** Each cohort can have one WhatsApp sub-group link (under the admin's WhatsApp Community), set by the admin.
- **FR-50** The link is visible only to logged-in members of that cohort and the admin.
- **FR-51** Before showing the link the first time, the UI notes that group members can see each other's phone numbers, and joining is optional. The Google Group remains the only mandatory group because Play Console needs it.
- **FR-52** The admin panel provides a pinned-message template: schedule (Day 0, 2, 7, 13), link to the cohort page, and group rules ("chat for coordination; status is reported on TesBareng, not in chat").
- **FR-53** When a cohort closes, the page reminds the admin to archive the WhatsApp group.

## 7. Permissions Matrix

| Action | Visitor | Member | Tester (on app) | Creator (own app) | Admin |
|---|---|---|---|---|---|
| View apps, progress, tester lists, engagement, builds, profiles, cohorts, matrix | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create app | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit / soft-delete app | ❌ | ❌ | ❌ | ✅ | ✅ |
| Restore deleted app | ❌ | ❌ | ❌ | ❌ | ✅ |
| Register as tester | ❌ | ✅ | — | ❌ (own app) | ✅ |
| Leave testing | ❌ | ❌ | ✅ | — | ✅ |
| Add manual tester / edit tester status, date, note | ❌ | ❌ | ❌ | ✅ | ✅ |
| Tick "Feedback sent" + summary (own entry) | ❌ | ❌ | ✅ | ❌ | ✅ (moderation) |
| Check in (own entry) | ❌ | ❌ | ✅ | ❌ | ❌ |
| Set Verified / Replied | ❌ | ❌ | ❌ | ✅ | ✅ |
| Edit feedback guide, add build log | ❌ | ❌ | ❌ | ✅ | ✅ |
| View cohort WhatsApp link | ❌ | Own cohort only | Own cohort only | Own cohort only | ✅ |
| Create / start / close cohort, add members, reassign slots, mark settled | ❌ | ❌ | ❌ | ❌ | ✅ |
| Toggle own email digest | ❌ | ✅ | ✅ | ✅ | ✅ |

## 8. Privacy

### 8.1 Email masking
**Rule:** keep the first 2 characters of the local part (fewer only if the local part is shorter), add `*****` (fixed, so length isn't revealed), keep the domain.

| Original | Masked |
|---|---|
| `budi.santoso@gmail.com` | `bu*****@gmail.com` |
| `ab@gmail.com` | `ab*****@gmail.com` |
| `a@company.co.id` | `a*****@company.co.id` |

### 8.2 Where the full email lives
- The full email is **never stored in a public table or view**. Postgres RLS works per row, not per column, so any column in a readable table is readable by anyone.
- The full email is read from `auth.users` only inside `security definer` functions (for masking) and by the reminder Edge Function using the service role (for sending).
- Manually added testers: the email is masked inside the RPC and the original is discarded.
- Creators don't need full emails because testers are managed through the shared Google Group in Play Console.

### 8.3 Other personal data
- Cohort WhatsApp links are stored in a separate table readable only by cohort members and the admin.
- Phone numbers are never collected by TesBareng. Phone visibility inside WhatsApp groups is disclosed before joining (FR-51).

## 9. Data Model (Supabase / Postgres)

Supersedes the v1 Firestore model. SQL uses snake_case; the web client maps rows to camelCase TypeScript types in one place, and timestamps become milliseconds or `Date` there.

### 9.1 Tables

```
profiles                      -- public read; never holds the full email
  id uuid pk → auth.users, display_name, photo_url, masked_email,
  role ('member' | 'admin'), email_reminders bool default true, created_at

apps                          -- public read where deleted = false; admin sees all
  id uuid pk, creator_id → profiles, name, description, opt_in_url,
  store_url?, package_name?, test_start_date?, feedback_guide?,
  status ('recruiting' | 'testing' | 'applied' | 'live'),
  group_confirmed bool, deleted bool default false, created_at, updated_at

testers                       -- public read
  id uuid pk, app_id → apps, user_id uuid null (null = manual entry),
  display_name, photo_url, masked_email,
  opted_in_at, left_at?, status ('active' | 'left' | 'removed'),
  added_by ('self' | 'creator'), note?,
  feedback_sent bool, feedback_sent_at?, feedback_summary?,
  feedback_verified bool, replied bool, created_at
  unique (app_id, user_id) where user_id is not null

builds                        -- public read
  id uuid pk, app_id → apps, version_name, uploaded_at, changelog, created_at

check_ins                     -- public read
  id uuid pk, tester_id → testers,
  kind ('used_app' | 'updated_build' | 'still_opted_in'),
  build_id uuid null → builds (required for 'updated_build'), created_at
  unique (tester_id, kind, coalesce(build_id, nil uuid))

cohorts                       -- public read
  id uuid pk, name, status ('forming' | 'active' | 'closed'),
  day0_at?, closed_at?, created_at

cohort_members                -- public read
  cohort_id → cohorts, user_id → profiles, app_id uuid null → apps (null = helper),
  ring_position int?, standing ('good' | 'owing' | 'settled')?, joined_at
  pk (cohort_id, user_id)

assignments                   -- public read
  id uuid pk, cohort_id → cohorts, tester_user_id → profiles, app_id → apps,
  state ('open' | 'reassigned'), reassigned_to uuid null → assignments, created_at
  unique (cohort_id, tester_user_id, app_id)

cohort_links                  -- RLS: select only by cohort members + admin
  cohort_id pk → cohorts, whatsapp_group_url

reminder_log                  -- no client access (service role only)
  id uuid pk, user_id, kind, ref_id uuid null, sent_on date, created_at
  unique (user_id, kind, ref_id, sent_on)
```

**Check constraints** mirror the server validation so the database rejects bad data even if a function has a bug: name 50, description 280, feedback guide 500, feedback summary 500, note 140, version name 40, changelog 140, opt-in URL prefix, package name format, WhatsApp URL prefix `https://chat.whatsapp.com/`.

**Indexes:** apps by creator and by status; testers by app and by user; builds by app; check_ins by tester; cohort_members by user; assignments by cohort, by tester and by app.

### 9.2 Computed views (no stored counters)
All views use `security_invoker = true`, so no client can tamper with counts and there is no trigger fan-out.

- **`app_stats`** — per app: `active_tester_count`, `eligible_count` (Active and `now() - opted_in_at >= 14 days`), `feedback_sent_count`, `feedback_verified_count`, `replied_count` (all on Active testers), `build_count`, `last_build_at`, and the creator's reciprocity numbers.
- **`profile_stats`** — per user: `apps_created_count`, `testing_count` (Active, or Left with `left_at - opted_in_at >= 14 days`; never Removed; never on deleted apps), `feedback_sent_count`, `feedback_verified_count` (status ≠ removed).
- **`cohort_obligations`** — per cohort member: assigned count, opted-in count, used-app count, feedback sent/verified counts, latest-build-updated count, still-opted-in count, `is_behind` (per FR-42), and `owes_opt_in` (drives the "Belum tes" label).

Days active per tester stays a client calculation.

### 9.3 Writes go through RPC only
`insert`, `update` and `delete` are revoked on every table for `anon` and `authenticated`. All writes are `security definer` Postgres functions with `set search_path = ''` and fully qualified names. Admin checks use an `is_admin()` helper reading `profiles.role`; no client-callable function can change a role.

| RPC | Who | Must keep |
|---|---|---|
| `ensure_profile()` | Signed-in user | Refresh name/photo from Google identity; mask email server-side |
| `create_app(...)` | Member | FR-4 validation; `group_confirmed` true; unique non-deleted package name; 5 per rolling 24 h |
| `update_app(app_id, ...)` | Creator, admin | Editable fields only; package uniqueness |
| `delete_app(app_id)` / `restore_app(app_id)` | Creator, admin / admin | Soft delete; restore admin only |
| `join_as_tester(app_id, checklist)` | Member | All 3 checklist items; not own app; Active → already exists; Removed → denied; Left → re-activate with new `opted_in_at`, clear `left_at` |
| `leave_testing(app_id)` | Tester | Own Active entry only |
| `mark_feedback_sent(app_id, sent, summary)` | Tester | Own Active entry; trim; empty → null; `sent = false` clears all three fields |
| `add_manual_tester(app_id, display_name, email, opted_in_at)` | Creator, admin | Mask and discard the email |
| `update_tester(tester_id, ...)` | Creator, admin | Status, `opted_in_at` (not future), `left_at`, note, verified, replied; admin also feedback fields (moderation) |
| `add_build(app_id, version_name, uploaded_at, changelog)` | Creator, admin | 10 per app per rolling 24 h |
| `check_in(app_id, kind, build_id?)` | Tester | Own Active entry; window rules (§6.10); once per kind (per build) |
| `set_email_reminders(enabled)` | Signed-in user | Own profile only |
| `create_cohort(name)` | Admin | |
| `add_cohort_member(cohort_id, user_id, app_id?)` | Admin | Cohort Forming; app owned by user and not in another open cohort; user not Owing |
| `remove_cohort_member(cohort_id, user_id)` | Admin | Cohort Forming only |
| `start_cohort(cohort_id)` | Admin | ≥ 13 apps; shuffle ring; generate assignments per FR-32/33; set `day0_at` |
| `reassign_slot(assignment_id, to_user_id)` | Admin | Target is a cohort member with all assignments fulfilled |
| `close_cohort(cohort_id)` | Admin | Set standings from `cohort_obligations` |
| `settle_member(cohort_id, user_id)` | Admin | Owing → Settled |
| `set_cohort_link(cohort_id, url)` | Admin | WhatsApp URL format |
| `get_cohort_link(cohort_id)` | Cohort member, admin | Returns the link or `permission-denied` |

`mask_email(text)` is a SQL function with its own tests.

### 9.4 Errors
Functions raise with an Indonesian `message` the UI shows as-is, and the error code in `hint`: `unauthenticated`, `invalid-argument`, `not-found`, `permission-denied`, `already-exists`, `failed-precondition`, `resource-exhausted`. The client maps codes back; raw Postgres error text is never shown.

### 9.5 Realtime
The free plan allows 200 concurrent Realtime connections. Realtime is used only on the app detail page (testers, builds, check-ins and the app row for that app; on change, refetch `app_stats` for it). Other pages, including the cohort matrix, refetch on mount and on window focus.

## 10. Pages

| Page | Route | Content |
|---|---|---|
| Home / App list | `/` | Search, filters (status, cohort), app cards with progress and labels |
| App detail | `/apps/{id}` | App info, links, feedback guide, progress, tester table, build log, check-ins |
| Add / edit app | `/apps/new`, `/apps/{id}/edit` | Form, feedback guide, Google Group confirmation, build log entry |
| Cohort list | `/cohorts` | Active, forming and closed cohorts |
| Cohort detail | `/cohorts/{id}` | Members, schedule and day counter, obligation matrix, WhatsApp button (members only) |
| Member profile | `/u/{id}` | Reciprocity numbers, apps created, apps testing, cohort history |
| Tugas saya | `/me` | Obligations, to-do list, apps created and testing, email digest toggle |
| Admin | `/admin` | Cohort management (form, start, reassign, close, settle), WhatsApp reminder panel and pinned-message template, moderation (restore apps, edit tester entries) |
| About / How it works | `/about` | Community rules, cohort explanation, step-by-step guide (join group → opt in → use → feedback on Play → check-ins), Google Group link |

## 11. Tech Stack

Supersedes the v1 Firebase stack (moved 31 October 2026 because Firebase's Blaze plan requires a credit card; the owner has none).

| Layer | Choice |
|---|---|
| Frontend | React + Vite, Tailwind CSS (UI unchanged by the migration) |
| Auth | Supabase Auth, Google provider (redirect flow) |
| Database | Supabase Postgres, free plan, region `ap-southeast-1` (Singapore) |
| Server logic | Postgres functions (RPC) + Row Level Security; computed views for counters |
| Scheduled jobs | `pg_cron` (Supabase Cron) |
| Email | One Edge Function, `send-reminders`, sending through Gmail SMTP |
| Hosting | Cloudflare Pages (free), `_redirects` with `/* /index.html 200` for SPA routes |
| Client SDK | `@supabase/supabase-js` |

### 11.1 Email reminders
- Postgres can't speak SMTP (`pg_net` only makes HTTP calls), so sending is the one job that needs an Edge Function. Everything else stays in SQL.
- **Flow:** `pg_cron` runs daily at 12:00 UTC (19:00 WIB) → `pg_net` POSTs to the `send-reminders` Edge Function with a shared secret (JWT verification off for this function; the secret is checked instead and stored in Supabase Vault / function secrets) → the function calls `due_reminders()` (executable only by the service role), builds one digest per member, sends it, and writes `reminder_log`.
- **SMTP:** Gmail, from a dedicated community account (e.g. `tesbarengindonesia@gmail.com`) with 2-Step Verification and an **App Password**. Use `smtp.gmail.com` on **port 465** (implicit TLS): Supabase Edge Functions block outgoing connections on ports 25 and 587.
- **Volume:** Gmail accounts have a daily sending cap (around 500 recipients a day for a personal account). The one-digest-per-member rule keeps TesBareng far below it.
- No custom domain is needed. Deliverability is weaker than a dedicated email service, so the About page asks members to add the sender to their contacts.
- **Local dev:** point SMTP at the local mail catcher that `supabase start` runs; never send real email from local.

### 11.2 Free-plan limits that matter
- The project **pauses after 7 days of inactivity**; when paused, cron and reminders stop. Restore from the dashboard. Don't rely on cron as a keep-alive.
- **No automatic backups** on the free plan; the admin exports the database manually after each cohort closes.
- 200 concurrent Realtime connections (hence Realtime only on app detail).
- 500 MB database (ample for this data).
- Edge Functions: 2 s CPU time per request (SMTP waiting doesn't count as CPU).

### 11.3 Local development
- `supabase init` / `supabase start` (Docker), migrations in `supabase/migrations/*.sql`.
- Root scripts: `db:start`, `db:reset`, `seed`, `test`.
- Seed: same sample data as before (36 members, 14 apps + 1 deleted, 116 tester entries, 26 builds, admin Yusuf Hidayat), plus one active cohort with assignments and check-ins. Auth users are created through the admin API so profiles go through the real trigger. Never seed a remote project.
- Tests (Vitest + supabase-js, or pgTAP): masking, constraints, view maths (13 vs 14 days, Left-before-14, Removed, deleted apps), every permission (all direct table writes denied, full email unreadable), every RPC with each error code and rate limit, assignment generation (full mesh at N = 13–16, ring k = 14 at N > 16, every app receives exactly k), and reminder selection.

### 11.4 Manual setup by the owner (later)
1. Create the Supabase project in `ap-southeast-1`.
2. Create a Google OAuth client; add Supabase callback and Cloudflare Pages URLs as redirect URIs.
3. Disable the email/password provider in production.
4. Set the admin role in SQL.
5. Create the Gmail community account, enable 2-Step Verification, generate an App Password, and store it as an Edge Function secret.
6. Enable `pg_cron` and `pg_net`; schedule the daily job.
7. Create the Cloudflare Pages project with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## 12. Non-functional Requirements

- Mobile-first responsive design (members open opt-in links on phones).
- App detail page loads under 2 seconds on 4G.
- UI language: Bahasa Indonesia primary, English optional. Dates in `id-ID` format; times in WIB.
- Rate limits: 5 apps per user per rolling 24 h; 10 builds per app per rolling 24 h; check-ins limited by uniqueness.
- Report the main JS bundle size after the migration (274 KB gzip with Firebase).

## 13. UI Design Guidelines (Anti-AI-Slop)

TesBareng must not look like a generic AI-generated template. All UI work uses **Taste Skill** (`design-taste-frontend`, MIT license): https://github.com/Leonxlnx/taste-skill

### 13.1 Setup
- Install for coding agents: `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"`
- Claude Code alternative: `/plugin marketplace add Leonxlnx/taste-skill` then `/plugin install taste-skill@taste-skill`
- Requirements: Node 22+ and an installed Chrome, Edge or Chromium.

### 13.2 Which route applies

| Screen | Type | Route |
|---|---|---|
| About / How it works | Page (read and scrolled) | Standard page run |
| App list, app detail, tester table, build log, cohort list and detail (matrix), member profile, Tugas saya, admin, forms | App screen (worked in) | App-screen route (`draw.mjs --app`, `inspect.mjs --app`) |

The app style is already dealt (`.taste-skill/app`, accent ladder) and the About style in `.taste-skill/about`. New screens reuse them; do not re-deal a style.

### 13.3 Design requirements
- **DR-1** The visual concept comes from the subject (community testing together, the shared spreadsheet, Indonesian developer culture), not a default template.
- **DR-2** Avoid known slop patterns: centred hero over a row of icon cards, soft gradients and glows, icons in tinted squares, rainbow charts, invented vanity numbers.
- **DR-3** Colour is spent on data: progress bars, tester status, feedback state, check-in state, matrix cells, and the "Belum tes" label.
- **DR-4** Tables, the matrix and figures are aligned (tabular numerals).
- **DR-5** On mobile, navigation folds away; the tester table and obligation matrix stay readable (horizontal scroll with a sticky first column).
- **DR-6** Any photographs come from open collections and are credited.

### 13.4 Acceptance
- Every page and app screen passes the skill's `inspect` check at mobile, tablet and desktop, with 0 FAIL and no new WARN compared with the previous build.
- Each new screen goes through at least one screenshot review-and-fix round.

## 14. Suggested Additions

1. **12/14 progress tracking** — included.
2. **Opt-in checklist** — included.
3. **Eligible tester highlighting** — included.
4. **Reciprocity score** — included (§6.7).
5. **Cohorts with ring assignment** — included (§6.9).
6. **Milestone check-ins and reminders** — included (§6.10, §6.11).
7. **Optional daily check-in (Phase 2).** One-tap "used today" for members who want a stronger engagement record.
8. **Web push notifications (Phase 2).** Works well on Android; on iPhone only after installing the PWA to the home screen.
9. **Export tester list to CSV (Phase 2)** for the creator's records.
10. **Cohort retrospective (Phase 3).** After close, show which apps reached production and how long it took.

## 15. Success Metrics

- Apps reaching "Ready to apply" (≥12 eligible testers), and median days to get there.
- Cohort completion rate: share of apps in a cohort that reach "Ready to apply" by close.
- Share of members closing a cohort in Good standing.
- Average apps tested per member (reciprocity health).
- Share of eligible testers with feedback sent and verified on Play.
- Builds logged per app during testing; creator reply rate.
- Tester drop-off before day 14.

## 16. Milestones

| Phase | Scope |
|---|---|
| **MVP** | Supabase migration (schema, views, RPC, RLS, tests), Google login, apps, tester registration with checklist, masked tester table, 12/14 progress, engagement tracking, feedback guide, build log, reciprocity score and profile, Tugas saya, cohorts with assignment and obligation matrix, milestone check-ins, daily email digest, admin panel (cohorts, WhatsApp reminder text, moderation), WhatsApp link per cohort |
| **Phase 2** | Optional daily check-in, web push, CSV export |
| **Phase 3** | iOS / TestFlight support, cohort retrospective, public stats page |

## 17. Open Questions

1. Should there be a cap on apps per creator overall? (Within a cohort it is one app per member.)
2. Should creators see full emails of their own testers to cross-check with Play Console, or is masked-only acceptable?
3. Should Left/Removed testers stay visible in the public table or collapse into a history section?
4. Should the 3-build target be a community rule, or just a guideline shown in progress?
5. Should creators who leave verified feedback unreplied for a long time be flagged publicly?
6. Is Day 21 the right hard close for a cohort, or should it stay open until every app is ready?
7. Should a member with two apps be allowed to bring both into one cohort (testing twice as many apps in return)?
8. Who besides the owner may act as admin for running cohorts?
