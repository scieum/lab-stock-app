import { ContentSkeleton } from "../content-skeleton";

/** 홈(`/`) 본문을 기다리는 동안 — 셸은 (app) 레이아웃이 그대로 유지한다 */
export default function HomeLoading() {
  return <ContentSkeleton bars={0} blocks={5} />;
}
