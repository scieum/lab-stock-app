// DB 권한 테스트 도우미 (N1-db · R-db).
// - 공개 URL·publishable(anon) 키 + 각 테스트 계정 로그인으로 실제 RLS를 통과/거부하는지 본다.
// - 판정에 service role 키를 쓰지 않는다 (RLS를 우회하므로). 키가 있으면 로그인 토큰을 만드는 데만 쓴다(아래 signIn) —
//   결과는 그 계정의 authenticated 세션이고 모든 판정 호출은 그 세션(publishable 키)으로 한다.
// - 계정·키 값은 .env.local / 환경변수에서만 읽는다. 파일에 값을 쓰지 않는다.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TestInfo } from "@playwright/test";

function loadEnvLocal(): void {
  const file = join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 가 없습니다 (.env.local 또는 env)`);
  return v;
}

export type Role = "student" | "teacher" | "admin" | "schoolB";
export const SCHOOL_A_ROLES: Role[] = ["student", "teacher", "admin"];

const ENV_PREFIX: Record<Role, string> = {
  student: "TEST_STUDENT",
  teacher: "TEST_TEACHER",
  admin: "TEST_ADMIN",
  schoolB: "TEST_SCHOOL_B",
};

export const ROLE_LABEL: Record<Role, string> = {
  student: "학교A 학생",
  teacher: "학교A 교사",
  admin: "학교A admin",
  schoolB: "학교B 교사",
};

export interface Session {
  role: Role;
  client: SupabaseClient;
  userId: string;
  schoolId: string;
  profileRole: string;
}

function newClient(): SupabaseClient {
  return createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** 로그인하지 않은 anon 클라이언트 */
export function anonClient(): SupabaseClient {
  return newClient();
}

const cache = new Map<Role, Promise<Session>>();

type AuthErr = { status?: number; code?: string; message?: string } | null;
const isRateLimited = (e: AuthErr): boolean =>
  Boolean(e) && (e?.status === 429 || e?.code === "over_request_rate_limit" || /rate limit/i.test(e?.message ?? ""));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LOGIN_RETRY_WAIT_MS = 11_000;
const LOGIN_RETRY_TOTAL_MS = 300_000;

/**
 * 공용 계정 로그인 세션 (screen-8-helpers sessionFor 와 같은 관례).
 * 전체 실행에서는 워커·스펙마다 공용 계정 비밀번호 로그인이 겹쳐 Supabase Auth 로그인 한도(IP 당)를 넘길 수 있다. 그래서
 * 1) service role 키가 있으면 일회용 로그인 토큰(generateLink — 메일 없음)을 verifyOtp 로 바꿔 세션을 얻고(로그인 한도와 따로 센다),
 * 2) 안 되면 비밀번호 로그인, 한도에 걸리면 기다렸다 다시 한다.
 */
async function loginClient(role: Role): Promise<{ client: SupabaseClient; userId: string }> {
  const email = need(`${ENV_PREFIX[role]}_EMAIL`);
  const password = need(`${ENV_PREFIX[role]}_PASSWORD`);
  const url = need("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const deadline = Date.now() + LOGIN_RETRY_TOTAL_MS;
  for (;;) {
    let last: AuthErr = null;
    if (serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const tokenHash = link.data?.properties?.hashed_token;
      if (!link.error && tokenHash) {
        const client = newClient();
        const v = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
        if (!v.error && v.data.user) return { client, userId: v.data.user.id };
        last = v.error;
      } else {
        last = link.error;
      }
    }
    const client = newClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (!error && data.user) return { client, userId: data.user.id };
    if (!(isRateLimited(error) || isRateLimited(last)) || Date.now() > deadline) {
      throw new Error(`${ROLE_LABEL[role]} 로그인 실패: 토큰 확인 = ${last?.message ?? "-"}, 비밀번호 = ${error?.message ?? "-"}`);
    }
    await sleep(LOGIN_RETRY_WAIT_MS);
  }
}

/** 역할 계정으로 로그인 (워커당 1회). profiles 자기 행에서 school_id·role 확인. */
export function signIn(role: Role): Promise<Session> {
  let p = cache.get(role);
  if (!p) {
    p = (async () => {
      const { client, userId } = await loginClient(role);
      const data = { user: { id: userId } };
      const prof = await client
        .from("profiles")
        .select("school_id, role")
        .eq("user_id", data.user.id)
        .single();
      if (prof.error || !prof.data) throw new Error(`${ROLE_LABEL[role]} profiles 자기 행 없음: ${prof.error?.message}`);
      return {
        role,
        client,
        userId: data.user.id,
        schoolId: prof.data.school_id as string,
        profileRole: prof.data.role as string,
      };
    })();
    cache.set(role, p);
    p.catch(() => cache.delete(role));
  }
  return p;
}

/** 프로젝트(mobile/desktop)가 동시에 돌 때 같은 행을 바꾸지 않도록 나누는 번호 */
export function projectIndex(info: TestInfo): number {
  return info.project.name === "mobile" ? 0 : 1;
}

/** 재고를 바꾸는 테스트가 쓰는 시약 칸 (프로젝트·용도별로 겹치지 않게) */
export const REAGENT_SLOT = { ensureLog: 0, recordUsage: 2, studentStockAttempt: 4 } as const;

export interface ReagentRow {
  id: string;
  school_id: string;
  name: string;
  stock: number;
  min_stock: number;
}

/** 자기 학교 시약 목록 (id 순) */
export async function ownReagents(s: Session): Promise<ReagentRow[]> {
  const { data, error } = await s.client
    .from("reagents")
    .select("id, school_id, name, stock, min_stock")
    .order("id");
  if (error) throw new Error(`시약 조회 실패(${ROLE_LABEL[s.role]}): ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, stock: Number(r.stock), min_stock: Number(r.min_stock) })) as ReagentRow[];
}

