// MSDS 찾기 검색 보강 (harness/d7-data.md §20 "검색 보강" 행 — 2026-10-08 사용자 보고 "묽은 염산" 0건).
// [K1] 공용 순수 규칙 lib/msds-aliases:
//   - cleanReagentName: 앞뒤 수식어(묽은·진한·희석·포화, 무수는 남김) · 농도(0.1M·1N·35%·w/v·mol/L) · 괄호 · 끝의 용액·수용액·시약 · 등급(특급·1급·GR·EP·CP)
//   - lookupAliasCas: 학교 상용 이름 표 (원래 이름 · 정리한 이름 · 로마 숫자/공백 변형)
//   - 표 무결성: 이름 중복 없음 · CAS 형식 · CAS 체크 디지트 (모든 행) · d7 예시(염산·암모니아수·가성소다) 포함 · 약 N종 이상
//   - planMsdsSearch: 차례 (1) cas 인자 / CAS 꼴 q (2) 표 CAS (3) 원래 이름 (4) 정리한 이름(fallback) · 같은 검색 한 번 · 최대 4회
//   - searchedAsNote: d7 문구 "{원래 이름} → {찾은 이름}(으)로 찾았어요" · 조사 으로/로 · 같으면 없음
//   - readSearchedAs (응답 본문)
// [K1][N2] lib/server/msds-search combinedMsdsSearch · cachedCombinedMsdsSearch — 가짜 fetch (실제 KOSHA 호출 없음):
//   차례·합치기(중복 chemId 제거, 최대 10)·최대 4회·(4) 조건·하루 캐시·부분 실패 → 후보·전부 실패 → 실패 코드·결과에 키 없음.
// [N2][S*] app/api/msds/search route (가짜 fetch · 가짜 키 · 접근 검사는 대체): cas 인자(꼴 아니면 무시) · 응답 { candidates, searchedAs } · 502/503.
// 숫자 한도(후보 최대 · 호출 최대)는 d7 §20 문장에서 읽는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT, rules } from "./helpers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/msds-rules", async () => await import("../../lib/msds-rules"));
vi.mock("@/lib/rate-limit", async () => await import("../../lib/rate-limit"));
vi.mock("@/lib/server/kosha-msds", async () => await import("../../lib/server/kosha-msds"));
vi.mock("@/lib/server/msds-search", async () => await import("../../lib/server/msds-search"));
const access = vi.hoisted(() => ({ kind: "ok" as string, userId: "u-1" }));
vi.mock("@/lib/supabase/msds", () => ({ getMsdsAccess: async () => ({ ...access }) }));

import { MSDS_ALIASES, cleanReagentName, lookupAliasCas, planMsdsSearch, searchedAsLabel, searchedAsNote } from "../../lib/msds-aliases";
import { isCasQuery, readSearchedAs } from "../../lib/msds-rules";

// ---- d7 §20 ----
const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const S20 = D7.slice(D7.indexOf("## 20."), D7.indexOf("\n## ", D7.indexOf("## 20.") + 5));
const BOOST = S20.split("\n").find((l) => l.startsWith("| 검색 보강")) ?? "";
const num = (src: string, re: RegExp, what: string) => {
  const m = re.exec(src);
  if (!m) throw new Error(`d7 §20 에서 ${what} 를 찾지 못함`);
  return Number(m[1]);
};
const CAND_MAX = num(BOOST, /최대 (\d+)\)/, "합친 후보 최대");
const CALLS_MAX = num(BOOST, /KOSHA 호출 최대 (\d+)회/, "KOSHA 호출 최대");
const TABLE_ABOUT = num(BOOST, /약 (\d+)종/, "상용 이름 표 크기");
/** d7 예시 "염산→7647-01-0, 암모니아수→1336-21-6, 가성소다→1310-73-2" */
const D7_EXAMPLES = [...BOOST.matchAll(/([가-힣]+)→(\d+-\d+-\d)/g)].map((m) => [m[1], m[2]] as const);
/** d7 안내 줄 "{원래 이름} → {찾은 이름}(으)로 찾았어요" */
const NOTE_TEMPLATE = (/"(\{원래 이름\}[^"]+찾았어요)"/.exec(BOOST) ?? [])[1] ?? "";
/** d7 사용자 보고: "묽은 염산" · KOSHA 등록명 "염화수소"(7647-01-0) */
const REPORT = { query: (/"(묽은 염산)"/.exec(BOOST) ?? [])[1] ?? "", kosha: (/"(염화수소)"/.exec(BOOST) ?? [])[1] ?? "", cas: (/"염화수소"\((\d+-\d+-\d)\)/.exec(BOOST) ?? [])[1] ?? "" };
const EXTERNAL_HOST = (/https:\/\/([a-z.]+)\/B552468/.exec(S20) ?? [])[1] ?? "apis.data.go.kr";
const BANNED: string[] = rules.never.N2.banned_terms;

/** 받침(ㄹ 제외) 있으면 "으로", 아니면 "로" — 테스트 쪽 독립 계산 (숫자는 읽는 소리: 0 영·3 삼·6 육 → 으로) */
function ro(word: string): string {
  const last = word.slice(-1);
  if (/\d/.test(last)) return "036".includes(last) ? "으로" : "로";
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "(으)로";
  const jong = code % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}
/** d7 문구 틀에 넣은 기대 문구 */
/** particleOf = 조사를 정하는 글자 (CAS 꼴 "물질명(CAS …)" 은 괄호 앞 물질명) */
const expectedNote = (orig: string, found: string, particleOf = found) =>
  NOTE_TEMPLATE.replace("{원래 이름}", orig).replace("{찾은 이름}(으)로", `${found}${ro(particleOf)}`);

