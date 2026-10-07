import { buildDocRows, patchDocRow, type DocExtraction, type DocReagent, type DocRow } from "@/lib/doc-intake-rules";

// 갤러리 예시 값 (시안 1.17 7-doc-review 의 글자). 네트워크·DB 없음.

export const SAMPLE_TODAY = "2026-10-08";

/** 우리 학교 시약 (연결 후보) */
export const sampleDocReagents: DocReagent[] = [
  { id: "r-hcl", name: "염산", unit: "mL" },
  { id: "r-etoh", name: "에탄올", unit: "mL" },
  { id: "r-naoh", name: "수산화나트륨", unit: "g" },
  { id: "r-h2o2", name: "과산화수소", unit: "병" },
];

/** 추출 결과 예시 — 시약 3개(염산 연결 · 질산칼륨 새 시약 · 아세트산 새 시약) + 시약 아님 2개 */
export const sampleExtraction: DocExtraction = {
  docDate: "2026-10-07",
  items: [
    {
      name: "염산 35% 500mL",
      spec: "500 mL",
      specAmount: 500,
      specUnit: "mL",
      quantity: 4,
      quantityUnit: "병",
      isReagent: true,
      suggestedClass: "산",
    },
    {
      name: "질산칼륨 500g",
      spec: "500 g",
      specAmount: 500,
      specUnit: "g",
      quantity: 1,
      quantityUnit: "병",
      isReagent: true,
      suggestedClass: "산화제",
    },
    {
      name: "아세트산(빙초산) 500mL",
      spec: "500 mL",
      specAmount: 500,
      specUnit: "mL",
      quantity: 2,
      quantityUnit: "병",
      isReagent: true,
      suggestedClass: "산",
    },
    {
      name: "비커 500mL",
      spec: "500 mL",
      specAmount: 500,
      specUnit: "mL",
      quantity: 10,
      quantityUnit: "개",
      isReagent: false,
      suggestedClass: null,
    },
    {
      name: "택배비",
      spec: null,
      specAmount: null,
      specUnit: null,
      quantity: 1,
      quantityUnit: null,
      isReagent: false,
      suggestedClass: null,
    },
  ],
};

/** 시안 7-doc-review 상태: 질산칼륨 새 시약 칸 펼침, 아세트산은 접힌 요약 */
export function sampleDocRows(): DocRow[] {
  const rows = buildDocRows(sampleExtraction, sampleDocReagents);
  return rows.map((r) => {
    if (r.item.name.startsWith("질산칼륨")) return patchDocRow(r, { expanded: true }, sampleDocReagents);
    if (r.item.name.startsWith("아세트산")) return patchDocRow(r, { expanded: false, newReagent: { name: "아세트산" } }, sampleDocReagents);
    return r;
  });
}

/** 규격으로 계산할 수 없는 연결 행 (단위가 다른 계열 — 입고량 직접 입력) */
export function sampleManualRows(): DocRow[] {
  const ex: DocExtraction = {
    docDate: null,
    items: [
      {
        name: "수산화나트륨 1L",
        spec: "1 L",
        specAmount: 1,
        specUnit: "L",
        quantity: 2,
        quantityUnit: "병",
        isReagent: true,
        suggestedClass: "염기",
      },
      {
        name: "과산화수소 3% 250mL",
        spec: "250 mL",
        specAmount: 250,
        specUnit: "mL",
        quantity: 3,
        quantityUnit: "병",
        isReagent: true,
        suggestedClass: "산화제",
      },
    ],
  };
  return buildDocRows(ex, sampleDocReagents);
}
