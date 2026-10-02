import "server-only";
import { createClient } from "./server";
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
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;

  const [profile, reagents, cabinets, slots, recent] = await Promise.all([
    supabase.from("profiles").select("role").eq("user_id", uid).maybeSingle(),
    supabase.from("reagents").select("id, name, unit, stock, min_stock").order("name"),
    supabase.from("cabinets").select("id, door_type, shelves"),
    supabase.from("cabinet_slots").select("id", { count: "exact", head: true }),
    supabase.rpc("recent_usage", { p_limit: 3 }),
  ]);
  if (profile.error || !profile.data) return null;

  const role = (["student", "teacher", "admin"] as const).find((r) => r === profile.data!.role) ?? "student";
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
      body: [u.user_name, formatAmount(Number(u.amount), u.unit)].filter(Boolean).join(" · "),
      caption: formatUsedAt(new Date(u.used_at), now),
    })),
  };
}
