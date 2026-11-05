-- Cohort app requests (ADR-013, PRD FR-30a/FR-30b). A creator asks to bring one of
-- their apps into a Forming cohort; an admin approves (which adds them as with
-- add_cohort_member) or rejects with an optional reason. The admin can still add a
-- creator directly without a request. Contract: docs/contract.md.
--
-- One pending request per member at a time (partial unique index). A pending request
-- is closed automatically when its cohort leaves Forming ('expired') or when the
-- member joins that cohort by any route ('approved'), so a stale request never blocks
-- the member's next one.

create table public.cohort_requests (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references public.cohorts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  app_id      uuid not null references public.apps (id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'expired')),
  reason      text check (reason is null or char_length(reason) between 1 and 280),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles (id) on delete set null,
  check ((status = 'pending') = (decided_at is null)),
  check (reason is null or status = 'rejected')
);

create unique index cohort_requests_one_pending on public.cohort_requests (user_id) where status = 'pending';
create index cohort_requests_cohort on public.cohort_requests (cohort_id, status);

-- Reads: the member sees their own requests, the admin sees all. Writes: RPCs only (ADR-004).
alter table public.cohort_requests enable row level security;
create policy "own requests, admin sees all" on public.cohort_requests for select
  using (user_id = auth.uid() or public.is_admin());
revoke all on public.cohort_requests from anon, authenticated;
grant select on public.cohort_requests to authenticated;
grant all on public.cohort_requests to service_role;

-- ---------------------------------------------------------------------------
-- Auto-close pending requests
-- ---------------------------------------------------------------------------

create function private.close_requests_on_cohort_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cohort_requests
     set status = 'expired', decided_at = now()
   where cohort_id = new.id and status = 'pending';
  return new;
end;
$$;

create trigger cohort_requests_expire
  after update of status on public.cohorts
  for each row when (old.status = 'forming' and new.status <> 'forming')
  execute function private.close_requests_on_cohort_status();

create function private.close_requests_on_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Joined with an app (approve, or the admin added them directly): approved.
  -- Joined as a pure tester instead: the request no longer applies.
  update public.cohort_requests
     set status = case when new.app_id is not null then 'approved' else 'withdrawn' end,
         decided_at = now(), decided_by = auth.uid()
   where cohort_id = new.cohort_id and user_id = new.user_id and status = 'pending';
  return new;
end;
$$;

create trigger cohort_requests_member_added
  after insert on public.cohort_members
  for each row execute function private.close_requests_on_member();

-- A soft-deleted app cannot be approved; withdraw its pending request so it does not block the member.
create function private.close_requests_on_app_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cohort_requests
     set status = 'withdrawn', decided_at = now(), decided_by = new.creator_id
   where app_id = new.id and status = 'pending';
  return new;
end;
$$;

