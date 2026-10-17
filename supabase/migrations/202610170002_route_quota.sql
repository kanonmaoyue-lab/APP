create table public.route_quota(user_id uuid primary key references auth.users(id)on delete cascade,minute timestamptz not null,calls int not null check(calls between 1 and 20));
alter table public.route_quota enable row level security;
revoke all on public.route_quota from anon,authenticated;
create function public.consume_route_quota(account_id uuid)returns boolean language plpgsql security definer set search_path='' as $$
declare count_value int;window_start timestamptz:=date_trunc('minute',statement_timestamp());
begin
 insert into public.route_quota values(account_id,window_start,1)on conflict(user_id)do update set minute=excluded.minute,calls=case when route_quota.minute<>excluded.minute then 1 else route_quota.calls+1 end where route_quota.minute<>excluded.minute or route_quota.calls<20 returning calls into count_value;
 return count_value is not null;
end $$;
revoke all on function public.consume_route_quota(uuid)from public,anon,authenticated;
grant execute on function public.consume_route_quota(uuid)to service_role;
