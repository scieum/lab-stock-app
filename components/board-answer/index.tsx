import { BOARD_TEXT } from "@/lib/board";
import styles from "./styles.module.css";

type Props = {
  body: string;
  /** 답변 날짜 '10월 29일' */
  date: string;
  /** 상자 아래 자리 (운영자만: 답변 고치기 — d7 §30) */
  children?: React.ReactNode;
};

/**
 * board-answer (rules 1.32 board.detail, 시안 20-detail): canvas-soft 상자(radius 24 · 안쪽 16 · 사이 8),
 * 머리 '운영자 답변 · 10월 29일'(caption muted) · 본문 body-sm ink.
 */
export function BoardAnswer({ body, date, children }: Props) {
  return (
    <section data-component="board-answer" aria-label={BOARD_TEXT.answerHead} className={styles.answer}>
      <p className={styles.head}>
        {BOARD_TEXT.answerHead} · {date}
      </p>
      <p className={styles.body}>{body}</p>
      {children}
    </section>
  );
}
