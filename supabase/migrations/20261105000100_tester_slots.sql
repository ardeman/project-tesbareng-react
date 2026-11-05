-- ADR-012: tester slots. The creator chooses how many testers an app needs from
-- TesBareng (1–12). The app's progress target and Ready to apply use the slot count;
-- a cohort app's demand is kᵢ = min(slotsᵢ + 2, N − 1), and its creator tests exactly kᵢ apps.
-- Builds on ADR-011 (20261104000100, 20261104000200): create_app / update_app keep
-- all of ADR-011's logic and gain p_tester_slots.
-- Contract: docs/contract.md.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.apps
  add column tester_slots smallint not null default 12 check (tester_slots between 1 and 12);

-- The cohort demand kᵢ fixed at Day 0 (ADR-012 §5): this creator tests kᵢ apps and
-- the app receives kᵢ assigned creator testers. Not a counter: an input snapshot that
-- later slot edits do not move. Null for pure testers and before Day 0.
alter table public.cohort_members
  add column demand smallint check (demand is null or (demand >= 1 and app_id is not null));

-- ---------------------------------------------------------------------------
-- 2. create_app / update_app take the slot count
-- ---------------------------------------------------------------------------

drop function public.create_app(text, text, text, text, text, text, text, boolean, text);
drop function public.update_app(uuid, text, text, text, text, text, text, text, text, text);

create function private.tester_slots(p smallint)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or p < 1 or p > 12 then
    perform private.fail('invalid-argument', 'Jumlah tester yang dibutuhkan harus 1 sampai 12.');
  end if;
  return p;
end;
$$;
revoke all on function private.tester_slots(smallint) from public, anon, authenticated;

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
  p_tester_slots smallint default 12
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
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

  insert into public.apps (name, description, opt_in_url, store_url, package_name, test_start_date, feedback_guide, creator_id, tester_method, tester_slots)
  values (v_name, v_description, v_opt_in, v_store, v_package, (v_start at time zone 'UTC')::date, v_guide, uid, v_method, v_slots)
  returning id into new_id;
  return new_id;
end;
$$;

-- Full replace of the editable fields (the edit form sends all of them).
-- p_tester_method / p_tester_slots null keep the current value. Slot changes during a
-- cohort do not move its assignments (ADR-012 §5, owner decision C).
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
    tester_slots = case when p_tester_slots is null then tester_slots else private.tester_slots(p_tester_slots) end,
    updated_at = now()
  where id = a.id;
end;
$$;

revoke all on function
  public.create_app(text, text, text, text, text, text, text, boolean, text, smallint),
  public.update_app(uuid, text, text, text, text, text, text, text, text, text, smallint)
from public;
grant execute on function
  public.create_app(text, text, text, text, text, text, text, boolean, text, smallint),
  public.update_app(uuid, text, text, text, text, text, text, text, text, text, smallint)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cohort assignment: give what you take (ADR-012 §5)
-- ---------------------------------------------------------------------------

-- Builds a directed graph on members 1..n where member i tests exactly k[i] apps and
-- its app is tested by exactly k[i] members, never itself and never twice.
-- When every kᵢ is equal this is the ADR-007 ring. Otherwise Kleitman–Wang: take the member with the most testing left and give it the apps with
-- the most testers still needed (ties: most testing left, then ring distance). This
-- succeeds exactly when such a graph exists. Some mixes have none (e.g. N = 13 with
-- four apps at k = 12 and nine at k = 3: every small creator would have to test the
-- four big apps). Then the smallest kᵢ is raised by one, never above n − 1, and it
-- tries again, so every app still gets at least its demand and give = take holds.
-- Returns 1-based member indices.
create function private.cohort_digraph(p_k int[])
returns table (tester_idx int, app_idx int)
language plpgsql
set search_path = ''
as $$
declare
  n int := coalesce(array_length(p_k, 1), 0);
  k int[] := p_k;
  out_rem int[];
  in_rem int[];
  e_from int[];
  e_to int[];
  i int;
  lo int;
  picks int[];
  x int;
  ok boolean;
