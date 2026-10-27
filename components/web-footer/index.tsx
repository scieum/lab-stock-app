import { GUIDE_LABEL, GUIDE_LINK_PROPS } from "@/lib/guide-link";
import styles from "./styles.module.css";

/** design/rules.json footer.text */
export const FOOTER_TEXT = "© 2026 사이음(sci_eum). 과학의 사이, 사람을 잇다.";

/**
 * 랜딩 맨 아래 한 줄 (rules.json 1.24 footer, 시안 15-desktop web-footer): 흰 바탕 · 위 hairline-soft(gray-100) ·
 * 위아래 32 · 가운데 caption 12/400 회색(text-muted). 열·약관 링크 없음.
 */
export function WebFooter({ className }: { className?: string }) {
  return (
    <footer data-component="web-footer" className={[styles.footer, className ?? ""].filter(Boolean).join(" ")}>
      <p className={styles.copyright}>{FOOTER_TEXT}</p>
      {/* 시안 예외 (사용자 요청 2026-10-28, 요청서 10 대기): 저작권 줄 아래 '사용 가이드' 링크 하나, 새 탭 */}
      <a {...GUIDE_LINK_PROPS} className={styles.guide}>
        {GUIDE_LABEL}
      </a>
    </footer>
  );
}
