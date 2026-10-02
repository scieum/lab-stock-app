import "server-only";
import { createClient } from "./server";
import { formatDateDots } from "@/lib/format";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEOUL_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export type UsageReagent = { id: string; name: string; unit: string; stock: number };

export type UsageEntry = {
  /** 사용자 = 로그인한 본인 (profiles.display_name) */
  userName: string;
  /** 사용 날짜 = 오늘 (usage_logs.used_at 은 DB 가 기록 시각으로 채운다) */
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
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { kind: "signed-out" };

  const profile = await supabase.from("profiles").select("display_name").eq("user_id", uid).maybeSingle();
  if (profile.error || !profile.data) return { kind: "signed-out" };

  const base = {
    userName: profile.data.display_name || "-",
    today: formatDateDots(SEOUL_DATE.format(new Date())),
  };

  if (reagentId !== undefined) {
    if (!isUuid(reagentId)) return { kind: "not-found" };
    const { data, error } = await supabase
      .from("reagents")
      .select("id, name, unit, stock")
      .eq("id", reagentId)
      .maybeSingle();
    if (error || !data) return { kind: "not-found" };
    return {
      kind: "ok",
      data: { ...base, reagent: { id: data.id, name: data.name, unit: data.unit, stock: Number(data.stock) }, options: [] },
    };
  }

  const { data } = await supabase.from("reagents").select("id, name").order("name");
  return {
    kind: "ok",
    data: { ...base, reagent: null, options: (data ?? []).map((r) => ({ value: r.id, label: r.name })) },
  };
}
