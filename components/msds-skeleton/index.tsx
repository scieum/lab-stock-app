import { MSDS_SUMMARY_TEXT } from "@/lib/msds-summary";
import styles from "./styles.module.css";

/** 화면 16 불러오는 중 (16-loading) — 회색 줄만: 신호어 pill · 그림문자 3칸 · 항목 카드 4개(제목 + 3줄). 글자 없음 */
export function MsdsSkeleton() {
  return (
    <div data-component="msds-skeleton" className={styles.skeleton} role="status" aria-busy="true" aria-label={MSDS_SUMMARY_TEXT.loading}>
      <span className={styles.pill} />
      <div className={styles.pictograms}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={styles.pictogram} />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={styles.card}>
          <span className={styles.title} />
          <span className={styles.line} />
          <span className={styles.line} />
          <span className={[styles.line, styles.short].join(" ")} />
        </div>
      ))}
    </div>
  );
}
