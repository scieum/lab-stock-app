"use server";

import { revalidatePath } from "next/cache";
import { toggleVendorFavorite, type ToggleFavoriteResult } from "@/lib/supabase/vendors";

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/**
 * 판매처 즐겨찾기 추가·해제 (d7 §12-1, 교사·admin). 클라이언트 값은 vendorId·favorite 만 꺼낸다 —
 * 학교·작성자는 로그인 세션으로 서버가 정한다. 바뀌면 화면 6·9 의 판매처 목록이 달라진다.
 */
export async function toggleVendorFavoriteAction(input: unknown): Promise<ToggleFavoriteResult> {
  const result = await toggleVendorFavorite({ vendorId: field(input, "vendorId"), favorite: field(input, "favorite") });
  if (result.ok) {
    revalidatePath("/reorder");
    revalidatePath("/vendors");
  }
  return result;
}
