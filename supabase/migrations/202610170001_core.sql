create extension if not exists "uuid-ossp" with schema extensions;
create table public.records(
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('profiles','categories','events','recurrences','overrides','reviewItems','reviewLogs')),
 id uuid not null,version bigint not null check(version>0),updated_at timestamptz not null,deleted_at timestamptz,payload jsonb not null check(jsonb_typeof(payload)='object'),primary key(user_id,kind,id)
);
create unique index review_once on public.records(user_id,(payload->>'itemId'),(payload->>'reviewDate')) where kind='reviewLogs';
create unique index review_calendar_once on public.records(user_id,(payload->>'reviewItemId'),(payload->>'plannedDate')) where kind='events' and payload->>'reviewItemId' is not null and deleted_at is null;
create unique index override_once on public.records(user_id,(payload->>'recurrenceId'),(payload->>'occurrenceDate')) where kind='overrides';
create table public.account_state(user_id uuid primary key references auth.users(id) on delete cascade,cursor bigint not null default 0);
create table public.receipts(user_id uuid not null references auth.users(id) on delete cascade,id uuid not null,result jsonb not null,primary key(user_id,id));
create table public.commits(user_id uuid not null references auth.users(id) on delete cascade,cursor bigint not null,batch jsonb not null,primary key(user_id,cursor));
alter table public.records enable row level security;alter table public.account_state enable row level security;alter table public.receipts enable row level security;alter table public.commits enable row level security;
revoke all on public.records,public.account_state,public.receipts,public.commits from anon,authenticated;
grant select on public.records to authenticated;
create policy own_records on public.records for select to authenticated using(user_id=auth.uid());

