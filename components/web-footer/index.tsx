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
    </footer>
  );
}
