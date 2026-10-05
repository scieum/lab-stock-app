// 화면 11 시약장 설정 순수 규칙 (lib/cabinet-rules).
// 기대값: design/rules.json cabinet(door_types·shelves·storage_classes·incompatible·default_name·unassigned_label),
//         harness/d7-data.md §9(혼재 경고 문구 틀 · 칸 줄이기 · 이름 1~20자), design/frames/11-mobile.json(시안 예시 문구).
//         구현에서 읽지 않는다 — 구현 상수는 rules.json 과 같은지 비교만 한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOOR_TYPES,
  INCOMPATIBLE,
  SHELF_COUNTS,
  STORAGE_CLASSES,
  UNASSIGNED_LABEL,
  cabinetMeta,
  checkCabinetName,
  defaultCabinetName,
  incompatiblePairs,
  mixWarningText,
  mixWarnings,
  removedSlots,
  slotKeys,
  slotLabel,
  slotName,
  toggleClass,
  type DoorType,
  type SlotClasses,
  type SlotSide,
} from "../../lib/cabinet-rules";
import { ROOT, rules } from "./helpers";

type Cabinet = {
  door_types: string[];
  shelves: number[];
  storage_classes: string[];
  incompatible: [string, string][];
  default_name: string;
  unassigned_label: string;
};
const cab = rules.cabinet as Cabinet;

// ---------- 시안 프레임 11-mobile 의 예시 문구 ----------
type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const frame = JSON.parse(readFileSync(join(ROOT, "design/frames/11-mobile.json"), "utf8")) as { frames: { nodes: FrameNode[] }[] };
const frameText = (name: string) =>
  frame.frames[0].nodes.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);
const FRAME_WARNING = frameText("warning-text")[0];
const FRAME_META = frameText("cabinet-meta")[0];
const FRAME_SLOT_LABELS = frameText("slot-label");

// ---------- 규칙에서 도출한 기대값 ----------
// s2-spec 화면 11: 양문형 = 좌·우 2열, 단문형 = 1열
const DOUBLE = "양문형";
const SINGLE = "단문형";
const columns = (door: string) => (door === SINGLE ? 1 : 2);
const SIDE_NAME: Record<SlotSide, string> = { L: "좌", R: "우" };
const MAX_SHELVES = Math.max(...cab.shelves);
const MIN_SHELVES = Math.min(...cab.shelves);

// 한국어 조사: 받침이 있으면 과·은, 없으면 와·는 (분류 8종을 손으로 적은 표 — 구현의 받침 계산과 독립)
const BATCHIM: Record<string, boolean> = {
  유기: false,
  산: true,
  염기: false,
  산화제: false,
  인화성: true,
  무기염: true,
  독성: true,
  기타: false,
};
// d7 §9 혼재 경고: "{칸}: {A}과 {B}는 섞이면 위험해요. 다른 칸에 나눠 보관하세요"
const expectedWarning = (slot: string, a: string, b: string) =>
  `${slot}: ${a}${BATCHIM[a] ? "과" : "와"} ${b}${BATCHIM[b] ? "은" : "는"} 섞이면 위험해요. 다른 칸에 나눠 보관하세요`;

const isIncompatible = (a: string, b: string) =>
  cab.incompatible.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const pairsWithin = (classes: string[]) => cab.incompatible.filter(([a, b]) => classes.includes(a) && classes.includes(b));
const slot = (side: SlotSide, shelf: number, classes: string[]): SlotClasses => ({ side, shelf, classes });
const ids = (keys: { side: SlotSide; shelf: number }[]) => keys.map((k) => `${k.side}${k.shelf}`).sort();

