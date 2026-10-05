// 화면 11 갤러리 예시 데이터 (design/frames/11-mobile.json · 11-delete-mobile.json 의 예시 상태)
import type { DoorType, ShelfCount, SlotClasses } from "@/lib/cabinet-rules";

export type SampleCabinet = {
  id: string;
  label: string;
  doorType: DoorType;
  shelves: ShelfCount;
  slots: SlotClasses[];
  /** 이 시약장 칸에 배치된 시약 수 (삭제 확인 카드) */
  reagentCount: number;
};

export type SampleReagent = { id: string; name: string; stock: string };

/** 시안 11: 시약장 2개, 1번 = 양문형 4단 8칸 (좌1단 산 + 염기), 2번 = 양문형 3단 (배치된 시약 6개) */
export const sampleCabinets: SampleCabinet[] = [
  {
    id: "c-1",
    label: "1번 시약장",
    doorType: "양문형",
    shelves: 4,
    reagentCount: 14,
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
    label: "2번 시약장",
    doorType: "양문형",
    shelves: 3,
    reagentCount: 6,
    slots: [
      { side: "L", shelf: 1, classes: ["유기"] },
      { side: "R", shelf: 1, classes: ["무기염"] },
      { side: "L", shelf: 2, classes: [] },
      { side: "R", shelf: 2, classes: ["기타"] },
      { side: "L", shelf: 3, classes: [] },
      { side: "R", shelf: 3, classes: [] },
    ],
  },
];

/** 시안 11 "칸 없음 시약 (2)" */
export const sampleUnassigned: SampleReagent[] = [
  { id: "sample-u1", name: "황산구리(II)", stock: "250 g" },
  { id: "sample-u2", name: "질산칼륨", stock: "300 g" },
];
