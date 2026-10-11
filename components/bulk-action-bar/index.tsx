import { ButtonPrimary } from "@/components/button-primary";
import { selectedCountText } from "@/components/list-select-toggle";
import styles from "./styles.module.css";

type Props = {
  count: number;
  /** "삭제" (검정 button-primary) — 확인 모달을 연다 */
  onDelete?: () => void;
  pending?: boolean;
  /**
   * true(기본) = 화면에 고정: 모바일 tab-bar 바로 위 · 데스크톱 본문 아래(사이드바 오른쪽).
   * false = 제자리 (갤러리)
   */
  fixed?: boolean;
  className?: string;
};

/**
 * 여러 개 삭제 바 (디자인 1.26 bulk_delete.bar, bulk-action-bar): 1개 이상 고르면 나타난다.
 * canvas + 위 hairline-soft, radius 0. 왼쪽 "N개 선택됨"(title), 오른쪽 button-primary "삭제"(검정). 핑크 없음.
 */
export function BulkActionBar({ count, onDelete, pending = false, fixed = true, className }: Props) {
  return (
    <div
      data-component="bulk-action-bar"
      role="region"
      aria-label="고른 항목"
      className={[styles.bar, fixed ? styles.fixed : "", className ?? ""].filter(Boolean).join(" ")}
    >
      <span className={styles.count}>{selectedCountText(count)}</span>
      <ButtonPrimary className={styles.delete} onClick={onDelete} disabled={pending || count === 0} aria-busy={pending || undefined}>
        삭제
      </ButtonPrimary>
    </div>
  );
}