describe("cabinet rules: 상수 = design/rules.json cabinet", () => {
  it("[K1][S11] 기대값 원본: rules.json cabinet 에 문 형태 2·단 수·분류 8종·비호환 5쌍, 조사 표가 분류 8종을 모두 덮는다", () => {
    expect(cab.door_types).toEqual([DOUBLE, SINGLE]);
    expect(cab.shelves.length).toBeGreaterThanOrEqual(2);
    expect(cab.storage_classes).toHaveLength(8);
    expect(cab.incompatible).toHaveLength(5);
    expect(Object.keys(BATCHIM).sort()).toEqual([...cab.storage_classes].sort());
    for (const [a, b] of cab.incompatible) {
      expect(cab.storage_classes).toContain(a);
      expect(cab.storage_classes).toContain(b);
    }
    expect(FRAME_WARNING, "프레임 warning-text").toBeTruthy();
    expect(FRAME_META, "프레임 cabinet-meta").toBeTruthy();
  });

  it("[K1][S11] DOOR_TYPES = rules.json cabinet.door_types (순서까지)", () => {
    expect([...DOOR_TYPES]).toEqual(cab.door_types);
  });

  it("[K1][S11] SHELF_COUNTS = rules.json cabinet.shelves (순서까지)", () => {
    expect([...SHELF_COUNTS]).toEqual(cab.shelves);
  });

  it("[K1][S11] STORAGE_CLASSES = rules.json cabinet.storage_classes (순서까지)", () => {
    expect([...STORAGE_CLASSES]).toEqual(cab.storage_classes);
  });

  it("[K1][S11] INCOMPATIBLE = rules.json cabinet.incompatible (쌍·순서까지)", () => {
    expect(INCOMPATIBLE.map((p) => [...p])).toEqual(cab.incompatible);
  });

  it("[K1][S11] UNASSIGNED_LABEL = rules.json cabinet.unassigned_label", () => {
    expect(UNASSIGNED_LABEL).toBe(cab.unassigned_label);
  });
});

describe("cabinet rules: 칸 이름 · 칸 수", () => {
  it('[K1][S11] 양문형 칸 이름: "좌1단" · "우3단" (문 + 단)', () => {
    expect(slotName({ side: "L", shelf: 1 }, DOUBLE as DoorType)).toBe("좌1단");
    expect(slotName({ side: "R", shelf: 3 }, DOUBLE as DoorType)).toBe("우3단");
    for (const side of ["L", "R"] as SlotSide[]) {
      for (let shelf = 1; shelf <= MAX_SHELVES; shelf++) {
        expect(slotName({ side, shelf }, DOUBLE as DoorType)).toBe(`${SIDE_NAME[side]}${shelf}단`);
      }
    }
  });

  it('[K1][S11] 단문형 칸 이름: 문 구분 없이 "1단"', () => {
    for (let shelf = 1; shelf <= MAX_SHELVES; shelf++) {
      const name = slotName({ side: "L", shelf }, SINGLE as DoorType);
      expect(name).toBe(`${shelf}단`);
      expect(name).not.toMatch(/좌|우/);
    }
  });

  it.each(cab.door_types.flatMap((d) => cab.shelves.map((s) => [d, s] as const)))(
    "[K1][S11] 칸 수: %s %i단 = 열 수 × 단 수, 칸이 겹치지 않는다",
    (door, shelves) => {
      const keys = slotKeys(door as DoorType, shelves);
      expect(keys).toHaveLength(columns(door) * shelves);
      expect(new Set(ids(keys)).size).toBe(keys.length);
      expect(keys.every((k) => k.shelf >= 1 && k.shelf <= shelves)).toBe(true);
      if (door === SINGLE) expect(new Set(keys.map((k) => k.side)).size).toBe(1);
      else expect(new Set(keys.map((k) => k.side))).toEqual(new Set(["L", "R"]));
      // 칸 이름도 겹치지 않는다
      expect(new Set(keys.map((k) => slotName(k, door as DoorType))).size).toBe(keys.length);
    },
  );

  it("[K1][S11] 칸 수 예: 양문형 4단 8칸 · 양문형 3단 6칸 · 단문형 4단 4칸 · 단문형 3단 3칸", () => {
    expect(slotKeys("양문형", 4)).toHaveLength(8);
    expect(slotKeys("양문형", 3)).toHaveLength(6);
    expect(slotKeys("단문형", 4)).toHaveLength(4);
    expect(slotKeys("단문형", 3)).toHaveLength(3);
  });

  it(`[K1][S11] 시약장 요약: 시안 "${FRAME_META}" (문 형태 · 단 수 · 칸 수)`, () => {
    expect(cabinetMeta("양문형", 4)).toBe(FRAME_META);
    for (const d of cab.door_types) {
      for (const s of cab.shelves) expect(cabinetMeta(d as DoorType, s)).toBe(`${d} · ${s}단 · ${columns(d) * s}칸`);
    }
  });
});

