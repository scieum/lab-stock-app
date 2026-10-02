-- 화면 13 홈 "최근 사용 기록": 같은 학교 사용자의 표시 이름을 함께 보여준다.
-- profiles RLS는 자기 행(admin은 같은 학교)만 읽게 하므로, 이름 하나만 돌려주는
-- private definer 헬퍼를 두고 공개 함수는 SECURITY INVOKER(usage_logs·reagents RLS 그대로)로 둔다.

create or replace function private.same_school_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name
    from public.profiles p
   where p.user_id = p_user_id
     and p.school_id = private.current_school_id()
$$;

revoke all on function private.same_school_display_name(uuid) from public;
grant execute on function private.same_school_display_name(uuid) to authenticated;

create or replace function public.recent_usage(p_limit integer default 3)
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
  select u.id, u.reagent_id, r.name, r.unit, u.amount, u.used_at,
         private.same_school_display_name(u.user_id)
    from public.usage_logs u
    join public.reagents r on r.id = u.reagent_id
   order by u.used_at desc
   limit least(greatest(coalesce(p_limit, 3), 1), 50)
$$;

revoke all on function public.recent_usage(integer) from public, anon;
grant execute on function public.recent_usage(integer) to authenticated;
