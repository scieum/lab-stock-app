import "server-only";
import { isCasQuery, type MsdsCandidate } from "@/lib/msds-rules";
import { parseChemListXml, toCandidates } from "./kosha-msds-xml";

// 안전보건공단 물질안전보건자료 조회 (공공데이터포털 15157612, d7 §20). 목록 검색 getChemList001 (XML) 하나만 부른다.
// - 키는 서버 환경변수 KOSHA_MSDS_API_KEY(디코딩 키)에서만 읽는다 (N2). URLSearchParams 가 인코딩한다.
// - 요청 변수: serviceKey · searchWrd(검색어) · searchCnd(0 국문명 · 1 CAS No · 2 UN No · 3 KE No · 4 EN No) · numOfRows · pageNo
// - 같은 검색어(검색 조건 + 정리한 검색어) 결과는 이 서버 인스턴스 메모리에 하루 캐시 (성공 결과만 — 오류는 캐시하지 않는다).
//   외부 요청 주소에 키가 들어가므로 Next fetch 캐시(디스크)는 쓰지 않는다.
// - 로그·오류 메시지에 키·요청 주소를 넣지 않는다. 검색어도 남기지 않는다.

const ENDPOINT = "https://apis.data.go.kr/B552468/msdschem1/getChemList001";
const TIMEOUT_MS = 10_000;
/** 한 번에 받는 줄 수 (후보 10개 — 비공개·중복 줄을 빼도 남게 조금 넉넉히) */
const ROWS = 20;
export const MSDS_CACHE_SECONDS = 86_400;
const CACHE_MAX_KEYS = 500;

export type MsdsSearchFailure = "no-key" | "timeout" | "upstream";
export type MsdsSearchResult = { ok: true; candidates: MsdsCandidate[] } | { ok: false; code: MsdsSearchFailure; reason?: string };

/** 키가 설정돼 있는가 (값은 돌려주지 않는다) */
export function isMsdsConfigured(): boolean {
  return Boolean(process.env.KOSHA_MSDS_API_KEY?.trim());
}

/** 검색 조건 코드: CAS 꼴이면 1(CAS No), 아니면 0(국문명) */
export function searchCondition(q: string): "0" | "1" {
  return isCasQuery(q) ? "1" : "0";
}

function cacheKey(q: string): string {
  return `${searchCondition(q)}:${q.trim().toLowerCase()}`;
}

const memo = new Map<string, { at: number; candidates: MsdsCandidate[] }>();

/** 캐시에 있으면 후보 (하루 안), 없으면 null */
export function cachedMsdsSearch(q: string, now = Date.now()): MsdsCandidate[] | null {
  const key = cacheKey(q);
  const hit = memo.get(key);
  if (!hit) return null;
  if (now - hit.at > MSDS_CACHE_SECONDS * 1000) {
    memo.delete(key);
    return null;
  }
  return hit.candidates;
}

function remember(q: string, candidates: MsdsCandidate[], now = Date.now()) {
  if (memo.size >= CACHE_MAX_KEYS) {
    // 가장 오래 넣은 것부터 지운다 (Map 은 넣은 순서)
    for (const [k, v] of memo) {
      if (memo.size < CACHE_MAX_KEYS && now - v.at <= MSDS_CACHE_SECONDS * 1000) break;
      memo.delete(k);
    }
  }
  memo.set(cacheKey(q), { at: now, candidates });
}

/**
 * 물질명(국문) 또는 CAS 번호로 MSDS 후보 검색 — 최대 10개 { chemId, name, cas, msdsUrl }.
 * q 는 부르는 쪽(lib/msds-rules checkMsdsQuery)이 이미 검사한 값이다.
 */
export async function searchMsds(q: string): Promise<MsdsSearchResult> {
  const cached = cachedMsdsSearch(q);
  if (cached) return { ok: true, candidates: cached };

  const key = process.env.KOSHA_MSDS_API_KEY?.trim();
  if (!key) return { ok: false, code: "no-key" };

  const params = new URLSearchParams({
    serviceKey: key,
    searchWrd: q.trim(),
    searchCnd: searchCondition(q),
    numOfRows: String(ROWS),
    pageNo: "1",
  });

  let text: string;
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      cache: "no-store",
      headers: { Accept: "application/xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    text = await res.text();
    // 게이트웨이 오류는 4xx 와 함께 XML 본문으로 온다 — 본문을 읽어 종류를 남긴다
    if (!res.ok && !text.includes("<")) return { ok: false, code: "upstream", reason: `http-${res.status}` };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, code: "timeout" };
    // 요청 주소(키 포함)를 메시지·로그에 넣지 않는다
    return { ok: false, code: "upstream", reason: "network" };
  }

  const parsed = parseChemListXml(text);
  switch (parsed.kind) {
    case "ok": {
      const candidates = toCandidates(parsed.items);
      remember(q, candidates);
      return { ok: true, candidates };
    }
    case "gateway-error":
      console.warn(`[msds] gateway error ${parsed.code} ${parsed.reason}`);
      return { ok: false, code: "upstream", reason: parsed.reason };
    case "api-error":
      console.warn(`[msds] api error ${parsed.resultCode}`);
      return { ok: false, code: "upstream", reason: `result-${parsed.resultCode}` };
    default:
      console.warn("[msds] unexpected response format");
      return { ok: false, code: "upstream", reason: "format" };
  }
}
