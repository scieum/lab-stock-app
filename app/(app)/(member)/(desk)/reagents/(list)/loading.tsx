import { ContentSkeleton } from "../../../../content-skeleton";
import styles from "../../_desk/desk.module.css";

/**
 * 시약 목록(/reagents) 본문을 기다리는 동안. (list) 묶음 안에만 둔다 —
 * 시약 상세(/reagents/[id])는 404 를 HTTP 상태로 돌려줘야 해서 loading 경계를 두지 않는다.
 * 데스크톱: (desk) 레이아웃의 가로 배치 안에서 본문 폭(안쪽 32)을 차지하고, 그동안 레이아웃 목록 자리는 숨긴다
 * (자리 표시는 하나 — 셸 전환 규칙).
 */
export default function ReagentsLoading() {
  return (
    <div className={styles.loading} data-desk-loading="">
      <ContentSkeleton bars={2} blocks={5} />
    </div>
  );
}
