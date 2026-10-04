import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { signupProblem, type SignupFields } from "@/lib/auth/signup-rules";
import type { Database } from "@/lib/types/database";
import type { NeisSchool, Role } from "@/lib/types";
import { NeisError } from "./neis";
import { findPendingSignupUser, ProfileExistsError, RegisterProfileError, registerProfile } from "./onboard";
import { verifyNeisSchool } from "./schools";
import {
  adminErrorTag,
  createAdminClient,
  isAdminConfigError,
  MissingServiceRoleError,
  toAdminErrorInfo,
} from "./supabase-admin";

export type SignupResult =
  | { ok: true; needsEmailConfirm: boolean; role: Role }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): SignupResult => ({ ok: false, status, error });

const MSG_MISSING_KEY = "서버 설정이 끝나지 않아 지금은 가입할 수 없어요. 관리자에게 문의하세요.";
const MSG_CONFIG = "서버 설정 문제로 지금은 가입할 수 없어요. 관리자에게 문의하세요.";
const MSG_UNAVAILABLE = "지금은 가입을 처리할 수 없어요. 잠시 후 다시 시도하세요.";
const MSG_LINK_FAILED = "학교 연결에 실패했어요. 잠시 후 다시 시도하세요.";
const MSG_EXISTS = "이미 가입된 이메일이에요. 로그인하세요.";
const MSG_EMAIL_RATE = "확인 메일을 방금 보냈어요. 1분 뒤 다시 시도하거나 메일함을 확인하세요.";
const MSG_RATE = "요청이 많아요. 잠시 후 다시 시도하세요.";

/** 서버 로그 (상태·코드만 남긴다. 키 값·오류 원문·이메일은 남기지 않는다) */
function logSignup(step: string, tag: string): void {
  console.error(`[signup] ${step} 실패 (${tag})`);
}

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
      return fail(409, MSG_EXISTS);
    case "weak_password":
      return fail(400, "비밀번호가 너무 쉬워요. 더 길고 복잡하게 입력하세요.");
    case "email_address_invalid":
      return fail(400, "사용할 수 없는 이메일 주소예요.");
    case "signup_disabled":
    case "email_provider_disabled":
      return fail(403, "지금은 회원가입을 받을 수 없어요. 관리자에게 문의하세요.");
    case "over_email_send_rate_limit":
      return fail(429, MSG_EMAIL_RATE);
    case "over_request_rate_limit":
      return fail(429, MSG_RATE);
  }
  if (status === 429) return fail(429, MSG_RATE);
  return fail(500, "회원가입에 실패했어요. 잠시 후 다시 시도하세요.");
}

/** 방금 만든(또는 가입 미완료) auth 사용자 지우기. 실패는 서버 로그에만 남긴다. */
async function deleteAuthUser(admin: SupabaseClient<Database>, userId: string, step: string): Promise<boolean> {
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (!error) return true;
    logSignup(step, adminErrorTag(toAdminErrorInfo(error)));
  } catch (e) {
    logSignup(step, adminErrorTag(toAdminErrorInfo(e)));
  }
  return false;
}

/**
 * 이미 있는 계정의 재가입 (d7 §8 "내보낸 계정"): 학교에서 내보내져 프로필이 없는 계정이
 * 같은 이메일로 회원가입을 다시 하면 프로필을 새로 만든다.
 * - 반드시 비밀번호 검증(signInWithPassword) 뒤에만, 그 로그인으로 확인된 사용자 id 로만 프로필을 만든다
 *   (남의 이메일로 프로필을 만들 수 없다). 이메일 미확인 계정은 로그인이 거부되어 여기서 끝난다.
 * - 프로필이 이미 있으면(23505) 학교를 바꾸지 않고 "이미 가입된 이메일" 로 끝낸다.
 * - 비밀번호가 틀렸을 때와 프로필이 이미 있을 때의 응답은 같다 (계정 상태를 더 드러내지 않는다).
 * - 기존 계정이므로 실패해도 auth 사용자를 지우지 않는다. 로그아웃은 이 세션만(scope local).
 */
async function rejoinExistingAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: SupabaseClient<Database>,
  email: string,
  password: string,
  school: NeisSchool,
  displayName: string,
): Promise<SignupResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    if (error?.status === 429 || error?.code === "over_request_rate_limit") return fail(429, MSG_RATE);
    return fail(409, MSG_EXISTS);
  }
  const localSignOut = () => supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  try {
    const profile = await registerProfile(data.user.id, school, displayName, admin);
    return { ok: true, needsEmailConfirm: false, role: profile.role as Role };
  } catch (e) {
    await localSignOut();
    if (e instanceof ProfileExistsError) return fail(409, MSG_EXISTS);
    const info = e instanceof RegisterProfileError ? e.info : toAdminErrorInfo(e);
    logSignup("재가입 학교 연결(register_profile)", adminErrorTag(info));
    if (e instanceof MissingServiceRoleError || isAdminConfigError(info)) return fail(503, MSG_CONFIG);
    return fail(500, MSG_LINK_FAILED);
  }
}

