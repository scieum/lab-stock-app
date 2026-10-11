"use server";

import { revalidatePath } from "next/cache";
import { archiveMany, archiveSensor, upsertSensor, type ArchiveResult, type UpsertSensorResult } from "@/lib/supabase/sensors";

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/**
 * 센서 등록 · 수정 (d7 §25). 입력은 lib/supabase/sensors 가 다시 맞추고, 교사·admin · 자기 학교 · 데모 거부 · 칸 학교 검사는
 * DB 함수 upsert_sensor 가 본다. 목록 · 상세 · 홈 센서 타일이 바뀌므로 전체를 다시 받게 한다.
 */
export async function upsertSensorAction(input: unknown): Promise<UpsertSensorResult> {
  const result = await upsertSensor(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** 센서 하나 삭제(보관) — DB 함수 archive_sensor. 화면 이동은 부르는 쪽이 한다 */
export async function archiveSensorAction(input: unknown): Promise<ArchiveResult> {
  const result = await archiveSensor({ sensorId: field(input, "sensorId") });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** 센서 여러 개 삭제(보관) — DB 함수 archive_sensors (1~100, 한 트랜잭션) */
export async function archiveSensorsAction(ids: unknown): Promise<ArchiveResult> {
  const result = await archiveMany("sensor", ids);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
