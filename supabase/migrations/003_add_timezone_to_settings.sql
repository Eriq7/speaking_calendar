-- Persist the user's IANA timezone so the Edge Function backfill can compute
-- correct UTC fire_at values (INV-1) and dedupe against creation-time reminders (INV-2).
alter table public.settings
  add column if not exists timezone text not null default 'UTC';
