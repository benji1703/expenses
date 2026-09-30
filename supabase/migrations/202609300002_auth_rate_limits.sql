begin;
create table public.auth_rate_limits (
 key text primary key,
 window_start timestamptz not null,
 attempts integer not null default 1
);
alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from anon, authenticated;
create function public.consume_auth_rate_limit(p_key text, p_limit integer default 5, p_window_seconds integer default 900)
returns boolean language plpgsql security definer set search_path = '' as $$
declare count_attempts integer;
begin
 delete from public.auth_rate_limits where window_start < now() - interval '1 day';
 insert into public.auth_rate_limits(key,window_start,attempts) values(p_key,now(),1)
 on conflict(key) do update set
 attempts = case when public.auth_rate_limits.window_start <= now()-make_interval(secs=>p_window_seconds) then 1 else public.auth_rate_limits.attempts+1 end,
 window_start = case when public.auth_rate_limits.window_start <= now()-make_interval(secs=>p_window_seconds) then now() else public.auth_rate_limits.window_start end
 returning attempts into count_attempts;
 return count_attempts <= p_limit;
end;
$$;
revoke all on function public.consume_auth_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text,integer,integer) to service_role;
commit;
