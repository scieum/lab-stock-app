-- 회원가입(화면 14) 재시도 지원: 가입 미완료(이메일 미확인 + 프로필 없음) auth 사용자 찾기.
-- - 학교 연결(register_profile)이 실패해 프로필 없이 남은 auth 사용자가 같은 이메일 재가입을 막지 않게
--   서버가 signUp 전에 이 함수로 찾아 지운다 (lib/server/signup.ts, admin.auth.admin.deleteUser).
-- - 확인을 마쳤거나 프로필이 있는 계정은 돌려주지 않는다 (null). 계정 존재 여부 외 정보는 내지 않는다.
-- - 실행 권한은 service_role만. anon·authenticated는 호출 불가.

create or replace function public.pending_signup_user(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from auth.users u
   where lower(u.email) = lower(btrim(coalesce(p_email, '')))
     and u.email_confirmed_at is null
     and not exists (select 1 from public.profiles p where p.user_id = u.id)
   limit 1;
$$;

revoke all on function public.pending_signup_user(text) from public, anon, authenticated;
grant execute on function public.pending_signup_user(text) to service_role;
