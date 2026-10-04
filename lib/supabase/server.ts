import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./env";
import type { Database } from "@/lib/types/database";

export async function createClient() {
  const { url, key } = getSupabasePublicEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component에서 호출된 경우 무시 (세션 갱신은 proxy에서 처리)
        }
      },
    },
  });
}

/**
 * 요청 하나에서 함께 쓰는 서버 클라이언트 (React cache — layout·page·데이터 함수가 같은 인스턴스를 쓴다).
 * 로그인 세션(publishable 키 + 쿠키)만 — service role 아님.
 */
export const getServerClient = cache(createClient);

export type SessionRole = "student" | "teacher" | "admin";
export type SessionSchool = { id: string; name: string };

export type ServerSession =
  /** 세션 없음 (JWT 검증 실패 포함) */
  | { kind: "signed-out" }
  /** 로그인은 됐지만 프로필이 없다 — 학교에서 내보낸 계정 (d7 §8) */
  | { kind: "no-school"; userId: string }
  /** 프로필·학교를 읽지 못했다 (일시 오류) — 내보낸 계정으로 단정하지 않는다 */
  | { kind: "unavailable"; userId: string }
  | { kind: "member"; userId: string; role: SessionRole; displayName: string; school: SessionSchool };

/**
 * 로그인 사용자 = JWT 검증(getClaims) + 자기 프로필(role·display_name·school_id) + 자기 학교.
 * React cache 로 요청당 한 번만 실행된다 — layout·page·데이터 함수가 각자 불러도 같은 결과(같은 Promise)를 받는다.
 * 인증 검증을 건너뛰는 것이 아니라, 같은 요청 안에서 같은 검증을 되풀이하지 않는 것이다.
 * 프로필과 학교는 한 번에(병렬) 읽는다 — RLS: profiles 자기 행, schools 자기 학교 한 행만.
 */
export const getServerSession = cache(async (): Promise<ServerSession> => {
  const supabase = await getServerClient();
  // getClaims는 JWT를 검증한다 (쿠키 값을 그대로 믿지 않음)
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { kind: "signed-out" };

  const [profile, school] = await Promise.all([
    supabase.from("profiles").select("role, display_name, school_id").eq("user_id", userId).maybeSingle(),
    supabase.from("schools").select("id, name").maybeSingle(),
  ]);
  if (profile.error) return { kind: "unavailable", userId };
  const me = profile.data;
  // 프로필 조회가 오류 없이 0행일 때만 "no-school"
  if (!me) return { kind: "no-school", userId };
  if (school.error || !school.data || school.data.id !== me.school_id) return { kind: "unavailable", userId };
  const role = (["student", "teacher", "admin"] as const).find((r) => r === me.role) ?? "student";
  return { kind: "member", userId, role, displayName: me.display_name, school: school.data };
});
