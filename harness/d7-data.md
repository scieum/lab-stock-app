# 데이터·권한 (D7) — MVP

## 1. 테이블

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| schools | id, neis_code(SD_SCHUL_CODE, unique, 데모 학교는 null), office_code(ATPT_OFCDC_SC_CODE), name, sido, region, is_demo(boolean, 기본 false) | 회원가입(14)에서 그 학교 첫 가입 시 생성 |
| profiles | user_id(auth.users), school_id, role(student·teacher·admin), display_name | 사용자당 1개 |
| cabinets | id, school_id, label, door_type(양문형·단문형), shelves(3·4) | 학교당 여러 개 (화면 11, §9). label 기본값 "{n}번 시약장" |
| cabinet_slots | id, cabinet_id, side(L·R), shelf, 보관 분류 여러 개(0개 = 미지정) | 분류 ∈ rules.json cabinet.storage_classes. 한 칸에 여러 분류 가능 (화면 11, §9) — 기존 단일 storage_class 에서 확장 |
| reagents | id, school_id, name, cas_no, unit, stock, min_stock, msds_url, slot_id, intake_date, storage_class(null 허용), reorder_per_group·reorder_groups·low_stock_since(null 허용, §11) | stock < min_stock → 재고 부족(핑크). storage_class ∈ rules.json cabinet.storage_classes (화면 7 "종류") |
| vendors | id, school_id(null = 공통), name, contact, website, note, created_at | 화면 9 (§12) |
| usage_logs | id, school_id, reagent_id, user_id, amount, used_at, memo(null 허용, 200자 이하) | 화면 4에서 생성, reagents.stock 차감. memo 는 화면 4 "메모" 입력 → 화면 10 상세 (§7) |
| intake_logs | id, school_id, reagent_id, user_id, amount, intake_date, created_at | 화면 7에서 생성, reagents.stock 증가 (§6) |

## 2. RLS (N1)

- 모든 업무 테이블: `school_id = (select school_id from profiles where user_id = auth.uid())` 일 때만 select·insert·update·delete
- profiles: 자기 행 select, 같은 학교 행은 admin만 update
- 역할 제한 (R-db):
  - usage_logs insert: 모든 역할 (자기 user_id만)
  - reagents insert·update(stock 증가): teacher·admin만
  - cabinets·cabinet_slots 변경: teacher·admin만 (R7) — 화면 11 부터는 §9 의 DB 함수로만
- 재고 차감은 DB 함수(`record_usage`) 하나로만 — 사용 기록 insert와 stock 차감을 한 트랜잭션으로

## 3. 서버 API (N2)

| 경로 | 하는 일 | 키 |
|---|---|---|
| GET /api/neis/sido | 시/도 목록 (재외한국학교 제외) | NEIS_API_KEY (서버 env) |
| GET /api/neis/regions?sido= | 지역(시/군/구) 목록 | 〃 |
| GET /api/neis/schools?sido=&region=&kind= | 그 학교급(초등학교·중학교·고등학교 — rules.json 1.18 neis.school_kinds) 학교 목록. kind 가 3종 밖이면 400 (2026-10-07, §19) | 〃 |

- 디자인 하네스 `harness/scripts/neis.py`의 지역 규칙(도로명주소 두 번째 토큰, 없으면 시/도)을 그대로 옮긴다.
- NEIS 응답은 서버에서 하루 캐시(학교 목록은 거의 안 바뀜).

## 4. 가입·로그인 흐름 (2026-10-02)

1. 회원가입(14): `/api/neis/*`로 학교 선택 → Supabase Auth signUp(개인 이메일·비밀번호) → 서버(lib/server)가 schools upsert(neis_code) + profiles insert(school_id, role = 그 학교 첫 사용자면 admin, 아니면 student — 단 그 학교에 이 이메일의 대기 초대가 있으면 초대 역할, §8)
2. 로그인(1): signInWithPassword(이메일·비밀번호)만. 학교는 profiles.school_id에서 읽는다 — 로그인 화면에서 학교를 받지 않는다(받은 값으로 학교를 바꿀 수 없게).
3. 비밀번호 찾기: Supabase 비밀번호 재설정 메일.

## 5. 데모 학교 (둘러보기, 2026-10-03 결정)

| 항목 | 결정 |
|---|---|
| 레코드 | schools에 `is_demo = true`, name = "데모 학교"(design/rules.json guest.school_name), neis_code = null 인 행 1개. 마이그레이션 seed로만 만든다 |
| 데이터 | 시약 15~20종(재고 부족 1~2종 포함), 시약장 1개(양문형 4단, 칸 분류 지정), 최근 사용 기록 10건 — 사용자 이름은 "학생 A"·"교사 B"처럼 가짜 |
| 읽기 | RLS: anon 역할은 `school_id = 데모 학교`인 행만 select. 로그인 사용자의 기존 정책(자기 학교만)은 그대로 — 로그인 사용자는 둘러보기 화면에 오지 않는다(/demo → /) |
| 쓰기 | 데모 학교 행은 anon·authenticated 모두 insert·update·delete 정책 없음(= 거부). seed 변경은 마이그레이션으로만 |
| 분리 (N1) | 데모 학교는 가입 학교 목록에 나오지 않는다(NEIS 목록에서만 선택, is_demo 학교는 profiles.school_id가 될 수 없음 — check 제약 또는 트리거). 실제 학교 데이터는 anon에게 0행 |
| 키 (N2) | 둘러보기는 NEIS·Gemini 호출 없음. Supabase anon 키만 사용 |
| 화면 | /demo(13 둘러보기 홈) · /demo/reagents(2) · /demo/reagents/[id](3). 상단 guest-banner, 쓰기·범위 밖 진입점 guest-lock(탭 시 ex-toast "가입하면 쓸 수 있어요"), 탭바 QR 스캔·기록 잠금 |

## 6. 입고·시약 등록 (화면 7, 2026-10-03 결정)

| 항목 | 결정 |
|---|---|
| 권한 | teacher·admin만. 학생은 화면(/intake → /)·DB(RLS·함수) 모두 거부 (R5, R-db) |
| 기존 시약 입고 | DB 함수 `record_intake(reagent_id, amount, intake_date)` 하나로만 — intake_logs insert + reagents.stock 증가 + reagents.intake_date 갱신을 한 트랜잭션으로. amount ≥ 1, 자기 학교 시약만 |
| 새 시약 등록 | DB 함수 `register_reagent(name, storage_class, stock, unit, intake_date, msds_url)` — reagents insert + 첫 재고에 대한 intake_logs 1행을 한 트랜잭션으로. school_id 는 호출자의 profiles.school_id (입력으로 받지 않는다) |
| 종류 | 화면의 "종류" 드롭다운 = storage_class 8종(rules.json cabinet.storage_classes). 필수 |
| 단위 | 병·mL·g 중 선택 (시안의 단위 suffix 자리) |
| 시안에 없는 값 | min_stock = 0(재주문 알림 없음), slot_id = null(시약장 칸은 화면 11에서), cas_no = null |
| intake_logs RLS | select: 같은 학교. insert 는 위 함수로만(직접 insert 정책 없음). update·delete 없음 |
| 데모 학교 | 입고·등록 불가(§5 쓰기 금지 그대로) |
| 저장 후 | ex-toast "입고를 기록했어요" / "시약을 등록했어요" → 화면 2(/reagents) |

## 7. 사용 기록 내역 (화면 10, 2026-10-03 결정)

| 항목 | 결정 |
|---|---|
| 권한 | 학생·교사·admin 모두. 같은 학교의 usage_logs 만 (기존 RLS 그대로, N1). 읽기 전용 화면 — 수정·삭제 없음 |
| 대상 | 사용 기록만. 입고 기록(intake_logs)은 이 화면에 보여 주지 않는다 (시안 그대로) |
| 메모 | usage_logs.memo 추가. `record_usage` 가 memo(선택)를 받아 저장 — 빈 문자열은 null, 200자 초과는 거부. 화면 4 에 "메모" 입력(선택 항목) 추가 |
| 필터 | "전체 / 내 기록"(내 기록 = user_id 가 로그인 사용자), 기간 = 최근 1개월(기본)·3개월·6개월·전체, 시약명 검색(부분 일치) |
| 목록 | 최신순, 월 그룹 헤더("2026년 10월"). 행 = 날짜 · 시약명 / 사용자 이름 · 사용량+단위. 0건이면 ex-empty-state-card "아직 사용 기록이 없어요" |
| 사용자 이름 | 같은 학교 사용자의 display_name 만 (기존 private.same_school_display_name 방식). 다른 학교 사용자 이름 노출 0 |
| 상세 | 행을 누르면 ex-modal-card: 시약명 + 사용량, 사용자 · 일시 · 메모(없으면 "-"), msds-entry "MSDS 보기"(시약에 msds_url 이 있을 때 새 창), "닫기" |
| 진입 | 탭바 "기록", nav "사용 기록 내역", 홈 "더 보기" → /usage (지금까지는 /usage/new 로 넘겼음) |
| 데모 학교 | 둘러보기에서는 탭바 "기록" 잠금 그대로 (§5) |

