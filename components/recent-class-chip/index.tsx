import styles from "./styles.module.css";

type Props = {
  /** "1학년 2반 · 통합과학" */
  label: string;
  /** 지금 세 칸 값과 같은 조합 = highlight-soft + highlight 테두리 */
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
};

/**
 * 최근 수업 조합 칩 (디자인 1.25 recent-class-chip, 화면 4 class-select 위): canvas-soft pill · 높이 44 · 좌우 16 · 12/600.
 * 누르면 학년·반·수업명 세 칸을 채운다. 고른 칩 = 연하늘 바탕 + 하늘색 테두리 (글자는 ink).
 */
export function RecentClassChip({ label, selected = false, onClick, disabled }: Props) {
  return (
    <button
      type="button"
      data-component="recent-class-chip"
      aria-pressed={selected}
      className={[styles.chip, selected ? styles.selected : ""].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
