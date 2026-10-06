import "server-only";
import { createClient, getServerClient, getServerSession } from "./server";
import { recordUserName } from "@/lib/users-rules";
import { formatDateDots, formatStock } from "@/lib/format";
import {
  DEFAULT_DOOR_TYPE,
  DEFAULT_SHELVES,
  isDoorType,
  isShelfCount,
  isStorageClass,
  slotId as slotKeyId,
  slotKeys,
  slotRowClasses,
  type DoorType,
  type SlotSide,
  type StorageClass,
} from "@/lib/cabinet-rules";
import {
  checkThreshold,
  THRESHOLD_MAX,
  toAutoBasis,
  toThresholdSource,
  type AutoBasis,
  type ThresholdSource,
} from "@/lib/reorder-rules";
import { isLowStock, type Role } from "@/lib/types";
import { placeReagent, placeReagentAt, type PlaceReagentResult } from "./cabinets";

export { placeReagent, placeReagentAt, type PlaceReagentResult };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEOUL_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const SIGNED_OUT = "다시 로그인해 주세요";
const REAGENT_NOT_FOUND = "시약을 찾을 수 없어요";
const THRESHOLD_STAFF_ONLY = "재주문 기준은 교사·관리자만 바꿀 수 있어요";
const THRESHOLD_RANGE = `재주문 기준은 0 이상 ${new Intl.NumberFormat("ko-KR").format(THRESHOLD_MAX)} 이하로 입력하세요`;
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

export type ReagentUsageRow = { id: string; date: string; user: string; amount: string };

/** 보관 위치 (화면 3 reagent-location, d7 §14) — 칸이 없으면 null ("칸 없음") */
export type ReagentPlacement = {
  cabinet: { id: string; number: number; label: string; doorType: DoorType };
  slot: { side: SlotSide; shelf: number };
  slotId: string;
  /** 그 칸의 보관 분류 (정보 표 "보관 분류") */
  classes: StorageClass[];
};

/** 재주문 기준 (화면 3 reorder-threshold) */
export type ReagentThreshold = {
  minStock: number;
  perGroup: number | null;
  groups: number | null;
  unit: string;
  /** 기준의 출처 (reagents.min_stock_source, d7 §11-1) */
  source: ThresholdSource;
  /** 자동 값의 근거 (reagents.min_stock_auto_basis) — source 가 'auto' 일 때만 값, 그 밖은 null */
  autoBasis: AutoBasis;
};

/**
 * 위치 피커용 시약장 (components/location-picker LocationPickerCabinet 과 같은 모양).
 * counts·reagentClasses 의 키 = 칸 식별 문자열 ("L1"). reagentClasses 에는 이 시약 자신은 빠진다.
 */
export type PickerCabinet = {
  id: string;
  number: number;
  label: string;
  doorType: DoorType;
  shelves: number;
  slots: { side: SlotSide; shelf: number; classes: StorageClass[] }[];
  counts: Record<string, number>;
  reagentClasses: Record<string, StorageClass[]>;
};

export type ReagentDetail = {
  role: Role;
  reagent: {
    id: string;
    name: string;
    casNo: string | null;
    unit: string;
    stock: string;
    minStock: string;
    intakeDate: string;
    lowStock: boolean;
    msdsUrl: string | null;
    /** 시약 분류 (배치 경고용, 없으면 null) */
    storageClass: StorageClass | null;
  };
  /** 보관 위치 구조 (d7 §14) */
  placement: ReagentPlacement | null;
  threshold: ReagentThreshold;
  /** 위치 피커 데이터 — 교사·admin 일 때만, 학생·둘러보기는 null (내려보내지 않는다) */
  picker: PickerCabinet[] | null;
  usage: ReagentUsageRow[];
};

export type ReagentDetailResult =
  | { kind: "ok"; data: ReagentDetail }
  /** 없는 id·다른 학교 id·형식이 틀린 id — 구분하지 않는다(존재 여부 비노출) */
  | { kind: "not-found" }
  /** 세션·프로필 없음 */
  | { kind: "signed-out" };

/** "자동으로 돌리기" 결과 (reset_reorder_threshold, d7 §11-1) */
export type ResetReorderThresholdResult =
  | { ok: true; reagentId: string; minStock: number; previousMinStock: number | null }
  | { ok: false; error: string };

export type SetReorderThresholdResult =
  | { ok: true; reagentId: string; minStock: number; previousMinStock: number | null }
  | { ok: false; error: string };

const numberFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

