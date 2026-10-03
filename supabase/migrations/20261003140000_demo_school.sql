-- 둘러보기(비회원) 데모 학교 — harness/d7-data.md §5 (2026-10-03 결정)
--
-- 1) schools.is_demo (기본 false). neis_code 는 데모 학교만 null 허용. 데모 학교는 최대 1행.
-- 2) 데모 학교 1행 + seed (시약 18종, 양문형 4단 시약장 1개·칸 8개, 사용 기록 10건). 고정 id upsert → 재실행 안전.
--    usage_logs.user_id 는 auth.users FK 라서 가짜 계정을 만들지 않고, 데모 행만 user_id null + demo_user_name("학생 A"…)로 표시.
-- 3) RLS: anon 은 데모 학교 행만 select. 데모 학교 행에 insert·update·delete 정책 없음(anon·authenticated 모두 거부).
--    기존 teacher/admin 쓰기 정책에 "데모 학교 제외" 조건 추가. 로그인 사용자의 자기 학교 정책은 그대로 (N1).
-- 4) profiles.school_id 는 데모 학교가 될 수 없음(check + 트리거). register_profile·record_usage 도 데모 학교 가드.
-- 5) 데모 전용 읽기 RPC demo_recent_usage·demo_reagent_usage (anon 실행 가능, 데모 학교 행만).

-- ---------- 1. schools.is_demo ----------
alter table public.schools
  add column if not exists is_demo boolean not null default false;

alter table public.schools alter column neis_code drop not null;

-- 데모 학교가 아니면 neis_code 필수 (기존 unique(neis_code) 유지; null 은 unique 에 걸리지 않음)
alter table public.schools
  add constraint schools_neis_code_required
  check (is_demo or neis_code is not null);

-- 데모 학교는 neis_code 없음 (NEIS 목록으로 가입 선택될 수 없게)
alter table public.schools
  add constraint schools_demo_no_neis_code
  check (not is_demo or neis_code is null);

-- 데모 학교는 최대 1행
create unique index if not exists schools_single_demo_idx
  on public.schools ((true)) where is_demo;

-- 데모 학교 고정 id (RLS·check 제약·seed 에서 같은 값 사용)
create or replace function private.demo_school_id()
returns uuid
language sql
immutable
set search_path = ''
as $$
  select '00000000-d3e0-4000-8000-000000000001'::uuid
$$;

-- anon 도 RLS 정책 안에서 이 상수 함수를 평가해야 한다. 다른 private 함수는 anon 에게 실행 권한이 없다.
grant usage on schema private to anon;
revoke all on function private.demo_school_id() from public;
grant execute on function private.demo_school_id() to anon, authenticated, service_role;

-- ---------- 2. usage_logs: 데모 행 가짜 사용자 이름 ----------
alter table public.usage_logs alter column user_id drop not null;
alter table public.usage_logs
  add column if not exists demo_user_name text;

-- 실제 사용자 행: user_id 필수·demo_user_name 없음 / 데모 행: user_id 없음·demo_user_name 필수
alter table public.usage_logs
  add constraint usage_logs_user_or_demo_name
  check (
    (user_id is not null and demo_user_name is null)
    or (user_id is null and demo_user_name is not null and school_id = private.demo_school_id())
  );

-- ---------- 3. profiles: 데모 학교 소속 불가 ----------
alter table public.profiles
  add constraint profiles_not_demo_school
  check (school_id <> private.demo_school_id());

-- is_demo 가 true 인 학교(미래의 다른 id 포함)도 막는 트리거
create or replace function private.forbid_demo_school_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.schools s where s.id = new.school_id and s.is_demo) then
    raise exception 'demo school cannot have profiles' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.forbid_demo_school_profile() from public;

create or replace trigger profiles_forbid_demo_school
  before insert or update of school_id on public.profiles
  for each row execute function private.forbid_demo_school_profile();

-- ---------- 4. RLS ----------
-- 4-1. anon: 데모 학교 행만 select
create policy schools_select_demo_anon on public.schools
  for select to anon
  using (is_demo and id = (select private.demo_school_id()));

