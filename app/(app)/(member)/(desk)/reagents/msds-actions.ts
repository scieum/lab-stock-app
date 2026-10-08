"use server";

import { revalidatePath } from "next/cache";
import { setReagentMsds, type SetReagentMsdsResult } from "@/lib/supabase/msds";

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/**
 * 시약에 MSDS 주소 넣기 (d7 §20, 화면 3 · 화면 2 일괄). reagentId · msdsUrl · casNo 만 꺼내 lib/supabase/msds 가 형식을 다시 보고,
 * 교사·admin·자기 학교·데모 거부·CAS 는 비어 있을 때만은 DB 함수 set_reagent_msds 가 본다.
 * revalidate = false 면 다시 받기를 미룬다 (화면 2 일괄: 끝난 뒤 한 번).
 */
export async function setReagentMsdsAction(input: unknown): Promise<SetReagentMsdsResult> {
  const result = await setReagentMsds({
    reagentId: field(input, "reagentId"),
    msdsUrl: field(input, "msdsUrl"),
    casNo: field(input, "casNo"),
  });
  if (!result.ok) return result;
  if (field(input, "revalidate") !== false) revalidatePath("/", "layout");
  return result;
}

/** 화면 2 일괄 찾기가 끝난 뒤 목록·상세를 다시 받게 한다 */
export async function refreshAfterMsdsAction(): Promise<void> {
  revalidatePath("/", "layout");
}
