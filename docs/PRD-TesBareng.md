# PRD — TesBareng

|  |  |
| --- | --- |
| **Product** | TesBareng ("test together") |
| **Version** | 2.4 |
| **Status** | Draft |
| **Last updated** | 5 November 2026 |
| **Owner** | Community Admin |
| **Community group** | `google-tester-indonesia@googlegroups.com` |
| **Stack** | Supabase (free plan) + Vercel |

---

## Changelog

**v2.4 — 5 November 2026** — ADR-012 accepted 5 November 2026

- **Tester slots** (§5.1, FR-4, FR-15–FR-18, FR-26): the creator says how many testers (1–12, default 12) the app needs from TesBareng; the rest come from their other Google Groups or lists, self-reported. Progress and Ready to apply use that number. A full app stays joinable.
- **Cohorts: give what you take** (§5.6, FR-32, FR-33): each app's cohort demand is kᵢ = min(slots + 2, N − 1); its creator tests exactly kᵢ apps and the app receives exactly kᵢ creator testers. All-12 cohorts keep the ADR-007 ring.

**v2.3 — 4 November 2026** — ADR-011 accepted 5 November 2026

- **Email-list testing** (§5.1, §5.2a, FR-14a–FR-14e): an app whose closed track uses a Play Console email list (which cannot be combined with Google Groups) can take community testers. The tester consents to share their Google-account email with that app's creator only; the creator pastes it into Play Console and marks it added. Cohort deadlines for these apps start when the creator marks the tester added.

**v2.2 — 2 November 2026**

- **Cohorts and open pool become one system** (§5.8, §6.9): cohort members are either **Creators** (bring an app) or **Pure testers** (no app). Pure testers join a cohort themselves, from Forming until Day 7.
- **Badges** (§6.7): one badge system for everyone, based on apps tested to 14+ days: Bronze ≥ 3, Silver ≥ 7, Gold ≥ 14, Platinum ≥ 25.
- **Public member profile** expanded into its own section (§6.13).

**v2.1 — 2 November 2026**

- **Design ambition: Awwwards-level** (§13.0). The site targets an Awwwards Honorable Mention at minimum and Site of the Day as the goal, scored against Awwwards' own rubric. New design pass phase after the Supabase migration (§16).

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
| --- | --- |
| **Visitor** | Not logged in. Can browse apps, progress, tester lists (masked), engagement status, cohorts and profiles. Read-only. |
| **Member** | Logged in with Google. Can create apps and register as a tester. |
| **Creator** | A member who owns an app. Full edit rights on that app and its tester list. |
| **Tester** | A member registered on a specific app. Updates their own engagement checklist and check-ins on that app. |
| **Cohort member** | A member in a cohort, as a **Creator** (brings an app, receives and gives testing) or a **Pure tester** (no app, only gives testing). Has assigned apps to test and sees the cohort's WhatsApp link. |
| **Admin** | Community owner. Forms and runs cohorts, sends WhatsApp reminders, moderates any app, tester entry or feedback summary. Role is set only in SQL by the owner. |

A single user can be a Creator of their own app(s), a Tester of other apps and a Cohort member at the same time.

## 5. Core User Flows

### 5.1 Create an app (Creator)

1. Log in with Google.
2. Click **Add App**.
3. Fill in: app name, short description, Play Store opt-in link, optional Play Store listing link, optional package name, a **feedback guide** (§6.5), and how many testers the app needs from TesBareng (1–12, default 12; FR-4).
4. Choose how testers are added in Play Console (a closed track takes Google Groups **or** email lists, not both):
   - **Google Group** (default): confirm "I have added `google-tester-indonesia@googlegroups.com` as the tester list in my closed testing track."
   - **Email list**: no confirmation; testers ask to be added (§5.2a).
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

### 5.2a Register as a tester on an email-list app (Member)

1. Open the app page and click **Gabung sebagai tester**. The dialog explains the app uses an email list.
2. **Ask to be added:** tick "I agree the creator of this app sees my full Google-account email" and send. The dialog shows the address and asks the member to make sure it is the account used on Play.
3. **Wait:** the creator copies the address on their app page, pastes it into Play Console, and marks it **Sudah ditambahkan**. The member can withdraw at any time.
4. **Opt in:** once marked, the checklist is "opened the opt-in link" and "installed" (no group step). Confirm as in §5.2 step 5.

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

1. **Form:** create a cohort (e.g. "Cohort #3") and add creators, each with the app they bring. Pure testers join on their own (§5.8). A cohort needs at least **13 apps**, so even an app that needs all 12 testers can receive them from creators alone; pure testers add buffer on top. Each creator tests as many apps as their own app receives (FR-32).
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

### 5.8 Join a cohort as a pure tester (Member)

For members without an app, or between their own apps, who want to help and earn a badge.

