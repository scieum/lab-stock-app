-- 시약 전체 삭제 · 기록 삭제 (d7 §29 — design/rules.json 1.29 wipe, 화면 2 · 10)
--
-- SQL Editor 에 한 번에 붙여 넣어 실행하는 파일. 다시 돌려도 같은 결과(모두 create or replace · revoke · grant).
-- 이 파일을 실행해도 어떤 행도 바뀌거나 지워지지 않는다 — 테이블·제약·트리거·정책·데이터 문장 없음, 함수 정의와 실행 권한만.
-- 행을 바꾸는 문장은 함수 본문 안에만 있다(호출할 때만 실행): 보관 update(archive_reagent_rows) · 기록 delete(wipe_records).
--
-- 1) private.archive_reagent_rows(p_school, p_uid, p_ids) — 보관 처리 본문 하나로 모음 (d7 §24 규칙 그대로:
--      deleted_at = now() · deleted_by = 부른 사람 · slot_id = null(칸 배치 비움), 보관 안 된 그 학교 시약만).
--      p_ids = null 이면 그 학교의 보관 안 된 시약 전부. 권한 검사는 부르는 쪽이 한다 → authenticated 실행 불가(revoke).
--      archive_reagent · archive_reagents 도 이 본문을 부르게 바꾼다(시그니처 · 검사 · 오류 · 반환 그대로).
-- 2) private.wipe_admin_school(p_school_name) — 전체 삭제 · 기록 삭제 공통 검사 → 학교 id
--      42501 not authenticated / no profile / demo school is read-only / admin only
--      22023 school name mismatch — 앞뒤 공백(btrim) 정리 후 우리 학교 이름과 정확히 같아야 한다 (null · 빈 칸 = 틀림)
-- 3) wipe_reagents(p_school_name text) → integer (보관한 수, 0 도 가능)
--      admin · 자기 학교 · 데모 거부 · 학교명 일치 → 보관 안 된 우리 학교 시약 전부 보관. 한 트랜잭션.
--      사용 · 입고 기록은 남는다(보관은 행을 지우지 않는다).
-- 4) count_wipe_records(p_before date) → jsonb { usage_count, intake_count }   (화면 10 wipe-preview)
--      admin · 자기 학교(42501). p_before = null → 전체, 아니면 usage_logs.used_on < p_before · intake_logs.intake_date < p_before
--      (그날 미포함). p_before 가 한국 오늘보다 뒤 = 22023 'before date in the future' (오늘은 된다).
-- 5) wipe_records(p_before date, p_school_name text) → jsonb { usage_count, intake_count }
--      admin · 자기 학교 · 데모 거부 · 학교명 일치 · 미래 거부(22023) → 같은 범위의 usage_logs · intake_logs 를 실제로 delete.
--      수업 정보(class_grade · class_no · class_subject)는 usage_logs 의 열이라 행과 함께 지워진다 — 따로 딸린 테이블 없음.
--      시약 재고(stock) · intake_date · 재주문 기준(min_stock · min_stock_source · min_stock_auto_basis · reorder_per_group ·
--      reorder_groups) · low_stock_since 는 바꾸지 않는다:
--        - 재고는 reagents.stock 에 저장된 값이고 기록에서 다시 계산하지 않는다.
--        - 이전 마이그레이션까지 usage_logs · intake_logs 의 트리거는 insert(재주문 자동 기준 재계산 · 사용일/입고일 미래 검사)
--          와 update of used_on 뿐이고 delete 에 반응하는 트리거는 없다 → 우회할 것이 없다.
--          alter table ... disable trigger 는 테이블 잠금 · 다른 세션까지 영향(동시성 문제)이 있어 쓰지 않는다.
--        - 그래도 앞으로 delete 트리거가 생기거나 실제 DB 에 이 파일들 밖의 트리거가 있을 때를 막기 위해,
--          delete 전후로 우리 학교 시약의 위 칸들 지문(md5)을 비교하고 다르면 예외 → 한 트랜잭션 전체 취소.
--      한 트랜잭션.
--
-- 모양은 다른 쓰기 함수와 같다: public = security invoker 래퍼(anon 실행 불가) → private = security definer 본문(search_path '').

