// 화면 7 서류로 입고 순수 규칙 (lib/doc-intake-rules) — [K1][S7].
// 기대값: harness/d7-data.md §21 (추출 모양 · 품목 최대 50 · 입고일 = 서류 날짜/없으면 오늘/미래 불가 ·
//         입고량 = 시약 단위 mL/g 이고 규격이 같은 계열이면 specAmount(L→mL, kg→g ×1000) × quantity, "병"이면 quantity, 안 되면 직접 입력 ·
//         자동 연결 = §13 matchReagent 와 같은 규칙 · 저장 항목 {reagent_id, amount} / {name, storage_class, unit, stock, msds_url} ·
//         amount·stock > 0 · 항목 1~50 · 토스트 "{N}개 품목을 입고했어요"),
//         design/rules.json 1.18 intake(review 의 안내 줄 예 "500 mL × 4병 = 2,000 mL") · cabinet.storage_classes,
//         design/frames/7-doc-review-mobile.json (시안 3행: 염산 35% 500mL ×4 → 우리 학교 "염산" · 2,000 mL /
//         질산칼륨 500g ×1 → 새 시약 "질산칼륨" · 산화제 추천 · 500 g / 아세트산(빙초산) 500mL ×2 → "새 시약 · 산 · 1,000 mL" · 시약 아님 2개).
//         구현에서 기대값을 읽지 않는다 — 구현 상수는 d7·rules 에서 읽은 값과 같은지 비교만 한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOC_ITEMS_MAX,
  DOC_UNITS,
  buildDocRows,
  checkDocIntakeDate,
  checkDocIntakeInput,
  defaultDocIntakeDate,
  docIntakeAmount,
  docIntakeDoneText,
  docReagentName,
  guessDocUnit,
  normalizeDocExtraction,
  normalizeSpecUnit,
  notReagentText,
  patchDocRow,
  planDocIntake,
  type DocExtraction,
  type DocItem,
  type DocReagent,
} from "../../lib/doc-intake-rules";
import { ROOT } from "./helpers";

const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const S21 = D7.slice(D7.indexOf("## 21."), D7.indexOf("\n## ", D7.indexOf("## 21.") + 5));
const RULES = JSON.parse(readFileSync(join(ROOT, "design/rules.json"), "utf8")) as {
  intake: { review: string };
  cabinet: { storage_classes: string[] };
};
const CLASSES = RULES.cabinet.storage_classes;
type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const REVIEW = (JSON.parse(readFileSync(join(ROOT, "design/frames/7-doc-review-mobile.json"), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const frameTexts = (name: string) => REVIEW.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);

const ITEMS_MAX = Number((/품목 최대 (\d+)/.exec(S21) ?? [])[1]);
const DONE = (/ex-toast "(\{N\}개 품목을 입고했어요)"/.exec(S21) ?? [])[1] ?? "";
/** rules intake.review 의 안내 줄 예 "500 mL × 4병 = 2,000 mL" */
const NOTE_EXAMPLE = (/예: ([^)]+)\)/.exec(RULES.intake.review) ?? [])[1] ?? "";
const UNITS_D7 = (/단위\(([^,)]+), 규격에서 추정\)/.exec(S21) ?? [])[1]?.split("·") ?? [];

const TODAY = "2026-10-08";
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HCL: DocReagent = { id: UUID(1), name: "염산", unit: "mL" };
const ETOH: DocReagent = { id: UUID(2), name: "에탄올", unit: "mL" };
const NACL: DocReagent = { id: UUID(3), name: "염화 나트륨", unit: "g" };
const BOTTLE: DocReagent = { id: UUID(4), name: "페놀프탈레인 용액", unit: "병" };
const OURS = [HCL, ETOH, NACL, BOTTLE];

const it_ = (name: string, specAmount: number | null, specUnit: DocItem["specUnit"], quantity: number, o: Partial<DocItem> = {}): DocItem => ({
  name,
  spec: specAmount !== null && specUnit ? `${specAmount} ${specUnit}` : null,
  specAmount,
  specUnit,
  quantity,
  quantityUnit: "병",
  isReagent: true,
  suggestedClass: null,
  ...o,
});

