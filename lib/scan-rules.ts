import { cabinetMeta, slotTitle, type DoorType, type SlotKey, type SlotSide } from "@/lib/cabinet-rules";

// 화면 12 QR 찾기 — 서버·클라이언트 공용 순수 규칙 (d7 §26). DB 조회는 lib/supabase/scan.ts.

/** 번호로 찾기 범위 (d7 §26: 정수 1~9999) */
export const CABINET_NUMBER_MIN = 1;
export const CABINET_NUMBER_MAX = 9999;

export const SCAN_TEXT = {
  notNumber: "시약장 번호를 숫자로 적어 주세요",
  notCabinetQr: "시약장 QR이 아니에요",
  cameraUnavailable: "카메라를 쓸 수 없어요. 시약장 번호로 찾아 주세요",
  empty: "이 시약장에는 아직 시약이 없어요",
} as const;

/** 번호가 없을 때 입력 아래 오류: "{n}번 시약장이 없어요" */
export function cabinetMissingText(n: number): string {
  return `${n}번 시약장이 없어요`;
}

/** 다른 학교·삭제된 시약장 QR 토스트: "{학교명} 시약장 QR이 아니에요" (학교명 = 로그인 사용자 학교) */
export function notOurCabinetText(schoolName: string): string {
  return `${schoolName} 시약장 QR이 아니에요`;
}

/** 번호 입력 검사 — 앞뒤 공백 무시, 정수 1~9999 만 */
export function parseCabinetNumber(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const t = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  if (!/^\d{1,4}$/.test(t)) return { ok: false, error: SCAN_TEXT.notNumber };
  const n = Number(t);
  if (!Number.isInteger(n) || n < CABINET_NUMBER_MIN || n > CABINET_NUMBER_MAX) return { ok: false, error: SCAN_TEXT.notNumber };
  return { ok: true, value: n };
}

/** 결과 시트 캡션 "{문 종류} · {N}단 · 시약 {k}개" — 화면 11 cabinet-meta(short)와 같은 글자 */
export function scanCaption(doorType: DoorType, shelves: number, reagentCount: number): string {
  return `${cabinetMeta(doorType, shelves, "short")} · 시약 ${Math.max(0, Math.trunc(reagentCount))}개`;
}

/** 칸 위치 글자 "좌 1단" (단문형 "1단") — 화면 3 보관 위치·화면 11 칸 시트 제목과 같은 꼴 */
export function scanSlotText(key: SlotKey, doorType: DoorType): string {
  return slotTitle(key, doorType);
}

const SIDE_ORDER: Record<SlotSide, number> = { L: 0, R: 1 };

/** 결과 목록 순서 = 칸 순서(문 → 단), 같은 칸은 이름순 (시안 12-result: 좌 1단 · 좌 1단 · 좌 2단 · 우 1단) */
export function compareScanRows(
  a: { side: SlotSide; shelf: number; name: string; id?: string },
  b: { side: SlotSide; shelf: number; name: string; id?: string },
): number {
  return (
    SIDE_ORDER[a.side] - SIDE_ORDER[b.side] ||
    a.shelf - b.shelf ||
    a.name.localeCompare(b.name, "ko") ||
    (a.id ?? "").localeCompare(b.id ?? "")
  );
}

/** 배치도 보기 주소 `/cabinets?c={id}` */
export function cabinetLayoutHref(cabinetId: string): string {
  return `/cabinets?c=${encodeURIComponent(cabinetId)}`;
}
