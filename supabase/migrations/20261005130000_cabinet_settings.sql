-- 시약장 설정 (화면 11) — harness/d7-data.md §9 (2026-10-05 결정)
--
-- 1) cabinet_slots.storage_classes text[] (0개 = 미지정) 추가. 기존 storage_class 는 남겨 두고(열 삭제 없음)
--    null 을 허용해 "첫 분류(규칙 순서) 또는 null" 로 자동 유지한다 — 기존 조회 코드·테스트 호환.
--    두 열은 BEFORE INSERT/UPDATE 트리거(private.sync_cabinet_slot_classes)가 맞춘다:
--      storage_classes 를 쓰면 → 규칙 순서로 정렬·중복 제거, storage_class = 첫 분류(없으면 null)
--      storage_class 만 쓰면(예전 방식) → storage_classes = {그 값} (null 이면 {})
-- 2) 함수 4개 (public = SECURITY INVOKER 래퍼, private = SECURITY DEFINER 본체, search_path 고정):
--      add_cabinet()                                              → cabinets 행
--      rename_cabinet(p_cabinet_id, p_label)                      → cabinets 행
--      save_cabinet_layout(p_cabinet_id, p_door_type, p_shelves, p_slots) → jsonb {cabinet, slots[], unplaced_count}
--      delete_cabinet(p_cabinet_id)                               → jsonb {cabinet, unplaced_count}
--    학교는 호출자 profiles 에서만 정한다. teacher·admin 만. 데모 학교·학생·anon·다른 학교 거부.
--    같은 학교의 시약장 작업은 schools 행 잠금(FOR NO KEY UPDATE)으로 직렬화한다 (사용자 관리 함수와 같은 방식).
-- 3) 칸 행: 시약장의 모든 칸(문 형태 × 단 수)에 행을 둔다. add_cabinet 이 8칸을 미지정으로 만들고,
--    save_cabinet_layout 이 격자에 맞춰 없는 칸은 만들고 사라지는 칸은 지운다.
--    (이 마이그레이션 이전에 만든 시약장은 일부 칸만 행이 있을 수 있다 — 조회 코드는 없는 칸을 미지정으로 본다.
--     한 번 저장하면 전부 채워진다.)
-- 4) 사라지는 칸·삭제되는 시약장의 칸을 가리키던 reagents.slot_id 는 null 로 ("칸 없음"). 시약 행·재고는 그대로.
-- 5) cabinets·cabinet_slots 직접 쓰기 차단: 기존 *_insert_staff·*_update_staff·*_delete_staff 정책을 false 로 닫고
--    anon·authenticated 의 insert·update·delete·truncate 테이블 권한도 회수한다. select 정책·권한은 그대로
--    (같은 학교 읽기, anon 의 데모 학교 읽기). reagents 정책은 건드리지 않는다.
--
-- 오류 형태 (errcode · message · detail):
--   42501  not authenticated / no profile / demo school is read-only / staff only
--   P0002  cabinet not found (다른 학교 시약장 포함 — 존재 여부 비노출)
--   22023  label length / invalid door type / invalid shelves / invalid slots(모양이 틀림)
--          / invalid slot(detail = 칸들 "R4,L5") / duplicate slot(detail = 칸들)
--          / invalid class(detail = 분류들) / duplicate class
--   23505  duplicate label (같은 학교에 같은 이름 — 대소문자·공백 무시)
--   23514  cabinet limit (detail = '20') / invalid storage class (트리거: 8종 밖의 분류)
--
-- 이 파일에는 drop 구문이 없다. 한 번에 통째로 실행한다(여러 문장을 한 번에 보내면 한 트랜잭션 — 중간에 실패하면 전부 취소).
-- 다시 실행해도 같은 결과가 된다 (add column if not exists · create or replace · alter policy · 조건부 제약 추가).
-- 기존 행은 지우지 않는다 (함수 본문의 delete 는 함수가 호출될 때만 실행된다).

-- ---------- 1. cabinet_slots.storage_classes ----------
alter table public.cabinet_slots
  add column if not exists storage_classes text[] not null default '{}'::text[];

