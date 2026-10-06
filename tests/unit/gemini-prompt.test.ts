// 실험 매뉴얼 추출 프롬프트 (lib/server/gemini.ts) — d7 §13 "중복" (2026-10-06):
//   AI 프롬프트에 "준비물·시약 목록이 있으면 그 목록의 양만 쓰고, 목록이 없으면 실험 과정에 나온 양을 시약별로 합쳐 시약마다 한 줄".
// 실제 Gemini 는 부르지 않는다 (d7 §13 "테스트"). fetch 를 가로채 보내려던 요청 본문의 프롬프트 글자만 본다.
// 키는 실제 값이 아닌 가짜 표식만 넣고, 끝나면 원래 환경으로 되돌린다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const FAKE_KEY = "test-placeholder-not-a-key";
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

/** extractManualUsage 가 보내려던 요청 본문의 프롬프트 (text part) */
async function sentPrompt(): Promise<{ prompt: string; calls: number }> {
  let body: string | null = null;
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      calls += 1;
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"items":[]}' }] }, finishReason: "STOP" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { extractManualUsage } = await import("../../lib/server/gemini");
  await extractManualUsage({ bytes: new Uint8Array([37, 80, 68, 70]), mimeType: "application/pdf" });
  expect(body, "요청 본문").not.toBeNull();
  const parsed = JSON.parse(body!) as { contents: { parts: { text?: string }[] }[] };
  const prompt = parsed.contents.flatMap((c) => c.parts).map((p) => p.text ?? "").join("\n");
  return { prompt, calls };
}

describe("추출 프롬프트: 중복 규칙 (d7 §13 중복)", () => {
  it("[K1][S5] 요청은 한 번, 프롬프트에 '시약마다 한 줄' 규칙이 있다", async () => {
    const { prompt, calls } = await sentPrompt();
    expect(calls).toBe(1);
    expect(prompt).toMatch(/시약마다 한 줄/);
  });

  it("[K1][S5] 준비물·시약 목록이 있으면 그 목록의 양만 쓰고(실험 과정의 양을 더하지 않음)", async () => {
    const { prompt } = await sentPrompt();
    const rule = prompt.split("\n").find((l) => l.includes("준비물")) ?? "";
    expect(rule, "준비물 규칙 줄").not.toBe("");
    expect(rule).toMatch(/준비물·시약 목록/);
    expect(rule).toMatch(/목록에 적힌 양만/);
    expect(rule).toMatch(/더하지 않/);
  });

  it("[K1][S5] 목록이 없으면 실험 과정에 나온 양을 시약별로 합쳐 한 줄, 단위가 다르면 나눈다", async () => {
    const { prompt } = await sentPrompt();
    const rule = prompt.split("\n").find((l) => l.includes("준비물")) ?? "";
    expect(rule).toMatch(/목록이 없으면/);
    expect(rule).toMatch(/실험 과정에 나온 양을 시약별로 (모두 )?합쳐/);
    expect(rule).toMatch(/단위가 다르면 줄을 나눕니다/);
  });

  it("[K1][S5] 프롬프트·요청 본문에 키 값이 없다 (키는 헤더로만)", async () => {
    const { prompt } = await sentPrompt();
    expect(prompt).not.toContain(FAKE_KEY);
  });
});
