import "server-only";
import { getServerClient, getServerSession } from "./server";
import { DEFAULT_DOOR_TYPE, DEFAULT_SHELVES, isCabinetId, isDoorType, isShelfCount, type DoorType, type ShelfCount, type SlotSide } from "@/lib/cabinet-rules";
import { cabinetLayoutHref, compareScanRows, parseCabinetNumber, scanCaption, scanSlotText } from "@/lib/scan-rules";
import { isLowStock } from "@/lib/types";

// 화면 12 QR 찾기 데이터 (d7 §26 — 새 표·함수 없음). 로그인 세션(publishable 키 + 쿠키)으로 읽고,
// 기존 RLS(같은 학교 select, 보관된 시약 제외)가 다른 학교 시약장·시약을 0행으로 거른다. service role 미사용.
// 둘러보기(데모)에는 화면 12 가 없다 — anon 세션은 signed-out.

export type ScanReagentRow = {
  id: string;
  name: string;
  stock: number;
  unit: string;
  lowStock: boolean;
  side: SlotSide;
  shelf: number;
  /** 칸 위치 "좌 1단" (단문형 "1단") */
  slotText: string;
};

export type ScanCabinet = {
  id: string;
  number: number;
  label: string;
  doorType: DoorType;
  shelves: ShelfCount;
  /** "{문 종류} · {N}단 · 시약 {k}개" (화면 11 과 같은 글자) */
  caption: string;
  /** `/cabinets?c={id}` */
  layoutHref: string;
  /** 칸 순서(문 → 단), 같은 칸은 이름순. 0개면 "이 시약장에는 아직 시약이 없어요" */
  reagents: ScanReagentRow[];
};

export type ScanQuery = { cabinetId: unknown } | { number: unknown };

export type ScanLookupResult =
  /** 우리 학교 시약장 → 결과 시트 */
  | { kind: "found"; schoolName: string; cabinet: ScanCabinet }
  /** id 로 찾았는데 0행 = 다른 학교·삭제된 시약장 → "{schoolName} 시약장 QR이 아니에요" */
  | { kind: "not-ours"; schoolName: string }
  /** 번호로 찾았는데 0행 → "{number}번 시약장이 없어요" */
  | { kind: "none"; schoolName: string; number: number }
  /** 입력 모양이 틀림 (uuid 아님 → 시약장 QR 아님 / 번호 아님 → "시약장 번호를 숫자로 적어 주세요") */
  | { kind: "invalid"; by: "id" | "number" }
  /** 읽기 실패 (일시 오류) */
  | { kind: "error" }
  | { kind: "no-school" }
  | { kind: "signed-out" };

function toSide(v: string): SlotSide {
  return v === "R" ? "R" : "L";
}

/** 로그인 사용자 학교의 시약장을 id(QR) 또는 번호(직접 찾기)로 찾아 결과 시트 데이터를 만든다. */
export async function lookupScanCabinet(query: ScanQuery): Promise<ScanLookupResult> {
  const byId = "cabinetId" in query;
  let cabinetId: string | null = null;
  let number: number | null = null;
  if (byId) {
    if (!isCabinetId(query.cabinetId)) return { kind: "invalid", by: "id" };
    cabinetId = query.cabinetId.toLowerCase();
  } else {
    const n = parseCabinetNumber(query.number);
    if (!n.ok) return { kind: "invalid", by: "number" };
    number = n.value;
  }

  const me = await getServerSession();
  if (me.kind === "signed-out") return { kind: "signed-out" };
  if (me.kind === "no-school") return { kind: "no-school" };
  if (me.kind === "unavailable") return { kind: "error" };
  const schoolName = me.school.name;

  const supabase = await getServerClient();
  // RLS 가 자기 학교만 돌려주지만, 학교 조건도 명시한다 (다른 학교 id → 0행)
  const base = supabase.from("cabinets").select("id, number, label, door_type, shelves").eq("school_id", me.school.id);
  const cabRes = cabinetId !== null ? await base.eq("id", cabinetId).maybeSingle() : await base.eq("number", number!).maybeSingle();
  if (cabRes.error) return { kind: "error" };
  const cab = cabRes.data;
  if (!cab) return cabinetId !== null ? { kind: "not-ours", schoolName } : { kind: "none", schoolName, number: number! };

  const slotsRes = await supabase.from("cabinet_slots").select("id, side, shelf").eq("cabinet_id", cab.id);
  if (slotsRes.error) return { kind: "error" };
  const slots = slotsRes.data ?? [];

  const doorType = isDoorType(cab.door_type) ? cab.door_type : DEFAULT_DOOR_TYPE;
  const shelves = isShelfCount(cab.shelves) ? cab.shelves : DEFAULT_SHELVES;

  let rows: ScanReagentRow[] = [];
  if (slots.length > 0) {
    const bySlot = new Map(slots.map((s) => [s.id, { side: toSide(s.side), shelf: s.shelf }]));
    const reagentsRes = await supabase
      .from("reagents")
      .select("id, name, stock, unit, min_stock, slot_id")
      .in("slot_id", [...bySlot.keys()])
      .is("deleted_at", null);
    if (reagentsRes.error) return { kind: "error" };
    rows = (reagentsRes.data ?? [])
      .flatMap((r) => {
        const key = r.slot_id ? bySlot.get(r.slot_id) : undefined;
        // 시약장 격자 밖 칸(단 수를 줄이기 전 행 등)은 빼지 않는다 — 칸 행이 있으면 그 칸 위치로 보인다
        if (!key) return [];
        return [
          {
            id: r.id,
            name: r.name,
            stock: Number(r.stock),
            unit: r.unit,
            lowStock: isLowStock({ stock: r.stock, min_stock: r.min_stock }),
            side: key.side,
            shelf: key.shelf,
            slotText: scanSlotText(key, doorType),
          },
        ];
      })
      .sort(compareScanRows);
  }

  return {
    kind: "found",
    schoolName,
    cabinet: {
      id: cab.id,
      number: typeof cab.number === "number" ? cab.number : 0,
      label: cab.label,
      doorType,
      shelves,
      caption: scanCaption(doorType, shelves, rows.length),
      layoutHref: cabinetLayoutHref(cab.id),
      reagents: rows,
    },
  };
}
