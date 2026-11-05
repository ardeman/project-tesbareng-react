# ADR-007 — Cohorts: ring assignment of testers

|  |  |
| --- | --- |
| **Status** | Accepted, implemented (`20261103000100`–`20261103000700` migrations, `tests/cohort.test.ts`, `tests/cohort-flow.test.ts`) |
| **Decider** | Community Admin |
| **Date** | 2 November 2026 |
| **PRD ref** | PRD v2.2 §5.6–§5.8, §6.9 (FR-29 to FR-38a), §6.10, §17 Q6–Q7 |
| **Related** | ADR-001 §4 (the cohort ring is also the signature visual) |

---

## Context

Google Play requires **12 testers opted in for 14 continuous days** before a new personal developer account can apply for production. In the open pool (v1), popular or well-connected creators got testers and others waited, and some creators received testers without testing back.

A cohort solves this by making testing reciprocal and scheduled: a group of creators starts together, and each one is told exactly which apps to test. The rule that decides "who tests whom" must be:

- **fair**: every app gets the same number of assigned testers;
- **bounded**: nobody is asked to test an unreasonable number of apps;
- **enough**: every app gets at least 12 testers, with some buffer for drop-outs;
- **simple to explain** on the About page and visible in the matrix.

## Decision

1. **Minimum 13 apps** to start a cohort, so creators alone can give every app 12 testers.
2. At start (Day 0), members who bring an app are **shuffled into a random ring**. With N apps:
   - **N = 13–16 → full mesh:** everyone tests every other app; k = N − 1 (12 to 15 testers per app).
   - **N > 16 → ring:** the member at position *i* tests apps at positions *i+1 … i+14* (wrapping), so k = 14. Every member tests exactly 14 apps and every app receives exactly 14 assigned testers.
3. **Pure testers** (members without an app) are each assigned 14 apps (or all, if fewer), **lowest coverage first**, to even out the buffer. Those present at Day 0 are assigned at start; later joiners (until Day 7) are assigned when they join, with their own 48-hour opt-in deadline (FR-33b).
4. An assignment is **fulfilled** by a normal Active tester entry on that app (§5.2). There is no separate cohort join flow.
5. **Ghosting:** after the 48-hour deadline, unmet assignments make the member **Behind**, and their own app shows a public **"Belum tes"** label. The admin can **reassign** an unfulfilled slot to a member who has fulfilled all their own.
6. **Close** at all apps "Ready to apply" or Day 21, whichever comes first; Day 21 is a hard close (PRD §17 Q6, answered 3 Nov 2026). Standing counts only milestones due at or before the close, so a late reassignment that cannot reach 14 days by Day 21 does not make anyone Owing. Members with unmet obligations are **Owing** and cannot join another cohort until the admin marks them **Settled**. Tester entries outlive the cohort; an app that is not ready can join a later cohort.
7. Generation happens inside the `start_cohort` and `join_cohort_as_tester` RPCs (ADR-004). Assignments are rows, never recomputed, so a later change in membership cannot silently move obligations.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Full mesh at any size | At 30 apps, each member would test 29 apps for 14 days. Too much; quality drops. |
| Random assignment (each picks 14 at random) | Unequal coverage: some apps get 9, others 19. |
| Self-selection from a list | Popular apps fill first; same unfairness as the open pool. |
| Exactly 12 per app | Zero buffer. One drop-out fails an app. 14 gives two spare. |
| Daily attendance instead of milestones | 14 taps per person per day invites careless clicking (§6.10). |

## Consequences

- **Thin buffer at small sizes:** at N = 13, each app has exactly 12 creator testers. One ghost means the app depends on pure testers or a reassignment. The admin panel should warn when a cohort starts at 13 with no pure testers.
- Workload per member is predictable: at most 15 apps (N = 16) and exactly 14 above that.
- Random shuffle means nobody can choose their testers; the ring order is stored (`cohort_members.ring_position`) so the matrix and the signature ring visual (ADR-001 §4) show the real order.
- Tests must cover: full mesh at N = 13–16, ring k = 14 at N > 16, every app receiving exactly k, pure-tester coverage balancing, and the Day 7 join cut-off.
- PRD §17 Q6 and Q7 are answered (3 Nov 2026): Day 21 hard close with early close when all apps are ready, and one app per member per cohort (a second app goes into a different cohort).
