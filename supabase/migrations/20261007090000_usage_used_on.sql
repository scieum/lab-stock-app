-- 사용일 (d7 §15, 디자인 1.17 usage_date) — 화면 4 사용일 입력 · 화면 10 사용일 묶음 · 재주문 기준 자동(§11-1) 28일 창
--
-- 1) usage_logs.used_on date: 실제로 쓴 날(한국 날짜). 기존 행은 used_at 의 한국 날짜로 채운 뒤 not null + 기본값(한국 오늘).
--    used_at 은 "기록한 시각" 그대로. 오늘(한국) 이후 사용일은 넣을 수 없다 (직접 insert 도 트리거로 거부).
-- 2) record_usage 가 사용일(선택, 끝 인자, 기본 = 한국 오늘)을 받는다. 기존 인자·동작(재고 차감·memo)은 그대로.
--    인자가 늘면 새 시그니처가 되므로 옛 시그니처 (uuid, numeric, text) 는 drop 하고 다시 만든다
--    (둘 다 남기면 기존 3인자 호출이 PostgREST 에서 후보 2개로 모호해진다 — 20261003200000 과 같은 방식).
-- 3) usage_history 가 used_on 을 함께 돌려주고, 기간 필터·정렬을 사용일 기준으로 (반환 열이 바뀌어 drop 후 다시 만든다).
-- 4) private.reorder_auto_value 의 최근 28일 = used_on ≥ 한국 오늘 − 27일.
-- 이 파일의 구문: alter table, update(used_on 이 빈 행만 — backfill), create index, create/replace function, trigger,
--   drop function(옛 시그니처 3개 — 바로 다시 만든다), revoke/grant. 행 delete·테이블 drop 없음.
-- 한 번에 통째로 실행한다(apply_migration = 한 트랜잭션). 다시 실행해도 같은 결과가 된다.

-- ---------- 1. used_on 열 ----------
alter table public.usage_logs add column if not exists used_on date;

update public.usage_logs u
   set used_on = (u.used_at at time zone 'Asia/Seoul')::date
 where u.used_on is null;

alter table public.usage_logs
  alter column used_on set default ((now() at time zone 'Asia/Seoul')::date),
  alter column used_on set not null;

comment on column public.usage_logs.used_on is '실제로 쓴 날 (한국 날짜, d7 §15). used_at 은 기록한 시각';

create index if not exists usage_logs_school_used_on_idx
  on public.usage_logs (school_id, used_on desc, used_at desc);

-- 직접 insert(usage_logs_insert_self)로도 오늘(한국) 이후 사용일은 못 넣는다
create or replace function private.guard_usage_used_on()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.used_on > (now() at time zone 'Asia/Seoul')::date then
    raise exception 'used_on must not be after today' using errcode = '22008';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_usage_used_on() from public, anon, authenticated;

create or replace trigger usage_logs_guard_used_on
  before insert or update of used_on on public.usage_logs
  for each row execute function private.guard_usage_used_on();

-- ---------- 2. record_usage (사용일 추가) ----------
drop function if exists public.record_usage(uuid, numeric, text);
drop function if exists private.record_usage(uuid, numeric, text);

create or replace function private.record_usage(
  p_reagent_id uuid,
  p_amount numeric,
  p_memo text default null,
  p_used_on date default null
)
returns public.usage_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_stock numeric;
  v_memo text := nullif(regexp_replace(coalesce(p_memo, ''), '^\s+|\s+$', '', 'g'), '');
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_used_on date := coalesce(p_used_on, (now() at time zone 'Asia/Seoul')::date);
  v_log public.usage_logs;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select p.school_id into v_school from public.profiles p where p.user_id = v_uid;
  if v_school is null then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if v_school = private.demo_school_id()
     or exists (select 1 from public.schools s where s.id = v_school and s.is_demo) then
    raise exception 'demo school is read-only' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if v_memo is not null and char_length(v_memo) > 200 then
    raise exception 'memo too long' using errcode = '22023';
  end if;
  -- 사용일: 과거 하한 없음, 오늘(한국) 이후 거부
  if v_used_on > v_today then
    raise exception 'used_on must not be after today' using errcode = '22008';
  end if;

  -- 데모 학교 시약은 자기 학교 조건에 걸려 not found (존재 여부 비노출)
  select r.stock into v_stock
    from public.reagents r
   where r.id = p_reagent_id and r.school_id = v_school
   for update;
  if not found then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;
  if v_stock < p_amount then
    raise exception 'insufficient stock' using errcode = '22003';
  end if;

  update public.reagents r
     set stock = r.stock - p_amount
   where r.id = p_reagent_id and r.school_id = v_school;

  insert into public.usage_logs (school_id, reagent_id, user_id, amount, memo, used_on)
  values (v_school, p_reagent_id, v_uid, p_amount, v_memo, v_used_on)
  returning * into v_log;

  return v_log;
