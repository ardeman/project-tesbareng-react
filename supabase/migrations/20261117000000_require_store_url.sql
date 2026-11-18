-- Owner decision 2026-11-17: Play Store listing URL is required on create/update so
-- testers (especially on mobile) can open the app page after joining the Google Group.
-- Existing rows may still have null store_url; the web UI falls back to the opt-in link.

create or replace function private.store_url(v text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := private.req_text(v, 'Link halaman Play Store', 500);
begin
  if s !~ '^https://play\.google\.com/store/apps/\S+$' then
    perform private.fail('invalid-argument', 'Link halaman Play Store harus diawali https://play.google.com/store/apps/');
  end if;
  return s;
end;
$$;
