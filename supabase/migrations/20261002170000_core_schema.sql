-- Lab_Stock MVP 스키마 (harness/d7-data.md §1·§2)
-- 업무 테이블 전부 school_id + RLS. school_id·역할 판별은 private 스키마의
-- security definer 헬퍼로 해서 profiles RLS 재귀를 피한다.

create extension if not exists pgcrypto with schema extensions;

-- ---------- 헬퍼 (API 노출 안 되는 private 스키마) ----------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------- 테이블 ----------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  neis_code text not null unique,          -- SD_SCHUL_CODE
  office_code text not null,               -- ATPT_OFCDC_SC_CODE
  name text not null,
  sido text not null,
  region text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  display_name text not null default '',
  created_at timestamptz not null default now()
);
create index profiles_school_id_idx on public.profiles (school_id);

create table public.cabinets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  label text not null,
  door_type text not null check (door_type in ('양문형', '단문형')),
  shelves smallint not null check (shelves in (3, 4)),
  created_at timestamptz not null default now(),
  unique (id, school_id)
);
create index cabinets_school_id_idx on public.cabinets (school_id);

create table public.cabinet_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  cabinet_id uuid not null,
  side text not null check (side in ('L', 'R')),
  shelf smallint not null check (shelf between 1 and 4),
  storage_class text not null
    check (storage_class in ('유기', '산', '염기', '산화제', '인화성', '무기염', '독성', '기타')),
  unique (id, school_id),
  unique (cabinet_id, side, shelf),
  foreign key (cabinet_id, school_id) references public.cabinets (id, school_id) on delete cascade
);
create index cabinet_slots_school_id_idx on public.cabinet_slots (school_id);

create table public.reagents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null,
  cas_no text,
  unit text not null default 'g',
  stock numeric not null default 0 check (stock >= 0),
  min_stock numeric not null default 0 check (min_stock >= 0),
  msds_url text,
  slot_id uuid,
  intake_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (slot_id, school_id) references public.cabinet_slots (id, school_id)
);
create index reagents_school_id_idx on public.reagents (school_id);
create index reagents_slot_id_idx on public.reagents (slot_id, school_id);

create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  reagent_id uuid not null,
  user_id uuid not null references auth.users (id),
  amount numeric not null check (amount > 0),
  used_at timestamptz not null default now(),
  foreign key (reagent_id, school_id) references public.reagents (id, school_id)
);
create index usage_logs_school_id_idx on public.usage_logs (school_id);
create index usage_logs_reagent_id_idx on public.usage_logs (reagent_id, school_id);
create index usage_logs_user_id_idx on public.usage_logs (user_id);

-- ---------- 헬퍼 함수 ----------
create or replace function private.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id from public.profiles p where p.user_id = auth.uid()
$$;

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = auth.uid()
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role in ('teacher', 'admin') from public.profiles p where p.user_id = auth.uid()),
    false)
$$;

revoke all on function private.current_school_id() from public;
revoke all on function private.current_user_role() from public;
revoke all on function private.is_staff() from public;
grant execute on function private.current_school_id() to authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_staff() to authenticated;

-- ---------- RLS ----------
alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.cabinets enable row level security;
alter table public.cabinet_slots enable row level security;
alter table public.reagents enable row level security;
alter table public.usage_logs enable row level security;

-- schools: 자기 학교만 읽기. 생성은 서버(service role)만.
create policy schools_select_own on public.schools
  for select to authenticated
  using (id = (select private.current_school_id()));

-- profiles: 자기 행 읽기, admin은 같은 학교 행 읽기·수정
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (school_id = (select private.current_school_id())
        and (select private.current_user_role()) = 'admin')
  );

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.current_user_role()) = 'admin')
  with check (school_id = (select private.current_school_id()));

-- cabinets: 같은 학교 읽기, 변경은 teacher·admin
create policy cabinets_select on public.cabinets
  for select to authenticated
  using (school_id = (select private.current_school_id()));
create policy cabinets_insert_staff on public.cabinets
  for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_staff()));
create policy cabinets_update_staff on public.cabinets
  for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_staff()))
  with check (school_id = (select private.current_school_id()) and (select private.is_staff()));
create policy cabinets_delete_staff on public.cabinets
  for delete to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_staff()));

-- cabinet_slots: 같은 학교 읽기, 변경은 teacher·admin
create policy cabinet_slots_select on public.cabinet_slots
  for select to authenticated
  using (school_id = (select private.current_school_id()));
create policy cabinet_slots_insert_staff on public.cabinet_slots
  for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_staff()));
create policy cabinet_slots_update_staff on public.cabinet_slots
  for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_staff()))
  with check (school_id = (select private.current_school_id()) and (select private.is_staff()));
create policy cabinet_slots_delete_staff on public.cabinet_slots
  for delete to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_staff()));

-- reagents: 같은 학교 읽기, 등록·수정(입고)·삭제는 teacher·admin
create policy reagents_select on public.reagents
  for select to authenticated
  using (school_id = (select private.current_school_id()));
create policy reagents_insert_staff on public.reagents
  for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_staff()));
create policy reagents_update_staff on public.reagents
  for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_staff()))
  with check (school_id = (select private.current_school_id()) and (select private.is_staff()));
create policy reagents_delete_staff on public.reagents
  for delete to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_staff()));

-- usage_logs: 같은 학교 읽기, 기록은 자기 user_id로만 (수정·삭제 없음)
create policy usage_logs_select on public.usage_logs
  for select to authenticated
  using (school_id = (select private.current_school_id()));
create policy usage_logs_insert_self on public.usage_logs
  for insert to authenticated
  with check (school_id = (select private.current_school_id()) and user_id = (select auth.uid()));

-- ---------- 재고 차감 (사용 기록 + stock 차감 한 트랜잭션) ----------
create or replace function public.record_usage(reagent_id uuid, amount numeric)
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
  if record_usage.amount is null or record_usage.amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  select r.stock into v_stock
    from public.reagents r
   where r.id = record_usage.reagent_id and r.school_id = v_school
   for update;
  if not found then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;
  if v_stock < record_usage.amount then
    raise exception 'insufficient stock' using errcode = '22003';
  end if;

  update public.reagents r
     set stock = r.stock - record_usage.amount
   where r.id = record_usage.reagent_id and r.school_id = v_school;

  insert into public.usage_logs (school_id, reagent_id, user_id, amount)
  values (v_school, record_usage.reagent_id, v_uid, record_usage.amount)
  returning * into v_log;

  return v_log;
end;
$$;

revoke all on function public.record_usage(uuid, numeric) from public, anon;
grant execute on function public.record_usage(uuid, numeric) to authenticated;
