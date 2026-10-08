import "server-only";
import { cache } from "react";
import { getServerClient, getServerSession } from "./server";
import { formatDateDots, formatStock } from "@/lib/format";
import { isDoorType } from "@/lib/cabinet-rules";
import type { FilterCabinet, FilterableReagent } from "@/lib/reagent-list-filter";
import { isLowStock, type Role } from "@/lib/types";

/**
 * 화면 2 목록 한 행. 화면 표시 글자(stock · intake) + 필터·정렬 값(d7 §16: 보관 분류 · 칸 · MSDS 유무 · 입고일 · 숫자 재고).
 */
export type ReagentListItem = FilterableReagent & {
  casNo: string | null;
  /** "500 mL" */
  stock: string;
  /** "입고 2026.03.02" */
  intake: string;
  lowStock: boolean;
};

export type ReagentListData = { role: Role; items: ReagentListItem[]; cabinets: FilterCabinet[] };

/** 목록 조회 열 — 로그인·둘러보기 공통 (칸은 cabinet_slots 조인: 문·단·시약장 id) */
export const REAGENT_LIST_COLUMNS =
  "id, name, cas_no, unit, stock, min_stock, intake_date, storage_class, msds_url, slot:cabinet_slots(side, shelf, cabinet_id)";
export const CABINET_LIST_COLUMNS = "id, number, label, door_type, shelves";

type SlotJoin = { side: string; shelf: number; cabinet_id: string } | null;

export type ReagentListRow = {
  id: string;
  name: string;
  cas_no: string | null;
  unit: string;
  stock: number | string;
  min_stock: number | string;
  intake_date: string | null;
  storage_class: string | null;
  msds_url: string | null;
  slot: SlotJoin | SlotJoin[] | unknown;
};

export type CabinetListRow = { id: string; number: number | null; label: string; door_type: string; shelves: number };

function toSlot(raw: unknown): FilterableReagent["slot"] {
  const s = (Array.isArray(raw) ? raw[0] : raw) as SlotJoin | undefined;
  if (!s || typeof s.cabinet_id !== "string" || typeof s.shelf !== "number") return null;
  return { cabinetId: s.cabinet_id, side: s.side === "R" ? "R" : "L", shelf: s.shelf };
}

/** DB 행 → 목록 행 (로그인·둘러보기 공통) */
export function toReagentListItem(r: ReagentListRow): ReagentListItem {
  const stock = Number(r.stock);
  return {
    id: r.id,
    name: r.name,
    casNo: r.cas_no,
    stock: formatStock(stock, r.unit),
    intake: `입고 ${formatDateDots(r.intake_date ?? "")}`,
    lowStock: isLowStock({ stock: stock, min_stock: Number(r.min_stock) }),
    stockValue: stock,
    intakeDate: r.intake_date ?? null,
    storageClass: r.storage_class ?? null,
    slot: toSlot(r.slot),
    hasMsds: typeof r.msds_url === "string" && r.msds_url.trim() !== "",
  };
}

/** DB 시약장 행 → 필터 시약장 (번호 순) */
export function toFilterCabinets(rows: readonly CabinetListRow[]): FilterCabinet[] {
  return rows.map((c) => ({
    id: c.id,
    number: typeof c.number === "number" ? c.number : 0,
    label: c.label,
    doorType: isDoorType(c.door_type) ? c.door_type : "양문형",
    shelves: c.shelves,
  }));
}

/**
 * 화면 2 시약 목록 — 로그인 세션(publishable 키 + 쿠키)으로 읽어 RLS 가 자기 학교 행만 돌려준다.
 * 필터(d7 §16)에 쓰는 보관 분류·칸·MSDS 유무와 학교 시약장 목록도 함께 읽는다. 세션·프로필이 없으면 null.
 * 요청당 한 번만 읽는다 (React cache — 데스크톱 목록(레이아웃)과 모바일 목록(페이지)이 같은 결과를 쓴다).
 */
export const getReagentList = cache(async function getReagentList(): Promise<ReagentListData | null> {
  const supabase = await getServerClient();
  // 세션 검증(요청당 1회, layout 과 공유)과 목록 조회를 같이 보낸다 — 결과는 세션이 확인된 뒤에만 쓴다 (행은 RLS 가 거른다)
  const [me, reagents, cabinets] = await Promise.all([
    getServerSession(),
    supabase.from("reagents").select(REAGENT_LIST_COLUMNS).order("name"),
    supabase.from("cabinets").select(CABINET_LIST_COLUMNS).order("number").order("created_at").order("id"),
  ]);
  if (me.kind !== "member") return null;

  return {
    role: me.role,
    items: ((reagents.data ?? []) as ReagentListRow[]).map(toReagentListItem),
    cabinets: toFilterCabinets((cabinets.data ?? []) as CabinetListRow[]),
  };
});
