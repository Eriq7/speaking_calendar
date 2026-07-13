-- 007_flexible_offsets: unit-aware early reminder columns
-- Replaces the single `early_reminder` (integer = days) with early_value + early_unit
-- so users can express reminders in minutes, hours, days, weeks, or months.

-- events: add new columns (keep early_reminder for backward compat during migration)
alter table public.events
  add column if not exists early_value integer,
  add column if not exists early_unit  text
    check (early_unit in ('minute', 'hour', 'day', 'week', 'month'));

-- Migrate existing day-based reminders into new columns.
update public.events
set early_value = early_reminder,
    early_unit  = 'day'
where early_reminder is not null
  and early_value is null;

-- reminders: add new columns alongside legacy days_before.
alter table public.reminders
  add column if not exists early_value integer,
  add column if not exists early_unit  text;