/** 시안 7-doc-review 의 서류 (3행 + 시약 아님 2) */
const FRAME_DOC: DocExtraction = {
  docDate: "2026-10-07",
  items: [
    it_("염산 35% 500mL", 500, "mL", 4, { suggestedClass: "산" }),
    it_("질산칼륨 500g", 500, "g", 1, { suggestedClass: "산화제" }),
    it_("아세트산(빙초산) 500mL", 500, "mL", 2, { suggestedClass: "산" }),
    it_("비커 100mL", 100, "mL", 10, { isReagent: false, quantityUnit: "개" }),
    it_("니트릴 장갑", null, null, 2, { isReagent: false, quantityUnit: "박스" }),
  ],
};

describe("[K1][S7] 규칙 상수 = d7 §21 · rules.json", () => {
  it("d7 §21 에서 품목 최대 · 토스트 문구 · 새 시약 단위를, rules 에서 안내 줄 예를 읽었다", () => {
    expect(ITEMS_MAX).toBeGreaterThan(0);
    expect(DONE).toContain("{N}");
    expect(NOTE_EXAMPLE).toMatch(/×/);
    expect(UNITS_D7.length).toBeGreaterThan(0);
  });
  it(`품목 최대 = d7 §21 (${ITEMS_MAX})`, () => {
    expect(DOC_ITEMS_MAX).toBe(ITEMS_MAX);
  });
  it("새 시약 단위 = d7 §21 병·mL·g", () => {
    expect([...DOC_UNITS]).toEqual(UNITS_D7);
  });
  it('토스트 = d7 §21 "{N}개 품목을 입고했어요" (시안 7-suggest "3개 품목을 입고했어요")', () => {
    for (const n of [1, 3, 50]) expect(docIntakeDoneText(n)).toBe(DONE.replace("{N}", String(n)));
  });
  it('시약 아님 묶음 = 시안 "시약 아님 2개"', () => {
    expect(frameTexts("label")).toContain(notReagentText(2));
    expect(notReagentText(5)).toBe("시약 아님 5개");
  });
});

describe("[K1][S7] normalizeDocExtraction — 추출 응답 정리 (d7 §21 구조화 출력)", () => {
  it("모양이 아니면 null: 객체 아님 · items 배열 아님", () => {
    for (const raw of [null, undefined, "x", 3, [], { items: "x" }, { items: null }, { docDate: "2026-10-07" }]) {
      expect(normalizeDocExtraction(raw)).toBeNull();
    }
  });
  it("품목 0개 → items [] (화면은 빈 상태)", () => {
    expect(normalizeDocExtraction({ docDate: null, items: [] })).toEqual({ docDate: null, items: [] });
  });
  it(`최대 ${ITEMS_MAX}개 — 넘는 품목은 버린다, 이름이 빈 품목은 버린다`, () => {
    const many = Array.from({ length: ITEMS_MAX + 10 }, (_, i) => ({ name: `시약${i}`, quantity: 1, isReagent: true }));
    const out = normalizeDocExtraction({ docDate: null, items: [{ name: "  " }, { name: "" }, { quantity: 3 }, ...many] })!;
    expect(out.items).toHaveLength(ITEMS_MAX);
    expect(out.items[0].name).toBe("시약0");
  });
  it("규격 단위는 mL·L·g·kg 로 정리, 목록 밖은 null", () => {
    expect(normalizeSpecUnit("ml")).toBe("mL");
    expect(normalizeSpecUnit(" ML ")).toBe("mL");
    expect(normalizeSpecUnit("l")).toBe("L");
    expect(normalizeSpecUnit("KG")).toBe("kg");
    expect(normalizeSpecUnit("g")).toBe("g");
    for (const bad of ["oz", "개", "", null, 3, "mg"]) expect(normalizeSpecUnit(bad)).toBeNull();
  });
  it(`보관 분류 추천은 rules cabinet.storage_classes ${CLASSES.length}종 중 하나, 그 밖은 null`, () => {
    for (const c of CLASSES) {
      expect(normalizeDocExtraction({ items: [{ name: "a", suggestedClass: c }] })!.items[0].suggestedClass).toBe(c);
    }
    for (const bad of ["강산", "acid", "", 1, null]) {
      expect(normalizeDocExtraction({ items: [{ name: "a", suggestedClass: bad }] })!.items[0].suggestedClass).toBeNull();
    }
  });
  it("수량 기본 1 · 0 이하·숫자 아님은 기본값 · 규격 숫자 0 이하는 null · isReagent false 그대로", () => {
    const out = normalizeDocExtraction({
      items: [
        { name: "a" },
        { name: "b", quantity: 0, specAmount: -5, specUnit: "mL" },
        { name: "c", quantity: "3", specAmount: "500", specUnit: "mL", isReagent: false },
      ],
    })!;
    expect(out.items.map((x) => [x.quantity, x.specAmount, x.isReagent])).toEqual([
      [1, null, true],
      [1, null, true],
      [3, 500, false],
    ]);
  });
  it("서류 날짜: 실제 날짜인 YYYY-MM-DD 만, 그 밖은 null", () => {
    expect(normalizeDocExtraction({ docDate: "2026-10-07", items: [] })!.docDate).toBe("2026-10-07");
    for (const bad of ["2026-13-01", "2026-02-30", "2026/10/07", "10월 7일", "", null, 20261007]) {
      expect(normalizeDocExtraction({ docDate: bad, items: [] })!.docDate).toBeNull();
    }
  });
});

