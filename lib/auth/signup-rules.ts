// 회원가입(화면 14) 입력 규칙 — 브라우저 폼과 서버(/api/auth/signup)가 같은 규칙을 쓴다.
// 서버는 이 검사를 다시 하고, 학교 정보는 neisCode로 NEIS에서 다시 확정한다.

export const PASSWORD_MIN = 8;
export const DISPLAY_NAME_MAX = 40;

export type SignupFields = {
  neisCode: string;
  displayName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  agreeTerms: boolean;
  agreePrivacy: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 첫 번째 문제를 사용자 문구로 돌려준다. 문제가 없으면 null. */
export function signupProblem(f: SignupFields): string | null {
  if (!f.neisCode.trim()) return "시/도·지역·학교를 차례로 선택하세요.";
  const name = f.displayName.trim();
  if (!name) return "이름을 입력하세요.";
  if (name.length > DISPLAY_NAME_MAX) return `이름은 ${DISPLAY_NAME_MAX}자 이하로 입력하세요.`;
  if (!EMAIL_RE.test(f.email.trim())) return "개인 이메일 주소를 정확히 입력하세요.";
  if (f.password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상 입력하세요.`;
  if (f.password !== f.passwordConfirm) return "비밀번호 확인이 일치하지 않아요.";
  if (!f.agreeTerms || !f.agreePrivacy) return "필수 약관에 모두 동의해 주세요.";
  return null;
}

/** 요청 본문(unknown)을 안전하게 SignupFields로 */
export function toSignupFields(body: unknown): SignupFields {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    neisCode: str(b.neisCode).trim(),
    displayName: str(b.displayName).trim(),
    email: str(b.email).trim(),
    password: str(b.password),
    passwordConfirm: str(b.passwordConfirm),
    agreeTerms: b.agreeTerms === true,
    agreePrivacy: b.agreePrivacy === true,
  };
}
