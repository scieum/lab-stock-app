// MSDS 요약 — 화면 16 (d7 §22, design/rules.json 1.21 msds_summary). 화면·서버 공용 순수 규칙.
// 키·외부 요청 주소는 여기 두지 않는다 (lib/server/kosha-msds-detail.ts).

/** GHS 그림문자 9종 코드 */
export const GHS_CODES = ["GHS01", "GHS02", "GHS03", "GHS04", "GHS05", "GHS06", "GHS07", "GHS08", "GHS09"] as const;
export type GhsCode = (typeof GHS_CODES)[number];

/**
 * 그림문자 아래 이름 (d7 §22: 폭발성·인화성·산화성·고압가스·부식성·급성 독성·경고·건강 유해성·환경 유해성).
 * GHS09 는 시안 16 의 캡션("수생환경 유해성")을 따른다.
 */
export const GHS_NAMES: Record<GhsCode, string> = {
  GHS01: "폭발성",
  GHS02: "인화성",
  GHS03: "산화성",
  GHS04: "고압가스",
  GHS05: "부식성",
  GHS06: "급성 독성",
  GHS07: "경고",
  GHS08: "건강 유해성",
  GHS09: "수생환경 유해성",
};

export function isGhsCode(v: unknown): v is GhsCode {
  return typeof v === "string" && (GHS_CODES as readonly string[]).includes(v);
}

export type SignalWord = "위험" | "경고";

export type MsdsSectionKey = "s2" | "s4" | "s7" | "s8";

/** 항목 제목 (번호 포함 원문 항목명 — 시안 16) */
export const MSDS_SECTION_TITLES: Record<MsdsSectionKey, string> = {
  s2: "2. 유해·위험성",
  s4: "4. 응급조치 요령",
  s7: "7. 취급 및 저장방법",
  s8: "8. 노출방지 및 개인보호구",
};

export const MSDS_SECTION_KEYS: readonly MsdsSectionKey[] = ["s2", "s4", "s7", "s8"];

/** 데스크톱 드로어 항목 바로가기 글자 (시안 16-desktop section-anchors) */
export const MSDS_SECTION_ANCHORS: Record<MsdsSectionKey, string> = {
  s2: "2. 유해·위험성",
  s4: "4. 응급조치",
  s7: "7. 취급·저장",
  s8: "8. 보호구",
};

/** 항목 카드 id (바로가기 대상) */
export function msdsSectionId(prefix: string, key: MsdsSectionKey): string {
  return `${prefix}-${key}`;
}

/** 접힌 상태에서 보이는 줄 수 */
export const MSDS_SUMMARY_PREVIEW_LINES = 3;

/**
 * 요약 한 건. sections 의 각 값: 줄 목록(비어 있을 수 있음), null = 그 항목을 불러오지 못함 — 둘 다 화면에서는 "내용이 없어요".
 */
export type MsdsSummary = {
  signalWord: SignalWord | null;
  pictograms: GhsCode[];
  sections: Record<MsdsSectionKey, string[] | null>;
};

/** 화면 16 문구 */
export const MSDS_SUMMARY_TEXT = {
  titlePrefix: "MSDS",
  source: "물질안전보건자료 · 한국산업안전보건공단",
  signalCaption: "신호어",
  empty: "내용이 없어요",
  more: "더 보기",
  less: "접기",
  original: "원문 MSDS 보기",
  fail: "요약을 불러오지 못했어요",
  loading: "MSDS 요약을 불러오는 중",
} as const;

/** nav 제목 "MSDS · 질산은" */
export function msdsTitle(reagentName: string): string {
  return `${MSDS_SUMMARY_TEXT.titlePrefix} · ${reagentName}`;
}

const KOSHA_HOST = "msds.kosha.or.kr";
const KOSHA_DETAIL_PATH = "/MSDSInfo/kcic/msdsdetail.do";

/**
 * 시약 msds_url 이 안전보건공단 MSDS 상세 주소(`https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=…`)이면
 * 화학물질 ID(6자리, 앞 0 채움), 아니면 null (직접 입력한 다른 주소 · 공단 첫 화면 등 → 16-no-summary).
 */
export function koshaChemIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.hostname.toLowerCase() !== KOSHA_HOST) return null;
  if (u.pathname.toLowerCase() !== KOSHA_DETAIL_PATH.toLowerCase()) return null;
  const raw = (u.searchParams.get("chem_id") ?? u.searchParams.get("chemId") ?? "").trim();
  if (!/^\d{1,10}$/.test(raw)) return null;
  if (/^0+$/.test(raw)) return null;
  return raw.padStart(6, "0");
}

/** 화면 16 으로 들어온 화면 — 뒤로 가기 대상 (d7 §22 "뒤로 = 들어온 화면") */
export type MsdsFrom = "reagent" | "usage";

export function readMsdsFrom(v: unknown): MsdsFrom {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "usage" ? "usage" : "reagent";
}

/** 화면 16 주소 — 화면 3(기본)·화면 10(from=usage) */
export function msdsSummaryPath(reagentId: string, opts: { demo?: boolean; from?: MsdsFrom } = {}): string {
  const base = opts.demo ? `/demo/msds/${reagentId}` : `/msds/${reagentId}`;
  return opts.from === "usage" ? `${base}?from=usage` : base;
}

/** 뒤로 가기 주소 */
export function msdsBackHref(reagentId: string, opts: { demo?: boolean; from?: MsdsFrom } = {}): string {
  if (opts.demo) return `/demo/reagents/${reagentId}`;
  return opts.from === "usage" ? "/usage" : `/reagents/${reagentId}`;
}
