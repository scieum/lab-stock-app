// 화면 7 서류로 입고 규칙 (harness/d7-data.md §21). 클라이언트·서버 공용 순수 함수 — 환경변수·네트워크를 쓰지 않는다.
// - 추출 응답 정리(normalizeDocExtraction): 서버(lib/server/gemini-response)와 화면이 같은 함수로 모양을 맞춘다.
// - 자동 연결: lib/manual-rules matchReagent (§13 과 같은 규칙) — 품명에 붙은 규격("500mL")만 떼고 견준다.
// - 입고량: 시약 단위 mL/g 이고 규격이 같은 계열이면 specAmount(L→mL, kg→g ×1000) × 수량, "병"이면 수량, 그 밖은 null.
// - 저장 항목(planDocIntake): DB 함수 record_document_intake(p_intake_date, p_items) 의 항목. DB 가 같은 검사를 다시 한다.

import { STORAGE_CLASSES, isIsoDate, type Checked, type StorageClass } from "./intake-rules";
import { AMOUNT_MAX, amountInputText, formatAmountText, matchReagent, parseAmount } from "./manual-rules";

/* ───────── 상수 · 문구 ───────── */

export const DOC_ITEMS_MAX = 50;
export const DOC_NAME_MAX = 80;
export const DOC_SPEC_MAX = 40;
export const DOC_QTY_UNIT_MAX = 10;
export const DOC_MSDS_URL_MAX = 2000;
export const DOC_UNITS = ["병", "mL", "g"] as const;
export type DocUnit = (typeof DOC_UNITS)[number];
export const DOC_SPEC_UNITS = ["mL", "L", "g", "kg"] as const;
export type DocSpecUnit = (typeof DOC_SPEC_UNITS)[number];

export const DOC_TEXT = {
  modeDoc: "서류로 입고",
  modeDirect: "직접 입력",
  uploadHeading: "품의서·영수증·거래명세서를 올려 주세요",
  uploadAgainHeading: "다른 파일 올리기",
  uploadCaption: "PDF·JPG·PNG, 4MB까지",
  camera: "촬영하기",
  pickFile: "파일 선택",
  read: "AI로 읽기",
  cancel: "취소",
  readingTitle: "읽는 중이에요",
  readingBody: "품목·규격·수량을 찾고 있어요",
  readingCaption: "잠시만 기다려 주세요",
  emptyTitle: "서류에서 품목을 찾지 못했어요",
  emptyBody: "글자가 잘 보이게 다시 찍거나 PDF로 올려 주세요",
  reviewTitle: "읽은 내용 확인",
  reviewCaption: "고칠 곳이 있으면 고친 뒤 입고하세요",
  dateLabel: "서류 날짜",
  linkCaption: "우리 학교 시약",
  change: "바꾸기",
  exclude: "빼기",
  include: "다시 넣기",
  excluded: "입고하지 않아요",
  newReagent: "새 시약으로 등록",
  addAsReagent: "시약으로 넣기",
  submit: "확인 후 입고",
  noKey: "AI 추출을 쓸 수 없어요(서버 설정)",
  failed: "AI 추출에 실패했어요. 잠시 후 다시 시도해 주세요",
  network: "서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요",
} as const;

/** 시약 아님 묶음: "시약 아님 2개" */
export function notReagentText(count: number): string {
  return `시약 아님 ${count}개`;
}

/** 저장 뒤 토스트: "3개 품목을 입고했어요" */
export function docIntakeDoneText(count: number): string {
  return `${count}개 품목을 입고했어요`;
}

/* ───────── 추출 결과 (AI 응답 → 정리된 모양) ───────── */

/** 서류 품목 1개 (d7 §21 구조화 출력) */
export type DocItem = {
  /** 서류 표기 그대로의 품명 (80자까지) */
  name: string;
  /** 규격 표기 ("500 mL"), 없으면 null */
  spec: string | null;
  /** 규격 숫자 (500), 없으면 null */
  specAmount: number | null;
  /** 규격 단위 mL·L·g·kg, 그 밖은 null */
  specUnit: DocSpecUnit | null;
  /** 수량 (기본 1) */
  quantity: number;
  /** 수량 단위 ("병"·"개"), 없으면 null */
  quantityUnit: string | null;
  /** 시약인가 (false 면 "시약 아님" 묶음) */
  isReagent: boolean;
  /** AI 가 추천한 보관 분류 (8종 중 하나) 또는 null */
  suggestedClass: StorageClass | null;
};

