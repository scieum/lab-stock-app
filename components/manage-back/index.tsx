import Link from "next/link";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

type Props = {
  /** '/manage' (둘러보기 '/demo/manage') — lib/manage-menu manageBackHref */
  href: string;
  className?: string;
};

/**
 * manage-back (rules 1.29 manage.back, 시안 2-mobile · 17-mobile nav-left): 관리 아래 화면(2·5·6·7·8·9·11·17) 모바일 머리 왼쪽
 * '‹ 관리' — 하늘색 ‹ 20 + ink 15/400 글자, 사이 4, 높이 48(누름 영역). 더 깊은 화면(3·16·센서 상세 등)은 지금처럼 ‹ 뒤로.
 */
export function ManageBack({ href, className }: Props) {
  return (
    <Link
      data-component="manage-back"
      href={href}
      prefetch={linkPrefetch(href)}
      className={[styles.back, className ?? ""].filter(Boolean).join(" ")}
    >
      <Icon name="back" className={styles.icon} />
      <span className={styles.label}>관리</span>
      <LinkPending />
    </Link>
  );
}
