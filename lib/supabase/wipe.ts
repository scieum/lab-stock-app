import "server-only";
import { createClient } from "./server";
import { isValidYmd, RECORD_WIPE_TEXT, SCHOOL_NAME_TEXT, type WipeCounts } from "@/lib/wipe-rules";

/**
 * 시약 전체 삭제 · 기록 삭제 (d7 §29, design/rules.json 1.29 wipe) — DB 함수 wipe_reagents · count_wipe_records · wipe_records.
 * 로그인 세션(publishable 키 + 쿠키)으로 부른다 (service role 미사용). admin · 자기 학교 · 데모 거부 · 학교명 일치 · 미래 날짜는
 * DB 함수가 다시 확인한다 — 학교명은 사용자가 입력한 그대로 넘긴다(앞뒤 공백 정리는 DB 가 btrim 으로).
 */

const SIGNED_OUT = "다시 로그인해 주세요";
const ADMIN_ONLY = "관리자만 할 수 있어요";
const DEMO = "둘러보기에서는 지울 수 없어요";
const FAILED = "삭제하지 못했어요. 잠시 후 다시 시도해 주세요";

export type WipeReagentsResult = { ok: true; count: number } | { ok: false; error: string };
export type WipeRecordsResult = { ok: true; counts: WipeCounts } | { ok: false; error: string };

type DbError = { code?: string; message?: string };

function errorText(error: DbError): string {
  if (error.code === "42501") {
    if (error.message === "not authenticated" || error.message === "no profile") return SIGNED_OUT;
    if (error.message === "demo school is read-only") return DEMO;
    return ADMIN_ONLY;
  }
  if (error.code === "22023") {
    if (error.message === "school name mismatch") return SCHOOL_NAME_TEXT.mismatch;
    if (error.message === "before date in the future") return RECORD_WIPE_TEXT.futureDate;
  }
  return FAILED;
}

/** p_before: null = 전체, "YYYY-MM-DD" = 그날 미포함 이전. 그 밖의 값은 undefined (부르지 않는다) */
function beforeParam(raw: unknown): string | null | undefined {
  if (raw === null) return null;
  return typeof raw === "string" && isValidYmd(raw) ? raw : undefined;
}

function toCounts(data: unknown): WipeCounts | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const usage = Number(o.usage_count);
  const intake = Number(o.intake_count);
  return Number.isFinite(usage) && Number.isFinite(intake) ? { usage, intake } : null;
}

async function signedInClient() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return claims?.claims?.sub ? supabase : null;
}

/** 시약 전체 삭제 = 보관 안 된 우리 학교 시약 전부 보관 (반환 = 보관한 수) */
export async function wipeReagents(schoolName: unknown): Promise<WipeReagentsResult> {
  if (typeof schoolName !== "string") return { ok: false, error: SCHOOL_NAME_TEXT.mismatch };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT };
  const { data, error } = await supabase.rpc("wipe_reagents", { p_school_name: schoolName });
  if (error) return { ok: false, error: errorText(error) };
  return { ok: true, count: typeof data === "number" ? data : Number(data) || 0 };
}

/** 기록 삭제 미리보기 수 (wipe-preview) */
export async function countWipeRecords(before: unknown): Promise<WipeRecordsResult> {
  const p = beforeParam(before);
  if (p === undefined) return { ok: false, error: RECORD_WIPE_TEXT.invalidDate };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT };
  const { data, error } = await supabase.rpc("count_wipe_records", { p_before: p });
  if (error) return { ok: false, error: errorText(error) };
  const counts = toCounts(data);
  return counts ? { ok: true, counts } : { ok: false, error: FAILED };
}

/** 기록 삭제 — 범위 안의 사용 · 입고 기록(수업 정보 포함)을 실제로 지운다. 재고는 그대로 */
export async function wipeRecords(before: unknown, schoolName: unknown): Promise<WipeRecordsResult> {
  const p = beforeParam(before);
  if (p === undefined) return { ok: false, error: RECORD_WIPE_TEXT.invalidDate };
  if (typeof schoolName !== "string") return { ok: false, error: SCHOOL_NAME_TEXT.mismatch };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT };
  const { data, error } = await supabase.rpc("wipe_records", { p_before: p, p_school_name: schoolName });
  if (error) return { ok: false, error: errorText(error) };
  const counts = toCounts(data);
  return counts ? { ok: true, counts } : { ok: false, error: FAILED };
}
