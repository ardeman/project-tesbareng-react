-- All writes go through these functions. They run as the table owner
-- (security definer, empty search_path, fully qualified names) and enforce the
-- permissions matrix (PRD §7), validation, rate limits and masking.
-- Errors: Indonesian `message` for the UI, contract code in `hint`.

-- ---------------------------------------------------------------------------
-- Validation helpers (mirror web/src/lib/validate.ts)
-- ---------------------------------------------------------------------------

create function private.caller()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform private.fail('unauthenticated', 'Silakan masuk dengan akun Google dulu.');
  end if;
  return auth.uid();
end;
$$;

create function private.req_text(v text, label text, max_len int)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := private.trim_ws(v);
begin
  if s is null or s = '' then
    perform private.fail('invalid-argument', label || ' wajib diisi.');
  end if;
  if char_length(s) > max_len then
    perform private.fail('invalid-argument', label || ' maksimal ' || max_len || ' karakter.');
  end if;
  return s;
end;
$$;

create function private.opt_text(v text, label text, max_len int)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := private.trim_ws(v);
begin
  if s is null or s = '' then
    return null;
  end if;
  if char_length(s) > max_len then
    perform private.fail('invalid-argument', label || ' maksimal ' || max_len || ' karakter.');
  end if;
  return s;
end;
$$;

