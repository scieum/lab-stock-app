import { Children, useId } from "react";
import styles from "./styles.module.css";

/** 기록 목록 틀 (월 그룹을 세로로 쌓는다). 시안 record-list — data-component 없음 */
export function RecordList({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className={styles.list} role="group" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * 월 그룹 (시안 record-group): 하늘색 짧은 인디케이터 + caption 헤더, 아래에 기록 행(DataRecordRow).
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