create policy cabinets_select_demo_anon on public.cabinets
  for select to anon
  using (school_id = (select private.demo_school_id()));

create policy cabinet_slots_select_demo_anon on public.cabinet_slots
  for select to anon
  using (school_id = (select private.demo_school_id()));

create policy reagents_select_demo_anon on public.reagents
  for select to anon
  using (school_id = (select private.demo_school_id()));

create policy usage_logs_select_demo_anon on public.usage_logs
  for select to anon
  using (school_id = (select private.demo_school_id()));

-- 4-2. authenticated 쓰기 정책: 데모 학교 행 제외 (profiles.school_id 가 데모일 수 없어 이미 불가하지만 DB 수준에서 명시)
alter policy cabinets_insert_staff on public.cabinets
  with check (school_id = (select private.current_school_id())
              and school_id <> (select private.demo_school_id())
              and (select private.is_staff()));
alter policy cabinets_update_staff on public.cabinets
  using (school_id = (select private.current_school_id())
         and school_id <> (select private.demo_school_id())
         and (select private.is_staff()))
  with check (school_id = (select private.current_school_id())
              and school_id <> (select private.demo_school_id())
              and (select private.is_staff()));
alter policy cabinets_delete_staff on public.cabinets
  using (school_id = (select private.current_school_id())
         and school_id <> (select private.demo_school_id())
         and (select private.is_staff()));

alter policy cabinet_slots_insert_staff on public.cabinet_slots
  with check (school_id = (select private.current_school_id())
              and school_id <> (select private.demo_school_id())
              and (select private.is_staff()));
alter policy cabinet_slots_update_staff on public.cabinet_slots
  using (school_id = (select private.current_school_id())
         and school_id <> (select private.demo_school_id())
         and (select private.is_staff()))
  with check (school_id = (select private.current_school_id())
              and school_id <> (select private.demo_school_id())
              and (select private.is_staff()));
alter policy cabinet_slots_delete_staff on public.cabinet_slots
  using (school_id = (select private.current_school_id())
         and school_id <> (select private.demo_school_id())
         and (select private.is_staff()));

alter policy reagents_insert_staff on public.reagents
  with check (school_id = (select private.current_school_id())
              and school_id <> (select private.demo_school_id())
              and (select private.is_staff()));
alter policy reagents_update_staff on public.reagents
  using (school_id = (select private.current_school_id())
         and school_id <> (select private.demo_school_id())
         and (select private.is_staff()))
  with check (school_id = (select private.current_school_id())
              and school_id <> (select private.demo_school_id())
              and (select private.is_staff()));
alter policy reagents_delete_staff on public.reagents
  using (school_id = (select private.current_school_id())
         and school_id <> (select private.demo_school_id())
         and (select private.is_staff()));

alter policy usage_logs_insert_self on public.usage_logs
  with check (school_id = (select private.current_school_id())
              and school_id <> (select private.demo_school_id())
              and user_id = (select auth.uid()));

-- ---------- 5. 함수 가드 ----------
-- record_usage: 데모 학교에는 기록·차감 불가 (anon 은 원래 실행 권한 없음)
create or replace function private.record_usage(p_reagent_id uuid, p_amount numeric)
returns public.usage_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_stock numeric;
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

  insert into public.usage_logs (school_id, reagent_id, user_id, amount)
  values (v_school, p_reagent_id, v_uid, p_amount)
  returning * into v_log;

  return v_log;
end;
$$;
revoke all on function private.record_usage(uuid, numeric) from public;
grant execute on function private.record_usage(uuid, numeric) to authenticated;

