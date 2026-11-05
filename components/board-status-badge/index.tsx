import { BOARD_TEXT } from "@/lib/board";
import styles from "./styles.module.css";

/**
 * board-status-badge (rules 1.32 board.status, 시안 20): 무채색 알약 24 높이 · 좌우 8 · 12/600.
 * '접수' = canvas-soft 바탕 + text-muted, '답변 완료' = ink 바탕 + 흰 글자. 핑크·하늘 없음. FAQ 에는 그리지 않는다.
 */
export function BoardStatusBadge({ answered, className }: { answered: boolean; className?: string }) {
  return (
    <span
      data-component="board-status-badge"
      data-status={answered ? "answered" : "received"}
      className={[styles.badge, answered ? styles.answered : styles.received, className ?? ""].filter(Boolean).join(" ")}
    >
      {answered ? BOARD_TEXT.statusAnswered : BOARD_TEXT.statusReceived}
    </span>
  );
}