describe("cabinet rules: 분류 고르기", () => {
  it("[K1][S11] toggleClass: 없는 분류를 누르면 더해지고(여러 개 선택), 있는 분류를 누르면 빠진다", () => {
    const [a, b, c] = cab.storage_classes;
    const one = toggleClass([], a);
    expect(one).toEqual([a]);
    const two = toggleClass(one, b);
    expect([...two].sort()).toEqual([a, b].sort());
    const three = toggleClass(two, c);
    expect([...three].sort()).toEqual([a, b, c].sort());
    const back = toggleClass(three, b);
    expect([...back].sort()).toEqual([a, c].sort());
    expect(toggleClass(toggleClass(back, a), c)).toEqual([]);
  });

  it("[K1][S11] toggleClass: 넘긴 배열을 바꾸지 않고, 같은 분류가 두 번 들어가지 않는다", () => {
    const before = ["산"];
    const after = toggleClass(before, "염기");
    expect(before).toEqual(["산"]);
    expect(after).toHaveLength(2);
    for (const cls of cab.storage_classes) {
      const on = toggleClass([], cls);
      expect(on).toEqual([cls]);
      expect(toggleClass(on, cls)).toEqual([]);
    }
  });

  it("[K1][S11] toggleClass: 8종을 모두 고르면 8개, 누른 순서와 무관하게 rules 순서", () => {
    let forward: string[] = [];
    for (const cls of cab.storage_classes) forward = toggleClass(forward, cls);
    let backward: string[] = [];
    for (const cls of [...cab.storage_classes].reverse()) backward = toggleClass(backward, cls);
    expect(forward).toEqual(cab.storage_classes);
    expect(backward).toEqual(cab.storage_classes);
  });

  it('[K1][S11] 칸 라벨: 시안 "산 · 염기" (누른 순서와 무관), 분류가 없으면 "미지정"', () => {
    expect(FRAME_SLOT_LABELS).toContain("산 · 염기");
    expect(slotLabel(["산", "염기"])).toBe("산 · 염기");
    expect(slotLabel(["염기", "산"])).toBe("산 · 염기");
    expect(slotLabel(toggleClass(toggleClass([], "염기"), "산"))).toBe("산 · 염기");
    expect(slotLabel([])).toBe("미지정");
    for (const cls of cab.storage_classes) expect(slotLabel([cls])).toBe(cls);
  });
});

