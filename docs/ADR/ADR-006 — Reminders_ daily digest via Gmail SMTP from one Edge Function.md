# ADR-006 — Reminders: daily digest via Gmail SMTP from one Edge Function

|  |  |
| --- | --- |
| **Status** | Accepted — **not yet implemented** |
| **Decider** | Community Admin |
| **Date** | 2 November 2026 |
| **PRD ref** | PRD v2.2 §6.11 (FR-44 to FR-48), §11.1, §11.2, §11.4 steps 5–6 |

---

## Context

Cohorts only work if members hit their milestones (opt-in by Day 2, use the app and send feedback by Day 7, still opted in on Day 13). People forget. The community already lives in WhatsApp, but TesBareng cannot send WhatsApp messages for free, and the official WhatsApp Business API costs money and needs business verification.

Constraints:

- No credit card and no paid service (ADR-002).
- No custom domain yet.
- Postgres cannot speak SMTP; `pg_net` only makes HTTP calls.
- Supabase Edge Functions block outgoing connections on ports 25 and 587.
- At most one email per member per day (FR-44), with an opt-out (FR-46).

## Decision

1. **One daily digest email per member** with pending to-dos, at **19:00 WIB** (12:00 UTC). Content per PRD FR-45.
2. **Flow:** `pg_cron` → `pg_net` HTTP POST → Edge Function **`send-reminders`** → calls `due_reminders()` (executable by the service role only) → builds one digest per member → sends → writes `reminder_log`.
3. The Edge Function has JWT verification **off**; it checks a **shared secret** instead, stored in Supabase Vault / function secrets. This is the only Edge Function in the project and the only exception to "logic stays in SQL" (ADR-002).
4. **SMTP:** Gmail, from a dedicated community account (e.g. `tesbarengindonesia@gmail.com`) with 2-Step Verification and an **App Password**, via `smtp.gmail.com:465` (implicit TLS).
5. **Idempotency:** `reminder_log` has `unique (user_id, kind, ref_id, sent_on)`, so a retried run never sends the same reminder twice on one day (FR-47).
6. **WhatsApp stays manual:** the admin panel builds a ready-to-copy Indonesian message naming Behind members (FR-48); the admin pastes it into the cohort group.
7. **Local:** SMTP points at the mail catcher that `supabase start` runs. Never send real email from local.

## Alternatives considered

| Option | Why not (for now) |
| --- | --- |
| Transactional email service (Resend, Postmark, SES, Brevo) | Better deliverability, but needs a verified custom domain, and most need a card or have tight free tiers. Best upgrade path once a domain exists. |
| Supabase Auth's built-in SMTP | Only for auth emails (magic link, reset), not custom digests. |
| WhatsApp Business API | Paid, needs business verification. |
| Web push | Works on Android; on iPhone only after installing the PWA. Planned for Phase 2 (PRD §14). |
| No reminders, WhatsApp only | Depends entirely on the admin's time, and members miss group messages. |

## Consequences

- **Deliverability is weaker** than a dedicated service. Gmail may file digests in Promotions or Spam; the About page asks members to add the sender to contacts.
- **Gmail sending cap** (about 500 recipients a day for a personal account). One digest per member keeps the community far below it; if membership approaches a few hundred active members, move to a transactional service.
- **Single point of failure:** if the Gmail account is locked, or Google revokes the App Password, reminders stop silently. The function should log failures, and the admin panel should show the last successful run.
- **Free-plan pausing** (ADR-002): if the Supabase project pauses, cron stops and nobody is reminded. During an active cohort, someone must use the site at least weekly.
- **Secrets:** the App Password and shared secret live only in function secrets / Vault, never in the repo or `.env.example` values.
- Implementation needs: `due_reminders()` with tests for each FR-45 trigger, the `reminder_log` table, the Edge Function, a `set_email_reminders` RPC, and an unsubscribe link in every email (FR-46).
