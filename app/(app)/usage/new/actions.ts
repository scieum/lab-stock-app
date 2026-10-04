"use server";

import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/supabase/usage-entry";
import { formatStock } from "@/lib/format";
import { checkUsageMemo } from "@/lib/usage-history-rules";

export type RecordUsageResult =
  | { ok: true; stock: number }
  | { ok: false; error: string; stock?: number };

const AMOUNT_RE = /^[-+]?\d+(\.\d+)?$/;
const NOT_FOUND = "시약을 찾을 수 없어요";

/** 사용량 문자열 검사 — 숫자 아님 · 0 이하는 사용자에게 보이는 에러 */
function parseAmount(raw: string): number | string {
  const v = raw.trim();
  if (v === "") return "사용량을 입력해 주세요";
  if (!AMOUNT_RE.test(v)) return "사용량은 숫자로 입력해 주세요";
  const n = Number(v);
  if (!Number.isFinite(n)) return "사용량은 숫자로 입력해 주세요";
  if (n <= 0) return "사용량은 0보다 커야 해요";
  return n;
}

/**
 * 사용 기록 저장 — 로그인 세션 클라이언트로 DB 함수 public.record_usage 하나만 호출한다
 * (usage_logs insert 와 reagents.stock 차감은 그 함수 안에서 한 트랜잭션).
 */
export async function recordUsageAction(
  reagentId: string,
  rawAmount: string,
  rawMemo?: string | null,
): Promise<RecordUsageResult> {
  if (!isUuid(reagentId)) return { ok: false, error: NOT_FOUND };
  const amount = parseAmount(rawAmount);
  if (typeof amount === "string") return { ok: false, error: amount };
  // 메모는 선택 — 비우면 인자를 보내지 않는다 (DB 기본값 null)
  const memo = checkUsageMemo(rawMemo);
  if (!memo.ok) return { ok: false, error: memo.error };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: "다시 로그인해 주세요" };

  const { error } = await supabase.rpc("record_usage", {
    reagent_id: reagentId,
    amount,
    ...(memo.value ? { memo: memo.value } : {}),
  });

  const current = await supabase.from("reagents").select("stock, unit").eq("id", reagentId).maybeSingle();
  const stock = current.data ? Number(current.data.stock) : undefined;

  if (error) {
    switch (error.code) {
      case "22003":
        return {
          ok: false,
          error: current.data
            ? `현재 재고(${formatStock(Number(current.data.stock), current.data.unit)})보다 많이 기록할 수 없어요`
            : "현재 재고보다 많이 기록할 수 없어요",
          stock,
        };
      case "22023":
        // 사용량·메모 길이는 위에서 먼저 걸러지므로 여기까지 오는 22023 은 사용량 쪽
        return { ok: false, error: "사용량은 0보다 커야 해요", stock };
      case "P0002":
        return { ok: false, error: NOT_FOUND };
      case "42501":
        return { ok: false, error: "다시 로그인해 주세요" };
      default:
        return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요", stock };
    }
  }
  if (stock === undefined) return { ok: false, error: NOT_FOUND };
  return { ok: true, stock };
}
