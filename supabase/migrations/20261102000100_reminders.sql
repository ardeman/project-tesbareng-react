-- ADR-006: daily email digest via Gmail SMTP from one Edge Function.
-- This migration adds:
--   1. pg_cron and pg_net extensions (needed for the scheduled HTTP call).
--   2. reminder_log table (idempotency guard, service role only).
--   3. due_reminders() — returns pending to-dos per member; service role only.
-- The pg_cron job that POSTs to the Edge Function is created in the snippet
-- below but needs the deployed function URL set in SUPABASE_URL; run it after
-- the first deploy (see supabase/snippets/setup_cron.sql).

create extension if not exists pg_cron   with schema extensions;
create extension if not exists pg_net    with schema net;

-- ---------------------------------------------------------------------------
-- reminder_log: one row per (user, kind, ref, day). Unique constraint is the
-- idempotency guard (FR-47). No client access; service role bypasses RLS.
-- ---------------------------------------------------------------------------

create table public.reminder_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  ref_id     uuid,             -- build_id, tester_id, app_id, or null
  sent_on    date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_id, sent_on)
);

create unique index reminder_log_null_ref_key
  on public.reminder_log (user_id, kind, sent_on)
  where ref_id is null;

create index reminder_log_user_day_idx on public.reminder_log (user_id, sent_on);

alter table public.reminder_log enable row level security;
-- No RLS policies: anon/authenticated never reach this table.
revoke all on public.reminder_log from anon, authenticated;
grant all on public.reminder_log to service_role;

-- ---------------------------------------------------------------------------
-- due_reminders(): returns one row per (member, reminder kind, ref).
-- Skips members who opted out (email_reminders = false).
-- Skips any (user_id, kind, ref_id, sent_on) already in reminder_log.
-- Service role only; never called from the client.
--
-- Kinds implemented now (non-cohort, requires only existing schema):
--   new_build         — new build on an app the member actively tests
--   unreplied_feedback — creator has verified feedback unreplied for > 3 days
--   app_eligible      — creator's app just crossed 12 eligible testers
--
-- Cohort-day kinds (Day 1/2/5/7/13) are added when ADR-007 is implemented.
-- ---------------------------------------------------------------------------

create function public.due_reminders()
returns table (
  user_id      uuid,
  full_email   text,
  display_name text,
  kind         text,
  ref_id       uuid,
  app_name     text,
  extra        jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  -- new_build: build posted in the last 24 h on an app the member actively tests.
  select
    t.user_id,
    u.email::text  as full_email,
    p.display_name,
    'new_build'    as kind,
    b.id           as ref_id,
    a.name         as app_name,
    jsonb_build_object(
      'version_name', b.version_name,
      'changelog',    b.changelog
    )              as extra
  from public.builds b
  join public.apps a on a.id = b.app_id and not a.deleted
  join public.testers t on t.app_id = b.app_id and t.status = 'active' and t.user_id is not null
  join public.profiles p on p.id = t.user_id and p.email_reminders
  join auth.users u on u.id = t.user_id
  where b.created_at >= now() - interval '24 hours'
    -- not the creator of this app
    and t.user_id <> a.creator_id
    -- not already logged today
    and not exists (
      select 1 from public.reminder_log rl
      where rl.user_id = t.user_id
        and rl.kind = 'new_build'
        and rl.ref_id = b.id
        and rl.sent_on = current_date
    )

  union all

  -- unreplied_feedback: creator has verified feedback not replied to for > 3 days.
  select
    a.creator_id   as user_id,
    u.email::text  as full_email,
    p.display_name,
    'unreplied_feedback' as kind,
    t.id           as ref_id,
    a.name         as app_name,
    jsonb_build_object(
      'tester_name',       t.display_name,
      'feedback_summary',  t.feedback_summary
    )              as extra
  from public.testers t
  join public.apps a on a.id = t.app_id and not a.deleted
  join public.profiles p on p.id = a.creator_id and p.email_reminders
  join auth.users u on u.id = a.creator_id
  where t.feedback_verified
    and not t.replied
    and t.feedback_sent_at is not null
    and t.feedback_sent_at <= now() - interval '3 days'
    and t.status = 'active'
    and not exists (
      select 1 from public.reminder_log rl
      where rl.user_id = a.creator_id
        and rl.kind = 'unreplied_feedback'
        and rl.ref_id = t.id
        and rl.sent_on = current_date
    )

  union all

  -- app_eligible: creator's app just crossed 12 eligible testers (FR-45, FR-44).
  -- "Just crossed" = eligible_count is now >= 12 and this kind+ref never logged before.
  select
    a.creator_id as user_id,
    u.email::text as full_email,
    p.display_name,
    'app_eligible' as kind,
    a.id           as ref_id,
    a.name         as app_name,
    jsonb_build_object(
      'eligible_count', stats.eligible_count
    )              as extra
  from public.app_stats stats
  join public.apps a on a.id = stats.app_id and not a.deleted
  join public.profiles p on p.id = a.creator_id and p.email_reminders
  join auth.users u on u.id = a.creator_id
  where stats.eligible_count >= 12
    and not exists (
      select 1 from public.reminder_log rl
      where rl.user_id = a.creator_id
        and rl.kind = 'app_eligible'
        and rl.ref_id = a.id
        -- no sent_on filter: this is a one-time notification per app
    );
$$;

-- Only service_role may call this.
revoke all on function public.due_reminders() from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;
