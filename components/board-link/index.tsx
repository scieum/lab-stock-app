import Link from "next/link";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import itemStyles from "@/components/sidebar-item/styles.module.css";
import rowStyles from "@/components/manage-row/styles.module.css";
import { BOARD_HREF, BOARD_LABEL } from "@/lib/board";
import { linkPrefetch } from "@/lib/link-prefetch";

type Props = {
  /**
   * sidebar = 데스크톱 사이드바 guide-link 바로 위 (rules desktop_shell.board_link: sidebar-item 모양, 화면 20 에서 현재 표시)
   * row = 모바일 관리 탭(18) '도움말' 묶음 (rules manage.guide: manage-row 모양 + 요약 caption)
   */
  variant: "sidebar" | "row";
  /** sidebar: /board · /board/* 에서 true */
  active?: boolean;
  /** row: 요약 caption ('답변 완료 1', lib/board boardAnsweredCaption) — 없으면 이름만 */
  caption?: string | null;
  href?: string;
  className?: string;
};

/**
 * board-link (rules 1.32 board.entry, 시안 18-mobile · 20-desktop): '게시판' 진입 한 줄. 로그인한 모든 역할, 둘러보기 없음.
 * 메뉴 항목 수(rules desktop_shell.menu)에 넣지 않으므로 sidebar-item 이름은 달지 않는다 — 모양만 같다.
 */
export function BoardLink({ variant, active = false, caption, href = BOARD_HREF, className }: Props) {
  if (variant === "row") {
    return (
      <Link data-component="board-link" href={href} prefetch={linkPrefetch(href)} className={[rowStyles.row, className ?? ""].filter(Boolean).join(" ")}>
        <Icon name="board" className={rowStyles.icon} />
        <span className={rowStyles.text}>
          <span className={rowStyles.name}>{BOARD_LABEL}</span>
          {caption ? <span className={rowStyles.caption}>{caption}</span> : null}
        </span>
        <Icon name="chevron-right" className={rowStyles.chevron} />
        <LinkPending />
      </Link>
    );
  }
  return (
    <Link
      data-component="board-link"
      href={href}
      prefetch={linkPrefetch(href)}
      className={[active ? itemStyles.itemActive : itemStyles.item, className ?? ""].filter(Boolean).join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <Icon name="board" className={itemStyles.icon} />
      <span className={itemStyles.label}>{BOARD_LABEL}</span>
      <LinkPending />
    </Link>
  );
}
