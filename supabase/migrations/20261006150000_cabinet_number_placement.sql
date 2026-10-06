-- 시약장 번호 · 시약 칸 배치 · 재주문 기준 직접 입력 (화면 3·11) — harness/d7-data.md §14 (2026-10-06 결정, design/rules.json 1.15)
--
-- 1) 시약장 번호
--    cabinets.number integer: 학교 안 고정 번호 1, 2, 3 … (이름과 별개, 바뀌지 않음). (school_id, number) unique.
--    schools.cabinet_seq integer: 그 학교에서 지금까지 준 마지막 번호. 삭제된 번호는 다시 쓰지 않는다.
--    backfill: 기존 시약장을 학교별 created_at(같으면 id) 순으로 1부터, 각 학교 cabinet_seq = 최대 번호.
--    BEFORE INSERT 트리거(private.assign_cabinet_number): number 가 비어 있으면 cabinet_seq 를 1 올려 채우고,
--      값을 준 경우(seed·관리 작업)에는 cabinet_seq 를 그 값 이상으로 맞춘다 — 어느 경로로 넣어도 번호가 겹치지 않는다.
--    BEFORE UPDATE 트리거(같은 함수): 이미 정해진 number·school_id 는 바꿀 수 없다(누구든 — 함수 안에서도).
--    add_cabinet() 본문 교체(시그니처·권한 그대로): cabinet_seq + 1 을 번호로, 기본 이름 "{number}번 시약장".
--      같은 이름(대소문자·공백 무시)이 이미 있으면 이름의 숫자만 올려 피한다(number 는 그대로). 학교당 20개(개수) 유지.
-- 2) place_reagent(p_reagent_id uuid, p_slot_id uuid null 허용) → jsonb
--      {reagent_id, slot_id, previous_slot_id, warning: 'none' | 'mismatch' | 'incompatible'}
--    교사·admin, 자기 학교 시약·자기 학교 칸만, p_slot_id null = 빼기("칸 없음"). 데모 학교·학생·anon 거부.
--    학교 단위 직렬화 = private.cabinet_staff_school() (schools 행 FOR NO KEY UPDATE — 시약장 저장·삭제와 같은 잠금).
--    경고는 저장을 막지 않는다(d7 §14 경고만). 판정은 lib/cabinet-rules.ts placementWarnings 와 같은 규칙:
--      ┌ 시약 분류(reagents.storage_class)가 null·8종 밖 ................................ none
--      ├ 시약 분류와 (칸 분류 ∪ 같은 칸 다른 시약 분류) 사이에 incompatible 조합 ......... incompatible
--      │   incompatible = design/rules.json cabinet.incompatible
--      │     (산,염기) (산화제,인화성) (산화제,유기) (산,인화성) (독성,산) — 방향 무관
--      ├ 칸 분류가 1개 이상인데 시약 분류가 그 안에 없음 .................................. mismatch
--      └ 그 밖(미지정 칸 포함) / 빼기(p_slot_id null) ...................................... none
--    앱 표시는 클라이언트 함수가 하고, 이 값은 참고용이다. 규칙을 바꾸면 두 곳을 같이 바꾼다.
-- 3) set_reorder_threshold(p_reagent_id uuid, p_min_stock numeric) → jsonb {reagent_id, min_stock, previous_min_stock}
--    교사·admin, 자기 학교, 데모 거부. 0 이상 1,000,000 이하(검증은 범위만 — 소수 자리는 앱이 3자리로 정리).
--    그대로 덮어쓴다(화면 5 의 "더 큰 값 유지"와 다름). reorder_per_group·reorder_groups = null.
--    low_stock_since 는 reagents_low_stock_since 트리거(20261005190000)가 맞춘다.
-- 4) reagents.slot_id 직접 쓰기 차단 (d7 §14 "함수 경유"): BEFORE INSERT OR UPDATE 트리거
--    private.guard_reagent_direct_change — API 역할(authenticated·anon)이 직접 쓴 문장에서
--    slot_id 를 바꾸거나(update) 값을 넣으면(insert) 42501. SECURITY DEFINER 함수(place_reagent·save_cabinet_layout·
--    delete_cabinet) 안에서는 current_user 가 함수 소유자라 통과한다 (profiles_guard_direct_change 와 같은 방식).
--    reagents_update_staff 정책은 그대로(이름·재고·min_stock 등 다른 열의 기존 경로 유지 — min_stock 은 막지 않는다).
--
-- 오류 형태 (errcode · message):
--   42501  not authenticated / no profile / demo school is read-only / staff only
--          / reagent placement only through place_reagent (트리거)
--          (anon 은 함수 실행 권한이 없어 PostgREST 가 42501 permission denied 로 답한다)
--   P0002  reagent not found / slot not found (다른 학교·없는 id — 존재 여부 비노출)
--   22023  invalid min_stock (null·음수·1,000,000 초과·NaN)
--   23514  cabinet limit (detail = '20')
--   55000  cabinet number is fixed (트리거: number·school_id 변경)
--
-- 이 파일의 구문: add column if not exists, update(backfill — number 가 빈 행만), alter column set not null,
--   조건부 add constraint, create or replace function/trigger, 함수 실행 권한 revoke·grant.
--   drop·delete·truncate 없음. 기존 행은 지우지 않는다.
-- revoke 가 필요한 이유: PostgreSQL 은 새 함수의 실행 권한을 PUBLIC 에 기본으로 준다 — 회수 구문 없이는
--   anon 실행 불가·트리거 함수 직접 호출 불가 상태를 만들 수 없다 (20261005233000 과 같은 이유).
-- 한 번에 통째로 실행한다(한 트랜잭션). 다시 실행해도 같은 결과가 된다.

