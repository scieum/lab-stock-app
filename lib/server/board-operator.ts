import "server-only";
import { getServerClient } from "@/lib/supabase/server";

/**
 * 게시판 운영자 (d7 §30) — 서버 환경변수 BOARD_OPERATOR_EMAIL 과 로그인 이메일이 같으면 운영자.
 * 화면·DB 로 지정할 수 없다. 값이 비어 있으면 운영자 없음(운영자 기능 전부 403).
 * 이 파일(lib/server)에서만 환경변수를 읽는다 — NEXT_PUBLIC 아님, 값은 로그·응답에 쓰지 않는다.
 */
function normalizeEmail(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/** 설정된 운영자 이메일 (정리한 값, 없으면 빈 문자열) */
function operatorEmail(): string {
  return normalizeEmail(process.env.BOARD_OPERATOR_EMAIL);
}

/** 이 이메일이 운영자인가 (대소문자·앞뒤 공백 무시, 설정이 비었거나 이메일이 비면 false) */
export function isBoardOperatorEmail(email: string | null | undefined, configured: string | null | undefined = process.env.BOARD_OPERATOR_EMAIL): boolean {
  const want = normalizeEmail(configured);
  const got = normalizeEmail(email);
  return want !== "" && got !== "" && want === got;
}

export type BoardOperator = { kind: "operator"; userId: string } | { kind: "signed-out" } | { kind: "not-operator" };

/**
 * 지금 요청의 로그인 사용자가 운영자인가. JWT 를 검증(getClaims)한 뒤 그 이메일로 판단한다.
 * 운영자도 학교 프로필이 꼭 필요하지는 않다(운영자는 학교를 넘는 역할).
 */
export async function getBoardOperator(): Promise<BoardOperator> {
  const supabase = await getServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (!userId) return { kind: "signed-out" };
  if (!operatorEmail()) return { kind: "not-operator" };
  const email = typeof claims?.email === "string" ? claims.email : null;
  return isBoardOperatorEmail(email) ? { kind: "operator", userId } : { kind: "not-operator" };
}

/** 화면에서 운영자 요소를 보일지 (D3 용) */
export async function isBoardOperator(): Promise<boolean> {
  return (await getBoardOperator()).kind === "operator";
}
