# ADR-002 — Backend: Supabase free plan instead of Firebase

|  |  |
| --- | --- |
| **Status** | Accepted (implemented) |
| **Decider** | Community Admin |
| **Date decided** | 31 October 2026 (recorded as an ADR 2 November 2026) |
| **Supersedes** | PRD v1.0 Firebase stack |
| **PRD ref** | PRD v2.2 §9, §11, changelog v2.0. Task brief: `docs/migrate_supabase.md` |

---

## Context

TesBareng v1 was built on Firebase: Firestore, Cloud Functions (callables for joining, masking and counters), Firestore rules, and the emulator suite (104 tests).

Two hard rules need server-side code that the client cannot bypass:

- the full email is never readable by other members (masking happens on the server);
- counters (testers, eligible, feedback, reciprocity) cannot be written by clients.

Deploying Cloud Functions requires Firebase's **Blaze** plan, and Blaze requires a **credit card**. The owner has none. Without functions, the hard rules cannot be enforced in production.

Constraints:

- No credit card, no monthly cost.
- Indonesian users, mostly on phones over 4G.
- One maintainer; small, mostly relational data (members, apps, testers, builds, cohorts, assignments).

## Decision

Move the whole backend to **Supabase, free plan**:

- **Postgres** for data, in region `ap-southeast-1` (Singapore, closest to Indonesia).
- **Row Level Security** for reads and **Postgres functions (RPC)** for every write (detailed in ADR-004).
- **Computed views** for counters (ADR-004).
- **Supabase Auth**, Google provider only, any Google account (Workspace accounts are valid Play testers). Email/password is enabled **locally only** for the `?devLogin` shortcut and must be disabled in production.
- **No Edge Functions**, unless something truly cannot be done in SQL. The one planned exception is email sending (ADR-006).
- Local development runs on the Supabase CLI stack (Docker). No hosted project exists yet; creating one is a manual owner step (PRD §11.4).

All Firebase code, config and dependencies were removed after the new test suite passed.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Stay on Firebase (Spark plan) with client-only logic | Masking and counters would rely on client code and Firestore rules alone. Rules cannot hide one field of a readable document or compute counters safely. Breaks the hard rules. |
| Firebase Blaze | Requires a credit card. |
| Self-hosted Postgres + small API on a free VPS/PaaS | More moving parts for one maintainer (API server, auth, backups, TLS). Free tiers of most PaaS also need a card or sleep aggressively. |
| PocketBase / Appwrite self-hosted | Same hosting problem as above. |

## Consequences

**Good**

- No card, no cost.
- Permission and data-integrity rules live in one place, the database, and are testable against the local stack (`tests/permissions.test.ts`, `tests/rpc.test.ts`, `tests/sql.test.ts`, `tests/progress.test.ts`).
- Relational data (cohorts, assignments, obligation matrix) fits SQL far better than documents.
- Smaller web bundle: Firebase's SDK was most of the 274 KB gzip main chunk.

**Costs and limits of the free plan** (PRD §11.2)

- The project **pauses after 7 days of inactivity**. While paused, the site cannot read data and `pg_cron` jobs (reminders) stop. Restore from the dashboard. Do not use cron as a keep-alive.
- **No automatic backups.** The admin exports the database manually after each cohort closes.
- 200 concurrent Realtime connections, so Realtime is used only on the app detail page.
- 500 MB database; Edge Functions have 2 s CPU per request.
- Most logic is in PL/pgSQL, which fewer contributors know than TypeScript. Migrations and tests are the safety net.

**Revisit when**

- the community outgrows the free plan limits, or a funded owner can pay for Supabase Pro (backups, no pausing);
- pausing causes a missed reminder during an active cohort.
