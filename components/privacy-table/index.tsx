import { DataTable, DataTableCell, DataTableRow } from "@/components/data-table";
import { PRIVACY_PROCESSORS, type PrivacyProcessor } from "@/lib/privacy";
import styles from "./styles.module.css";

const COLUMNS = [
  { key: "name", label: "업체", width: "22%" },
  { key: "role", label: "하는 일", width: "61%" },
  { key: "location", label: "위치", width: "17%" },
];

/**
 * privacy-table (rules 1.32 privacy_page.table, 시안 19 4절 위탁): 데스크톱 = data-table 열 업체 · 하는 일 · 위치,
 * 모바일 = 업체마다 canvas-soft 카드 한 장(rounded 16 · 안쪽 12 16 · 사이 4, 이름 17/600 · 하는 일 13 · 위치 caption muted).
 */
export function PrivacyTable({ rows = PRIVACY_PROCESSORS, className }: { rows?: PrivacyProcessor[]; className?: string }) {
  return (
    <div data-component="privacy-table" className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <ul className={styles.cards}>
        {rows.map((r) => (
          <li key={r.name} className={styles.card}>
            <span className={styles.name}>{r.name}</span>
            <span className={styles.role}>{r.role}</span>
            <span className={styles.location}>{r.location}</span>
          </li>
        ))}
      </ul>
      <div className={styles.table}>
        <DataTable label="처리 위탁 업체" columns={COLUMNS}>
          {rows.map((r) => (
            <DataTableRow key={r.name}>
              <DataTableCell className={styles.wrapCell}>{r.name}</DataTableCell>
              <DataTableCell className={styles.wrapCell}>{r.role}</DataTableCell>
              <DataTableCell className={styles.wrapCell}>{r.location}</DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      </div>
    </div>
  );
}