begin
  if n < 2 then
    return;
  end if;
  for x in 1 .. n loop
    k[x] := least(greatest(k[x], 1), n - 1);
  end loop;

  -- Every kᵢ equal: the ADR-007 ring, member i tests i+1 … i+k (mod n).
  if (select count(distinct v) from unnest(k) u(v)) = 1 then
    return query
      select t.v, ((t.v - 1 + s.v) % n) + 1
      from generate_series(1, n) t(v), generate_series(1, k[1]) s(v);
    return;
  end if;

  loop
    out_rem := k;
    in_rem := k;
    e_from := '{}';
    e_to := '{}';
    ok := true;

    loop
      select g.v into i from generate_series(1, n) g(v)
      where out_rem[g.v] > 0
      order by out_rem[g.v] desc, g.v
      limit 1;
      exit when not found;

      select array_agg(s.v) into picks from (
        select g.v from generate_series(1, n) g(v)
        where g.v <> i and in_rem[g.v] > 0
        order by in_rem[g.v] desc, out_rem[g.v] desc, (g.v - i + n) % n
        limit out_rem[i]
      ) s;
      if coalesce(array_length(picks, 1), 0) < out_rem[i] then
        ok := false;
        exit;
      end if;
      foreach x in array picks loop
        in_rem[x] := in_rem[x] - 1;
        e_from := e_from || i;
        e_to := e_to || x;
      end loop;
      out_rem[i] := 0;
    end loop;

    exit when ok;

    select g.v into lo from generate_series(1, n) g(v)
    where k[g.v] < n - 1
    order by k[g.v], g.v
    limit 1;
    if not found then
      -- Unreachable: all kᵢ = n − 1 is the full mesh, which always exists.
      raise exception 'cohort_digraph: no assignment for %', p_k;
    end if;
    k[lo] := k[lo] + 1;
  end loop;

  return query select e_from[g.v], e_to[g.v] from generate_series(1, coalesce(array_length(e_from, 1), 0)) g(v);
end;
$$;
revoke all on function private.cohort_digraph(int[]) from public, anon, authenticated;

