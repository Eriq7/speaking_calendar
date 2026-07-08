-- AI Reminders — add completed column to reminders
-- INV-NEW: reminders.completed tracks user acknowledgment independently of sent (push delivery).
-- sent  = system pushed the notification
-- completed = user marked the occurrence as done
alter table public.reminders
  add column if not exists completed boolean not null default false;

-- Partial index: fast lookup of uncompleted reminders (used by grid, upcoming, and push queries).
create index if not exists reminders_uncompleted_idx
  on public.reminders (fire_at)
  where completed = false;
