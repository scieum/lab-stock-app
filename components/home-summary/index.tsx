import Link from "next/link";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

/** 홈 요약 묶음 (재고 부족 요약·시약장 요약 카드를 담는다) */
export function HomeSummary({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      data-component="home-summary"
      className={[styles.summary, className ?? ""].join(" ").trim()}
      aria-label="요약"
    >
      {children}
    </section>
  );
}

type LowStockItem = { name: string; amount: string; href?: string };

/** 재고 부족 요약 카드 */
export function StockSummaryCard({
  lowStockCount,
  items,
  totalCount,
}: {
  lowStockCount: number;
  items: LowStockItem[];
  totalCount: number;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h2 className={styles.heading}>재고 부족 {lowStockCount}개</h2>
        {lowStockCount > 0 ? <BadgeLowStock>{lowStockCount}</BadgeLowStock> : null}
      </div>
      {items.length > 0 ? (
        <ul className={styles.chips}>
          {items.map((it) => (
            <li key={`${it.name}-${it.amount}`} className={styles.chip}>
              {it.href ? (
                <Link href={it.href} className={styles.chipLink}>
                  {it.name} · {it.amount}
                </Link>
              ) : (
                `${it.name} · ${it.amount}`
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.bodySm}>재고가 부족한 시약이 없어요</p>
      )}
      <div className={styles.stat}>
        <span className={styles.caption}>전체 시약</span>
        <span className={styles.value}>{totalCount}종</span>
      </div>
    </div>
  );
}

/** 시약장 요약 카드 */
export function CabinetSummaryCard({
  cabinetCount,
  assigned,
  totalSlots,
  href,
}: {
  cabinetCount: number;
  assigned: number;
  totalSlots: number;
  href?: string;
}) {
  const unassigned = Math.max(totalSlots - assigned, 0);
  const pct = totalSlots > 0 ? Math.round((assigned / totalSlots) * 100) : 0;
  const title = (
    <>
      <h2 className={styles.heading}>시약장 요약</h2>
      <Icon name="chevron-right" className={styles.headerIcon} />
    </>
  );
  return (
    <div className={styles.card}>
      {href ? (
        <Link href={href} className={styles.headerLink}>
          {title}
        </Link>
      ) : (
        <div className={styles.headerLink}>{title}</div>
      )}
      <p className={styles.display}>{cabinetCount}개</p>
      <div
        className={styles.bar}
        role="meter"
        aria-label="칸 지정 비율"
        aria-valuemin={0}
        aria-valuemax={totalSlots}
        aria-valuenow={assigned}
      >
        <span className={styles.barAssigned} style={{ flexGrow: pct }} />
        <span className={styles.barUnassigned} style={{ flexGrow: 100 - pct }} />
      </div>
      <p className={styles.bodySm}>
        칸 {totalSlots}개 중 지정 {assigned} · 미지정 {unassigned}
      </p>
    </div>
  );
}

/** 요약 카드 빈 상태 (시약장 0개 등) — 안내 문구 + 선택 행동 */
export function SummaryEmptyCard({
  title,
  message,
  hint,
  action,
}: {
  title: string;
  message: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.card}>
      <h2 className={styles.heading}>{title}</h2>
      <p className={styles.body}>{message}</p>
      {hint ? <p className={styles.bodySm}>{hint}</p> : null}
      {action}
    </div>
  );
}
