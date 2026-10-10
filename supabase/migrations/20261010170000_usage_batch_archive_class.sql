-- 여러 시약 사용 기록 · 시약 삭제(보관) · 수업 기록 (d7 §24, 화면 3·4·10 — design/rules.json 1.25 usage_batch·reagent_delete·class_info)
--
-- 한 트랜잭션 · 다시 돌려도 같은 결과(add column if not exists · 제약은 없을 때만 · create or replace · alter policy).
-- 없애는 문장 없음. 기존 행은 지우지 않는다(보관 = deleted_at 만).
--
-- 1) usage_logs.class_grade int null · class_no int null · class_subject text null (모두 선택)
--      검사: 학년 1~6(학교급별 범위는 함수가 더 좁힌다), 반 1~20, 수업명 1~20자(앞뒤 공백 없음 — 함수가 공백 정리)
-- 2) reagents.deleted_at timestamptz null · deleted_by uuid null (보관 = 화면의 "시약 삭제", 되돌리기 없음)
-- 3) 보관 시약 제외 = reagents RLS select 정책에 deleted_at is null 을 더한다 (authenticated · anon 데모 둘 다).
--      앱의 모든 시약 읽기(목록·상세·시약장 칸·칸 없음·홈·재주문·사용/입고 고르기·MSDS 일괄·위치 추천·QR/둘러보기)가
--      세션 클라이언트 + RLS 라 한 곳에서 빠진다. invoker 함수(recent_usage · reagent_usage · demo_*)도 RLS 를 따른다.
--      definer 함수(RLS 우회)는 아래 트리거가 막는다: 보관된 시약 행의 update = P0002 'reagent not found'
--      (record_usage · record_intake · record_document_intake · place_reagent · set_* · reset_* · save_reorder_basis 모두 그 시약을 update 한다).
--      deleted_at · deleted_by 를 함수 밖(authenticated · anon)에서 바꾸는 것도 거부(42501).
-- 4) 이름 중복 검사(register_reagent · record_document_intake)에서 보관 시약 제외 — 이름 unique 인덱스는 없어서 인덱스 변경 없음.
-- 5) record_usage: 보관 시약 = P0002 (재고 검사보다 먼저)
-- 6) record_usage_batch(p_items jsonb, p_used_on date, p_memo text, p_class_grade int, p_class_no int, p_class_subject text) → jsonb
--      { count, items: [{ reagent_id, stock }] }  — 한 트랜잭션, 하나라도 틀리면 전부 취소.
--      오류 (detail = 문제 항목 번호, 1부터, 쉼표로):
--        42501 not authenticated / no profile / demo school is read-only
--        22023 invalid items (배열 아님 · 1~30 밖)
--        22023 invalid item (detail) — 객체 아님 · reagent_id 가 uuid 문자열 아님 · amount 가 JSON 숫자 아님
--        22023 amount must be positive (detail)
--        22023 duplicate reagent (detail = 두 번째부터의 번호)
--        22023 memo too long · invalid class_grade · invalid class_no · invalid class_subject
--        22008 used_on must not be after today
--        P0002 reagent not found (detail) — 없는 id · 다른 학교 · 데모 학교 · 보관된 시약 (구분하지 않는다)
--        22003 insufficient stock (detail)
--      학년 범위 = private.school_max_grade(학교): 학교 이름에 "초등학교" → 1~6, "중학교"·"고등학교" → 1~3, 그 밖(모름) → 1~6
--      (schools 에 학교급 열이 없다 — NEIS 공식 학교명으로 판단)
--      자동 재주문 기준(§11-1)은 usage_logs insert 트리거가 항목마다 그대로 다시 계산한다.
-- 7) archive_reagent(p_reagent_id uuid) → jsonb { reagent_id, name }
--      교사·admin, 자기 학교, 데모 거부(42501). 없는 · 다른 학교 · 이미 보관 = P0002. slot_id = null(칸 배치 비움).
-- 8) usage_records(p_only_mine, p_since, p_query, p_limit, p_class_grade, p_class_no) — 화면 10 새 조회 함수.
--      usage_history 와 같은 결과 + reagent_deleted · class_grade · class_no · class_subject.
--      보관된 시약의 기록도 이름과 함께 돌려준다(RLS 가 보관 시약을 숨기므로 private definer 가 자기 학교 조건을 직접 건다).
--      보관된 시약의 msds_url 은 null (화면 10 에서 링크 없음). 기존 usage_history 는 남긴다(반환 열을 바꾸려면 함수를 없애고 다시 만들어야 해서).
--
-- 모양은 다른 쓰기 함수와 같다: public = security invoker 래퍼(anon 실행 불가) → private = security definer 본문.

