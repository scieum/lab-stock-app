import { listSido } from "@/lib/server/neis";
import { neisFailure, neisJson } from "@/lib/server/neis-route";

export const dynamic = "force-dynamic";

/** GET /api/neis/sido — 시/도 목록 (재외한국학교 제외) */
export async function GET() {
  try {
    return neisJson({ sido: await listSido() });
  } catch (e) {
    return neisFailure(e);
  }
}
