-- MSDS 찾기 (d7 §20, 화면 2·3·7 — design/rules.json 1.17 msds)
--
-- set_reagent_msds(p_reagent_id uuid, p_msds_url text, p_cas_no text default null) → jsonb
--   {reagent_id, msds_url, cas_no, cas_filled}
--   - 교사·admin 만, 자기 학교 시약만, 데모 학교 거부 (42501 · 없는 id·다른 학교 P0002)
--   - msds_url: 앞뒤 공백 정리 후 http:// · https:// 로 시작, 300자 이하, 공백 없음 (아니면 22023)
--   - p_cas_no: null·빈 값 허용. 값이 있으면 CAS 번호 형식(숫자 2~7 - 숫자 2 - 숫자 1, 30자 이하)이어야 하고 (아니면 22023)
--     시약의 cas_no 가 비어 있을 때(null 또는 공백뿐)만 채운다. 이미 있으면 그대로 둔다(cas_filled = false)
--   - 그 밖의 열(재고·기준·위치 등)은 건드리지 않는다
-- 모양은 다른 쓰기 함수와 같다: public = security invoker 래퍼(anon 실행 불가) → private = security definer 본문.
-- create function 만 쓴다 (새 함수 — drop 없음).

create or replace function private.set_reagent_msds(p_reagent_id uuid, p_msds_url text, p_cas_no text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_role text;
  v_url text := btrim(coalesce(p_msds_url, ''));
  v_cas text := nullif(btrim(coalesce(p_cas_no, '')), '');
  v_id uuid;
  v_prev_cas text;
  v_filled boolean := false;
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

  if char_length(v_url) = 0 or char_length(v_url) > 300
     or v_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'invalid msds url' using errcode = '22023';
  end if;
  if v_cas is not null and (char_length(v_cas) > 30 or v_cas !~ '^[0-9]{2,7}-[0-9]{2}-[0-9]$') then
    raise exception 'invalid cas no' using errcode = '22023';
  end if;

  select r.id, r.cas_no into v_id, v_prev_cas
    from public.reagents r
   where r.id = p_reagent_id and r.school_id = v_school
     for update;
  if not found then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;

  v_filled := v_cas is not null and nullif(btrim(coalesce(v_prev_cas, '')), '') is null;

  update public.reagents r
     set msds_url = v_url,
         cas_no = case when v_filled then v_cas else r.cas_no end
   where r.id = v_id and r.school_id = v_school;

  return jsonb_build_object(
    'reagent_id', v_id,
    'msds_url', v_url,
    'cas_no', case when v_filled then v_cas else v_prev_cas end,
    'cas_filled', v_filled
  );
end;
$$;

revoke all on function private.set_reagent_msds(uuid, text, text) from public, anon;
grant execute on function private.set_reagent_msds(uuid, text, text) to authenticated;

create or replace function public.set_reagent_msds(p_reagent_id uuid, p_msds_url text, p_cas_no text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_reagent_msds(p_reagent_id, p_msds_url, p_cas_no)
$$;

revoke all on function public.set_reagent_msds(uuid, text, text) from public, anon;
grant execute on function public.set_reagent_msds(uuid, text, text) to authenticated;
