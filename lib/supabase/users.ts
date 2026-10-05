import "server-only";
import { createClient, getServerClient, getServerSession } from "./server";
import {
  checkInvite,
  countMembers,
  emailsFromDetail,
  isMemberRole,
  isUserId,
  type InviteInput,
  type InviteRole,
  type MemberCounts,
  type MemberRole,
} from "@/lib/users-rules";

const ADMIN_ONLY = "사용자 관리는 admin만 할 수 있어요";
const SIGNED_OUT = "다시 로그인해 주세요";
const MEMBER_NOT_FOUND = "사용자를 찾을 수 없어요";
const LAST_ADMIN = "admin이 최소 1명 있어야 해요";
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

export type ManagedMember = {
  /** profiles.user_id */
  id: string;
  name: string;
  role: MemberRole;
  isSelf: boolean;
  /** 이 학교의 유일한 admin — 역할 변경·삭제 불가 */
  isLastAdmin: boolean;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: InviteRole;
  /** ISO 시각 (invites.invited_at) */
  invitedAt: string;
};

export type UserManage = {
  schoolName: string;
  members: ManagedMember[];
  counts: MemberCounts;
  /** accepted_at 이 null 인 초대 (최근 초대 먼저) */
  invites: PendingInvite[];
};

export type UserManageResult =
  | { kind: "ok"; data: UserManage }
  /** 학생·교사 — 화면 8 은 admin 만 (d7 §8). 멤버·초대를 읽지 않는다 */
  | { kind: "forbidden" }
  /** 로그인은 됐지만 프로필이 없다 (내보낸 계정) */
  | { kind: "no-school" }
  | { kind: "signed-out" };

export type InviteMembersResult =
  | { ok: true; count: number; invites: PendingInvite[] }
  /** emails = 문제가 된 이메일 (형식 오류·이미 멤버·이미 대기 중) */
  | { ok: false; error: string; emails?: string[] };

export type ChangeMemberRoleResult = { ok: true; userId: string; role: MemberRole } | { ok: false; error: string };

export type RemoveMemberResult = { ok: true; userId: string } | { ok: false; error: string };

function toInviteRole(v: string): InviteRole {
  return v === "teacher" ? "teacher" : "student";
}

/**
 * 화면 8 사용자 관리 — 로그인 세션(publishable 키 + 쿠키)으로 읽는다 (service role 미사용).
 * RLS: profiles 는 admin 에게 같은 학교 행만, invites 는 같은 학교 admin 에게만 보인다.
 * 멤버의 이메일은 읽지 않는다 (d7 §8).
 */
export async function getUserManage(): Promise<UserManageResult> {
  // 역할을 먼저 본다 (요청당 1회 읽은 세션, layout 과 공유) — admin 이 아니면 멤버·초대를 읽지 않는다
  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { kind: "signed-out" };
  if (me.kind === "no-school") return { kind: "no-school" };
  if (me.role !== "admin") return { kind: "forbidden" };
  const uid = me.userId;
  const schoolId = me.school.id;

  const supabase = await getServerClient();
  const [members, invites] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name, role, created_at")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: true })
      .order("user_id", { ascending: true }),
    supabase
      .from("invites")
      .select("id, email, role, invited_at")
      .eq("school_id", schoolId)
      .is("accepted_at", null)
      .order("invited_at", { ascending: false })
      .order("email", { ascending: true }),
  ]);
  const rows = members.data ?? [];
  const counts = countMembers(rows.map((m) => m.role));
  return {
    kind: "ok",
    data: {
      schoolName: me.school.name,
      counts,
      members: rows.map((m) => {
        const role: MemberRole = isMemberRole(m.role) ? m.role : "student";
        return {
          id: m.user_id,
          name: m.display_name || "-",
          role,
          isSelf: m.user_id === uid,
          isLastAdmin: role === "admin" && counts.admin <= 1,
        };
      }),
      invites: (invites.data ?? []).map((i) => ({
        id: i.id,
        email: i.email,
        role: toInviteRole(i.role),
        invitedAt: i.invited_at,
      })),
    },
  };
}

