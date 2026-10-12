// 화면 12 QR 찾기 순수 규칙 (lib/scan-rules) — [K1][S12].
// 기대값: harness/d7-data.md §26 "번호로 찾기"(정수 1~9999 · "{n}번 시약장이 없어요" · "시약장 번호를 숫자로 적어 주세요"),
//         "QR 해석"("{학교명} 시약장 QR이 아니에요" · "시약장 QR이 아니에요"), "카메라"(권한 거부 안내),
//         "결과 (12-result)"(캡션 "{문 종류} · {N}단 · 시약 {k}개" · 칸 순서(문·단) · "배치도 보기" → /cabinets?c={id} · 0개 문구),
//         design/frames/12-result-mobile.json (sheet-caption · slot-location 순서), design/rules.json cabinet.door_types · shelves.
//         구현 상수는 기대값으로 쓰지 않는다 (d7·시안에서 읽은 값과 같은지만 본다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CABINET_NUMBER_MAX,
  CABINET_NUMBER_MIN,
  SCAN_TEXT,
  cabinetLayoutHref,
  cabinetMissingText,
  compareScanRows,
  notOurCabinetText,
  parseCabinetNumber,
  scanCaption,
  scanSlotText,
} from "../../lib/scan-rules";
import { ROOT, rules } from "./helpers";
import { framePath } from "../frames";

