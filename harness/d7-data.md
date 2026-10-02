# 데이터·권한 (D7) — MVP

## 1. 테이블

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| schools | id, neis_code(SD_SCHUL_CODE, unique), office_code(ATPT_OFCDC_SC_CODE), name, sido, region | NEIS에서 첫 가입 시 생성 |
| profiles | user_id(auth.users), school_id, role(student·teacher·admin), display_name | 사용자당 1개 |
| cabinets | id, school_id, label, door_type(양문형·단문형), shelves(3·4) | 화면 11은 2차, MVP는 시드 |
| cabinet_slots | id, cabinet_id, side(L·R), shelf, storage_class | storage_class ∈ rules.json cabinet.storage_classes |
| reagents | id, school_id, name, cas_no, unit, stock, min_stock, msds_url, slot_id, intake_date | stock < min_stock → 재고 부족(핑크) |
| usage_logs | id, school_id, reagent_id, user_id, amount, used_at | 화면 4에서 생성, reagents.stock 차감 |

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
