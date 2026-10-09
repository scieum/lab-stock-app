import Link from "next/link";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

type Props = {
  /** 둘러보기 경로 (dev-rules.json routes 13-guest) */
  href?: string;
  /**
   * pill = 15-mobile 회색 pill "둘러보기" + 하늘색 chevron (358 폭 가운데)
   * link = 15-desktop 히어로 guest-link — 바탕 없이 "둘러보기" 15/600 + 하늘색 chevron 16 (높이 44)
   */
  variant?: "pill" | "link";
  className?: string;
};

/** 랜딩(15) 둘러보기 진입 (시안 15 guest-entry) → /demo */
export function GuestEntry({ href = "/demo", variant = "pill", className }: Props) {
  if (variant === "link") {
    return (
      <div data-component="guest-entry" className={[styles.entryLink, className ?? ""].join(" ").trim()}>
        <Link href={href} prefetch={linkPrefetch(href)} className={styles.link}>
          둘러보기
          <Icon name="chevron-right" className={styles.linkIcon} />
          <LinkPending />
        </Link>
      </div>
    );
  }
  return (
    <div data-component="guest-entry" className={[styles.entry, className ?? ""].join(" ").trim()}>
      <ButtonPillSoft href={href} icon="chevron-right" className={styles.button}>
        둘러보기
      </ButtonPillSoft>
    </div>
  );
}
