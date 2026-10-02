import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RESET_SENT_MESSAGE, resetRequestProblem } from "@/lib/auth/password-rules";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/password-reset — 비밀번호 찾기 (d7 §4-3)
 * 본문: { email }. Supabase 비밀번호 재설정 메일을 보낸다.
 * 메일 링크 → /auth/confirm?next=/reset-password (세션 생성) → 새 비밀번호 입력.
 * 이메일 존재 여부를 드러내지 않도록 형식만 맞으면 결과와 상관없이 같은 응답을 준다.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).email : undefined;
  const email = typeof raw === "string" ? raw.trim() : "";
  const problem = resetRequestProblem(email);
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });

  const supabase = await createClient();
  // 결과(없는 이메일·발송 제한 등)는 응답에 반영하지 않는다
  await supabase.auth
    .resetPasswordForEmail(email, { redirectTo: `${req.nextUrl.origin}/auth/confirm?next=/reset-password` })
    .catch(() => undefined);
  return NextResponse.json({ ok: true, message: RESET_SENT_MESSAGE });
}
