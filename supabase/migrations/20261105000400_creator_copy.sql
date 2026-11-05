-- UI copy: "creator" (not the Indonesian spelling with K) in error messages the web app shows as-is.
-- Bodies are the live definitions (pg_get_functiondef) with only the message text changed.

CREATE OR REPLACE FUNCTION private.require_manager(uid uuid, p_app_id uuid)
 RETURNS apps
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  admin boolean := exists (select 1 from public.profiles where id = uid and role = 'admin');
  a public.apps := private.live_app(p_app_id, admin);
begin
  if a.creator_id <> uid and not admin then
    perform private.fail('permission-denied', 'Hanya creator aplikasi atau admin yang bisa melakukan ini.');
  end if;
  return a;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_email_listings(p_app_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, photo_url text, email text, requested_at timestamp with time zone, listed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := private.caller();
  a public.apps;
begin
  select * into a from public.apps where id = p_app_id;
  if not found or a.deleted then
    perform private.fail('not-found', 'Aplikasi tidak ditemukan.');
  end if;
  if a.creator_id <> uid then
    perform private.fail('permission-denied', 'Hanya creator aplikasi ini yang bisa melihat email tester.');
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
$function$
;

CREATE OR REPLACE FUNCTION public.join_as_tester(p_app_id uuid, p_checklist jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'Creator belum menambahkan email Anda di Play Console. Tunggu sampai ditandai "Sudah ditambahkan".');
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
      perform private.fail('permission-denied', 'Creator sudah mengeluarkan Anda dari daftar tester aplikasi ini.');
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
$function$
;

CREATE OR REPLACE FUNCTION public.leave_cohort(p_cohort_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := private.caller();
  c public.cohorts := private.lock_cohort(p_cohort_id);
  m public.cohort_members;
begin
  select * into m from public.cohort_members where cohort_id = c.id and user_id = uid;
  if not found then
    perform private.fail('not-found', 'Anda bukan anggota cohort ini.');
  end if;
  if m.app_id is not null then
    perform private.fail('permission-denied', 'Creator tidak bisa keluar sendiri dari cohort. Hubungi admin.');
  end if;
  if c.status <> 'forming' then
    perform private.fail('failed-precondition', 'Anda hanya bisa keluar sebelum cohort dimulai.');
  end if;
  delete from public.cohort_members where cohort_id = c.id and user_id = uid;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_slot(p_assignment_id uuid, p_to_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    perform private.fail('invalid-argument', 'Creator tidak bisa ditugaskan ke aplikasinya sendiri.');
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
$function$
;

CREATE OR REPLACE FUNCTION public.request_email_listing(p_app_id uuid, p_consent boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := private.caller();
  a public.apps;
begin
  if p_consent is distinct from true then
    perform private.fail('invalid-argument',
      'Centang persetujuan bahwa creator aplikasi ini boleh melihat email Anda.');
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
    perform private.fail('permission-denied', 'Creator sudah mengeluarkan Anda dari daftar tester aplikasi ini.');
  end if;

  insert into public.email_listings (app_id, user_id) values (a.id, uid)
  on conflict (app_id, user_id) do nothing;
end;
$function$
;

