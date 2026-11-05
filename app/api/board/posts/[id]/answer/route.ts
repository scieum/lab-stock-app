import type { NextRequest } from "next/server";
import { saveAnswer } from "@/lib/server/board-admin";
import { BAD_REQUEST, boardAdminResponse, boardFail, readBoardJson, requireBoardOperator } from "@/lib/server/board-route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/board/posts/[id]/answer — 답변 등록·고치기 (운영자만, 오류 문의·개선 제안 글). 본문 { answer } (1~5000자) */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const denied = await requireBoardOperator();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readBoardJson(req);
  if (!body) return boardFail(400, "bad-request", BAD_REQUEST);
  return boardAdminResponse(await saveAnswer(id, body.answer));
}
