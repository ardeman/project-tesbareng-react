# ADR-009 — Work surface UX: the "B2B" rules

|  |  |
| --- | --- |
| **Status** | Proposed |
| **Decider** | Community Admin |
| **Date** | 2 November 2026 |
| **Builds on** | ADR-001 (visual system). This ADR covers **behaviour and structure**; ADR-001 covers **look and motion tokens**. Where they overlap, ADR-001 wins on visuals, this ADR wins on UX patterns. |
| **Source** | Adapted from Antonio's personal design rules (*Human-Centered Design*, written for B2B CRM work), translated to TesBareng |
| **PRD ref** | PRD v2.2 §6, §7, §10, §12, §13.3 |

---

## Context

ADR-001 splits TesBareng into two surfaces. The **work surface** behaves like a small B2B tool: a shared spreadsheet of testers, an obligation matrix, forms, an admin panel. People open it many times during a 14-day cohort, often on a phone between other tasks, and need to answer one question fast: *what do I still owe, and who owes me?*

ADR-001 defines the neubrutalist look, but says little about table behaviour, states, forms, destructive actions, copy or per-role landing. Those gaps are where a tool feels either solid or improvised. The personal design rules already answer them for CRM-style products; this ADR adopts the parts that fit and records where TesBareng deliberately differs.

**Personas (one line each):**

- **Tester / pure tester** — opens Tugas saya, joins assigned apps, checks in. Mid tech comfort, mostly on Android.
- **Creator** — watches their app's tester table, verifies feedback, logs builds. Higher tech comfort (they ship Android apps).
- **Admin** — runs cohorts, reassigns slots, moderates. Power user, mostly desktop.

## Decision

### 1. One primary action per screen

Each work screen has one obvious next step, drawn as the `--kunyit` primary button (ADR-001 §2.5). Everything else is secondary (`--putih`) or in an overflow menu.

| Screen | Primary action |
| --- | --- |
| App list | "Tambah app" (signed in) |
| App detail (visitor/member) | "Gabung sebagai tester" |
| App detail (tester) | The next due check-in, or "Tandai sudah kirim" |
| App detail (creator) | "Catat build" |
| Tugas saya | The first overdue to-do |
| Cohort detail | "Gabung sebagai tester" (until Day 7) |
| Admin | Depends on cohort state: "Mulai cohort", "Tutup cohort" |

### 2. Role-based first screen and visibility

- Same product, different first screen: **visitor** → story page (ADR-008); **member with to-dos** → Tugas saya (`/me`); **member without to-dos** → app list. Admin → `/admin` when a cohort needs action.
- What a role may **see** is enforced in the database (ADR-004, ADR-005), never by hiding UI only. Actions a role cannot take are **not rendered**, rather than shown disabled, except where a disabled button teaches a rule (e.g. "Gabung" disabled on your own app, with the reason).
- At least one view is **screenshot-ready** for people outside the tool: the app's tester table with 12/14 progress, so a creator can show it in the WhatsApp group or keep it for their Play application. It must read correctly without narration.

### 3. Tables and the matrix

- Treat the tester table and obligation matrix as a real sheet (ADR-001 §2.4): ruled rows, **sticky header**, **sticky first column** (name) when scrolling horizontally on mobile. Scroll horizontally rather than shrinking text.
- Row height 44–48 px (also meets the 44 px touch target).
- Show the 3–4 fields that matter per row: **name, status, days active (x/14), feedback state**. Notes, dates and history live behind a tap.
- Status is **chip + glyph + text**, never colour alone (ADR-001 §2.5).
- Sort: default by status then days active (eligible first); visible sort direction on sortable headers.
- **Inline editing** for the creator's quick fields (Verified, Replied, status) directly in the cell, saved with immediate feedback. No modal for a one-field change.
- Left/Removed testers collapse into a "Riwayat" group below Active ones until PRD §17 Q3 is answered.
- Virtualise any list that can exceed ~50 rows (admin moderation lists, app list at scale). The matrix is bounded by cohort size and does not need it.

### 4. Record detail = app detail

App detail is the most-used work screen and follows the record pattern:

- **Header zone** that stays visible: app name, status chip, 12/14 progress, primary action.
- Below it, sections or tabs: **Testers**, **Build & check-in log**, **Panduan feedback**.
- The build and check-in log is an **activity timeline**: newest first, each entry with actor, action and relative time ("2 jam lalu", exact WIB time on hover/long-press), grouped by day.
- Long related lists show a few rows plus "Lihat semua".

### 5. Every state is designed

- **Empty:** says what is missing and the next step. e.g. "Belum ada tester. Bagikan link app ini di grup WhatsApp cohort." Spot illustrations per ADR-001 §2.6.
- **Loading:** skeleton shaped like the final layout, scoped to the part loading.
- **Error:** the RPC's Indonesian message (ADR-004) plus what to do next. Never a raw code.
- **Hover / focus / active / disabled** defined for every interactive element (press effect per ADR-001 §2.2).
- **First run:** after first sign-in, show what to do next (join the Google Group, then an app), revealing cohort features once the member is in one.

