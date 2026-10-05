// 추출 요청 한도 (d7 §13 "한도": 사용자당 짧은 시간에 연속 호출 제한 — 예: 분당 5회).
// 시계를 인자로 넣어 본다 (실제 시간을 기다리지 않는다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../../lib/rate-limit";
import { ROOT } from "./helpers";

/** d7 §13 "한도" 행의 "분당 N회" */
const LIMIT = (() => {
  const doc = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
  const line = doc.split(/\r?\n/).find((l) => l.startsWith("| 한도 |"));
  const m = line?.match(/분당 (\d+)회/);
  if (!m) throw new Error("harness/d7-data.md §13 에서 '분당 N회' 를 읽지 못했습니다");
  return Number(m[1]);
})();
const WINDOW_MS = 60_000;
const T0 = 1_800_000_000_000;

describe("[N2][S5] createRateLimiter — 사용자당 분당 한도", () => {
  it(`한도 ${LIMIT}회까지 허용, ${LIMIT + 1}번째는 거부 + 다시 시도할 수 있을 때까지 남은 초`, () => {
    const limiter = createRateLimiter(LIMIT, WINDOW_MS);
    for (let i = 0; i < LIMIT; i++) {
      expect(limiter.take("user-a", T0 + i * 1000), `${i + 1}번째`).toEqual({ ok: true });
    }
    const denied = limiter.take("user-a", T0 + LIMIT * 1000);
    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error("unreachable");
    // 첫 호출(T0)이 창 밖으로 나가는 때 = T0 + 60초 → 지금(T0 + LIMIT초)부터 60 - LIMIT 초
    expect(denied.retryAfterSeconds).toBe(WINDOW_MS / 1000 - LIMIT);
    expect(Number.isInteger(denied.retryAfterSeconds)).toBe(true);
  });

  it("거부된 뒤에도 계속 거부되고, 거부된 호출은 횟수로 세지 않는다(기다릴 시간이 늘지 않음)", () => {
    const limiter = createRateLimiter(LIMIT, WINDOW_MS);
    for (let i = 0; i < LIMIT; i++) limiter.take("user-a", T0);
    for (let i = 1; i <= 30; i++) {
      const r = limiter.take("user-a", T0 + i * 1000);
      expect(r.ok, `거부 ${i}`).toBe(false);
      if (!r.ok) expect(r.retryAfterSeconds).toBe(WINDOW_MS / 1000 - i);
    }
    // 창이 지나면 연타했던 것과 상관없이 바로 회복
    expect(limiter.take("user-a", T0 + WINDOW_MS)).toEqual({ ok: true });
  });

  it("남은 초는 1 이상 (창이 끝나기 직전에도 0 초를 돌려주지 않는다)", () => {
    const limiter = createRateLimiter(LIMIT, WINDOW_MS);
    for (let i = 0; i < LIMIT; i++) limiter.take("user-a", T0);
    const r = limiter.take("user-a", T0 + WINDOW_MS - 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("사용자별로 따로 센다 (한 사용자가 한도를 채워도 다른 사용자는 영향 없음)", () => {
    const limiter = createRateLimiter(LIMIT, WINDOW_MS);
    for (let i = 0; i < LIMIT; i++) expect(limiter.take("user-a", T0).ok).toBe(true);
    expect(limiter.take("user-a", T0).ok).toBe(false);
    for (let i = 0; i < LIMIT; i++) expect(limiter.take("user-b", T0).ok, `user-b ${i + 1}번째`).toBe(true);
    expect(limiter.take("user-b", T0).ok).toBe(false);
    expect(limiter.take("user-c", T0)).toEqual({ ok: true });
    // 비슷한 키도 다른 사용자다
    expect(limiter.take("user-a ", T0)).toEqual({ ok: true });
    expect(limiter.take("USER-A", T0)).toEqual({ ok: true });
  });

  it("창이 지나면 회복한다 — 지난 호출만큼만 (슬라이딩)", () => {
    const limiter = createRateLimiter(LIMIT, WINDOW_MS);
    // 10초 간격으로 한도만큼
    for (let i = 0; i < LIMIT; i++) expect(limiter.take("user-a", T0 + i * 10_000).ok).toBe(true);
    const last = T0 + (LIMIT - 1) * 10_000;
    expect(limiter.take("user-a", last + 1).ok).toBe(false);
    // 첫 호출이 창 밖으로 나가는 순간 1회만 회복
    expect(limiter.take("user-a", T0 + WINDOW_MS - 1).ok).toBe(false);
    expect(limiter.take("user-a", T0 + WINDOW_MS)).toEqual({ ok: true });
    expect(limiter.take("user-a", T0 + WINDOW_MS + 1).ok).toBe(false);
    // 모두 지나면 다시 한도만큼
    const later = T0 + WINDOW_MS * 3;
    for (let i = 0; i < LIMIT; i++) expect(limiter.take("user-a", later + i).ok, `회복 뒤 ${i + 1}번째`).toBe(true);
    expect(limiter.take("user-a", later + LIMIT).ok).toBe(false);
  });

  it("한도기마다 따로 센다 (다른 한도기의 호출이 섞이지 않음)", () => {
    const one = createRateLimiter(LIMIT, WINDOW_MS);
    const two = createRateLimiter(LIMIT, WINDOW_MS);
    for (let i = 0; i < LIMIT; i++) one.take("user-a", T0);
    expect(one.take("user-a", T0).ok).toBe(false);
    expect(two.take("user-a", T0)).toEqual({ ok: true });
  });

  it("사용자가 아주 많아져도(키 정리 뒤에도) 창 안의 한도는 지켜진다", () => {
    const limiter = createRateLimiter(LIMIT, WINDOW_MS, 100);
    for (let i = 0; i < LIMIT; i++) limiter.take("heavy", T0);
    for (let i = 0; i < 1000; i++) expect(limiter.take(`user-${i}`, T0 + 1000).ok).toBe(true);
    expect(limiter.take("heavy", T0 + 2000).ok, "정리 뒤에도 창 안에서는 거부").toBe(false);
    expect(limiter.take("heavy", T0 + WINDOW_MS).ok).toBe(true);
  });

  it("now 를 주지 않으면 지금 시각으로 센다", () => {
    const limiter = createRateLimiter(2, WINDOW_MS);
    expect(limiter.take("user-a")).toEqual({ ok: true });
    expect(limiter.take("user-a")).toEqual({ ok: true });
    const r = limiter.take("user-a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_MS / 1000);
  });
});
