# PRD — TesBareng

| | |
|---|---|
| **Product** | TesBareng |
| **Version** | 1.0 (MVP) |
| **Status** | Draft |
| **Owner** | Community Admin |
| **Community group** | `google-tester-indonesia@googlegroups.com` |

---

## 1. Background

New personal Google Play developer accounts must run a closed test with **at least 12 testers who stay opted in for 14 continuous days** before they can apply for production access. Indie developers struggle to find and keep enough testers.

The community solves this with a test-for-test model: members join one shared Google Group, each developer adds that group as the tester list in their Play Console closed track, and members opt in to each other's apps.

Google also checks engagement, not just tester count. Installing is not enough: testers need to leave real feedback through Google Play, and developers are expected to reply to that feedback and ship new builds (typically 2–3 updates) during the test.

Today, progress is invisible. Nobody knows which apps exist, who is testing what, how long each tester has been opted in, or who has actually given feedback. **TesBareng** ("test together") is a shared, transparent "spreadsheet" for that.

## 2. Goals

1. Give every app in the community a public page showing its testing progress toward the 12-tester / 14-day requirement.
2. Let any logged-in member register as a tester for any app in a few clicks.
3. Keep tester lists transparent while protecting privacy (masked emails).
4. Make engagement visible: who sent feedback on Google Play, whether the creator replied, and how many builds the creator has shipped.
5. Encourage reciprocity so members keep testing each other's apps.

## 3. Non-goals (MVP)

