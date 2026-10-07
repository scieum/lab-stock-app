import { forwardRef } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 적용된 필터 칩 수 (0 이면 배지 없음) */
  count?: number;
  /** 시트가 열려 있음 */
  expanded?: boolean;
  /** 시트 id (aria-controls) */
  controls?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

/**
 * 시약 목록 필터 버튼 (디자인 1.17 list-filter-button, 화면 2 검색 오른쪽):
 * 회색 pill + 하늘색 필터 아이콘 + "필터"(15/600) + 적용 개수 배지(연하늘 채움 · 하늘색 테두리 · 기본색 글자 12/600).
 */
export const ListFilterButton = forwardRef<HTMLButtonElement, Props>(function ListFilterButton(
  { count = 0, expanded = false, controls, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      data-component="list-filter-button"
      type={type}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={count > 0 ? `필터 ${count}개 적용됨` : "필터"}
      className={[styles.button, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <Icon name="filter" className={styles.icon} />
      <span className={styles.label}>필터</span>
      {count > 0 ? (
        <span className={styles.count} data-name="filter-count">
          {count}
        </span>
      ) : null}
    </button>
  );
});
