# ADR-012 — Tester slots: the creator chooses how many testers an app needs

|  |  |
| --- | --- |
| **Status** | **Accepted** (5 November 2026; implemented on `feat/tester-slots`, PR #8, migration `20261105000100_tester_slots.sql`) |
| **Decider** | Community Admin |
| **Date proposed** | 5 November 2026 |
| **PRD ref** | PRD v2.3 (as amended by ADR-011) FR-4 (app fields), FR-18 (Ready to apply), §5.6–§5.8 and FR-29–FR-38a (cohorts), §9 (data model), §9.3 (`create_app` / `update_app` args) |
| **Amends** | ADR-007 §1–§3 (every app gets the same k testers) |
| **Builds on** | ADR-011 (Accepted). This ADR continues from ADR-011's schema and is implemented after it; see "Building on ADR-011" |

---

## Context

Google Play needs **12 testers opted in for 14 continuous days**. Many creators do not start from zero: a closed-testing track can take testers from **several Google Groups**, so a creator may already have, say, 9 testers from another community or from friends, and only needs 3 more from TesBareng.

Today every app is treated as needing 12. The list sorts it among apps that need 12, the progress target is 12, and in a cohort it is assigned 12–15 testers (ADR-007). The creator in turn tests 12–15 apps, even though they need only a few testers back.

## Decision

1. **Tester slots per app.** New column `apps.tester_slots smallint not null default 12`, with a check constraint `between 1 and 12`. The creator picks it on the add-app form (default 12) and may change it in Edit app at any time. The field is labelled "Butuh berapa tester dari TesBareng?", with a hint that Google needs 12 in total and the rest come from the creator's other groups or lists.
2. **Self-reported, like everything else.** TesBareng does not check how many testers the app has outside the community. The slot count is the creator's claim about their own need.
3. **Full does not block anyone.** When active testers ≥ slots, the app shows "Kursi penuh", but `join_as_tester` still accepts new testers as a buffer. No new RPC errors.
4. **The target becomes the slot count.** Wherever the code uses `TARGET_TESTERS` (12) for an app's progress, it uses that app's `tester_slots` instead: the seat strip, "X / slots", "Butuh N tester lagi", and **Ready to apply = eligible ≥ tester_slots** (amends FR-18). An app with fewer than 12 slots shows a line on its detail page: "Target TesBareng: S tester. Sisanya (12 − S) dari luar komunitas, dilaporkan sendiri oleh kreator."
5. **Cohorts: give what you take.** At `start_cohort` (Day 0), each creator app *i* gets a cohort demand **kᵢ = min(slotsᵢ + 2, N − 1)**, where +2 is the same drop-out buffer that ADR-007's 14 gives over 12. The creator of app *i* then **tests exactly kᵢ apps**, and app *i* **receives exactly kᵢ** assigned creator testers. Total testing given equals total testing received, so the "nobody gets testers without testing back" rule holds, and a creator who needs 3 tests 5 apps, not 14.
   - Generation: shuffle the members, then build the assignment with a degree-balanced greedy (Kleitman–Wang for directed graphs: repeatedly take the member with the most remaining out-degree and assign them to the apps with the most remaining in-degree, never themselves and never twice). It runs inside `start_cohort`, and assignments stay rows (ADR-007 §7).
   - **When every kᵢ is equal**, the assignment is ADR-007's ring (member i tests i+1 … i+k), so all-equal cohorts look exactly as before.
   - **When no assignment exists for the kᵢ**, the smallest kᵢ is raised by one, repeatedly (never above N − 1), until one does. Example: N = 13 with four apps at 12 slots (k = 12) and nine at 1 slot (k = 3). Each big app needs all 12 other members, so each small creator must test at least 4 apps. Raising keeps give = take exact and gives every app at least its demand; small creators test (and receive) a little more. The final kᵢ is stored in `cohort_members.demand` (an input snapshot, not a counter). Added during implementation (5 November 2026); the alternatives were lowering the largest kᵢ (big apps short of testers) or refusing to start.
   - If every app has 12 slots, kᵢ = 14 (or N − 1 when N ≤ 15), which is today's behaviour except at N = 16, where ADR-007's full mesh gives 15. That one case is accepted.
   - `cohort_members.ring_position` stays as the shuffle order. With unequal kᵢ, the assignment is no longer a strict ring, so the signature ring visual (ADR-001 §4) draws the actual assignments in that order instead of i+1…i+k arcs.
   - **Pure testers** are unchanged: 14 apps each, lowest coverage relative to kᵢ first (open assignments ÷ `demand`).
   - **Minimum cohort size** stays 13 apps (owner decision A).
   - Changing `tester_slots` after Day 0 does **not** move existing assignments; it changes only the app's progress target and Ready-to-apply state.
6. **List page.** A "Kurang N" / "Kursi penuh" chip next to "X / slots" (glyph plus text), and a sort option **"Hampir penuh"** (fewest open seats first, full apps last). The default sort "Paling butuh tester" now orders by open seats (most first) instead of fewest active testers, and the "Butuh tester sekarang" suggestions on Tugas saya do the same.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Slots only for the open pool, cohorts keep fixed k | The owner chose cohorts too (5 Nov 2026): creators combine several Google Groups, so a cohort app often needs fewer than 12. |
| Everyone in a cohort tests the same number of apps | Unfair the other way: a creator needing 3 testers would still test 14 apps. |
| Allow more than 12 slots | 12 is Google's requirement; extra buffer already comes from +2 in cohorts and from "full stays joinable" in the open pool. |
| Block joins when full | Drop-outs would reopen slots and leave the app short; a buffer is worth more than a hard cap. |
| Separate `set_tester_slots` RPC so ADR-011 and this ADR can merge in either order | Two calls per save, with a half-saved state (app created, slots still 12) when the second fails. Both ADRs change the same form and the same two RPCs, so ordering them is simpler than keeping them apart. |

## Consequences

- Cohorts already exist in the migrations (`start_cohort`, `join_cohort_as_tester` in `20261103000300_cohort_start_join.sql`), so a new migration (dated after ADR-011's `20261104000200`) replaces `start_cohort`. `close_cohort` (`20261103000600`) and `due_reminders` (`20261102000100`) hard-code `eligible_count >= 12` for "ready"; both switch to `>= tester_slots`. Tests must cover: every app receives exactly kᵢ, every creator tests exactly kᵢ, no self-assignment or duplicates, all-12 slots matching ADR-007 for N = 13–15 and N > 16, mixed slots (e.g. one app at 12, the rest at 1) at N = 13, and pure-tester balancing against kᵢ.
- Reciprocity, badges and the Testing count are unchanged: they count apps a member tests, not slots.
- `docs/contract.md`: `create_app` and `update_app` gain `p_tester_slots` (see Building on ADR-011); `apps` rows expose `tester_slots`.
- PRD updates (done in PRD v2.4): FR-4 (new field), FR-18 (Ready to apply uses slots), §5.6–§5.8 and FR-31 (cohort demand kᵢ), §9 (column), §9.3 (RPC args).
- Public numbers become less uniform: "9 / 12" on one app and "2 / 3" on another. The list shows the slot count on every row so this stays readable.

## Building on ADR-011 (email-list testing)

ADR-011 is Accepted and merged to `main` (PR #6). This ADR is implemented on top of its schema and web changes.

- **Shared signatures.** ADR-011 recreates `create_app` (9 args, last `p_tester_method text default 'google_group'`) and `update_app` (10 args, last `p_tester_method text default null`). This ADR's migration drops exactly those signatures and recreates them with one more argument: `p_tester_slots smallint default 12` on `create_app`, `p_tester_slots smallint default null` (unchanged) on `update_app`. Out of 1–12 → `invalid-argument` (also enforced by the column check). All of ADR-011's logic in both functions (tester method, group confirmation, the unlock trigger) stays as is. The add-app and Edit app forms save both fields in one call.
- **Other database objects do not overlap.** ADR-011 replaces `join_as_tester`, `cohort_assignment_status` and `due_cohort_reminders`. This ADR replaces `start_cohort`, `close_cohort` and `due_reminders`, and adds a column to `apps`. Its migration is dated after `20261104000200`.
- **Email-list apps use slots the same way.** ADR-011's motivating case (8 of 12 testers already on an email list) is exactly "slots = 4". "Kurang N" and "Kursi penuh" count **Active** testers only. Members who asked to be listed but are not registered yet don't count; the email-list panel already shows them to the creator. "Full stays joinable" holds: the creator decides whether to list more requests.
- **Cohorts with email-list apps.** `start_cohort` creates kᵢ assignment rows as before, and ADR-011 §6 then sets each assignment's base time from `listed_at`, in `cohort_assignment_status`, which this ADR does not touch. A creator with fewer slots has fewer testers to list.
- **ADR-011's unlock rule** (Testing count ≥ 3) is unchanged: slots change how many apps a creator is assigned in a cohort (at least 3, since kᵢ ≥ 1 + 2), not how the Testing count is computed.
- **Web.** `AppForm.tsx`, `AppDetail.tsx`, `lib/data.ts`, `lib/types.ts` and `docs/contract.md` are changed starting from ADR-011's versions; the form shows the tester method and the slot count together.
- **Tests:** `tests/tester-slots.test.ts` runs with ADR-011's migrations applied. Existing `create_app` / `update_app` callers in `tests/` keep working through the defaults.
- **If ADR-011 is rejected:** this ADR is revised before implementation, adding `p_tester_slots` to main's `create_app` (8 args) and `update_app` (9 args) instead. Nothing else changes.

## Owner decisions (5 November 2026)

- **A. Minimum cohort size:** stays **13 apps**. Give-what-you-take would allow N ≥ max(kᵢ) + 1, but that is not adopted now.
- **B. Ready to apply wording:** the badge keeps the wording **"Siap ajukan"**, also for apps with fewer than 12 slots. The detail-page line from §4 explains the target.
- **C. Editing during a cohort:** **allowed.** Slot changes after Day 0 change only the app's progress target and Ready-to-apply state; assignments stay as generated (§5).
