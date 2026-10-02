import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { NeisSchool, Profile } from "@/lib/types";
import { createAdminClient } from "./supabase-admin";

/** 이 사용자에게 이미 프로필(학교)이 있다 — 학교를 바꾸지 않는다 */
export class ProfileExistsError extends Error {
  constructor() {
    super("이미 학교에 연결된 계정이에요.");
    this.name = "ProfileExistsError";
  }
}

/**
 * 사용자를 NEIS로 확인한 학교에 연결한다 (d7 §4-1).
 * DB 함수 public.register_profile 이 한 트랜잭션에서
 *   schools upsert(neis_code) → 학교 행 잠금 → 첫 가입자면 admin, 아니면 student → profiles insert
 * 를 한다. 함수 실행 권한은 service_role 뿐이라 서버(lib/server)에서만 부른다.
 * `school` 은 반드시 verifyNeisSchool() 결과(서버가 NEIS로 확정한 값)를 넘긴다.
 * SUPABASE_SERVICE_ROLE_KEY 가 없으면 MissingServiceRoleError.
 */
export async function registerProfile(
  userId: string,
  school: NeisSchool,
  displayName: string,
  admin: SupabaseClient<Database> = createAdminClient(),
): Promise<Profile> {
  const { data, error } = await admin
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
    throw error;
  }
  return data as Profile;
}
