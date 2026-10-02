import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// RLS를 우회하는 서버 전용 클라이언트. NEIS 학교 생성처럼 꼭 필요한 곳에서만 쓴다.
export class MissingServiceRoleError extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않아 학교를 새로 등록할 수 없습니다. " +
        "서버 환경변수(.env.local 또는 Vercel)에 직접 넣어 주세요.",
    );
    this.name = "MissingServiceRoleError";
  }
}

export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  if (!key) throw new MissingServiceRoleError();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Supabase 오류에서 원인 판별에 쓰는 값만 (메시지 원문은 로그·응답에 내지 않는다) */
export type AdminErrorInfo = { status?: number; code?: string; message?: string };

// PostgREST: 42501 = 실행 권한 없음(키가 service_role 이 아님), PGRST3xx = JWT·역할 오류
const CONFIG_CODES = new Set([
  "42501",
  "PGRST300",
  "PGRST301",
  "PGRST302",
  "bad_jwt",
  "no_authorization",
  "not_admin",
]);

/**
 * service role 키가 무효이거나 service role 로 인정되지 않아 생긴 오류인가 (서버 설정 문제).
 * 401·403, 권한 거부(42501), JWT·API 키 오류.
 */
export function isAdminConfigError(e: AdminErrorInfo | null | undefined): boolean {
  if (!e) return false;
  if (e.status === 401 || e.status === 403) return true;
  if (e.code && CONFIG_CODES.has(e.code)) return true;
  return /\bjwt\b|api key|permission denied/i.test(e.message ?? "");
}

/** 서버 로그용 요약 (상태·코드만, 키 값·메시지 원문 없음) */
export function adminErrorTag(e: AdminErrorInfo | null | undefined): string {
  if (!e) return "unknown";
  return `status=${e.status ?? "-"} code=${e.code ?? "-"}`;
}

export function toAdminErrorInfo(e: unknown, status?: number): AdminErrorInfo {
  if (e && typeof e === "object") {
    const o = e as { status?: unknown; code?: unknown; message?: unknown };
    return {
      status: typeof o.status === "number" ? o.status : status,
      code: typeof o.code === "string" ? o.code : undefined,
      message: typeof o.message === "string" ? o.message : undefined,
    };
  }
  return { status };
}
