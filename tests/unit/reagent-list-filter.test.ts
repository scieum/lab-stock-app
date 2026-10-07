// 화면 2 시약 목록 필터·정렬 순수 규칙 (lib/reagent-list-filter — 디자인 1.17 list_filter).
// 기대값: harness/d7-data.md §16 (정렬 기준 · 칩·결과 · 상태 = 주소창, 잘못된 값은 무시 · AND),
//         design/rules.json list_filter(시트 순서·문구) · cabinet.storage_classes(분류 8종).
//         구현 상수는 rules·d7 와 같은지 비교만 한다 (기대값을 구현에서 읽지 않는다).
// 기대 정렬·거르기는 이 파일 안에서 d7 §16 문장대로 따로 계산해 구현 결과와 견준다.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  CLASS_FILTER_VALUES,
  DEFAULT_LIST_SORT,
  EMPTY_LIST_FILTER,
  LIST_SORT_OPTIONS,
  NO_CLASS,
  NO_CLASS_LABEL,
  applyListFilter,
  cabinetSlotValues,
  listFilterChips,
  matchesListFilter,
  parseListFilter,
  removeListFilterChip,
  sameListFilter,
  sortReagents,
  toggleListFilterClass,
  writeListFilter,
  type FilterCabinet,
  type FilterableReagent,
  type ListFilter,
} from "../../lib/reagent-list-filter";
import { ROOT, read, rules } from "./helpers";

