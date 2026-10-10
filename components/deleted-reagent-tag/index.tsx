import styles from "./styles.module.css";

/**
 * 삭제된 시약 표시 (디자인 1.25 deleted-reagent-tag, 화면 10): canvas-soft 회색 pill, ink 12/600 "삭제된 시약".
 * 보관(삭제)된 시약의 기록 행 시약명 옆 — 시약명은 회색, 시약 상세로 가는 링크 없음 (rules reagent_delete.history).
 */
export function DeletedReagentTag({ className }: { className?: string }) {
  return (
    <span data-component="deleted-reagent-tag" className={[styles.tag, className ?? ""].filter(Boolean).join(" ")}>
      삭제된 시약
    </span>
  );
}
