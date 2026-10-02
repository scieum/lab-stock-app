# 핸드오프 — 디자인 → 개발 (2026-10-02)

이 저장소(lab-stock-app)에서 Lab_Stock 앱 개발을 시작한다. 이전 대화는 디자인 저장소에서 시안과 이 개발 하네스를 만들었다. 필요한 내용은 모두 파일에 있으니 아래 순서로 읽고 시작하면 된다.

## 1. 무엇을 만드나
고등학교 과학실 시약 재고 관리 SaaS "Lab_Stock". 학교별로 데이터가 분리되고(N1), NEIS·Gemini 키는 서버에서만 쓴다(N2). 역할은 학생·교사·admin.

## 2. 먼저 읽을 파일 (이 순서)
1. `CLAUDE.md` — 이 세션은 오케스트레이터. 트리거·단계·금지 사항
2. `harness/d2-purpose.md` — 스택(Next.js + Supabase + Vercel), **MVP = 화면 15·14·1·13·2·3·4**, 완료 기준
3. `harness/d3-pipeline.md` — D0 셋업 → D1 토큰·컴포넌트 → D2 데이터·권한 → D3 화면 → 사람 승인 → D4
4. `harness/d5-gates.md` — 게이트 규칙 (판정: `python harness/scripts/judge.py`)
5. `harness/d6-roles.md` · `harness/d7-data.md` — 에이전트 역할, 테이블·RLS·NEIS API
6. `harness/dev-rules.json` — 연결 정보·컴포넌트 목록·게이트 구성

## 3. 디자인 정답지 (읽기만, 고치지 않음)
- `design/rules.json` — 색·크기·간격·radius·역할(R1~R7)·탭바 규칙. 디자인 저장소 사본(출처·해시: `design/source.json`)
- `design/frames/{1,2,3,4,13,14,15}-{mobile,desktop}.json` — MVP 화면 시안의 Figma 노드
- Figma: https://www.figma.com/design/yPF9ZLVjkg22kgSDD2aKEd?node-id=107-2 (페이지 `00 최신 시안`, 화면 1~15 최신본)
- 디자인 저장소: `C:\Users\User\OneDrive - 한국교원대학교\Claude Code\DESIGN-HARNESS` (github.com/scieum/harness)

## 4. 연결 상태
| 항목 | 값 |
|---|---|
| GitHub | https://github.com/scieum/lab-stock-app (main, 하네스까지 push됨) |
| Supabase | 프로젝트 `LabStock` (kammofjdizvtvmbadmma, 서울). public 테이블 없음. Supabase MCP로 접근 가능 |
| Vercel | https://vercel.com/hayeonkeems-projects/lab-stock-app-o97y (GitHub 연결 예정, 환경변수는 사용자가 대시보드에 입력) |
| 로컬 키 | `.env.local`에 NEIS_API_KEY 있음 (git 제외). Supabase URL·publishable 키는 builder가 MCP로 받아 추가. service role 키는 사용자가 직접 추가 |

## 5. 시안에서 정해진 핵심 (코드에 그대로 옮김)
- 노드 이름 = `data-component` 속성 (예: `<nav data-component="tab-bar">`) — 역할·탭바 검사가 DOM에서 이걸 센다
- 색은 흑백 기본 + 핑크 #d6246a(재고 부족·재주문·시약장 혼재 경고 전용, 연핑크 #fbe9f0) + 하늘색 #2b9fe0·#e6f4fc(선택·활성·링크·아이콘, 글자색 금지)
- 버튼·nav 등은 stadium pill, 단 **모바일 하단 탭바는 하단에 붙은 전폭 사각형**(탭 4개: 홈·시약·QR 스캔·기록, 모든 역할 동일, 화면 1·14·15와 데스크탑엔 없음)
- 그림자 없음(segmented-control-active만 예외), 폰트 Pretendard(시안은 IBM Plex Sans KR 대체)
- 학교 선택은 **회원가입(화면 14)에서만** NEIS 시/도 → 지역(시/군/구) → 학교(재외한국학교 제외). 로그인(화면 1)은 개인 이메일·비밀번호만, 학교는 계정(profiles.school_id)에서 읽음

- **화면 15 랜딩 (2026-10-03 추가):** 경로 `/` 는 로그인 전이면 15 랜딩, 로그인 후면 13 홈(dev-rules.json `route_auth`). 필수 컴포넌트 landing-hero·feature-card(4개)·landing-cta(회원가입 → /signup, 로그인 → /login), 탭바·학교명 없음. 아직 구현 안 됨 → "개발 돌려줘 D3 15"

## 6. 남아 있는 확인 사항 (시안 쪽)
- 화면 3(시약 상세): "MSDS 보기"가 스크롤해야 보임 — 위로 올리는 것 검토
- 화면 6(재주문): 판매처 연결 시트가 "판매처 등록" 버튼을 가림 (MVP 밖)
- NEIS 키가 이전 채팅에 노출됨 → 운영 전에 재발급 권장

## 7. 시작
사용자가 "개발 돌려줘"라고 하면 CLAUDE.md 트리거대로 runs/ 를 만들고 D0부터 진행한다. builder·tester·judge 에이전트는 `.claude/agents/`에 정의돼 있다.
