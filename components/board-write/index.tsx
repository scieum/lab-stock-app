import { ButtonPrimary } from "@/components/button-primary";
import { BOARD_TEXT } from "@/lib/board";
import styles from "./styles.module.css";

/**
 * board-write (rules 1.32 board.write, 시안 20): 페이지 머리 오른쪽 button-primary '글쓰기'(44 높이 알약) → board-form.
 * 교사·admin 만 그린다 (학생 0, R5).
 */
export function BoardWrite({ href }: { href: string }) {
  return (
    <div data-component="board-write" className={styles.wrap}>
      <ButtonPrimary href={href} className={styles.button}>
        {BOARD_TEXT.write}
      </ButtonPrimary>
    </div>
  );
}
