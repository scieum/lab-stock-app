import "server-only";
import { createClient } from "./server";
import { isStorageClass, locationText, type SlotSide, type StorageClass } from "@/lib/cabinet-rules";
import { suggestLocation, toSuggestCabinets, type SuggestCabinet } from "@/lib/location-suggest";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 한 번에 추천을 계산하는 시약 수 상한 (서류 입고 등 여러 개 — 학교당 시약 수가 적다) */
const MAX_IDS = 50;

export type SuggestedPlace = {
  cabinetId: string;
  cabinetNumber: number;
  side: SlotSide;
  shelf: number;
  /** DB 칸 id — [여기에 두기] 가 place_reagent 에 그대로 쓴다 */
  slotId: string;
  /** "2번 시약장 · 우 2단" */
  text: string;
};

export type LocationSuggestEntry = {
  id: string;
  name: string;
  storageClass: StorageClass | null;
  /** 추천 칸 — 없으면 null ("맞는 칸이 없어요") */
  suggestion: SuggestedPlace | null;
};

export type LocationSuggestions = {
  /** 학교에 시약장이 하나라도 있는지 — 없으면 화면 7 은 location-suggest 없이 화면 2 로 (d7 §17) */
  hasCabinets: boolean;
  /** 요청한 순서 그대로, 자기 학교에서 읽힌 시약만 (다른 학교·없는 id 는 빠진다 — RLS) */
  items: LocationSuggestEntry[];
};

/**
 * 학교의 위치 추천 입력 — 로그인 세션(publishable 키 + 쿠키)으로 읽어 RLS 가 자기 학교 시약장·칸·시약만 돌려준다 (service role 미사용).
 * 시약장(번호 순) · 칸(분류) · 칸에 놓인 시약(id · 분류)
 */
async function loadSuggestInput(supabase: Awaited<ReturnType<typeof createClient>>): Promise<SuggestCabinet[] | null> {
  const [cabinetsRes, slotsRes, placedRes] = await Promise.all([
    supabase.from("cabinets").select("*").order("number").order("created_at").order("id"),
    // "*": storage_classes 열이 있는 DB 와 없는 DB 모두 읽는다 (lib/cabinet-rules slotRowClasses)
    supabase.from("cabinet_slots").select("*"),
    supabase.from("reagents").select("id, slot_id, storage_class").not("slot_id", "is", null),
  ]);
  if (cabinetsRes.error || slotsRes.error || placedRes.error) return null;
  return toSuggestCabinets(cabinetsRes.data ?? [], slotsRes.data ?? [], placedRes.data ?? []);
}

/**
 * 시약들의 위치 추천 (d7 §17 — 화면 7 등록 직후 location-suggest). 계산은 lib/location-suggest 순수 함수.
 * 로그인하지 않았거나 읽기에 실패하면 null (화면은 지금처럼 화면 2 로 간다).
 */
export async function getLocationSuggestions(reagentIds: readonly unknown[]): Promise<LocationSuggestions | null> {
  const ids = [...new Set(reagentIds.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)))].slice(0, MAX_IDS);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;

  const [cabinets, reagentsRes] = await Promise.all([
    loadSuggestInput(supabase),
    ids.length > 0
      ? supabase.from("reagents").select("id, name, storage_class").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; name: string; storage_class: string | null }[], error: null }),
  ]);
  if (!cabinets || reagentsRes.error) return null;

  const byId = new Map((reagentsRes.data ?? []).map((r) => [r.id, r]));
  const items: LocationSuggestEntry[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    const storageClass = typeof r.storage_class === "string" && isStorageClass(r.storage_class) ? r.storage_class : null;
    const s = suggestLocation({ id: r.id, storageClass }, cabinets);
    items.push({
      id: r.id,
      name: r.name,
      storageClass,
      suggestion:
        s && s.slotId
          ? {
              cabinetId: s.cabinetId,
              cabinetNumber: s.cabinetNumber,
              side: s.side,
              shelf: s.shelf,
              slotId: s.slotId,
              text: locationText({ label: s.cabinetLabel, doorType: s.doorType }, { side: s.side, shelf: s.shelf }),
            }
          : null,
    });
  }
  return { hasCabinets: cabinets.length > 0, items };
}