create function public.validate_record(t text,v jsonb,owner_id uuid) returns void language plpgsql set search_path='' as $$
declare fields text[];k text;p jsonb;n numeric;d date;reference_kind text;reference_id uuid;merged jsonb;
begin
 if jsonb_typeof(v) is distinct from 'object' then raise exception using errcode='22023',message='记录必须是对象';end if;
 fields:=array['table','id','userId','version','updatedAt','deletedAt']||case t
 when 'profiles' then array['timeZone','dayStart','dayEnd','travelMode'] when 'categories' then array['name','color']
 when 'events' then array['title','notes','plannedDate','startAt','endAt','durationMinutes','location','categoryId','locked','completedAt','reviewItemId','recurrenceId','occurrenceDate','travelMode']
 when 'recurrences' then array['template','rule','startsOn','endsOn','startTime','timeZone','daysOfWeek']
 when 'overrides' then array['recurrenceId','occurrenceDate','cancelled','patch']
 when 'reviewItems' then array['title','notes','learnedOn','level','nextReviewOn','durationMinutes','categoryId','archivedAt']
 when 'reviewLogs' then array['itemId','reviewDate','rating','previousLevel','nextLevel'] else array[]::text[] end;
 if t not in ('profiles','categories','events','recurrences','overrides','reviewItems','reviewLogs') or v->>'table' is distinct from t or v->>'userId' is distinct from owner_id::text or v->>'id' is null then raise exception using errcode='22023',message='记录身份无效';end if;
 perform (v->>'id')::uuid;
 if exists(select 1 from unnest(fields) f where not(v?f)) or exists(select 1 from jsonb_object_keys(v) f where not(f=any(fields))) then raise exception using errcode='22023',message='记录字段不完整或包含未知字段';end if;
 if t in ('events','reviewItems') then
  if jsonb_typeof(v->'title') is distinct from 'string' or length(trim(v->>'title')) not between 1 and 200 or jsonb_typeof(v->'notes') is distinct from 'string' or length(v->>'notes')>20000 then raise exception using errcode='22023',message='标题或笔记无效';end if;
  if jsonb_typeof(v->'durationMinutes') is distinct from 'number' then raise exception using errcode='22023',message='时长必须是数字';end if;n:=(v->>'durationMinutes')::numeric;
  if n not between 1 and 10080 or n<>trunc(n) then raise exception using errcode='22023',message='时长无效';end if;
  if v->>'categoryId' is not null and not exists(select 1 from public.records where user_id=owner_id and kind='categories' and id=(v->>'categoryId')::uuid) then raise exception using errcode='23503',message='分类不存在';end if;
 end if;
 if t='events' then
  if jsonb_typeof(v->'plannedDate') is distinct from 'string' or v->>'plannedDate'!~'^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='22023',message='事项日期无效';end if;d:=(v->>'plannedDate')::date;
  if ((v->>'startAt') is null)<>((v->>'endAt') is null) or v->>'startAt' is not null and extract(epoch from ((v->>'endAt')::timestamptz-(v->>'startAt')::timestamptz))<>n*60 then raise exception using errcode='22023',message='事项时间与时长不一致';end if;
  if jsonb_typeof(v->'locked') is distinct from 'boolean' or jsonb_typeof(v->'travelMode') is distinct from 'string' or v->>'travelMode' not in ('walking','cycling') then raise exception using errcode='22023',message='事项设置无效';end if;
  if v->>'completedAt' is not null then perform (v->>'completedAt')::timestamptz;end if;
  p:=v->'location';if p<>'null'::jsonb then
   if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'label') is distinct from 'string' or length(trim(p->>'label')) not between 1 and 500 or jsonb_typeof(p->'lat') is distinct from 'number' or jsonb_typeof(p->'lon') is distinct from 'number' then raise exception using errcode='22023',message='地点格式无效';end if;
   if (p->>'lat')::numeric not between -90 and 90 or (p->>'lon')::numeric not between -180 and 180 then raise exception using errcode='22023',message='地点坐标无效';end if;
  end if;
  foreach k in array array['reviewItemId','recurrenceId'] loop
   reference_kind:=case k when 'reviewItemId' then 'reviewItems' else 'recurrences' end;
   if v->>k is not null and not exists(select 1 from public.records where user_id=owner_id and kind=reference_kind and id=(v->>k)::uuid) then raise exception using errcode='23503',message='关联记录不存在';end if;
  end loop;
 elsif t='profiles' then
  if v->>'id'<>owner_id::text or not exists(select 1 from pg_catalog.pg_timezone_names where name=v->>'timeZone') or v->>'dayStart' is null or v->>'dayEnd' is null or v->>'dayStart'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or v->>'dayEnd'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or v->>'dayStart'>=v->>'dayEnd' or v->>'travelMode' is null or v->>'travelMode' not in ('walking','cycling') then raise exception using errcode='22023',message='账号偏好无效';end if;
 elsif t='categories' then
  if jsonb_typeof(v->'name') is distinct from 'string' or length(trim(v->>'name')) not between 1 and 40 or v->>'color' is null or v->>'color'!~'^#[0-9a-fA-F]{6}$' then raise exception using errcode='22023',message='分类无效';end if;
 elsif t='reviewItems' then
  if jsonb_typeof(v->'learnedOn') is distinct from 'string' or v->>'learnedOn'!~'^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='22023',message='学习日期无效';end if;d:=(v->>'learnedOn')::date;if v->>'archivedAt' is not null then perform (v->>'archivedAt')::timestamptz;end if;
 elsif t='recurrences' then
  perform public.validate_record('events',v->'template',owner_id);
  if v->'template'->>'reviewItemId' is not null or v->'template'->>'recurrenceId' is not null or v->>'rule' is null or v->>'rule' not in ('daily','weekdays','weekly') or jsonb_typeof(v->'startsOn') is distinct from 'string' or v->>'startTime' is null or v->>'startTime'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or not exists(select 1 from pg_catalog.pg_timezone_names where name=v->>'timeZone') then raise exception using errcode='22023',message='重复设置无效';end if;
  d:=(v->>'startsOn')::date;if v->>'endsOn' is not null and (v->>'endsOn')::date<d then raise exception using errcode='22023',message='重复日期无效';end if;
  if jsonb_typeof(v->'daysOfWeek') is distinct from 'array' or jsonb_array_length(v->'daysOfWeek') not between 1 and 7 then raise exception using errcode='22023',message='重复星期无效';end if;
  for p in select * from jsonb_array_elements(v->'daysOfWeek') loop if jsonb_typeof(p)<>'number' or (p::text)::numeric<>trunc((p::text)::numeric) or (p::text)::int not between 1 and 7 then raise exception using errcode='22023',message='重复星期无效';end if;end loop;
 elsif t='overrides' then
  if v->>'recurrenceId' is null or jsonb_typeof(v->'occurrenceDate') is distinct from 'string' or jsonb_typeof(v->'cancelled') is distinct from 'boolean' or jsonb_typeof(v->'patch') is distinct from 'object' then raise exception using errcode='22023',message='重复例外无效';end if;
  d:=(v->>'occurrenceDate')::date;
  if (v->>'id')::uuid<>extensions.uuid_generate_v5((v->>'recurrenceId')::uuid,d::text) then raise exception using errcode='22023',message='例外标识无效';end if;
  select payload->'template' into merged from public.records where user_id=owner_id and kind='recurrences' and id=(v->>'recurrenceId')::uuid;
  if merged is null then raise exception using errcode='23503',message='重复系列不存在';end if;
  if not(v->>'cancelled')::boolean then perform public.validate_record('events',merged||(v->'patch'),owner_id);end if;
 end if;
end $$;

