import "server-only";
import { getServerClient, getServerSession } from "./server";
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
  const supabase = await getServerClient();
  // 세션 검증(요청당 1회, layout 과 공유)과 목록 조회를 같이 보낸다 — 결과는 세션이 확인된 뒤에만 쓴다 (행은 RLS 가 거른다)
  const [me, reagents] = await Promise.all([
    getServerSession(),
    supabase.from("reagents").select("id, name, cas_no, unit, stock, min_stock, intake_date").order("name"),
  ]);
  if (me.kind !== "member") return null;

  return {
    role: me.role,
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
