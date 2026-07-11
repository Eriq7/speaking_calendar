-- 005_multi_user.sql: Add Supabase Auth + per-user data isolation (RLS)
-- Decisions locked in: grill_me_process/multi_user_auth_migration_decisions.md

-- Step 1: clear single-tenant data (user_id will be NOT NULL, so clean slate is required)
truncate table public.reminders cascade;
truncate table public.subscriptions cascade;
truncate table public.events cascade;

-- Step 2: drop singleton settings, recreate as per-user
drop table public.settings;

create table public.settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  user_name   text not null default 'friend',
  butler_name text not null default 'Alfred',
  timezone    text not null default 'UTC'
);

-- Step 3: add user_id to events
alter table public.events
  add column user_id uuid not null references auth.users(id) on delete cascade;

-- Step 4: add user_id to reminders
alter table public.reminders
  add column user_id uuid not null references auth.users(id) on delete cascade;

-- Step 5: add user_id to subscriptions
alter table public.subscriptions
  add column user_id uuid not null references auth.users(id) on delete cascade;

-- Step 6: trigger — auto-insert default settings row on new user registration
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.settings (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Step 7: enable RLS on all data tables
alter table public.events        enable row level security;
alter table public.reminders     enable row level security;
alter table public.subscriptions enable row level security;
alter table public.settings      enable row level security;

-- Step 8: RLS policies — each user accesses only their own rows
create policy "events_own_rows"
  on public.events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reminders_own_rows"
  on public.reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "subscriptions_own_rows"
  on public.subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "settings_own_row"
  on public.settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