- Automatic sync with Google Play Console or Google Groups (no public API exposes opt-in data; tracking is self-reported).
- Collecting feedback on TesBareng itself. Feedback is written in Google Play (it lands in the creator's Play Console under *Testing feedback*); TesBareng only tracks that it happened.
- Native mobile app.
- In-app chat or direct messaging.
- iOS / TestFlight support (can be added later).

## 4. Roles

| Role | Description |
|---|---|
| **Visitor** | Not logged in. Can browse apps, progress, tester lists (masked), and engagement status. Read-only. |
| **Member** | Logged in via Firebase (Google). Can create apps and register as a tester. |
| **Creator** | A member who owns an app. Full edit rights on that app and its tester list. |
| **Tester** | A member registered on a specific app. Can update their own engagement checklist on that app. |
| **Admin** | Community owner. Can moderate any app, tester entry, or feedback summary (spam, abuse). |

A single user can be a Creator of their own app(s) and a Tester of other apps at the same time.

## 5. Core User Flows

### 5.1 Create an app (Creator)
1. Log in with Google.
2. Click **Add App**.
3. Fill in: App name, short description, Play Store opt-in link, optional Play Store listing link, and a **feedback guide** (see §6.5).
4. Confirm checklist: "I have added `google-tester-indonesia@googlegroups.com` as the tester list in my closed testing track."
5. App is published to the public list with status **Recruiting**.

### 5.2 Register as a tester (Member)
1. Log in with Google.
2. Browse the app list and open an app page.
3. Click **Daftar jadi tester / Become a tester**.
4. Confirmation modal with a step checklist:
   - [ ] I have joined `google-tester-indonesia@googlegroups.com` (link provided).
   - [ ] I have opened the opt-in link and tapped "Become a tester" on Google Play (link provided).
   - [ ] I have installed the app.
5. Click **Confirm**. The member is added to the tester list immediately (no creator approval). `optedInAt` is set to now.

### 5.3 Send feedback via Google Play (Tester)
1. Use the app for a few days, ideally after at least one build update.
2. Read the app's **feedback guide** on its TesBareng page for what the creator wants tested.
3. Open the app's Play Store page and send feedback in your own words (rating plus a specific comment: what worked, what broke, what to improve).
4. Back on TesBareng, tick **Feedback sent on Play**. Optionally add a short summary of what you wrote (max 500 chars) so other members can see it.
5. Repeat after new builds if the creator asks for it.

### 5.4 Leave testing (Tester)
1. On the app page, click **Stop testing**.
2. Status changes to **Left**. Entry stays visible (history), but no longer counts toward progress.

### 5.5 Manage tester list (Creator)
Creator can, on their own app only:
- Manually add a tester (name + email) for people who joined outside the website.
- Change a tester's status (Active / Left / Removed).
- Edit a tester's opt-in date (to correct self-reported dates).
- Add a note per tester (visible to all, short text, e.g. "confirmed in Play Console").
- Mark a tester's feedback as **Verified** after seeing it in Play Console *Testing feedback*.
- Mark **Replied** after replying to that tester's feedback in Play Console.
- Log each new build uploaded to the closed track (see §6.5).

## 6. Functional Requirements

### 6.1 Authentication
- **FR-1** Login via Firebase Authentication, Google provider only.
- **FR-2** On first login, create a user profile from Google account data (display name, photo, email).
- **FR-3** Browsing does not require login. Any write action prompts login.

### 6.2 App management
- **FR-4** App fields:
  - Name (required, max 50 chars)
  - Short description (required, max 280 chars)
  - Play Store opt-in link (required, must match `https://play.google.com/apps/testing/...`)
  - Play Store listing link (optional)
  - Package name (optional, used to prevent duplicate entries)
  - Test start date (optional, set by creator when the closed track goes live)
  - Status: Recruiting → Testing → Applied for Production → Live (Production)
  - Feedback guide (optional, max 500 chars): what testers should focus on, written as prompts or questions, e.g. "Try level 3 on a small screen — is the jump button easy to hit?"
- **FR-5** Only the creator (and Admin) can edit or delete an app.
- **FR-6** A member may create multiple apps.
- **FR-7** Deleting an app soft-deletes it (hidden from list, data retained for Admin).

### 6.3 Tester list (the "shared spreadsheet")
- **FR-8** Each app page displays its tester list as a table:

  | # | Name | Email (masked) | Opted in since | Days active | Status | Feedback on Play | Creator replied |
  |---|---|---|---|---|---|---|---|

  "Feedback on Play" shows: — (not yet), ✓ Sent (self-reported), ✓✓ Verified (confirmed by creator).

- **FR-9** Emails are always shown masked to everyone, including the creator (see §8).
- **FR-10** "Days active" = days between `optedInAt` and today (or `leftAt` if Left).
- **FR-11** A tester with **≥14 days active and status Active** is highlighted as **Eligible**.
- **FR-12** A member cannot register twice for the same app.
- **FR-13** A creator cannot register as a tester on their own app.
- **FR-14** The table is sortable by name, opt-in date, and days active.

### 6.4 Progress indicators (per app)
- **FR-15** Active testers: `X / 12` with progress bar.
- **FR-16** Eligible testers (Active and ≥14 days): `Y / 12` with progress bar.
- **FR-17** Days since test start: `Z / 14` (if test start date is set).
- **FR-17a** Feedback: number of active testers with feedback sent / verified, e.g. `9 sent · 7 verified`.
- **FR-17b** Builds shipped during test: `N / 3` (target is a guideline, not a Google rule).
- **FR-17c** Replies: testers replied to / testers with feedback.
- **FR-18** A "Ready to apply" badge when eligible testers ≥ 12. A softer hint ("Low engagement") shows if fewer than half of eligible testers have sent feedback or no new build has been logged.
- **FR-19** App list cards show active tester count, eligible count, feedback count, and status, so members can spot apps that need help.

### 6.5 Engagement tracking
Feedback itself lives in Google Play. TesBareng tracks engagement around it.

- **FR-20** Only Active testers can tick **Feedback sent on Play** on their own entry, with an optional summary (max 500 chars) and timestamp.
- **FR-21** Only the creator can set **Verified** and **Replied** on a tester entry. Testers cannot set these on themselves.
- **FR-22** The feedback guide is shown on the app page above the "Become a tester" button and in the tester's checklist. It is written as questions or focus areas, not ready-made review text: identical copy-pasted reviews from many accounts can look inauthentic to Google, which defeats the purpose.
- **FR-23** **Build log:** the creator adds an entry per closed-track upload (version name, date, one-line changelog). The app page shows the log newest first, and a "New build — update and test again" banner for 3 days after each entry.
- **FR-24** Testers can untick their own "Feedback sent" if set by mistake; the creator can remove Verified if it was wrong.

### 6.6 App discovery
- **FR-25** Home page lists all apps with search by name and filter by status.
- **FR-26** Default sort: apps needing testers most (lowest active count first), so new apps get attention.

### 6.7 Reciprocity score
Makes test-for-test fairness visible, so members can prioritize helping people who help others.

- **FR-27a** Each member has two public numbers instead of one opaque score:
  - **Testing:** apps where they are an Active tester, or completed 14+ days before leaving. Entries with status Removed, or Left before 14 days, do not count.
  - **Feedback:** apps where their feedback is marked Sent on Play (Verified shown separately).
- **FR-27b** App cards and the app detail page show the creator's numbers, e.g. "Creator: testing 8 apps · feedback on 6 (5 verified)".
- **FR-27c** The app list can be sorted by **Creator most active** (highest Testing count first) in addition to the default sort.
- **FR-27d** A member's own numbers appear on My Testing with a nudge when Testing is below the number of apps they have listed (e.g. "You have 1 app listed but are testing 0 — help others to get help back").
- **FR-27e** Counts are maintained server-side by Cloud Functions on tester entry changes; members cannot edit them.
- **FR-27f** A public profile page lists the apps a member created and the apps they are testing (names and status only, no email).

### 6.8 Member profile ("My Testing")
- **FR-28** Logged-in users see a dashboard with: apps I created, apps I'm testing (with days active and feedback status per app), and a **to-do list**: apps where I still owe feedback or a new build is waiting to be tested.

## 7. Permissions Matrix

| Action | Visitor | Member | Tester (on app) | Creator (own app) | Admin |
|---|---|---|---|---|---|
| View app list, progress, tester list, engagement, build log, profiles | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create app | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit / delete app | ❌ | ❌ | ❌ | ✅ | ✅ |
| Register as tester | ❌ | ✅ | — | ❌ (own app) | ✅ |
| Leave testing | ❌ | ❌ | ✅ | — | ✅ |
| Add / edit / remove testers | ❌ | ❌ | ❌ | ✅ | ✅ |
| Tick "Feedback sent" + summary (own entry) | ❌ | ❌ | ✅ | ❌ | ✅ |
| Set Verified / Replied | ❌ | ❌ | ❌ | ✅ | ✅ |
| Edit feedback guide, add build log | ❌ | ❌ | ❌ | ✅ | ✅ |

## 8. Privacy — Email Masking

**Rule:** keep the first 2 characters of the local part, replace the rest with `*` (fixed 5 asterisks so length isn't revealed), keep the domain.

| Original | Masked |
|---|---|
| `budi.santoso@gmail.com` | `bu*****@gmail.com` |
| `ab@gmail.com` | `a*****@gmail.com` |

**Implementation requirement:** the full email must **never** be stored in a publicly readable document. Firestore security rules cannot hide individual fields, so if a full email exists in a readable document, anyone can fetch it via the SDK. Masking must happen server-side (Cloud Function) before writing tester records. Full emails live only in the private `users` collection, readable by the owner and Admin.

Creators don't need full emails because testers are managed through the shared Google Group in Play Console.

## 9. Data Model (Firestore)

> **Stack note (2026-10-31):** the backend moved from Firebase to Supabase (free plan: Postgres, Row Level Security, Postgres functions) with hosting on Cloudflare Pages. Firebase needs the Blaze plan, which requires a credit card, to deploy Cloud Functions, and the server-side logic (email masking, server-only counters) cannot run without them. Where this PRD says Firebase, Firestore or Cloud Functions, read the Supabase equivalent in `docs/contract.md`. Behaviour and rules are unchanged.


```
users/{uid}                       // private: owner + admin only
  email, displayName, photoURL, role ("member" | "admin"), createdAt

publicProfiles/{uid}              // public read
  displayName, photoURL, maskedEmail,
  appsCreatedCount,
  testingCount,              // active or completed 14+ days (reciprocity)
  feedbackSentCount, feedbackVerifiedCount,
  createdAt

apps/{appId}                      // public read
  name, description, optInUrl, storeUrl?, packageName?,
  creatorUid, creatorName, status, testStartDate?, feedbackGuide?,
  activeTesterCount, feedbackSentCount, feedbackVerifiedCount,
  repliedCount, buildCount, lastBuildAt?,
  createdAt, updatedAt, deleted (bool)

apps/{appId}/testers/{testerId}   // public read; testerId = uid, or auto-id for manual entries
  uid?, displayName, maskedEmail,
  optedInAt, leftAt?, status ("active" | "left" | "removed"),
  addedBy ("self" | "creator"), note?,
  feedbackSent (bool), feedbackSentAt?, feedbackSummary?,   // set by tester
  feedbackVerified (bool), replied (bool)                    // set by creator

apps/{appId}/builds/{buildId}     // public read; creator write
  versionName, uploadedAt, changelog
```

Derived values (days active, eligible count) are computed on the client from timestamps. Counters on `apps` (`activeTesterCount`, `feedbackSentCount`, etc.) are maintained by Cloud Functions for fast list sorting. Firestore rules must restrict testers to updating only the `feedbackSent*` fields on their own entry.

## 10. Pages

| Page | Route | Content |
|---|---|---|
| Home / App list | `/` | Search, filters, app cards with progress |
| App detail | `/apps/{id}` | App info, links, feedback guide, progress bars, tester table, build log |
| Add / edit app | `/apps/new`, `/apps/{id}/edit` | Form, feedback guide, Google Group checklist, build log entry |
| Member profile | `/u/{uid}` | Reciprocity numbers, apps created, apps testing |
| My Testing | `/me` | Apps created, apps testing, feedback to-do list |
| About / How it works | `/about` | Community rules, step-by-step guide (join → opt in → use → feedback on Play), how to send Play feedback, Google Group link |

## 11. Tech Stack (proposed)

> **Stack note (2026-10-31):** the backend moved from Firebase to Supabase (free plan: Postgres, Row Level Security, Postgres functions) with hosting on Cloudflare Pages. Firebase needs the Blaze plan, which requires a credit card, to deploy Cloud Functions, and the server-side logic (email masking, server-only counters) cannot run without them. Where this PRD says Firebase, Firestore or Cloud Functions, read the Supabase equivalent in `docs/contract.md`. Behaviour and rules are unchanged.


- **Frontend:** Next.js (or React + Vite) with Tailwind CSS
- **Auth:** Firebase Authentication (Google provider)
- **Database:** Cloud Firestore with security rules enforcing §7
- **Server logic:** Cloud Functions — `joinAsTester`, `leaveTesting`, `markFeedbackSent`, masking, counter updates
- **Hosting:** Firebase Hosting

## 12. Non-functional Requirements

- Mobile-first responsive design (most members will open opt-in links on their phones).
- App detail page loads under 2 seconds on 4G.
- UI language: Bahasa Indonesia primary, English optional.
- Rate limit: max 5 apps created per user per day; max 10 build log entries per app per day.

## 13. UI Design Guidelines (Anti-AI-Slop)

TesBareng must not look like a generic AI-generated template. All UI work uses **Taste Skill** (`design-taste-frontend`, MIT license): https://github.com/Leonxlnx/taste-skill

### 13.1 Setup
- Install for coding agents: `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"`
- Claude Code alternative: `/plugin marketplace add Leonxlnx/taste-skill` then `/plugin install taste-skill@taste-skill`
- Requirements: Node 22+ and an installed Chrome, Edge or Chromium (the skill checks pages in a real browser).

### 13.2 Which route applies
Taste Skill treats two kinds of work differently:

| Screen | Type | Route |
|---|---|---|
| About / How it works, future landing page | Page (read and scrolled) | Standard page run: pick a direction, derive the idea, build, inspect, fix |
| App list, App detail, tester table, build log, member profile, My Testing, Add/Edit app | App screen (worked in) | App-screen route (`draw.mjs --app`, `inspect.mjs --app`) |

Deal the app style once and reuse its colours and type across all app screens for consistency.

### 13.3 Design requirements
- **DR-1** The visual concept comes from the subject itself (community testing together, the shared spreadsheet, Indonesian developer culture), not from a default template.
- **DR-2** Avoid known slop patterns: centred hero over a row of icon cards, soft gradients and glows, icons in tinted squares, rainbow charts, invented vanity numbers.
- **DR-3** Colour is spent on data: progress bars (X/12, Y/12, Z/14), tester status, and feedback state (none / sent / verified) are where colour carries meaning.
- **DR-4** Tables and figures are aligned (tabular numerals for counts and days).
- **DR-5** On mobile, navigation folds away and the tester table remains readable (horizontal scroll or stacked rows).
- **DR-6** Any photographs used come from open collections and are credited.

### 13.4 Acceptance
- Every page and app screen passes the skill's `inspect` check at three widths (mobile, tablet, desktop).
- Each screen goes through at least one screenshot review-and-fix round before release.

**Note:** a full page build with the skill takes roughly 30–45 minutes and a few hundred thousand tokens. Budget agent time and cost accordingly.

## 14. Suggested Additions (beyond the original scope)

These are proposals, marked for discussion:

1. **12/14 progress tracking (included in MVP above).** The whole point of the community is passing Google's requirement, so the app page should answer "how close am I?" at a glance, not just list names.
2. **Opt-in checklist instead of a single Google Group checkbox (included above).** Joining the group alone doesn't count; the tester must also opt in via the app's link. The checklist reduces fake or incomplete registrations.
3. **Eligible tester highlighting (included above).** Google counts testers opted in for the *last* 14 days continuously. Distinguishing "active" from "eligible" prevents creators from applying too early.
4. **Reciprocity score (included in MVP, §6.7).** Shows how many apps each creator is testing and giving feedback on. Encourages fair test-for-test behavior and lets members prioritize helping active contributors.
5. **Daily check-in (Phase 2).** Google has started rejecting applications for insufficient engagement. A one-tap "I used the app today" button gives creators engagement evidence and nudges testers to actually open apps.
6. **Email reminders (Phase 2).** Notify testers on day 1, 7, and 13 to keep the app installed, and when a new build is logged; remind testers who haven't sent feedback by day 5; notify creators when they hit 12 eligible testers or have unreplied feedback.
7. **Admin moderation panel (Phase 2).** Remove spam apps, fake testers, or abusive feedback summaries.
8. **Export tester list to CSV (Phase 2)** for the creator's own records.

## 15. Success Metrics

- Number of apps reaching "Ready to apply" (≥12 eligible testers).
- Median days from app creation to "Ready to apply".
- Average apps tested per member (reciprocity health).
- Share of eligible testers with feedback sent on Play (and verified).
- Builds logged per app during testing; creator reply rate.
- Tester drop-off rate before day 14.

## 16. Milestones

| Phase | Scope |
|---|---|
| **MVP** | Auth, app CRUD, tester registration with checklist, tester table with masking, 12/14 progress, engagement tracking (feedback sent / verified / replied), feedback guide, build log, reciprocity score + member profile, My Testing page |
| **Phase 2** | Daily check-in, email reminders, admin panel, CSV export |
| **Phase 3** | iOS / TestFlight support, multi-group support, public stats page |

## 17. Open Questions

1. Should there be a cap on apps per creator to keep the community balanced?
2. Should creators see full emails of their own testers (e.g., to cross-check with Play Console), or is masked-only acceptable?
3. Is a community rule needed, such as "you must test at least N apps before listing your own"?
4. Should Left/Removed testers stay visible in the public table or be collapsed into a history section?
5. Should the 3-build target be a community rule, or just a guideline shown in progress?
6. Should creators who leave feedback unreplied for a long time be flagged publicly?
