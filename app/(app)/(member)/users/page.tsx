import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatDateTimeDashes, formatDateTimeDots } from "@/lib/format";
import { getUserManage } from "@/lib/supabase/users";
import { UsersScreen } from "./users-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "사용자 관리 · Lab_Stock" };

/**
 * 화면 8 사용자 관리 (admin 만 — dev-rules route_auth 8).
 * 비로그인 → /login, 학생·교사 → / (멤버·초대를 읽지도, 화면을 그리지도 않는다 — getUserManage 가 역할을 먼저 본다).
 * 프로필이 없는 세션(내보낸 계정)도 / 로 — 거기서 "소속 학교가 없어요" 안내를 본다.
 * 학교·역할은 주소나 입력에서 받지 않는다 — 로그인 세션(RLS)이 자기 학교 행만 돌려준다.
 * 초대일은 여기(서버)에서 한국 시간으로 글자를 만들어 넘긴다 (브라우저 시간대와 무관).
 */
export default async function UsersPage() {
  const result = await getUserManage();
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind !== "ok") redirect("/");

  const { schoolName, members, counts, invites } = result.data;
  return (
    <UsersScreen
      schoolName={schoolName}
      members={members.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        isSelf: m.isSelf,
        isLastAdmin: m.isLastAdmin,
        // "2026-03-02 09:10" → "2026-03-02" (한국 시간)
        joinedOn: m.joinedAt ? formatDateTimeDashes(new Date(m.joinedAt)).slice(0, 10) : null,
      }))}
      counts={{ student: counts.student, teacher: counts.teacher, admin: counts.admin }}
      invites={invites.map((v) => ({
        id: v.id,
        email: v.email,
        role: v.role,
        // "2026.09.28 14:20" → "2026.09.28"
        invitedAt: formatDateTimeDots(new Date(v.invitedAt)).slice(0, 10),
      }))}
    />
  );
}
