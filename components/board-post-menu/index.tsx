"use client";

import Link from "next/link";
import menuStyles from "@/components/page-more-menu/styles.module.css";
import { ReagentMoreMenu } from "@/components/reagent-more-menu";
import { BOARD_TEXT } from "@/lib/board";
import styles from "./styles.module.css";

type Props = {
  /** 수정 주소 (/board/{id}/edit) */
  editHref: string;
  /** 답변이 달린 글 — '수정' 비활성 + 이유 '답변이 달린 글은 고칠 수 없어요' */
  answered: boolean;
  /** '삭제' — 부르는 쪽이 ex-modal-card 확인을 띄운다 */
  onDelete?: () => void;
  /** 갤러리 예시 — 처음부터 열린 메뉴 */
  defaultOpen?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
};

/**
 * board-post-menu (rules 1.32 board.own_post, 시안 20-detail): 글쓴이 본인에게만 ⋯ 44 → 작은 메뉴(reagent-more-menu 모양) '수정' · '삭제'.
 * 답변이 달린 뒤에는 '수정' 비활성(text-faint) + 아래 caption 이유.
 */
export function BoardPostMenu({ editHref, answered, onDelete, defaultOpen, buttonRef }: Props) {
  return (
    <div data-component="board-post-menu" className={styles.wrap}>
      <ReagentMoreMenu component={null} label="글 더보기" defaultOpen={defaultOpen} buttonRef={buttonRef}>
        {answered ? (
          <button type="button" role="menuitem" className={menuStyles.item} disabled aria-disabled>
            <span className={styles.label}>{BOARD_TEXT.edit}</span>
            <span className={menuStyles.caption}>{BOARD_TEXT.editLocked}</span>
          </button>
        ) : (
          <Link href={editHref} role="menuitem" prefetch={false} className={[menuStyles.item, styles.link].join(" ")}>
            <span className={styles.label}>{BOARD_TEXT.edit}</span>
          </Link>
        )}
        <button type="button" role="menuitem" className={menuStyles.item} onClick={onDelete}>
          <span className={styles.label}>{BOARD_TEXT.delete}</span>
        </button>
      </ReagentMoreMenu>
    </div>
  );
}
