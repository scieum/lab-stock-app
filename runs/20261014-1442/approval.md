# G-승인 — runs/20261014-1442 (공통 판매처 생물나라 추가)

- 미리보기 URL: https://lab-stock-app-o97y-cilqrup21-hayeonkeems-projects.vercel.app
- 디자인 규칙: 1.29 (디자인 커밋 f847405), dev-rules 1.21, d7 §11·§12
- 브랜치 dev/run-20261014-1442 (커밋 95d8041)

## 바뀐 것
1. 공통 판매처에 생물나라 추가 (웹사이트 biozoa.co.kr, 검색 주소 search_text) — 공통 목록 11곳
2. DB: 마이그레이션 20261014150000 — 2026-10-27 원격 적용 (원격 버전 20261027034753)
3. 화면 9 공통 목록 탭·화면 6 판매처 연결에 생물나라가 보임

## 같은 브랜치에 함께 올라간 것 (run 밖, 사용자 요청)
- keepalive (0265af7): /api/keepalive + Vercel Cron 매일 03:00 KST — Supabase 무활동 일시정지 방지
- 랜딩 데스크톱 히어로 왼쪽 글 56px 위로 (95d8041, 시안 예외)

## 시안과 다르게 정한 것 / 남은 것
- 2026-10-14 이후 Supabase 프로젝트가 무활동으로 일시정지 → 2026-10-27 복구 후 마이그레이션 적용
- 같은 저장소에 연결된 다른 Vercel 프로젝트 lab-stock_app_scieum 은 이 커밋에서 배포 실패 (공식 프로젝트 o97y 는 성공)
- 모바일 screen-15-structure.spec.ts:64 (landing-cta '로그인' 링크 2개 strict mode) 기존 실패 — 이번 run 변경과 무관

result: approved
reason: 사용자 "승인했어" (2026-10-27, 미리보기 확인 후)
approver: scieum (사용자)
date: 2026-10-27
