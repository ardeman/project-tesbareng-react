-- Email-list testing (ADR-011, PRD FR-19a–FR-19e).
--
-- In Play Console a closed track takes testers from email lists OR Google Groups, not
-- both. An app whose track already uses an email list cannot take the community group,
-- so its testers ask to be added by email and the creator pastes their address into
-- the list.
--
-- Privacy (ADR-005 as amended by ADR-011):
--   * No table gets an email column. email_listings holds ids and times only.
--   * The full address is read live from auth.users by app_email_listings(), only for
--     the creator of that app, only for members who asked (consent), and never once the
--     member withdrew, left or was removed. Admins do not see it.
--
-- Cohorts: for an email-list app the milestone base time is the moment the creator
-- marks the tester as added (listed_at), so a slow creator cannot make their testers
-- Behind. See cohort_assignment_status.base_at below.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

alter table public.apps
  add column tester_method text not null default 'google_group'
    check (tester_method in ('google_group', 'email_list'));

create table public.email_listings (
  -- Cascade only matters for service-role cleanup; apps are soft-deleted in the product.
  app_id uuid not null references public.apps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  listed_at timestamptz, -- set by the creator once the address is in the Play Console list
  primary key (app_id, user_id)
);

create index email_listings_user_idx on public.email_listings (user_id);

-- Public like testers: no personal data beyond ids and times, and the cohort views
-- (security_invoker) must judge milestones the same way for every viewer.
alter table public.email_listings enable row level security;
create policy "email listings are public" on public.email_listings for select using (true);
revoke all on public.email_listings from anon, authenticated;
grant select on public.email_listings to anon, authenticated;
grant all on public.email_listings to service_role;

-- ---------------------------------------------------------------------------
-- 2. create_app / update_app take the tester method
-- ---------------------------------------------------------------------------

drop function public.create_app(text, text, text, text, text, text, text, boolean);
drop function public.update_app(uuid, text, text, text, text, text, text, text, text);

