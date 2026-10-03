-- 입고·시약 등록 (화면 7) — harness/d7-data.md §6 (2026-10-03 결정)
--
-- 1) reagents.storage_class (null 허용, design/rules.json cabinet.storage_classes 8종).
-- 2) intake_logs: 입고할 때마다 누가·언제·얼마나. RLS select = 같은 학교. 직접 insert·update·delete 정책 없음
--    (테이블 권한도 select 만 남긴다). anon 정책 없음 = anon 0행 (데모 학교에는 입고 기록이 없다).
-- 3) record_intake: intake_logs insert + reagents.stock 증가 + reagents.intake_date 갱신을 한 트랜잭션으로.
-- 4) register_reagent: reagents insert + 첫 재고 intake_logs 1행을 한 트랜잭션으로. school_id 는 호출자 profiles 에서.
-- 두 함수 모두 record_usage 와 같은 구조: API 에 노출되는 public 함수는 SECURITY INVOKER,
-- 본체는 API 비노출 private 스키마의 SECURITY DEFINER (search_path 고정, 학교·역할 검사는 본체 안에서).
-- 오류 코드도 record_usage 와 같다: 42501 권한 · 22023 입력값 · P0002 시약 없음(다른 학교 포함, 존재 여부 비노출)
-- + 23505 같은 학교에 같은 이름 시약.

-- ---------- 1. reagents.storage_class ----------
alter table public.reagents
  add column if not exists storage_class text;

alter table public.reagents
  add constraint reagents_storage_class_check
  check (storage_class is null
         or storage_class in ('유기', '산', '염기', '산화제', '인화성', '무기염', '독성', '기타'));

-- ---------- 2. intake_logs ----------
create table public.intake_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  reagent_id uuid not null,
  user_id uuid not null references auth.users (id),
  amount numeric not null check (amount > 0),
  intake_date date not null,
  created_at timestamptz not null default now(),
  -- 시약을 지우면 그 시약의 입고 기록도 같이 지운다 (직접 delete 정책이 없어 다른 방법으로는 못 지운다)
  foreign key (reagent_id, school_id) references public.reagents (id, school_id) on delete cascade
);
create index intake_logs_school_id_idx on public.intake_logs (school_id);
create index intake_logs_reagent_id_idx on public.intake_logs (reagent_id, school_id);
create index intake_logs_user_id_idx on public.intake_logs (user_id);

alter table public.intake_logs enable row level security;

-- 같은 학교 읽기만. insert 는 record_intake·register_reagent 로만 (직접 쓰기 정책 없음)
create policy intake_logs_select on public.intake_logs
  for select to authenticated
  using (school_id = (select private.current_school_id()));

revoke all on table public.intake_logs from public, anon, authenticated;
grant select on table public.intake_logs to authenticated;
grant all on table public.intake_logs to service_role;

-- ---------- 3. record_intake ----------
create or replace function private.record_intake(p_reagent_id uuid, p_amount numeric, p_intake_date date)
returns public.intake_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
  v_log public.intake_logs;
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
  -- 소수 허용 (record_usage 와 같이 numeric), 최소 1
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then
    raise exception 'amount must be between 1 and 1000000' using errcode = '22023';
  end if;
  if p_intake_date is null then
    raise exception 'intake date required' using errcode = '22023';
  end if;

  -- 다른 학교·데모 학교 시약은 자기 학교 조건에 걸려 not found (존재 여부 비노출)
  perform 1
     from public.reagents r
    where r.id = p_reagent_id and r.school_id = v_school
      for update;
  if not found then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;

  update public.reagents r
     set stock = r.stock + p_amount,
         intake_date = p_intake_date
   where r.id = p_reagent_id and r.school_id = v_school;

  insert into public.intake_logs (school_id, reagent_id, user_id, amount, intake_date)
  values (v_school, p_reagent_id, v_uid, p_amount, p_intake_date)
  returning * into v_log;

  return v_log;
end;
$$;

revoke all on function private.record_intake(uuid, numeric, date) from public;
grant execute on function private.record_intake(uuid, numeric, date) to authenticated;

create or replace function public.record_intake(p_reagent_id uuid, p_amount numeric, p_intake_date date)
returns public.intake_logs
language sql
security invoker
set search_path = ''
as $$
  select * from private.record_intake(p_reagent_id, p_amount, p_intake_date)
$$;

revoke all on function public.record_intake(uuid, numeric, date) from public, anon;
grant execute on function public.record_intake(uuid, numeric, date) to authenticated;

-- ---------- 4. register_reagent ----------
create or replace function private.register_reagent(
  p_name text,
  p_storage_class text,
  p_stock numeric,
  p_unit text,
  p_intake_date date,
  p_msds_url text default null
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

  -- 같은 학교의 등록을 직렬화한 뒤 같은 이름(앞뒤 공백·대소문자 무시)이 있으면 거부
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('register_reagent:' || v_school::text, 0));
  if exists (
    select 1 from public.reagents r
     where r.school_id = v_school and lower(btrim(r.name)) = lower(v_name)
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

revoke all on function private.register_reagent(text, text, numeric, text, date, text) from public;
grant execute on function private.register_reagent(text, text, numeric, text, date, text) to authenticated;

create or replace function public.register_reagent(
  p_name text,
  p_storage_class text,
  p_stock numeric,
  p_unit text,
  p_intake_date date,
  p_msds_url text default null
)
returns public.reagents
language sql
security invoker
set search_path = ''
as $$
  select * from private.register_reagent(p_name, p_storage_class, p_stock, p_unit, p_intake_date, p_msds_url)
$$;

revoke all on function public.register_reagent(text, text, numeric, text, date, text) from public, anon;
grant execute on function public.register_reagent(text, text, numeric, text, date, text) to authenticated;
