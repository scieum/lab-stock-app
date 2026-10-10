// 여러 시약 사용 기록 규칙 (d7 §24, design/rules.json 1.25 usage_batch). 순수 함수 — 서버·클라이언트 공용.
// DB(record_usage_batch)가 같은 검사를 다시 한다(한 트랜잭션) — 여기는 입력 정리와 화면 안내용.

/** 한 번에 담을 수 있는 시약 수 (DB 1~30) */
export const USAGE_BATCH_MAX = 30;

export const USAGE_BATCH_TEXT = {
  title: "사용 기록",
  caption: "여러 시약을 한 번에 기록해요",
  add: "시약 추가",
  addSearch: "시약 추가 — 이름으로 찾기",
  recent: "최근 사용한 시약",
  added: "담음",
  remove: "빼기",
  emptyTitle: "시약을 골라 주세요",
  emptyBody: "실험에 쓴 시약을 모두 담고 한 번에 저장해요",
  emptyHint: "위 검색 칸에서 시약을 찾아 담아 주세요",
  amountRequired: "사용량을 적어 주세요",
  amountNumber: "사용량은 숫자로 적어 주세요",
  saveFailed: "저장하지 못했어요 — 표시한 시약을 확인해 주세요",
  memoPlaceholder: "메모 (선택)",
} as const;

/** 머리 "담은 시약 N개" */
export function batchHeading(n: number): string {
  return `담은 시약 ${n}개`;
}

/** 저장 버튼 "사용 기록 저장 · N개" (0개면 "사용 기록 저장") */
export function batchSaveLabel(n: number): string {
  return n > 0 ? `사용 기록 저장 · ${n}개` : "사용 기록 저장";
}

/** 시트 버튼 "{N}개 담기" */
export function pickLabel(n: number): string {
  return `${n}개 담기`;
}

/** 저장 뒤 토스트 "N개 시약 사용을 기록했어요" */
export function batchDoneText(n: number): string {
  return `${n}개 시약 사용을 기록했어요`;
}

const numberFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });

/** "1,200 mL" */
export function stockText(stock: number, unit: string): string {
  return `${numberFmt.format(stock)} ${unit}`;
}

/** 행 캡션 "현재 1,200 mL" */
export function currentStockText(stock: number, unit: string): string {
  return `현재 ${stockText(stock, unit)}`;
}

/** usage-over-stock "재고 120 mL보다 많아요" */
export function overStockText(stock: number, unit: string): string {
  return `재고 ${stockText(stock, unit)}보다 많아요`;
}

const AMOUNT_RE = /^\d+(\.\d+)?$/;

export type AmountCheck =
  | { kind: "ok"; value: number }
  /** 빈 값 · 0 = 입력 칸 오류 "사용량을 적어 주세요" */
  | { kind: "empty" }
  /** 숫자가 아님 */
  | { kind: "invalid" }
  /** 사용량 > 현재 재고 = usage-over-stock */
  | { kind: "over"; value: number };

/** 사용량 한 칸 검사 (화면 표시용) */
export function checkAmount(raw: string, stock: number): AmountCheck {
  const v = raw.trim().replace(/,/g, "");
  if (v === "") return { kind: "empty" };
  if (!AMOUNT_RE.test(v)) return { kind: "invalid" };
  const n = Number(v);
  if (!Number.isFinite(n)) return { kind: "invalid" };
  if (n <= 0) return { kind: "empty" };
  if (n > stock) return { kind: "over", value: n };
  return { kind: "ok", value: n };
}

export type BatchItemInput = { reagentId: string; amount: string };
export type BatchStock = { stock: number; unit: string };

/** 저장할 수 있는지 (0개 · 빈 값 · 0 · 숫자 아님 · 재고 초과가 하나라도 있으면 false) */
export function canSaveBatch(items: readonly BatchItemInput[], stocks: ReadonlyMap<string, BatchStock>): boolean {
  if (items.length === 0 || items.length > USAGE_BATCH_MAX) return false;
  return items.every((i) => {
    const s = stocks.get(i.reagentId);
    return s !== undefined && checkAmount(i.amount, s.stock).kind === "ok";
  });
}

/** 최근 사용한 시약 먼저, 그 다음 이름순 (가나다) */
export function orderPickerReagents<T extends { id: string; name: string }>(reagents: readonly T[], recentIds: readonly string[]): T[] {
  const rank = new Map(recentIds.map((id, i) => [id, i]));
  return [...reagents].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id);
  });
}

/** 시약명 부분 일치 (대소문자 무시) */
export function matchReagentName(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || name.toLowerCase().includes(q);
}

/** DB 오류 detail "1,3" → 항목 번호(0부터) */
export function parseItemNumbers(detail: string | null | undefined): number[] {
  if (!detail) return [];
  return detail
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1)
    .map((n) => n - 1);
}

/** 들어온 화면 (저장 뒤 · 뒤로): 시약 상세에서 왔으면 그 시약, 기록 화면이면 /usage, 그 밖(홈) "/" */
export function usageReturnHref(from: string | null | undefined, reagentId: string | null | undefined): string {
  if (from === "usage") return "/usage";
  if (from === "home") return "/";
  if (reagentId && /^[0-9a-f-]{36}$/i.test(reagentId)) return `/reagents/${reagentId}`;
  return "/";
}
