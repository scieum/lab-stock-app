"use server";

import { revalidatePath } from "next/cache";
import { placeReagent } from "@/lib/supabase/cabinets";
import { getLocationSuggestions, type LocationSuggestions } from "@/lib/supabase/location-suggest";
import {
  recordDocumentIntake,
  recordIntake,
  registerReagent,
  type RecordDocumentIntakeResult,
  type RecordIntakeResult,
  type RegisterReagentResult,
} from "@/lib/supabase/intake";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/**
 * 기존 시약 입고. 클라이언트 값은 믿지 않는다 — 모양을 다시 맞춘 뒤 lib/intake-rules(checkRecordIntake)로 검증하고,
 * 역할·학교는 로그인 세션으로 DB 함수 record_intake 가 정한다 (school_id·role 을 입력으로 받지 않는다).
 */
export async function recordIntakeAction(input: unknown): Promise<RecordIntakeResult> {
  const result = await recordIntake({
    reagentId: str(field(input, "reagentId")),
    amount: num(field(input, "amount")),
    intakeDate: str(field(input, "intakeDate")),
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/**
 * 새 시약 등록. lib/intake-rules(checkRegisterReagent)로 다시 검증하고,
 * school_id 는 DB 함수 register_reagent 가 호출자 프로필에서 정한다.
 */
export async function registerReagentAction(
  input: unknown,
): Promise<RegisterReagentResult & { suggest?: LocationSuggestions | null }> {
  const msdsUrl = field(input, "msdsUrl");
  const result = await registerReagent({
    name: str(field(input, "name")),
    storageClass: str(field(input, "storageClass")),
    stock: num(field(input, "stock")),
    unit: str(field(input, "unit")),
    intakeDate: str(field(input, "intakeDate")),
    msdsUrl: typeof msdsUrl === "string" ? msdsUrl : null,
  });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  // 등록 직후 위치 추천 (d7 §17) — 읽기에 실패해도 등록은 성공(화면은 지금처럼 화면 2 로)
  const suggest = await getLocationSuggestions([result.reagentId]).catch(() => null);
  return { ...result, suggest };
}

export type PlaceSuggestedResult = {
  /** 넣은 시약 id */
  placed: string[];
  /** 실패한 시약과 사람이 읽을 문구 (첫 실패) */
  error: string | null;
};

/**
 * 등록 직후 location-suggest 의 [여기에 두기] · "모두 추천대로" (d7 §17).
 * 항목마다 기존 place_reagent(lib/supabase/cabinets placeReagent)를 그대로 부른다 —
 * 교사·admin·자기 학교 시약·자기 학교 칸·데모 거부는 DB 함수가 본다. 학교·역할 값은 받지 않는다.
 */
export async function placeSuggestedAction(input: unknown): Promise<PlaceSuggestedResult> {
  const raw = field(input, "items");
  const list = Array.isArray(raw) ? raw.slice(0, 50) : [];
  const placed: string[] = [];
  let error: string | null = null;
  for (const item of list) {
    const slotId = field(item, "slotId");
    // 빼기(null)는 이 동작이 아니다 — 칸 id 가 없으면 넣지 않는다
    if (typeof slotId !== "string") {
      error ??= "칸을 찾을 수 없어요";
      continue;
    }
    const res = await placeReagent({ reagentId: field(item, "reagentId"), slotId });
    if (res.ok) placed.push(res.reagentId);
    else if (!error) error = res.error;
  }
  if (placed.length > 0) revalidatePath("/", "layout");
  return { placed, error };
}

/**
 * 서류로 입고 "확인 후 입고" (d7 §21). 입력은 lib/doc-intake-rules checkDocIntakeInput 으로 다시 맞추고
 * DB 함수 record_document_intake 하나로 저장한다(한 트랜잭션). 학교·역할 값은 받지 않는다.
 * 새 시약이 있으면 위치 추천(d7 §17)을 함께 돌려준다 — 읽기에 실패해도 저장은 성공(화면은 화면 2 로).
 */
export async function recordDocumentIntakeAction(
  input: unknown,
): Promise<RecordDocumentIntakeResult & { suggest?: LocationSuggestions | null }> {
  const result = await recordDocumentIntake(input);
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  if (result.newReagentIds.length === 0) return result;
  const suggest = await getLocationSuggestions(result.newReagentIds).catch(() => null);
  return { ...result, suggest };
}
