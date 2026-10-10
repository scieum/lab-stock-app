import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** "재고 120 mL보다 많아요" (lib/usage-batch-rules overStockText) */
  children: React.ReactNode;
  id?: string;
  className?: string;
};

/**
 * 재고 초과 경고 줄 (디자인 1.25 usage-over-stock, 화면 4-error): mix-warning 모양 —
 * 연핑크(accent-soft) 바탕 · radius 16 · 안쪽 12 16 · 사이 8, 경고 아이콘만 진한 핑크, 글자 13 기본색.
 * 사용량 > 현재 재고 = 재고 부족 신호 (rules colors.accent.only_within 에 usage-over-stock).
 */
export function UsageOverStock({ children, id, className }: Props) {
  return (
    <p data-component="usage-over-stock" id={id} role="alert" className={[styles.box, className ?? ""].filter(Boolean).join(" ")}>
      <Icon name="warning" className={styles.icon} />
      <span className={styles.message}>{children}</span>
    </p>
  );
}
