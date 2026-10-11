import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import styles from "./styles.module.css";

type Props = {
  /** 선택 모드인가 */
  selecting: boolean;
  /** 고른 개수 (선택 모드 머리 "N개 선택됨") */
  count?: number;
  /** "선택" */
  onStart?: () => void;
  /** "취소" — 선택 모드 끝 (고른 것 비움) */
  onCancel?: () => void;
  /** "전체 선택" — 지금 필터·검색 결과 전체(최대 100) */
  onSelectAll?: () => void;
  /** 전체 선택이 100개에서 잘렸음 → caption "앞의 100개만 골랐어요" */
  capped?: boolean;
  /**
   * mobile = 머리 오른쪽 button-pill-soft "선택", 선택 모드면 머리 줄 전체가 "취소 · N개 선택됨 · 전체 선택".
   * desktop = 머리 필터 옆 button-outline "선택" ↔ "취소" (개수는 머리 제목 줄, 전체 선택은 표 머리 칸)
   */
  variant?: "mobile" | "desktop";
  disabled?: boolean;
  className?: string;
};

export const SELECT_CAPPED_TEXT = "앞의 100개만 골랐어요";

/** "N개 선택됨" */
export function selectedCountText(n: number): string {
  return `${n}개 선택됨`;
}

/**
 * 목록 선택 모드 토글 (디자인 1.26 bulk_delete.toggle, list-select-toggle) — 교사·admin (R5: 학생 0, 둘러보기 숨김).
 */
export function ListSelectToggle({
  selecting,
  count = 0,
  onStart,
  onCancel,
  onSelectAll,
  capped = false,
  variant = "mobile",
  disabled,
  className,
}: Props) {
  if (variant === "desktop") {
    return (
      <div data-component="list-select-toggle" className={[styles.desktop, className ?? ""].filter(Boolean).join(" ")}>
        {selecting ? (
          <ButtonOutline onClick={onCancel} aria-label="선택 취소">
            취소
          </ButtonOutline>
        ) : (
          <ButtonOutline onClick={onStart} disabled={disabled}>
            선택
          </ButtonOutline>
        )}
      </div>
    );
  }
  if (!selecting) {
    return (
      <div data-component="list-select-toggle" className={[styles.start, className ?? ""].filter(Boolean).join(" ")}>
        <ButtonPillSoft onClick={onStart} disabled={disabled}>
          선택
        </ButtonPillSoft>
      </div>
    );
  }
  return (
    <div data-component="list-select-toggle" className={[styles.bar, className ?? ""].filter(Boolean).join(" ")}>
      <div className={styles.row}>
        <button type="button" className={styles.quiet} onClick={onCancel} aria-label="선택 취소">
          취소
        </button>
        <span className={styles.count} aria-live="polite">
          {selectedCountText(count)}
        </span>
        <button type="button" className={styles.quiet} onClick={onSelectAll}>
          전체 선택
        </button>
      </div>
      {capped ? <p className={styles.capped}>{SELECT_CAPPED_TEXT}</p> : null}
    </div>
  );
}
