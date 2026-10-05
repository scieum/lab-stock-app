import "server-only";
import { getServerClient, getServerSession } from "./server";
import { recordUserName } from "@/lib/users-rules";
import { formatDateDots, formatStock } from "@/lib/format";
import { slotLabel as classesLabel, slotRowClasses } from "@/lib/cabinet-rules";
import { isLowStock, type Role } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEOUL_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type ReagentUsageRow = { id: string; date: string; user: string; amount: string };

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
  };
  /** 보관 위치 (시약장 칸이 지정되지 않았으면 null) */
  location: { cabinet: string; slot: string; storageClass: string } | null;
  usage: ReagentUsageRow[];
};

export type ReagentDetailResult =
  | { kind: "ok"; data: ReagentDetail }
  /** 없는 id·다른 학교 id·형식이 틀린 id — 구분하지 않는다(존재 여부 비노출) */
  | { kind: "not-found" }
  /** 세션·프로필 없음 */
  | { kind: "signed-out" };

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

function slotLabel(doorType: string, side: string, shelf: number): string {
  if (doorType === "양문형") return `${side === "L" ? "왼쪽" : "오른쪽"} ${shelf}단`;
  return `${shelf}단`;
}

/**
 * 화면 3 시약 상세 — 로그인 세션(publishable 키 + 쿠키)으로 읽어 RLS 가 자기 학교 행만 돌려준다.
 * 다른 학교 시약은 RLS 로 0행이 되어 없는 id 와 똑같이 not-found.
 */
export async function getReagentDetail(id: string): Promise<ReagentDetailResult> {
  if (!UUID_RE.test(id)) {
    return (await getServerSession()).kind === "member" ? { kind: "not-found" } : { kind: "signed-out" };
  }

  const supabase = await getServerClient();
  // 세션 검증(요청당 1회, layout 과 공유)과 조회를 같이 보낸다 — 결과는 세션이 확인된 뒤에만 쓴다 (행은 RLS 가 거른다)
  const [me, reagentRes, usageRes] = await Promise.all([
    getServerSession(),
    supabase
      .from("reagents")
      .select(
        "id, name, cas_no, unit, stock, min_stock, msds_url, intake_date, slot:cabinet_slots(*, cabinet:cabinets(label, door_type))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("reagent_usage", { p_reagent_id: id, p_limit: 5 }),
  ]);
  if (me.kind !== "member") return { kind: "signed-out" };
  const role = me.role;
  const r = reagentRes.data;
  if (reagentRes.error || !r) return { kind: "not-found" };

  const slot = r.slot;
  const cabinet = slot?.cabinet ?? null;

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
      },
      location:
        slot && cabinet
          ? {
              cabinet: cabinet.label,
              slot: slotLabel(cabinet.door_type, slot.side, slot.shelf),
              storageClass: classesLabel(slotRowClasses(slot)),
            }
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
