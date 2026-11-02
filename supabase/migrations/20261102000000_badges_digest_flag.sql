-- Slice 1: badges (PRD §6.7 FR-27g–l) and the email digest opt-out flag
-- (PRD §6.11 FR-46, §9.1). Counters stay computed (ADR-004): the badge is a
-- view column, never stored.

-- ---------------------------------------------------------------------------
-- Email digest opt-out. On by default. Changed only through set_email_reminders.
-- ---------------------------------------------------------------------------

alter table public.profiles add column email_reminders boolean not null default true;

create function public.set_email_reminders(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
begin
  if p_enabled is null then
    perform private.fail('invalid-argument', 'Pilihan pengingat email tidak valid.');
  end if;
  perform private.upsert_profile(uid);
  update public.profiles set email_reminders = p_enabled where id = uid;
end;
$$;

revoke all on function public.set_email_reminders(boolean) from public;
grant execute on function public.set_email_reminders(boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- profile_stats: apps tested to 14+ days, badge tier, next tier threshold.
-- Columns are appended so app_stats (which depends on this view) stays valid.
--
-- apps_tested_count: Active with now() - opted_in_at >= 14 days, or Left with
-- left_at - opted_in_at >= 14 days. Never Removed, never on deleted apps.
-- Tiers (FR-27h): none 0–2, bronze 3–6, silver 7–13, gold 14–24, platinum 25+.
-- next_tier_at: apps tested needed for the next tier; null at platinum.
-- ---------------------------------------------------------------------------

create or replace view public.profile_stats with (security_invoker = true) as
select
  p.id as profile_id,
  (select count(*) from public.apps a where a.creator_id = p.id and not a.deleted)::int as apps_created_count,
  coalesce(t.testing_count, 0)::int as testing_count,
  coalesce(t.feedback_sent_count, 0)::int as feedback_sent_count,
  coalesce(t.feedback_verified_count, 0)::int as feedback_verified_count,
  coalesce(t.apps_tested_count, 0)::int as apps_tested_count,
  case
    when coalesce(t.apps_tested_count, 0) >= 25 then 'platinum'
    when coalesce(t.apps_tested_count, 0) >= 14 then 'gold'
    when coalesce(t.apps_tested_count, 0) >= 7 then 'silver'
    when coalesce(t.apps_tested_count, 0) >= 3 then 'bronze'
    else 'none'
  end as badge_tier,
  case
    when coalesce(t.apps_tested_count, 0) >= 25 then null
    when coalesce(t.apps_tested_count, 0) >= 14 then 25
    when coalesce(t.apps_tested_count, 0) >= 7 then 14
    when coalesce(t.apps_tested_count, 0) >= 3 then 7
    else 3
  end::int as next_tier_at
from public.profiles p
left join lateral (
  select
    count(*) filter (
      where e.status = 'active'
         or (e.status = 'left' and e.left_at - e.opted_in_at >= interval '14 days')
    ) as testing_count,
    count(*) filter (where e.feedback_sent and e.status <> 'removed') as feedback_sent_count,
    count(*) filter (where e.feedback_verified and e.status <> 'removed') as feedback_verified_count,
    count(*) filter (
      where (e.status = 'active' and now() - e.opted_in_at >= interval '14 days')
         or (e.status = 'left' and e.left_at - e.opted_in_at >= interval '14 days')
    ) as apps_tested_count
  from public.testers e
  join public.apps a on a.id = e.app_id and not a.deleted
  where e.user_id = p.id
) t on true;

-- app_stats: append the creator's badge (FR-27j: badge on app cards).
create or replace view public.app_stats with (security_invoker = true) as
select
  a.id as app_id,
  coalesce(t.active_tester_count, 0)::int as active_tester_count,
  coalesce(t.eligible_count, 0)::int as eligible_count,
  coalesce(t.feedback_sent_count, 0)::int as feedback_sent_count,
  coalesce(t.feedback_verified_count, 0)::int as feedback_verified_count,
  coalesce(t.replied_count, 0)::int as replied_count,
  coalesce(b.build_count, 0)::int as build_count,
  b.last_build_at,
  coalesce(ps.testing_count, 0)::int as creator_testing_count,
  coalesce(ps.feedback_sent_count, 0)::int as creator_feedback_sent_count,
  coalesce(ps.feedback_verified_count, 0)::int as creator_feedback_verified_count,
  coalesce(ps.badge_tier, 'none') as creator_badge_tier
from public.apps a
left join lateral (
  select
    count(*) as active_tester_count,
    count(*) filter (where now() - e.opted_in_at >= interval '14 days') as eligible_count,
    count(*) filter (where e.feedback_sent) as feedback_sent_count,
    count(*) filter (where e.feedback_verified) as feedback_verified_count,
    count(*) filter (where e.replied) as replied_count
  from public.testers e
  where e.app_id = a.id and e.status = 'active'
) t on true
left join lateral (
  select count(*) as build_count, max(x.uploaded_at) as last_build_at
  from public.builds x
  where x.app_id = a.id
) b on true
left join public.profile_stats ps on ps.profile_id = a.creator_id;
