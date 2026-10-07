import { CabinetNumber } from "@/components/cabinet-number";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

export type AppliedChip = {
  key: string;
  label: string;
  /** 시약장 칩이면 번호 원(cabinet-number)을 라벨 앞에 */
  cabinetNumber?: number;
};

type Props = {
  chips: readonly AppliedChip[];
  /** 결과 수 ("12종") */
  count: number;
  /** 칩 하나의 × */
  onRemove?: (key: string) => void;
  /** "모두 지우기" */
  onClearAll?: () => void;
  className?: string;
};

/**
 * 적용된 필터 줄 (디자인 1.17 filter-chip-row, 화면 2 검색 아래):
 * 왼쪽 = 적용 칩(회색 pill, 라벨 13/600 + × 44) 여러 개 + "모두 지우기"(13/600 글자 버튼), 오른쪽 = 결과 수 "N종"(12 회색).
 */
export function FilterChipRow({ chips, count, onRemove, onClearAll, className }: Props) {
  return (
    <div data-component="filter-chip-row" className={[styles.row, className ?? ""].filter(Boolean).join(" ")}>
      <ul className={styles.group} aria-label="적용된 필터">
        {chips.map((c) => (
          <li key={c.key} className={styles.chip} data-name="applied-chip">
            {typeof c.cabinetNumber === "number" ? <CabinetNumber number={c.cabinetNumber} className={styles.number} /> : null}
            <span className={styles.label}>{c.label}</span>
            <button
              type="button"
              className={styles.remove}
              aria-label={`${c.label} 필터 빼기`}
              onClick={onRemove ? () => onRemove(c.key) : undefined}
            >
              <Icon name="close" className={styles.removeIcon} />
            </button>
          </li>
        ))}
        {chips.length > 0 ? (
          <li className={styles.clearItem}>
            <button type="button" className={styles.clear} onClick={onClearAll}>
              모두 지우기
            </button>
          </li>
        ) : null}
      </ul>
      <p className={styles.count} role="status" aria-live="polite">
        {count}종
      </p>
    </div>
  );
}
