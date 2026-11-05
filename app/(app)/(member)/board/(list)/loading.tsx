import { ContentSkeleton } from "../../../content-skeleton";

/** 게시판(/board · /board/*) 본문을 기다리는 동안 — 셸은 그대로, 본문 자리에만 */
export default function BoardLoading() {
  return <ContentSkeleton bars={1} blocks={6} />;
}