-- 예전 단일 값 열: 미지정 칸은 null (기존 check 는 null 을 통과시킨다)
alter table public.cabinet_slots alter column storage_class drop not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint c
     where c.conrelid = 'public.cabinet_slots'::regclass
       and c.conname = 'cabinet_slots_storage_classes_check'
  ) then
    alter table public.cabinet_slots
      add constraint cabinet_slots_storage_classes_check
      check (
        storage_classes <@ array['유기', '산', '염기', '산화제', '인화성', '무기염', '독성', '기타']::text[]
        and cardinality(storage_classes) <= 8
      );
  end if;
end;
$$;

-- 기존 행: 단일 분류를 새 열로 옮긴다 (이미 옮긴 행·미지정 행은 건드리지 않는다)
update public.cabinet_slots
   set storage_classes = array[storage_class]
 where storage_class is not null
   and storage_classes = '{}'::text[];

-- 두 열 맞추기 + 정렬·중복 제거 (정의자 권한 아님 — 값만 고친다)
create or replace function private.sync_cabinet_slot_classes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_all constant text[] := array['유기', '산', '염기', '산화제', '인화성', '무기염', '독성', '기타'];
  v_sorted text[];
begin
  if new.storage_classes is null then
    new.storage_classes := '{}'::text[];
  end if;

  if tg_op = 'INSERT' then
    -- 예전 방식 insert (storage_class 만 준 경우)
    if cardinality(new.storage_classes) = 0 and new.storage_class is not null then
      new.storage_classes := array[new.storage_class];
    end if;
  elsif new.storage_classes is not distinct from old.storage_classes
        and new.storage_class is distinct from old.storage_class then
    -- 예전 방식 update (storage_class 만 바꾼 경우)
    new.storage_classes := case
      when new.storage_class is null then '{}'::text[]
      else array[new.storage_class]
    end;
  end if;

  if not (new.storage_classes <@ v_all) then
    raise exception 'invalid storage class' using errcode = '23514';
  end if;

  -- 규칙 순서(유기·산·염기·…)로, 중복 없이
  select coalesce(array_agg(t.c order by t.o), '{}'::text[])
    into v_sorted
    from unnest(v_all) with ordinality as t(c, o)
   where t.c = any (new.storage_classes);

  new.storage_classes := v_sorted;
  new.storage_class := v_sorted[1];
  return new;
end;
$$;
revoke all on function private.sync_cabinet_slot_classes() from public;

create or replace trigger cabinet_slots_sync_classes
  before insert or update on public.cabinet_slots
  for each row execute function private.sync_cabinet_slot_classes();

-- ---------- 2. 공통: 호출자 학교 확인 + 학교 단위 직렬화 + teacher·admin 확인 ----------
-- 다른 private 본체 안에서만 부른다 (API 역할에는 실행 권한을 주지 않는다).
create or replace function private.cabinet_staff_school()
returns uuid
language plpgsql
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
  select p.school_id into v_school from public.profiles p where p.user_id = v_uid;
  if v_school is null then
    raise exception 'no profile' using errcode = '42501';
  end if;
  if v_school = private.demo_school_id()
     or exists (select 1 from public.schools s where s.id = v_school and s.is_demo) then
    raise exception 'demo school is read-only' using errcode = '42501';
  end if;

  -- 같은 학교의 시약장 추가·이름 변경·저장·삭제를 직렬화한 뒤 호출자 역할을 다시 읽는다
  perform 1 from public.schools s where s.id = v_school for no key update;
  select p.role into v_role
    from public.profiles p where p.user_id = v_uid and p.school_id = v_school;
  if v_role is null or v_role not in ('teacher', 'admin') then
    raise exception 'staff only' using errcode = '42501';
  end if;

  return v_school;
end;
$$;
revoke all on function private.cabinet_staff_school() from public, anon, authenticated;

-- ---------- 3. add_cabinet ----------
create or replace function private.add_cabinet()
returns public.cabinets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_count integer;
  v_max integer;
  v_n integer;
  v_label text;
  v_cab public.cabinets;
