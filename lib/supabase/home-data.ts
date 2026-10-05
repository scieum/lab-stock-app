import "server-only";
import { getServerClient, getServerSession } from "./server";
import { REMOVED_USER_NAME } from "@/lib/users-rules";
import { formatAmount, formatUsedAt } from "@/lib/format";

export type Role = "student" | "teacher" | "admin";

export type HomeData = {
  role: Role;
  totalReagents: number;
  lowStock: { id: string; name: string; amount: string }[];
  cabinetCount: number;
  totalSlots: number;
  assignedSlots: number;
  recent: { id: string; reagentId: string; reagentName: string; body: string; caption: string }[];
};

/** 양문형은 좌·우 2칸, 단문형은 1칸 × 선반 수 */
function slotCapacity(doorType: string, shelves: number): number {
  return (doorType === "양문형" ? 2 : 1) * shelves;
}

/**
 * 화면 13 홈 데이터 — 로그인 세션(publishable 키 + 쿠키)으로 읽어 RLS 가 자기 학교 행만 돌려준다.
 * 세션·프로필이 없으면 null.
 */
export async function getHomeData(): Promise<HomeData | null> {
  const supabase = await getServerClient();
  // 세션 검증(요청당 1회, layout 과 공유)과 데이터 조회를 같이 보낸다 — 결과는 세션이 확인된 뒤에만 쓴다 (행은 RLS 가 거른다)
  const [me, reagents, cabinets, slots, recent] = await Promise.all([
    getServerSession(),
    supabase.from("reagents").select("id, name, unit, stock, min_stock").order("name"),
    supabase.from("cabinets").select("id, door_type, shelves"),
    supabase.from("cabinet_slots").select("id", { count: "exact", head: true }).not("storage_class", "is", null),
    supabase.rpc("recent_usage", { p_limit: 3 }),
  ]);
  if (me.kind !== "member") return null;

  const role = me.role;
  const rows = reagents.data ?? [];
  const cabs = cabinets.data ?? [];
  const now = new Date();

  return {
    role,
    totalReagents: rows.length,
    lowStock: rows
      .filter((r) => Number(r.stock) < Number(r.min_stock))
      .map((r) => ({ id: r.id, name: r.name, amount: formatAmount(Number(r.stock), r.unit) })),
    cabinetCount: cabs.length,
    totalSlots: cabs.reduce((n, c) => n + slotCapacity(c.door_type, c.shelves), 0),
    assignedSlots: slots.count ?? 0,
    recent: (recent.data ?? []).map((u) => ({
      id: u.id,
      reagentId: u.reagent_id,
      reagentName: u.reagent_name,
      // 내보낸 사용자(프로필 없음)는 이름이 null → "삭제된 사용자" (d7 §8)
      body: [(u.user_name as string | null) ?? REMOVED_USER_NAME, formatAmount(Number(u.amount), u.unit)].filter(Boolean).join(" · "),
      caption: formatUsedAt(new Date(u.used_at), now),
    })),
  };
}
