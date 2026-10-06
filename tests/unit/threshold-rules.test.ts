// 화면 3 재주문 기준 직접 입력 순수 규칙 (lib/reorder-rules checkThreshold · thresholdText — 디자인 1.15).
// 기대값: harness/d7-data.md §14 재주문 기준 직접 입력(0 이상, 0 = 알림 없음), design/rules.json reorder.threshold_edit,
//         design/frames/3-mobile.json reorder-threshold 값 "3병", s2-spec 화면 3 reorder-threshold("아직 없어요"),
//         D1 지시(상한 1,000,000 · 소수 3자리 · 음수·빈 값·문자·지수·쉼표 거부).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THRESHOLD_MAX, THRESHOLD_MIN, THRESHOLD_NONE_LABEL, THRESHOLD_ZERO_HINT, checkThreshold, thresholdText } from "../../lib/reorder-rules";
import { ROOT, rules } from "./helpers";

const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const D7_14 = D7.slice(D7.indexOf("## 14."), D7.indexOf("\n## ", D7.indexOf("## 14.") + 1));
type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const F3 = (JSON.parse(readFileSync(join(ROOT, "design/frames/3-mobile.json"), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
/** 시안 3 재주문 기준 값 "3병" */
const FRAME_THRESHOLD = F3.find((n) => n.name === "value" && n.text && n.path.includes("reorder-threshold"))!.text!.characters;

/** D1 지시: 입고·사용 수량 상한과 같은 1,000,000, 소수 3자리 */
const MAX = 1_000_000;
const DECIMALS = 3;

const ok = (v: unknown) => {
  const r = checkThreshold(v);
  return r.ok ? r.value : undefined;
};
const err = (v: unknown) => {
  const r = checkThreshold(v);
  return r.ok ? undefined : r.error;
};

describe("checkThreshold (d7 §14 set_reorder_threshold: 0 이상, 0 = 알림 없음)", () => {
  it("[K1][S3] 기대값 원본: d7 §14 '0 이상(0 = 알림 없음)', rules reorder.threshold_edit = 숫자 직접 입력 · 교사·admin", () => {
    expect(D7_14).toMatch(/0 이상\(0 = 알림 없음\)/);
    expect(rules.reorder.threshold_edit).toMatch(/숫자로 직접 입력/);
    expect(rules.reorder.threshold_edit).toMatch(/교사·admin/);
    expect(rules.roles.R5.components).toContain("threshold-edit");
    expect(THRESHOLD_MIN).toBe(0);
    expect(THRESHOLD_MAX).toBe(MAX);
  });

  it("[K1][S3] 0 은 받아들인다 (알림 없음) — 문자열 \"0\" · \"0.0\" · 숫자 0", () => {
    expect(ok("0")).toBe(0);
    expect(ok("0.0")).toBe(0);
    expect(ok("0.000")).toBe(0);
    expect(ok(0)).toBe(0);
  });

  it("[K1][S3] 0 안내 문구는 '0이면 알림을 보내지 않음' 뜻이다", () => {
    expect(THRESHOLD_ZERO_HINT).toMatch(/^0/);
    expect(THRESHOLD_ZERO_HINT).toMatch(/알림/);
    expect(THRESHOLD_ZERO_HINT).toMatch(/않/);
  });

  it("[K1][S3] 양수 · 앞뒤 공백 · 소수 3자리까지 받아들인다", () => {
    expect(ok("3")).toBe(3);
    expect(ok(" 3 ")).toBe(3);
    expect(ok("\t12\n")).toBe(12);
    expect(ok("2.5")).toBe(2.5);
    expect(ok("0.001")).toBe(0.001);
    expect(ok("1.125")).toBe(1.125);
    expect(ok("007")).toBe(7);
    expect(ok(3)).toBe(3);
    expect(ok(0.125)).toBe(0.125);
  });

  it(`[K1][S3] 소수 ${DECIMALS + 1}자리 이상은 거부 (안내 문구 있음)`, () => {
    for (const v of ["1.1234", "0.0001", "3.12345", 1.2345, 0.0001]) {
      const e = err(v);
      expect(e, JSON.stringify(v)).toBeTruthy();
      expect(e!.trim()).not.toBe("");
    }
  });

  it("[K1][S3] 음수는 거부 — 안내에 '1 이상' 이라고 하지 않는다 (0 은 허용이므로)", () => {
    for (const v of ["-1", "-0.5", " -3", "-0.001", -1, -0.001]) {
      const e = err(v);
      expect(e, JSON.stringify(v)).toBeTruthy();
      expect(e).not.toMatch(/1 이상/);
    }
  });

  it("[K1][S3] 빈 값 · 공백만 · 값 없음은 거부", () => {
    for (const v of ["", " ", "   ", "\t", null, undefined]) {
      const e = err(v);
      expect(e, JSON.stringify(v) ?? String(v)).toBeTruthy();
      expect(e!.trim()).not.toBe("");
    }
  });

  it("[K1][S3] 숫자가 아닌 글자 · 지수 표기 · 쉼표 · 16진 · 단위 붙은 값은 거부", () => {
    for (const v of ["abc", "3병", "3 병", "1e3", "1E3", "2e-1", "1,000", "1,5", "0x10", "Infinity", "NaN", "3..1", "1.2.3", ".", "+", "-", "１"]) {
      expect(err(v), JSON.stringify(v)).toBeTruthy();
    }
  });

  it("[K1][S3] 숫자가 아닌 값(NaN · Infinity · 객체 · 배열 · 불리언)은 거부", () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, {}, [], [3], true, false]) {
      expect(err(v), String(v)).toBeTruthy();
    }
  });

  it(`[K1][S3] 상한 ${MAX.toLocaleString("en-US")}: 그 값은 받아들이고 넘으면 거부`, () => {
    expect(ok(String(MAX))).toBe(MAX);
    expect(ok(MAX)).toBe(MAX);
    expect(ok(`${MAX - 1}.999`)).toBe(MAX - 0.001);
    for (const v of [String(MAX + 1), `${MAX}.001`, String(MAX * 10), MAX + 1, MAX + 0.001]) {
      expect(err(v), String(v)).toBeTruthy();
    }
  });
});

describe("thresholdText (시안 3 reorder-threshold 값)", () => {
  it(`[K1][S3] 기준 3, 단위 "병" = 시안 "${FRAME_THRESHOLD}"`, () => {
    expect(FRAME_THRESHOLD).toBe("3병");
    expect(thresholdText(3, "병")).toBe(FRAME_THRESHOLD);
  });

  it("[K1][S3] 소수·다른 단위도 숫자 바로 뒤에 단위", () => {
    expect(thresholdText(2.5, "mL")).toBe("2.5mL");
    expect(thresholdText(60, "g")).toBe("60g");
    expect(thresholdText(0.125, "g")).toBe("0.125g");
  });

  it(`[K1][S3] 기준이 없거나 0(알림 없음)이면 "${THRESHOLD_NONE_LABEL}" (s2-spec 화면 3: 값이 없으면 "아직 없어요")`, () => {
    expect(THRESHOLD_NONE_LABEL).toBe("아직 없어요");
    for (const v of [null, undefined, 0, -1, Number.NaN]) expect(thresholdText(v as number | null | undefined, "병"), String(v)).toBe(THRESHOLD_NONE_LABEL);
  });
});
