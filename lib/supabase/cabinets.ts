import "server-only";
import { createClient, getServerClient, getServerSession } from "./server";
import {
  CABINET_MAX,
  DEFAULT_DOOR_TYPE,
  DEFAULT_SHELVES,
  SHELF_COUNTS,
  checkCabinetLayout,
  checkCabinetName,
  isCabinetId,
  isDoorType,
  isShelfCount,
  isStorageClass,
  slotId,
  slotKeys,
  slotRowClasses,
  type DoorType,
  type SlotKey,
  type ShelfCount,
  type SlotSide,
  type StorageClass,
} from "@/lib/cabinet-rules";
import { suggestLocation, toSuggestCabinets } from "@/lib/location-suggest";

const STAFF_ONLY = "시약장 설정은 교사·관리자만 바꿀 수 있어요";
const SIGNED_OUT = "다시 로그인해 주세요";
const NOT_FOUND = "시약장을 찾을 수 없어요";
const DUPLICATE_NAME = "같은 이름의 시약장이 이미 있어요";
const LIMIT = `시약장은 ${CABINET_MAX}개까지 만들 수 있어요`;
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
const PLACE_STAFF_ONLY = "시약 위치는 교사·관리자만 바꿀 수 있어요";
const REAGENT_NOT_FOUND = "시약을 찾을 수 없어요";
const SLOT_NOT_FOUND = "칸을 찾을 수 없어요";

export type CabinetSummary = {
  id: string;
  /** 학교 안 고정 번호 (cabinets.number, d7 §14) — 전환 pill·QR 라벨·보관 위치에 쓴다 */
  number: number;
  label: string;
  doorType: DoorType;
  shelves: ShelfCount;
};

export type CabinetSlotView = { side: SlotSide; shelf: number; classes: StorageClass[] };

/** 칸 안 시약 (칸 시트·slot-count·배치 경고용) */
export type SlotReagent = { id: string; name: string; stock: number; unit: string; storageClass: StorageClass | null };

/** 활성 시약장의 칸 — 분류 + DB 칸 id(행이 없으면 null) + 그 칸의 시약(이름순) */
export type CabinetSlotDetail = CabinetSlotView & { slotId: string | null; reagents: SlotReagent[] };

export type ActiveCabinet = CabinetSummary & {
  /** 격자의 모든 칸 (위 단부터, 좌 → 우). 행이 없는 칸은 미지정·시약 0 */
  slots: CabinetSlotDetail[];
  /** 이 시약장에 배치된 시약 수 (삭제 확인 카드) */
  placedCount: number;
  /** 칸별 배치 시약 수 — 0 인 칸은 빠진다 (칸 줄이기 안내: 사라지는 칸의 count 합) */
  placedBySlot: { side: SlotSide; shelf: number; count: number }[];
};

export type UnassignedReagent = SlotReagent & {
  /** 위치 추천 칸 (d7 §17) — 교사·admin 일 때만 계산, 추천이 없거나 학생이면 null */
  suggestion: { cabinetId: string; side: SlotSide; shelf: number } | null;
};

export type CabinetScreen = {
  schoolName: string;
  /** 교사·admin (d7 §9 권한) */
  canManage: boolean;
  /** 번호 순서(= 만든 순서). QR 인쇄 시트도 이 목록과 schoolName 을 쓴다 */
  cabinets: CabinetSummary[];
  /** `?c={id}` 의 시약장, 없거나 다른 학교 id 면 첫 시약장. 시약장이 0개면 null */
  active: ActiveCabinet | null;
  /** 칸 없음 시약 (이름순) — 어느 시약장을 보든 같은 목록 */
  unassigned: UnassignedReagent[];
};

export type CabinetScreenResult =
  | { kind: "ok"; data: CabinetScreen }
  /** 로그인은 됐지만 프로필이 없다 (내보낸 계정) */
  | { kind: "no-school" }
  | { kind: "signed-out" };

export type AddCabinetResult = { ok: true; cabinet: CabinetSummary } | { ok: false; error: string };
export type RenameCabinetResult = { ok: true; cabinetId: string; label: string } | { ok: false; error: string };
export type SaveCabinetLayoutResult =
  | {
      ok: true;
      cabinetId: string;
      doorType: DoorType;
      shelves: ShelfCount;
      slots: CabinetSlotView[];
      /** 이 저장으로 "칸 없음"이 된 시약 수 */
      unplacedCount: number;
    }
  | { ok: false; error: string };
