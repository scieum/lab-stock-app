"use server";

import { revalidatePath } from "next/cache";
import { changeMemberRole, inviteMembers, removeMember } from "@/lib/supabase/users";

export type InviteActionResult = { ok: true; count: number } | { ok: false; error: string };
export type MemberActionResult = { ok: true } | { ok: false; error: string };

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/**
 * 초대. 클라이언트 값은 믿지 않는다 — emails·role 만 꺼내 lib/users-rules(checkInvite)로 다시 검증하고,
 * 학교·호출자 역할은 로그인 세션으로 DB 함수 invite_members 가 정한다 (school_id·role 을 입력으로 받지 않는다).
 * 초대는 화면 8 의 "초대 대기" 목록만 바꾼다.
 */
export async function inviteMembersAction(input: unknown): Promise<InviteActionResult> {
  const result = await inviteMembers({ emails: field(input, "emails"), role: field(input, "role") });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/users");
  return { ok: true, count: result.count };
}

/**
 * 역할 변경. userId·role 을 lib/users-rules(isUserId·isMemberRole)로 다시 검증하고,
 * admin·같은 학교·마지막 admin 검사는 DB 함수 change_member_role 이 한다.
 * 목록·인원 수는 화면 8 에만 있다 (본인 역할을 바꾼 경우는 화면이 / 로 옮겨 가며 셸을 새로 받는다).
 */
export async function changeMemberRoleAction(input: unknown): Promise<MemberActionResult> {
  const result = await changeMemberRole({ userId: field(input, "userId"), role: field(input, "role") });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/users");
  return { ok: true };
}

/**
 * 사용자 삭제(= 학교에서 내보내기). 본인·마지막 admin·다른 학교는 DB 함수 remove_member 가 거부한다.
 * 내보낸 사람의 이름은 홈·사용 기록 내역·시약 상세의 기록에서도 "삭제된 사용자" 로 바뀌므로 전체를 다시 받게 한다.
 */
export async function removeMemberAction(input: unknown): Promise<MemberActionResult> {
  const result = await removeMember({ userId: field(input, "userId") });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/", "layout");
  return { ok: true };
}
