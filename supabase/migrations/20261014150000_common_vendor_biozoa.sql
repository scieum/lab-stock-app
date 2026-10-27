-- 공통 판매처 생물나라 추가 (화면 6·9) — harness/d7-data.md §11 "검색어 자동 입력"·§12 "공통 목록" (2026-10-14 사용자 결정)
--
-- 1) 공통 목록(school_id null) seed 1곳: 생물나라, 웹사이트 https://www.biozoa.co.kr,
--    검색 주소 https://www.biozoa.co.kr/goods/search?search_text={q} (사이트 검색 폼 topSearchForm 의 search_text).
--    note 는 기존 공통 seed 관례대로 비운다.
-- 2) 이름이 이미 공통 목록에 있으면 건너뛴다(vendors_common_name_key, on conflict do nothing) — 기존 행은 건드리지 않는다.
--    vendors_guard_search_url 트리거는 current_user 가 authenticated·anon 일 때만 막는다 — 마이그레이션(postgres)은 통과.
--
-- 이 파일의 구문: insert … on conflict do nothing 하나. drop·delete·update·truncate 없음. 다시 실행해도 같은 결과가 된다.

insert into public.vendors (school_id, name, website, search_url)
values
  (null, '생물나라', 'https://www.biozoa.co.kr', 'https://www.biozoa.co.kr/goods/search?search_text={q}')
on conflict do nothing;
