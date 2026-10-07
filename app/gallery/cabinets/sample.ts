// 화면 11 갤러리 예시 데이터 (design/frames/11-mobile.json · 11-delete-mobile.json · 11-slot · 11-print · 3-location 의 예시 상태)
import type { DoorType, ShelfCount, SlotClasses } from "@/lib/cabinet-rules";
import { suggestLocation, type SuggestCabinet } from "@/lib/location-suggest";

export type SampleCabinet = {
  id: string;
  /** 시약장 번호 (디자인 1.15 cabinet-number) */
  number: number;
  label: string;
  doorType: DoorType;
  shelves: ShelfCount;
  slots: SlotClasses[];
  /** 이 시약장 칸에 배치된 시약 수 (삭제 확인 카드) */
  reagentCount: number;
};

/** 칸 없음 시약 (칸 없음 목록 · 시약 넣기 후보) */
export type SampleReagent = { id: string; name: string; amount: string; storageClass: string };

/** 칸에 놓인 시약 (칸 시트 · slot-count) */
export type SamplePlacedReagent = {
  id: string;
  name: string;
  amount: string;
  storageClass: string;
  cabinetId: string;
  /** slotId ("L2") */
  slot: string;
};

/** 시안 11: 시약장 2개, 1번 = 양문형 4단 8칸 (좌1단 산 + 염기), 2번 = 양문형 3단 (배치된 시약 6개 · 1.17 3-location: 우2단 산화제) */
export const sampleCabinets: SampleCabinet[] = [
  {
    id: "c-1",
    number: 1,
    label: "1번 시약장",
    doorType: "양문형",
    shelves: 4,
    reagentCount: 7,
    slots: [
      { side: "L", shelf: 1, classes: ["산", "염기"] },
      { side: "R", shelf: 1, classes: ["산화제"] },
      { side: "L", shelf: 2, classes: ["유기"] },
      { side: "R", shelf: 2, classes: ["무기염"] },
      { side: "L", shelf: 3, classes: ["인화성"] },
      { side: "R", shelf: 3, classes: ["독성"] },
      { side: "L", shelf: 4, classes: ["기타"] },
      { side: "R", shelf: 4, classes: ["기타"] },
    ],
  },
  {
    id: "c-2",
    number: 2,
    label: "2번 시약장",
    doorType: "양문형",
    shelves: 3,
    reagentCount: 6,
    slots: [
      { side: "L", shelf: 1, classes: ["산"] },
      { side: "R", shelf: 1, classes: ["염기"] },
      { side: "L", shelf: 2, classes: ["유기"] },
      { side: "R", shelf: 2, classes: ["산화제"] },
      { side: "L", shelf: 3, classes: [] },
      { side: "R", shelf: 3, classes: ["기타"] },
    ],
  },
];

/** 칸에 놓인 시약 — 시안 11: 좌1단 2 · 좌2단 3 · 우1단 1 · 우3단 1, 3-location: 2번 시약장 좌1단 2 · 우1단 1 · 좌2단 3 */
export const samplePlaced: SamplePlacedReagent[] = [
  { id: "p-1", name: "염산", amount: "1병", storageClass: "산", cabinetId: "c-1", slot: "L1" },
  { id: "p-2", name: "수산화나트륨", amount: "500g", storageClass: "염기", cabinetId: "c-1", slot: "L1" },
  { id: "p-3", name: "에탄올", amount: "200mL", storageClass: "유기", cabinetId: "c-1", slot: "L2" },
  { id: "p-4", name: "아세톤", amount: "500mL", storageClass: "유기", cabinetId: "c-1", slot: "L2" },
  { id: "p-5", name: "메탄올", amount: "1L", storageClass: "유기", cabinetId: "c-1", slot: "L2" },
  { id: "p-6", name: "과산화수소", amount: "2병", storageClass: "산화제", cabinetId: "c-1", slot: "R1" },
  { id: "p-7", name: "질산납", amount: "25g", storageClass: "독성", cabinetId: "c-1", slot: "R3" },
  { id: "p-8", name: "황산", amount: "1병", storageClass: "산", cabinetId: "c-2", slot: "L1" },
  { id: "p-9", name: "질산", amount: "1병", storageClass: "산", cabinetId: "c-2", slot: "L1" },
  { id: "p-10", name: "암모니아수", amount: "500mL", storageClass: "염기", cabinetId: "c-2", slot: "R1" },
  { id: "p-11", name: "에틸아세테이트", amount: "500mL", storageClass: "유기", cabinetId: "c-2", slot: "L2" },
  { id: "p-12", name: "헥세인", amount: "1L", storageClass: "유기", cabinetId: "c-2", slot: "L2" },
  { id: "p-13", name: "톨루엔", amount: "500mL", storageClass: "유기", cabinetId: "c-2", slot: "L2" },
];

