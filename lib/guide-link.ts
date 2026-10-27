/**
 * 사용 가이드 진입 링크 (정적 페이지 public/guide/index.html — next.config redirects 로 /guide 에서 열림).
 * 시안 예외 (사용자 요청 2026-10-28, 요청서 10 대기): 사이드바 아래 · 화면 18 관리 목록 맨 아래 · 랜딩 web-footer.
 * 모두 새 탭으로 연다.
 */
export const GUIDE_HREF = "/guide";
export const GUIDE_LABEL = "사용 가이드";
export const GUIDE_LINK_PROPS = { href: GUIDE_HREF, target: "_blank", rel: "noopener" } as const;
