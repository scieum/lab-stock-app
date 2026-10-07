import { useId } from "react";
import { STORAGE_CLASSES } from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

type ChipProps = {
  /** 분류 이름 ("산") 또는 범례 글자 ("미지정" · "선택 칸") */
  label: string;
  selected?: boolean;
  /** true = 보기 전용 범례 칩 (작은 칩, 누름 동작 없음) */
  readOnly?: boolean;
  /** 누르면 선택을 켜고 끈다 (여러 개 선택 가능 — 묶음 쪽이 목록을 쥔다) */
  onToggle?: () => void;
  disabled?: boolean;
  /** filter = 화면 2 필터 시트 칩 (높이 44 · 좌우 16 · 13/600, 디자인 1.17 2-filter) */
  size?: "default" | "filter";
};

/**
 * 보관 분류 칩 (화면 11 · 화면 2 필터 시트). 고르는 칩 = 눌림 상태가 있는 버튼(aria-pressed), 범례 칩 = 글자만.
 * 선택 = 연하늘 바탕 + 하늘색 테두리, 글자는 기본색.
 */
export function StorageClassChip({ label, selected = false, readOnly = false, onToggle, disabled, size = "default" }: ChipProps) {
  const cls = [
    styles.chip,
    selected ? styles.selected : "",
    readOnly ? styles.legend : styles.toggle,
    size === "filter" && !readOnly ? styles.filter : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (readOnly) {
    return (
      <span data-component="storage-class-chip" className={cls}>
        {label}
      </span>
    );
  }
  return (
    <button data-component="storage-class-chip" type="button" className={cls} aria-pressed={selected} disabled={disabled} onClick={onToggle}>
      {label}
    </button>
  );
}

type PickerProps = {
  /** 고르는 칸 이름 ("좌1단") — 제목 "{칸} 보관 분류" */
  slotName: string;
  /** 지금 그 칸에 지정된 분류들 */
  selected: readonly string[];
  /** 칩을 눌렀을 때 (분류 이름) */
  onToggle?: (storageClass: string) => void;
  /** 칩 목록 (기본 = 보관 분류 8종) */
  classes?: readonly string[];
  hint?: string;
  disabled?: boolean;
};

/**
 * 선택한 칸의 분류 칩 묶음 (시안 11 slot-class-picker): 제목 + "여러 개 고를 수 있어요" + 칩 두 줄.
 * 시안 컴포넌트 이름이 아니라 data-component 는 없다 (칩 하나하나가 storage-class-chip).
 */
export function StorageClassPicker({
  slotName,
  selected,
  onToggle,
  classes = STORAGE_CLASSES,
  hint = "여러 개 고를 수 있어요",
  disabled,
}: PickerProps) {
  const titleId = useId();
  const hintId = `${titleId}-hint`;
  const half = Math.ceil(classes.length / 2);
  const rows = [classes.slice(0, half), classes.slice(half)].filter((r) => r.length > 0);
  return (
    <div role="group" aria-labelledby={titleId} aria-describedby={hint ? hintId : undefined} className={styles.picker}>
      <div className={styles.pickerHeader}>
        <h3 id={titleId} className={styles.pickerTitle}>
          {slotName} 보관 분류
        </h3>
        {hint ? (
          <span id={hintId} className={styles.hint}>
            {hint}
          </span>
        ) : null}
      </div>
      {rows.map((row, i) => (
        <div key={i} className={styles.chipRow}>
          {row.map((c) => (
            <StorageClassChip
              key={c}
              label={c}
              selected={selected.includes(c)}
              disabled={disabled}
              onToggle={onToggle ? () => onToggle(c) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
