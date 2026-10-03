import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { NeisSchool, Profile } from "@/lib/types";
import { createAdminClient, isAdminConfigError, toAdminErrorInfo, type AdminErrorInfo } from "./supabase-admin";

/** 이 사용자에게 이미 프로필(학교)이 있다 — 학교를 바꾸지 않는다 */
export class ProfileExistsError extends Error {
  constructor() {
    super("이미 학교에 연결된 계정이에요.");
    this.name = "ProfileExistsError";
  }
}

/** register_profile 호출 실패. configProblem = service role 키 무효·권한 없음 (서버 설정 문제) */
export class RegisterProfileError extends Error {
  readonly info: AdminErrorInfo;
  readonly configProblem: boolean;
  constructor(info: AdminErrorInfo) {
    super("학교 연결에 실패했어요.");
    this.name = "RegisterProfileError";
    this.info = info;
    this.configProblem = isAdminConfigError(info);
  }
}

/**
 * 사용자를 NEIS로 확인한 학교에 연결한다 (d7 §4-1).
 * DB 함수 public.register_profile 이 한 트랜잭션에서
 *   schools upsert(neis_code) → 학교 행 잠금 → 첫 가입자면 admin, 아니면 student → profiles insert
 * 를 한다. 함수 실행 권한은 service_role 뿐이라 서버(lib/server)에서만 부른다.
 * `school` 은 반드시 verifyNeisSchool() 결과(서버가 NEIS로 확정한 값)를 넘긴다.
 * SUPABASE_SERVICE_ROLE_KEY 가 없으면 MissingServiceRoleError, 호출 실패는 RegisterProfileError.
 */
export async function registerProfile(
  userId: string,
  school: NeisSchool,
  displayName: string,
  admin: SupabaseClient<Database> = createAdminClient(),
): Promise<Profile> {
  const { data, error, status } = await admin
    .rpc("register_profile", {
      p_user_id: userId,
      p_neis_code: school.neis_code,
      p_office_code: school.office_code,
      p_school_name: school.name,
      p_sido: school.sido,
      p_region: school.region,
      p_display_name: displayName,
    })
    .single();
  if (error) {
    if (error.code === "23505") throw new ProfileExistsError();
    throw new RegisterProfileError(toAdminErrorInfo(error, status));
  }
  return data as Profile;
}

export type PendingLookup = { ok: true; userId: string | null } | { ok: false; info: AdminErrorInfo };

/**
 * 같은 이메일의 가입 미완료 auth 사용자(이메일 미확인 + 프로필 없음) id. 없으면 null.
 * DB 함수 public.pending_signup_user 는 service_role 만 실행할 수 있어서,
 * 이 호출이 성공하면 service role 키가 실제로 유효하다는 확인도 된다 (signUp 전 점검).
 */
export async function findPendingSignupUser(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<PendingLookup> {
  try {
    const { data, error, status } = await admin.rpc("pending_signup_user", { p_email: email });
    if (error) return { ok: false, info: toAdminErrorInfo(error, status) };
    return { ok: true, userId: typeof data === "string" && data ? data : null };
  } catch (e) {
    return { ok: false, info: toAdminErrorInfo(e) };
  }
}
