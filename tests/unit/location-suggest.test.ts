// 시약 위치 추천 순수 함수 (lib/location-suggest — d7 §17, 디자인 1.17 suggest).
// 기대값: harness/d7-data.md §17 추천 규칙 문장 · design/rules.json cabinet(storage_classes · incompatible · door_types · shelves) · suggest.rule.
//   - 후보 = 칸 분류(storage_classes)에 시약 분류가 있는 칸
//   - 그 칸에 이미 있는 시약들의 분류와 incompatible 조합이 생기는 칸은 뺀다
//   - (1) 칸 안 시약 수 적은 순 (2) 시약장 번호 순 (3) 칸 순(화면 11 배치도 순서: 위 단부터, 단마다 좌 → 우)
//   - 그 시약 자신은 빼고 센다 · 분류 없음/후보 없음 = 추천 없음
// 아래 reference() 는 위 문장을 테스트 쪽에서 따로 옮긴 것이다 (구현에서 읽지 않는다).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSuggestedSlot,
  suggestLocation,
  toSuggestCabinets,
  type SuggestCabinet,
  type SuggestSlot,
} from "../../lib/location-suggest";
import { ROOT, read, rules } from "./helpers";

type Cab = { storage_classes: string[]; incompatible: [string, string][]; door_types: string[]; shelves: number[] };
const CAB = rules.cabinet as Cab;
const CLASSES = CAB.storage_classes;
const INCOMPAT = CAB.incompatible;
const [DOUBLE, SINGLE] = CAB.door_types;
const D7 = read(join(ROOT, "harness/d7-data.md"));
const D7_17 = D7.slice(D7.indexOf("## 17."), D7.indexOf("\n## ", D7.indexOf("## 17.") + 1));

const sides = (door: string): ("L" | "R")[] => (door === SINGLE ? ["L"] : ["L", "R"]);
/** 화면 11 배치도 순서: 위 단(1단)부터, 단마다 좌 → 우 */
const order = (door: string, shelves: number) => {
  const out: { side: "L" | "R"; shelf: number }[] = [];
  for (let s = 1; s <= shelves; s++) for (const side of sides(door)) out.push({ side, shelf: s });
  return out;
};
const clash = (a: string, b: string) => INCOMPAT.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** d7 §17 를 그대로 옮긴 기대값 계산 */
function reference(target: { id?: string | null; storageClass: string | null | undefined }, cabinets: readonly SuggestCabinet[]) {
  const cls = target.storageClass;
  if (!cls || !CLASSES.includes(cls)) return null;
  const cands: { cabinetId: string; number: number; cabIndex: number; ord: number; side: string; shelf: number; count: number }[] = [];
  cabinets.forEach((c, cabIndex) => {
    order(c.doorType, c.shelves).forEach((k, ord) => {
      const slot = c.slots.find((s) => s.side === k.side && s.shelf === k.shelf);
      if (!slot || !slot.classes.includes(cls)) return;
      const others = slot.reagents.filter((r) => !target.id || r.id !== target.id);
      if (others.some((r) => typeof r.storageClass === "string" && clash(cls, r.storageClass))) return;
      cands.push({ cabinetId: c.id, number: c.number, cabIndex, ord, side: k.side, shelf: k.shelf, count: others.length });
    });
  });
  cands.sort((a, b) => a.count - b.count || a.number - b.number || a.cabIndex - b.cabIndex || a.ord - b.ord);
  const top = cands[0];
  return top ? { cabinetId: top.cabinetId, side: top.side, shelf: top.shelf, count: top.count } : null;
}

const pick = (s: ReturnType<typeof suggestLocation>) => (s ? { cabinetId: s.cabinetId, side: s.side, shelf: s.shelf, count: s.count } : null);

let seq = 0;
const rid = () => `r${++seq}`;
function slot(key: string, classes: string[], reagentClasses: (string | null)[] = [], ids?: string[]): SuggestSlot {
  return {
    side: key[0] as "L" | "R",
    shelf: Number(key.slice(1)),
    classes,
    reagents: reagentClasses.map((c, i) => ({ id: ids?.[i] ?? rid(), storageClass: c })),
    slotId: `slot-${key}-${seq}`,
  };
}
function cab(id: string, number: number, slots: SuggestSlot[], door = DOUBLE, shelves = CAB.shelves[CAB.shelves.length - 1]): SuggestCabinet {
  return { id, number, label: `${number}번 시약장`, doorType: door as SuggestCabinet["doorType"], shelves, slots };
}

