// 권한 없는 주소 (d7 §28 · design/rules.json 1.28 no_access). 순수 함수 — 서버·클라이언트 공용.
// 교사·admin 화면(5·6·7 …)·admin 화면(8·9)에 권한 없이 들어오면 지금처럼 홈으로 보내되 주소에 `?denied=staff|admin` 을 붙인다.
// 홈은 이 값으로 ex-toast 를 한 번 보이고 주소에서 지운다 (새로고침 시 다시 안 뜸 — 화면 쪽 D3).

export const DENIED_PARAM = "denied";

export type DeniedKind = "staff" | "admin";

/** rules no_access.copy 그대로 */
export const NO_ACCESS_TEXT: Record<DeniedKind, string> = {
  staff: "교사·관리자만 쓸 수 있는 화면이에요",
  admin: "관리자만 쓸 수 있는 화면이에요",
};

/** 홈으로 보낼 주소: "/?denied=staff" · "/?denied=admin" */
export function deniedHomePath(kind: DeniedKind): string {
  return `/?${DENIED_PARAM}=${kind}`;
}

/** 주소 값 → 종류 (그 밖의 값은 null — 토스트 없음) */
export function parseDenied(v: string | string[] | null | undefined): DeniedKind | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "staff" || s === "admin" ? s : null;
}
