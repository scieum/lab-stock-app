import "server-only";
import { formatStock } from "@/lib/format";
import { cabinetMissingText, notOurCabinetText, SCAN_TEXT } from "@/lib/scan-rules";
import { lookupScanCabinet, type ScanLookupResult } from "@/lib/supabase/scan";
import { SCAN_ERROR_TEXT, type ScanFindResult } from "./scan-types";

/** lookupScanCabinet 결과 → 화면에 넘길 모양 (d7 §26 QR 해석 · 번호로 찾기 · 결과) */
function toFindResult(r: ScanLookupResult): ScanFindResult {
  switch (r.kind) {
    case "found":
      return {
        kind: "found",
        cabinet: {
          id: r.cabinet.id,
          number: r.cabinet.number,
          label: r.cabinet.label,
          caption: r.cabinet.caption,
          layoutHref: r.cabinet.layoutHref,
          rows: r.cabinet.reagents.map((x) => ({
            id: x.id,
            name: x.name,
            stock: formatStock(x.stock, x.unit),
            slot: x.slotText,
            lowStock: x.lowStock,
          })),
        },
      };
    case "not-ours":
      return { kind: "toast", text: notOurCabinetText(r.schoolName) };
    case "none":
      return { kind: "field", text: cabinetMissingText(r.number) };
    case "invalid":
      return r.by === "id" ? { kind: "toast", text: SCAN_TEXT.notCabinetQr } : { kind: "field", text: SCAN_TEXT.notNumber };
    case "signed-out":
    case "no-school":
      return { kind: "signed-out" };
    default:
      return { kind: "error", text: SCAN_ERROR_TEXT };
  }
}

/** QR(시약장 id) 또는 번호로 로그인 사용자 학교의 시약장을 찾는다 — 학교는 세션에서만 (RLS) */
export async function findCabinet(query: { cabinetId: unknown } | { number: unknown }): Promise<ScanFindResult> {
  try {
    return toFindResult(await lookupScanCabinet(query));
  } catch {
    return { kind: "error", text: SCAN_ERROR_TEXT };
  }
}
