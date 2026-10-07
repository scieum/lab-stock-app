// 화면 3·11 시약 칸 배치 · 시약장 QR 순수 규칙 (lib/cabinet-rules — 디자인 1.15 추가분).
// 기대값: design/rules.json cabinet(incompatible · unassigned_label · class_mismatch · qr_label_text),
//         harness/d7-data.md §14(분류 불일치 판단 · QR 내용 `{origin}/scan?cabinet={cabinet id}`),
//         design/frames/3-mobile · 3-location-mobile · 11-slot-mobile · 11-print-mobile(시안 문구).
//         구현 상수는 rules·프레임과 같은지 비교만 한다 (기대값을 구현에서 읽지 않는다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLACEMENT_NOTE_PUT,
  PLACEMENT_NOTE_SAVE,
  QR_LABELS_PER_PAGE,
  QR_LABEL_HELP,
  SCAN_PATH,
  cabinetQrUrl,
  locationText,
  parseCabinetQr,
  placementWarnings,
  qrPrintCaption,
  slotTitle,
  type DoorType,
} from "../../lib/cabinet-rules";
import { ROOT, rules } from "./helpers";

type Cabinet = {
  door_types: string[];
  shelves: number[];
  storage_classes: string[];
  incompatible: [string, string][];
  unassigned_label: string;
  class_mismatch: string;
  qr_label_text: string[];
  qr_print_layout: string;
};
const cab = rules.cabinet as Cabinet;
const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const D7_14 = D7.slice(D7.indexOf("## 14."), D7.indexOf("\n## ", D7.indexOf("## 14.") + 1));

