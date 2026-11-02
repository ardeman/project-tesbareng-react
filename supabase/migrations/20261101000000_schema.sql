-- TesBareng schema: tables, row level security, computed stats views.
-- Writes never go straight to tables from the client; see 20261101000100_rpc.sql.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Raises an error the web client shows as-is. `hint` carries the contract code
-- (unauthenticated, invalid-argument, not-found, permission-denied, already-exists,
-- failed-precondition, resource-exhausted).
create function private.fail(code text, msg text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = msg, hint = code;
end;
$$;

create function private.trim_ws(v text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(v, '^\s+|\s+$', '', 'g');
$$;

-- Masking rule (CLAUDE.md hard rule 2): first 2 characters of the local part
-- (fewer only if shorter) + exactly five asterisks + @domain. Self-contained so
-- it runs with the caller's rights (no access to the private schema needed).
create function public.mask_email(email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := lower(regexp_replace(coalesce(email, ''), '^\s+|\s+$', '', 'g'));
  at_pos int := length(normalized) - strpos(reverse(normalized), '@') + 1; -- last '@'
begin
  if strpos(normalized, '@') = 0 or at_pos <= 1 or at_pos = length(normalized) then
    raise exception using errcode = 'P0001', message = 'Alamat email tidak valid.', hint = 'invalid-argument';
  end if;
  return left(substr(normalized, 1, at_pos - 1), 2) || '*****@' || substr(normalized, at_pos + 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Public profile. Never holds the full email: that stays in auth.users and is
-- read only inside security definer functions.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (display_name ~ '\S' and char_length(display_name) <= 50),
  photo_url text check (photo_url is null or char_length(photo_url) <= 1000),
  masked_email text not null check (masked_email ~ '^[^@\s]{1,2}\*{5}@[^@\s]+$'),
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

create table public.apps (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '\S' and char_length(name) <= 50),
  description text not null check (description ~ '\S' and char_length(description) <= 280),
  opt_in_url text not null check (
    char_length(opt_in_url) <= 500 and opt_in_url ~ '^https://play\.google\.com/apps/testing/\S+$'
  ),
  store_url text check (
    store_url is null
    or (char_length(store_url) <= 500 and store_url ~ '^https://play\.google\.com/store/apps/\S+$')
  ),
  package_name text check (
    package_name is null
    or (char_length(package_name) <= 150 and package_name ~ '^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$')
  ),
  creator_id uuid not null references public.profiles (id),
  status text not null default 'recruiting' check (status in ('recruiting', 'testing', 'applied', 'live')),
  test_start_date date,
  feedback_guide text check (feedback_guide is null or char_length(feedback_guide) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index apps_creator_created_idx on public.apps (creator_id, created_at);
create index apps_status_idx on public.apps (status) where not deleted;
create unique index apps_package_live_key on public.apps (package_name) where not deleted and package_name is not null;

create table public.testers (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id),
  user_id uuid references public.profiles (id) on delete set null, -- null for manual entries
  display_name text not null check (display_name ~ '\S' and char_length(display_name) <= 50),
  photo_url text check (photo_url is null or char_length(photo_url) <= 1000),
  masked_email text not null check (masked_email ~ '^[^@\s]{1,2}\*{5}@[^@\s]+$'),
  opted_in_at timestamptz not null,
  left_at timestamptz,
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  added_by text not null check (added_by in ('self', 'creator')),
  note text check (note is null or char_length(note) <= 140),
  feedback_sent boolean not null default false,
  feedback_sent_at timestamptz,
  feedback_summary text check (feedback_summary is null or char_length(feedback_summary) <= 500),
  feedback_verified boolean not null default false,
  replied boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index testers_app_user_key on public.testers (app_id, user_id) where user_id is not null;
create index testers_app_idx on public.testers (app_id);
create index testers_user_idx on public.testers (user_id) where user_id is not null;

create table public.builds (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id),
  version_name text not null check (version_name ~ '\S' and char_length(version_name) <= 40),
  uploaded_at timestamptz not null,
  changelog text not null check (changelog ~ '\S' and char_length(changelog) <= 140),
  created_at timestamptz not null default now()
);

create index builds_app_uploaded_idx on public.builds (app_id, uploaded_at desc);
create index builds_app_created_idx on public.builds (app_id, created_at);

-- ---------------------------------------------------------------------------
-- Access: read via RLS, never write directly.
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.apps enable row level security;
alter table public.testers enable row level security;
alter table public.builds enable row level security;

create policy "profiles are public" on public.profiles for select using (true);
create policy "live apps are public, admin sees all" on public.apps for select using (not deleted or public.is_admin());
create policy "tester entries are public" on public.testers for select using (true);
create policy "builds are public" on public.builds for select using (true);

revoke all on public.profiles, public.apps, public.testers, public.builds from anon, authenticated;
grant select on public.profiles, public.apps, public.testers, public.builds to anon, authenticated;
-- service_role (seed script, tests) bypasses RLS and may write directly. Never ship its key to the client.
grant all on public.profiles, public.apps, public.testers, public.builds to service_role;

-- ---------------------------------------------------------------------------
-- Computed counters (CLAUDE.md hard rule 3). Views run as the caller, so RLS on
-- the base tables still applies. Entries on soft-deleted apps never count.
-- ---------------------------------------------------------------------------

create view public.profile_stats with (security_invoker = true) as
select
  p.id as profile_id,
  (select count(*) from public.apps a where a.creator_id = p.id and not a.deleted)::int as apps_created_count,
  coalesce(t.testing_count, 0)::int as testing_count,
  coalesce(t.feedback_sent_count, 0)::int as feedback_sent_count,
  coalesce(t.feedback_verified_count, 0)::int as feedback_verified_count
from public.profiles p
left join lateral (
  select
    count(*) filter (
      where e.status = 'active'
         or (e.status = 'left' and e.left_at - e.opted_in_at >= interval '14 days')
    ) as testing_count,
    count(*) filter (where e.feedback_sent and e.status <> 'removed') as feedback_sent_count,
    count(*) filter (where e.feedback_verified and e.status <> 'removed') as feedback_verified_count
  from public.testers e
  join public.apps a on a.id = e.app_id and not a.deleted
  where e.user_id = p.id
) t on true;

create view public.app_stats with (security_invoker = true) as
select
  a.id as app_id,
  coalesce(t.active_tester_count, 0)::int as active_tester_count,
  coalesce(t.eligible_count, 0)::int as eligible_count,
  coalesce(t.feedback_sent_count, 0)::int as feedback_sent_count,
  coalesce(t.feedback_verified_count, 0)::int as feedback_verified_count,
  coalesce(t.replied_count, 0)::int as replied_count,
  coalesce(b.build_count, 0)::int as build_count,
  b.last_build_at,
  coalesce(ps.testing_count, 0)::int as creator_testing_count,
  coalesce(ps.feedback_sent_count, 0)::int as creator_feedback_sent_count,
  coalesce(ps.feedback_verified_count, 0)::int as creator_feedback_verified_count
from public.apps a
left join lateral (
  select
    count(*) as active_tester_count,
    count(*) filter (where now() - e.opted_in_at >= interval '14 days') as eligible_count,
    count(*) filter (where e.feedback_sent) as feedback_sent_count,
    count(*) filter (where e.feedback_verified) as feedback_verified_count,
    count(*) filter (where e.replied) as replied_count
  from public.testers e
  where e.app_id = a.id and e.status = 'active'
) t on true
left join lateral (
  select count(*) as build_count, max(x.uploaded_at) as last_build_at
  from public.builds x
  where x.app_id = a.id
) b on true
left join public.profile_stats ps on ps.profile_id = a.creator_id;

revoke all on public.profile_stats, public.app_stats from anon, authenticated;
grant select on public.profile_stats, public.app_stats to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profiles are created by the auth trigger and refreshed by ensure_profile().
-- ---------------------------------------------------------------------------

create function private.upsert_profile(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u auth.users%rowtype;
  meta jsonb;
  name text;
begin
  select * into u from auth.users where id = uid;
  if not found then
    perform private.fail('unauthenticated', 'Silakan masuk dengan akun Google dulu.');
  end if;
  if coalesce(private.trim_ws(u.email), '') = '' then
    perform private.fail('failed-precondition', 'Akun kamu tidak punya alamat email.');
  end if;
  meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  name := coalesce(
    nullif(private.trim_ws(meta ->> 'full_name'), ''),
    nullif(private.trim_ws(meta ->> 'name'), ''),
    split_part(lower(private.trim_ws(u.email)), '@', 1)
  );
  insert into public.profiles (id, display_name, photo_url, masked_email)
  values (
    uid,
    left(name, 50),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture'),
    public.mask_email(u.email)
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        photo_url = excluded.photo_url,
        masked_email = excluded.masked_email;
end;
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.email, '') <> '' then
    perform private.upsert_profile(new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Realtime for the app detail page (apps row, testers, builds of one app).
alter publication supabase_realtime add table public.apps, public.testers, public.builds;