/** CAS 체크 디지트: 마지막 자리 = (앞 숫자들을 오른쪽부터 1·2·3… 곱해 더한 값) mod 10 */
function casCheckOk(cas: string): { ok: boolean; expected: number } {
  const d = cas.replace(/-/g, "");
  const body = d.slice(0, -1);
  let s = 0;
  [...body].reverse().forEach((c, i) => (s += Number(c) * (i + 1)));
  return { ok: s % 10 === Number(d.slice(-1)), expected: s % 10 };
}

describe("[K1][S*] 전제: d7 §20 검색 보강 행에서 읽은 값", () => {
  it(`후보 최대 ${CAND_MAX} · 호출 최대 ${CALLS_MAX} · 표 약 ${TABLE_ABOUT}종 · 예시 ${D7_EXAMPLES.length}개 · 문구 틀 · 사용자 보고 값`, () => {
    expect(BOOST.length).toBeGreaterThan(0);
    expect(CAND_MAX).toBeGreaterThan(1);
    expect(CALLS_MAX).toBeGreaterThan(1);
    expect(TABLE_ABOUT).toBeGreaterThan(1);
    expect(D7_EXAMPLES.length).toBeGreaterThanOrEqual(3);
    expect(NOTE_TEMPLATE).toContain("→");
    expect(REPORT.query && REPORT.kosha && REPORT.cas, "사용자 보고 (묽은 염산 · 염화수소 · CAS)").toBeTruthy();
    expect(casCheckOk("7647-01-0").ok, "체크 디지트 계산 양성 대조").toBe(true);
    expect(casCheckOk("7647-01-1").ok, "체크 디지트 계산 음성 대조").toBe(false);
  });
});

// =====================================================================
// cleanReagentName
// =====================================================================
describe("[K1][S*] cleanReagentName (d7 §20 검색 보강 (4) 이름 정리)", () => {
  const cases: [string, string, string][] = [
    // 앞뒤 수식어
    ["앞 수식어 묽은", "묽은 염산", "염산"],
    ["앞 수식어 진한", "진한 황산", "황산"],
    ["앞 수식어 희석", "희석 염산", "염산"],
    ["앞 수식어 포화", "포화 석회수", "석회수"],
    ["뒤 수식어", "염산 묽은", "염산"],
    ["수식어 둘", "묽은 진한 질산", "질산"],
    // 붙여 쓴 수식어
    ["붙여 쓴 묽은", "묽은염산", "염산"],
    ["붙여 쓴 진한", "진한염산", "염산"],
    ["붙여 쓴 포화", "포화석회수", "석회수"],
    // 농도
    ["농도 0.1M", "0.1M 염산", "염산"],
    ["농도 뒤 0.1 M", "염산 0.1 M", "염산"],
    ["농도 1N", "1N 수산화나트륨", "수산화나트륨"],
    ["농도 35%", "35% 염산", "염산"],
    ["농도 뒤 35%", "염산 35%", "염산"],
    ["농도 w/v", "10%(w/v) 수산화나트륨", "수산화나트륨"],
    ["농도 w/v 띄어 씀", "10% w/v 수산화나트륨", "수산화나트륨"],
    ["농도 mol/L", "0.1 mol/L 염산", "염산"],
    // 괄호
    ["괄호 농도", "염산(35%)", "염산"],
    ["괄호 설명", "에탄올 (99.5%)", "에탄올"],
    ["대괄호", "아세톤 [분석용]", "아세톤"],
    // 끝의 용액·수용액·시약
    ["끝 용액", "질산은 용액", "질산은"],
    ["끝 수용액", "수산화나트륨 수용액", "수산화나트륨"],
    ["끝 시약", "염산 시약", "염산"],
    ["붙여 쓴 용액", "염산용액", "염산"],
    // 등급
    ["등급 특급", "에탄올 특급", "에탄올"],
    ["등급 1급", "염화나트륨 1급", "염화나트륨"],
    ["등급 GR", "에탄올 GR", "에탄올"],
    ["등급 EP", "염산 EP", "염산"],
    ["등급 CP 앞", "CP 아세톤", "아세톤"],
    // 여러 개 함께
    ["모두 함께", "묽은 염산 0.1M 수용액 (특급)", "염산"],
    ["농도·등급·용액", "0.1M 질산은 용액 GR", "질산은"],
    // 무수는 남김
    ["무수 유지", "무수 에탄올", "무수 에탄올"],
    ["무수 유지 + 등급", "무수 황산나트륨 특급", "무수 황산나트륨"],
    // 이미 깨끗한 이름
    ["바꿀 것 없음", "아세톤", "아세톤"],
    ["공백 정리", "  질산   은  ", "질산 은"],
  ];
  for (const [what, input, out] of cases) {
    it(`${what}: "${input}" → "${out}"`, () => {
      expect(cleanReagentName(input)).toBe(out);
    });
  }
  it('다 떼면 빈 결과: "시약" · "용액" · "0.1M" · "35%" · "(특급)" · "" → ""', () => {
    for (const s of ["시약", "용액", "0.1M", "35%", "(특급)", "", "   "]) expect(cleanReagentName(s), JSON.stringify(s)).toBe("");
  });
});