export type DocExtraction = {
  /** 서류 날짜 YYYY-MM-DD (없거나 날짜가 아니면 null) */
  docDate: string | null;
  items: DocItem[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

/** 유한한 양수만 (숫자 글자 "500" 도 받는다), 그 밖은 null */
function positive(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : Number.NaN;
  return Number.isFinite(n) && n > 0 && n <= AMOUNT_MAX ? n : null;
}

const SPEC_UNIT_TABLE: Record<string, DocSpecUnit> = {
  ml: "mL",
  "㎖": "mL",
  "mℓ": "mL",
  cc: "mL",
  밀리리터: "mL",
  l: "L",
  "ℓ": "L",
  리터: "L",
  g: "g",
  그램: "g",
  kg: "kg",
  "㎏": "kg",
  킬로그램: "kg",
};

/** 규격 단위 표기 → mL·L·g·kg (대소문자·공백·마침표 무시), 그 밖은 null */
export function normalizeSpecUnit(v: unknown): DocSpecUnit | null {
  if (typeof v !== "string") return null;
  const key = v.normalize("NFC").trim().toLowerCase().replace(/[\s.]/g, "");
  return SPEC_UNIT_TABLE[key] ?? null;
}

function storageClassOf(v: unknown): StorageClass | null {
  return typeof v === "string" && (STORAGE_CLASSES as readonly string[]).includes(v.trim())
    ? (v.trim() as StorageClass)
    : null;
}

/** AI 가 준 품목 하나 → DocItem (이름이 비면 null — 버린다) */
export function normalizeDocItem(raw: unknown): DocItem | null {
  if (!isRecord(raw)) return null;
  const name = cleanText(raw.name, DOC_NAME_MAX);
  if (name === "") return null;
  const spec = cleanText(raw.spec, DOC_SPEC_MAX);
  const qtyUnit = cleanText(raw.quantityUnit, DOC_QTY_UNIT_MAX);
  return {
    name,
    spec: spec === "" ? null : spec,
    specAmount: positive(raw.specAmount),
    specUnit: normalizeSpecUnit(raw.specUnit),
    quantity: positive(raw.quantity) ?? 1,
    quantityUnit: qtyUnit === "" ? null : qtyUnit,
    // 모르면 시약으로 본다 (사용자가 빼기로 뺄 수 있다)
    isReagent: raw.isReagent !== false,
    suggestedClass: storageClassOf(raw.suggestedClass),
  };
}

/**
 * 추출 응답 본문(JSON 으로 읽은 값) → DocExtraction. { items: [...] } 모양이 아니면 null.
 * 이름이 빈 품목은 버리고, 최대 50개까지 (넘는 품목은 버린다). docDate 는 실제 날짜인 YYYY-MM-DD 만.
 */
export function normalizeDocExtraction(raw: unknown): DocExtraction | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;
  const items: DocItem[] = [];
  for (const it of raw.items) {
    if (items.length >= DOC_ITEMS_MAX) break;
    const item = normalizeDocItem(it);
    if (item) items.push(item);
  }
  const date = typeof raw.docDate === "string" ? raw.docDate.trim() : "";
  return { docDate: isIsoDate(date) ? date : null, items };
}

/* ───────── 날짜 ───────── */

export const DATE_ERRORS = {
  invalid: "입고일을 확인해 주세요",
  future: "입고일은 오늘 이후로 정할 수 없어요",
} as const;

/** 입고일 기본값: 서류 날짜가 있고 오늘 이전이면 그 날짜, 아니면 오늘 */
export function defaultDocIntakeDate(docDate: string | null, today: string): string {
  return docDate && isIsoDate(docDate) && docDate <= today ? docDate : today;
}

/** 입고일 검사: 통과하면 null, 아니면 문구 (YYYY-MM-DD 끼리는 글자 비교 = 날짜 비교) */
export function checkDocIntakeDate(date: unknown, today: string): string | null {
  if (!isIsoDate(date)) return DATE_ERRORS.invalid;
  if (date > today) return DATE_ERRORS.future;
  return null;
}

/* ───────── 품명 → 연결용 이름 · 새 시약 기본 이름 ───────── */

// "500mL" · "500 ml" · "1L" · "25 g" · "1kg" · "500mL×4" — 품명에 붙은 규격 표기
const SIZE_TOKEN = /\(?\s*\d+(?:[.,]\d+)?\s*(?:ml|mℓ|㎖|cc|l|ℓ|g|kg|㎏|mg)\s*(?:[x×*]\s*\d+\s*(?:병|개|ea)?)?\s*\)?(?=\s|$|[,/·)])/giu;

