import "server-only";
import { createClient } from "./server";
import { formatDateDots, formatStock } from "@/lib/format";
import { isLowStock, type Role } from "@/lib/types";

export type ReagentListItem = {
  id: string;
  name: string;
  casNo: string | null;
  stock: string;
  intake: string;
  lowStock: boolean;
};

export type ReagentListData = { role: Role; items: ReagentListItem[] };

/**
 * 화면 2 시약 목록 — 로그인 세션(publishable 키 + 쿠키)으로 읽어 RLS 가 자기 학교 행만 돌려준다.
 * 세션·프로필이 없으면 null.
 */
export async function getReagentList(): Promise<ReagentListData | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;

  const [profile, reagents] = await Promise.all([
    supabase.from("profiles").select("role").eq("user_id", uid).maybeSingle(),
    supabase.from("reagents").select("id, name, cas_no, unit, stock, min_stock, intake_date").order("name"),
  ]);
  if (profile.error || !profile.data) return null;

  const role = (["student", "teacher", "admin"] as const).find((r) => r === profile.data!.role) ?? "student";
  return {
    role,
    items: (reagents.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      casNo: r.cas_no,
      stock: formatStock(Number(r.stock), r.unit),
      intake: `입고 ${formatDateDots(r.intake_date)}`,
      lowStock: isLowStock(r),
    })),
  };
}
