# G-승인 — runs/20261002-2043 (화면 14·1: 로그인/회원가입 분리)

- 미리보기 URL: https://lab-stock-app-o97y-git-dev-run-2026-b0bd33-hayeonkeems-projects.vercel.app (브랜치 dev/run-20261002-2043, 배포 dpl_5tQUY8e7bh1c3HNoFAJuTakaJTLp)
- V1 스크린샷: runs/20261002-2043/v1/
- Figma 비교: https://www.figma.com/design/yPF9ZLVjkg22kgSDD2aKEd?node-id=107-2 (화면 1·14)

## 확인 요청 사항
1. 회원가입 성공 경로는 실행 확인 안 됨 — 로컬 .env.local에 SUPABASE_SERVICE_ROLE_KEY 없음. 미리보기(Vercel에는 키 있음)에서 실제 가입 1회로 확인 필요
2. Supabase Auth 대시보드: 이메일 확인 설정, Redirect URLs에 {사이트}/auth/confirm 허용 필요 (가입 확인·비밀번호 재설정 메일)
3. 비밀번호 찾기·재설정 화면은 시안에 없어 기존 컴포넌트로 최소 구현
4. 가입 첫 사용자 = 그 학교 admin, 이후 student
5. 공용 컴포넌트 변경(nav-pill endTitle, text-input trailing, select-field 선택 색) — 화면 13·2·3·4 회귀는 D4에서 확인

result: approved
reason: 미리보기 확인 후 사용자 승인
approver: scieum (사용자)
date: 2026-10-02
