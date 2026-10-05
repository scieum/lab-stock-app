import "server-only";
import { createClient, getServerClient, getServerSession } from "./server";
import {
  CABINET_MAX,
  DEFAULT_DOOR_TYPE,
  DEFAULT_SHELVES,
  checkCabinetLayout,
  checkCabinetName,
  isCabinetId,
  isDoorType,
  isShelfCount,
  slotId,
  slotKeys,
  slotRowClasses,
  type DoorType,
  type ShelfCount,
  type SlotSide,
  type StorageClass,
} from "@/lib/cabinet-rules";

const STAFF_ONLY = "시약장 설정은 교사·관리자만 바꿀 수 있어요";
const SIGNED_OUT = "다시 로그인해 주세요";
const NOT_FOUND = "시약장을 찾을 수 없어요";
const DUPLICATE_NAME = "같은 이름의 시약장이 이미 있어요";
const LIMIT = `시약장은 ${CABINET_MAX}개까지 만들 수 있어요`;
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

export type CabinetSummary = { id: string; label: string; doorType: DoorType; shelves: ShelfCount };

export type CabinetSlotView = { side: SlotSide; shelf: number; classes: StorageClass[] };

export type ActiveCabinet = CabinetSummary & {
  /** 격자의 모든 칸 (위 단부터, 좌 → 우). 행이 없는 칸은 미지정 */
  slots: CabinetSlotView[];
  /** 이 시약장에 배치된 시약 수 (삭제 확인 카드) */
  placedCount: number;
  /** 칸별 배치 시약 수 — 0 인 칸은 빠진다 (칸 줄이기 안내: 사라지는 칸의 count 합) */
  placedBySlot: { side: SlotSide; shelf: number; count: number }[];
};

export type UnassignedReagent = { id: string; name: string; stock: number; unit: string };

export type CabinetScreen = {
  schoolName: string;
  /** 교사·admin (d7 §9 권한) */
  canManage: boolean;
  /** 만든 순서 */
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
export type DeleteCabinetResult =
  | { ok: true; cabinetId: string; label: string; unplacedCount: number }
  | { ok: false; error: string };

function toSummary(c: { id: string; label: string; door_type: string; shelves: number }): CabinetSummary {
  return {
    id: c.id,
    label: c.label,
    doorType: isDoorType(c.door_type) ? c.door_type : DEFAULT_DOOR_TYPE,
    shelves: isShelfCount(c.shelves) ? c.shelves : DEFAULT_SHELVES,
  };
}

function toSide(v: string): SlotSide {
  return v === "R" ? "R" : "L";
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
    supabase.from("cabinets").select("id, label, door_type, shelves, created_at").order("created_at").order("id"),
    // "*": storage_classes 열이 있는 DB 와 없는 DB(마이그레이션 적용 전) 모두 읽는다
    supabase.from("cabinet_slots").select("*"),
    supabase.from("reagents").select("id, name, stock, unit, slot_id").order("name").order("id"),
  ]);
  if (me.kind === "signed-out" || me.kind === "unavailable") return { kind: "signed-out" };
  if (me.kind === "no-school") return { kind: "no-school" };

  const cabinets = (cabinetsRes.data ?? []).map(toSummary);
  const slotRows = slotsRes.data ?? [];
  const reagents = reagentsRes.data ?? [];

  const wanted = isCabinetId(input.cabinetId) ? input.cabinetId : null;
  const activeSummary = cabinets.find((c) => c.id === wanted) ?? cabinets[0] ?? null;

  let active: ActiveCabinet | null = null;
  if (activeSummary) {
    const rows = slotRows.filter((s) => s.cabinet_id === activeSummary.id);
    const byKey = new Map(rows.map((s) => [slotId({ side: toSide(s.side), shelf: s.shelf }), s]));
    const placed = new Map<string, number>();
    for (const r of reagents) if (r.slot_id) placed.set(r.slot_id, (placed.get(r.slot_id) ?? 0) + 1);
    active = {
      ...activeSummary,
      slots: slotKeys(activeSummary.doorType, activeSummary.shelves).map((k) => {
        const row = byKey.get(slotId(k));
        return { ...k, classes: row ? slotRowClasses(row) : [] };
      }),
      placedCount: rows.reduce((n, s) => n + (placed.get(s.id) ?? 0), 0),
      placedBySlot: rows
        .map((s) => ({ side: toSide(s.side), shelf: s.shelf, count: placed.get(s.id) ?? 0 }))
        .filter((s) => s.count > 0)
        .sort((a, b) => a.shelf - b.shelf || a.side.localeCompare(b.side)),
    };
  }

  return {
    kind: "ok",
    data: {
      schoolName: me.school.name,
      canManage: me.role === "teacher" || me.role === "admin",
      cabinets,
      active,
      unassigned: reagents
        .filter((r) => !r.slot_id)
        .map((r) => ({ id: r.id, name: r.name, stock: Number(r.stock), unit: r.unit })),
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