// =====================================================================
// lookupAliasCas
// =====================================================================
describe("[K1][S*] lookupAliasCas (학교 상용 이름 표)", () => {
  it(`사용자 보고: "${REPORT.query}" → ${REPORT.cas} · "${REPORT.kosha}" → ${REPORT.cas}`, () => {
    expect(lookupAliasCas(REPORT.query)).toBe(REPORT.cas);
    expect(lookupAliasCas(REPORT.kosha)).toBe(REPORT.cas);
  });
  it("d7 예시 (염산 · 암모니아수 · 가성소다) → d7 CAS", () => {
    for (const [name, cas] of D7_EXAMPLES) expect(lookupAliasCas(name), name).toBe(cas);
  });
  it("원래 이름 · 정리한 이름 모두 찾는다 (진한 황산 · 0.1M 염산 · 수산화나트륨 수용액 · 에탄올 특급 · 염산(35%))", () => {
    const sulfuric = lookupAliasCas("황산");
    const hcl = lookupAliasCas("염산");
    const naoh = lookupAliasCas("수산화나트륨");
    const etoh = lookupAliasCas("에탄올");
    for (const v of [sulfuric, hcl, naoh, etoh]) expect(v && isCasQuery(v)).toBe(true);
    expect(lookupAliasCas("진한 황산")).toBe(sulfuric);
    expect(lookupAliasCas("0.1M 염산")).toBe(hcl);
    expect(lookupAliasCas("염산(35%)")).toBe(hcl);
    expect(lookupAliasCas("수산화나트륨 수용액")).toBe(naoh);
    expect(lookupAliasCas("1N 수산화나트륨")).toBe(naoh);
    expect(lookupAliasCas("에탄올 특급")).toBe(etoh);
    expect(lookupAliasCas("무수 에탄올"), "무수 에탄올 = 에탄올").toBe(etoh);
  });
  it("공백 · 대소문자 · 전각 · 로마 숫자(Ⅱ ↔ II) 변형", () => {
    const cuso4 = lookupAliasCas("황산구리(II)");
    expect(cuso4).not.toBeNull();
    expect(lookupAliasCas("황산구리(Ⅱ)"), "로마 숫자 Ⅱ").toBe(cuso4);
    expect(lookupAliasCas("황산구리 (II)"), "괄호 앞 공백").toBe(cuso4);
    expect(lookupAliasCas("황산 구리(II)"), "이름 안 공백").toBe(cuso4);
    expect(lookupAliasCas("묽은  염산"), "공백 두 칸").toBe(REPORT.cas);
    expect(lookupAliasCas("묽은염산"), "붙여 씀").toBe(REPORT.cas);
    const btb = lookupAliasCas("BTB");
    expect(btb).not.toBeNull();
    expect(lookupAliasCas("btb"), "소문자").toBe(btb);
    expect(lookupAliasCas("ＢＴＢ"), "전각").toBe(btb);
  });
  it("표에 없는 이름 → null (정리해도 없음 · 빈 이름)", () => {
    for (const s of ["없는물질zz", "묽은 없는물질zz", "0.1M 없는물질zz 용액", "", "시약", "염화철"]) expect(lookupAliasCas(s), JSON.stringify(s)).toBeNull();
  });
});

// =====================================================================
// 표 무결성
// =====================================================================
describe("[K1][S*] 학교 상용 이름 표 무결성", () => {
  it(`행 수 ≥ d7 "약 ${TABLE_ABOUT}종" · 행마다 이름 1개 이상 · CAS 행 중복 없음`, () => {
    expect(MSDS_ALIASES.length).toBeGreaterThanOrEqual(TABLE_ABOUT);
    for (const r of MSDS_ALIASES) expect(r.names.length, r.cas).toBeGreaterThan(0);
    const cas = MSDS_ALIASES.map((r) => r.cas);
    expect(cas.filter((c, i) => cas.indexOf(c) !== i), "같은 CAS 두 행").toEqual([]);
  });
  it("이름 중복 없음: 같은 이름(공백·대소문자·전각·로마 숫자 무시)이 서로 다른 CAS 두 행에 없다 · 글자 그대로 같은 이름 두 번 없음", () => {
    const key = (n: string) => n.normalize("NFKC").replace(/Ⅱ/g, "II").replace(/Ⅲ/g, "III").toLowerCase().replace(/\s+/g, "");
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const r of MSDS_ALIASES) {
      for (const n of r.names) {
        const k = key(n);
        const prev = seen.get(k);
        if (prev !== undefined && prev !== r.cas) dup.push(`${n} (${prev} · ${r.cas})`);
        seen.set(k, r.cas);
      }
    }
    expect(dup, "한 이름 → 두 CAS").toEqual([]);
    const raw = MSDS_ALIASES.flatMap((r) => r.names);
    expect(raw.filter((n, i) => raw.indexOf(n) !== i), "글자 그대로 같은 이름").toEqual([]);
  });
  it("모든 이름이 자기 행 CAS 로 찾아진다", () => {
    const wrong: string[] = [];
    for (const r of MSDS_ALIASES) for (const n of r.names) if (lookupAliasCas(n) !== r.cas) wrong.push(`${n}: ${lookupAliasCas(n)} ≠ ${r.cas}`);
    expect(wrong).toEqual([]);
  });
  it("CAS 형식 (2~7자리-2자리-1자리) · 체크 디지트가 모든 행에서 맞다", () => {
    const badForm = MSDS_ALIASES.filter((r) => !/^\d{2,7}-\d{2}-\d$/.test(r.cas)).map((r) => r.cas);
    expect(badForm, "CAS 형식").toEqual([]);
    const badCheck = MSDS_ALIASES.map((r) => ({ r, c: casCheckOk(r.cas) }))
      .filter((x) => !x.c.ok)
      .map((x) => `${x.r.names[0]} ${x.r.cas} (체크 디지트 ${x.c.expected} 이어야 함)`);
    expect(badCheck, "CAS 체크 디지트").toEqual([]);
  });
});

