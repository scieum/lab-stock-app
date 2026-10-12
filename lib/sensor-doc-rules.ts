// 센서 서류로 등록 (design/rules.json 1.28 sensor.doc, d7 §28) — 확인 표 문구·연결 규칙. 순수 함수 — 서버·클라이언트 공용.
// - 추출 응답 정리(normalizeSensorDocExtraction): 서버(POST /api/sensors/extract)와 화면이 같은 함수로 모양을 맞춘다.
//   파스코 계열 회사 → "파스코", 카탈로그 모델이면 종류·한국어 이름 = 카탈로그, 영문만 남은 이름은 종류로 한국어 이름(§27).
// - 저장 항목(checkSensorDocInput): DB 함수 record_sensor_document(p_items) 의 항목. DB 가 같은 검사를 다시 한다.
// 상대 import 만 쓴다 (vitest 는 @/ 별칭이 없다).

import { isIsoDate } from "./intake-rules";
import { PASCO_MAKER, findPascoModel, isPascoMaker } from "./pasco-catalog";
import { hasHangul, isLatinOnlyName } from "./reagent-name-ko";
import {
  SENSOR_MAKER_MAX,
  SENSOR_MODEL_MAX,
  SENSOR_NAME_MAX,
  SENSOR_QUANTITY_MAX,
  checkSensorInput,
  isUuid,
  normalizeSensorType,
  type SensorInput,
  type SensorStatus,
  type SensorType,
} from "./sensor-rules";

export const SENSOR_DOC_TEXT = {
  entry: "서류로 등록",
  entryCaption: "품의서·영수증을 AI가 읽어요",
  direct: "직접 입력",
  review: "읽은 내용이 맞는지 확인해 주세요",
  addExisting: "기존 센서에 더하기",
  newSensor: "새 센서로 등록",
  change: "바꾸기",
  exclude: "빼기",
  include: "다시 넣기",
  excluded: "등록하지 않아요",
  pickTitle: "우리 학교 센서 고르기",
  catalogBadge: "카탈로그",
  modelPlaceholder: "모델명 (선택)",
  uploadHeading: "품의서·영수증을 올려 주세요",
  uploadAgainHeading: "다른 서류 올리기",
  uploadCaption: "PDF·JPG·PNG 1개, 4MB까지 · 서버에 보관하지 않아요",
  readingTitle: "서류를 읽는 중이에요",
  readingBody: "센서 이름·회사·모델·수량을 찾고 있어요",
  emptyTitle: "센서를 찾지 못했어요",
  emptyBody: "다른 서류를 올리거나 직접 입력해 주세요",
  failTitle: "서류를 읽지 못했어요",
  notSensorAction: "센서로 넣기",
  noRows: "표에 올린 센서가 없어요. 아래 묶음에서 센서로 넣을 수 있어요",
  nothingToSave: "등록할 센서가 없어요",
  fixRows: "표시한 줄을 고친 뒤 등록해 주세요",
  slotMissing: "시약장 칸을 골라 주세요",
} as const;

/** 표 머리 "읽은 센서 3개" */
export function sensorDocTitle(count: number): string {
  return `읽은 센서 ${count}개`;
}

/** 표 아래 접힌 묶음 "센서 아님 1개" */
export function notSensorText(count: number): string {
  return `센서 아님 ${count}개`;
}

/** 저장 버튼 "확인 후 등록 · 3개" */
export function sensorDocSaveText(count: number): string {
  return `확인 후 등록 · ${count}개`;
}

/** 저장 뒤 토스트 "센서 3개를 등록했어요" */
export function sensorDocDoneText(count: number): string {
  return `센서 ${count}개를 등록했어요`;
}

/** 연결 줄 "기존 센서에 더하기 · 무선 온도 센서 · 지금 3개 → 5개" */
export function sensorLinkSummary(name: string, current: number, add: number): string {
  return `${SENSOR_DOC_TEXT.addExisting} · ${name} · 지금 ${current}개 → ${current + add}개`;
}

