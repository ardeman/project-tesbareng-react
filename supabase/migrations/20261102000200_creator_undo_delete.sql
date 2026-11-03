-- ADR-009 §7: app delete becomes delete + undo. The creator may restore their
-- own app within 10 minutes of deleting it (the "Urungkan" toast); after that,
-- only an admin restores. Owner decision 2026-11-02.

alter table public.apps add column deleted_at timestamptz;

-- Rows deleted before this migration count as long past the undo window.
update public.apps set deleted_at = updated_at where deleted and deleted_at is null;

alter table public.apps add constraint apps_deleted_at_matches
  check ((deleted and deleted_at is not null) or (not deleted and deleted_at is null));

create or replace function public.delete_app(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps := private.require_manager(uid, p_app_id);
begin
  update public.apps set deleted = true, deleted_at = now(), updated_at = now() where id = a.id;
end;
$$;

create or replace function public.restore_app(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.caller();
  a public.apps;
begin
  select * into a from public.apps where id = p_app_id;
  if not found then
    perform private.fail('not-found', 'Aplikasi tidak ditemukan.');
  end if;
  if not public.is_admin() then
    if a.creator_id is distinct from uid then
      perform private.fail('permission-denied', 'Hanya admin yang bisa memulihkan aplikasi.');
    end if;
    if not a.deleted then
      return;
    end if;
    if a.deleted_at < now() - interval '10 minutes' then
      perform private.fail('permission-denied', 'Batas waktu urungkan sudah lewat. Minta admin untuk memulihkan aplikasi.');
    end if;
  end if;
  if a.deleted then
    perform private.check_package_free(a.package_name, a.id);
    update public.apps set deleted = false, deleted_at = null, updated_at = now() where id = a.id;
  end if;
end;
$$;
