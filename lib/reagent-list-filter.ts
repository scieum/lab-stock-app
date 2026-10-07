// 화면 2 시약 목록 필터·정렬 (harness/d7-data.md §16, design/rules.json list_filter).
// 순수 함수만 — 서버·클라이언트 어느 쪽에서도 import 할 수 있다 (상대 import 만 쓴다).
// 목록 데이터(학교 시약 전부)를 화면에서 거른다. 기존 "전체 / 재고 부족"·이름 검색과 함께(AND) 적용한다.
import { STORAGE_CLASSES } from "./intake-rules";

/* ───────── 값 ───────── */

/** 정렬: 이름순(기본) · 재고 적은 순 · 최근 입고순 */
export const LIST_SORTS = ["name", "stock", "intake"] as const;
export type ListSort = (typeof LIST_SORTS)[number];
export const DEFAULT_LIST_SORT: ListSort = "name";

export const LIST_SORT_OPTIONS: readonly { value: ListSort; label: string }[] = [
  { value: "name", label: "이름순" },
  { value: "stock", label: "재고 적은 순" },
  { value: "intake", label: "최근 입고순" },
];

/** 보관 분류 "분류 없음"(storage_class = null) — 주소창 값 */
export const NO_CLASS = "none";
export const NO_CLASS_LABEL = "분류 없음";
/** 보관 분류 칩 순서: 8종 + 분류 없음 */
export const CLASS_FILTER_VALUES: readonly string[] = [...STORAGE_CLASSES, NO_CLASS];

export const NO_SLOT_LABEL = "칸 없음";
export const NO_MSDS_LABEL = "MSDS 없음";

export type SlotSideValue = "L" | "R";

export type ListFilter = {
  sort: ListSort;
  /** 고른 보관 분류 (CLASS_FILTER_VALUES 순서, 중복 없음). 비면 분류 조건 없음 */
  classes: string[];
  /** 고른 시약장 id (없으면 모든 시약장) */
  cabinetId: string | null;
  /** 고른 칸 "L1" · "R3" (시약장을 골랐을 때만) */
  slot: string | null;
  /** 칸 없음만 (시약장·칸 선택과 함께 쓰지 않는다) */
  noSlot: boolean;
  /** MSDS 없는 시약만 */
  noMsds: boolean;
};

export const EMPTY_LIST_FILTER: ListFilter = {
  sort: DEFAULT_LIST_SORT,
  classes: [],
  cabinetId: null,
  slot: null,
  noSlot: false,
  noMsds: false,
};

/** 필터 시트·칩이 아는 시약장 (학교 시약장 전부) */
export type FilterCabinet = {
  id: string;
  number: number;
  label: string;
  doorType: "양문형" | "단문형";
  shelves: number;
};

/** 걸러지는 시약 한 행에 필요한 값 */
export type FilterableReagent = {
  id: string;
  name: string;
  /** 숫자 재고 (정렬용) */
  stockValue: number;
  /** "YYYY-MM-DD" 또는 null */
  intakeDate: string | null;
  storageClass: string | null;
  /** 배치된 칸 (없으면 칸 없음) */
  slot: { cabinetId: string; side: SlotSideValue; shelf: number } | null;
  hasMsds: boolean;
};

/* ───────── 칸 ───────── */

const SIDE_LABEL: Record<SlotSideValue, string> = { L: "좌", R: "우" };

/** 시약장의 칸 값 목록 — 위 단부터, 단마다 좌 → 우 ("L1" …) */
export function cabinetSlotValues(cabinet: Pick<FilterCabinet, "doorType" | "shelves">): string[] {
  const sides: SlotSideValue[] = cabinet.doorType === "단문형" ? ["L"] : ["L", "R"];
  const out: string[] = [];
  for (let shelf = 1; shelf <= cabinet.shelves; shelf += 1) for (const side of sides) out.push(`${side}${shelf}`);
  return out;
}

