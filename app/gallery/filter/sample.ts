import type { FilterCabinet, FilterableReagent } from "@/lib/reagent-list-filter";

/** 갤러리 예시 시약장 (시안 2-filter-empty: 2번 시약장) */
export const sampleFilterCabinets: FilterCabinet[] = [
  { id: "fc-1", number: 1, label: "1번 시약장", doorType: "양문형", shelves: 4 },
  { id: "fc-2", number: 2, label: "2번 시약장", doorType: "단문형", shelves: 3 },
];

type SampleReagent = FilterableReagent & { stock: string; intake: string; lowStock: boolean };

/** 갤러리 예시 시약 (시안 2-filter 목록: 염산 · 황산 · 아세트산 · 질산 …) */
export const sampleFilterReagents: SampleReagent[] = [
  {
    id: "fr-1",
    name: "염산",
    stockValue: 1,
    stock: "1병",
    intakeDate: "2026-03-02",
    intake: "입고 2026.03.02",
    storageClass: "산",
    slot: { cabinetId: "fc-1", side: "R", shelf: 1 },
    hasMsds: true,
    lowStock: true,
  },
  {
    id: "fr-2",
    name: "황산",
    stockValue: 500,
    stock: "500 mL",
    intakeDate: "2026-05-14",
    intake: "입고 2026.05.14",
    storageClass: "산",
    slot: { cabinetId: "fc-1", side: "R", shelf: 1 },
    hasMsds: false,
    lowStock: false,
  },
  {
    id: "fr-3",
    name: "아세트산",
    stockValue: 1000,
    stock: "1,000 mL",
    intakeDate: "2026-04-08",
    intake: "입고 2026.04.08",
    storageClass: "산",
    slot: null,
    hasMsds: true,
    lowStock: false,
  },
  {
    id: "fr-4",
    name: "질산",
    stockValue: 500,
    stock: "500 mL",
    intakeDate: "2026-06-21",
    intake: "입고 2026.06.21",
    storageClass: "산화제",
    slot: { cabinetId: "fc-2", side: "L", shelf: 2 },
    hasMsds: false,
    lowStock: false,
  },
  {
    id: "fr-5",
    name: "에탄올",
    stockValue: 1200,
    stock: "1,200 mL",
    intakeDate: "2026-09-01",
    intake: "입고 2026.09.01",
    storageClass: "인화성",
    slot: { cabinetId: "fc-1", side: "L", shelf: 2 },
    hasMsds: true,
    lowStock: false,
  },
  {
    id: "fr-6",
    name: "증류수",
    stockValue: 5000,
    stock: "5,000 mL",
    intakeDate: null,
    intake: "입고 -",
    storageClass: null,
    slot: null,
    hasMsds: false,
    lowStock: false,
  },
];
