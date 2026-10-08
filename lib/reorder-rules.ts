// 화면 6 재주문 알림 규칙 (harness/d7-data.md §11). 화면 표시 문구와 정렬만 — 알림 대상·날짜는 DB 가 정한다.
// 화면 3 재주문 기준 직접 입력 (d7 §14) 의 입력 검사·표시 문구도 여기 둔다.
import { formatAmount, formatKoreanDate, formatStock } from "./format";
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

/* ───────── 재주문 기준의 출처 (d7 §11-1: 자동 · 매뉴얼 · 직접 입력) ───────── */

/** reagents.min_stock_source */
export type ThresholdSource = "auto" | "basis" | "manual";
/** reagents.min_stock_auto_basis — 자동 값의 근거 (마지막 계산 때). 근거 없음(값 0) = null */
export type AutoBasis = "usage" | "intake" | null;

/** 자동 기준 표시 */
export const AUTO_LABEL = "자동";
/** 자동 근거: 최근 28일 사용량 ÷ 4 × 2주 */
export const AUTO_BASIS_USAGE_TEXT = "최근 4주 사용량 기준";
/** 자동 근거: 마지막 입고량 × 20% */
export const AUTO_BASIS_INTAKE_TEXT = "마지막 입고량의 20%";
/**
 * 자동 기준 캡션 (d7 §18 — auto-threshold-badge 아래 한 줄, 화면 3·6).
 * 두 꼴 모두 디자인 1.21 reorder.auto 문구 그대로(사용 기록 근거 / 입고량 근거). 값 0 = THRESHOLD_NONE_LABEL.
 */
export const AUTO_CAPTION_USAGE_TEXT = "최근 사용량으로 계산했어요";
export const AUTO_CAPTION_INTAKE_TEXT = "마지막 입고량의 20%로 계산했어요";
/** 직접 입력한 기준 */
export const MANUAL_SOURCE_TEXT = "직접 입력";
/** "자동으로 돌리기" 버튼 문구 */
export const RESET_AUTO_LABEL = "자동으로 돌리기";

function positiveNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * DB 값 → 출처. 값이 없거나 모르는 값이면(열이 아직 없는 DB 등) 기존 규칙으로 추정:
 * 근거(1조 사용량·조 수)가 있으면 'basis', 기준 > 0 이면 'manual', 아니면 'auto'.
 */
export function toThresholdSource(
  v: unknown,
  fallback?: { minStock?: number | null; perGroup?: number | null; groups?: number | null },
): ThresholdSource {
  if (v === "auto" || v === "basis" || v === "manual") return v;
  if (fallback && positiveNum(fallback.perGroup) && positiveNum(fallback.groups)) return "basis";
  if (fallback && positiveNum(fallback.minStock)) return "manual";
  return "auto";
}

/** DB 값 → 자동 근거 ('usage' | 'intake' | null) */
export function toAutoBasis(v: unknown): AutoBasis {
  return v === "usage" || v === "intake" ? v : null;
}

/**
 * 자동 근거 한 줄 (d7 §11-1 표시): 값이 0 이하·없음 → "아직 없어요",
 * 'usage' → "최근 4주 사용량 기준", 'intake' → "마지막 입고량의 20%". 근거를 모르면 "자동".
 */
export function autoBasisText(r: { minStock: number | null | undefined; autoBasis: AutoBasis | undefined }): string {
  if (!positiveNum(r.minStock ?? null)) return THRESHOLD_NONE_LABEL;
  if (r.autoBasis === "usage") return AUTO_BASIS_USAGE_TEXT;
  if (r.autoBasis === "intake") return AUTO_BASIS_INTAKE_TEXT;
  return AUTO_LABEL;
}

/**
 * 자동 기준 캡션 (d7 §18): 값이 0 이하·없음 → "아직 없어요",
 * 'usage' → "최근 사용량으로 계산했어요", 'intake' → "마지막 입고량의 20%로 계산했어요". 근거를 모르면 null(캡션 없음).
 */
export function autoCaptionText(r: { minStock: number | null | undefined; autoBasis: AutoBasis | undefined }): string | null {
  if (!positiveNum(r.minStock ?? null)) return THRESHOLD_NONE_LABEL;
  if (r.autoBasis === "usage") return AUTO_CAPTION_USAGE_TEXT;
  if (r.autoBasis === "intake") return AUTO_CAPTION_INTAKE_TEXT;
  return null;
}