/**
 * 초대 — DB 함수 public.invite_members 하나만 호출한다 (학교는 DB 가 호출자 profiles 에서 정한다).
 * 하나라도 문제(형식·이미 멤버·이미 대기)가 있으면 전체가 거부되고, 문제가 된 이메일을 돌려준다.
 */
export async function inviteMembers(input: InviteInput): Promise<InviteMembersResult> {
  const checked = checkInvite(input);
  if (!checked.ok) return checked;
  const { emails, role } = checked.value;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("invite_members", { p_emails: emails, p_role: role });
  if (error) {
    const bad = emailsFromDetail(error.details);
    const list = bad.length > 0 ? `: ${bad.join(", ")}` : "";
    switch (error.code) {
      case "23505":
        if (error.message.includes("already member")) {
          return { ok: false, error: `이미 우리 학교 사용자인 이메일이에요${list}`, emails: bad };
        }
        return { ok: false, error: `이미 초대한 이메일이에요${list}`, emails: bad };
      case "22023":
        if (error.message.includes("invalid email")) {
          return { ok: false, error: `이메일 주소를 확인해 주세요${list}`, emails: bad };
        }
        if (error.message.includes("too many")) {
          return { ok: false, error: "한 번에 초대할 수 있는 인원을 넘었어요" };
        }
        return { ok: false, error: "초대할 이메일과 역할을 확인해 주세요" };
      case "42501":
        return { ok: false, error: ADMIN_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  const rows = data ?? [];
  return {
    ok: true,
    count: rows.length,
    invites: rows.map((i) => ({ id: i.id, email: i.email, role: toInviteRole(i.role), invitedAt: i.invited_at })),
  };
}

/**
 * 역할 변경 — DB 함수 public.change_member_role 하나만 호출한다.
 * admin·같은 학교·마지막 admin 검사는 DB 함수가 한다 (42501 · P0002 · 23514).
 */
export async function changeMemberRole(input: { userId: unknown; role: unknown }): Promise<ChangeMemberRoleResult> {
  if (!isUserId(input.userId)) return { ok: false, error: MEMBER_NOT_FOUND };
  if (!isMemberRole(input.role)) return { ok: false, error: "역할을 선택해 주세요" };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase.rpc("change_member_role", { p_user_id: input.userId, p_role: input.role });
  if (error) {
    switch (error.code) {
      case "23514":
        return { ok: false, error: LAST_ADMIN };
      case "P0002":
        return { ok: false, error: MEMBER_NOT_FOUND };
      case "22023":
        return { ok: false, error: "역할을 선택해 주세요" };
      case "42501":
        return { ok: false, error: ADMIN_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  return { ok: true, userId: input.userId, role: input.role };
}

/**
 * 사용자 삭제(= 학교에서 내보내기) — DB 함수 public.remove_member 하나만 호출한다.
 * profiles 행만 지워진다 (로그인 계정·사용/입고 기록은 남는다). 본인·마지막 admin 은 DB 함수가 거부한다.
 */
export async function removeMember(input: { userId: unknown }): Promise<RemoveMemberResult> {
  if (!isUserId(input.userId)) return { ok: false, error: MEMBER_NOT_FOUND };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { ok: false, error: SIGNED_OUT };
  if (input.userId === uid) return { ok: false, error: "본인은 삭제할 수 없어요" };

  const { error } = await supabase.rpc("remove_member", { p_user_id: input.userId });
  if (error) {
    switch (error.code) {
      case "22023":
        return { ok: false, error: "본인은 삭제할 수 없어요" };
      case "23514":
        return { ok: false, error: LAST_ADMIN };
      case "P0002":
        return { ok: false, error: MEMBER_NOT_FOUND };
      case "42501":
        return { ok: false, error: ADMIN_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  return { ok: true, userId: input.userId };
}
