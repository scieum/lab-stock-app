// 센서 종류 ↔ 지능형 과학실 ON 오픈API 센서타입 코드 (lib/sensor-rules SENSOR_TYPE_CODES).
// 기대값: harness/d7-data.md §26 "ON 센서 코드"(정의서 2026-06-16 V1.2 별첨 2 공식 코드 9개, 공식 코드가 없는 종류는 null — 임시 3글자 금지,
//         화면에는 쓰지 않음), design/rules.json sensor.types(종류 14종). 코드 표는 d7 문장에서 읽는다 (구현에서 읽지 않는다).
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { SENSOR_TYPES, SENSOR_TYPE_CODES } from "../../lib/sensor-rules";
import { ROOT, read, rules, walk } from "./helpers";

const D7 = read(join(ROOT, "harness/d7-data.md"));
const D7_26 = D7.slice(D7.indexOf("## 26."), D7.indexOf("\n## ", D7.indexOf("## 26.") + 1));
const ROW = D7_26.split("\n").find((l) => l.startsWith("| ON 센서 코드 |")) ?? "";
/** "TPR 온도 · PRS 압력 · … · CDT 전기 전도도" → { 온도: "TPR", … } (공식 코드 9개) */
const OFFICIAL: Record<string, string> = (() => {
  const list = /공식 코드 \d+개: ([^(]+)\(/.exec(ROW)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const part of list.split("·").map((s) => s.trim()).filter(Boolean)) {
    const m = /^([A-Z]{3}) (.+)$/.exec(part);
    if (m) out[m[2].trim()] = m[1];
  }
  return out;
})();
const OFFICIAL_COUNT = Number(/공식 코드 (\d+)개/.exec(ROW)?.[1] ?? NaN);
const TYPES: string[] = rules.sensor.types;

describe("[C1][S17] ON 센서 코드 = d7 §26 공식 코드 (정의서 V1.2 별첨 2)", () => {
  it("[C1][S17] 기대값 원본: d7 §26 공식 코드 9개를 모두 읽음 · 3글자 대문자 · 서로 다름", () => {
    expect(ROW, "d7 §26 ON 센서 코드 줄").not.toBe("");
    expect(OFFICIAL_COUNT).toBe(9);
    expect(Object.keys(OFFICIAL)).toHaveLength(OFFICIAL_COUNT);
    expect(new Set(Object.values(OFFICIAL)).size).toBe(OFFICIAL_COUNT);
    expect(OFFICIAL).toMatchObject({ 온도: "TPR", 압력: "PRS", 소리: "SUD", 전압: "VTG", 전류: "CRT", 조도: "ILM", pH: "POH" });
    expect(ROW).toContain("공식 코드가 없는 종류는 null");
  });

  it("[C1][S17] SENSOR_TYPE_CODES 의 종류 = rules sensor.types 14종 그대로 (빠짐·덧붙임 없음)", () => {
    expect([...SENSOR_TYPES]).toEqual(TYPES);
    expect(Object.keys(SENSOR_TYPE_CODES).sort()).toEqual([...TYPES].sort());
  });

  it("[C1][S17] 공식 코드가 있는 종류 = 그 코드, 없는 종류 = null (임시 코드 금지)", () => {
    for (const t of TYPES) {
      const want = OFFICIAL[t] ?? null;
      expect(SENSOR_TYPE_CODES[t as keyof typeof SENSOR_TYPE_CODES], `${t}`).toBe(want);
    }
    const coded = TYPES.filter((t) => OFFICIAL[t]);
    expect(coded.sort(), "코드가 있는 종류").toEqual(["pH", "압력", "소리", "온도", "전류", "전압", "조도"].sort());
  });

  it("[C1][S17] 값은 null 이거나 공식 코드 중 하나 · 같은 코드가 두 종류에 붙지 않음 · 종류가 없는 공식 코드(산소포화도 SPO · 전기 전도도 CDT)는 쓰지 않음", () => {
    const official = new Set(Object.values(OFFICIAL));
    const values = Object.values(SENSOR_TYPE_CODES).filter((v): v is string => v !== null);
    for (const v of values) expect(official.has(v), `${v} 는 공식 코드`).toBe(true);
    expect(new Set(values).size, "코드 중복 없음").toBe(values.length);
    const unused = Object.entries(OFFICIAL).filter(([name]) => !TYPES.includes(name)).map(([, c]) => c);
    expect(unused.sort(), "종류가 없는 공식 코드").toEqual(["CDT", "SPO"]);
    for (const c of unused) expect(values, `${c} 쓰지 않음`).not.toContain(c);
  });

  it("[C1][S17] 코드는 화면에 쓰지 않는다 — app/ · components/ 의 .tsx 에 공식 코드 글자 0 (d7 §26 '화면에는 여전히 쓰지 않는다')", () => {
    const files = walk(["app", "components"], [".tsx"]);
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    const codes = Object.values(OFFICIAL);
    for (const f of files) {
      const src = read(f);
      for (const c of codes) if (new RegExp(`["'\`>]\\s*${c}\\s*["'\`<]`).test(src)) hits.push(`${f}: ${c}`);
    }
    expect(hits).toEqual([]);
    expect(ROW).toContain("화면에는 여전히 쓰지 않는다");
  });
});