begin
  v_school := private.cabinet_staff_school();

  select count(*)::integer,
         coalesce(max((substring(c.label from '^(\d{1,9})번 시약장$'))::integer), 0)
    into v_count, v_max
    from public.cabinets c
   where c.school_id = v_school;

  if v_count >= 20 then
    raise exception 'cabinet limit' using errcode = '23514', detail = '20';
  end if;

  -- 다음 번호 = (지금까지의 최대 번호, 현재 개수) 중 큰 값 + 1. 그래도 같은 이름이 있으면 다음 번호로.
  v_n := greatest(v_count, v_max) + 1;
  loop
    v_label := v_n::text || '번 시약장';
    exit when not exists (
      select 1 from public.cabinets c
       where c.school_id = v_school
         and lower(regexp_replace(c.label, '\s+', '', 'g')) = lower(regexp_replace(v_label, '\s+', '', 'g'))
    );
    v_n := v_n + 1;
  end loop;

  insert into public.cabinets (school_id, label, door_type, shelves)
  values (v_school, v_label, '양문형', 4)
  returning * into v_cab;

  -- 칸 8개 (좌·우 × 1~4단), 모두 미지정
  insert into public.cabinet_slots (school_id, cabinet_id, side, shelf, storage_classes)
  select v_school, v_cab.id, sd.side, sh.shelf::smallint, '{}'::text[]
    from unnest(array['L', 'R']) as sd(side)
   cross join generate_series(1, 4) as sh(shelf);

  return v_cab;
end;
$$;

revoke all on function private.add_cabinet() from public;
grant execute on function private.add_cabinet() to authenticated;

create or replace function public.add_cabinet()
returns public.cabinets
language sql
security invoker
set search_path = ''
as $$
  select * from private.add_cabinet()
$$;

revoke all on function public.add_cabinet() from public, anon;
grant execute on function public.add_cabinet() to authenticated;

-- ---------- 4. rename_cabinet ----------
create or replace function private.rename_cabinet(p_cabinet_id uuid, p_label text)
returns public.cabinets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_label text := regexp_replace(coalesce(p_label, ''), '^\s+|\s+$', '', 'g');
  v_cab public.cabinets;
begin
  v_school := private.cabinet_staff_school();

  -- 다른 학교 시약장은 자기 학교 조건에 걸려 not found (존재 여부 비노출)
  select c.* into v_cab
    from public.cabinets c
   where c.id = p_cabinet_id and c.school_id = v_school
     for update;
  if not found then
    raise exception 'cabinet not found' using errcode = 'P0002';
  end if;

  if char_length(v_label) = 0 or char_length(v_label) > 20 then
    raise exception 'label length' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.cabinets c
     where c.school_id = v_school
       and c.id <> v_cab.id
       and lower(regexp_replace(c.label, '\s+', '', 'g')) = lower(regexp_replace(v_label, '\s+', '', 'g'))
  ) then
    raise exception 'duplicate label' using errcode = '23505';
  end if;

  update public.cabinets c
     set label = v_label
   where c.id = v_cab.id and c.school_id = v_school
  returning c.* into v_cab;

  return v_cab;
end;
$$;

revoke all on function private.rename_cabinet(uuid, text) from public;
grant execute on function private.rename_cabinet(uuid, text) to authenticated;

create or replace function public.rename_cabinet(p_cabinet_id uuid, p_label text)
returns public.cabinets
language sql
security invoker
set search_path = ''
as $$
  select * from private.rename_cabinet(p_cabinet_id, p_label)
$$;

revoke all on function public.rename_cabinet(uuid, text) from public, anon;
grant execute on function public.rename_cabinet(uuid, text) to authenticated;

