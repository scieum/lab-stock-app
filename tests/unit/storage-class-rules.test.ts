// 보관 분류 추천 — 인화성이 유기보다 먼저 (lib/storage-class-rules · doc-intake-rules normalizeDocItem · location-suggest) — [K1][S7][S3].
// 기대값: harness/d7-data.md §26 QA 개선 (11) "인화성(GHS 인화성 액체 H225·H226 또는 학교 상용 표)이 유기보다 먼저 —
//         아세톤·에탄올·메탄올 = 인화성. 서류 입고·위치 추천 같은 함수", §17(분류 없음 = 추천 없음), §21(suggestedClass),
//         design/rules.json cabinet.storage_classes. 산·염기·산화제 등 다른 분류는 그대로 둔다(빙초산 = 산).
//         구현의 표(FLAMMABLE_ROWS)를 기대값으로 쓰지 않는다 — 이름은 d7 이 적은 3개와 시안 7-doc-review 품목에서 고른다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveStorageClass, isFlammableReagent, suggestStorageClass } from "../../lib/storage-class-rules";
import { normalizeDocExtraction, normalizeDocItem } from "../../lib/doc-intake-rules";
import { suggestLocation, toSuggestCabinets, type SuggestCabinet } from "../../lib/location-suggest";
import { ROOT, read, rules } from "./helpers";

const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const D7_26 = D7.slice(D7.indexOf("## 26."), D7.indexOf("\n## ", D7.indexOf("## 26.") + 1));
const QA11 = D7_26.split(/\r?\n/).find((l) => l.startsWith("| QA 개선 (11) |")) ?? "";
const CLASSES = rules.cabinet.storage_classes as string[];
const FLAM = CLASSES.find((c) => QA11.includes(`인화성(`) && c === "인화성")!;
const ORGANIC = CLASSES.find((c) => c === "유기")!;
const ACID = CLASSES.find((c) => c === "산")!;
const OTHER = CLASSES.find((c) => c === "기타")!;
/** d7 §26 (11) 가 이름으로 적은 인화성 액체 */
const D7_NAMES = (() => {
  const m = /— ([^=|]+?) = 인화성/.exec(QA11);
  if (!m) throw new Error("d7 §26 QA (11) 에서 인화성 예시 이름을 읽지 못함");
  return m[1].split("·").map((s) => s.trim());
})();
/** d7 §26 (11) 의 GHS 유해 문구 */
const D7_H = [...QA11.matchAll(/H\d{3}/g)].map((m) => m[0]);
const CAS: Record<string, string> = { 아세톤: "67-64-1", 에탄올: "64-17-5", 메탄올: "67-56-1" };
/** 분류를 바꾸지 않는 다른 분류 (유기·기타 제외) */
const KEEP = CLASSES.filter((c) => ![ORGANIC, OTHER, FLAM].includes(c));

describe("[K1][S*] 기대값 원본 (d7 §26 QA (11) · rules.json cabinet.storage_classes)", () => {
  it("인화성·유기·산·기타 분류가 rules 에 있고 d7 예시 3개·유해 문구를 읽었다", () => {
    for (const c of [FLAM, ORGANIC, ACID, OTHER]) expect(c).toBeTruthy();
    expect(D7_NAMES).toEqual(["아세톤", "에탄올", "메탄올"]);
    expect(D7_H.length).toBeGreaterThanOrEqual(2);
    expect(QA11).toContain("서류 입고·위치 추천 같은 함수");
  });
});

