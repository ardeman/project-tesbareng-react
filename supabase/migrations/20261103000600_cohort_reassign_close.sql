-- Cohort RPCs, part 3 (plan task A7): move an unfulfilled slot (FR-36) and close
-- a cohort (FR-37, Day 21 hard close, owner decisions 2026-11-03).
-- Contract: docs/contract.md (RPCs `reassign_slot`, `close_cohort`).

create function public.reassign_slot(p_assignment_id uuid, p_to_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assignments;
  c public.cohorts;
  new_id uuid;
begin
  perform private.require_admin();
  select * into a from public.assignments where id = p_assignment_id;
  if not found then
    perform private.fail('not-found', 'Penugasan tidak ditemukan.');
  end if;
  c := private.lock_cohort(a.cohort_id);
  select * into a from public.assignments where id = p_assignment_id for update;

  if c.status <> 'active' then
    perform private.fail('failed-precondition', 'Penugasan hanya bisa dipindahkan saat cohort sedang berjalan.');
  end if;
  if a.state <> 'open' then
    perform private.fail('failed-precondition', 'Penugasan ini sudah dipindahkan.');
  end if;
  if (select s.fulfilled from public.cohort_assignment_status s where s.assignment_id = a.id) then
    perform private.fail('failed-precondition', 'Penugasan ini sudah dipenuhi, tidak perlu dipindahkan.');
  end if;

  if not exists (select 1 from public.cohort_members where cohort_id = c.id and user_id = p_to_user_id) then
    perform private.fail('not-found', 'Anggota tujuan tidak ada di cohort ini.');
  end if;
  if p_to_user_id = a.tester_user_id then
    perform private.fail('invalid-argument', 'Pilih anggota lain sebagai tujuan.');
  end if;
  if exists (select 1 from public.apps where id = a.app_id and creator_id = p_to_user_id) then
    perform private.fail('invalid-argument', 'Kreator tidak bisa ditugaskan ke aplikasinya sendiri.');
  end if;
  if not (select o.all_fulfilled from public.cohort_obligations o where o.cohort_id = c.id and o.user_id = p_to_user_id) then
    perform private.fail('failed-precondition', 'Anggota tujuan belum memenuhi semua tugasnya sendiri.');
  end if;
  if exists (
    select 1 from public.assignments
    where cohort_id = c.id and tester_user_id = p_to_user_id and app_id = a.app_id
  ) then
    perform private.fail('already-exists', 'Anggota tujuan sudah ditugaskan ke aplikasi ini.');
  end if;

  insert into public.assignments (cohort_id, tester_user_id, app_id, assigned_at, created_at)
  values (c.id, p_to_user_id, a.app_id, now(), now())
  returning id into new_id;
  update public.assignments set state = 'reassigned', reassigned_to = new_id where id = a.id;
  return new_id;
end;
$$;

-- Closes when every app is Ready to apply (12 eligible testers), or from Day 21
-- whatever the state. Standing is judged now, with the cohort_assignment_status
-- rules: Owing if any open assignment has a milestone due and unmet. Slots on an
-- app that was soft-deleted during the cohort cannot be fulfilled, so they never
-- make anyone Owing. Nothing closes a cohort automatically.
create function public.close_cohort(p_cohort_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cohorts;
  closing timestamptz := now();
begin
  perform private.require_admin();
  c := private.lock_cohort(p_cohort_id);
  if c.status <> 'active' then
    perform private.fail('failed-precondition', 'Hanya cohort yang sedang berjalan yang bisa ditutup.');
  end if;
  if closing < c.day0_at + interval '21 days' and exists (
    select 1
    from public.cohort_members m
    join public.apps ap on ap.id = m.app_id and not ap.deleted
    join public.app_stats st on st.app_id = ap.id
    where m.cohort_id = c.id and st.eligible_count < 12
  ) then
    perform private.fail('failed-precondition',
      'Sebelum hari ke-21, cohort hanya bisa ditutup kalau semua aplikasi sudah siap diajukan (12 tester lulus 14 hari).');
  end if;

  update public.cohort_members m set standing = case
    when exists (
      select 1
      from public.cohort_assignment_status s
      join public.apps ap on ap.id = s.app_id and not ap.deleted
      where s.cohort_id = c.id and s.tester_user_id = m.user_id and s.state = 'open' and s.is_behind
    ) then 'owing'
    else 'good'
  end
  where m.cohort_id = c.id;

  update public.cohorts set status = 'closed', closed_at = closing where id = c.id;
end;
$$;

revoke all on function public.reassign_slot(uuid, uuid), public.close_cohort(uuid) from public;
grant execute on function public.reassign_slot(uuid, uuid), public.close_cohort(uuid) to anon, authenticated;
