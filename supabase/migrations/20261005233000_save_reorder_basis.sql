-- 실험 매뉴얼 (화면 5) 재주문 기준 저장 — harness/d7-data.md §13 (2026-10-05 결정)
--
-- 함수 1개 (public = SECURITY INVOKER 래퍼, private = SECURITY DEFINER 본체, search_path 고정):
--   save_reorder_basis(p_items jsonb) → jsonb
--     p_items = [{"reagent_id": uuid 문자열, "per_group": 숫자(> 0, ≤ 1,000,000), "groups": 정수(1~20)}, …]  1~50개
--     반환    = [{"reagent_id", "required", "previous_min_stock", "outcome": "changed" | "kept"}, …]  (입력 순서)
--   필요량(required) = per_group × groups.
--   필요량 > 현재 min_stock 일 때만 min_stock = 필요량, reorder_per_group = per_group, reorder_groups = groups 로 바꾼다
--   (더 큰 값 유지). 같거나 작으면 그 시약은 그대로 두고 outcome = 'kept'.
--   low_stock_since 는 건드리지 않는다 — reagents_low_stock_since 트리거(20261005190000)가 맞춘다.
--   학교는 호출자 profiles 에서만 정한다. teacher·admin 만. 학생·anon·데모 학교 거부.
--   모든 reagent_id 가 호출자 학교의 시약이어야 한다 — 하나라도 아니면 전체 거부(아무것도 바꾸지 않음).
--   한 트랜잭션. 대상 시약 행은 id 순서로 잠근 뒤(FOR UPDATE) 견주고 바꾼다.
--
-- 오류 형태 (errcode · message · detail):
--   42501  not authenticated / no profile / demo school is read-only / staff only
--          (anon 은 함수 실행 권한이 없어 PostgREST 가 42501 permission denied 로 답한다)
--   22023  invalid items(배열이 아님·0개·50개 초과, detail = 개수) / invalid item(원소 모양·reagent_id 형식, detail = 순번들)
--          / invalid per_group(detail = 순번들) / invalid groups(detail = 순번들) / duplicate reagent(detail = id들)
--   P0002  reagent not found (다른 학교 시약·없는 id 포함 — 존재 여부 비노출, detail 없음)
--
-- 이 파일의 구문: create or replace function 2개, 함수 실행 권한 회수(revoke)·부여(grant).
-- 테이블·행을 바꾸는 구문은 없다 (본문의 update 는 함수가 호출될 때만 실행된다). drop·delete·truncate 없음.
-- revoke 가 필요한 이유: PostgreSQL 은 새 함수의 실행 권한을 PUBLIC 에 기본으로 주고, 이 프로젝트의 public 스키마는
--   기본 권한으로 anon 에게도 execute 를 준다. 테이블과 달리 "기본 권한이 없는 스키마에서 만들어 옮기기"로는
--   PUBLIC 실행 권한이 빠지지 않는다 — 회수 구문 없이는 anon 실행 불가 상태를 만들 수 없다.
-- 한 번에 통째로 실행한다. 다시 실행해도 같은 결과가 된다.

