import styles from "./styles.module.css";

type Props = {
  children: React.ReactNode;
  /** header = 회색 작은 글자(열 이름), value = 본문 */
  variant?: "header" | "value";
  align?: "start" | "end";
  strong?: boolean;
};

/** 표 셀 (사용 기록 표) */
export function DataTableCell({ children, variant = "value", align = "start", strong }: Props) {
  const cls = [styles.cell, styles[variant], align === "end" ? styles.end : "", strong ? styles.strong : ""]
    .join(" ")
    .trim();
  if (variant === "header") {
    return (
      <th data-component="ex-data-table-cell" scope="col" className={cls}>
        {children}
      </th>
    );
  }
  return (
    <td data-component="ex-data-table-cell" className={cls}>
      {children}
    </td>
  );
}
