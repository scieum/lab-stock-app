-- 공통 판매처 6곳 추가 · 학교 즐겨찾기 (화면 6·9) — harness/d7-data.md §12-1 (2026-10-07 사용자 결정)
--
-- 1) 공통 목록(school_id null) seed 6곳. 이름이 이미 있으면 건너뛴다(vendors_common_name_key, on conflict do nothing).
--    search_url 은 "염산" 검색 결과를 확인한 5곳만, 덕산종합과학은 null(웹사이트를 연다). note 는 비운다.
--    vendors_guard_search_url 트리거는 current_user 가 authenticated·anon 일 때만 막는다 — 마이그레이션(postgres)은 통과.
-- 2) vendor_favorites — 학교 단위 즐겨찾기. (school_id, vendor_id) 하나만. 판매처가 지워지면 함께 사라진다(on delete cascade).
--      select : teacher·admin — 자기 학교 행. 학생·anon 0행
--      insert : teacher·admin — 자기 학교 + 데모 학교 아님 + 대상 판매처가 공통 목록이거나 자기 학교 것 + created_by = auth.uid()
--      delete : teacher·admin — 자기 학교 + 데모 학교 아님
--      update : 정책 없음(권한도 주지 않는다)
--    테이블 권한: authenticated 에 select·insert·delete, anon 없음. vendors 와 같이 private 스키마에서 만든 뒤 public 으로 옮겨
--    public 기본 권한(anon 자동 부여) 없이 시작한다.
--
-- 이 파일의 구문: insert … on conflict do nothing, 조건부 create table·policy, create index if not exists, grant.
-- drop·delete·truncate 없음. 한 번에 통째로 실행한다. 다시 실행해도 같은 결과가 된다.

-- ---------- 1. 공통 목록 seed 6곳 (2026-10-07 사용자 지정) ----------
insert into public.vendors (school_id, name, website, search_url)
values
  (null, '과학생각', 'https://ideascience.co.kr', 'https://ideascience.co.kr/product/search.html?keyword={q}'),
  (null, '사이언스툴', 'https://sciencetool.co.kr', 'https://sciencetool.co.kr/product/search.html?keyword={q}'),
  (null, '컴사이언스', 'https://comscience.co.kr', 'https://comscience.co.kr/product/search.html?keyword={q}'),
  (null, '양원과학', 'https://ywscience.co.kr', 'https://ywscience.co.kr/product/search.html?keyword={q}'),
  (null, '과학랩', 'https://sciencelabstore.co.kr', 'https://sciencelabstore.co.kr/product/search.html?keyword={q}'),
  (null, '덕산종합과학', 'https://www.dslab.co.kr', null)
on conflict do nothing;

-- ---------- 2. vendor_favorites ----------
do $$
begin
  if to_regclass('public.vendor_favorites') is null then
    create table private.vendor_favorites (
      school_id uuid not null references public.schools (id),
      vendor_id uuid not null references public.vendors (id) on delete cascade,
      created_by uuid references auth.users (id) on delete set null,
      created_at timestamptz not null default now(),
      primary key (school_id, vendor_id),
      constraint vendor_favorites_not_demo_school
        check (school_id <> private.demo_school_id())
    );
    alter table private.vendor_favorites set schema public;
  end if;
end;
$$;

create index if not exists vendor_favorites_vendor_id_idx on public.vendor_favorites (vendor_id);
create index if not exists vendor_favorites_created_by_idx on public.vendor_favorites (created_by);

alter table public.vendor_favorites enable row level security;

grant select, insert, delete on table public.vendor_favorites to authenticated;
grant all on table public.vendor_favorites to service_role;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'vendor_favorites' and policyname = 'vendor_favorites_select_staff') then
    create policy vendor_favorites_select_staff on public.vendor_favorites
      for select to authenticated
      using ((select private.current_user_role()) in ('teacher', 'admin')
             and school_id = (select private.current_school_id()));
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'vendor_favorites' and policyname = 'vendor_favorites_insert_staff') then
    create policy vendor_favorites_insert_staff on public.vendor_favorites
      for insert to authenticated
      with check ((select private.current_user_role()) in ('teacher', 'admin')
                  and school_id = (select private.current_school_id())
                  and school_id <> (select private.demo_school_id())
                  and created_by = (select auth.uid())
                  and exists (select 1
                                from public.vendors v
                               where v.id = vendor_favorites.vendor_id
                                 and (v.school_id is null or v.school_id = vendor_favorites.school_id)));
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'vendor_favorites' and policyname = 'vendor_favorites_delete_staff') then
    create policy vendor_favorites_delete_staff on public.vendor_favorites
      for delete to authenticated
      using ((select private.current_user_role()) in ('teacher', 'admin')
             and school_id = (select private.current_school_id())
             and school_id <> (select private.demo_school_id()));
  end if;
end;
$$;
