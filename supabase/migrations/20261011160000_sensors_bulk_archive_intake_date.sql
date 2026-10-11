-- 무선 센서(화면 17) · 여러 개 삭제(화면 2·17) · 입고일 QA 수정 (d7 §25 — design/rules.json 1.26 sensor·bulk_delete)
--
-- 한 트랜잭션 · 다시 돌려도 같은 결과(create table if not exists · 정책은 없을 때만 · create or replace · upsert seed).
-- 없애는 문장 없음(drop · delete 없음). 기존 행은 고치지 않는다.
--
-- 1) public.sensors — 보유 관리만(측정값·대여 없음).
--      id · school_id · name(1~40) · type(rules sensor.types 14종) · maker(1~30) · model(null, 1~40) · quantity(0~9999)
--      · location_text(null, 1~40) · slot_id(null, 자기 학교 시약장 칸 — 칸이 없어지면 slot_id 만 null)
--      · status ok|check|broken(화면 = 정상 · 점검 필요 · 고장) · memo(null, 1~200) · created_at · created_by · deleted_at · deleted_by
--      RLS: 같은 학교 select(보관 제외) · anon 은 데모 학교 select(보관 제외). insert·update·delete 정책 없음 —
--      쓰기는 아래 함수만(교사·admin · 자기 학교 · 데모 거부). 함수 밖 쓰기(authenticated · anon)는 BEFORE 트리거가 42501 로 막는다.
--      보관된 행의 update 는 P0002 'sensor not found'.
-- 2) upsert_sensor(p_name, p_type, p_maker, p_quantity, p_status, p_id, p_model, p_location_text, p_slot_id, p_memo) → jsonb { sensor_id }
--      p_id null = 새로 등록, 있으면 수정(없는 · 다른 학교 · 보관 = P0002). 시약장 칸을 고르면 location_text 는 비운다.
--      오류: 42501 not authenticated / no profile / demo school is read-only / staff only
--            22023 name length · invalid type · maker length · model length · invalid quantity · location length · invalid status · memo length
--            P0002 sensor not found · slot not found
-- 3) archive_sensor(p_sensor_id uuid) → jsonb { sensor_id, name }   (archive_reagent 와 같은 검사, slot_id = null)
-- 4) archive_sensors(p_sensor_ids uuid[]) → integer(보관한 수) · archive_reagents(p_reagent_ids uuid[]) → integer
--      1~100개(중복은 하나로), 한 트랜잭션, 하나라도 없는 · 다른 학교 · 이미 보관 = P0002 로 전부 취소. null 원소 · 0개 · 101개 이상 = 22023.
-- 5) 입고일 미래 금지: intake_logs insert 전에 intake_date > 오늘(Asia/Seoul) = 22023 'intake date in the future'
--      (record_intake · register_reagent · record_document_intake 모두 intake_logs 를 쓴다 — 함수 안의 시약 행 변경도 함께 취소)
-- 6) 최근 입고일 = 가장 늦은 입고일 유지: 입고로 재고가 늘면서 intake_date 가 더 이른 날짜로 바뀌려 하면 원래 날짜를 둔다
--      (2026-10-11 사용자 결정 — 더 이른 날짜 입고로 최근 입고일이 뒤로 가지 않음)
-- 7) 데모 학교 센서 6개 seed (고정 id upsert)
--
-- 함수 모양은 다른 쓰기 함수와 같다: public = security invoker 래퍼(anon 실행 불가) → private = security definer 본문.

-- ───────── 1) sensors ─────────
create table if not exists public.sensors (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  type text not null,
  maker text not null,
  model text,
  quantity integer not null default 1,
  location_text text,
  slot_id uuid,
  status text not null default 'ok',
  memo text,
  created_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint sensors_name_check check (char_length(name) between 1 and 40 and name = btrim(name)),
  constraint sensors_type_check check (
    type in ('온도', 'pH', '힘', '운동(거리)', '전압', '전류', '조도', '압력', 'CO₂', '산소', '습도', '소리', '심박', '기타')
  ),
  constraint sensors_maker_check check (char_length(maker) between 1 and 30 and maker = btrim(maker)),
  constraint sensors_model_check check (model is null or (char_length(model) between 1 and 40 and model = btrim(model))),
  constraint sensors_quantity_check check (quantity between 0 and 9999),
  constraint sensors_location_check check (
    location_text is null or (char_length(location_text) between 1 and 40 and location_text = btrim(location_text))
  ),
  constraint sensors_status_check check (status in ('ok', 'check', 'broken')),
  constraint sensors_memo_check check (memo is null or (char_length(memo) between 1 and 200 and memo = btrim(memo))),
  constraint sensors_slot_fk foreign key (slot_id, school_id)
    references public.cabinet_slots (id, school_id) on delete set null (slot_id)
);