create function private.tester_method(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null then
    return 'google_group';
  end if;
  if p not in ('google_group', 'email_list') then
    perform private.fail('invalid-argument', 'Cara menambah tester tidak valid.');
  end if;
  return p;
end;
$$;
revoke all on function private.tester_method(text) from public, anon, authenticated;

create function public.create_app(
  p_name text,
  p_description text,
  p_opt_in_url text,
  p_store_url text default null,
  p_package_name text default null,
  p_test_start_date text default null,
  p_feedback_guide text default null,
  p_group_confirmed boolean default false,
  p_tester_method text default 'google_group'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  v_method text := private.tester_method(p_tester_method);
  v_name text;
  v_description text;
  v_opt_in text;
  v_store text;
  v_package text;
  v_start timestamptz;
  v_guide text;
  new_id uuid;
begin
  -- Email-list apps cannot use the group (Play Console takes one or the other).
  if v_method = 'google_group' and p_group_confirmed is distinct from true then
    perform private.fail('invalid-argument',
      'Centang konfirmasi bahwa google-tester-indonesia@googlegroups.com sudah ditambahkan sebagai daftar tester.');
  end if;
  v_name := private.req_text(p_name, 'Nama aplikasi', 50);
  v_description := private.req_text(p_description, 'Deskripsi', 280);
  v_opt_in := private.opt_in_url(p_opt_in_url);
  v_store := private.store_url(p_store_url);
  v_package := private.package_name(p_package_name);
  v_start := private.opt_iso_ts(p_test_start_date, 'Tanggal mulai tes');
  v_guide := private.opt_text(p_feedback_guide, 'Panduan feedback', 500);

  -- Serialise this member's creates so the rolling limit cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('create_app:' || uid::text, 0));
  if (select count(*) from public.apps where creator_id = uid and created_at >= now() - interval '24 hours') >= 5 then
    perform private.fail('resource-exhausted',
      'Kamu sudah menambahkan 5 aplikasi dalam 24 jam terakhir. Coba lagi besok.');
  end if;

  perform private.check_package_free(v_package, null);
  perform private.upsert_profile(uid);

  insert into public.apps (name, description, opt_in_url, store_url, package_name, test_start_date, feedback_guide, creator_id, tester_method)
  values (v_name, v_description, v_opt_in, v_store, v_package, (v_start at time zone 'UTC')::date, v_guide, uid, v_method)
  returning id into new_id;
  return new_id;
end;
$$;

-- Full replace of the editable fields (the edit form sends all of them).
-- p_tester_method null keeps the current method.
create function public.update_app(
  p_app_id uuid,
  p_name text,
  p_description text,
  p_opt_in_url text,
  p_store_url text default null,
  p_package_name text default null,
  p_test_start_date text default null,
  p_feedback_guide text default null,
  p_status text default null,
  p_tester_method text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps := private.require_manager(uid, p_app_id);
  v_package text;
  v_start timestamptz;
begin
  if p_status is not null and p_status not in ('recruiting', 'testing', 'applied', 'live') then
    perform private.fail('invalid-argument', 'Status aplikasi tidak valid.');
  end if;
  v_package := private.package_name(p_package_name);
  v_start := private.opt_iso_ts(p_test_start_date, 'Tanggal mulai tes');
  perform private.check_package_free(v_package, a.id);

  update public.apps set
    name = private.req_text(p_name, 'Nama aplikasi', 50),
    description = private.req_text(p_description, 'Deskripsi', 280),
    opt_in_url = private.opt_in_url(p_opt_in_url),
    store_url = private.store_url(p_store_url),
    package_name = v_package,
    test_start_date = (v_start at time zone 'UTC')::date,
    feedback_guide = private.opt_text(p_feedback_guide, 'Panduan feedback', 500),
    status = coalesce(p_status, status),
    tester_method = case when p_tester_method is null then tester_method else private.tester_method(p_tester_method) end,
    updated_at = now()
  where id = a.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Email-list RPCs
-- ---------------------------------------------------------------------------

-- Tester: "add my Google account email to your Play Console list". p_consent must be
-- true: it is the member agreeing that this app's creator sees their full address.
create function public.request_email_listing(p_app_id uuid, p_consent boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps;
begin
  if p_consent is distinct from true then
    perform private.fail('invalid-argument',
      'Centang persetujuan bahwa kreator aplikasi ini boleh melihat email Anda.');
  end if;
  perform private.upsert_profile(uid);

  select * into a from public.apps where id = p_app_id for share;
  if not found or a.deleted then
    perform private.fail('not-found', 'Aplikasi tidak ditemukan.');
  end if;
  if a.tester_method <> 'email_list' then
    perform private.fail('failed-precondition',
      'Aplikasi ini memakai Google Group. Gabung grupnya lalu opt-in, tidak perlu kirim email.');
  end if;
  if a.creator_id = uid then
    perform private.fail('permission-denied', 'Anda tidak bisa jadi tester untuk aplikasi Anda sendiri.');
  end if;
  if exists (select 1 from public.testers where app_id = a.id and user_id = uid and status = 'removed') then
    perform private.fail('permission-denied', 'Kreator sudah mengeluarkan Anda dari daftar tester aplikasi ini.');
  end if;

  insert into public.email_listings (app_id, user_id) values (a.id, uid)
  on conflict (app_id, user_id) do nothing;
end;
$$;

-- Tester: withdraw. The creator no longer sees the address; anything already pasted
-- into Play Console is outside TesBareng.
create function public.cancel_email_listing(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
begin
  delete from public.email_listings where app_id = p_app_id and user_id = uid;
  if not found then
    perform private.fail('not-found', 'Anda belum meminta ditambahkan ke aplikasi ini.');
  end if;
end;
$$;

-- Creator only (not admin, ADR-011): the addresses to paste into Play Console.
-- Members who withdrew, left or were removed are not returned.
create function public.app_email_listings(p_app_id uuid)
returns table (
  user_id uuid,
  display_name text,
  photo_url text,
  email text,
  requested_at timestamptz,
  listed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps;
begin
  select * into a from public.apps where id = p_app_id;
  if not found or a.deleted then
    perform private.fail('not-found', 'Aplikasi tidak ditemukan.');
  end if;
  if a.creator_id <> uid then
    perform private.fail('permission-denied', 'Hanya kreator aplikasi ini yang bisa melihat email tester.');
  end if;

  return query
  select l.user_id, p.display_name, p.photo_url, lower(trim(u.email::text)), l.requested_at, l.listed_at
  from public.email_listings l
  join public.profiles p on p.id = l.user_id
  join auth.users u on u.id = l.user_id
  where l.app_id = a.id
    and not exists (
      select 1 from public.testers t
      where t.app_id = l.app_id and t.user_id = l.user_id and t.status in ('left', 'removed')
    )
  order by l.listed_at nulls first, l.requested_at;
end;
$$;

-- Creator or admin: "I added this address in Play Console" (p_listed true) or undo.
create function public.mark_email_listed(p_app_id uuid, p_user_id uuid, p_listed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps := private.require_manager(uid, p_app_id);
begin
  if p_listed is null then
    perform private.fail('invalid-argument', 'Nilai tidak valid.');
  end if;
  update public.email_listings
  set listed_at = case when p_listed then coalesce(listed_at, now()) else null end
  where app_id = a.id and user_id = p_user_id;
  if not found then
    perform private.fail('not-found', 'Permintaan email tidak ditemukan.');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. join_as_tester: email-list apps need a listed request instead of the group step
--    Otherwise unchanged from 20261103000500_anda_copy_rejoin.sql.
-- ---------------------------------------------------------------------------

create or replace function public.join_as_tester(p_app_id uuid, p_checklist jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps;
  me public.profiles;
  entry public.testers;
begin
  if p_checklist is null
     or p_checklist -> 'optedIn' is distinct from 'true'::jsonb
     or p_checklist -> 'installed' is distinct from 'true'::jsonb then
    perform private.fail('invalid-argument',
      'Selesaikan semua langkah di checklist dulu: opt-in di Google Play dan instal aplikasinya.');
  end if;
  perform private.upsert_profile(uid);
  select * into me from public.profiles where id = uid;

  select * into a from public.apps where id = p_app_id for share;
  if not found or a.deleted then
    perform private.fail('not-found', 'Aplikasi tidak ditemukan.');
  end if;
  if a.creator_id = uid then
    perform private.fail('permission-denied', 'Anda tidak bisa jadi tester untuk aplikasi Anda sendiri.');
  end if;

  if a.tester_method = 'email_list' then
    if not exists (
      select 1 from public.email_listings
      where app_id = a.id and user_id = uid and listed_at is not null
    ) then
      perform private.fail('failed-precondition',
        'Kreator belum menambahkan email Anda di Play Console. Tunggu sampai ditandai "Sudah ditambahkan".');
    end if;
  elsif p_checklist -> 'joinedGroup' is distinct from 'true'::jsonb then
    perform private.fail('invalid-argument',
      'Selesaikan ketiga langkah di checklist dulu: gabung grup, opt-in di Google Play, dan instal aplikasinya.');
  end if;

  select * into entry from public.testers where app_id = a.id and user_id = uid for update;
  if found then
    if entry.status = 'active' then
      perform private.fail('already-exists', 'Anda sudah terdaftar sebagai tester aplikasi ini.');
    end if;
    if entry.status = 'removed' then
      perform private.fail('permission-denied', 'Kreator sudah mengeluarkan Anda dari daftar tester aplikasi ini.');
    end if;
    update public.testers set
      display_name = me.display_name, photo_url = me.photo_url, masked_email = me.masked_email,
      status = 'active', opted_in_at = now(), left_at = null
    where id = entry.id;
    -- A new 14-day run starts, so its milestones start from zero too.
    delete from public.check_ins where tester_id = entry.id;
    return;
  end if;

  insert into public.testers (app_id, user_id, display_name, photo_url, masked_email, opted_in_at, status, added_by)
  values (a.id, uid, me.display_name, me.photo_url, me.masked_email, now(), 'active', 'self');
end;
$$;

revoke all on function
  public.create_app(text, text, text, text, text, text, text, boolean, text),
  public.update_app(uuid, text, text, text, text, text, text, text, text, text),
  public.request_email_listing(uuid, boolean),
  public.cancel_email_listing(uuid),
  public.app_email_listings(uuid),
  public.mark_email_listed(uuid, uuid, boolean)
from public;
grant execute on function
  public.create_app(text, text, text, text, text, text, text, boolean, text),
  public.update_app(uuid, text, text, text, text, text, text, text, text, text),
  public.request_email_listing(uuid, boolean),
  public.cancel_email_listing(uuid),
  public.app_email_listings(uuid),
  public.mark_email_listed(uuid, uuid, boolean)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cohort milestones count from base_at
--
-- base_at = assigned_at, except for an email-list app where the tester asked in time
-- (within the 48 h opt-in window): then it is the moment the creator marked them
-- added, or null (nothing due yet) while the creator has not. A tester who never asked,
-- or asked late, keeps assigned_at and is Behind as usual.
-- Columns are unchanged except base_at, appended at the end.
-- ---------------------------------------------------------------------------

create or replace view public.cohort_assignment_status with (security_invoker = true) as
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
  cardinality(m.behind_on) > 0 as is_behind,
  bt.base_at
from public.assignments a
join public.cohorts c on c.id = a.cohort_id
-- Left join: apps RLS hides deleted apps from non-admins, and this view runs as the caller.
left join public.apps ap on ap.id = a.app_id
cross join lateral (select coalesce(c.closed_at, now()) as as_of) x
left join public.testers t on t.app_id = a.app_id and t.user_id = a.tester_user_id
left join public.email_listings el
  on ap.tester_method = 'email_list' and el.app_id = a.app_id and el.user_id = a.tester_user_id
cross join lateral (
  select case
    when ap.tester_method is distinct from 'email_list' then a.assigned_at
    when el.user_id is null or el.requested_at > a.assigned_at + interval '48 hours' then a.assigned_at
    when el.listed_at is null then null
    else greatest(a.assigned_at, el.listed_at)
  end as base_at
) bt
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
-- Builds logged after the base time whose 72 h have passed, and how many of them got
-- an "Sudah update" check-in.
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
    and b.created_at > bt.base_at
    and b.created_at + interval '72 hours' <= x.as_of
) bd
-- Milestones that are due and unmet (FR-42). Reassigned rows owe nothing; a null
-- base_at makes every comparison null, so nothing is due.
cross join lateral (
  select case when a.state <> 'open' then '{}'::text[] else array_remove(array[
    case when bt.base_at + interval '48 hours' <= x.as_of and not f.fulfilled then 'opt_in' end,
    case when bt.base_at + interval '7 days' <= x.as_of and ci.used_app_at is null then 'used_app' end,
    case when bt.base_at + interval '7 days' <= x.as_of and not fb.feedback_sent then 'feedback' end,
    case when bt.base_at + interval '13 days' <= x.as_of and ci.still_opted_in_at is null then 'still_opted_in' end,
    case when bd.builds_updated_count < bd.builds_due_count then 'updated_build' end
  ], null) end as behind_on
) m;

-- Digest days count from base_at too; a null base_at (waiting for the creator) sends
-- nothing. Otherwise unchanged from 20261103000700_cohort_reminders.sql.
create or replace function public.due_cohort_reminders()
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
      st.base_at,
      st.fulfilled,
      st.feedback_sent,
      st.used_app_at,
      st.still_opted_in_at,
      floor(extract(epoch from (now() - st.base_at)) / 86400)::int as day
    from public.cohort_assignment_status st
    join public.cohorts c on c.id = st.cohort_id and c.status = 'active'
    join public.apps ap on ap.id = st.app_id and not ap.deleted
    where st.state = 'open' and st.base_at is not null
  ),
  due as (
    select tester_user_id, cohort_id, cohort_name, app, day, 'cohort_opt_in' as kind,
           base_at + interval '48 hours' as due_at
    from s where day in (1, 2) and not fulfilled
    union all
    select tester_user_id, cohort_id, cohort_name, app, day, 'cohort_feedback',
           base_at + interval '7 days'
    from s where day = 5 and fulfilled and not feedback_sent
    union all
    select tester_user_id, cohort_id, cohort_name, app, day, 'cohort_used_app',
           base_at + interval '7 days'
    from s where day = 7 and fulfilled and (used_app_at is null or not feedback_sent)
    union all
    select tester_user_id, cohort_id, cohort_name, app, day, 'cohort_still_opted_in',
           base_at + interval '13 days'
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
