-- 센서 종류 27종 · 센서 서류로 등록 · 초대 취소 (d7 §28 — design/rules.json 1.28 sensor.types · sensor.doc · invite_cancel)
--
-- SQL Editor 에 한 번에 붙여 넣어 실행하는 파일. 다시 돌려도 같은 결과:
--   제약은 drop constraint if exists → add, 함수는 create or replace, 데이터 update 는 조건부, seed 는 고정 id upsert.
--   행을 지우는 문장은 cancel_invite 함수 본문(호출할 때 대기 초대 1행) 하나뿐 — 이 파일을 실행해도 아무 행도 지우지 않는다.
--
-- 1) sensors.type 27종 (rules sensor.types 순서 그대로):
--      물리 12 온도 · 힘 · 운동(거리) · 가속도 · 회전 · 전압 · 전류 · 자기장 · 조도 · 소리 · 압력 · 방사선
--      화학  9 pH · 전도도 · 용존산소 · 이온·수질 · 분광 · 편광 · 색·탁도 · CO₂ · 산소
--      생명·지구 3 심박·생체 · 습도 · 기상 / 장비 3 인터페이스 · 코딩 보드 · 기타
--    기존 행 type '심박' → '심박·생체' (보관된 행 포함 — 보관 행 update 를 막는 guard 트리거를 이 문장 동안만 끈다).
--    sensors_type_check 를 27종으로 다시 만들고, upsert_sensor 의 종류 검사도 27종으로 (그 밖의 본문·시그니처 그대로).
-- 2) 데모 학교 센서 seed 를 파스코 카탈로그 모델로 (lib/pasco-catalog, 같은 고정 id 6개 upsert):
--      PS-3201 온도 · PS-3204 pH(점검 필요) · PS-3202 힘 · PS-3219 운동(고장) · PS-2600 분광 · PS-3237 편광
-- 3) record_sensor_document(p_items jsonb) → jsonb { added_count, new_sensor_ids[] }   (d7 §28 센서 서류 저장 DB)
--      한 번의 호출 = 한 트랜잭션. 하나라도 틀리면 전부 취소.
--      교사·admin · 자기 학교 · 데모 거부(42501, private.staff_school_for_write). 항목 1~50(22023).
--      기존 센서 행 {sensor_id, add_quantity}: 자기 학교 · 보관 안 된 센서만(아니면 P0002 'sensor not found'),
--          add_quantity = JSON 정수 1~9999, 더한 수량이 9999 를 넘으면 22023 'invalid quantity' (같은 센서가 여러 행이면 합산)
--      새 센서 행 {name, type, maker, model, quantity, location_text, slot_id, status, memo}:
--          private.upsert_sensor(p_id = null) 를 그대로 부른다 → upsert_sensor 와 같은 검사·오류(22023 · P0002 slot not found)
--          글자 칸은 문자열 또는 null, quantity 는 JSON 정수, status 가 없거나 null 이면 'ok'(화면 기본 = 정상)
--      한 항목에 sensor_id 와 name 이 함께 있거나 둘 다 없으면 22023.
--      added_count = 처리한 항목 수, new_sensor_ids = 새로 만든 센서 id(항목 순서)
-- 4) cancel_invite(p_invite_id uuid) → jsonb { invite_id, email }   (d7 §28 초대 취소 · §8)
--      admin · 자기 학교 · 아직 가입 안 한(accepted_at is null) 초대만 · 데모 거부. 대기 초대 행을 지운다.
--      없는 · 다른 학교 · 이미 가입한 초대 = P0002 'invite not found' (존재 여부 비노출).
--      지운 뒤 그 이메일로 가입하면 register_profile 이 대기 초대를 못 찾으므로 §8 규칙대로 student
--      (그 학교 첫 가입자면 admin — 초대가 있을 수 없는 상태와 같다). 학교 행 잠금(for no key update)으로 가입·초대와 직렬화.
--
-- 함수 모양은 다른 쓰기 함수와 같다: public = security invoker 래퍼(anon 실행 불가) → private = security definer 본문(search_path '').

-- ───────── 1) sensors.type 27종 ─────────
alter table public.sensors drop constraint if exists sensors_type_check;