create function public.put_record(t text,owner_id uuid,record_id uuid,value jsonb) returns jsonb language plpgsql set search_path='' as $$
declare old public.records;v jsonb;stamp timestamptz:=clock_timestamp();
begin
 select * into old from public.records where user_id=owner_id and kind=t and id=record_id;
 if value is null and old.id is null then return null;end if;
 v:=coalesce(value,old.payload);
 if value is not null then
  perform public.validate_record(t,v,owner_id);if v->>'id' is distinct from record_id::text then raise exception using errcode='22023',message='记录标识不匹配';end if;
  if t='reviewItems' then
   if old.id is not null and v->>'learnedOn' is distinct from old.payload->>'learnedOn' then raise exception using errcode='22023',message='已有主题的学习日期不允许改写';end if;
   v:=v||case when old.id is null then jsonb_build_object('level',0,'nextReviewOn',((v->>'learnedOn')::date+1)::text) else jsonb_build_object('level',old.payload->'level','nextReviewOn',old.payload->'nextReviewOn') end;
  end if;
 end if;
 v:=v||jsonb_build_object('id',record_id,'userId',owner_id,'table',t,'version',coalesce(old.version,0)+1,'updatedAt',stamp,'deletedAt',case when value is null then to_jsonb(stamp) else 'null'::jsonb end);
 insert into public.records values(owner_id,t,record_id,coalesce(old.version,0)+1,stamp,case when value is null then stamp else null end,v) on conflict(user_id,kind,id)do update set version=excluded.version,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,payload=excluded.payload;
 return v;
end $$;

