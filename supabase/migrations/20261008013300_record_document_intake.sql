-- 서류로 입고 (d7 §21, 화면 7 — design/rules.json 1.17 intake)
--
-- record_document_intake(p_intake_date date, p_items jsonb) → jsonb { intake_count, new_reagent_ids[] }
--   한 번의 호출 = 한 트랜잭션. 항목 하나라도 틀리면 예외 → 전부 취소(아무것도 남지 않는다).
--   - 교사·admin 만, 데모 학교 거부 (42501). school_id 는 호출자 profiles 에서 정한다(입력으로 받지 않는다)
--   - p_intake_date: 필수, 오늘(Asia/Seoul) 이후 거부 (22023)
--   - p_items: 배열, 1~50 항목 (22023)
--     연결 행 {reagent_id, amount}            → record_intake 와 같은 처리:
--         자기 학교 시약만(아니면 P0002), reagents.stock += amount, reagents.intake_date = 입고일, intake_logs 1행
--         (§11-1 자동 기준은 intake_logs insert 트리거가 맞춘다)
--     새 시약 행 {name, storage_class, unit, stock, msds_url} → register_reagent 와 같은 처리:
--         이름 1~80자, 분류 8종, 단위 병·mL·g, msds_url 비움 또는 http(s):// 2000자 이하,
--         같은 학교에 같은 이름(앞뒤 공백·대소문자 무시)이 있으면 23505 — 같은 서류 안의 새 시약끼리도 포함,
--         reagents insert(min_stock 0, slot_id·cas_no null) + 첫 재고 intake_logs 1행
--     amount·stock: JSON 숫자, 0 보다 크고 1,000,000 이하 (22023) — d7 §21 "amount·stock > 0"
--   - 반환: { intake_count: 처리한 항목 수, new_reagent_ids: 새로 만든 시약 id 배열(항목 순서) }
--
-- 기존 private.record_intake·register_reagent 를 그대로 부르지 않는 이유: 두 함수는 수량 하한이 1 이고(§6)
-- 미래 날짜를 막지 않는다. §21 은 > 0 · 미래 날짜 거부라 같은 처리(쓰는 열·로그·잠금·중복 이름 검사)를 여기서 한 번 더 쓴다.
--
-- 모양은 다른 쓰기 함수와 같다: public = security invoker 래퍼(anon 실행 불가) → private = security definer 본문.
-- create function 만 쓴다 (새 함수 — drop·delete 없음).

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

      -- 다른 학교·데모 학교 시약은 자기 학교 조건에 걸려 not found (존재 여부 비노출)
      perform 1
         from public.reagents r
        where r.id = v_reagent_id and r.school_id = v_school
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

      if exists (
        select 1 from public.reagents r
         where r.school_id = v_school and lower(btrim(r.name)) = lower(v_name)
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

revoke all on function private.record_document_intake(date, jsonb) from public, anon;
grant execute on function private.record_document_intake(date, jsonb) to authenticated;

create or replace function public.record_document_intake(p_intake_date date, p_items jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.record_document_intake(p_intake_date, p_items)
$$;

revoke all on function public.record_document_intake(date, jsonb) from public, anon;
grant execute on function public.record_document_intake(date, jsonb) to authenticated;