1. Log in and open a cohort that is Forming, or Active up to Day 7.
2. Click **Gabung sebagai tester (Join as tester)**. The page explains the obligations: opt in to the assigned apps within 48 hours, check in at each milestone, send feedback on Play.
3. Confirm. If the cohort is already Active, the member is assigned apps immediately (§6.9, FR-33) and their own 48-hour opt-in window starts now.
4. From here the journey is the same as §5.7. Every assigned app taken to 14+ days counts toward the member's badge (§6.7).

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
  - Tester slots (required, 1–12, default 12): how many testers the app needs from TesBareng ("Butuh berapa tester dari TesBareng?"). Google needs 12 in total; the rest come from the creator's other groups or lists. Self-reported, not checked. Editable at any time (ADR-012).
- **FR-5** Only the creator (and Admin) can edit or delete an app.
- **FR-6** A member may create multiple apps, max 5 per rolling 24 hours.
- **FR-7** Deleting an app soft-deletes it (hidden from lists, data retained). Only the admin can restore.

### 6.3 Tester list (the "shared spreadsheet")

- **FR-8** Each app page displays its tester list as a table:

  | # | Name | Email (masked) | Opted in since | Days active | Status | Feedback on Play | Creator replied | Check-ins |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |

  "Feedback on Play" shows: — (not yet), ✓ Sent (self-reported), ✓✓ Verified (confirmed by creator). "Check-ins" shows the milestones completed (§6.10).
- **FR-9** Emails are always shown masked to everyone, including the creator (§8).
- **FR-10** "Days active" = days between `opted_in_at` and today (or `left_at` if Left), computed on the client.
- **FR-11** A tester with **≥14 days active and status Active** is highlighted as **Eligible**.
- **FR-12** A member cannot hold two entries on the same app. Re-joining after Left re-activates the entry with a new `opted_in_at` and clears its check-ins, since the 14-day count restarts (owner decision 3 Nov 2026). Removed testers cannot re-join.
- **FR-13** A creator cannot register as a tester on their own app.
- **FR-14** The table is sortable by name, opt-in date and days active.

**Email-list apps** (ADR-011):

- **FR-14a** Each app has a tester method, **Google Group** (default) or **Email list**, chosen on the app form and editable later.
- **FR-14b** On an email-list app, a member asks to be added with explicit consent that the app's creator sees their full Google-account email. Not on own app; not when Removed. Asking twice is harmless.
- **FR-14c** Only the creator of that app (not the admin) sees the full addresses, with copy-all for Play Console, and marks each **Sudah ditambahkan** (creator or admin; can be undone). Members who withdrew, left or were removed are no longer shown.
- **FR-14d** A member registers on an email-list app only after being marked added; the checklist drops the group step.
- **FR-14e** In a cohort, an assignment on an email-list app counts its milestones from the time the tester was marked added, provided they asked within the 48 h opt-in window; until marked, nothing is due. Asking late keeps the normal deadline.

### 6.4 Progress indicators (per app)

- **FR-15** Active testers: `X / slots` with progress bar. No "Kurang N" chip — the count already conveys how many seats remain. A full app still accepts testers, as a buffer against drop-outs; the detail page says "kursi penuh".
- **FR-16** Eligible testers (Active and ≥14 days): `Y / slots` with progress bar. An app with fewer than 12 slots shows "Target TesBareng: S tester. Sisanya (12 − S) dari luar komunitas, dilaporkan sendiri oleh kreator." on its detail page.
- **FR-17** Days since test start: `Z / 14` (if test start date is set).
- **FR-17a** Feedback: active testers with feedback sent / verified, e.g. `9 sent · 7 verified`.
- **FR-17b** Builds shipped during test: `N / 3` (a guideline, not a Google rule).
- **FR-17c** Replies: testers replied to / testers with feedback.
- **FR-18** A "Ready to apply" badge ("Siap ajukan") when eligible testers ≥ the app's tester slots (ADR-012). A softer "Low engagement" hint shows if fewer than half of eligible testers have sent feedback, or no build has been logged.
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
- **FR-26** Default sort: apps needing testers most (most open seats first, open seats = slots − active). A "Hampir penuh" sort shows the fewest open seats first, full apps last.

### 6.7 Reciprocity score

- **FR-27a** Each member has two public numbers instead of one opaque score:
  - **Testing:** apps where they are Active, or Left after 14+ days. Removed entries, Left before 14 days, and entries on deleted apps do not count.
  - **Feedback:** apps where their feedback is marked Sent (Verified shown separately); Removed entries do not count.
- **FR-27b** App cards and the app page show the creator's numbers, e.g. "Creator: testing 8 apps · feedback on 6 (5 verified)".
- **FR-27c** The app list can be sorted by **Creator most active**.
- **FR-27d** Tugas saya shows the member's own numbers, with a nudge when Testing is below the number of apps they have listed.
- **FR-27e** Numbers are computed by database views; nobody can edit them.
- **FR-27f** The full public profile is specified in §6.13.

**Badges.** One badge system for everyone, creators and pure testers alike.

- **FR-27g** The badge is based on **apps tested**: tester entries that reached **14+ days active** (Active with 14+ days, or Left after 14+ days). Removed entries and entries on deleted apps never count. This is stricter than the Testing number in FR-27a, so joining many apps without staying cannot raise a badge.
- **FR-27h** Tiers:

  | Badge | Apps tested |
  | --- | --- |
  | — (no badge yet) | 0–2 |
  | Bronze | 3–6 |
  | Silver | 7–13 |
  | Gold | 14–24 |
  | Platinum | 25+ |
