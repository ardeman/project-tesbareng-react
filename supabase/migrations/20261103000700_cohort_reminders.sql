-- Cohort-day reminders for the daily digest (plan task A8, ADR-006, PRD FR-44/45/47).
-- due_reminders() (20261102000100_reminders.sql) keeps the non-cohort kinds; this
-- function adds the cohort-day kinds, and the send-reminders Edge Function merges both.
--
-- One row per member, kind and cohort, listing that member's apps, so a digest says
-- "opt in to these 12 apps" once instead of twelve times. ref_id = cohort id; the
-- reminder_log key (user_id, kind, ref_id, sent_on) stops a second send the same day.
--
-- "Day N" is counted from each assignment's assigned_at (Day 0, a late pure tester's
-- join, a reassigned slot), on the day the job runs (19:00 WIB, 12:00 UTC):
--   cohort_opt_in          Day 1 and 2: assigned apps not opted in yet (deadline b + 48 h)
--   cohort_feedback        Day 5: opted in, feedback not sent on Play yet
--   cohort_used_app        Day 7: "Sudah buka app" check-in or feedback still missing
--   cohort_still_opted_in  Day 13: "Masih opt-in" check-in missing
-- New builds stay in due_reminders() (kind new_build, any day).

create function public.due_cohort_reminders()
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
  with s as (
    select
      st.tester_user_id,
      st.cohort_id,
      c.name as cohort_name,
      ap.name as app,
      st.assigned_at,
      st.fulfilled,
      st.feedback_sent,
      st.used_app_at,
      st.still_opted_in_at,
      floor(extract(epoch from (now() - st.assigned_at)) / 86400)::int as day
    from public.cohort_assignment_status st
    join public.cohorts c on c.id = st.cohort_id and c.status = 'active'
    join public.apps ap on ap.id = st.app_id and not ap.deleted
    where st.state = 'open'
  ),
  due as (
    select tester_user_id, cohort_id, cohort_name, app, day, 'cohort_opt_in' as kind,
           assigned_at + interval '48 hours' as due_at
    from s where day in (1, 2) and not fulfilled
    union all
    select tester_user_id, cohort_id, cohort_name, app, day, 'cohort_feedback',
           assigned_at + interval '7 days'
    from s where day = 5 and fulfilled and not feedback_sent
    union all
    select tester_user_id, cohort_id, cohort_name, app, day, 'cohort_used_app',
           assigned_at + interval '7 days'
    from s where day = 7 and fulfilled and (used_app_at is null or not feedback_sent)
    union all
    select tester_user_id, cohort_id, cohort_name, app, day, 'cohort_still_opted_in',
           assigned_at + interval '13 days'
    from s where day = 13 and fulfilled and still_opted_in_at is null
  )
  select
    d.tester_user_id as user_id,
    u.email::text as full_email,
    p.display_name,
    d.kind,
    d.cohort_id as ref_id,
    d.cohort_name as app_name,
    jsonb_build_object(
      'day', min(d.day),
      'due_at', min(d.due_at),
      'apps', jsonb_agg(d.app order by d.app)
    ) as extra
  from due d
  join public.profiles p on p.id = d.tester_user_id and p.email_reminders
  join auth.users u on u.id = d.tester_user_id
  where not exists (
    select 1 from public.reminder_log rl
    where rl.user_id = d.tester_user_id
      and rl.kind = d.kind
      and rl.ref_id = d.cohort_id
      and rl.sent_on = current_date
  )
  group by d.tester_user_id, u.email, p.display_name, d.kind, d.cohort_id, d.cohort_name;
$$;

-- Only service_role may call this: it returns full email addresses (ADR-005).
revoke all on function public.due_cohort_reminders() from public, anon, authenticated;
grant execute on function public.due_cohort_reminders() to service_role;
