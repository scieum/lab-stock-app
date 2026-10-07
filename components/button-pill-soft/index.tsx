import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

type Props = {
  children: React.ReactNode;
  href?: string;
  /** 오른쪽 아이콘 (하늘색) */
  icon?: Extract<IconName, "chevron-right" | "external">;
  /** muted = 회색 바탕(기본), white = 흰 바탕(회색 카드 위) */
  tone?: "muted" | "white";
  /** true = 가는 테두리(hairline-strong) — 시안 1.17 6 의 흰 pill (실험 매뉴얼 올리기 · 직접 열기) */
  bordered?: boolean;
  fullWidth?: boolean;
  external?: boolean;
  /** 선택형 칩 (화면 7 프리셋·단위). true = 연하늘 바탕 + 하늘색 테두리 */
  selected?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/** 연한 바탕 stadium pill 버튼 (더 보기·MSDS 보기·N건) */
export function ButtonPillSoft({
  children,
  href,
  icon,
  tone = "muted",
  bordered = false,
  fullWidth,
  external,
  selected,
  className,
  type = "button",
  ...rest
}: Props) {
  const cls = [
    styles.button,
    styles[tone],
    bordered ? styles.bordered : "",
    fullWidth ? styles.full : "",
    selected !== undefined ? styles.selectable : "",
    selected ? styles.selected : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      <span>{children}</span>
      {icon ? <Icon name={icon} className={styles.icon} /> : null}
    </>
  );
  if (href && external) {
    return (
      <a data-component="button-pill-soft" href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {content}
      </a>
    );
  }
  if (href) {
    return (
      <Link data-component="button-pill-soft" href={href} prefetch={linkPrefetch(href)} className={cls}>
        {content}
        <LinkPending />
      </Link>
    );
  }
  return (
    <button data-component="button-pill-soft" type={type} className={cls} aria-pressed={selected} {...rest}>
      {content}
    </button>
  );
}
