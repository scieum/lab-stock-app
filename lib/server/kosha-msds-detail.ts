import "server-only";
import { koshaChemIdFromUrl, type MsdsSectionKey, type MsdsSummary } from "@/lib/msds-summary";
import { parseChemDetailXml, sectionLines, summarizeSection2, type ChemDetailItem } from "./kosha-msds-detail-xml";
import { normalizeChemId } from "./kosha-msds-xml";

// 안전보건공단 물질안전보건자료 항목별 상세 (공공데이터포털 15157612, d7 §22) — 화면 16 MSDS 요약.
// - 오퍼레이션: getChemDetail021(2. 유해성·위험성) · 041(4. 응급조치요령) · 071(7. 취급 및 저장방법) · 081(8. 노출방지 및 개인보호구)
//   요청 변수 = serviceKey · chemId (명세 예시 "001008" — 6자리 앞 0 채움 문자열)
// - 키는 서버 환경변수 KOSHA_MSDS_API_KEY(디코딩 키)에서만 읽는다 (N2). 로그·오류에 키·요청 주소를 넣지 않는다.
// - chem_id 별 하루 캐시 (이 서버 인스턴스 메모리, 네 항목이 모두 성공한 결과만). 같은 chem_id 의 동시 요청은 하나로 묶는다.
// - 항목 일부 실패 = 그 항목만 null("내용이 없어요"), 네 항목 모두 실패 = 오류(16-fail).

const BASE = "https://apis.data.go.kr/B552468/msdschem1";
const OPERATIONS: Record<MsdsSectionKey, string> = {
  s2: "getChemDetail021",
  s4: "getChemDetail041",
  s7: "getChemDetail071",
  s8: "getChemDetail081",
};
const TIMEOUT_MS = 10_000;
export const MSDS_SUMMARY_CACHE_SECONDS = 86_400;
const CACHE_MAX_KEYS = 300;

export type MsdsSummaryFailure = "bad-id" | "no-key" | "timeout" | "upstream";
export type MsdsSummaryResult = { ok: true; summary: MsdsSummary } | { ok: false; code: MsdsSummaryFailure };

/** msds_url → 공단 화학물질 ID (공단 상세 주소가 아니면 null) — lib/msds-summary 와 같은 규칙 */
export const chemIdFromMsdsUrl = koshaChemIdFromUrl;

const memo = new Map<string, { at: number; summary: MsdsSummary }>();
const inflight = new Map<string, Promise<MsdsSummaryResult>>();

function cached(chemId: string, now = Date.now()): MsdsSummary | null {
  const hit = memo.get(chemId);
  if (!hit) return null;
  if (now - hit.at > MSDS_SUMMARY_CACHE_SECONDS * 1000) {
    memo.delete(chemId);
    return null;
  }
  return hit.summary;
}

function remember(chemId: string, summary: MsdsSummary, now = Date.now()) {
  if (memo.size >= CACHE_MAX_KEYS) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(chemId, { at: now, summary });
}

/** 테스트용: 캐시 비우기 */
export function clearMsdsSummaryCache() {
  memo.clear();
  inflight.clear();
}

type SectionFetch = { ok: true; items: ChemDetailItem[] } | { ok: false; code: "timeout" | "upstream" };

async function fetchSection(op: string, chemId: string, key: string, fetchImpl: typeof fetch): Promise<SectionFetch> {
  const params = new URLSearchParams({ serviceKey: key, chemId });
  let text: string;
  try {
    const res = await fetchImpl(`${BASE}/${op}?${params}`, {
      cache: "no-store",
      headers: { Accept: "application/xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    text = await res.text();
    if (!res.ok && !text.includes("<")) return { ok: false, code: "upstream" };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return { ok: false, code: name === "TimeoutError" || name === "AbortError" ? "timeout" : "upstream" };
  }
  const parsed = parseChemDetailXml(text);
  if (parsed.kind === "ok") return { ok: true, items: parsed.items };
  if (parsed.kind === "gateway-error") console.warn(`[msds-summary] gateway error ${parsed.code} ${parsed.reason}`);
  else if (parsed.kind === "api-error") console.warn(`[msds-summary] api error ${parsed.resultCode}`);
  else console.warn("[msds-summary] unexpected response format");
  return { ok: false, code: "upstream" };
}

/** 네 항목 응답 → 요약 (순수 — 단위 테스트용으로 내보낸다). 모두 실패면 null */
export function buildMsdsSummary(sections: Record<MsdsSectionKey, ChemDetailItem[] | null>): MsdsSummary | null {
  if (Object.values(sections).every((v) => v === null)) return null;
  const s2 = sections.s2 ? summarizeSection2(sections.s2) : null;
  return {
    signalWord: s2?.signalWord ?? null,
    pictograms: s2?.pictograms ?? [],
    sections: {
      s2: s2 ? s2.lines : null,
      s4: sections.s4 ? sectionLines(sections.s4) : null,
      s7: sections.s7 ? sectionLines(sections.s7) : null,
      s8: sections.s8 ? sectionLines(sections.s8) : null,
    },
  };
}

/**
 * 공단 화학물질 ID 로 MSDS 요약 (항목 2·4·7·8 을 함께 부른다).
 * fetchImpl 은 단위 테스트가 고정 XML 을 돌려주려고 넘긴다 (기본 = 전역 fetch).
 */
export async function getMsdsSummary(chemIdRaw: string, fetchImpl: typeof fetch = fetch): Promise<MsdsSummaryResult> {
  const chemId = normalizeChemId(chemIdRaw);
  if (!chemId || /^0+$/.test(chemId)) return { ok: false, code: "bad-id" };
  const hit = cached(chemId);
  if (hit) return { ok: true, summary: hit };

  const key = process.env.KOSHA_MSDS_API_KEY?.trim();
  if (!key) return { ok: false, code: "no-key" };

  const running = inflight.get(chemId);
  if (running) return running;

  const job = (async (): Promise<MsdsSummaryResult> => {
    const keys = Object.keys(OPERATIONS) as MsdsSectionKey[];
    const results = await Promise.all(keys.map((k) => fetchSection(OPERATIONS[k], chemId, key, fetchImpl)));
    const sections = Object.fromEntries(keys.map((k, i) => [k, results[i].ok ? results[i].items : null])) as Record<
      MsdsSectionKey,
      ChemDetailItem[] | null
    >;
    const summary = buildMsdsSummary(sections);
    if (!summary) {
      const allTimeout = results.every((r) => !r.ok && r.code === "timeout");
      return { ok: false, code: allTimeout ? "timeout" : "upstream" };
    }
    if (results.every((r) => r.ok)) remember(chemId, summary);
    return { ok: true, summary };
  })();
  inflight.set(chemId, job);
  try {
    return await job;
  } finally {
    inflight.delete(chemId);
  }
}