export type PlacementWarningKind = "none" | "mismatch" | "incompatible";
export type PlaceReagentResult =
  | {
      ok: true;
      reagentId: string;
      /** 새 칸 (null = 칸 없음) */
      slotId: string | null;
      previousSlotId: string | null;
      /** DB 가 계산한 참고용 경고 (화면 표시는 lib/cabinet-rules placementWarnings) */
      warning: PlacementWarningKind;
    }
  | { ok: false; error: string };
export type DeleteCabinetResult =
  | { ok: true; cabinetId: string; label: string; unplacedCount: number }
  | { ok: false; error: string };

function toSummary(c: { id: string; number?: number | null; label: string; door_type: string; shelves: number }): CabinetSummary {
  return {
    id: c.id,
    number: typeof c.number === "number" && Number.isFinite(c.number) ? c.number : 0,
    label: c.label,
    doorType: isDoorType(c.door_type) ? c.door_type : DEFAULT_DOOR_TYPE,
    shelves: isShelfCount(c.shelves) ? c.shelves : DEFAULT_SHELVES,
  };
}

function toSide(v: string): SlotSide {
  return v === "R" ? "R" : "L";
}

function toClass(v: string | null | undefined): StorageClass | null {
  return typeof v === "string" && isStorageClass(v) ? v : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * 화면 11 시약장 설정 — 로그인 세션(publishable 키 + 쿠키)으로 읽는다 (service role 미사용).
 * RLS 가 자기 학교의 cabinets·cabinet_slots·reagents 만 돌려준다 (학생·교사·admin 모두 보기 가능).
 */
export async function getCabinetScreen(input: { cabinetId?: string | null } = {}): Promise<CabinetScreenResult> {
  const supabase = await getServerClient();
  // 세션 검증(요청당 1회, layout 과 공유)과 조회를 같이 보낸다 — 결과는 세션이 확인된 뒤에만 쓴다 (행은 RLS 가 거른다)
  const [me, cabinetsRes, slotsRes, reagentsRes] = await Promise.all([
    getServerSession(),
    supabase.from("cabinets").select("*").order("number").order("created_at").order("id"),
    // "*": storage_classes 열이 있는 DB 와 없는 DB(마이그레이션 적용 전) 모두 읽는다
    supabase.from("cabinet_slots").select("*"),
    supabase.from("reagents").select("id, name, stock, unit, slot_id, storage_class").order("name").order("id"),
  ]);
  if (me.kind === "signed-out" || me.kind === "unavailable") return { kind: "signed-out" };
  if (me.kind === "no-school") return { kind: "no-school" };

  const cabinets = (cabinetsRes.data ?? []).map(toSummary);
  const slotRows = slotsRes.data ?? [];
  const reagents = reagentsRes.data ?? [];
  const toReagent = (r: (typeof reagents)[number]): SlotReagent => ({
    id: r.id,
    name: r.name,
    stock: Number(r.stock),
    unit: r.unit,
    storageClass: toClass(r.storage_class),
  });

  const wanted = isCabinetId(input.cabinetId) ? input.cabinetId : null;
  const activeSummary = cabinets.find((c) => c.id === wanted) ?? cabinets[0] ?? null;

  let active: ActiveCabinet | null = null;
  if (activeSummary) {
    const rows = slotRows.filter((s) => s.cabinet_id === activeSummary.id);
    const byKey = new Map(rows.map((s) => [slotId({ side: toSide(s.side), shelf: s.shelf }), s]));
    const placed = new Map<string, number>();
    const inSlot = new Map<string, SlotReagent[]>();
    for (const r of reagents) {
      if (!r.slot_id) continue;
      placed.set(r.slot_id, (placed.get(r.slot_id) ?? 0) + 1);
      const list = inSlot.get(r.slot_id) ?? [];
      list.push(toReagent(r));
      inSlot.set(r.slot_id, list);
    }
    active = {
      ...activeSummary,
      slots: slotKeys(activeSummary.doorType, activeSummary.shelves).map((k) => {
        const row = byKey.get(slotId(k));
        return {
          ...k,
          classes: row ? slotRowClasses(row) : [],
          slotId: row ? row.id : null,
          reagents: row ? (inSlot.get(row.id) ?? []) : [],
        };
      }),
      placedCount: rows.reduce((n, s) => n + (placed.get(s.id) ?? 0), 0),
      placedBySlot: rows
        .map((s) => ({ side: toSide(s.side), shelf: s.shelf, count: placed.get(s.id) ?? 0 }))
        .filter((s) => s.count > 0)
        .sort((a, b) => a.shelf - b.shelf || a.side.localeCompare(b.side)),
    };
  }

  const canManage = me.role === "teacher" || me.role === "admin";
  // 위치 추천 (d7 §17): 칸 시트의 시약 넣기 목록(교사·admin)에서 "이 칸이 추천 칸인 시약"을 가린다
  const suggestInput = canManage ? toSuggestCabinets(cabinetsRes.data ?? [], slotRows, reagents) : [];
  const unassigned: UnassignedReagent[] = reagents
    .filter((r) => !r.slot_id)
    .map((r) => {
      const s = canManage ? suggestLocation({ id: r.id, storageClass: r.storage_class }, suggestInput) : null;
      return { ...toReagent(r), suggestion: s ? { cabinetId: s.cabinetId, side: s.side, shelf: s.shelf } : null };
    });

  return {
    kind: "ok",
    data: {
      schoolName: me.school.name,
      canManage,
      cabinets,
      active,
      unassigned,
    },
  };
}

/** 쓰기 함수 공통: 요청마다 새 클라이언트로 JWT 를 검증한다 (users.ts·intake.ts 와 같은 방식) */
async function signedInClient() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return claims?.claims?.sub ? supabase : null;
}

