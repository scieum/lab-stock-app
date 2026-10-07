import type { NextRequest } from "next/server";
import { listSchools } from "@/lib/server/neis";
import { neisBadRequest, neisFailure, neisJson } from "@/lib/server/neis-route";
import { SCHOOL_KINDS, isSchoolKind } from "@/lib/school-kinds";

export const dynamic = "force-dynamic";

/** GET /api/neis/schools?sido=&region=&kind= — 그 학교급(초등학교·중학교·고등학교) 학교 목록. kind 가 3종 밖이면 400 (d7 §3·§19) */
export async function GET(req: NextRequest) {
  const sido = req.nextUrl.searchParams.get("sido")?.trim();
  const region = req.nextUrl.searchParams.get("region")?.trim();
  const kind = req.nextUrl.searchParams.get("kind")?.trim();
  if (!sido || !region) return neisBadRequest("sido, region 파라미터가 필요합니다.");
  if (!isSchoolKind(kind)) return neisBadRequest(`kind 파라미터는 ${SCHOOL_KINDS.join("·")} 중 하나여야 합니다.`);
  try {
    return neisJson({ sido, region, kind, schools: await listSchools(sido, region, kind) });
  } catch (e) {
    return neisFailure(e);
  }
}
