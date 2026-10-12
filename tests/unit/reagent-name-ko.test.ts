// 영문 문서 → 한국어 시약명 (harness/d7-data.md §27, §13·§21).
// 기대값 출처: d7 §27 — AI 출력(name 한국어, originalName = 문서 표기 | null(한국어이거나 같으면), cas = 문서에 보인 CAS | null, 추측 금지),
//   이름 정리(서버: 한글 없는 영문 이름 → 학교 상용 이름 표·CAS, 못 찾으면 영문 그대로), 단위 글자 bottle·ea → 병·개,
//   시약 연결 순서 (1) 한국어 name 열쇠 → (2) cas ↔ cas_no → (3) originalName 열쇠 → 기존 포함 관계, 화면 5 중복 합치기 열쇠 = 한국어 name.
//   d7 예: Sodium chloride → 염화나트륨, Hydrochloric acid 0.1 M → (묽은) 염산(0.1M), Ethanol → 에탄올.
// CAS 검사 숫자는 CAS 정의(뒤에서부터 자리 × 1,2,3… 합 mod 10)로 이 파일에서 따로 계산한다.
// 실제 Gemini 호출 없음.
import { describe, expect, it } from "vitest";
import { cleanCas, localizeReagentName } from "../../lib/reagent-name-ko";
import { parseDocIntakeResponse, parseUsageResponse } from "../../lib/server/gemini-response";
import {
  buildDocRows,
  matchDocReagent,
  normalizeDocItem,
  normalizeQuantityUnit,
  type DocExtraction,
  type DocReagent,
} from "../../lib/doc-intake-rules";
import { matchReagent, normalizeExtraction, type ManualReagent } from "../../lib/manual-rules";

const HANGUL = /[가-힣]/;
const MAX = 80;

/** CAS 정의대로 검사 숫자 계산 (구현과 따로) */
function casCheckDigit(body: string): number {
  const digits = body.replace(/-/g, "");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * (i + 1);
  return sum % 10;
}
const HCL = "7647-01-0";
const NACL = "7647-14-5";
const wrongDigit = (cas: string) => {
  const [a, b] = cas.split("-");
  return `${a}-${b}-${(casCheckDigit(`${a}-${b}`) + 1) % 10}`;
};

/** generateContent 응답 모양 */
function geminiBody(json: unknown) {
  return { candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(json) }] }, finishReason: "STOP" }] };
}

describe("cleanCas — 형식·검사 숫자 (d7 §27 cas 검사)", () => {
  it("[K1][S*] 전제: 테스트에 쓰는 CAS 는 정의상 검사 숫자가 맞다", () => {
    expect(casCheckDigit("7647-01")).toBe(0);
    expect(casCheckDigit("7647-14")).toBe(5);
  });

  it("[K1][S*] 맞는 CAS 는 그대로, 앞뒤 공백 제거", () => {
    expect(cleanCas(HCL)).toBe(HCL);
    expect(cleanCas(`  ${NACL} `)).toBe(NACL);
  });

  it("[K1][S*] 앞에 붙은 'CAS'·'CAS No.:'·'CAS 번호' 표기는 떼고 값만", () => {
    expect(cleanCas(`CAS ${HCL}`)).toBe(HCL);
    expect(cleanCas(`CAS No.: ${NACL}`)).toBe(NACL);
    expect(cleanCas(`cas no ${NACL}`)).toBe(NACL);
    expect(cleanCas(`CAS 번호: ${HCL}`)).toBe(HCL);
  });

  it("[K1][S*] 전각 숫자도 반각으로 읽는다", () => {
    expect(cleanCas("７６４７-０１-０")).toBe(HCL);
  });

  it("[K1][S*] 검사 숫자가 틀린 값(추측·오타)은 null", () => {
    expect(cleanCas(wrongDigit(HCL))).toBeNull();
    expect(cleanCas(wrongDigit(NACL))).toBeNull();
    expect(cleanCas(`CAS ${wrongDigit(HCL)}`)).toBeNull();
  });

  it("[K1][S*] 형식이 아닌 값은 null (하이픈 없음·글자·빈 값·숫자형·null)", () => {
    for (const v of ["7647010", "76470-1-0", "unknown", "N/A", "", "   ", "CAS", null, undefined, 7647010, {}]) {
      expect(cleanCas(v), String(v)).toBeNull();
    }
  });
});

