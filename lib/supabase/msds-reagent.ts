import "server-only";
import { createAnonClient } from "./anon";
import { DEMO_SCHOOL_ID } from "./demo-data";
import { getServerClient, getServerSession, type SessionRole } from "./server";

// 화면 16 MSDS 요약 (d7 §22) — 시약 이름과 MSDS 주소만 읽는다.
// 로그인: 세션 클라이언트 + RLS(자기 학교 행만). 둘러보기: anon + 데모 학교 행만. 다른 학교·없는 id·형식이 틀린 id 는 똑같이 not-found.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MsdsReagent = { id: string; name: string; msdsUrl: string | null };

export type MsdsReagentResult =
  | {
      kind: "ok";
      reagent: MsdsReagent;
      me: { role: SessionRole; schoolName: string };
    }
  | { kind: "not-found" }
  | { kind: "signed-out" };

function safeUrl(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** 로그인 사용자의 자기 학교 시약 1건 (모든 역할) */
export async function getMsdsReagent(id: string): Promise<MsdsReagentResult> {
  const me = await getServerSession();
  if (me.kind !== "member") return { kind: "signed-out" };
  if (!UUID_RE.test(id)) return { kind: "not-found" };
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("reagents")
    .select("id, name, msds_url")
    .eq("id", id)
    .eq("school_id", me.school.id)
    .maybeSingle();
  if (error || !data) return { kind: "not-found" };
  return {
    kind: "ok",
    reagent: { id: data.id, name: data.name, msdsUrl: safeUrl(data.msds_url) },
    me: { role: me.role, schoolName: me.school.name },
  };
}

/** 둘러보기: 데모 학교 시약 1건 — 아니면 null */
export async function getDemoMsdsReagent(id: string): Promise<MsdsReagent | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("reagents")
    .select("id, name, msds_url")
    .eq("school_id", DEMO_SCHOOL_ID)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, name: data.name, msdsUrl: safeUrl(data.msds_url) };
}
