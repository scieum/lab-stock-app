import type { VendorCommonItem, VendorRegisterVendor } from "@/components/vendor-register";

// 시안 1.17 9 의 예시 데이터 (갤러리 전용): 판매처 3곳 + 등록 시트("과학나라" 입력 중).
// 행의 부가 정보는 d7 §18 대로 연락처만 보인다 (시안은 웹사이트 주소를 그렸다 — 웹사이트는 값으로만 둔다)
export const sampleVendors: VendorRegisterVendor[] = [
  { id: "v-1", name: "한빛 과학상사", contact: "02-555-0192", note: "시약", website: "https://www.hanbitscience.co.kr" },
  { id: "v-2", name: "청주 실험기자재", contact: "043-270-1188", note: "실험 기구", website: "https://www.cjlabsupply.co.kr" },
  { id: "v-3", name: "그린케미칼", contact: "031-778-3021", note: "시약·소모품", website: "https://www.greenchem.co.kr" },
];

/** 시안 1.17 9 등록 시트에 입력 중인 판매처명 */
export const sampleDraftName = "과학나라";

// 공통 목록 seed (d7 §12, 2026-10-05 사용자 지정)
export const sampleCommonVendors: VendorCommonItem[] = [
  { id: "c-1", name: "11번가", website: "https://www.11st.co.kr" },
  { id: "c-2", name: "G마켓", website: "https://www.gmarket.co.kr" },
  { id: "c-3", name: "오피스안", website: "https://officeahn.com" },
  { id: "c-4", name: "퍼스트과학", website: "https://firstsci.co.kr" },
];
