import { AutoThresholdBadge } from "@/components/auto-threshold-badge";
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
  /** "재주문 기준 60g / 현재 재고 30g" (lib/reorder-rules reorderAmountText) */
  amount: string;
  /** 기준 문구 "1반 1회 실험량 10 g × 6조 기준" 또는 "재주문 기준 60 g" (자동 기준이면 쓰지 않는다) */
  basis?: string;
  /**
   * 자동 기준 (d7 §18, 시안 6 stock-line): 수량 줄을 "재주문 기준 …" [자동] "/ 현재 재고 …" 로 그리고
   * 아래에 캡션 한 줄("최근 사용량으로 계산했어요" 등). 있으면 amount·basis 대신 쓴다.
   */
  auto?: { need: string; stock: string; caption: string | null };
  /** "10월 7일 알림" — 없으면 줄을 그리지 않는다 */
  date?: string | null;
  /** 오른쪽(데스크톱)·아래(모바일) 동작 칸 (vendor-link "판매처 연결" · 새 창 안내 줄) */
  children?: React.ReactNode;
};

/**
 * 재주문 알림 1건 (화면 6, 교사·admin 전용 — 학생 화면에는 0개, R2). 시안 1.17 6:
 * 정보 칸(배지 "재고 부족" → 시약명 → 수량 줄 → [자동 캡션 | 기준 문구] → 알림 날짜) + 동작 칸(children).
 * 모바일은 위아래(사이 8), 데스크톱은 좌우 두 칸(사이 24). 하늘색 없음.
 */
export function ReorderAlertItemCard({ name, amount, basis, auto, date, children }: ItemProps) {
  return (
    <article data-component="reorder-alert-card" className={[styles.card, styles.item].join(" ")} aria-label={`${name} 재주문 알림`}>
      <div className={styles.info}>
        <div className={styles.badgeRow}>
          <BadgeLowStock />
        </div>
        <h2 className={styles.name}>{name}</h2>
        {auto ? (
          <>
            <p className={[styles.body, styles.stockLine].join(" ")}>
              <span>{auto.need}</span>
              <AutoThresholdBadge on="muted" />
              <span>/ {auto.stock}</span>
            </p>
            {auto.caption ? <p className={styles.caption}>{auto.caption}</p> : null}
          </>
        ) : (
          <>
            <p className={styles.body}>{amount}</p>
            {basis ? <p className={styles.basis}>{basis}</p> : null}
          </>
        )}
        {date ? <p className={styles.date}>{date}</p> : null}
      </div>
      {children ? <div className={styles.actions}>{children}</div> : null}
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
