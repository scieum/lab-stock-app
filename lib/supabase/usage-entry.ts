import "server-only";
import { getServerClient, getServerSession, type ServerSession } from "./server";
import { seoulDate } from "@/lib/usage-history-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export type UsageReagent = { id: string; name: string; unit: string; stock: number };

export type UsageEntry = {
  /** 사용자 = 로그인한 본인 (profiles.display_name) */
  userName: string;
  /** 오늘 (한국 날짜 "YYYY-MM-DD") = 사용일 기본값이자 고를 수 있는 마지막 날 (d7 §15) */
  today: string;
  /** ?reagent= 로 고른 시약. 없으면 options 에서 고른다 */
  reagent: UsageReagent | null;
  options: { value: string; label: string }[];
};

export type UsageEntryResult =
  | { kind: "ok"; data: UsageEntry }
  /** 없는 id · 다른 학교 id · 형식이 틀린 id — 구분하지 않는다(존재 여부 비노출) */
  | { kind: "not-found" }
  | { kind: "signed-out" };

/**
 * 화면 4 사용 기록 입력 — 로그인 세션(publishable 키 + 쿠키)으로 읽어 RLS 가 자기 학교 행만 돌려준다.
 */
export async function getUsageEntry(reagentId: string | undefined): Promise<UsageEntryResult> {
  const base = (me: Extract<ServerSession, { kind: "member" }>) => ({
    userName: me.displayName || "-",
    today: seoulDate(),
  });

  if (reagentId !== undefined && !isUuid(reagentId)) {
    return (await getServerSession()).kind === "member" ? { kind: "not-found" } : { kind: "signed-out" };
  }

  const supabase = await getServerClient();
  // 세션 검증(요청당 1회, layout 과 공유)과 조회를 같이 보낸다 — 결과는 세션이 확인된 뒤에만 쓴다 (행은 RLS 가 거른다)
  if (reagentId !== undefined) {
    const [me, { data, error }] = await Promise.all([
      getServerSession(),
      supabase.from("reagents").select("id, name, unit, stock").eq("id", reagentId).maybeSingle(),
    ]);
    if (me.kind !== "member") return { kind: "signed-out" };
    if (error || !data) return { kind: "not-found" };
    return {
      kind: "ok",
      data: {
        ...base(me),
        reagent: { id: data.id, name: data.name, unit: data.unit, stock: Number(data.stock) },
        options: [],
      },
    };
  }

  const [me, { data }] = await Promise.all([
    getServerSession(),
    supabase.from("reagents").select("id, name").order("name"),
  ]);
  if (me.kind !== "member") return { kind: "signed-out" };
  return {
    kind: "ok",
    data: { ...base(me), reagent: null, options: (data ?? []).map((r) => ({ value: r.id, label: r.name })) },
  };
}
