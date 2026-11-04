-- Email-list testing (ADR-011) is unlocked by testing others first:
-- a creator may set tester_method = 'email_list' only once their reciprocity
-- Testing count (profile_stats.testing_count: Active entries + Left after 14+
-- days, never Removed or on deleted apps) is at least 3.
--
-- Enforced by a trigger so create_app, update_app and any future writer obey it.
-- Only switching to email_list is checked: an app that already uses it keeps it
-- even if the creator's count later drops, and switching back to the group is
-- always allowed.

create function private.email_list_min_testing()
returns int
language sql
immutable
set search_path = ''
as $$ select 3 $$;
revoke all on function private.email_list_min_testing() from public, anon, authenticated;

create function private.check_email_list_unlock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_min int := private.email_list_min_testing();
begin
  if new.tester_method = 'email_list'
     and (tg_op = 'INSERT' or old.tester_method is distinct from 'email_list') then
    select coalesce(s.testing_count, 0) into v_count
    from public.profile_stats s
    where s.profile_id = new.creator_id;
    if coalesce(v_count, 0) < v_min then
      perform private.fail('failed-precondition',
        format('Daftar email terbuka setelah kamu menguji %s aplikasi anggota lain (sekarang %s).', v_min, coalesce(v_count, 0)));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.check_email_list_unlock() from public, anon, authenticated;

create trigger apps_email_list_unlock
  before insert or update of tester_method on public.apps
  for each row execute function private.check_email_list_unlock();
