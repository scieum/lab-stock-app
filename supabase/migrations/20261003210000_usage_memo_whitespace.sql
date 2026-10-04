-- record_usage 메모 정리: 스페이스뿐 아니라 모든 공백 문자(탭·줄바꿈 등 \s) 기준으로 앞뒤를 자른다.
-- harness/d7-data.md §7 — 빈 문자열·공백 문자만 → null, 200자 초과 → 22023.
-- 직전(20261003200000_usage_history.sql)은 btrim(스페이스만)이라 " \t\n " 가 "\t\n" 으로 저장됐다.
-- 시그니처·반환형·security definer·search_path 는 그대로, 본문은 v_memo 계산 한 줄만 다르다.
-- create or replace 만 쓴다 (drop·테이블 변경 없음). 시그니처가 같아 PostgREST 캐시 갱신도 필요 없다.

create or replace function private.record_usage(p_reagent_id uuid, p_amount numeric, p_memo text default null)
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
