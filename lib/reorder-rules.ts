// 화면 6 재주문 알림 규칙 (harness/d7-data.md §11). 화면 표시 문구와 정렬만 — 알림 대상·날짜는 DB 가 정한다.
// 화면 3 재주문 기준 직접 입력 (d7 §14) 의 입력 검사·표시 문구도 여기 둔다.
import { formatDateTimeDots, formatStock } from "./format";
import { INTAKE_AMOUNT_MAX, type Checked } from "./intake-rules";

/* ───────── 재주문 기준 직접 입력 (d7 §14 set_reorder_threshold: 0 이상, 0 = 알림 없음) ───────── */

export const THRESHOLD_MIN = 0;
/** 상한 = 입고·사용 수량 상한과 같다 */
export const THRESHOLD_MAX = INTAKE_AMOUNT_MAX;
/** 소수 자리 (화면 5 사용량과 같다) */
export const THRESHOLD_DECIMALS = 3;
/** 기준이 없을 때 (s2-spec 화면 3 reorder-threshold) */
export const THRESHOLD_NONE_LABEL = "아직 없어요";
/** 입력 아래 안내 (0 = 알림 없음) */
export const THRESHOLD_ZERO_HINT = "0이면 재주문 알림을 보내지 않아요";

/**
 * 재주문 기준 입력 검사: 빈 값·숫자 아님·음수·지수 표기·쉼표는 거부, 0 이상 1,000,000 이하, 소수 3자리까지.
 * 문자열은 앞뒤 공백을 뗀다. 숫자를 넘기면 같은 범위·자리 수로 본다.
 */
export function checkThreshold(input: unknown): Checked<number> {
  let n: number;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { ok: false, error: "숫자로 입력하세요" };
    n = input;
    if (n >= 0 && Math.round(n * 10 ** THRESHOLD_DECIMALS) / 10 ** THRESHOLD_DECIMALS !== n) {
      return { ok: false, error: `소수 ${THRESHOLD_DECIMALS}자리까지 입력할 수 있어요` };
    }
  } else if (typeof input === "string") {
    const t = input.trim();
    if (t === "") return { ok: false, error: "재주문 기준을 입력하세요" };
    if (/^-/.test(t)) return { ok: false, error: `${THRESHOLD_MIN} 이상 입력하세요` };
    if (/^\d+\.\d{4,}$/.test(t)) return { ok: false, error: `소수 ${THRESHOLD_DECIMALS}자리까지 입력할 수 있어요` };
    if (!/^\d+(\.\d{1,3})?$/.test(t)) return { ok: false, error: "숫자로 입력하세요" };
    n = Number(t);
  } else {
    return { ok: false, error: "재주문 기준을 입력하세요" };
  }
  if (n < THRESHOLD_MIN) return { ok: false, error: `${THRESHOLD_MIN} 이상 입력하세요` };
  if (n > THRESHOLD_MAX) return { ok: false, error: "재주문 기준이 너무 커요" };
  return { ok: true, value: n };
}

const thresholdFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: THRESHOLD_DECIMALS });

/** 재주문 기준 값 문구 (시안 3 "3병"): 0·없음이면 "아직 없어요" */
export function thresholdText(minStock: number | null | undefined, unit: string): string {
  if (typeof minStock !== "number" || !Number.isFinite(minStock) || minStock <= 0) return THRESHOLD_NONE_LABEL;
  return `${thresholdFmt.format(minStock)}${unit}`;
}

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