describe("cabinet rules: 혼재 경고", () => {
  it.each(cab.incompatible)("[K1][S11] mixWarnings: %s + %s 를 한 칸에 두면 경고 1줄 (두 순서 모두)", (a, b) => {
    for (const classes of [
      [a, b],
      [b, a],
    ]) {
      const out = mixWarnings([slot("L", 1, classes)], "양문형", MAX_SHELVES);
      expect(out, `[${classes.join(", ")}]`).toHaveLength(1);
      expect(out[0].slot).toBe("좌1단");
      expect(out[0].side).toBe("L");
      expect(out[0].shelf).toBe(1);
      expect([...out[0].pair].sort()).toEqual([a, b].sort());
      expect(out[0].text).toBe(expectedWarning("좌1단", a, b));
      expect(incompatiblePairs(classes)).toHaveLength(1);
    }
  });

  it("[K1][S11] mixWarnings: rules 에 없는 조합(호환)은 경고 0줄 — 2종 조합 전부", () => {
    let checked = 0;
    for (const a of cab.storage_classes) {
      for (const b of cab.storage_classes) {
        if (a === b || isIncompatible(a, b)) continue;
        expect(mixWarnings([slot("L", 1, [a, b])], "양문형", MAX_SHELVES), `${a} + ${b}`).toEqual([]);
        expect(incompatiblePairs([a, b]), `${a} + ${b}`).toEqual([]);
        checked += 1;
      }
    }
    // 8종 순서쌍 56 − 비호환 5쌍 × 2
    const n = cab.storage_classes.length;
    expect(checked).toBe(n * (n - 1) - cab.incompatible.length * 2);
  });

  it("[K1][S11] mixWarnings: 분류 0개·1개인 칸은 경고 0줄", () => {
    expect(mixWarnings([], "양문형", MAX_SHELVES)).toEqual([]);
    expect(mixWarnings([slot("L", 1, [])], "양문형", MAX_SHELVES)).toEqual([]);
    for (const cls of cab.storage_classes) expect(mixWarnings([slot("L", 1, [cls])], "양문형", MAX_SHELVES)).toEqual([]);
  });

  it("[K1][S11] mixWarnings: 한 칸에 3분류면 그 안의 비호환 쌍을 모두 (3종 조합 전부)", () => {
    const cs = cab.storage_classes;
    let withTwoOrMore = 0;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        for (let k = j + 1; k < cs.length; k++) {
          const classes = [cs[k], cs[i], cs[j]];
          const want = pairsWithin(classes);
          if (want.length >= 2) withTwoOrMore += 1;
          const out = mixWarnings([slot("R", 2, classes)], "양문형", MAX_SHELVES);
          expect(out.map((w) => w.text).sort(), classes.join(" + ")).toEqual(want.map(([a, b]) => expectedWarning("우2단", a, b)).sort());
        }
      }
    }
    expect(withTwoOrMore, "비호환 쌍이 2개 이상인 3종 조합이 있다").toBeGreaterThan(0);
  });

  it("[K1][S11] mixWarnings: 산 + 염기 + 인화성 = 2줄(산·염기, 산·인화성), 8종 전부 = rules 5쌍 전부", () => {
    const three = mixWarnings([slot("L", 1, ["산", "염기", "인화성"])], "양문형", MAX_SHELVES);
    expect(three.map((w) => w.text).sort()).toEqual([expectedWarning("좌1단", "산", "염기"), expectedWarning("좌1단", "산", "인화성")].sort());
    const all = mixWarnings([slot("L", 1, cab.storage_classes)], "양문형", MAX_SHELVES);
    expect(all.map((w) => w.text)).toEqual(cab.incompatible.map(([a, b]) => expectedWarning("좌1단", a, b)));
  });

  it("[K1][S11] mixWarnings: 칸마다 따로 — 여러 칸이면 칸 이름이 붙은 줄이 각각, 다른 칸끼리는 섞어 보지 않는다", () => {
    const out = mixWarnings(
      [slot("R", 3, ["산화제", "유기"]), slot("L", 1, ["산", "염기"]), slot("L", 2, ["산"]), slot("R", 2, ["염기"])],
      "양문형",
      MAX_SHELVES,
    );
    expect(out.map((w) => w.text).sort()).toEqual([expectedWarning("좌1단", "산", "염기"), expectedWarning("우3단", "산화제", "유기")].sort());
  });

  it('[K1][S11] mixWarnings: 단문형이면 칸 이름이 "1단" 꼴', () => {
    const out = mixWarnings([slot("L", 2, ["산", "염기"])], "단문형", MAX_SHELVES);
    expect(out).toHaveLength(1);
    expect(out[0].slot).toBe("2단");
    expect(out[0].text).toBe(expectedWarning("2단", "산", "염기"));
  });

  it("[K1][S11] mixWarnings: 지금 문 형태·단 수에 없는 칸(줄여서 사라진 칸)은 경고하지 않는다", () => {
    expect(mixWarnings([slot("R", 1, ["산", "염기"])], "단문형", MAX_SHELVES)).toEqual([]);
    expect(mixWarnings([slot("L", MAX_SHELVES, ["산", "염기"])], "양문형", MIN_SHELVES)).toEqual([]);
    expect(mixWarnings([slot("L", MAX_SHELVES, ["산", "염기"])], "양문형", MAX_SHELVES)).toHaveLength(1);
  });

  it(`[K1][S11] 경고 문구 = 시안 예시 "${FRAME_WARNING}"`, () => {
    expect(FRAME_WARNING).toBe("좌1단: 산과 염기는 섞이면 위험해요. 다른 칸에 나눠 보관하세요");
    expect(mixWarningText("좌1단", "산", "염기")).toBe(FRAME_WARNING);
    expect(mixWarnings([slot("L", 1, ["산", "염기"])], "양문형", 4)[0].text).toBe(FRAME_WARNING);
    expect(mixWarnings([slot("L", 1, ["염기", "산"])], "양문형", 4)[0].text).toBe(FRAME_WARNING);
  });

  it("[K1][S11] 경고 문구 조사: 받침이 있으면 과·은, 없으면 와·는 — 분류 8종 순서쌍 전부", () => {
    let n = 0;
    for (const a of cab.storage_classes) {
      for (const b of cab.storage_classes) {
        if (a === b) continue;
        expect(mixWarningText("우3단", a, b), `${a} + ${b}`).toBe(expectedWarning("우3단", a, b));
        n += 1;
      }
    }
    expect(n).toBe(cab.storage_classes.length * (cab.storage_classes.length - 1));
    // 대표 예 (손으로 적은 문장)
    expect(mixWarningText("1단", "산화제", "인화성")).toBe("1단: 산화제와 인화성은 섞이면 위험해요. 다른 칸에 나눠 보관하세요");
    expect(mixWarningText("1단", "산화제", "유기")).toBe("1단: 산화제와 유기는 섞이면 위험해요. 다른 칸에 나눠 보관하세요");
    expect(mixWarningText("1단", "산", "인화성")).toBe("1단: 산과 인화성은 섞이면 위험해요. 다른 칸에 나눠 보관하세요");
    expect(mixWarningText("1단", "독성", "산")).toBe("1단: 독성과 산은 섞이면 위험해요. 다른 칸에 나눠 보관하세요");
  });
});

