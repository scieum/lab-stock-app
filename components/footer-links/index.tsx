import Link from "next/link";
import { GUIDE_LABEL, GUIDE_LINK_PROPS } from "@/lib/guide-link";
import { PRIVACY_HREF, PRIVACY_TITLE } from "@/lib/privacy";
import styles from "./styles.module.css";

/**
 * footer-links (rules 1.32 footer, 시안 15 · 19 web-footer): '개인정보 처리방침'(caption ink 600 — 쉽게 찾게) · '사용 가이드'(caption text-muted, 새 탭).
 * 링크 높이는 44 터치 영역.
 */
export function FooterLinks({ className }: { className?: string }) {
  return (
    <span data-component="footer-links" className={[styles.links, className ?? ""].filter(Boolean).join(" ")}>
      <Link href={PRIVACY_HREF} prefetch={false} className={styles.privacy}>
        {PRIVACY_TITLE}
      </Link>
      <span className={styles.separator} aria-hidden="true">
        {" · "}
      </span>
      <a {...GUIDE_LINK_PROPS} className={styles.guide}>
        {GUIDE_LABEL}
      </a>
    </span>
  );
}
