-- advisor 0029 대응: API에 노출되는 public.record_usage는 SECURITY INVOKER로 두고,
-- RLS를 넘어 stock을 차감하는 본체는 API 비노출 private 스키마의 definer 함수로 옮긴다.
-- advisor 0001 대응: cabinet_slots (cabinet_id, school_id) FK 인덱스.

create or replace function private.record_usage(p_reagent_id uuid, p_amount numeric)
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
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  select r.stock into v_stock
    from public.reagents r
   where r.id = p_reagent_id and r.school_id = v_school
   for update;
  if not found then
    raise exception 'reagent not found' using errcode = 'P0002';
  end if;
  if v_stock < p_amount then
    raise exception 'insufficient stock' using errcode = '22003';
  end if;

  update public.reagents r
     set stock = r.stock - p_amount
   where r.id = p_reagent_id and r.school_id = v_school;

  insert into public.usage_logs (school_id, reagent_id, user_id, amount)
  values (v_school, p_reagent_id, v_uid, p_amount)
  returning * into v_log;

  return v_log;
end;
$$;

revoke all on function private.record_usage(uuid, numeric) from public;
grant execute on function private.record_usage(uuid, numeric) to authenticated;

create or replace function public.record_usage(reagent_id uuid, amount numeric)
returns public.usage_logs
language sql
security invoker
set search_path = ''
as $$
  select * from private.record_usage(reagent_id, amount)
$$;

revoke all on function public.record_usage(uuid, numeric) from public, anon;
grant execute on function public.record_usage(uuid, numeric) to authenticated;

create index if not exists cabinet_slots_cabinet_school_idx
  on public.cabinet_slots (cabinet_id, school_id);
