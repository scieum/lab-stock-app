import type { VendorCommonItem, VendorRegisterVendor } from "@/components/vendor-register";

// 시안 9-mobile 의 예시 데이터 (갤러리 전용)
export const sampleVendors: VendorRegisterVendor[] = [
  { id: "v-1", name: "과학나라 교육사", contact: "043-221-4560", note: "시약·실험 기구", website: "https://www.sciencenara.co.kr" },
  { id: "v-2", name: "한빛 과학상사", contact: "02-555-0192", note: "시약", website: null },
  { id: "v-3", name: "청주 실험기자재", contact: "043-270-1188", note: "실험 기구", website: null },
  { id: "v-4", name: "그린케미칼", contact: "031-778-3021", note: "시약·소모품", website: "https://example.com/green" },
];

// 공통 목록 seed (d7 §12, 2026-10-05 사용자 지정)
export const sampleCommonVendors: VendorCommonItem[] = [
  { id: "c-1", name: "11번가", website: "https://www.11st.co.kr" },
  { id: "c-2", name: "G마켓", website: "https://www.gmarket.co.kr" },
  { id: "c-3", name: "오피스안", website: "https://officeahn.com" },
  { id: "c-4", name: "퍼스트과학", website: "https://firstsci.co.kr" },
];
