// 안전보건공단 물질안전보건자료 목록(getChemList001) XML 읽기 — 순수 함수 (d7 §20).
// 키·요청은 lib/server/kosha-msds.ts. 여기에는 키가 없어 단위 테스트가 그대로 가져다 쓴다.
// 새 의존성 없이 정규식으로 읽는다: 응답은 깊이가 얕은 고정 모양(response > header · body > items > item)이다.
//
// 응답 모양 (공공데이터포털 15157612 명세 · 2026-10-07 확인):
//   정상   <response><header><resultCode>00</resultCode><resultMsg>…</resultMsg></header>
//          <body><items><item><casNo/><chemId/><chemNameKor/><enNo/><keNo/><unNo/><lastDate/><openYn/><koshaConfirm/></item>…</items>
//          <numOfRows/><pageNo/><totalCount/></body></response>
//   게이트웨이 오류 (키 없음·미등록·한도 초과 등)
//          <OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE_KEY_IS_NULL</errMsg><returnAuthMsg>…</returnAuthMsg>
//          <returnReasonCode>20</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>
// MSDS 상세 페이지: https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id={6자리}&viewType=msds
//   (2026-10-07 확인: GET 으로 열림 — 예 chem_id=000699 = 질산 은 · CAS 7761-88-8. 앞 0 이 없으면 빈 화면, viewType 이 없으면 404)

import { MSDS_CANDIDATES_MAX, type MsdsCandidate } from "@/lib/msds-rules";

export const KOSHA_DETAIL_BASE = "https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do";

/** 목록 한 줄 (필요한 필드만) */
export type ChemItem = {
  chemId: string;
  chemNameKor: string;
  casNo: string;
  openYn: string;
};

export type ChemListParse =
  | { kind: "ok"; items: ChemItem[]; totalCount: number }
  /** 공공데이터포털 게이트웨이 오류 (OpenAPI_ServiceResponse) — reason = errMsg (예: SERVICE_KEY_IS_NOT_REGISTERED_ERROR) */
  | { kind: "gateway-error"; reason: string; code: string }
  /** header.resultCode 가 정상이 아님 */
  | { kind: "api-error"; resultCode: string; resultMsg: string }
  /** XML 이 아니거나 모양이 다르다 */
  | { kind: "format" };

/** 정상 · 데이터 없음 결과 코드 (공공데이터포털 공통: 00 정상, 03 NODATA_ERROR) */
const OK_CODES = new Set(["00", "0", "0000", "INFO-000"]);
const NODATA_CODES = new Set(["03", "INFO-200"]);

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

/** 태그 하나의 글자 (CDATA·엔티티 풀기, 앞뒤 공백 정리). 없으면 null. 빈 태그(<a/>)는 "" */
export function tagText(xml: string, tag: string): string | null {
  const t = tag.replace(/[^A-Za-z0-9_]/g, "");
  const empty = new RegExp(`<${t}(?:\\s[^>]*)?/>`).exec(xml);
  const full = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`).exec(xml);
  if (!full) return empty ? "" : null;
  if (empty && empty.index < full.index) return "";
  const raw = full[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c: string) => c);
  return decodeEntities(raw).trim();
}

function blocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  for (let m = re.exec(xml); m; m = re.exec(xml)) out.push(m[1]);
  return out;
}

/** getChemList001 응답 XML → 목록 */
export function parseChemListXml(xml: string): ChemListParse {
  if (typeof xml !== "string" || !xml.includes("<")) return { kind: "format" };
  // XML 선언·주석 제거
  const body = xml.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");

  if (/<OpenAPI_ServiceResponse[\s>]/.test(body)) {
    return {
      kind: "gateway-error",
      reason: tagText(body, "errMsg") ?? "UNKNOWN",
      code: tagText(body, "returnReasonCode") ?? "",
    };
  }
  if (!/<response[\s>]/.test(body)) return { kind: "format" };

  const resultCode = tagText(body, "resultCode");
  if (resultCode === null) return { kind: "format" };
  if (NODATA_CODES.has(resultCode)) return { kind: "ok", items: [], totalCount: 0 };
  if (!OK_CODES.has(resultCode)) {
    return { kind: "api-error", resultCode, resultMsg: tagText(body, "resultMsg") ?? "" };
  }

  const items: ChemItem[] = [];
  for (const it of blocks(body, "item")) {
    items.push({
      chemId: tagText(it, "chemId") ?? "",
      chemNameKor: tagText(it, "chemNameKor") ?? "",
      casNo: tagText(it, "casNo") ?? "",
      openYn: tagText(it, "openYn") ?? "",
    });
  }
  const total = Number(tagText(body, "totalCount") ?? items.length);
  return { kind: "ok", items, totalCount: Number.isFinite(total) ? total : items.length };
}

/** 화학물질 ID → 6자리 (앞 0 채움). 숫자가 아니면 null */
export function normalizeChemId(raw: string): string | null {
  const t = raw.trim();
  if (!/^\d{1,10}$/.test(t)) return null;
  return t.padStart(6, "0");
}

/** 안전보건공단 MSDS 상세 페이지 주소 */
export function msdsDetailUrl(chemId: string): string | null {
  const id = normalizeChemId(chemId);
  if (!id) return null;
  return `${KOSHA_DETAIL_BASE}?chem_id=${id}&viewType=msds`;
}

/**
 * 목록 → 화면 후보 (최대 10). ID 가 없거나 숫자가 아닌 줄·이름 없는 줄·비공개(openYn = N) 줄은 뺀다.
 * 같은 물질 ID 가 두 번 나오면 처음 것만. CAS 는 "-" · 빈 값이면 null.
 */
export function toCandidates(items: readonly ChemItem[], max = MSDS_CANDIDATES_MAX): MsdsCandidate[] {
  const seen = new Set<string>();
  const out: MsdsCandidate[] = [];
  for (const it of items) {
    if (it.openYn.trim().toUpperCase() === "N") continue;
    const chemId = normalizeChemId(it.chemId);
    const name = it.chemNameKor.trim();
    if (!chemId || !name || seen.has(chemId)) continue;
    const msdsUrl = msdsDetailUrl(chemId);
    if (!msdsUrl) continue;
    seen.add(chemId);
    const cas = it.casNo.trim();
    out.push({ chemId, name, cas: cas && cas !== "-" ? cas : null, msdsUrl });
    if (out.length >= max) break;
  }
  return out;
}
