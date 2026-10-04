// 화면 8 사용자 관리 입력 규칙 (harness/d7-data.md §8).
// DB 함수 invite_members·change_member_role·remove_member 가 같은 검사를 다시 한다 — 여기는 사용자에게 보일 안내를 만드는 용도.

/** 멤버 역할 (profiles.role) */
export const MEMBER_ROLES = ["student", "teacher", "admin"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** 초대할 수 있는 역할 — admin 초대는 없다 */
export const INVITE_ROLES = ["student", "teacher"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

/** 한 번에 초대할 수 있는 이메일 수 (DB 함수와 같은 값) */
export const INVITE_MAX = 50;
export const EMAIL_MAX = 254;

/** 내보낸(프로필이 없는) 사용자의 기록에 붙는 이름 (d7 §8) */
export const REMOVED_USER_NAME = "삭제된 사용자";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; emails?: string[] };

export function isMemberRole(v: unknown): v is MemberRole {
  return typeof v === "string" && (MEMBER_ROLES as readonly string[]).includes(v);
}

export function isInviteRole(v: unknown): v is InviteRole {
  return typeof v === "string" && (INVITE_ROLES as readonly string[]).includes(v);
}

export function isUserId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** trim + 소문자 */
export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

export function isValidEmail(v: string): boolean {
  return v.length <= EMAIL_MAX && EMAIL_RE.test(v);
}

/**
 * 입력(문자열 하나 또는 배열)을 이메일 목록으로 — 쉼표·세미콜론·공백·줄바꿈으로 나누고,
 * trim·소문자, 빈 값 제거, 중복 제거(처음 나온 순서 유지).
 */
export function normalizeEmails(input: unknown): string[] {
  const parts: string[] = [];
  const push = (s: unknown) => {
    if (typeof s === "string") parts.push(...s.split(/[\s,;]+/));
  };
  if (Array.isArray(input)) input.forEach(push);
  else push(input);
  const seen = new Set<string>();
  for (const p of parts) {
    const e = normalizeEmail(p);
    if (e) seen.add(e);
  }
  return [...seen];
}

export type InviteInput = { emails: unknown; role: unknown };

export function checkInvite(input: InviteInput): Checked<{ emails: string[]; role: InviteRole }> {
  if (!isInviteRole(input.role)) return { ok: false, error: "초대할 역할(학생·교사)을 선택해 주세요" };
  const emails = normalizeEmails(input.emails);
  if (emails.length === 0) return { ok: false, error: "초대할 이메일을 입력해 주세요" };
  if (emails.length > INVITE_MAX) {
    return { ok: false, error: `한 번에 ${INVITE_MAX}명까지 초대할 수 있어요` };
  }
  const bad = emails.filter((e) => !isValidEmail(e));
  if (bad.length > 0) return { ok: false, error: `이메일 주소를 확인해 주세요: ${bad.join(", ")}`, emails: bad };
  return { ok: true, value: { emails, role: input.role } };
}

/** DB 함수 오류의 detail("a@x.com,b@y.com") → 이메일 배열 */
export function emailsFromDetail(detail: unknown): string[] {
  if (typeof detail !== "string") return [];
  return detail
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

/**
 * 기록(사용·입고)의 사용자 이름 표시: 프로필이 없으면(null — 내보낸 사용자) "삭제된 사용자",
 * 프로필은 있는데 이름이 비었으면 "-".
 */
export function recordUserName(name: string | null | undefined): string {
  if (name === null || name === undefined) return REMOVED_USER_NAME;
  return name.trim() === "" ? "-" : name;
}

/** 멤버 수 요약 ("학생 a · 교사 b · admin c") 에 쓰는 값 */
export type MemberCounts = { total: number; student: number; teacher: number; admin: number };

export function countMembers(roles: readonly string[]): MemberCounts {
  const c: MemberCounts = { total: roles.length, student: 0, teacher: 0, admin: 0 };
  for (const r of roles) if (isMemberRole(r)) c[r] += 1;
  return c;
}