### 6. Forms

- Label above the field; never placeholder as label. Helper text always visible, separate from error text.
- Validate on blur with `web/src/lib/validate.ts`; the server stays the authority (ADR-004).
- On submit, focus jumps to the first error. The submit button stays enabled until the request starts, then shows "Menyimpan…".
- Correct `type`, `inputmode`, `autocomplete`. Never block paste. Warn before leaving with unsaved changes (Add/Edit app).

### 7. Actions and destructive operations

- One primary, up to two secondary visible; the rest in an overflow ("…") menu.
- Destructive actions use `--cabai`, sit apart from safe actions, and follow **delete + undo** where possible: soft-deleting an app (ADR-004) removes it immediately and shows a toast with "Urungkan" for 5–8 s.
- A **confirm dialog** only for actions undo cannot fix or that affect many people: **Mulai cohort** (generates assignments), **Tutup cohort** (sets standings), **reassign slot**.
- Never nest a modal in a modal. Non-destructive modals close on Escape and backdrop.

### 8. Notifications and feedback

- **Toasts** for in-the-moment results (check-in recorded, feedback marked). Success auto-dismisses in 3–5 s; anything needing action stays. Announced with `aria-live="polite"`.
- Any user action shows visible feedback within **100 ms** (press state), even if the RPC takes longer.
- The persistent "what do I owe" list is **Tugas saya**, not a bell icon. Counts never show "0"; cap at "99+".

### 9. Motion frequency rule

Adds to ADR-001 §3: **how often an action happens decides whether it animates.** Things done many times a session (sorting, filtering, tab switches, table navigation) get **no** animation beyond the press state. Occasional things (modal, toast, check-in stamp) use ADR-001's tokens. Exits are faster than entrances. Hover effects only under `@media (hover: hover) and (pointer: fine)`.

### 10. Copy and locale

- Bahasa Indonesia, plain and concrete. Buttons say what they do ("Tandai sudah kirim", not "Submit"/"OK").
- Calm error and empty copy with a next step. No filler.
- Dates `id-ID` (e.g. 2 Nov 2026), times in WIB, numbers with Indonesian separators (1.234), all through `Intl` formatters, never hand-built strings.
- Real seed content in demos and screenshots; no "Lorem ipsum" or "John Doe".

### 11. Implementation floor

Mechanical checks, same every time: `<button>` for actions and `<a>` for navigation (no `div onClick`); `aria-label` on icon-only buttons; decorative icons `aria-hidden`; `:focus-visible` rings (ADR-001 accessibility baseline), never `outline: none` without a replacement; sticky headers never cover the focused element; `truncate`/`line-clamp` on user text plus `min-width: 0` on flex children; tabular numbers in every count column; real `…` character; images with width and height; no `transition: all`; never disable zoom.

## Where TesBareng differs from the personal rules (on purpose)

| Personal rule (B2B CRM) | TesBareng | Why |
| --- | --- | --- |
| Dark mode mandatory from day one | **Deferred** (ADR-001 §2.1) | Neubrutalism is designed light-first; one maintainer. Tokens stay semantic so dark can be added. |
| Swappable white-label theme per client | **One brand**, but still semantic tokens only | Single product. Semantic tokens keep palette changes to one file (ADR-001 Consequences). |
| German locale (DD.MM.YYYY, €) | **`id-ID`**, WIB, no currency | Indonesian community. |
| Desktop-first | **Mobile-first** (PRD §12) | Testers open opt-in links on Android phones. |
| Calm Linear/HubSpot visual tone | **Neubrutalism** (ADR-001) | The UX rules above apply; the look comes from ADR-001. |
| Max 2 font families | Work surface uses **text face + optional mono for data only** | Matches ADR-001 §2.3; the display face stays on the story surface. |
| Notification centre (bell) | **Tugas saya** page | One place for obligations, linked from the digest email (ADR-006). |

## Pre-ship check (per work screen)

- One primary action, visually strongest.
- Empty, loading, error, disabled states designed.
- Status readable without colour; ink-on-fill contrast verified.
- Keyboard reaches everything with a visible focus ring.
- Works at 375 px with sticky first column; 44 px touch targets.
- Only the type scale and tokens from ADR-001; no stray sizes.
- Dates and numbers via `id-ID` formatters.
- No placeholder content.
- `inspect.mjs --app` passes at 375, 768, 1280 px (ADR-001 work-surface sequence).

## Consequences

- Work screens get a checklist reviewers can apply line by line; most items are testable.
- Creators gain inline editing in the tester table, which needs `update_tester` to support single-field patches with fast responses (it already takes a JSON patch).
- Delete + undo for apps needs the undo to call `restore_app`, which is **admin-only** today (ADR-004). Either allow the creator to restore within a short window, or keep a confirm dialog for app delete. Decide before building.
- Role-based landing depends on ADR-008 (routing) being accepted.
