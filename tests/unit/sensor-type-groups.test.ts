// 센서 종류 27종 · 묶음 · 고르기 시트 규칙 (lib/sensor-rules — d7 §28).
// 기대값: design/rules.json 1.28 sensor.types · type_groups · type_select · filter, harness/d7-data.md §28 "센서 종류" · "종류 고르기·필터" 줄,
//         design/frames/17-filter-mobile(묶음 줄 "화학 · 2개"). 구현 상수를 기대값으로 읽지 않는다.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  SENSOR_TYPE_GROUPS,
  applySensorFilter,
  checkSensorInput,
  initialOpenTypeGroups,
  normalizeSensorType,
  parseSensorFilter,
  searchSensorTypeGroups,
  sensorTypeGroupOf,
  typeGroupSelectedCount,
} from "../../lib/sensor-rules";
import { ROOT, read, rules } from "./helpers";

const D7 = read(join(ROOT, "harness/d7-data.md"));
const D7_28 = D7.slice(D7.indexOf("## 28."), D7.indexOf("\n## ", D7.indexOf("## 28.") + 1));
const row28 = (head: string) => D7_28.split("\n").find((l) => l.startsWith(`| ${head} |`)) ?? "";
const TYPES: string[] = rules.sensor.types;
const GROUPS: Record<string, string[]> = rules.sensor.type_groups;
const GROUP_TITLES = Object.keys(GROUPS);
/** d7 §28 "type_groups(물리 12 · 화학 9 · 생명·지구 3 · 장비 3)" */
const D7_COUNTS: [string, number][] = (() => {
  const inner = /type_groups\(([^)]+)\)/.exec(row28("센서 종류"))?.[1] ?? "";
  return inner.split(" · ").map((p) => {
    const m = /^(.+) (\d+)$/.exec(p.trim())!;
    return [m[1], Number(m[2])];
  });
})();
/** d7 §28 '기존 "심박" = "심박·생체"로 이름 변경' */
const LEGACY = (() => {
  const m = /기존 "([^"]+)" = "([^"]+)"로 이름 변경/.exec(row28("센서 종류"));
  return m ? { from: m[1], to: m[2] } : null;
})();

