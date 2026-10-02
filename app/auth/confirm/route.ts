import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeConfirmNext } from "@/lib/auth/password-rules";

export const dynamic = "force-dynamic";

/**
 * GET /auth/confirm — 회원가입 확인 메일·비밀번호 재설정 메일의 링크가 돌아오는 곳.
 * PKCE(?code=) 또는 token_hash(?token_hash=&type=) 를 세션으로 바꾼 뒤 next(허용 목록: /, /reset-password)로 보낸다.
 * type=recovery 이면 next 없이도 /reset-password.
 * 실패하면 로그인 화면으로 (메일 링크 만료 등).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = type === "recovery" ? "/reset-password" : safeConfirmNext(url.searchParams.get("next"));
  const supabase = await createClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  const to = url.clone();
  to.search = "";
  to.pathname = ok ? next : "/login";
  if (!ok) to.searchParams.set("confirm", "failed");
  return NextResponse.redirect(to);
}
