# ADR-013 — Cohort app requests: the creator asks, the admin approves

|  |  |
| --- | --- |
| **Status** | **Accepted** (5 November 2026, owner decision; implemented on `feat/cohort-app-requests`: migration `20261105000200_cohort_requests.sql`, digest, cohort page, admin panel and Tugas saya) |
| **Decider** | Community Admin |
| **Date proposed** | 5 November 2026 |
| **PRD ref** | PRD v2.5 §5.6, FR-30, FR-30a, FR-30b, FR-45 (digest), §7 (permissions), §9 (data model), §9.3 (RPCs) |
| **Amends** | PRD FR-30 ("the admin adds creators"): the admin still decides, but a creator can now ask first |

---

## Context

Until now only the admin could put a creator and their app into a cohort (`add_cohort_member`). The app had no way for a creator to say "I want to bring this app into Cohort #4". Requests happened off-app (WhatsApp, Google Group) and the admin had to find the member and the app by hand. Pure testers already join on their own (FR-33a).

## Decision

1. **A creator requests, the admin decides.** While a cohort is Forming, a member who is not in it and not Owing may request to bring **one of their own apps** (live, not in another non-closed cohort). The admin approves, which adds the creator with that app through the same checks as `add_cohort_member`, or rejects it with an **optional reason** (max 280 chars) that the member sees.
2. **One pending request per member at a time** (owner decision). The member may withdraw it and then request again. Enforced by a partial unique index on `cohort_requests (user_id) where status = 'pending'`.
3. **Direct add stays.** The admin can still add any creator without a request. If that member had a pending request for the same cohort, it is marked approved.
4. **Pending requests never go stale.** Triggers close them automatically: the cohort leaves Forming → `expired`; the member joins that cohort as a pure tester → `withdrawn`; the app is soft-deleted → `withdrawn`. Otherwise a dead request would block the member's next one.
5. **Admins hear about it in the daily digest** (owner decision; ADR-006). `due_admin_reminders()` returns one item per admin per Forming cohort with pending requests, every day until they are decided.
6. **Data access follows ADR-004.** `cohort_requests` is readable by its member and by admins (RLS), never written directly; writes go through `request_cohort_slot`, `withdraw_cohort_request`, `approve_cohort_request` and `reject_cohort_request`. No emails are stored (ADR-005).

## Consequences

- The cohort page needs a "bring my app" action for a signed-in member with an app, showing the status of their request (pending / rejected with reason). The admin cohort panel needs a pending-requests list with approve and reject.
- The status values `approved`, `rejected`, `withdrawn` and `expired` remain as history; nothing else reads them yet.
- Admins with digests on get one more kind of item; with digests off they see requests in the admin panel and on Tugas saya.