## 8. 사용자 관리 (화면 8, 2026-10-04 결정)

| 항목 | 결정 |
|---|---|
| 권한 | admin만. 학생·교사는 화면(/users → /)·DB(RLS·함수) 모두 거부 (R6, R-db). 같은 학교 사용자만 보이고 바꿀 수 있다 (N1) |
| 멤버 목록 | 같은 학교 profiles: 이름·역할, 본인 행 "나" 표시. 헤더 "{학교명} 사용자 N명" + "학생 a · 교사 b · admin c". 이름 검색(부분 일치). 멤버의 이메일은 보여 주지 않는다 |
| 역할 변경 | DB 함수 `change_member_role(user_id, role)` 하나로만 — admin 호출, 대상은 같은 학교, role ∈ student·teacher·admin. 학교의 마지막 admin 은 다른 역할로 바꿀 수 없다("admin이 최소 1명 있어야 해요"). profiles 직접 update 로 역할을 바꾸는 길은 막는다(기존 profiles_update_admin 정책이 이 함수 밖의 역할 변경을 허용하지 않게) |
| 사용자 삭제 | = 학교에서 내보내기. DB 함수 `remove_member(user_id)` — admin 호출, 대상은 같은 학교, 본인과 마지막 admin 은 불가. profiles 행만 지운다(로그인 계정은 남음). 그 사람의 usage_logs·intake_logs 는 보존, 이름은 "삭제된 사용자"로 표시 |
| 내보낸 계정 | 로그인하면 앱 화면 대신 "소속 학교가 없어요" 안내와 로그아웃만. 같은 이메일로 회원가입(14)을 다시 하면 프로필을 새로 만들어 다시 들어올 수 있다(초대가 있으면 초대 역할, 없으면 학생) |
| 초대 | `invites` 테이블: id, school_id, email(소문자), role(student·teacher), invited_by, invited_at, accepted_at(null = 대기). 메일은 보내지 않는다 — admin 이 "초대 링크 복사"로 회원가입 주소를 직접 전달. 같은 학교에 이미 멤버인 이메일·이미 대기 중인 이메일은 거부. 한 번에 여러 명 초대("N명 초대") |
| 초대 수락 | 회원가입(14)에서 그 이메일이 그 학교에 가입하면 `register_profile` 이 대기 초대의 역할을 붙이고 accepted_at 을 채운다. 초대가 없으면 기존 규칙(그 학교 첫 가입자 admin, 이후 학생). 초대는 다른 학교 가입에는 영향 없음. 초대 역할에 admin 은 없다 |
| 초대 대기 목록 | accepted_at 이 null 인 초대: 이메일 · 초대일 · "대기". 초대 취소는 시안에 없어 이번에는 만들지 않는다 |
| invites RLS | select·insert: 같은 학교 admin 만(함수로만 쓰기). 학생·교사·anon·다른 학교 0행 |
| 데모 학교 | 사용자 관리 없음(§5 쓰기 금지 그대로, 데모 학교로 가입 불가) |
| 저장 후 | ex-toast "N명을 초대했어요" / "역할을 바꿨어요" / "사용자를 삭제했어요" → 목록 갱신 |

## 9. 시약장 설정 (화면 11, 2026-10-05 결정 — design/rules.json cabinet 1.14)

| 항목 | 결정 |
|---|---|
| 권한 | 보기: 학생·교사·admin 모두(같은 학교 시약장만, N1). 추가·이름 바꾸기·삭제·문 형태·단 수·칸 분류 편집: 교사·admin만 (rules.json cabinet.manage_roles, R7: 학생 화면의 cabinet-edit·cabinet-add = 0, R-db) |
| 여러 시약장 | 학교당 여러 개(rules.json cabinet.multiple). 화면의 활성 시약장은 `?c={id}`. 0개면 빈 상태(11-empty) |
| 추가 | DB 함수 `add_cabinet()` — 교사·admin. 이름 = 다음 번호 "{n}번 시약장"(n = 그 학교에서 쓰지 않은 가장 작은 번호가 아니라 지금까지의 최대 번호 + 1), 기본 양문형·4단, 칸은 모두 미지정. 학교당 최대 20개 |
| 이름 바꾸기 | DB 함수 `rename_cabinet(cabinet_id, label)` — 교사·admin, 자기 학교. trim 후 1~20자, 같은 학교에 같은 이름 불가 |
| 설정 저장 | DB 함수 `save_cabinet_layout(cabinet_id, door_type, shelves, slots)` 하나로만 — 문 형태·단 수·칸별 분류(여러 개)를 한 트랜잭션으로 저장. door_type ∈ cabinet.door_types, shelves ∈ cabinet.shelves, 분류 ∈ cabinet.storage_classes. 칸 = (side L·R, shelf 1~shelves), 단문형은 한쪽만 |
| 칸 줄이기 | 양문형→단문형·4단→3단으로 사라지는 칸: 그 칸의 분류는 지우고, 그 칸에 배치된 시약은 삭제하지 않고 slot 배치만 해제("칸 없음"). 화면은 저장 전에 "이 변경으로 시약 N종이 '칸 없음'이 돼요" 를 저장 버튼 위에 안내 (2026-10-04 사용자 결정) |
| 삭제 | DB 함수 `delete_cabinet(cabinet_id)` — 교사·admin, 자기 학교. 그 시약장의 칸을 지우고 배치된 시약은 "칸 없음"으로(시약 행·재고는 그대로, rules.json cabinet.on_delete). 확인 카드에 배치된 시약 수 표시 |
| 직접 쓰기 | cabinets·cabinet_slots 의 직접 insert·update·delete 는 위 함수 밖에서 할 수 없게 한다(기존 teacher·admin 직접 쓰기 정책을 함수 경유로 좁힘). 학생·다른 학교·anon·데모 학교 쓰기 거부 |
| 혼재 경고 | 같은 칸에 rules.json cabinet.incompatible 조합이 있으면 mix-warning 한 줄씩("{칸}: {A}과 {B}는 섞이면 위험해요. 다른 칸에 나눠 보관하세요"). 저장은 막지 않는다(경고만). 학생에게도 보기 전용으로 표시 |
| 칸 없음 시약 | 화면 아래 "칸 없음 시약 (N)": 그 학교에서 slot 배치가 없는 시약(어느 시약장을 보고 있든 같은 목록). 행을 누르면 시약 상세(화면 3) |
| 시약 배치 | §14 (2026-10-06): 화면 11 칸 시트·화면 3 위치 바꾸기. 새로 등록한 시약은 "칸 없음"으로 시작 (화면 7 등록 폼에는 위치 없음) |
| 데모 학교 | 둘러보기에는 화면 11 없음. 데모 학교 시약장 쓰기 금지(§5) 그대로 |
| 저장 후 | ex-toast "시약장 설정을 저장했어요" / "이름을 바꿨어요" / "{이름}을 추가했어요" / "{이름}을 삭제했어요" |

## 11. 재주문 알림 (화면 6, 2026-10-05 결정)

