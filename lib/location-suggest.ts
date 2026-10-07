// 시약 위치 추천 (harness/d7-data.md §17, design/rules.json suggest · cabinet.incompatible).
// 순수 함수만 — 서버(화면 3·7·11 데이터)·클라이언트(갤러리) 어느 쪽에서도 import 할 수 있다. DB 변경 없음.
import {
  INCOMPATIBLE,
  isDoorType,
  isShelfCount,
  isStorageClass,
  slotId,
  slotKeys,
  slotRowClasses,
  DEFAULT_DOOR_TYPE,
  DEFAULT_SHELVES,
  type DoorType,
  type SlotKey,
  type SlotSide,
} from "./cabinet-rules";

/** 칸 안 시약 (자기 자신 제외 판정용 id + 분류) */
export type SuggestSlotReagent = { id: string; storageClass: string | null | undefined };

/** 칸 하나 — 분류(storage_classes) + 그 칸에 놓인 시약 */
export type SuggestSlot = SlotKey & {
  classes: readonly string[];
  reagents: readonly SuggestSlotReagent[];
  /** DB 칸 id (cabinet_slots.id) — 있으면 결과에 그대로 싣는다 (place_reagent 에 바로 쓴다) */
  slotId?: string | null;
};

export type SuggestCabinet = {
  id: string;
  /** 학교 안 고정 번호 (cabinets.number) — 정렬 2순위 */
  number: number;
  label: string;
  doorType: DoorType;
  shelves: number;
  slots: readonly SuggestSlot[];
};

/** 추천 대상 시약 — id 가 있으면 칸 안 시약 수·분류에서 자기 자신을 뺀다 */
export type SuggestTarget = { id?: string | null; storageClass: string | null | undefined };

export type LocationSuggestion = {
  cabinetId: string;
  cabinetNumber: number;
  cabinetLabel: string;
  doorType: DoorType;
  side: SlotSide;
  shelf: number;
  /** DB 칸 id (입력에 있었으면) */
  slotId: string | null;
  /** 그 칸의 시약 수 (자기 자신 제외) */
  count: number;
};

function clashes(cls: string, others: Iterable<string>): boolean {
  for (const o of others) {
    if (INCOMPATIBLE.some(([a, b]) => (a === cls && b === o) || (a === o && b === cls))) return true;
  }
  return false;
}

/**
 * 추천 칸 1개 (d7 §17 추천 규칙). 없으면 null.
 * 1. 후보 = 모든 시약장의 칸 중 칸 분류에 시약의 분류가 있는 칸 (시약장의 지금 문 형태·단 수 격자 안의 칸만)
 * 2. 그 칸에 이미 있는 시약들(자기 자신 제외)의 분류와 cabinet.incompatible 조합이 생기는 칸은 뺀다
 * 3. 정렬: (1) 칸 안 시약 수(자기 자신 제외) 적은 순 (2) 시약장 번호 순 (3) 칸 순 — 화면 11 배치도 순서(위 단부터, 단마다 좌 → 우)
 *    세 값이 모두 같으면(번호가 같은 시약장이 둘 — 정상 데이터에는 없음) 입력 순서가 앞인 것
 * 시약 분류가 없거나(모르는 값 포함) 후보가 없으면 null.
 */
