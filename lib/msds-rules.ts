// MSDS 찾기 (d7 §20) — 화면·서버 공용 순수 규칙. 키·외부 주소는 여기 두지 않는다 (lib/server/kosha-msds.ts).

/** 검색어 길이 (앞뒤 공백 정리 뒤) */
export const MSDS_QUERY_MAX = 60;
/** 후보 최대 개수 */
export const MSDS_CANDIDATES_MAX = 10;
/** 화면 2 일괄 찾기 한 번에 최대 */
export const MSDS_BULK_MAX = 20;
/** set_reagent_msds 의 msds_url 길이 한도 */
export const MSDS_URL_MAX = 300;

/** 후보 한 건 — GET /api/msds/search 응답 candidates[] */
export type MsdsCandidate = {
  /** 안전보건공단 화학물질 ID (6자리, 앞 0 채움) */
  chemId: string;
  /** 물질명 (국문) */
  name: string;
  /** CAS 번호 (없으면 null) */
  cas: string | null;
  /** 그 물질의 안전보건공단 MSDS 상세 페이지 주소 */
  msdsUrl: string;
};

export type MsdsSearchResponse = { candidates: MsdsCandidate[] };

export type MsdsSearchErrorCode =
  | "signed-out"
  | "forbidden"
  | "unavailable"
  | "bad-request"
  | "no-key"
  | "rate-limit"
  | "upstream";

export type MsdsSearchError = { error: string; code: MsdsSearchErrorCode };

/** 화면·API 문구 (N2: 키 값·외부 요청 주소·키를 가리키는 말은 쓰지 않는다 — design/rules.json never.N2 banned_terms) */
export const MSDS_TEXT = {
  find: "MSDS 찾기",
  missing: "MSDS가 아직 없어요",
  noResult: "찾지 못했어요 — 직접 입력",
  moreDirect: "찾는 게 없어요 — 직접 입력",
  confirm: "이 MSDS로",
  skip: "건너뛰기",
  loading: "MSDS를 찾고 있어요",
  pick: "알맞은 MSDS를 골라 주세요",
  directLabel: "MSDS 주소",
  directConfirm: "이 주소로",
  backToList: "목록으로",
  saved: "MSDS를 넣었어요",
  noKey: "MSDS 찾기를 쓸 수 없어요(서버 설정)",
  upstream: "MSDS를 찾지 못했어요. 잠시 뒤 다시 해 주세요",
  badQuery: `검색어를 1~${MSDS_QUERY_MAX}자로 입력해 주세요`,
  staffOnly: "MSDS 찾기는 교사·관리자만 쓸 수 있어요",
  signedOut: "다시 로그인해 주세요",
  urlError: "http:// 또는 https:// 로 시작하는 주소를 입력하세요",
  saveFailed: "저장하지 못했어요. 잠시 후 다시 시도해 주세요",
  notFound: "시약을 찾을 수 없어요. 화면을 새로 고친 뒤 다시 시도해 주세요",
} as const;

/** 화면 2 일괄 띠 문구 */
export function bulkBannerText(count: number): string {
  return `MSDS 없는 시약 ${count}종`;
}

/** 화면 2 일괄 끝 토스트 */
export function bulkDoneText(count: number): string {
  return `${count}종에 MSDS를 넣었어요`;
}

/** CAS 번호 꼴 (d7 §20 "숫자-숫자-숫자") — 이 꼴이면 CAS 로 검색한다 */
export function isCasQuery(q: string): boolean {
  return /^\d+-\d+-\d+$/.test(q.trim());
}

/** 저장할 수 있는 CAS 번호 (set_reagent_msds 와 같은 규칙: 2~7 - 2 - 1) */
export function isStorableCas(cas: string | null | undefined): cas is string {
  return typeof cas === "string" && /^\d{2,7}-\d{2}-\d$/.test(cas.trim());
}

/** 검색어 검사: 앞뒤 공백 정리 뒤 1~60자, 제어 문자 없음 */
export function checkMsdsQuery(raw: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof raw !== "string") return { ok: false };
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < 1 || value.length > MSDS_QUERY_MAX || /[\u0000-\u001f\u007f]/.test(value)) return { ok: false };
  return { ok: true, value };
}

/** 저장할 MSDS 주소 검사 (set_reagent_msds 와 같은 규칙: http(s)://, 공백 없음, 300자 이하) */
export function checkMsdsUrl(raw: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof raw !== "string") return { ok: false };
  const value = raw.trim();
  if (value.length === 0 || value.length > MSDS_URL_MAX || !/^https?:\/\/\S+$/i.test(value)) return { ok: false };
  return { ok: true, value };
}

/** 응답 본문이 후보 목록 모양인지 (화면이 받은 값을 한 번 더 확인 — http(s) 주소만) */
export function readCandidates(body: unknown): MsdsCandidate[] | null {
  if (typeof body !== "object" || body === null) return null;
  const list = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(list)) return null;
  const out: MsdsCandidate[] = [];
  for (const c of list) {
    if (typeof c !== "object" || c === null) continue;
    const { chemId, name, cas, msdsUrl } = c as Record<string, unknown>;
    if (typeof chemId !== "string" || typeof name !== "string" || typeof msdsUrl !== "string") continue;
    if (!checkMsdsUrl(msdsUrl).ok) continue;
    out.push({ chemId, name, cas: typeof cas === "string" && cas.trim() !== "" ? cas.trim() : null, msdsUrl });
    if (out.length >= MSDS_CANDIDATES_MAX) break;
  }
  return out;
}
