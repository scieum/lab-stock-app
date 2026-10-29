import type { NextRequest } from "next/server";
import { createFaq } from "@/lib/server/board-admin";
import { BAD_REQUEST, boardAdminResponse, boardFail, readBoardJson, requireBoardOperator } from "@/lib/server/board-route";

export const dynamic = "force-dynamic";

/** POST /api/board/faq — FAQ 추가 (운영자만, d7 §30). 본문 { title, body } (질문·답, 1~100자 · 1~5000자) */
export async function POST(req: NextRequest) {
  const denied = await requireBoardOperator();
  if (denied) return denied;
  const body = await readBoardJson(req);
  if (!body) return boardFail(400, "bad-request", BAD_REQUEST);
  return boardAdminResponse(await createFaq(body.title, body.body));
}
