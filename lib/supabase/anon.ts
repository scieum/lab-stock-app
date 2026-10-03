import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { getSupabasePublicEnv } from "./env";

/**
 * 비로그인(anon) 클라이언트 — 둘러보기(/demo) 전용.
 * 쿠키·세션을 전혀 붙이지 않아 로그인 상태와 무관하게 항상 anon 역할로 읽는다
 * (RLS *_select_demo_anon 정책 = 데모 학교 행만). service role 은 쓰지 않는다 (N2).
 */
export function createAnonClient(): SupabaseClient<Database> {
  const { url, key } = getSupabasePublicEnv();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