create trigger cohort_requests_app_deleted
  after update of deleted on public.apps
  for each row when (not old.deleted and new.deleted)
  execute function private.close_requests_on_app_delete();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.request_cohort_slot(p_cohort_id uuid, p_app_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  c public.cohorts := private.lock_cohort(p_cohort_id);
  a public.apps;
  rid uuid;
begin
  if c.status <> 'forming' then
    perform private.fail('failed-precondition', 'Pengajuan aplikasi hanya dibuka selama cohort masih Forming.');
  end if;
  if exists (select 1 from public.cohort_members where cohort_id = c.id and user_id = uid) then
    perform private.fail('already-exists', 'Anda sudah jadi anggota cohort ini.');
  end if;
  if private.is_owing(uid) then
    perform private.fail('failed-precondition', 'Anda masih Berutang dari cohort sebelumnya. Hubungi admin untuk menyelesaikannya.');
  end if;
  if exists (select 1 from public.cohort_requests where user_id = uid and status = 'pending') then
    perform private.fail('already-exists', 'Anda masih punya pengajuan yang menunggu. Batalkan dulu untuk mengajukan yang lain.');
  end if;

  select * into a from public.apps where id = p_app_id for update;
  if not found or a.deleted then
    perform private.fail('not-found', 'Aplikasi tidak ditemukan.');
  end if;
  if a.creator_id <> uid then
    perform private.fail('permission-denied', 'Anda hanya bisa mengajukan aplikasi milik Anda sendiri.');
  end if;
  if exists (
    select 1 from public.cohort_members m
    join public.cohorts oc on oc.id = m.cohort_id
    where m.app_id = a.id and oc.status <> 'closed'
  ) then
    perform private.fail('already-exists', 'Aplikasi ini sudah ada di cohort yang belum ditutup.');
  end if;

  insert into public.cohort_requests (cohort_id, user_id, app_id)
  values (c.id, uid, a.id)
  returning id into rid;
  return rid;
end;
$$;

create function public.withdraw_cohort_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  r public.cohort_requests;
begin
  select * into r from public.cohort_requests where id = p_request_id and user_id = uid for update;
  if not found then
    perform private.fail('not-found', 'Pengajuan tidak ditemukan.');
  end if;
  if r.status <> 'pending' then
    perform private.fail('failed-precondition', 'Pengajuan ini sudah tidak menunggu.');
  end if;
  update public.cohort_requests set status = 'withdrawn', decided_at = now(), decided_by = uid where id = r.id;
end;
$$;

-- Approve = add_cohort_member with the requested app; it re-checks everything
-- (Forming, not a member, not Owing, app owned and not in another open cohort),
-- and the member trigger marks the request approved.
create function public.approve_cohort_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.cohort_requests;
begin
  perform private.require_admin();
  select * into r from public.cohort_requests where id = p_request_id for update;
  if not found then
    perform private.fail('not-found', 'Pengajuan tidak ditemukan.');
  end if;
  if r.status <> 'pending' then
    perform private.fail('failed-precondition', 'Pengajuan ini sudah tidak menunggu.');
  end if;
  perform public.add_cohort_member(r.cohort_id, r.user_id, r.app_id);
end;
$$;

create function public.reject_cohort_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin();
  r public.cohort_requests;
  why text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if why is not null and char_length(why) > 280 then
    perform private.fail('invalid-argument', 'Alasan maksimal 280 karakter.');
  end if;
  select * into r from public.cohort_requests where id = p_request_id for update;
  if not found then
    perform private.fail('not-found', 'Pengajuan tidak ditemukan.');
  end if;
  if r.status <> 'pending' then
    perform private.fail('failed-precondition', 'Pengajuan ini sudah tidak menunggu.');
  end if;
  update public.cohort_requests
     set status = 'rejected', reason = why, decided_at = now(), decided_by = admin_id
   where id = r.id;
end;
$$;

revoke all on function
  public.request_cohort_slot(uuid, uuid),
  public.withdraw_cohort_request(uuid),
  public.approve_cohort_request(uuid),
  public.reject_cohort_request(uuid, text)
from public;
grant execute on function
  public.request_cohort_slot(uuid, uuid),
  public.withdraw_cohort_request(uuid),
  public.approve_cohort_request(uuid),
  public.reject_cohort_request(uuid, text)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daily digest for admins (ADR-006): one row per admin and Forming cohort with
-- pending requests, kind 'cohort_requests', ref_id = cohort id. Repeats daily
-- while requests wait; reminder_log stops a second send the same day.
-- ---------------------------------------------------------------------------

create function public.due_admin_reminders()
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
  with pending as (
    select r.cohort_id, c.name as cohort_name, ap.name as app, r.created_at
    from public.cohort_requests r
    join public.cohorts c on c.id = r.cohort_id and c.status = 'forming'
    join public.apps ap on ap.id = r.app_id and not ap.deleted
    where r.status = 'pending'
  )
  select
    p.id as user_id,
    u.email::text as full_email,
    p.display_name,
    'cohort_requests' as kind,
    pd.cohort_id as ref_id,
    pd.cohort_name as app_name,
    jsonb_build_object('count', count(*), 'apps', jsonb_agg(pd.app order by pd.created_at)) as extra
  from pending pd
  cross join public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'admin' and p.email_reminders
    and not exists (
      select 1 from public.reminder_log rl
      where rl.user_id = p.id and rl.kind = 'cohort_requests'
        and rl.ref_id = pd.cohort_id and rl.sent_on = current_date
    )
  group by p.id, u.email, p.display_name, pd.cohort_id, pd.cohort_name;
$$;

-- Only service_role may call this: it returns full email addresses (ADR-005).
revoke all on function public.due_admin_reminders() from public, anon, authenticated;
grant execute on function public.due_admin_reminders() to service_role;
