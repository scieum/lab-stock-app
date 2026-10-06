// Gemini generateContent 응답 → 시약별 사용량 목록 (d7 §13). 순수 함수 — 환경변수·네트워크를 쓰지 않는다.
// (lib/server/gemini.ts 가 호출한다. 가짜 응답으로 단위 검증할 수 있게 따로 둔다.)

export const USAGE_ITEMS_MAX = 50;
export const USAGE_NAME_MAX = 80;
export const USAGE_UNIT_MAX = 20;

/** 추출한 한 줄: 매뉴얼 표기 그대로의 시약명·1조 사용량(못 읽으면 null)·단위(없으면 "") */
export type ExtractedUsage = { name: string; amount: number | null; unit: string };

export type UsageParseResult =
  | { ok: true; items: ExtractedUsage[] }
  /**
   * blocked   안전 필터가 막았다 (reason = Gemini 의 blockReason / finishReason)
   * upstream  응답 모양이 다르다 (reason: bad-body · no-candidates · no-text)
   * parse     JSON 이 아니거나(json · truncated) 약속한 모양이 아니다(schema)
   * empty     시약을 하나도 못 찾았다 (items = [])
   */
  | { ok: false; code: "blocked" | "upstream" | "parse" | "empty"; reason: string };

/** 답을 끝까지 만들지 않고 멈춘 사유 중 "막힘"으로 보는 것 */
const BLOCKED_FINISH = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 로그에 남겨도 되는 짧은 표식만 (대문자·숫자·밑줄 40자) — 응답 본문을 그대로 옮기지 않는다 */
export function safeToken(v: unknown): string {
  return typeof v === "string" && /^[A-Za-z0-9_]{1,40}$/.test(v) ? v : "unknown";
}

function cleanName(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, USAGE_NAME_MAX);
}

function cleanUnit(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, USAGE_UNIT_MAX);
}

/** 유한한 양수만. 그 밖(문자열·NaN·Infinity·0 이하·null)은 null — 화면에서 사용자가 채운다 */
function cleanAmount(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** 모델이 낸 JSON 글자 → 값. 코드 블록 울타리가 붙어 와도 읽는다 */
function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false } {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return { ok: true, value: JSON.parse(t) };
  } catch {
    return { ok: false };
  }
}

/**
 * generateContent 응답(JSON 으로 읽은 값)을 사용량 목록으로 바꾼다.
 * - 이름이 문자열이 아니거나 빈 줄은 버린다. 이름 80자·단위 20자까지, 최대 50줄(넘는 줄은 버린다).
 * - 수량은 유한한 양수만 남기고 나머지는 null.
 * - items 에 줄이 있는데 쓸 수 있는 줄이 하나도 없으면 schema 오류.
 */
export function parseUsageResponse(body: unknown): UsageParseResult {
  if (!isRecord(body)) return { ok: false, code: "upstream", reason: "bad-body" };

  const feedback = body.promptFeedback;
  if (isRecord(feedback) && feedback.blockReason !== undefined && feedback.blockReason !== null) {
    return { ok: false, code: "blocked", reason: safeToken(feedback.blockReason) };
  }

  const candidates = body.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0 || !isRecord(candidates[0])) {
    return { ok: false, code: "upstream", reason: "no-candidates" };
  }
  const candidate = candidates[0];
  const finish = typeof candidate.finishReason === "string" ? candidate.finishReason : "";
  if (BLOCKED_FINISH.has(finish)) return { ok: false, code: "blocked", reason: safeToken(finish) };

  const parts = isRecord(candidate.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
  const text = parts
    // 생각 요약(thought) 조각은 답이 아니다
    .filter((p): p is Record<string, unknown> => isRecord(p) && p.thought !== true && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
  const truncated = finish === "MAX_TOKENS";
  if (text.trim() === "") {
    return truncated ? { ok: false, code: "parse", reason: "truncated" } : { ok: false, code: "upstream", reason: "no-text" };
  }

  const parsed = parseJsonText(text);
  if (!parsed.ok) return { ok: false, code: "parse", reason: truncated ? "truncated" : "json" };
  if (!isRecord(parsed.value) || !Array.isArray(parsed.value.items)) return { ok: false, code: "parse", reason: "schema" };

  const raw = parsed.value.items;
  if (raw.length === 0) return { ok: false, code: "empty", reason: "no-items" };

  const items: ExtractedUsage[] = [];
  for (const it of raw) {
    if (items.length >= USAGE_ITEMS_MAX) break;
    if (!isRecord(it)) continue;
    const name = cleanName(it.name);
    if (name === "") continue;
    items.push({ name, amount: cleanAmount(it.amount), unit: cleanUnit(it.unit) });
  }
  if (items.length === 0) return { ok: false, code: "parse", reason: "schema" };
  return { ok: true, items };
}