/** 연결: 기존 센서에 더하기 · 새 센서 · 빼기 */
export type SensorDocLink = { kind: "sensor"; sensorId: string } | { kind: "new" } | { kind: "none" };

export type SchoolSensor = { id: string; name: string; maker: string; model: string | null; quantity: number };

function sameKey(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s/g, "");
}

/** 같은 회사 + 같은 모델(대소문자·공백 무시) 우리 학교 센서. 모델이 비었으면 맞추지 않는다 (d7 §28 센서 확인 표) */
export function matchSchoolSensor<T extends SchoolSensor>(item: { maker: string | null; model: string | null }, sensors: readonly T[]): T | null {
  const maker = sameKey(item.maker);
  const model = sameKey(item.model);
  if (!maker || !model) return null;
  return sensors.find((s) => sameKey(s.maker) === maker && sameKey(s.model) === model) ?? null;
}

/** 새 센서 칸 값 (new-sensor-fields) */
export type NewSensorDraft = {
  name: string;
  type: SensorType | "";
  maker: string;
  model: string;
  quantity: string;
  locationMode: "text" | "slot";
  locationText: string;
  slotId: string | null;
  status: SensorStatus;
  /** 카탈로그로 채운 칸 (옆에 caption "카탈로그") */
  catalogFilled?: readonly ("name" | "type")[];
};

/* ───────── 추출 응답 정리 (d7 §28 센서 추출 API) ───────── */

/** 서류 한 장에서 읽는 품목 최대 수 */
export const SENSOR_DOC_ITEMS_MAX = 50;
/** 원문 표기 길이 한도 */
export const SENSOR_DOC_ORIGINAL_MAX = 80;

/** AI 가 읽은 품목 하나 (서버가 정리한 값) */
export type SensorDocItem = {
  /** 한국어 이름 (카탈로그 모델이면 카탈로그 한국어 이름) */
  name: string;
  /** 서류 표기 (서류가 한국어이거나 name 과 같으면 null) */
  originalName: string | null;
  /** 회사 (파스코 계열 = "파스코"). 없으면 null */
  maker: string | null;
  /** 모델 (카탈로그 모델이면 카탈로그 표기 "PS-3215"). 없으면 null */
  model: string | null;
  /** 정수 1~9999 (없으면 1) */
  quantity: number;
  /** 센서·과학 장비면 true (배송비 · 케이블 같은 소모품은 false) */
  isSensor: boolean;
  /** 27종 중 하나 또는 null */
  type: SensorType | null;
  /** 파스코 카탈로그에서 종류·이름을 채웠는가 */
  catalog: boolean;
};

export type SensorDocExtraction = { docDate: string | null; items: SensorDocItem[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

/** 영문 회사 표기 → 앱 회사 이름 (rules sensor.makers). 키 = 소문자·영숫자만 남긴 앞부분 */
const MAKER_ALIASES: readonly (readonly [string, string])[] = [["vernier", "버니어"]];

/** 회사 정리: 파스코 계열(PASCO · Pasco Scientific · 파스코) → "파스코", 버니어 영문 → "버니어", 그 밖은 그대로 (빈 값 null) */
export function normalizeSensorMaker(v: unknown): string | null {
  const t = cleanText(v, SENSOR_MAKER_MAX);
  if (t === "") return null;
  if (isPascoMaker(t)) return PASCO_MAKER;
  const key = t.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [prefix, maker] of MAKER_ALIASES) if (key.startsWith(prefix)) return maker;
  return t;
}

/** 수량: 양의 정수(숫자 글자 "3" 도), 소수는 내림, 9999 상한. 그 밖은 1 */
function cleanQuantity(v: unknown): number {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim().replace(/,/g, "")) : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(SENSOR_QUANTITY_MAX, Math.floor(n));
}

const NO_GENERIC_NAME: readonly SensorType[] = ["기타", "인터페이스", "코딩 보드"];