// ---------- 기대값 원본 ----------
const LF = rules.list_filter as Record<string, string>;
const CLASSES = rules.cabinet.storage_classes as string[];
const D7 = read(join(ROOT, "harness/d7-data.md"));
const D7_16 = D7.slice(D7.indexOf("## 16."), D7.indexOf("\n## ", D7.indexOf("## 16.") + 1));
/** rules list_filter.sheet "정렬(이름순 기본·재고 적은 순·최근 입고순)" */
const SORT_LABELS = (/정렬\(([^)]+)\)/.exec(LF.sheet)?.[1] ?? "").split("·").map((s) => s.replace(/\s*기본$/, "").trim());
/** rules list_filter.sheet "'분류 없음'" · "'칸 없음만'" · "'MSDS 없는 시약만'" · "'{N}종 보기'" */
const QUOTED = [...LF.sheet.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const NO_CLASS_TEXT = QUOTED.find((q) => q.startsWith("분류")) ?? "";

const CAB_A: FilterCabinet = { id: "11111111-1111-4111-8111-111111111111", number: 1, label: "1번 시약장", doorType: "양문형", shelves: 4 };
const CAB_B: FilterCabinet = { id: "22222222-2222-4222-8222-222222222222", number: 2, label: "화학 준비실", doorType: "단문형", shelves: 3 };
const CABS = [CAB_A, CAB_B];

const R = (
  id: string,
  name: string,
  stockValue: number,
  intakeDate: string | null,
  storageClass: string | null,
  slot: FilterableReagent["slot"],
  hasMsds: boolean,
): FilterableReagent => ({ id, name, stockValue, intakeDate, storageClass, slot, hasMsds });

/** 시약 표본: 이름 같은 것(id 로 가름)·재고 같은 것(이름으로 가름)·입고일 같은 것·입고일 없음·분류 없음·칸 없음·MSDS 없음 */
const ITEMS: FilterableReagent[] = [
  R("id-08", "황산", 3, "2026-05-14", "산", { cabinetId: CAB_A.id, side: "L", shelf: 1 }, true),
  R("id-02", "염산", 1, "2026-03-02", "산", { cabinetId: CAB_A.id, side: "L", shelf: 1 }, false),
  R("id-05", "에탄올", 3, "2026-05-14", "인화성", { cabinetId: CAB_A.id, side: "R", shelf: 2 }, true),
  R("id-01", "과산화수소", 2, null, "산화제", { cabinetId: CAB_B.id, side: "L", shelf: 2 }, false),
  R("id-07", "증류수", 10, "2026-09-01", null, null, false),
  R("id-03", "아세트산", 0.5, "2026-04-08", "산", null, true),
  R("id-06", "염산", 7, null, "산", { cabinetId: CAB_B.id, side: "L", shelf: 1 }, true),
  R("id-04", "수산화나트륨", 1, "2026-09-01", "염기", { cabinetId: CAB_A.id, side: "L", shelf: 1 }, true),
];

// ---------- d7 §16 정렬 기준을 테스트 안에서 따로 ----------
const ko = (a: string, b: string) => a.localeCompare(b, "ko");
const byNameThenId = (a: FilterableReagent, b: FilterableReagent) => ko(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function expectedSort(items: FilterableReagent[], sort: string): string[] {
  const out = [...items];
  if (sort === "name") out.sort(byNameThenId);
  if (sort === "stock") out.sort((a, b) => a.stockValue - b.stockValue || byNameThenId(a, b));
  if (sort === "intake")
    out.sort((a, b) => {
      if (a.intakeDate === null && b.intakeDate === null) return byNameThenId(a, b);
      if (a.intakeDate === null) return 1;
      if (b.intakeDate === null) return -1;
      return b.intakeDate.localeCompare(a.intakeDate) || byNameThenId(a, b);
    });
  return out.map((r) => r.id);
}
/** d7 §16 거르기(AND): 분류(여러 개, none = 분류 없음) · 위치(시약장 → 칸, 칸 없음만) · MSDS 없음 */
function expectedMatch(r: FilterableReagent, f: ListFilter): boolean {
  if (f.classes.length && !f.classes.includes(r.storageClass ?? NO_CLASS)) return false;
  if (f.noSlot) {
    if (r.slot !== null) return false;
  } else if (f.cabinetId) {
    if (!r.slot || r.slot.cabinetId !== f.cabinetId) return false;
    if (f.slot && `${r.slot.side}${r.slot.shelf}` !== f.slot) return false;
  }
  if (f.noMsds && r.hasMsds) return false;
  return true;
}
const F = (patch: Partial<ListFilter>): ListFilter => ({ ...EMPTY_LIST_FILTER, ...patch });

describe("기대값 원본 · 상수", () => {
  it("[K1][S2] rules list_filter 에서 정렬 3종(이름순 기본)·'분류 없음' 을 읽었다, d7 §16 정렬 기준 문장이 있다", () => {
    expect(SORT_LABELS).toEqual(["이름순", "재고 적은 순", "최근 입고순"]);
    expect(LF.sheet).toMatch(/이름순 기본/);
    expect(NO_CLASS_TEXT).toBe("분류 없음");
    expect(QUOTED).toEqual(expect.arrayContaining(["칸 없음만", "MSDS 없는 시약만", "초기화", "{N}종 보기"]));
    expect(D7_16).toMatch(/이름순 = 한국어 가나다\(같으면 id\)/);
    expect(D7_16).toMatch(/재고 적은 순 = stock 오름차순\(같으면 이름\)/);
    expect(D7_16).toMatch(/최근 입고순 = intake_date 내림차순\(없으면 뒤, 같으면 이름\)/);
    expect(D7_16).toMatch(/잘못된 값은 무시/);
  });

  it("[K1][S2] 정렬 선택지 = rules 순서·글자, 기본 = 이름순", () => {
    expect(LIST_SORT_OPTIONS.map((o) => o.label)).toEqual(SORT_LABELS);
    expect(LIST_SORT_OPTIONS.find((o) => o.value === DEFAULT_LIST_SORT)?.label).toBe(SORT_LABELS[0]);
    expect(EMPTY_LIST_FILTER.sort).toBe(DEFAULT_LIST_SORT);
  });

  it(`[K1][S2] 보관 분류 칩 = rules cabinet.storage_classes 8종(순서 그대로) + "${NO_CLASS_TEXT}"`, () => {
    expect(CLASS_FILTER_VALUES.slice(0, -1)).toEqual(CLASSES);
    expect(CLASS_FILTER_VALUES[CLASS_FILTER_VALUES.length - 1]).toBe(NO_CLASS);
    expect(NO_CLASS_LABEL).toBe(NO_CLASS_TEXT);
    expect(CLASSES).not.toContain(NO_CLASS);
  });

  it("[K1][S2] 시약장 칸 값: 양문형 = 단마다 좌·우, 단문형 = 한쪽만 (rules cabinet.door_types)", () => {
    expect(cabinetSlotValues(CAB_A)).toEqual(["L1", "R1", "L2", "R2", "L3", "R3", "L4", "R4"]);
    expect(cabinetSlotValues(CAB_B)).toEqual(["L1", "L2", "L3"]);
  });
});

describe("parseListFilter: 주소창 → 필터 (잘못된 값은 무시)", () => {
  it("[K1][S2] 빈 쿼리 = 기본 (이름순 · 조건 없음)", () => {
    expect(parseListFilter(new URLSearchParams(""), CABS)).toEqual(EMPTY_LIST_FILTER);
    expect(parseListFilter({}, CABS)).toEqual(EMPTY_LIST_FILTER);
  });

  it("[K1][S2] 올바른 값은 모두 읽는다 (sort · class 여러 개 · cab · slot · nomsds)", () => {
    const f = parseListFilter(new URLSearchParams(`sort=stock&class=산,${NO_CLASS},유기&cab=${CAB_A.id}&slot=R2&nomsds=1`), CABS);
    expect(f).toEqual({ sort: "stock", classes: ["유기", "산", NO_CLASS], cabinetId: CAB_A.id, slot: "R2", noSlot: false, noMsds: true });
    expect(parseListFilter(new URLSearchParams("sort=intake"), CABS).sort).toBe("intake");
    expect(parseListFilter(new URLSearchParams("noslot=1"), CABS).noSlot).toBe(true);
  });

  it("[K1][S2] 분류 순서는 규칙 순서로 맞추고, 모르는 분류·중복·빈 칸은 버린다", () => {
    const f = parseListFilter(new URLSearchParams(`class=${NO_CLASS},기타,acid,,산,기타, 산 `), CABS);
    expect(f.classes).toEqual(["산", "기타", NO_CLASS]);
    expect(parseListFilter(new URLSearchParams("class=모름,xx"), CABS).classes).toEqual([]);
  });

  it("[K1][S2] 잘못된 sort·noslot·nomsds 값은 기본 (sort=price · noslot=true · nomsds=0)", () => {
    for (const q of ["sort=price", "sort=", "sort=NAME", "sort=stock%20"]) expect(parseListFilter(new URLSearchParams(q), CABS).sort, q).toBe(DEFAULT_LIST_SORT);
    for (const v of ["true", "0", "yes", ""]) {
      expect(parseListFilter(new URLSearchParams(`noslot=${v}`), CABS).noSlot, `noslot=${v}`).toBe(false);
      expect(parseListFilter(new URLSearchParams(`nomsds=${v}`), CABS).noMsds, `nomsds=${v}`).toBe(false);
    }
  });

  it("[K1][S2] 학교에 없는 시약장 · 그 시약장에 없는 칸 · 시약장 없이 온 칸은 무시", () => {
    expect(parseListFilter(new URLSearchParams("cab=33333333-3333-4333-8333-333333333333&slot=L1"), CABS)).toEqual(EMPTY_LIST_FILTER);
    expect(parseListFilter(new URLSearchParams("slot=L1"), CABS)).toEqual(EMPTY_LIST_FILTER);
    // 단문형(좌만 3단): R1 · L4 는 없는 칸 → 시약장만
    for (const s of ["R1", "L4", "L0", "X1", "l1", "L"]) {
      expect(parseListFilter(new URLSearchParams(`cab=${CAB_B.id}&slot=${s}`), CABS), `단문형 slot=${s}`).toEqual(F({ cabinetId: CAB_B.id }));
    }
    // 양문형 4단: R4 는 있다, L5 는 없다
    expect(parseListFilter(new URLSearchParams(`cab=${CAB_A.id}&slot=R4`), CABS).slot).toBe("R4");
    expect(parseListFilter(new URLSearchParams(`cab=${CAB_A.id}&slot=L5`), CABS)).toEqual(F({ cabinetId: CAB_A.id }));
  });

  it("[K1][S2] noslot=1 과 시약장·칸이 함께 오면 칸 없음만이 이긴다 (시약장·칸은 버림)", () => {
    expect(parseListFilter(new URLSearchParams(`noslot=1&cab=${CAB_A.id}&slot=L1`), CABS)).toEqual(F({ noSlot: true }));
  });

  it("[K1][S2] 서버 searchParams 모양(값이 배열)도 첫 값으로 읽는다", () => {
    expect(parseListFilter({ sort: ["intake", "stock"], class: ["산"], nomsds: "1" }, CABS)).toEqual(F({ sort: "intake", classes: ["산"], noMsds: true }));
  });
});

describe("writeListFilter: 필터 → 주소창 (기본값은 지우고 다른 쿼리는 둔다)", () => {
  const SAMPLES: ListFilter[] = [
    EMPTY_LIST_FILTER,
    F({ sort: "stock" }),
    F({ sort: "intake", classes: ["산", NO_CLASS] }),
    F({ cabinetId: CAB_A.id, slot: "R2", noMsds: true }),
    F({ cabinetId: CAB_B.id }),
    F({ noSlot: true, classes: ["유기"] }),
  ];

  it("[K1][S2] 왕복: parse(write(f)) = f (새로고침해도 같은 필터)", () => {
    for (const f of SAMPLES) expect(parseListFilter(writeListFilter(new URLSearchParams(), f), CABS), JSON.stringify(f)).toEqual(f);
  });

  it("[K1][S2] 기본 필터는 쿼리를 남기지 않고, 기존 ?filter·?q 는 그대로", () => {
    const p = writeListFilter(new URLSearchParams("filter=low-stock&q=염&sort=stock&class=산&noslot=1&nomsds=1"), EMPTY_LIST_FILTER);
    expect([...p.keys()].sort()).toEqual(["filter", "q"]);
    expect(p.get("q")).toBe("염");
    expect(p.get("filter")).toBe("low-stock");
  });

  it("[K1][S2] 칸 없음만이면 시약장·칸 쿼리를 쓰지 않는다", () => {
    const p = writeListFilter(new URLSearchParams(), { ...F({ noSlot: true }), cabinetId: CAB_A.id, slot: "L1" });
    expect(p.get("noslot")).toBe("1");
    expect(p.has("cab")).toBe(false);
    expect(p.has("slot")).toBe(false);
  });
});

describe("sortReagents: d7 §16 정렬 3종", () => {
  for (const sort of ["name", "stock", "intake"] as const) {
    it(`[K1][S2] ${LIST_SORT_OPTIONS.find((o) => o.value === sort)?.label}: d7 §16 기준과 같은 순서 (원본 배열은 그대로)`, () => {
      const before = ITEMS.map((r) => r.id);
      expect(sortReagents(ITEMS, sort).map((r) => r.id)).toEqual(expectedSort(ITEMS, sort));
      expect(ITEMS.map((r) => r.id), "원본 배열 순서 그대로").toEqual(before);
    });
  }

  it("[K1][S2] 이름순: 같은 이름은 id 순 · 재고 적은 순: 같은 재고는 이름순 · 최근 입고순: 입고일 없음은 뒤, 같은 날은 이름순", () => {
    const name = sortReagents(ITEMS, "name").map((r) => r.id);
    expect(name.indexOf("id-02"), "염산 id-02 가 염산 id-06 앞").toBeLessThan(name.indexOf("id-06"));
    const stock = sortReagents(ITEMS, "stock").map((r) => r.name);
    expect(stock.slice(0, 3)).toEqual(["아세트산", "수산화나트륨", "염산"]);
    const intake = sortReagents(ITEMS, "intake");
    expect(intake.slice(-2).map((r) => r.intakeDate), "입고일 없는 시약은 맨 뒤").toEqual([null, null]);
    expect(intake.slice(0, 2).map((r) => r.name), "같은 입고일(2026-09-01)은 이름순").toEqual(["수산화나트륨", "증류수"]);
  });
});

describe("applyListFilter: 조건은 모두 함께(AND)", () => {
  const CASES: [string, ListFilter][] = [
    ["분류 산", F({ classes: ["산"] })],
    ["분류 여러 개(산·인화성)", F({ classes: ["산", "인화성"] })],
    ["분류 없음만", F({ classes: [NO_CLASS] })],
    ["분류 없음 + 염기", F({ classes: ["염기", NO_CLASS] })],
    ["1번 시약장", F({ cabinetId: CAB_A.id })],
    ["1번 시약장 좌1단", F({ cabinetId: CAB_A.id, slot: "L1" })],
    ["단문형 시약장 1단", F({ cabinetId: CAB_B.id, slot: "L1" })],
    ["칸 없음만", F({ noSlot: true })],
    ["MSDS 없는 시약만", F({ noMsds: true })],
    ["분류 산 + 1번 시약장 좌1단 + MSDS 없음", F({ classes: ["산"], cabinetId: CAB_A.id, slot: "L1", noMsds: true })],
    ["칸 없음 + 분류 산", F({ noSlot: true, classes: ["산"] })],
    ["결과 0: 분류 없음 + 1번 시약장", F({ classes: [NO_CLASS], cabinetId: CAB_A.id })],
  ];
  for (const sort of ["name", "stock", "intake"] as const) {
    for (const [what, f0] of CASES) {
      it(`[K1][S2] ${what} · 정렬 ${sort}: 결과 = 조건을 모두 만족하는 시약을 그 정렬로`, () => {
        const f = { ...f0, sort };
        const want = expectedSort(ITEMS.filter((r) => expectedMatch(r, f)), sort);
        expect(applyListFilter(ITEMS, f).map((r) => r.id)).toEqual(want);
        for (const r of ITEMS) expect(matchesListFilter(r, f), `${r.id} ${r.name}`).toBe(expectedMatch(r, f));
      });
    }
  }

  it("[K1][S2] 결과 0 인 조합이 실제로 0 (빈 상태 판단 근거)", () => {
    expect(applyListFilter(ITEMS, F({ classes: [NO_CLASS], cabinetId: CAB_A.id }))).toEqual([]);
  });

  it("[K1][S2] 칸 없음만이 켜져 있으면 시약장 값이 남아 있어도 칸 없음만 (우선)", () => {
    const f = { ...F({ noSlot: true }), cabinetId: CAB_A.id, slot: "L1" };
    expect(applyListFilter(ITEMS, f).every((r) => r.slot === null)).toBe(true);
    expect(applyListFilter(ITEMS, f).length).toBe(ITEMS.filter((r) => r.slot === null).length);
  });
});

describe("listFilterChips · removeListFilterChip · toggleListFilterClass (d7 §16 칩)", () => {
  it("[K1][S2] 기본 필터 = 칩 0 (배지 없음)", () => {
    expect(listFilterChips(EMPTY_LIST_FILTER, CABS)).toEqual([]);
  });

  it(`[K1][S2] 정렬은 기본(${SORT_LABELS[0]})이 아니면 칩 1개 = 그 정렬 이름`, () => {
    for (const o of LIST_SORT_OPTIONS) {
      const chips = listFilterChips(F({ sort: o.value }), CABS);
      if (o.value === DEFAULT_LIST_SORT) expect(chips).toEqual([]);
      else expect(chips.map((c) => c.label)).toEqual([o.label]);
    }
  });

  it(`[K1][S2] 조건마다 칩 1개: 분류(여러 개면 각각, none = "${NO_CLASS_TEXT}") · 위치(시약장 이름 + 번호, 칸이면 "이름 · 칸") · 칸 없음 · MSDS 없음`, () => {
    const f = F({ sort: "stock", classes: ["산", NO_CLASS], cabinetId: CAB_A.id, slot: "L2", noMsds: true });
    const chips = listFilterChips(f, CABS);
    expect(chips).toHaveLength(1 + 2 + 1 + 1);
    expect(chips[1].label).toBe("산");
    expect(chips[2].label).toBe(NO_CLASS_TEXT);
    const loc = chips[3];
    expect(loc.cabinetNumber, "시약장 칩 번호 원 (시안 2-filter-empty applied-chip > cabinet-number)").toBe(CAB_A.number);
    expect(loc.label.startsWith(CAB_A.label)).toBe(true);
    expect(loc.label).toMatch(/좌 ?2단/);
    expect(listFilterChips(F({ cabinetId: CAB_B.id }), CABS)).toEqual([expect.objectContaining({ label: CAB_B.label, cabinetNumber: CAB_B.number })]);
    expect(listFilterChips(F({ noSlot: true }), CABS)).toHaveLength(1);
    expect(listFilterChips(F({ noMsds: true }), CABS)).toHaveLength(1);
    // 칩 키는 서로 다르다
    expect(new Set(chips.map((c) => c.key)).size).toBe(chips.length);
  });

  it("[K1][S2] 칩 × = 그 조건만 빠진다 (나머지 그대로), 모두 빼면 기본 필터", () => {
    const f = F({ sort: "intake", classes: ["산", "유기"], cabinetId: CAB_A.id, slot: "L1", noMsds: true });
    let cur = f;
    for (const chip of listFilterChips(f, CABS)) {
      const before = listFilterChips(cur, CABS);
      const next = removeListFilterChip(cur, chip.key);
      const after = listFilterChips(next, CABS);
      expect(after.map((c) => c.key), `${chip.label} 뺀 뒤`).toEqual(before.map((c) => c.key).filter((k) => k !== chip.key));
      cur = next;
    }
    expect(sameListFilter(cur, EMPTY_LIST_FILTER), JSON.stringify(cur)).toBe(true);
    // 칸 없음 칩
    expect(removeListFilterChip(F({ noSlot: true, noMsds: true }), listFilterChips(F({ noSlot: true }), CABS)[0].key)).toEqual(F({ noMsds: true }));
    // 모르는 키는 그대로
    expect(removeListFilterChip(f, "unknown")).toEqual(f);
  });

  it("[K1][S2] 분류 켜고 끄기: 여러 개, 순서는 규칙 순서", () => {
    let f = EMPTY_LIST_FILTER;
    for (const c of [NO_CLASS, "기타", "유기"]) f = toggleListFilterClass(f, c);
    expect(f.classes).toEqual(["유기", "기타", NO_CLASS]);
    f = toggleListFilterClass(f, "기타");
    expect(f.classes).toEqual(["유기", NO_CLASS]);
  });
});
