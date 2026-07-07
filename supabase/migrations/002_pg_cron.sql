-- AI Reminders — scheduled jobs
-- Requires the `pg_cron` and `pg_net` extensions (available on Supabase).
--
-- Secrets are read from Supabase Vault, never hardcoded (INV-10).
-- Before running, create two secrets in Vault (see migrations/README.md):
--   - name 'edge_function_url'  value 'https://<project-ref>.supabase.co/functions/v1/push'
--   - name 'service_role_key'   value '<your service role key>'

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: POST to the push Edge Function with a given body.
-- Reads url + service key from Vault at call time.
create or replace function public.trigger_push(body jsonb)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  fn_url text;
  svc_key text;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'edge_function_url';
  select decrypted_secret into svc_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if fn_url is null or svc_key is null then
    raise exception 'Vault secrets edge_function_url / service_role_key are not set';
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body    := body
  );
end;
$$;

-- Every minute: trigger the Edge Function to send due reminders.
-- The Edge Function itself scans reminders where fire_at <= now() and sent = false.
select cron.schedule(
  'push-due-reminders',
  '* * * * *',
  $$ select public.trigger_push('{"mode":"send"}'::jsonb); $$
);

-- Weekly (Mon 00:00 UTC): backfill reminders for open-ended recurring events
-- so they always extend to the end of next year (INV-8).
select cron.schedule(
  'backfill-recurring',
  '0 0 * * 1',
  $$ select public.trigger_push('{"mode":"backfill"}'::jsonb); $$
);
