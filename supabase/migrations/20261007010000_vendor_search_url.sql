-- 판매처 검색어 자동 입력 (화면 6) — harness/d7-data.md §11 "검색어 자동 입력"·§12 (2026-10-07 사용자 결정)
--
-- 1) vendors.search_url text null — 검색 결과 주소 틀. `{q}` 자리에 시약 이름(URL 인코딩)이 들어간다.
--    제약: null 또는 (https:// 로 시작 + `{q}` 를 정확히 1번 포함 + 300자 이하).
-- 2) 공통 seed 4곳(school_id null, 이름으로 찾기)에 검색 주소를 채운다. 우리 학교 판매처는 null 그대로(웹사이트를 연다).
-- 3) search_url 은 화면·API 로 쓸 수 없다(마이그레이션으로만).
--    vendors 는 authenticated 에 테이블 단위 insert·update 권한이 있어 열 단위 revoke 는 효과가 없다.
--    그래서 reagents_guard_direct_change 와 같은 방식의 BEFORE 트리거로 막는다:
--      current_user 가 authenticated·anon 이고
--        INSERT: new.search_url 이 not null
--        UPDATE: new.search_url 이 old.search_url 과 다름
--      이면 42501. 마이그레이션(postgres)·service_role 은 그대로 쓸 수 있다.
--
-- 이 파일의 구문: add column if not exists, 조건부 add constraint, create or replace function·trigger, 함수 실행 권한 revoke,
-- update(공통 seed 4곳, 값이 다를 때만). drop·delete·truncate 없음. 한 번에 통째로 실행한다. 다시 실행해도 같은 결과가 된다.

-- ---------- 1. 열 + 제약 ----------
alter table public.vendors
  add column if not exists search_url text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.vendors'::regclass and conname = 'vendors_search_url_format') then
    alter table public.vendors
      add constraint vendors_search_url_format
      check (search_url is null
             or (left(search_url, 8) = 'https://'
                 and char_length(search_url) - char_length(replace(search_url, '{q}', '')) = 3
                 and char_length(search_url) <= 300));
  end if;
end;
$$;

-- ---------- 2. 직접 쓰기 검사 (API 역할은 search_url 을 쓸 수 없다) ----------
create or replace function private.guard_vendor_search_url()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (tg_op = 'INSERT' and new.search_url is not null)
       or (tg_op = 'UPDATE' and new.search_url is distinct from old.search_url) then
      raise exception 'vendor search_url only through migrations' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_vendor_search_url() from public, anon, authenticated;

create or replace trigger vendors_guard_search_url
  before insert or update on public.vendors
  for each row execute function private.guard_vendor_search_url();

-- ---------- 3. 공통 seed 4곳의 검색 주소 (2026-10-07 사용자 지정) ----------
update public.vendors v
   set search_url = s.search_url
  from (values
    ('11번가', 'https://search.11st.co.kr/Search.tmall?kwd={q}'),
    ('G마켓', 'https://www.gmarket.co.kr/n/search?keyword={q}'),
    ('오피스안', 'https://officeahn.com/product/search.html?keyword={q}'),
    ('퍼스트과학', 'https://firstsci.co.kr/product/search.html?keyword={q}')
  ) as s (name, search_url)
 where v.school_id is null
   and v.name = s.name
   and v.search_url is distinct from s.search_url;
