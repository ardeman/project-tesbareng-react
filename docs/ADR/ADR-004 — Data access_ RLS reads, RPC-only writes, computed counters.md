# ADR-004 — Data access: RLS reads, RPC-only writes, computed counters

|  |  |
| --- | --- |
| **Status** | Accepted (implemented) |
| **Decider** | Community Admin |
| **Date decided** | 31 October 2026 (recorded as an ADR 2 November 2026) |
| **PRD ref** | PRD v2.2 §7, §9.2, §9.3, §9.4. Also `CLAUDE.md` hard rules 3–5, `docs/contract.md` |
| **Code** | `supabase/migrations/20261101000000_schema.sql`, `supabase/migrations/20261101000100_rpc.sql` |

---

## Context

TesBareng is a public, trust-based tracker. Its numbers (12 eligible testers, 14 days, feedback verified, reciprocity, badges) only matter if nobody can fake them. The web client talks to Postgres directly through `supabase-js` with the public anon key, so anything the database allows, any visitor can do from a browser console.

Postgres RLS is good at **which rows** a role may touch, but it cannot say "a tester may update `feedback_sent` but not `feedback_verified` on the same row". Column-level grants could, but they get hard to read once rules depend on who the caller is (tester, creator, admin).

## Decision

1. **Reads:** every table has RLS. Most tables are public read (PRD §7: visitors see apps, testers, builds, profiles). Exceptions: `apps` hides `deleted = true` rows from everyone but the admin. Planned with cohorts and reminders (not in the migrations yet): `cohort_links` readable only by cohort members and the admin; `reminder_log` with no client access.
2. **Writes:** `insert`, `update` and `delete` are **revoked** on every table from `anon` and `authenticated`. Every write goes through a `security definer` Postgres function (RPC) with `set search_path = ''` and fully qualified names. Each RPC checks the caller, the permissions matrix, validation and rate limits in one place.
3. **Helpers** live in a `private` schema with all privileges revoked from `public`, `anon` and `authenticated`, so clients cannot call them.
4. **Admin** is `profiles.role = 'admin'`, read by `is_admin()`. No client-callable function can change a role; the owner sets it in SQL.
5. **Counters are computed, never stored.** `app_stats`, `profile_stats` and (with cohorts) `cohort_obligations` are views with `security_invoker = true`. There are no counter columns and no triggers that fan out updates. Days active per tester stays a client calculation.
6. **Check constraints** repeat the RPC validation (lengths, URL prefixes, package name, masked email format), so a bug in one function still cannot store bad data.
7. **Rate limits** run inside the RPC under a per-user or per-app `pg_advisory_xact_lock`, so two parallel calls cannot both pass the count (5 apps per user and 10 builds per app per rolling 24 h).
8. **Errors:** RPCs raise `P0001` with an Indonesian `message` shown as-is and a code in `hint` (`unauthenticated`, `invalid-argument`, `not-found`, `permission-denied`, `already-exists`, `failed-precondition`, `resource-exhausted`). The client maps the code; raw Postgres text never reaches the UI.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Direct table writes with RLS `with check` policies | Cannot restrict columns per caller cleanly (tester vs creator vs admin on the same `testers` row). Rules get scattered across policies and are hard to test. |
| Column-level grants + RLS | Grants are per role, not per relationship (creator of *this* app). Still needs functions for masking and rate limits. |
| Stored counters updated by triggers | Drift risk, trigger fan-out on every write, and one more thing a bug can corrupt. Data is small, so views are fast enough. |
| A separate API server (Edge Functions or Node) | Extra deploy target and cold starts; ADR-002 keeps logic in SQL. |

## Consequences

- One place to audit permissions: the RPC file. `tests/permissions.test.ts` proves every direct table write is denied; `tests/rpc.test.ts` covers each RPC with each error code and rate limit.
- Every new write path needs a new RPC, a matching row in `docs/contract.md`, and tests. "Change both sides together" (`docs/contract.md`).
- `security definer` functions run with the owner's rights. A missing caller or ownership check is a privilege bug, so reviews of `*_rpc.sql` must check `private.caller()` and `private.require_manager()` usage on every function.
- Views recompute on every read. If tables grow large, add indexes first; consider materialised views only with a measured need.
- Business logic is in PL/pgSQL. The client keeps `web/src/lib/validate.ts` as a mirror for instant form feedback only, never as the authority.
