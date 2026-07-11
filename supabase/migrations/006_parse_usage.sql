-- 006_parse_usage.sql: per-user daily parse cap (guards the shared OpenAI key)
create table public.parse_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  count   int  not null default 0,
  primary key (user_id, day)
);
alter table public.parse_usage enable row level security;
create policy "parse_usage_own_rows" on public.parse_usage for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 原子自增 + 判额度;返回 true 表示本次允许
create or replace function public.incr_parse_usage(p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into public.parse_usage (user_id, day, count) values (auth.uid(), current_date, 1)
    on conflict (user_id, day) do update set count = parse_usage.count + 1
    returning count into c;
  return c <= p_limit;
end; $$;