-- ---------- 1. 시약장 번호 ----------
alter table public.schools
  add column if not exists cabinet_seq integer not null default 0;

alter table public.cabinets
  add column if not exists number integer;

-- backfill: 번호가 빈 시약장만, 학교별 (이미 있는 최대 번호) + created_at·id 순서
update public.cabinets c
   set number = q.n
  from (
    select x.id,
           coalesce((select max(y.number) from public.cabinets y where y.school_id = x.school_id), 0)
             + row_number() over (partition by x.school_id order by x.created_at, x.id) as n
      from public.cabinets x
     where x.number is null
  ) q
 where c.id = q.id
   and c.number is null;

-- 학교별 마지막 번호 = 최대 번호 (이미 더 크면 그대로)
update public.schools s
   set cabinet_seq = m.max_n
  from (
    select c.school_id, max(c.number) as max_n
      from public.cabinets c
     group by c.school_id
  ) m
 where s.id = m.school_id
   and s.cabinet_seq < m.max_n;

alter table public.cabinets alter column number set not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint c
     where c.conrelid = 'public.cabinets'::regclass
       and c.conname = 'cabinets_school_number_key'
  ) then
    alter table public.cabinets
      add constraint cabinets_school_number_key unique (school_id, number);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
     where c.conrelid = 'public.cabinets'::regclass
       and c.conname = 'cabinets_number_check'
  ) then
    alter table public.cabinets
      add constraint cabinets_number_check check (number >= 1);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
     where c.conrelid = 'public.schools'::regclass
       and c.conname = 'schools_cabinet_seq_check'
  ) then
    alter table public.schools
      add constraint schools_cabinet_seq_check check (cabinet_seq >= 0);
  end if;
end;
$$;

-- 번호 채우기(insert) · 고정(update). 정의자 권한: schools 행을 고칠 수 있어야 한다 (API 역할에는 schools update 권한 없음).
create or replace function private.assign_cabinet_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if tg_op = 'INSERT' then
    if new.number is null then
      update public.schools s
         set cabinet_seq = s.cabinet_seq + 1
       where s.id = new.school_id
      returning s.cabinet_seq into v_n;
      new.number := v_n; -- 학교가 없으면 null → not null 위반 (FK 보다 먼저 알려 줌)
    else
      update public.schools s
         set cabinet_seq = new.number
       where s.id = new.school_id
         and s.cabinet_seq < new.number;
    end if;
    return new;
  end if;

  -- UPDATE: 정해진 번호·학교는 바꾸지 않는다
  if (old.number is not null and new.number is distinct from old.number)
     or new.school_id is distinct from old.school_id then
    raise exception 'cabinet number is fixed' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.assign_cabinet_number() from public, anon, authenticated;