| 항목 | 결정 |
|---|---|
| 권한 | 교사·admin만. 학생은 화면(/reorder → /)·진입 링크 모두 없음 (R2: 학생의 reorder-alert-card·vendor-link = 0) |
| 알림 대상 | 같은 학교 시약 중 `stock < min_stock` (홈의 재고 부족과 같은 기준). 부족한 정도가 큰 순 |
| 재주문 기준 | `reagents.min_stock` = 필요량. 기준의 근거(1반 1회 실험량 × 조 수)는 `reagents.reorder_per_group`(1조 사용량)·`reorder_groups`(조 수)에 둔다(null 허용) — 화면 5(실험 매뉴얼)가 채운다. 값이 있으면 카드에 "1반 1회 실험량 {per_group} {unit} × {groups}조 기준", 없으면 "재주문 기준 {min_stock} {unit}". 2026-10-08: 카드 수량 줄이 "재주문 기준 N" 이 되어 같은 말이 두 번 보이므로, 직접 입력(source=manual) 카드의 기준 문구 줄은 "직접 입력"(화면 3 과 같은 말), 자동은 배지 + 캡션(§18), 근거(basis)는 "1반 1회 실험량 … 기준" 그대로 |
| 알림 날짜 | `reagents.low_stock_since`(timestamptz, null 허용): 재고가 기준 아래로 내려간 시각. stock·min_stock 이 바뀔 때 DB 가 맞춘다(아래로 내려가면 그 시각, 다시 기준 이상이면 null, 이미 부족한 상태가 이어지면 유지). 카드에 "M월 D일 알림"(한국 시간, 올해가 아니면 "YYYY년 M월 D일 알림" — 2026-10-08 디자인 1.21 맞춤, 전에는 "YYYY.MM.DD 알림"). 이 열을 추가할 때 이미 부족한 기존 시약은 추가 시각으로 채운다 |
| 카드 | reorder-alert-card: badge-low-stock "재고 부족" + 시약명 + "재주문 기준 {min_stock}{unit} / 현재 재고 {stock}{unit}"(2026-10-08 디자인 1.21 맞춤, 전에는 "필요량 …") + 기준 문구 + 알림 날짜 + vendor-link "판매처 연결" |
| 판매처 연결 | vendor-link → ex-modal-card: 판매처 목록(우리 학교 판매처 먼저, 그다음 공통 목록; 행 = 판매처명 + 부가 정보) 중 하나를 고르고 "확인" → 그 판매처의 웹사이트를 새 창으로 연다(2026-10-05 사용자 결정). 아무것도 저장하지 않는다. 웹사이트가 없는 판매처를 고르면 "확인" 비활성 + 연락처 안내. 판매처가 하나도 없으면 안내 문구(admin 에게는 판매처 등록으로 가는 길) |
| 검색어 자동 입력 | (2026-10-07 사용자 결정) 공통 목록 4곳은 웹사이트 대신 그 판매처의 검색 결과 주소를 연다. 검색어 = 시약 이름 그대로(앞뒤 공백만 정리, URL 인코딩). 검색 주소는 `vendors.search_url`(null 허용, `{q}` 자리에 검색어) — 공통 seed 만 채운다: 11번가 `https://search.11st.co.kr/Search.tmall?kwd={q}`, G마켓 `https://www.gmarket.co.kr/n/search?keyword={q}`, 오피스안 `https://officeahn.com/product/search.html?keyword={q}`, 퍼스트과학 `https://firstsci.co.kr/product/search.html?keyword={q}`. search_url 이 없는 판매처(우리 학교 판매처 전부)는 지금처럼 웹사이트를 연다. 화면 9 에는 입력 칸을 더하지 않는다(화면·API 로 search_url 을 쓸 수 없음 — 마이그레이션으로만) |
| 판매처 등록 진입 | vendor-register: 목록 아래 "판매처 등록" → 화면 9. admin 에게만 보인다(R3) |
| 매뉴얼 진입 | manual-upload: 재주문 기준 안내 박스("필요량 = 1반 1회 실험량 × 조 수") + "실험 매뉴얼 올리기" → 화면 5(`/manual`, 다음 run). 교사·admin만 (R1) |
| 0건 | ex-empty-state-card "재고가 부족한 시약이 없어요" |
| 데모 학교 | 둘러보기에는 화면 6 없음 |

### 11-1. 재주문 기준 자동 (2026-10-06 사용자 결정)

| 항목 | 결정 |
|---|---|
| 기준의 출처 | `reagents.min_stock_source` ∈ 'auto'(자동)·'basis'(화면 5 실험 매뉴얼)·'manual'(화면 3 직접 입력). 매뉴얼·직접 입력 값이 있으면 그것이 우선, 없으면 자동 |
| 자동 값 | 최근 28일 사용 기록이 있으면 **(최근 28일 사용량 합 ÷ 4) × 2주** = 28일 합 ÷ 2. 없으면 **마지막 입고량 × 20%**(intake_logs 의 가장 최근 amount; 입고 기록이 없으면 0). 소수 3자리 반올림. 0 이면 알림 없음 |
| 다시 계산 | source = 'auto' 인 시약만, 그 시약의 사용 기록 추가(record_usage)·입고(record_intake)·등록(register_reagent) 때 DB 가 다시 계산(트리거 또는 함수 안). 시간이 지나 28일 창에서 빠지는 사용 기록은 다음 사용·입고 때 반영(매일 다시 계산은 하지 않음 — 한계). 2026-10-07 부터 28일은 사용일(used_on, §15) 기준 |
| 기존 행 | 근거 열(reorder_per_group)이 있으면 'basis', min_stock > 0 이고 근거가 없으면 'manual', min_stock = 0 이면 'auto'(지금 자동 값으로 채움) |
| 화면 5 와의 관계 | `save_reorder_basis`: source 가 'auto' 이면 필요량으로 항상 바꾸고 'basis', 'basis'·'manual' 이면 지금처럼 더 큰 값만(§13) |
| 화면 3 직접 입력 | `set_reorder_threshold` → 'manual'(지금처럼 덮어씀). 교사·admin 이 "자동으로 돌리기"를 누르면 'auto' 로 바꾸고 자동 값으로 다시 계산(함수 `reset_reorder_threshold(p_reagent_id)` 또는 같은 함수의 인자) |
| 표시 | reorder-threshold 줄: 자동이면 값 옆에 "자동" 표시 + 근거 한 줄("최근 4주 사용량 기준" / "마지막 입고량의 20%" / 0 이면 "아직 없어요"). 화면 6 알림 카드의 기준 문구도 같은 세 형태 + 기존 두 형태 |
| 시안 | "자동" 표시·근거 문구·"자동으로 돌리기"는 시안에 없는 추가(사용자 결정) — 디자인 하네스 요청서 2(2026-10-06) 4번에 반영 요청함 |

## 12. 판매처 설정 (화면 9, 2026-10-05 결정)