-- ───────── 1) 수업 열 ─────────
alter table public.usage_logs add column if not exists class_grade integer;
alter table public.usage_logs add column if not exists class_no integer;
alter table public.usage_logs add column if not exists class_subject text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usage_logs_class_grade_check' and conrelid = 'public.usage_logs'::regclass) then
    alter table public.usage_logs
      add constraint usage_logs_class_grade_check check (class_grade is null or class_grade between 1 and 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usage_logs_class_no_check' and conrelid = 'public.usage_logs'::regclass) then
    alter table public.usage_logs
      add constraint usage_logs_class_no_check check (class_no is null or class_no between 1 and 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usage_logs_class_subject_check' and conrelid = 'public.usage_logs'::regclass) then
    alter table public.usage_logs
      add constraint usage_logs_class_subject_check
      check (class_subject is null or (char_length(class_subject) between 1 and 20 and class_subject = btrim(class_subject)));
  end if;
end;
$$;

-- ───────── 2) 보관 열 ─────────
alter table public.reagents add column if not exists deleted_at timestamptz;
alter table public.reagents add column if not exists deleted_by uuid;

-- ───────── 3) 보관 시약 제외 (RLS select) ─────────
alter policy reagents_select on public.reagents
  using (school_id = (select private.current_school_id()) and deleted_at is null);

alter policy reagents_select_demo_anon on public.reagents
  using (school_id = (select private.demo_school_id()) and deleted_at is null);

-- 보관된 시약 행은 고칠 수 없다 (definer 함수 포함). 보관 열은 함수 밖에서 바꿀 수 없다.
create or replace function private.guard_archived_reagent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;
  if current_user in ('authenticated', 'anon')
     and (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by) then
    raise exception 'reagent archive only through archive_reagent' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger reagents_guard_archived
  before update on public.reagents
  for each row execute function private.guard_archived_reagent();

-- 새 행에 보관 값을 직접 넣는 것도 막는다
create or replace function private.guard_archived_reagent_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (new.deleted_at is not null or new.deleted_by is not null) then
    raise exception 'reagent archive only through archive_reagent' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger reagents_guard_archived_insert
  before insert on public.reagents
  for each row execute function private.guard_archived_reagent_insert();

-- ───────── 학교급별 최고 학년 ─────────
create or replace function private.school_max_grade(p_school_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.name is null then 6
    when position('초등학교' in s.name) > 0 then 6
    when position('중학교' in s.name) > 0 or position('고등학교' in s.name) > 0 then 3
    else 6
  end
  from (select (select x.name from public.schools x where x.id = p_school_id) as name) s
$$;

revoke all on function private.school_max_grade(uuid) from public, anon;
grant execute on function private.school_max_grade(uuid) to authenticated;

-- ───────── 4) 이름 중복 검사에서 보관 시약 제외 ─────────
create or replace function private.register_reagent(
  p_name text, p_storage_class text, p_stock numeric, p_unit text, p_intake_date date, p_msds_url text default null
)
returns public.reagents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
  v_name text := btrim(coalesce(p_name, ''));
  v_url text := nullif(btrim(coalesce(p_msds_url, '')), '');
  v_reagent public.reagents;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select p.school_id, p.role into v_school, v_role from public.profiles p where p.user_id = v_uid;
  if v_school is null then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if v_role is null or v_role not in ('teacher', 'admin') then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if v_school = private.demo_school_id()
     or exists (select 1 from public.schools s where s.id = v_school and s.is_demo) then
    raise exception 'demo school is read-only' using errcode = '42501';
  end if;

  if char_length(v_name) = 0 or char_length(v_name) > 80 then
    raise exception 'name length' using errcode = '22023';
  end if;
  if p_storage_class is null
     or p_storage_class not in ('유기', '산', '염기', '산화제', '인화성', '무기염', '독성', '기타') then
    raise exception 'invalid storage class' using errcode = '22023';
  end if;
  if p_unit is null or p_unit not in ('병', 'mL', 'g') then
    raise exception 'invalid unit' using errcode = '22023';
  end if;
  if p_stock is null or p_stock < 1 or p_stock > 1000000 then
    raise exception 'stock must be between 1 and 1000000' using errcode = '22023';
  end if;
  if p_intake_date is null then
    raise exception 'intake date required' using errcode = '22023';
  end if;
  if v_url is not null and (v_url !~* '^https?://' or char_length(v_url) > 2000) then
    raise exception 'invalid msds url' using errcode = '22023';
  end if;

  -- 같은 학교의 등록을 직렬화한 뒤 같은 이름(앞뒤 공백·대소문자 무시)이 있으면 거부 — 보관(삭제)된 시약은 빼고 (d7 §24)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('register_reagent:' || v_school::text, 0));
  if exists (
    select 1 from public.reagents r
     where r.school_id = v_school and r.deleted_at is null and lower(btrim(r.name)) = lower(v_name)
  ) then
    raise exception 'reagent name already exists' using errcode = '23505';
  end if;

  insert into public.reagents
    (school_id, name, cas_no, unit, stock, min_stock, msds_url, slot_id, intake_date, storage_class)
  values
    (v_school, v_name, null, p_unit, p_stock, 0, v_url, null, p_intake_date, p_storage_class)
  returning * into v_reagent;

  insert into public.intake_logs (school_id, reagent_id, user_id, amount, intake_date)
  values (v_school, v_reagent.id, v_uid, p_stock, p_intake_date);

  return v_reagent;
