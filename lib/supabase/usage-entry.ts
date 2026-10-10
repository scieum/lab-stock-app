import "server-only";
import { getServerClient, getServerSession, type ServerSession } from "./server";
import { maxGradeForSchool, recentClassCombos, type ClassInfo } from "@/lib/class-info";
import { seoulDate } from "@/lib/usage-history-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export type UsageReagent = { id: string; name: string; unit: string; stock: number };

/** "최근 사용한 시약" 최대 개수 */
const RECENT_REAGENT_MAX = 8;
/** 최근 기록을 읽는 수 (최근 시약 · 최근 수업 조합) */
const RECENT_LOG_LIMIT = 100;

export type UsageEntry = {
  /** 사용자 = 로그인한 본인 (profiles.display_name) */
  userName: string;
  /** 오늘 (한국 날짜 "YYYY-MM-DD") = 사용일 기본값이자 고를 수 있는 마지막 날 (d7 §15) */
  today: string;
  /** 학교급별 최고 학년 (d7 §24 — 학교 이름으로 판단, 모르면 6) */
  maxGrade: number;
  /** 고를 수 있는 시약 = 자기 학교 · 보관 안 된 시약 (RLS), 이름순 */
  reagents: UsageReagent[];
  /** 최근 사용한 시약 id (내 기록 먼저, 그다음 학교 기록 — 최신순) */
  recentIds: string[];
  /** 내 최근 수업 조합 (최대 3) */
  recentClasses: ClassInfo[];
  /** 처음부터 담긴 시약 (화면 3 "사용 기록" → ?reagent=) */
  initialIds: string[];
};

export type UsageEntryResult =
  | { kind: "ok"; data: UsageEntry }
  /** 없는 id · 다른 학교 id · 보관된 시약 · 형식이 틀린 id — 구분하지 않는다(존재 여부 비노출) */
  | { kind: "not-found" }
  | { kind: "signed-out" };

/**
 * 화면 4 여러 시약 사용 기록 (d7 §24) — 로그인 세션(publishable 키 + 쿠키)으로 읽어 RLS 가 자기 학교 · 보관 안 된 시약만 돌려준다.
 * ?reagent= 가 있으면 그 시약이 담긴 채 시작 (목록에 없으면 404).
 */
export async function getUsageEntry(reagentId: string | undefined): Promise<UsageEntryResult> {
  if (reagentId !== undefined && !isUuid(reagentId)) {
    return (await getServerSession()).kind === "member" ? { kind: "not-found" } : { kind: "signed-out" };
  }

  const supabase = await getServerClient();
  // 세션 검증(요청당 1회, layout 과 공유)과 조회를 같이 보낸다 — 결과는 세션이 확인된 뒤에만 쓴다 (행은 RLS 가 거른다)
  const [me, reagents, logs] = await Promise.all([
    getServerSession(),
    supabase.from("reagents").select("id, name, unit, stock").order("name").order("id"),
    supabase
      .from("usage_logs")
      .select("reagent_id, user_id, class_grade, class_no, class_subject")
      .order("used_at", { ascending: false })
      .limit(RECENT_LOG_LIMIT),
  ]);
  if (me.kind !== "member") return { kind: "signed-out" };

  const list: UsageReagent[] = (reagents.data ?? []).map((r) => ({ id: r.id, name: r.name, unit: r.unit, stock: Number(r.stock) }));
  const known = new Set(list.map((r) => r.id));
  if (reagentId !== undefined && !known.has(reagentId)) return { kind: "not-found" };

  const rows = logs.data ?? [];
  const mine = rows.filter((r) => r.user_id === me.userId);
  const recentIds: string[] = [];
  for (const r of [...mine, ...rows]) {
    if (!known.has(r.reagent_id) || recentIds.includes(r.reagent_id)) continue;
    recentIds.push(r.reagent_id);
    if (recentIds.length >= RECENT_REAGENT_MAX) break;
  }

  return {
    kind: "ok",
    data: {
      userName: entryUserName(me),
      today: seoulDate(),
      maxGrade: maxGradeForSchool(me.school.name),
      reagents: list,
      recentIds,
      recentClasses: recentClassCombos(mine.map((r) => ({ grade: r.class_grade, classNo: r.class_no, subject: r.class_subject }))),
      initialIds: reagentId ? [reagentId] : [],
    },
  };
}

function entryUserName(me: Extract<ServerSession, { kind: "member" }>): string {
  return me.displayName || "-";
}