const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const D7_26 = D7.slice(D7.indexOf("## 26."), D7.indexOf("\n## ", D7.indexOf("## 26.") + 1));
const row = (head: string) => {
  const l = D7_26.split(/\r?\n/).find((x) => x.startsWith(`| ${head} |`));
  if (!l) throw new Error(`d7 §26 '${head}' 행 없음`);
  return l;
};
const quoted = (line: string) => [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const NUM_ROW = row("번호로 찾기");
const RANGE = (() => {
  const m = /정수\((\d+)~(\d+)\)/.exec(NUM_ROW);
  if (!m) throw new Error("d7 §26 번호로 찾기에서 범위를 읽지 못함");
  return { min: Number(m[1]), max: Number(m[2]) };
})();
const MISSING_TPL = quoted(NUM_ROW).find((q) => q.includes("{n}"))!;
const NOT_NUMBER = quoted(NUM_ROW).find((q) => q.includes("숫자"))!;
const QR_ROW = row("QR 해석");
const NOT_OURS_TPL = quoted(QR_ROW).find((q) => q.includes("{학교명}"))!;
const NOT_CABINET = quoted(QR_ROW).find((q) => !q.includes("{") && q.endsWith("QR이 아니에요"))!;
const CAMERA = quoted(row("카메라")).find((q) => q.includes("카메라를 쓸 수 없어요"))!;
const RESULT_ROW = row("결과 (12-result)");
const EMPTY = quoted(RESULT_ROW).find((q) => q.includes("아직 시약이 없어요"))!;
const LAYOUT_TPL = /`(\/cabinets\?c=\{id\})`/.exec(RESULT_ROW)![1];

type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const F12R: FrameNode[] = (JSON.parse(readFileSync(framePath("12-result-mobile"), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const frameText = (name: string) => F12R.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);
const DOORS = rules.cabinet.door_types as string[];
const SHELVES = rules.cabinet.shelves as number[];
const [DOUBLE, SINGLE] = DOORS;

describe("[K1][S12] 기대값 원본 (d7 §26 · 시안 12-result)", () => {
  it("d7 문구·범위를 읽었다", () => {
    for (const v of [MISSING_TPL, NOT_NUMBER, NOT_OURS_TPL, NOT_CABINET, CAMERA, EMPTY, LAYOUT_TPL]) expect(v).toBeTruthy();
    expect(RANGE.min).toBeLessThan(RANGE.max);
  });
});

describe("[K1][S12] 번호로 찾기 — d7 §26 정수 범위 · 문구", () => {
  it("구현 범위 = d7 범위", () => {
    expect([CABINET_NUMBER_MIN, CABINET_NUMBER_MAX]).toEqual([RANGE.min, RANGE.max]);
  });

  it("범위 안 정수 (앞뒤 공백 무시, 숫자형 입력 포함) → ok", () => {
    for (const n of [RANGE.min, 2, 42, RANGE.max]) {
      expect(parseCabinetNumber(String(n))).toEqual({ ok: true, value: n });
      expect(parseCabinetNumber(`  ${n}\t`)).toEqual({ ok: true, value: n });
      expect(parseCabinetNumber(n)).toEqual({ ok: true, value: n });
    }
  });

  it(`범위 밖 · 정수 아님 · 빈 값 → "${NOT_NUMBER}"`, () => {
    const bad: unknown[] = [String(RANGE.min - 1), String(RANGE.max + 1), "-1", "1.5", "1e3", "abc", "1번", "", "   ", "١", "１", null, undefined, {}, [], 1.5, -3, NaN, RANGE.max + 1];
    for (const v of bad) {
      const r = parseCabinetNumber(v);
      expect(r.ok, `${JSON.stringify(v)} 거부`).toBe(false);
      if (!r.ok) expect(r.error).toBe(NOT_NUMBER);
    }
  });

  it(`없는 번호 = "${MISSING_TPL}"`, () => {
    for (const n of [1, 7, RANGE.max]) expect(cabinetMissingText(n)).toBe(MISSING_TPL.replace("{n}", String(n)));
  });
});

describe("[K1][S12] 문구 — d7 §26 QR 해석 · 카메라 · 결과", () => {
  it(`다른 학교 시약장 = "${NOT_OURS_TPL}" (학교명 = 로그인 사용자 학교)`, () => {
    expect(notOurCabinetText("샘플고등학교")).toBe(NOT_OURS_TPL.replace("{학교명}", "샘플고등학교"));
  });
  it("시약장 QR 아님 · 카메라 없음 · 시약 0개 · 숫자 아님 문구 = d7", () => {
    expect(SCAN_TEXT.notCabinetQr).toBe(NOT_CABINET);
    expect(SCAN_TEXT.cameraUnavailable).toBe(CAMERA);
    expect(SCAN_TEXT.empty).toBe(EMPTY);
    expect(SCAN_TEXT.notNumber).toBe(NOT_NUMBER);
  });
});

describe("[K1][S12] 결과 시트 — 캡션 · 칸 위치 · 순서 · 배치도 주소", () => {
  it("시안 12-result sheet-caption 과 같은 글자 (양문형·단 수·시약 개수 = 시안 값)", () => {
    const cap = frameText("sheet-caption")[0];
    const m = /^(\S+) · (\d+)단 · 시약 (\d+)개$/.exec(cap);
    expect(m, `시안 캡션 꼴: ${cap}`).not.toBeNull();
    expect(DOORS).toContain(m![1]);
    expect(scanCaption(m![1] as never, Number(m![2]), Number(m![3]))).toBe(cap);
    // 시안 시약 행 수 = 캡션의 k
    expect(frameText("reagent-name")).toHaveLength(Number(m![3]));
  });

  it("캡션 꼴 = d7 \"{문 종류} · {N}단 · 시약 {k}개\" (모든 문 종류 · 단 수, 0개 포함)", () => {
    for (const d of DOORS) for (const s of SHELVES) for (const k of [0, 1, 12]) expect(scanCaption(d as never, s, k)).toBe(`${d} · ${s}단 · 시약 ${k}개`);
  });

  it("칸 위치 = 시안 꼴 \"좌 1단\" (양문형) · 단문형은 \"1단\"", () => {
    const shown = frameText("slot-location");
    expect(shown.length).toBeGreaterThan(0);
    const side = { 좌: "L", 우: "R" } as const;
    for (const t of shown) {
      const m = /^(좌|우) (\d+)단$/.exec(t)!;
      expect(m, t).not.toBeNull();
      expect(scanSlotText({ side: side[m[1] as "좌" | "우"], shelf: Number(m[2]) }, DOUBLE as never)).toBe(t);
    }
    expect(scanSlotText({ side: "L", shelf: 3 }, SINGLE as never)).toBe("3단");
  });

  it("목록 순서 = 칸 순서(문 → 단) — 시안 12-result 순서를 섞어도 같은 순서로 돌아온다", () => {
    const shown = frameText("slot-location");
    const names = frameText("reagent-name");
    const rows = shown.map((t, i) => {
      const m = /^(좌|우) (\d+)단$/.exec(t)!;
      return { side: (m[1] === "좌" ? "L" : "R") as "L" | "R", shelf: Number(m[2]), name: names[i], id: String(i) };
    });
    const slotSeq = (list: typeof rows) => list.map((r) => `${r.side}${r.shelf}`);
    for (const perm of [[...rows].reverse(), [rows[2], rows[3], rows[0], rows[1]]]) {
      expect(slotSeq([...perm].sort(compareScanRows))).toEqual(slotSeq(rows));
    }
    // 문이 먼저: 우 1단은 좌 4단보다 뒤
    expect(compareScanRows({ side: "R", shelf: 1, name: "가" }, { side: "L", shelf: 4, name: "하" })).toBeGreaterThan(0);
    expect(compareScanRows({ side: "L", shelf: 1, name: "하" }, { side: "L", shelf: 2, name: "가" })).toBeLessThan(0);
  });

  it(`배치도 보기 = ${LAYOUT_TPL}`, () => {
    const id = "3f2b8c1e-9a4d-4e6f-b7a1-0c5d2e8f9a10";
    expect(cabinetLayoutHref(id)).toBe(LAYOUT_TPL.replace("{id}", id));
  });
});
