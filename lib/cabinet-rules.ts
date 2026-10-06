// 화면 11 시약장 설정 규칙 (harness/d7-data.md §9, design/rules.json cabinet).
// DB 함수(add_cabinet·rename_cabinet·save_cabinet_layout·delete_cabinet)가 같은 검사를 다시 한다 —
// 여기는 화면에 보일 이름·문구·경고를 만드는 순수 함수다.
import { STORAGE_CLASSES, type Checked, type StorageClass } from "./intake-rules";

export { STORAGE_CLASSES, type StorageClass };

/** 문 형태 (design/rules.json cabinet.door_types) */
export const DOOR_TYPES = ["양문형", "단문형"] as const;
export type DoorType = (typeof DOOR_TYPES)[number];

/** 단 수 (design/rules.json cabinet.shelves) */
export const SHELF_COUNTS = [3, 4] as const;
export type ShelfCount = (typeof SHELF_COUNTS)[number];

/** 같은 칸에 두면 안 되는 분류 조합 (design/rules.json cabinet.incompatible, 순서 그대로) */
export const INCOMPATIBLE: readonly (readonly [StorageClass, StorageClass])[] = [
  ["산", "염기"],
  ["산화제", "인화성"],
  ["산화제", "유기"],
  ["산", "인화성"],
  ["독성", "산"],
];

/** 칸이 정해지지 않은 시약 표시 (design/rules.json cabinet.unassigned_label) */
export const UNASSIGNED_LABEL = "칸 없음";
/** 분류가 없는 칸 표시 (s2-spec 화면 11 cabinet-slot) */
export const SLOT_UNSET_LABEL = "미지정";
/** 새 시약장 기본값 (d7 §9 추가) */
export const DEFAULT_DOOR_TYPE: DoorType = "양문형";
export const DEFAULT_SHELVES: ShelfCount = 4;
/** 시약장 이름 길이 · 학교당 개수 (d7 §9) */
export const CABINET_NAME_MAX = 20;
export const CABINET_MAX = 20;

/** 칸의 좌우 (DB cabinet_slots.side). 단문형은 L 만 쓴다 */
export type SlotSide = "L" | "R";
export type SlotKey = { side: SlotSide; shelf: number };
export type SlotClasses = SlotKey & { classes: readonly string[] };

const SIDE_LABEL: Record<SlotSide, string> = { L: "좌", R: "우" };

/** 문 라벨 ("좌" / "우") */
export function sideLabel(side: SlotSide): string {
  return SIDE_LABEL[side];
}

/** 단 라벨 ("1단") */
export function shelfLabel(shelf: number): string {
  return `${shelf}단`;
}

/** 문 형태에 있는 좌우 (양문형 = 좌·우, 단문형 = 한쪽) */
export function slotSides(doorType: DoorType): SlotSide[] {
  return doorType === "단문형" ? ["L"] : ["L", "R"];
}

/** 시약장의 모든 칸 — 위 단부터, 단마다 좌 → 우 */
export function slotKeys(doorType: DoorType, shelves: number): SlotKey[] {
  const sides = slotSides(doorType);
  const out: SlotKey[] = [];
  for (let shelf = 1; shelf <= shelves; shelf += 1) for (const side of sides) out.push({ side, shelf });
  return out;
}

/** 칸 식별 문자열 ("L1") — React key·선택 비교용 */
export function slotId(key: SlotKey): string {
  return `${key.side}${key.shelf}`;
}

export function sameSlot(a: SlotKey | null | undefined, b: SlotKey | null | undefined): boolean {
  return Boolean(a && b && a.side === b.side && a.shelf === b.shelf);
}

/** 칸 이름: 양문형 "좌1단" · 단문형 "1단" */
export function slotName(key: SlotKey, doorType: DoorType = "양문형"): string {
  return doorType === "단문형" ? shelfLabel(key.shelf) : `${sideLabel(key.side)}${shelfLabel(key.shelf)}`;
}

/** 시약장 이름 기본값 "{n}번 시약장" (design/rules.json cabinet.default_name) */
export function defaultCabinetName(n: number): string {
  return `${n}번 시약장`;
}

