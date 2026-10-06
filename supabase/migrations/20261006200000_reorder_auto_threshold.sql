-- 재주문 기준 자동 (화면 3·5·6) — harness/d7-data.md §11-1 (2026-10-06 사용자 결정)
--
-- 1) reagents 열 2개
--    min_stock_source text not null default 'auto' ∈ ('auto','basis','manual') — 기준의 출처.
--      'basis'  = 화면 5 실험 매뉴얼(save_reorder_basis), 'manual' = 화면 3 직접 입력(set_reorder_threshold), 'auto' = 자동.
--    min_stock_auto_basis text null ∈ ('usage','intake') — 자동 값의 근거(마지막으로 계산할 때).
--      'usage' = 최근 28일 사용량 기준, 'intake' = 마지막 입고량의 20%, null = 근거 없음(값 0) 또는 source ≠ 'auto'.
--    처음 추가할 때만 분류(backfill): reorder_per_group 있음 → 'basis', min_stock > 0 → 'manual', 나머지 → 'auto'.
-- 2) private.reorder_auto_value(p_reagent_id) → (value numeric, basis text)
--      최근 28일(now() 기준) 그 시약 usage_logs.amount 합 > 0 이면 합 ÷ 2 ('usage'),
--      아니면 가장 최근 intake_logs.amount × 0.2 ('intake'), 입고 기록도 없으면 0 (null). 소수 3자리 반올림.
-- 3) 다시 계산: usage_logs · intake_logs AFTER INSERT 트리거(private.recalc_auto_min_stock, 정의자 권한)
--      source = 'auto' 이고 데모 학교가 아닌 그 시약의 min_stock·min_stock_auto_basis 를 자동 값으로.
--      record_usage·record_intake·register_reagent 본문은 바꾸지 않는다(모두 로그 insert 를 거친다).
--      low_stock_since 는 reagents_low_stock_since 트리거가 따라 맞춘다.
--      정의자 권한이라 reagents_guard_direct_change 의 API 역할 검사에 걸리지 않는다(current_user = 함수 소유자).
--      시간이 지나 28일 창에서 빠지는 사용 기록은 다음 사용·입고 때 반영(매일 다시 계산하지 않음 — d7 §11-1 한계).
-- 4) backfill: source = 'auto' 인 기존 시약(데모 학교 제외)의 min_stock 을 지금 자동 값으로.
-- 5) reagents_guard_direct_change 확장 (create or replace — 트리거는 그대로):
--      API 역할(authenticated·anon)의 직접 문장에서
--        · slot_id 변경/값 넣기 → 42501 (기존 그대로)
--        · min_stock_source · min_stock_auto_basis 를 직접 바꾸기 → 42501 'reorder threshold source only through functions'
--        · min_stock·reorder_per_group·reorder_groups 를 직접 바꾸면(update) / 직접 넣으면(insert)
--          source 를 값에 맞춘다: reorder_per_group 있음 → 'basis', min_stock > 0 → 'manual', 그 밖 → insert 'auto' · update 'manual'.
--          (update 로 min_stock 을 0 으로 쓰는 것도 사람이 정한 값이므로 'manual' — set_reorder_threshold(0) 과 같다.)
--          'auto' 가 아니게 되면 min_stock_auto_basis = null.
-- 6) save_reorder_basis 본문 교체(시그니처·반환 모양·권한 그대로):
--      source = 'auto' → 필요량으로 항상 바꾸고 'basis' (outcome 'changed')
--      source = 'basis'·'manual' → 필요량 > min_stock 일 때만 바꾸고 'basis' ('changed'), 아니면 그대로 ('kept')
-- 7) set_reorder_threshold 본문 교체(시그니처 그대로): 덮어쓰기 + source = 'manual'.
-- 8) reset_reorder_threshold(p_reagent_id uuid) → jsonb {reagent_id, min_stock, previous_min_stock}  ("자동으로 돌리기")
--      교사·admin, 자기 학교, 데모 거부 (set_reorder_threshold 와 같은 검사).
--      source = 'auto', reorder_per_group·reorder_groups = null, min_stock = 자동 값, min_stock_auto_basis = 근거.
--
-- 오류 형태 (errcode · message):
--   42501  not authenticated / no profile / demo school is read-only / staff only
--          / reorder threshold source only through functions (트리거)
--          (anon 은 함수 실행 권한이 없어 PostgREST 가 42501 permission denied 로 답한다)
--   P0002  reagent not found (다른 학교·없는 id — 존재 여부 비노출)
--
-- 이 파일의 구문: add column(처음 한 번, do 블록 안), update(backfill), 조건부 add constraint,
--   create or replace function/trigger, 함수 실행 권한 revoke·grant. drop·delete·truncate 없음. 기존 행은 지우지 않는다.
-- revoke 가 필요한 이유: 새 함수의 실행 권한은 PUBLIC 에 기본으로 주어진다 (20261005233000 과 같은 이유).
-- 한 번에 통째로 실행한다(한 트랜잭션). 다시 실행해도 같은 결과가 된다(분류는 처음 한 번만, 자동 값은 그 시점 값으로 다시 맞춤).

