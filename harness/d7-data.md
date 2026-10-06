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
| GET /api/neis/schools?sido=&region= | 고등학교 목록 | 〃 |

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
| 재주문 기준 | `reagents.min_stock` = 필요량. 기준의 근거(1반 1회 실험량 × 조 수)는 `reagents.reorder_per_group`(1조 사용량)·`reorder_groups`(조 수)에 둔다(null 허용) — 화면 5(실험 매뉴얼)가 채운다. 값이 있으면 카드에 "1반 1회 실험량 {per_group} {unit} × {groups}조 기준", 없으면 "재주문 기준 {min_stock} {unit}" |
| 알림 날짜 | `reagents.low_stock_since`(timestamptz, null 허용): 재고가 기준 아래로 내려간 시각. stock·min_stock 이 바뀔 때 DB 가 맞춘다(아래로 내려가면 그 시각, 다시 기준 이상이면 null, 이미 부족한 상태가 이어지면 유지). 카드에 "YYYY.MM.DD 알림"(한국 시간). 이 열을 추가할 때 이미 부족한 기존 시약은 추가 시각으로 채운다 |
| 카드 | reorder-alert-card: badge-low-stock "재고 부족" + 시약명 + "필요량 {min_stock} {unit} / 현재 재고 {stock} {unit}" + 기준 문구 + 알림 날짜 + vendor-link "판매처 연결" |
| 판매처 연결 | vendor-link → ex-modal-card: 판매처 목록(우리 학교 판매처 먼저, 그다음 공통 목록; 행 = 판매처명 + 부가 정보) 중 하나를 고르고 "확인" → 그 판매처의 웹사이트를 새 창으로 연다(2026-10-05 사용자 결정). 아무것도 저장하지 않는다. 웹사이트가 없는 판매처를 고르면 "확인" 비활성 + 연락처 안내. 판매처가 하나도 없으면 안내 문구(admin 에게는 판매처 등록으로 가는 길) |
| 판매처 등록 진입 | vendor-register: 목록 아래 "판매처 등록" → 화면 9. admin 에게만 보인다(R3) |
| 매뉴얼 진입 | manual-upload: 재주문 기준 안내 박스("필요량 = 1반 1회 실험량 × 조 수") + "실험 매뉴얼 올리기" → 화면 5(`/manual`, 다음 run). 교사·admin만 (R1) |
| 0건 | ex-empty-state-card "재고가 부족한 시약이 없어요" |
| 데모 학교 | 둘러보기에는 화면 6 없음 |

### 11-1. 재주문 기준 자동 (2026-10-06 사용자 결정)

| 항목 | 결정 |
|---|---|
| 기준의 출처 | `reagents.min_stock_source` ∈ 'auto'(자동)·'basis'(화면 5 실험 매뉴얼)·'manual'(화면 3 직접 입력). 매뉴얼·직접 입력 값이 있으면 그것이 우선, 없으면 자동 |
| 자동 값 | 최근 28일 사용 기록이 있으면 **(최근 28일 사용량 합 ÷ 4) × 2주** = 28일 합 ÷ 2. 없으면 **마지막 입고량 × 20%**(intake_logs 의 가장 최근 amount; 입고 기록이 없으면 0). 소수 3자리 반올림. 0 이면 알림 없음 |
| 다시 계산 | source = 'auto' 인 시약만, 그 시약의 사용 기록 추가(record_usage)·입고(record_intake)·등록(register_reagent) 때 DB 가 다시 계산(트리거 또는 함수 안). 시간이 지나 28일 창에서 빠지는 사용 기록은 다음 사용·입고 때 반영(매일 다시 계산은 하지 않음 — 한계) |
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

## 10. 로그아웃 (2026-10-05 결정)

- 로그인 후 모든 화면의 nav-pill 학교명을 누르면 작은 메뉴가 열리고 "로그아웃" 1개가 있다. 누르면 `POST /api/auth/logout` → `/login`.
- 2026-10-06 디자인 1.15 에서 정식 시안이 됐다: 학교명 옆 ▾, 메뉴 = `nav-account-menu`(data-component). 학교 전환 기능은 두지 않는다(메뉴에 학교 목록 없음).
- 둘러보기(/demo)·로그인 전 화면에는 없다.