do $$
begin
  if exists (select 1 from public.sensors where type = '심박') then
    alter table public.sensors disable trigger sensors_guard_write;
    update public.sensors set type = '심박·생체' where type = '심박';
    alter table public.sensors enable trigger sensors_guard_write;
  end if;
end;
$$;

alter table public.sensors add constraint sensors_type_check check (
  type in (
    '온도', '힘', '운동(거리)', '가속도', '회전', '전압', '전류', '자기장', '조도', '소리', '압력', '방사선',
    'pH', '전도도', '용존산소', '이온·수질', '분광', '편광', '색·탁도', 'CO₂', '산소',
    '심박·생체', '습도', '기상',
    '인터페이스', '코딩 보드', '기타'
  )
);

create or replace function private.upsert_sensor(
  p_name text,
  p_type text,
  p_maker text,
  p_quantity integer,
  p_status text,
  p_id uuid default null,
  p_model text default null,
  p_location_text text default null,
  p_slot_id uuid default null,
  p_memo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_maker text := btrim(coalesce(p_maker, ''));
  v_model text := nullif(btrim(coalesce(p_model, '')), '');
  v_loc text := nullif(btrim(coalesce(p_location_text, '')), '');
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
  v_id uuid;
begin
  v_school := private.staff_school_for_write();

  if char_length(v_name) = 0 or char_length(v_name) > 40 then
    raise exception 'name length' using errcode = '22023';
  end if;
  if p_type is null
     or p_type not in (
       '온도', '힘', '운동(거리)', '가속도', '회전', '전압', '전류', '자기장', '조도', '소리', '압력', '방사선',
       'pH', '전도도', '용존산소', '이온·수질', '분광', '편광', '색·탁도', 'CO₂', '산소',
       '심박·생체', '습도', '기상',
       '인터페이스', '코딩 보드', '기타'
     ) then
    raise exception 'invalid type' using errcode = '22023';
  end if;
  if char_length(v_maker) = 0 or char_length(v_maker) > 30 then
    raise exception 'maker length' using errcode = '22023';
  end if;
  if v_model is not null and char_length(v_model) > 40 then
    raise exception 'model length' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 9999 then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;
  if v_loc is not null and char_length(v_loc) > 40 then
    raise exception 'location length' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('ok', 'check', 'broken') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if v_memo is not null and char_length(v_memo) > 200 then
    raise exception 'memo length' using errcode = '22023';
  end if;

  -- 시약장 칸은 자기 학교 것만 (다른 학교 · 없는 칸 = not found). 칸을 고르면 직접 입력 위치는 비운다
  if p_slot_id is not null then
    perform 1 from public.cabinet_slots s where s.id = p_slot_id and s.school_id = v_school;
    if not found then
      raise exception 'slot not found' using errcode = 'P0002';
    end if;
    v_loc := null;
  end if;

  if p_id is null then
    insert into public.sensors
      (school_id, name, type, maker, model, quantity, location_text, slot_id, status, memo, created_by)
    values
      (v_school, v_name, p_type, v_maker, v_model, p_quantity, v_loc, p_slot_id, p_status, v_memo, v_uid)
    returning id into v_id;
  else
    update public.sensors s
       set name = v_name,
           type = p_type,
           maker = v_maker,
           model = v_model,
           quantity = p_quantity,
           location_text = v_loc,
           slot_id = p_slot_id,
           status = p_status,
           memo = v_memo
     where s.id = p_id and s.school_id = v_school and s.deleted_at is null
    returning s.id into v_id;
    if v_id is null then
      raise exception 'sensor not found' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object('sensor_id', v_id);
end;
$$;

revoke all on function private.upsert_sensor(text, text, text, integer, text, uuid, text, text, uuid, text) from public, anon;
grant execute on function private.upsert_sensor(text, text, text, integer, text, uuid, text, text, uuid, text) to authenticated;

-- ───────── 2) 데모 학교 센서 seed (파스코 카탈로그) ─────────
insert into public.sensors
  (id, school_id, name, type, maker, model, quantity, location_text, slot_id, status, memo, created_at)