| 항목 | 결정 |
|---|---|
| 권한 | admin만. 학생·교사는 화면(/vendors → /)·진입 링크 없음 (R3: vendor-register 는 admin 만). 판매처 읽기는 교사·admin(화면 6 의 판매처 연결에 필요), 학생·anon 0행 |
| 테이블 | `vendors`: id, school_id(null = 공통 목록), name(1~40자), contact(연락처, null 허용 40자), website(null 또는 http(s):// 로 시작, 300자), note(부가 정보, null 허용 60자), created_at. 같은 학교 안 이름 중복 불가(대소문자·공백 무시) |
| 우리 학교 판매처 | school_id = 자기 학교. admin 이 등록·수정·삭제. 다른 학교 0행 (N1) |
| 공통 목록 | school_id = null. 모든 학교의 교사·admin 이 읽기만. 화면·API 로는 쓸 수 없다(마이그레이션 seed 로만). 처음 seed(2026-10-05 사용자 지정): 11번가(https://www.11st.co.kr), G마켓(https://www.gmarket.co.kr), 오피스안(https://officeahn.com), 퍼스트과학(https://firstsci.co.kr) |
| 쓰기 방식 | RLS 정책으로 직접 insert·update·delete(자기 학교 + admin + 데모 학교 아님). 값 검증은 테이블 제약으로. school_id 를 다른 학교·null 로 넣거나 바꿀 수 없다 |
| 화면 | segmented-control "우리 학교 판매처 / 공통 목록", 판매처명 검색, 목록 행(판매처명 + 부가 정보 = 연락처 · note, 더보기 "수정"·"삭제"), "판매처 등록" → 폼(판매처명 필수, 연락처, 웹사이트 주소) → 저장. 삭제는 확인 카드 "이 판매처를 삭제할까요?". 0건이면 ex-empty-state-card "등록한 판매처가 없어요". 공통 목록 탭은 보기 전용 2열 |
| 저장 후 | ex-toast "판매처를 저장했어요" / "판매처를 삭제했어요", 방금 등록·수정한 행 강조 |
| 데모 학교 | 판매처 쓰기 금지(§5), 둘러보기에는 화면 9 없음 |

### 12-1. 공통 판매처 추가·즐겨찾기 (2026-10-07 사용자 결정)

| 항목 | 결정 |
|---|---|
| 공통 목록 추가 seed | 과학 교구·시약 쇼핑몰 6곳을 공통 목록에 더한다(이름 중복이면 건너뜀). 검색 주소는 "염산" 검색 결과가 나오는 것을 확인한 곳만: 과학생각(https://ideascience.co.kr, `https://ideascience.co.kr/product/search.html?keyword={q}`), 사이언스툴(https://sciencetool.co.kr, `https://sciencetool.co.kr/product/search.html?keyword={q}`), 컴사이언스(https://comscience.co.kr, `https://comscience.co.kr/product/search.html?keyword={q}`), 양원과학(https://ywscience.co.kr, `https://ywscience.co.kr/product/search.html?keyword={q}`), 과학랩(https://sciencelabstore.co.kr, `https://sciencelabstore.co.kr/product/search.html?keyword={q}`), 덕산종합과학(https://www.dslab.co.kr, 검색 주소 없음 → 웹사이트). note 는 비워 둔다. 공통 목록은 모두 10곳 |
| 즐겨찾기 | 학교 단위로 공유. 테이블 `vendor_favorites`(school_id, vendor_id, created_by, created_at; (school_id, vendor_id) 하나만). 대상 = 자기 학교 판매처 + 공통 목록. 판매처가 지워지면 즐겨찾기도 함께 사라진다 |
| 즐겨찾기 권한 | 교사·admin 이 추가·해제(자기 학교 행만, 데모 학교 쓰기 금지). 읽기는 교사·admin. 학생·anon 0행 (N1·R) |
| 화면 6 판매처 연결 | 각 판매처 행에 별표 버튼(즐겨찾기 추가·해제, 누르면 바로 저장). 즐겨찾기가 1곳 이상이면 목록에는 즐겨찾기만 보이고, 아래 글자 버튼 "모든 판매처 보기"로 전체를 펼친다(펼친 뒤에는 즐겨찾기가 맨 위). 즐겨찾기가 없으면 처음부터 전체(지금 순서) |
| 화면 9 판매처 설정 | admin 은 "우리 학교 판매처"·"공통 목록" 두 탭의 행에서도 별표로 추가·해제 |
| 시안 | 별표·"모든 판매처 보기"는 시안에 없는 추가(사용자 결정, 시안 예외) — 디자인 하네스에 나중에 반영 요청 |

## 13. 실험 매뉴얼 (화면 5, 2026-10-05 결정)

| 항목 | 결정 |
|---|---|
| 권한 | 교사·admin만. 학생은 화면(/manual → /)·API·진입 링크 모두 없음 (R1: 학생의 manual-upload = 0) |
| 흐름 | 1단계: 매뉴얼 파일 1개 + 조 수 → "AI 추출" → 처리 중("사용량을 찾고 있어요") → 2단계: 추출 결과 확인 표 → "확인 후 저장" → ex-toast "재주문 기준을 저장했어요" → 화면 6(/reorder). "다시 추출"은 같은 파일로 다시 요청. 사용자가 확인하기 전에는 아무것도 저장하지 않는다 |
| 파일 | PDF·JPG·PNG 1개, 4MB 이하. 서버에 보관하지 않는다 — 추출 요청 동안만 쓰고 버린다(DB·저장소에 남기지 않음, 로그에 내용 금지) |
| 조 수 | 1~20 정수 |
| AI 추출 (N2) | 서버 Route Handler `POST /api/manual/extract` 에서만 Gemini 를 부른다. 키는 `GEMINI_API_KEY`(서버 env, NEXT_PUBLIC_ 금지), 모델은 저렴한 Gemini Flash 계열(env `GEMINI_MODEL` 로 바꿀 수 있게, 기본값은 구현 시점의 공식 문서 기준). 응답은 구조화 출력(JSON): 시약별 {시약명, 1조 사용량(숫자), 단위}. 요청마다 로그인·역할(교사·admin)·학교 확인. 키가 없으면 503 "AI 추출을 쓸 수 없어요(서버 설정)" |
| 단위 | 추출 단위는 병·mL·g 중 하나로 정리(L→mL, kg→g, mg→g 환산; 그 밖은 사용자가 고침). 우리 학교 시약과 단위가 다르면 그 행은 저장 전에 사용자가 맞춰야 한다(자동 환산은 mL↔L, g↔kg·mg 만) |
| 시약 연결 | 추출한 시약명을 우리 학교 시약과 자동 연결(이름이 같거나 비슷한 것: 공백·대소문자·괄호 농도 표기 무시, 포함 관계) + 표의 행마다 "우리 학교 시약" 선택 칸에서 사용자가 바꿀 수 있다(2026-10-05 사용자 결정 — 시안에 없는 열). 연결되지 않은 행은 "등록되지 않은 시약"으로 표시하고 저장에서 빠진다. 한 시약에 두 행이 연결되면 사용량을 합친다 |
| 확인 표 | 4열(시약명 · 1조 사용량 · 단위 · 1반 1회 필요량 = 1조 사용량 × 조 수) + 우리 학교 시약 선택 + 이미 기준이 있는 시약은 "기존 기준 N" 표시. 사용량은 고칠 수 있고 고친 칸은 연하늘. 행 삭제(추출이 틀린 행) 가능 |
| 저장 | DB 함수 `save_reorder_basis(p_items jsonb)` 하나로 — 교사·admin, 자기 학교 시약만(다른 학교·데모 거부). 항목 = {reagent_id, per_group, groups}. 필요량 = per_group × groups. **기존 min_stock 보다 클 때만** min_stock·reorder_per_group·reorder_groups 를 그 값으로 바꾼다(더 큰 값 유지 — 2026-10-05 사용자 결정). 작거나 같으면 그대로 두고 결과에 "유지"로 알려 준다. low_stock_since 는 §11 트리거가 맞춘다 |
| 한도 | 추출 요청은 사용자당 짧은 시간에 연속 호출을 제한(예: 분당 5회)하고, 실패(시간 초과·형식 오류·시약을 못 찾음)는 사람이 읽을 문구로 |
| 데모 학교 | 둘러보기에는 화면 5 없음, 데모 학교 저장 금지(§5) |
| 중복 (2026-10-06 사용자 결정) | 같은 시약이 여러 번 나오지 않게: AI 프롬프트에 "준비물·시약 목록이 있으면 그 목록의 양만 쓰고, 목록이 없으면 실험 과정에 나온 양을 시약별로 합쳐 시약마다 한 줄"을 넣는다. 화면에서도 정리 뒤 이름 열쇠(reagentNameKey)가 같고 단위가 같은(정규화 뒤) 행은 한 줄로 합쳐 1조 사용량을 더하고 "N개 행을 합쳤어요" 안내(값은 고칠 수 있음). 단위가 다르면 합치지 않는다. 합친 뒤에도 같은 우리 학교 시약에 연결된 행은 기존 규칙대로 저장 때 합산 |
| 테스트 | 실제 Gemini 호출은 자동 테스트에서 하지 않는다(비용·불안정). 화면 테스트는 추출 API 응답을 가로채 대체하고, 서버 쪽은 권한·입력 검증·키 없음 처리까지 자동 검증. 실제 추출은 미리보기에서 사람이 확인 |

## 14. 시약 칸 배치·시약장 번호·QR 인쇄·재주문 기준 직접 입력 (화면 3·11, 2026-10-06 결정 — design/rules.json 1.15 cabinet·reorder)

| 항목 | 결정 |
|---|---|
| 시약장 번호 | `cabinets.number` int: 학교 안 고정 번호 1, 2, 3 … 이름과 별개, 바뀌지 않음, **삭제된 번호는 다시 쓰지 않음**(학교별 마지막 번호를 따로 기억 — 예: `schools.cabinet_seq`). 기존 시약장은 만든 순서로 1부터 채움. (school_id, number) unique. 화면 11 전환 pill 이름 앞·화면 3 보관 위치·QR 라벨·화면 12 직접 찾기에 쓴다. 새 시약장 기본 이름 "{n}번 시약장" 의 n = 이 번호 |
| 칸 배치 | 시약 1개 = 칸 0~1개(`reagents.slot_id`). 넣기·빼기·옮기기 = 교사·admin(rules.json cabinet.slot_assign_roles, R7: 학생의 slot-assign·location-edit = 0). DB 함수 `place_reagent(p_reagent_id, p_slot_id null 허용)` 하나로 — 자기 학교 시약·자기 학교 칸만, null 이면 빼기("칸 없음"), 데모 학교 거부. 교사의 reagents.slot_id 직접 update 경로는 닫는다(함수 경유) |
| 진입 | (a) 화면 11 칸 누르기 → 칸 시트(slot-sheet): 그 칸의 시약 목록 + 시약 넣기(slot-assign: 칸 없음 시약에서 고르기) + 빼기. 학생은 목록만 (b) 화면 3 보관 위치 줄(reagent-location: "N번 시약장 이름 · 좌1단" 또는 "칸 없음") + 위치 바꾸기(location-edit) → 위치 피커(location-picker: 시약장 전환 → 칸 고르기 → 저장, "칸 없음으로" 가능) |
| 분류 불일치 | 막지 않는다(경고만): 시약의 분류(reagents.storage_class)가 칸의 분류에 없으면 mix-warning, 그 칸의 다른 분류·다른 시약 분류와 rules.json cabinet.incompatible 조합이면 더 강한 문구의 mix-warning. 시약 분류가 없으면 경고 없음 |
| 칸 안 시약 수 | 배치도의 칸마다 slot-count(무채색 pill, 핑크 금지). 0 이면 표시 안 함 |
| QR 인쇄 | 화면 11 관리 줄 qr-print "QR 인쇄"(교사·admin, R7) → qr-print-sheet: 시약장 선택(기본 = 지금 시약장, "모두" 가능) → 미리보기 → 브라우저 인쇄(A4 한 장에 qr-label 여러 개). 라벨 글자 = 학교명 · 시약장 번호 · 시약장 이름 · "QR을 찍으면 이 시약장의 시약을 봐요". **QR 내용 = `{origin}/scan?cabinet={cabinet id}`**(화면 12 가 열고, 로그인 사용자의 학교 시약장이 아니면 "{학교명} 시약장 QR이 아니에요"). 서버 저장 없음 |
| 저장 안 한 편집 | 화면 11 에서 편집 중(저장 안 함)에 시약장 전환·화면 이탈 → ex-modal-card "저장하지 않은 변경이 있어요" [버리고 이동] / [계속 편집] (rules.json cabinet.unsaved_confirm). 브라우저 새로고침·창 닫기는 브라우저 기본 확인 |
| 재주문 기준 직접 입력 | 화면 3 시약 상세의 reorder-threshold 줄("재주문 기준 N {unit}" 또는 "1반 1회 실험량 … × …조 기준")에서 교사·admin 이 threshold-edit 로 숫자를 직접 입력(R5: 학생 0). DB 함수 `set_reorder_threshold(p_reagent_id, p_min_stock)` — 0 이상(0 = 알림 없음), 자기 학교, 데모 거부. **화면 5 의 "더 큰 값 유지"와 달리 그대로 덮어쓴다**(사용자가 직접 정한 값). 직접 입력하면 reorder_per_group·reorder_groups 는 null(근거 문구가 "재주문 기준 N" 으로 바뀜). low_stock_since 는 §11 트리거 |
| 데모 학교 | 둘러보기에서 threshold-edit·location-edit·slot-assign·qr-print·cabinet-add 숨김(rules.json guest.hidden_components). 쓰기 거부 |

## 15. 사용일 (화면 4·10, 2026-10-07 결정 — design/rules.json 1.17 usage_date)

| 항목 | 결정 |
|---|---|
| 열 | `usage_logs.used_on date not null` — 실제로 쓴 날(한국 날짜). 기존 행은 used_at 의 한국 날짜로 채운다. used_at 은 "기록한 시각"으로 그대로 둔다 |
| 기록 | `record_usage` 가 사용일(선택, 기본 = 오늘 한국 날짜)을 받는다. 오늘(한국 날짜) 이후는 거부. 과거 하한은 두지 않는다. 기존 인자·동작(재고 차감·memo)은 그대로 |
| 화면 4 | usage-date "사용일"(화면 7 입고일과 같은 모양, 수량 아래, 기본 오늘, 날짜 고르기의 최댓값 = 오늘). 오늘이 아니면 저장 버튼 위 past-date-note "10월 3일 사용으로 기록해요"(무채색) |
| 화면 10 | 사용일로 묶고 사용일 최신순, 같은 날은 기록 시각 최신순. 기간 필터도 사용일 기준. 기록한 날(used_at 의 한국 날짜)이 사용일과 다를 때만 회색 캡션 "10월 6일에 기록"(행). 상세 = 사용자·사용일·기록한 날·메모. **목록 모양은 시안 10(1.17)대로** — 사용일별 묶음 헤더("10월 7일 · 오늘"처럼), 행의 사용자 옆 기록 시각(예: "학생 이OO · 14:05"). (2026-10-07 정정: 처음에 "월 그룹 헤더"라고 잘못 적어 run 20261007-0853 은 월 묶음으로 만들었다 — 다음 run 에서 시안대로 바꾼다) |
| 재주문 기준 자동 | §11-1 의 "최근 28일 사용량"은 used_on 기준(오늘 포함 28일: used_on ≥ 오늘 − 27일) |

## 16. 시약 목록 필터·정렬 (화면 2, 2026-10-07 결정 — design/rules.json 1.17 list_filter)

| 항목 | 결정 |
|---|---|
| 필터 | list-filter-button "필터"(검색 오른쪽, 적용 개수 배지) → list-filter-sheet(모바일 바텀시트, 데스크톱 드롭다운): 정렬(이름순 기본·재고 적은 순·최근 입고순) → 보관 분류(storage-class-chip 여러 개 + "분류 없음") → 보관 위치(시약장 → 칸, "칸 없음만") → "MSDS 없는 시약만". "초기화" + "{N}종 보기". 기존 "전체 / 재고 부족"·이름 검색과 함께 적용(AND) |
| 정렬 기준 | 이름순 = 한국어 가나다(같으면 id), 재고 적은 순 = stock 오름차순(같으면 이름), 최근 입고순 = intake_date 내림차순(없으면 뒤, 같으면 이름) |
| 칩·결과 | filter-chip-row: 적용 칩(×로 하나씩) + "모두 지우기" + "N종". 정렬은 기본(이름순)이 아니면 칩 1개. 결과 0 = ex-empty-state-card "조건에 맞는 시약이 없어요" + "필터 지우기" |
| 상태 | 주소창 쿼리로 유지(새로고침·뒤로가기, 기존 ?filter·?q 와 함께). 잘못된 값은 무시 |
| 데이터 | 목록 데이터에 storage_class·slot(시약장 번호·이름·칸)·msds 유무를 함께 읽어 화면에서 거른다(학교당 시약 수가 적음). 새 DB 변경 없음 |
| 역할·둘러보기 | 모든 역할·둘러보기(/demo/reagents) 같은 동작. MSDS 일괄 띠(msds-bulk-banner)는 §20 (교사·admin 만) |

## 17. 시약 위치 추천 (화면 3·11·7, 2026-10-07 결정 — design/rules.json 1.17 suggest)

| 항목 | 결정 |
|---|---|
| 추천 규칙 | 후보 = 자기 학교의 모든 시약장 칸 중 **칸 분류(storage_classes)에 시약의 분류가 있는** 칸. 그중 그 칸에 이미 있는 시약들의 분류와 rules.json cabinet.incompatible 조합이 생기는 칸은 뺀다. 남은 칸을 (1) 칸 안 시약 수 적은 순 (2) 시약장 번호 순 (3) 칸 순(좌→우, 위→아래 단, 화면 11 배치도 순서)으로 정렬해 첫 칸 = 추천 칸(1개). 시약이 이미 들어 있는 칸은 그 시약 자신을 빼고 센다. 시약 분류가 없거나 후보가 없으면 추천 없음. 계산은 서버·클라이언트 공용 순수 함수(DB 변경 없음) |
| 화면 3 위치 피커 | location-picker 를 열면 추천 칸에 suggest-badge "추천"(highlight-soft 채움 + highlight 1px 테두리, ink 글자, 핑크 금지)을 달고 처음 선택으로 둔다(추천 칸이 다른 시약장에 있으면 그 시약장으로 전환된 상태로 연다). 시약이 이미 추천 칸에 있으면 그대로. 추천 없음이면 지금처럼 현재 위치(또는 첫 시약장) |
| 화면 11 칸 시트 | slot-sheet 의 "시약 넣기"(slot-assign) 목록에서 **이 칸이 추천 칸인 시약**에 suggest-badge "추천", 그 시약들을 목록 위로 |
| 화면 7 등록 직후 | 새 시약 등록이 저장되면(교사·admin) 토스트 뒤 location-suggest: 시약마다 "추천 위치: {번호}번 시약장 {칸}" + [여기에 두기](place_reagent) [다른 칸](화면 3 위치 피커). 여러 개면 목록 + 아래 "모두 추천대로"·"나중에". 추천 없음 = "맞는 칸이 없어요 — 시약장 설정에서 칸 분류를 정해 주세요" + 시약장 설정 버튼(/cabinets). 시약장이 하나도 없으면 location-suggest 없이 지금처럼 화면 2 로. "나중에"·모두 끝나면 화면 2 |
| 쓰기 | 기존 `place_reagent` 그대로(교사·admin, 자기 학교, 데모 거부). 학생·둘러보기에는 location-suggest·slot-assign 없음(R7, guest.hidden_components) |

## 18. 개발 예외 시안 반영 (화면 3·5·6·8·9, 2026-10-07 — 디자인 run 20261007-0848, rules.json 1.17 reorder.auto·app_exceptions)

| 항목 | 결정 |
|---|---|
| 자동 기준 표시 (화면 3·6) | §11-1 "표시"를 시안대로: 자동이면 `auto-threshold-badge` "자동"(canvas-soft 회색 pill, ink 글자, 핑크·하늘색 금지) + 캡션 한 줄. 캡션 = 사용 기록 근거면 **"최근 사용량으로 계산했어요"**(시안 문구), 입고량 근거면 **"마지막 입고량의 20%로 계산했어요"**(디자인 1.21 에서 규칙에 반영됨), 값 0 이면 지금처럼 "아직 없어요". basis·manual 표시는 그대로. 화면 6 카드도 같은 배지 + 캡션 |
| 화면 5 | 시안 5(1.17)대로: 추출 행 아래 연결 줄(우리 학교 시약 선택·삭제·"기존 기준 N · 그대로 둬요/바뀌어요"), 단위 = 선택 상자(병·mL·g), 조 수 기본값 빈 값, "2개 행을 합쳤어요" 무채색 줄 |
| 화면 6 | 판매처 "확인" 뒤 "사이트를 새 창으로 열었어요. 열리지 않았다면 [직접 열기]" 안내 줄(시안 모양). 즐겨찾기 별표·"모든 판매처 보기"(§12-1)는 그대로 둔다(시안에 아직 없음 — 예외 유지) |
| 화면 8 | 시트 오른쪽 위 × 닫기, 삭제 확인 문구 "{이름} · 사용·입고 기록은 남아요", 초대 시트는 시안 8 그대로. **초대할 때 역할(학생·교사)을 고르는 동작(§8)은 시안에 없더라도 없애지 않는다** — 시안에서 역할 선택이 빠졌으면 개발 쪽이 보고하고 사용자에게 묻는다 |
| 화면 9 | 등록·수정 폼 오른쪽 위 × 닫기, **부가 정보(note) 입력 칸 없음** — 기존 note 값은 DB 에 그대로 두고 목록 행은 이름 + 연락처만(디자인 1.21 맞춤 — 웹사이트는 행에 안 보이고 등록·수정 폼에는 웹사이트 칸 유지) |
| 화면 8 | (디자인 1.21 맞춤) 머리 "학생 a · 교사 b · admin c" 유지, 초대 = 이메일 + 역할(학생·교사) — 규칙에 반영됨 |
| 공통 | 데스크톱 nav-pill 학교명 옆 ▾ → 로그아웃(§10, 이미 있음 — 시안과 모양만 맞춘다) |

## 19. 초·중·고 학교급 (화면 14, 2026-10-07 결정 — design/rules.json 1.18 neis.school_kinds)

| 항목 | 결정 |
|---|---|
| 대상 학교 | NEIS `SCHUL_KND_SC_NM` ∈ 초등학교·중학교·고등학교 (특수학교·각종학교 제외, 재외한국학교 제외 그대로). 시/도·지역 목록도 세 학교급 전체에서 만든다 |
| 화면 14 | 시/도 → 지역 → 학교급(school-select-kind: 3칸 segmented-control, 기본값 없음) → 학교. 학교급을 고르기 전 학교 선택 비활성 + "학교급을 먼저 골라 주세요". 학교 0개면 학교 칸 자리에 무채색 "이 지역에 {학교급}가 없어요 — 지역을 다시 골라 주세요"(디자인 1.21 맞춤)(상태 14-no-school). 지역·학교급을 바꾸면 학교 선택은 비운다 |
| 가입 검증 | 서버가 고른 학교를 NEIS 에서 다시 확인할 때도 세 학교급 중 하나여야 한다(지금의 "고등학교만" 확인을 넓힘). 학교 레코드는 NEIS 학교코드로 하나 — 기존 학교·계정 그대로 |
| 캐시 | NEIS 목록 하루 캐시는 학교급까지 키에 넣는다 |
| 문구 | 앱에 "고등학교"를 전제한 문구가 있으면 초·중·고 공통으로. 샘플 학교명 "샘플고등학교"는 그대로 |

## 20. MSDS 찾기 (화면 2·3·7, 2026-10-07 결정 — design/rules.json 1.17 msds)

| 항목 | 결정 |
|---|---|
| 외부 API | 한국산업안전보건공단 물질안전보건자료 조회 서비스(공공데이터포털 15157612): `https://apis.data.go.kr/B552468/msdschem1/getChemList001`(목록 검색, XML). 키 = `KOSHA_MSDS_API_KEY`(서버 env, 디코딩 키, NEXT_PUBLIC_ 금지 — N2). 요청 변수 = serviceKey·searchWrd·searchCnd(0 국문명·1 CAS·2 UN·3 KE·4 EN)·numOfRows·pageNo, 응답 = response>header{resultCode,resultMsg}·body>items>item{chemId, chemNameKor, casNo, enNo, keNo, unNo, lastDate, openYn, koshaConfirm}(공식 명세, run 20261007-2303 — 로컬에 키가 없어 정상 응답은 미확인). MSDS 상세 주소 = `https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id={chemId 6자리, 앞 0 채움}&viewType=msds`(KOSHA 사이트에서 열림 확인). openYn=N 은 후보에서 뺀다. 하루 호출 한도(개발 계정 2,000)를 생각해 같은 검색어 결과를 서버에서 하루 캐시 |
| 서버 API | `GET /api/msds/search?q=` — 로그인 + 교사·admin + 자기 학교(데모 학교·학생·anon 거부, 401/403). q 1~60자. CAS 번호 형식(숫자-숫자-숫자)이면 CAS 로, 아니면 국문명으로 검색. 응답 = 후보 최대 10개 `{ chemId, name, cas, msdsUrl }`(msdsUrl = 그 물질의 안전보건공단 MSDS 상세 페이지 주소). 키 없음 503 "MSDS 찾기를 쓸 수 없어요(서버 설정)", 외부 실패 502 "MSDS를 찾지 못했어요. 잠시 뒤 다시 해 주세요". 응답에 키·외부 요청 주소 노출 금지 |
| 검색 보강 (2026-10-08 사용자 보고: "묽은 염산"도 못 찾음 — KOSHA 는 염산을 "염화수소"(7647-01-0)로 등록) | `/api/msds/search?q=&cas=` 가 차례로 찾고 결과를 합친다(중복 chemId 제거, 최대 10): (1) cas 인자(시약에 저장된 CAS) 또는 q 가 CAS 형식이면 CAS 검색 (2) **학교 상용 이름 표**(lib/ 공용 상수, 학교 과학실에서 흔한 시약 약 50종: 상용 이름·별칭 → CAS — 예: 염산→7647-01-0, 암모니아수→1336-21-6, 가성소다→1310-73-2)에 정리된 이름이 있으면 그 CAS 로 검색 (3) 원래 이름으로 국문명 검색 (4) 그래도 0개면 이름을 정리해서 다시: 앞뒤 수식어(묽은·진한·희석·포화·무수 제외 X — 무수는 남김), 농도 표기(0.1M·1N·35%·w/v 등), 괄호 안 내용, 끝의 "용액·수용액·시약", 등급(특급·1급·GR·EP·CP) 제거. 한 번의 사용자 검색에 KOSHA 호출 최대 4회, 각 호출 하루 캐시. 응답에 `searchedAs`(실제로 찾은 이름 또는 CAS) — 원래 이름과 다르면 후보 시트에 무채색 한 줄 "{원래 이름} → {찾은 이름}(으)로 찾았어요". 화면 3·2 일괄은 시약의 cas_no 를 cas 로 넘김, 화면 7 은 이름만 |
| AI 보조 (2026-10-08 사용자 결정: 보강 뒤에도 못 찾는 경우가 많음) | 위 (1)~(4) 가 모두 0개이고 외부 실패가 없으면 (5) Gemini(§13 과 같은 키·모델, `lib/server/gemini.ts`)에 시약 이름을 주고 구조화 출력 `{ nameKo(안전보건공단식 국문 물질명), cas(CAS 형식 또는 null) }` 을 받아 → cas 가 있으면 CAS 검색, 없거나 0개면 nameKo 국문명 검색(KOSHA 호출 추가 최대 2회). **후보는 KOSHA 가 실제로 돌려준 것만**(AI 답을 그대로 후보로 쓰지 않음). AI 답은 이름별 하루 캐시, 사용자 검색 1회당 AI 호출 최대 1회, Gemini 키 없음·실패면 (5)를 건너뛰고 지금처럼 0개. 프롬프트에 "모르면 null" 과 이름 외 지시 무시. 안내 줄 "{원래 이름} → AI가 찾은 이름 {물질명}(CAS {번호})(으)로 찾았어요". 자동 테스트는 Gemini 를 가로채 대체(실호출 없음) |
| 후보 고르기 | msds-candidates: 물질명·CAS 목록에서 하나 고르기 → MSDS 주소(그리고 CAS 가 비어 있으면 CAS)를 채운다. 0개면 "찾지 못했어요 — 직접 입력"(직접 주소 입력으로) |
| 화면 7 | 새 시약 등록(직접 입력) 폼의 MSDS 칸 옆 msds-search "MSDS 찾기"(이름으로 검색, 이름이 비면 비활성) → 후보 시트 → 고르면 MSDS 칸에 주소. 직접 입력도 그대로. 서류 입고의 새 시약 행은 ④ run 에서 |
| 화면 3 | MSDS 가 없는 시약: 교사·admin 에게 msds-search "MSDS 찾기" → 후보 → 고르면 저장. 학생·둘러보기는 "MSDS가 아직 없어요"(쓰기 없음). 저장 = DB 함수 `set_reagent_msds(p_reagent_id, p_msds_url, p_cas_no null 허용)` — 교사·admin, 자기 학교, 데모 거부, msds_url 은 http(s):// 300자 이하, cas_no 는 시약의 cas_no 가 비어 있을 때만 채움. MSDS 가 이미 있는 시약에는 찾기 버튼 없음(바꾸기는 이번 범위 밖) |
| 화면 2 일괄 | 교사·admin 이 목록 필터 "MSDS 없는 시약만"을 켜면 msds-bulk-banner "MSDS 없는 시약 N종 — 한 번에 찾기"(시안 2-msds-bulk). 누르면 시약마다 차례로 후보를 보여 주고 하나 고르기/건너뛰기 → 고른 것만 `set_reagent_msds` 로 저장, 끝나면 "N종에 MSDS를 넣었어요". 한 번에 최대 20종 |
| 테스트 | 실제 KOSHA 호출은 자동 테스트에서 하지 않는다(외부·한도). 화면 테스트는 `/api/msds/search` 응답을 가로채 대체, 서버는 권한·입력 검증·키 없음·XML 파싱(고정 XML 표본)까지. 실제 검색은 미리보기에서 사람이 확인 |

## 21. 서류로 입고 (화면 7, 2026-10-08 결정 — design/rules.json 1.17 intake)

| 항목 | 결정 |
|---|---|
| 권한 | 교사·admin (R5: 학생 doc-upload 0). 데모·둘러보기 없음(guest.hidden_components) |
| 진입 | 화면 7 맨 위 intake-mode(segmented-control "서류로 입고 / 직접 입력", **기본 = 서류로 입고** — 시안). "직접 입력" = 지금의 기존 시약 입고·새 시약 등록 갈래 그대로. 홈 quick-action "입고" → 화면 7. 주소창 `?mode=direct` 로 직접 입력 바로 열기(기존 링크·화면 3 "입고" 진입 등은 직접 입력으로) |
| 1단계 | doc-upload: 파일(PDF·JPG·PNG, 4MB 이하) → "AI로 읽기" → 처리 중. 파일은 서버에 보관하지 않는다(추출에만 쓰고 버림, §13 과 같음) |
| 추출 API | `POST /api/intake/extract`(multipart) — 로그인·교사·admin·자기 학교 확인, 형식·크기 검증, Gemini(키·모델은 §13 과 같은 `GEMINI_API_KEY`·`GEMINI_MODEL`, `lib/server/gemini.ts` 재사용) 구조화 출력: `{ docDate: "YYYY-MM-DD" 또는 null, items: [{ name(서류 표기), spec(예: "500 mL", 없으면 null), specAmount(숫자 또는 null), specUnit("mL"·"L"·"g"·"kg"·null), quantity(숫자, 기본 1), quantityUnit(예: "병"·"개", null 허용), isReagent(boolean), suggestedClass(보관 분류 8종 중 하나 또는 null) }] }`. 품목 최대 50. 서류 안 지시문은 무시하라는 문구 유지. 키 없음 503, 실패 502, 품목 0개 → 화면은 ex-empty-state-card "서류에서 품목을 찾지 못했어요" + 다시 올리기 |
| 2단계 확인 표 | 화면 5 방식(doc-intake-table): 행 = 품목(품명·규격·수량) + 아래 줄 reagent-link(우리 학교 시약 자동 연결 — §13 matchReagent 와 같은 규칙, 바꾸기·빼기·"새 시약으로 등록"). 모바일은 행마다 카드. 입고일(서류 날짜, 없으면 오늘, 미래 불가) 표 위, 고칠 수 있음. isReagent=false 품목은 표 아래 접힌 묶음 "시약 아님 N개"(펼치면 "시약으로 넣기"로 표에 올릴 수 있음) |
| 입고량 | 연결된 행의 입고량(그 시약 단위): 시약 단위 mL/g 이고 규격이 같은 계열이면 specAmount(L→mL, kg→g ×1000) × quantity, 시약 단위 "병"이면 quantity. 계산되면 무채색 안내 줄 "500 mL × 4병 = 2,000 mL", 안 되면 입고량 칸을 비우고 직접 입력(필수). 입고량 칸은 언제나 고칠 수 있음 |
| 새 시약 행 | "새 시약으로 등록"을 고르면 그 행이 아래로 펼쳐짐(new-reagent-fields): 이름(기본 = 품명), 보관 분류(suggestedClass 를 처음 선택 + suggest-badge "추천"), 단위(병·mL·g, 규격에서 추정), 재고량(위 입고량 규칙), MSDS(msds-search §20 + 직접 입력) |
| 저장 | "확인 후 입고" → DB 함수 `record_document_intake(p_intake_date date, p_items jsonb)` 하나로 **한 트랜잭션**: 연결 행 = `{reagent_id, amount}` → record_intake 와 같은 처리(intake_logs·stock·intake_date, §11-1 자동 기준 트리거), 새 시약 행 = `{name, storage_class, unit, stock, msds_url}` → register_reagent 와 같은 처리. 교사·admin·자기 학교·데모 거부, 항목 1~50, amount·stock > 0, 미래 날짜 거부, 하나라도 틀리면 전부 취소. 반환 = `{ intake_count, new_reagent_ids[] }` |
| 저장 뒤 | ex-toast "{N}개 품목을 입고했어요" → 새 시약이 있으면 location-suggest(§17, 여러 개 + "모두 추천대로"), 없으면 화면 2 |
| 테스트 | 실제 Gemini 호출은 자동 테스트에서 하지 않는다(§13 과 같음) — 추출 API 응답을 가로채 대체, 서버는 권한·형식·크기·키 없음까지. 실제 추출은 미리보기에서 사람이 확인 |

## 22. MSDS 요약 — 화면 16 (2026-10-08 결정 — design/rules.json 1.21 msds_summary)

| 항목 | 결정 |
|---|---|
| 경로 | `/msds/[reagent id]`(로그인, 모든 역할, 자기 학교 시약만 — 다른 학교·없는 id 는 404) · `/demo/msds/[reagent id]`(둘러보기, 데모 학교 시약만). 진입 = msds-entry "MSDS 보기"(화면 3 시약 상세, 화면 10 기록 상세; 화면 12 는 만들 때). 바깥 링크로 바로 가지 않는다. 뒤로 = 들어온 화면 |
| 요약 대상 | 시약 msds_url 이 안전보건공단 상세 주소(`msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=…`)이면 chem_id 로 요약, 아니면(직접 입력 다른 주소) 요약 없이 msds-original-link 만(16-no-summary). MSDS 가 없으면 화면 16 대신 화면 3 의 "MSDS가 아직 없어요"(진입 버튼 없음) |
| 데이터 | 서버에서 공단 Open API 항목별 상세(getChemDetail02 = 2 유해성·위험성(신호어·그림문자·유해 문구), 04 = 응급조치, 07 = 취급·저장, 08 = 노출방지·보호구; `KOSHA_MSDS_API_KEY`, 키는 서버에서만 — N2). 응답 구조는 공식 명세로 구현하고 고정 XML 표본으로 단위 테스트(실호출은 미리보기에서 사람이 확인). chem_id 별 하루 캐시. 4개 항목 중 일부만 실패하면 그 항목만 "내용이 없어요", 전부 실패면 16-fail |
| 표시 | 시안 16 대로: ‹ "MSDS · {시약명}", 출처 줄 "물질안전보건자료 · 한국산업안전보건공단", 신호어 pill("위험" = ink 채움 흰 글자, "경고" = canvas-soft 회색 ink 글자), ghs-pictogram(흰 마름모 + #ff0000 테두리(이 컴포넌트 안에서만) + 검정 그림, 아래 이름 — GHS01~GHS09 9종: 폭발성·인화성·산화성·고압가스·부식성·급성 독성·경고(자극성 등)·건강 유해성·환경 유해성. 그림은 앱 안 SVG), 항목 "2. 유해·위험성"·"4. 응급조치 요령"·"7. 취급 및 저장방법"·"8. 노출방지 및 개인보호구" 각 3줄 + "더 보기"(펼침), 비면 "내용이 없어요", 맨 아래 전폭 button-outline "원문 MSDS 보기 ↗"(새 창, noopener). 불러오는 중 = msds-skeleton(회색 줄), 실패 = ex-empty-state-card "요약을 불러오지 못했어요" + 원문 보기 |
| 데스크톱 | 시안은 시약 목록 옆 detail-drawer 안 — 데스크톱 재구성 run 에서. 그 전까지 데스크톱도 같은 전용 화면(가운데 한 열) |
| 둘러보기 | 데모 학교 시약도 같은 화면(쓰기 없음). 데모 seed 의 msds_url 이 공단 주소가 아니면 16-no-summary 로 보임 |

## 23. 데스크톱 재구성 (2026-10-08 결정 — design/rules.json 1.22 desktop_shell, 디자인 run 20261008-0936·1233·1610·1936)

| 항목 | 결정 |
|---|---|
| 범위 | 폭 1440(데스크톱)만. 폭 390(모바일)은 그대로(모바일 프레임은 다시 그려졌지만 같은 구조 — 그 화면 run 에서 대조를 새 프레임으로 옮김) |
| 셸 (run a) | 로그인 후 2~13·16 = 왼쪽 app-sidebar(240, radius 0, 위 학교명, 역할별 sidebar-item = desktop_shell.menu: 모두 홈·시약·기록·시약장·QR 찾기 / 교사·admin + 입고·실험 매뉴얼·재주문 알림 / admin + 사용자·판매처, 현재 화면 활성, 아래 계정 ▾ → 로그아웃 = 지금 nav-account-menu 역할). 데스크톱에서 nav-pill·tab-bar 없음. 본문 = 사이드바 오른쪽. QR 찾기(화면 12)는 아직 없으므로 sidebar-item 은 비활성(눌러도 이동 없음, "준비 중" 툴팁) — 화면 12 run 에서 연결 |
| 목록·드로어 (run b) | 2·8·9·10 목록 = data-table. 한 건 보기(3·10 상세·16)와 짧은 폼(4·9 등록·수정) = 오른쪽 detail-drawer(480, 본문을 밀어냄: 240 + 720 + 480). 드로어는 주소창에 상태(예: /reagents?id= 또는 /reagents/[id] 를 목록 + 드로어로) — 새로고침·뒤로가기에도 같은 화면. 모바일은 지금처럼 전용 화면. (2026-10-09 run b 세부) 데스크톱에서 `/reagents/[id]`(3)·`/msds/[id]`(16)·`/usage/new`(4) = 시약 목록 data-table 위 오른쪽 드로어(시안 3·16·4-desktop — 드로어 뒤 목록은 시안대로), 화면 10 기록 상세 = 기록 data-table 옆 드로어(지금 모달 대신), 화면 9 등록·수정 = 판매처 data-table 옆 드로어, 화면 8 = data-table(역할 변경·초대·삭제 확인 시트는 시안 8-desktop 대로). 드로어 닫기(× · Esc) = 목록 주소로. 같은 run 의 상태 프레임: 2-filter·2-filter-empty·2-msds-bulk(필터 = 드롭다운·팝오버), 3-location·3-msds(위치·MSDS 후보 = 팝오버), 4-past-date, 16-loading·16-fail·16-no-summary(드로어 안). 끝나면 dev-rules desktop_migrated_screens = 2·3·4·8·9·10·16 (run 시작 때 미리 넣음) |
| 본문 페이지 (run c) | 5·7·11 = 가운데 폼(~640) + 하단 고정 바. 13 홈 = 숫자 타일 + 위젯 격자. 6 재주문 = 시안 6-desktop. 모달은 확인·짧은 입력만, 모바일 바텀시트(필터·MSDS 후보·위치 등)는 데스크톱에서 드롭다운·팝오버 |
| run c 세부 (2026-10-09) | 데스크톱 5 실험 매뉴얼·7 입고(서류·직접 입력)·11 시약장 = 가운데 폼(~640, rules desktop_shell.form_width) + 하단 고정 바(저장·확인 버튼) — 시안 5·7·11-desktop. 13 홈 = 숫자 타일 + 위젯 격자(시안 13-desktop). 6 재주문 = 시안 6-desktop. run a 의 page-head(5·11)는 시안 제목 구조로 대체. 상태 프레임: 7-doc-upload·7-doc-review·7-doc-fail·7-msds(후보 = 팝오버)·7-suggest, 11-empty(본문 위 상태)·11-slot(칸 시트 = 팝오버/드롭다운)·11-print(QR 인쇄 = 오른쪽 드로어 + 시약장 드롭다운)·11-delete·11-unsaved(확인 모달). 모바일 11-empty·11-delete 에 계정 메뉴 ▾ 추가(시안). 끝나면 desktop_migrated_screens 에 5·6·7·11·13 (run 시작 때 미리 넣음) |
| 로그인 전·둘러보기 (run d) | 1·14·15 = web-header(전폭 상단 바) + 1·14 반 나눔, 15 = 긴 웹 랜딩(rules pre_login.landing_sections 순서, desktop_required). 둘러보기 데스크톱 = 같은 app-sidebar(위 "데모 학교", 홈·시약 활성 + 기록·QR 찾기 guest-lock 2, 관리 메뉴 숨김) + 본문 위 guest-banner |
| 상태 프레임 | 디자인 run 20261008-1610 의 상태 프레임 20종(2-filter·3-location·7-doc-*·11-*·16-* 등)은 그 화면 run 에서 대조 |
| 검사 | d5 C3. 화면별 이전 완료 = dev-rules `desktop_migrated_screens` |

## 10. 로그아웃 (2026-10-05 결정)

- 로그인 후 모든 화면의 nav-pill 학교명을 누르면 작은 메뉴가 열리고 "로그아웃" 1개가 있다. 누르면 `POST /api/auth/logout` → `/login`.
- 2026-10-06 디자인 1.15 에서 정식 시안이 됐다: 학교명 옆 ▾, 메뉴 = `nav-account-menu`(data-component). 학교 전환 기능은 두지 않는다(메뉴에 학교 목록 없음).
- 둘러보기(/demo)·로그인 전 화면에는 없다.