-- ---------- 5. save_cabinet_layout ----------
-- p_slots = [{"side":"L"|"R", "shelf":1..p_shelves, "classes":["산","염기",…]}, …]
-- 단문형은 side 'L' 만. 목록에 없는 칸은 미지정({})으로 저장한다.
create or replace function private.save_cabinet_layout(
  p_cabinet_id uuid,
  p_door_type text,
  p_shelves integer,
  p_slots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_all constant text[] := array['유기', '산', '염기', '산화제', '인화성', '무기염', '독성', '기타'];
  v_school uuid;
  v_cab public.cabinets;
  v_sides text[];
  v_slots jsonb := coalesce(p_slots, '[]'::jsonb);
  v_bad text;
  v_unplaced integer := 0;
  v_result_slots jsonb;
begin
  v_school := private.cabinet_staff_school();

  select c.* into v_cab
    from public.cabinets c
   where c.id = p_cabinet_id and c.school_id = v_school
     for update;
  if not found then
    raise exception 'cabinet not found' using errcode = 'P0002';
  end if;

  if p_door_type is null or p_door_type not in ('양문형', '단문형') then
    raise exception 'invalid door type' using errcode = '22023';
  end if;
  if p_shelves is null or p_shelves not in (3, 4) then
    raise exception 'invalid shelves' using errcode = '22023';
  end if;
  v_sides := case when p_door_type = '단문형' then array['L'] else array['L', 'R'] end;

  -- 모양: 배열, 원소는 {side: 문자열, shelf: 숫자, classes: 문자열 배열}
  if jsonb_typeof(v_slots) <> 'array' then
    raise exception 'invalid slots' using errcode = '22023';
  end if;
  if jsonb_array_length(v_slots) > 8 then
    raise exception 'invalid slots' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(v_slots) as e(x)
     where jsonb_typeof(e.x) <> 'object'
        or jsonb_typeof(e.x -> 'side') is distinct from 'string'
        or jsonb_typeof(e.x -> 'shelf') is distinct from 'number'
        or jsonb_typeof(e.x -> 'classes') is distinct from 'array'
        or exists (
             select 1
               from jsonb_array_elements(
                      case when jsonb_typeof(e.x -> 'classes') = 'array' then e.x -> 'classes' else '[]'::jsonb end
                    ) as c(v)
              where jsonb_typeof(c.v) <> 'string'
           )
  ) then
    raise exception 'invalid slots' using errcode = '22023';
  end if;

  -- 이 문 형태·단 수에 없는 칸
  select string_agg(q.side || q.shelf::text, ',' order by q.o)
    into v_bad
    from (
      select e.x ->> 'side' as side, (e.x ->> 'shelf')::numeric as shelf, e.o
        from jsonb_array_elements(v_slots) with ordinality as e(x, o)
    ) q
   where not (q.side = any (v_sides))
      or q.shelf <> trunc(q.shelf)
      or q.shelf < 1
      or q.shelf > p_shelves;
  if v_bad is not null then
    raise exception 'invalid slot' using errcode = '22023', detail = v_bad;
  end if;

  -- 같은 칸이 두 번
  select string_agg(d.k, ',' order by d.k)
    into v_bad
    from (
      select q.side || trunc(q.shelf)::text as k
        from (
          select e.x ->> 'side' as side, (e.x ->> 'shelf')::numeric as shelf
            from jsonb_array_elements(v_slots) as e(x)
        ) q
       group by 1
      having count(*) > 1
    ) d;
  if v_bad is not null then
    raise exception 'duplicate slot' using errcode = '22023', detail = v_bad;
  end if;

  -- 8종 밖의 분류
  select string_agg(distinct c.v, ',')
    into v_bad
    from jsonb_array_elements(v_slots) as e(x),
         jsonb_array_elements_text(e.x -> 'classes') as c(v)
   where not (c.v = any (v_all));
  if v_bad is not null then
    raise exception 'invalid class' using errcode = '22023', detail = v_bad;
  end if;

  -- 한 칸에 같은 분류가 두 번
  if exists (
    select 1
      from jsonb_array_elements(v_slots) with ordinality as e(x, o),
           jsonb_array_elements_text(e.x -> 'classes') as c(v)
     group by e.o, c.v
    having count(*) > 1
  ) then
    raise exception 'duplicate class' using errcode = '22023';
  end if;

  -- 이 시약장의 칸을 잠근다 (동시에 시약이 이 칸에 배치되는 경우와 순서를 맞춘다)
  perform 1 from public.cabinet_slots s
    where s.cabinet_id = v_cab.id and s.school_id = v_school
      for update;

  -- 사라지는 칸에 있던 시약은 "칸 없음"으로 (시약 행·재고는 그대로)
  update public.reagents r
     set slot_id = null
   where r.school_id = v_school
     and r.slot_id in (
           select s.id
             from public.cabinet_slots s
            where s.cabinet_id = v_cab.id
              and s.school_id = v_school
              and not (s.side = any (v_sides) and s.shelf between 1 and p_shelves)
         );
  get diagnostics v_unplaced = row_count;

  -- 사라지는 칸 삭제
  delete from public.cabinet_slots s
   where s.cabinet_id = v_cab.id
     and s.school_id = v_school
     and not (s.side = any (v_sides) and s.shelf between 1 and p_shelves);

  update public.cabinets c
     set door_type = p_door_type, shelves = p_shelves
   where c.id = v_cab.id and c.school_id = v_school
  returning c.* into v_cab;

  -- 격자의 모든 칸을 저장 (목록에 없는 칸은 미지정). 정렬·예전 열 맞추기는 트리거가 한다.
  insert into public.cabinet_slots (school_id, cabinet_id, side, shelf, storage_classes)
  select v_school, v_cab.id, k.side, k.shelf::smallint,
         coalesce(
           (select array_agg(c.v)
              from jsonb_array_elements(v_slots) as e(x),
                   jsonb_array_elements_text(e.x -> 'classes') as c(v)
             where e.x ->> 'side' = k.side
               and (e.x ->> 'shelf')::numeric = k.shelf),
           '{}'::text[])
    from (
      select sd.side, sh.shelf
        from unnest(v_sides) as sd(side)
       cross join generate_series(1, p_shelves) as sh(shelf)
    ) k
  on conflict (cabinet_id, side, shelf)
  do update set storage_classes = excluded.storage_classes;

  select coalesce(
           jsonb_agg(
             jsonb_build_object('id', s.id, 'side', s.side, 'shelf', s.shelf, 'classes', to_jsonb(s.storage_classes))
             order by s.shelf, s.side),
           '[]'::jsonb)
    into v_result_slots
    from public.cabinet_slots s
   where s.cabinet_id = v_cab.id and s.school_id = v_school;

  return jsonb_build_object(
    'cabinet', to_jsonb(v_cab),
    'slots', v_result_slots,
    'unplaced_count', v_unplaced
  );
