import styles from "./styles.module.css";

type Props = {
  /** true = 고름(하늘색 채움 + 흰 체크), "mixed" = 일부만 고름(표 머리 칸 — 흰 가로줄) */
  checked: boolean | "mixed";
  /**
   * 있으면 스스로 누를 수 있는 체크 버튼(데스크톱 표 머리 칸 = 전체 선택). 없으면 장식 —
   * 행 전체가 누름 요소(button aria-pressed)이고 이 원은 모양만 보인다.
   */
  onToggle?: () => void;
  /** onToggle 이 있을 때 읽기 도구 이름 (예: "전체 선택") */
  label?: string;
  className?: string;
};

/**
 * 고르기 원 (디자인 1.26 bulk_delete.checkbox, select-checkbox): 20 원(radius 9999).
 * 안 고름 = canvas + 가는 회색 테두리, 고름 = highlight 채움 + 흰 체크. 모바일 카드 왼쪽 · 데스크톱 data-table 첫 열 + 머리 칸.
 */
export function SelectCheckbox({ checked, onToggle, label, className }: Props) {
  const cls = [styles.box, checked ? styles.on : "", className ?? ""].filter(Boolean).join(" ");
  const mark =
    checked === "mixed" ? (
      <svg viewBox="0 0 20 20" className={styles.mark} aria-hidden="true" focusable="false">
        <path d="M5 10h10" />
      </svg>
    ) : checked ? (
      <svg viewBox="0 0 20 20" className={styles.mark} aria-hidden="true" focusable="false">
        <path d="m5.5 10.2 3 3 6-6.4" />
      </svg>
    ) : null;
  if (onToggle) {
    return (
      <button
        data-component="select-checkbox"
        type="button"
        role="checkbox"
        aria-checked={checked === "mixed" ? "mixed" : checked}
        aria-label={label}
        className={[cls, styles.button].join(" ")}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {mark}
      </button>
    );
  }
  return (
    <span data-component="select-checkbox" data-checked={checked ? "true" : "false"} className={cls} aria-hidden="true">
      {mark}
    </span>
  );
}
