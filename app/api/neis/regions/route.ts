import type { NextRequest } from "next/server";
import { listRegions } from "@/lib/server/neis";
import { neisBadRequest, neisFailure, neisJson } from "@/lib/server/neis-route";

export const dynamic = "force-dynamic";

/** GET /api/neis/regions?sido= — 지역(시/군/구) 목록 */
export async function GET(req: NextRequest) {
  const sido = req.nextUrl.searchParams.get("sido")?.trim();
  if (!sido) return neisBadRequest("sido 파라미터가 필요합니다.");
  try {
    return neisJson({ sido, regions: await listRegions(sido) });
  } catch (e) {
    return neisFailure(e);
  }
}
