import type { UserManageInvite, UserManageMember } from "@/components/user-manage";

// 시안 8-mobile 의 예시 데이터 (갤러리 전용)
export const sampleMembers: UserManageMember[] = [
  { id: "m-1", name: "정하은", role: "admin", isSelf: true, isLastAdmin: true },
  { id: "m-2", name: "박서연", role: "teacher" },
  { id: "m-3", name: "최유진", role: "teacher" },
  { id: "m-4", name: "김민지", role: "student" },
];

export const sampleMemberCounts = { student: 28, teacher: 3, admin: 1 };

export const sampleInvites: UserManageInvite[] = [
  { id: "i-1", email: "jiwoo.han@example.com", invitedAt: "2026.09.28" },
  { id: "i-2", email: "minseo.oh@example.com", invitedAt: "2026.09.30" },
];