describe("[K1][S*] isFlammableReagent — 이름 · CAS · 유해 문구", () => {
  it.each(D7_NAMES)("%s = 인화성 (이름 · CAS · 규격 붙은 서류 품명)", (n) => {
    expect(isFlammableReagent({ name: n })).toBe(true);
    expect(isFlammableReagent({ cas: CAS[n] })).toBe(true);
    expect(isFlammableReagent({ name: `${n} 500mL` })).toBe(true);
    expect(isFlammableReagent({ name: `${n} 1L x 2` })).toBe(true);
  });
  it.each(D7_H)("유해 문구 %s 가 있으면 인화성 (이름 몰라도)", (h) => {
    expect(isFlammableReagent({ name: "알 수 없는 용매", hazardCodes: [h] })).toBe(true);
    expect(isFlammableReagent({ hazardCodes: [` ${h.toLowerCase()} `] })).toBe(true);
  });
  it("인화성 액체가 아닌 시약 = false (염산 · 수산화나트륨 · 페놀프탈레인 · 빈 값)", () => {
    for (const n of ["염산", "염산 35% 500mL", "수산화나트륨", "페놀프탈레인", "질산칼륨 500g"]) expect(isFlammableReagent({ name: n }), n).toBe(false);
    expect(isFlammableReagent({})).toBe(false);
    expect(isFlammableReagent({ name: "", cas: "", hazardCodes: [] })).toBe(false);
    expect(isFlammableReagent({ name: "염산", hazardCodes: ["H314", "H290"] })).toBe(false);
  });
});

describe("[K1][S7] suggestStorageClass — 인화성이 유기·기타·없음보다 먼저, 다른 분류는 그대로", () => {
  it.each(D7_NAMES)("%s: 유기 · 기타 · null → 인화성", (n) => {
    for (const s of [ORGANIC, OTHER, null, undefined, "모르는값"]) expect(suggestStorageClass(s, { name: n }), String(s)).toBe(FLAM);
  });
  it("인화성 액체라도 산·염기·산화제·독성 등 다른 분류를 받으면 그대로 (빙초산 = 산, H226 이어도)", () => {
    for (const c of KEEP) expect(suggestStorageClass(c, { name: "에탄올" }), c).toBe(c);
    expect(suggestStorageClass(ACID, { name: "아세트산(빙초산)", hazardCodes: ["H226", "H314"] })).toBe(ACID);
  });
  it("인화성 액체가 아니면 받은 분류 그대로 (유기 = 유기, 모르는 값 = null)", () => {
    expect(suggestStorageClass(ORGANIC, { name: "페놀프탈레인" })).toBe(ORGANIC);
    expect(suggestStorageClass(OTHER, { name: "염화나트륨" })).toBe(OTHER);
    expect(suggestStorageClass(null, { name: "염화나트륨" })).toBeNull();
    expect(suggestStorageClass("유기용매", { name: "페놀프탈레인" })).toBeNull();
  });
  it("이미 인화성 → 인화성", () => {
    expect(suggestStorageClass(FLAM, { name: "페놀프탈레인" })).toBe(FLAM);
  });
});

describe("[K1][S7] normalizeDocItem — 서류 입고 suggestedClass 에 같은 규칙", () => {
  it.each(D7_NAMES)("%s 500mL: AI 가 유기 · 기타 · null 로 줘도 인화성", (n) => {
    for (const s of [ORGANIC, OTHER, null]) {
      expect(normalizeDocItem({ name: `${n} 500mL`, suggestedClass: s })!.suggestedClass, String(s)).toBe(FLAM);
    }
  });
  it("시안 7-doc-review 품목: 염산 = 산 · 질산칼륨 = 산화제 · 아세트산(빙초산) = 산 (바뀌지 않음)", () => {
    const ex = normalizeDocExtraction({
      items: [
        { name: "염산 35% 500mL", suggestedClass: ACID },
        { name: "질산칼륨 500g", suggestedClass: "산화제" },
        { name: "아세트산(빙초산) 500mL", suggestedClass: ACID },
        { name: "에탄올 1L", suggestedClass: ORGANIC },
      ],
    })!;
    expect(ex.items.map((i) => i.suggestedClass)).toEqual([ACID, "산화제", ACID, FLAM]);
  });
  it("인화성 아닌 유기 시약은 유기 그대로 · 모르는 분류 값은 null", () => {
    expect(normalizeDocItem({ name: "페놀프탈레인 25g", suggestedClass: ORGANIC })!.suggestedClass).toBe(ORGANIC);
    expect(normalizeDocItem({ name: "페놀프탈레인 25g", suggestedClass: "유기용매" })!.suggestedClass).toBeNull();
  });
  it("시약 아님 품목(isReagent false)도 이름이 인화성 액체가 아니면 null 그대로", () => {
    expect(normalizeDocItem({ name: "배송비", isReagent: false, suggestedClass: null })!.suggestedClass).toBeNull();
  });
});