- **FR-27i** Cohort and open-pool testing both count. A pure tester who completes one full cohort (14 apps) reaches Gold.
- **FR-27j** The badge appears on the member profile, beside the member's name in tester tables and the cohort matrix, and on app cards next to the creator's numbers.
- **FR-27k** Tugas saya shows progress to the next tier, e.g. "5 / 7 apps menuju Silver".
- **FR-27l** The badge is computed from current data by a view, never stored, and nobody can edit it. Feedback-based badges are a later idea (§14).

### 6.8 Tugas saya (My Testing)

- **FR-28** Logged-in users see: apps I created, apps I'm testing (days active, feedback status, check-ins), my reciprocity numbers, and a **to-do list** ordered by urgency: assigned apps not yet joined, check-ins due, feedback owed, new builds to test. During a cohort, the top of the page shows obligations, e.g. "9/14 opt-in · 6/14 sudah buka app · 4/14 feedback".

### 6.9 Cohorts and assignment

- **FR-29** Admin creates a cohort with a name. Cohort status: **Forming → Active → Closed**.
- **FR-30** While Forming, the admin adds creators, each with one app they own (one app per member per cohort). An app can be in only one non-closed cohort at a time. Pure testers add themselves (FR-33a).
- **FR-31** Starting a cohort requires at least 13 apps and sets Day 0 to the start time.
- **FR-32** **Assignment rule (give what you take, ADR-012 amending ADR-007).** Members with apps are shuffled into a random order. With N apps, app *i* gets a cohort demand **kᵢ = min(slotsᵢ + 2, N − 1)**, fixed at Day 0. Its creator tests exactly kᵢ apps, and the app receives exactly kᵢ assigned creator testers; never their own app, never twice.
  - **All kᵢ equal → ring:** the member at position *i* tests the apps at positions *i+1 … i+k* (wrapping around). With every app at 12 slots this is k = 14, or N − 1 when N ≤ 15.
  - **Mixed kᵢ:** a degree-balanced assignment (ADR-012 §5). If no assignment exists for the given kᵢ, the smallest kᵢ is raised by one, repeatedly, until one does; every app still gets at least its demand.
  - Changing an app's slots after Day 0 does not move assignments; it changes only its progress target and Ready-to-apply state.
- **FR-33** Pure testers are each assigned 14 apps (or all apps if fewer), chosen to even out coverage: apps with the lowest coverage relative to their demand kᵢ first. Pure testers present at Day 0 are assigned when the cohort starts; later joiners are assigned at the moment they join.
- **FR-33a** A member can join a cohort as a pure tester while it is Forming or Active up to Day 7, if they are not already in it and not Owing. Day 7 is the last join day so a pure tester can still reach 14 days before the Day 21 close. A pure tester may leave the cohort themselves only while it is Forming (owner decision 3 Nov 2026); after Day 0 only the admin moves their slots (FR-36).
- **FR-33b** A pure tester's opt-in deadline is 48 hours from their own assignment time, not from Day 0. All later milestones (FR-42) use the same offset.
- **FR-34** An assignment is **fulfilled** when the assigned member has an Active tester entry on that app. Joining uses the normal flow (§5.2).
- **FR-35** **Opt-in deadline:** 48 hours after Day 0. After the deadline, a member with unfulfilled assignments shows as **Behind**, and their own app shows a public **"Belum tes"** label until fulfilled.
- **FR-36** **Slot reassignment:** the admin can move an unfulfilled assignment to another cohort member who has fulfilled all their own assignments. The original assignment is marked Reassigned.
- **FR-37** **Closing:** the admin closes a cohort when every app is Ready to apply, or at Day 21 at the latest (hard close, §17 Q6). At close, each member's standing is set to **Good** (all obligations met) or **Owing**. Only milestones whose due time is at or before the close count: a slot reassigned late, whose 14 days cannot end by Day 21, does not make the member Owing. Owing members cannot be added to a new cohort until the admin marks them **Settled**. Tester entries outlive the cohort: testers still opted in keep counting toward the app's progress, and an app that is not ready can join a later cohort.
- **FR-38** **Cohort page** shows the members, the WhatsApp button (members only, §6.12), the schedule with today's day number, and an **obligation matrix**: rows are members, columns are apps, cells show not joined / left / opted in / used / feedback sent / feedback verified, or reassigned. Unassigned cells are greyed out.
- **FR-38a** Cohorts and the open pool are one system. Any member can still join any app freely, including apps not in a cohort; that testing counts toward reciprocity and badges but not toward cohort obligations. Pure testers who want structure and a faster badge join a cohort (§5.8).

### 6.10 Milestone check-ins (attendance)

Daily attendance on 14 apps would mean 14 taps per person per day and invites careless clicking. Attendance is per milestone instead:

