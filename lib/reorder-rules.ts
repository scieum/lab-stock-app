// 화면 6 재주문 알림 규칙 (harness/d7-data.md §11). 화면 표시 문구와 정렬만 — 알림 대상·날짜는 DB 가 정한다.
import { formatDateTimeDots, formatStock } from "@/lib/format";

/** 알림 대상: 재고가 필요량(min_stock)보다 적은 시약 (홈의 재고 부족과 같은 기준) */
export function isReorderNeeded(stock: number, minStock: number): boolean {
  return stock < minStock;
}

/** "필요량 60 g / 현재 재고 30 g" */
export function reorderAmountText(r: { minStock: number; stock: number; unit: string }): string {
  return `필요량 ${formatStock(r.minStock, r.unit)} / 현재 재고 ${formatStock(r.stock, r.unit)}`;
}

function positive(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * 기준 문구 (d7 §11): 1조 사용량·조 수가 둘 다 있으면 "1반 1회 실험량 10 g × 6조 기준",
 * 하나라도 없으면 "재주문 기준 60 g".
 */
export function reorderBasisText(r: {
  minStock: number;
  unit: string;
  perGroup?: number | null;
  groups?: number | null;
}): string {
  if (positive(r.perGroup) && positive(r.groups)) {
    return `1반 1회 실험량 ${formatStock(r.perGroup, r.unit)} × ${r.groups}조 기준`;
  }
  return `재주문 기준 ${formatStock(r.minStock, r.unit)}`;
}

/** 알림 날짜 "2026.09.30 알림" (한국 시간). 값이 없거나 날짜가 아니면 null */
export function reorderAlertDateText(since: string | Date | null | undefined): string | null {
  if (since === null || since === undefined || since === "") return null;
  const d = since instanceof Date ? since : new Date(since);
  if (Number.isNaN(d.getTime())) return null;
  return `${formatDateTimeDots(d).slice(0, 10)} 알림`;
}

/** 부족한 정도 = 필요량 대비 모자란 비율 (0~1). 단위가 달라도 견줄 수 있게 비율로 본다 */
export function shortageRatio(stock: number, minStock: number): number {
  if (!(minStock > 0)) return 0;
  const lack = minStock - Math.max(stock, 0);
  return lack <= 0 ? 0 : Math.min(lack / minStock, 1);
}

export type ReorderSortable = { name: string; stock: number; minStock: number; lowStockSince?: string | null };

/**
 * 부족한 정도가 큰 순 (d7 §11). 같으면 먼저 부족해진 것(알림 날짜가 이른 것), 그다음 이름순.
 * 원본 배열은 건드리지 않는다.
 */
export function sortByShortage<T extends ReorderSortable>(items: readonly T[]): T[] {
  const time = (v: string | null | undefined) => {
    const t = v ? new Date(v).getTime() : Number.NaN;
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };
  return [...items].sort((a, b) => {
    const diff = shortageRatio(b.stock, b.minStock) - shortageRatio(a.stock, a.minStock);
    if (diff !== 0) return diff;
    const dt = time(a.lowStockSince) - time(b.lowStockSince);
    if (dt !== 0 && !Number.isNaN(dt)) return dt;
    return a.name.localeCompare(b.name, "ko");
  });
}
