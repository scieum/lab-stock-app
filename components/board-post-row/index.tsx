import Link from "next/link";
import { BoardStatusBadge } from "@/components/board-status-badge";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

type Props = {
  /** 글 보기 주소 (/board/{id}) */
  href: string;
  /** 분류 표시 ('오류 문의' · '개선 제안') */
  categoryLabel: string;
  title: string;
  /** '○○고등학교 선생님' (lib/board boardAuthorLabel) */
  author: string;
  /** '10월 28일' (lib/format formatKoreanDate) */
  date: string;
  answered: boolean;
};

/**
 * board-post-row (rules 1.32 board.row, 시안 20-student): 분류(caption muted) · 제목(17/600) 한 줄 /
 * 아래 '○○고등학교 선생님 · 10월 28일'(caption muted) + 오른쪽 board-status-badge. 64 높이 · 안쪽 0 16 · 사이 12, 아래 hairline-soft.
 */
export function BoardPostRow({ href, categoryLabel, title, author, date, answered }: Props) {
  return (
    <Link data-component="board-post-row" href={href} prefetch={linkPrefetch(href)} className={styles.row}>
      <span className={styles.text}>
        <span className={styles.line}>
          <span className={styles.category}>{categoryLabel}</span>
          <span className={styles.title}>{title}</span>
        </span>
        <span className={styles.meta}>
          {author} · {date}
        </span>
      </span>
      <BoardStatusBadge answered={answered} />
      <LinkPending />
    </Link>
  );
}
