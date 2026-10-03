-- 사용 기록 내역 (화면 10) + 화면 4 메모 — harness/d7-data.md §7 (2026-10-03 결정)
--
-- 1) usage_logs.memo (null 허용, 1~200자, 공백만은 불가).
-- 2) record_usage 가 memo(선택)를 받는다. 옛 시그니처 (uuid, numeric) 는 drop 하고
--    (uuid, numeric, text default null) 하나만 둔다 — 두 개가 같이 있으면 PostgREST 가
--    { reagent_id, amount } 호출을 고르지 못한다(PGRST203). 인자 이름 reagent_id·amount 는 그대로라
--    메모 없이 부르는 기존 호출은 그대로 동작한다. 빈 문자열·공백만 → null, 200자 초과 → 22023.
--    학교·데모 가드·재고 검사·차감은 그대로.
-- 3) usage_history: 화면 10 목록. recent_usage 와 같이 SECURITY INVOKER (usage_logs·reagents RLS = 자기 학교 행만),
--    사용자 이름은 private.same_school_display_name. anon 실행 권한 없음 (둘러보기 "기록" 탭은 잠금, d7 §5·§7).
-- 이 파일은 한 트랜잭션으로 적용한다 (drop 과 create 사이에 함수가 없는 순간이 밖에서 보이지 않게).

-- ---------- 1. usage_logs.memo ----------
alter table public.usage_logs
  add column if not exists memo text;

alter table public.usage_logs
  add constraint usage_logs_memo_length
  check (memo is null or (char_length(btrim(memo)) >= 1 and char_length(memo) <= 200));

-- 화면 10: 자기 학교 기록을 최신순으로
create index if not exists usage_logs_school_used_at_idx
  on public.usage_logs (school_id, used_at desc);

-- ---------- 2. record_usage (memo 추가) ----------
drop function public.record_usage(uuid, numeric);
drop function private.record_usage(uuid, numeric);

create function private.record_usage(p_reagent_id uuid, p_amount numeric, p_memo text default null)
returns public.usage_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_stock numeric;
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
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

  insert into public.usage_logs (school_id, reagent_id, user_id, amount, memo)
  values (v_school, p_reagent_id, v_uid, p_amount, v_memo)
  returning * into v_log;

  return v_log;
end;
$$;

revoke all on function private.record_usage(uuid, numeric, text) from public;
grant execute on function private.record_usage(uuid, numeric, text) to authenticated;

create function public.record_usage(reagent_id uuid, amount numeric, memo text default null)
returns public.usage_logs
language sql
security invoker
set search_path = ''
as $$
  select * from private.record_usage(reagent_id, amount, memo)
$$;

revoke all on function public.record_usage(uuid, numeric, text) from public, anon;
grant execute on function public.record_usage(uuid, numeric, text) to authenticated;

-- ---------- 3. usage_history (화면 10 목록) ----------
create or replace function public.usage_history(
  p_only_mine boolean default false,
  p_since timestamptz default null,
  p_query text default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  used_at timestamptz,
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
  select u.id, u.used_at, u.amount, u.memo, u.reagent_id, r.name, r.unit, r.msds_url,
         private.same_school_display_name(u.user_id),
         coalesce(u.user_id = (select auth.uid()), false)
    from public.usage_logs u
    join public.reagents r on r.id = u.reagent_id and r.school_id = u.school_id
   where (not coalesce(p_only_mine, false) or u.user_id = (select auth.uid()))
     and (p_since is null or u.used_at >= p_since)
     and (
       nullif(btrim(coalesce(p_query, '')), '') is null
       or r.name ilike
            '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
            escape '\'
     )
   order by u.used_at desc, u.id desc
   limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

revoke all on function public.usage_history(boolean, timestamptz, text, integer) from public, anon;
grant execute on function public.usage_history(boolean, timestamptz, text, integer) to authenticated;

-- PostgREST 스키마 캐시 갱신 (새 인자·새 함수)
notify pgrst, 'reload schema';
