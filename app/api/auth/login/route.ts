import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = { email?: unknown; password?: unknown };

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * POST /api/auth/login — 화면 1 로그인 (d7 §4-2)
 * 이메일·비밀번호로 signInWithPassword 만 한다. 학교는 profiles.school_id 에서만 정해지고,
 * 요청 본문의 다른 값(학교 코드 등)은 읽지 않는다 — 로그인으로 학교를 바꿀 수 없다.
 * 프로필이 없는 계정(가입 미완료)은 세션을 지우고 안내한다.
 */
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail(400, "요청 형식이 올바르지 않아요.");
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail(400, "개인 이메일과 비밀번호를 입력하세요.");

  const supabase = await createClient();
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr || !auth.user) {
    if (authErr?.code === "email_not_confirmed") {
      return fail(401, "아직 이메일 확인이 끝나지 않았어요. 가입할 때 받은 확인 메일의 링크를 눌러 주세요.");
    }
    return fail(401, "이메일 또는 비밀번호가 올바르지 않아요.");
  }

  const rejectWith = async (status: number, message: string) => {
    await supabase.auth.signOut();
    return fail(status, message);
  };

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("school_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (profErr) return rejectWith(500, "계정 정보를 불러오지 못했어요. 잠시 후 다시 시도하세요.");
  if (!profile) {
    return rejectWith(
      403,
      "가입이 끝나지 않은 계정이에요. 회원가입에서 학교를 선택해 가입을 마치거나 관리자에게 문의하세요.",
    );
  }
  return NextResponse.json({ ok: true });
}
