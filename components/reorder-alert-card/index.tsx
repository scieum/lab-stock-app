import { BadgeLowStock } from "@/components/badge-low-stock";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import styles from "./styles.module.css";

/** 재주문 알림 카드 (교사·admin 전용 — 학생 화면에는 0개, R2) */
export function ReorderAlertCard({ count, href }: { count: number; href?: string }) {
  return (
    <section data-component="reorder-alert-card" className={styles.card} aria-label="재주문 알림">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 className={styles.heading}>재주문 알림</h2>
          {count > 0 ? <BadgeLowStock /> : null}
        </div>
        <ButtonPillSoft tone="white" icon="chevron-right" href={href}>
          {count}건
        </ButtonPillSoft>
      </div>
      <p className={styles.body}>
        {count > 0 ? `필요량보다 적은 시약이 ${count}종 있어요` : "재주문이 필요한 시약이 없어요"}
      </p>
    </section>
  );
}
