import { PRIVACY_HREF, PRIVACY_LINK_LABEL } from "@/lib/privacy";
import styles from "./styles.module.css";

/**
 * privacy-link (rules 1.32 privacy_consent.link, 시안 14-consent): privacy-consent-detail 마지막 줄
 * '개인정보 처리방침 전문 보기 ↗' — ink 15/600 밑줄(highlight 아님), 새 탭(가입 입력 유지).
 */
export function PrivacyLink({ href = PRIVACY_HREF, className }: { href?: string; className?: string }) {
  return (
    <a
      data-component="privacy-link"
      href={href}
      target="_blank"
      rel="noopener"
      className={[styles.link, className ?? ""].filter(Boolean).join(" ")}
    >
      {PRIVACY_LINK_LABEL} ↗<span className={styles.srOnly}> (새 탭)</span>
    </a>
  );
}
