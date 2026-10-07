// 학교급 (harness/d7-data.md §19, design/rules.json 1.18 neis.school_kinds).
// 서버(NEIS 조회·가입 검증)와 화면 14(school-select-kind)가 이 한곳의 값을 같이 쓴다.
// rules.json neis.default_kind 는 시안 예시 데이터용이라 여기서 쓰지 않는다 — 화면 기본값은 없다.

/** NEIS SCHUL_KND_SC_NM 중 가입할 수 있는 학교급 (순서 = 화면 세그먼트 순서) */
export const SCHOOL_KINDS = ["초등학교", "중학교", "고등학교"] as const;

export type SchoolKind = (typeof SCHOOL_KINDS)[number];

export function isSchoolKind(v: unknown): v is SchoolKind {
  return typeof v === "string" && (SCHOOL_KINDS as readonly string[]).includes(v);
}

/** 학교급을 고르기 전 학교 칸 안내 (rules.json school_kind_select.default) */
export const KIND_FIRST_TEXT = "학교급을 먼저 골라 주세요";

/**
 * 고른 지역·학교급에 학교가 0개일 때 학교 칸 자리 안내 (rules.json school_kind_select.no_school, 상태 14-no-school).
 * 세 학교급 모두 받침 없는 '교'로 끝나 조사는 '가' (시안: "이 지역에 고등학교가 없어요 — …").
 */
export function noSchoolText(kind: SchoolKind): string {
  return `이 지역에 ${kind}가 없어요 — 지역을 다시 골라 주세요`;
}
