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

export type Membership =
  /** 세션 없음 → /login (또는 랜딩) */
  | { kind: "signed-out" }
  /** 로그인은 됐지만 프로필이 없다 — 학교에서 내보낸 계정 (d7 §8). "소속 학교가 없어요" 안내 + 로그아웃만 */
  | { kind: "no-school" }
  /** 프로필·학교를 읽지 못했다 (일시 오류) — 내보낸 계정으로 단정하지 않는다 */
  | { kind: "unavailable" }
  | { kind: "member"; school: MySchool; role: "student" | "teacher" | "admin" };

/**
 * 세션의 소속 판별 (publishable 키 + 세션, RLS: profiles 자기 행·schools 자기 학교만).
 * 프로필 조회가 오류 없이 0행일 때만 "no-school" 이다.
 */
export async function getMembership(): Promise<Membership> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { kind: "signed-out" };
  const profile = await supabase.from("profiles").select("role, school_id").eq("user_id", uid).maybeSingle();
  if (profile.error) return { kind: "unavailable" };
  const me = profile.data;
  if (!me) return { kind: "no-school" };
  const school = await supabase.from("schools").select("id, name").eq("id", me.school_id).maybeSingle();
  if (school.error || !school.data) return { kind: "unavailable" };
  const role = (["student", "teacher", "admin"] as const).find((r) => r === me.role) ?? "student";
  return { kind: "member", school: school.data, role };
}