| Milestone | When | Tester action | Creator action |
| --- | --- | --- | --- |
| Opt-in | Day 0–2 | Register as tester (§5.2) | — |
| Used the app | From Day 5, due Day 7 | Check in "Sudah buka app" + send feedback on Play | Mark Verified |
| New build | Within 3 days of each build | Check in "Sudah update" | Log the build |
| Still opted in | From Day 12, due Day 13 | Check in "Masih opt-in" | — |

- **Due times** (owner decision 3 Nov 2026): "due Day N" means due at the assignment's base time + N × 24 h (opt-in + 48 h, used app and feedback + 7 days, still opted in + 13 days, each new build + 72 h after it is logged). The base time is Day 0, or the assignment time for late pure testers (FR-33b) and reassigned slots. The "Sudah update" check-in counts toward Behind and Owing like the other milestones.
- **FR-39** Check-ins are available to Active testers on their own entry, cohort or open pool, each kind at most once per entry (per build for "Sudah update").
- **FR-40** Check-in windows outside a cohort are relative to the tester's own `opted_in_at`.
- **FR-41** Verified feedback is the strongest signal because the creator can confirm it in Play Console. Opt-in, usage and update check-ins are honesty-based, and the UI says so.
- **FR-42** A member is **Behind** in a cohort when any milestone past its due day is unmet on an assigned app. Behind members are visible in the matrix and in the admin reminder panel.
- **FR-43** Optional daily check-in remains a Phase 2 idea (§14).

### 6.11 Reminders

- **FR-44** **Email digest:** once a day at 19:00 WIB, each member with pending to-dos receives one email listing all of them (assigned apps not joined, check-ins due, feedback owed, new builds). Max one email per member per day.
- **FR-45** Digest triggers:

  | Cohort day | Content |
  | --- | --- |
  | Day 1 | Assigned apps not yet joined |
  | Day 2 | Opt-in deadline; "Belum tes" label goes live after it |
  | Day 5 | Feedback not sent yet |
  | Day 7 | Used-app check-in and feedback checkpoint |
  | Day 13 | Still-opted-in check-in |
  | Any day | New builds logged in the last 24 hours on apps the member tests |

  Creators also get: unreplied verified feedback older than 3 days, and "Your app reached 12 eligible testers".
- **FR-46** Members can turn digest emails off in Tugas saya (on by default). Every email links to that setting.
- **FR-47** Each sent reminder is logged; the same reminder is never sent twice to the same member on the same day.
- **FR-48** **WhatsApp reminder panel (admin):** for each active cohort, lists Behind members by display name and milestone, with a ready-to-copy Indonesian message mentioning them, e.g. "Halo @Budi @Sari, deadline opt-in Cohort #3 hari ini jam 19.00. Cek tugasmu di TesBareng: ". The admin pastes it into the cohort group manually.

### 6.12 WhatsApp sub-group per cohort

