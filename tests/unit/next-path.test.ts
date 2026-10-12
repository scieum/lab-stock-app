// 로그인 뒤 돌아갈 주소(next) — lib/auth/next-path safeNextPath · nextOrHome — [K1][S1].
// 기대값: harness/d7-data.md §26 "화면 12 경로·권한"(비로그인 /scan?cabinet=… → /login → 로그인 뒤 같은 주소),
//         QA 개선 (1)(로그인 상태 /login·/signup → /), harness/dev-rules.json routes(1 = 로그인, 12 = /scan, 14 = 회원가입).
//         열린 리다이렉트 금지: 같은 origin 의 앱 경로만. 다른 호스트로 해석될 수 있는 값(//host, /\host, 스킴, 제어 문자)과
//         로그인·가입 화면(되돌이)·API·인증 콜백은 거부 → nextOrHome = "/".
import { describe, expect, it } from "vitest";
import { nextOrHome, safeNextPath } from "../../lib/auth/next-path";
import { dev } from "./helpers";

const LOGIN = dev.routes["1"] as string;
const SCAN = dev.routes["12"] as string;
const SIGNUP = dev.routes["14"] as string;
const ID = "3f2b8c1e-9a4d-4e6f-b7a1-0c5d2e8f9a10";
const BASE = "https://lab-stock.example.app";

/** 브라우저가 그 값을 따라갔을 때 같은 origin 에 머무는가 (테스트 쪽 독립 판정) */
const staysSameOrigin = (v: string) => new URL(v, BASE).origin === BASE;

describe("[K1][S1] 기대값 원본 (dev-rules routes)", () => {
  it("routes 1·12·14", () => {
    expect(LOGIN).toBe("/login");
    expect(SCAN).toBe("/scan");
    expect(SIGNUP).toBe("/signup");
  });
});

describe("[K1][S12] 허용 — 같은 origin 앱 경로는 쿼리까지 그대로", () => {
  it.each([
    [`${SCAN}?cabinet=${ID}`],
    ["/"],
    ["/reagents"],
    ["/reagents/abc?from=usage"],
    ["/cabinets?c=1#top"],
    ["/loginx"],
    ["/signups"],
    ["/apis"],
  ])("%s", (v) => {
    expect(safeNextPath(v)).toBe(v);
    expect(nextOrHome(v)).toBe(v);
  });
  it("배열(쿼리 값 여러 개) = 첫 값", () => {
    expect(safeNextPath([`${SCAN}?cabinet=${ID}`, "//evil.example"])).toBe(`${SCAN}?cabinet=${ID}`);
  });
  it("점 경로는 정리된 같은 origin 경로", () => {
    expect(safeNextPath("/reagents/../cabinets")).toBe("/cabinets");
  });
});

describe("[K1][S1] 거부 — 열린 리다이렉트 사례 → null, nextOrHome = /", () => {
  const OPEN_REDIRECTS = [
    "//evil.example",
    "//evil.example/scan",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "\\/evil.example",
    "https://evil.example",
    "http://evil.example/scan?cabinet=x",
    "HTTPS://evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.example",
    "scan?cabinet=x",
    "/\tevil.example",
    "/\n/evil.example",
    "/\r\n//evil.example",
    "/%09/evil.example".replace("%09", "\t"),
    "\u0000/scan",
    "/scan\u007f",
    " /scan",
  ];
  it.each(OPEN_REDIRECTS.map((v) => [JSON.stringify(v), v]))("%s", (_label, v) => {
    expect(safeNextPath(v)).toBeNull();
    expect(nextOrHome(v)).toBe("/");
  });

  it("되돌이 · API · 인증 콜백 경로 거부 (점 경로·대체 표기로 돌아 들어와도)", () => {
    for (const v of [
      LOGIN,
      `${LOGIN}?next=/scan`,
      `${LOGIN}/`,
      SIGNUP,
      `${SIGNUP}?x=1`,
      "/api/auth/logout",
      "/api",
      "/auth/callback?code=1",
      "/auth",
      "/scan/../login",
      "/reagents/..%2F..%2Flogin".replace(/%2F/g, "/"),
      "/./login",
    ]) {
      expect(safeNextPath(v), v).toBeNull();
      expect(nextOrHome(v), v).toBe("/");
    }
  });

  it("빈 값 · 문자열 아님 · 너무 긴 값", () => {
    for (const v of [undefined, null, "", 0, 1, {}, [], [""], true]) {
      expect(safeNextPath(v), JSON.stringify(v)).toBeNull();
      expect(nextOrHome(v)).toBe("/");
    }
    expect(safeNextPath(`/${"a".repeat(5000)}`)).toBeNull();
  });

  it.each([["/.//evil.example"], ["/x/..//evil.example"], ["/scan/.././/evil.example"]])(
    "점 경로로 만든 // 도 다른 호스트로 가지 않는다: %s",
    (v) => {
      const r = safeNextPath(v);
      if (r !== null) {
        expect(r.startsWith("//"), `${v} → ${r}`).toBe(false);
        expect(staysSameOrigin(r), `${v} → ${r}`).toBe(true);
      }
      expect(nextOrHome(v).startsWith("//"), `nextOrHome(${v})`).toBe(false);
    },
  );

  it("허용된 모든 결과는 / 로 시작하고 // 로 시작하지 않으며 같은 origin 에 머문다", () => {
    const samples = [...OPEN_REDIRECTS, `${SCAN}?cabinet=${ID}`, "/%2F%2Fevil.example", "/%5Cevil.example", "/.//evil.example", "/x/..//evil.example"];
    for (const v of samples) {
      const r = safeNextPath(v);
      if (r === null) continue;
      expect(r.startsWith("/") && !r.startsWith("//") && !r.startsWith("/\\"), `${JSON.stringify(v)} → ${r}`).toBe(true);
      expect(staysSameOrigin(r), `${JSON.stringify(v)} → ${r}`).toBe(true);
    }
  });
});