end;
$$;

revoke all on function private.save_cabinet_layout(uuid, text, integer, jsonb) from public;
grant execute on function private.save_cabinet_layout(uuid, text, integer, jsonb) to authenticated;

create or replace function public.save_cabinet_layout(
  p_cabinet_id uuid,
  p_door_type text,
  p_shelves integer,
  p_slots jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.save_cabinet_layout(p_cabinet_id, p_door_type, p_shelves, p_slots)
$$;

revoke all on function public.save_cabinet_layout(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.save_cabinet_layout(uuid, text, integer, jsonb) to authenticated;

-- ---------- 6. delete_cabinet ----------
create or replace function private.delete_cabinet(p_cabinet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_cab public.cabinets;
  v_unplaced integer := 0;
begin
  v_school := private.cabinet_staff_school();

  select c.* into v_cab
    from public.cabinets c
   where c.id = p_cabinet_id and c.school_id = v_school
     for update;
  if not found then
    raise exception 'cabinet not found' using errcode = 'P0002';
  end if;

  perform 1 from public.cabinet_slots s
    where s.cabinet_id = v_cab.id and s.school_id = v_school
      for update;

  -- 배치된 시약은 "칸 없음"으로 (시약 행·재고는 그대로)
  update public.reagents r
     set slot_id = null
   where r.school_id = v_school
     and r.slot_id in (
           select s.id
             from public.cabinet_slots s
            where s.cabinet_id = v_cab.id and s.school_id = v_school
         );
  get diagnostics v_unplaced = row_count;

  delete from public.cabinet_slots s
   where s.cabinet_id = v_cab.id and s.school_id = v_school;

  delete from public.cabinets c
   where c.id = v_cab.id and c.school_id = v_school;

  return jsonb_build_object('cabinet', to_jsonb(v_cab), 'unplaced_count', v_unplaced);
end;
$$;

revoke all on function private.delete_cabinet(uuid) from public;
grant execute on function private.delete_cabinet(uuid) to authenticated;

create or replace function public.delete_cabinet(p_cabinet_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.delete_cabinet(p_cabinet_id)
$$;

revoke all on function public.delete_cabinet(uuid) from public, anon;
grant execute on function public.delete_cabinet(uuid) to authenticated;

-- ---------- 7. 직접 쓰기 차단 (d7 §9) ----------
-- 정책은 지우지 않고 false 로 닫는다. SECURITY DEFINER 본체(테이블 소유자)는 RLS 를 거치지 않아 그대로 동작한다.
alter policy cabinets_insert_staff on public.cabinets with check (false);
alter policy cabinets_update_staff on public.cabinets using (false) with check (false);
alter policy cabinets_delete_staff on public.cabinets using (false);

alter policy cabinet_slots_insert_staff on public.cabinet_slots with check (false);
alter policy cabinet_slots_update_staff on public.cabinet_slots using (false) with check (false);
alter policy cabinet_slots_delete_staff on public.cabinet_slots using (false);

-- 테이블 권한도 회수 (select 는 그대로)
revoke insert, update, delete, truncate on table public.cabinets from anon, authenticated;
revoke insert, update, delete, truncate on table public.cabinet_slots from anon, authenticated;
