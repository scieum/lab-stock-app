"use server";

import { findCabinet } from "./find-cabinet";
import type { ScanFindResult } from "./scan-types";

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/**
 * 화면 12 시약장 찾기 (읽기만, 모든 역할). 클라이언트 값은 믿지 않는다 — cabinetId(QR 에서 꺼낸 uuid) 또는 number 만 꺼내
 * lib/supabase/scan 이 다시 검사하고, 학교는 로그인 세션 + RLS 로 정한다. 영상·사진은 받지 않는다 (QR 은 브라우저에서 읽는다).
 */
export async function findCabinetAction(input: unknown): Promise<ScanFindResult> {
  const by = field(input, "by");
  if (by === "qr") return findCabinet({ cabinetId: field(input, "cabinetId") });
  if (by === "number") return findCabinet({ number: field(input, "number") });
  return { kind: "error", text: "잘못된 요청이에요" };
}
