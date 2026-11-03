-- Cohort RPCs, part 1 (plan task A2): forming a cohort, its members, the
-- WhatsApp link and settling Owing members. Starting, joining as a pure tester,
-- reassigning and closing need the assignment rules and the obligation views and
-- come in later migrations. Contract: docs/contract.md (RPCs).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.require_admin()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := private.caller();
begin
  if not exists (select 1 from public.profiles where id = uid and role = 'admin') then
    perform private.fail('permission-denied', 'Hanya admin yang bisa mengatur cohort.');
  end if;
  return uid;
end;
$$;

-- The cohort row, locked for the rest of the transaction so membership and
-- status changes on one cohort run one at a time.
create function private.lock_cohort(p_cohort_id uuid)
returns public.cohorts
language plpgsql
set search_path = ''
as $$
declare
  c public.cohorts;
begin
  select * into c from public.cohorts where id = p_cohort_id for update;
  if not found then
    perform private.fail('not-found', 'Cohort tidak ditemukan.');
  end if;
  return c;
end;
$$;

-- Owing in any cohort blocks joining the next one until the admin settles it (FR-37).
create function private.is_owing(uid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.cohort_members where user_id = uid and standing = 'owing');
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.create_cohort(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform private.require_admin();
  insert into public.cohorts (name) values (private.req_text(p_name, 'Nama cohort', 50))
  returning id into new_id;
  return new_id;
end;
$$;

create function public.add_cohort_member(p_cohort_id uuid, p_user_id uuid, p_app_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cohorts;
  a public.apps;
begin
  perform private.require_admin();
  c := private.lock_cohort(p_cohort_id);
  if c.status <> 'forming' then
    perform private.fail('failed-precondition', 'Anggota hanya bisa ditambahkan selama cohort masih Forming.');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.fail('not-found', 'Anggota tidak ditemukan.');
  end if;
  if exists (select 1 from public.cohort_members where cohort_id = c.id and user_id = p_user_id) then
    perform private.fail('already-exists', 'Anggota ini sudah ada di cohort.');
  end if;
  if private.is_owing(p_user_id) then
    perform private.fail('failed-precondition', 'Anggota ini masih Owing dari cohort sebelumnya. Tandai Settled dulu.');
  end if;

  if p_app_id is not null then
    -- Lock the app so two cohorts cannot take it at the same time.
    select * into a from public.apps where id = p_app_id for update;
    if not found or a.deleted then
      perform private.fail('not-found', 'Aplikasi tidak ditemukan.');
    end if;
    if a.creator_id <> p_user_id then
      perform private.fail('invalid-argument', 'Aplikasi ini bukan milik anggota tersebut.');
    end if;
    -- An app is in at most one non-closed cohort (FR-30).
    if exists (
      select 1 from public.cohort_members m
      join public.cohorts oc on oc.id = m.cohort_id
      where m.app_id = a.id and oc.status <> 'closed'
    ) then
      perform private.fail('already-exists', 'Aplikasi ini sudah ada di cohort yang belum ditutup.');
    end if;
  end if;

  insert into public.cohort_members (cohort_id, user_id, app_id) values (c.id, p_user_id, p_app_id);
end;
$$;

create function public.remove_cohort_member(p_cohort_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cohorts;
begin
  perform private.require_admin();
  c := private.lock_cohort(p_cohort_id);
  if c.status <> 'forming' then
    perform private.fail('failed-precondition', 'Anggota hanya bisa dikeluarkan selama cohort masih Forming.');
  end if;
  delete from public.cohort_members where cohort_id = c.id and user_id = p_user_id;
  if not found then
    perform private.fail('not-found', 'Anggota ini tidak ada di cohort.');
  end if;
end;
$$;

-- A pure tester leaves on their own, only before Day 0 (owner decision 2026-11-03).
create function public.leave_cohort(p_cohort_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  c public.cohorts := private.lock_cohort(p_cohort_id);
  m public.cohort_members;
begin
  select * into m from public.cohort_members where cohort_id = c.id and user_id = uid;
  if not found then
    perform private.fail('not-found', 'Kamu bukan anggota cohort ini.');
  end if;
  if m.app_id is not null then
    perform private.fail('permission-denied', 'Kreator tidak bisa keluar sendiri dari cohort. Hubungi admin.');
  end if;
  if c.status <> 'forming' then
    perform private.fail('failed-precondition', 'Kamu hanya bisa keluar sebelum cohort dimulai.');
  end if;
  delete from public.cohort_members where cohort_id = c.id and user_id = uid;
end;
$$;

create function public.set_cohort_link(p_cohort_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cohorts;
  url text := private.trim_ws(p_url);
begin
  perform private.require_admin();
  c := private.lock_cohort(p_cohort_id);
  if url is null or url = '' then
    delete from public.cohort_links where cohort_id = c.id;
    return;
  end if;
  if char_length(url) > 500 or url !~ '^https://chat\.whatsapp\.com/\S+$' then
    perform private.fail('invalid-argument', 'Link grup WhatsApp harus diawali https://chat.whatsapp.com/');
  end if;
  insert into public.cohort_links (cohort_id, whatsapp_group_url, updated_at) values (c.id, url, now())
  on conflict (cohort_id) do update set whatsapp_group_url = excluded.whatsapp_group_url, updated_at = now();
end;
$$;

create function public.get_cohort_link(p_cohort_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  url text;
begin
  if not exists (select 1 from public.cohorts where id = p_cohort_id) then
    perform private.fail('not-found', 'Cohort tidak ditemukan.');
  end if;
  if not public.is_admin()
     and not exists (select 1 from public.cohort_members where cohort_id = p_cohort_id and user_id = uid) then
    perform private.fail('permission-denied', 'Link grup WhatsApp hanya untuk anggota cohort ini.');
  end if;
  select whatsapp_group_url into url from public.cohort_links where cohort_id = p_cohort_id;
  return url;
end;
$$;

create function public.settle_member(p_cohort_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.cohort_members;
begin
  perform private.require_admin();
  select * into m from public.cohort_members where cohort_id = p_cohort_id and user_id = p_user_id for update;
  if not found then
    perform private.fail('not-found', 'Anggota ini tidak ada di cohort.');
  end if;
  if m.standing is distinct from 'owing' then
    perform private.fail('failed-precondition', 'Hanya anggota berstatus Owing yang bisa ditandai Settled.');
  end if;
  update public.cohort_members set standing = 'settled', settled_at = now()
  where cohort_id = p_cohort_id and user_id = p_user_id;
end;
$$;

-- Callable by anyone; each function raises `unauthenticated` itself when there is no session.
revoke all on function
  public.create_cohort(text),
  public.add_cohort_member(uuid, uuid, uuid),
  public.remove_cohort_member(uuid, uuid),
  public.leave_cohort(uuid),
  public.set_cohort_link(uuid, text),
  public.get_cohort_link(uuid),
  public.settle_member(uuid, uuid)
from public;
grant execute on function
  public.create_cohort(text),
  public.add_cohort_member(uuid, uuid, uuid),
  public.remove_cohort_member(uuid, uuid),
  public.leave_cohort(uuid),
  public.set_cohort_link(uuid, text),
  public.get_cohort_link(uuid),
  public.settle_member(uuid, uuid)
to anon, authenticated;