create or replace trigger cabinets_assign_number
  before insert or update on public.cabinets
  for each row execute function private.assign_cabinet_number();

-- add_cabinet: 시그니처·권한 그대로, 본문만 교체
create or replace function private.add_cabinet()
returns public.cabinets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_count integer;
  v_number integer;
  v_n integer;
  v_label text;
  v_cab public.cabinets;
begin
  -- 호출자 확인 + 학교 행 잠금 (같은 학교의 추가가 동시에 와도 번호가 겹치지 않는다)
  v_school := private.cabinet_staff_school();

  select count(*)::integer into v_count
    from public.cabinets c
   where c.school_id = v_school;

  if v_count >= 20 then
    raise exception 'cabinet limit' using errcode = '23514', detail = '20';
  end if;

  -- 번호 = 학교의 마지막 번호 + 1 (삭제된 번호는 다시 쓰지 않는다)
  update public.schools s
     set cabinet_seq = s.cabinet_seq + 1
   where s.id = v_school
  returning s.cabinet_seq into v_number;

  -- 기본 이름 "{number}번 시약장". 같은 이름이 있으면 이름의 숫자만 올린다 (number 는 그대로)
  v_n := v_number;
  loop
    v_label := v_n::text || '번 시약장';
    exit when not exists (
      select 1 from public.cabinets c
       where c.school_id = v_school
         and lower(regexp_replace(c.label, '\s+', '', 'g')) = lower(regexp_replace(v_label, '\s+', '', 'g'))
    );
    v_n := v_n + 1;
  end loop;

  insert into public.cabinets (school_id, label, door_type, shelves, number)
  values (v_school, v_label, '양문형', 4, v_number)
  returning * into v_cab;

  -- 칸 8개 (좌·우 × 1~4단), 모두 미지정
  insert into public.cabinet_slots (school_id, cabinet_id, side, shelf, storage_classes)
  select v_school, v_cab.id, sd.side, sh.shelf::smallint, '{}'::text[]
    from unnest(array['L', 'R']) as sd(side)
   cross join generate_series(1, 4) as sh(shelf);

  return v_cab;
end;
$$;

-- ---------- 2. reagents.slot_id 직접 쓰기 차단 ----------
create or replace function private.guard_reagent_direct_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (tg_op = 'INSERT' and new.slot_id is not null)
       or (tg_op = 'UPDATE' and new.slot_id is distinct from old.slot_id) then
      raise exception 'reagent placement only through place_reagent' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_reagent_direct_change() from public, anon, authenticated;

create or replace trigger reagents_guard_direct_change
  before insert or update on public.reagents
  for each row execute function private.guard_reagent_direct_change();

