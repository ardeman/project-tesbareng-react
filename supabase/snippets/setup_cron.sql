-- Daily reminder digest (ADR-006, PRD FR-44): run ONCE by the project owner on the
-- hosted project, after the send-reminders Edge Function is deployed. Not a migration:
-- it holds a project URL and a secret that differ per environment.
--
-- Before running:
--   1. Deploy the function:  supabase functions deploy send-reminders
--   2. Set its secrets:      supabase secrets set REMINDER_SECRET=<random> GMAIL_USER=<address> \
--                              GMAIL_APP_PASSWORD=<app password> APP_URL=<site URL>
--   3. Store the same REMINDER_SECRET in Vault (SQL editor):
--        select vault.create_secret('<random>', 'reminder_secret');
--   4. Replace <project-ref> below.
--
-- 12:00 UTC = 19:00 WIB. pg_cron and pg_net are enabled by 20261102000100_reminders.sql.

select cron.schedule(
  'send-reminders-daily',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Check:   select jobname, schedule, active from cron.job;
-- History: select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
-- Remove:  select cron.unschedule('send-reminders-daily');