describe("cabinet rules: 칸 줄이기 (d7 §9)", () => {
  const at = (doorType: string, shelves: number) => ({ doorType: doorType as DoorType, shelves });

  it("[K1][S11] removedSlots: 양문형 → 단문형이면 한쪽 문의 칸이 모두 사라진다 (단 수만큼)", () => {
    for (const s of cab.shelves) {
      const out = removedSlots(at(DOUBLE, s), at(SINGLE, s));
      expect(out).toHaveLength(s);
      expect(new Set(out.map((k) => k.side)).size, "한쪽 문만").toBe(1);
      expect(out.map((k) => k.shelf).sort()).toEqual(Array.from({ length: s }, (_, i) => i + 1));
      // 남는 칸 + 사라지는 칸 = 원래 칸
      expect(ids([...out, ...slotKeys(SINGLE as DoorType, s)])).toEqual(ids(slotKeys(DOUBLE as DoorType, s)));
    }
  });

  it("[K1][S11] removedSlots: 4단 → 3단이면 맨 아래 단의 칸이 사라진다 (양문형 2칸 · 단문형 1칸)", () => {
    for (const d of cab.door_types) {
      const out = removedSlots(at(d, 4), at(d, 3));
      expect(out).toHaveLength(columns(d));
      expect(out.every((k) => k.shelf === 4)).toBe(true);
    }
    expect(ids(removedSlots(at(DOUBLE, 4), at(DOUBLE, 3)))).toEqual(["L4", "R4"]);
  });

  it("[K1][S11] removedSlots: 양문형 4단 → 단문형 3단(둘 다 줄임)이면 8 − 3 = 5칸", () => {
    const out = removedSlots(at(DOUBLE, 4), at(SINGLE, 3));
    expect(out).toHaveLength(columns(DOUBLE) * 4 - columns(SINGLE) * 3);
    expect(new Set(ids(out)).size).toBe(out.length);
    const kept = ids(slotKeys(SINGLE as DoorType, 3));
    for (const id of ids(out)) expect(kept).not.toContain(id);
    expect(ids([...out, ...slotKeys(SINGLE as DoorType, 3)])).toEqual(ids(slotKeys(DOUBLE as DoorType, 4)));
  });

  it("[K1][S11] removedSlots: 늘리는 방향·그대로면 0칸", () => {
    expect(removedSlots(at(SINGLE, 3), at(DOUBLE, 3))).toEqual([]);
    expect(removedSlots(at(DOUBLE, 3), at(DOUBLE, 4))).toEqual([]);
    expect(removedSlots(at(SINGLE, 3), at(DOUBLE, 4))).toEqual([]);
    expect(removedSlots(at(SINGLE, 3), at(SINGLE, 4))).toEqual([]);
    for (const d of cab.door_types) for (const s of cab.shelves) expect(removedSlots(at(d, s), at(d, s))).toEqual([]);
  });

  it("[K1][S11] removedSlots: 한쪽은 줄이고 한쪽은 늘리면 줄어든 쪽 칸만 (단문형 4단 → 양문형 3단 = 1칸, 양문형 3단 → 단문형 4단 = 3칸)", () => {
    const a = removedSlots(at(SINGLE, 4), at(DOUBLE, 3));
    expect(a).toHaveLength(1);
    expect(a[0].shelf).toBe(4);
    const b = removedSlots(at(DOUBLE, 3), at(SINGLE, 4));
    expect(b).toHaveLength(3);
    expect(new Set(b.map((k) => k.side)).size).toBe(1);
  });
});

