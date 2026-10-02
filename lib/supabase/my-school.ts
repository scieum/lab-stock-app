import "server-only";
import { createClient } from "./server";

/**
 * 로그인 사용자의 자기 학교 (publishable 키 + 세션, RLS schools_select_own 이 자기 학교 한 행만 돌려준다).
 * 로그인 안 됐거나 프로필이 없으면 null.
 */
export async function getMySchool(): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;
  const { data, error } = await supabase.from("schools").select("id, name").maybeSingle();
  if (error || !data) return null;
  return data;
}