/**
 * 시약장 추가 — DB 함수 public.add_cabinet 하나만 호출한다
 * (이름 "{n}번 시약장" · 양문형 4단 · 칸 8개 미지정. 학교는 DB 가 호출자 profiles 에서 정한다).
 */
export async function addCabinet(): Promise<AddCabinetResult> {
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("add_cabinet");
  if (error) {
    switch (error.code) {
      case "23514":
        return { ok: false, error: LIMIT };
      case "42501":
        return { ok: false, error: STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) return { ok: false, error: SAVE_FAILED };
  return { ok: true, cabinet: toSummary(row) };
}

/**
 * 이름 바꾸기 — DB 함수 public.rename_cabinet 하나만 호출한다.
 * trim 후 1~20자, 같은 학교에 같은 이름(대소문자·공백 무시) 불가.
 */
export async function renameCabinet(input: { cabinetId: unknown; label: unknown }): Promise<RenameCabinetResult> {
  if (!isCabinetId(input.cabinetId)) return { ok: false, error: NOT_FOUND };
  const checked = checkCabinetName(typeof input.label === "string" ? input.label : "");
  if (!checked.ok) return checked;

  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("rename_cabinet", { p_cabinet_id: input.cabinetId, p_label: checked.value });
  if (error) {
    switch (error.code) {
      case "23505":
        return { ok: false, error: DUPLICATE_NAME };
      case "22023":
        return { ok: false, error: "시약장 이름을 확인해 주세요" };
      case "P0002":
        return { ok: false, error: NOT_FOUND };
      case "42501":
        return { ok: false, error: STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) return { ok: false, error: SAVE_FAILED };
  return { ok: true, cabinetId: row.id, label: row.label };
}

/**
 * 설정 저장 — DB 함수 public.save_cabinet_layout 하나만 호출한다
 * (문 형태·단 수·칸별 분류 저장, 사라지는 칸 삭제, 그 칸 시약의 배치 해제를 한 트랜잭션으로).
 */
export async function saveCabinetLayout(input: {
  cabinetId: unknown;
  doorType: unknown;
  shelves: unknown;
  slots: unknown;
}): Promise<SaveCabinetLayoutResult> {
  if (!isCabinetId(input.cabinetId)) return { ok: false, error: NOT_FOUND };
  const checked = checkCabinetLayout(input);
  if (!checked.ok) return checked;
  const { doorType, shelves, slots } = checked.value;

  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("save_cabinet_layout", {
    p_cabinet_id: input.cabinetId,
    p_door_type: doorType,
    p_shelves: shelves,
    p_slots: slots.map((s) => ({ side: s.side, shelf: s.shelf, classes: [...s.classes] })),
  });
  if (error) {
    switch (error.code) {
      case "22023":
        return { ok: false, error: "문 형태·단 수·칸 분류를 확인해 주세요" };
      case "P0002":
        return { ok: false, error: NOT_FOUND };
      case "42501":
        return { ok: false, error: STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  const unplaced =
    data && typeof data === "object" && !Array.isArray(data) ? Number(data.unplaced_count ?? 0) : 0;
  return {
    ok: true,
    cabinetId: input.cabinetId,
    doorType,
    shelves,
    slots,
    unplacedCount: Number.isFinite(unplaced) ? unplaced : 0,
  };
}

/**
 * 시약장 삭제 — DB 함수 public.delete_cabinet 하나만 호출한다
 * (칸 삭제 + 배치된 시약은 "칸 없음"으로. 시약 행·재고는 그대로).
 */
export async function deleteCabinet(input: { cabinetId: unknown }): Promise<DeleteCabinetResult> {
  if (!isCabinetId(input.cabinetId)) return { ok: false, error: NOT_FOUND };

  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("delete_cabinet", { p_cabinet_id: input.cabinetId });
  if (error) {
    switch (error.code) {
      case "P0002":
        return { ok: false, error: NOT_FOUND };
      case "42501":
        return { ok: false, error: STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  const obj = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const cab = obj.cabinet && typeof obj.cabinet === "object" && !Array.isArray(obj.cabinet) ? obj.cabinet : {};
  const unplaced = Number(obj.unplaced_count ?? 0);
  return {
    ok: true,
    cabinetId: input.cabinetId,
    label: typeof cab.label === "string" ? cab.label : "",
    unplacedCount: Number.isFinite(unplaced) ? unplaced : 0,
  };
}

/**
 * 시약 칸 배치 (d7 §14) — DB 함수 public.place_reagent 하나만 호출한다.
 * slotId = null 이면 빼기("칸 없음"). 교사·admin·자기 학교 시약·자기 학교 칸·데모 거부는 DB 가 본다.
 * 분류 불일치·섞으면 위험한 조합은 막지 않는다(경고만) — warning 은 DB 계산값(참고용).
 */
export async function placeReagent(input: { reagentId: unknown; slotId: unknown }): Promise<PlaceReagentResult> {
  if (!isUuid(input.reagentId)) return { ok: false, error: REAGENT_NOT_FOUND };
  const slot = input.slotId === null || input.slotId === undefined ? null : input.slotId;
  if (slot !== null && !isUuid(slot)) return { ok: false, error: SLOT_NOT_FOUND };

  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc(
    "place_reagent",
    slot === null ? { p_reagent_id: input.reagentId } : { p_reagent_id: input.reagentId, p_slot_id: slot },
  );
  if (error) {
    switch (error.code) {
      case "P0002":
        return { ok: false, error: error.message === "slot not found" ? SLOT_NOT_FOUND : REAGENT_NOT_FOUND };
      case "42501":
        return { ok: false, error: error.message === "not authenticated" ? SIGNED_OUT : PLACE_STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  const obj = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const warning: PlacementWarningKind =
    obj.warning === "mismatch" || obj.warning === "incompatible" ? obj.warning : "none";
  return {
    ok: true,
    reagentId: input.reagentId,
    slotId: str(obj.slot_id) ?? slot,
    previousSlotId: str(obj.previous_slot_id),
    warning,
  };
}

/**
 * 위치 피커의 선택(시약장 + 칸 좌우·단, null = 칸 없음)으로 배치한다.
 * 칸 id 는 로그인 세션으로 읽는다(RLS: 자기 학교 칸만) — 다른 학교·없는 칸이면 "칸을 찾을 수 없어요".
 */
export async function placeReagentAt(input: {
  reagentId: unknown;
  location: { cabinetId: unknown; side: unknown; shelf: unknown } | null | undefined;
}): Promise<PlaceReagentResult> {
  if (!isUuid(input.reagentId)) return { ok: false, error: REAGENT_NOT_FOUND };
  const loc = input.location;
  if (loc === null || loc === undefined) return placeReagent({ reagentId: input.reagentId, slotId: null });
  if (
    !isCabinetId(loc.cabinetId) ||
    (loc.side !== "L" && loc.side !== "R") ||
    typeof loc.shelf !== "number" ||
    !Number.isInteger(loc.shelf) ||
    loc.shelf < 1 ||
    loc.shelf > Math.max(...SHELF_COUNTS)
  ) {
    return { ok: false, error: SLOT_NOT_FOUND };
  }
  const key: SlotKey = { side: loc.side, shelf: loc.shelf };

  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT };
  const { data, error } = await supabase
    .from("cabinet_slots")
    .select("id")
    .eq("cabinet_id", loc.cabinetId)
    .eq("side", key.side)
    .eq("shelf", key.shelf)
    .maybeSingle();
  if (error) return { ok: false, error: SAVE_FAILED };
  if (!data) return { ok: false, error: SLOT_NOT_FOUND };
  return placeReagent({ reagentId: input.reagentId, slotId: data.id });
}