describe("cabinet rules: 시약장 이름 (d7 §9)", () => {
  const NAME_MAX = 20; // d7 §9 이름 바꾸기: trim 후 1~20자

  it("[K1][S11] checkCabinetName: 앞뒤 공백을 떼고 받아들인다", () => {
    const r = checkCabinetName("  화학 준비실 시약장 \t");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("화학 준비실 시약장");
    const plain = checkCabinetName("1번 시약장");
    expect(plain.ok).toBe(true);
    if (plain.ok) expect(plain.value).toBe("1번 시약장");
  });

  it("[K1][S11] checkCabinetName: 빈 값·공백만은 거부(안내 문구 있음)", () => {
    for (const v of ["", " ", "   ", "\t\n"]) {
      const r = checkCabinetName(v);
      expect(r.ok, JSON.stringify(v)).toBe(false);
      if (!r.ok) expect(r.error.trim()).not.toBe("");
    }
  });

  it("[K1][S11] checkCabinetName: 1자·20자는 허용, 21자는 거부", () => {
    const one = checkCabinetName("가");
    expect(one.ok).toBe(true);
    const max = "가".repeat(NAME_MAX);
    const ok = checkCabinetName(max);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toBe(max);
    const over = checkCabinetName("가".repeat(NAME_MAX + 1));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.trim()).not.toBe("");
    expect(checkCabinetName("a".repeat(NAME_MAX)).ok).toBe(true);
    expect(checkCabinetName("a".repeat(NAME_MAX + 1)).ok).toBe(false);
  });

  it("[K1][S11] checkCabinetName: 길이는 공백을 뗀 뒤에 센다 (20자 + 앞뒤 공백 = 허용, 가운데 공백은 글자)", () => {
    const max = "가".repeat(NAME_MAX);
    const padded = checkCabinetName(`  ${max}  `);
    expect(padded.ok).toBe(true);
    if (padded.ok) expect(padded.value).toBe(max);
    expect(checkCabinetName(`${"가".repeat(10)} ${"가".repeat(10)}`).ok, "가운데 공백 포함 21자").toBe(false);
    expect(checkCabinetName(`${"가".repeat(10)} ${"가".repeat(9)}`).ok, "가운데 공백 포함 20자").toBe(true);
  });

  it(`[K1][S11] defaultCabinetName(n) = rules.json cabinet.default_name "${cab.default_name}"`, () => {
    expect(cab.default_name).toContain("{n}");
    for (const n of [1, 2, 3, 10, 20]) expect(defaultCabinetName(n)).toBe(cab.default_name.replace("{n}", String(n)));
    expect(defaultCabinetName(1)).toBe("1번 시약장");
    // 기본 이름은 이름 규칙을 통과한다
    expect(checkCabinetName(defaultCabinetName(20)).ok).toBe(true);
  });
});