describe("localizeReagentName — 서버 이름 정리 (d7 §27)", () => {
  it("[K1][S*] d7 예: Sodium chloride → 염화나트륨, Ethanol → 에탄올 (원래 영문은 originalName)", () => {
    expect(localizeReagentName("Sodium chloride", null, null, MAX)).toEqual({
      name: "염화나트륨",
      originalName: "Sodium chloride",
      cas: null,
    });
    expect(localizeReagentName("Ethanol", null, null, MAX)).toEqual({ name: "에탄올", originalName: "Ethanol", cas: null });
  });

  it("[K1][S*] d7 예: Hydrochloric acid 0.1 M → 염산 + 농도 숫자·단위 그대로 괄호 (0.1M)", () => {
    const r = localizeReagentName("Hydrochloric acid 0.1 M", null, null, MAX);
    expect(r.name).toMatch(/^(?:묽은 )?염산\(0\.1M\)$/);
    expect(r.originalName).toBe("Hydrochloric acid 0.1 M");
  });

  it("[K1][S*] 화학식 이름도: Ca(OH)2 → 수산화칼슘, NaCl → 염화나트륨", () => {
    expect(localizeReagentName("Ca(OH)2", null, null, MAX).name).toBe("수산화칼슘");
    expect(localizeReagentName("NaCl", null, null, MAX).name).toBe("염화나트륨");
  });

  it("[K1][S*] dilute → '묽은 ', concentrated → '진한 ' (말만 한국어로)", () => {
    expect(localizeReagentName("dilute sulfuric acid", null, null, MAX).name).toBe("묽은 황산");
    expect(localizeReagentName("Concentrated nitric acid", null, null, MAX).name).toBe("진한 질산");
  });

  it("[K1][S*] 등급·형태 표기(ACS reagent·powder)는 떼고 찾는다", () => {
    expect(localizeReagentName("Sodium hydroxide pellets, ACS reagent", null, null, MAX).name).toBe("수산화나트륨");
  });

  it("[K1][S*] 이름 표에 없어도 문서의 CAS 가 표에 있으면 그 한국어 이름 (CAS 로 정리)", () => {
    const r = localizeReagentName("Brand XR-5 table salt", null, NACL, MAX);
    expect(r).toEqual({ name: "염화나트륨", originalName: "Brand XR-5 table salt", cas: NACL });
  });

  it("[K1][S*] 못 찾으면 영문 그대로, originalName null (같은 표기를 두 번 보이지 않음)", () => {
    const r = localizeReagentName("Zylotrexamine sulfonate", null, null, MAX);
    expect(r).toEqual({ name: "Zylotrexamine sulfonate", originalName: null, cas: null });
  });

  it("[K1][S*] 검사 숫자가 틀린 CAS 는 버리고 이름 정리에도 쓰지 않는다", () => {
    const r = localizeReagentName("Zylotrexamine sulfonate", null, wrongDigit(NACL), MAX);
    expect(r).toEqual({ name: "Zylotrexamine sulfonate", originalName: null, cas: null });
  });

  it("[K1][S*] AI 가 영문으로 둔 name 이 표에 없으면 originalName 으로 한 번 더 찾는다", () => {
    const r = localizeReagentName("Zylo NaCl brand", "Sodium chloride", null, MAX);
    expect(r.name).toBe("염화나트륨");
    expect(r.originalName).toBe("Sodium chloride");
  });

  it("[K1][S*] 한국어 이름은 그대로 두고 AI 가 준 originalName 은 유지", () => {
    expect(localizeReagentName("염화나트륨", "Sodium chloride", NACL, MAX)).toEqual({
      name: "염화나트륨",
      originalName: "Sodium chloride",
      cas: NACL,
    });
    expect(localizeReagentName("묽은 염산(0.1M)", "Hydrochloric acid 0.1 M", null, MAX)).toEqual({
      name: "묽은 염산(0.1M)",
      originalName: "Hydrochloric acid 0.1 M",
      cas: null,
    });
  });

  it("[K1][S*] 한국어 이름은 이름 표에서 다른 이름으로 바꾸지 않는다 (소금 → 소금)", () => {
    expect(localizeReagentName("소금", null, null, MAX).name).toBe("소금");
    expect(localizeReagentName("염산 HCl", null, null, MAX).name).toBe("염산 HCl");
  });

  it("[K1][S*] originalName 이 한국어이거나 name 과 같으면(공백·대소문자 무시) null, 빈 값·비문자열도 null", () => {
    expect(localizeReagentName("염화나트륨", "염화나트륨", null, MAX).originalName).toBeNull();
    expect(localizeReagentName("염화나트륨", "염화 나트륨", null, MAX).originalName).toBeNull();
    expect(localizeReagentName("Zylotrexamine", "zylotrexamine ", null, MAX).originalName).toBeNull();
    expect(localizeReagentName("염화나트륨", "", null, MAX).originalName).toBeNull();
    expect(localizeReagentName("염화나트륨", 42, null, MAX).originalName).toBeNull();
    expect(localizeReagentName("염화나트륨", null, null, MAX).originalName).toBeNull();
  });

  it("[K1][S*] originalName 은 공백 정리·max 자까지", () => {
    const long = `Sodium   chloride ${"x".repeat(200)}`;
    const r = localizeReagentName("염화나트륨", long, null, MAX);
    expect(r.originalName!.length).toBeLessThanOrEqual(MAX);
    expect(r.originalName!.startsWith("Sodium chloride ")).toBe(true);
  });
});

