import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createProfileForSchool } from "@/lib/server/onboard";
import { MissingServiceRoleError } from "@/lib/server/supabase-admin";
import { NeisError } from "@/lib/server/neis";

export const dynamic = "force-dynamic";

type Body = { email?: unknown; password?: unknown; neisCode?: unknown };

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * POST /api/auth/login — 화면 1 로그인 (Supabase Auth, publishable 키 + 세션 쿠키)
 * - 프로필이 있는 계정: 학교를 골랐다면 프로필 학교와 같아야 한다
 * - 프로필이 없는 계정(첫 로그인): 고른 학교로 schools·profiles 생성 (lib/server, service role)
 * 실패하면 세션을 지운다.
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
  const neisCode = typeof body.neisCode === "string" && body.neisCode.trim() ? body.neisCode.trim() : null;
  if (!email || !password) return fail(400, "아이디와 비밀번호를 입력하세요.");

  const supabase = await createClient();
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr || !auth.user) return fail(401, "아이디 또는 비밀번호가 올바르지 않아요.");
  const userId = auth.user.id;

  const rejectWith = async (status: number, message: string) => {
    await supabase.auth.signOut();
    return fail(status, message);
  };

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("school_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profErr) return rejectWith(500, "계정 정보를 불러오지 못했어요. 잠시 후 다시 시도하세요.");

  if (profile) {
    if (neisCode) {
      const { data: school } = await supabase
        .from("schools")
        .select("neis_code")
        .eq("id", profile.school_id)
        .maybeSingle();
      if (school?.neis_code !== neisCode) {
        return rejectWith(403, "선택한 학교에 등록된 계정이 아니에요. 학교를 다시 확인하세요.");
      }
    }
    return NextResponse.json({ ok: true });
  }

  // 첫 로그인: 학교 연결
  if (!neisCode) return rejectWith(400, "처음 로그인하는 계정이에요. 시/도·지역·학교를 먼저 선택하세요.");
  try {
    const displayName = email.split("@")[0] ?? "";
    await createProfileForSchool(userId, neisCode, displayName);
  } catch (e) {
    if (e instanceof MissingServiceRoleError) {
      return rejectWith(503, "서버에 학교 등록용 키(service role)가 설정되지 않아 처음 로그인하는 계정을 학교에 연결할 수 없어요. 관리자에게 문의하세요.");
    }
    if (e instanceof NeisError) return rejectWith(e.status, e.message);
    return rejectWith(500, "학교 연결에 실패했어요. 잠시 후 다시 시도하세요.");
  }
  return NextResponse.json({ ok: true });
}
