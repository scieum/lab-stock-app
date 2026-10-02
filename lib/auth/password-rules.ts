// 비밀번호 찾기·재설정(d7 §4-3) 입력 규칙 — 브라우저 폼과 서버 라우트가 같은 규칙을 쓴다.
import { PASSWORD_MIN } from "./signup-rules";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 재설정 메일 요청: 이메일 형식만 본다 (존재 여부는 응답에 드러내지 않는다) */
export function resetRequestProblem(email: string): string | null {
  return EMAIL_RE.test(email.trim()) ? null : "가입한 개인 이메일 주소를 정확히 입력하세요.";
}

/** 새 비밀번호 */
export function newPasswordProblem(password: string, passwordConfirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상 입력하세요.`;
  if (password !== passwordConfirm) return "비밀번호 확인이 일치하지 않아요.";
  return null;
}

/** 이메일 존재 여부와 상관없이 항상 같은 안내 */
export const RESET_SENT_MESSAGE =
  "입력한 이메일로 가입된 계정이 있으면 비밀번호 재설정 링크를 보냈어요. 메일함(스팸함 포함)을 확인하세요.";

/** /auth/confirm 이 세션을 만든 뒤 보낼 내부 경로 (허용 목록만) */
export const CONFIRM_NEXT_ALLOWED = ["/", "/reset-password"] as const;

export function safeConfirmNext(next: string | null): string {
  return next && (CONFIRM_NEXT_ALLOWED as readonly string[]).includes(next) ? next : "/";
}
