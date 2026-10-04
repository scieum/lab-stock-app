-- 사용자 관리 (화면 8) + 가입(화면 14)의 초대 역할 반영 — harness/d7-data.md §8 (2026-10-04 결정)
--
-- 1) invites: 이메일·역할(student·teacher)을 미리 적어 두는 초대. RLS select = 같은 학교 admin.
--    직접 insert·update·delete 정책 없음 (테이블 권한도 select 만). anon 0행. 데모 학교 초대 불가.
-- 2) invite_members(p_emails, p_role): admin 이 자기 학교에 여러 명 초대. 하나라도 문제면 전체 거부.
-- 3) change_member_role(p_user_id, p_role): admin 이 같은 학교 멤버 역할 변경. 마지막 admin 강등 거부.
-- 4) remove_member(p_user_id): admin 이 같은 학교 멤버 내보내기 (profiles 행만 삭제). 본인·마지막 admin 거부.
-- 5) profiles 직접 update 로 role·school_id·user_id 를 바꾸는 길 차단 (BEFORE UPDATE 트리거).
--    profiles 직접 insert·delete·truncate 권한도 회수 (정책은 원래 없음).
-- 6) register_profile 본문 교체 (시그니처 그대로): 그 학교에 이 이메일의 대기 초대가 있으면 초대 역할.
--
-- 기존 함수들과 같은 구조: API 에 노출되는 public 함수는 SECURITY INVOKER,
-- 본체는 API 비노출 private 스키마의 SECURITY DEFINER (search_path 고정, 학교·역할 검사는 본체 안에서).
-- 오류 형태 (errcode · message · detail):
--   42501  not authenticated / no profile / admin only / demo school is read-only
--   22023  invalid role / no emails / too many emails / invalid email(detail = 이메일들, 쉼표 구분)
--          / cannot remove self
--   23505  already member(detail = 이메일들) / already invited(detail = 이메일들)
--   P0002  member not found (다른 학교 사용자 포함 — 존재 여부 비노출)
--   23514  last admin (admin 이 최소 1명 있어야 한다)
-- 같은 학교의 역할 변경·내보내기·초대·가입은 schools 행 잠금으로 직렬화한다
-- (register_profile 은 FOR UPDATE, 여기 함수들은 FOR NO KEY UPDATE — 서로 충돌해 순서대로 실행되고,
--  usage_logs 등의 FK 검사(FOR KEY SHARE)는 막지 않는다).
-- 이 파일에는 drop 구문이 없다 (함수는 create or replace, 테이블·트리거는 추가만).

-- ---------- 1. invites ----------
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  email text not null,
  role text not null,
  -- 초대한 admin·수락한 사용자의 로그인 계정이 지워져도 초대 기록은 남긴다
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,                 -- null = 대기
  accepted_user_id uuid references auth.users (id) on delete set null,
  constraint invites_email_normalized check (email = lower(btrim(email))),
  constraint invites_email_format check (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint invites_role_check check (role in ('student', 'teacher')),
  constraint invites_not_demo_school check (school_id <> private.demo_school_id()),
  constraint invites_accepted_user_needs_time check (accepted_user_id is null or accepted_at is not null)
);

-- 같은 학교에 같은 이메일의 대기 초대는 1개
create unique index invites_pending_email_idx
  on public.invites (school_id, email) where accepted_at is null;
create index invites_school_id_idx on public.invites (school_id);
create index invites_invited_by_idx on public.invites (invited_by);
create index invites_accepted_user_id_idx on public.invites (accepted_user_id);

alter table public.invites enable row level security;

-- 같은 학교 admin 만 읽기. 쓰기는 invite_members·register_profile 로만 (직접 쓰기 정책 없음)
create policy invites_select_admin on public.invites
  for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.current_user_role()) = 'admin'
  );

revoke all on table public.invites from public, anon, authenticated;
grant select on table public.invites to authenticated;
grant all on table public.invites to service_role;

