"use server";

import { revalidatePath } from "next/cache";
import {
  addCabinet,
  deleteCabinet,
  renameCabinet,
  saveCabinetLayout,
  type AddCabinetResult,
  type DeleteCabinetResult,
  type RenameCabinetResult,
  type SaveCabinetLayoutResult,
} from "@/lib/supabase/cabinets";

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/**
 * 시약장 추가. 입력을 받지 않는다 — 학교·호출자 역할·이름·기본 격자는 DB 함수 add_cabinet 이 로그인 세션으로 정한다.
 * 시약장 수는 홈 요약에도 나온다.
 */
export async function addCabinetAction(): Promise<AddCabinetResult> {
  const result = await addCabinet();
  if (!result.ok) return result;
  revalidatePath("/cabinets");
  revalidatePath("/");
  return result;
}

/**
 * 이름 바꾸기. 클라이언트 값은 믿지 않는다 — cabinetId·label 만 꺼내 lib/cabinet-rules(isCabinetId·checkCabinetName)로
 * 다시 검증하고(lib/supabase/cabinets), 교사·admin·자기 학교·중복 이름은 DB 함수 rename_cabinet 이 본다.
 * 시약장 이름은 시약 상세의 칸 위치에도 나오므로 전체를 다시 받게 한다.
 */
export async function renameCabinetAction(input: unknown): Promise<RenameCabinetResult> {
  const result = await renameCabinet({ cabinetId: field(input, "cabinetId"), label: field(input, "label") });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return result;
}

/**
 * 설정 저장. cabinetId·doorType·shelves·slots 만 꺼내 lib/cabinet-rules(checkCabinetLayout)로 다시 검증한다.
 * 칸이 줄면 그 칸의 시약이 "칸 없음"이 된다 — 홈 요약·시약 목록·시약 상세의 칸 위치가 바뀌므로 전체를 다시 받게 한다.
 */
export async function saveCabinetLayoutAction(input: unknown): Promise<SaveCabinetLayoutResult> {
  const result = await saveCabinetLayout({
    cabinetId: field(input, "cabinetId"),
    doorType: field(input, "doorType"),
    shelves: field(input, "shelves"),
    slots: field(input, "slots"),
  });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return result;
}

/** 시약장 삭제. 배치됐던 시약이 "칸 없음"이 된다 — 홈 요약·시약 목록·시약 상세가 바뀌므로 전체를 다시 받게 한다. */
export async function deleteCabinetAction(input: unknown): Promise<DeleteCabinetResult> {
  const result = await deleteCabinet({ cabinetId: field(input, "cabinetId") });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return result;
}