// =====================================================================
// planMsdsSearch
// =====================================================================
describe("[K1][S*] planMsdsSearch (d7 §20 검색 차례)", () => {
  const all = (p: ReturnType<typeof planMsdsSearch>) => [...p.steps, ...(p.fallback ? [p.fallback] : [])];
  it(`사용자 보고 "${REPORT.query}" (cas 없음): (2) 표 CAS ${REPORT.cas} → (3) 원래 이름 · (4) 정리한 이름 "염산"`, () => {
    expect(planMsdsSearch(REPORT.query)).toEqual({
      steps: [
        { kind: "cas", value: REPORT.cas },
        { kind: "name", value: REPORT.query },
      ],
      fallback: { kind: "name", value: "염산" },
    });
  });
  it("(1) cas 인자 먼저 → (2) 표 CAS → (3) 원래 이름 · (4) 정리한 이름 — 모두 다르면 4번", () => {
    const etoh = lookupAliasCas("에탄올")!;
    const p = planMsdsSearch(REPORT.query, etoh);
    expect(p.steps).toEqual([
      { kind: "cas", value: etoh },
      { kind: "cas", value: REPORT.cas },
      { kind: "name", value: REPORT.query },
    ]);
    expect(p.fallback).toEqual({ kind: "name", value: "염산" });
    expect(all(p).length).toBeLessThanOrEqual(CALLS_MAX);
  });
  it("같은 검색은 한 번: cas 인자 = 표 CAS → CAS 한 번 · 정리한 이름 = 원래 이름 → fallback 없음", () => {
    expect(planMsdsSearch(REPORT.query, REPORT.cas).steps.filter((s) => s.kind === "cas")).toEqual([{ kind: "cas", value: REPORT.cas }]);
    const p = planMsdsSearch("염산", REPORT.cas);
    expect(p.steps).toEqual([
      { kind: "cas", value: REPORT.cas },
      { kind: "name", value: "염산" },
    ]);
    expect(p.fallback, "정리해도 같은 이름").toBeNull();
    expect(planMsdsSearch("없는물질zz")).toEqual({ steps: [{ kind: "name", value: "없는물질zz" }], fallback: null });
  });
  it("q 가 CAS 꼴 → CAS 검색만 (이름·표·정리 없음) · cas 인자가 다르면 cas 인자 먼저", () => {
    expect(planMsdsSearch(REPORT.cas)).toEqual({ steps: [{ kind: "cas", value: REPORT.cas }], fallback: null });
    expect(planMsdsSearch(` ${REPORT.cas} `, REPORT.cas)).toEqual({ steps: [{ kind: "cas", value: REPORT.cas }], fallback: null });
    expect(planMsdsSearch(REPORT.cas, "64-17-5").steps).toEqual([
      { kind: "cas", value: "64-17-5" },
      { kind: "cas", value: REPORT.cas },
    ]);
  });
  it("cas 인자가 CAS 꼴이 아니면 무시 (빈 값 · 글자 · null)", () => {
    const base = planMsdsSearch("묽은 없는물질zz");
    expect(base).toEqual({ steps: [{ kind: "name", value: "묽은 없는물질zz" }], fallback: { kind: "name", value: "없는물질zz" } });
    for (const c of ["", "  ", "abc", "7647-01", "CAS 7647-01-0", null, undefined]) expect(planMsdsSearch("묽은 없는물질zz", c), String(c)).toEqual(base);
  });
  it(`어떤 입력이든 호출 ≤ ${CALLS_MAX} · 같은 (종류, 값) 두 번 없음`, () => {
    const qs = ["묽은 염산", "0.1M 질산은 용액 GR", "황산구리(II) 오수화물", "에탄올", "7647-01-0", "없는물질", "진한 황산 (98%)"];
    const cs = [null, "7647-01-0", "64-17-5", "7761-88-8"];
    for (const q of qs) {
      for (const c of cs) {
        const st = all(planMsdsSearch(q, c));
        expect(st.length, `${q} / ${c}`).toBeLessThanOrEqual(CALLS_MAX);
        expect(st.length).toBeGreaterThan(0);
        const keys = st.map((s) => `${s.kind}:${s.value.replace(/\s+/g, "")}`);
        expect(new Set(keys).size, `${q} / ${c} 중복`).toBe(keys.length);
      }
    }
  });
});