create index if not exists sensors_school_id_idx on public.sensors (school_id) where deleted_at is null;
create index if not exists sensors_slot_id_idx on public.sensors (slot_id, school_id);

alter table public.sensors enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sensors' and policyname = 'sensors_select') then
    create policy sensors_select on public.sensors
      for select to authenticated
      using (school_id = (select private.current_school_id()) and deleted_at is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sensors' and policyname = 'sensors_select_demo_anon') then
    create policy sensors_select_demo_anon on public.sensors
      for select to anon
      using (school_id = (select private.demo_school_id()) and deleted_at is null);
  end if;
end;
$$;

-- 직접 쓰기 권한도 거둔다 (정책이 없어 어차피 거부되지만 두 겹으로)
revoke insert, update, delete, truncate on public.sensors from anon, authenticated;
grant select on public.sensors to anon, authenticated;

-- 함수 밖 쓰기 거부 + 보관된 행은 고칠 수 없다 (definer 함수 포함)
create or replace function private.guard_sensor_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'sensor writes only through functions' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    raise exception 'sensor not found' using errcode = 'P0002';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace trigger sensors_guard_write
  before insert or update or delete on public.sensors
  for each row execute function private.guard_sensor_write();

-- 쓰기 함수 공통: 호출자 학교 (교사·admin · 데모 거부)
create or replace function private.staff_school_for_write()
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
  return v_school;
end;
$$;

revoke all on function private.staff_school_for_write() from public, anon;
grant execute on function private.staff_school_for_write() to authenticated;

-- ───────── 2) upsert_sensor ─────────
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
     or p_type not in ('온도', 'pH', '힘', '운동(거리)', '전압', '전류', '조도', '압력', 'CO₂', '산소', '습도', '소리', '심박', '기타') then
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

