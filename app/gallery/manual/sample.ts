// 화면 5(실험 매뉴얼) 갤러리 예시 데이터 — 시안 5 의 글자 그대로 (조 수 6, 추출 4행)
import type { ManualUploadFile } from "@/components/manual-upload";
import { normalizeExtraction, type ExtractedItem, type ExtractionRow, type ManualReagent } from "@/lib/manual-rules";

export const SAMPLE_GROUPS = 6;

export const samplePdf: ManualUploadFile = { name: "산과 염기의 중화 반응.pdf", kind: "pdf" };

export const sampleImage: ManualUploadFile = {
  name: "중화 반응 실험 매뉴얼 2학년 1학기 과학 탐구 활동지 사진.jpg",
  kind: "image",
  previewUrl: "/gallery/manual-sample.svg",
};

/** 우리 학교 시약 (기준이 없는 시약 = minStock 0) */
export const sampleReagents: ManualReagent[] = [
  { id: "m-1", name: "염산 0.1M", unit: "mL", minStock: 0 },
  { id: "m-2", name: "수산화나트륨", unit: "g", minStock: 0 },
  { id: "m-3", name: "페놀프탈레인", unit: "mL", minStock: 0 },
  { id: "m-4", name: "에탄올 95%", unit: "mL", minStock: 0 },
  { id: "m-5", name: "황산구리(II) 오수화물", unit: "g", minStock: 60 },
  { id: "m-6", name: "증류수", unit: "병", minStock: 2 },
];

/** 기존 기준이 있는 학교: 염산은 새 필요량(300)이 더 커서 바뀌고, 에탄올은 기존 기준(500)이 더 커서 그대로 */
export const sampleReagentsWithBasis: ManualReagent[] = sampleReagents.map((r) =>
  r.id === "m-1" ? { ...r, minStock: 100 } : r.id === "m-4" ? { ...r, minStock: 500 } : r,
);

/** AI 가 준 값이라고 가정한 추출 결과 (시안 5 의 4행) */
export const sampleExtracted: ExtractedItem[] = [
  { name: "염산 0.1M", amount: 50, unit: "mL" },
  { name: "수산화나트륨", amount: 2, unit: "g" },
  { name: "페놀프탈레인", amount: 1, unit: "mL" },
  { name: "에탄올 95%", amount: 20, unit: "mL" },
];

/** 추출 직후 (고친 칸 없음) */
export const sampleRows: ExtractionRow[] = normalizeExtraction(sampleExtracted, sampleReagents);

/** 시안 5 상태: 염산 사용량을 5 → 50 으로 고친 칸 (연하늘) */
export const sampleRowsFrame: ExtractionRow[] = sampleRows.map((r) =>
  r.id === "row-1" ? { ...r, extractedPerGroup: 5, perGroup: "50" } : r,
);

/** 미연결 행: 우리 학교에 없는 "아세트산" */
export const sampleRowsUnlinked: ExtractionRow[] = normalizeExtraction(
  [
    { name: "염산 0.1M", amount: 50, unit: "mL" },
    { name: "아세트산", amount: 10, unit: "mL" },
  ],
  sampleReagents,
);

/** 전부 미연결: 저장할 시약 0 */
export const sampleRowsAllUnlinked: ExtractionRow[] = normalizeExtraction(
  [
    { name: "아세트산", amount: 10, unit: "mL" },
    { name: "BTB 용액", amount: 3, unit: "방울" },
  ],
  sampleReagents,
);

/** 단위 불일치: 수산화나트륨(우리 학교 g)을 mL 로 읽음 · 사용량을 못 읽은 행 · 단위 미확정 행 */
export const sampleRowsMismatch: ExtractionRow[] = normalizeExtraction(
  [
    { name: "수산화나트륨 수용액", amount: 20, unit: "mL" },
    { name: "염산 0.1M", amount: null, unit: "mL" },
    { name: "페놀프탈레인 용액", amount: 2, unit: "방울" },
  ],
  sampleReagents,
);

/** 같은 시약에 두 행: 합쳐서 저장 */
export const sampleRowsMerged: ExtractionRow[] = normalizeExtraction(
  [
    { name: "염산 0.1M", amount: 50, unit: "mL" },
    { name: "묽은 염산(0.1M)", amount: 0.01, unit: "L" },
  ],
  sampleReagents,
);

/** 데모의 가짜 추출 결과: 단위 환산(L→mL)·미연결·단위 미확정이 섞여 있다 */
export const demoExtracted: ExtractedItem[] = [
  { name: "염산 0.1M", amount: 0.05, unit: "L" },
  { name: "수산화나트륨", amount: 2, unit: "g" },
  { name: "페놀프탈레인 용액", amount: 1, unit: "ml" },
  { name: "에탄올 95%", amount: 20, unit: "mL" },
  { name: "아세트산", amount: 10, unit: "mL" },
];