// =====================================================================
// searchedAsNote · readSearchedAs
// =====================================================================
describe("[K1][S*] searchedAsNote (d7 문구) · readSearchedAs", () => {
  it(`이름: "${REPORT.query}" → "${REPORT.kosha}" = d7 틀 "${NOTE_TEMPLATE}" (받침 없음 → 로)`, () => {
    expect(searchedAsNote(REPORT.query, REPORT.kosha)).toBe(expectedNote(REPORT.query, REPORT.kosha));
    expect(searchedAsNote(REPORT.query, REPORT.kosha)).toBe(`${REPORT.query} → ${REPORT.kosha}로 찾았어요`);
  });
  it("조사: 받침 있음 → 으로 · ㄹ 받침 → 로 · 받침 없음 → 로", () => {
    expect(searchedAsNote("묽은 염산", "염산")).toBe(expectedNote("묽은 염산", "염산"));
    expect(searchedAsNote("묽은 염산", "염산")).toContain("염산으로 찾았어요");
    expect(searchedAsNote("에탄올 특급", "에탄올")).toContain("에탄올로 찾았어요");
    expect(searchedAsNote("가성 소다", "수산화나트륨")).toContain("수산화나트륨으로 찾았어요");
    expect(searchedAsNote("x", "아세톤")).toContain("아세톤으로 찾았어요");
    expect(searchedAsNote("x", "과산화수소")).toContain("과산화수소로 찾았어요");
  });
  it(`CAS 새 꼴 "물질명(CAS 번호)": 사용자 보고 "${REPORT.query} → ${REPORT.kosha}(CAS ${REPORT.cas})로 찾았어요" = d7 틀 · 조사는 괄호 앞 물질명 (받침 → 으로 · 없음/ㄹ → 로) · 조사 앞 공백 없음`, () => {
    const found = `${REPORT.kosha}(CAS ${REPORT.cas})`;
    expect(searchedAsNote(REPORT.query, found)).toBe(`${REPORT.query} → ${REPORT.kosha}(CAS ${REPORT.cas})로 찾았어요`);
    expect(searchedAsNote(REPORT.query, found)).toBe(expectedNote(REPORT.query, found, REPORT.kosha));
    expect(searchedAsNote("묽은 염산", `염산(CAS ${REPORT.cas})`), "받침 → 으로").toBe(`묽은 염산 → 염산(CAS ${REPORT.cas})으로 찾았어요`);
    expect(searchedAsNote("주정", "에탄올(CAS 64-17-5)"), "ㄹ 받침 → 로").toBe("주정 → 에탄올(CAS 64-17-5)로 찾았어요");
    expect(searchedAsNote("가성소다", "수산화 나트륨(CAS 1310-73-2)"), "물질명 공백 그대로 · 받침 → 으로").toBe("가성소다 → 수산화 나트륨(CAS 1310-73-2)으로 찾았어요");
  });
  it("CAS 새 꼴 없음: 원래 검색어가 그 CAS · 물질명이 원래 검색어와 같음(공백·대소문자 무시)", () => {
    const found = `${REPORT.kosha}(CAS ${REPORT.cas})`;
    expect(searchedAsNote(REPORT.cas, found), "검색어 = 그 CAS").toBeNull();
    expect(searchedAsNote(` ${REPORT.cas} `, found)).toBeNull();
    expect(searchedAsNote(REPORT.kosha, found), "물질명 = 검색어").toBeNull();
    expect(searchedAsNote(`${REPORT.kosha} `, `${REPORT.kosha} (CAS ${REPORT.cas})`)).toBeNull();
    expect(searchedAsNote("btb", "BTB(CAS 76-59-5)")).toBeNull();
  });
  it("예전 꼴 \"CAS 번호\" 도 받음: \"{원래} → CAS …{조사} 찾았어요\" (숫자 읽는 소리 0 영 → 으로 · 9 구 → 로, 공백 없음) · 검색어가 그 CAS 면 없음", () => {
    expect(searchedAsNote(REPORT.query, `CAS ${REPORT.cas}`)).toBe(`${REPORT.query} → CAS ${REPORT.cas}으로 찾았어요`);
    expect(searchedAsNote("황산", "CAS 7664-93-9")).toBe("황산 → CAS 7664-93-9로 찾았어요");
    expect(searchedAsNote(REPORT.cas, `CAS ${REPORT.cas}`), "같은 CAS → 없음").toBeNull();
    expect(searchedAsNote(` ${REPORT.cas} `, `CAS ${REPORT.cas}`)).toBeNull();
  });
  it("searchedAsLabel: 이름 차례 = 그 이름 · CAS 차례 = 첫 후보 물질명(CAS 후보 CAS, 없으면 검색 CAS) · 후보 없음 → \"CAS 번호\"", () => {
    const c = (name: string, cas: string | null) => ({ chemId: "000001", name, cas, msdsUrl: "https://x.test/1" });
    expect(searchedAsLabel({ kind: "name", value: "염산" }, c("염화수소", REPORT.cas))).toBe("염산");
    expect(searchedAsLabel({ kind: "cas", value: REPORT.cas }, c(REPORT.kosha, REPORT.cas))).toBe(`${REPORT.kosha}(CAS ${REPORT.cas})`);
    expect(searchedAsLabel({ kind: "cas", value: REPORT.cas }, c(REPORT.kosha, null)), "후보 CAS 없음 → 검색 CAS").toBe(`${REPORT.kosha}(CAS ${REPORT.cas})`);
    expect(searchedAsLabel({ kind: "cas", value: REPORT.cas }, c(REPORT.kosha, "1-11-1")), "후보 CAS 우선").toBe(`${REPORT.kosha}(CAS 1-11-1)`);
    expect(searchedAsLabel({ kind: "cas", value: REPORT.cas }, null)).toBe(`CAS ${REPORT.cas}`);
    expect(searchedAsLabel({ kind: "cas", value: REPORT.cas })).toBe(`CAS ${REPORT.cas}`);
  });
  it("없음: searchedAs 없음·빈 값 · 원래 이름과 같음(공백·대소문자 차이만)", () => {
    for (const s of [null, undefined, "", "  "]) expect(searchedAsNote(REPORT.query, s), String(s)).toBeNull();
    expect(searchedAsNote(REPORT.query, REPORT.query)).toBeNull();
    expect(searchedAsNote("묽은  염산 ", "묽은 염산")).toBeNull();
    expect(searchedAsNote("BTB", "btb")).toBeNull();
  });
  it("문구에 N2 금지어 0", () => {
    const s = [searchedAsNote(REPORT.query, REPORT.kosha), searchedAsNote(REPORT.query, `CAS ${REPORT.cas}`), searchedAsNote(REPORT.query, `${REPORT.kosha}(CAS ${REPORT.cas})`)].join("\n").toLowerCase();
    expect(BANNED.filter((t) => s.includes(t.toLowerCase()))).toEqual([]);
  });
  it("readSearchedAs: 문자열만 · 앞뒤 공백 정리 · 빈 값·문자열 아님·너무 긺 → null", () => {
    expect(readSearchedAs({ candidates: [], searchedAs: " 염화수소 " })).toBe("염화수소");
    expect(readSearchedAs({ searchedAs: "CAS 7647-01-0" })).toBe("CAS 7647-01-0");
    expect(readSearchedAs({ searchedAs: "염화수소(CAS 7647-01-0)" })).toBe("염화수소(CAS 7647-01-0)");
    expect(readSearchedAs({ searchedAs: "가".repeat(160) }), "160자까지").toBe("가".repeat(160));
    expect(readSearchedAs({ searchedAs: "가".repeat(161) }), "161자 → null").toBeNull();
    for (const b of [null, undefined, "x", {}, { searchedAs: 1 }, { searchedAs: "" }, { searchedAs: "  " }, { searchedAs: "가".repeat(500) }]) expect(readSearchedAs(b), JSON.stringify(b)).toBeNull();
  });
});

