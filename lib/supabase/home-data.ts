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
  /** 모바일 행 날짜 = 사용일 (d7 §25 QA 1): 기록한 날 = 사용일이면 "오늘 10:20"(기록 시각), 다르면 사용일 "10월 7일" · "오늘" · "어제" */
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
  /** 고장 · 점검 필요 센서 수 (d7 §25 — 홈 sensor-alert-tile, 교사·admin 이고 1개 이상일 때만 보인다) */
  sensorAlerts: { broken: number; check: number };
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

const SEOUL_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

/** 사용일(date 열 "2026-10-07") → "오늘" · "어제" · "10월 7일" (한국 날짜) */
function usedOnCaption(usedOn: string, now: Date): string {
  const today = SEOUL_YMD.format(now);
  const yesterday = SEOUL_YMD.format(new Date(now.getTime() - 86_400_000));
  if (usedOn === today) return "오늘";
  if (usedOn === yesterday) return "어제";
  return formatKoreanDate(new Date(`${usedOn}T12:00:00+09:00`), now);
}

/**
 * 최근 사용 기록 행 → 화면 값. usedOnById = 같은 기록의 사용일(date 열).
 * d7 §25 QA 1: 날짜는 사용일 — 기록한 날(used_at 한국 날짜)이 사용일과 같으면 모바일 캡션은 "오늘 10:20"(기록 시각 그대로),
 * 다르면 사용일만 ("10월 7일"). 사용일을 못 찾으면(예전 행) 기록 시각.
 */
export function toHomeRecent(u: RecentRow, userName: string, usedOnById: ReadonlyMap<string, string>, now: Date): HomeRecent {
  const usedOn = usedOnById.get(u.id);
  const usedAt = new Date(u.used_at);
  const usedOnDate = usedOn ? new Date(`${usedOn}T12:00:00+09:00`) : usedAt;
  const sameDay = !usedOn || usedOn === SEOUL_YMD.format(usedAt);
  return {
    id: u.id,
    reagentId: u.reagent_id,
    reagentName: u.reagent_name,
    body: [userName, formatAmount(Number(u.amount), u.unit)].filter(Boolean).join(" · "),
    caption: sameDay ? formatUsedAt(usedAt, now) : usedOnCaption(usedOn, now),
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
  const [me, reagents, cabinets, slots, recent, sensors] = await Promise.all([
    getServerSession(),
    supabase.from("reagents").select("id, name, unit, stock, min_stock, msds_url").order("name"),
    supabase.from("cabinets").select("id, door_type, shelves"),
    supabase.from("cabinet_slots").select("id", { count: "exact", head: true }).not("storage_class", "is", null),
    supabase.rpc("recent_usage", { p_limit: 3 }),
    // 홈 센서 알림 (d7 §25): 고장 · 점검 필요 (RLS: 자기 학교 · 보관 제외)
    supabase.from("sensors").select("status").in("status", ["broken", "check"]),
  ]);
  if (me.kind !== "member") return null;
  // 사용일 — 행과 같은 출처(recent_usage 가 돌려준 기록 id)에서 읽는다 (d7 §25 QA 1: 보관 시약 기록이 끼어 어긋나지 않게).
  // recent_usage 는 사용일을 돌려주지 않는다
  const recentIds = (recent.data ?? []).map((u) => u.id);
  const usedOn = recentIds.length > 0 ? await supabase.from("usage_logs").select("id, used_on").in("id", recentIds) : { data: [] };

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
    sensorAlerts: {
      broken: (sensors.data ?? []).filter((r) => r.status === "broken").length,
      check: (sensors.data ?? []).filter((r) => r.status === "check").length,
    },
  };
}
