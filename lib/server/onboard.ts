import "server-only";
import type { Profile } from "@/lib/types";
import { ensureSchool } from "./schools";
import { createAdminClient } from "./supabase-admin";

/**
 * 첫 로그인(프로필 없음) 사용자를 NEIS에서 고른 학교에 연결한다.
 * - schools 행이 없으면 NEIS 정보로 만든다 (ensureSchool)
 * - profiles 행을 학생 역할로 만든다 (역할 승격은 admin이 화면 8에서)
 * profiles insert는 RLS로 막혀 있어 service role(서버 전용)로만 한다.
 * SUPABASE_SERVICE_ROLE_KEY가 없으면 MissingServiceRoleError를 던진다.
 */
export async function createProfileForSchool(userId: string, neisCode: string, displayName: string): Promise<Profile> {
  const admin = createAdminClient();
  const school = await ensureSchool(neisCode);
  const { data, error } = await admin
    .from("profiles")
    .insert({ user_id: userId, school_id: school.id, role: "student", display_name: displayName })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