/** "L2" → { side, shelf }. 형식이 틀리면 null */
export function parseSlotValue(v: string): { side: SlotSideValue; shelf: number } | null {
  const m = /^([LR])([1-9]\d?)$/.exec(v);
  return m ? { side: m[1] as SlotSideValue, shelf: Number(m[2]) } : null;
}

/** 칸 이름: 양문형 "좌 2단" · 단문형 "2단" (화면 3 보관 위치와 같은 꼴) */
export function slotValueLabel(v: string, doorType: FilterCabinet["doorType"]): string {
  const s = parseSlotValue(v);
  if (!s) return v;
  return doorType === "단문형" ? `${s.shelf}단` : `${SIDE_LABEL[s.side]} ${s.shelf}단`;
}

/* ───────── 주소창 ───────── */

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: ParamSource, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * 주소창 쿼리 → 필터. 잘못된 값은 무시한다(기본값).
 * ?sort=stock|intake · ?class=산,산화제,none · ?cab={시약장 id} · ?slot=L1 (cab 이 있을 때) · ?noslot=1 · ?nomsds=1
 * cabinets 에 없는 시약장·그 시약장에 없는 칸은 무시. noslot 과 cab 이 함께 오면 noslot 이 이긴다(칸 없음만).
 */
export function parseListFilter(params: ParamSource, cabinets: readonly FilterCabinet[]): ListFilter {
  const sortRaw = read(params, "sort");
  const sort = LIST_SORTS.find((s) => s === sortRaw) ?? DEFAULT_LIST_SORT;

  const picked = new Set((read(params, "class") ?? "").split(",").map((s) => s.trim()));
  const classes = CLASS_FILTER_VALUES.filter((c) => picked.has(c));

  const noSlot = read(params, "noslot") === "1";
  const noMsds = read(params, "nomsds") === "1";

  let cabinetId: string | null = null;
  let slot: string | null = null;
  if (!noSlot) {
    const cab = cabinets.find((c) => c.id === read(params, "cab"));
    if (cab) {
      cabinetId = cab.id;
      const s = read(params, "slot");
      if (s && cabinetSlotValues(cab).includes(s)) slot = s;
    }
  }
  return { sort, classes, cabinetId, slot, noSlot, noMsds };
}

/** 필터 → 주소창 쿼리 (기본값은 지운다). 다른 쿼리(?filter·?q)는 그대로 둔다 */
export function writeListFilter(params: URLSearchParams, f: ListFilter): URLSearchParams {
  const set = (k: string, v: string | null) => (v ? params.set(k, v) : params.delete(k));
  set("sort", f.sort === DEFAULT_LIST_SORT ? null : f.sort);
  set("class", f.classes.length ? f.classes.join(",") : null);
  set("cab", f.noSlot ? null : f.cabinetId);
  set("slot", f.noSlot || !f.cabinetId ? null : f.slot);
  set("noslot", f.noSlot ? "1" : null);
  set("nomsds", f.noMsds ? "1" : null);
  return params;
}

/* ───────── 거르기·정렬 ───────── */

const collator = new Intl.Collator("ko", { sensitivity: "base", numeric: true });