end;
$$;

revoke all on function private.record_usage(uuid, numeric, text, date) from public, anon;
grant execute on function private.record_usage(uuid, numeric, text, date) to authenticated;

create or replace function public.record_usage(
  reagent_id uuid,
  amount numeric,
  memo text default null,
  used_on date default null
)
returns public.usage_logs
language sql
security invoker
set search_path = ''
as $$
  select * from private.record_usage(reagent_id, amount, memo, used_on)
$$;

revoke all on function public.record_usage(uuid, numeric, text, date) from public, anon;
grant execute on function public.record_usage(uuid, numeric, text, date) to authenticated;

-- ---------- 3. usage_history (사용일 기준) ----------
drop function if exists public.usage_history(boolean, timestamptz, text, integer);

create or replace function public.usage_history(
  p_only_mine boolean default false,
  p_since timestamptz default null,
  p_query text default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  used_at timestamptz,
  used_on date,
  amount numeric,
  memo text,
  reagent_id uuid,
  reagent_name text,
  unit text,
  msds_url text,
  user_name text,
  is_mine boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.id, u.used_at, u.used_on, u.amount, u.memo, u.reagent_id, r.name, r.unit, r.msds_url,
         private.same_school_display_name(u.user_id),
         coalesce(u.user_id = (select auth.uid()), false)
    from public.usage_logs u
    join public.reagents r on r.id = u.reagent_id and r.school_id = u.school_id
   where (not coalesce(p_only_mine, false) or u.user_id = (select auth.uid()))
     -- 기간: 시작 시각의 한국 날짜 이후 사용일
     and (p_since is null or u.used_on >= (p_since at time zone 'Asia/Seoul')::date)
     and (
       nullif(btrim(coalesce(p_query, '')), '') is null
       or r.name ilike
            '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
            escape '\'
     )
   -- 사용일 최신순, 같은 날은 기록 시각 최신순
   order by u.used_on desc, u.used_at desc, u.id desc
   limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

revoke all on function public.usage_history(boolean, timestamptz, text, integer) from public, anon;
grant execute on function public.usage_history(boolean, timestamptz, text, integer) to authenticated;

-- ---------- 4. 재주문 기준 자동 28일 = 사용일 기준 ----------
create or replace function private.reorder_auto_value(p_reagent_id uuid, out value numeric, out basis text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_used numeric;
  v_last numeric;
begin
  -- 오늘(한국) 포함 28일: used_on ≥ 오늘 − 27일
  select coalesce(sum(u.amount), 0) into v_used
    from public.usage_logs u
   where u.reagent_id = p_reagent_id
     and u.used_on >= (now() at time zone 'Asia/Seoul')::date - 27;

  if v_used > 0 then
    value := trim_scale(round(v_used / 2, 3));
    basis := 'usage';
    return;
  end if;

  select i.amount into v_last
    from public.intake_logs i
   where i.reagent_id = p_reagent_id
   order by i.created_at desc, i.intake_date desc, i.id desc
   limit 1;

  if v_last is not null and v_last > 0 then
    value := trim_scale(round(v_last * 0.2, 3));
    basis := 'intake';
  else
    value := 0;
    basis := null;
  end if;
end;
$$;
revoke all on function private.reorder_auto_value(uuid) from public, anon, authenticated;

-- PostgREST 스키마 캐시 갱신 (새 열·새 인자)
notify pgrst, 'reload schema';