export function suggestLocation(target: SuggestTarget, cabinets: readonly SuggestCabinet[]): LocationSuggestion | null {
  const cls = target.storageClass;
  if (!cls || !isStorageClass(cls)) return null;
  const selfId = target.id ?? null;

  let best: Ranked | null = null;
  for (let cabIndex = 0; cabIndex < cabinets.length; cabIndex += 1) {
    const cab = cabinets[cabIndex];
    const keys = slotKeys(cab.doorType, cab.shelves);
    for (let order = 0; order < keys.length; order += 1) {
      const key = keys[order];
      const slot = cab.slots.find((s) => s.side === key.side && s.shelf === key.shelf);
      if (!slot || !slot.classes.includes(cls)) continue;
      const others = slot.reagents.filter((r) => selfId === null || r.id !== selfId);
      const otherClasses = others.map((r) => r.storageClass).filter((c): c is string => typeof c === "string" && isStorageClass(c));
      if (clashes(cls, otherClasses)) continue;
      const candidate: Ranked = {
        s: {
          cabinetId: cab.id,
          cabinetNumber: cab.number,
          cabinetLabel: cab.label,
          doorType: cab.doorType,
          side: key.side,
          shelf: key.shelf,
          slotId: slot.slotId ?? null,
          count: others.length,
        },
        cabIndex,
        order,
      };
      if (!best || better(candidate, best)) best = candidate;
    }
  }
  return best ? best.s : null;
}

type Ranked = { s: LocationSuggestion; cabIndex: number; order: number };

function better(a: Ranked, b: Ranked): boolean {
  if (a.s.count !== b.s.count) return a.s.count < b.s.count;
  if (a.s.cabinetNumber !== b.s.cabinetNumber) return a.s.cabinetNumber < b.s.cabinetNumber;
  if (a.cabIndex !== b.cabIndex) return a.cabIndex < b.cabIndex;
  return a.order < b.order;
}

/** 추천 칸이 (시약장, 칸) 과 같은지 */
export function isSuggestedSlot(
  suggestion: { cabinetId: string; side: SlotSide; shelf: number } | null | undefined,
  cabinetId: string | null | undefined,
  key: SlotKey | null | undefined,
): boolean {
  return Boolean(suggestion && cabinetId && key && suggestion.cabinetId === cabinetId && suggestion.side === key.side && suggestion.shelf === key.shelf);
}

/* ───────── DB 행 → 추천 입력 (서버 조회 결과를 그대로 넘긴다) ───────── */

export type SuggestCabinetRow = { id: string; number?: number | null; label: string; door_type: string; shelves: number };
export type SuggestSlotRow = {
  id: string;
  cabinet_id: string;
  side: string;
  shelf: number;
  storage_class?: string | null;
  storage_classes?: string[] | null;
};
export type SuggestReagentRow = { id: string; slot_id: string | null; storage_class: string | null };

/**
 * cabinets · cabinet_slots · reagents(slot_id · storage_class) 행 → 추천 입력.
 * 시약장 순서는 받은 순서 그대로(정렬은 suggestLocation 이 번호로 한다). 격자 밖 칸·행이 없는 칸은 빠진다.
 */
export function toSuggestCabinets(
  cabinets: readonly SuggestCabinetRow[],
  slots: readonly SuggestSlotRow[],
  reagents: readonly SuggestReagentRow[],
): SuggestCabinet[] {
  const bySlot = new Map<string, SuggestSlotReagent[]>();
  for (const r of reagents) {
    if (!r.slot_id) continue;
    const list = bySlot.get(r.slot_id) ?? [];
    list.push({ id: r.id, storageClass: r.storage_class });
    bySlot.set(r.slot_id, list);
  }
  return cabinets.map((c) => {
    const doorType = isDoorType(c.door_type) ? c.door_type : DEFAULT_DOOR_TYPE;
    const shelves = isShelfCount(c.shelves) ? c.shelves : DEFAULT_SHELVES;
    const valid = new Set(slotKeys(doorType, shelves).map(slotId));
    const rows = slots.filter((s) => s.cabinet_id === c.id);
    const out: SuggestSlot[] = [];
    for (const row of rows) {
      const key: SlotKey = { side: row.side === "R" ? "R" : "L", shelf: row.shelf };
      if (!valid.has(slotId(key))) continue;
      out.push({ ...key, classes: slotRowClasses(row), reagents: bySlot.get(row.id) ?? [], slotId: row.id });
    }
    return {
      id: c.id,
      number: typeof c.number === "number" && Number.isFinite(c.number) ? c.number : 0,
      label: c.label,
      doorType,
      shelves,
      slots: out,
    };
  });
}