-- ---------- 3. place_reagent ----------
create or replace function private.place_reagent(p_reagent_id uuid, p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- design/rules.json cabinet.storage_classes · cabinet.incompatible (lib/cabinet-rules.ts 와 같은 표)
  v_all constant text[] := array['유기', '산', '염기', '산화제', '인화성', '무기염', '독성', '기타'];
  v_pairs constant text[] := array['산', '염기', '산화제', '인화성', '산화제', '유기', '산', '인화성', '독성', '산'];
  v_school uuid;
  v_reagent public.reagents;
  v_slot_classes text[];
  v_around text[];
  v_cls text;
  v_warning text := 'none';
  i integer;
begin
  -- 호출자 확인(교사·admin, 데모 아님) + 학교 행 잠금 (시약장 저장·삭제와 순서를 맞춘다)
  v_school := private.cabinet_staff_school();

  select r.* into v_reagent
    from public.reagents r
   where r.id = p_reagent_id and r.school_id = v_school
     for update;
  if not found then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;

  if p_slot_id is not null then
    -- 자기 학교 시약장의 칸만 (다른 학교·없는 id 는 같은 응답)
    select s.storage_classes into v_slot_classes
      from public.cabinet_slots s
      join public.cabinets c on c.id = s.cabinet_id and c.school_id = v_school
     where s.id = p_slot_id and s.school_id = v_school;
    if not found then
      raise exception 'slot not found' using errcode = 'P0002';
    end if;
  end if;

  update public.reagents r
     set slot_id = p_slot_id
   where r.id = v_reagent.id and r.school_id = v_school;

  -- 경고 (참고용 — 저장은 막지 않는다)
  v_cls := v_reagent.storage_class;
  if p_slot_id is not null and v_cls is not null and v_cls = any (v_all) then
    v_slot_classes := coalesce(v_slot_classes, '{}'::text[]);
    select v_slot_classes || coalesce(array_agg(distinct r.storage_class), '{}'::text[])
      into v_around
      from public.reagents r
     where r.school_id = v_school
       and r.slot_id = p_slot_id
       and r.id <> v_reagent.id
       and r.storage_class is not null;

    for i in 1 .. array_length(v_pairs, 1) / 2 loop
      if (v_pairs[2 * i - 1] = v_cls and v_pairs[2 * i] = any (v_around))
         or (v_pairs[2 * i] = v_cls and v_pairs[2 * i - 1] = any (v_around)) then
        v_warning := 'incompatible';
        exit;
      end if;
    end loop;

    if v_warning = 'none'
       and cardinality(array(select x from unnest(v_slot_classes) x where x = any (v_all))) > 0
       and not (v_cls = any (v_slot_classes)) then
      v_warning := 'mismatch';
    end if;
  end if;

  return jsonb_build_object(
    'reagent_id', v_reagent.id,
    'slot_id', p_slot_id,
    'previous_slot_id', v_reagent.slot_id,
    'warning', v_warning
  );
end;
$$;

revoke all on function private.place_reagent(uuid, uuid) from public;
grant execute on function private.place_reagent(uuid, uuid) to authenticated;

create or replace function public.place_reagent(p_reagent_id uuid, p_slot_id uuid default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.place_reagent(p_reagent_id, p_slot_id)
$$;

revoke all on function public.place_reagent(uuid, uuid) from public, anon;
grant execute on function public.place_reagent(uuid, uuid) to authenticated;

-- ---------- 4. set_reorder_threshold ----------
create or replace function private.set_reorder_threshold(p_reagent_id uuid, p_min_stock numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
  v_prev numeric;
  v_id uuid;
begin
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

  -- 0 이상 1,000,000 이하 (NaN 은 PostgreSQL 에서 어떤 수보다 커서 여기서 걸린다)
  if p_min_stock is null or p_min_stock < 0 or p_min_stock > 1000000 then
    raise exception 'invalid min_stock' using errcode = '22023';
  end if;

  select r.id, r.min_stock into v_id, v_prev
    from public.reagents r
   where r.id = p_reagent_id and r.school_id = v_school
     for update;
  if not found then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;

  -- 그대로 덮어쓴다 (사용자가 직접 정한 값). 근거 열은 비운다
  update public.reagents r
     set min_stock = p_min_stock,
         reorder_per_group = null,
         reorder_groups = null
   where r.id = v_id and r.school_id = v_school;

  return jsonb_build_object(
    'reagent_id', v_id,
    'min_stock', p_min_stock,
    'previous_min_stock', v_prev
  );
end;
$$;

revoke all on function private.set_reorder_threshold(uuid, numeric) from public;
grant execute on function private.set_reorder_threshold(uuid, numeric) to authenticated;

create or replace function public.set_reorder_threshold(p_reagent_id uuid, p_min_stock numeric)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_reorder_threshold(p_reagent_id, p_min_stock)
$$;

revoke all on function public.set_reorder_threshold(uuid, numeric) from public, anon;
grant execute on function public.set_reorder_threshold(uuid, numeric) to authenticated;
