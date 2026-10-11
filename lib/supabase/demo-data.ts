import "server-only";
import { createAnonClient } from "./anon";
import { formatAmount, formatDateDots, formatKoreanDate, formatStock } from "@/lib/format";
import { isStorageClass } from "@/lib/cabinet-rules";
import { isLowStock } from "@/lib/types";
import { toHomeRecent, type HomeData } from "./home-data";
import type { FilterCabinet } from "@/lib/reagent-list-filter";
import {
  CABINET_LIST_COLUMNS,
  REAGENT_LIST_COLUMNS,
  toFilterCabinets,
  toReagentListItem,
  type CabinetListRow,
  type ReagentListItem,
  type ReagentListRow,
} from "./reagents-data";
import { toPlacement, toThreshold, toUsageRows, type ReagentDetail } from "./reagent-detail";

/**
 * 둘러보기(비회원) 데이터 — harness/d7-data.md §5.
 * anon 클라이언트(publishable 키, 세션 없음)로 읽고, RLS 가 데모 학교 행만 돌려준다.
 * 데모 학교 id 는 supabase/migrations/20261003140000_demo_school.sql (private.demo_school_id()) 과 같은 고정값.
 */
export const DEMO_SCHOOL_ID = "00000000-d3e0-4000-8000-000000000001";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numberFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

export type DemoSchool = { id: string; name: string };

/** 데모 학교 1행 (is_demo). 없으면 null — seed 마이그레이션이 적용되지 않은 상태. */
export async function getDemoSchool(): Promise<DemoSchool | null> {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("schools")
    .select("id, name")
    .eq("is_demo", true)
    .eq("id", DEMO_SCHOOL_ID)
    .maybeSingle();
  return error || !data ? null : data;
}

function slotCapacity(doorType: string, shelves: number): number {
  return (doorType === "양문형" ? 2 : 1) * shelves;
}

/** 13 둘러보기 홈 — 역할 없음(비회원). 쓰기 동작은 화면에서 guest-lock 으로 막는다. */
export type DemoHomeData = Omit<HomeData, "role">;

export async function getDemoHomeData(): Promise<DemoHomeData> {
  const supabase = createAnonClient();
  const [reagents, cabinets, slots, recent, school] = await Promise.all([
    supabase.from("reagents").select("id, name, unit, stock, min_stock, msds_url").eq("school_id", DEMO_SCHOOL_ID).order("name"),
    supabase.from("cabinets").select("id, door_type, shelves").eq("school_id", DEMO_SCHOOL_ID),
    supabase.from("cabinet_slots").select("id", { count: "exact", head: true }).not("storage_class", "is", null).eq("school_id", DEMO_SCHOOL_ID),
    supabase.rpc("demo_recent_usage", { p_limit: 3 }),
    getDemoSchool(),
  ]);
  // 사용일 — 행과 같은 출처(돌려받은 기록 id)에서 (d7 §25 QA 1)
  const recentIds = (recent.data ?? []).map((u) => u.id);
  const usedOn =
    recentIds.length > 0
      ? await supabase.from("usage_logs").select("id, used_on").eq("school_id", DEMO_SCHOOL_ID).in("id", recentIds)
      : { data: [] as { id: string; used_on: string }[] };
  const rows = reagents.data ?? [];
  const cabs = cabinets.data ?? [];
  const now = new Date();
  const usedOnById = new Map((usedOn.data ?? []).map((u) => [u.id, u.used_on]));

  return {
    schoolName: school?.name ?? "데모 학교",
    today: formatKoreanDate(now, now),
    totalReagents: rows.length,
    lowStock: rows
      .filter((r) => isLowStock(r))
      .map((r) => ({ id: r.id, name: r.name, amount: formatAmount(Number(r.stock), r.unit) })),
    msdsMissing: rows.filter((r) => !r.msds_url || r.msds_url.trim() === "").length,
    cabinetCount: cabs.length,
    totalSlots: cabs.reduce((n, c) => n + slotCapacity(c.door_type, c.shelves), 0),
    assignedSlots: slots.count ?? 0,
    recent: (recent.data ?? []).map((u) => toHomeRecent(u, u.user_name ?? "", usedOnById, now)),
    // 둘러보기에는 센서 알림 타일이 없다 (rules guest.hidden_components)
    sensorAlerts: { broken: 0, check: 0 },
  };
}

/** 2 둘러보기 시약 목록 — 필터(d7 §16)용 보관 분류·칸·MSDS 유무와 데모 학교 시약장도 함께 (로그인 화면과 같은 동작) */
export async function getDemoReagentList(): Promise<{ items: ReagentListItem[]; cabinets: FilterCabinet[] }> {
  const supabase = createAnonClient();
  const [reagents, cabinets] = await Promise.all([
    supabase.from("reagents").select(REAGENT_LIST_COLUMNS).eq("school_id", DEMO_SCHOOL_ID).order("name"),
    supabase
      .from("cabinets")
      .select(CABINET_LIST_COLUMNS)
      .eq("school_id", DEMO_SCHOOL_ID)
      .order("number")
      .order("created_at")
      .order("id"),
  ]);
  return {
    items: ((reagents.data ?? []) as ReagentListRow[]).map(toReagentListItem),
    cabinets: toFilterCabinets((cabinets.data ?? []) as CabinetListRow[]),
  };
}

function safeUrl(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type DemoReagentDetail = Omit<ReagentDetail, "role">;

/** 3 둘러보기 시약 상세 — 데모 학교가 아닌 id·없는 id·형식이 틀린 id 는 모두 null (존재 여부 비노출) */
export async function getDemoReagentDetail(id: string): Promise<DemoReagentDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = createAnonClient();
  const [reagentRes, usageRes] = await Promise.all([
    supabase
      .from("reagents")
      .select(
        "id, name, cas_no, unit, stock, min_stock, msds_url, intake_date, storage_class, reorder_per_group, reorder_groups, min_stock_source, min_stock_auto_basis, slot:cabinet_slots(*, cabinet:cabinets(*))",
      )
      .eq("school_id", DEMO_SCHOOL_ID)
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("demo_reagent_usage", { p_reagent_id: id, p_limit: 5 }),
  ]);
  const r = reagentRes.data;
  if (reagentRes.error || !r) return null;
  const placement = toPlacement(r.slot);
  // 사용 기록 탭의 사용일 — 같은 기록 id 에서 (d7 §25 QA 1)
  const usageIds = (usageRes.data ?? []).map((u) => u.id);
  const usedOnRes =
    usageIds.length > 0
      ? await supabase.from("usage_logs").select("id, used_on").eq("school_id", DEMO_SCHOOL_ID).in("id", usageIds)
      : { data: [] as { id: string; used_on: string }[] };

  return {
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
      storageClass: typeof r.storage_class === "string" && isStorageClass(r.storage_class) ? r.storage_class : null,
    },
    placement,
    threshold: toThreshold(r),
    // 둘러보기: 위치 바꾸기 없음 (guest.hidden_components)
    picker: null,
    suggestion: null,
    usage: toUsageRows(usageRes.data ?? [], usedOnRes.data ?? [], r.unit, (u) => u.user_name || "-"),
  };
}