/**
 * 시약장 이름 옆 요약 (시안 cabinet-meta, 디자인 1.15).
 * full = 데스크톱 "양문형 · 4단 · 8칸" (11-desktop), short = 모바일 "양문형 · 4단" (11-mobile — 칸 수 빠짐)
 */
export function cabinetMeta(doorType: DoorType, shelves: number, form: "full" | "short" = "full"): string {
  const short = `${doorType} · ${shelfLabel(shelves)}`;
  return form === "short" ? short : `${short} · ${slotKeys(doorType, shelves).length}칸`;
}

/**
 * 칸 제목 — 문과 단 사이를 띄운 꼴: 양문형 "좌 2단" · 단문형 "2단"
 * (시안 11-slot 시트 제목 "좌 2단", 3 보관 위치 "1번 시약장 · 우 1단"). 배치도·경고 줄의 "좌1단"(slotName)과 구분한다.
 */
export function slotTitle(key: SlotKey, doorType: DoorType = "양문형"): string {
  return doorType === "단문형" ? shelfLabel(key.shelf) : `${sideLabel(key.side)} ${shelfLabel(key.shelf)}`;
}

/**
 * 보관 위치 문구 (화면 3 reagent-location, d7 §14): "1번 시약장 · 우 1단". 시약장 번호(cabinet-number)는 문구 앞에 따로 그린다.
 * 시약장이나 칸이 없으면 "칸 없음".
 */
export function locationText(
  cabinet: { label: string; doorType: DoorType } | null | undefined,
  slot: SlotKey | null | undefined,
): string {
  if (!cabinet || !slot) return UNASSIGNED_LABEL;
  return `${cabinet.label} · ${slotTitle(slot, cabinet.doorType)}`;
}

/* ───────── 칸 배치 경고 (d7 §14 분류 불일치 — 경고만, 막지 않는다) ───────── */

/** 경고 아래 보조 줄 — 위치 피커(저장) · 칸 시트(넣기) */
export const PLACEMENT_NOTE_SAVE = "그래도 저장할 수 있어요";
export const PLACEMENT_NOTE_PUT = "그래도 넣을 수 있어요";

export type PlacementWarning =
  | { kind: "none" }
  /** 시약 분류가 칸 분류에 없다 — "이 칸은 유기 칸이에요 — 그래도 넣을 수 있어요" */
  | { kind: "mismatch"; lines: string[] }
  /** 칸 분류·칸 안 다른 시약과 섞으면 위험한 조합 — "산화제와 유기는 섞으면 위험해요" (조합마다 한 줄) */
  | { kind: "incompatible"; pairs: [StorageClass, StorageClass][]; lines: string[] };

/** "이 칸은 유기 칸이에요 — 그래도 넣을 수 있어요" (design.md Reagent slots · s2-spec 11-slot) */
export function mismatchText(slotClasses: readonly string[]): string {
  return `이 칸은 ${slotLabel(slotClasses)} 칸이에요 — ${PLACEMENT_NOTE_PUT}`;
}

/** "산화제와 유기는 섞으면 위험해요" (design.md · s2-spec 3-location) — 조사는 받침에 맞춘다 */
export function placementDangerText(a: string, b: string): string {
  return `${withJosa(a, "과", "와")} ${withJosa(b, "은", "는")} 섞으면 위험해요`;
}

/**
 * 시약 하나를 칸에 넣을 때의 경고 (d7 §14, rules.json cabinet.class_mismatch):
 * - 시약 분류가 없거나 모르는 값이면 경고 없음
 * - 칸 분류 또는 그 칸에 이미 있는 다른 시약 분류와 incompatible 조합이면 "incompatible"(더 강한 문구, 조합마다 한 줄, 규칙 순서)
 * - 아니고, 칸에 분류가 지정돼 있는데 시약 분류가 그 안에 없으면 "mismatch"
 * - 분류가 지정되지 않은 칸("미지정")은 불일치로 보지 않는다
 */
