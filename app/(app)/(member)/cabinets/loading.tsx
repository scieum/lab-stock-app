import { ContentSkeleton } from "../../content-skeleton";

/**
 * 시약장 설정(/cabinets) 본문을 기다리는 동안 — 셸(nav-pill·tab-bar)은 그대로, 본문 자리에만.
 * 이 경로에는 역할별 redirect·404 가 없어(문지기는 (member) 레이아웃) loading 경계를 둔다.
 */
export default function CabinetsLoading() {
  return <ContentSkeleton bars={2} blocks={5} />;
}
