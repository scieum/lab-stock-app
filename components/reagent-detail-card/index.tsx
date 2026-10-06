import { BadgeLowStock } from "@/components/badge-low-stock";
import styles from "./styles.module.css";

type Props = {
  name: string;
  stock: number | string;
  unit: string;
  lowStock?: boolean;
  intakeDate?: string;
  /** full = 상세(큰 재고 숫자 + 입고일), compact = 사용 기록 입력 화면 요약 */
  variant?: "full" | "compact";
  /**
   * 디자인 1.15 화면 3 card-meta 줄들 (reagent-location · reorder-threshold). 넘기면 재고 숫자 아래에
   * 입고일 · 이 줄들을 라벨-값 한 줄씩 쌓는다 (시안 3-mobile card-meta, 사이 12). 없으면 예전 배치(입고일은 재고 오른쪽).
   */
  meta?: React.ReactNode;
};

/** 시약 상세 카드 */
export function ReagentDetailCard({ name, stock, unit, lowStock, intakeDate, variant = "full", meta }: Props) {
  if (variant === "compact") {
    return (
      <section data-component="reagent-detail-card" className={[styles.card, styles.compact].join(" ")}>
        <h2 className={styles.name}>{name}</h2>
        <div className={styles.stockRow}>
          <span className={styles.fieldLabel}>현재 재고</span>
          <span className={styles.fieldValue}>
            {stock} {unit}
          </span>
        </div>
      </section>
    );
  }
  if (meta) {
    return (
      <section data-component="reagent-detail-card" className={styles.card}>
        <div className={styles.titleRow}>
          <h2 className={styles.name}>{name}</h2>
          {lowStock ? <BadgeLowStock /> : null}
        </div>
        <p className={styles.amount}>
          <span className={styles.stockValue}>{stock}</span>
          <span className={styles.unit}>{unit}</span>
        </p>
        <div className={styles.meta}>
          {intakeDate ? (
            <div className={styles.metaField}>
              <span className={styles.metaLabel}>입고일</span>
              <span className={styles.fieldValue}>{intakeDate}</span>
            </div>
          ) : null}
          {meta}
        </div>
      </section>
    );
  }
  return (
    <section data-component="reagent-detail-card" className={styles.card}>
      <div className={styles.titleRow}>
        <h2 className={styles.name}>{name}</h2>
        {lowStock ? <BadgeLowStock /> : null}
      </div>
      <div className={styles.detailRow}>
        <p className={styles.amount}>
          <span className={styles.stockValue}>{stock}</span>
          <span className={styles.unit}>{unit}</span>
        </p>
        {intakeDate ? (
          <div className={styles.intake}>
            <span className={styles.fieldLabel}>입고일</span>
            <span className={styles.fieldValue}>{intakeDate}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
