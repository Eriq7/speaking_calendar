# Supabase Deployment

## 1. Apply migrations

Run the SQL files in order against your Supabase project (SQL Editor or `supabase db push`):

1. `001_create_tables.sql` — creates `events`, `reminders`, `settings`, `subscriptions`.
2. `002_pg_cron.sql` — enables `pg_cron` + `pg_net` and schedules the push / backfill jobs.
3. `003_add_timezone_to_settings.sql` — adds `settings.timezone` (source of truth the backfill job reads to compute UTC fire_at).

## 2. Store secrets in Vault (required before 002 works)

`002_pg_cron.sql` reads the Edge Function URL and service role key from Supabase Vault
so nothing is hardcoded (INV-10). Create them in the SQL Editor:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/push',
  'edge_function_url'
);
select vault.create_secret(
  '<your-service-role-key>',
  'service_role_key'
);
```

## 3. Deploy the Edge Function

```bash
supabase functions deploy push
```

Set the function's environment secrets (VAPID + service role):

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=<...> \
  VAPID_PRIVATE_KEY=<...> \
  VAPID_MAILTO=mailto:you@example.com
```

Keep `verify_jwt = true` (the default) for the `push` function so only callers
with a valid service-role JWT (i.e. the pg_cron job) can trigger it. Disabling it
would let anyone POST `{"mode":"send"}` to suppress notifications or `{"mode":"backfill"}`
to flood reminders (RD-2).

## Scheduled jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `push-due-reminders` | every minute | POST `{"mode":"send"}` → Edge Function sends due reminders |
| `backfill-recurring` | Mon 00:00 UTC | POST `{"mode":"backfill"}` → extends open-ended recurring reminders (INV-8) |

Inspect / unschedule:

```sql
select * from cron.job;
select cron.unschedule('push-due-reminders');
```
