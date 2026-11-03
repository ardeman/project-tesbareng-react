-- Two owner decisions (2026-11-03):
--   1. Server messages address the member as "Anda", like the work screens that show
--      them as-is. Earlier migrations said "kamu".
--   2. Re-joining an app after leaving starts the check-ins from zero, because the
--      14-day count also restarts (new opted_in_at).
-- Earlier migrations may already be applied (hosted project), so the functions are
-- rewritten here instead of editing those files.

-- ---------------------------------------------------------------------------
-- 1. Messages: replace each exact old text in the current definition. Fails if a
--    text is missing, so a later change to a function cannot be skipped silently.
--    Re-creating with CREATE OR REPLACE keeps grants, security definer and search_path.
-- ---------------------------------------------------------------------------

create function pg_temp.reword(fn regprocedure, old_text text, new_text text)
returns void
language plpgsql
as $$
declare
  def text := pg_get_functiondef(fn);
begin
  if position(old_text in def) = 0 then
    raise exception 'reword: % does not contain %', fn, old_text;
  end if;
  execute replace(def, old_text, new_text);
end;
$$;

select pg_temp.reword('private.upsert_profile(uuid)',
  'Akun kamu tidak punya alamat email.',
  'Akun Anda tidak punya alamat email.');
select pg_temp.reword('public.create_app(text, text, text, text, text, text, text, boolean)',
  'Kamu sudah menambahkan 5 aplikasi dalam 24 jam terakhir. Coba lagi besok.',
  'Anda sudah menambahkan 5 aplikasi dalam 24 jam terakhir. Coba lagi besok.');
select pg_temp.reword('private.own_active_entry(uuid, uuid, text)',
  'Kamu belum terdaftar sebagai tester aplikasi ini.',
  'Anda belum terdaftar sebagai tester aplikasi ini.');
select pg_temp.reword('public.leave_testing(uuid)',
  'Kamu sudah tidak aktif sebagai tester aplikasi ini.',
  'Anda sudah tidak aktif sebagai tester aplikasi ini.');
select pg_temp.reword('public.leave_cohort(uuid)',
  'Kamu bukan anggota cohort ini.',
  'Anda bukan anggota cohort ini.');
select pg_temp.reword('public.leave_cohort(uuid)',
  'Kamu hanya bisa keluar sebelum cohort dimulai.',
  'Anda hanya bisa keluar sebelum cohort dimulai.');
select pg_temp.reword('public.join_cohort_as_tester(uuid)',
  'Kamu sudah jadi anggota cohort ini.',
  'Anda sudah jadi anggota cohort ini.');
select pg_temp.reword('public.join_cohort_as_tester(uuid)',
  'Kamu masih Owing dari cohort sebelumnya. Hubungi admin untuk menyelesaikannya.',
  'Anda masih Owing dari cohort sebelumnya. Hubungi admin untuk menyelesaikannya.');
select pg_temp.reword('public.check_in(uuid, text, uuid)',
  'Kamu belum terdaftar sebagai tester aplikasi ini.',
  'Anda belum terdaftar sebagai tester aplikasi ini.');
select pg_temp.reword('public.check_in(uuid, text, uuid)',
  'Pilih build yang sudah kamu pasang.',
  'Pilih build yang sudah Anda pasang.');
select pg_temp.reword('public.check_in(uuid, text, uuid)',
  'Kamu sudah check-in untuk ini.',
  'Anda sudah check-in untuk ini.');

-- ---------------------------------------------------------------------------
-- 2. join_as_tester: "Anda" messages, and re-joining clears the entry's check-ins.
--    Everything else is unchanged from 20261101000100_rpc.sql.
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
     or p_checklist -> 'joinedGroup' is distinct from 'true'::jsonb
     or p_checklist -> 'optedIn' is distinct from 'true'::jsonb
     or p_checklist -> 'installed' is distinct from 'true'::jsonb then
    perform private.fail('invalid-argument',
      'Selesaikan ketiga langkah di checklist dulu: gabung grup, opt-in di Google Play, dan instal aplikasinya.');
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