-- register_profile: 데모 학교를 만들거나 연결하지 않음
create or replace function public.register_profile(
  p_user_id uuid,
  p_neis_code text,
  p_office_code text,
  p_school_name text,
  p_sido text,
  p_region text,
  p_display_name text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_is_demo boolean;
  v_role text;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_profile public.profiles;
begin
  if p_user_id is null then
    raise exception 'user id required' using errcode = '22023';
  end if;
  if coalesce(btrim(p_neis_code), '') = '' then
    raise exception 'neis code required' using errcode = '22023';
  end if;
  if char_length(v_name) = 0 or char_length(v_name) > 40 then
    raise exception 'display name length' using errcode = '22023';
  end if;

  -- NEIS 코드가 있는 실제 학교만 upsert (is_demo 는 항상 false)
  insert into public.schools (neis_code, office_code, name, sido, region, is_demo)
  values (btrim(p_neis_code), p_office_code, p_school_name, p_sido, p_region, false)
  on conflict (neis_code) do update
    set office_code = excluded.office_code,
        name = excluded.name,
        sido = excluded.sido,
        region = excluded.region
    where not public.schools.is_demo;

  -- 같은 학교 가입을 직렬화 (첫 가입자 판정 경쟁 방지)
  select s.id, s.is_demo into v_school, v_is_demo
    from public.schools s
   where s.neis_code = btrim(p_neis_code)
   for update;

  if v_school is null or v_is_demo or v_school = private.demo_school_id() then
    raise exception 'demo school cannot be joined' using errcode = '42501';
  end if;

  select case
           when exists (select 1 from public.profiles p where p.school_id = v_school) then 'student'
           else 'admin'
         end
    into v_role;

  insert into public.profiles (user_id, school_id, role, display_name)
  values (p_user_id, v_school, v_role, v_name)
  returning * into v_profile;

  return v_profile;
end;
$$;
revoke all on function public.register_profile(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_profile(uuid, text, text, text, text, text, text) to service_role;

-- ---------- 6. 데모 전용 읽기 RPC (anon, 데모 학교 행만) ----------
-- SECURITY INVOKER: anon 의 RLS(데모 학교 select 정책)가 그대로 적용된다. 사용자 이름은 demo_user_name.
create or replace function public.demo_recent_usage(p_limit integer default 3)
returns table (
  id uuid,
  reagent_id uuid,
  reagent_name text,
  unit text,
  amount numeric,
  used_at timestamptz,
  user_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.id, u.reagent_id, r.name, r.unit, u.amount, u.used_at, u.demo_user_name
    from public.usage_logs u
    join public.reagents r on r.id = u.reagent_id and r.school_id = u.school_id
   where u.school_id = private.demo_school_id()
   order by u.used_at desc
   limit least(greatest(coalesce(p_limit, 3), 1), 50)
$$;
revoke all on function public.demo_recent_usage(integer) from public;
grant execute on function public.demo_recent_usage(integer) to anon, authenticated;

create or replace function public.demo_reagent_usage(p_reagent_id uuid, p_limit integer default 5)
returns table (
  id uuid,
  amount numeric,
  used_at timestamptz,
  user_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.id, u.amount, u.used_at, u.demo_user_name
    from public.usage_logs u
   where u.school_id = private.demo_school_id()
     and u.reagent_id = p_reagent_id
   order by u.used_at desc
   limit least(greatest(coalesce(p_limit, 5), 1), 50)
$$;
revoke all on function public.demo_reagent_usage(uuid, integer) from public;
grant execute on function public.demo_reagent_usage(uuid, integer) to anon, authenticated;

-- ---------- 7. seed (고정 id upsert, 재실행 안전) ----------
-- 학교
insert into public.schools (id, neis_code, office_code, name, sido, region, is_demo)
values ('00000000-d3e0-4000-8000-000000000001', null, 'DEMO', '데모 학교', '데모', '데모', true)
on conflict (id) do update
  set neis_code = null, office_code = 'DEMO', name = '데모 학교', sido = '데모', region = '데모', is_demo = true;

-- 시약장 1개 (양문형 4단)
insert into public.cabinets (id, school_id, label, door_type, shelves)
values ('00000000-d3e0-4000-8000-00000000c001', '00000000-d3e0-4000-8000-000000000001', '시약장 A', '양문형', 4)
on conflict (id) do update
  set school_id = excluded.school_id, label = excluded.label, door_type = excluded.door_type, shelves = excluded.shelves;

-- 칸 8개 (L1~L4, R1~R4) — storage_class ∈ design/rules.json cabinet.storage_classes
insert into public.cabinet_slots (id, school_id, cabinet_id, side, shelf, storage_class) values
  ('00000000-d3e0-4000-8000-000000005101', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000c001', 'L', 1, '산'),
  ('00000000-d3e0-4000-8000-000000005102', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000c001', 'L', 2, '염기'),
  ('00000000-d3e0-4000-8000-000000005103', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000c001', 'L', 3, '산화제'),
  ('00000000-d3e0-4000-8000-000000005104', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000c001', 'L', 4, '무기염'),
  ('00000000-d3e0-4000-8000-000000005105', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000c001', 'R', 1, '유기'),
  ('00000000-d3e0-4000-8000-000000005106', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000c001', 'R', 2, '인화성'),
  ('00000000-d3e0-4000-8000-000000005107', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000c001', 'R', 3, '독성'),
  ('00000000-d3e0-4000-8000-000000005108', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000c001', 'R', 4, '기타')
on conflict (id) do update
  set school_id = excluded.school_id, cabinet_id = excluded.cabinet_id,
      side = excluded.side, shelf = excluded.shelf, storage_class = excluded.storage_class;

-- 시약 18종 (재고 부족 2종: 질산·황산구리(II) 5수화물 — stock < min_stock)
insert into public.reagents (id, school_id, name, cas_no, unit, stock, min_stock, msds_url, slot_id, intake_date) values
  ('00000000-d3e0-4000-8000-00000000a001', '00000000-d3e0-4000-8000-000000000001', '염산 (35%)',            '7647-01-0', 'mL', 1500, 500,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005101', '2026-03-02'),
  ('00000000-d3e0-4000-8000-00000000a002', '00000000-d3e0-4000-8000-000000000001', '황산 (95%)',            '7664-93-9', 'mL', 800,  500,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005101', '2026-03-02'),
  ('00000000-d3e0-4000-8000-00000000a003', '00000000-d3e0-4000-8000-000000000001', '질산 (60%)',            '7697-37-2', 'mL', 300,  500,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005101', '2025-09-15'),
  ('00000000-d3e0-4000-8000-00000000a004', '00000000-d3e0-4000-8000-000000000001', '아세트산 (빙초산)',      '64-19-7',   'mL', 1000, 300,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005101', '2026-04-10'),
  ('00000000-d3e0-4000-8000-00000000a005', '00000000-d3e0-4000-8000-000000000001', '수산화나트륨',          '1310-73-2', 'g',  2000, 500,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005102', '2026-03-02'),
  ('00000000-d3e0-4000-8000-00000000a006', '00000000-d3e0-4000-8000-000000000001', '수산화칼륨',            '1310-58-3', 'g',  500,  200,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005102', '2026-05-20'),
  ('00000000-d3e0-4000-8000-00000000a007', '00000000-d3e0-4000-8000-000000000001', '암모니아수 (28%)',       '1336-21-6', 'mL', 1000, 300,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005102', '2026-04-10'),
  ('00000000-d3e0-4000-8000-00000000a008', '00000000-d3e0-4000-8000-000000000001', '과망간산칼륨',          '7722-64-7', 'g',  250,  100,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005103', '2026-02-18'),
  ('00000000-d3e0-4000-8000-00000000a009', '00000000-d3e0-4000-8000-000000000001', '과산화수소 (30%)',       '7722-84-1', 'mL', 500,  250,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005103', '2026-06-03'),
  ('00000000-d3e0-4000-8000-00000000a010', '00000000-d3e0-4000-8000-000000000001', '질산은',                '7761-88-8', 'g',  25,   10,   'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005103', '2025-11-05'),
  ('00000000-d3e0-4000-8000-00000000a011', '00000000-d3e0-4000-8000-000000000001', '염화나트륨',            '7647-14-5', 'g',  3000, 500,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005104', '2026-03-02'),
  ('00000000-d3e0-4000-8000-00000000a012', '00000000-d3e0-4000-8000-000000000001', '황산구리(II) 5수화물',  '7758-99-8', 'g',  150,  200,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005104', '2025-10-21'),
  ('00000000-d3e0-4000-8000-00000000a013', '00000000-d3e0-4000-8000-000000000001', '아이오딘화칼륨',        '7681-11-0', 'g',  200,  100,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005104', '2026-05-20'),
  ('00000000-d3e0-4000-8000-00000000a014', '00000000-d3e0-4000-8000-000000000001', '페놀프탈레인 용액 (1%)', '77-09-8',   'mL', 250,  100,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005105', '2026-04-10'),
  ('00000000-d3e0-4000-8000-00000000a015', '00000000-d3e0-4000-8000-000000000001', '에탄올 (95%)',           '64-17-5',   'mL', 4000, 1000, 'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005106', '2026-03-02'),
  ('00000000-d3e0-4000-8000-00000000a016', '00000000-d3e0-4000-8000-000000000001', '아세톤',                '67-64-1',   'mL', 2000, 500,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005106', '2026-06-03'),
  ('00000000-d3e0-4000-8000-00000000a017', '00000000-d3e0-4000-8000-000000000001', '메탄올',                '67-56-1',   'mL', 1000, 500,  'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005106', '2026-02-18'),
  ('00000000-d3e0-4000-8000-00000000a018', '00000000-d3e0-4000-8000-000000000001', '아이오딘 (요오드)',      '7553-56-2', 'g',  100,  50,   'https://msds.kosha.or.kr/', '00000000-d3e0-4000-8000-000000005107', '2025-12-12')
on conflict (id) do update
  set school_id = excluded.school_id, name = excluded.name, cas_no = excluded.cas_no, unit = excluded.unit,
      stock = excluded.stock, min_stock = excluded.min_stock, msds_url = excluded.msds_url,
      slot_id = excluded.slot_id, intake_date = excluded.intake_date;

-- 최근 사용 기록 10건 (가짜 사용자 이름, used_at 은 적용 시점 기준 상대값)
insert into public.usage_logs (id, school_id, reagent_id, user_id, demo_user_name, amount, used_at) values
  ('00000000-d3e0-4000-8000-00000000b001', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000a001', null, '학생 A', 50,  now() - interval '2 hours'),
  ('00000000-d3e0-4000-8000-00000000b002', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000a005', null, '교사 B', 120, now() - interval '5 hours'),
  ('00000000-d3e0-4000-8000-00000000b003', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000a015', null, '학생 C', 200, now() - interval '1 day 2 hours'),
  ('00000000-d3e0-4000-8000-00000000b004', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000a003', null, '교사 A', 30,  now() - interval '1 day 6 hours'),
  ('00000000-d3e0-4000-8000-00000000b005', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000a008', null, '학생 B', 5,   now() - interval '2 days 3 hours'),
  ('00000000-d3e0-4000-8000-00000000b006', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000a014', null, '학생 A', 10,  now() - interval '3 days 1 hour'),
  ('00000000-d3e0-4000-8000-00000000b007', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000a012', null, '교사 B', 25,  now() - interval '4 days 4 hours'),
  ('00000000-d3e0-4000-8000-00000000b008', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000a011', null, '학생 D', 100, now() - interval '5 days 2 hours'),
  ('00000000-d3e0-4000-8000-00000000b009', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000a016', null, '학생 C', 150, now() - interval '6 days 5 hours'),
  ('00000000-d3e0-4000-8000-00000000b010', '00000000-d3e0-4000-8000-000000000001', '00000000-d3e0-4000-8000-00000000a001', null, '교사 A', 40,  now() - interval '7 days 3 hours')
on conflict (id) do update
  set school_id = excluded.school_id, reagent_id = excluded.reagent_id, user_id = null,
      demo_user_name = excluded.demo_user_name, amount = excluded.amount, used_at = excluded.used_at;