describe("[K1][S7] 입고일 — 서류 날짜, 없으면 오늘, 미래 불가 (d7 §21)", () => {
  it("기본값: 서류 날짜(오늘 이전·오늘) / 없으면 오늘 / 미래 서류 날짜도 오늘", () => {
    expect(defaultDocIntakeDate("2026-10-07", TODAY)).toBe("2026-10-07");
    expect(defaultDocIntakeDate(TODAY, TODAY)).toBe(TODAY);
    expect(defaultDocIntakeDate(null, TODAY)).toBe(TODAY);
    expect(defaultDocIntakeDate("2026-10-09", TODAY)).toBe(TODAY);
  });
  it("검사: 오늘·과거 통과, 내일·날짜 아님 거부", () => {
    expect(checkDocIntakeDate(TODAY, TODAY)).toBeNull();
    expect(checkDocIntakeDate("2025-01-01", TODAY)).toBeNull();
    for (const bad of ["2026-10-09", "2027-01-01", "", "2026-02-30", null, "어제"]) expect(checkDocIntakeDate(bad, TODAY)).not.toBeNull();
  });
});

describe("[K1][S7] 입고량 — 시약 단위 기준 환산 (d7 §21)", () => {
  it(`rules intake.review 예: 500 mL × 4병 → mL 시약 2,000 · 안내 줄 "${NOTE_EXAMPLE}"`, () => {
    expect(docIntakeAmount(it_("x", 500, "mL", 4), 4, "mL")).toEqual({ amount: 2000, note: NOTE_EXAMPLE });
  });
  it("L→mL ×1000, kg→g ×1000, 같은 단위 ×1, × 수량", () => {
    expect(docIntakeAmount(it_("x", 1, "L", 2), 2, "mL").amount).toBe(2000);
    expect(docIntakeAmount(it_("x", 2.5, "L", 1), 1, "mL").amount).toBe(2500);
    expect(docIntakeAmount(it_("x", 1, "kg", 3), 3, "g").amount).toBe(3000);
    expect(docIntakeAmount(it_("x", 25, "g", 4), 4, "g").amount).toBe(100);
    expect(docIntakeAmount(it_("x", 0.1, "g", 3), 3, "g").amount).toBe(0.3);
  });
  it('시약 단위 "병" → 수량 그대로', () => {
    expect(docIntakeAmount(it_("x", 500, "mL", 4), 4, "병").amount).toBe(4);
    expect(docIntakeAmount(it_("x", null, null, 6), 6, "병").amount).toBe(6);
  });
  it("계산 불가 → null (입고량 칸 비우고 직접 입력): 계열이 다름 · 규격 없음 · 수량 없음/0", () => {
    for (const [i, q, u] of [
      [it_("x", 500, "g", 1), 1, "mL"],
      [it_("x", 500, "mL", 1), 1, "g"],
      [it_("x", 1, "kg", 1), 1, "mL"],
      [it_("x", null, null, 2), 2, "mL"],
      [it_("x", 500, null, 2), 2, "g"],
      [it_("x", 500, "mL", 4), null, "mL"],
      [it_("x", 500, "mL", 4), 0, "mL"],
      [it_("x", 500, "mL", 4), null, "병"],
    ] as [DocItem, number | null, string][]) {
      expect(docIntakeAmount(i, q, u), `${i.specAmount}${i.specUnit} × ${q} → ${u}`).toEqual({ amount: null, note: null });
    }
  });
  it("새 시약 단위 추정: 규격 mL·L → mL, g·kg → g, 모르면 병·mL·g 중 하나", () => {
    expect(guessDocUnit({ specUnit: "mL" })).toBe("mL");
    expect(guessDocUnit({ specUnit: "L" })).toBe("mL");
    expect(guessDocUnit({ specUnit: "g" })).toBe("g");
    expect(guessDocUnit({ specUnit: "kg" })).toBe("g");
    expect(UNITS_D7).toContain(guessDocUnit({ specUnit: null }));
  });
});