/**
 * 회원가입 (d7 §4-1)
 * 1) 입력 검사 → 2) 서버 설정(service role) 확인: 키가 있고 실제로 service role 로 인정되는지
 *    (service_role 전용 DB 함수 pending_signup_user 호출 1회 — 같은 이메일의 가입 미완료 사용자도 함께 찾는다)
 * 3) neisCode를 NEIS로 다시 조회해 학교 확정 → 4) 가입 미완료(미확인 + 프로필 없음) 같은 이메일 사용자 정리
 * 5) Supabase Auth signUp(개인 이메일·비밀번호, 세션 쿠키) → 6) register_profile(학교 upsert + 역할 결정 + 프로필)
 *    역할은 DB 가 정한다: 첫 가입자 admin, 그 학교에 이 이메일의 대기 초대가 있으면 초대 역할, 아니면 student (d7 §8).
 *    5)에서 이미 있는 계정이면 rejoinExistingAccount (비밀번호 검증 후, 프로필이 없을 때만 새 프로필).
 * 클라이언트가 보낸 학교명·역할은 받지 않는다. 6)이 실패하면 방금 만든 auth 사용자를 지운다.
 * 응답에는 정리 여부·계정 존재 여부를 따로 드러내지 않는다.
 */
export async function signUpWithSchool(f: SignupFields, origin: string): Promise<SignupResult> {
  const problem = signupProblem(f);
  if (problem) return fail(400, problem);

  // auth 사용자를 만들기 전에 서버 설정부터 확인 (학교 연결 못 하는 고아 계정 방지)
  let admin: SupabaseClient<Database>;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (e instanceof MissingServiceRoleError) return fail(503, MSG_MISSING_KEY);
    return fail(500, "서버 설정을 확인하지 못했어요. 관리자에게 문의하세요.");
  }

  const email = f.email.trim();
  const pending = await findPendingSignupUser(admin, email);
  if (!pending.ok) {
    logSignup("service role 점검", adminErrorTag(pending.info));
    return fail(503, isAdminConfigError(pending.info) ? MSG_CONFIG : MSG_UNAVAILABLE);
  }

  let school;
  try {
    school = await verifyNeisSchool(f.neisCode);
  } catch (e) {
    if (e instanceof NeisError) return fail(e.status, e.message);
    return fail(502, "학교 정보를 확인하지 못했어요. 잠시 후 다시 시도하세요.");
  }

  // 이전 시도에서 학교 연결에 실패해 남은 가입 미완료 사용자 → 지우고 새로 가입 (재시도가 막히지 않게)
  if (pending.userId) {
    await deleteAuthUser(admin, pending.userId, "가입 미완료 사용자 정리");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: f.password,
    options: {
      data: { display_name: f.displayName },
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });
  if (error) {
    // 이미 있는 계정 → 비밀번호가 맞고 프로필이 없을 때만 재가입 (d7 §8)
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return rejoinExistingAccount(supabase, admin, email, f.password, school, f.displayName);
    }
    return authErrorMessage(error.code, error.status);
  }

  const user = data.user;
  // 이메일 확인이 켜진 프로젝트에서 이미 있는 이메일이면 identities가 빈 가짜 사용자가 온다
  if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) {
    return rejoinExistingAccount(supabase, admin, email, f.password, school, f.displayName);
  }

  try {
    const profile = await registerProfile(user.id, school, f.displayName, admin);
    return { ok: true, needsEmailConfirm: !data.session, role: profile.role as Role };
  } catch (e) {
    if (data.session) await supabase.auth.signOut().catch(() => undefined);
    if (e instanceof ProfileExistsError) {
      return fail(409, "이미 가입된 이메일이에요. 로그인하거나 메일함의 확인 메일을 확인하세요.");
    }
    const info = e instanceof RegisterProfileError ? e.info : toAdminErrorInfo(e);
    logSignup("학교 연결(register_profile)", adminErrorTag(info));
    if (createdJustNow(user.created_at)) {
      await deleteAuthUser(admin, user.id, "방금 만든 사용자 정리");
    }
    if (e instanceof MissingServiceRoleError || isAdminConfigError(info)) return fail(503, MSG_CONFIG);
    return fail(500, MSG_LINK_FAILED);
  }
}
