// 데스크톱 시약 목록 + 오른쪽 드로어 (d7 §23 run b) 주소 규칙. 순수 함수 — 서버·클라이언트 공용.
//
// - 목록 상태(검색·전체/재고 부족·필터·정렬·쪽)는 주소창 쿼리에 둔다: ?filter · ?q · ?sort · ?class · ?cab · ?slot · ?noslot · ?nomsds · ?page
// - 드로어 상태는 경로에 둔다: /reagents/[id](시약 상세 3) · /msds/[id](MSDS 요약 16) · /usage/new?reagent=[id](사용 기록 4)
// - 드로어를 열고 닫고 옮겨 다녀도 목록 쿼리는 그대로 따라간다 (닫기 = /reagents?{목록 쿼리})
// - 드로어 전용 쿼리(?pick · ?reagent · ?from)는 목록 쿼리에 넣지 않는다
// - 둘러보기 데스크톱(d7 §23 run d)은 같은 규칙을 앞머리 "/demo" 로 쓴다 (base = "/demo" → /demo/reagents · /demo/msds/[id]).
//   둘러보기에는 사용 기록 입력(화면 4)이 없다 (guest-lock).

/** 주소 앞머리: 로그인 = "" · 둘러보기 = "/demo" */
export type DeskBase = "" | "/demo";

/** 목록 상태 쿼리 키 (lib/reagent-list-filter writeListFilter 의 키 + ?filter · ?q · ?page) */
export const REAGENT_LIST_QUERY_KEYS = ["filter", "q", "sort", "class", "cab", "slot", "noslot", "nomsds", "page"] as const;

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

/** 쿼리에서 목록 상태만 골라 새 URLSearchParams 로 */
export function listParams(params: ParamSource): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of REAGENT_LIST_QUERY_KEYS) {
    let v: string | undefined;
    if (params instanceof URLSearchParams) v = params.get(key) ?? undefined;
    else {
      const raw = params[key];
      v = Array.isArray(raw) ? raw[0] : raw;
    }
    if (v !== undefined && v !== "") out.set(key, v);
  }
  return out;
}

/** "?a=b" 또는 "" */
export function listQuery(params: ParamSource): string {
  const qs = listParams(params).toString();
  return qs ? `?${qs}` : "";
}

/** 목록 주소 (드로어 닫기) */
export function reagentListHref(params: ParamSource, base: DeskBase = ""): string {
  return `${base}/reagents${listQuery(params)}`;
}

/** 시약 상세 드로어 주소 (화면 3) */
export function reagentDetailHref(id: string, params: ParamSource, base: DeskBase = ""): string {
  return `${base}/reagents/${encodeURIComponent(id)}${listQuery(params)}`;
}

/** 사용 기록 입력 드로어 주소 (화면 4) — ?reagent 다음에 목록 쿼리 */
export function usageNewHref(id: string, params: ParamSource): string {
  const p = listParams(params);
  const qs = p.toString();
  return `/usage/new?reagent=${encodeURIComponent(id)}${qs ? `&${qs}` : ""}`;
}

/** MSDS 요약 드로어 주소 (화면 16) */
export function msdsDrawerHref(id: string, params: ParamSource, base: DeskBase = ""): string {
  return `${base}/msds/${encodeURIComponent(id)}${listQuery(params)}`;
}

/** 지금 경로에서 드로어에 열린 시약 id (목록 활성 행) — 없으면 null */
export function deskSelectedId(pathname: string, params: URLSearchParams): string | null {
  const m = /^(?:\/demo)?\/(?:reagents|msds)\/([^/?#]+)\/?$/.exec(pathname);
  if (m) return decodeURIComponent(m[1]);
  if (/^\/usage\/new\/?$/.test(pathname)) return params.get("reagent") || null;
  return null;
}