end;
$$;

create or replace function private.record_document_intake(p_intake_date date, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_count int;
  v_item jsonb;
  v_amount numeric;
  v_reagent_id uuid;
  v_name text;
  v_class text;
  v_unit text;
  v_url text;
  v_has_new boolean := false;
  v_new_ids uuid[] := '{}';
  v_new public.reagents;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select p.school_id, p.role into v_school, v_role from public.profiles p where p.user_id = v_uid;
  if v_school is null then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if v_role is null or v_role not in ('teacher', 'admin') then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if v_school = private.demo_school_id()
     or exists (select 1 from public.schools s where s.id = v_school and s.is_demo) then
    raise exception 'demo school is read-only' using errcode = '42501';
  end if;

  if p_intake_date is null then
    raise exception 'intake date required' using errcode = '22023';
  end if;
  if p_intake_date > v_today then
    raise exception 'intake date in the future' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 50 then
    raise exception 'items must be 1 to 50' using errcode = '22023';
  end if;

  -- ---------- 1. 모양 검사 (쓰기 전에 전부) ----------
  for v_item in select e from jsonb_array_elements(p_items) as t(e) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'item must be an object' using errcode = '22023';
    end if;

    if v_item ? 'reagent_id' then
      if v_item ? 'name' then
        raise exception 'item is either linked or new' using errcode = '22023';
      end if;
      if jsonb_typeof(v_item -> 'reagent_id') <> 'string'
         or (v_item ->> 'reagent_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'invalid reagent id' using errcode = '22023';
      end if;
      if jsonb_typeof(v_item -> 'amount') is distinct from 'number' then
        raise exception 'amount must be a number' using errcode = '22023';
      end if;
      v_amount := (v_item ->> 'amount')::numeric;
      if v_amount <= 0 or v_amount > 1000000 then
        raise exception 'amount must be > 0 and <= 1000000' using errcode = '22023';
      end if;
    elsif v_item ? 'name' then
      v_has_new := true;
      if jsonb_typeof(v_item -> 'name') <> 'string' then
        raise exception 'name length' using errcode = '22023';
      end if;
      v_name := btrim(v_item ->> 'name');
      if char_length(v_name) = 0 or char_length(v_name) > 80 then
        raise exception 'name length' using errcode = '22023';
      end if;
      v_class := case when jsonb_typeof(v_item -> 'storage_class') = 'string' then v_item ->> 'storage_class' end;
      if v_class is null or v_class not in ('유기', '산', '염기', '산화제', '인화성', '무기염', '독성', '기타') then
        raise exception 'invalid storage class' using errcode = '22023';
      end if;
      v_unit := case when jsonb_typeof(v_item -> 'unit') = 'string' then v_item ->> 'unit' end;
      if v_unit is null or v_unit not in ('병', 'mL', 'g') then
        raise exception 'invalid unit' using errcode = '22023';
      end if;
      if jsonb_typeof(v_item -> 'stock') is distinct from 'number' then
        raise exception 'stock must be a number' using errcode = '22023';
      end if;
      v_amount := (v_item ->> 'stock')::numeric;
      if v_amount <= 0 or v_amount > 1000000 then
        raise exception 'stock must be > 0 and <= 1000000' using errcode = '22023';
      end if;
      if v_item ? 'msds_url' and jsonb_typeof(v_item -> 'msds_url') not in ('string', 'null') then
        raise exception 'invalid msds url' using errcode = '22023';
      end if;
      v_url := nullif(btrim(coalesce(v_item ->> 'msds_url', '')), '');
      if v_url is not null and (v_url !~* '^https?://' or char_length(v_url) > 2000) then
        raise exception 'invalid msds url' using errcode = '22023';
      end if;
    else
      raise exception 'item needs reagent_id or name' using errcode = '22023';
    end if;
  end loop;

  -- 새 시약이 있으면 같은 학교의 등록을 직렬화한다 (register_reagent 와 같은 잠금 열쇠)
  if v_has_new then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('register_reagent:' || v_school::text, 0));
  end if;

  -- ---------- 2. 쓰기 (항목 순서대로) ----------
  for v_item in select e from jsonb_array_elements(p_items) as t(e) loop
    if v_item ? 'reagent_id' then
      v_reagent_id := (v_item ->> 'reagent_id')::uuid;
      v_amount := (v_item ->> 'amount')::numeric;

      -- 다른 학교·데모 학교·보관된 시약은 not found (존재 여부 비노출)
      perform 1
         from public.reagents r
        where r.id = v_reagent_id and r.school_id = v_school and r.deleted_at is null
          for update;
      if not found then
        raise exception 'reagent not found' using errcode = 'P0002';
      end if;

      update public.reagents r
         set stock = r.stock + v_amount,
             intake_date = p_intake_date
       where r.id = v_reagent_id and r.school_id = v_school;

      insert into public.intake_logs (school_id, reagent_id, user_id, amount, intake_date)
      values (v_school, v_reagent_id, v_uid, v_amount, p_intake_date);
    else
      v_name := btrim(v_item ->> 'name');
      v_class := v_item ->> 'storage_class';
      v_unit := v_item ->> 'unit';
      v_amount := (v_item ->> 'stock')::numeric;
      v_url := nullif(btrim(coalesce(v_item ->> 'msds_url', '')), '');

      -- 보관(삭제)된 시약은 이름 중복에서 뺀다 (d7 §24)
      if exists (
        select 1 from public.reagents r
         where r.school_id = v_school and r.deleted_at is null and lower(btrim(r.name)) = lower(v_name)
      ) then
        raise exception 'reagent name already exists' using errcode = '23505';
      end if;

      insert into public.reagents
        (school_id, name, cas_no, unit, stock, min_stock, msds_url, slot_id, intake_date, storage_class)
      values
        (v_school, v_name, null, v_unit, v_amount, 0, v_url, null, p_intake_date, v_class)
      returning * into v_new;

      insert into public.intake_logs (school_id, reagent_id, user_id, amount, intake_date)
      values (v_school, v_new.id, v_uid, v_amount, p_intake_date);

      v_new_ids := v_new_ids || v_new.id;
    end if;
  end loop;

  return jsonb_build_object(
    'intake_count', v_count,
    'new_reagent_ids', to_jsonb(v_new_ids)
  );
end;
$$;

-- ───────── 5) record_usage: 보관 시약 거부 ─────────
create or replace function private.record_usage(
  p_reagent_id uuid, p_amount numeric, p_memo text default null, p_used_on date default null
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

  -- 데모 학교 · 다른 학교 · 보관된 시약은 not found (존재 여부 비노출)
  select r.stock into v_stock
    from public.reagents r
   where r.id = p_reagent_id and r.school_id = v_school and r.deleted_at is null
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

-- ───────── 6) record_usage_batch ─────────
create or replace function private.record_usage_batch(
  p_items jsonb,
  p_used_on date default null,
  p_memo text default null,
  p_class_grade integer default null,
  p_class_no integer default null,
  p_class_subject text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_used_on date := coalesce(p_used_on, (now() at time zone 'Asia/Seoul')::date);
  v_memo text := nullif(regexp_replace(coalesce(p_memo, ''), '^\s+|\s+$', '', 'g'), '');
  v_subject text := nullif(regexp_replace(regexp_replace(coalesce(p_class_subject, ''), '\s+', ' ', 'g'), '^ | $', '', 'g'), '');
  v_max_grade integer;
  v_n integer;
  v_i integer;
  v_item jsonb;
  v_ids uuid[] := '{}';
  v_amounts numeric[] := '{}';
  v_stocks numeric[] := '{}';
  v_id uuid;
  v_amount numeric;
  v_stock numeric;
  v_bad integer[] := '{}';
  v_out jsonb := '[]'::jsonb;
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

  -- ---------- 묶음 공통 ----------
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid items' using errcode = '22023', detail = 'count';
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n < 1 or v_n > 30 then
    raise exception 'invalid items' using errcode = '22023', detail = 'count';
  end if;
  if v_used_on > v_today then
    raise exception 'used_on must not be after today' using errcode = '22008';
  end if;
  if v_memo is not null and char_length(v_memo) > 200 then
    raise exception 'memo too long' using errcode = '22023';
  end if;
  v_max_grade := private.school_max_grade(v_school);
  if p_class_grade is not null and (p_class_grade < 1 or p_class_grade > v_max_grade) then
    raise exception 'invalid class_grade' using errcode = '22023', detail = '1-' || v_max_grade;
  end if;
  if p_class_no is not null and (p_class_no < 1 or p_class_no > 20) then
    raise exception 'invalid class_no' using errcode = '22023';
  end if;
  if v_subject is not null and char_length(v_subject) > 20 then
    raise exception 'invalid class_subject' using errcode = '22023';
  end if;

  -- ---------- 항목 모양 ----------
  for v_i in 1 .. v_n loop
    v_item := p_items -> (v_i - 1);
    v_id := null;
    v_amount := null;
    if jsonb_typeof(v_item) = 'object' then
      if jsonb_typeof(v_item -> 'reagent_id') = 'string'
         and (v_item ->> 'reagent_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_id := (v_item ->> 'reagent_id')::uuid;
      end if;
      if jsonb_typeof(v_item -> 'amount') = 'number' then
        v_amount := (v_item ->> 'amount')::numeric;
      end if;
    end if;
    if v_id is null or v_amount is null then
      v_bad := v_bad || v_i;
    end if;
    v_ids := v_ids || v_id;
    v_amounts := v_amounts || v_amount;
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception 'invalid item' using errcode = '22023', detail = array_to_string(v_bad, ',');
  end if;

  for v_i in 1 .. v_n loop
    if v_amounts[v_i] <= 0 then
      v_bad := v_bad || v_i;
    end if;
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception 'amount must be positive' using errcode = '22023', detail = array_to_string(v_bad, ',');
  end if;

  for v_i in 2 .. v_n loop
    if v_ids[v_i] = any (v_ids[1 : v_i - 1]) then
      v_bad := v_bad || v_i;
    end if;
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception 'duplicate reagent' using errcode = '22023', detail = array_to_string(v_bad, ',');
  end if;

  -- ---------- 시약 잠금 (id 순서 — 동시 저장끼리 교착 없이) ----------
  perform 1
     from public.reagents r
    where r.id = any (v_ids) and r.school_id = v_school and r.deleted_at is null
    order by r.id
      for update;

  for v_i in 1 .. v_n loop
    select r.stock into v_stock
      from public.reagents r
     where r.id = v_ids[v_i] and r.school_id = v_school and r.deleted_at is null;
    if not found then
      v_bad := v_bad || v_i;
      v_stock := null;
    end if;
    v_stocks := v_stocks || v_stock;
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception 'reagent not found' using errcode = 'P0002', detail = array_to_string(v_bad, ',');
  end if;

  for v_i in 1 .. v_n loop
    if v_stocks[v_i] < v_amounts[v_i] then
      v_bad := v_bad || v_i;
    end if;
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception 'insufficient stock' using errcode = '22003', detail = array_to_string(v_bad, ',');
  end if;

  -- ---------- 쓰기 (항목 순서대로) ----------
  for v_i in 1 .. v_n loop
    update public.reagents r
       set stock = r.stock - v_amounts[v_i]
     where r.id = v_ids[v_i] and r.school_id = v_school
    returning r.stock into v_stock;

    insert into public.usage_logs
      (school_id, reagent_id, user_id, amount, memo, used_on, class_grade, class_no, class_subject)
    values
      (v_school, v_ids[v_i], v_uid, v_amounts[v_i], v_memo, v_used_on, p_class_grade, p_class_no, v_subject);

    v_out := v_out || jsonb_build_object('reagent_id', v_ids[v_i], 'stock', v_stock);
  end loop;

  return jsonb_build_object('count', v_n, 'items', v_out);
end;
$$;

revoke all on function private.record_usage_batch(jsonb, date, text, integer, integer, text) from public, anon;
grant execute on function private.record_usage_batch(jsonb, date, text, integer, integer, text) to authenticated;

create or replace function public.record_usage_batch(
  p_items jsonb,
  p_used_on date default null,
  p_memo text default null,
  p_class_grade integer default null,
  p_class_no integer default null,
  p_class_subject text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.record_usage_batch(p_items, p_used_on, p_memo, p_class_grade, p_class_no, p_class_subject)
$$;

revoke all on function public.record_usage_batch(jsonb, date, text, integer, integer, text) from public, anon;
grant execute on function public.record_usage_batch(jsonb, date, text, integer, integer, text) to authenticated;

-- ───────── 7) archive_reagent ─────────
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

  -- 없는 id · 다른 학교 · 이미 보관 = not found (존재 여부 비노출). 칸 배치는 비운다.
  update public.reagents r
     set deleted_at = now(),
         deleted_by = v_uid,
         slot_id = null
   where r.id = p_reagent_id and r.school_id = v_school and r.deleted_at is null
  returning r.id, r.name into v_id, v_name;
  if v_id is null then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('reagent_id', v_id, 'name', v_name);
end;
$$;

revoke all on function private.archive_reagent(uuid) from public, anon;
grant execute on function private.archive_reagent(uuid) to authenticated;

create or replace function public.archive_reagent(p_reagent_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.archive_reagent(p_reagent_id)
$$;

revoke all on function public.archive_reagent(uuid) from public, anon;
grant execute on function public.archive_reagent(uuid) to authenticated;

-- ───────── 8) usage_records (화면 10) ─────────
create or replace function private.usage_records(
  p_only_mine boolean default false,
  p_since timestamptz default null,
  p_query text default null,
  p_limit integer default 200,
  p_class_grade integer default null,
  p_class_no integer default null
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
  reagent_deleted boolean,
  class_grade integer,
  class_no integer,
  class_subject text,
  user_name text,
  is_mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.used_at, u.used_on, u.amount, u.memo, u.reagent_id, r.name, r.unit,
         case when r.deleted_at is null then r.msds_url end,
         r.deleted_at is not null,
         u.class_grade, u.class_no, u.class_subject,
         private.same_school_display_name(u.user_id),
         coalesce(u.user_id = (select auth.uid()), false)
    from public.usage_logs u
    join public.reagents r on r.id = u.reagent_id and r.school_id = u.school_id
   -- RLS 대신: 로그인 사용자의 학교 기록만 (anon · 프로필 없음 = 0행)
   where (select auth.uid()) is not null
     and u.school_id = (select private.current_school_id())
     and (not coalesce(p_only_mine, false) or u.user_id = (select auth.uid()))
     -- 기간: 시작 시각의 한국 날짜 이후 사용일
     and (p_since is null or u.used_on >= (p_since at time zone 'Asia/Seoul')::date)
     and (
       nullif(btrim(coalesce(p_query, '')), '') is null
       or r.name ilike
            '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
            escape '\'
     )
     and (p_class_grade is null or u.class_grade = p_class_grade)
     and (p_class_no is null or u.class_no = p_class_no)
   -- 사용일 최신순, 같은 날은 기록 시각 최신순
   order by u.used_on desc, u.used_at desc, u.id desc
   limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

revoke all on function private.usage_records(boolean, timestamptz, text, integer, integer, integer) from public, anon;
grant execute on function private.usage_records(boolean, timestamptz, text, integer, integer, integer) to authenticated;

create or replace function public.usage_records(
  p_only_mine boolean default false,
  p_since timestamptz default null,
  p_query text default null,
  p_limit integer default 200,
  p_class_grade integer default null,
  p_class_no integer default null
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
  reagent_deleted boolean,
  class_grade integer,
  class_no integer,
  class_subject text,
  user_name text,
  is_mine boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.usage_records(p_only_mine, p_since, p_query, p_limit, p_class_grade, p_class_no)
$$;

revoke all on function public.usage_records(boolean, timestamptz, text, integer, integer, integer) from public, anon;
grant execute on function public.usage_records(boolean, timestamptz, text, integer, integer, integer) to authenticated;
