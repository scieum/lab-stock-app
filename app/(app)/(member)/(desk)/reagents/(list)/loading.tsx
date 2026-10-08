import { ContentSkeleton } from "../../../../content-skeleton";

/**
 * 시약 목록(/reagents) 본문을 기다리는 동안. (list) 묶음 안에만 둔다 —
 * 시약 상세(/reagents/[id])는 404 를 HTTP 상태로 돌려줘야 해서 loading 경계를 두지 않는다.
 */
export default function ReagentsLoading() {
  return <ContentSkeleton bars={2} blocks={5} />;
}