describe("기대값 원본", () => {
  it("[K1][S*] d7 §17 추천 규칙 문장과 rules.json suggest·cabinet 값이 있다", () => {
    expect(D7_17).toMatch(/칸 분류\(storage_classes\)에 시약의 분류가 있는/);
    expect(D7_17).toMatch(/incompatible 조합이 생기는 칸은 뺀다/);
    expect(D7_17).toMatch(/\(1\) 칸 안 시약 수 적은 순 \(2\) 시약장 번호 순 \(3\) 칸 순/);
    expect(D7_17).toMatch(/그 시약 자신을 빼고 센다/);
    expect(D7_17).toMatch(/시약 분류가 없거나 후보가 없으면 추천 없음/);
    expect(typeof rules.suggest?.rule, "rules.json suggest.rule").toBe("string");
    expect(INCOMPAT.length, "cabinet.incompatible").toBeGreaterThan(0);
    expect(CLASSES.length, "cabinet.storage_classes").toBeGreaterThan(1);
  });
});

describe("suggestLocation (d7 §17)", () => {
  const [A, B] = INCOMPAT[0]; // 섞으면 위험한 한 쌍
  const free = CLASSES.find((c) => !INCOMPAT.some(([x, y]) => x === c || y === c))!; // 위험 조합이 없는 분류

  it("[K1][S*] 후보는 칸 분류에 시약 분류가 있는 칸만 — 분류가 다른 칸·분류 없는 칸은 비어 있어도 고르지 않는다", () => {
    const cabinets = [cab("c1", 1, [slot("L1", []), slot("R1", [B]), slot("L2", [free, A], [free, free])])];
    expect(pick(suggestLocation({ storageClass: A }, cabinets))).toEqual({ cabinetId: "c1", side: "L", shelf: 2, count: 2 });
  });

  it("[K1][S*] 그 칸 시약 분류와 rules cabinet.incompatible 조합이 생기는 칸은 뺀다 (모든 조합, 양방향)", () => {
    for (const [x, y] of INCOMPAT) {
      for (const [me, there] of [[x, y], [y, x]]) {
        // L1: 비어 있지만 me·there 둘 다 칸 분류 → 시약 there 가 있으면 위험 / R1: me 칸 · 시약 2개(위험 없음)
        const safe = CLASSES.find((c) => c !== me && !clash(me, c))!;
        const cabinets = [cab("c", 1, [slot("L1", [me, there], [there]), slot("R1", [me], [safe, safe])])];
        expect(pick(suggestLocation({ storageClass: me }, cabinets)), `${me} 은 ${there} 시약이 있는 칸 제외`).toEqual({ cabinetId: "c", side: "R", shelf: 1, count: 2 });
        // 위험 칸만 있으면 추천 없음
        expect(suggestLocation({ storageClass: me }, [cab("c", 1, [slot("L1", [me, there], [there])])]), `${me}: 후보 없음`).toBeNull();
      }
    }
  });

  it("[K1][S*] 칸 분류에 위험 분류가 같이 있어도(시약이 없으면) 후보 — 빼는 기준은 칸에 이미 있는 시약들의 분류", () => {
    const cabinets = [cab("c", 1, [slot("L1", [A, B])])];
    expect(pick(suggestLocation({ storageClass: A }, cabinets))).toEqual({ cabinetId: "c", side: "L", shelf: 1, count: 0 });
  });

  it("[K1][S*] 정렬 (1) 칸 안 시약 수 적은 순이 시약장 번호·칸 순보다 앞선다", () => {
    const cabinets = [
      cab("c1", 1, [slot("L1", [free], [free, free]), slot("R1", [free], [free])]),
      cab("c2", 2, [slot("R4", [free], [])]),
    ];
    expect(pick(suggestLocation({ storageClass: free }, cabinets))).toEqual({ cabinetId: "c2", side: "R", shelf: 4, count: 0 });
  });

  it("[K1][S*] 정렬 (2) 시약 수가 같으면 시약장 번호 작은 쪽 — 입력 순서와 무관", () => {
    const cabinets = [cab("c5", 5, [slot("L1", [free])]), cab("c3", 3, [slot("R4", [free])]), cab("c4", 4, [slot("L1", [free])])];
    expect(pick(suggestLocation({ storageClass: free }, cabinets))).toEqual({ cabinetId: "c3", side: "R", shelf: 4, count: 0 });
  });

  it("[K1][S*] 정렬 (3) 같은 시약장·같은 수면 칸 순: 위 단부터, 단마다 좌 → 우 (양문형 · 단문형)", () => {
    // 양문형: R1 이 L2 보다 앞 (1단이 먼저), 같은 단에서는 L 이 R 보다 앞
    expect(pick(suggestLocation({ storageClass: free }, [cab("c", 1, [slot("L2", [free]), slot("R1", [free])])]))).toMatchObject({ side: "R", shelf: 1 });
    expect(pick(suggestLocation({ storageClass: free }, [cab("c", 1, [slot("R2", [free]), slot("L2", [free])])]))).toMatchObject({ side: "L", shelf: 2 });
    // 단문형: 단 순
    expect(pick(suggestLocation({ storageClass: free }, [cab("c", 1, [slot("L3", [free]), slot("L2", [free])], SINGLE, CAB.shelves[0])]))).toMatchObject({ side: "L", shelf: 2 });
  });

  it("[K1][S*] 이미 칸에 든 시약은 그 시약 자신을 빼고 센다 (자기 분류와의 조합도 보지 않는다)", () => {
    // 지금 L1 에 자기 자신만 → L1 수 0 · R1 수 0 → 칸 순으로 L1 (자기 칸)
    const cabinets = [cab("c", 1, [slot("L1", [free], [free], ["me"]), slot("R1", [free])])];
    expect(pick(suggestLocation({ id: "me", storageClass: free }, cabinets))).toEqual({ cabinetId: "c", side: "L", shelf: 1, count: 0 });
    // id 를 모르면(새 시약) 자기 자신도 다른 시약으로 센다 → R1
    expect(pick(suggestLocation({ storageClass: free }, cabinets))).toEqual({ cabinetId: "c", side: "R", shelf: 1, count: 0 });
  });

  it("[K1][S*] 분류 없음(null·undefined·빈 문자열) · 모르는 값 · 후보 없음 · 시약장 없음 → null", () => {
    const cabinets = [cab("c", 1, [slot("L1", CLASSES)])];
    for (const v of [null, undefined, "", "모르는분류", " 산"]) expect(suggestLocation({ storageClass: v }, cabinets), `분류 ${JSON.stringify(v)}`).toBeNull();
    expect(suggestLocation({ storageClass: free }, [cab("c", 1, [slot("L1", [A])])]), "맞는 칸 없음").toBeNull();
    expect(suggestLocation({ storageClass: free }, []), "시약장 0개").toBeNull();
  });

  it("[K1][S*] 시약장의 지금 문 형태·단 수 격자 밖 칸(단문형의 R, 3단의 4단)은 무시한다", () => {
    const cabinets = [cab("c", 1, [slot("R1", [free]), slot("L4", [free]), slot("L3", [free], [free])], SINGLE, 3)];
    expect(pick(suggestLocation({ storageClass: free }, cabinets))).toEqual({ cabinetId: "c", side: "L", shelf: 3, count: 1 });
    expect(suggestLocation({ storageClass: free }, [cab("c", 1, [slot("R2", [free])], SINGLE, 3)])).toBeNull();
  });

  it("[K1][S*] 결과에 시약장 번호·이름·문 형태·DB 칸 id 가 실린다", () => {
    const s = slot("R2", [free]);
    const out = suggestLocation({ storageClass: free }, [cab("cx", 7, [s])]);
    expect(out).toMatchObject({ cabinetId: "cx", cabinetNumber: 7, cabinetLabel: "7번 시약장", doorType: DOUBLE, side: "R", shelf: 2, slotId: s.slotId, count: 0 });
  });

  it("[K1][S*] 무작위 학교 400개: 결과 = d7 §17 기대값 계산 (분류·위험 조합·수·번호·칸 순·자기 자신)", () => {
    let x = 20261007;
    const rnd = (n: number) => {
      x = (x * 1103515245 + 12345) % 2147483648;
      return x % n;
    };
    for (let t = 0; t < 400; t++) {
      const cabinets: SuggestCabinet[] = [];
      const ids: string[] = [];
      const nCab = rnd(4);
      const numbers = [1, 2, 3, 4, 5, 6].sort(() => rnd(3) - 1).slice(0, nCab);
      for (let i = 0; i < nCab; i++) {
        const door = rnd(2) ? DOUBLE : SINGLE;
        const shelves = CAB.shelves[rnd(CAB.shelves.length)];
        const slots: SuggestSlot[] = [];
        for (const k of order(DOUBLE, 4)) {
          if (rnd(4) === 0) continue;
          const classes = CLASSES.filter(() => rnd(4) === 0);
          const rc = Array.from({ length: rnd(4) }, () => (rnd(5) === 0 ? null : CLASSES[rnd(CLASSES.length)]));
          const s = slot(`${k.side}${k.shelf}`, classes, rc);
          ids.push(...s.reagents.map((r) => r.id));
          slots.push(s);
        }
        cabinets.push(cab(`c${t}-${i}`, numbers[i], slots, door, shelves));
      }
      const cls = rnd(6) === 0 ? null : CLASSES[rnd(CLASSES.length)];
      const self = ids.length && rnd(2) ? ids[rnd(ids.length)] : null;
      const target = { id: self, storageClass: cls };
      expect(pick(suggestLocation(target, cabinets)), `사례 ${t}`).toEqual(reference(target, cabinets));
    }
  });
});

