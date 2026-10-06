// 화면 5 추출 결과의 중복 합치기 (d7 §13 "중복", 2026-10-06) · 저장 예측의 출처 규칙 (d7 §11-1 "화면 5 와의 관계").
// 기대값: harness/d7-data.md §13 중복 — 이름 열쇠(reagentNameKey)가 같고 단위가 같은(정규화 뒤) 행은 한 줄로 합쳐 1조 사용량을 더하고
//         "N개 행을 합쳤어요" 안내, 단위가 다르면 합치지 않는다, 합친 뒤에도 같은 우리 학교 시약에 연결된 행은 저장 때 합산.
//         §11-1 — save_reorder_basis: source 가 'auto' 이면 필요량으로 항상 바꾸고, 'basis'·'manual' 이면 더 큰 값만.
// 구현 상수(EXTRACTION_ROWS_MAX · AMOUNT_MAX)는 상한 경계를 만들 때만 쓴다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AMOUNT_MAX,
  EXTRACTION_ROWS_MAX,
  basisOutcome,
  mergedRowsText,
  normalizeExtraction,
  planSave,
  reagentNameKey,
  type ExtractedItem,
  type ManualReagent,
} from "../../lib/manual-rules";
import { ROOT } from "./helpers";

const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const DUP_LINE = D7.split(/\r?\n/).find((l) => l.startsWith("| 중복 (")) ?? "";
/** "N개 행을 합쳤어요" → (n) => "3개 행을 합쳤어요" */
const MERGED_TEMPLATE = /"(N개 행을 합쳤어요)"/.exec(DUP_LINE)?.[1] ?? "";
const mergedText = (n: number) => MERGED_TEMPLATE.replace("N", String(n));

const R = (id: string, name: string, unit = "mL", minStock = 0, source?: ManualReagent["source"]): ManualReagent => ({ id, name, unit, minStock, source });
const view = (rows: ReturnType<typeof normalizeExtraction>) => rows.map((r) => [r.name, r.perGroup, r.unit, r.mergedCount ?? 1]);

describe("중복 합치기: 기대값 원본 (d7 §13 중복)", () => {
  it("[K1][S5] d7 §13 '중복' 줄에 합치기 조건(reagentNameKey · 단위)·안내 문구·단위가 다르면 합치지 않음이 있다", () => {
    expect(DUP_LINE, "d7 §13 중복 줄").not.toBe("");
    expect(DUP_LINE).toContain("reagentNameKey");
    expect(DUP_LINE).toMatch(/단위가 다르면 합치지 않는다/);
    expect(MERGED_TEMPLATE).toBe("N개 행을 합쳤어요");
  });
});

