import type { VendorLinkOption } from "@/components/vendor-link";
import {
  autoCaptionText,
  reorderAlertDateText,
  reorderAmountParts,
  reorderAmountText,
  reorderBasisText,
  sortByShortage,
} from "@/lib/reorder-rules";

// 시안 6-desktop 의 예시 데이터 (갤러리 전용)
type SampleReagent = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  perGroup: number | null;
  groups: number | null;
  lowStockSince: string | null;
};

const reagents: SampleReagent[] = [
  {
    id: "r-1",
    name: "황산구리(II) 오수화물",
    unit: "g",
    stock: 30,
    minStock: 60,
    perGroup: 10,
    groups: 6,
    lowStockSince: "2026-09-30T02:10:00Z",
  },
  { id: "r-2", name: "질산은", unit: "g", stock: 15, minStock: 40, perGroup: 5, groups: 8, lowStockSince: "2026-09-28T05:30:00Z" },
];

export type SampleAlert = {
  id: string;
  name: string;
  amount: string;
  basis: string;
  date: string | null;
  /** 자동 기준이면 수량 줄 조각 + 캡션 (d7 §18) */
  auto?: { need: string; stock: string; caption: string | null };
};

function toAlert(r: SampleReagent): SampleAlert {
  return {
    id: r.id,
    name: r.name,
    amount: reorderAmountText(r),
    basis: reorderBasisText(r),
    date: reorderAlertDateText(r.lowStockSince),
  };
}

/** 시안 순서 그대로 (황산구리 → 질산은) */
export const sampleAlerts: SampleAlert[] = reagents.map(toAlert);

/** 부족한 정도가 큰 순 (질산은 62.5% → 황산구리 50%) */
export const sampleAlertsSorted: SampleAlert[] = sortByShortage(reagents).map(toAlert);

/** 실험 매뉴얼 값(1조 사용량·조 수)과 알림 날짜가 없는 시약 */
export const sampleAlertPlain: SampleAlert = toAlert({
  id: "r-3",
  name: "염화나트륨",
  unit: "g",
  stock: 120,
  minStock: 500,
  perGroup: null,
  groups: null,
  lowStockSince: null,
});

/** 자동 기준 시약 (시안 1.17 6 에탄올: 수량 줄 가운데 "자동" + "최근 사용량으로 계산했어요") */
export const sampleAlertAuto: SampleAlert = (() => {
  const r = { name: "에탄올", unit: "mL", stock: 200, minStock: 800 };
  return {
    id: "r-4",
    name: r.name,
    amount: reorderAmountText(r),
    basis: "",
    date: reorderAlertDateText("2026-10-07T01:00:00Z"),
    auto: { ...reorderAmountParts(r), caption: autoCaptionText({ minStock: r.minStock, autoBasis: "usage" }) },
  };
})();

/** 자동 기준 — 입고량 근거 (d7 §18 개발 쪽 예외 문구 "마지막 입고량의 20%로 계산했어요") */
export const sampleAlertAutoIntake: SampleAlert = (() => {
  const r = { name: "질산칼륨", unit: "g", stock: 10, minStock: 100 };
  return {
    id: "r-5",
    name: r.name,
    amount: reorderAmountText(r),
    basis: "",
    date: reorderAlertDateText("2026-10-06T01:00:00Z"),
    auto: { ...reorderAmountParts(r), caption: autoCaptionText({ minStock: r.minStock, autoBasis: "intake" }) },
  };
})();

// 시안 6 판매처 연결 모달의 판매처 2곳 (부가 정보 = "평균 N일 배송")
export const sampleLinkVendors: VendorLinkOption[] = [
  { id: "v-1", name: "한빛과학교재", note: "평균 2일 배송", website: "https://example.com/hanbit" },
  { id: "v-2", name: "미래실험사", note: "평균 4일 배송", website: "https://example.com/mirae" },
];

/** 우리 학교 판매처(웹사이트 없는 곳 포함) 먼저, 그다음 공통 목록 */
export const sampleLinkVendorsMixed: VendorLinkOption[] = [
  { id: "v-1", name: "한빛과학교재", note: "평균 2일 배송", website: "https://example.com/hanbit" },
  { id: "v-3", name: "청주 실험기자재", contact: "043-270-1188", note: "실험 기구", website: null },
  { id: "v-4", name: "동네 과학사", website: null },
  { id: "c-1", name: "11번가", website: "https://www.11st.co.kr" },
];