-- ───────── 1) 보관 처리 본문 (공유) ─────────
create or replace function private.archive_reagent_rows(p_school uuid, p_uid uuid, p_ids uuid[])
returns table (id uuid, name text)
language plpgsql
set search_path = ''
as $$
begin
  -- d7 §24 보관 규칙: deleted_at · deleted_by, 칸 배치 비움. 이미 보관된 시약은 건드리지 않는다.
  return query
    update public.reagents r
       set deleted_at = now(),
           deleted_by = p_uid,
           slot_id = null
     where r.school_id = p_school
       and r.deleted_at is null
       and (p_ids is null or r.id = any (p_ids))
    returning r.id, r.name;
end;
$$;

-- 학교 id 를 인자로 받으므로 사용자가 직접 부를 수 없다 (definer 함수 안에서만 — 소유자 권한으로 실행된다)
revoke all on function private.archive_reagent_rows(uuid, uuid, uuid[]) from public, anon, authenticated;

-- archive_reagent: 본문만 공유 함수로 (검사 · 오류 · 반환 그대로)
create or replace function private.archive_reagent(p_reagent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
  v_id uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select p.school_id, p.role into v_school, v_role from public.profiles p where p.user_id = v_uid;
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

  -- 없는 id · 다른 학교 · 이미 보관 = not found (존재 여부 비노출). null id 는 아무 행도 고르지 않는다.
  if p_reagent_id is not null then
    select a.id, a.name into v_id, v_name
      from private.archive_reagent_rows(v_school, v_uid, array[p_reagent_id]) a;
  end if;
  if v_id is null then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('reagent_id', v_id, 'name', v_name);
end;
$$;

revoke all on function private.archive_reagent(uuid) from public, anon;
grant execute on function private.archive_reagent(uuid) to authenticated;

-- archive_reagents: 본문만 공유 함수로 (검사 · 오류 · 반환 그대로)
create or replace function private.archive_reagents(p_reagent_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_ids uuid[];
  v_count integer;
begin
  v_school := private.staff_school_for_write();

  if p_reagent_ids is null or array_position(p_reagent_ids, null) is not null then
    raise exception 'invalid ids' using errcode = '22023';
  end if;
  v_ids := array(select distinct x from unnest(p_reagent_ids) as t(x));
  if cardinality(v_ids) < 1 or cardinality(v_ids) > 100 then
    raise exception 'ids must be 1 to 100' using errcode = '22023';
  end if;

  select count(*)::integer into v_count from private.archive_reagent_rows(v_school, v_uid, v_ids);

  if v_count <> cardinality(v_ids) then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

revoke all on function private.archive_reagents(uuid[]) from public, anon;
grant execute on function private.archive_reagents(uuid[]) to authenticated;

-- ───────── 2) 공통 검사: admin · 자기 학교 (· 데모 거부 · 학교명) ─────────
-- p_check_name = false 면 학교명은 보지 않는다 (count_wipe_records — 읽기만)
create or replace function private.wipe_admin_school(p_school_name text, p_check_name boolean default true)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select p.school_id, p.role into v_school, v_role from public.profiles p where p.user_id = v_uid;
  if v_school is null then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if v_school = private.demo_school_id()
     or exists (select 1 from public.schools s where s.id = v_school and s.is_demo) then
    raise exception 'demo school is read-only' using errcode = '42501';
  end if;
  if v_role is distinct from 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_check_name then
    select s.name into v_name from public.schools s where s.id = v_school;
    -- 앞뒤 공백만 정리하고 정확히 같아야 한다 (가운데 공백 · 대소문자 · 전각 그대로). 빈 칸 · null = 틀림
    if p_school_name is null or v_name is null
       or btrim(p_school_name) = '' or btrim(p_school_name) <> btrim(v_name) then
      raise exception 'school name mismatch' using errcode = '22023';
    end if;
  end if;

  return v_school;
end;
$$;

revoke all on function private.wipe_admin_school(text, boolean) from public, anon;
grant execute on function private.wipe_admin_school(text, boolean) to authenticated;

-- ───────── 3) wipe_reagents ─────────
create or replace function private.wipe_reagents(p_school_name text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_count integer;
begin
  v_school := private.wipe_admin_school(p_school_name, true);

  -- archive_reagent · archive_reagents 와 같은 보관 본문, 대상 = 보관 안 된 우리 학교 시약 전부
  select count(*)::integer into v_count from private.archive_reagent_rows(v_school, auth.uid(), null);

  return v_count;
end;
$$;

revoke all on function private.wipe_reagents(text) from public, anon;
grant execute on function private.wipe_reagents(text) to authenticated;

create or replace function public.wipe_reagents(p_school_name text)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.wipe_reagents(p_school_name)
$$;

revoke all on function public.wipe_reagents(text) from public, anon;
grant execute on function public.wipe_reagents(text) to authenticated;

-- ───────── 4) count_wipe_records ─────────
create or replace function private.count_wipe_records(p_before date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_usage bigint;
  v_intake bigint;
begin
  v_school := private.wipe_admin_school(null, false);

  if p_before is not null and p_before > (now() at time zone 'Asia/Seoul')::date then
    raise exception 'before date in the future' using errcode = '22023';
  end if;

  select count(*) into v_usage
    from public.usage_logs u
   where u.school_id = v_school and (p_before is null or u.used_on < p_before);
  select count(*) into v_intake
    from public.intake_logs i
   where i.school_id = v_school and (p_before is null or i.intake_date < p_before);

  return jsonb_build_object('usage_count', v_usage, 'intake_count', v_intake);
end;
$$;

revoke all on function private.count_wipe_records(date) from public, anon;
grant execute on function private.count_wipe_records(date) to authenticated;

create or replace function public.count_wipe_records(p_before date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.count_wipe_records(p_before)
$$;

revoke all on function public.count_wipe_records(date) from public, anon;
grant execute on function public.count_wipe_records(date) to authenticated;

-- ───────── 5) wipe_records ─────────
-- 우리 학교 시약(보관 포함)의 재고 · 입고일 · 재주문 기준 · low_stock_since 지문
create or replace function private.reagent_stock_fingerprint(p_school uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(coalesce(string_agg(
           concat_ws('|', r.id, r.stock, r.intake_date, r.min_stock, r.min_stock_source, r.min_stock_auto_basis,
                     r.reorder_per_group, r.reorder_groups, r.low_stock_since),
           ',' order by r.id), ''))
    from public.reagents r
   where r.school_id = p_school
$$;

revoke all on function private.reagent_stock_fingerprint(uuid) from public, anon, authenticated;

create or replace function private.wipe_records(p_before date, p_school_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_before_fp text;
  v_usage integer;
  v_intake integer;
begin
  v_school := private.wipe_admin_school(p_school_name, true);

  if p_before is not null and p_before > (now() at time zone 'Asia/Seoul')::date then
    raise exception 'before date in the future' using errcode = '22023';
  end if;

  v_before_fp := private.reagent_stock_fingerprint(v_school);

  -- 사용 기록 (수업 정보 class_* 는 같은 행의 열 — 함께 지워진다)
  delete from public.usage_logs u
   where u.school_id = v_school and (p_before is null or u.used_on < p_before);
  get diagnostics v_usage = row_count;

  -- 입고 기록
  delete from public.intake_logs i
   where i.school_id = v_school and (p_before is null or i.intake_date < p_before);
  get diagnostics v_intake = row_count;

  -- 재고 · 입고일 · 재주문 기준 · low_stock_since 는 그대로여야 한다 (delete 에 반응하는 트리거가 없음을 확인하는 안전장치).
  -- 달라졌다면 이 트랜잭션 전체(위 delete 포함)를 취소한다.
  if private.reagent_stock_fingerprint(v_school) is distinct from v_before_fp then
    raise exception 'records wipe must not change reagent stock' using errcode = 'P0001';
  end if;

  return jsonb_build_object('usage_count', v_usage, 'intake_count', v_intake);
end;
$$;

revoke all on function private.wipe_records(date, text) from public, anon;
grant execute on function private.wipe_records(date, text) to authenticated;

create or replace function public.wipe_records(p_before date, p_school_name text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.wipe_records(p_before, p_school_name)
$$;

revoke all on function public.wipe_records(date, text) from public, anon;
grant execute on function public.wipe_records(date, text) to authenticated;