/**
 * 품명에서 규격 표기를 뗀 이름 ("질산칼륨 500g" → "질산칼륨", "염산 35% 500mL" → "염산 35%").
 * 떼고 남는 글자가 없으면 원래 이름.
 */
export function docReagentName(name: string): string {
  const stripped = name.replace(SIZE_TOKEN, " ").replace(/\s+/g, " ").trim();
  return stripped === "" ? name.trim() : stripped;
}

/* ───────── 입고량 ───────── */

export type DocAmount = {
  /** 그 시약 단위의 입고량 (계산할 수 없으면 null — 사용자가 직접 입력) */
  amount: number | null;
  /** 무채색 안내 줄 ("500 mL × 4병 = 2,000 mL"), 계산할 수 없으면 null */
  note: string | null;
};

/** 수량 단위 표기 (없으면 "개") */
function qtyUnitText(unit: string | null): string {
  return unit && unit.trim() !== "" ? unit.trim() : "개";
}

/**
 * 입고량 계산 (d7 §21):
 * - 시약 단위 "병": 수량 그대로 ("4병 = 4 병")
 * - 시약 단위 mL: 규격 mL 이면 × 1, L 이면 × 1000 → × 수량
 * - 시약 단위 g: 규격 g 이면 × 1, kg 이면 × 1000 → × 수량
 * - 그 밖(규격 없음·계열이 다름·단위 모름)·수량이 없음·결과가 1,000,000 초과 → null
 */
export function docIntakeAmount(
  item: Pick<DocItem, "specAmount" | "specUnit" | "quantityUnit">,
  quantity: number | null,
  reagentUnit: string,
): DocAmount {
  if (quantity === null || !(quantity > 0)) return { amount: null, note: null };
  const qUnit = qtyUnitText(item.quantityUnit);
  const qText = `${formatAmountText(quantity, "")}${qUnit}`;
  if (reagentUnit === "병") {
    const amount = parseAmount(quantity);
    return amount === null ? { amount: null, note: null } : { amount, note: `${qText} = ${formatAmountText(amount, "병")}` };
  }
  if (item.specAmount === null || item.specUnit === null) return { amount: null, note: null };
  let factor: number;
  if (reagentUnit === "mL" && (item.specUnit === "mL" || item.specUnit === "L")) factor = item.specUnit === "L" ? 1000 : 1;
  else if (reagentUnit === "g" && (item.specUnit === "g" || item.specUnit === "kg")) factor = item.specUnit === "kg" ? 1000 : 1;
  else return { amount: null, note: null };
  // 소수 3자리 정수로 바꿔 곱한다 (0.1 × 3 = 0.3)
  const scaled = Math.round(item.specAmount * 1000) * factor * Math.round(quantity * 1000);
  const amount = parseAmount(scaled / 1_000_000);
  if (amount === null) return { amount: null, note: null };
  return {
    amount,
    note: `${formatAmountText(item.specAmount, item.specUnit)} × ${qText} = ${formatAmountText(amount, reagentUnit)}`,
  };
}

/** 새 시약 단위 추정: 규격 mL·L → mL, g·kg → g, 그 밖 → 병 */
export function guessDocUnit(item: Pick<DocItem, "specUnit">): DocUnit {
  if (item.specUnit === "mL" || item.specUnit === "L") return "mL";
  if (item.specUnit === "g" || item.specUnit === "kg") return "g";
  return "병";
}

/* ───────── 확인 표의 행 ───────── */