describe("parseUsageResponse — 화면 5 추출 응답 정규화 (d7 §13·§27)", () => {
  it("[K1][S5] AI 가 영문으로 준 이름 → 한국어 이름 + originalName, 틀린 cas 는 없앰", () => {
    const r = parseUsageResponse(
      geminiBody({
        items: [
          { name: "Sodium chloride", originalName: null, cas: null, amount: 5, unit: "g" },
          { name: "Ethanol", originalName: null, cas: wrongDigit(HCL), amount: 10, unit: "mL" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0]).toMatchObject({ name: "염화나트륨", originalName: "Sodium chloride", amount: 5, unit: "g" });
    expect(r.items[1]).toMatchObject({ name: "에탄올", originalName: "Ethanol", amount: 10, unit: "mL" });
    expect(r.items[1].cas ?? null).toBeNull();
  });

  it("[K1][S5] AI 가 한국어로 준 경우 이름·originalName·맞는 cas 를 그대로 둔다", () => {
    const r = parseUsageResponse(
      geminiBody({ items: [{ name: "묽은 염산(0.1M)", originalName: "Hydrochloric acid 0.1 M", cas: `CAS ${HCL}`, amount: 20, unit: "mL" }] }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0]).toMatchObject({ name: "묽은 염산(0.1M)", originalName: "Hydrochloric acid 0.1 M", cas: HCL });
  });

  it("[K1][S5] 한국어 문서(originalName null·같음, cas null)는 예전과 같은 줄 — 원문·CAS 값 없음", () => {
    const r = parseUsageResponse(
      geminiBody({
        items: [
          { name: "수산화나트륨", originalName: null, cas: null, amount: 2, unit: "g" },
          { name: "에탄올", originalName: "에탄올", cas: "", amount: 1, unit: "mL" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const it of r.items) {
      expect(it.originalName ?? null).toBeNull();
      expect(it.cas ?? null).toBeNull();
    }
    expect(r.items.map((i) => i.name)).toEqual(["수산화나트륨", "에탄올"]);
  });

  it("[K1][S5] 못 찾은 영문 이름은 그대로 (사용자가 고친다)", () => {
    const r = parseUsageResponse(geminiBody({ items: [{ name: "Zylotrexamine", originalName: null, cas: null, amount: 1, unit: "g" }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0].name).toBe("Zylotrexamine");
    expect(r.items[0].originalName ?? null).toBeNull();
  });
});

describe("normalizeDocItem / parseDocIntakeResponse — 화면 7 추출 응답 정규화 (d7 §21·§27)", () => {
  const base = { spec: "500 g", specAmount: 500, specUnit: "g", quantity: 2, isReagent: true, suggestedClass: null };

  it("[K1][S7] AI 가 영문 품명으로 준 경우: 한국어 품명, originalName = 서류 표기, cas 앞 표기 정리, bottle → 병", () => {
    const it = normalizeDocItem({ ...base, name: "Sodium chloride 500g", originalName: null, cas: `CAS No. ${NACL}`, quantityUnit: "bottle" });
    expect(it).not.toBeNull();
    expect(it!.name).toMatch(HANGUL);
    expect(it!.name).toContain("염화나트륨");
    expect(it!.originalName).toBe("Sodium chloride 500g");
    expect(it!.cas).toBe(NACL);
    expect(it!.quantityUnit).toBe("병");
    // 다른 필드는 그대로
    expect(it!).toMatchObject({ spec: "500 g", specAmount: 500, specUnit: "g", quantity: 2, isReagent: true });
  });

  it("[K1][S7] AI 가 한국어로 준 경우 originalName 유지, 같으면 null", () => {
    expect(normalizeDocItem({ ...base, name: "염산 500mL", originalName: "Hydrochloric acid 500mL", cas: null, quantityUnit: "병" })).toMatchObject({
      name: "염산 500mL",
      originalName: "Hydrochloric acid 500mL",
      cas: null,
    });
    expect(normalizeDocItem({ ...base, name: "염산", originalName: "염산", cas: null, quantityUnit: null })!.originalName).toBeNull();
  });

  it("[K1][S7] cas 추측값(검사 숫자 틀림)·형식 아닌 값은 null", () => {
    expect(normalizeDocItem({ ...base, name: "염화나트륨", originalName: null, cas: wrongDigit(NACL), quantityUnit: "EA" })!.cas).toBeNull();
    expect(normalizeDocItem({ ...base, name: "염화나트륨", originalName: null, cas: "unknown", quantityUnit: "EA" })!.cas).toBeNull();
  });

  it("[K1][S7] parseDocIntakeResponse 도 같은 정리 (영문 서류 결과)", () => {
    const r = parseDocIntakeResponse(
      geminiBody({
        docDate: "2026-10-01",
        items: [
          { ...base, name: "Ethanol 500mL", originalName: null, cas: "64-17-5", quantityUnit: "EA" },
          { ...base, name: "Shipping fee", originalName: null, cas: null, quantityUnit: null, isReagent: false },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [eth, fee] = r.extraction.items;
    expect(eth.name).toContain("에탄올");
    expect(eth.originalName).toBe("Ethanol 500mL");
    expect(eth.cas).toBe("64-17-5");
    expect(eth.quantityUnit).toBe("개");
    expect(fee.name).toBe("Shipping fee");
    expect(fee.originalName).toBeNull();
    expect(fee.cas).toBeNull();
  });
});

describe("normalizeQuantityUnit — bottle·ea → 병·개 (d7 §27)", () => {
  it("[K1][S7] bottle 계열 → 병", () => {
    for (const v of ["bottle", "Bottle", "BOTTLES", "btl", " Btl. "]) expect(normalizeQuantityUnit(v), v).toBe("병");
  });
  it("[K1][S7] ea 계열 → 개", () => {
    for (const v of ["ea", "EA", "E.A.", "each", "pcs", "PC", "piece", "Pieces"]) expect(normalizeQuantityUnit(v), v).toBe("개");
  });
  it("[K1][S7] 한국어·그 밖의 단위는 그대로, 빈 값·비문자열은 null", () => {
    expect(normalizeQuantityUnit("병")).toBe("병");
    expect(normalizeQuantityUnit("개")).toBe("개");
    expect(normalizeQuantityUnit("box")).toBe("box");
    for (const v of ["", "   ", null, undefined, 3]) expect(normalizeQuantityUnit(v), String(v)).toBeNull();
  });
});

describe("matchReagent — 연결 순서 (d7 §27: 한국어 열쇠 → cas ↔ cas_no → originalName 열쇠 → 핵심 이름)", () => {
  type R = { id: string; name: string; casNo?: string | null };

  it("[K1][S5] cas 로만 연결되는 경우: 이름이 달라도 cas_no 가 같은 시약 (hints 없으면 연결 없음)", () => {
    const reagents: R[] = [
      { id: "salt", name: "정제 소금 특급", casNo: NACL },
      { id: "hcl", name: "염산", casNo: HCL },
    ];
    expect(matchReagent("Zylo brand", reagents, { cas: NACL })?.id).toBe("salt");
    expect(matchReagent("Zylo brand", reagents)).toBeNull();
  });

  it("[K1][S5] originalName 으로만 연결되는 경우: 우리 학교 시약 이름이 영어 (대소문자·공백 무시)", () => {
    const reagents: R[] = [{ id: "php", name: "Phenolphthalein" }];
    expect(matchReagent("페놀프탈레인", reagents, { originalName: "phenolphthalein " })?.id).toBe("php");
    expect(matchReagent("페놀프탈레인", reagents)).toBeNull();
  });

  it("[K1][S5] 한국어 열쇠가 cas·originalName 보다 우선", () => {
    const reagents: R[] = [
      { id: "byCas", name: "소금 대용", casNo: NACL },
      { id: "byOrig", name: "Sodium chloride" },
      { id: "ko", name: "염화나트륨" },
    ];
    expect(matchReagent("염화나트륨", reagents, { cas: NACL, originalName: "Sodium chloride" })?.id).toBe("ko");
  });

  it("[K1][S5] cas 가 originalName 보다 우선", () => {
    const reagents: R[] = [
      { id: "byOrig", name: "Sodium chloride" },
      { id: "byCas", name: "소금 대용", casNo: NACL },
    ];
    expect(matchReagent("염화나트륨", reagents, { cas: NACL, originalName: "Sodium chloride" })?.id).toBe("byCas");
  });

  it("[K1][S5] cas 가 핵심 이름(꾸밈말 뗀 이름) 일치보다 우선", () => {
    const reagents: R[] = [
      { id: "core", name: "묽은 염산" },
      { id: "byCas", name: "HCl 시약", casNo: HCL },
    ];
    // 전제: hints 없으면 핵심 이름으로 "묽은 염산" 에 연결된다
    expect(matchReagent("염산", reagents)?.id).toBe("core");
    expect(matchReagent("염산", reagents, { cas: HCL })?.id).toBe("byCas");
  });

  it("[K1][S5] cas 가 없으면(null·빈 값) cas_no 가 없는 시약과 엮이지 않는다", () => {
    const reagents: R[] = [
      { id: "n1", name: "무언가", casNo: null },
      { id: "n2", name: "다른것", casNo: "" },
      { id: "n3", name: "또다른것" },
    ];
    expect(matchReagent("Zylo", reagents, { cas: null })).toBeNull();
    expect(matchReagent("Zylo", reagents, { cas: "" })).toBeNull();
  });

  it("[K1][S5] 서버가 정리한 이름 염산(0.1M) 은 우리 학교 '묽은 염산(0.1M)' 에 연결된다", () => {
    const r = localizeReagentName("Hydrochloric acid 0.1 M", null, null, MAX);
    const reagents: R[] = [
      { id: "naoh", name: "수산화나트륨" },
      { id: "hcl", name: "묽은 염산(0.1M)" },
    ];
    expect(matchReagent(r.name, reagents, { cas: r.cas, originalName: r.originalName })?.id).toBe("hcl");
  });
});

describe("matchDocReagent / buildDocRows — 화면 7 연결 (d7 §21·§27)", () => {
  const extraction = (items: object[]): DocExtraction => {
    const r = parseDocIntakeResponse(geminiBody({ docDate: null, items }));
    if (!r.ok) throw new Error("전제: 추출 응답 정리 실패");
    return r.extraction;
  };
  const item = { spec: "500 g", specAmount: 500, specUnit: "g", quantity: 1, quantityUnit: "bottle", isReagent: true, suggestedClass: null };

  it("[K1][S7] cas 로만 연결: 이름 표에 없는 영문 품명 + 서류 CAS → cas_no 같은 시약", () => {
    const reagents: DocReagent[] = [{ id: "salt", name: "정제 소금 특급", unit: "g", casNo: NACL }];
    expect(matchDocReagent({ name: "Zylo brand 500g", originalName: null, cas: NACL }, reagents)?.id).toBe("salt");
    const rows = buildDocRows(extraction([{ ...item, name: "Zylo brand", originalName: null, cas: NACL }]), reagents);
    expect(rows[0].link).toEqual({ kind: "reagent", reagentId: "salt" });
  });

  it("[K1][S7] originalName 으로만 연결: 품명에 붙은 규격을 떼고 영어 이름 시약과", () => {
    const reagents: DocReagent[] = [{ id: "php", name: "Phenolphthalein", unit: "g" }];
    expect(matchDocReagent({ name: "페놀프탈레인 25g", originalName: "Phenolphthalein 25g", cas: null }, reagents)?.id).toBe("php");
  });

  it("[K1][S7] 한국어 품명 열쇠가 우선", () => {
    const reagents: DocReagent[] = [
      { id: "byCas", name: "소금 대용", unit: "g", casNo: NACL },
      { id: "ko", name: "염화나트륨", unit: "g" },
    ];
    expect(matchDocReagent({ name: "염화나트륨 500g", originalName: "Sodium chloride 500g", cas: NACL }, reagents)?.id).toBe("ko");
  });

  it("[K1][S7] 영문 서류 결과: 한국어 이름으로 우리 학교 시약에 연결, 못 찾은 행의 새 시약 이름 기본값 = 한국어 name", () => {
    const reagents: DocReagent[] = [{ id: "nacl", name: "염화나트륨", unit: "g" }];
    const rows = buildDocRows(
      extraction([
        { ...item, name: "Sodium chloride 500g", originalName: null, cas: null },
        { ...item, name: "Ca(OH)2 500g", originalName: null, cas: null },
      ]),
      reagents,
    );
    expect(rows[0].link).toEqual({ kind: "reagent", reagentId: "nacl" });
    expect(rows[1].link).toEqual({ kind: "new" });
    expect(rows[1].newReagent.name).toMatch(HANGUL);
    expect(rows[1].newReagent.name).toContain("수산화칼슘");
  });
});

describe("normalizeExtraction — 화면 5 중복 합치기 열쇠 = 한국어 name (d7 §13·§27)", () => {
  const school: ManualReagent[] = [
    { id: "nacl", name: "염화나트륨", unit: "g", minStock: 0 },
    { id: "brand", name: "Brand salt", unit: "g", minStock: 0, casNo: NACL },
  ];

  it("[K1][S5] 영문 이름과 한국어 이름이 같은 시약이면 한 줄로 합친다 (원문은 처음 행의 것)", () => {
    const rows = normalizeExtraction(
      [
        { name: "Sodium chloride", amount: 5, unit: "g" },
        { name: "염화나트륨", amount: 3, unit: "g" },
        { name: "NaCl", amount: 2, unit: "g" },
      ],
      school,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("염화나트륨");
    expect(rows[0].originalName).toBe("Sodium chloride");
    expect(rows[0].extractedPerGroup).toBe(10);
    expect(rows[0].mergedCount).toBe(3);
    expect(rows[0].reagentId).toBe("nacl");
  });

  it("[K1][S5] 한국어 name 이 다르면 합치지 않는다", () => {
    const rows = normalizeExtraction(
      [
        { name: "Sodium chloride", amount: 5, unit: "g" },
        { name: "Potassium chloride", amount: 3, unit: "g" },
      ],
      school,
    );
    expect(rows.map((r) => r.name)).toEqual(["염화나트륨", "염화칼륨"]);
  });

  it("[K1][S5] 행의 cas 로 연결 (이름으로는 못 찾는 품명), 원문·CAS 가 행에 남는다", () => {
    const rows = normalizeExtraction([{ name: "Zylo brand", cas: `CAS ${NACL}`, amount: 1, unit: "g" }], [school[1]]);
    expect(rows[0].cas).toBe(NACL);
    expect(rows[0].reagentId).toBe("brand");
  });

  it("[K1][S5] 한국어 문서 행은 originalName·cas null", () => {
    const rows = normalizeExtraction([{ name: "염화나트륨", amount: 1, unit: "g" }], school);
    expect(rows[0].originalName ?? null).toBeNull();
    expect(rows[0].cas ?? null).toBeNull();
  });
});
