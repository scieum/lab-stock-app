import "server-only";
import { createClient } from "@/lib/supabase/server";
import { signupProblem, type SignupFields } from "@/lib/auth/signup-rules";
import type { Role } from "@/lib/types";
import { NeisError } from "./neis";
import { ProfileExistsError, registerProfile } from "./onboard";
import { verifyNeisSchool } from "./schools";
import { createAdminClient, MissingServiceRoleError } from "./supabase-admin";

export type SignupResult =
  | { ok: true; needsEmailConfirm: boolean; role: Role }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): SignupResult => ({ ok: false, status, error });

/** 이 요청에서 방금 만든 auth 사용자인지 (기존 계정을 지우지 않기 위한 안전장치) */
function createdJustNow(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && Date.now() - t < 10 * 60 * 1000;
}

function authErrorMessage(code: string | undefined, status: number | undefined): SignupResult {
  switch (code) {
    case "user_already_exists":
    case "email_exists":
      return fail(409, "이미 가입된 이메일이에요. 로그인하세요.");
    case "weak_password":
      return fail(400, "비밀번호가 너무 쉬워요. 더 길고 복잡하게 입력하세요.");
    case "email_address_invalid":
      return fail(400, "사용할 수 없는 이메일 주소예요.");
    case "signup_disabled":
    case "email_provider_disabled":
      return fail(403, "지금은 회원가입을 받을 수 없어요. 관리자에게 문의하세요.");
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return fail(429, "요청이 많아요. 잠시 후 다시 시도하세요.");
  }
  if (status === 429) return fail(429, "요청이 많아요. 잠시 후 다시 시도하세요.");
  return fail(500, "회원가입에 실패했어요. 잠시 후 다시 시도하세요.");
}

/**
 * 회원가입 (d7 §4-1)
 * 1) 입력 검사 → 2) 서버 설정(service role) 확인 → 3) neisCode를 NEIS로 다시 조회해 학교 확정
 * 4) Supabase Auth signUp(개인 이메일·비밀번호, 세션 쿠키) → 5) register_profile(학교 upsert + 역할 결정 + 프로필)
 * 클라이언트가 보낸 학교명·역할은 받지 않는다. 5)가 실패하면 방금 만든 auth 사용자를 지운다.
 */
export async function signUpWithSchool(f: SignupFields, origin: string): Promise<SignupResult> {
  const problem = signupProblem(f);
  if (problem) return fail(400, problem);

  // auth 사용자를 만들기 전에 서버 설정부터 확인 (학교 연결 못 하는 고아 계정 방지)
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (e instanceof MissingServiceRoleError) {
      return fail(503, "서버 설정이 끝나지 않아 지금은 가입할 수 없어요. 관리자에게 문의하세요.");
    }
    return fail(500, "서버 설정을 확인하지 못했어요. 관리자에게 문의하세요.");
  }

  let school;
  try {
    school = await verifyNeisSchool(f.neisCode);
  } catch (e) {
    if (e instanceof NeisError) return fail(e.status, e.message);
    return fail(502, "학교 정보를 확인하지 못했어요. 잠시 후 다시 시도하세요.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: f.email,
    password: f.password,
    options: {
      data: { display_name: f.displayName },
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });
  if (error) return authErrorMessage(error.code, error.status);

  const user = data.user;
  // 이메일 확인이 켜진 프로젝트에서 이미 있는 이메일이면 identities가 빈 가짜 사용자가 온다
  if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) {
    return fail(409, "이미 가입된 이메일이에요. 로그인하세요.");
  }

  try {
    const profile = await registerProfile(user.id, school, f.displayName, admin);
    return { ok: true, needsEmailConfirm: !data.session, role: profile.role as Role };
  } catch (e) {
    if (data.session) await supabase.auth.signOut();
    if (e instanceof ProfileExistsError) {
      return fail(409, "이미 가입된 이메일이에요. 로그인하거나 메일함의 확인 메일을 확인하세요.");
    }
    if (createdJustNow(user.created_at)) {
      await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
    }
    return fail(500, "학교 연결에 실패했어요. 잠시 후 다시 시도하세요.");
  }
}