/**
 * 영문만 남은 이름의 한국어 이름 (d7 §27 을 센서에): 종류가 있으면 "{무선 }{종류} 센서" (Wireless … → 무선).
 * 종류가 없거나 기타·인터페이스·코딩 보드면 null (영문 그대로 두고 사용자가 고친다).
 */
export function koreanSensorName(name: string, type: SensorType | null): string | null {
  if (!type || NO_GENERIC_NAME.includes(type)) return null;
  const wireless = /\bwireless\b/i.test(name);
  return `${wireless ? "무선 " : ""}${type} 센서`.slice(0, SENSOR_NAME_MAX);
}

function sameText(a: string, b: string): boolean {
  return a.toLowerCase().replace(/\s/g, "") === b.toLowerCase().replace(/\s/g, "");
}

/**
 * AI 가 준 품목 하나 → SensorDocItem (이름이 비면 null — 버린다).
 * - 회사: normalizeSensorMaker. 모델: 공백 정리 40자.
 * - 모델이 파스코 카탈로그에 있고 회사가 파스코이거나 비었으면: 회사 "파스코" · 모델 = 카탈로그 표기 · 종류 · 이름 = 카탈로그, isSensor = true.
 * - 아니면 종류 = 27종(예전 "심박" → "심박·생체") 또는 null, 영문만인 이름은 koreanSensorName 으로.
 * - originalName: 비었거나 한글이 있거나 name 과 같으면 null. 이름을 바꿨는데 원문이 없으면 AI 의 원래 영문 name 을 원문으로.
 */
export function normalizeSensorDocItem(raw: unknown): SensorDocItem | null {
  if (!isRecord(raw)) return null;
  const rawName = cleanText(raw.name, SENSOR_DOC_ORIGINAL_MAX);
  if (rawName === "") return null;
  let original = cleanText(raw.originalName, SENSOR_DOC_ORIGINAL_MAX);
  let maker = normalizeSensorMaker(raw.maker);
  let model: string | null = cleanText(raw.model, SENSOR_MODEL_MAX) || null;
  let type = normalizeSensorType(raw.type);
  let isSensor = raw.isSensor !== false;
  let name = rawName;
  let catalog = false;

  const hit = findPascoModel(model);
  if (hit && (maker === null || maker === PASCO_MAKER)) {
    maker = PASCO_MAKER;
    model = hit.model;
    type = hit.type;
    name = hit.nameKo;
    isSensor = true;
    catalog = true;
  } else if (isLatinOnlyName(rawName)) {
    const ko = koreanSensorName(rawName, type);
    if (ko) name = ko;
  }
  if (name !== rawName && original === "" && !hasHangul(rawName)) original = rawName;
  name = name.slice(0, SENSOR_NAME_MAX);
  const originalName = original === "" || hasHangul(original) || sameText(original, name) ? null : original;
  return { name, originalName, maker, model, quantity: cleanQuantity(raw.quantity), isSensor, type, catalog };
}

/**
 * 추출 응답 본문(JSON 으로 읽은 값) → SensorDocExtraction. { items: [...] } 모양이 아니면 null.
 * 이름이 빈 품목은 버리고 최대 50개. docDate 는 실제 날짜인 YYYY-MM-DD 만.
 */
export function normalizeSensorDocExtraction(raw: unknown): SensorDocExtraction | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;
  const items: SensorDocItem[] = [];
  for (const it of raw.items) {
    if (items.length >= SENSOR_DOC_ITEMS_MAX) break;
    const item = normalizeSensorDocItem(it);
    if (item) items.push(item);
  }
  const date = typeof raw.docDate === "string" ? raw.docDate.trim() : "";
  return { docDate: isIsoDate(date) ? date : null, items };
}

/* ───────── 저장 (record_sensor_document) ───────── */

/** 저장 항목: 기존 센서에 더하기 / 새 센서 (화면 → 서버 액션) */
export type SensorDocSaveItem =
  | { kind: "add"; sensorId: string; addQuantity: number }
  | { kind: "new"; sensor: Omit<SensorInput, "id"> };

