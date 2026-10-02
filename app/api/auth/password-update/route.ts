import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { newPasswordProblem } from "@/lib/auth/password-rules";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/password-update — 재설정 메일 링크로 들어온 세션에서 새 비밀번호 저장 (d7 §4-3)
 * 본문: { password, passwordConfirm }. 성공하면 세션을 지워 새 비밀번호로 다시 로그인하게 한다.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const b = (await req.json()) as unknown;
    body = b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }
  const password = typeof body.password === "string" ? body.password : "";
  const passwordConfirm = typeof body.passwordConfirm === "string" ? body.passwordConfirm : "";
  const problem = newPasswordProblem(password, passwordConfirm);
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json(
      { ok: false, error: "재설정 링크가 만료됐어요. 비밀번호 찾기를 다시 진행하세요." },
      { status: 401 },
    );
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const msg =
      error.code === "same_password"
        ? "이전과 다른 비밀번호를 입력하세요."
        : error.code === "weak_password"
          ? "더 안전한 비밀번호를 입력하세요."
          : "비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도하세요.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