function byName(a: FilterableReagent, b: FilterableReagent): number {
  return collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * 정렬 (d7 §16): 이름순 = 한국어 가나다(같으면 id) · 재고 적은 순 = 재고 오름차순(같으면 이름) ·
 * 최근 입고순 = 입고일 내림차순(없으면 뒤, 같으면 이름). 원본 배열은 바꾸지 않는다.
 */
export function sortReagents<T extends FilterableReagent>(items: readonly T[], sort: ListSort): T[] {
  const out = [...items];
  if (sort === "stock") out.sort((a, b) => a.stockValue - b.stockValue || byName(a, b));
  else if (sort === "intake") {
    out.sort((a, b) => {
      if (a.intakeDate && b.intakeDate && a.intakeDate !== b.intakeDate) return a.intakeDate < b.intakeDate ? 1 : -1;
      if (a.intakeDate && !b.intakeDate) return -1;
      if (!a.intakeDate && b.intakeDate) return 1;
      return byName(a, b);
    });
  } else out.sort(byName);
  return out;
}

/** 한 시약이 필터 조건(정렬 제외)을 모두 만족하는지 */
export function matchesListFilter(r: FilterableReagent, f: ListFilter): boolean {
  if (f.classes.length > 0) {
    const key = r.storageClass ?? NO_CLASS;
    if (!f.classes.includes(key)) return false;
  }
  if (f.noSlot) {
    if (r.slot) return false;
  } else if (f.cabinetId) {
    if (!r.slot || r.slot.cabinetId !== f.cabinetId) return false;
    if (f.slot && `${r.slot.side}${r.slot.shelf}` !== f.slot) return false;
  }
  if (f.noMsds && r.hasMsds) return false;
  return true;
}

/** 거른 뒤 정렬 */
export function applyListFilter<T extends FilterableReagent>(items: readonly T[], f: ListFilter): T[] {
  return sortReagents(
    items.filter((r) => matchesListFilter(r, f)),
    f.sort,
  );
}

/* ───────── 칩 ───────── */

export type FilterChip = {
  /** 칩 하나를 지울 때 쓰는 키 ("sort" · "class:산" · "location" · "noslot" · "nomsds") */
  key: string;
  label: string;
  /** 시약장 칩이면 그 시약장 번호 (cabinet-number) */
  cabinetNumber?: number;
};

/** 적용된 필터 → 칩 (정렬은 기본이 아니면 1개). 칩 수 = 필터 버튼 배지 숫자 */
export function listFilterChips(f: ListFilter, cabinets: readonly FilterCabinet[]): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.sort !== DEFAULT_LIST_SORT) {
    chips.push({ key: "sort", label: LIST_SORT_OPTIONS.find((o) => o.value === f.sort)?.label ?? f.sort });
  }
  for (const c of f.classes) chips.push({ key: `class:${c}`, label: c === NO_CLASS ? NO_CLASS_LABEL : c });
  if (f.noSlot) chips.push({ key: "noslot", label: NO_SLOT_LABEL });
  else if (f.cabinetId) {
    const cab = cabinets.find((c) => c.id === f.cabinetId);
    if (cab) {
      const label = f.slot ? `${cab.label} · ${slotValueLabel(f.slot, cab.doorType)}` : cab.label;
      chips.push({ key: "location", label, cabinetNumber: cab.number });
    }
  }
  if (f.noMsds) chips.push({ key: "nomsds", label: NO_MSDS_LABEL });
  return chips;
}

/** 칩 하나 지우기 */
export function removeListFilterChip(f: ListFilter, key: string): ListFilter {
  if (key === "sort") return { ...f, sort: DEFAULT_LIST_SORT };
  if (key.startsWith("class:")) {
    const c = key.slice("class:".length);
    return { ...f, classes: f.classes.filter((x) => x !== c) };
  }
  if (key === "location") return { ...f, cabinetId: null, slot: null };
  if (key === "noslot") return { ...f, noSlot: false };
  if (key === "nomsds") return { ...f, noMsds: false };
  return f;
}

/** 보관 분류 하나 켜고 끄기 (순서 = CLASS_FILTER_VALUES) */
export function toggleListFilterClass(f: ListFilter, c: string): ListFilter {
  const set = new Set(f.classes);
  if (set.has(c)) set.delete(c);
  else set.add(c);
  return { ...f, classes: CLASS_FILTER_VALUES.filter((x) => set.has(x)) };
}

export function sameListFilter(a: ListFilter, b: ListFilter): boolean {
  return (
    a.sort === b.sort &&
    a.classes.join(",") === b.classes.join(",") &&
    a.cabinetId === b.cabinetId &&
    a.slot === b.slot &&
    a.noSlot === b.noSlot &&
    a.noMsds === b.noMsds
  );
}
