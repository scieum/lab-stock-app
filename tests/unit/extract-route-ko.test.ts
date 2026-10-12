// 추출 API 응답 항목의 originalName·cas (harness/d7-data.md §27, §13·§21) — 라우트 처리기를 직접 부른다.
// 로그인·역할은 getManualAccess 를 가짜로 바꾸고, Gemini 는 fetch 를 가로채 영어 문서 결과를 돌려준다(실제 호출 없음).
// 권한 거부·키 없음 순서(학생 403 · 키 없음 503 — Gemini 를 부르지 않음)도 함께 확인한다. 실제 권한(RLS·세션)은 e2e
// (tests/e2e/screen-5-extract-api.spec.ts · api-intake-extract.spec.ts) 가 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Access = { kind: "ok"; userId: string } | { kind: "signed-out" } | { kind: "forbidden" } | { kind: "unavailable" };
const access: { value: Access } = { value: { kind: "ok", userId: "teacher-a" } };

vi.mock("@/lib/supabase/manual", () => ({ getManualAccess: async () => access.value }));
vi.mock("@/lib/server/gemini", () => import("../../lib/server/gemini"));
vi.mock("@/lib/rate-limit", () => import("../../lib/rate-limit"));
vi.mock("@/lib/manual-rules", () => import("../../lib/manual-rules"));
vi.mock("@/lib/doc-intake-rules", () => import("../../lib/doc-intake-rules"));

const FAKE_KEY = "test-placeholder-not-a-key";
const NACL = "7647-14-5";
let saved: string | undefined;
let fetchCalls = 0;

function stubGemini(answer: unknown) {
  fetchCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = FAKE_KEY;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  if (saved === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = saved;
  access.value = { kind: "ok", userId: "teacher-a" };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

let userSeq = 0;
function pdfRequest(url: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", new File([PDF_BYTES], "doc.pdf", { type: "application/pdf" }));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return new Request(url, { method: "POST", body: form }) as unknown as import("next/server").NextRequest;
}
function freshUser() {
  // 호출 제한(사용자당 분당 5회)에 걸리지 않게 테스트마다 다른 사용자
  userSeq += 1;
  access.value = { kind: "ok", userId: `teacher-${userSeq}` };
}

describe("POST /api/manual/extract 응답 (d7 §13·§27)", () => {
  it("[K1][S5] 영어 문서 결과: 항목마다 name(한국어)·originalName·cas 키 — 값이 없으면 null", async () => {
    freshUser();
    stubGemini({
      items: [
        { name: "Sodium chloride", originalName: null, cas: NACL, amount: 5, unit: "g" },
        { name: "Zylotrexamine", originalName: null, cas: null, amount: 1, unit: "g" },
        { name: "에탄올", originalName: "에탄올", cas: "64-17-6", amount: 10, unit: "mL" },
      ],
    });
    const { POST } = await import("../../app/api/manual/extract/route");
    const res = await POST(pdfRequest("http://localhost/api/manual/extract", { groups: "6" }));
    expect(res.status).toBe(200);
    expect(fetchCalls).toBe(1);
    const body = (await res.json()) as { ok: boolean; items: Record<string, unknown>[] };
    expect(body.ok).toBe(true);
    for (const it of body.items) {
      expect(it).toHaveProperty("originalName");
      expect(it).toHaveProperty("cas");
    }
    expect(body.items[0]).toMatchObject({ name: "염화나트륨", originalName: "Sodium chloride", cas: NACL, amount: 5, unit: "g" });
    expect(body.items[1]).toMatchObject({ name: "Zylotrexamine", originalName: null, cas: null });
    // 검사 숫자가 틀린 cas(추측값)·이름과 같은 originalName 은 null
    expect(body.items[2]).toMatchObject({ name: "에탄올", originalName: null, cas: null });
  });

  it("[R-db][S5] 학생은 403 — Gemini 를 부르지 않는다", async () => {
    stubGemini({ items: [] });
    access.value = { kind: "forbidden" };
    const { POST } = await import("../../app/api/manual/extract/route");
    const res = await POST(pdfRequest("http://localhost/api/manual/extract", { groups: "6" }));
    expect(res.status).toBe(403);
    expect(fetchCalls).toBe(0);
  });

  it("[N2][S5] 키 없는 서버는 503 no-key — Gemini 를 부르지 않는다", async () => {
    freshUser();
    stubGemini({ items: [] });
    delete process.env.GEMINI_API_KEY;
    const { POST } = await import("../../app/api/manual/extract/route");
    const res = await POST(pdfRequest("http://localhost/api/manual/extract", { groups: "6" }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("no-key");
    expect(fetchCalls).toBe(0);
  });
});

describe("POST /api/intake/extract 응답 (d7 §21·§27)", () => {
  const item = { spec: "500 g", specAmount: 500, specUnit: "g", quantity: 1, isReagent: true, suggestedClass: null };

  it("[K1][S7] 영어 서류 결과: 항목마다 originalName·cas 키 (없으면 null), 한국어 품명·bottle → 병", async () => {
    freshUser();
    stubGemini({
      docDate: "2026-10-01",
      items: [
        { ...item, name: "Sodium chloride 500g", originalName: null, cas: `CAS No. ${NACL}`, quantityUnit: "bottle" },
        { ...item, name: "염산", originalName: null, cas: null, quantityUnit: "EA" },
      ],
    });
    const { POST } = await import("../../app/api/intake/extract/route");
    const res = await POST(pdfRequest("http://localhost/api/intake/extract"));
    expect(res.status).toBe(200);
    expect(fetchCalls).toBe(1);
    const body = (await res.json()) as { ok: boolean; docDate: string | null; items: Record<string, unknown>[] };
    expect(body.ok).toBe(true);
    expect(body.docDate).toBe("2026-10-01");
    for (const it of body.items) {
      expect(it).toHaveProperty("originalName");
      expect(it).toHaveProperty("cas");
    }
    expect(String(body.items[0].name)).toContain("염화나트륨");
    expect(body.items[0]).toMatchObject({ originalName: "Sodium chloride 500g", cas: NACL, quantityUnit: "병" });
    expect(body.items[1]).toMatchObject({ name: "염산", originalName: null, cas: null, quantityUnit: "개" });
  });

  it("[R-db][S7] 학생은 403, 비로그인은 401 — Gemini 를 부르지 않는다", async () => {
    stubGemini({ docDate: null, items: [] });
    const { POST } = await import("../../app/api/intake/extract/route");
    access.value = { kind: "forbidden" };
    expect((await POST(pdfRequest("http://localhost/api/intake/extract"))).status).toBe(403);
    access.value = { kind: "signed-out" };
    expect((await POST(pdfRequest("http://localhost/api/intake/extract"))).status).toBe(401);
    expect(fetchCalls).toBe(0);
  });

  it("[N2][S7] 키 없는 서버는 503 no-key — Gemini 를 부르지 않는다", async () => {
    freshUser();
    stubGemini({ docDate: null, items: [] });
    delete process.env.GEMINI_API_KEY;
    const { POST } = await import("../../app/api/intake/extract/route");
    const res = await POST(pdfRequest("http://localhost/api/intake/extract"));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("no-key");
    expect(fetchCalls).toBe(0);
  });
});
