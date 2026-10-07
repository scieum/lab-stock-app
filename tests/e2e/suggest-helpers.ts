// 시약 위치 추천 (d7 §17, design/rules.json 1.17 suggest · cabinet.incompatible) — 테스트 쪽 기대값 계산.
// 구현(lib/location-suggest)에서 읽지 않는다: d7 §17 추천 규칙 문장을 여기서 따로 옮겨, 그 계정 세션(RLS)으로 읽은 DB 행으로 계산한다.
//   후보 = 학교의 모든 시약장 칸 중 칸 분류(storage_classes)에 시약 분류가 있는 칸
//   → 그 칸에 이미 있는 시약(그 시약 자신 제외)들의 분류와 cabinet.incompatible 조합이 생기는 칸은 뺀다
//   → (1) 칸 안 시약 수(자기 제외) 적은 순 (2) 시약장 번호 순 (3) 칸 순(화면 11 배치도: 위 단부터, 단마다 좌 → 우)
//   → 첫 칸. 분류가 없거나(모르는 값 포함) 후보가 없으면 추천 없음. 시약장의 지금 문 형태·단 수 격자 밖 칸은 없는 칸.
import type { SupabaseClient } from "@supabase/supabase-js";
import { rules } from "./screen-helpers";

type CabRules = { storage_classes: string[]; incompatible: [string, string][]; door_types: string[] };
const CAB = (rules as unknown as { cabinet: CabRules }).cabinet;
const SINGLE = CAB.door_types[1];

export const SUGGEST_BADGE = "suggest-badge";
export const LOCATION_SUGGEST = "location-suggest";
/** rules.json suggest.after_register 의 문장들 */
const AFTER = (rules as unknown as { suggest: { after_register: string; badge: string } }).suggest;
/** "추천" (rules suggest.badge "suggest-badge '추천'") */
export const BADGE_TEXT = (/'([^']+)'/.exec(AFTER.badge) ?? [])[1] ?? "";
/** "맞는 칸이 없어요 — 시약장 설정에서 칸 분류를 정해 주세요" (rules suggest.after_register) */
export const NO_SLOT_TEXT = (/추천 칸 없음 = '([^']+)'/.exec(AFTER.after_register) ?? [])[1] ?? "";
/** [여기에 두기] · [다른 칸] · "모두 추천대로" · "나중에" (rules suggest.after_register) */
export const PLACE_HERE = (/\[(여기에 두기)\]/.exec(AFTER.after_register) ?? [])[1] ?? "";
export const OTHER_SLOT = (/\[(다른 칸)\]/.exec(AFTER.after_register) ?? [])[1] ?? "";
export const PLACE_ALL = (/'(모두 추천대로)'/.exec(AFTER.after_register) ?? [])[1] ?? "";
export const LATER = (/'(나중에)'/.exec(AFTER.after_register) ?? [])[1] ?? "";
/** "추천 위치:" (rules suggest.after_register "'추천 위치: {번호}번 시약장 좌2단'") */
export const SUGGEST_PREFIX = (/'(추천 위치:)/.exec(AFTER.after_register) ?? [])[1] ?? "";

export type SuggestRows = {
  cabinets: { id: string; number: number; label: string; door_type: string; shelves: number }[];
  slots: Record<string, unknown>[];
  reagents: { id: string; slot_id: string | null; storage_class: string | null }[];
};

export type ExpectedSuggestion = {
  cabinetId: string;
  number: number;
  label: string;
  doorType: string;
  /** "L1" · "R2" */
  key: string;
  slotId: string;
  /** 그 칸의 시약 수 (자기 제외) */
  count: number;
};

/** 그 계정 세션(RLS)으로 학교의 시약장 · 칸 · 시약(칸 · 분류)을 읽는다 */
export async function suggestRowsOf(client: SupabaseClient): Promise<SuggestRows> {
  const [c, s, r] = await Promise.all([
    client.from("cabinets").select("id, number, label, door_type, shelves"),
    client.from("cabinet_slots").select("*"),
    client.from("reagents").select("id, slot_id, storage_class"),
  ]);
  for (const q of [c, s, r]) if (q.error) throw new Error(`추천 대조 조회 실패: ${q.error.message}`);
  return {
    cabinets: ((c.data ?? []) as SuggestRows["cabinets"]).map((x) => ({ ...x, number: Number(x.number), shelves: Number(x.shelves) })),
    slots: (s.data ?? []) as Record<string, unknown>[],
    reagents: (r.data ?? []) as SuggestRows["reagents"],
  };
}

const classesOf = (row: Record<string, unknown>): string[] =>
  Array.isArray(row.storage_classes) ? (row.storage_classes as string[]) : typeof row.storage_class === "string" ? [row.storage_class] : [];
const clash = (a: string, b: string) => CAB.incompatible.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
/** 화면 11 배치도 순서의 칸 키 */
export const gridOrder = (door: string, shelves: number): string[] => {
  const sides = door === SINGLE ? ["L"] : ["L", "R"];
  const out: string[] = [];
  for (let s = 1; s <= shelves; s++) for (const side of sides) out.push(`${side}${s}`);
  return out;
};

/** d7 §17 추천 칸 (기대값). reagent.id 가 있으면 그 시약 자신을 빼고 센다 */
export function expectedSuggestion(rows: SuggestRows, reagent: { id?: string | null; storage_class: string | null }): ExpectedSuggestion | null {
  const cls = reagent.storage_class;
  if (!cls || !CAB.storage_classes.includes(cls)) return null;
  const cands: (ExpectedSuggestion & { ord: number })[] = [];
  for (const cab of rows.cabinets) {
    const order = gridOrder(cab.door_type, cab.shelves);
    for (const row of rows.slots.filter((s) => s.cabinet_id === cab.id)) {
      const key = `${row.side}${row.shelf}`;
      const ord = order.indexOf(key);
      if (ord < 0) continue;
      if (!classesOf(row).includes(cls)) continue;
      const others = rows.reagents.filter((r) => r.slot_id === row.id && r.id !== reagent.id);
      if (others.some((r) => r.storage_class && clash(cls, r.storage_class))) continue;
      cands.push({ cabinetId: cab.id, number: cab.number, label: cab.label, doorType: cab.door_type, key, slotId: row.id as string, count: others.length, ord });
    }
  }
  cands.sort((a, b) => a.count - b.count || a.number - b.number || a.ord - b.ord);
  if (!cands[0]) return null;
  const { ord: _ord, ...top } = cands[0];
  void _ord;
  return top;
}

/** "좌 2단" (양문형) · "2단" (단문형) — 화면 3 보관 위치 · 시안 7-suggest "2번 시약장 · 우 2단" */
export const slotTitleOf = (door: string, key: string) => (door === SINGLE ? `${key.slice(1)}단` : `${key[0] === "L" ? "좌" : "우"} ${key.slice(1)}단`);
/** "2번 시약장 · 우 2단" */
export const placeText = (s: Pick<ExpectedSuggestion, "label" | "doorType" | "key">) => `${s.label} · ${slotTitleOf(s.doorType, s.key)}`;
