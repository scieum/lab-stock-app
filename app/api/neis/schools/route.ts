import type { NextRequest } from "next/server";
import { listSchools } from "@/lib/server/neis";
import { neisBadRequest, neisFailure, neisJson } from "@/lib/server/neis-route";

export const dynamic = "force-dynamic";

/** GET /api/neis/schools?sido=&region= — 고등학교 목록 */
export async function GET(req: NextRequest) {
  const sido = req.nextUrl.searchParams.get("sido")?.trim();
  const region = req.nextUrl.searchParams.get("region")?.trim();
  if (!sido || !region) return neisBadRequest("sido, region 파라미터가 필요합니다.");
  try {
    return neisJson({ sido, region, schools: await listSchools(sido, region) });
  } catch (e) {
    return neisFailure(e);
  }
}