/** DB 함수 record_sensor_document 의 p_items 한 항목 */
export type SensorDocDbItem =
  | { sensor_id: string; add_quantity: number }
  | {
      name: string;
      type: SensorType;
      maker: string;
      model: string | null;
      quantity: number;
      location_text: string | null;
      slot_id: string | null;
      status: SensorStatus;
      memo: string | null;
    };

export type SensorDocInputChecked = { ok: true; items: SensorDocDbItem[] } | { ok: false; error: string; index?: number };

export const SENSOR_DOC_ERRORS = {
  count: `한 번에 1개에서 ${SENSOR_DOC_ITEMS_MAX}개까지 등록할 수 있어요`,
  addQuantity: "더할 수량은 1 이상 정수로 적어 주세요",
  sensor: "센서를 찾을 수 없어요",
} as const;

function field(input: unknown, key: string): unknown {
  return isRecord(input) ? input[key] : undefined;
}

/**
 * 서버 액션 입력 { items: [...] } 검사 → DB 항목. 항목 모양:
 *   { kind: "add", sensorId, addQuantity }  — addQuantity 정수 1~9999 (9999 상한은 DB 가 지금 수량과 더해 본다)
 *   { kind: "new", sensor: {...센서 칸} }    — lib/sensor-rules checkSensorInput 과 같은 검사 (id 는 무시)
 * 틀린 항목이 있으면 그 순서(index)와 문구.
 */
export function checkSensorDocInput(input: unknown): SensorDocInputChecked {
  const raw = field(input, "items");
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > SENSOR_DOC_ITEMS_MAX) return { ok: false, error: SENSOR_DOC_ERRORS.count };
  const items: SensorDocDbItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i];
    const kind = field(it, "kind");
    if (kind === "add") {
      const sensorId = field(it, "sensorId");
      if (!isUuid(sensorId)) return { ok: false, error: SENSOR_DOC_ERRORS.sensor, index: i };
      const q = field(it, "addQuantity");
      if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > SENSOR_QUANTITY_MAX) {
        return { ok: false, error: SENSOR_DOC_ERRORS.addQuantity, index: i };
      }
      items.push({ sensor_id: sensorId, add_quantity: q });
    } else if (kind === "new") {
      const sensor = field(it, "sensor");
      const checked = checkSensorInput(isRecord(sensor) ? { ...sensor, id: null } : sensor);
      if (!checked.ok) return { ok: false, error: checked.error, index: i };
      const v = checked.value;
      items.push({
        name: v.name,
        type: v.type,
        maker: v.maker,
        model: v.model,
        quantity: v.quantity,
        location_text: v.locationText,
        slot_id: v.slotId,
        status: v.status,
        memo: v.memo,
      });
    } else {
      return { ok: false, error: SENSOR_DOC_ERRORS.count, index: i };
    }
  }
  return { ok: true, items };
}

/* ───────── 확인 표 상태 (화면 17 /sensors/doc — 화면이 가진다) ───────── */

/** 확인 표 한 줄 */
export type SensorDocRow = {
  id: string;
  item: SensorDocItem;
  /** 표에 올림(센서) / "센서 아님" 묶음 */
  isSensor: boolean;
  link: SensorDocLink;
  /** 회사+모델로 자동 연결된 우리 학교 센서 (다시 넣기 · 센서로 넣기 때 기본값) */
  autoSensorId: string | null;
  /** 새 센서 칸 펼침 */
  expanded: boolean;
  draft: NewSensorDraft;
};

/** 읽은 품목 → 새 센서 칸 처음 값 (카탈로그 모델이면 이름 · 종류 옆 "카탈로그") */
export function sensorDraftFromItem(item: SensorDocItem): NewSensorDraft {
  return {
    name: item.name.slice(0, SENSOR_NAME_MAX),
    type: item.type ?? "",
    maker: (item.maker ?? "").slice(0, SENSOR_MAKER_MAX),
    model: (item.model ?? "").slice(0, SENSOR_MODEL_MAX),
    quantity: String(item.quantity),
    locationMode: "text",
    locationText: "",
    slotId: null,
    status: "ok",
    catalogFilled: item.catalog ? ["name", "type"] : [],
  };
}

