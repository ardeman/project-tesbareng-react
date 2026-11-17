-- Released (status = live) apps may join cohorts for public Play Store reviews.
-- Owner decision 2026-11-18: no closed-test opt-in URL required; store URL required;
-- join checklist is install-only; live apps count as ready for early cohort close.

-- ---------------------------------------------------------------------------
-- 1. Schema: nullable opt_in_url; live apps must have a Play Store listing
-- ---------------------------------------------------------------------------

alter table public.apps drop constraint if exists apps_opt_in_url_check;
alter table public.apps alter column opt_in_url drop not null;
alter table public.apps add constraint apps_opt_in_url_check check (
  opt_in_url is null
  or (char_length(opt_in_url) <= 500 and opt_in_url ~ '^https://play\.google\.com/apps/testing/\S+$')
);

alter table public.apps drop constraint if exists apps_live_needs_store;
alter table public.apps add constraint apps_live_needs_store check (
  status <> 'live'
  or (store_url is not null and char_length(store_url) <= 500 and store_url ~ '^https://play\.google\.com/store/apps/\S+$')
);

-- Optional closed-test URL (empty → null); still validates the prefix when set.
create or replace function private.opt_in_url_optional(v text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := private.opt_text(v, 'Link opt-in', 500);
begin
  if s is null then
    return null;
  end if;
  if s !~ '^https://play\.google\.com/apps/testing/\S+$' then
    perform private.fail('invalid-argument', 'Link opt-in harus diawali https://play.google.com/apps/testing/');
  end if;
  return s;
end;
$$;
revoke all on function private.opt_in_url_optional(text) from public, anon, authenticated;

create or replace function private.app_status(v text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if v is null or v not in ('recruiting', 'testing', 'applied', 'live') then
    perform private.fail('invalid-argument', 'Status aplikasi tidak valid.');
  end if;
  return v;
end;
$$;
revoke all on function private.app_status(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. create_app: optional p_status; live skips group confirm and opt-in URL
-- ---------------------------------------------------------------------------

drop function if exists public.create_app(text, text, text, text, text, text, text, boolean, text, smallint);

create function public.create_app(
  p_name text,
  p_description text,
  p_opt_in_url text,
  p_store_url text default null,
  p_package_name text default null,
  p_test_start_date text default null,
  p_feedback_guide text default null,
  p_group_confirmed boolean default false,
  p_tester_method text default 'google_group',
  p_tester_slots smallint default 12,
  p_status text default 'recruiting'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  v_status text := private.app_status(coalesce(nullif(trim(p_status), ''), 'recruiting'));
  v_method text := private.tester_method(p_tester_method);
  v_slots smallint := private.tester_slots(p_tester_slots);
  v_name text;
  v_description text;
  v_opt_in text;
  v_store text;
  v_package text;
  v_start timestamptz;
  v_guide text;
  new_id uuid;
begin
  if v_status = 'live' then
    -- Public reviews: no closed-test group gate; email-list track does not apply.
    v_method := 'google_group';
  elsif v_method = 'google_group' and p_group_confirmed is distinct from true then
    perform private.fail('invalid-argument',
      'Centang konfirmasi bahwa google-tester-indonesia@googlegroups.com sudah ditambahkan sebagai daftar tester.');
  end if;

  v_name := private.req_text(p_name, 'Nama aplikasi', 50);
  v_description := private.req_text(p_description, 'Deskripsi', 280);
  v_store := private.store_url(p_store_url);
  if v_status = 'live' then
    v_opt_in := private.opt_in_url_optional(p_opt_in_url);
  else
    v_opt_in := private.opt_in_url(p_opt_in_url);
  end if;
  v_package := private.package_name(p_package_name);
  v_start := private.opt_iso_ts(p_test_start_date, 'Tanggal mulai tes');
  v_guide := private.opt_text(p_feedback_guide, 'Panduan feedback', 500);

  perform pg_advisory_xact_lock(hashtextextended('create_app:' || uid::text, 0));
  if (select count(*) from public.apps where creator_id = uid and created_at >= now() - interval '24 hours') >= 5 then
    perform private.fail('resource-exhausted',
      'Kamu sudah menambahkan 5 aplikasi dalam 24 jam terakhir. Coba lagi besok.');
  end if;

  perform private.check_package_free(v_package, null);
  perform private.upsert_profile(uid);

  insert into public.apps (
    name, description, opt_in_url, store_url, package_name, test_start_date, feedback_guide,
    creator_id, tester_method, tester_slots, status
  )
  values (
    v_name, v_description, v_opt_in, v_store, v_package, (v_start at time zone 'UTC')::date, v_guide,
    uid, v_method, v_slots, v_status
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_app(text, text, text, text, text, text, text, boolean, text, smallint, text) from public;
grant execute on function public.create_app(text, text, text, text, text, text, text, boolean, text, smallint, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. update_app: live may clear opt-in; non-live still requires it
-- ---------------------------------------------------------------------------

create or replace function public.update_app(
  p_app_id uuid,
  p_name text,
  p_description text,
  p_opt_in_url text,
  p_store_url text default null,
  p_package_name text default null,
  p_test_start_date text default null,
  p_feedback_guide text default null,
  p_status text default null,
  p_tester_method text default null,
  p_tester_slots smallint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps := private.require_manager(uid, p_app_id);
  v_status text := coalesce(p_status, a.status);
  v_package text;
  v_start timestamptz;
  v_opt_in text;
  v_store text;
  v_method text;
begin
  if p_status is not null then
    v_status := private.app_status(p_status);
  end if;
  v_package := private.package_name(p_package_name);
  v_start := private.opt_iso_ts(p_test_start_date, 'Tanggal mulai tes');
  v_store := private.store_url(p_store_url);
  if v_status = 'live' then
    v_opt_in := private.opt_in_url_optional(p_opt_in_url);
    v_method := case when p_tester_method is null then a.tester_method else 'google_group' end;
  else
    v_opt_in := private.opt_in_url(p_opt_in_url);
    v_method := case when p_tester_method is null then a.tester_method else private.tester_method(p_tester_method) end;
  end if;
  perform private.check_package_free(v_package, a.id);

  update public.apps set
    name = private.req_text(p_name, 'Nama aplikasi', 50),
    description = private.req_text(p_description, 'Deskripsi', 280),
    opt_in_url = v_opt_in,
    store_url = v_store,
    package_name = v_package,
    test_start_date = (v_start at time zone 'UTC')::date,
    feedback_guide = private.opt_text(p_feedback_guide, 'Panduan feedback', 500),
    status = v_status,
    tester_method = v_method,
    tester_slots = case when p_tester_slots is null then tester_slots else private.tester_slots(p_tester_slots) end,
    updated_at = now()
  where id = a.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. join_as_tester: live apps = install only (public listing)
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
  perform private.upsert_profile(uid);
  select * into me from public.profiles where id = uid;

  select * into a from public.apps where id = p_app_id for share;
  if not found or a.deleted then
    perform private.fail('not-found', 'Aplikasi tidak ditemukan.');
  end if;
  if a.creator_id = uid then
    perform private.fail('permission-denied', 'Anda tidak bisa jadi tester untuk aplikasi Anda sendiri.');
  end if;

  if a.status = 'live' then
    if p_checklist is null or p_checklist -> 'installed' is distinct from 'true'::jsonb then
      perform private.fail('invalid-argument',
        'Pasang aplikasinya dari halaman Play Store dulu, lalu catat di TesBareng.');
    end if;
  else
    if p_checklist is null
       or p_checklist -> 'optedIn' is distinct from 'true'::jsonb
       or p_checklist -> 'installed' is distinct from 'true'::jsonb then
      perform private.fail('invalid-argument',
        'Selesaikan semua langkah di checklist dulu: opt-in di Google Play dan instal aplikasinya.');
    end if;
    if a.tester_method = 'email_list' then
      if not exists (
        select 1 from public.email_listings
        where app_id = a.id and user_id = uid and listed_at is not null
      ) then
        perform private.fail('failed-precondition',
          'Creator belum menambahkan email Anda di Play Console. Tunggu sampai ditandai "Sudah ditambahkan".');
      end if;
    elsif p_checklist -> 'joinedGroup' is distinct from 'true'::jsonb then
      perform private.fail('invalid-argument',
        'Selesaikan ketiga langkah di checklist dulu: gabung grup, opt-in di Google Play, dan instal aplikasinya.');
    end if;
  end if;

  select * into entry from public.testers where app_id = a.id and user_id = uid for update;
  if found then
    if entry.status = 'active' then
      perform private.fail('already-exists', 'Anda sudah terdaftar sebagai tester aplikasi ini.');
    end if;
    if entry.status = 'removed' then
      perform private.fail('permission-denied', 'Creator sudah mengeluarkan Anda dari daftar tester aplikasi ini.');
    end if;
    update public.testers set
      display_name = me.display_name, photo_url = me.photo_url, masked_email = me.masked_email,
      status = 'active', opted_in_at = now(), left_at = null
    where id = entry.id;
    delete from public.check_ins where tester_id = entry.id;
    return;
  end if;

  insert into public.testers (app_id, user_id, display_name, photo_url, masked_email, opted_in_at, status, added_by)
  values (a.id, uid, me.display_name, me.photo_url, me.masked_email, now(), 'active', 'self');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. close_cohort: live apps are already "ready" (no 14-day closed-test gate)
-- ---------------------------------------------------------------------------

create or replace function public.close_cohort(p_cohort_id uuid)
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
    where m.cohort_id = c.id
      and ap.status is distinct from 'live'
      and st.eligible_count < ap.tester_slots
  ) then
    perform private.fail('failed-precondition',
      'Sebelum hari ke-21, cohort hanya bisa ditutup kalau semua aplikasi uji tertutup sudah siap diajukan (target testernya sudah lulus 14 hari). App yang sudah rilis production dihitung siap.');
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
