-- Milestone check-ins (plan task A6, PRD §6.10, FR-39–41).
-- Contract: docs/contract.md (RPC `check_in`, "Cohort milestones").
--
-- Windows open at b + 5 days ("Sudah buka app") and b + 12 days ("Masih
-- opt-in"); "Sudah update" opens when the build is logged. b is the open
-- assignment's assigned_at when the app is in a non-closed cohort assigned to
-- the caller, else the tester's own opted_in_at (FR-40). Late check-ins are allowed.

create function public.check_in(p_app_id uuid, p_kind text, p_build_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps := private.live_app(p_app_id);
  t public.testers;
  base timestamptz;
  new_id uuid;
begin
  if p_kind is null or p_kind not in ('used_app', 'updated_build', 'still_opted_in') then
    perform private.fail('invalid-argument', 'Jenis check-in tidak valid.');
  end if;

  select * into t from public.testers where app_id = a.id and user_id = uid for update;
  if not found then
    perform private.fail('not-found', 'Kamu belum terdaftar sebagai tester aplikasi ini.');
  end if;
  if t.status <> 'active' then
    perform private.fail('failed-precondition', 'Check-in hanya untuk tester yang masih aktif.');
  end if;

  if p_kind = 'updated_build' then
    if p_build_id is null then
      perform private.fail('invalid-argument', 'Pilih build yang sudah kamu pasang.');
    end if;
    if not exists (select 1 from public.builds where id = p_build_id and app_id = a.id) then
      perform private.fail('invalid-argument', 'Build ini bukan milik aplikasi tersebut.');
    end if;
  elsif p_build_id is not null then
    perform private.fail('invalid-argument', 'Check-in ini tidak memakai build.');
  end if;

  select x.assigned_at into base
  from public.assignments x
  join public.cohorts c on c.id = x.cohort_id
  where x.app_id = a.id and x.tester_user_id = uid and x.state = 'open' and c.status <> 'closed'
  order by x.assigned_at desc
  limit 1;
  base := coalesce(base, t.opted_in_at);

  if p_kind = 'used_app' and now() < base + interval '5 days' then
    perform private.fail('failed-precondition', 'Check-in "Sudah buka app" dibuka mulai hari ke-5.');
  end if;
  if p_kind = 'still_opted_in' and now() < base + interval '12 days' then
    perform private.fail('failed-precondition', 'Check-in "Masih opt-in" dibuka mulai hari ke-12.');
  end if;

  if exists (
    select 1 from public.check_ins
    where tester_id = t.id and kind = p_kind and build_id is not distinct from p_build_id
  ) then
    perform private.fail('already-exists', 'Kamu sudah check-in untuk ini.');
  end if;

  insert into public.check_ins (tester_id, kind, build_id) values (t.id, p_kind, p_build_id)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.check_in(uuid, text, uuid) from public;
grant execute on function public.check_in(uuid, text, uuid) to anon, authenticated;
