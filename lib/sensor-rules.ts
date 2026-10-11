// 무선 센서 규칙 (화면 17, d7 §25 — design/rules.json 1.26 sensor). 순수 함수 — 서버·클라이언트 공용.
// DB(upsert_sensor · archive_sensor · archive_sensors)가 같은 검사를 다시 한다 — 여기는 입력 정리와 화면 안내용.

/** 종류 14종 (rules sensor.types — 화면에는 한국어 이름만) */
export const SENSOR_TYPES = [
  "온도",
  "pH",
  "힘",
  "운동(거리)",
  "전압",
  "전류",
  "조도",
  "압력",
  "CO₂",
  "산소",
  "습도",
  "소리",
  "심박",
  "기타",
] as const;
export type SensorType = (typeof SENSOR_TYPES)[number];

/**
 * 종류 ↔ 지능형 과학실 ON 오픈API 센서타입 코드 (d7 §26: 코드 상수로만 두고 화면에는 쓰지 않는다).
 * 출처: 지능형 과학실 ON 오픈API 정의서 2026-06-16 V1.2 별첨 2 (science-on.kosac.re.kr) 공식 코드 9개
 * TPR 온도 · PRS 압력 · SUD 소리 · SPO 산소포화도 · VTG 전압 · CRT 전류 · ILM 조도 · POH pH · CDT 전기 전도도.
 * SPO(산소포화도) · CDT(전기 전도도)는 아직 해당 종류가 없다. 공식 코드가 없는 종류는 null (임시 코드 금지).
 */
export const SENSOR_TYPE_CODES: Record<SensorType, string | null> = {
  온도: "TPR",
  pH: "POH",
  힘: null,
  "운동(거리)": null,
  전압: "VTG",
  전류: "CRT",
  조도: "ILM",
  압력: "PRS",
  "CO₂": null,
  산소: null,
  습도: null,
  소리: "SUD",
  심박: null,
  기타: null,
};

/** 회사 목록 (rules sensor.makers — 지능형 과학실 ON 센서 제품 브랜드). 맨 끝 "직접 입력"은 화면이 붙인다 */
export const SENSOR_MAKER_GROUPS: { title: string; makers: readonly string[] }[] = [
  {
    title: "센서",
    makers: [
      "버니어",
      "사이언스큐브",
      "이지메이커",
      "고릴라셀",
      "파스코",
      "동원",
      "브로콜리",
      "플로우랩",
      "이티보드",
      "포켓랩",
      "헥사보드",
      "뉴로그",
      "아텍",
      "코드위즈",
    ],
  },
  { title: "현미경", makers: ["오선하이테크", "씨앤에스에듀", "오맥스", "한국과학", "마르시스에듀"] },
];

export const SENSOR_MAKERS: readonly string[] = SENSOR_MAKER_GROUPS.flatMap((g) => g.makers);

/** 상태: DB 값 ↔ 화면 글자 (rules sensor.status — 무채색 배지) */
export const SENSOR_STATUSES = ["ok", "check", "broken"] as const;
export type SensorStatus = (typeof SENSOR_STATUSES)[number];
export const SENSOR_STATUS_LABEL: Record<SensorStatus, string> = { ok: "정상", check: "점검 필요", broken: "고장" };

export function isSensorStatus(v: unknown): v is SensorStatus {
  return typeof v === "string" && (SENSOR_STATUSES as readonly string[]).includes(v);
}

export function isSensorType(v: unknown): v is SensorType {
  return typeof v === "string" && (SENSOR_TYPES as readonly string[]).includes(v);
}

export const SENSOR_NAME_MAX = 40;
export const SENSOR_MAKER_MAX = 30;
export const SENSOR_MODEL_MAX = 40;
export const SENSOR_LOCATION_MAX = 40;
export const SENSOR_MEMO_MAX = 200;
export const SENSOR_QUANTITY_MAX = 9999;

/** 여러 개 삭제 · 전체 선택 상한 (rules bulk_delete.max) */
export const BULK_MAX = 100;