export function placementWarnings(
  reagentClass: string | null | undefined,
  slotClasses: readonly string[],
  otherReagentClasses: readonly (string | null | undefined)[] = [],
): PlacementWarning {
  if (!reagentClass || !isStorageClass(reagentClass)) return { kind: "none" };
  const around = new Set<string>([...sortClasses(slotClasses), ...otherReagentClasses.filter((c): c is string => typeof c === "string" && isStorageClass(c))]);
  const pairs = INCOMPATIBLE.filter(
    ([a, b]) => (a === reagentClass && around.has(b)) || (b === reagentClass && around.has(a)),
  ).map(([a, b]) => [a, b] as [StorageClass, StorageClass]);
  if (pairs.length > 0) return { kind: "incompatible", pairs, lines: pairs.map(([a, b]) => placementDangerText(a, b)) };
  const classes = sortClasses(slotClasses);
  if (classes.length > 0 && !classes.includes(reagentClass)) return { kind: "mismatch", lines: [mismatchText(classes)] };
  return { kind: "none" };
}

/* ───────── 시약장 QR (d7 §14 QR 인쇄 — 내용 = {origin}/scan?cabinet={id}) ───────── */

/** QR 을 열 경로 (화면 12) */
export const SCAN_PATH = "/scan";
/** QR 라벨 안내 한 줄 (rules.json cabinet.qr_label_text) */
export const QR_LABEL_HELP = "QR을 찍으면 이 시약장의 시약을 봐요";
/** A4 한 장에 넣는 라벨 수 (2열 × 4줄) */
export const QR_LABELS_PER_PAGE = 8;

/** QR 내용: "https://example.com/scan?cabinet={id}" — origin 끝의 "/" 는 뗀다 */
export function cabinetQrUrl(origin: string, cabinetId: string): string {
  return `${origin.replace(/\/+$/, "")}${SCAN_PATH}?cabinet=${encodeURIComponent(cabinetId)}`;
}

/**
 * QR 내용 해석 (화면 12): 같은 origin 의 "/scan?cabinet={uuid}" 이면 시약장 id(소문자), 아니면 null.
 * 다른 호스트·다른 경로·cabinet 없음·uuid 아님·다른 매개변수가 붙은 것은 모두 null.
 */
export function parseCabinetQr(text: unknown, origin: string): string | null {
  if (typeof text !== "string") return null;
  let url: URL;
  let base: URL;
  try {
    url = new URL(text.trim());
    base = new URL(origin);
  } catch {
    return null;
  }
  if (url.origin !== base.origin) return null;
  if (url.pathname !== SCAN_PATH || url.hash !== "" || url.username !== "" || url.password !== "") return null;
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== "cabinet") return null;
  const id = url.searchParams.get("cabinet");
  return isCabinetId(id) ? id.toLowerCase() : null;
}

/** 인쇄 시트 안내: "A4 한 장에 라벨 2개" · 한 장을 넘으면 "A4 3장 · 한 장에 라벨 8개" (0개면 "인쇄할 라벨이 없어요") */
export function qrPrintCaption(count: number): string {
  if (!(count > 0)) return "인쇄할 라벨이 없어요";
  if (count <= QR_LABELS_PER_PAGE) return `A4 한 장에 라벨 ${count}개`;
  return `A4 ${Math.ceil(count / QR_LABELS_PER_PAGE)}장 · 한 장에 라벨 ${QR_LABELS_PER_PAGE}개`;
}

export function isStorageClass(v: string): v is StorageClass {
  return (STORAGE_CLASSES as readonly string[]).includes(v);
}

/** 분류 목록을 규칙 순서(유기·산·염기·…)로, 중복·모르는 값 없이 */
export function sortClasses(classes: readonly string[]): StorageClass[] {
  return STORAGE_CLASSES.filter((c) => classes.includes(c));
}

/** 분류 하나를 켜고 끈 결과 (규칙 순서 유지) */
export function toggleClass(classes: readonly string[], cls: string): StorageClass[] {
  const has = classes.includes(cls);
  return sortClasses(has ? classes.filter((c) => c !== cls) : [...classes, cls]);
}

