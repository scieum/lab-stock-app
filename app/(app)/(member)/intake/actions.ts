"use server";

import { revalidatePath } from "next/cache";
import {
  recordIntake,
  registerReagent,
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
export async function registerReagentAction(input: unknown): Promise<RegisterReagentResult> {
  const msdsUrl = field(input, "msdsUrl");
  const result = await registerReagent({
    name: str(field(input, "name")),
    storageClass: str(field(input, "storageClass")),
    stock: num(field(input, "stock")),
    unit: str(field(input, "unit")),
    intakeDate: str(field(input, "intakeDate")),
    msdsUrl: typeof msdsUrl === "string" ? msdsUrl : null,
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