export const SENSOR_TEXT = {
  title: "센서",
  searchPlaceholder: "센서 이름·모델 검색",
  add: "센서 등록",
  addShort: "등록",
  edit: "수정",
  detailTitle: "센서 상세",
  formAdd: "센서 등록",
  formEdit: "센서 수정",
  emptyTitle: "아직 등록한 센서가 없어요",
  emptyBody: "무선 센서와 현미경을 등록해 두면 수량과 상태를 한눈에 봐요",
  filterEmptyTitle: "조건에 맞는 센서가 없어요",
  deleteItem: "센서 삭제",
  deleteBody: "목록과 홈에서 사라져요.",
  deleteNote: "되돌릴 수 없어요.",
  deleteDone: "센서를 삭제했어요",
  saved: "센서를 저장했어요",
  namePlaceholder: "예: 무선 온도 센서",
  memoPlaceholder: "메모 (선택)",
  locationPlaceholder: "예: 과학실 뒤 선반",
  makerDirect: "직접 입력",
  makerPlaceholder: "회사를 골라 주세요",
  makerSearch: "회사 검색",
} as const;

/** 데스크톱 머리 요약 "고장 1 · 점검 필요 1" (둘 다 0 이면 빈 글자) */
export function sensorSummary(items: readonly { status: SensorStatus }[]): string {
  const broken = items.filter((s) => s.status === "broken").length;
  const check = items.filter((s) => s.status === "check").length;
  return `고장 ${broken} · 점검 필요 ${check}`;
}

/** 모바일 카드 캡션 "온도 · 버니어 · GDX-TMP" (모델 없으면 빼고) */
export function sensorCaption(s: { type: string; maker: string; model: string | null }): string {
  return [s.type, s.maker, s.model].filter((v): v is string => Boolean(v && v.trim())).join(" · ");
}

/** "3개" */
export function quantityText(n: number): string {
  return `${n}개`;
}

export type SensorFilter = { types: SensorType[]; makers: string[]; statuses: SensorStatus[] };
export const EMPTY_SENSOR_FILTER: SensorFilter = { types: [], makers: [], statuses: [] };

export type FilterableSensor = { name: string; type: string; maker: string; model: string | null; status: SensorStatus };

/** 검색(이름 · 모델) + 필터(종류 · 회사 · 상태, 같은 묶음 안은 OR · 묶음 사이는 AND) */
export function applySensorFilter<T extends FilterableSensor>(items: readonly T[], query: string, f: SensorFilter): T[] {
  const q = query.trim().toLowerCase();
  return items.filter(
    (s) =>
      (!q || s.name.toLowerCase().includes(q) || (s.model ?? "").toLowerCase().includes(q)) &&
      (f.types.length === 0 || (f.types as string[]).includes(s.type)) &&
      (f.makers.length === 0 || f.makers.includes(s.maker)) &&
      (f.statuses.length === 0 || f.statuses.includes(s.status)),
  );
}

export function sensorFilterCount(f: SensorFilter): number {
  return f.types.length + f.makers.length + f.statuses.length;
}

/** 주소창 ?type=온도,pH&maker=버니어&status=broken → 필터 (잘못된 값은 버린다) */
export function parseSensorFilter(params: URLSearchParams | Record<string, string | string[] | undefined>): SensorFilter {
  const get = (k: string): string => {
    if (params instanceof URLSearchParams) return params.get(k) ?? "";
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const list = (k: string) =>
    get(k)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    types: list("type").filter(isSensorType),
    makers: list("maker").filter((m) => m.length <= SENSOR_MAKER_MAX),
    statuses: list("status").filter(isSensorStatus),
  };
}

export function writeSensorFilter(p: URLSearchParams, f: SensorFilter) {
  const set = (k: string, v: readonly string[]) => (v.length ? p.set(k, v.join(",")) : p.delete(k));
  set("type", f.types);
  set("maker", f.makers);
  set("status", f.statuses);
}

/* ───────── 입력 검사 ───────── */

export type SensorInput = {
  id: string | null;
  name: string;
  type: SensorType;
  maker: string;
  model: string | null;
  quantity: number;
  locationText: string | null;
  slotId: string | null;
  status: SensorStatus;
  memo: string | null;
};

export type SensorField = "name" | "type" | "maker" | "model" | "quantity" | "location" | "status" | "memo";

export type SensorChecked = { ok: true; value: SensorInput } | { ok: false; error: string; field?: SensorField };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/** 수량 글자 "3" → 3 (정수 0~9999, 아니면 null) */
export function parseQuantity(raw: string): number | null {
  const v = raw.trim().replace(/,/g, "");
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= SENSOR_QUANTITY_MAX ? n : null;
}

