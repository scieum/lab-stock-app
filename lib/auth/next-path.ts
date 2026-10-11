// 로그인 뒤 돌아갈 주소(next) 검사 — 열린 리다이렉트 금지 (d7 §26 화면 12: 비로그인 /scan?cabinet=… → /login → 같은 주소).
// 같은 origin 의 앱 경로만 허용한다. 순수 함수 (proxy · 로그인 화면 공용).

const BASE = "http://next.invalid";
/** 돌아가면 안 되는 경로 — 로그인·가입 화면(되돌이), API·인증 콜백 */
const BLOCKED_ROOTS = ["/login", "/signup", "/api", "/auth"];
const MAX_LEN = 512;

/**
 * next 값 → 같은 origin 의 상대 주소("/scan?cabinet=…"), 아니면 null.
 * - "/" 로 시작, "//"·"/\\" 금지(다른 호스트), 제어 문자·역슬래시 금지, 512자 이하
 * - 해석한 주소의 origin 이 바뀌지 않아야 한다
 * - /login·/signup·/api·/auth 아래는 null
 */
export function safeNextPath(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string" || v.length === 0 || v.length > MAX_LEN) return null;
  if (!v.startsWith("/") || v.startsWith("//")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return null;
  let u: URL;
  try {
    u = new URL(v, BASE);
  } catch {
    return null;
  }
  if (u.origin !== BASE) return null;
  const path = u.pathname;
  if (BLOCKED_ROOTS.some((p) => path === p || path.startsWith(p + "/"))) return null;
  return `${path}${u.search}${u.hash}`;
}

/** 로그인 뒤 갈 곳 — 안전한 next, 없으면 "/" */
export function nextOrHome(raw: unknown): string {
  return safeNextPath(raw) ?? "/";
}
