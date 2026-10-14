"use server";

import { revalidatePath } from "next/cache";
import { countWipeRecords, wipeRecords, type WipeRecordsResult } from "@/lib/supabase/wipe";

/** 기록 삭제 미리보기 수 (화면 10 wipe-preview, d7 §29) — before = null(전체) 또는 "YYYY-MM-DD"(그날 미포함) */
export async function countWipeRecordsAction(before: unknown): Promise<WipeRecordsResult> {
  return countWipeRecords(before);
}

/**
 * 기록 삭제 (화면 10, d7 §29) — 학교명은 입력한 그대로 DB 함수 wipe_records 에 넘긴다
 * (admin · 자기 학교 · 데모 거부 · 학교명 일치 · 미래 날짜 거부는 DB 가 확인, 한 트랜잭션). 재고는 바뀌지 않는다.
 * 기록 · 홈 최근 사용 · 시약 상세 사용 내역 · 재주문 알림이 바뀌므로 2 · 10 · 13 · 6 (+ 18) 을 다시 받게 한다.
 */
export async function wipeRecordsAction(before: unknown, schoolName: unknown): Promise<WipeRecordsResult> {
  const result = await wipeRecords(before, schoolName);
  if (result.ok) {
    revalidatePath("/reagents", "layout");
    revalidatePath("/usage");
    revalidatePath("/");
    revalidatePath("/reorder");
    revalidatePath("/manage");
  }
  return result;
}
