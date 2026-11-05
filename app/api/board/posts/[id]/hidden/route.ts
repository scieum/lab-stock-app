import type { NextRequest } from "next/server";
import { setPostHidden } from "@/lib/server/board-admin";
import { BAD_REQUEST, boardAdminResponse, boardFail, readBoardJson, requireBoardOperator } from "@/lib/server/board-route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/board/posts/[id]/hidden — 글 숨기기·되살리기 (운영자만). 본문 { hidden: boolean } */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const denied = await requireBoardOperator();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readBoardJson(req);
  if (!body || typeof body.hidden !== "boolean") return boardFail(400, "bad-request", BAD_REQUEST);
  return boardAdminResponse(await setPostHidden(id, body.hidden));
}
