-- Cohort RPCs, part 2 (plan task A4): start a cohort with the ring assignment
-- (FR-31–33, ADR-007) and join as a pure tester (FR-33a/b).
-- Contract: docs/contract.md (RPCs `start_cohort`, `join_cohort_as_tester`).

-- Assigns a pure tester 14 apps (all if fewer), fewest open assignments first,
-- ties random, never their own app or a deleted one (FR-33).
create function private.assign_pure_tester(p_cohort_id uuid, p_user_id uuid, p_at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.assignments (cohort_id, tester_user_id, app_id, assigned_at, created_at)
  select p_cohort_id, p_user_id, m.app_id, p_at, p_at
  from public.cohort_members m
  join public.apps ap on ap.id = m.app_id
  cross join lateral (
    select count(*) as n from public.assignments x
    where x.cohort_id = p_cohort_id and x.app_id = m.app_id and x.state = 'open'
  ) cov
  where m.cohort_id = p_cohort_id
    and m.app_id is not null
    and not ap.deleted
    and ap.creator_id <> p_user_id
  order by cov.n, random()
  limit 14;

  update public.cohort_members set assigned_at = p_at where cohort_id = p_cohort_id and user_id = p_user_id;
end;
$$;

create function public.start_cohort(p_cohort_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cohorts;
  n int;
  k int;
  started timestamptz := now();
  p record;
begin
  perform private.require_admin();
  c := private.lock_cohort(p_cohort_id);
  if c.status <> 'forming' then
    perform private.fail('failed-precondition', 'Cohort ini sudah dimulai.');
  end if;

  select count(*) into n from public.cohort_members where cohort_id = c.id and app_id is not null;
  if n < 13 then
    perform private.fail('failed-precondition',
      'Butuh minimal 13 aplikasi untuk memulai cohort. Sekarang baru ' || n || '.');
  end if;
  if exists (
    select 1 from public.cohort_members m join public.apps ap on ap.id = m.app_id
    where m.cohort_id = c.id and ap.deleted
  ) then
    perform private.fail('failed-precondition', 'Ada aplikasi anggota yang sudah dihapus. Keluarkan anggotanya dulu.');
  end if;

  -- Random ring order of the members who bring an app.
  update public.cohort_members m set ring_position = r.pos
  from (
    select user_id, (row_number() over (order by random()) - 1)::int as pos
    from public.cohort_members
    where cohort_id = c.id and app_id is not null
  ) r
  where m.cohort_id = c.id and m.user_id = r.user_id;

  -- FR-32: full mesh up to 16 apps (k = N − 1), ring of 14 above. The member at
  -- position i tests the apps at positions i+1 … i+k (mod N), so every app gets
  -- exactly k assigned testers.
  k := case when n <= 16 then n - 1 else 14 end;
  insert into public.assignments (cohort_id, tester_user_id, app_id, assigned_at, created_at)
  select c.id, t.user_id, o.app_id, started, started
  from public.cohort_members t
  join public.cohort_members o
    on o.cohort_id = t.cohort_id and o.app_id is not null
   and ((o.ring_position - t.ring_position + n) % n) between 1 and k
  where t.cohort_id = c.id and t.app_id is not null;

  -- FR-33: pure testers present at Day 0, one by one in random order.
  for p in
    select user_id from public.cohort_members where cohort_id = c.id and app_id is null order by random()
  loop
    perform private.assign_pure_tester(c.id, p.user_id, started);
  end loop;

  update public.cohort_members set assigned_at = started where cohort_id = c.id;
  update public.cohorts set status = 'active', day0_at = started where id = c.id;
end;
$$;

-- FR-33a: while Forming, or Active up to Day 7, so 14 days still end by the
-- Day 21 hard close. When Active, the apps are assigned at once and the
-- member's own 48 h opt-in window starts now (FR-33b).
create function public.join_cohort_as_tester(p_cohort_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  c public.cohorts := private.lock_cohort(p_cohort_id);
begin
  if c.status = 'closed' or (c.status = 'active' and now() > c.day0_at + interval '7 days') then
    perform private.fail('failed-precondition', 'Pendaftaran tester untuk cohort ini sudah ditutup (batasnya hari ke-7).');
  end if;
  if exists (select 1 from public.cohort_members where cohort_id = c.id and user_id = uid) then
    perform private.fail('already-exists', 'Kamu sudah jadi anggota cohort ini.');
  end if;
  if private.is_owing(uid) then
    perform private.fail('failed-precondition', 'Kamu masih Owing dari cohort sebelumnya. Hubungi admin untuk menyelesaikannya.');
  end if;

  insert into public.cohort_members (cohort_id, user_id) values (c.id, uid);
  if c.status = 'active' then
    perform private.assign_pure_tester(c.id, uid, now());
  end if;
end;
$$;

revoke all on function public.start_cohort(uuid), public.join_cohort_as_tester(uuid) from public;
grant execute on function public.start_cohort(uuid), public.join_cohort_as_tester(uuid) to anon, authenticated;
