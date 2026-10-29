import { FooterLinks } from "@/components/footer-links";
import styles from "./styles.module.css";

/** design/rules.json footer.text */
export const FOOTER_TEXT = "© 2026 사이음(sci_eum). 과학의 사이, 사람을 잇다.";

/**
 * 랜딩·처리방침 맨 아래 (rules.json 1.32 footer, 시안 15 · 19 web-footer): 흰 바탕 · 위 hairline-soft · caption text-muted.
 * 데스크톱 = 가운데 한 줄 '저작권 · footer-links', 모바일 = 두 줄(저작권 / footer-links). 열 없음.
 */
export function WebFooter({ className }: { className?: string }) {
  return (
    <footer data-component="web-footer" className={[styles.footer, className ?? ""].filter(Boolean).join(" ")}>
      <p className={styles.copyright}>{FOOTER_TEXT}</p>
      <span className={styles.separator} aria-hidden="true">
        {" · "}
      </span>
      <FooterLinks />
    </footer>
  );
}
