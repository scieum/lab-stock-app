import { ContentSkeleton } from "../../content-skeleton";

/**
 * 관리(/manage) 본문(요약 숫자)을 기다리는 동안 — 셸(nav-pill·tab-bar)은 그대로, 본문 자리에만.
 * 문지기(비로그인 · 소속 없음)는 (member) 레이아웃이 먼저 판정하므로 loading 경계를 둔다.
 */
export default function ManageLoading() {
  return <ContentSkeleton bars={1} blocks={6} />;
}