describe("normalizeExtraction 중복 합치기 (d7 §13 중복)", () => {
  const reagents = [R("m-hcl", "염산 0.1M"), R("m-naoh", "수산화나트륨", "g"), R("m-etoh", "에탄올")];

  it("[K1][S5] 같은 열쇠 + 같은 단위 → 한 줄, 1조 사용량 합, mergedCount = 합친 행 수, 이름·연결은 처음 행", () => {
    const rows = normalizeExtraction(
      [
        { name: "염산 0.1M", amount: 50, unit: "mL" },
        { name: "수산화나트륨", amount: 2, unit: "g" },
        { name: "염산(0.1M)", amount: 30, unit: "mL" },
        { name: "  염산   0.1M ", amount: 5, unit: "ml" },
      ],
      reagents,
    );
    expect(reagentNameKey("염산 0.1M"), "전제: 세 이름의 열쇠가 같다").toBe(reagentNameKey("염산(0.1M)"));
    expect(view(rows)).toEqual([
      ["염산 0.1M", "85", "mL", 3],
      ["수산화나트륨", "2", "g", 1],
    ]);
    expect(rows[0].extractedPerGroup, "합친 값이 추출값 (고친 칸이 아니다)").toBe(85);
    expect(rows.map((r) => r.reagentId)).toEqual(["m-hcl", "m-naoh"]);
    expect(rows.map((r) => r.id), "행 id 는 합친 뒤 순서대로").toEqual(["row-1", "row-2"]);
  });

  it("[K1][S5] 환산 뒤 단위가 같으면 합친다 (L·mL → mL, kg·g·mg → g), 소수 합은 오차 없이", () => {
    const rows = normalizeExtraction(
      [
        { name: "염산", amount: 0.05, unit: "L" },
        { name: "염산", amount: 0.1, unit: "mL" },
        { name: "염산", amount: 0.2, unit: "mL" },
        { name: "수산화나트륨", amount: 0.001, unit: "kg" },
        { name: "수산화나트륨", amount: 500, unit: "mg" },
      ],
      reagents,
    );
    expect(view(rows)).toEqual([
      ["염산", "50.3", "mL", 3],
      ["수산화나트륨", "1.5", "g", 2],
    ]);
  });

  it("[K1][S5] 단위가 다르면 합치지 않는다 (mL ↔ g ↔ 병)", () => {
    const rows = normalizeExtraction(
      [
        { name: "에탄올", amount: 20, unit: "mL" },
        { name: "에탄올", amount: 3, unit: "g" },
        { name: "에탄올", amount: 1, unit: "병" },
        { name: "에탄올", amount: 5, unit: "mL" },
      ],
      reagents,
    );
    expect(view(rows)).toEqual([
      ["에탄올", "25", "mL", 2],
      ["에탄올", "3", "g", 1],
      ["에탄올", "1", "병", 1],
    ]);
  });

  it("[K1][S5] 단위 미확정(빈 단위·모르는 단위)은 합치지 않는다 — 같은 이름이어도 각각 한 줄", () => {
    const rows = normalizeExtraction(
      [
        { name: "페놀프탈레인", amount: 2, unit: "방울" },
        { name: "페놀프탈레인", amount: 3, unit: "방울" },
        { name: "페놀프탈레인", amount: 1, unit: "" },
      ],
      reagents,
    );
    expect(view(rows)).toEqual([
      ["페놀프탈레인", "2", "", 1],
      ["페놀프탈레인", "3", "", 1],
      ["페놀프탈레인", "1", "", 1],
    ]);
  });

  it("[K1][S5] 열쇠가 빈 이름(문장부호만)은 합치지 않는다, 이름 없는 줄은 버린다", () => {
    const rows = normalizeExtraction(
      [
        { name: "()", amount: 1, unit: "mL" },
        { name: "()", amount: 2, unit: "mL" },
        { name: "", amount: 9, unit: "mL" },
        { amount: 9, unit: "mL" } as ExtractedItem,
      ],
      reagents,
    );
    expect(reagentNameKey("()"), "전제: 열쇠가 빈 이름").toBe("");
    expect(view(rows)).toEqual([
      ["()", "1", "mL", 1],
      ["()", "2", "mL", 1],
    ]);
  });

  it("[K1][S5] 수량 없는 행은 같은 줄에 흡수되고 합에서 빠진다 · 모두 수량이 없으면 null(빈 칸)", () => {
    const rows = normalizeExtraction(
      [
        { name: "염산", amount: null, unit: "mL" },
        { name: "염산", amount: 30, unit: "mL" },
        { name: "염산", amount: "적당량", unit: "mL" },
        { name: "에탄올", amount: null, unit: "mL" },
        { name: "에탄올", amount: 0, unit: "mL" },
      ],
      reagents,
    );
    expect(view(rows)).toEqual([
      ["염산", "30", "mL", 3],
      ["에탄올", "", "mL", 2],
    ]);
    expect(rows[1].extractedPerGroup).toBeNull();
  });

  it("[K1][S5] 순서 = 처음 나온 순서 (뒤에 다시 나온 행은 앞 줄에 합쳐진다)", () => {
    const rows = normalizeExtraction(
      [
        { name: "수산화나트륨", amount: 2, unit: "g" },
        { name: "염산", amount: 10, unit: "mL" },
        { name: "에탄올", amount: 5, unit: "mL" },
        { name: "염산", amount: 10, unit: "mL" },
        { name: "수산화나트륨", amount: 1, unit: "g" },
      ],
      reagents,
    );
    expect(view(rows)).toEqual([
      ["수산화나트륨", "3", "g", 2],
      ["염산", "20", "mL", 2],
      ["에탄올", "5", "mL", 1],
    ]);
  });

  it(`[K1][S5] 상한: 서로 다른 줄은 ${EXTRACTION_ROWS_MAX}줄까지, 그 뒤 새 이름은 버리되 이미 있는 줄로 합쳐지는 행은 합친다`, () => {
    const distinct: ExtractedItem[] = Array.from({ length: EXTRACTION_ROWS_MAX + 5 }, (_, i) => ({ name: `시약${i + 1}`, amount: 1, unit: "mL" }));
    const rows = normalizeExtraction([...distinct, { name: "시약1", amount: 2, unit: "mL" }], []);
    expect(rows).toHaveLength(EXTRACTION_ROWS_MAX);
    expect(rows.map((r) => r.name)).toEqual(distinct.slice(0, EXTRACTION_ROWS_MAX).map((d) => d.name));
    expect(view(rows)[0], "상한 뒤 같은 이름 행도 첫 줄에 합쳐진다").toEqual(["시약1", "3", "mL", 2]);
  });

  it(`[K1][S5] 합이 상한(${AMOUNT_MAX.toLocaleString("en-US")})을 넘으면 사용량은 빈 칸(사용자가 채운다), 줄은 하나`, () => {
    const rows = normalizeExtraction(
      [
        { name: "염산", amount: AMOUNT_MAX, unit: "mL" },
        { name: "염산", amount: 1, unit: "mL" },
      ],
      reagents,
    );
    expect(view(rows)).toEqual([["염산", "", "mL", 2]]);
    const edge = normalizeExtraction(
      [
        { name: "염산", amount: AMOUNT_MAX - 1, unit: "mL" },
        { name: "염산", amount: 1, unit: "mL" },
      ],
      reagents,
    );
    expect(view(edge), "상한과 같으면 허용").toEqual([["염산", String(AMOUNT_MAX), "mL", 2]]);
  });

  it("[K1][S5] 합치지 않은 행은 mergedCount 1", () => {
    const rows = normalizeExtraction([{ name: "염산", amount: 1, unit: "mL" }, { name: "에탄올", amount: 1, unit: "mL" }], reagents);
    expect(rows.map((r) => r.mergedCount ?? 1)).toEqual([1, 1]);
  });
});

