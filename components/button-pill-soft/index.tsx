import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  children: React.ReactNode;
  href?: string;
  /** 오른쪽 아이콘 (하늘색) */
  icon?: Extract<IconName, "chevron-right" | "external">;
  /** muted = 회색 바탕(기본), white = 흰 바탕(회색 카드 위) */
  tone?: "muted" | "white";
  fullWidth?: boolean;
  external?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/** 연한 바탕 stadium pill 버튼 (더 보기·MSDS 보기·N건) */
export function ButtonPillSoft({
  children,
  href,
  icon,
  tone = "muted",
  fullWidth,
  external,
  className,
  type = "button",
  ...rest
}: Props) {
  const cls = [styles.button, styles[tone], fullWidth ? styles.full : "", className ?? ""].join(" ").trim();
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
      <Link data-component="button-pill-soft" href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button data-component="button-pill-soft" type={type} className={cls} {...rest}>
      {content}
    </button>
  );
}