create or replace function public.upsert_sensor(
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
language sql
security invoker
set search_path = ''
as $$
  select private.upsert_sensor(p_name, p_type, p_maker, p_quantity, p_status, p_id, p_model, p_location_text, p_slot_id, p_memo)
$$;

revoke all on function public.upsert_sensor(text, text, text, integer, text, uuid, text, text, uuid, text) from public, anon;
grant execute on function public.upsert_sensor(text, text, text, integer, text, uuid, text, text, uuid, text) to authenticated;

-- ───────── 3) archive_sensor ─────────
create or replace function private.archive_sensor(p_sensor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_id uuid;
  v_name text;
begin
  v_school := private.staff_school_for_write();

  update public.sensors s
     set deleted_at = now(),
         deleted_by = v_uid,
         slot_id = null
   where s.id = p_sensor_id and s.school_id = v_school and s.deleted_at is null
  returning s.id, s.name into v_id, v_name;
  if v_id is null then
    raise exception 'sensor not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('sensor_id', v_id, 'name', v_name);
end;
$$;

revoke all on function private.archive_sensor(uuid) from public, anon;
grant execute on function private.archive_sensor(uuid) to authenticated;

create or replace function public.archive_sensor(p_sensor_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.archive_sensor(p_sensor_id)
$$;

revoke all on function public.archive_sensor(uuid) from public, anon;
grant execute on function public.archive_sensor(uuid) to authenticated;

-- ───────── 4) archive_sensors · archive_reagents (여러 개, 1~100, 한 트랜잭션) ─────────
create or replace function private.archive_sensors(p_sensor_ids uuid[])
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

  if p_sensor_ids is null or array_position(p_sensor_ids, null) is not null then
    raise exception 'invalid ids' using errcode = '22023';
  end if;
  v_ids := array(select distinct x from unnest(p_sensor_ids) as t(x));
  if cardinality(v_ids) < 1 or cardinality(v_ids) > 100 then
    raise exception 'ids must be 1 to 100' using errcode = '22023';
  end if;

  update public.sensors s
     set deleted_at = now(),
         deleted_by = v_uid,
         slot_id = null
   where s.id = any (v_ids) and s.school_id = v_school and s.deleted_at is null;
  get diagnostics v_count = row_count;

  -- 하나라도 없는 · 다른 학교 · 이미 보관이면 전부 취소 (존재 여부 비노출)
  if v_count <> cardinality(v_ids) then
    raise exception 'sensor not found' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

revoke all on function private.archive_sensors(uuid[]) from public, anon;
grant execute on function private.archive_sensors(uuid[]) to authenticated;

create or replace function public.archive_sensors(p_sensor_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.archive_sensors(p_sensor_ids)
$$;

revoke all on function public.archive_sensors(uuid[]) from public, anon;
grant execute on function public.archive_sensors(uuid[]) to authenticated;

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

  -- archive_reagent 와 같은 보관: deleted_at · deleted_by, 칸 배치 비움
  update public.reagents r
     set deleted_at = now(),
         deleted_by = v_uid,
         slot_id = null
   where r.id = any (v_ids) and r.school_id = v_school and r.deleted_at is null;
  get diagnostics v_count = row_count;

  if v_count <> cardinality(v_ids) then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

revoke all on function private.archive_reagents(uuid[]) from public, anon;
grant execute on function private.archive_reagents(uuid[]) to authenticated;

create or replace function public.archive_reagents(p_reagent_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.archive_reagents(p_reagent_ids)
$$;

revoke all on function public.archive_reagents(uuid[]) from public, anon;
grant execute on function public.archive_reagents(uuid[]) to authenticated;

-- ───────── 5) 입고일 미래 금지 ─────────
create or replace function private.guard_intake_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.intake_date > (now() at time zone 'Asia/Seoul')::date then
    raise exception 'intake date in the future' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace trigger intake_logs_guard_date
  before insert on public.intake_logs
  for each row execute function private.guard_intake_date();

-- ───────── 6) 최근 입고일 = 가장 늦은 입고일 ─────────
create or replace function private.keep_latest_intake_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.intake_date is not null
     and new.intake_date is not null
     and new.intake_date < old.intake_date
     and new.stock > old.stock then
    new.intake_date := old.intake_date;
  end if;
  return new;
end;
$$;

create or replace trigger reagents_keep_latest_intake
  before update of intake_date on public.reagents
  for each row execute function private.keep_latest_intake_date();

-- ───────── 7) 데모 학교 센서 seed ─────────
insert into public.sensors
  (id, school_id, name, type, maker, model, quantity, location_text, slot_id, status, memo, created_at)
values
  ('00000000-d3e0-4000-8000-00000000e001', '00000000-d3e0-4000-8000-000000000001', '무선 온도 센서', '온도', '버니어', 'GDX-TMP', 3, '과학실 뒤 선반', null, 'ok', null, '2026-09-02 09:00:00+09'),
  ('00000000-d3e0-4000-8000-00000000e002', '00000000-d3e0-4000-8000-000000000001', '무선 pH 센서', 'pH', '버니어', 'GDX-PH', 2, null, '00000000-d3e0-4000-8000-000000005101', 'check', '전극 보관액 교체 필요', '2026-09-02 09:05:00+09'),
  ('00000000-d3e0-4000-8000-00000000e003', '00000000-d3e0-4000-8000-000000000001', '무선 힘 센서', '힘', '파스코', 'PS-3202', 4, '과학실 뒤 선반', null, 'ok', null, '2026-09-03 10:00:00+09'),
  ('00000000-d3e0-4000-8000-00000000e004', '00000000-d3e0-4000-8000-000000000001', '운동 센서', '운동(거리)', '파스코', 'PS-3219', 2, '준비실 서랍', null, 'broken', '케이블 단자 고장', '2026-09-03 10:10:00+09'),
  ('00000000-d3e0-4000-8000-00000000e005', '00000000-d3e0-4000-8000-000000000001', 'CO₂ 센서', 'CO₂', '이지메이커', null, 1, '과학실 뒤 선반', null, 'ok', null, '2026-09-10 14:00:00+09'),
  ('00000000-d3e0-4000-8000-00000000e006', '00000000-d3e0-4000-8000-000000000001', '디지털 현미경', '기타', '오맥스', null, 2, '생물 준비실', null, 'ok', null, '2026-09-10 14:10:00+09')
on conflict (id) do update
  set school_id = excluded.school_id, name = excluded.name, type = excluded.type, maker = excluded.maker,
      model = excluded.model, quantity = excluded.quantity, location_text = excluded.location_text,
      slot_id = excluded.slot_id, status = excluded.status, memo = excluded.memo, created_at = excluded.created_at;
