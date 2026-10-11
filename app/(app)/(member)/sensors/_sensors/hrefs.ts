// 화면 17 센서 주소 규칙 (데스크톱 목록 + 오른쪽 드로어, 모바일 전용 화면). 순수 함수.
// - 목록 상태(검색 · 필터 · 쪽)는 주소창 쿼리: ?q · ?type · ?maker · ?status · ?page
// - 드로어 · 화면 상태는 경로: /sensors/[id](상세) · /sensors/new(등록) · /sensors/[id]/edit(수정)
// - 드로어를 열고 닫아도 목록 쿼리는 따라간다. 둘러보기는 앞머리 /demo (등록 · 수정 없음)

export type SensorBase = "" | "/demo";

export const SENSOR_LIST_QUERY_KEYS = ["q", "type", "maker", "status", "page"] as const;

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

export function sensorListParams(params: ParamSource): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of SENSOR_LIST_QUERY_KEYS) {
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

function qs(params: ParamSource): string {
  const s = sensorListParams(params).toString();
  return s ? `?${s}` : "";
}

export function sensorListHref(params: ParamSource, base: SensorBase = ""): string {
  return `${base}/sensors${qs(params)}`;
}

export function sensorDetailHref(id: string, params: ParamSource, base: SensorBase = ""): string {
  return `${base}/sensors/${encodeURIComponent(id)}${qs(params)}`;
}

export function sensorNewHref(params: ParamSource): string {
  return `/sensors/new${qs(params)}`;
}

export function sensorEditHref(id: string, params: ParamSource): string {
  return `/sensors/${encodeURIComponent(id)}/edit${qs(params)}`;
}

/** 지금 경로에서 드로어에 열린 센서 id (목록 활성 행) */
export function sensorSelectedId(pathname: string): string | null {
  const m = /^(?:\/demo)?\/sensors\/([^/?#]+)(?:\/edit)?\/?$/.exec(pathname);
  if (!m || m[1] === "new") return null;
  return decodeURIComponent(m[1]);
}
