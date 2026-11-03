-- Cohort obligation views (plan task A5, PRD §9.2, FR-34/35/42).
-- Contract: docs/contract.md, "Cohort milestones", `cohort_assignment_status`, `cohort_obligations`.
--
-- Every assignment has a base time b = assigned_at. "Due Day N" = b + N × 24 h
-- (owner decision 2026-11-03). Milestones are judged at the as-of time
-- coalesce(closed_at, now()), so a closed cohort never judges a milestone that
-- fell due after the close, and check-ins or feedback after the close never count.
-- Computed, never stored (ADR-004); both views run as the caller.

create view public.cohort_assignment_status with (security_invoker = true) as
select
  a.id as assignment_id,
  a.cohort_id,
  a.tester_user_id,
  a.app_id,
  a.state,
  a.assigned_at,
  t.id as tester_id,
  t.status as tester_status,
  f.fulfilled,
  ci.used_app_at,
  ci.still_opted_in_at,
  fb.feedback_sent,
  fb.feedback_verified,
  bd.builds_due_count,
  bd.builds_updated_count,
  case
    when a.state = 'reassigned' then 'reassigned'
    when t.id is null then 'not_joined'
    when not f.fulfilled then 'left'
    when fb.feedback_verified then 'feedback_verified'
    when fb.feedback_sent then 'feedback_sent'
    when ci.used_app_at is not null then 'used'
    else 'opted_in'
  end as cell,
  m.behind_on,
  cardinality(m.behind_on) > 0 as is_behind
from public.assignments a
join public.cohorts c on c.id = a.cohort_id
cross join lateral (select coalesce(c.closed_at, now()) as as_of) x
left join public.testers t on t.app_id = a.app_id and t.user_id = a.tester_user_id
-- Fulfilled (FR-34): Active, or Left after 14+ days of testing.
cross join lateral (
  select coalesce(
    t.status = 'active' or (t.status = 'left' and t.left_at - t.opted_in_at >= interval '14 days'),
    false
  ) as fulfilled
) f
cross join lateral (
  select
    coalesce(t.feedback_sent and (t.feedback_sent_at is null or t.feedback_sent_at <= x.as_of), false) as feedback_sent,
    coalesce(t.feedback_verified, false) as feedback_verified
) fb
cross join lateral (
  select
    min(k.created_at) filter (where k.kind = 'used_app') as used_app_at,
    min(k.created_at) filter (where k.kind = 'still_opted_in') as still_opted_in_at
  from public.check_ins k
  where k.tester_id = t.id and k.created_at <= x.as_of
) ci
-- Builds logged after b whose 72 h have passed, and how many of them got an
-- "Sudah update" check-in.
cross join lateral (
  select
    count(*)::int as builds_due_count,
    count(*) filter (
      where exists (
        select 1 from public.check_ins k
        where k.tester_id = t.id and k.kind = 'updated_build' and k.build_id = b.id and k.created_at <= x.as_of
      )
    )::int as builds_updated_count
  from public.builds b
  where b.app_id = a.app_id
    and b.created_at > a.assigned_at
    and b.created_at + interval '72 hours' <= x.as_of
) bd
-- Milestones that are due and unmet (FR-42). Reassigned rows owe nothing.
cross join lateral (
  select case when a.state <> 'open' then '{}'::text[] else array_remove(array[
    case when a.assigned_at + interval '48 hours' <= x.as_of and not f.fulfilled then 'opt_in' end,
    case when a.assigned_at + interval '7 days' <= x.as_of and ci.used_app_at is null then 'used_app' end,
    case when a.assigned_at + interval '7 days' <= x.as_of and not fb.feedback_sent then 'feedback' end,
    case when a.assigned_at + interval '13 days' <= x.as_of and ci.still_opted_in_at is null then 'still_opted_in' end,
    case when bd.builds_updated_count < bd.builds_due_count then 'updated_build' end
  ], null) end as behind_on
) m;

create view public.cohort_obligations with (security_invoker = true) as
select
  cm.cohort_id,
  cm.user_id,
  cm.app_id,
  count(s.assignment_id)::int as assigned_count,
  count(s.assignment_id) filter (where s.fulfilled)::int as opted_in_count,
  count(s.assignment_id) filter (where s.used_app_at is not null)::int as used_app_count,
  count(s.assignment_id) filter (where s.feedback_sent)::int as feedback_sent_count,
  count(s.assignment_id) filter (where s.feedback_verified)::int as feedback_verified_count,
  count(s.assignment_id) filter (where s.still_opted_in_at is not null)::int as still_opted_in_count,
  coalesce(sum(s.builds_due_count), 0)::int as builds_due_count,
  coalesce(sum(s.builds_updated_count), 0)::int as builds_updated_count,
  -- Target rule for reassign_slot (FR-36); true when nothing is assigned yet.
  coalesce(bool_and(s.fulfilled), true) as all_fulfilled,
  coalesce(bool_or(s.is_behind), false) as is_behind,
  -- Drives the public "Belum tes" label on the member's own app (FR-35).
  coalesce(bool_or('opt_in' = any (s.behind_on)), false) as owes_opt_in
from public.cohort_members cm
left join public.cohort_assignment_status s
  on s.cohort_id = cm.cohort_id and s.tester_user_id = cm.user_id and s.state = 'open'
group by cm.cohort_id, cm.user_id, cm.app_id;

grant select on public.cohort_assignment_status, public.cohort_obligations to anon, authenticated, service_role;
