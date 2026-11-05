import { Icon } from "@/components/icons";
import { BOARD_TEXT } from "@/lib/board";
import styles from "./styles.module.css";

/**
 * board-privacy-note (rules 1.32 board.form, 시안 20-new): 정보 아이콘 16(text-muted) + '학생 이름·연락처 같은 개인정보는 쓰지 마세요'
 * (body-sm ink), 사이 8. 핑크 없음.
 */
export function BoardPrivacyNote({ id }: { id?: string }) {
  return (
    <p data-component="board-privacy-note" id={id} className={styles.note}>
      <Icon name="info" className={styles.icon} />
      <span>{BOARD_TEXT.privacyNote}</span>
    </p>
  );
}
