# 역할 (D6)

## 1. 에이전트

| 에이전트 | 단계 | 쓰기 범위 | 쓰면 안 되는 곳 |
|---|---|---|---|
| builder | D0~D3 | app/, components/, lib/, styles/, supabase/, scripts/ | tests/, harness/, design/ |
| tester | D1~D3 (builder와 별도로) | tests/ (Playwright·SQL·Vitest) | app/, components/ 등 구현 코드 |
| judge ★읽기전용 | 모든 게이트 | runs/{id}/judge/ (스크립트만) | 그 외 전부 |
| 오케스트레이터 (메인 세션) | 순서·재시도·승인 기록 | runs/{id}/ 루트 파일 | 구현·테스트 코드 |

- **builder와 tester를 나누는 이유:** 같은 에이전트가 코드와 그 테스트를 함께 쓰면 테스트를 코드에 맞춰 느슨하게 만들 수 있다. 테스트는 rules.json·시안에서 만들고, builder는 테스트를 못 고친다.
- 디자인 규칙(design/)은 아무 에이전트도 고치지 않는다. 바꿀 일이 생기면 멈추고 사람에게 — 디자인 하네스에서 바꾼 뒤 다시 가져온다.

## 2. 외부 연결 (사람 확인이 필요한 것)

| 작업 | 도구 | 확인 |
|---|---|---|
| Supabase 프로젝트 생성·마이그레이션 적용 | Supabase MCP | 생성 전 사람 확인 (비용·리전) |
| Vercel 프로젝트·배포 | Vercel MCP | 첫 연결 전 사람 확인 |
| GitHub 저장소 생성·push | gh | 사람 확인 |
| 키 등록 (NEIS·Gemini) | Vercel·Supabase 환경변수 | 사람이 값 입력, 코드·runs·채팅 로그에 값 쓰지 않음 |

## 3. 자연어 트리거

| 말 | 동작 |
|---|---|
| "개발 돌려줘 [단계/화면]" | 새 runs/{id}, 지정 단계부터 (생략 = D0부터) |
| "이어서 해줘" | 최근 run의 state.json부터 |
| "승인했어" / "반려했어 [사유]" | approval.md 기록 |
| "검수만 해줘" | 최근 run에 G-D4 |
| "디자인 규칙 다시 가져와" | DESIGN-HARNESS의 rules.json → design/ 복사 + source.json 갱신 (실행 중 금지) |
