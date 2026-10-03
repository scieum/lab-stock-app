# 게이트 (D5)

> 규칙 값 SSOT: design/rules.json (디자인 하네스 사본) + harness/dev-rules.json (개발 전용 값)
> 판정: `python harness/scripts/judge.py --gate {D0|D1|D2|D3|D4} --run runs/{id} [--screen N]`
> 종료 코드: 0 통과 / 1 위반 / 2 판정 불가 — 디자인 하네스와 같음

## 1. 게이트 목록

| 게이트 | 위치 | 적용 규칙 | 통과 |
|---|---|---|---|
| G-D0 | 셋업 끝 | Q1, Q2, S1 | 위반 0 |
| G-D1 | 토큰·컴포넌트 끝 | T1, T2, K1, Q1 | 위반 0 |
| G-D2 | 데이터·권한 끝 | N1-db, R-db, N2-env, N2-bundle, Q1 | 위반 0 |
| G-D3 | 화면마다 | T2, R-ui, C1, C2, N1-ui, N2-bundle, V1, Q1 | 위반 0 (V1은 보고만) |
| G-승인 ★사람 | D3 전부 후 | 미리보기 URL | approved |
| G-D4 | 최종 | 전체 | 위반 0 |

## 2. 규칙

### Q — 품질

| ID | 조건 |
|---|---|
| Q1 | `npm run typecheck`·`lint`·`test` 모두 exit 0 |
| Q2 | `npm run build` exit 0 |

### S — 출처

| ID | 조건 |
|---|---|
| S1 | design/rules.json 해시 = design/source.json 기록값 (사본을 직접 고치지 않았음) |

### T — 토큰 (디자인 D1~D8·D10의 코드판)

| ID | 조건 |
|---|---|
| T1 | `styles/tokens.css` = rules.json에서 생성한 결과와 동일 (생성 스크립트 재실행 diff 0) |
| T2 | `app/`·`components/`의 .tsx·.css에서 hex 색, px 숫자, border-radius 숫자 직접 사용 = 0 (tokens.css만 예외) |

### K — 컴포넌트

| ID | 조건 |
|---|---|
| K1 | MVP 화면 시안의 컴포넌트 이름 목록(dev-rules.json `components`)마다 `components/{이름}/` 존재 + 갤러리 페이지에 `data-component` 1개 이상 |

### R — 역할 (디자인 R1~R7의 코드판)

| ID | 조건 |
|---|---|
| R-ui | Playwright로 학생·교사·admin 계정 각각 로그인 → 화면마다 `data-component` 개수를 세서 rules.json `roles` R1~R7과 비교 (예: 학생 화면의 stock-intake = 0) |
| R-db | 학생 계정으로 입고(reagents.stock 증가)·시약 등록 시도 → RLS 거부 |

### C — 화면 구조

| ID | 조건 |
|---|---|
| C1 | rules.json `screens_required` 컴포넌트가 해당 화면 DOM에 존재 (MVP: 13 = home-summary·quick-action, 15 = landing-hero·feature-card·landing-cta) |
| C2 | 폭 390: 화면 2~13에 `tab-bar` 1개·`tab-item` 4개, 화면 1·14·15에 0 / 폭 1440: `tab-bar` 0 |

### N — 어기면 안 되는 것 ★

| ID | 조건 |
|---|---|
| N1-db | 학교 A 사용자로 학교 B의 reagents·usage_logs·cabinets 조회 = 0행, 수정 = 0행 (SQL 테스트) |
| N1-ui | 로그인 후 화면 텍스트의 학교명 종류 = 1 (자기 학교만) |
| N1-d | 화면 14(회원가입): school-select-sido → region → school 순서, 목록은 `/api/neis` 응답에서만. 화면 1(로그인)에는 school-select* 0 |
| N2-env | 키 환경변수 이름에 `NEXT_PUBLIC_` 접두사 = 0, 키 사용 파일은 `app/api/**`·`lib/server/**`만 |
| N2-bundle | `.next/static/**` 안에 32자리 16진수·`AIza`로 시작하는 문자열·키 변수 이름 = 0 |

### GM — 둘러보기(비회원) ★ (2026-10-03)

| ID | 조건 |
|---|---|
| GM-ui | /demo·/demo/reagents·/demo/reagents/[id] 비로그인 접속: guest-banner 1(가입 버튼 → /signup), design/rules.json guest.hidden_components 0, 학교명 "데모 학교"만, 폭 390 tab-bar 1·tab-item 4·탭바 안 guest-lock 2(QR 스캔·기록), 쓰기 동작(13·3)에 guest-lock ≥ 1이고 눌러도 쓰기 요청 0건 |
| GM-db | anon 키(비로그인)로: 데모 학교 reagents·usage_logs·cabinets select 가능, 실제 학교 데이터 select 0행, 데모 학교 insert·update·delete 거부. 로그인 사용자도 데모 학교 쓰기 거부 |

### V — 시안 비교

| ID | 조건 |
|---|---|
| V1 | 화면별 390×844·1440×900 스크린샷 ↔ Figma `00 최신 시안` PNG 픽셀 차이 비율을 보고(기준 이하면 표시만). 폰트(Figma는 IBM Plex 대체)·실데이터 차이가 있어 **자동 실패 아님** — 사람이 G-승인에서 본다 |

## 3. 사람 승인

D3 화면 7개가 끝나면 Vercel 미리보기 URL과 V1 비교 이미지로 approval.md를 만든다. 형식은 디자인 하네스와 같다(result·reason·approver·date).