values
  ('00000000-d3e0-4000-8000-00000000e001', '00000000-d3e0-4000-8000-000000000001', '무선 온도', '온도', '파스코', 'PS-3201', 3, '과학실 뒤 선반', null, 'ok', null, '2026-09-02 09:00:00+09'),
  ('00000000-d3e0-4000-8000-00000000e002', '00000000-d3e0-4000-8000-000000000001', '무선 pH', 'pH', '파스코', 'PS-3204', 2, null, '00000000-d3e0-4000-8000-000000005101', 'check', '전극 보관액 교체 필요', '2026-09-02 09:05:00+09'),
  ('00000000-d3e0-4000-8000-00000000e003', '00000000-d3e0-4000-8000-000000000001', '무선 힘·가속도', '힘', '파스코', 'PS-3202', 4, '과학실 뒤 선반', null, 'ok', null, '2026-09-03 10:00:00+09'),
  ('00000000-d3e0-4000-8000-00000000e004', '00000000-d3e0-4000-8000-000000000001', '무선 운동', '운동(거리)', '파스코', 'PS-3219', 2, '준비실 서랍', null, 'broken', '케이블 단자 고장', '2026-09-03 10:10:00+09'),
  ('00000000-d3e0-4000-8000-00000000e005', '00000000-d3e0-4000-8000-000000000001', '무선 분광기(가시광, 형광)', '분광', '파스코', 'PS-2600', 1, '화학 준비실', null, 'ok', null, '2026-09-10 14:00:00+09'),
  ('00000000-d3e0-4000-8000-00000000e006', '00000000-d3e0-4000-8000-000000000001', '무선 편광계', '편광', '파스코', 'PS-3237', 1, '화학 준비실', null, 'ok', null, '2026-09-10 14:10:00+09')
on conflict (id) do update
  set school_id = excluded.school_id, name = excluded.name, type = excluded.type, maker = excluded.maker,
      model = excluded.model, quantity = excluded.quantity, location_text = excluded.location_text,
      slot_id = excluded.slot_id, status = excluded.status, memo = excluded.memo, created_at = excluded.created_at
  where (public.sensors.name, public.sensors.type, public.sensors.maker, public.sensors.model, public.sensors.quantity,
         public.sensors.location_text, public.sensors.slot_id, public.sensors.status, public.sensors.memo)
        is distinct from
        (excluded.name, excluded.type, excluded.maker, excluded.model, excluded.quantity,
         excluded.location_text, excluded.slot_id, excluded.status, excluded.memo)
     or public.sensors.created_at is distinct from excluded.created_at
     or public.sensors.school_id is distinct from excluded.school_id;