/** 우리 학교 시약 (연결 후보) */
export type DocReagent = { id: string; name: string; unit: string };

export type DocLink =
  | { kind: "reagent"; reagentId: string }
  | { kind: "new" }
  /** 빼기 — 입고하지 않는다 */
  | { kind: "none" };

export type NewReagentDraft = {
  name: string;
  /** 보관 분류 ("" = 아직 고르지 않음) */
  storageClass: string;
  /** AI 추천 분류 (suggest-badge 자리) */
  suggestedClass: StorageClass | null;
  unit: DocUnit;
  /** 재고량 칸 */
  stock: string;
  /** 사용자가 재고량을 고쳤다 (그 뒤로는 자동 계산으로 덮지 않는다) */
  stockEdited: boolean;
  msdsUrl: string;
};

export type DocRow = {
  /** "doc-1" 부터 */
  id: string;
  /** 서류 그대로의 품목 */
  item: DocItem;
  /** 표에 있는가 (false = "시약 아님" 묶음) */
  isReagent: boolean;
  /** 수량 칸 */
  quantity: string;
  link: DocLink;
  /** 처음 자동 연결된 시약 (없으면 null) */
  autoReagentId: string | null;
  /** 연결 행의 입고량 칸 (그 시약 단위) */
  amount: string;
  amountEdited: boolean;
  newReagent: NewReagentDraft;
  /** 새 시약 칸을 펼쳤는가 */
  expanded: boolean;
};

function amountFor(row: Pick<DocRow, "item" | "quantity">, unit: string): DocAmount {
  return docIntakeAmount(row.item, parseAmount(row.quantity), unit);
}

/** 연결·수량·단위가 바뀐 뒤 자동 계산 칸(고치지 않은 입고량·재고량)을 다시 채운다 */
export function refreshDocRow(row: DocRow, reagents: readonly DocReagent[]): DocRow {
  let next = row;
  if (row.link.kind === "reagent" && !row.amountEdited) {
    const id = row.link.reagentId;
    const reagent = reagents.find((r) => r.id === id);
    const calc = reagent ? amountFor(row, reagent.unit) : { amount: null };
    next = { ...next, amount: amountInputText(calc.amount) };
  }
  if (!row.newReagent.stockEdited) {
    const calc = amountFor(row, row.newReagent.unit);
    next = { ...next, newReagent: { ...next.newReagent, stock: amountInputText(calc.amount) } };
  }
  return next;
}

/**
 * 추출 결과 → 확인 표의 행. 시약 품목은 우리 학교 시약과 자동 연결(matchReagent, 규격 표기를 뗀 이름으로),
 * 연결되지 않으면 "새 시약으로 등록". 시약 아닌 품목은 isReagent=false (연결 없음).
 * 새 시약 칸 기본값: 이름 = 규격을 뗀 품명, 분류 = AI 추천, 단위 = 규격에서 추정, 재고량 = 입고량 규칙.
 * 펼침: 첫 새 시약 행 + 값이 덜 채워진 새 시약 행 (나머지는 "새 시약 · 산 · 1,000 mL" 요약으로 접힘).
 */
export function buildDocRows(extraction: DocExtraction, reagents: readonly DocReagent[]): DocRow[] {
  let firstNew = true;
  return extraction.items.slice(0, DOC_ITEMS_MAX).map((item, i) => {
    const match = item.isReagent ? matchReagent(docReagentName(item.name), reagents) : null;
    const link: DocLink = !item.isReagent ? { kind: "none" } : match ? { kind: "reagent", reagentId: match.id } : { kind: "new" };
    const base: DocRow = {
      id: `doc-${i + 1}`,
      item,
      isReagent: item.isReagent,
      quantity: amountInputText(item.quantity),
      link,
      autoReagentId: match?.id ?? null,
      amount: "",
      amountEdited: false,
      newReagent: {
        name: docReagentName(item.name).slice(0, DOC_NAME_MAX),
        storageClass: item.suggestedClass ?? "",
        suggestedClass: item.suggestedClass,
        unit: guessDocUnit(item),
        stock: "",
        stockEdited: false,
        msdsUrl: "",
      },
      expanded: false,
    };
    const row = refreshDocRow(base, reagents);
    // 첫 새 시약 행과 고를 값이 남은 새 시약 행은 펼쳐 두고, 나머지는 요약 줄로 접는다 (시안 7-doc-review)
    const expanded = link.kind === "new" && (firstNew || !newReagentComplete(row.newReagent));
    if (link.kind === "new") firstNew = false;
    return { ...row, expanded };
  });
}

