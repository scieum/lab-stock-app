import styles from "./styles.module.css";

type Props = {
  /** 목차 항목 — 링크 = 같은 문서의 절 id */
  items: { id: string; label: string }[];
  className?: string;
};

/**
 * privacy-toc (rules 1.32 privacy_page.doc, 시안 19): canvas-soft 상자(rounded 24 · 안쪽 16 · 사이 8),
 * '목차'(caption muted) + 번호 붙은 절 링크(13/400 ink, 44 높이) 목록.
 */
export function PrivacyToc({ items, className }: Props) {
  return (
    <nav data-component="privacy-toc" aria-label="목차" className={[styles.toc, className ?? ""].filter(Boolean).join(" ")}>
      <p className={styles.title}>목차</p>
      <ol className={styles.list}>
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className={styles.link}>
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
