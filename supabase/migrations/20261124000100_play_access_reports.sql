-- Shared "Play not available" reports (self-reported; no Play Console API).
-- Public count on the app; creator/admin clears all when they confirm the track works.

create table public.play_access_reports (
  app_id uuid not null references public.apps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reported_at timestamptz not null default now(),
  primary key (app_id, user_id)
);

create index play_access_reports_user_idx on public.play_access_reports (user_id);

alter table public.play_access_reports enable row level security;
create policy "play access reports are public" on public.play_access_reports for select using (true);
revoke all on public.play_access_reports from anon, authenticated;
grant select on public.play_access_reports to anon, authenticated;
grant all on public.play_access_reports to service_role;

alter publication supabase_realtime add table public.play_access_reports;

-- ---------------------------------------------------------------------------
-- app_stats: append play_unreachable_count
-- ---------------------------------------------------------------------------

create or replace view public.app_stats with (security_invoker = true) as
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
  coalesce(ps.feedback_verified_count, 0)::int as creator_feedback_verified_count,
  coalesce(ps.badge_tier, 'none') as creator_badge_tier,
  coalesce(c.counted_days, 0)::int as counted_days,
  coalesce(r.play_unreachable_count, 0)::int as play_unreachable_count
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
  select greatest(0, floor(extract(epoch from now() - e.opted_in_at) / 86400))::int as counted_days
  from public.testers e
  where e.app_id = a.id and e.status = 'active'
  order by e.opted_in_at asc
  offset a.tester_slots - 1
  limit 1
) c on true
left join lateral (
  select count(*) as build_count, max(x.uploaded_at) as last_build_at
  from public.builds x
  where x.app_id = a.id
) b on true
left join lateral (
  select count(*)::int as play_unreachable_count
  from public.play_access_reports p
  where p.app_id = a.id
) r on true
left join public.profile_stats ps on ps.profile_id = a.creator_id;

revoke all on public.app_stats from anon, authenticated;
grant select on public.app_stats to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.report_play_unreachable(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps;
begin
  perform private.upsert_profile(uid);
  a := private.live_app(p_app_id);
  if a.creator_id = uid then
    perform private.fail('permission-denied', 'Anda tidak bisa melaporkan Play untuk aplikasi Anda sendiri.');
  end if;
  if exists (
    select 1 from public.testers
    where app_id = a.id and user_id = uid and status = 'removed'
  ) then
    perform private.fail('permission-denied', 'Creator sudah mengeluarkan Anda dari daftar tester aplikasi ini.');
  end if;
  insert into public.play_access_reports (app_id, user_id)
  values (a.id, uid)
  on conflict (app_id, user_id) do nothing;
end;
$$;

create function public.clear_my_play_unreachable(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
begin
  delete from public.play_access_reports
  where app_id = p_app_id and user_id = uid;
  if not found then
    perform private.fail('not-found', 'Laporan Play Anda tidak ditemukan.');
  end if;
end;
$$;

create function public.clear_app_play_unreachable(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps := private.require_manager(uid, p_app_id);
begin
  delete from public.play_access_reports where app_id = a.id;
end;
$$;

revoke all on function
  public.report_play_unreachable(uuid),
  public.clear_my_play_unreachable(uuid),
  public.clear_app_play_unreachable(uuid)
from public;
grant execute on function
  public.report_play_unreachable(uuid),
  public.clear_my_play_unreachable(uuid),
  public.clear_app_play_unreachable(uuid)
to anon, authenticated;

-- On successful join: remember Google Group claim (closed-test GG apps) and drop
-- any Play-unavailable report for this member on this app (works even for older clients).
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
  else
    insert into public.testers (app_id, user_id, display_name, photo_url, masked_email, opted_in_at, status, added_by)
    values (a.id, uid, me.display_name, me.photo_url, me.masked_email, now(), 'active', 'self');
  end if;

  if a.tester_method = 'google_group' and a.status is distinct from 'live'
     and p_checklist -> 'joinedGroup' = 'true'::jsonb then
    update public.profiles set joined_community_group = true where id = uid;
  end if;
  delete from public.play_access_reports where app_id = a.id and user_id = uid;
end;
$$;