/** 폼·서버 액션 입력을 맞춘다 (서버가 다시 부른다) */
export function checkSensorInput(input: unknown): SensorChecked {
  const idRaw = field(input, "id");
  const id = idRaw === null || idRaw === undefined || idRaw === "" ? null : idRaw;
  if (id !== null && !isUuid(id)) return { ok: false, error: "센서를 찾을 수 없어요" };
  const name = str(field(input, "name"));
  if (name === "") return { ok: false, error: "이름을 적어 주세요", field: "name" };
  if (name.length > SENSOR_NAME_MAX) return { ok: false, error: `이름은 ${SENSOR_NAME_MAX}자까지 쓸 수 있어요`, field: "name" };
  const type = field(input, "type");
  if (!isSensorType(type)) return { ok: false, error: "종류를 골라 주세요", field: "type" };
  const maker = str(field(input, "maker"));
  if (maker === "") return { ok: false, error: "회사를 골라 주세요", field: "maker" };
  if (maker.length > SENSOR_MAKER_MAX) return { ok: false, error: `회사 이름은 ${SENSOR_MAKER_MAX}자까지 쓸 수 있어요`, field: "maker" };
  const model = str(field(input, "model"));
  if (model.length > SENSOR_MODEL_MAX) return { ok: false, error: `모델명은 ${SENSOR_MODEL_MAX}자까지 쓸 수 있어요`, field: "model" };
  const q = field(input, "quantity");
  const quantity = typeof q === "number" ? q : typeof q === "string" ? parseQuantity(q) : null;
  if (quantity === null || !Number.isInteger(quantity) || quantity < 0 || quantity > SENSOR_QUANTITY_MAX) {
    return { ok: false, error: "수량은 0 이상 정수로 적어 주세요", field: "quantity" };
  }
  const slotRaw = field(input, "slotId");
  const slotId = slotRaw === null || slotRaw === undefined || slotRaw === "" ? null : slotRaw;
  if (slotId !== null && !isUuid(slotId)) return { ok: false, error: "시약장 칸을 다시 골라 주세요", field: "location" };
  const location = slotId ? "" : str(field(input, "locationText"));
  if (location.length > SENSOR_LOCATION_MAX) {
    return { ok: false, error: `보관 위치는 ${SENSOR_LOCATION_MAX}자까지 쓸 수 있어요`, field: "location" };
  }
  const status = field(input, "status");
  if (!isSensorStatus(status)) return { ok: false, error: "상태를 골라 주세요", field: "status" };
  const memo = str(field(input, "memo"));
  if (memo.length > SENSOR_MEMO_MAX) return { ok: false, error: `메모는 ${SENSOR_MEMO_MAX}자까지 쓸 수 있어요`, field: "memo" };
  return {
    ok: true,
    value: {
      id: id as string | null,
      name,
      type,
      maker,
      model: model || null,
      quantity,
      locationText: location || null,
      slotId: slotId as string | null,
      status,
      memo: memo || null,
    },
  };
}

/** 여러 개 삭제 id 목록 (1~100, 중복 제거). 틀리면 null */
export function checkBulkIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every(isUuid)) return null;
  const ids = Array.from(new Set(raw as string[]));
  return ids.length >= 1 && ids.length <= BULK_MAX ? ids : null;
}

/** 확인 모달 이름 줄 "과산화수소, 구리 가루, 글리세린 외 2개" */
export function bulkNamesText(names: readonly string[]): string {
  const head = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${head} 외 ${names.length - 3}개` : head;
}

/** 전체 선택: 지금 결과의 앞 100개까지 */
export function selectAllIds(ids: readonly string[]): { ids: string[]; capped: boolean } {
  return { ids: ids.slice(0, BULK_MAX), capped: ids.length > BULK_MAX };
}

/* ───────── 폼 처음 값 (components/sensor-form) ───────── */

export type SensorFormInitial = {
  id: string | null;
  name: string;
  type: SensorType | "";
  maker: string;
  model: string | null;
  quantity: number | null;
  locationText: string | null;
  slotId: string | null;
  status: SensorStatus;
  memo: string | null;
};

export const EMPTY_SENSOR_FORM: SensorFormInitial = {
  id: null,
  name: "",
  type: "",
  maker: "",
  model: null,
  quantity: 1,
  locationText: null,
  slotId: null,
  status: "ok",
  memo: null,
};