describe("[K1][S3] 위치 추천 — 같은 규칙 (effectiveStorageClass · suggestLocation · toSuggestCabinets)", () => {
  it("저장 분류 없음 = 추천 없음 (d7 §17 그대로, 인화성 이름이어도)", () => {
    expect(effectiveStorageClass(null, { name: "에탄올" })).toBeNull();
    expect(effectiveStorageClass("", { name: "에탄올" })).toBeNull();
    expect(effectiveStorageClass(` ${ORGANIC} `, { name: "에탄올" })).toBeNull();
  });
  it("저장 분류 유기·기타인 인화성 액체 → 인화성, 다른 분류 그대로", () => {
    for (const n of D7_NAMES) {
      expect(effectiveStorageClass(ORGANIC, { name: n })).toBe(FLAM);
      expect(effectiveStorageClass(OTHER, { cas: CAS[n] })).toBe(FLAM);
    }
    expect(effectiveStorageClass(ACID, { name: "에탄올" })).toBe(ACID);
    expect(effectiveStorageClass(ORGANIC, { name: "페놀프탈레인" })).toBe(ORGANIC);
  });

  const DOUBLE = rules.cabinet.door_types[0] as SuggestCabinet["doorType"];
  const cabinets = (): SuggestCabinet[] => [
    {
      id: "c1",
      number: 1,
      label: "1번 시약장",
      doorType: DOUBLE,
      shelves: 2,
      slots: [
        { side: "L", shelf: 1, classes: [ORGANIC], reagents: [], slotId: "s-org" },
        { side: "R", shelf: 1, classes: [FLAM], reagents: [{ id: "x", storageClass: FLAM }], slotId: "s-flam" },
      ],
    },
  ];
  it("에탄올(저장 분류 유기) → 인화성 칸 추천 (빈 유기 칸이 있어도)", () => {
    const s = suggestLocation({ id: "t", storageClass: ORGANIC, name: "에탄올" }, cabinets());
    expect(s && { side: s.side, shelf: s.shelf }).toEqual({ side: "R", shelf: 1 });
  });
  it("인화성 아닌 유기 시약(이름 있음) → 유기 칸 그대로", () => {
    const s = suggestLocation({ id: "t", storageClass: ORGANIC, name: "페놀프탈레인" }, cabinets());
    expect(s && { side: s.side, shelf: s.shelf }).toEqual({ side: "L", shelf: 1 });
  });
  it("칸 안 시약도 같은 규칙: 유기로 저장된 아세톤이 있는 칸 = 인화성 시약이 있는 칸", () => {
    const list = toSuggestCabinets(
      [{ id: "c1", number: 1, label: "1번 시약장", door_type: DOUBLE, shelves: 1 }],
      [{ id: "s1", cabinet_id: "c1", side: "L", shelf: 1, storage_classes: [ORGANIC] }],
      [{ id: "r1", slot_id: "s1", storage_class: ORGANIC, name: "아세톤", cas_no: null }],
    );
    const inSlot = list[0].slots.find((x) => x.side === "L" && x.shelf === 1)!.reagents;
    expect(inSlot.map((r) => r.storageClass)).toEqual([FLAM]);
  });
});

describe("[K1][S7] 서류 입고 AI 프롬프트 — 인화성 먼저 규칙 포함 (소스 정적 검사)", () => {
  it("lib/server/gemini.ts suggestedClass 지시에 공용 규칙 문장을 넣는다", () => {
    const src = read(join(ROOT, "lib/server/gemini.ts"));
    const line = src.split("\n").find((l) => l.includes("suggestedClass:"))!;
    expect(line).toContain("STORAGE_CLASS_PROMPT_RULE");
    expect(src).toMatch(/import\s*\{[^}]*STORAGE_CLASS_PROMPT_RULE[^}]*\}\s*from\s*"\.\.\/storage-class-rules"/);
  });
});
