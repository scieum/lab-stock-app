import { NextResponse, type NextRequest } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { MSDS_TEXT, checkMsdsQuery, isCasQuery, type MsdsSearchError, type MsdsSearchErrorCode, type MsdsSearchResponse } from "@/lib/msds-rules";
import { isMsdsConfigured } from "@/lib/server/kosha-msds";
import { cachedCombinedMsdsSearch, combinedMsdsSearch } from "@/lib/server/msds-search";
import { getMsdsAccess } from "@/lib/supabase/msds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 사용자당 분당 30회 (외부 하루 호출 한도 보호 — 화면 2 일괄 찾기 20종을 한 번에 돌릴 수 있게). 캐시에 없는 검색만 센다.
 * 카운터는 이 서버 인스턴스 메모리에 있다 (lib/rate-limit.ts 주석).
 */
const limiter = createRateLimiter(30, 60_000);

const NO_STORE = { "Cache-Control": "no-store" };

function fail(status: number, code: MsdsSearchErrorCode, error: string, headers: Record<string, string> = {}) {
  return NextResponse.json<MsdsSearchError>({ error, code }, { status, headers: { ...NO_STORE, ...headers } });
}

/**
 * GET /api/msds/search?q=&cas= — MSDS 후보 찾기 (d7 §20, 화면 2·3·7)
 * 순서: 로그인(401) → 교사·admin·자기 학교(학생·데모·학교 없음 403) → 검색어 1~60자(400) → 키 설정(503)
 *       → 호출 제한(429, 캐시에 없을 때만 — 사용자 검색 한 번을 1회로 센다) → 안전보건공단 목록 검색(시간 초과·오류 502).
 * 검색 보강(lib/server/msds-search): (1) cas(시약에 저장된 CAS, CAS 꼴이 아니면 무시) 또는 CAS 꼴 q → CAS
 *   (2) 학교 상용 이름 표 CAS (3) 원래 이름 국문명 (4) 모두 0개면 정리한 이름 — KOSHA 호출 최대 4회, 각 하루 캐시.
 * 응답: { candidates: [{ chemId, name, cas, msdsUrl }], searchedAs } (최대 10개, 0개도 200) / { error, code }.
 * 응답·로그에 키·외부 요청 주소를 넣지 않는다.
 */
export async function GET(req: NextRequest) {
  const access = await getMsdsAccess();
  if (access.kind === "signed-out") return fail(401, "signed-out", MSDS_TEXT.signedOut);
  if (access.kind === "unavailable") return fail(503, "unavailable", "계정 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요");
  if (access.kind !== "ok") return fail(403, "forbidden", MSDS_TEXT.staffOnly);

  const q = checkMsdsQuery(req.nextUrl.searchParams.get("q"));
  if (!q.ok) return fail(400, "bad-request", MSDS_TEXT.badQuery);

  if (!isMsdsConfigured()) return fail(503, "no-key", MSDS_TEXT.noKey);

  const rawCas = req.nextUrl.searchParams.get("cas")?.trim() ?? "";
  const cas = rawCas.length <= 20 && isCasQuery(rawCas) ? rawCas : null;

  const cached = cachedCombinedMsdsSearch(q.value, cas);
  if (cached) return NextResponse.json<MsdsSearchResponse>(cached, { headers: NO_STORE });

  const allowed = limiter.take(access.userId);
  if (!allowed.ok) {
    return fail(429, "rate-limit", `요청이 너무 잦아요. ${allowed.retryAfterSeconds}초 뒤에 다시 시도해 주세요`, {
      "Retry-After": String(allowed.retryAfterSeconds),
    });
  }

  const result = await combinedMsdsSearch(q.value, cas);
  if (result.ok) {
    return NextResponse.json<MsdsSearchResponse>({ candidates: result.candidates, searchedAs: result.searchedAs }, { headers: NO_STORE });
  }
  if (result.code === "no-key") return fail(503, "no-key", MSDS_TEXT.noKey);
  return fail(502, "upstream", MSDS_TEXT.upstream);
}
