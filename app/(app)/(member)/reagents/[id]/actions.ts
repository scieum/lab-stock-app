"use server";

import { revalidatePath } from "next/cache";
import {
  placeReagentAt,
  resetReorderThreshold,
  setReorderThreshold,
  type PlaceReagentResult,
  type ResetReorderThresholdResult,
  type SetReorderThresholdResult,
} from "@/lib/supabase/reagent-detail";

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/**
 * 위치 피커 저장 (d7 §14). reagentId · location({cabinetId, side, shelf} | null = 칸 없음)만 꺼내 lib/supabase 가 형식을 다시 보고,
 * 칸 id 는 로그인 세션(RLS: 자기 학교 칸만)으로 찾는다. 교사·admin·자기 학교·데모 거부는 DB 함수 place_reagent 가 본다.
 * 분류 불일치·위험 조합은 막지 않는다. 시약 상세·화면 11 칸 시약 수·칸 없음 목록·홈 시약장 요약이 바뀌므로 전체를 다시 받게 한다.
 */
export async function placeReagentAtAction(input: unknown): Promise<PlaceReagentResult> {
  const raw = field(input, "location");
  const location =
    raw !== null && typeof raw === "object"
      ? { cabinetId: field(raw, "cabinetId"), side: field(raw, "side"), shelf: field(raw, "shelf") }
      : null;
  const result = await placeReagentAt({ reagentId: field(input, "reagentId"), location });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return result;
}

/**
 * 재주문 기준 직접 입력 (d7 §14). reagentId · minStock 만 꺼내 lib/reorder-rules checkThreshold 로 다시 검증하고,
 * 교사·admin·자기 학교·데모 거부는 DB 함수 set_reorder_threshold 가 본다.
 * 재고 부족 배지(시약 목록·상세)·홈 재고 요약·재주문 알림(화면 6)이 바뀌므로 전체를 다시 받게 한다.
 */
export async function setReorderThresholdAction(input: unknown): Promise<SetReorderThresholdResult> {
  const result = await setReorderThreshold({ reagentId: field(input, "reagentId"), minStock: field(input, "minStock") });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return result;
}

/**
 * "자동으로 돌리기" (d7 §11-1). reagentId 만 꺼내 lib/supabase 가 형식을 다시 보고,
 * 교사·admin·자기 학교·데모 거부는 DB 함수 reset_reorder_threshold 가 본다. 출처 'auto' + 자동 값으로 다시 계산.
 * 재고 부족 배지·홈 재고 요약·화면 6 알림이 바뀌므로 전체를 다시 받게 한다.
 */
export async function resetReorderThresholdAction(input: unknown): Promise<ResetReorderThresholdResult> {
  const result = await resetReorderThreshold({ reagentId: field(input, "reagentId") });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return result;
}
