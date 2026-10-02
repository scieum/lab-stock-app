import { NextResponse, type NextRequest } from "next/server";
import { toSignupFields } from "@/lib/auth/signup-rules";
import { signUpWithSchool } from "@/lib/server/signup";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/signup — 화면 14 회원가입
 * 본문: { neisCode, displayName, email, password, passwordConfirm, agreeTerms, agreePrivacy }
 * 학교 정보는 neisCode로 서버가 NEIS에서 다시 확정하고, 역할은 DB 함수가 정한다.
 * 응답: { ok: true, needsEmailConfirm } | { ok: false, error }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }
  const result = await signUpWithSchool(toSignupFields(body), req.nextUrl.origin);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, needsEmailConfirm: result.needsEmailConfirm });
}