-- Pure testers (FR-33): 14 apps (all if fewer), lowest coverage relative to the app's
-- demand kᵢ first, ties random, never their own app or a deleted one.
create or replace function private.assign_pure_tester(p_cohort_id uuid, p_user_id uuid, p_at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.assignments (cohort_id, tester_user_id, app_id, assigned_at, created_at)
  select p_cohort_id, p_user_id, m.app_id, p_at, p_at
  from public.cohort_members m
  join public.apps ap on ap.id = m.app_id
  cross join lateral (
    select count(*) as n from public.assignments x
    where x.cohort_id = p_cohort_id and x.app_id = m.app_id and x.state = 'open'
  ) cov
  where m.cohort_id = p_cohort_id
    and m.app_id is not null
    and not ap.deleted
    and ap.creator_id <> p_user_id
  order by cov.n::numeric / coalesce(m.demand, 14), random()
  limit 14;

  update public.cohort_members set assigned_at = p_at where cohort_id = p_cohort_id and user_id = p_user_id;
end;
$$;

create or replace function public.start_cohort(p_cohort_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cohorts;
  n int;
  started timestamptz := now();
  uids uuid[];
  app_ids uuid[];
  ks int[];
  p record;
begin
  perform private.require_admin();
  c := private.lock_cohort(p_cohort_id);
  if c.status <> 'forming' then
    perform private.fail('failed-precondition', 'Cohort ini sudah dimulai.');
  end if;

  select count(*) into n from public.cohort_members where cohort_id = c.id and app_id is not null;
  if n < 13 then
    perform private.fail('failed-precondition',
      'Butuh minimal 13 aplikasi untuk memulai cohort. Sekarang baru ' || n || '.');
  end if;
  if exists (
    select 1 from public.cohort_members m join public.apps ap on ap.id = m.app_id
    where m.cohort_id = c.id and ap.deleted
  ) then
    perform private.fail('failed-precondition', 'Ada aplikasi anggota yang sudah dihapus. Keluarkan anggotanya dulu.');
  end if;

  -- Random order of the members who bring an app (kept as ring_position).
  update public.cohort_members m set ring_position = r.pos
  from (
    select user_id, (row_number() over (order by random()) - 1)::int as pos
    from public.cohort_members
    where cohort_id = c.id and app_id is not null
  ) r
  where m.cohort_id = c.id and m.user_id = r.user_id;

  -- ADR-012 §5: demand kᵢ = min(slotsᵢ + 2, N − 1); the creator tests kᵢ apps and the
  -- app receives kᵢ creator testers (cohort_digraph may raise the smallest kᵢ).
  select array_agg(m.user_id order by m.ring_position),
         array_agg(m.app_id order by m.ring_position),
         array_agg(least(ap.tester_slots + 2, n - 1) order by m.ring_position)
  into uids, app_ids, ks
  from public.cohort_members m
  join public.apps ap on ap.id = m.app_id
  where m.cohort_id = c.id and m.app_id is not null;

  insert into public.assignments (cohort_id, tester_user_id, app_id, assigned_at, created_at)
  select c.id, uids[g.tester_idx], app_ids[g.app_idx], started, started
  from private.cohort_digraph(ks) g;

  update public.cohort_members m set demand = d.k
  from (
    select tester_user_id, count(*)::smallint as k
    from public.assignments
    where cohort_id = c.id
    group by tester_user_id
  ) d
  where m.cohort_id = c.id and m.user_id = d.tester_user_id;

  -- FR-33: pure testers present at Day 0, one by one in random order.
  for p in
    select user_id from public.cohort_members where cohort_id = c.id and app_id is null order by random()
  loop
    perform private.assign_pure_tester(c.id, p.user_id, started);
  end loop;

  update public.cohort_members set assigned_at = started where cohort_id = c.id;
  update public.cohorts set status = 'active', day0_at = started where id = c.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Ready to apply = eligible ≥ tester_slots (amends FR-18)
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
    where m.cohort_id = c.id and st.eligible_count < ap.tester_slots
  ) then
    perform private.fail('failed-precondition',
      'Sebelum hari ke-21, cohort hanya bisa ditutup kalau semua aplikasi sudah siap diajukan (target testernya sudah lulus 14 hari).');
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

create or replace function public.due_reminders()
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
  -- new_build: build posted in the last 24 h on an app the member actively tests.
  select
    t.user_id,
    u.email::text  as full_email,
    p.display_name,
    'new_build'    as kind,
    b.id           as ref_id,
    a.name         as app_name,
    jsonb_build_object(
      'version_name', b.version_name,
      'changelog',    b.changelog
    )              as extra
  from public.builds b
  join public.apps a on a.id = b.app_id and not a.deleted
  join public.testers t on t.app_id = b.app_id and t.status = 'active' and t.user_id is not null
  join public.profiles p on p.id = t.user_id and p.email_reminders
  join auth.users u on u.id = t.user_id
  where b.created_at >= now() - interval '24 hours'
    -- not the creator of this app
    and t.user_id <> a.creator_id
    -- not already logged today
    and not exists (
      select 1 from public.reminder_log rl
      where rl.user_id = t.user_id
        and rl.kind = 'new_build'
        and rl.ref_id = b.id
        and rl.sent_on = current_date
    )

  union all

  -- unreplied_feedback: creator has verified feedback not replied to for > 3 days.
  select
    a.creator_id   as user_id,
    u.email::text  as full_email,
    p.display_name,
    'unreplied_feedback' as kind,
    t.id           as ref_id,
    a.name         as app_name,
    jsonb_build_object(
      'tester_name',       t.display_name,
      'feedback_summary',  t.feedback_summary
    )              as extra
  from public.testers t
  join public.apps a on a.id = t.app_id and not a.deleted
  join public.profiles p on p.id = a.creator_id and p.email_reminders
  join auth.users u on u.id = a.creator_id
  where t.feedback_verified
    and not t.replied
    and t.feedback_sent_at is not null
    and t.feedback_sent_at <= now() - interval '3 days'
    and t.status = 'active'
    and not exists (
      select 1 from public.reminder_log rl
      where rl.user_id = a.creator_id
        and rl.kind = 'unreplied_feedback'
        and rl.ref_id = t.id
        and rl.sent_on = current_date
    )

  union all

  -- app_eligible: creator's app just reached its tester_slots eligible testers (ADR-012) (FR-45, FR-44).
  -- "Just crossed" = eligible_count is now >= tester_slots and this kind+ref never logged before.
  select
    a.creator_id as user_id,
    u.email::text as full_email,
    p.display_name,
    'app_eligible' as kind,
    a.id           as ref_id,
    a.name         as app_name,
    jsonb_build_object(
      'eligible_count', stats.eligible_count
    )              as extra
  from public.app_stats stats
  join public.apps a on a.id = stats.app_id and not a.deleted
  join public.profiles p on p.id = a.creator_id and p.email_reminders
  join auth.users u on u.id = a.creator_id
  where stats.eligible_count >= a.tester_slots
    and not exists (
      select 1 from public.reminder_log rl
      where rl.user_id = a.creator_id
        and rl.kind = 'app_eligible'
        and rl.ref_id = a.id
        -- no sent_on filter: this is a one-time notification per app
    );
$$;