/** 시안 11 "칸 없음 시약 (2)" */
export const sampleUnassigned: SampleReagent[] = [
  { id: "sample-u1", name: "황산구리(II)", amount: "250g", storageClass: "무기염" },
  { id: "sample-u2", name: "질산칼륨", amount: "300g", storageClass: "산화제" },
];

/** 시안 11-slot "넣을 시약 고르기": 칸 없음 시약 (분류 포함) */
export const sampleCandidates: SampleReagent[] = [
  { id: "u-1", name: "염산", amount: "1병", storageClass: "산" },
  { id: "u-2", name: "질산은", amount: "5g", storageClass: "무기염" },
  { id: "u-3", name: "과망가니즈산칼륨", amount: "100g", storageClass: "산화제" },
];

/** 갤러리 QR 내용의 앞부분 (실제 화면은 요청 주소) */
export const SAMPLE_ORIGIN = "https://lab-stock.example";

/** 시약장별 칸 시약 수 (slotId → 수) */
export function sampleCounts(cabinetId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of samplePlaced) if (r.cabinetId === cabinetId) out[r.slot] = (out[r.slot] ?? 0) + 1;
  return out;
}

/** 시약장별 칸 시약 분류 (slotId → 분류들) */
export function sampleSlotClasses(cabinetId: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of samplePlaced) if (r.cabinetId === cabinetId) (out[r.slot] ??= []).push(r.storageClass);
  return out;
}

/** 칸 하나의 시약 */
export function sampleInSlot(cabinetId: string, slot: string): SamplePlacedReagent[] {
  return samplePlaced.filter((r) => r.cabinetId === cabinetId && r.slot === slot);
}

/** 위치 피커(location-picker)용 시약장 — 칸 분류 · 칸 시약 수 · 칸 시약 분류 */
export const samplePickerCabinets = sampleCabinets.map((c) => ({
  id: c.id,
  number: c.number,
  label: c.label,
  doorType: c.doorType,
  shelves: c.shelves,
  slots: c.slots,
  counts: sampleCounts(c.id),
  reagentClasses: sampleSlotClasses(c.id),
}));

/** 위치 추천 입력 (lib/location-suggest) — 시약장 · 칸 분류 · 칸에 놓인 시약 */
export const sampleSuggestCabinets: SuggestCabinet[] = sampleCabinets.map((c) => ({
  id: c.id,
  number: c.number,
  label: c.label,
  doorType: c.doorType,
  shelves: c.shelves,
  slots: c.slots.map((s) => ({
    ...s,
    reagents: samplePlaced.filter((r) => r.cabinetId === c.id && r.slot === `${s.side}${s.shelf}`).map((r) => ({ id: r.id, storageClass: r.storageClass })),
  })),
}));

/** 시약 하나의 추천 칸 (갤러리 동작 예시) */
export function sampleSuggestion(reagent: { id?: string; storageClass: string | null }) {
  const s = suggestLocation(reagent, sampleSuggestCabinets);
  return s ? { cabinetId: s.cabinetId, side: s.side, shelf: s.shelf } : null;
}