describe("[K1][S7] 확인 표 행 — 시안 7-doc-review 서류로", () => {
  const rows = buildDocRows(FRAME_DOC, OURS);
  const plan = planDocIntake(rows, OURS, "2026-10-07", TODAY);

  it("행 수 = 품목 수, 시약 아님 2개는 표 밖(isReagent false · 연결 없음)", () => {
    expect(rows).toHaveLength(FRAME_DOC.items.length);
    expect(rows.filter((r) => !r.isReagent)).toHaveLength(2);
    for (const r of rows.filter((x) => !x.isReagent)) expect(r.link.kind).toBe("none");
  });
  it('자동 연결 (§13 matchReagent 와 같은 규칙, 규격 표기 무시): "염산 35% 500mL" → 우리 학교 "염산" (시안 value "염산") · 입고량 2000', () => {
    expect(frameTexts("value")).toContain("염산");
    expect(rows[0].link).toEqual({ kind: "reagent", reagentId: HCL.id });
    expect(rows[0].amount).toBe("2000");
    expect(plan.rows[0].note).toBe(NOTE_EXAMPLE);
    expect(frameTexts("unit-convert")).toContain(plan.rows[0].note);
  });
  it('연결 안 되면 새 시약: "질산칼륨 500g" → 이름 "질산칼륨"(시안 value) · 분류 = 추천(산화제) · 단위 g · 재고량 500 · 펼침', () => {
    const r = rows[1];
    expect(r.link.kind).toBe("new");
    expect(r.newReagent.name).toBe("질산칼륨");
    expect(frameTexts("value")).toContain(r.newReagent.name);
    expect([r.newReagent.storageClass, r.newReagent.suggestedClass]).toEqual(["산화제", "산화제"]);
    expect(r.newReagent.unit).toBe("g");
    expect(r.newReagent.stock).toBe("500");
    expect(r.expanded).toBe(true);
    expect(frameTexts("unit-convert")).toContain(plan.rows[1].note);
  });
  it('둘째 새 시약(값이 다 찬 것)은 접힌 요약 = 시안 "새 시약 · 산 · 1,000 mL"', () => {
    expect(rows[2].link.kind).toBe("new");
    expect(rows[2].expanded).toBe(false);
    expect(plan.rows[2].summary).toBe(frameTexts("new-reagent-summary")[0]);
  });
  it("저장 계획: 연결 1 + 새 시약 2 = 3 항목 (시약 아님 제외), 순서대로, msds 비면 null", () => {
    expect(plan.canSave).toBe(true);
    expect(plan.blockReason).toBeNull();
    expect(plan.newCount).toBe(2);
    expect(plan.items).toEqual([
      { reagent_id: HCL.id, amount: 2000 },
      { name: "질산칼륨", storage_class: "산화제", unit: "g", stock: 500, msds_url: null },
      { name: "아세트산(빙초산)", storage_class: "산", unit: "mL", stock: 1000, msds_url: null },
    ]);
  });
});

