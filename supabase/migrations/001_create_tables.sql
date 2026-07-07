-- AI Reminders — core schema
-- INV-1: reminders.fire_at is a UTC timestamp
-- INV-7: events.date stores a local date (YYYY-MM-DD); tz conversion only when generating fire_at

create extension if not exists "pgcrypto";

-- ============================================================
-- events
-- ============================================================
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  title           text        not null,
  note            text,
  date            date        not null,          -- local date, YYYY-MM-DD
  "time"          text,                           -- HH:MM (24h), null = all-day
  location        text,
  early_reminder  integer,                        -- days before, null = none
  rrule           text,                           -- iCalendar RRULE, null = no repeat
  repeat_end_date date,                           -- null = repeat forever
  color           text        not null,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- reminders
-- ============================================================
create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid        not null references public.events(id) on delete cascade,
  fire_at     timestamptz not null,               -- UTC trigger time (INV-1)
  kind        text        not null check (kind in ('day-of', 'early')),
  days_before integer,                             -- set when kind = 'early'
  sent        boolean     not null default false,  -- INV-4
  -- denormalized fields for the Edge Function to build the message
  title       text        not null,
  "time"      text,
  location    text,
  color       text        not null
);

-- pg_cron scans due, unsent reminders every minute
create index if not exists reminders_due_idx
  on public.reminders (fire_at)
  where sent = false;

create index if not exists reminders_event_id_idx
  on public.reminders (event_id);

-- ============================================================
-- settings (singleton row)
-- ============================================================
create table if not exists public.settings (
  id          boolean primary key default true check (id),
  user_name   text    not null default 'friend',
  butler_name text    not null default 'Alfred'
);

insert into public.settings (id) values (true)
  on conflict (id) do nothing;

-- ============================================================
-- subscriptions (Web Push endpoints)
-- ============================================================
create table if not exists public.subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text        not null unique,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now()
);