function newReagentComplete(d: NewReagentDraft): boolean {
  return d.name.trim() !== "" && d.storageClass !== "" && parseAmount(d.stock) !== null;
}

export type DocRowPatch = {
  quantity?: string;
  link?: DocLink;
  amount?: string;
  isReagent?: boolean;
  expanded?: boolean;
  newReagent?: Partial<Omit<NewReagentDraft, "stockEdited" | "suggestedClass">>;
};

/**
 * 행 고치기. 입고량·재고량을 직접 고치면 그 칸은 그 뒤로 자동 계산하지 않는다.
 * 연결을 바꾸면 입고량 칸은 다시 자동 계산한다(직접 고친 값도 새 시약 단위에 맞지 않을 수 있어서).
 */
export function patchDocRow(row: DocRow, patch: DocRowPatch, reagents: readonly DocReagent[]): DocRow {
  const next: DocRow = { ...row };
  if (patch.quantity !== undefined) next.quantity = patch.quantity;
  if (patch.isReagent !== undefined) {
    next.isReagent = patch.isReagent;
    // "시약으로 넣기": 자동 연결이 있으면 그 시약, 없으면 새 시약
    if (patch.isReagent && next.link.kind === "none" && patch.link === undefined) {
      const match = matchReagent(docReagentName(next.item.name), reagents);
      next.link = match ? { kind: "reagent", reagentId: match.id } : { kind: "new" };
      next.autoReagentId = match?.id ?? null;
      if (!match) next.expanded = true;
    }
  }
  if (patch.link !== undefined) {
    next.link = patch.link;
    next.amountEdited = false;
    if (patch.link.kind === "new") next.expanded = true;
  }
  if (patch.amount !== undefined) {
    next.amount = patch.amount;
    next.amountEdited = true;
  }
  if (patch.expanded !== undefined) next.expanded = patch.expanded;
  if (patch.newReagent) {
    const nr = { ...next.newReagent, ...patch.newReagent };
    if (patch.newReagent.stock !== undefined) nr.stockEdited = true;
    next.newReagent = nr;
  }
  return refreshDocRow(next, reagents);
}

/* ───────── 행 상태 · 저장 항목 ───────── */

export const DOC_ROW_ERRORS = {
  amount: "입고량을 0보다 큰 숫자로 입력해 주세요",
  name: "이름을 입력해 주세요",
  nameLong: `이름은 ${DOC_NAME_MAX}자까지 쓸 수 있어요`,
  storageClass: "보관 분류를 골라 주세요",
  stock: "재고량을 0보다 큰 숫자로 입력해 주세요",
  msds: "MSDS 주소는 http:// 또는 https:// 로 시작해야 해요",
  exists: "이미 있는 시약이에요 — 우리 학교 시약으로 바꿔 주세요",
  duplicate: "같은 이름의 새 시약이 두 번 있어요",
  reagent: "연결한 시약을 찾을 수 없어요",
} as const;

/** record_document_intake 의 항목 (d7 §21) */
export type DocSaveItem =
  | { reagent_id: string; amount: number }
  | { name: string; storage_class: string; unit: string; stock: number; msds_url: string | null };

export type DocRowView = {
  id: string;
  /** 연결한 우리 학교 시약 */
  reagent: DocReagent | null;
  /** 단위 환산 안내 (연결 행 = 시약 단위, 새 시약 행 = 새 시약 단위) */
  note: string | null;
  /** 입고량을 계산하지 못했다 (직접 입력 안내) */
  manual: boolean;
  /** 이 행이 저장되는가 */
  active: boolean;
  /** 오류 문구 (없으면 null) */
  error: string | null;
  /** 새 시약 요약 "새 시약 · 산 · 1,000 mL" */
  summary: string | null;
};

