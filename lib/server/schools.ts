import "server-only";
import type { NeisSchool } from "@/lib/types";
import { findSchool, NeisError } from "./neis";

/**
 * NEIS 학교 코드(SD_SCHUL_CODE)를 서버에서 NEIS로 다시 조회해 확정한다.
 * 클라이언트가 보낸 학교명·지역 등은 쓰지 않는다 — 코드 하나만 받아 여기서 정보를 채운다.
 * (고등학교·재외한국학교 제외 규칙은 lib/server/neis.ts 그대로)
 */
export async function verifyNeisSchool(neisCode: string): Promise<NeisSchool> {
  const code = neisCode.trim();
  if (!/^[0-9A-Za-z]{1,20}$/.test(code)) throw new NeisError("학교 코드가 올바르지 않아요.", 400);
  const school = await findSchool(code);
  if (!school) throw new NeisError("NEIS에서 해당 고등학교를 찾을 수 없어요. 학교를 다시 선택하세요.", 404);
  return school;
}