-- ---------- 2. invite_members ----------
create or replace function private.invite_members(p_emails text[], p_role text)
returns setof public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_caller_role text;
  v_emails text[];
  v_bad text[];
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

  -- 같은 학교의 초대·가입·역할 변경을 직렬화한 뒤 호출자 역할을 다시 읽는다
  perform 1 from public.schools s where s.id = v_school for no key update;
  select p.role into v_caller_role
    from public.profiles p where p.user_id = v_uid and p.school_id = v_school;
  if v_caller_role is distinct from 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('student', 'teacher') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_emails), 0) > 500 then
    raise exception 'too many emails' using errcode = '22023', detail = '50';
  end if;

  -- trim·소문자·빈 값 제거·중복 제거 (입력 순서 유지)
  select coalesce(array_agg(s.e order by s.ord), '{}')
    into v_emails
    from (
      select lower(btrim(t.x)) as e, min(t.o) as ord
        from unnest(coalesce(p_emails, '{}'::text[])) with ordinality as t(x, o)
       where btrim(coalesce(t.x, '')) <> ''
       group by 1
    ) s;

  if cardinality(v_emails) = 0 then
    raise exception 'no emails' using errcode = '22023';
  end if;
  if cardinality(v_emails) > 50 then
    raise exception 'too many emails' using errcode = '22023', detail = '50';
  end if;

  select array_agg(t.e order by t.o) into v_bad
    from unnest(v_emails) with ordinality as t(e, o)
   where char_length(t.e) > 254 or t.e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
  if v_bad is not null then
    raise exception 'invalid email' using errcode = '22023', detail = array_to_string(v_bad, ',');
  end if;

  -- 이미 같은 학교 멤버인 이메일 (다른 학교 소속 여부는 보지 않는다 — 노출하지 않는다)
  select array_agg(t.e order by t.o) into v_bad
    from unnest(v_emails) with ordinality as t(e, o)
   where exists (
           select 1
             from public.profiles p
             join auth.users u on u.id = p.user_id
            where p.school_id = v_school and lower(u.email) = t.e
         );
  if v_bad is not null then
    raise exception 'already member' using errcode = '23505', detail = array_to_string(v_bad, ',');
  end if;

  -- 이미 대기 중인 이메일
  select array_agg(t.e order by t.o) into v_bad
    from unnest(v_emails) with ordinality as t(e, o)
   where exists (
           select 1 from public.invites i
            where i.school_id = v_school and i.email = t.e and i.accepted_at is null
         );
  if v_bad is not null then
    raise exception 'already invited' using errcode = '23505', detail = array_to_string(v_bad, ',');
  end if;

  return query
    insert into public.invites (school_id, email, role, invited_by)
    select v_school, t.e, p_role, v_uid
      from unnest(v_emails) with ordinality as t(e, o)
     order by t.o
    returning *;
end;
$$;

revoke all on function private.invite_members(text[], text) from public;
grant execute on function private.invite_members(text[], text) to authenticated;

create or replace function public.invite_members(p_emails text[], p_role text)
returns setof public.invites
language sql
security invoker
set search_path = ''
as $$
  select * from private.invite_members(p_emails, p_role)
$$;

revoke all on function public.invite_members(text[], text) from public, anon;
grant execute on function public.invite_members(text[], text) to authenticated;

