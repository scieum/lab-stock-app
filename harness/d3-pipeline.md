# 파이프라인 (D3)

> 목적: harness/d2-purpose.md · 게이트: harness/d5-gates.md · 역할: harness/d6-roles.md

## 1. 단계

```
D0 셋업 ─▶ D1 토큰·컴포넌트 ─▶ D2 데이터·권한 ─▶ D3 화면(×5) ─▶ [G-승인] ─▶ D4 최종 검수
```

| 단계 | 하는 일 | 입력 | 출력 | 게이트 |
|---|---|---|---|---|
| D0 셋업 | Next.js·Supabase 연결, 디자인 규칙 가져오기 | design/rules.json | 빈 앱이 빌드·배포됨 | G-D0 |
| D1 토큰·컴포넌트 | rules.json → `styles/tokens.css` 생성, 공통 컴포넌트 | rules.json, Figma 00 최신 시안 | components/*, 컴포넌트 갤러리 페이지 | G-D1 |
| D2 데이터·권한 | 테이블·RLS·시드, NEIS 중계 API | d2 §5 결정 | supabase/migrations, app/api/neis | G-D2 |
| D3 화면 | 화면 1개씩 (1 → 13 → 2 → 3 → 4) | 시안 프레임 2장(mobile·desktop), D1·D2 | app/(screens)/… | G-D3 (화면마다) |
| G-승인 | 사람이 미리보기 URL에서 확인 | Vercel 미리보기 | approval.md | 사람 |
| D4 최종 검수 | 전체 게이트 재실행 | 전부 | judge/gate-D4.json | G-D4 |

## 2. 연결 규칙 (디자인 ↔ 코드)

- **노드 이름 = `data-component` 속성.** Figma 노드 `tab-bar`는 코드에서 `<nav data-component="tab-bar">`. 역할·필수 컴포넌트·탭바 검사(R·C 규칙)를 DOM에서 그대로 센다.
- **값 = 토큰만.** 색·크기·간격·radius는 `tokens.css` 변수로만 쓴다. 숫자·hex 직접 사용 금지(T2).
- **디자인 규칙 출처 고정.** `design/rules.json`은 디자인 저장소 사본이고 `design/source.json`에 출처 커밋·해시를 적는다. 바꾸려면 디자인 하네스에서 바꾸고 다시 가져온다(이 저장소에서 직접 수정 금지).

## 3. 되돌아가는 지점

| 발생 | 복귀 | 최대 | 초과 시 |
|---|---|---|---|
| G-D1·D2 위반 | 같은 단계 (위반 항목만) | 3회 | 멈추고 사람 |
| G-D3 위반 | 그 화면만 | 3회 | 멈추고 사람 |
| G-승인 반려 | 사유의 화면 D3 (사유에 "데이터" → D2) | 제한 없음 | — |
| G-D4 위반 | 해당 화면 D3 | 3회 | 멈추고 사람 |

## 4. 실행 기록

`runs/{YYYYMMDD-HHMM}/` — input.json(대상 단계·화면), state.json(stage·retries·baseline_hash), judge/gate-*.json, approval.md. 디자인 하네스와 같은 형식.
