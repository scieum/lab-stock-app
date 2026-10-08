import Link from "next/link";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

type Props = {
  children: React.ReactNode;
  href?: string;
  /** circle = 스테퍼 − · + 원형 버튼 (화면 7) */
  shape?: "pill" | "circle";
  /** href 를 새 창으로 연다 (target=_blank, rel=noopener noreferrer) — 화면 16 원문 MSDS 보기 */
  external?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/** 흰 바탕 + 회색 테두리 stadium pill 버튼 (보조 행동) */
export function ButtonOutline({ children, href, shape = "pill", external = false, className, type = "button", ...rest }: Props) {
  const cls = [styles.button, shape === "circle" ? styles.circle : "", className ?? ""].filter(Boolean).join(" ");
  if (href && external) {
    return (
      <a data-component="button-outline" href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  if (href) {
    return (
      <Link data-component="button-outline" href={href} prefetch={linkPrefetch(href)} className={cls}>
        {children}
        <LinkPending />
      </Link>
    );
  }
  return (
    <button data-component="button-outline" type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