-- ---------- 3. change_member_role ----------
create or replace function private.change_member_role(p_user_id uuid, p_role text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_caller_role text;
  v_target public.profiles;
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

  -- 학교 단위 직렬화: 두 admin 이 서로를 동시에 강등해도 뒤 트랜잭션은 잠금 뒤에 자기 역할을 다시 읽는다
  perform 1 from public.schools s where s.id = v_school for no key update;
  select p.role into v_caller_role
    from public.profiles p where p.user_id = v_uid and p.school_id = v_school;
  if v_caller_role is distinct from 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('student', 'teacher', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  -- 다른 학교 사용자는 자기 학교 조건에 걸려 not found (존재 여부 비노출)
  select p.* into v_target
    from public.profiles p
   where p.user_id = p_user_id and p.school_id = v_school
     for update;
  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  if v_target.role = p_role then
    return v_target;
  end if;

  if v_target.role = 'admin'
     and (select count(*) from public.profiles p where p.school_id = v_school and p.role = 'admin') <= 1 then
    raise exception 'last admin' using errcode = '23514';
  end if;

  update public.profiles p
     set role = p_role
   where p.user_id = p_user_id and p.school_id = v_school
  returning p.* into v_target;

  return v_target;
end;
$$;

revoke all on function private.change_member_role(uuid, text) from public;
grant execute on function private.change_member_role(uuid, text) to authenticated;

create or replace function public.change_member_role(p_user_id uuid, p_role text)
returns public.profiles
language sql
security invoker
set search_path = ''
as $$
  select * from private.change_member_role(p_user_id, p_role)
$$;

revoke all on function public.change_member_role(uuid, text) from public, anon;
grant execute on function public.change_member_role(uuid, text) to authenticated;

-- ---------- 4. remove_member ----------
-- profiles 행만 지운다. usage_logs·intake_logs·invites 의 사용자 FK 는 auth.users 를 가리켜 기록은 그대로 남는다.
create or replace function private.remove_member(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_caller_role text;
  v_target public.profiles;
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

  perform 1 from public.schools s where s.id = v_school for no key update;
  select p.role into v_caller_role
    from public.profiles p where p.user_id = v_uid and p.school_id = v_school;
  if v_caller_role is distinct from 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if p_user_id = v_uid then
    raise exception 'cannot remove self' using errcode = '22023';
  end if;

  select p.* into v_target
    from public.profiles p
   where p.user_id = p_user_id and p.school_id = v_school
     for update;
  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  -- 호출자가 admin 이고 대상이 본인이 아니므로 admin 은 항상 1명 이상 남지만, 규칙을 그대로 한 번 더 확인한다
  if v_target.role = 'admin'
     and (select count(*) from public.profiles p where p.school_id = v_school and p.role = 'admin') <= 1 then
    raise exception 'last admin' using errcode = '23514';
  end if;

  delete from public.profiles p
   where p.user_id = p_user_id and p.school_id = v_school;

  return v_target;
end;
$$;

revoke all on function private.remove_member(uuid) from public;
grant execute on function private.remove_member(uuid) to authenticated;

create or replace function public.remove_member(p_user_id uuid)
returns public.profiles
language sql
security invoker
set search_path = ''
as $$
  select * from private.remove_member(p_user_id)
$$;

revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;

-- ---------- 5. profiles 직접 변경 차단 ----------
-- profiles_update_admin 정책은 그대로 둔다 (admin 이 같은 학교 행의 display_name 을 고칠 수 있음).
-- role·school_id·user_id 는 API 역할(authenticated·anon)의 직접 update 로는 바꿀 수 없다.
-- SECURITY DEFINER 함수(change_member_role 등) 안에서는 current_user 가 함수 소유자라 통과한다.
create or replace function private.guard_profile_direct_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role is distinct from old.role
          or new.school_id is distinct from old.school_id
          or new.user_id is distinct from old.user_id) then
    raise exception 'profile role and school change only through functions' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_profile_direct_change() from public;

create or replace trigger profiles_guard_direct_change
  before update on public.profiles
  for each row execute function private.guard_profile_direct_change();

-- 직접 insert·delete·truncate 는 정책이 원래 없어 거부되지만 테이블 권한도 회수한다
revoke insert, delete, truncate on table public.profiles from anon, authenticated;

-- ---------- 6. register_profile: 대기 초대가 있으면 초대 역할 ----------
-- 시그니처·권한(service_role 전용)은 그대로, 본문만 교체.
-- 역할: 학교에 멤버가 없으면 admin (첫 가입자 — 초대가 있을 수 없는 상태), 있으면 대기 초대 역할, 없으면 student.
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
  v_email text;
  v_invite_id uuid;
  v_invite_role text;
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

  -- 이 사용자의 이메일로 된 이 학교의 대기 초대 (다른 학교의 초대는 영향 없음)
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = p_user_id;
  if v_email is not null and v_email <> '' then
    select i.id, i.role into v_invite_id, v_invite_role
      from public.invites i
     where i.school_id = v_school and i.email = v_email and i.accepted_at is null
       for update;
  end if;

  select case
           when not exists (select 1 from public.profiles p where p.school_id = v_school) then 'admin'
           when v_invite_id is not null then v_invite_role
           else 'student'
         end
    into v_role;

  -- 이미 프로필이 있는 사용자면 unique_violation(23505)으로 실패 (학교를 바꾸지 않는다)
  insert into public.profiles (user_id, school_id, role, display_name)
  values (p_user_id, v_school, v_role, v_name)
  returning * into v_profile;

  if v_invite_id is not null then
    update public.invites i
       set accepted_at = now(), accepted_user_id = p_user_id
     where i.id = v_invite_id;
  end if;

  return v_profile;
end;
$$;
revoke all on function public.register_profile(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_profile(uuid, text, text, text, text, text, text) to service_role;