// ---------- 프레임 문구 ----------
type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const nodesOf = (file: string) =>
  (JSON.parse(readFileSync(join(ROOT, "design/frames", file), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const textsIn = (nodes: FrameNode[], name: string, under?: string) =>
  nodes.filter((n) => n.name === name && n.text && (!under || n.path.includes(under))).map((n) => n.text!.characters);
const F3 = nodesOf("3-mobile.json");
const F3L = nodesOf("3-location-mobile.json");
const F11S = nodesOf("11-slot-mobile.json");
const F11P = nodesOf("11-print-mobile.json");
/** 화면 3 보관 위치 값 "1번 시약장 · 우 1단" (reagent-location > field-value > value) */
const FRAME_LOCATION = textsIn(F3, "value", "reagent-location")[0];
const FRAME_LOCATION_NUMBER = textsIn(F3, "label", "cabinet-number").filter((_, i, a) => a.length > 0)[0];
/**
 * 3-location mix-warning: 강한 문구 + 보조 줄.
 * 디자인 1.17(fadfee7)에서 3-location 시안이 위치 추천(suggest-badge) 시안으로 바뀌며 피커의 mix-warning 이 빠졌다
 * (rules cabinet.class_mismatch 는 그대로). 강한 문구는 rules incompatible + 아래 dangerText 틀로만 확인하고,
 * 피커 보조 줄("저장" 쪽) 문구의 시안 대조는 위치 추천 run(다음 run)에서 새 시안 기준으로 다시 정한다.
 */
const FRAME_DANGER = textsIn(F3L, "warning-line", "mix-warning");
/** 11-slot 칸 시트 제목 "좌 2단" · 약한 문구 */
const FRAME_SHEET_TITLE = textsIn(F11S, "sheet-title-text", "slot-sheet")[0];
const FRAME_MISMATCH = textsIn(F11S, "warning-line", "slot-sheet")[0];
/** 11-print 라벨 안내 · 미리보기 안내 */
const FRAME_LABEL_HELP = textsIn(F11P, "label-help", "qr-label");
const FRAME_PRINT_CAPTION = textsIn(F11P, "print-caption", "qr-print-sheet")[0];
const FRAME_PRINT_LABELS = F11P.filter((n) => n.name === "qr-label" && n.path.includes("a4-preview")).length;

// ---------- 규칙에서 도출한 기대값 ----------
const SIDE: Record<"L" | "R", string> = { L: "좌", R: "우" };
// 받침 표 (분류 8종을 손으로 적은 표 — 구현의 받침 계산과 독립)
const BATCHIM: Record<string, boolean> = { 유기: false, 산: true, 염기: false, 산화제: false, 인화성: true, 무기염: true, 독성: true, 기타: false };
/** 3-location 시안 "산화제와 유기는 섞으면 위험해요" 의 틀 */
const dangerText = (a: string, b: string) => `${a}${BATCHIM[a] ? "과" : "와"} ${b}${BATCHIM[b] ? "은" : "는"} 섞으면 위험해요`;
const pairKey = (a: string, b: string) => [a, b].sort().join("+");
const incompatibleWith = (cls: string) => cab.incompatible.filter(([a, b]) => a === cls || b === cls).map(([a, b]) => (a === cls ? b : a));
/** 경고 줄이 (a, b) 조합 문구인지 — 순서는 어느 쪽이든 (시안은 한 방향 예시만 있다) */
const isDangerLine = (line: string, a: string, b: string) => line === dangerText(a, b) || line === dangerText(b, a);
/** d7 §14 QR 내용 틀 */
const QR_TEMPLATE = /`\{origin\}(\/[a-z]+)\?([a-z]+)=\{cabinet id\}`/.exec(D7_14);

const UUIDS = ["0f8fad5b-d9cb-469f-a165-70867728950e", "7c9e6679-7425-40de-944b-e07fc1f90ae7", "00000000-0000-4000-8000-000000000001"];
const ORIGIN = "https://lab-stock.example";

describe("칸 제목 · 보관 위치 문구 (시안 3 · 11-slot)", () => {
  it("[K1][S3] 기대값 원본: 프레임 3 보관 위치 값 · 11-slot 시트 제목이 있다", () => {
    expect(FRAME_LOCATION, "3-mobile reagent-location value").toBe("1번 시약장 · 우 1단");
    expect(FRAME_LOCATION_NUMBER, "3-mobile cabinet-number").toBe("1");
    expect(FRAME_SHEET_TITLE, "11-slot sheet-title-text").toBe("좌 2단");
  });

  it(`[K1][S11] slotTitle: 양문형 = "{좌|우} {n}단" (시안 "${FRAME_SHEET_TITLE}"), 단문형 = "{n}단"`, () => {
    expect(slotTitle({ side: "L", shelf: 2 }, "양문형")).toBe(FRAME_SHEET_TITLE);
    expect(slotTitle({ side: "R", shelf: 1 }, "양문형")).toBe("우 1단");
    for (const shelf of [1, 2, 3, Math.max(...cab.shelves)]) {
      for (const side of ["L", "R"] as const) expect(slotTitle({ side, shelf }, "양문형")).toBe(`${SIDE[side]} ${shelf}단`);
      const single = slotTitle({ side: "L", shelf }, "단문형");
      expect(single).toBe(`${shelf}단`);
      expect(single).not.toMatch(/[좌우]/);
    }
  });

  it(`[K1][S3] locationText: 시안 "${FRAME_LOCATION}" = 시약장 이름 · 칸 제목 (번호 원은 따로 그린다)`, () => {
    expect(locationText({ label: "1번 시약장", doorType: "양문형" }, { side: "R", shelf: 1 })).toBe(FRAME_LOCATION);
    expect(locationText({ label: "화학 준비실", doorType: "양문형" }, { side: "L", shelf: 3 })).toBe("화학 준비실 · 좌 3단");
    expect(locationText({ label: "2번 시약장", doorType: "단문형" }, { side: "L", shelf: 2 })).toBe("2번 시약장 · 2단");
    // 번호는 문구에 넣지 않는다 (cabinet-number 원이 앞에 따로 있다)
    expect(locationText({ label: "1번 시약장", doorType: "양문형" }, { side: "R", shelf: 1 }).startsWith(FRAME_LOCATION_NUMBER + " ")).toBe(false);
  });

  it(`[K1][S3] locationText: 시약장이나 칸이 없으면 rules cabinet.unassigned_label "${cab.unassigned_label}"`, () => {
    expect(locationText(null, null)).toBe(cab.unassigned_label);
    expect(locationText(undefined, undefined)).toBe(cab.unassigned_label);
    expect(locationText({ label: "1번 시약장", doorType: "양문형" }, null)).toBe(cab.unassigned_label);
    expect(locationText(null, { side: "L", shelf: 1 })).toBe(cab.unassigned_label);
  });
});

describe("칸 배치 경고 placementWarnings (d7 §14 분류 불일치 · rules cabinet.class_mismatch)", () => {
  it("[K1][S11] 기대값 원본: rules class_mismatch = 경고만·저장 허용, 프레임 약한 문구 (1.17 3-location 시안에는 mix-warning 없음 — 위치 추천 run 에서 다시)", () => {
    expect(cab.class_mismatch).toMatch(/경고만/);
    expect(cab.class_mismatch).toMatch(/막지 않음/);
    expect(D7_14).toMatch(/시약 분류가 없으면 경고 없음/);
    expect(FRAME_MISMATCH, "11-slot 약한 문구").toBe("이 칸은 유기 칸이에요 — 그래도 넣을 수 있어요");
    // 1.17: 3-location 시안이 추천 시안으로 바뀌어 피커 mix-warning 이 빠졌다 (다음 run 에서 새 시안 기준으로 다시 대조)
    expect(FRAME_DANGER, "1.17 3-location 시안의 mix-warning").toEqual([]);
    expect(cab.incompatible.some(([a, b]) => pairKey(a, b) === pairKey("산화제", "유기")), "옛 시안 예시 조합(산화제·유기)은 rules incompatible").toBe(true);
  });

  it(`[K1][S11] 보조 줄 상수: 넣기 "${PLACEMENT_NOTE_PUT}" (11-slot). 저장 쪽 "${PLACEMENT_NOTE_SAVE}" 은 1.17 시안 원본이 없어 비어 있지 않음만 (다음 run 에서 대조)`, () => {
    expect(FRAME_MISMATCH.endsWith(`— ${PLACEMENT_NOTE_PUT}`)).toBe(true);
    // 다음 run(위치 추천)에서 3-location 새 시안 문구와 대조한다
    expect(typeof PLACEMENT_NOTE_SAVE).toBe("string");
    expect(PLACEMENT_NOTE_SAVE.trim()).not.toBe("");
    expect(PLACEMENT_NOTE_SAVE).not.toBe(PLACEMENT_NOTE_PUT);
  });

  it("[K1][S11] 시약 분류가 없으면(null · undefined · 빈 값 · 8종 밖) 어떤 칸이든 경고 없음", () => {
    for (const cls of [null, undefined, "", "모름", "acid"]) {
      for (const slot of [[], ["유기"], ["산", "염기"], cab.storage_classes]) {
        expect(placementWarnings(cls as string | null | undefined, slot, ["염기", "산화제"]).kind, `${String(cls)} → [${slot.join(",")}]`).toBe("none");
      }
    }
  });

  it("[K1][S11] 시약 분류가 칸 분류에 있으면(그리고 위험 조합이 없으면) 경고 없음", () => {
    for (const cls of cab.storage_classes) expect(placementWarnings(cls, [cls]).kind, cls).toBe("none");
    expect(placementWarnings("유기", ["유기", "기타"], ["유기", "기타"]).kind).toBe("none");
  });

  it(`[K1][S11] 시약 분류가 칸 분류에 없으면 mismatch 1줄 — 시안 "${FRAME_MISMATCH}"`, () => {
    const w = placementWarnings("산", ["유기"]);
    // 산 + 유기 는 rules incompatible 이 아니다 (시안 11-slot 예시: 염산(산) → 유기 칸)
    expect(cab.incompatible.some(([a, b]) => pairKey(a, b) === pairKey("산", "유기"))).toBe(false);
    expect(w.kind).toBe("mismatch");
    if (w.kind === "mismatch") expect(w.lines).toEqual([FRAME_MISMATCH]);
    // 다른 호환 조합도 같은 틀
    const w2 = placementWarnings("무기염", ["기타"]);
    expect(w2.kind).toBe("mismatch");
    if (w2.kind === "mismatch") expect(w2.lines).toEqual([`이 칸은 기타 칸이에요 — ${PLACEMENT_NOTE_PUT}`]);
    // 칸 분류가 여럿이면 그 분류들이 모두 문구에 있다
    const w3 = placementWarnings("무기염", ["유기", "기타"]);
    expect(w3.kind).toBe("mismatch");
    if (w3.kind === "mismatch") {
      expect(w3.lines).toHaveLength(1);
      for (const c of ["유기", "기타"]) expect(w3.lines[0]).toContain(c);
      expect(w3.lines[0].endsWith(PLACEMENT_NOTE_PUT)).toBe(true);
    }
  });

  it("[K1][S11] 분류 미지정 칸: 칸 분류와는 불일치로 보지 않는다 (위험 조합 판정은 칸 안 다른 시약으로 한다)", () => {
    for (const cls of cab.storage_classes) expect(placementWarnings(cls, []).kind, `${cls} → 미지정 칸`).toBe("none");
    const w = placementWarnings("산", [], ["염기"]);
    expect(w.kind, "미지정 칸에 염기 시약이 있으면 산은 위험 조합").toBe("incompatible");
  });

  it.each(cab.incompatible)("[K1][S11] incompatible %s · %s: 칸 분류와 위험 조합이면 강한 문구 1줄 (양방향)", (a, b) => {
    for (const [reagent, slotCls] of [
      [a, b],
      [b, a],
    ]) {
      const w = placementWarnings(reagent, [slotCls]);
      expect(w.kind, `${reagent} → ${slotCls} 칸`).toBe("incompatible");
      if (w.kind !== "incompatible") continue;
      expect(w.pairs.map(([x, y]) => pairKey(x, y))).toEqual([pairKey(a, b)]);
      expect(w.lines).toHaveLength(1);
      expect(isDangerLine(w.lines[0], a, b), `"${w.lines[0]}"`).toBe(true);
    }
  });

  it.each(cab.incompatible)("[K1][S11] incompatible %s · %s: 같은 칸의 다른 시약 분류와 위험 조합이어도 강한 문구 (양방향)", (a, b) => {
    for (const [reagent, other] of [
      [a, b],
      [b, a],
    ]) {
      // 칸 분류는 시약 분류와 같게 두어 불일치는 없다
      const w = placementWarnings(reagent, [reagent], [other]);
      expect(w.kind, `${reagent} ← 칸 안 ${other} 시약`).toBe("incompatible");
      if (w.kind === "incompatible") {
        expect(w.lines).toHaveLength(1);
        expect(isDangerLine(w.lines[0], a, b)).toBe(true);
      }
    }
  });

  it(`[K1][S3] 산화제 시약 → 유기 칸 = 강한 문구 "${dangerText("산화제", "유기")}" 만 (불일치 문구는 겹쳐 쓰지 않는다; 문구 틀은 1.15 3-location 시안)`, () => {
    const w = placementWarnings("산화제", ["유기"]);
    expect(w.kind).toBe("incompatible");
    if (w.kind === "incompatible") expect(w.lines).toEqual([dangerText("산화제", "유기")]);
  });

  it("[K1][S11] 위험 조합이 여럿이면 조합마다 한 줄, 위험 조합이 아닌 분류는 줄을 만들지 않는다", () => {
    // 산 ↔ 염기 · 인화성 · 독성 (rules 3쌍)
    const partners = incompatibleWith("산");
    expect(partners.length).toBeGreaterThanOrEqual(3);
    const w = placementWarnings("산", [partners[0], "기타"], [partners[1], partners[2], "무기염", null]);
    expect(w.kind).toBe("incompatible");
    if (w.kind === "incompatible") {
      expect(w.lines).toHaveLength(3);
      expect(new Set(w.pairs.map(([x, y]) => pairKey(x, y)))).toEqual(new Set(partners.slice(0, 3).map((p) => pairKey("산", p))));
      for (const p of partners.slice(0, 3)) expect(w.lines.some((l) => isDangerLine(l, "산", p)), `산 · ${p}`).toBe(true);
    }
    // 칸 분류 안에 시약 분류가 있어도 같은 칸 다른 분류와 위험하면 강한 문구 (산 · 염기 칸에 산)
    const w2 = placementWarnings("산", ["산", "염기"]);
    expect(w2.kind).toBe("incompatible");
    if (w2.kind === "incompatible") expect(w2.lines).toEqual([expect.any(String)]);
  });

  it("[K1][S11] 위험 조합이 아닌 분류 짝은 incompatible 이 되지 않는다 — 8종 순서쌍 전부", () => {
    let n = 0;
    for (const a of cab.storage_classes) {
      for (const b of cab.storage_classes) {
        if (a === b) continue;
        const bad = cab.incompatible.some(([x, y]) => pairKey(x, y) === pairKey(a, b));
        const w = placementWarnings(a, [b]);
        expect(w.kind, `${a} → ${b} 칸`).toBe(bad ? "incompatible" : "mismatch");
        n += 1;
      }
    }
    expect(n).toBe(cab.storage_classes.length * (cab.storage_classes.length - 1));
  });

  it("[K1][S11] 넘긴 배열을 바꾸지 않는다", () => {
    const slot = ["유기"];
    const others = ["산화제"];
    placementWarnings("산화제", slot, others);
    expect(slot).toEqual(["유기"]);
    expect(others).toEqual(["산화제"]);
  });
});

describe("시약장 QR (d7 §14 QR 인쇄)", () => {
  it("[K1][S11] 기대값 원본: d7 §14 QR 내용 = `{origin}/scan?cabinet={cabinet id}`, rules qr_label_text 4줄, 프레임 라벨 안내 = 마지막 줄", () => {
    expect(QR_TEMPLATE, "d7 §14 QR 내용 틀").not.toBeNull();
    expect(cab.qr_label_text).toHaveLength(4);
    expect(FRAME_LABEL_HELP.length, "11-print 미리보기 라벨").toBeGreaterThanOrEqual(1);
    for (const t of FRAME_LABEL_HELP) expect(t).toBe(cab.qr_label_text[3]);
  });

  it(`[K1][S11] SCAN_PATH = d7 §14 경로, QR_LABEL_HELP = rules cabinet.qr_label_text "${cab.qr_label_text[3]}"`, () => {
    expect(SCAN_PATH).toBe(QR_TEMPLATE![1]);
    expect(QR_LABEL_HELP).toBe(cab.qr_label_text[3]);
  });

  it("[K1][S11] cabinetQrUrl = `{origin}{경로}?cabinet={id}` (origin 끝 / 는 하나로)", () => {
    const [, path, key] = QR_TEMPLATE!;
    for (const id of UUIDS) {
      expect(cabinetQrUrl(ORIGIN, id)).toBe(`${ORIGIN}${path}?${key}=${id}`);
      expect(cabinetQrUrl(`${ORIGIN}/`, id), "origin 끝 /").toBe(`${ORIGIN}${path}?${key}=${id}`);
    }
    expect(cabinetQrUrl("http://localhost:3000", UUIDS[0])).toBe(`http://localhost:3000${path}?${key}=${UUIDS[0]}`);
  });

  it("[K1][S11] parseCabinetQr: cabinetQrUrl 로 만든 내용은 같은 origin 에서 그 id 로 돌아온다 (왕복)", () => {
    for (const origin of [ORIGIN, "http://localhost:3000", "https://lab-stock.vercel.app"]) {
      for (const id of UUIDS) expect(parseCabinetQr(cabinetQrUrl(origin, id), origin), `${origin} ${id}`).toBe(id);
    }
  });

  it("[K1][S11] parseCabinetQr: 다른 origin(호스트·스킴·포트·하위 도메인)이면 null", () => {
    const id = UUIDS[0];
    const url = cabinetQrUrl(ORIGIN, id);
    for (const other of ["https://evil.example", "http://lab-stock.example", "https://lab-stock.example:8443", "https://a.lab-stock.example", "https://lab-stock.example.evil.com"]) {
      expect(parseCabinetQr(url, other), `origin ${other}`).toBeNull();
      expect(parseCabinetQr(cabinetQrUrl(other, id), ORIGIN), `내용 origin ${other}`).toBeNull();
    }
  });

  it("[K1][S11] parseCabinetQr: 다른 경로 · 다른 매개변수 이름 · 매개변수 여러 개 · 값 없음이면 null", () => {
    const id = UUIDS[1];
    const [, path, key] = QR_TEMPLATE!;
    for (const text of [
      `${ORIGIN}/scans?${key}=${id}`,
      `${ORIGIN}${path}/?${key}=${id}`,
      `${ORIGIN}/reagents?${key}=${id}`,
      `${ORIGIN}/cabinets?c=${id}`,
      `${ORIGIN}${path}?c=${id}`,
      `${ORIGIN}${path}?${key}=${id}&${key}=${UUIDS[2]}`,
      `${ORIGIN}${path}?${key}=${id}&x=1`,
      `${ORIGIN}${path}?x=1&${key}=${id}`,
      `${ORIGIN}${path}?${key}=`,
      `${ORIGIN}${path}`,
      `${ORIGIN}/`,
    ]) {
      expect(parseCabinetQr(text, ORIGIN), text).toBeNull();
    }
  });

  it("[K1][S11] parseCabinetQr: id 가 uuid 가 아니거나 안에 공백이 있으면 null", () => {
    const [, path, key] = QR_TEMPLATE!;
    const id = UUIDS[0];
    for (const bad of ["1", "c-1", "abc", id.slice(0, -1), `${id}0`, id.replace(/-/g, ""), `${id.slice(0, 8)} ${id.slice(9)}`, `%20${id}`, `${id}%20`, "' or 1=1 --"]) {
      expect(parseCabinetQr(`${ORIGIN}${path}?${key}=${bad}`, ORIGIN), `id "${bad}"`).toBeNull();
    }
  });

  it("[K1][S11] parseCabinetQr: 경로·매개변수 이름의 대소문자가 다르면 null", () => {
    const [, path, key] = QR_TEMPLATE!;
    const id = UUIDS[0];
    for (const text of [`${ORIGIN}${path.toUpperCase()}?${key}=${id}`, `${ORIGIN}/Scan?${key}=${id}`, `${ORIGIN}${path}?${key.toUpperCase()}=${id}`, `${ORIGIN}${path}?Cabinet=${id}`]) {
      expect(parseCabinetQr(text, ORIGIN), text).toBeNull();
    }
  });

  it("[K1][S11] parseCabinetQr: URL 이 아닌 글자 · 문자열이 아닌 값이면 null", () => {
    for (const v of ["", " ", "hello", "scan?cabinet=" + UUIDS[0], `/scan?cabinet=${UUIDS[0]}`, UUIDS[0], null, undefined, 1, {}, [cabinetQrUrl(ORIGIN, UUIDS[0])]]) {
      expect(parseCabinetQr(v as unknown, ORIGIN), JSON.stringify(v) ?? String(v)).toBeNull();
    }
  });
});

describe("QR 인쇄 시트 안내 (rules cabinet.qr_print_layout · 시안 11-print)", () => {
  it(`[K1][S11] qrPrintCaption(${FRAME_PRINT_LABELS}) = 시안 "${FRAME_PRINT_CAPTION}", 한 장에 들어가는 동안 "A4 한 장에 라벨 N개"`, () => {
    expect(cab.qr_print_layout).toMatch(/A4 한 장에 라벨 여러 개/);
    expect(FRAME_PRINT_LABELS).toBeGreaterThan(0);
    expect(qrPrintCaption(FRAME_PRINT_LABELS)).toBe(FRAME_PRINT_CAPTION);
    // A4 한 장 = 2열 × 4줄 (D1 지시: 인쇄 CSS A4 2×4)
    expect(QR_LABELS_PER_PAGE).toBe(2 * 4);
    for (let n = 1; n <= QR_LABELS_PER_PAGE; n++) expect(qrPrintCaption(n)).toBe(`A4 한 장에 라벨 ${n}개`);
  });

  it("[K1][S11] qrPrintCaption: 한 장을 넘으면 장 수를 말하고, 0개면 라벨 0개라고 하지 않는다", () => {
    for (const n of [QR_LABELS_PER_PAGE + 1, QR_LABELS_PER_PAGE * 2, QR_LABELS_PER_PAGE * 2 + 1, 20]) {
      const pages = Math.ceil(n / QR_LABELS_PER_PAGE);
      const text = qrPrintCaption(n);
      expect(text, `${n}개`).toContain(`${pages}장`);
      expect(text).not.toContain("한 장에 라벨 " + n + "개");
    }
    const zero = qrPrintCaption(0);
    expect(zero.trim()).not.toBe("");
    expect(zero).not.toMatch(/라벨 0개/);
  });
});

// 단문형 칸 이름 타입 확인용 (DoorType 이 rules door_types 와 같다)
it("[K1][S11] DoorType 값 = rules cabinet.door_types", () => {
  const all: DoorType[] = ["양문형", "단문형"];
  expect(all).toEqual(cab.door_types);
});
