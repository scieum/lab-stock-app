-- 화면 3 시약 상세 "사용 기록": 한 시약의 최근 사용 기록 + 같은 학교 사용자 표시 이름.
-- recent_usage 와 같이 SECURITY INVOKER (usage_logs RLS = 자기 학교 행만), 이름은 private 헬퍼로.

create or replace function public.reagent_usage(p_reagent_id uuid, p_limit integer default 5)
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
  select u.id, u.amount, u.used_at,
         private.same_school_display_name(u.user_id)
    from public.usage_logs u
   where u.reagent_id = p_reagent_id
   order by u.used_at desc
   limit least(greatest(coalesce(p_limit, 5), 1), 50)
$$;

revoke all on function public.reagent_usage(uuid, integer) from public, anon;
grant execute on function public.reagent_usage(uuid, integer) to authenticated;
