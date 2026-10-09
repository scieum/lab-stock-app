import Link from "next/link";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { GuestLockedButton } from "@/components/guest-lock/locked-button";
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
                <Link href={it.href} prefetch={linkPrefetch(it.href)} className={styles.chipLink}>
                  {it.name} · {it.amount}
                  <LinkPending />
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
        <Link href={href} prefetch={linkPrefetch(href)} className={styles.headerLink}>
          {title}
          <LinkPending />
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

/* ───────── 데스크톱 홈 (시안 13-desktop · 13-guest-desktop, d7 §23 run c) ───────── */

/**
 * "지금 처리할 것" 숫자 타일 (home-summary — 흰 카드 hairline, radius 24, 안쪽 24, 사이 8):
 * caption 12 회색 → tile-value(숫자 32/700 + 배지) → note 13 회색.
 */
export function HomeSummaryTile({
  caption,
  value,
  badge,
  note,
  label,
}: {
  caption: string;
  value: number;
  /** 숫자 옆 (badge-low-stock) */
  badge?: React.ReactNode;
  note: string;
  /** 읽기 도구 이름 (없으면 caption) */
  label?: string;
}) {
  return (
    <section data-component="home-summary" className={[styles.card, styles.tile].join(" ")} aria-label={label ?? caption}>
      <p className={styles.caption}>{caption}</p>
      <div className={styles.tileValue} data-name="tile-value">
        <span className={styles.display}>{value}</span>
        {badge}
      </div>
      <p className={styles.bodySm}>{note}</p>
    </section>
  );
}

type WidgetMore = { href: string } | { locked: true };

/** 위젯 머리 (widget-head): 제목 18/700 + "전체 보기"(button-pill-soft 13/600 + 하늘색 꺾쇠) */
export function WidgetHead({ title, titleId, more }: { title: string; titleId?: string; more?: WidgetMore }) {
  return (
    <div className={styles.widgetHead} data-name="widget-head">
      <h2 id={titleId} className={styles.heading}>
        {title}
      </h2>
      {more ? (
        "locked" in more ? (
          <GuestLockedButton variant="pill-soft" className={styles.more}>
            전체 보기
          </GuestLockedButton>
        ) : (
          <ButtonPillSoft href={more.href} icon="chevron-right" className={styles.more}>
            전체 보기
          </ButtonPillSoft>
        )
      ) : null}
    </div>
  );
}

/** 오른쪽 위젯 — 재고 부족 (widget-head → stock-chips → note "전체 시약 N종") */
export function StockWidget({ items, totalCount, more }: { items: LowStockItem[]; totalCount: number; more?: WidgetMore }) {
  return (
    <section data-component="home-summary" className={[styles.card, styles.widget].join(" ")} aria-label="재고 부족">
      <WidgetHead title="재고 부족" more={more} />
      {items.length > 0 ? (
        <ul className={styles.chips} data-name="stock-chips">
          {items.map((it) => (
            <li key={`${it.name}-${it.amount}`} className={[styles.chip, styles.stockChip].join(" ")}>
              {it.href ? (
                <Link href={it.href} prefetch={linkPrefetch(it.href)} className={styles.chipLink}>
                  {it.name} · {it.amount}
                  <LinkPending />
                </Link>
              ) : (
                `${it.name} · ${it.amount}`
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.body}>재고가 부족한 시약이 없어요</p>
      )}
      <p className={styles.bodySm}>전체 시약 {totalCount}종</p>
    </section>
  );
}

/** 오른쪽 위젯 — 시약장 요약 (widget-head → 시약장 수 32/700 → slot-bar(지정 비율) → note). 시약장 0개면 안내 + action */
export function CabinetWidget({
  cabinetCount,
  assigned,
  totalSlots,
  more,
  emptyHint,
  emptyAction,
}: {
  cabinetCount: number;
  assigned: number;
  totalSlots: number;
  more?: WidgetMore;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
}) {
  const unassigned = Math.max(totalSlots - assigned, 0);
  const pct = totalSlots > 0 ? Math.round((assigned / totalSlots) * 100) : 0;
  return (
    <section
      data-component="home-summary"
      className={[styles.card, styles.widget, styles.widgetCabinet].join(" ")}
      aria-label="시약장 요약"
    >
      <WidgetHead title="시약장 요약" more={cabinetCount > 0 ? more : undefined} />
      {cabinetCount > 0 ? (
        <>
          <p className={styles.display}>{cabinetCount}개</p>
          <div
            className={styles.slotBar}
            data-name="slot-bar"
            role="meter"
            aria-label="칸 지정 비율"
            aria-valuemin={0}
            aria-valuemax={totalSlots}
            aria-valuenow={assigned}
          >
            <span className={styles.slotBarAssigned} style={{ width: `${pct}%` }} />
          </div>
          <p className={styles.bodySm}>
            칸 {totalSlots}개 중 지정 {assigned} · 미지정 {unassigned}
          </p>
        </>
      ) : (
        <>
          <p className={styles.body}>등록된 시약장이 없어요</p>
          {emptyHint ? <p className={styles.bodySm}>{emptyHint}</p> : null}
          {emptyAction}
        </>
      )}
    </section>
  );
}
