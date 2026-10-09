import "server-only";
import { getServerClient, getServerSession } from "./server";
import { REMOVED_USER_NAME } from "@/lib/users-rules";
import { formatAmount, formatKoreanDate, formatStock, formatUsedAt } from "@/lib/format";

export type Role = "student" | "teacher" | "admin";

export type HomeRecent = {
  id: string;
  reagentId: string;
  reagentName: string;
  /** 모바일 행 "학생 이OO · 20mL" */
  body: string;
  /** 모바일 행 "오늘 10:20" */
  caption: string;
  /** 데스크톱 표 (시안 13-desktop recent-usage-widget): 사용일 "10월 7일" · 사용자 · 사용량 "20 mL" */
  usedOn: string;
  userName: string;
  amount: string;
};

export type HomeData = {
  role: Role;
  /** 학교명 — 데스크톱 page-head 제목 (시안 13-desktop) */
  schoolName: string;
  /** 오늘 (한국 시간) "10월 7일" — 데스크톱 부제 "오늘 10월 7일 · 전체 시약 42종" */
  today: string;
  totalReagents: number;
  lowStock: { id: string; name: string; amount: string }[];
  /** MSDS 연결이 없는 시약 수 (데스크톱 "지금 처리할 것" 타일) */
  msdsMissing: number;
  cabinetCount: number;
  totalSlots: number;
  assignedSlots: number;
  recent: HomeRecent[];
};

type RecentRow = {
  id: string;
  reagent_id: string;
  reagent_name: string;
  unit: string;
  amount: number;
  used_at: string;
  user_name: string | null;
};

/** 최근 사용 기록 행 → 화면 값. usedOnById = 같은 기록의 사용일(date 열) — 없으면 기록 시각의 한국 날짜 */
export function toHomeRecent(u: RecentRow, userName: string, usedOnById: ReadonlyMap<string, string>, now: Date): HomeRecent {
  const usedOn = usedOnById.get(u.id);
  const usedOnDate = usedOn ? new Date(`${usedOn}T12:00:00+09:00`) : new Date(u.used_at);
  return {
    id: u.id,
    reagentId: u.reagent_id,
    reagentName: u.reagent_name,
    body: [userName, formatAmount(Number(u.amount), u.unit)].filter(Boolean).join(" · "),
    caption: formatUsedAt(new Date(u.used_at), now),
    usedOn: formatKoreanDate(usedOnDate, now),
    userName,
    amount: formatStock(Number(u.amount), u.unit),
  };
}

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
  const [me, reagents, cabinets, slots, recent, usedOn] = await Promise.all([
    getServerSession(),
    supabase.from("reagents").select("id, name, unit, stock, min_stock, msds_url").order("name"),
    supabase.from("cabinets").select("id, door_type, shelves"),
    supabase.from("cabinet_slots").select("id", { count: "exact", head: true }).not("storage_class", "is", null),
    supabase.rpc("recent_usage", { p_limit: 3 }),
    // 같은 순서(기록 시각 최신순)의 사용일 — 데스크톱 표 "사용일" 칸 (recent_usage 는 사용일을 돌려주지 않는다)
    supabase.from("usage_logs").select("id, used_on").order("used_at", { ascending: false }).limit(3),
  ]);
  if (me.kind !== "member") return null;

  const role = me.role;
  const rows = reagents.data ?? [];
  const cabs = cabinets.data ?? [];
  const now = new Date();

  const usedOnById = new Map((usedOn.data ?? []).map((u) => [u.id, u.used_on]));

  return {
    role,
    schoolName: me.school.name,
    today: formatKoreanDate(now, now),
    totalReagents: rows.length,
    lowStock: rows
      .filter((r) => Number(r.stock) < Number(r.min_stock))
      .map((r) => ({ id: r.id, name: r.name, amount: formatAmount(Number(r.stock), r.unit) })),
    msdsMissing: rows.filter((r) => !r.msds_url || r.msds_url.trim() === "").length,
    cabinetCount: cabs.length,
    totalSlots: cabs.reduce((n, c) => n + slotCapacity(c.door_type, c.shelves), 0),
    assignedSlots: slots.count ?? 0,
    // 내보낸 사용자(프로필 없음)는 이름이 null → "삭제된 사용자" (d7 §8)
    recent: (recent.data ?? []).map((u) => toHomeRecent(u, (u.user_name as string | null) ?? REMOVED_USER_NAME, usedOnById, now)),
  };
}
