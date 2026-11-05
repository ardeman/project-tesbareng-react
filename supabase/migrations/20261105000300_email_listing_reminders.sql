-- Email-list reminders for the daily digest (ADR-011, ADR-006, PRD FR-45).
--   email_listing_pending  to the creator, per app: members who asked to be added to the
--                          Play Console email list and are not marked added yet. Daily
--                          until marked (same cadence as cohort_requests).
--   email_listing_added    to the tester, per app: the creator marked them added in the
--                          last 24 h and they have not joined as tester yet, so they can
--                          opt in now. The job runs once a day, so this goes out once.
-- ref_id = app id; reminder_log stops a second send the same day.

create function public.due_listing_reminders()
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
  with live as (
    -- Same rows the creator sees in app_email_listings: skip Left or Removed entries.
    select l.app_id, l.user_id, l.requested_at, l.listed_at, a.name as app, a.creator_id, p.display_name as tester_name,
           t.status as tester_status
    from public.email_listings l
    join public.apps a on a.id = l.app_id and not a.deleted
    join public.profiles p on p.id = l.user_id
    left join public.testers t on t.app_id = l.app_id and t.user_id = l.user_id
    where t.status is null or t.status not in ('left', 'removed')
  ),
  due as (
    select creator_id as to_user, 'email_listing_pending' as kind, app_id, app,
           jsonb_build_object('count', count(*), 'names', jsonb_agg(tester_name order by requested_at)) as extra
    from live where listed_at is null
    group by creator_id, app_id, app
    union all
    select user_id, 'email_listing_added', app_id, app, '{}'::jsonb
    from live
    where listed_at > now() - interval '24 hours' and tester_status is null
  )
  select d.to_user, u.email::text, p.display_name, d.kind, d.app_id, d.app, d.extra
  from due d
  join public.profiles p on p.id = d.to_user and p.email_reminders
  join auth.users u on u.id = d.to_user
  where not exists (
    select 1 from public.reminder_log rl
    where rl.user_id = d.to_user and rl.kind = d.kind and rl.ref_id = d.app_id and rl.sent_on = current_date
  );
$$;

-- Only service_role may call this: it returns full email addresses (ADR-005).
revoke all on function public.due_listing_reminders() from public, anon, authenticated;
grant execute on function public.due_listing_reminders() to service_role;
