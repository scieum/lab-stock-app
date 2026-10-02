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
