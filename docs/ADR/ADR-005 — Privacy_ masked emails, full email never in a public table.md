# ADR-005 — Privacy: masked emails, full email never in a public table

|  |  |
| --- | --- |
| **Status** | Accepted (implemented) |
| **Decider** | Community Admin |
| **Date decided** | 31 October 2026 (masking format); recorded as an ADR 2 November 2026 |
| **PRD ref** | PRD v2.2 §8, §17 Q2. Also `CLAUDE.md` hard rules 1–2 |
| **Code** | `public.mask_email()` and the `masked_email` check constraints in `supabase/migrations/20261101000000_schema.sql` |

---

## Context

Testers join each other's closed tests with their Google account. The tester table is public (PRD §7), because transparency is the point of TesBareng. Members still need to tell entries apart and match them to Play Console, but publishing full Gmail addresses to the whole internet invites spam and scraping.

Postgres RLS works per **row**, not per **column**. Any column in a table that the public may read is readable by everyone. "Hide the email column from other users" is not possible with RLS alone.

## Decision

1. **No public table or view has a full-email column.** Full emails live only in `auth.users`, which the Supabase API does not expose.
2. Only `security definer` functions read `auth.users.email`, and only to mask it (profile creation and refresh) or, later, to send reminders with the service role (ADR-006).
3. **Masking format:** first 2 characters of the local part (fewer if the local part is shorter), then exactly `*****`, then `@domain`. The address is trimmed and lower-cased first; the last `@` splits local part and domain.

   | Original | Masked |
   | --- | --- |
   | `budi.santoso@gmail.com` | `bu*****@gmail.com` |
   | `ab@gmail.com` | `ab*****@gmail.com` |
   | `a@company.co.id` | `a*****@company.co.id` |

   The fixed five stars hide the length of the local part. This format overrode an earlier PRD example (decision 31 October 2026).
4. **Masked for everyone, including the creator** of the app. Creators manage testers through the shared Google Group in Play Console, so they do not need full emails.
5. **Manually added testers:** the creator's typed email is masked inside `add_manual_tester` and the original is discarded, never stored.
6. **Defence in depth:** `masked_email` columns carry a check constraint (`^[^@\s]{1,2}\*{5}@[^@\s]+$`), so even a buggy function cannot store a full address.
7. **Other personal data:** phone numbers are never collected. Cohort WhatsApp links will live in `cohort_links` (planned with cohorts, ADR-007), readable only by cohort members and the admin. Avatars are the member's Google photo.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Store full email in a private table with owner-only RLS | Works, but adds a second copy of personal data for no current need. Allowed later only if a feature truly needs it (`docs/migrate_supabase.md`). |
| Show full emails to the app's creator only | Open question PRD §17 Q2. Needs a per-viewer view or RPC and widens exposure. Not done until the owner decides. |
| Show display names only, no email at all | Members could not tell two "Budi"s apart or match entries to Play Console. |
| Hash the email | Not human-readable, and common Gmail addresses are easy to brute-force from a hash. |

## Consequences

- Creators match testers in Play Console by name, photo and the masked prefix and domain. Two members with the same first two letters and domain look alike; display name and photo resolve it.
- Any new table or view must be checked for email columns before merge. `tests/permissions.test.ts` asserts the full email is unreadable by every role.
- If PRD §17 Q2 is answered "yes, creators see full emails", this ADR must be superseded with a new design (per-caller RPC, never a public column).
- The masking rule is fixed. Changing it means a data migration of every stored `masked_email`.