-- ---------- 1. 열 · 처음 분류 ----------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'reagents' and column_name = 'min_stock_source'
  ) then
    alter table public.reagents
      add column min_stock_source text not null default 'auto';

    update public.reagents r
       set min_stock_source = case
             when r.reorder_per_group is not null then 'basis'
             when r.min_stock > 0 then 'manual'
             else 'auto'
           end;
  end if;
end;
$$;

alter table public.reagents
  add column if not exists min_stock_auto_basis text;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.reagents'::regclass and conname = 'reagents_min_stock_source_check') then
    alter table public.reagents
      add constraint reagents_min_stock_source_check
      check (min_stock_source in ('auto', 'basis', 'manual'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.reagents'::regclass and conname = 'reagents_min_stock_auto_basis_check') then
    alter table public.reagents
      add constraint reagents_min_stock_auto_basis_check
      check (min_stock_auto_basis is null or min_stock_auto_basis in ('usage', 'intake'));
  end if;
end;
$$;

-- ---------- 2. 자동 값 ----------
create or replace function private.reorder_auto_value(p_reagent_id uuid, out value numeric, out basis text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_used numeric;
  v_last numeric;
begin
  select coalesce(sum(u.amount), 0) into v_used
    from public.usage_logs u
   where u.reagent_id = p_reagent_id
     and u.used_at >= now() - interval '28 days';

  if v_used > 0 then
    value := round(v_used / 2, 3);
    basis := 'usage';
    return;
  end if;

  select i.amount into v_last
    from public.intake_logs i
   where i.reagent_id = p_reagent_id
   order by i.created_at desc, i.intake_date desc, i.id desc
   limit 1;

  if v_last is not null and v_last > 0 then
    value := round(v_last * 0.2, 3);
    basis := 'intake';
  else
    value := 0;
    basis := null;
  end if;
end;
$$;
revoke all on function private.reorder_auto_value(uuid) from public, anon, authenticated;

-- ---------- 3. 다시 계산 트리거 ----------
create or replace function private.recalc_auto_min_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value numeric;
  v_basis text;
begin
  if new.school_id = private.demo_school_id() then
    return null;
  end if;

  if not exists (
    select 1 from public.reagents r
     where r.id = new.reagent_id and r.school_id = new.school_id and r.min_stock_source = 'auto'
  ) then
    return null;
  end if;

  select a.value, a.basis into v_value, v_basis
    from private.reorder_auto_value(new.reagent_id) a;

  update public.reagents r
     set min_stock = v_value,
         min_stock_auto_basis = v_basis
   where r.id = new.reagent_id
     and r.school_id = new.school_id
     and r.min_stock_source = 'auto'
     and (r.min_stock is distinct from v_value or r.min_stock_auto_basis is distinct from v_basis);

  return null;
end;
$$;
revoke all on function private.recalc_auto_min_stock() from public, anon, authenticated;

create or replace trigger usage_logs_recalc_auto_min_stock
  after insert on public.usage_logs
  for each row execute function private.recalc_auto_min_stock();

create or replace trigger intake_logs_recalc_auto_min_stock
  after insert on public.intake_logs
  for each row execute function private.recalc_auto_min_stock();

-- ---------- 4. 직접 쓰기 검사 (기존 트리거 함수 교체) ----------
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

    if tg_op = 'UPDATE' then
      if new.min_stock_source is distinct from old.min_stock_source
         or new.min_stock_auto_basis is distinct from old.min_stock_auto_basis then
        raise exception 'reorder threshold source only through functions' using errcode = '42501';
      end if;
      -- 사람이 기준 값을 직접 고치면 출처를 그 값에 맞춘다
      if new.min_stock is distinct from old.min_stock
         or new.reorder_per_group is distinct from old.reorder_per_group
         or new.reorder_groups is distinct from old.reorder_groups then
        new.min_stock_source := case when new.reorder_per_group is not null then 'basis' else 'manual' end;
        new.min_stock_auto_basis := null;
      end if;
    else
      -- INSERT: 출처는 넣은 값으로 정한다 (직접 준 source·basis 는 무시)
      new.min_stock_source := case
        when new.reorder_per_group is not null then 'basis'
        when new.min_stock > 0 then 'manual'
        else 'auto'
      end;
      new.min_stock_auto_basis := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_reagent_direct_change() from public, anon, authenticated;

create or replace trigger reagents_guard_direct_change
  before insert or update on public.reagents
  for each row execute function private.guard_reagent_direct_change();

-- ---------- 5. backfill: 자동 시약의 기준을 지금 자동 값으로 (데모 학교 제외) ----------
update public.reagents r
   set min_stock = a.value,
       min_stock_auto_basis = a.basis
  from public.reagents x
  cross join lateral private.reorder_auto_value(x.id) a
 where r.id = x.id
   and r.min_stock_source = 'auto'
   and r.school_id <> private.demo_school_id()
   and (r.min_stock is distinct from a.value or r.min_stock_auto_basis is distinct from a.basis);

-- ---------- 6. save_reorder_basis (본문 교체) ----------
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

  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    raise exception 'invalid items' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(v_items);
  if v_count < 1 or v_count > 50 then
    raise exception 'invalid items' using errcode = '22023', detail = v_count::text;
  end if;

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

  select string_agg(e.o::text, ',' order by e.o)
    into v_bad
    from jsonb_array_elements(v_items) with ordinality as e(x, o)
   where not ((e.x ->> 'per_group')::numeric > 0 and (e.x ->> 'per_group')::numeric <= 1000000);
  if v_bad is not null then
    raise exception 'invalid per_group' using errcode = '22023', detail = v_bad;
  end if;

  select string_agg(e.o::text, ',' order by e.o)
    into v_bad
    from jsonb_array_elements(v_items) with ordinality as e(x, o)
   where not ((e.x ->> 'groups')::numeric = trunc((e.x ->> 'groups')::numeric)
              and (e.x ->> 'groups')::numeric between 1 and 20);
  if v_bad is not null then
    raise exception 'invalid groups' using errcode = '22023', detail = v_bad;
  end if;

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

  -- 자동 기준이면 항상, 매뉴얼·직접 입력 기준이면 필요량이 더 클 때만 바꾼다 (d7 §11-1 · §13)
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
           reorder_groups = i.groups,
           min_stock_source = 'basis',
           min_stock_auto_basis = null
      from items i
     where r.id = i.reagent_id
       and r.school_id = v_school
       and (r.min_stock_source = 'auto' or i.per_group * i.groups > r.min_stock)
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

-- ---------- 7. set_reorder_threshold (본문 교체) ----------
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

  update public.reagents r
     set min_stock = p_min_stock,
         reorder_per_group = null,
         reorder_groups = null,
         min_stock_source = 'manual',
         min_stock_auto_basis = null
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

-- ---------- 8. reset_reorder_threshold ("자동으로 돌리기") ----------
create or replace function private.reset_reorder_threshold(p_reagent_id uuid)
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
  v_value numeric;
  v_basis text;
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

  select r.id, r.min_stock into v_id, v_prev
    from public.reagents r
   where r.id = p_reagent_id and r.school_id = v_school
     for update;
  if not found then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;

  select a.value, a.basis into v_value, v_basis
    from private.reorder_auto_value(v_id) a;

  update public.reagents r
     set min_stock = v_value,
         reorder_per_group = null,
         reorder_groups = null,
         min_stock_source = 'auto',
         min_stock_auto_basis = v_basis
   where r.id = v_id and r.school_id = v_school;

  return jsonb_build_object(
    'reagent_id', v_id,
    'min_stock', v_value,
    'previous_min_stock', v_prev
  );
end;
$$;

revoke all on function private.reset_reorder_threshold(uuid) from public;
grant execute on function private.reset_reorder_threshold(uuid) to authenticated;

create or replace function public.reset_reorder_threshold(p_reagent_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.reset_reorder_threshold(p_reagent_id)
$$;

revoke all on function public.reset_reorder_threshold(uuid) from public, anon;
grant execute on function public.reset_reorder_threshold(uuid) to authenticated;
