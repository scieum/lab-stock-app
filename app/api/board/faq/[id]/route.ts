import type { NextRequest } from "next/server";
import { deleteFaq, updateFaq } from "@/lib/server/board-admin";
import { BAD_REQUEST, boardAdminResponse, boardFail, readBoardJson, requireBoardOperator } from "@/lib/server/board-route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/board/faq/[id] — FAQ 고치기 (운영자만). 본문 { title, body } */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await requireBoardOperator();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readBoardJson(req);
  if (!body) return boardFail(400, "bad-request", BAD_REQUEST);
  return boardAdminResponse(await updateFaq(id, body.title, body.body));
}

/** DELETE /api/board/faq/[id] — FAQ 삭제 (운영자만) */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await requireBoardOperator();
  if (denied) return denied;
  const { id } = await ctx.params;
  return boardAdminResponse(await deleteFaq(id));
}
