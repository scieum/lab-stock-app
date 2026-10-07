import "server-only";
import { createClient } from "./server";
import { getManualAccess, type ManualAccess } from "./manual";
import { MSDS_TEXT, checkMsdsUrl, isStorableCas } from "@/lib/msds-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * MSDS 찾기를 쓸 수 있는 사용자인지 (d7 §20: 로그인 + 교사·admin + 자기 학교, 데모 학교·학생·anon 거부).
 * 실험 매뉴얼(§13)과 같은 조건이라 같은 검사를 쓴다 — 로그인 세션만(service role 미사용).
 */
export type MsdsAccess = ManualAccess;
export const getMsdsAccess: () => Promise<MsdsAccess> = getManualAccess;

export type SetReagentMsdsResult =
  | { ok: true; reagentId: string; msdsUrl: string; casNo: string | null; casFilled: boolean }
  | { ok: false; error: string };

/**
 * 시약에 MSDS 주소 넣기 (d7 §20) — DB 함수 public.set_reagent_msds 하나만 호출한다.
 * msds_url 은 http(s):// 300자 이하. CAS 는 형식이 맞을 때만 넘기고(아니면 버린다) DB 가 시약 CAS 가 비어 있을 때만 채운다.
 * 교사·admin·자기 학교·데모 거부는 DB 가 본다 (42501 · P0002).
 */
export async function setReagentMsds(input: { reagentId: unknown; msdsUrl: unknown; casNo?: unknown }): Promise<SetReagentMsdsResult> {
  if (typeof input.reagentId !== "string" || !UUID_RE.test(input.reagentId)) return { ok: false, error: MSDS_TEXT.notFound };
  const url = checkMsdsUrl(input.msdsUrl);
  if (!url.ok) return { ok: false, error: MSDS_TEXT.urlError };
  const cas = typeof input.casNo === "string" && isStorableCas(input.casNo) ? input.casNo.trim() : null;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: MSDS_TEXT.signedOut };

  const { data, error } = await supabase.rpc("set_reagent_msds", {
    p_reagent_id: input.reagentId,
    p_msds_url: url.value,
    ...(cas ? { p_cas_no: cas } : {}),
  });
  if (error) {
    switch (error.code) {
      case "22023":
        return { ok: false, error: MSDS_TEXT.urlError };
      case "P0002":
        return { ok: false, error: MSDS_TEXT.notFound };
      case "42501":
        return { ok: false, error: error.message === "not authenticated" ? MSDS_TEXT.signedOut : MSDS_TEXT.staffOnly };
      default:
        return { ok: false, error: MSDS_TEXT.saveFailed };
    }
  }
  const obj = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return {
    ok: true,
    reagentId: input.reagentId,
    msdsUrl: typeof obj.msds_url === "string" ? obj.msds_url : url.value,
    casNo: typeof obj.cas_no === "string" ? obj.cas_no : null,
    casFilled: obj.cas_filled === true,
  };
}
