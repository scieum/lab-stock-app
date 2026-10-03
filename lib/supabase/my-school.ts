import "server-only";
import { createClient } from "./server";

export type MySchool = { id: string; name: string };

/**
 * 세션 여부 + 자기 학교 (publishable 키 + 세션, RLS schools_select_own 이 자기 학교 한 행만 돌려준다).
 * signedIn=false 면 school=null. 로그인됐어도 프로필·학교가 없으면 school=null.
 */
export async function getSessionSchool(): Promise<{ signedIn: boolean; school: MySchool | null }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { signedIn: false, school: null };
  const { data, error } = await supabase.from("schools").select("id, name").maybeSingle();
  return { signedIn: true, school: error || !data ? null : data };
}

/** 로그인 사용자의 자기 학교. 로그인 안 됐거나 프로필이 없으면 null. */
export async function getMySchool(): Promise<MySchool | null> {
  return (await getSessionSchool()).school;
}

/**
 * 로그인 후 공통 셸에 필요한 값 — 자기 학교 + 교사·admin 여부(nav 의 교사·admin 전용 링크 표시용).
 * 프로필을 읽지 못하면 staff=false (학생과 같이 취급 — 전용 링크를 숨긴다).
 */
export async function getShellContext(): Promise<{ school: MySchool; staff: boolean } | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;
  const [school, profile] = await Promise.all([
    supabase.from("schools").select("id, name").maybeSingle(),
    supabase.from("profiles").select("role").eq("user_id", uid).maybeSingle(),
  ]);
  if (school.error || !school.data) return null;
  const role = profile.data?.role;
  return { school: school.data, staff: role === "teacher" || role === "admin" };
}