-- ---------- 본체 ----------
create or replace function private.save_reorder_basis(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
  v_items jsonb := p_items;
  v_count integer;
  v_bad text;
  v_found integer;
  v_result jsonb;
begin
  -- 호출자: 로그인 · 프로필 · 데모 학교 아님 · teacher/admin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select p.school_id, p.role into v_school, v_role
    from public.profiles p where p.user_id = v_uid;
  if v_school is null then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if v_school = private.demo_school_id()
     or exists (select 1 from public.schools s where s.id = v_school and s.is_demo) then
    raise exception 'demo school is read-only' using errcode = '42501';
  end if;
  if v_role is null or v_role not in ('teacher', 'admin') then
    raise exception 'staff only' using errcode = '42501';
  end if;

  -- 모양: 배열, 1~50개
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    raise exception 'invalid items' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(v_items);
  if v_count < 1 or v_count > 50 then
    raise exception 'invalid items' using errcode = '22023', detail = v_count::text;
  end if;

  -- 원소: {reagent_id: uuid 문자열, per_group: 숫자, groups: 숫자}
  select string_agg(e.o::text, ',' order by e.o)
    into v_bad
    from jsonb_array_elements(v_items) with ordinality as e(x, o)
   where jsonb_typeof(e.x) <> 'object'
      or jsonb_typeof(e.x -> 'reagent_id') is distinct from 'string'
      or (e.x ->> 'reagent_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(e.x -> 'per_group') is distinct from 'number'
      or jsonb_typeof(e.x -> 'groups') is distinct from 'number';
  if v_bad is not null then
    raise exception 'invalid item' using errcode = '22023', detail = v_bad;
  end if;

  -- 1조 사용량: 0 초과 1,000,000 이하
  select string_agg(e.o::text, ',' order by e.o)
    into v_bad
    from jsonb_array_elements(v_items) with ordinality as e(x, o)
   where not ((e.x ->> 'per_group')::numeric > 0 and (e.x ->> 'per_group')::numeric <= 1000000);
  if v_bad is not null then
    raise exception 'invalid per_group' using errcode = '22023', detail = v_bad;
  end if;

  -- 조 수: 1~20 정수
  select string_agg(e.o::text, ',' order by e.o)
    into v_bad
    from jsonb_array_elements(v_items) with ordinality as e(x, o)
   where not ((e.x ->> 'groups')::numeric = trunc((e.x ->> 'groups')::numeric)
              and (e.x ->> 'groups')::numeric between 1 and 20);
  if v_bad is not null then
    raise exception 'invalid groups' using errcode = '22023', detail = v_bad;
  end if;

  -- 같은 시약이 두 번
  select string_agg(d.id::text, ',' order by d.id::text)
    into v_bad
    from (
      select (e.x ->> 'reagent_id')::uuid as id
        from jsonb_array_elements(v_items) as e(x)
       group by 1
      having count(*) > 1
    ) d;
  if v_bad is not null then
    raise exception 'duplicate reagent' using errcode = '22023', detail = v_bad;
  end if;

  -- 대상 시약을 id 순서로 잠근다. 자기 학교 시약만 잡힌다 — 개수가 모자라면 전체 거부(존재 여부 비노출)
  select count(*)::integer into v_found
    from (
      select r.id
        from public.reagents r
       where r.school_id = v_school
         and r.id in (select (e.x ->> 'reagent_id')::uuid from jsonb_array_elements(v_items) as e(x))
       order by r.id
         for update
    ) locked;
  if v_found <> v_count then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;

  -- 필요량이 지금 기준보다 클 때만 바꾼다. prev 는 바꾸기 전 값(같은 문장의 스냅샷)
  with items as (
    select (e.x ->> 'reagent_id')::uuid as reagent_id,
           (e.x ->> 'per_group')::numeric as per_group,
           ((e.x ->> 'groups')::numeric)::integer as groups,
           e.o
      from jsonb_array_elements(v_items) with ordinality as e(x, o)
  ),
  prev as (
    select r.id, r.min_stock
      from public.reagents r
      join items i on i.reagent_id = r.id
     where r.school_id = v_school
  ),
  changed as (
    update public.reagents r
       set min_stock = i.per_group * i.groups,
           reorder_per_group = i.per_group,
           reorder_groups = i.groups
      from items i
     where r.id = i.reagent_id
       and r.school_id = v_school
       and i.per_group * i.groups > r.min_stock
    returning r.id
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'reagent_id', i.reagent_id,
               'required', i.per_group * i.groups,
               'previous_min_stock', p.min_stock,
               'outcome', case when c.id is null then 'kept' else 'changed' end)
             order by i.o),
           '[]'::jsonb)
    into v_result
    from items i
    join prev p on p.id = i.reagent_id
    left join changed c on c.id = i.reagent_id;

  return v_result;
end;
$$;

revoke all on function private.save_reorder_basis(jsonb) from public;
grant execute on function private.save_reorder_basis(jsonb) to authenticated;

-- ---------- 래퍼 (API 에 보이는 함수) ----------
create or replace function public.save_reorder_basis(p_items jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.save_reorder_basis(p_items)
$$;

revoke all on function public.save_reorder_basis(jsonb) from public, anon;
grant execute on function public.save_reorder_basis(jsonb) to authenticated;
