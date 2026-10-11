"use server";

import { revalidatePath } from "next/cache";
import { archiveMany, type ArchiveResult } from "@/lib/supabase/sensors";

/**
 * 시약 여러 개 삭제 = 보관 (d7 §25 bulk_delete). id 목록은 lib/sensor-rules checkBulkIds 로 다시 맞추고(1~100),
 * 교사·admin · 자기 학교 · 보관 안 됨 · 데모 거부는 DB 함수 archive_reagents 가 한 트랜잭션으로 본다(하나라도 틀리면 전부 취소).
 * 목록 · 시약장 · 홈 · 재주문 알림에서 빠지므로 전체를 다시 받게 한다 (목록은 그대로 — 화면 이동 없음).
 */
export async function archiveReagentsAction(ids: unknown): Promise<ArchiveResult> {
  const result = await archiveMany("reagent", ids);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
