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

type ItemProps = {
  /** 시약명 (heading-4, 한 줄) */
  name: string;
  /** "필요량 60 g / 현재 재고 30 g" (lib/reorder-rules reorderAmountText) */
  amount: string;
  /** 기준 문구 "1반 1회 실험량 10 g × 6조 기준" 또는 "재주문 기준 60 g" */
  basis?: string;
  /** "2026.09.30 알림" — 없으면 줄을 그리지 않는다 */
  date?: string | null;
  /** 카드 맨 아래 (vendor-link "판매처 연결") */
  children?: React.ReactNode;
};

/**
 * 재주문 알림 1건 (화면 6, 교사·admin 전용 — 학생 화면에는 0개, R2).
 * 배지 "재고 부족" → 시약명 → 필요량 / 현재 재고 → 기준 문구 → 알림 날짜 → children(vendor-link). 하늘색 없음.
 */
export function ReorderAlertItemCard({ name, amount, basis, date, children }: ItemProps) {
  return (
    <article data-component="reorder-alert-card" className={[styles.card, styles.item].join(" ")} aria-label={`${name} 재주문 알림`}>
      <div className={styles.badgeRow}>
        <BadgeLowStock />
      </div>
      <h2 className={styles.name}>{name}</h2>
      <p className={styles.body}>{amount}</p>
      {basis ? <p className={styles.basis}>{basis}</p> : null}
      {date ? <p className={styles.date}>{date}</p> : null}
      {children}
    </article>
  );
}

/** 알림 카드 목록 (시안 reorder-alert-list): 모바일 한 줄 사이 12, 데스크탑 2열 사이 16 */
export function ReorderAlertList({ children, label = "재주문 알림" }: { children: React.ReactNode; label?: string }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {children}
    </ul>
  );
}

/** 목록 한 칸 (li) */
export function ReorderAlertListItem({ children }: { children: React.ReactNode }) {
  return <li className={styles.listItem}>{children}</li>;
}