export type DocSavePlan = {
  rows: DocRowView[];
  items: DocSaveItem[];
  /** 저장되는 새 시약 수 */
  newCount: number;
  canSave: boolean;
  /** 저장할 수 없는 이유 (canSave 면 null) */
  blockReason: string | null;
};

const nameKey = (s: string) => s.normalize("NFC").trim().toLowerCase();

function checkUrl(raw: string): { ok: true; value: string | null } | { ok: false } {
  const url = raw.trim();
  if (url === "") return { ok: true, value: null };
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > DOC_MSDS_URL_MAX) return { ok: false };
  return { ok: true, value: url };
}

/**
 * 환산 안내 줄: 입력한 입고량(재고량)이 계산값과 같거나 비어 있으면 계산식 그대로("500 mL × 3병 = 1,500 mL"),
 * 직접 고쳐 계산값과 다르면 "계산값 1,500 mL · 직접 고침". 계산할 수 없으면 null.
 */
export function convertNote(calc: DocAmount, entered: number | null, unit: string): string | null {
  if (calc.amount === null || calc.note === null) return null;
  if (entered === null || entered === calc.amount) return calc.note;
  return `계산값 ${formatAmountText(calc.amount, unit)} · 직접 고침`;
}

/**
 * 확인 표 → 행 상태 + 저장 항목 (d7 §21).
 * - 저장되는 행 = 표에 있는(isReagent) 행 중 빼지 않은 것. 시약 아님·빼기 행은 빠진다(오류 아님).
 * - 연결 행: 입고량 > 0 (소수 3자리, 1,000,000 이하) → {reagent_id, amount}
 * - 새 시약 행: 이름 1~80자, 분류 8종, 단위 병·mL·g, 재고량 > 0, MSDS 주소 비움 또는 http(s)://
 *   → {name, storage_class, unit, stock, msds_url}. 우리 학교에 같은 이름(앞뒤 공백·대소문자 무시)이 있거나
 *   새 시약끼리 이름이 같으면 오류.
 * - 입고일: 실제 날짜 + 오늘 이후 불가. 항목 1~50.
 */
export function planDocIntake(
  rows: readonly DocRow[],
  reagents: readonly DocReagent[],
  intakeDate: string,
  today: string,
): DocSavePlan {
  const existing = new Set(reagents.map((r) => nameKey(r.name)));
  const newNames = new Map<string, number>();
  for (const row of rows) {
    if (row.isReagent && row.link.kind === "new") {
      const k = nameKey(row.newReagent.name);
      if (k !== "") newNames.set(k, (newNames.get(k) ?? 0) + 1);
    }
  }

  const views: DocRowView[] = [];
  const items: DocSaveItem[] = [];
  let newCount = 0;
  let firstError: string | null = null;

  for (const row of rows) {
    const view: DocRowView = { id: row.id, reagent: null, note: null, manual: false, active: false, error: null, summary: null };
    if (row.isReagent && row.link.kind === "reagent") {
      const id = row.link.reagentId;
      const reagent = reagents.find((r) => r.id === id) ?? null;
      view.active = true;
      view.reagent = reagent;
      if (!reagent) view.error = DOC_ROW_ERRORS.reagent;
      else {
        const calc = amountFor(row, reagent.unit);
        const amount = parseAmount(row.amount);
        view.note = convertNote(calc, amount, reagent.unit);
        view.manual = calc.amount === null;
        if (amount === null) view.error = DOC_ROW_ERRORS.amount;
        else items.push({ reagent_id: reagent.id, amount });
      }
    } else if (row.isReagent && row.link.kind === "new") {
      const d = row.newReagent;
      view.active = true;
      const calc = amountFor(row, d.unit);
      const name = d.name.trim();
      const stock = parseAmount(d.stock);
      view.note = convertNote(calc, stock, d.unit);
      view.manual = calc.amount === null;
      const url = checkUrl(d.msdsUrl);
      const key = nameKey(name);
      if (name === "") view.error = DOC_ROW_ERRORS.name;
      else if (name.length > DOC_NAME_MAX) view.error = DOC_ROW_ERRORS.nameLong;
      else if (existing.has(key)) view.error = DOC_ROW_ERRORS.exists;
      else if ((newNames.get(key) ?? 0) > 1) view.error = DOC_ROW_ERRORS.duplicate;
      else if (!(STORAGE_CLASSES as readonly string[]).includes(d.storageClass)) view.error = DOC_ROW_ERRORS.storageClass;
      else if (stock === null) view.error = DOC_ROW_ERRORS.stock;
      else if (!url.ok) view.error = DOC_ROW_ERRORS.msds;
      else {
        items.push({ name, storage_class: d.storageClass, unit: d.unit, stock, msds_url: url.value });
        newCount += 1;
      }
      const parts = ["새 시약", d.storageClass || null, stock !== null ? formatAmountText(stock, d.unit) : null].filter(Boolean);
      view.summary = parts.join(" · ");
    }
    if (view.error && !firstError) firstError = view.error;
    views.push(view);
  }

  const activeCount = views.filter((v) => v.active).length;
  let blockReason: string | null = null;
  const dateError = checkDocIntakeDate(intakeDate, today);
  if (dateError) blockReason = dateError;
  else if (activeCount === 0) blockReason = "입고할 품목이 없어요";
  else if (activeCount > DOC_ITEMS_MAX) blockReason = `한 번에 ${DOC_ITEMS_MAX}개까지 입고할 수 있어요`;
  else if (firstError) blockReason = "빨간 안내가 있는 품목을 고쳐 주세요";

  return { rows: views, items: blockReason ? [] : items, newCount, canSave: blockReason === null, blockReason };
}

