import { ContentSkeleton } from "../../../content-skeleton";

/**
 * 사용 기록 내역(/usage) 본문을 기다리는 동안. (list) 묶음 안에만 둔다 —
 * 사용 기록 입력(/usage/new)은 404 를 HTTP 상태로 돌려줘야 해서 loading 경계를 두지 않는다.
 */
export default function UsageHistoryLoading() {
  return <ContentSkeleton bars={2} blocks={5} />;
}
