"use server";

import { revalidatePath } from "next/cache";
import { saveReorderBasis, type SaveReorderBasisResult } from "@/lib/supabase/manual";

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/**
 * 재주문 기준 저장 (화면 5 "확인 후 저장"). 클라이언트 값은 믿지 않는다 — items 만 꺼내 넘기고,
 * 모양·범위는 lib/supabase/manual(checkItems)이, 역할·학교는 로그인 세션으로 DB 함수 save_reorder_basis 가 정한다
 * (school_id·role 을 입력으로 받지 않는다 — 들어 있어도 쓰지 않는다).
 * 기준이 바뀌면 재주문 알림(화면 6)·홈의 재고 부족 수·시약 목록·상세의 재고 부족 표시가 달라진다 → 로그인 후 화면 전체를 다시 그린다.
 */
export async function saveReorderBasisAction(input: unknown): Promise<SaveReorderBasisResult> {
  const result = await saveReorderBasis({ items: field(input, "items") });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