/* ───────── 서버 쪽 다시 검사 (Server Action 입력) ───────── */

export type DocIntakeInput = { intakeDate: string; items: DocSaveItem[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 클라이언트가 보낸 값을 믿지 않고 모양을 다시 맞춘다 (DB 함수가 같은 검사를 한 번 더 한다).
 * 항목 1~50, 연결 = {reagent_id(uuid), amount > 0}, 새 시약 = {name, storage_class, unit, stock > 0, msds_url}.
 */
export function checkDocIntakeInput(input: unknown, today: string): Checked<DocIntakeInput> {
  if (!isRecord(input)) return { ok: false, error: "입고할 품목을 확인해 주세요" };
  const dateError = checkDocIntakeDate(input.intakeDate, today);
  if (dateError) return { ok: false, error: dateError };
  const raw = input.items;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "입고할 품목이 없어요" };
  if (raw.length > DOC_ITEMS_MAX) return { ok: false, error: `한 번에 ${DOC_ITEMS_MAX}개까지 입고할 수 있어요` };
  const items: DocSaveItem[] = [];
  for (const it of raw) {
    if (!isRecord(it)) return { ok: false, error: "입고할 품목을 확인해 주세요" };
    if ("reagent_id" in it) {
      const amount = typeof it.amount === "number" ? parseAmount(it.amount) : null;
      if (typeof it.reagent_id !== "string" || !UUID_RE.test(it.reagent_id) || amount === null) {
        return { ok: false, error: DOC_ROW_ERRORS.amount };
      }
      items.push({ reagent_id: it.reagent_id, amount });
    } else {
      const name = typeof it.name === "string" ? it.name.trim() : "";
      const stock = typeof it.stock === "number" ? parseAmount(it.stock) : null;
      const url = checkUrl(typeof it.msds_url === "string" ? it.msds_url : "");
      if (name === "" || name.length > DOC_NAME_MAX) return { ok: false, error: DOC_ROW_ERRORS.name };
      if (typeof it.storage_class !== "string" || !(STORAGE_CLASSES as readonly string[]).includes(it.storage_class)) {
        return { ok: false, error: DOC_ROW_ERRORS.storageClass };
      }
      if (typeof it.unit !== "string" || !(DOC_UNITS as readonly string[]).includes(it.unit)) {
        return { ok: false, error: "단위를 선택해 주세요" };
      }
      if (stock === null) return { ok: false, error: DOC_ROW_ERRORS.stock };
      if (!url.ok) return { ok: false, error: DOC_ROW_ERRORS.msds };
      items.push({ name, storage_class: it.storage_class, unit: it.unit, stock, msds_url: url.value });
    }
  }
  return { ok: true, value: { intakeDate: input.intakeDate as string, items } };
}
