import { Children, useId } from "react";
import styles from "./styles.module.css";

/** 기록 목록 틀 (사용일 묶음을 세로로 쌓는다, 묶음 사이 24). 시안 record-list — data-component 없음 */
export function RecordList({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className={styles.list} role="group" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * 묶음 (시안 record-group — 화면 10 은 사용일 "10월 7일 · 오늘"): 하늘색 짧은 인디케이터 + caption 헤더, 아래에 기록 행(DataRecordRow).
 * children 하나하나를 li 로 감싼다.
 */
export function RecordGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const headerId = useId();
  return (
    <section className={styles.group} aria-labelledby={headerId}>
      <h3 id={headerId} className={styles.header}>
        <span className={styles.indicator} aria-hidden="true" />
        <span>{label}</span>
      </h3>
      <ul className={styles.rows} aria-labelledby={headerId}>
        {Children.toArray(children).map((child, i) => (
          <li key={i} className={styles.item}>
            {child}
          </li>
        ))}
      </ul>
    </section>
  );
}