// =====================================================================
// combinedMsdsSearch — 가짜 fetch
// =====================================================================
type FakeItem = { id: string; name: string; cas?: string };
const xmlOf = (items: FakeItem[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items>${items
    .map((i) => `<item><casNo>${i.cas ?? ""}</casNo><chemId>${i.id}</chemId><chemNameKor>${i.name}</chemNameKor><openYn>Y</openYn></item>`)
    .join("")}</items><numOfRows>20</numOfRows><pageNo>1</pageNo><totalCount>${items.length}</totalCount></body></response>`;
const items = (prefix: string, start: number, n: number): FakeItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: String(start + i).padStart(6, "0"), name: `${prefix}${i + 1}` }));

/** 가짜 KOSHA 응답 — "cas:값" / "name:값" → 후보 · "fail" · "net" · "timeout". 없는 검색 = 0건 */
type Answer = FakeItem[] | "fail" | "net" | "timeout";
const KEY_NAME = "KOSHA_MSDS_API_KEY";
const FAKE_KEY = "FAKE-TEST-VALUE-0000";

function useFakeKosha() {
  const st = { calls: [] as { cnd: string; wrd: string }[], answers: new Map<string, Answer>() };
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[KEY_NAME];
    process.env[KEY_NAME] = FAKE_KEY;
    vi.resetModules();
    st.calls.length = 0;
    st.answers.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string | URL) => {
        const url = new URL(String(u));
        if (url.hostname !== EXTERNAL_HOST) throw new Error(`예상 밖 요청 ${url.hostname}`);
        const cnd = url.searchParams.get("searchCnd") ?? "";
        const wrd = url.searchParams.get("searchWrd") ?? "";
        st.calls.push({ cnd, wrd });
        const a = st.answers.get(`${cnd === "1" ? "cas" : "name"}:${wrd}`) ?? [];
        if (a === "fail") return new Response("server error", { status: 500 });
        if (a === "net") throw new TypeError("fetch failed");
        if (a === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
        return new Response(xmlOf(a), { status: 200, headers: { "Content-Type": "application/xml" } });
      }),
    );
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY_NAME];
    else process.env[KEY_NAME] = saved;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  return st;
}

const loadSearch = () => import("../../lib/server/msds-search");
const ids = (c: { chemId: string }[]) => c.map((x) => x.chemId);

describe("[K1][N2][S*] combinedMsdsSearch · cachedCombinedMsdsSearch (가짜 fetch — 실제 KOSHA 호출 없음)", () => {
  const st = useFakeKosha();

  it(`사용자 보고 "${REPORT.query}": 표 CAS(searchCnd 1) 로 "${REPORT.kosha}" 를 찾는다 → searchedAs "${REPORT.kosha}(CAS ${REPORT.cas})" → 안내 줄 "${REPORT.query} → ${REPORT.kosha}(CAS ${REPORT.cas})로 …" · 원래 이름도 함께 찾음 · (4) 안 부름`, async () => {
    st.answers.set(`cas:${REPORT.cas}`, [{ id: "000111", name: REPORT.kosha, cas: REPORT.cas }]);
    const { combinedMsdsSearch } = await loadSearch();
    const r = await combinedMsdsSearch(REPORT.query);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates.map((c) => [c.chemId, c.name, c.cas])).toEqual([["000111", REPORT.kosha, REPORT.cas]]);
    expect(r.searchedAs).toBe(`${REPORT.kosha}(CAS ${REPORT.cas})`);
    expect(searchedAsNote(REPORT.query, r.searchedAs)).toBe(expectedNote(REPORT.query, `${REPORT.kosha}(CAS ${REPORT.cas})`, REPORT.kosha));
    expect(searchedAsNote(REPORT.query, r.searchedAs)).toBe(`${REPORT.query} → ${REPORT.kosha}(CAS ${REPORT.cas})로 찾았어요`);
    expect(st.calls).toEqual([
      { cnd: "1", wrd: REPORT.cas },
      { cnd: "0", wrd: REPORT.query },
    ]);
  });

  it("합치기: 앞 차례 먼저 · 같은 chemId 는 처음 것만 · searchedAs = 결과가 처음 나온 차례 (앞 차례 0개면 다음)", async () => {
    const etoh = "64-17-5";
    st.answers.set(`cas:${etoh}`, []); // (1) 0개
    st.answers.set(`cas:${REPORT.cas}`, [{ id: "000010", name: "염화수소 A" }, { id: "000011", name: "염화수소 B" }]); // (2)
    st.answers.set("name:염산", [{ id: "000011", name: "중복" }, { id: "000012", name: "염산 C" }]); // (3)
    const { combinedMsdsSearch } = await loadSearch();
    const r = await combinedMsdsSearch("염산", etoh);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ids(r.candidates)).toEqual(["000010", "000011", "000012"]);
    expect(r.candidates[1].name, "중복은 앞 차례 것").toBe("염화수소 B");
    expect(r.searchedAs, "CAS 차례 첫 후보 물질명 + (CAS 검색 CAS — 후보 CAS 없음)").toBe(`염화수소 A(CAS ${REPORT.cas})`);
    expect(st.calls.map((c) => `${c.cnd}:${c.wrd}`)).toEqual([`1:${etoh}`, `1:${REPORT.cas}`, "0:염산"]);
  });

  it("원래 이름에서만 나오면 searchedAs = 원래 이름 (안내 줄 없음)", async () => {
    st.answers.set("name:없는물질zz", [{ id: "000020", name: "없는물질zz" }]);
    const { combinedMsdsSearch } = await loadSearch();
    const r = await combinedMsdsSearch("없는물질zz");
    expect(r).toMatchObject({ ok: true, searchedAs: "없는물질zz" });
    expect(searchedAsNote("없는물질zz", r.ok ? r.searchedAs : null)).toBeNull();
  });

  it(`합친 후보 최대 ${CAND_MAX}: 앞 차례 후보부터 채운다`, async () => {
    st.answers.set(`cas:${REPORT.cas}`, items("가", 100, CAND_MAX - 2));
    st.answers.set(`name:${REPORT.query}`, items("나", 200, CAND_MAX));
    const { combinedMsdsSearch } = await loadSearch();
    const r = await combinedMsdsSearch(REPORT.query);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates).toHaveLength(CAND_MAX);
    expect(ids(r.candidates)).toEqual([...ids(items("가", 100, CAND_MAX - 2).map((i) => ({ chemId: i.id }))), "000200", "000201"]);
  });

  it(`(4) 정리한 이름: 앞 차례가 모두 0개 · 실패 없음일 때만 → searchedAs = 정리한 이름 · 호출 ${CALLS_MAX}회 이하`, async () => {
    st.answers.set("name:없는물질zz", [{ id: "000030", name: "없는물질zz" }]);
    const { combinedMsdsSearch } = await loadSearch();
    const r = await combinedMsdsSearch("0.1M 없는물질zz 용액");
    expect(r).toMatchObject({ ok: true, searchedAs: "없는물질zz" });
    expect(r.ok && ids(r.candidates)).toEqual(["000030"]);
    expect(st.calls.map((c) => c.wrd)).toEqual(["0.1M 없는물질zz 용액", "없는물질zz"]);
    expect(searchedAsNote("0.1M 없는물질zz 용액", r.ok ? r.searchedAs : null)).toBe(expectedNote("0.1M 없는물질zz 용액", "없는물질zz"));
  });

  it(`최대 ${CALLS_MAX}회: cas 인자 · 표 CAS · 원래 이름 · 정리한 이름 모두 0개 → 정확히 ${CALLS_MAX}회 · 0개 200 (searchedAs = 원래 검색어)`, async () => {
    const { combinedMsdsSearch } = await loadSearch();
    const r = await combinedMsdsSearch(REPORT.query, "64-17-5");
    expect(r).toEqual({ ok: true, candidates: [], searchedAs: REPORT.query });
    expect(st.calls).toHaveLength(CALLS_MAX);
    expect(st.calls.map((c) => `${c.cnd}:${c.wrd}`)).toEqual(["1:64-17-5", `1:${REPORT.cas}`, `0:${REPORT.query}`, "0:염산"]);
  });

  it("(4) 안 부름: 앞 차례에서 후보가 나오면", async () => {
    st.answers.set(`name:${REPORT.query}`, [{ id: "000040", name: "x" }]);
    const { combinedMsdsSearch } = await loadSearch();
    await combinedMsdsSearch(REPORT.query);
    expect(st.calls.map((c) => c.wrd)).not.toContain("염산");
    expect(st.calls).toHaveLength(2);
  });

  it("(4) 안 부름: 앞 차례 중 하나라도 실패하고 나머지 0개 → 실패(upstream) · 정리한 이름 호출 없음", async () => {
    st.answers.set(`cas:${REPORT.cas}`, "fail");
    const { combinedMsdsSearch } = await loadSearch();
    const r = await combinedMsdsSearch(REPORT.query);
    expect(r).toEqual({ ok: false, code: "upstream" });
    expect(st.calls.map((c) => c.wrd)).toEqual([REPORT.cas, REPORT.query]);
  });

  it("부분 실패 + 다른 차례 후보 → ok (후보 돌려줌)", async () => {
    st.answers.set(`cas:${REPORT.cas}`, "net");
    st.answers.set(`name:${REPORT.query}`, [{ id: "000050", name: "묽은 염산 표본" }]);
    const { combinedMsdsSearch } = await loadSearch();
    const r = await combinedMsdsSearch(REPORT.query);
    expect(r).toMatchObject({ ok: true, searchedAs: REPORT.query });
    expect(r.ok && ids(r.candidates)).toEqual(["000050"]);
  });

  it("전부 실패: 오류 → upstream · 시간 초과 → timeout (route 는 502) · 키 없음 → no-key (route 는 503) · 결과에 키·외부 주소 없음", async () => {
    st.answers.set(`cas:${REPORT.cas}`, "fail");
    st.answers.set(`name:${REPORT.query}`, "fail");
    let m = await loadSearch();
    const r1 = await m.combinedMsdsSearch(REPORT.query);
    expect(r1).toEqual({ ok: false, code: "upstream" });
    for (const s of [FAKE_KEY, EXTERNAL_HOST, "serviceKey"]) expect(JSON.stringify(r1)).not.toContain(s);

    st.answers.set(`cas:${REPORT.cas}`, "timeout");
    st.answers.set(`name:${REPORT.query}`, "timeout");
    const r2 = await m.combinedMsdsSearch(REPORT.query);
    expect(r2.ok).toBe(false);
    expect(!r2.ok && r2.code).toBe("timeout");

    delete process.env[KEY_NAME];
    vi.resetModules();
    st.calls.length = 0;
    m = await loadSearch();
    expect(await m.combinedMsdsSearch(REPORT.query)).toEqual({ ok: false, code: "no-key" });
    expect(st.calls, "키 없음 → 외부 요청 0").toHaveLength(0);
  });

  it("하루 캐시: 처음엔 cachedCombined = null → 검색 뒤 같은 결과 · 다시 검색해도 외부 요청 없음 · 실패한 차례가 있으면 null", async () => {
    st.answers.set(`cas:${REPORT.cas}`, [{ id: "000060", name: REPORT.kosha, cas: REPORT.cas }]);
    const m = await loadSearch();
    expect(m.cachedCombinedMsdsSearch(REPORT.query)).toBeNull();
    const r = await m.combinedMsdsSearch(REPORT.query);
    const n = st.calls.length;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(m.cachedCombinedMsdsSearch(REPORT.query)).toEqual({ candidates: r.candidates, searchedAs: r.searchedAs });
    expect(await m.combinedMsdsSearch(REPORT.query)).toEqual(r);
    expect(st.calls.length, "캐시 → 외부 요청 없음").toBe(n);
    // cas 인자가 붙으면 새 차례(캐시 없음) → null
    expect(m.cachedCombinedMsdsSearch(REPORT.query, "64-17-5")).toBeNull();

    // 실패는 캐시하지 않는다
    st.answers.set("name:없는물질zz", "fail");
    await m.combinedMsdsSearch("없는물질zz");
    expect(m.cachedCombinedMsdsSearch("없는물질zz")).toBeNull();
  });

  it("하루 캐시: 앞 차례가 모두 0개로 캐시돼도 (4) 가 캐시에 없으면 null", async () => {
    const m = await loadSearch();
    const kosha = await import("../../lib/server/kosha-msds");
    await kosha.searchMsds(REPORT.cas);
    await kosha.searchMsds(REPORT.query);
    expect(m.cachedCombinedMsdsSearch(REPORT.query), "(4) 정리한 이름 캐시 없음").toBeNull();
    await kosha.searchMsds("염산");
    expect(m.cachedCombinedMsdsSearch(REPORT.query)).toEqual({ candidates: [], searchedAs: REPORT.query });
  });
});

// =====================================================================
// route — cas 인자 · 응답 모양 (접근 검사는 대체, 가짜 fetch)
// =====================================================================
// 주의: vi.mock 으로 바꾼 모듈(@/lib/server/kosha-msds 등)은 resetModules 뒤에도 남아 하루 캐시가 테스트 사이에 남는다 — 테스트마다 다른 검색어를 쓴다.
describe("[N2][S*] GET /api/msds/search?q=&cas= (route — 가짜 fetch · 가짜 키)", () => {
  const st = useFakeKosha();
  beforeEach(() => {
    access.kind = "ok";
    access.userId = `u-${Math.random()}`;
  });

  const call = async (qs: Record<string, string>) => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../../app/api/msds/search/route");
    const res = await GET(new NextRequest(`http://localhost/api/msds/search?${new URLSearchParams(qs)}`));
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text) as Record<string, unknown> };
  };
  const safe = (text: string) => {
    for (const s of [FAKE_KEY, EXTERNAL_HOST, KEY_NAME, "serviceKey", "data.go.kr"]) expect(text).not.toContain(s);
    expect(BANNED.filter((t) => text.toLowerCase().includes(t.toLowerCase()))).toEqual([]);
  };

  it(`cas 인자(시약 CAS)를 (1) 로 먼저 찾는다 · 응답 = { candidates, searchedAs }`, async () => {
    st.answers.set("cas:111-11-1", [{ id: "000070", name: "라우트물질A", cas: "111-11-1" }]);
    const r = await call({ q: "라우트물질A 특급", cas: "111-11-1" });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(["candidates", "searchedAs"]);
    expect(r.body.searchedAs).toBe("라우트물질A(CAS 111-11-1)");
    expect(st.calls[0]).toEqual({ cnd: "1", wrd: "111-11-1" });
    safe(r.text);
  });

  it("cas 가 CAS 꼴이 아니면 무시 (400 아님 · CAS 검색 없음): 글자 · 일부 · 뒤에 글자 · 너무 긺 · 빈 값", async () => {
    for (const [i, bad] of ["abc", "7647-01", "7647-01-0;x", `${"1".repeat(20)}-01-0`, ""].entries()) {
      st.calls.length = 0;
      const q = `라우트무시${i}`;
      const r = await call({ q, cas: bad });
      expect(r.status, `cas=${bad} → 200`).toBe(200);
      expect(st.calls, `cas=${bad} → 이름 검색만`).toEqual([{ cnd: "0", wrd: q }]);
      expect(r.body).toEqual({ candidates: [], searchedAs: q });
    }
  });

  it("기존 순서 유지: 로그인 없음 401 → 학생 403 → q 잘못 400 → (cas 와 상관없이)", async () => {
    access.kind = "signed-out";
    expect((await call({ q: "", cas: "64-17-5" })).status).toBe(401);
    access.kind = "forbidden";
    expect((await call({ q: "", cas: "64-17-5" })).status).toBe(403);
    access.kind = "ok";
    for (const q of ["", "   ", "가".repeat(200)]) expect((await call({ q, cas: "64-17-5" })).status, `q=${q.slice(0, 5)}`).toBe(400);
    expect(st.calls, "외부 요청 0").toEqual([]);
  });

  it("전부 실패 → 502 upstream · 키 없음 → 503 no-key (cas 가 있어도) · 응답에 키·외부 주소 없음", async () => {
    st.answers.set("cas:222-22-2", "fail");
    st.answers.set("name:라우트실패", "fail");
    const r = await call({ q: "라우트실패", cas: "222-22-2" });
    expect(r.status).toBe(502);
    expect(r.body.code).toBe("upstream");
    safe(r.text);
    delete process.env[KEY_NAME];
    st.calls.length = 0;
    const r2 = await call({ q: "라우트실패", cas: "222-22-2" });
    expect(r2.status).toBe(503);
    expect(r2.body.code).toBe("no-key");
    expect(st.calls).toEqual([]);
    safe(r2.text);
  });

  it("부분 실패 + 후보 → 200", async () => {
    st.answers.set("cas:333-33-3", "fail");
    st.answers.set("name:라우트부분", [{ id: "000080", name: "라우트부분" }]);
    const r = await call({ q: "라우트부분", cas: "333-33-3" });
    expect(r.status).toBe(200);
    expect(r.body.searchedAs).toBe("라우트부분");
  });
});
