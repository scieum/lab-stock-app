-- 재주문 기준 자동 값의 소수 자리 정리 — 20261006200000 보완 (d7 §11-1)
--
-- round(x, 3) 은 numeric 의 scale 을 3 으로 고정해 "10.000" 처럼 내려간다(API JSON 문자열에 그대로 보임).
-- 값은 같고 표시만 다르므로 trim_scale 로 뒤쪽 0 을 지운다(10.000 → 10, 3.500 → 3.5).
-- 이 파일의 구문: create or replace function 1개, 함수 실행 권한 revoke, update(자동 시약 중 scale 이 남은 행만 — 값은 같다).
-- drop·delete·truncate 없음. 한 번에 통째로 실행한다. 다시 실행해도 같은 결과가 된다.

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
    value := trim_scale(round(v_used / 2, 3));
    basis := 'usage';
    return;
  end if;

  select i.amount into v_last
    from public.intake_logs i
   where i.reagent_id = p_reagent_id
   order by i.created_at desc, i.intake_date desc, i.id desc
   limit 1;

  if v_last is not null and v_last > 0 then
    value := trim_scale(round(v_last * 0.2, 3));
    basis := 'intake';
  else
    value := 0;
    basis := null;
  end if;
end;
$$;
revoke all on function private.reorder_auto_value(uuid) from public, anon, authenticated;

-- 이미 채운 자동 값의 표시 자리만 정리 (값은 같다 → low_stock_since 그대로)
update public.reagents r
   set min_stock = trim_scale(r.min_stock)
 where r.min_stock_source = 'auto'
   and r.min_stock::text <> trim_scale(r.min_stock)::text;
