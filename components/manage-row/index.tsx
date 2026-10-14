import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

type Props = {
  href: string;
  label: string;
  icon: IconName;
  /** 요약 caption (lib/manage-menu manageCaption) — 없으면 이름만 */
  caption?: string | null;
};

/**
 * manage-row (rules 1.29 manage.row, 시안 18-mobile): 아이콘 24(ink) + 이름 17/600 + 요약 caption 12 muted + 오른쪽 › 20(muted).
 * 56 높이, 사각, canvas 바탕, 안쪽 좌우 16 · 사이 12. 숫자는 무채색 글자만.
 */
export function ManageRow({ href, label, icon, caption }: Props) {
  return (
    <Link data-component="manage-row" href={href} prefetch={linkPrefetch(href)} className={styles.row}>
      <Icon name={icon} className={styles.icon} />
      <span className={styles.text}>
        <span className={styles.name}>{label}</span>
        {caption ? <span className={styles.caption}>{caption}</span> : null}
      </span>
      <Icon name="chevron-right" className={styles.chevron} />
      <LinkPending />
    </Link>
  );
}