describe("[K1][S7] 행 고치기 (patchDocRow)", () => {
  const rows = () => buildDocRows(FRAME_DOC, OURS);
  it("수량을 바꾸면 고치지 않은 입고량은 다시 계산", () => {
    const r = patchDocRow(rows()[0], { quantity: "3" }, OURS);
    expect(r.amount).toBe("1500");
  });
  it("입고량을 직접 고치면 그 값 유지 (수량을 바꿔도 덮지 않음), 저장 항목에 고친 값", () => {
    let r = patchDocRow(rows()[0], { amount: "1600" }, OURS);
    r = patchDocRow(r, { quantity: "2" }, OURS);
    expect(r.amount).toBe("1600");
    const all = rows();
    all[0] = r;
    expect(planDocIntake(all, OURS, TODAY, TODAY).items[0]).toEqual({ reagent_id: HCL.id, amount: 1600 });
  });
  it("연결 바꾸기: 다른 시약(단위가 다르면 계산 불가 → 빈 칸, 저장 막힘) · 새 시약 → 펼침 · 빼기 → 저장에서 빠짐", () => {
    const toG = patchDocRow(rows()[0], { link: { kind: "reagent", reagentId: NACL.id } }, OURS);
    expect(toG.amount).toBe("");
    const all = rows();
    all[0] = toG;
    const p = planDocIntake(all, OURS, TODAY, TODAY);
    expect(p.rows[0].manual).toBe(true);
    expect(p.canSave).toBe(false);

    const toNew = patchDocRow(rows()[2], { link: { kind: "new" } }, OURS);
    expect(toNew.expanded).toBe(true);

    const out = rows();
    out[0] = patchDocRow(out[0], { link: { kind: "none" } }, OURS);
    const p2 = planDocIntake(out, OURS, TODAY, TODAY);
    expect(p2.items.some((x) => "reagent_id" in x)).toBe(false);
    expect(p2.items).toHaveLength(2);
  });
  it('"시약으로 넣기": 시약 아님 → 표에 (연결 후보 없으면 새 시약 + 펼침), 분류를 안 고르면 저장 막힘', () => {
    const all = rows();
    all[3] = patchDocRow(all[3], { isReagent: true }, OURS);
    expect(all[3].isReagent).toBe(true);
    expect(all[3].link.kind).toBe("new");
    expect(all[3].expanded).toBe(true);
    const p = planDocIntake(all, OURS, TODAY, TODAY);
    expect(p.rows[3].error).not.toBeNull();
    expect(p.canSave).toBe(false);
    all[3] = patchDocRow(all[3], { newReagent: { storageClass: "기타" } }, OURS);
    expect(planDocIntake(all, OURS, TODAY, TODAY).canSave).toBe(true);
  });
  it('"시약으로 넣기": 이름이 우리 학교 시약과 맞으면 그 시약에 연결', () => {
    const doc: DocExtraction = { docDate: null, items: [it_("에탄올 1L", 1, "L", 2, { isReagent: false })] };
    const r = patchDocRow(buildDocRows(doc, OURS)[0], { isReagent: true }, OURS);
    expect(r.link).toEqual({ kind: "reagent", reagentId: ETOH.id });
    expect(r.amount).toBe("2000");
  });
});

describe("[K1][S7] 저장 계획 오류 (planDocIntake)", () => {
  const base = () => buildDocRows(FRAME_DOC, OURS);
  it("입고일 미래 → 저장 불가 · 항목 []", () => {
    const p = planDocIntake(base(), OURS, "2026-10-09", TODAY);
    expect([p.canSave, p.items]).toEqual([false, []]);
  });
  it("저장할 행 0개 → 저장 불가", () => {
    const all = base().map((r) => (r.isReagent ? patchDocRow(r, { link: { kind: "none" } }, OURS) : r));
    expect(planDocIntake(all, OURS, TODAY, TODAY).canSave).toBe(false);
  });
  it("입고량 0·빈 값·음수·문자 → 그 행 오류, 저장 불가", () => {
    for (const bad of ["0", "", "-1", "abc"]) {
      const all = base();
      all[0] = patchDocRow(all[0], { amount: bad }, OURS);
      const p = planDocIntake(all, OURS, TODAY, TODAY);
      expect(p.rows[0].error, `입고량 "${bad}"`).not.toBeNull();
      expect(p.canSave).toBe(false);
    }
  });
  it("새 시약: 이름 빔 · 우리 학교에 같은 이름(대소문자·앞뒤 공백 무시) · 같은 서류 안 같은 이름 · 분류 없음 · 재고량 0 · MSDS 주소가 http(s) 아님 → 오류", () => {
    const cases: [string, Parameters<typeof patchDocRow>[1]][] = [
      ["이름 빔", { newReagent: { name: "  " } }],
      ["있는 이름", { newReagent: { name: " 염산 " } }],
      ["분류 없음", { newReagent: { storageClass: "" } }],
      ["재고량 0", { newReagent: { stock: "0" } }],
      ["MSDS javascript:", { newReagent: { msdsUrl: "javascript:alert(1)" } }],
    ];
    for (const [what, patch] of cases) {
      const all = base();
      all[1] = patchDocRow(all[1], patch, OURS);
      const p = planDocIntake(all, OURS, TODAY, TODAY);
      expect(p.rows[1].error, what).not.toBeNull();
      expect(p.canSave, what).toBe(false);
    }
    const dup = base();
    dup[2] = patchDocRow(dup[2], { newReagent: { name: "질산칼륨" } }, OURS);
    const p = planDocIntake(dup, OURS, TODAY, TODAY);
    expect([p.rows[1].error, p.rows[2].error].every(Boolean), "같은 서류 안 같은 이름").toBe(true);
    expect(p.canSave).toBe(false);
  });
  it("MSDS 주소 https:// 는 저장 항목에 그대로", () => {
    const all = base();
    all[1] = patchDocRow(all[1], { newReagent: { msdsUrl: "https://msds.kosha.or.kr/x" } }, OURS);
    expect(planDocIntake(all, OURS, TODAY, TODAY).items[1]).toMatchObject({ msds_url: "https://msds.kosha.or.kr/x" });
  });
  it(`저장할 행 ${ITEMS_MAX + 1}개 → 저장 불가, ${ITEMS_MAX}개 → 가능`, () => {
    const mk = (n: number) => {
      const doc: DocExtraction = { docDate: null, items: Array.from({ length: n }, () => it_("염산", 500, "mL", 1)) };
      // buildDocRows 는 최대 50 — 51번째 행은 직접 붙인다
      const rows = buildDocRows({ ...doc, items: doc.items.slice(0, ITEMS_MAX) }, OURS);
      while (rows.length < n) rows.push({ ...rows[0], id: `doc-x${rows.length}` });
      return rows;
    };
    expect(planDocIntake(mk(ITEMS_MAX), OURS, TODAY, TODAY).canSave).toBe(true);
    expect(planDocIntake(mk(ITEMS_MAX + 1), OURS, TODAY, TODAY).canSave).toBe(false);
  });
});

