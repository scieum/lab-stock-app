-- 회원가입(화면 14, d7 §4-1): 학교 upsert + 프로필 생성 + 역할 결정을 한 트랜잭션으로.
-- - 학교 정보는 서버가 NEIS로 확인한 값만 넘긴다 (클라이언트 값을 믿지 않음).
-- - 역할: 그 학교 첫 가입자 = admin, 이후 = student.
--   같은 학교 동시 가입 경쟁은 schools 행을 FOR UPDATE로 잠가 직렬화한다
--   (두 번째 트랜잭션은 첫 번째 커밋 뒤에 프로필 존재를 보고 student가 된다).
-- - 실행 권한은 service_role만 (서버 lib/server 전용). anon·authenticated는 호출 불가.

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

  insert into public.schools (neis_code, office_code, name, sido, region)
  values (btrim(p_neis_code), p_office_code, p_school_name, p_sido, p_region)
  on conflict (neis_code) do update
    set office_code = excluded.office_code,
        name = excluded.name,
        sido = excluded.sido,
        region = excluded.region;

  -- 같은 학교 가입을 직렬화 (첫 가입자 판정 경쟁 방지)
  select s.id into v_school
    from public.schools s
   where s.neis_code = btrim(p_neis_code)
   for update;

  select case
           when exists (select 1 from public.profiles p where p.school_id = v_school) then 'student'
           else 'admin'
         end
    into v_role;

  -- 이미 프로필이 있는 사용자면 unique_violation(23505)으로 실패 (학교를 바꾸지 않는다)
  insert into public.profiles (user_id, school_id, role, display_name)
  values (p_user_id, v_school, v_role, v_name)
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.register_profile(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_profile(uuid, text, text, text, text, text, text) to service_role;
