-- Self-reported: member has joined the community Google Group (once for all
-- google_group apps). No Google Groups API exists; clearable when they leave.
-- Signed-out beginners still use per-app session soft progress only.

alter table public.profiles
  add column joined_community_group boolean not null default false;

create function public.set_joined_community_group(p_joined boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
begin
  if p_joined is null then
    perform private.fail('invalid-argument', 'Pilihan status Google Group tidak valid.');
  end if;
  perform private.upsert_profile(uid);
  update public.profiles set joined_community_group = p_joined where id = uid;
end;
$$;

revoke all on function public.set_joined_community_group(boolean) from public;
grant execute on function public.set_joined_community_group(boolean) to anon, authenticated;

-- Existing members who already recorded on a closed-test Google Group app must have
-- claimed joinedGroup at join time — seed the durable flag so they are not asked again.
update public.profiles p
set joined_community_group = true
where exists (
  select 1
  from public.testers e
  join public.apps a on a.id = e.app_id and not a.deleted
  where e.user_id = p.id
    and e.status in ('active', 'left')
    and a.tester_method = 'google_group'
    and a.status is distinct from 'live'
);