describe("[K1][S7] 서버 쪽 다시 검사 (checkDocIntakeInput)", () => {
  const ok = { intakeDate: TODAY, items: [{ reagent_id: HCL.id, amount: 2.5 }, { name: " 질산칼륨 ", storage_class: "산화제", unit: "g", stock: 500, msds_url: "" }] };
  it("통과: 이름 앞뒤 공백 정리, 빈 MSDS → null", () => {
    expect(checkDocIntakeInput(ok, TODAY)).toEqual({
      ok: true,
      value: {
        intakeDate: TODAY,
        items: [
          { reagent_id: HCL.id, amount: 2.5 },
          { name: "질산칼륨", storage_class: "산화제", unit: "g", stock: 500, msds_url: null },
        ],
      },
    });
  });
  it(`거부: 미래 날짜 · 항목 0 · ${ITEMS_MAX + 1}개 · uuid 아님 · amount 0/음수/문자 · stock 0 · 분류 밖 · 단위 kg · MSDS javascript: · 객체 아님`, () => {
    const bad: unknown[] = [
      null,
      { ...ok, intakeDate: "2026-10-09" },
      { ...ok, intakeDate: "x" },
      { ...ok, items: [] },
      { ...ok, items: "x" },
      { ...ok, items: Array.from({ length: ITEMS_MAX + 1 }, () => ({ reagent_id: HCL.id, amount: 1 })) },
      { ...ok, items: [{ reagent_id: "not-uuid", amount: 1 }] },
      { ...ok, items: [{ reagent_id: HCL.id, amount: 0 }] },
      { ...ok, items: [{ reagent_id: HCL.id, amount: -1 }] },
      { ...ok, items: [{ reagent_id: HCL.id, amount: "5" }] },
      { ...ok, items: [{ name: "a", storage_class: "산", unit: "g", stock: 0 }] },
      { ...ok, items: [{ name: "a", storage_class: "강산", unit: "g", stock: 1 }] },
      { ...ok, items: [{ name: "a", storage_class: "산", unit: "kg", stock: 1 }] },
      { ...ok, items: [{ name: "a", storage_class: "산", unit: "g", stock: 1, msds_url: "javascript:alert(1)" }] },
      { ...ok, items: [{ name: "", storage_class: "산", unit: "g", stock: 1 }] },
      { ...ok, items: [3] },
    ];
    for (const b of bad) expect(checkDocIntakeInput(b, TODAY).ok, JSON.stringify(b).slice(0, 80)).toBe(false);
    expect(checkDocIntakeInput({ ...ok, items: Array.from({ length: ITEMS_MAX }, () => ({ reagent_id: HCL.id, amount: 1 })) }, TODAY).ok).toBe(true);
  });
});

describe("[K1][S7] 품명 → 이름 (규격 표기 떼기)", () => {
  it('"질산칼륨 500g" → "질산칼륨" · "에탄올 1L" → "에탄올" · 규격만 있으면 원래 이름', () => {
    expect(docReagentName("질산칼륨 500g")).toBe("질산칼륨");
    expect(docReagentName("에탄올 1L")).toBe("에탄올");
    expect(docReagentName("염화 나트륨 25 g")).toBe("염화 나트륨");
    expect(docReagentName("500mL")).toBe("500mL");
  });
});
