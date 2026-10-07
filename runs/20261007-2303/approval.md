# G-승인 — runs/20261007-2303 (디자인 1.17 ③: MSDS 찾기 — 화면 2·3·7)

- 미리보기 URL: 없음 (사용자가 미리보기 확인 없이 미리 승인)
- V1 스크린샷: runs/20261007-2303/v1/
- Figma 비교: https://www.figma.com/design/yPF9ZLVjkg22kgSDD2aKEd (요청 2 = S4-screens-v11, node 257:2)

## 바뀐 것
1. 서버: GET /api/msds/search (교사·admin, KOSHA 물질안전보건자료 조회 서비스 getChemList001, 하루 캐시, 후보 최대 10, 키는 서버에서만)
2. DB: set_reagent_msds(교사·admin, 자기 학교, 데모 거부, CAS 는 비어 있을 때만)
3. 화면 7: 새 시약 등록 MSDS 칸 옆 "MSDS 찾기" → 후보 → 주소 자동 입력
4. 화면 3: MSDS 없는 시약 — 교사·admin 찾기·저장, 학생·둘러보기 "MSDS가 아직 없어요"
5. 화면 2: "MSDS 없는 시약만" 필터를 켠 교사·admin 에게 "MSDS 없는 시약 N종 · 한 번에 찾기"(최대 20종)

## 자동 테스트로 확인하지 못한 것
- 실제 KOSHA 응답(로컬 .env.local 에 키 없음 — Vercel 에는 사용자가 넣음). 응답 형식은 공식 명세, 상세 주소 형식은 KOSHA 사이트에서 확인. 미리보기/배포에서 사람이 실제 검색 확인 필요
- 서버리스 인스턴스마다 캐시가 따로

result: approved
reason: 사용자 승인 — 판정 전 미리 승인 ("다 승인 승인", "푸쉬까지 다 승인할게 해줘", 2026-10-07)
approver: scieum (사용자)
date: 2026-10-08
