import type { UserManageInvite, UserManageMember } from "@/components/user-manage";

// 시안 1.17 8-mobile 의 예시 데이터 (갤러리 전용): 멤버 5명 + 초대 대기 2 + 박OO 삭제 확인
export const sampleMembers: UserManageMember[] = [
  { id: "m-1", name: "김OO", role: "admin", isSelf: true, isLastAdmin: true },
  { id: "m-2", name: "이OO", role: "teacher" },
  { id: "m-3", name: "박OO", role: "student" },
  { id: "m-4", name: "최OO", role: "student" },
  { id: "m-5", name: "정OO", role: "student" },
];

export const sampleMemberCounts = { student: 3, teacher: 1, admin: 1 };

export const sampleInvites: UserManageInvite[] = [
  { id: "i-1", email: "lee.teacher@example.com", invitedAt: "10월 6일" },
  { id: "i-2", email: "kim.student@example.com", invitedAt: "10월 5일" },
];
