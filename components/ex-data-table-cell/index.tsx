import { Icon } from "@/components/icons";
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
  /** 가운데 맨 아래 회색 캡션 (화면 10: 기록한 날이 사용일과 다를 때 "10월 6일에 기록", 12 회색) */
  caption?: string;
  /** 오른쪽 사용량·단위 (body, 예: 5 g) */
  amount: string;
  /** 누른 행 (상세가 열려 있음) = 연하늘 바탕 */
  selected?: boolean;
} & Omit<React.ComponentProps<"button">, "title" | "children">;

/** 기록 행 (화면 10): 3열 = 날짜 · 시약명/사용자 · 사용량. 누르면 상세(ex-modal-card)가 열린다 */
export function DataRecordRow({ date, title, subtitle, caption, amount, selected, className, type = "button", ...rest }: RecordRowProps) {
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
        {caption ? <span className={styles.recordCaption}>{caption}</span> : null}
      </span>
      <span className={styles.recordAmount}>{amount}</span>
    </button>
  );
}

type MemberRowProps = {
  /** 이름 (15/600) */
  name: string;
  /** 역할 글자 (학생 · 교사 · admin) — 모바일 보조줄, 데스크탑 pill */
  role: string;
  /** 로그인한 본인 행 = "나" 배지 + 연하늘 바탕 */
  self?: boolean;
  /** 오른쪽 보조 문구 (예: "본인 · 마지막 admin") */
  note?: string;
  /** 오른쪽 › (역할을 바꿀 수 있는 행) */
  chevron?: boolean;
  /** 이 행의 시트가 열려 있음 */
  selected?: boolean;
} & Omit<React.ComponentProps<"button">, "children" | "role">;

/** 멤버 행 (화면 8): 이름(+나) · 역할 · ›. 누르면 역할 변경 시트(ex-modal-card)가 열린다 */
export function DataMemberRow({
  name,
  role,
  self,
  note,
  chevron = true,
  selected,
  className,
  type = "button",
  ...rest
}: MemberRowProps) {
  return (
    <button
      data-component="ex-data-table-cell"
      type={type}
      aria-haspopup="dialog"
      aria-expanded={selected ? true : false}
      className={[styles.entry, styles.entryButton, self ? styles.entrySelf : "", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <span className={styles.entryMain}>
        <span className={styles.entryName}>{name}</span>
        {self ? <span className={styles.entryBadge}>나</span> : null}
      </span>
      <span className={styles.entrySub}>
        <span className={styles.entryRole}>{role}</span>
      </span>
      <span className={styles.entryEnd}>
        {note ? <span className={styles.entryNote}>{note}</span> : null}
        {chevron ? <Icon name="chevron-right" className={styles.entryChevron} /> : null}
      </span>
    </button>
  );
}

type InviteRowProps = {
  email: string;
  /** 보조줄 (예: "2026.09.28 초대") */
  caption: string;
  /** 오른쪽 상태 글자 (예: "대기") */
  status: string;
};

/** 초대 대기 행 (화면 8): 이메일 · 초대일 · 상태. 누를 수 없다 */
export function DataInviteRow({ email, caption, status }: InviteRowProps) {
  return (
    <div data-component="ex-data-table-cell" className={styles.entry}>
      <span className={[styles.entryMain, styles.entryEmail].join(" ")}>{email}</span>
      <span className={styles.entrySub}>
        <span className={styles.entryNote}>{caption}</span>
      </span>
      <span className={styles.entryEnd}>
        <span className={styles.entryStatus}>{status}</span>
      </span>
    </div>
  );
}
