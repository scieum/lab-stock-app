// 영문 문서 → 한국어 시약명: Gemini 프롬프트·스키마·추출 결과 (harness/d7-data.md §27, §13·§21).
// 실제 Gemini 는 부르지 않는다. fetch 를 가로채 보내려던 요청 본문(프롬프트·responseSchema)을 보고,
// 가짜 응답(영어 문서 결과)을 돌려 extractManualUsage·extractDocumentIntake 결과를 본다.
// 키는 가짜 표식만 넣고 끝나면 원래 환경으로 되돌린다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const FAKE_KEY = "test-placeholder-not-a-key";
const NACL = "7647-14-5";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = FAKE_KEY;
});
afterEach(() => {
  if (saved === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = saved;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Sent = { prompt: string; schema: { properties: { items: { items: { properties: Record<string, { type: string; nullable?: boolean }>; required: string[]; propertyOrdering?: string[] } } } } };

function stubGemini(answer: unknown): { sent: () => Sent; calls: () => number } {
  let body: string | null = null;
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      calls += 1;
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return {
    calls: () => calls,
    sent: () => {
      expect(body, "요청 본문").not.toBeNull();
      const parsed = JSON.parse(body!) as { contents: { parts: { text?: string }[] }[]; generationConfig: { responseSchema: Sent["schema"] } };
      return {
        prompt: parsed.contents.flatMap((c) => c.parts).map((p) => p.text ?? "").join("\n"),
        schema: parsed.generationConfig.responseSchema,
      };
    },
  };
}

const PDF = { bytes: new Uint8Array([37, 80, 68, 70]), mimeType: "application/pdf" };

async function manualSent(answer: unknown = { items: [] }) {
  const s = stubGemini(answer);
  const { extractManualUsage } = await import("../../lib/server/gemini");
  const result = await extractManualUsage(PDF);
  return { ...s.sent(), result, calls: s.calls() };
}
async function docSent(answer: unknown = { docDate: null, items: [] }) {
  const s = stubGemini(answer);
  const { extractDocumentIntake } = await import("../../lib/server/gemini");
  const result = await extractDocumentIntake(PDF);
  return { ...s.sent(), result, calls: s.calls() };
}

const lineOf = (prompt: string, re: RegExp) => prompt.split("\n").find((l) => re.test(l)) ?? "";

for (const [screen, label, load] of [
  [5, "매뉴얼", manualSent],
  [7, "서류", docSent],
] as const) {
  describe(`${label} 추출 프롬프트·스키마 (d7 §27)`, () => {
    it(`[K1][S${screen}] name 규칙: 한국어 시약명 · 한국어 문서는 그대로 · 영어 문서는 국문 이름(d7 예 염화나트륨·에탄올)`, async () => {
      const { prompt, calls } = await load();
      expect(calls).toBe(1);
      const rule = lineOf(prompt, /^\s*1\.\s*name/);
      expect(rule, "name 규칙 줄").not.toBe("");
      expect(rule).toMatch(/한국어/);
      expect(rule).toMatch(/그대로/);
      expect(rule).toMatch(/영어/);
      expect(rule).toMatch(/Sodium chloride(?: \d+ ?g)?\s*→\s*염화나트륨/);
      expect(rule).toMatch(/Ethanol\s*→\s*에탄올/);
      expect(rule).toMatch(/Hydrochloric acid 0\.1 M\s*→\s*묽은 염산\(0\.1M\)/);
      // 농도·규격 숫자·단위 유지
      expect(rule).toMatch(/숫자와 단위는 바꾸지 않/);
    });

    it(`[K1][S${screen}] originalName 규칙: 원래 표기 그대로, 한국어이거나 같으면 null`, async () => {
      const { prompt } = await load();
      const rule = lineOf(prompt, /originalName/);
      expect(rule, "originalName 규칙 줄").not.toBe("");
      expect(rule).toMatch(/그대로/);
      expect(rule).toMatch(/한국어/);
      expect(rule).toMatch(/null/);
    });

    it(`[K1][S${screen}] cas 규칙: 문서에 적혀 있을 때만, 없으면 null, 추측 금지`, async () => {
      const { prompt } = await load();
      const rule = lineOf(prompt, /\bcas\b/);
      expect(rule, "cas 규칙 줄").not.toBe("");
      expect(rule).toMatch(/적혀 있을 때만/);
      expect(rule).toMatch(/null/);
      expect(rule).toMatch(/추측/);
      expect(rule).toMatch(/않/);
    });

    it(`[K1][S${screen}] 문서 안 지시문 무시 문구 유지`, async () => {
      const { prompt } = await load();
      expect(prompt).toMatch(/지시·명령/);
      expect(lineOf(prompt, /지시·명령/)).toMatch(/무시|따르지 말|따르지 않/);
    });

    it(`[K1][S${screen}] 응답 스키마: items 의 name·originalName(nullable)·cas(nullable) 가 필수 필드`, async () => {
      const { schema } = await load();
      const item = schema.properties.items.items;
      expect(item.properties.name.type).toBe("STRING");
      expect(item.properties.originalName).toEqual({ type: "STRING", nullable: true });
      expect(item.properties.cas).toEqual({ type: "STRING", nullable: true });
      for (const k of ["name", "originalName", "cas"]) expect(item.required, k).toContain(k);
      if (item.propertyOrdering) for (const k of ["name", "originalName", "cas"]) expect(item.propertyOrdering, k).toContain(k);
    });
  });
}

describe("서류 프롬프트 단위 글자 (d7 §27)", () => {
  it("[K1][S7] quantityUnit 규칙: bottle → 병, EA → 개", async () => {
    const { prompt } = await docSent();
    const rule = lineOf(prompt, /quantityUnit/);
    expect(rule).toMatch(/bottle[^\n]*병/);
    expect(rule).toMatch(/EA[^\n]*개/);
  });
});

describe("영어 문서 결과를 가로챈 추출 (d7 §27 서버 정규화)", () => {
  it("[K1][S5] extractManualUsage: 영문 이름 → 한국어, originalName·맞는 cas 만 남김", async () => {
    const { result } = await manualSent({
      items: [
        { name: "Sodium chloride", originalName: null, cas: NACL, amount: 5, unit: "g" },
        { name: "묽은 염산(0.1M)", originalName: "Hydrochloric acid 0.1 M", cas: "7647-01-1", amount: 20, unit: "mL" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]).toMatchObject({ name: "염화나트륨", originalName: "Sodium chloride", cas: NACL });
    expect(result.items[1]).toMatchObject({ name: "묽은 염산(0.1M)", originalName: "Hydrochloric acid 0.1 M" });
    expect(result.items[1].cas ?? null).toBeNull();
  });

  it("[K1][S7] extractDocumentIntake: 영문 품명 → 한국어, originalName·cas 키가 있고 bottle → 병", async () => {
    const { result } = await docSent({
      docDate: "2026-10-01",
      items: [
        { name: "Ethanol 500mL", originalName: null, cas: `CAS ${"64-17-5"}`, spec: "500 mL", specAmount: 500, specUnit: "mL", quantity: 2, quantityUnit: "bottle", isReagent: true, suggestedClass: null },
        { name: "염산", originalName: null, cas: null, spec: null, specAmount: null, specUnit: null, quantity: 1, quantityUnit: "EA", isReagent: true, suggestedClass: null },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [a, b] = result.extraction.items;
    expect(a.name).toContain("에탄올");
    expect(a.originalName).toBe("Ethanol 500mL");
    expect(a.cas).toBe("64-17-5");
    expect(a.quantityUnit).toBe("병");
    expect(b).toHaveProperty("originalName", null);
    expect(b).toHaveProperty("cas", null);
    expect(b.quantityUnit).toBe("개");
  });
});