describe("isSuggestedSlot", () => {
  const s = { cabinetId: "c1", side: "R" as const, shelf: 2 };
  it("[K1][S*] 시약장·좌우·단이 모두 같을 때만 true, 추천·시약장·칸이 없으면 false", () => {
    expect(isSuggestedSlot(s, "c1", { side: "R", shelf: 2 })).toBe(true);
    expect(isSuggestedSlot(s, "c2", { side: "R", shelf: 2 })).toBe(false);
    expect(isSuggestedSlot(s, "c1", { side: "L", shelf: 2 })).toBe(false);
    expect(isSuggestedSlot(s, "c1", { side: "R", shelf: 1 })).toBe(false);
    expect(isSuggestedSlot(null, "c1", { side: "R", shelf: 2 })).toBe(false);
    expect(isSuggestedSlot(undefined, "c1", { side: "R", shelf: 2 })).toBe(false);
    expect(isSuggestedSlot(s, null, { side: "R", shelf: 2 })).toBe(false);
    expect(isSuggestedSlot(s, "c1", null)).toBe(false);
  });
});

describe("toSuggestCabinets (DB 행 → 추천 입력)", () => {
  it("[K1][S*] 칸 분류·칸 안 시약(id·분류)을 묶고, 격자 밖 칸·칸 없는 시약은 빠진다 — 추천은 DB 칸 id 를 돌려준다", () => {
    const free = CLASSES.find((c) => !INCOMPAT.some(([x, y]) => x === c || y === c))!;
    const cabinets = toSuggestCabinets(
      [
        { id: "c2", number: 2, label: "둘", door_type: SINGLE, shelves: 3 },
        { id: "c1", number: 1, label: "하나", door_type: DOUBLE, shelves: 4 },
      ],
      [
        { id: "s-c1-L1", cabinet_id: "c1", side: "L", shelf: 1, storage_classes: [free] },
        { id: "s-c1-R1", cabinet_id: "c1", side: "R", shelf: 1, storage_classes: [free] },
        { id: "s-c2-L1", cabinet_id: "c2", side: "L", shelf: 1, storage_classes: [free] },
        { id: "s-c2-R1", cabinet_id: "c2", side: "R", shelf: 1, storage_classes: [free] }, // 단문형 격자 밖
        { id: "s-c2-L4", cabinet_id: "c2", side: "L", shelf: 4, storage_classes: [free] }, // 3단 격자 밖
      ],
      [
        { id: "a", slot_id: "s-c1-L1", storage_class: free },
        { id: "b", slot_id: null, storage_class: free },
        { id: "c", slot_id: "s-c2-L1", storage_class: free },
        { id: "d", slot_id: "s-c2-L1", storage_class: null },
      ],
    );
    expect(cabinets.map((c) => [c.id, c.number, c.doorType, c.shelves])).toEqual([
      ["c2", 2, SINGLE, 3],
      ["c1", 1, DOUBLE, 4],
    ]);
    const c2 = cabinets[0];
    expect(c2.slots.map((s) => `${s.side}${s.shelf}`), "격자 밖 칸 제외").toEqual(["L1"]);
    expect(c2.slots[0].reagents.map((r) => r.id)).toEqual(["c", "d"]);
    expect(cabinets[1].slots.find((s) => s.side === "L")!.reagents.map((r) => r.id)).toEqual(["a"]);
    // c1 R1 (0개) · c1 L1 (1개) · c2 L1 (2개) → c1 R1
    expect(suggestLocation({ storageClass: free }, cabinets)).toMatchObject({ cabinetId: "c1", side: "R", shelf: 1, slotId: "s-c1-R1", count: 0 });
    // a 자신: c1 L1 의 수 0 → 칸 순으로 L1
    expect(suggestLocation({ id: "a", storageClass: free }, cabinets)).toMatchObject({ cabinetId: "c1", side: "L", shelf: 1, slotId: "s-c1-L1", count: 0 });
  });
});
