import styles from "./styles.module.css";

/** 표 틀 (흰 바탕 + 연회색 테두리, radius 16). 셀은 ex-data-table-cell. */
export function DataTable({ head, children, label }: { head: React.ReactNode; children: React.ReactNode; label?: string }) {
  return (
    <div data-component="ex-data-table" className={styles.wrap}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr className={styles.row}>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** 표 행. selected = 하늘색 연한 바탕 */
export function DataTableRow({ children, selected }: { children: React.ReactNode; selected?: boolean }) {
  return (
    <tr className={[styles.row, selected ? styles.selected : ""].join(" ").trim()} aria-selected={selected || undefined}>
      {children}
    </tr>
  );
}