create function private.opt_in_url(v text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := private.req_text(v, 'Link opt-in', 500);
begin
  if s !~ '^https://play\.google\.com/apps/testing/\S+$' then
    perform private.fail('invalid-argument', 'Link opt-in harus diawali https://play.google.com/apps/testing/');
  end if;
  return s;
end;
$$;

create function private.store_url(v text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := private.opt_text(v, 'Link Play Store', 500);
begin
  if s is not null and s !~ '^https://play\.google\.com/store/apps/\S+$' then
    perform private.fail('invalid-argument', 'Link Play Store harus diawali https://play.google.com/store/apps/');
  end if;
  return s;
end;
$$;

create function private.package_name(v text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := private.opt_text(v, 'Nama paket', 150);
begin
  if s is not null and s !~ '^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$' then
    perform private.fail('invalid-argument', 'Nama paket tidak valid. Contoh: id.namadev.kasrt');
  end if;
  return s;
end;
$$;

-- ISO date or date-time string. A bare date means midnight UTC.
create function private.iso_ts(v text, label text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  s text := private.trim_ws(v);
begin
  if s is null or s !~ '^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$' then
    perform private.fail('invalid-argument', label || ' harus berupa tanggal (YYYY-MM-DD).');
  end if;
  if s ~ '^\d{4}-\d{2}-\d{2}$' then
    return (s::date)::timestamp at time zone 'UTC';
  end if;
  return s::timestamptz;
exception
  when datetime_field_overflow or invalid_datetime_format then
    perform private.fail('invalid-argument', label || ' tidak valid.');
end;
$$;

create function private.opt_iso_ts(v text, label text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when coalesce(private.trim_ws(v), '') = '' then null else private.iso_ts(v, label) end;
$$;

-- Allows one day of slack for a client clock or timezone ahead of the server.
create function private.not_in_future(ts timestamptz, label text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if ts > now() + interval '1 day' then
    perform private.fail('invalid-argument', label || ' tidak boleh di masa depan.');
  end if;
  return ts;
end;
$$;

create function private.live_app(p_app_id uuid, allow_deleted boolean default false)
returns public.apps
language plpgsql
stable
set search_path = ''
as $$
declare
  a public.apps;
begin
  select * into a from public.apps where id = p_app_id;
  if not found or (a.deleted and not allow_deleted) then
    perform private.fail('not-found', 'Aplikasi tidak ditemukan.');
  end if;
  return a;
end;
$$;

-- Creator of the app or admin. Admins may also act on soft-deleted apps.
create function private.require_manager(uid uuid, p_app_id uuid)
returns public.apps
language plpgsql
stable
set search_path = ''
as $$
declare
  admin boolean := exists (select 1 from public.profiles where id = uid and role = 'admin');
  a public.apps := private.live_app(p_app_id, admin);
begin
  if a.creator_id <> uid and not admin then
    perform private.fail('permission-denied', 'Hanya kreator aplikasi atau admin yang bisa melakukan ini.');
  end if;
  return a;
end;
$$;

create function private.check_package_free(pkg text, except_app uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if pkg is not null and exists (
    select 1 from public.apps
    where package_name = pkg and not deleted and id is distinct from except_app
  ) then
    perform private.fail('already-exists', 'Aplikasi dengan nama paket ' || pkg || ' sudah terdaftar.');
  end if;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.ensure_profile()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
begin
  perform private.upsert_profile(uid);
  return uid;
end;
$$;

create function public.create_app(
  p_name text,
  p_description text,
  p_opt_in_url text,
  p_store_url text default null,
  p_package_name text default null,
  p_test_start_date text default null,
  p_feedback_guide text default null,
  p_group_confirmed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  v_name text;
  v_description text;
  v_opt_in text;
  v_store text;
  v_package text;
  v_start timestamptz;
  v_guide text;
  new_id uuid;
begin
  if p_group_confirmed is distinct from true then
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

  insert into public.apps (name, description, opt_in_url, store_url, package_name, test_start_date, feedback_guide, creator_id)
  values (v_name, v_description, v_opt_in, v_store, v_package, (v_start at time zone 'UTC')::date, v_guide, uid)
  returning id into new_id;
  return new_id;
end;
$$;

-- Full replace of the editable fields (the edit form sends all of them).
create function public.update_app(
  p_app_id uuid,
  p_name text,
  p_description text,
  p_opt_in_url text,
  p_store_url text default null,
  p_package_name text default null,
  p_test_start_date text default null,
  p_feedback_guide text default null,
  p_status text default null
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
    updated_at = now()
  where id = a.id;
end;
$$;

-- Soft delete. One-way for creators; only an admin can restore.
create function public.delete_app(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps := private.require_manager(uid, p_app_id);
begin
  update public.apps set deleted = true, updated_at = now() where id = a.id;
end;
$$;

create function public.restore_app(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps;
begin
  if not public.is_admin() then
    perform private.fail('permission-denied', 'Hanya admin yang bisa memulihkan aplikasi.');
  end if;
  a := private.live_app(p_app_id, true);
  if a.deleted then
    perform private.check_package_free(a.package_name, a.id);
    update public.apps set deleted = false, updated_at = now() where id = a.id;
  end if;
end;
$$;

create function public.join_as_tester(p_app_id uuid, p_checklist jsonb)
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
    perform private.fail('permission-denied', 'Kamu tidak bisa jadi tester untuk aplikasimu sendiri.');
  end if;

  select * into entry from public.testers where app_id = a.id and user_id = uid for update;
  if found then
    if entry.status = 'active' then
      perform private.fail('already-exists', 'Kamu sudah terdaftar sebagai tester aplikasi ini.');
    end if;
    if entry.status = 'removed' then
      perform private.fail('permission-denied', 'Kreator sudah mengeluarkanmu dari daftar tester aplikasi ini.');
    end if;
    update public.testers set
      display_name = me.display_name, photo_url = me.photo_url, masked_email = me.masked_email,
      status = 'active', opted_in_at = now(), left_at = null
    where id = entry.id;
    return;
  end if;

  insert into public.testers (app_id, user_id, display_name, photo_url, masked_email, opted_in_at, status, added_by)
  values (a.id, uid, me.display_name, me.photo_url, me.masked_email, now(), 'active', 'self');
end;
$$;

create function private.own_active_entry(uid uuid, p_app_id uuid, not_active_msg text)
returns public.testers
language plpgsql
set search_path = ''
as $$
declare
  entry public.testers;
begin
  perform private.live_app(p_app_id);
  select * into entry from public.testers where app_id = p_app_id and user_id = uid for update;
  if not found then
    perform private.fail('not-found', 'Kamu belum terdaftar sebagai tester aplikasi ini.');
  end if;
  if entry.status <> 'active' then
    perform private.fail('failed-precondition', not_active_msg);
  end if;
  return entry;
end;
$$;

revoke all on function private.own_active_entry(uuid, uuid, text) from public, anon, authenticated;

create function public.leave_testing(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  entry public.testers := private.own_active_entry(uid, p_app_id, 'Kamu sudah tidak aktif sebagai tester aplikasi ini.');
begin
  update public.testers set status = 'left', left_at = now() where id = entry.id;
end;
$$;

create function public.mark_feedback_sent(p_app_id uuid, p_sent boolean, p_summary text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  v_summary text;
  entry public.testers;
begin
  if p_sent is null then
    perform private.fail('invalid-argument', 'Status feedback tidak valid.');
  end if;
  if p_sent then
    v_summary := private.opt_text(p_summary, 'Ringkasan feedback', 500);
  end if;
  entry := private.own_active_entry(uid, p_app_id, 'Hanya tester aktif yang bisa menandai feedback.');
  if p_sent then
    update public.testers set feedback_sent = true, feedback_sent_at = now(), feedback_summary = v_summary
    where id = entry.id;
  else
    update public.testers set feedback_sent = false, feedback_sent_at = null, feedback_summary = null
    where id = entry.id;
  end if;
end;
$$;

-- The email is masked here and never stored.
create function public.add_manual_tester(
  p_app_id uuid,
  p_display_name text,
  p_email text,
  p_opted_in_at text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  v_name text := private.req_text(p_display_name, 'Nama tester', 50);
  v_email text := lower(private.trim_ws(p_email));
  v_opted timestamptz;
  a public.apps;
  new_id uuid;
begin
  if v_email is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    perform private.fail('invalid-argument', 'Alamat email tidak valid.');
  end if;
  v_opted := private.opt_iso_ts(p_opted_in_at, 'Tanggal opt-in');
  if v_opted is not null then
    perform private.not_in_future(v_opted, 'Tanggal opt-in');
  end if;
  a := private.require_manager(uid, p_app_id);

  insert into public.testers (app_id, display_name, masked_email, opted_in_at, status, added_by)
  values (a.id, v_name, public.mask_email(v_email), coalesce(v_opted, now()), 'active', 'creator')
  returning id into new_id;
  return new_id;
end;
$$;

-- Creator/admin edits a tester entry. `p_patch` keys (snake_case):
--   creator or admin: status, opted_in_at, left_at, note, feedback_verified, replied
--   admin only (moderation): feedback_sent, feedback_sent_at, feedback_summary
-- Any other key is refused. Changing status without left_at sets left_at to
-- null (active) or keeps/sets it to now (left, removed).
create function public.update_tester(p_tester_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  entry public.testers;
  admin boolean := public.is_admin();
  k text;
  manager_keys text[] := array['status', 'opted_in_at', 'left_at', 'note', 'feedback_verified', 'replied'];
  admin_keys text[] := array['feedback_sent', 'feedback_sent_at', 'feedback_summary'];
  v_status text;
  v_opted timestamptz;
  v_left timestamptz;
  v_note text;
  v_verified boolean;
  v_replied boolean;
  v_sent boolean;
  v_sent_at timestamptz;
  v_summary text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    perform private.fail('invalid-argument', 'Data yang dikirim tidak valid.');
  end if;

  select * into entry from public.testers where id = p_tester_id for update;
  if not found then
    perform private.fail('not-found', 'Data tester tidak ditemukan.');
  end if;
  perform private.require_manager(uid, entry.app_id);

  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any (manager_keys) or (admin and k = any (admin_keys))) then
      perform private.fail('permission-denied', 'Kolom ' || k || ' tidak bisa diubah.');
    end if;
  end loop;

  v_status := entry.status;
  v_opted := entry.opted_in_at;
  v_left := entry.left_at;
  v_note := entry.note;
  v_verified := entry.feedback_verified;
  v_replied := entry.replied;
  v_sent := entry.feedback_sent;
  v_sent_at := entry.feedback_sent_at;
  v_summary := entry.feedback_summary;

  if p_patch ? 'status' then
    v_status := p_patch ->> 'status';
    if jsonb_typeof(p_patch -> 'status') <> 'string' or v_status not in ('active', 'left', 'removed') then
      perform private.fail('invalid-argument', 'Status tester tidak valid.');
    end if;
    if not p_patch ? 'left_at' and v_status is distinct from entry.status then
      v_left := case when v_status = 'active' then null else coalesce(entry.left_at, now()) end;
    end if;
  end if;
  if p_patch ? 'opted_in_at' then
    if jsonb_typeof(p_patch -> 'opted_in_at') <> 'string' then
      perform private.fail('invalid-argument', 'Tanggal opt-in wajib diisi.');
    end if;
    v_opted := private.not_in_future(private.iso_ts(p_patch ->> 'opted_in_at', 'Tanggal opt-in'), 'Tanggal opt-in');
  end if;
  if p_patch ? 'left_at' then
    if jsonb_typeof(p_patch -> 'left_at') not in ('string', 'null') then
      perform private.fail('invalid-argument', 'Tanggal berhenti tidak valid.');
    end if;
    v_left := private.opt_iso_ts(p_patch ->> 'left_at', 'Tanggal berhenti');
  end if;
  if p_patch ? 'note' then
    if jsonb_typeof(p_patch -> 'note') not in ('string', 'null') then
      perform private.fail('invalid-argument', 'Catatan harus berupa teks.');
    end if;
    v_note := private.opt_text(p_patch ->> 'note', 'Catatan', 140);
  end if;
  if p_patch ? 'feedback_verified' then
    if jsonb_typeof(p_patch -> 'feedback_verified') <> 'boolean' then
      perform private.fail('invalid-argument', 'Nilai verifikasi tidak valid.');
    end if;
    v_verified := (p_patch ->> 'feedback_verified')::boolean;
  end if;
  if p_patch ? 'replied' then
    if jsonb_typeof(p_patch -> 'replied') <> 'boolean' then
      perform private.fail('invalid-argument', 'Nilai balasan tidak valid.');
    end if;
    v_replied := (p_patch ->> 'replied')::boolean;
  end if;
  if p_patch ? 'feedback_sent' then
    if jsonb_typeof(p_patch -> 'feedback_sent') <> 'boolean' then
      perform private.fail('invalid-argument', 'Status feedback tidak valid.');
    end if;
    v_sent := (p_patch ->> 'feedback_sent')::boolean;
  end if;
  if p_patch ? 'feedback_sent_at' then
    if jsonb_typeof(p_patch -> 'feedback_sent_at') not in ('string', 'null') then
      perform private.fail('invalid-argument', 'Tanggal feedback tidak valid.');
    end if;
    v_sent_at := private.opt_iso_ts(p_patch ->> 'feedback_sent_at', 'Tanggal feedback');
  end if;
  if p_patch ? 'feedback_summary' then
    if jsonb_typeof(p_patch -> 'feedback_summary') not in ('string', 'null') then
      perform private.fail('invalid-argument', 'Ringkasan feedback harus berupa teks.');
    end if;
    v_summary := private.opt_text(p_patch ->> 'feedback_summary', 'Ringkasan feedback', 500);
  end if;

  update public.testers set
    status = v_status, opted_in_at = v_opted, left_at = v_left, note = v_note,
    feedback_verified = v_verified, replied = v_replied,
    feedback_sent = v_sent, feedback_sent_at = v_sent_at, feedback_summary = v_summary
  where id = entry.id;
end;
$$;

create function public.add_build(p_app_id uuid, p_version_name text, p_uploaded_at text, p_changelog text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  v_version text := private.req_text(p_version_name, 'Nama versi', 40);
  v_uploaded timestamptz := private.not_in_future(private.iso_ts(p_uploaded_at, 'Tanggal upload'), 'Tanggal upload');
  v_changelog text := private.req_text(p_changelog, 'Catatan perubahan', 140);
  a public.apps := private.require_manager(uid, p_app_id);
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('add_build:' || a.id::text, 0));
  if (select count(*) from public.builds where app_id = a.id and created_at >= now() - interval '24 hours') >= 10 then
    perform private.fail('resource-exhausted', 'Maksimal 10 catatan build per aplikasi dalam 24 jam. Coba lagi besok.');
  end if;
  insert into public.builds (app_id, version_name, uploaded_at, changelog)
  values (a.id, v_version, v_uploaded, v_changelog)
  returning id into new_id;
  return new_id;
end;
$$;

-- Callable by anyone; each function raises `unauthenticated` itself when there is no session.
revoke all on function
  public.ensure_profile(),
  public.create_app(text, text, text, text, text, text, text, boolean),
  public.update_app(uuid, text, text, text, text, text, text, text, text),
  public.delete_app(uuid),
  public.restore_app(uuid),
  public.join_as_tester(uuid, jsonb),
  public.leave_testing(uuid),
  public.mark_feedback_sent(uuid, boolean, text),
  public.add_manual_tester(uuid, text, text, text),
  public.update_tester(uuid, jsonb),
  public.add_build(uuid, text, text, text)
from public;
grant execute on function
  public.ensure_profile(),
  public.create_app(text, text, text, text, text, text, text, boolean),
  public.update_app(uuid, text, text, text, text, text, text, text, text),
  public.delete_app(uuid),
  public.restore_app(uuid),
  public.join_as_tester(uuid, jsonb),
  public.leave_testing(uuid),
  public.mark_feedback_sent(uuid, boolean, text),
  public.add_manual_tester(uuid, text, text, text),
  public.update_tester(uuid, jsonb),
  public.add_build(uuid, text, text, text)
to anon, authenticated;