-- ───────── 3) record_sensor_document ─────────
create or replace function private.record_sensor_document(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_count int;
  v_item jsonb;
  v_key text;
  v_add numeric;
  v_qty numeric;
  v_sensor_id uuid;
  v_current integer;
  v_status text;
  v_res jsonb;
  v_new_ids uuid[] := '{}';
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  -- 로그인 · 프로필 · 데모 · 교사·admin (42501)
  v_school := private.staff_school_for_write();

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
    if v_item ? 'sensor_id' then
      if v_item ? 'name' then
        raise exception 'item is either existing or new' using errcode = '22023';
      end if;
      if jsonb_typeof(v_item -> 'sensor_id') is distinct from 'string'
         or (v_item ->> 'sensor_id') !~* v_uuid_re then
        raise exception 'invalid sensor id' using errcode = '22023';
      end if;
      if jsonb_typeof(v_item -> 'add_quantity') is distinct from 'number' then
        raise exception 'invalid quantity' using errcode = '22023';
      end if;
      v_add := (v_item ->> 'add_quantity')::numeric;
      if v_add <> trunc(v_add) or v_add < 1 or v_add > 9999 then
        raise exception 'invalid quantity' using errcode = '22023';
      end if;
    elsif v_item ? 'name' then
      foreach v_key in array array['name', 'type', 'maker', 'model', 'location_text', 'status', 'memo'] loop
        if v_item ? v_key and jsonb_typeof(v_item -> v_key) not in ('string', 'null') then
          raise exception 'invalid field %', v_key using errcode = '22023';
        end if;
      end loop;
      if v_item ? 'slot_id' and jsonb_typeof(v_item -> 'slot_id') <> 'null' then
        if jsonb_typeof(v_item -> 'slot_id') <> 'string' or (v_item ->> 'slot_id') !~* v_uuid_re then
          raise exception 'invalid slot id' using errcode = '22023';
        end if;
      end if;
      if jsonb_typeof(v_item -> 'quantity') is distinct from 'number' then
        raise exception 'invalid quantity' using errcode = '22023';
      end if;
      v_qty := (v_item ->> 'quantity')::numeric;
      if v_qty <> trunc(v_qty) or v_qty < 0 or v_qty > 9999 then
        raise exception 'invalid quantity' using errcode = '22023';
      end if;
    else
      raise exception 'item needs sensor_id or name' using errcode = '22023';
    end if;
  end loop;

  -- ---------- 2. 쓰기 (항목 순서대로) ----------
  for v_item in select e from jsonb_array_elements(p_items) as t(e) loop
    if v_item ? 'sensor_id' then
      v_sensor_id := (v_item ->> 'sensor_id')::uuid;
      v_add := (v_item ->> 'add_quantity')::numeric;
      -- 다른 학교 · 데모 학교 · 보관된 센서는 자기 학교 조건에 걸려 not found (존재 여부 비노출)
      select s.quantity into v_current
        from public.sensors s
       where s.id = v_sensor_id and s.school_id = v_school and s.deleted_at is null
         for update;
      if not found then
        raise exception 'sensor not found' using errcode = 'P0002';
      end if;
      if v_current + v_add > 9999 then
        raise exception 'invalid quantity' using errcode = '22023';
      end if;
      update public.sensors s
         set quantity = s.quantity + v_add::integer
       where s.id = v_sensor_id and s.school_id = v_school and s.deleted_at is null;
    else
      v_status := coalesce(nullif(v_item ->> 'status', ''), 'ok');
      -- upsert_sensor 와 같은 검사·오류 (이름 · 종류 27종 · 회사 · 모델 · 수량 · 위치 · 상태 · 메모 · 자기 학교 칸)
      v_res := private.upsert_sensor(
        v_item ->> 'name',
        v_item ->> 'type',
        v_item ->> 'maker',
        (v_item ->> 'quantity')::numeric::integer,
        v_status,
        null,
        v_item ->> 'model',
        v_item ->> 'location_text',
        nullif(v_item ->> 'slot_id', '')::uuid,
        v_item ->> 'memo'
      );
      v_new_ids := v_new_ids || (v_res ->> 'sensor_id')::uuid;
    end if;
  end loop;

  return jsonb_build_object(
    'added_count', v_count,
    'new_sensor_ids', to_jsonb(v_new_ids)
  );
end;
$$;

revoke all on function private.record_sensor_document(jsonb) from public, anon;
grant execute on function private.record_sensor_document(jsonb) to authenticated;

create or replace function public.record_sensor_document(p_items jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.record_sensor_document(p_items)
$$;

revoke all on function public.record_sensor_document(jsonb) from public, anon;
grant execute on function public.record_sensor_document(jsonb) to authenticated;

-- ───────── 4) cancel_invite ─────────
create or replace function private.cancel_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_caller_role text;
  v_id uuid;
  v_email text;
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

  -- 같은 학교의 초대 · 가입(register_profile) · 역할 변경과 직렬화한 뒤 호출자 역할을 다시 읽는다
  perform 1 from public.schools s where s.id = v_school for no key update;
  select p.role into v_caller_role
    from public.profiles p where p.user_id = v_uid and p.school_id = v_school;
  if v_caller_role is distinct from 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_invite_id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  -- 다른 학교 · 이미 가입한 초대는 조건에 걸려 not found (존재 여부 비노출)
  delete from public.invites i
   where i.id = p_invite_id and i.school_id = v_school and i.accepted_at is null
  returning i.id, i.email into v_id, v_email;
  if v_id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('invite_id', v_id, 'email', v_email);
end;
$$;

revoke all on function private.cancel_invite(uuid) from public, anon;
grant execute on function private.cancel_invite(uuid) to authenticated;

create or replace function public.cancel_invite(p_invite_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_invite(p_invite_id)
$$;

revoke all on function public.cancel_invite(uuid) from public, anon;
grant execute on function public.cancel_invite(uuid) to authenticated;