/** 칸 안 글자: "산 · 염기", 없으면 "미지정" */
export function slotLabel(classes: readonly string[]): string {
  const sorted = sortClasses(classes);
  return sorted.length > 0 ? sorted.join(" · ") : SLOT_UNSET_LABEL;
}

/** 한 칸의 분류들 중 섞이면 안 되는 조합 (규칙에 적힌 순서·방향 그대로) */
export function incompatiblePairs(classes: readonly string[]): [StorageClass, StorageClass][] {
  return INCOMPATIBLE.filter(([a, b]) => classes.includes(a) && classes.includes(b)).map(([a, b]) => [a, b]);
}

export function hasIncompatible(classes: readonly string[]): boolean {
  return INCOMPATIBLE.some(([a, b]) => classes.includes(a) && classes.includes(b));
}

/** 마지막 글자에 받침이 있는지 (한글 음절만 판정, 그 밖은 받침 없음으로 본다) */
function hasBatchim(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** 조사 붙이기: withJosa("산", "과", "와") = "산과" · withJosa("유기", "은", "는") = "유기는" */
export function withJosa(word: string, afterBatchim: string, afterVowel: string): string {
  return `${word}${hasBatchim(word) ? afterBatchim : afterVowel}`;
}

/**
 * 숫자에 조사 붙이기 (한글 읽기 기준): 끝자리 1일·3삼·6육·7칠·8팔·0(십·백·천·만·영) = 받침 있음,
 * 2이·4사·5오·9구 = 받침 없음. withNumberJosa(1, "은", "는") = "1은" · withNumberJosa(2, "은", "는") = "2는"
 */
export function withNumberJosa(n: number, afterBatchim: string, afterVowel: string): string {
  const last = Math.abs(Math.trunc(n)) % 10;
  const vowel = last === 2 || last === 4 || last === 5 || last === 9;
  return `${n}${vowel ? afterVowel : afterBatchim}`;
}

/** 이름 시트 caption: "번호 1은 바뀌지 않아요" (rules.json cabinet.number — 이름과 별개, 바뀌지 않음) */
export function cabinetNumberFixedText(n: number): string {
  return `번호 ${withNumberJosa(n, "은", "는")} 바뀌지 않아요`;
}

/** 경고 한 줄: "좌1단: 산과 염기는 섞이면 위험해요. 다른 칸에 나눠 보관하세요" (d7 §9 혼재 경고) */
export function mixWarningText(slot: string, a: string, b: string): string {
  return `${slot}: ${withJosa(a, "과", "와")} ${withJosa(b, "은", "는")} 섞이면 위험해요. 다른 칸에 나눠 보관하세요`;
}

export type MixWarning = SlotKey & {
  /** 칸 이름 ("좌1단") */
  slot: string;
  pair: [StorageClass, StorageClass];
  text: string;
};

/**
 * 시약장의 혼재 경고 목록 — 지금 문 형태·단 수에 있는 칸만, 위 단부터 좌 → 우, 칸 안에서는 규칙 순서.
 * 저장을 막지 않는다(경고만).
 */
export function mixWarnings(slots: readonly SlotClasses[], doorType: DoorType, shelves: number): MixWarning[] {
  const out: MixWarning[] = [];
  for (const key of slotKeys(doorType, shelves)) {
    const found = slots.find((s) => sameSlot(s, key));
    if (!found) continue;
    const slot = slotName(key, doorType);
    for (const pair of incompatiblePairs(found.classes)) {
      out.push({ ...key, slot, pair, text: mixWarningText(slot, pair[0], pair[1]) });
    }
  }
  return out;
}

/** 문 형태·단 수를 줄일 때 사라지는 칸 (d7 §9 칸 줄이기 — 그 칸의 시약은 "칸 없음"이 된다) */
export function removedSlots(
  from: { doorType: DoorType; shelves: number },
  to: { doorType: DoorType; shelves: number },
): SlotKey[] {
  const kept = new Set(slotKeys(to.doorType, to.shelves).map(slotId));
  return slotKeys(from.doorType, from.shelves).filter((k) => !kept.has(slotId(k)));
}

/** 시약장 이름 검사 (d7 §9 이름 바꾸기: trim 후 1~20자). 같은 이름 중복은 DB 함수가 본다 */
export function checkCabinetName(label: string): Checked<string> {
  const value = label.trim();
  if (value.length === 0) return { ok: false, error: "시약장 이름을 입력하세요" };
  if ([...value].length > CABINET_NAME_MAX) return { ok: false, error: `이름은 ${CABINET_NAME_MAX}자까지 쓸 수 있어요` };
  return { ok: true, value };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 시약장 id 모양 (cabinets.id = uuid) */
export function isCabinetId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isDoorType(v: unknown): v is DoorType {
  return (DOOR_TYPES as readonly unknown[]).includes(v);
}

export function isShelfCount(v: unknown): v is ShelfCount {
  return (SHELF_COUNTS as readonly unknown[]).includes(v);
}

export type CabinetLayoutInput = { doorType: unknown; shelves: unknown; slots: unknown };
export type CabinetLayout = {
  doorType: DoorType;
  shelves: ShelfCount;
  /** 격자의 모든 칸 (위 단부터, 좌 → 우). 분류는 규칙 순서 */
  slots: { side: SlotSide; shelf: number; classes: StorageClass[] }[];
};

/**
 * 설정 저장 입력 검사 (d7 §9 설정 저장 — DB 함수 save_cabinet_layout 과 같은 규칙).
 * 문 형태·단 수가 규칙 안이고, 칸은 그 격자 안에서 한 번씩만, 분류는 8종 안에서 칸마다 중복 없이.
 * 목록에 없는 칸은 미지정으로 채워 격자 전체를 돌려준다.
 */
export function checkCabinetLayout(input: CabinetLayoutInput): Checked<CabinetLayout> {
  if (!isDoorType(input.doorType)) return { ok: false, error: "문 형태를 선택해 주세요" };
  if (!isShelfCount(input.shelves)) return { ok: false, error: "단 수를 선택해 주세요" };
  const { doorType, shelves } = input;
  if (!Array.isArray(input.slots)) return { ok: false, error: "칸 설정을 확인해 주세요" };

  const keys = slotKeys(doorType, shelves);
  const valid = new Set(keys.map(slotId));
  const given = new Map<string, StorageClass[]>();
  for (const raw of input.slots as unknown[]) {
    if (typeof raw !== "object" || raw === null) return { ok: false, error: "칸 설정을 확인해 주세요" };
    const { side, shelf, classes } = raw as { side?: unknown; shelf?: unknown; classes?: unknown };
    if ((side !== "L" && side !== "R") || typeof shelf !== "number" || !Number.isInteger(shelf) || !Array.isArray(classes)) {
      return { ok: false, error: "칸 설정을 확인해 주세요" };
    }
    const id = slotId({ side, shelf });
    if (!valid.has(id) || given.has(id)) return { ok: false, error: "칸 설정을 확인해 주세요" };
    const list = classes as unknown[];
    if (!list.every((c): c is StorageClass => typeof c === "string" && isStorageClass(c)) || new Set(list).size !== list.length) {
      return { ok: false, error: "보관 분류를 확인해 주세요" };
    }
    given.set(id, sortClasses(list));
  }
  return {
    ok: true,
    value: { doorType, shelves, slots: keys.map((k) => ({ ...k, classes: given.get(slotId(k)) ?? [] })) },
  };
}

/**
 * DB 칸 행의 분류 목록 — storage_classes(여러 개)가 있으면 그것, 없으면 예전 단일 열 storage_class.
 * (storage_classes 열은 20261005130000_cabinet_settings 마이그레이션에서 생긴다 — 적용 전 DB 도 읽을 수 있게)
 */
export function slotRowClasses(row: { storage_classes?: unknown; storage_class?: unknown }): StorageClass[] {
  if (Array.isArray(row.storage_classes)) {
    return sortClasses(row.storage_classes.filter((c): c is string => typeof c === "string"));
  }
  return typeof row.storage_class === "string" ? sortClasses([row.storage_class]) : [];
}