/** http(s) 주소만 MSDS 링크로 쓴다 */
function safeUrl(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function toClass(v: unknown): StorageClass | null {
  return typeof v === "string" && isStorageClass(v) ? v : null;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type SlotJoin = {
  id: string;
  side: string;
  shelf: number;
  storage_class?: string | null;
  storage_classes?: string[] | null;
  cabinet: { id: string; number?: number | null; label: string; door_type: string } | null;
} | null;

/** 조인 결과(시약 → 칸 → 시약장) → 보관 위치 구조. 칸이 없으면 null ("칸 없음"). 화면 3 회원·둘러보기 공용 */
export function toPlacement(slot: SlotJoin): ReagentPlacement | null {
  const cabinet = slot?.cabinet ?? null;
  if (!slot || !cabinet) return null;
  const doorType = isDoorType(cabinet.door_type) ? cabinet.door_type : DEFAULT_DOOR_TYPE;
  return {
    cabinet: { id: cabinet.id, number: typeof cabinet.number === "number" ? cabinet.number : 0, label: cabinet.label, doorType },
    slot: { side: slot.side === "R" ? "R" : "L", shelf: slot.shelf },
    slotId: slot.id,
    classes: slotRowClasses(slot),
  };
}

/**
 * 화면 3 시약 상세 — 로그인 세션(publishable 키 + 쿠키)으로 읽어 RLS 가 자기 학교 행만 돌려준다.
 * 다른 학교 시약은 RLS 로 0행이 되어 없는 id 와 똑같이 not-found.
 * 위치 피커 데이터(학교 시약장·칸·칸별 시약 수·분류)는 교사·admin 에게만 돌려준다.
 */
export async function getReagentDetail(id: string): Promise<ReagentDetailResult> {
  if (!UUID_RE.test(id)) {
    return (await getServerSession()).kind === "member" ? { kind: "not-found" } : { kind: "signed-out" };
  }

  const supabase = await getServerClient();
  // 세션 검증(요청당 1회, layout 과 공유)과 조회를 같이 보낸다 — 결과는 세션이 확인된 뒤에만 쓴다 (행은 RLS 가 거른다)
  const [me, reagentRes, usageRes, cabinetsRes, slotsRes, placedRes] = await Promise.all([
    getServerSession(),
    supabase
      .from("reagents")
      .select(
        "id, name, cas_no, unit, stock, min_stock, msds_url, intake_date, storage_class, reorder_per_group, reorder_groups, min_stock_source, min_stock_auto_basis, slot:cabinet_slots(*, cabinet:cabinets(*))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("reagent_usage", { p_reagent_id: id, p_limit: 5 }),
    // 위치 피커용 (교사·admin 일 때만 쓴다)
    supabase.from("cabinets").select("*").order("number").order("created_at").order("id"),
    supabase.from("cabinet_slots").select("*"),
    supabase.from("reagents").select("id, slot_id, storage_class").not("slot_id", "is", null),
  ]);
  if (me.kind !== "member") return { kind: "signed-out" };
  const role = me.role;
  const r = reagentRes.data;
  if (reagentRes.error || !r) return { kind: "not-found" };

  const placement = toPlacement(r.slot as SlotJoin);
  const staff = role === "teacher" || role === "admin";

  return {
    kind: "ok",
    data: {
      role,
      reagent: {
        id: r.id,
        name: r.name,
        casNo: r.cas_no,
        unit: r.unit,
        stock: numberFmt.format(Number(r.stock)),
        minStock: formatStock(Number(r.min_stock), r.unit),
        intakeDate: formatDateDots(r.intake_date),
        lowStock: isLowStock(r),
        msdsUrl: safeUrl(r.msds_url),
        storageClass: toClass(r.storage_class),
      },
      placement,
      threshold: toThreshold(r),
      picker: staff
        ? buildPicker(r.id, cabinetsRes.data ?? [], slotsRes.data ?? [], placedRes.data ?? [])
        : null,
      usage: (usageRes.data ?? []).map((u) => ({
        id: u.id,
        date: formatDateDots(SEOUL_DATE.format(new Date(u.used_at))),
        user: recordUserName(u.user_name as string | null),
        amount: formatStock(Number(u.amount), r.unit),
      })),
    },
  };
}

/** reagents 행 → 재주문 기준 (화면 3 회원·둘러보기 공용, d7 §11-1) */
export function toThreshold(r: {
  min_stock: unknown;
  reorder_per_group: unknown;
  reorder_groups: unknown;
  unit: string;
  min_stock_source?: unknown;
  min_stock_auto_basis?: unknown;
}): ReagentThreshold {
  const minStock = Number(r.min_stock);
  const perGroup = numOrNull(r.reorder_per_group);
  const groups = numOrNull(r.reorder_groups);
  const source = toThresholdSource(r.min_stock_source, { minStock, perGroup, groups });
  return {
    minStock,
    perGroup,
    groups,
    unit: r.unit,
    source,
    autoBasis: source === "auto" ? toAutoBasis(r.min_stock_auto_basis) : null,
  };
}

function buildPicker(
  selfId: string,
  cabinets: { id: string; number?: number | null; label: string; door_type: string; shelves: number }[],
  slotRows: { id: string; cabinet_id: string; side: string; shelf: number; storage_class?: string | null; storage_classes?: string[] | null }[],
  placed: { id: string; slot_id: string | null; storage_class: string | null }[],
): PickerCabinet[] {
  const bySlot = new Map<string, { count: number; classes: StorageClass[] }>();
  for (const p of placed) {
    if (!p.slot_id) continue;
    const e = bySlot.get(p.slot_id) ?? { count: 0, classes: [] };
    e.count += 1;
    const c = toClass(p.storage_class);
    if (p.id !== selfId && c && !e.classes.includes(c)) e.classes.push(c);
    bySlot.set(p.slot_id, e);
  }
  return cabinets.map((c) => {
    const doorType = isDoorType(c.door_type) ? c.door_type : DEFAULT_DOOR_TYPE;
    const shelves = isShelfCount(c.shelves) ? c.shelves : DEFAULT_SHELVES;
    const rows = slotRows.filter((s) => s.cabinet_id === c.id);
    const counts: Record<string, number> = {};
    const reagentClasses: Record<string, StorageClass[]> = {};
    const slots = slotKeys(doorType, shelves).map((k) => {
      const key = slotKeyId(k);
      const row = rows.find((s) => s.side === k.side && s.shelf === k.shelf);
      const e = row ? bySlot.get(row.id) : undefined;
      if (e && e.count > 0) counts[key] = e.count;
      if (e && e.classes.length > 0) reagentClasses[key] = e.classes;
      return { ...k, classes: row ? slotRowClasses(row) : [] };
    });
    return {
      id: c.id,
      number: typeof c.number === "number" ? c.number : 0,
      label: c.label,
      doorType,
      shelves,
      slots,
      counts,
      reagentClasses,
    };
  });
}

/**
 * 재주문 기준 직접 입력 (d7 §14) — DB 함수 public.set_reorder_threshold 하나만 호출한다.
 * 입력은 lib/reorder-rules checkThreshold 로 다시 본다(0 이상 1,000,000 이하, 소수 3자리).
 * 그대로 덮어쓰고 근거 열(1조 사용량·조 수)은 비운다. 교사·admin·자기 학교·데모 거부는 DB 가 본다.
 */
export async function setReorderThreshold(input: { reagentId: unknown; minStock: unknown }): Promise<SetReorderThresholdResult> {
  if (typeof input.reagentId !== "string" || !UUID_RE.test(input.reagentId)) {
    return { ok: false, error: REAGENT_NOT_FOUND };
  }
  const checked = checkThreshold(input.minStock);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("set_reorder_threshold", {
    p_reagent_id: input.reagentId,
    p_min_stock: checked.value,
  });
  if (error) {
    switch (error.code) {
      case "22023":
        return { ok: false, error: THRESHOLD_RANGE };
      case "P0002":
        return { ok: false, error: REAGENT_NOT_FOUND };
      case "42501":
        return { ok: false, error: error.message === "not authenticated" ? SIGNED_OUT : THRESHOLD_STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  const obj = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const min = numOrNull(obj.min_stock);
  return {
    ok: true,
    reagentId: input.reagentId,
    minStock: min ?? checked.value,
    previousMinStock: numOrNull(obj.previous_min_stock),
  };
}

/**
 * "자동으로 돌리기" (d7 §11-1) — DB 함수 public.reset_reorder_threshold 하나만 호출한다.
 * 출처를 'auto' 로 바꾸고 근거 열을 비운 뒤 자동 값(최근 4주 사용량 ÷ 2, 없으면 마지막 입고량 × 20%)으로 다시 계산한다.
 * 교사·admin·자기 학교·데모 거부는 DB 가 본다.
 */
export async function resetReorderThreshold(input: { reagentId: unknown }): Promise<ResetReorderThresholdResult> {
  if (typeof input.reagentId !== "string" || !UUID_RE.test(input.reagentId)) {
    return { ok: false, error: REAGENT_NOT_FOUND };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("reset_reorder_threshold", { p_reagent_id: input.reagentId });
  if (error) {
    switch (error.code) {
      case "P0002":
        return { ok: false, error: REAGENT_NOT_FOUND };
      case "42501":
        return { ok: false, error: error.message === "not authenticated" ? SIGNED_OUT : THRESHOLD_STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  const obj = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return {
    ok: true,
    reagentId: input.reagentId,
    minStock: numOrNull(obj.min_stock) ?? 0,
    previousMinStock: numOrNull(obj.previous_min_stock),
  };
}