/** 다른 테스트가 잠깐 넣었다 지우는 임시 시약 이름 (tempReagent · insert 시도) */
/** 화면 7 화면(e2e) 테스트가 만드는 임시 시약 이름 접두사 (screen-7-*.spec.ts) */
export const S7_UI_TEMP_PREFIX = "S7-ui-";
const TEMP_REAGENT_PREFIXES = ["R-db-", "N1-db-", S7_UI_TEMP_PREFIX];

/**
 * 시약 칸 고르기. 임시 시약(무작위 uuid 라 id 순서 어디에나 끼어듦)은 빼고 센다 —
 * 끼어들면 칸이 밀려 다른 테스트(화면 4 기록 흐름 등)가 쓰는 시약과 겹친다.
 */
export function pickReagent(list: ReagentRow[], base: number, info: TestInfo): ReagentRow {
  const stable = list.filter((r) => !TEMP_REAGENT_PREFIXES.some((p) => r.name.startsWith(p)));
  if (stable.length === 0) throw new Error("자기 학교 시약이 0개 (seed.sql 확인)");
  const idx = Math.min(base + projectIndex(info), stable.length - 1);
  return stable[idx];
}

export async function readStock(s: Session, reagentId: string): Promise<number> {
  const { data, error } = await s.client.from("reagents").select("stock").eq("id", reagentId).single();
  if (error || !data) throw new Error(`stock 조회 실패: ${error?.message}`);
  return Number(data.stock);
}

/** 교사(staff) 계정으로 stock 을 절대값으로 되돌린다 */
export async function restoreStock(staff: Session, reagentId: string, stock: number): Promise<void> {
  const { data, error } = await staff.client
    .from("reagents")
    .update({ stock })
    .eq("id", reagentId)
    .select("stock");
  if (error || !data || data.length !== 1) {
    throw new Error(`stock 원상복구 실패: ${error?.message ?? `${data?.length ?? 0}행`}`);
  }
}

/**
 * 학교(staff 계정)의 usage_logs 가 0행이면 record_usage(1)로 1행 만들고 stock 을 되돌린다.
 * 교차 학교 조회가 "원래 0행이라 0" 이 되지 않도록 하는 양성 대조군 준비.
 */
export async function ensureUsageLog(staff: Session, info: TestInfo): Promise<void> {
  const { data, error } = await staff.client.from("usage_logs").select("id").limit(1);
  if (error) throw new Error(`usage_logs 조회 실패: ${error.message}`);
  if ((data ?? []).length > 0) return;
  const r = pickReagent(await ownReagents(staff), REAGENT_SLOT.ensureLog, info);
  const before = await readStock(staff, r.id);
  const rpc = await staff.client.rpc("record_usage", { reagent_id: r.id, amount: 1 });
  try {
    if (rpc.error) throw new Error(`record_usage 실패(대조군 준비): ${rpc.error.message}`);
  } finally {
    await restoreStock(staff, r.id, before);
  }
}

/** 이 학교 계정이 볼 수 있는 업무 테이블 행 id (양성 대조군 겸 교차 학교 대상) */
export const SCHOOL_TABLES = ["reagents", "usage_logs", "cabinets", "cabinet_slots"] as const;
export type SchoolTable = (typeof SCHOOL_TABLES)[number];

export async function ownIds(s: Session, table: SchoolTable | "profiles"): Promise<string[]> {
  const key = table === "profiles" ? "user_id" : "id";
  const { data, error } = await s.client.from(table).select(key);
  if (error) throw new Error(`${table} 조회 실패(${ROLE_LABEL[s.role]}): ${error.message}`);
  return (data ?? []).map((r) => (r as Record<string, string>)[key]);
}

/** 각 테이블에서 update 대상으로 쓸 무해한 열 (값은 그대로 두거나 표시용 텍스트) */
export function harmlessPatch(table: SchoolTable): Record<string, unknown> {
  switch (table) {
    case "reagents":
      return { name: "N1-db-침범" };
    case "usage_logs":
      return { amount: 999999 };
    case "cabinets":
      return { label: "N1-db-침범" };
    case "cabinet_slots":
      return { storage_class: "기타" };
  }
}

export function uniqueTag(info: TestInfo): string {
  return `test-${info.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
