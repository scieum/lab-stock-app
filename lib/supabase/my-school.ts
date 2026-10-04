import "server-only";
import { getServerSession } from "./server";

export type MySchool = { id: string; name: string };

/**
 * 세션 여부 + 자기 학교 (publishable 키 + 세션, RLS schools_select_own 이 자기 학교 한 행만 돌려준다).
 * signedIn=false 면 school=null. 로그인됐어도 프로필·학교가 없으면 school=null.
 */
export async function getSessionSchool(): Promise<{ signedIn: boolean; school: MySchool | null }> {
  const me = await getServerSession();
  if (me.kind === "signed-out") return { signedIn: false, school: null };
  return { signedIn: true, school: me.kind === "member" ? me.school : null };
}

/** 로그인 사용자의 자기 학교. 로그인 안 됐거나 프로필이 없으면 null. */
export async function getMySchool(): Promise<MySchool | null> {
  return (await getSessionSchool()).school;
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
 * 요청당 한 번만 읽는다 (lib/supabase/server.ts getServerSession, React cache) — layout·page 가 같이 쓴다.
 */
export async function getMembership(): Promise<Membership> {
  const me = await getServerSession();
  if (me.kind === "member") return { kind: "member", school: me.school, role: me.role };
  return { kind: me.kind };
}
