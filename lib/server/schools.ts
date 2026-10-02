import "server-only";
import type { School } from "@/lib/types";
import { findSchool, NeisError } from "./neis";
import { createAdminClient } from "./supabase-admin";

/**
 * NEIS 학교 코드로 schools 행을 찾고, 없으면 NEIS 정보로 만든다 (첫 가입 시).
 * schools 생성은 RLS로 막혀 있으므로 service role로만 한다.
 */
export async function ensureSchool(neisCode: string): Promise<School> {
  const admin = createAdminClient();
  const { data: existing, error: selErr } = await admin
    .from("schools")
    .select("*")
    .eq("neis_code", neisCode)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;

  const neis = await findSchool(neisCode);
  if (!neis) throw new NeisError("NEIS에서 해당 고등학교를 찾을 수 없습니다.", 404);

  const { data, error } = await admin
    .from("schools")
    .upsert(
      {
        neis_code: neis.neis_code,
        office_code: neis.office_code,
        name: neis.name,
        sido: neis.sido,
        region: neis.region,
      },
      { onConflict: "neis_code" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