create or replace function public.apply_operation(operation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();op_id uuid;cmd jsonb;seq bigint;result jsonb;c jsonb;v jsonb;current public.records;out_entities jsonb:='[]';conflicts jsonb:='[]';item jsonb;review_day date;last_day date;zone text;previous int;grade int;log_id uuid;batch jsonb;
begin
 if owner_id is null then raise exception using errcode='28000',message='请先登录';end if;
 if operation->>'userId' is distinct from owner_id::text or pg_column_size(operation)>1048576 then raise exception using errcode='22023',message='操作身份或大小无效';end if;
 op_id:=(operation->>'id')::uuid;cmd:=operation->'command';
 insert into public.account_state(user_id)values(owner_id)on conflict do nothing;
 select cursor into seq from public.account_state where user_id=owner_id for update;
 select r.result into result from public.receipts r where r.user_id=owner_id and r.id=op_id;if found then return result;end if;
 if cmd->>'kind'='write' then
  if jsonb_typeof(cmd->'changes') is distinct from 'array' or jsonb_array_length(cmd->'changes') not between 1 and 50 then raise exception using errcode='22023',message='操作数量应为1至50';end if;
  if (select count(*) from jsonb_array_elements(cmd->'changes'))<>(select count(distinct(x->>'table',x->>'id'))from jsonb_array_elements(cmd->'changes')x)then raise exception using errcode='22023',message='操作含重复记录';end if;
  if cmd?'expectedCursor' then
   if jsonb_typeof(cmd->'expectedCursor') is distinct from 'string' or cmd->>'expectedCursor'!~'^[0-9]+$' then raise exception using errcode='22023',message='日程快照无效';end if;
   if (cmd->>'expectedCursor')::bigint<>seq then result:=jsonb_build_object('status','conflict','entities','[]'::jsonb,'reason','scheduleChanged');end if;
  end if;
  for c in select * from jsonb_array_elements(cmd->'changes') loop
   if c->>'table' is null or c->>'table' not in ('profiles','categories','events','recurrences','overrides','reviewItems') or jsonb_typeof(c->'baseVersion') is distinct from 'number' or (c->>'baseVersion')::numeric<>trunc((c->>'baseVersion')::numeric) or (c->>'baseVersion')::bigint<0 then raise exception using errcode='22023',message='记录类型或版本无效';end if;
   select * into current from public.records where user_id=owner_id and kind=c->>'table' and id=(c->>'id')::uuid;
   if coalesce(current.version,0)<>(c->>'baseVersion')::bigint or current.deleted_at is not null and c->'value'<>'null'::jsonb then
    if current.id is not null then conflicts:=conflicts||jsonb_build_array(current.payload);end if;
    result:=jsonb_build_object('status','conflict','entities',conflicts,'reason',case when current.deleted_at is not null then 'deleted' else 'version' end);
   end if;
  end loop;
  if result is not null then insert into public.receipts values(owner_id,op_id,result);return result;end if;
  for c in select * from jsonb_array_elements(cmd->'changes') loop
   v:=public.put_record(c->>'table',owner_id,(c->>'id')::uuid,nullif(c->'value','null'::jsonb));if v is not null then out_entities:=out_entities||jsonb_build_array(v);end if;
  end loop;
 elsif cmd->>'kind'='review' then
  if jsonb_typeof(cmd->'baseVersion') is distinct from 'number' or (cmd->>'baseVersion')::numeric<>trunc((cmd->>'baseVersion')::numeric) or (cmd->>'baseVersion')::bigint<0 then raise exception using errcode='22023',message='评分基础版本无效';end if;
  select * into current from public.records where user_id=owner_id and kind='reviewItems' and id=(cmd->>'itemId')::uuid;
  item:=current.payload;
  if item is null or current.deleted_at is not null or item->>'archivedAt' is not null or current.version<>(cmd->>'baseVersion')::bigint then result:=jsonb_build_object('status','conflict','entities',case when item is null then '[]'::jsonb else jsonb_build_array(item)end,'reason','reviewVersion');
  else
   if cmd->>'rating' is null or cmd->>'rating' not in ('forgot','fuzzy','remembered') then raise exception using errcode='22023',message='评分无效';end if;
   review_day:=(cmd->>'reviewDate')::date;select payload->>'timeZone' into zone from public.records where user_id=owner_id and kind='profiles' and deleted_at is null;
   if review_day is null or review_day<(item->>'learnedOn')::date or review_day>(clock_timestamp()at time zone coalesce(zone,'Asia/Shanghai'))::date then raise exception using errcode='22023',message='评分日期无效';end if;
   select max((payload->>'reviewDate')::date)into last_day from public.records where user_id=owner_id and kind='reviewLogs' and payload->>'itemId'=cmd->>'itemId';
   if last_day is not null and review_day<=last_day then result:=jsonb_build_object('status','conflict','entities',jsonb_build_array(item),'reason','alreadyReviewed');
   else
    previous:=(item->>'level')::int;grade:=case cmd->>'rating' when 'forgot' then 0 when 'fuzzy' then greatest(previous-1,0)else least(previous+1,4)end;
    v:=public.put_record('reviewItems',owner_id,(item->>'id')::uuid,item);v:=v||jsonb_build_object('level',grade,'nextReviewOn',(review_day+(array[1,3,7,14,30])[grade+1])::text);
    update public.records set payload=v where user_id=owner_id and kind='reviewItems' and id=(item->>'id')::uuid;out_entities:=out_entities||jsonb_build_array(v);
    log_id:=extensions.uuid_generate_v5((item->>'id')::uuid,review_day::text);
    v:=public.put_record('reviewLogs',owner_id,log_id,jsonb_build_object('table','reviewLogs','id',log_id,'userId',owner_id,'version',0,'updatedAt',clock_timestamp(),'deletedAt',null,'itemId',item->>'id','reviewDate',review_day::text,'rating',cmd->>'rating','previousLevel',previous,'nextLevel',grade));out_entities:=out_entities||jsonb_build_array(v);
    for c in select payload from public.records where user_id=owner_id and kind='events' and payload->>'reviewItemId'=item->>'id' and payload->>'plannedDate'=review_day::text and deleted_at is null loop
     v:=public.put_record('events',owner_id,(c->>'id')::uuid,c||jsonb_build_object('completedAt',clock_timestamp()));out_entities:=out_entities||jsonb_build_array(v);
    end loop;
   end if;
  end if;
  if result is not null then insert into public.receipts values(owner_id,op_id,result);return result;end if;
 else raise exception using errcode='22023',message='未知操作';end if;
 seq:=seq+1;update public.account_state set cursor=seq where user_id=owner_id;
 batch:=jsonb_build_object('cursor',seq::text,'operationId',op_id,'entities',out_entities);result:=jsonb_build_object('status','applied','batch',batch);
 insert into public.commits values(owner_id,seq,batch);insert into public.receipts values(owner_id,op_id,result);return result;
end $$;

create function public.pull_changes(after_cursor bigint,limit_groups integer default 100)returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();rows jsonb;last_cursor bigint;
begin
 if owner_id is null then raise exception using errcode='28000',message='请先登录';end if;
 if after_cursor is null or after_cursor<0 or limit_groups not between 1 and 100 then raise exception using errcode='22023',message='分页参数无效';end if;
 select coalesce(jsonb_agg(batch order by cursor),'[]'::jsonb),coalesce(max(cursor),after_cursor)into rows,last_cursor from(select cursor,batch from public.commits where user_id=owner_id and cursor>after_cursor order by cursor limit limit_groups)s;
 return jsonb_build_object('batches',rows,'cursor',last_cursor::text,'hasMore',exists(select 1 from public.commits where user_id=owner_id and cursor>last_cursor));
end $$;
revoke all on function public.validate_record(text,jsonb,uuid),public.put_record(text,uuid,uuid,jsonb),public.apply_operation(jsonb),public.pull_changes(bigint,integer)from public,anon,authenticated;
grant execute on function public.apply_operation(jsonb),public.pull_changes(bigint,integer)to authenticated;