- **FR-49** Each cohort can have one WhatsApp sub-group link (under the admin's WhatsApp Community), set by the admin.
- **FR-50** The link is visible only to logged-in members of that cohort and the admin.
- **FR-51** Before showing the link the first time, the UI notes that group members can see each other's phone numbers, and joining is optional. The Google Group remains the only mandatory group because Play Console needs it.
- **FR-52** The admin panel provides a pinned-message template: schedule (Day 0, 2, 7, 13), link to the cohort page, and group rules ("chat for coordination; status is reported on TesBareng, not in chat").
- **FR-53** When a cohort closes, the page reminds the admin to archive the WhatsApp group.

### 6.13 Member profile (public)

- **FR-54** Every member has a public profile at `/u/{id}`, viewable by anyone, including visitors who are not logged in.
- **FR-55** The profile shows:
  - Photo, display name, member since, and role labels earned (Creator if they have listed an app; Tester if they have tested any app).
  - **Badge** with apps-tested count and progress to the next tier.
  - Reciprocity numbers: Testing, apps tested (14+ days), Feedback sent (Verified).
  - **Apps created:** name, status, active and eligible tester counts, linking to the app page.
  - **Apps testing:** name, days active, status, feedback state.
  - **Cohort history:** cohort name, role (Creator or Pure tester), assignments fulfilled, and standing (Good / Owing / Settled).
- **FR-56** The profile never shows an email, masked or full, or any WhatsApp link.
- **FR-57** The owner sees an **Edit** link to Tugas saya settings (email digest) on their own profile. Name and photo come from the Google account and update on sign-in.
- **FR-58** Each profile has its own page title, meta description and Open Graph image showing name and badge, so it looks good when shared in WhatsApp.

## 7. Permissions Matrix

| Action | Visitor | Member | Tester (on app) | Creator (own app) | Admin |
| --- | --- | --- | --- | --- | --- |
| View apps, progress, tester lists, engagement, builds, profiles, cohorts, matrix | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create app | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit / soft-delete app | ❌ | ❌ | ❌ | ✅ | ✅ |
| Restore deleted app | ❌ | ❌ | ❌ | ❌ | ✅ |
| Register as tester | ❌ | ✅ | — | ❌ (own app) | ✅ |
| Leave testing | ❌ | ❌ | ✅ | — | ✅ |
| Add manual tester / edit tester status, date, note | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ask to be added / withdraw on an email-list app (own request) | ❌ | ✅ | ✅ | ❌ (own app) | ✅ |
| See full emails of members who asked (email-list app) | ❌ | ❌ | ❌ | ✅ | ❌ |
| Mark a request as added in Play Console | ❌ | ❌ | ❌ | ✅ | ✅ |
| Tick "Feedback sent" + summary (own entry) | ❌ | ❌ | ✅ | ❌ | ✅ (moderation) |
| Join a cohort as pure tester (Forming, or Active ≤ Day 7) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Leave a cohort as pure tester (Forming only) | ❌ | ✅ | ✅ | ✅ | ✅ |
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
| --- | --- |
| `budi.santoso@gmail.com` | `bu*****@gmail.com` |
| `ab@gmail.com` | `ab*****@gmail.com` |
| `a@company.co.id` | `a*****@company.co.id` |

### 8.2 Where the full email lives

- The full email is **never stored in a public table or view**. Postgres RLS works per row, not per column, so any column in a readable table is readable by anyone.
- The full email is read from `auth.users` only inside `security definer` functions (for masking) and by the reminder Edge Function using the service role (for sending).
- Manually added testers: the email is masked inside the RPC and the original is discarded.
- Creators don't need full emails because testers are managed through the shared Google Group in Play Console.
- **Exception (ADR-011):** on an email-list app, the creator sees the full Google-account email of members who consented, read live from `auth.users` by `app_email_listings()`. No table stores it; withdrawing, leaving or being removed hides it again.

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
  tester_slots smallint default 12 (1–12),
  status ('recruiting' | 'testing' | 'applied' | 'live'),
  group_confirmed bool, tester_method ('google_group' | 'email_list'),
  deleted bool default false, created_at, updated_at

email_listings                -- public read; no email column (ADR-011)
  app_id → apps, user_id → profiles, requested_at, listed_at?
  pk (app_id, user_id)

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
  cohort_id → cohorts, user_id → profiles, app_id uuid null → apps (null = pure tester),
  assigned_at?,                -- when this member's assignments were generated (FR-33b)
  ring_position int?, demand smallint?,  -- kᵢ fixed at Day 0 (ADR-012); null for pure testers
  standing ('good' | 'owing' | 'settled')?, settled_at?, joined_at
  pk (cohort_id, user_id)

assignments                   -- public read
  id uuid pk, cohort_id → cohorts, tester_user_id → profiles, app_id → apps,
  assigned_at,                 -- base time for this assignment's deadlines
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
- **`profile_stats`** — per user: `apps_created_count`, `testing_count` (Active, or Left with `left_at - opted_in_at >= 14 days`; never Removed; never on deleted apps), `apps_tested_count` (entries that reached 14+ days active: Active with `now() - opted_in_at >= 14 days`, or Left with `left_at - opted_in_at >= 14 days`; never Removed; never on deleted apps), `badge_tier` (`none` | `bronze` | `silver` | `gold` | `platinum`, from `apps_tested_count` per FR-27h), `next_tier_at`, `feedback_sent_count`, `feedback_verified_count` (status ≠ removed).
- **`cohort_assignment_status`** — per assignment: fulfilled, check-in times, feedback flags, builds due/updated, the matrix `cell` state, `behind_on` (milestones due and unmet) and `is_behind`. Drives the obligation matrix; `cohort_obligations` aggregates it. Exact columns: `docs/contract.md`.
- **`cohort_obligations`** — per cohort member: assigned count, opted-in count, used-app count, feedback sent/verified counts, latest-build-updated count, still-opted-in count, `is_behind` (per FR-42), and `owes_opt_in` (drives the "Belum tes" label).

Days active per tester stays a client calculation.

### 9.3 Writes go through RPC only

`insert`, `update` and `delete` are revoked on every table for `anon` and `authenticated`. All writes are `security definer` Postgres functions with `set search_path = ''` and fully qualified names. Admin checks use an `is_admin()` helper reading `profiles.role`; no client-callable function can change a role.

| RPC | Who | Must keep |
| --- | --- | --- |
| `ensure_profile()` | Signed-in user | Refresh name/photo from Google identity; mask email server-side |
| `create_app(..., p_tester_slots)` | Member | FR-4 validation; slots 1–12; `group_confirmed` true; unique non-deleted package name; 5 per rolling 24 h |
| `update_app(app_id, ..., p_tester_slots)` | Creator, admin | Editable fields only; slots 1–12; package uniqueness |
| `delete_app(app_id)` / `restore_app(app_id)` | Creator, admin / admin, or creator within 10 min | Soft delete; creator undo window 10 min (ADR-009 §7), then admin only |
| `request_email_listing(app_id, consent)` / `cancel_email_listing(app_id)` | Member | Consent true; email-list app; not own app; not Removed |
| `app_email_listings(app_id)` | Creator only | Full emails of members who asked and did not withdraw, leave or get removed |
| `mark_email_listed(app_id, user_id, listed)` | Creator, admin | Sets or clears `listed_at` |
| `join_as_tester(app_id, checklist)` | Member | All 3 checklist items (email-list app: opt-in + installed, and a listed request); not own app; Active → already exists; Removed → denied; Left → re-activate with new `opted_in_at`, clear `left_at` and the entry's check-ins |
| `leave_testing(app_id)` | Tester | Own Active entry only |
| `mark_feedback_sent(app_id, sent, summary)` | Tester | Own Active entry; trim; empty → null; `sent = false` clears all three fields |
| `add_manual_tester(app_id, display_name, email, opted_in_at)` | Creator, admin | Mask and discard the email |
| `update_tester(tester_id, ...)` | Creator, admin | Status, `opted_in_at` (not future), `left_at`, note, verified, replied; admin also feedback fields (moderation) |
| `add_build(app_id, version_name, uploaded_at, changelog)` | Creator, admin | 10 per app per rolling 24 h |
| `check_in(app_id, kind, build_id?)` | Tester | Own Active entry; window rules (§6.10); once per kind (per build) |
| `set_email_reminders(enabled)` | Signed-in user | Own profile only |
| `create_cohort(name)` | Admin |  |
| `join_cohort_as_tester(cohort_id)` | Member | Cohort Forming, or Active and ≤ Day 7; not already a member; not Owing; if Active, assign 14 apps by lowest coverage and set `assigned_at` |
| `add_cohort_member(cohort_id, user_id, app_id?)` | Admin | Cohort Forming; app owned by user and not in another open cohort; user not Owing |
| `remove_cohort_member(cohort_id, user_id)` | Admin | Cohort Forming only |
| `leave_cohort(cohort_id)` | Pure tester | Own membership, no app in the cohort; cohort Forming only |
| `start_cohort(cohort_id)` | Admin | ≥ 13 apps; shuffle; set each `demand`; generate assignments per FR-32/33; set `day0_at` |
| `reassign_slot(assignment_id, to_user_id)` | Admin | Target is a cohort member with all assignments fulfilled |
| `close_cohort(cohort_id)` | Admin | Ready = eligible ≥ `tester_slots`; set standings from `cohort_obligations` |
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
| --- | --- | --- |
| Landing (story surface) | `/` | Story page with the cohort ring signature moment (ADR-001 §4, ADR-008 option A) |
| App list | `/apps` | Search, filters (status, cohort), app cards with progress and labels |
| App detail | `/apps/{id}` | App info, links, feedback guide, progress, tester table, build log, check-ins |
| Add / edit app | `/apps/new`, `/apps/{id}/edit` | Form, feedback guide, Google Group confirmation, build log entry |
| Cohort list | `/cohorts` | Active, forming and closed cohorts |
| Cohort detail | `/cohorts/{id}` | Members (creators and pure testers, with badges), schedule and day counter, obligation matrix, "Gabung sebagai tester" button (until Day 7), WhatsApp button (members only) |
| Member profile | `/u/{id}` | Badge and progress, reciprocity numbers, apps created, apps testing, cohort history (§6.13) |
| Tugas saya | `/me` | Obligations, to-do list, apps created and testing, email digest toggle |
| Admin | `/admin` | Cohort management (form, start, reassign, close, settle), WhatsApp reminder panel and pinned-message template, moderation (restore apps, edit tester entries) |
| About / How it works | `/about` | Community rules, cohort explanation, step-by-step guide (join group → opt in → use → feedback on Play → check-ins), Google Group link |

## 11. Tech Stack

Supersedes the v1 Firebase stack (moved 31 October 2026 because Firebase's Blaze plan requires a credit card; the owner has none).

| Layer | Choice |
| --- | --- |
| Frontend | React + Vite, Tailwind CSS (UI unchanged by the migration) |
| Auth | Supabase Auth, Google provider (redirect flow) |
| Database | Supabase Postgres, free plan, region `ap-southeast-1` (Singapore) |
| Server logic | Postgres functions (RPC) + Row Level Security; computed views for counters |
| Scheduled jobs | `pg_cron` (Supabase Cron) |
| Email | One Edge Function, `send-reminders`, sending through Gmail SMTP |
| Hosting | Vercel (Hobby, free), `web/vercel.json` rewrites all routes to `/index.html` (ADR-003) |
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
2. Create a Google OAuth client; add Supabase callback and Vercel URLs as redirect URIs.
3. Disable the email/password provider in production.
4. Set the admin role in SQL.
5. Create the Gmail community account, enable 2-Step Verification, generate an App Password, and store it as an Edge Function secret.
6. Enable `pg_cron` and `pg_net`; schedule the daily job.
7. Create the Vercel project with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## 12. Non-functional Requirements

- Mobile-first responsive design (members open opt-in links on phones).
- App detail page loads under 2 seconds on 4G.
- UI language: Bahasa Indonesia primary, English optional. Dates in `id-ID` format; times in WIB.
- Rate limits: 5 apps per user per rolling 24 h; 10 builds per app per rolling 24 h; check-ins limited by uniqueness.
- Report the main JS bundle size after the migration (274 KB gzip with Firebase).

## 13. Design Direction and UI Guidelines

### 13.0 Ambition: Awwwards-level

TesBareng aims to be recognised on [Awwwards](https://www.awwwards.com/): **Honorable Mention as the minimum bar, Site of the Day as the goal.** Design work is judged against the jury's own rubric, not taste alone.

**The rubric.** Each submission is scored by at least 18 jurors; the 3 scores furthest from the average are dropped.

| Criterion | Weight | What it means for TesBareng |
| --- | --- | --- |
| Design | 40% | Distinctive typography, deliberate layout and rhythm, a visual system that holds across every screen, from landing to the tester table |
| Usability | 30% | Fast on a mid-range Android over 4G, clear flows (join → check in → feedback), accessible, flawless on mobile |
| Creativity | 20% | One original idea that only this product could have (see signature moment below) |
| Content | 10% | Real copy in Bahasa Indonesia, real community apps and numbers, no placeholder text or stock-grade imagery |

Design and Usability together are 70% of the score. A dazzling site that is slow or confusing does not win, so performance and clarity are design requirements, not afterthoughts.

**Two surfaces, two jobs.**

- **Story surface (the submission piece):** the landing / About page. Expressive: editorial typography, choreographed motion, an interactive signature moment. This is what jurors see first.
- **Work surface:** app list, app detail, cohort matrix, Tugas saya, forms, admin. Restrained and fast, but crafted to the same standard: shared type and colour system, considered micro-interactions, perfect alignment. Jurors click through, so these screens must hold up.

**Creative brief (starting point, not a fixed visual).** The concept should come from the subject: *gotong royong* (Indonesian mutual cooperation) expressed through the community's real mechanics. A strong candidate for the signature moment is the **cohort ring**: on the landing page, members appear as points on a ring and, as the visitor scrolls or taps, the assignment lines draw in until every app is held by 14 others. It explains the product in one interaction and is unique to TesBareng. The shared attendance sheet and the 12/14 countdown are secondary motifs. The design process (§13.1–13.3) may replace this if it finds a stronger idea.

All UI work uses **Taste Skill** (`design-taste-frontend`, MIT license): [https://github.com/Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)

### 13.1 Setup

- Install for coding agents: `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"`
- Claude Code alternative: `/plugin marketplace add Leonxlnx/taste-skill` then `/plugin install taste-skill@taste-skill`
- Requirements: Node 22+ and an installed Chrome, Edge or Chromium.

### 13.2 Which route applies

| Screen | Type | Route |
| --- | --- | --- |
| About / How it works | Page (read and scrolled) | Standard page run |
| App list, app detail, tester table, build log, cohort list and detail (matrix), member profile, Tugas saya, admin, forms | App screen (worked in) | App-screen route (`draw.mjs --app`, `inspect.mjs --app`) |

The app style is already dealt (`.taste-skill/app`, accent ladder) and the About style in `.taste-skill/about`. During the Supabase migration, do not re-deal a style. The design pass (§16) may re-deal the story surface once to meet §13.0; work screens keep their dealt style and are refined, not replaced.

### 13.3 Design requirements

**Concept and visual system**

- **DR-1** The visual concept comes from the subject (gotong royong, the cohort ring, the shared sheet, Indonesian developer culture), not a default template.
- **DR-2** Avoid known slop patterns: centred hero over a row of icon cards, soft gradients and glows, icons in tinted squares, rainbow charts, invented vanity numbers.
- **DR-3** Colour is spent on data: progress bars, tester status, feedback state, check-in state, matrix cells, the "Belum tes" label, and badge tiers. Badges are designed as part of the type and colour system, not as generic medal icons.
- **DR-4** One type system across both surfaces: an expressive display face for the story surface and headings, a highly legible text face for work screens, tabular numerals for every count, day and date. Fonts must render Indonesian text well and be subset to keep weight down.
- **DR-5** A spacing and grid system applied everywhere, so the tester table, the matrix and the landing page feel like one product.

**Motion and interaction**

- **DR-6** Motion explains, it doesn't decorate: the ring drawing assignments, progress bars filling toward 12 and 14, a matrix cell changing state after a check-in, a tester row arriving after joining.
- **DR-7** Animate only `transform` and `opacity`; no layout-thrashing animation. Transitions on work screens stay short (roughly 150–250 ms); the story surface may run longer choreography.
- **DR-8** No scroll hijacking. Native scrolling stays intact; scroll-linked effects layer on top of it.
- **DR-9** `prefers-reduced-motion` is honoured everywhere, with a static but equally clear version of the signature moment.
- **DR-10** Every interactive element has hover, focus, active and disabled states, and every async action has loading, success and error states that read as designed, not default.

**Content**

- **DR-11** Real content only: Bahasa Indonesia copy written for the community, real apps from members (with permission), real cohort numbers. No lorem ipsum anywhere, including empty states.
- **DR-12** Empty, error and first-run states are written and designed as carefully as full states.
- **DR-13** Any photographs come from open collections or the community itself and are credited.

**Mobile and accessibility**

- **DR-14** Mobile is designed first, not shrunk: on phones the tester table and obligation matrix stay readable (horizontal scroll with a sticky first column), touch targets are at least 44 px, and the signature moment works by tap.
- **DR-15** WCAG 2.2 AA: text contrast, visible focus rings, full keyboard use, semantic headings and landmarks, labelled form fields, and the ring and matrix described for screen readers.

**Performance budget** (measured on a mid-range Android over 4G)

- **DR-16** Largest Contentful Paint under 2.5 s, Cumulative Layout Shift under 0.1, Interaction to Next Paint under 200 ms, on every page.
- **DR-17** The story surface loads its motion code only on that page; work screens never pay for it. Prefer CSS and small libraries; heavy 3D or WebGL only if it fits the budget and has a static fallback.
- **DR-18** Images in modern formats with explicit dimensions; fonts preloaded with `font-display: swap` and a metric-matched fallback.

**Technical polish** (jurors also see the Developer Award scores)

- **DR-19** Semantic HTML, page titles and meta description per route, Open Graph images for app and cohort pages, a favicon set, and a designed 404 page.

### 13.4 Acceptance

- Every page and app screen passes the skill's `inspect` check at mobile, tablet and desktop, with 0 FAIL and no new WARN compared with the previous build.
- Each screen goes through at least one screenshot review-and-fix round.
- Lighthouse on mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95 on landing, app list, app detail and cohort detail.
- Core Web Vitals within DR-16 on a real mid-range Android device, not only in emulation.
- Reduced-motion and keyboard-only walkthroughs of the full flow (sign in → join → check in → mark feedback) pass.
- **Pre-submission review:** at least three designers outside the project score the live site on the four Awwwards criteria. Submit only when every criterion averages 8/10 or higher; otherwise fix the weakest criterion first.

### 13.5 Awwwards submission

- Submit the live production site, with real content and an active cohort, after the design pass and acceptance above.
- Submission is paid; budget the fee before the design pass ends.
- Prepare: a short project description in English, credits (design, development, community), and screenshots or a short video of the signature moment.

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
11. **Badges v2 (Phase 2).** Add verified feedback to the badge rule (e.g. a tier also requires feedback verified on half the apps tested), and special badges such as "Completed a cohort in Good standing".

## 15. Success Metrics

- Apps reaching "Ready to apply" (≥12 eligible testers), and median days to get there.
- Cohort completion rate: share of apps in a cohort that reach "Ready to apply" by close.
- Share of members closing a cohort in Good standing.
- Average apps tested per member (reciprocity health).
- Pure testers per cohort, and how many complete a cohort in Good standing.
- Badge distribution across members, and time from first join to Bronze.
- Share of eligible testers with feedback sent and verified on Play.
- Builds logged per app during testing; creator reply rate.
- Tester drop-off before day 14.

## 16. Milestones

| Phase | Scope |
| --- | --- |
| **MVP** | Supabase migration (schema, views, RPC, RLS, tests), Google login, apps, tester registration with checklist, masked tester table, 12/14 progress, engagement tracking, feedback guide, build log, reciprocity score, badges and public profile, pure testers in cohorts, Tugas saya, cohorts with assignment and obligation matrix, milestone check-ins, daily email digest, admin panel (cohorts, WhatsApp reminder text, moderation), WhatsApp link per cohort |
| **Design pass** | Story surface rebuilt to §13.0 with the signature moment; work screens refined (type, motion, states, empty states); accessibility and performance budget met; pre-submission review; Awwwards submission |
| **Phase 2** | Optional daily check-in, web push, CSV export, badges v2 |
| **Phase 3** | iOS / TestFlight support, cohort retrospective, public stats page |

## 17. Open Questions

1. Should there be a cap on apps per creator overall? (Within a cohort it is one app per member.)
2. Should creators see full emails of their own testers to cross-check with Play Console, or is masked-only acceptable? *(ADR-011, accepted, covers only email-list apps with the tester's consent; the general question stays open.)*
3. Should Left/Removed testers stay visible in the public table or collapse into a history section?
4. Should the 3-build target be a community rule, or just a guideline shown in progress?
5. Should creators who leave verified feedback unreplied for a long time be flagged publicly?
6. ~~Is Day 21 the right hard close for a cohort, or should it stay open until every app is ready?~~ **Answered 3 Nov 2026: Day 21 is the hard close, or earlier when every app is Ready to apply. Standing counts only milestones due before close; apps not ready keep their testers and can join a later cohort (FR-37).**
7. ~~Should a member with two apps be allowed to bring both into one cohort (testing twice as many apps in return)?~~ **Answered 3 Nov 2026: no. One member brings one app per cohort; a second app goes into a different cohort (FR-30).**
8. Who besides the owner may act as admin for running cohorts?
9. ~~Should logged-out visitors land on the story page at `/`, with the app list moved to `/apps`?~~ **Answered 2 Nov 2026: yes, for everyone (ADR-008 option A).**
10. Will the design pass be done in-house with Taste Skill alone, or with a dedicated designer or creative developer for the signature moment?
11. Should badge names be Indonesian (e.g. Perunggu, Perak, Emas, Platinum) or stay in English?
12. ~~Is there a cap on pure testers per cohort, or can any number join until Day 7?~~ **Answered 3 Nov 2026: no cap; any number can join until Day 7 (FR-33a).**