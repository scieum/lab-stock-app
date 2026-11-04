import { BoardStatusBadge } from "@/components/board-status-badge";
import { BOARD_TEXT } from "@/lib/board";
import styles from "./styles.module.css";

type Props = {
  /** 분류 표시 ('오류 문의' · '개선 제안') */
  categoryLabel: string;
  title: string;
  /** '○○고등학교 선생님' */
  author: string;
  /** '10월 28일' */
  date: string;
  answered: boolean;
  body: string;
  /** 제목 줄 오른쪽 (board-post-menu — 글쓴이 본인만) */
  menu?: React.ReactNode;
  /** 운영자에게 보이는 숨긴 글 표시 */
  hidden?: boolean;
  /** 제목 id — 데스크톱 detail-drawer 이름(aria-labelledby) · 열릴 때 포커스 자리 */
  titleId?: string;
  /** 본문 아래 (board-answer · 운영자 답변 입력) */
  children?: React.ReactNode;
};

/**
 * board-detail (rules 1.32 board.detail, 시안 20-detail): 분류 caption → 제목 heading-2(24/700) → 글쓴이·날짜 줄 + board-status-badge
 * → hairline-soft → 본문 body. 답이 있으면 아래 board-answer (children). 묶음 사이 16.
 */
export function BoardDetail({ categoryLabel, title, author, date, answered, body, menu, hidden = false, titleId, children }: Props) {
  return (
    <article data-component="board-detail" className={styles.detail}>
      <header className={styles.head}>
        <div className={styles.titleRow}>
          <div className={styles.titleBlock}>
            <p className={styles.category}>
              {categoryLabel}
              {hidden ? <span className={styles.hidden}> · {BOARD_TEXT.hidden}</span> : null}
            </p>
            <h1 className={styles.title} id={titleId} tabIndex={titleId ? -1 : undefined} data-drawer-focus={titleId ? "" : undefined}>
              {title}
            </h1>
          </div>
          {menu}
        </div>
        <div className={styles.meta}>
          <span className={styles.metaText}>
            {author} · {date}
          </span>
          <BoardStatusBadge answered={answered} />
        </div>
      </header>
      <hr className={styles.divider} />
      <p className={styles.body}>{body}</p>
      {children}
    </article>
  );
}
