"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/supabase/server";
import { recordUsageBatch, type RecordUsageBatchResult } from "@/lib/supabase/usage-batch";

/**
 * 여러 시약 사용 기록 저장 (d7 §24). 입력은 lib/supabase/usage-batch 가 다시 검사하고, 권한(로그인 · 자기 학교 · 데모 거부) ·
 * 보관 시약 거부 · 재고 · 학교급별 학년 범위는 DB 함수 record_usage_batch 가 한 트랜잭션으로 본다.
 * 재고(목록 · 상세 · 홈 · 재주문)와 기록(화면 10 · 홈)이 바뀌므로 전체를 다시 받게 한다.
 */
export async function recordUsageBatchAction(input: unknown): Promise<RecordUsageBatchResult> {
  const me = await getServerSession();
  if (me.kind !== "member") return { ok: false, error: "다시 로그인해 주세요" };
  const result = await recordUsageBatch(input, me.school.name);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
