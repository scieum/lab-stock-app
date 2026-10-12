// 센서 종류 ↔ 지능형 과학실 ON 오픈API 센서타입 코드 (lib/sensor-rules SENSOR_TYPE_CODES).
// 기대값: harness/d7-data.md §26 "ON 센서 코드"(정의서 2026-06-16 V1.2 별첨 2 공식 코드 9개, 공식 코드가 없는 종류는 null — 임시 3글자 금지,
//         화면에는 쓰지 않음) + §28 "ON 코드"(전도도 = CDT 추가, 심박·생체 · 나머지 새 종류 = null, SPO 는 대응하지 않음),
//         design/rules.json 1.28 sensor.types(27종). 코드 표는 d7 문장에서 읽는다 (구현에서 읽지 않는다).
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { SENSOR_TYPES, SENSOR_TYPE_CODES } from "../../lib/sensor-rules";
import { ROOT, read, rules, walk } from "./helpers";

const D7 = read(join(ROOT, "harness/d7-data.md"));
const section = (n: number) => D7.slice(D7.indexOf(`## ${n}.`), D7.indexOf("\n## ", D7.indexOf(`## ${n}.`) + 1));
const ROW = section(26).split("\n").find((l) => l.startsWith("| ON 센서 코드 |")) ?? "";
const ROW28 = section(28).split("\n").find((l) => l.startsWith("| ON 코드 |")) ?? "";
/** "TPR 온도 · PRS 압력 · … · CDT 전기 전도도" → { 온도: "TPR", … } (공식 코드 9개, 이름은 정의서 그대로) */
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
/** §28 "전도도 = CDT 추가" → { 전도도: "CDT" } (정의서 이름과 종류 이름이 다른 것을 잇는다) */
const ADDED: Record<string, string> = Object.fromEntries([...ROW28.matchAll(/(\S+) = ([A-Z]{3}) 추가/g)].map((m) => [m[1], m[2]]));
/** §28 "SPO 는 … 대응하지 않음" */
const NOT_MAPPED: string[] = [...ROW28.matchAll(/([A-Z]{3}) 는 [^)]*대응하지 않음/g)].map((m) => m[1]);
const TYPES: string[] = rules.sensor.types;

/** 종류 → 기대 코드: 정의서 이름이 종류 이름과 같으면 그 코드, §28 이 이은 것은 그 코드, 나머지 null */
const WANT: Record<string, string | null> = Object.fromEntries(TYPES.map((t) => [t, OFFICIAL[t] ?? ADDED[t] ?? null]));

describe("[C1][S17] ON 센서 코드 = d7 §26 공식 코드 + §28 (종류 27종)", () => {
  it("[C1][S17] 기대값 원본: d7 §26 공식 코드 9개 · §28 '전도도 = CDT 추가' · SPO 대응 안 함 · rules sensor.types 27종", () => {
    expect(ROW, "d7 §26 ON 센서 코드 줄").not.toBe("");
    expect(ROW28, "d7 §28 ON 코드 줄").not.toBe("");
    expect(OFFICIAL_COUNT).toBe(9);
    expect(Object.keys(OFFICIAL)).toHaveLength(OFFICIAL_COUNT);
    expect(new Set(Object.values(OFFICIAL)).size).toBe(OFFICIAL_COUNT);
    expect(OFFICIAL).toMatchObject({ 온도: "TPR", 압력: "PRS", 소리: "SUD", 전압: "VTG", 전류: "CRT", 조도: "ILM", pH: "POH", "전기 전도도": "CDT" });
    expect(ADDED).toEqual({ 전도도: "CDT" });
    expect(NOT_MAPPED).toEqual(["SPO"]);
    expect(TYPES).toHaveLength(27);
    expect(rules.version).toBe("1.28");
  });

  it(`[C1][S17] SENSOR_TYPES · SENSOR_TYPE_CODES 의 종류 = rules sensor.types ${TYPES.length}종 그대로 (순서 · 빠짐 · 덧붙임 없음)`, () => {
    expect([...SENSOR_TYPES]).toEqual(TYPES);
    expect(Object.keys(SENSOR_TYPE_CODES).sort()).toEqual([...TYPES].sort());
  });

  it("[C1][S17] 공식 코드가 있는 종류 = 그 코드 (전도도 = CDT), 심박·생체 포함 나머지 = null (임시 코드 금지)", () => {
    for (const t of TYPES) expect(SENSOR_TYPE_CODES[t as keyof typeof SENSOR_TYPE_CODES], `${t}`).toBe(WANT[t]);
    const coded = TYPES.filter((t) => WANT[t] !== null);
    expect(coded.sort(), "코드가 있는 종류").toEqual(["pH", "압력", "소리", "온도", "전도도", "전류", "전압", "조도"].sort());
    expect(SENSOR_TYPE_CODES["심박·생체" as keyof typeof SENSOR_TYPE_CODES], "심박·생체 = null").toBeNull();
    expect(TYPES.filter((t) => WANT[t] === null)).toHaveLength(TYPES.length - 8);
  });

  it("[C1][S17] 값은 null 이거나 공식 코드 중 하나 · 같은 코드가 두 종류에 붙지 않음 · 쓰지 않는 공식 코드 = SPO 하나", () => {
    const official = new Set(Object.values(OFFICIAL));
    const values = Object.values(SENSOR_TYPE_CODES).filter((v): v is string => v !== null);
    for (const v of values) expect(official.has(v), `${v} 는 공식 코드`).toBe(true);
    expect(new Set(values).size, "코드 중복 없음").toBe(values.length);
    const unused = [...official].filter((c) => !values.includes(c));
    expect(unused.sort(), "종류가 없는 공식 코드").toEqual(NOT_MAPPED);
    expect(values, "CDT 사용").toContain("CDT");
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