describe("mergedRowsText (d7 §13 \"N개 행을 합쳤어요\")", () => {
  it("[K1][S5] 2 이상이면 d7 문구, 1·없음이면 null", () => {
    expect(mergedRowsText({ mergedCount: 2 })).toBe(mergedText(2));
    expect(mergedRowsText({ mergedCount: 3 })).toBe(mergedText(3));
    expect(mergedRowsText({ mergedCount: 12 })).toBe(mergedText(12));
    expect(mergedRowsText({ mergedCount: 1 })).toBeNull();
    expect(mergedRowsText({})).toBeNull();
  });

  it("[K1][S5] normalizeExtraction 결과 행에 그대로 쓴다 (합친 행만 안내)", () => {
    const rows = normalizeExtraction(
      [
        { name: "염산", amount: 1, unit: "mL" },
        { name: "염산", amount: 2, unit: "mL" },
        { name: "에탄올", amount: 1, unit: "mL" },
      ],
      [],
    );
    expect(rows.map(mergedRowsText)).toEqual([mergedText(2), null]);
  });
});

describe("합친 뒤 저장 계획 (d7 §13: 합친 뒤에도 같은 우리 학교 시약에 연결된 행은 저장 때 합산)", () => {
  it("[K1][S5] 열쇠가 달라 합쳐지지 않은 두 행이 같은 시약에 연결되면 저장 항목 하나(합산)", () => {
    const list = [R("m-hcl", "염산")];
    const rows = normalizeExtraction(
      [
        { name: "염산", amount: 10, unit: "mL" },
        { name: "염산", amount: 5, unit: "mL" },
        { name: "묽은 염산 용액 X", amount: 7, unit: "mL" },
      ],
      list,
    );
    expect(rows).toHaveLength(2);
    expect(view(rows)[0]).toEqual(["염산", "15", "mL", 2]);
    const linked = rows.map((r) => ({ ...r, reagentId: "m-hcl" }));
    const plan = planSave(linked, list, 6);
    expect(plan.items).toEqual([{ reagent_id: "m-hcl", per_group: 22, groups: 6 }]);
  });
});

describe("basisOutcome 출처 규칙 (d7 §11-1 화면 5 와의 관계 · §13 저장)", () => {
  it("[K1][S5] source 'auto' → 새 필요량이 작거나 같아도 항상 'changed'", () => {
    expect(basisOutcome(1, 20, "auto")).toBe("changed");
    expect(basisOutcome(20, 20, "auto")).toBe("changed");
    expect(basisOutcome(30, 20, "auto")).toBe("changed");
    expect(basisOutcome(0.3, 0, "auto")).toBe("changed");
  });

  it("[K1][S5] source 'basis'·'manual'·없음 → 더 클 때만 'changed', 같거나 작으면 'kept' (소수 오차 없이)", () => {
    for (const source of ["basis", "manual", undefined] as const) {
      expect(basisOutcome(1, 20, source), `${source} 작음`).toBe("kept");
      expect(basisOutcome(20, 20, source), `${source} 같음`).toBe("kept");
      expect(basisOutcome(0.1 * 3, 0.3, source), `${source} 0.1 × 3 = 0.3`).toBe("kept");
      expect(basisOutcome(20.001, 20, source), `${source} 큼`).toBe("changed");
    }
  });

  it("[K1][S5] planSave 의 행 예측도 연결 시약의 출처를 따른다 (auto 는 작은 값도 바뀜, manual 은 유지)", () => {
    const list = [R("a", "염산", "mL", 100, "auto"), R("m", "에탄올", "mL", 100, "manual"), R("b", "아세트산", "mL", 100, "basis")];
    const rows = normalizeExtraction(
      [
        { name: "염산", amount: 1, unit: "mL" },
        { name: "에탄올", amount: 1, unit: "mL" },
        { name: "아세트산", amount: 1, unit: "mL" },
      ],
      list,
    );
    expect(rows.map((r) => r.reagentId), "전제: 자동 연결").toEqual(["a", "m", "b"]);
    const plan = planSave(rows, list, 6);
    expect(plan.rows.map((v) => v.outcome)).toEqual(["changed", "kept", "kept"]);
  });
});
