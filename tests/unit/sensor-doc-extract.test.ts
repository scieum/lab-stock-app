// 센서 서류로 등록 (harness/d7-data.md §28 "센서 추출 API"·"센서 서류 저장 DB", §27 영문 → 한국어, §21 테스트 방식).
// - 응답 정리: lib/sensor-doc-rules normalizeSensorDocItem·normalizeSensorDocExtraction (파스코 계열 → "파스코", Vernier → "버니어",
//   카탈로그 모델 → 종류·한국어 이름·catalog true, 영문 이름 보정 + originalName, 수량·종류 검사)
// - 저장 입력: checkSensorDocInput (1~50, add 수량 1~9999 정수, new = checkSensorInput 과 같은 검사)
// - parseSensorDocResponse (Gemini 응답 → 품목, 0개 = empty)
// - 프롬프트 정적 검사 (지시문 무시, name 한국어, type 27종 = rules sensor.types)
// - lib/no-access (rules no_access.copy)
// - POST /api/sensors/extract 처리기: getManualAccess 를 가짜로, Gemini 는 fetch 가로채기 (실제 호출 없음).
// 기대값은 design/rules.json(sensor.types·makers·no_access) · lib/pasco-catalog(디자인 요청 8 부록, pasco-catalog.test 가 부록과 맞춤)에서 읽는다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rules } from "./helpers";

vi.mock("server-only", () => ({}));

type Access = { kind: "ok"; userId: string } | { kind: "signed-out" } | { kind: "forbidden" } | { kind: "unavailable" };
const access: { value: Access } = { value: { kind: "ok", userId: "teacher-a" } };

vi.mock("@/lib/supabase/manual", () => ({ getManualAccess: async () => access.value }));
vi.mock("@/lib/server/gemini", () => import("../../lib/server/gemini"));
vi.mock("@/lib/rate-limit", () => import("../../lib/rate-limit"));
vi.mock("@/lib/manual-rules", () => import("../../lib/manual-rules"));

import {
  SENSOR_DOC_ITEMS_MAX,
  checkSensorDocInput,
  normalizeSensorDocExtraction,
  normalizeSensorDocItem,
  normalizeSensorMaker,
} from "../../lib/sensor-doc-rules";
import { PASCO_CATALOG, PASCO_MAKER, findPascoModel } from "../../lib/pasco-catalog";
import { SENSOR_QUANTITY_MAX } from "../../lib/sensor-rules";
import { parseSensorDocResponse } from "../../lib/server/gemini-response";
import { NO_ACCESS_TEXT, deniedHomePath, parseDenied } from "../../lib/no-access";

const TYPES: string[] = rules.sensor.types;
const SENSOR_MAKERS: string[] = rules.sensor.makers["센서"];
const VERNIER = SENSOR_MAKERS.find((m) => m === "버니어")!;
const COPY = rules.no_access.copy as { teacher_admin: string; admin: string };
/** d7 §28 "최대 50" */
const DOC_MAX = 50;

const FAKE_KEY = "test-placeholder-not-a-key";
let saved: string | undefined;
let fetchCalls = 0;
let sentBody: string | null = null;

function geminiBody(answer: unknown) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }] };
}