/**
 * 화면 3 reorder-threshold 의 근거 한 줄 (출처별):
 *   auto   → autoBasisText ("최근 4주 사용량 기준" / "마지막 입고량의 20%" / "아직 없어요")
 *   basis  → "1반 1회 실험량 10 g × 6조 기준" (근거 열이 비어 있으면 "직접 입력"과 같은 취급)
 *   manual → "직접 입력"
 */
export function thresholdSourceText(r: {
  source: ThresholdSource;
  autoBasis?: AutoBasis;
  minStock: number;
  unit: string;
  perGroup?: number | null;
  groups?: number | null;
}): string {
  if (r.source === "auto") return autoBasisText({ minStock: r.minStock, autoBasis: r.autoBasis ?? null });
  if (r.source === "basis" && positiveNum(r.perGroup) && positiveNum(r.groups)) {
    return `1반 1회 실험량 ${formatStock(r.perGroup, r.unit)} × ${r.groups}조 기준`;
  }
  return MANUAL_SOURCE_TEXT;
}

/** 화면 6 재주문 기준 안내 박스 본문 (시안 1.17 6 manual-upload info-body) */
export const REORDER_GUIDE_TEXT = "필요량 = 1반 1회 실험량 × 조 수 · 기준이 없는 시약은 최근 사용량으로 계산해요";

/** 알림 카드 수량 줄 앞말 (디자인 1.21 reorder.card_text — 화면 3 용어와 같다) */
export const REORDER_NEED_LABEL = "재주문 기준";

/** 알림 대상: 재고가 필요량(min_stock)보다 적은 시약 (홈의 재고 부족과 같은 기준) */
export function isReorderNeeded(stock: number, minStock: number): boolean {
  return stock < minStock;
}

/** "재주문 기준 60g / 현재 재고 30g" (d7 §11 · 디자인 1.21 reorder.card_text — 숫자와 단위 붙여 씀) */
export function reorderAmountText(r: { minStock: number; stock: number; unit: string }): string {
  const p = reorderAmountParts(r);
  return `${p.need} / ${p.stock}`;
}

/**
 * 알림 카드 수량 줄의 두 조각 — 자동 기준이면 그 사이에 auto-threshold-badge 를 둔다 (시안 6 stock-line, d7 §18).
 * { need: "재주문 기준 60g", stock: "현재 재고 30g" }
 */
export function reorderAmountParts(r: { minStock: number; stock: number; unit: string }): { need: string; stock: string } {
  return { need: `${REORDER_NEED_LABEL} ${formatAmount(r.minStock, r.unit)}`, stock: `현재 재고 ${formatAmount(r.stock, r.unit)}` };
}

function positive(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * 화면 6 알림 카드 기준 문구 (d7 §11 · §11-1):
 *   source = 'auto' → "최근 4주 사용량 기준" / "마지막 입고량의 20%" / "아직 없어요" (autoBasisText)
 *   그 밖(source 없음 포함) → 1조 사용량·조 수가 둘 다 있으면 "1반 1회 실험량 10 g × 6조 기준",
 *   하나라도 없으면 "재주문 기준 60 g".
 */
export function reorderBasisText(r: {
  minStock: number;
  unit: string;
  perGroup?: number | null;
  groups?: number | null;
  source?: ThresholdSource;
  autoBasis?: AutoBasis;
}): string {
  if (r.source === "auto") return autoBasisText({ minStock: r.minStock, autoBasis: r.autoBasis ?? null });
  if (positive(r.perGroup) && positive(r.groups)) {
    return `1반 1회 실험량 ${formatStock(r.perGroup, r.unit)} × ${r.groups}조 기준`;
  }
  return `재주문 기준 ${formatStock(r.minStock, r.unit)}`;
}

/**
 * 알림 날짜 "10월 7일 알림" (한국 시간, 올해가 아니면 "2025년 10월 7일 알림" — d7 §11, 디자인 1.21 reorder.card_text).
 * 값이 없거나 날짜가 아니면 null. now = 올해를 가르는 기준 시각(기본 지금).
 */
export function reorderAlertDateText(since: string | Date | null | undefined, now: Date = new Date()): string | null {
  if (since === null || since === undefined || since === "") return null;
  const d = since instanceof Date ? since : new Date(since);
  if (Number.isNaN(d.getTime())) return null;
  return `${formatKoreanDate(d, now)} 알림`;
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
