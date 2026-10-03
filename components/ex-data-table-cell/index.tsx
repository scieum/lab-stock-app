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

type RecordRowProps = {
  /** 왼쪽 날짜 (caption, 예: 10.02) */
  date: string;
  /** 가운데 윗줄 (시약명, title) */
  title: string;
  /** 가운데 아랫줄 (사용자, body-sm) */
  subtitle?: string;
  /** 오른쪽 사용량·단위 (body, 예: 5 g) */
  amount: string;
  /** 누른 행 (상세가 열려 있음) = 연하늘 바탕 */
  selected?: boolean;
} & Omit<React.ComponentProps<"button">, "title" | "children">;

/** 기록 행 (화면 10): 3열 = 날짜 · 시약명/사용자 · 사용량. 누르면 상세(ex-modal-card)가 열린다 */
export function DataRecordRow({ date, title, subtitle, amount, selected, className, type = "button", ...rest }: RecordRowProps) {
  return (
    <button
      data-component="ex-data-table-cell"
      type={type}
      aria-haspopup="dialog"
      aria-expanded={selected ? true : false}
      className={[styles.record, selected ? styles.recordSelected : "", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <span className={styles.recordDate}>{date}</span>
      <span className={styles.recordMain}>
        <span className={styles.recordTitle}>{title}</span>
        {subtitle ? <span className={styles.recordSubtitle}>{subtitle}</span> : null}
      </span>
      <span className={styles.recordAmount}>{amount}</span>
    </button>
  );
}