function stubGemini(answer: unknown) {
  fetchCalls = 0;
  sentBody = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: unknown, init?: { body?: unknown }) => {
      fetchCalls += 1;
      sentBody = String(init?.body ?? "");
      return new Response(JSON.stringify(geminiBody(answer)), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
}

beforeEach(() => {
  saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = FAKE_KEY;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  if (saved === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = saved;
  access.value = { kind: "ok", userId: "teacher-a" };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const UUID = "11111111-2222-4333-8444-555555555555";
const pasco = (model: string) => findPascoModel(model)!;
/** 카탈로그에서 첫 번째 모델 (종류가 '온도'가 아닌 것 하나도) */
const CAT_A = PASCO_CATALOG.find((m) => !m.discontinued) ?? PASCO_CATALOG[0];

/* ───────── 응답 정리 ───────── */

describe("normalizeSensorMaker (d7 §28 서버 정규화)", () => {
  it("[R-api][S17] 파스코 계열(PASCO · Pasco Scientific · 파스코 · pasco) → '파스코'", () => {
    for (const m of ["PASCO", "Pasco Scientific", "PASCO scientific", "pasco", "파스코", "  PASCO  "]) {
      expect(normalizeSensorMaker(m), m).toBe(PASCO_MAKER);
    }
    expect(PASCO_MAKER).toBe(SENSOR_MAKERS.find((x) => x === "파스코"));
  });
  it("[R-api][S17] Vernier 영문 → rules makers 의 '버니어', 그 밖은 그대로, 빈 값 null", () => {
    expect(VERNIER).toBeTruthy();
    expect(normalizeSensorMaker("Vernier")).toBe(VERNIER);
    expect(normalizeSensorMaker("Vernier Software & Technology")).toBe(VERNIER);
    expect(normalizeSensorMaker("이지메이커")).toBe("이지메이커");
    expect(normalizeSensorMaker("")).toBeNull();
    expect(normalizeSensorMaker("   ")).toBeNull();
    expect(normalizeSensorMaker(null)).toBeNull();
    expect(normalizeSensorMaker(12)).toBeNull();
  });
});

describe("normalizeSensorDocItem (d7 §28·§27)", () => {
  it("[R-api][S17] 카탈로그 모델(PS-3201, 회사 PASCO) → 회사 파스코 · 모델 카탈로그 표기 · 종류 · 한국어 이름 = 카탈로그 · catalog true", () => {
    const hit = pasco("PS-3201");
    const it1 = normalizeSensorDocItem({
      name: "Wireless Temperature Sensor",
      originalName: null,
      maker: "PASCO scientific",
      model: "ps3201",
      quantity: 3,
      isSensor: true,
      type: null,
    })!;
    expect(it1).toMatchObject({ maker: PASCO_MAKER, model: hit.model, type: hit.type, name: hit.nameKo, catalog: true, quantity: 3 });
    expect(TYPES).toContain(it1.type);
    // 이름을 카탈로그로 바꿨으므로 원문 = AI 의 영문 name
    expect(it1.originalName).toBe("Wireless Temperature Sensor");
  });

  it("[R-api][S17] 카탈로그 모델이면 AI 가 준 종류가 달라도 카탈로그 종류, isSensor false 여도 true", () => {
    const other = TYPES.find((t) => t !== CAT_A.type)!;
    const r = normalizeSensorDocItem({ name: "x sensor", originalName: null, maker: null, model: CAT_A.model, quantity: 1, isSensor: false, type: other })!;
    expect(r).toMatchObject({ maker: PASCO_MAKER, model: CAT_A.model, type: CAT_A.type, name: CAT_A.nameKo, isSensor: true, catalog: true });
  });

  it("[R-api][S17] 다른 회사(Vernier)에 카탈로그 모델 번호 → 카탈로그로 채우지 않는다 (catalog false)", () => {
    const r = normalizeSensorDocItem({ name: "온도 센서", originalName: null, maker: "Vernier", model: "PS-3201", quantity: 1, isSensor: true, type: "온도" })!;
    expect(r.maker).toBe(VERNIER);
    expect(r.catalog).toBe(false);
    expect(r.name).toBe("온도 센서");
  });

  it("[R-api][S17] 카탈로그에 없는 영문 이름 + 종류 → '{무선 }{종류} 센서' 한국어 이름, originalName = 원문", () => {
    const t = TYPES.find((x) => x === "pH")!;
    const r = normalizeSensorDocItem({ name: "Go Direct pH Sensor", originalName: null, maker: "Vernier", model: "GDX-PH", quantity: 2, isSensor: true, type: t })!;
    expect(r.name).toBe(`${t} 센서`);
    expect(r.originalName).toBe("Go Direct pH Sensor");
    expect(r.catalog).toBe(false);
    const w = normalizeSensorDocItem({ name: "Wireless Pressure Sensor", originalName: "Wireless Pressure Sensor", maker: "X", model: null, quantity: 1, isSensor: true, type: "압력" })!;
    expect(w.name).toBe("무선 압력 센서");
    expect(w.originalName).toBe("Wireless Pressure Sensor");
  });

  it("[R-api][S17] 영문 이름에 종류가 없거나 기타면 영문 그대로 (originalName null)", () => {
    const r = normalizeSensorDocItem({ name: "Mystery Box", originalName: null, maker: null, model: null, quantity: 1, isSensor: true, type: null })!;
    expect(r).toMatchObject({ name: "Mystery Box", originalName: null, type: null, catalog: false });
    const g = normalizeSensorDocItem({ name: "Mystery Box", originalName: null, maker: null, model: null, quantity: 1, isSensor: true, type: "기타" })!;
    expect(g.name).toBe("Mystery Box");
  });

  it("[R-api][S17] 한국어 이름은 그대로, 한국어 originalName·name 과 같은 originalName 은 null", () => {
    const r = normalizeSensorDocItem({ name: "무선 온도 센서", originalName: "무선 온도 센서", maker: "이지메이커", model: "EM-1", quantity: 1, isSensor: true, type: "온도" })!;
    expect(r).toMatchObject({ name: "무선 온도 센서", originalName: null });
    const s = normalizeSensorDocItem({ name: "온도 센서", originalName: "온도센서", maker: null, model: null, quantity: 1, isSensor: true, type: "온도" })!;
    expect(s.originalName).toBeNull();
  });

  it("[R-api][S17] 종류: 27종 그대로, 예전 '심박' → '심박·생체', 목록 밖 → null", () => {
    for (const t of TYPES) {
      const r = normalizeSensorDocItem({ name: "센서", originalName: null, maker: null, model: null, quantity: 1, isSensor: true, type: t })!;
      expect(r.type, t).toBe(t);
    }
    const h = normalizeSensorDocItem({ name: "센서", maker: null, model: null, quantity: 1, isSensor: true, type: "심박" })!;
    expect(h.type).toBe(TYPES.find((t) => t.startsWith("심박")));
    expect(TYPES).not.toContain("심박");
    for (const bad of ["산소포화도", "temperature", "", 3, null]) {
      const r = normalizeSensorDocItem({ name: "센서", maker: null, model: null, quantity: 1, isSensor: true, type: bad })!;
      expect(r.type, String(bad)).toBeNull();
    }
  });

  it("[R-api][S17] 수량: 정수 ≥1 · 숫자 글자 · 소수 내림 · 9999 상한 · 그 밖 1", () => {
    const q = (v: unknown) => normalizeSensorDocItem({ name: "센서", type: "온도", quantity: v })!.quantity;
    expect(q(3)).toBe(3);
    expect(q("4")).toBe(4);
    expect(q("1,200")).toBe(1200);
    expect(q(2.7)).toBe(2);
    expect(q(SENSOR_QUANTITY_MAX + 500)).toBe(SENSOR_QUANTITY_MAX);
    for (const bad of [0, -2, null, undefined, "abc", "", Number.NaN]) expect(q(bad), String(bad)).toBe(1);
  });

  it("[R-api][S17] 이름 없는 품목·객체 아닌 값 → null (버림), isSensor 기본 true", () => {
    expect(normalizeSensorDocItem({ name: "", type: "온도" })).toBeNull();
    expect(normalizeSensorDocItem({ name: "   " })).toBeNull();
    expect(normalizeSensorDocItem(null)).toBeNull();
    expect(normalizeSensorDocItem("PS-3201")).toBeNull();
    expect(normalizeSensorDocItem([])).toBeNull();
    expect(normalizeSensorDocItem({ name: "배송비", isSensor: false })!.isSensor).toBe(false);
    expect(normalizeSensorDocItem({ name: "센서" })!.isSensor).toBe(true);
  });
});

describe("normalizeSensorDocExtraction (d7 §28 최대 50)", () => {
  it("[R-api][S17] items 배열이 아니면 null, 이름 빈 품목 버림, 최대 50, docDate 는 실제 날짜만", () => {
    expect(normalizeSensorDocExtraction(null)).toBeNull();
    expect(normalizeSensorDocExtraction({ docDate: null })).toBeNull();
    expect(normalizeSensorDocExtraction({ items: "x" })).toBeNull();
    expect(SENSOR_DOC_ITEMS_MAX).toBe(DOC_MAX);
    const many = Array.from({ length: DOC_MAX + 10 }, (_, i) => ({ name: `센서 ${i}`, type: "온도", quantity: 1, isSensor: true }));
    const r = normalizeSensorDocExtraction({ docDate: "2026-10-01", items: [{ name: "" }, ...many] })!;
    expect(r.items).toHaveLength(DOC_MAX);
    expect(r.items[0].name).toBe("센서 0");
    expect(r.docDate).toBe("2026-10-01");
    expect(normalizeSensorDocExtraction({ docDate: "2026-02-30", items: [] })!.docDate).toBeNull();
    expect(normalizeSensorDocExtraction({ docDate: "10/01/2026", items: [] })!.docDate).toBeNull();
    expect(normalizeSensorDocExtraction({ docDate: null, items: [] })).toEqual({ docDate: null, items: [] });
  });
});

/* ───────── 저장 입력 검사 ───────── */

const NEW_SENSOR = { name: "무선 온도", type: "온도", maker: "파스코", model: "PS-3201", quantity: 2, locationText: "준비실", slotId: null, status: "ok", memo: "" };

describe("checkSensorDocInput (d7 §28 record_sensor_document 입력)", () => {
  it("[R-api][S17] add · new 항목 → DB 항목 모양 (sensor_id·add_quantity / name·type·maker·model·quantity·location_text·slot_id·status·memo)", () => {
    const r = checkSensorDocInput({
      items: [
        { kind: "add", sensorId: UUID, addQuantity: 2 },
        { kind: "new", sensor: { ...NEW_SENSOR, id: "무시되는 값" } },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0]).toEqual({ sensor_id: UUID, add_quantity: 2 });
    expect(r.items[1]).toEqual({
      name: "무선 온도",
      type: "온도",
      maker: "파스코",
      model: "PS-3201",
      quantity: 2,
      location_text: "준비실",
      slot_id: null,
      status: "ok",
      memo: null,
    });
  });

  it("[R-api][S17] 개수 1~50: 0개·51개·items 아님 거부", () => {
    expect(checkSensorDocInput({ items: [] }).ok).toBe(false);
    expect(checkSensorDocInput({}).ok).toBe(false);
    expect(checkSensorDocInput(null).ok).toBe(false);
    const add = { kind: "add", sensorId: UUID, addQuantity: 1 };
    expect(checkSensorDocInput({ items: Array(DOC_MAX).fill(add) }).ok).toBe(true);
    expect(checkSensorDocInput({ items: Array(DOC_MAX + 1).fill(add) }).ok).toBe(false);
  });

  it("[R-api][S17] add: uuid 아닌 id·수량 0·소수·9999 초과·글자 거부 (틀린 순서 index)", () => {
    const good = { kind: "add", sensorId: UUID, addQuantity: 1 };
    for (const bad of [
      { kind: "add", sensorId: "x", addQuantity: 1 },
      { kind: "add", sensorId: UUID, addQuantity: 0 },
      { kind: "add", sensorId: UUID, addQuantity: 1.5 },
      { kind: "add", sensorId: UUID, addQuantity: SENSOR_QUANTITY_MAX + 1 },
      { kind: "add", sensorId: UUID, addQuantity: "2" },
      { kind: "oops", sensorId: UUID, addQuantity: 1 },
    ]) {
      const r = checkSensorDocInput({ items: [good, bad] });
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.index).toBe(1);
    }
    expect(checkSensorDocInput({ items: [{ ...good, addQuantity: SENSOR_QUANTITY_MAX }] }).ok).toBe(true);
  });

  it("[R-api][S17] new: 이름 빈 값·27종 밖 종류·회사 없음·상태 틀림 거부, '심박' → '심박·생체'", () => {
    for (const patch of [{ name: "" }, { type: "산소포화도" }, { maker: "" }, { status: "fine" }, { quantity: -1 }]) {
      const r = checkSensorDocInput({ items: [{ kind: "new", sensor: { ...NEW_SENSOR, ...patch } }] });
      expect(r.ok, JSON.stringify(patch)).toBe(false);
    }
    const h = checkSensorDocInput({ items: [{ kind: "new", sensor: { ...NEW_SENSOR, type: "심박" } }] });
    expect(h.ok).toBe(true);
    if (h.ok) expect((h.items[0] as { type: string }).type).toBe(TYPES.find((t) => t.startsWith("심박")));
  });
});

/* ───────── Gemini 응답 읽기 ───────── */

describe("parseSensorDocResponse (d7 §28)", () => {
  it("[R-api][S17] 정상 응답 → 정리된 품목 (파스코·카탈로그)", () => {
    const r = parseSensorDocResponse(
      geminiBody({ docDate: "2026-09-30", items: [{ name: "Wireless pH Sensor", originalName: null, maker: "PASCO", model: "PS-3204", quantity: 2, isSensor: true, type: "pH" }] }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.extraction.docDate).toBe("2026-09-30");
    expect(r.extraction.items[0]).toMatchObject({ maker: PASCO_MAKER, model: "PS-3204", name: pasco("PS-3204").nameKo, catalog: true });
  });
  it("[R-api][S17] items 0개 → empty, 모양 틀림 → parse, 이름이 모두 빈 품목 → parse, 후보 없음 → 실패", () => {
    const e = parseSensorDocResponse(geminiBody({ docDate: null, items: [] }));
    expect(e).toMatchObject({ ok: false, code: "empty" });
    expect(parseSensorDocResponse(geminiBody({ foo: 1 }))).toMatchObject({ ok: false, code: "parse" });
    expect(parseSensorDocResponse(geminiBody({ docDate: null, items: [{ name: "" }] }))).toMatchObject({ ok: false, code: "parse" });
    expect(parseSensorDocResponse({ candidates: [] }).ok).toBe(false);
    expect(parseSensorDocResponse(null).ok).toBe(false);
  });
});

/* ───────── 프롬프트 (실제 Gemini 없음 — 보내려던 본문만 본다) ───────── */

describe("extractSensorDocument 프롬프트·스키마 (d7 §28·§27)", () => {
  async function sent() {
    stubGemini({ docDate: null, items: [{ name: "무선 온도", originalName: null, maker: "PASCO", model: "PS-3201", quantity: 1, isSensor: true, type: "온도" }] });
    const { extractSensorDocument } = await import("../../lib/server/gemini");
    const result = await extractSensorDocument({ bytes: new Uint8Array([37, 80, 68, 70]), mimeType: "application/pdf" });
    expect(fetchCalls).toBe(1);
    const body = JSON.parse(sentBody!) as {
      contents: { parts: { text?: string }[] }[];
      generationConfig: { responseSchema: { properties: { items: { items: { properties: Record<string, unknown>; required: string[] } } } } };
    };
    return { prompt: body.contents.flatMap((c) => c.parts).map((p) => p.text ?? "").join("\n"), schema: body.generationConfig.responseSchema, result };
  }

  it("[N2][S17] 서류 안 지시문을 따르지 말라는 문구", async () => {
    const { prompt } = await sent();
    expect(prompt).toMatch(/지시/);
    expect(prompt).toMatch(/따르지 말/);
  });
  it("[R-api][S17] name = 한국어 (영어 서류도), originalName 원문", async () => {
    const { prompt } = await sent();
    expect(prompt).toMatch(/name[^\n]*한국어/);
    expect(prompt).toMatch(/originalName/);
  });
  it("[R-api][S17] type 후보 = rules sensor.types 27종 전부, 옛 '심박' 단독 없음", async () => {
    const { prompt } = await sent();
    const typeLine = prompt.split("\n").find((l) => /type:/.test(l) && /27/.test(l)) ?? "";
    expect(typeLine, "type 규칙 줄").not.toBe("");
    for (const t of TYPES) expect(typeLine, t).toContain(t);
    const listed = (/:\s*([^.]+)\./.exec(typeLine.replace(/^[^:]*type:[^:]*/, ""))?.[1] ?? "").split(",").map((s) => s.trim());
    expect(listed).toHaveLength(TYPES.length);
    expect(listed).not.toContain("심박");
  });
  it("[R-api][S17] 스키마 필드 = name·originalName·maker·model·quantity·isSensor·type (모두 required)", async () => {
    const { schema, result } = await sent();
    const keys = ["name", "originalName", "maker", "model", "quantity", "isSensor", "type"];
    expect(Object.keys(schema.properties.items.items.properties).sort()).toEqual([...keys].sort());
    expect([...schema.properties.items.items.required].sort()).toEqual([...keys].sort());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extraction.items[0]).toMatchObject({ maker: PASCO_MAKER, catalog: true });
  });
});

/* ───────── 권한 없는 주소 ───────── */

describe("lib/no-access (rules no_access, d7 §28)", () => {
  it("[R6][S13] 문구 = rules no_access.copy (교사·admin 화면 / admin 화면)", () => {
    expect(NO_ACCESS_TEXT.staff).toBe(COPY.teacher_admin);
    expect(NO_ACCESS_TEXT.admin).toBe(COPY.admin);
  });
  it("[R6][S13] deniedHomePath → '/?denied=staff' · '/?denied=admin'", () => {
    expect(deniedHomePath("staff")).toBe("/?denied=staff");
    expect(deniedHomePath("admin")).toBe("/?denied=admin");
  });
  it("[R6][S13] parseDenied: staff·admin 만, 배열은 첫 값, 그 밖 null", () => {
    expect(parseDenied("staff")).toBe("staff");
    expect(parseDenied("admin")).toBe("admin");
    expect(parseDenied(["admin", "staff"])).toBe("admin");
    for (const v of ["", "ADMIN", "teacher", "1", null, undefined, []]) expect(parseDenied(v as never), String(v)).toBeNull();
  });
});

/* ───────── POST /api/sensors/extract 처리기 ───────── */

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const URL_ = "http://localhost/api/sensors/extract";
let userSeq = 0;
function freshUser() {
  userSeq += 1;
  access.value = { kind: "ok", userId: `sensor-teacher-${userSeq}` };
}
function formRequest(files: File[]) {
  const form = new FormData();
  for (const f of files) form.append("file", f);
  return new Request(URL_, { method: "POST", body: form }) as unknown as import("next/server").NextRequest;
}
const pdfFile = () => new File([PDF_BYTES], "doc.pdf", { type: "application/pdf" });
async function route() {
  return (await import("../../app/api/sensors/extract/route")).POST;
}

describe("POST /api/sensors/extract (d7 §28 — Gemini 가로채기)", () => {
  it("[R-api][S17] 비로그인 401 · 학생 403 — Gemini 를 부르지 않는다", async () => {
    stubGemini({ docDate: null, items: [] });
    const POST = await route();
    access.value = { kind: "signed-out" };
    expect((await POST(formRequest([pdfFile()]))).status).toBe(401);
    access.value = { kind: "forbidden" };
    const r = await POST(formRequest([pdfFile()]));
    expect(r.status).toBe(403);
    expect(((await r.json()) as { code: string }).code).toBe("forbidden");
    expect(fetchCalls).toBe(0);
  });

  it("[N2][S17] 키 없는 서버 503 no-key — Gemini 를 부르지 않는다", async () => {
    freshUser();
    stubGemini({ docDate: null, items: [] });
    delete process.env.GEMINI_API_KEY;
    const POST = await route();
    const r = await POST(formRequest([pdfFile()]));
    expect(r.status).toBe(503);
    expect(((await r.json()) as { code: string }).code).toBe("no-key");
    expect(fetchCalls).toBe(0);
  });

  it("[R-api][S17] 형식: multipart 아님 400 · 파일 0개/2개 400 · 허용 밖 형식 400 · 확장자만 PDF 400 · 4MB 초과 413", async () => {
    freshUser();
    stubGemini({ docDate: null, items: [] });
    const POST = await route();
    const json = new Request(URL_, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }) as unknown as import("next/server").NextRequest;
    expect((await POST(json)).status).toBe(400);
    expect((await POST(formRequest([]))).status).toBe(400);
    expect((await POST(formRequest([pdfFile(), pdfFile()]))).status).toBe(400);
    expect((await POST(formRequest([new File(["hello"], "a.txt", { type: "text/plain" })]))).status).toBe(400);
    expect((await POST(formRequest([new File(["not a pdf"], "fake.pdf", { type: "application/pdf" })]))).status).toBe(400);
    const big = new Uint8Array(4 * 1024 * 1024 + 10);
    big.set(PDF_BYTES);
    expect((await POST(formRequest([new File([big], "big.pdf", { type: "application/pdf" })]))).status).toBe(413);
    expect(fetchCalls).toBe(0);
  });

  it("[R-api][S17] 정상: 응답 정규화 (PASCO → 파스코, 카탈로그 종류·이름, Vernier → 버니어, 영문 이름 보정·원문)", async () => {
    freshUser();
    stubGemini({
      docDate: "2026-10-05",
      items: [
        { name: "Wireless Force Acceleration Sensor", originalName: null, maker: "PASCO scientific", model: "PS-3202", quantity: 4, isSensor: true, type: null },
        { name: "Go Direct Temperature Probe", originalName: null, maker: "Vernier", model: "GDX-TMP", quantity: 2, isSensor: true, type: "온도" },
        { name: "배송비", originalName: null, maker: null, model: null, quantity: 1, isSensor: false, type: null },
      ],
    });
    const POST = await route();
    const r = await POST(formRequest([pdfFile()]));
    expect(r.status).toBe(200);
    expect(fetchCalls).toBe(1);
    const body = (await r.json()) as { ok: boolean; docDate: string | null; items: Record<string, unknown>[] };
    expect(body.ok).toBe(true);
    expect(body.docDate).toBe("2026-10-05");
    const p = pasco("PS-3202");
    expect(body.items[0]).toMatchObject({ maker: PASCO_MAKER, model: p.model, type: p.type, name: p.nameKo, catalog: true, quantity: 4, originalName: "Wireless Force Acceleration Sensor" });
    expect(body.items[1]).toMatchObject({ maker: VERNIER, type: "온도", name: "온도 센서", originalName: "Go Direct Temperature Probe", catalog: false });
    expect(body.items[2]).toMatchObject({ name: "배송비", isSensor: false });
    for (const it of body.items) for (const k of ["name", "originalName", "maker", "model", "quantity", "isSensor", "type", "catalog"]) expect(it).toHaveProperty(k);
  });

  it("[R-api][S17] 품목 60개 → 응답 50개 상한", async () => {
    freshUser();
    stubGemini({ docDate: null, items: Array.from({ length: DOC_MAX + 10 }, (_, i) => ({ name: `센서 ${i}`, originalName: null, maker: null, model: null, quantity: 1, isSensor: true, type: "온도" })) });
    const POST = await route();
    const r = await POST(formRequest([pdfFile()]));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { items: unknown[] }).items).toHaveLength(DOC_MAX);
  });

  it("[R-api][S17] 품목 0개 → 200 + items [] (화면이 7-doc-fail 모양)", async () => {
    freshUser();
    stubGemini({ docDate: null, items: [] });
    const POST = await route();
    const r = await POST(formRequest([pdfFile()]));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, items: [] });
  });

  it("[R-api][S17] AI 응답 모양 틀림 → 502 parse, 업스트림 오류 → 502", async () => {
    freshUser();
    stubGemini({ nope: true });
    const POST = await route();
    const r = await POST(formRequest([pdfFile()]));
    expect(r.status).toBe(502);
    freshUser();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect((await POST(formRequest([pdfFile()]))).status).toBe(502);
  });

  it("[R-api][S17] 같은 사용자 분당 5회 넘으면 429 (Gemini 직전에만 셈)", async () => {
    freshUser();
    stubGemini({ docDate: null, items: [] });
    const POST = await route();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await POST(formRequest([pdfFile()]))).status);
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes[5]).toBe(429);
  });
});
