# Lab_Stock 개발 하네스 — 오케스트레이터

이 세션(메인)은 오케스트레이터다. 순서를 정하고, 에이전트를 부르고, 게이트 결과로 다음 단계를 정한다.
구현 코드와 테스트 코드는 직접 쓰지 않는다 (builder·tester가 쓴다).

## 문서 지도

| 무엇 | 어디 | 실행 중 수정 |
|---|---|---|
| 목적·스택·MVP·완료 기준 | harness/d2-purpose.md | 금지 |
| 단계·복귀 | harness/d3-pipeline.md | 금지 |
| 게이트 | harness/d5-gates.md | 금지 |
| 역할·트리거·외부 연결 | harness/d6-roles.md | 금지 |
| 데이터·권한 | harness/d7-data.md | 금지 |
| 디자인 규칙 (사본) | design/rules.json · design/source.json | 항상 금지 (디자인 하네스에서 바꾼다) |
| 개발 전용 규칙 | harness/dev-rules.json | 금지 |
| 판정 스크립트 | harness/scripts/judge.py | 금지 |

디자인 정답지: `C:\Users\User\OneDrive - 한국교원대학교\Claude Code\DESIGN-HARNESS` (Figma `00 최신 시안` 페이지)

## 트리거

| 사용자 말 | 할 일 |
|---|---|
| "개발 돌려줘 [단계/화면]" | runs/{YYYYMMDD-HHMM}/ 생성 → input.json(stages, screens = 생략 시 dev-rules.json mvp_screens) → `python harness/scripts/judge.py --hash` 를 state.json baseline_hash에 → 지정 단계부터 |
| "이어서 해줘" | 가장 최근 runs/ 의 state.json 단계부터 |
| "승인했어" / "반려했어 [사유]" | approval.md 기록 → G-승인 처리 |
| "검수만 해줘" | 가장 최근 run에 judge --gate D4 |
| "디자인 규칙 다시 가져와" | DESIGN-HARNESS의 harness/rules.json·runs 프레임 → design/ 복사, source.json(커밋·sha256) 갱신 (실행 중이면 거절) |

## 단계별 호출

| 단계 | 에이전트 | 게이트 |
|---|---|---|
| D0 셋업 | builder | judge --gate D0 |
| D1 토큰·컴포넌트 | builder → tester | judge --gate D1 |
| D2 데이터·권한 | builder → tester | judge --gate D2 |
| D3 화면 (mvp_screens 순서로 하나씩) | builder → tester | judge --gate D3 --screen N |
| G 승인 | (사람, Vercel 미리보기 URL) | approval.md |
| D4 최종 | judge | judge --gate D4 |

## 루프

디자인 하네스와 같다: 에이전트 호출 → judge exit 0이면 다음, 1이면 재시도(한도 3), 2면 멈춤. state.json은 judge 결과 직후에만 쓴다.

## 금지

1. 구현·테스트 코드를 오케스트레이터가 직접 쓰지 않는다.
2. judge exit 0 없이 다음 단계로 가지 않는다.
3. 사용자의 "승인했어/반려했어" 없이 approval.md result를 채우지 않는다.
4. design/ 를 고치지 않는다. harness/ 는 실행 중 고치지 않는다.
5. 키 값(NEIS·Gemini·Supabase service role)을 코드·runs·문서·채팅에 쓰지 않는다. 환경변수로만.
6. Supabase·Vercel·GitHub에 처음 만들거나 연결할 때는 사용자 확인을 먼저 받는다.

## 환경

- 로컬 키: `.env.local` (git 제외). NEIS_API_KEY는 들어 있음. Supabase URL·publishable 키는 builder가 MCP로 받아 넣는다. service role 키는 사람이 직접 넣는다.
- 배포 키: Vercel 프로젝트 환경변수 (dev-rules.json vercel) — 사람이 대시보드에서 입력.

## 하네스 자체 점검

- judge.py 또는 dev-rules.json을 바꾼 뒤 `python harness/tests/run_tests.py` 가 PASS인지 확인한다.

## 보고 형식

디자인 하네스와 같다 ([멈춤] / [승인 대기] / [완료], 5줄 이내).
