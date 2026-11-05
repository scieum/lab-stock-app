import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getBoardOperator } from "./board-operator";
import type { BoardAdminResult } from "./board-admin";

/**
 * app/api/board/** 운영자 API 공통 — 운영자 확인을 먼저(아니면 401·403), 본문은 JSON 만.
 * 응답: { ok: true, ... } | { ok: false, error, code, field? }. 캐시 안 함.
 */
export type BoardApiCode = "signed-out" | "forbidden" | "bad-request" | "not-found" | "invalid" | "config" | "failed";

const NO_STORE = { "Cache-Control": "no-store" };

export function boardFail(status: number, code: BoardApiCode, error: string, field?: string) {
  return NextResponse.json({ ok: false, error, code, ...(field ? { field } : {}) }, { status, headers: NO_STORE });
}

export function boardOk(data: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...data }, { headers: NO_STORE });
}

/** 운영자가 아니면 그 응답을, 운영자면 null 을 돌려준다 */
export async function requireBoardOperator(): Promise<NextResponse | null> {
  const op = await getBoardOperator();
  if (op.kind === "signed-out") return boardFail(401, "signed-out", "다시 로그인해 주세요");
  if (op.kind !== "operator") return boardFail(403, "forbidden", "운영자만 할 수 있어요");
  return null;
}

/** JSON 본문 (Content-Type application/json 만 — 다른 사이트의 단순 form 전송을 받지 않는다) */
export async function readBoardJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return null;
  try {
    const b = (await req.json()) as unknown;
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const BAD_REQUEST = "요청 형식이 올바르지 않아요";

/** lib/server/board-admin 결과 → 응답 */
export function boardAdminResponse<T extends Record<string, unknown>>(r: BoardAdminResult<T>) {
  if (r.ok) return boardOk(r.data);
  const status = r.code === "not-found" ? 404 : r.code === "invalid" ? 400 : 500;
  return boardFail(status, r.code, r.error, r.field);
}
