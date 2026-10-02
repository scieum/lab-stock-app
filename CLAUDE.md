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

## 루프

디자인 하네스와 같다: 에이전트 호출 → judge exit 0이면 다음, 1이면 재시도(한도 3), 2면 멈춤. state.json은 judge 결과 직후에만 쓴다.

## 금지

1. 구현·테스트 코드를 오케스트레이터가 직접 쓰지 않는다.
2. judge exit 0 없이 다음 단계로 가지 않는다.
3. 사용자의 "승인했어/반려했어" 없이 approval.md result를 채우지 않는다.
4. design/ 를 고치지 않는다. harness/ 는 실행 중 고치지 않는다.
5. 키 값(NEIS·Gemini·Supabase service role)을 코드·runs·문서·채팅에 쓰지 않는다. 환경변수로만.
6. Supabase·Vercel·GitHub에 처음 만들거나 연결할 때는 사용자 확인을 먼저 받는다.

## 보고 형식

디자인 하네스와 같다 ([멈춤] / [승인 대기] / [완료], 5줄 이내).
