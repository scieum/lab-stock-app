"use server";

import { revalidatePath } from "next/cache";
import { wipeReagents, type WipeReagentsResult } from "@/lib/supabase/wipe";

/**
 * 시약 전체 삭제 (화면 2, d7 §29) — 학교명은 입력한 그대로 DB 함수 wipe_reagents 에 넘긴다
 * (admin · 자기 학교 · 데모 거부 · 학교명 일치는 DB 가 확인, 한 트랜잭션).
 * 보관된 시약은 목록 · 시약장 · 홈 · 재주문 알림 · 관리 요약에서 빠지므로 2 · 10 · 13 · 6 (+ 11 · 18) 을 다시 받게 한다.
 */
export async function wipeReagentsAction(schoolName: unknown): Promise<WipeReagentsResult> {
  const result = await wipeReagents(schoolName);
  if (result.ok) {
    revalidatePath("/reagents", "layout");
    revalidatePath("/usage");
    revalidatePath("/");
    revalidatePath("/reorder");
    revalidatePath("/cabinets");
    revalidatePath("/manage");
  }
  return result;
}
