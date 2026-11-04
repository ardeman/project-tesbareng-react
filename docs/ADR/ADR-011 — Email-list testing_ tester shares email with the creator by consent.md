# ADR-011 — Email-list testing: tester shares their email with the creator, by consent

|  |  |
| --- | --- |
| **Status** | **Proposed** (implemented on branch `feat/email-list-testers`, waiting for the owner's decision) |
| **Decider** | Community Admin |
| **Date proposed** | 4 November 2026 |
| **PRD ref** | PRD v2.3 §5.1, §5.2a, FR-14a–FR-14e, §7, §8.2, §9; answers part of §17 Q2 if accepted |
| **Amends** | ADR-005 §2 and §4 (who may read `auth.users.email`, and "masked for everyone") |
| **Code** | `supabase/migrations/20261104000100_email_list_testers.sql`, `20261104000200_email_list_unlock.sql`, `tests/email-list.test.ts` |

---

## Context

TesBareng assumes every app adds the community Google Group (`google-tester-indonesia@googlegroups.com`) as its tester list. In Play Console, one closed-testing track takes testers from **email lists or Google Groups, not both**. A member whose track already runs on an email list, for example with 8 of 12 testers opted in (WhatsApp group, 4 Nov 2026), cannot add the group without moving those testers, and cannot take community testers either: TesBareng only ever shows masked addresses (ADR-005), so there is nothing to paste into the list.

## Decision

1. **Per-app tester method.** `apps.tester_method` is `'google_group'` (default, unchanged behaviour) or `'email_list'`. The creator picks it on the app form. Google Group apps still confirm the group; email-list apps don't.
   **Unlocked by testing others:** a creator can choose `email_list` only once their reciprocity Testing count (`profile_stats.testing_count`) is at least 3 (owner request, 4 Nov 2026). A trigger on `apps` enforces it (`20261104000200_email_list_unlock.sql`); an app already on an email list keeps it if the count drops later, and the form shows the option disabled with the current count.
2. **Consent per app.** On an email-list app, a member asks to be added (`request_email_listing(app, consent = true)`). That consent covers only the creator of that app.
3. **No new copy of the email.** `email_listings (app_id, user_id, requested_at, listed_at)` has no email column, and the public may read it. The full address is read live from `auth.users` by `app_email_listings(app)`, a `security definer` RPC that:
   - answers only the **creator** of that app. Admins are not included, to keep exposure minimal; they can still mark entries as listed.
   - returns only members who asked and have not withdrawn, left or been removed.
4. **Hand-off.** The creator pastes the addresses into Play Console and marks each one listed (`mark_email_listed`). Only after that can the tester register (`join_as_tester` requires a listed request on email-list apps instead of the group checklist item).
5. **Withdraw at any time** (`cancel_email_listing`). TesBareng stops showing the address. What was already pasted into Play Console is outside TesBareng and the UI says so.
6. **Cohort deadlines are fair to testers.** For an email-list app, a milestone's base time is `listed_at` (when the creator marked the tester added) instead of `assigned_at`, as long as the tester asked within the 48 h opt-in window. While the creator has not marked them, nothing is due. A tester who never asks, or asks late, keeps `assigned_at` and is Behind as usual. Exposed as `cohort_assignment_status.base_at`; the digest uses it too.
7. **Everything else in ADR-005 holds:** no public table or view has a full email; masked emails everywhere else; the tester table still shows the masked address.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Do nothing: email-list apps must switch to the group | The creator would have to move existing testers to a new track or tell them to join the group; some lose the 14-day run. This is the case that triggered the request. |
| Tester types their Play email into a form | Would store a full email in a table, breaking hard rule #1 / ADR-005 §1. The sign-in Google account is the one used on Play in practice; the UI asks the tester to make sure. |
| Private table with the email and owner-only RLS | A second copy of personal data. Reading `auth.users` live needs no copy and stops showing the address the moment the member withdraws or leaves. |
| Admins also see the emails | Not needed for the hand-off; admins can mark entries listed without seeing addresses. Can be added later if moderation needs it. |
| Cohort deadlines stay at `assigned_at` | A slow creator would make their own assigned testers Behind and Owing. |

## Consequences

- Hard rule #2 in `CLAUDE.md` gets one exception: a creator sees the full Google-account email of members who consented on their email-list app. PRD §8.2 and ADR-005 point here.
- `tests/permissions.test.ts` also scans `email_listings` for leaked addresses; `tests/email-list.test.ts` covers every RPC rule, including that admins, other members and visitors get `permission-denied` or `unauthenticated`.
- Signature change: `create_app` and `update_app` gain `p_tester_method` (`create_app` has a default, so old callers keep working).
- Creators who never mark requests leave testers waiting. Today the panel on the app page is the only prompt; a digest item for creators is a possible follow-up (not in this change).
- If rejected, the migration is self-contained: drop `email_listings` and `apps.tester_method`, and restore the previous `join_as_tester`, `create_app`, `update_app`, `cohort_assignment_status` and `due_cohort_reminders`.