type FrameNode = { name: string; path: string[]; text?: { characters: string } | null };
const frame = (name: string) => (JSON.parse(read(join(ROOT, "design/frames", `${name}.json`))) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;

/** 기대 검색 결과: 글자를 품은 종류만, 그 종류가 있는 묶음만 (rules type_select) */
const expectSearch = (q: string) =>
  GROUP_TITLES.map((title) => ({ title, types: GROUPS[title].filter((t) => t.includes(q)) })).filter((g) => g.types.length > 0);

describe("[C1][S17] 센서 종류 27종 · 묶음 (rules 1.28 sensor.types · type_groups, d7 §28)", () => {
  it("[C1][S17] 기대값 원본: rules types 27종 = type_groups 펼친 순서 · d7 §28 묶음 개수 물리 12 · 화학 9 · 생명·지구 3 · 장비 3 · 심박 → 심박·생체", () => {
    expect(TYPES).toHaveLength(27);
    expect(Object.values(GROUPS).flat()).toEqual(TYPES);
    expect(D7_COUNTS).toEqual(GROUP_TITLES.map((t) => [t, GROUPS[t].length]));
    expect(D7_COUNTS.map(([, n]) => n)).toEqual([12, 9, 3, 3]);
    expect(LEGACY).toEqual({ from: "심박", to: "심박·생체" });
    expect(TYPES).toContain(LEGACY!.to);
    expect(TYPES).not.toContain(LEGACY!.from);
  });

  it("[C1][S17] SENSOR_TYPE_GROUPS = rules type_groups (이름 · 순서 · 종류 · 개수 12·9·3·3)", () => {
    expect(SENSOR_TYPE_GROUPS.map((g) => g.title)).toEqual(GROUP_TITLES);
    for (const g of SENSOR_TYPE_GROUPS) expect([...g.types], g.title).toEqual(GROUPS[g.title]);
    expect(SENSOR_TYPE_GROUPS.map((g) => g.types.length)).toEqual(D7_COUNTS.map(([, n]) => n));
  });

  it("[C1][S17] sensorTypeGroupOf: 종류마다 rules 묶음 이름 · 예전 '심박' = 생명·지구 · 목록 밖 = null", () => {
    for (const [title, types] of Object.entries(GROUPS)) for (const t of types) expect(sensorTypeGroupOf(t), t).toBe(title);
    expect(sensorTypeGroupOf(LEGACY!.from)).toBe(sensorTypeGroupOf(LEGACY!.to));
    expect(sensorTypeGroupOf("무게")).toBeNull();
  });
});

describe("[C1][S17] 예전 종류 이름 '심박' → '심박·생체' (d7 §28)", () => {
  it("[C1][S17] normalizeSensorType: 27종은 그대로(앞뒤 공백 무시) · '심박' → '심박·생체' · 목록 밖 · 글자 아님 = null", () => {
    for (const t of TYPES) {
      expect(normalizeSensorType(t), t).toBe(t);
      expect(normalizeSensorType(` ${t} `), `공백 ${t}`).toBe(t);
    }
    expect(normalizeSensorType(LEGACY!.from)).toBe(LEGACY!.to);
    for (const bad of ["무게", "", "현미경", null, undefined, 3]) expect(normalizeSensorType(bad), String(bad)).toBeNull();
  });

  it("[C1][S17] 입력 검사 · 주소 필터 · 목록 필터가 예전 '심박'을 '심박·생체'로 받는다", () => {
    const base = { id: null, name: "손잡이형 심박", type: LEGACY!.from, maker: "파스코", model: "PS-3206", quantity: 1, locationText: "", slotId: null, status: "ok", memo: "" };
    const r = checkSensorInput(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe(LEGACY!.to);
    expect(parseSensorFilter(new URLSearchParams({ type: `${LEGACY!.from},온도,무게` })).types).toEqual([LEGACY!.to, "온도"]);
    const rows = [
      { name: "옛 행", type: LEGACY!.from, maker: "파스코", model: null, status: "ok" as const },
      { name: "온도", type: "온도", maker: "파스코", model: null, status: "ok" as const },
    ];
    expect(applySensorFilter(rows, "", { types: [LEGACY!.to as never], makers: [], statuses: [] }).map((s) => s.name)).toEqual(["옛 행"]);
  });
});

describe("[C1][S17] 종류 고르기 시트 · 필터 묶음 (rules sensor.type_select · filter)", () => {
  it("[C1][S17] 처음 펼침: 고른 게 없으면 4줄 모두 접힘 · 고른 종류가 있는 묶음만 펼침 (rules 순서)", () => {
    expect(initialOpenTypeGroups([])).toEqual([]);
    expect(initialOpenTypeGroups(["편광"])).toEqual(["화학"]);
    expect(initialOpenTypeGroups(["분광", "편광"])).toEqual(["화학"]);
    expect(initialOpenTypeGroups(["기타", "온도"])).toEqual(["물리", "장비"]);
    expect(initialOpenTypeGroups([LEGACY!.from]), "예전 심박").toEqual(["생명·지구"]);
    // 모든 종류: 그 종류 하나만 고르면 그 묶음 하나만
    for (const [title, types] of Object.entries(GROUPS)) for (const t of types) expect(initialOpenTypeGroups([t]), t).toEqual([title]);
    // 모든 묶음에서 하나씩 = 4줄 모두
    expect(initialOpenTypeGroups(GROUP_TITLES.map((t) => GROUPS[t][0]))).toEqual(GROUP_TITLES);
  });

  it("[C1][S17] 검색: 빈 글자 = 묶음 4줄 그대로 · 글자가 있으면 맞는 종류가 있는 묶음만, 그 안은 맞는 종류만 · 없으면 0줄", () => {
    const all = searchSensorTypeGroups("");
    expect(all.map((g) => ({ title: g.title, types: [...g.types] }))).toEqual(GROUP_TITLES.map((title) => ({ title, types: GROUPS[title] })));
    expect(searchSensorTypeGroups("   ").map((g) => g.title)).toEqual(GROUP_TITLES);
    for (const q of ["산소", "전", "편광", "기", "CO₂", "심박", "도"]) {
      const got = searchSensorTypeGroups(q).map((g) => ({ title: g.title, types: [...g.types] }));
      expect(got, `검색 '${q}'`).toEqual(expectSearch(q));
      expect(got.length, `검색 '${q}' 결과 있음`).toBeGreaterThan(0);
    }
    expect(searchSensorTypeGroups("현미경"), "맞는 종류 없음").toEqual([]);
    expect(searchSensorTypeGroups("zzz")).toEqual([]);
    // 검색은 묶음 원본을 바꾸지 않는다
    expect(SENSOR_TYPE_GROUPS.map((g) => g.types.length)).toEqual(D7_COUNTS.map(([, n]) => n));
  });

  it("[C1][S17] 필터 묶음 줄 고른 개수: 그 묶음 안 고른 종류 수 · 시안 17-filter '화학 · 2개'", () => {
    const f = frame("17-filter-mobile");
    const groups = f.filter((n) => n.name === "sensor-type-group");
    expect(groups.length, "17-filter 묶음 4줄").toBe(GROUP_TITLES.length);
    // 프레임 노드는 문서 순서 — group-count 는 바로 앞 group-name 의 묶음
    const counted: { group?: string; text: string }[] = [];
    let current: string | undefined;
    for (const x of f) {
      if (x.name === "group-name" && x.text) current = x.text.characters;
      if (x.name === "group-count" && x.text) counted.push({ group: current, text: x.text.characters });
    }
    expect(counted.length, "개수가 붙은 묶음 1").toBe(1);
    const n = Number(/(\d+)개/.exec(counted[0].text)?.[1]);
    const title = counted[0].group!;
    expect(title).toBe("화학");
    const chem = SENSOR_TYPE_GROUPS.find((g) => g.title === title)!;
    const picked = GROUPS[title].slice(0, n);
    expect(typeGroupSelectedCount(chem, picked)).toBe(n);
    expect(typeGroupSelectedCount(chem, [...picked, "온도", "기타"]), "다른 묶음 종류는 세지 않음").toBe(n);
    expect(typeGroupSelectedCount(chem, [])).toBe(0);
    for (const g of SENSOR_TYPE_GROUPS) expect(typeGroupSelectedCount(g, TYPES), `${g.title} 전부`).toBe(GROUPS[g.title].length);
  });
});