/** 추출 결과 → 확인 표 줄. 같은 회사+모델 우리 학교 센서가 있으면 "기존 센서에 더하기", 없으면 "새 센서로 등록"(펼침) */
export function buildSensorDocRows(extraction: SensorDocExtraction, sensors: readonly SchoolSensor[]): SensorDocRow[] {
  return extraction.items.map((item, i) => {
    const hit = matchSchoolSensor(item, sensors);
    return {
      id: `row-${i}`,
      item,
      isSensor: item.isSensor,
      link: hit ? { kind: "sensor", sensorId: hit.id } : { kind: "new" },
      autoSensorId: hit?.id ?? null,
      expanded: !hit,
      draft: sensorDraftFromItem(item),
    };
  });
}

/** 다시 넣을 때의 연결 (자동 연결 센서가 있으면 그 센서, 아니면 새 센서) */
export function defaultSensorDocLink(row: Pick<SensorDocRow, "autoSensorId">): SensorDocLink {
  return row.autoSensorId ? { kind: "sensor", sensorId: row.autoSensorId } : { kind: "new" };
}

export type SensorDocPlan = {
  /** 저장 항목 (표에 올린 센서 중 빼지 않은 줄) */
  items: SensorDocSaveItem[];
  /** 줄마다 문제 (id → 문구) */
  errors: Record<string, string>;
  /** 저장 버튼 "확인 후 등록 · N개" 의 N */
  count: number;
  canSave: boolean;
  /** 저장할 수 없는 까닭 (버튼 옆 안내) */
  blockReason: string | null;
};

/** 확인 표 → 저장 항목 · 줄 문제 (화면 쪽 검사 — DB 가 다시 본다) */
export function planSensorDoc(rows: readonly SensorDocRow[], sensors: readonly SchoolSensor[]): SensorDocPlan {
  const items: SensorDocSaveItem[] = [];
  const errors: Record<string, string> = {};
  for (const row of rows) {
    if (!row.isSensor || row.link.kind === "none") continue;
    if (row.link.kind === "sensor") {
      const sid = row.link.sensorId;
      const s = sensors.find((x) => x.id === sid);
      if (!s) {
        errors[row.id] = SENSOR_DOC_ERRORS.sensor;
        continue;
      }
      if (s.quantity + row.item.quantity > SENSOR_QUANTITY_MAX) {
        errors[row.id] = `더하면 ${SENSOR_QUANTITY_MAX.toLocaleString("ko-KR")}개를 넘어요`;
        continue;
      }
      items.push({ kind: "add", sensorId: s.id, addQuantity: row.item.quantity });
      continue;
    }
    const d = row.draft;
    if (d.locationMode === "slot" && !d.slotId) {
      errors[row.id] = SENSOR_DOC_TEXT.slotMissing;
      continue;
    }
    const checked = checkSensorInput({
      id: null,
      name: d.name,
      type: d.type,
      maker: d.maker,
      model: d.model,
      quantity: d.quantity,
      locationText: d.locationMode === "text" ? d.locationText : "",
      slotId: d.locationMode === "slot" ? d.slotId : null,
      status: d.status,
      memo: "",
    });
    if (!checked.ok) {
      errors[row.id] = checked.error;
      continue;
    }
    const { id: _id, ...sensor } = checked.value;
    void _id;
    items.push({ kind: "new", sensor });
  }
  const errorCount = Object.keys(errors).length;
  const count = items.length + errorCount;
  let blockReason: string | null = null;
  if (errorCount > 0) blockReason = SENSOR_DOC_TEXT.fixRows;
  else if (items.length === 0) blockReason = SENSOR_DOC_TEXT.nothingToSave;
  else if (items.length > SENSOR_DOC_ITEMS_MAX) blockReason = SENSOR_DOC_ERRORS.count;
  return { items, errors, count, canSave: blockReason === null, blockReason };
}
