-- 재주문 알림 (화면 6) · 판매처 설정 (화면 9) — harness/d7-data.md §11·§12 (2026-10-05 결정)
--
-- 1) vendors 테이블 (school_id null = 공통 목록). 쓰기는 함수 없이 RLS 정책 + 테이블 제약으로.
--      select : teacher·admin — 자기 학교 행 + 공통 행. 학생·anon 0행
--      insert : admin — school_id = 자기 학교(null·다른 학교·데모 학교 불가)
--      update : admin — 자기 학교 행만, 바꾼 뒤에도 자기 학교 행(공통 행 수정 불가)
--      delete : admin — 자기 학교 행만(공통 행 삭제 불가)
--    테이블 권한: authenticated 에 select·insert·update·delete, anon 없음.
--    public 스키마는 새 테이블에 anon 권한을 자동으로 주는 기본 권한이 걸려 있다. 기본 권한이 없는 private 스키마에서
--    테이블을 만든 뒤 public 으로 옮겨, 권한 회수 구문 없이 "anon 권한 없음" 상태로 시작한다.
-- 2) 공통 목록 seed 4곳 (재실행 안전).
-- 3) reagents 열 3개 추가(모두 null 허용): reorder_per_group(1조 사용량) · reorder_groups(조 수) · low_stock_since(알림 시각).
--    low_stock_since 는 BEFORE INSERT OR UPDATE 트리거가 항상 계산값으로 덮어쓴다(직접 쓴 값 무시):
--      stock < min_stock 이면 — 이전에도 부족했고 값이 있으면 유지, 아니면 now()
--      아니면 null
--    기존 함수(record_usage·record_intake·register_reagent·save_cabinet_layout 등)는 바꾸지 않는다 — 모두 이 트리거를 거친다.
-- 4) backfill: 이미 부족한 기존 시약의 low_stock_since 를 적용 시각으로(값이 있는 행은 건드리지 않음).
--
-- 한 번에 실행(한 트랜잭션)하고, 다시 실행해도 같은 결과가 되게 썼다.

-- ---------- 1. vendors ----------
do $$
begin
  if to_regclass('public.vendors') is null then
    create table private.vendors (
      id uuid primary key default gen_random_uuid(),
      school_id uuid references public.schools (id),
      name text not null,
      contact text,
      website text,
      note text,
      created_at timestamptz not null default now(),
      constraint vendors_name_length
        check (char_length(regexp_replace(name, '^\s+|\s+$', '', 'g')) between 1 and 40),
      constraint vendors_contact_length
        check (contact is null or char_length(contact) <= 40),
      constraint vendors_website_format
        check (website is null
               or (website ~* '^https?://[^\s]+$' and char_length(website) <= 300)),
      constraint vendors_note_length
        check (note is null or char_length(note) <= 60),
      constraint vendors_not_demo_school
        check (school_id is null or school_id <> private.demo_school_id())
    );
    alter table private.vendors set schema public;
  end if;
end;
$$;

-- 같은 학교 안 이름 중복 불가 (대소문자·공백 무시). 공통 목록끼리도 같은 규칙.
create unique index if not exists vendors_school_name_key
  on public.vendors (school_id, lower(regexp_replace(name, '\s+', '', 'g')))
  where school_id is not null;
create unique index if not exists vendors_common_name_key
  on public.vendors (lower(regexp_replace(name, '\s+', '', 'g')))
  where school_id is null;

alter table public.vendors enable row level security;

grant select, insert, update, delete on table public.vendors to authenticated;
grant all on table public.vendors to service_role;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'vendors' and policyname = 'vendors_select_staff') then
    create policy vendors_select_staff on public.vendors
      for select to authenticated
      using ((select private.current_user_role()) in ('teacher', 'admin')
             and (school_id is null or school_id = (select private.current_school_id())));
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'vendors' and policyname = 'vendors_insert_admin') then
    create policy vendors_insert_admin on public.vendors
      for insert to authenticated
      with check ((select private.current_user_role()) = 'admin'
                  and school_id is not null
                  and school_id = (select private.current_school_id())
                  and school_id <> (select private.demo_school_id()));
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'vendors' and policyname = 'vendors_update_admin') then
    create policy vendors_update_admin on public.vendors
      for update to authenticated
      using ((select private.current_user_role()) = 'admin'
             and school_id is not null
             and school_id = (select private.current_school_id())
             and school_id <> (select private.demo_school_id()))
      with check ((select private.current_user_role()) = 'admin'
                  and school_id is not null
                  and school_id = (select private.current_school_id())
                  and school_id <> (select private.demo_school_id()));
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'vendors' and policyname = 'vendors_delete_admin') then
    create policy vendors_delete_admin on public.vendors
      for delete to authenticated
      using ((select private.current_user_role()) = 'admin'
             and school_id is not null
             and school_id = (select private.current_school_id())
             and school_id <> (select private.demo_school_id()));
  end if;
end;
$$;

-- ---------- 2. 공통 목록 seed (2026-10-05 사용자 지정) ----------
insert into public.vendors (school_id, name, website)
values
  (null, '11번가', 'https://www.11st.co.kr'),
  (null, 'G마켓', 'https://www.gmarket.co.kr'),
  (null, '오피스안', 'https://officeahn.com'),
  (null, '퍼스트과학', 'https://firstsci.co.kr')
on conflict do nothing;

-- ---------- 3. reagents: 재주문 기준 근거 · 알림 시각 ----------
alter table public.reagents
  add column if not exists reorder_per_group numeric,
  add column if not exists reorder_groups integer,
  add column if not exists low_stock_since timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.reagents'::regclass and conname = 'reagents_reorder_per_group_check') then
    alter table public.reagents
      add constraint reagents_reorder_per_group_check
      check (reorder_per_group is null or reorder_per_group > 0);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.reagents'::regclass and conname = 'reagents_reorder_groups_check') then
    alter table public.reagents
      add constraint reagents_reorder_groups_check
      check (reorder_groups is null or reorder_groups >= 1);
  end if;
end;
$$;

-- 값만 고치는 트리거 함수 (SECURITY INVOKER, 다른 테이블을 읽지 않는다)
create or replace function private.set_reagent_low_stock_since()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stock < new.min_stock then
    if tg_op = 'UPDATE' and old.stock < old.min_stock and old.low_stock_since is not null then
      new.low_stock_since := old.low_stock_since;
    else
      new.low_stock_since := now();
    end if;
  else
    new.low_stock_since := null;
  end if;
  return new;
end;
$$;

create or replace trigger reagents_low_stock_since
  before insert or update on public.reagents
  for each row execute function private.set_reagent_low_stock_since();

-- ---------- 4. backfill ----------
-- 이미 부족한 기존 시약만, 값이 없을 때만 (트리거가 now() 로 채운다 — 다시 실행하면 대상 0행)
update public.reagents
   set low_stock_since = now()
 where stock < min_stock
   and low_stock_since is null;
