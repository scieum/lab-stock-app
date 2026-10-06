// 짧은 시간 연속 호출 제한 (d7 §13 "한도": 추출 요청 사용자당 분당 5회). 순수 로직 — 시계를 인자로 받는다.
//
// 한계: 카운터는 이 프로세스의 메모리에만 있다. 서버리스(Vercel)에서는 인스턴스마다 따로 세고,
// 인스턴스가 새로 뜨면 0 부터다 — "한 인스턴스 안에서 사용자당 분당 N회"까지만 보장한다.
// 전체 인스턴스에 걸친 정확한 한도가 필요하면 공유 저장소(DB 테이블 등)가 있어야 한다.

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export type RateLimiter = {
  /** 호출 1회를 쓴다. 한도를 넘으면 쓰지 않고 다시 시도할 수 있을 때까지 남은 초를 돌려준다 */
  take(key: string, now?: number): RateLimitResult;
};

/** 최근 windowMs 동안 key 당 limit 회까지 (슬라이딩 윈도) */
export function createRateLimiter(limit: number, windowMs: number, maxKeys = 5000): RateLimiter {
  const hits = new Map<string, number[]>();

  function sweep(now: number) {
    for (const [k, times] of hits) {
      if (times.length === 0 || now - times[times.length - 1] >= windowMs) hits.delete(k);
    }
  }

  return {
    take(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
        return { ok: false, retryAfterSeconds };
      }
      recent.push(now);
      hits.set(key, recent);
      // 오래된 키를 치운다 (메모리가 끝없이 늘지 않게)
      if (hits.size > maxKeys) sweep(now);
      return { ok: true };
    },
  };
}
