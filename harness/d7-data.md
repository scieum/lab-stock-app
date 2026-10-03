# 데이터·권한 (D7) — MVP

## 1. 테이블

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| schools | id, neis_code(SD_SCHUL_CODE, unique, 데모 학교는 null), office_code(ATPT_OFCDC_SC_CODE), name, sido, region, is_demo(boolean, 기본 false) | 회원가입(14)에서 그 학교 첫 가입 시 생성 |
| profiles | user_id(auth.users), school_id, role(student·teacher·admin), display_name | 사용자당 1개 |
| cabinets | id, school_id, label, door_type(양문형·단문형), shelves(3·4) | 화면 11은 2차, MVP는 시드 |
| cabinet_slots | id, cabinet_id, side(L·R), shelf, storage_class | storage_class ∈ rules.json cabinet.storage_classes |
| reagents | id, school_id, name, cas_no, unit, stock, min_stock, msds_url, slot_id, intake_date, storage_class(null 허용) | stock < min_stock → 재고 부족(핑크). storage_class ∈ rules.json cabinet.storage_classes (화면 7 "종류") |
| usage_logs | id, school_id, reagent_id, user_id, amount, used_at, memo(null 허용, 200자 이하) | 화면 4에서 생성, reagents.stock 차감. memo 는 화면 4 "메모" 입력 → 화면 10 상세 (§7) |
| intake_logs | id, school_id, reagent_id, user_id, amount, intake_date, created_at | 화면 7에서 생성, reagents.stock 증가 (§6) |

## 2. RLS (N1)

- 모든 업무 테이블: `school_id = (select school_id from profiles where user_id = auth.uid())` 일 때만 select·insert·update·delete
- profiles: 자기 행 select, 같은 학교 행은 admin만 update
- 역할 제한 (R-db):
  - usage_logs insert: 모든 역할 (자기 user_id만)
  - reagents insert·update(stock 증가): teacher·admin만
  - cabinets·cabinet_slots 변경: teacher·admin만 (R7)
- 재고 차감은 DB 함수(`record_usage`) 하나로만 — 사용 기록 insert와 stock 차감을 한 트랜잭션으로

## 3. 서버 API (N2)

| 경로 | 하는 일 | 키 |
|---|---|---|
| GET /api/neis/sido | 시/도 목록 (재외한국학교 제외) | NEIS_API_KEY (서버 env) |
| GET /api/neis/regions?sido= | 지역(시/군/구) 목록 | 〃 |
| GET /api/neis/schools?sido=&region= | 고등학교 목록 | 〃 |

- 디자인 하네스 `harness/scripts/neis.py`의 지역 규칙(도로명주소 두 번째 토큰, 없으면 시/도)을 그대로 옮긴다.
- NEIS 응답은 서버에서 하루 캐시(학교 목록은 거의 안 바뀜).

## 4. 가입·로그인 흐름 (2026-10-02)

1. 회원가입(14): `/api/neis/*`로 학교 선택 → Supabase Auth signUp(개인 이메일·비밀번호) → 서버(lib/server)가 schools upsert(neis_code) + profiles insert(school_id, role = 그 학교 첫 사용자면 admin, 아니면 student)
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
