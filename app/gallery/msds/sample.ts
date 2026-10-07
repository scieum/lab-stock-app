import type { MsdsCandidate } from "@/lib/msds-rules";

// 갤러리 예시 값 (시안 1.17 3-msds · 7-msds · 2-msds-bulk 의 글자). 주소는 안전보건공단 MSDS 상세 페이지 형식.
const detail = (id: string) => `https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=${id}&viewType=msds`;

/** 시안 3-msds: 질산은 · 질산은 용액 · 질산은(분석용) — 모두 CAS 7761-88-8 */
export const sampleMsdsCandidates: MsdsCandidate[] = [
  { chemId: "000699", name: "질산은", cas: "7761-88-8", msdsUrl: detail("000699") },
  { chemId: "900001", name: "질산은 용액", cas: "7761-88-8", msdsUrl: detail("900001") },
  { chemId: "900002", name: "질산은(분석용)", cas: "7761-88-8", msdsUrl: detail("900002") },
];

/** 시안 7-msds: 질산칼륨 · 질산칼륨 용액 · 아질산칼륨 */
export const sampleMsdsCandidates7: MsdsCandidate[] = [
  { chemId: "900011", name: "질산칼륨", cas: "7757-79-1", msdsUrl: detail("900011") },
  { chemId: "900012", name: "질산칼륨 용액", cas: "7757-79-1", msdsUrl: detail("900012") },
  { chemId: "900013", name: "아질산칼륨", cas: "7758-09-0", msdsUrl: detail("900013") },
];

/** 시안 2-msds-bulk: MSDS 없는 시약 4종 */
export const sampleBulkTargets = [
  { id: "b-1", name: "질산은" },
  { id: "b-2", name: "질산칼륨" },
  { id: "b-3", name: "모르는 시약" },
  { id: "b-4", name: "황산구리" },
];

/** 갤러리 동작 예시용 가짜 검색 (네트워크 없음) */
export function sampleSearch(q: string): MsdsCandidate[] {
  const t = q.trim();
  if (t.includes("질산은") || t === "7761-88-8") return sampleMsdsCandidates;
  if (t.includes("질산칼륨")) return sampleMsdsCandidates7;
  if (t.includes("황산구리")) return [{ chemId: "900021", name: "황산구리(II) 오수화물", cas: "7758-99-8", msdsUrl: detail("900021") }];
  return [];
}
