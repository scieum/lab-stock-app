// 화면 6 판매처 연결 "검색어 자동 입력" 순수 규칙 (lib/vendor-rules: vendorSearchUrl · isOpenableUrl · VENDOR_SEARCH_PLACEHOLDER).
// 기대값: harness/d7-data.md §11 "검색어 자동 입력" 행 (2026-10-07 사용자 결정)
//   - 공통 목록 4곳은 웹사이트 대신 검색 결과 주소를 연다. 검색어 = 시약 이름 그대로(앞뒤 공백만 정리, URL 인코딩).
//   - 검색 주소 = vendors.search_url, `{q}` 자리에 검색어. search_url 이 없는 판매처는 웹사이트를 연다.
//   §12 "테이블": website 300자 (검색 주소는 시약 이름이 붙으므로 이 길이 제한과 무관 — 이름을 자르지 않는다).
// 공통 4곳 주소는 d7 문서에서 읽는다 (구현 상수·seed 를 읽지 않는다).
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { VENDOR_SEARCH_PLACEHOLDER, isOpenableUrl, vendorSearchUrl } from "../../lib/vendor-rules";
import { ROOT, read } from "./helpers";

const D7 = read(join(ROOT, "harness/d7-data.md"));
const line = D7.split("\n").find((l) => l.startsWith("| 검색어 자동 입력 |")) ?? "";
const COMMON_SEARCH = [...line.matchAll(/([^\s,()|:`]+) `(https:\/\/[^`\s]+)`/g)].map((m) => ({ name: m[1], searchUrl: m[2] }));
const Q = (/`(\{[a-z]+\})` 자리에 검색어/.exec(line) ?? [])[1] ?? "";
const WEBSITE_MAX = Number((/website\(null 또는 http\(s\):\/\/ 로 시작, (\d+)자\)/.exec(D7) ?? [])[1]);

/** d7 §11 규칙대로 기대 주소: `{q}` → encodeURIComponent(trim(이름)) */
const expected = (template: string, name: string) => template.split(Q).join(encodeURIComponent(name.trim()));
/** 검색 주소에서 `{q}` 가 있던 쿼리 키 */
const keyOf = (template: string) => [...new URL(template.replace(Q, "x")).searchParams.entries()].find(([, v]) => v === "x")?.[0] ?? "";

const SITE = "https://shop.example.test/";
const TPL = "https://shop.example.test/search?kw={q}&page=1";

describe("vendorSearchUrl: 기대값 원본", () => {
  it("[K1][S6] d7 §11 에서 검색어 자리 `{q}` 와 공통 4곳 검색 주소(https://, `{q}` 1번)를 읽었다 · 구현 상수 = d7", () => {
    expect(Q).toBe("{q}");
    expect(VENDOR_SEARCH_PLACEHOLDER, "구현 VENDOR_SEARCH_PLACEHOLDER = d7").toBe(Q);
    expect(COMMON_SEARCH.map((s) => s.name), "d7 §11 공통 4곳").toHaveLength(4);
    for (const s of COMMON_SEARCH) {
      expect(s.searchUrl.startsWith("https://"), `${s.name} https`).toBe(true);
      expect(s.searchUrl.split(Q).length - 1, `${s.name} {q} 1번`).toBe(1);
      expect(keyOf(s.searchUrl), `${s.name} {q} 는 쿼리 값 자리`).not.toBe("");
    }
    expect(WEBSITE_MAX, "d7 §12 website 길이").toBeGreaterThan(0);
  });
});

describe("vendorSearchUrl: 공통 4곳 (d7 §11 주소)", () => {
  const names = ["염산 (35%)", "황산구리(II) 오수화물", "NaOH", "에탄올 95% & 메탄올 #2", "  수산화 나트륨  "];
  for (const reagent of names) {
    it(`[K1][S6] 시약 "${reagent}" → 4곳 각각 {q} = 인코딩한 이름 · 쿼리 값을 풀면 앞뒤 공백 뺀 이름 그대로`, () => {
      for (const s of COMMON_SEARCH) {
        const got = vendorSearchUrl({ searchUrl: s.searchUrl, website: SITE }, reagent);
        expect(got, `${s.name}`).toBe(expected(s.searchUrl, reagent));
        expect(new URL(got!).searchParams.get(keyOf(s.searchUrl)), `${s.name} 쿼리 값`).toBe(reagent.trim());
        expect(new URL(got!).host, `${s.name} 호스트 = 검색 주소 호스트`).toBe(new URL(s.searchUrl).host);
        expect(got!.includes(Q), `${s.name} {q} 가 남지 않음`).toBe(false);
      }
    });
  }
});

describe("vendorSearchUrl: 인코딩", () => {
  it("[K1][S6] 공백 = %20(+ 아님) · % = %25 · 한글 UTF-8 퍼센트 인코딩 · 괄호는 그대로 둬도 값이 같다", () => {
    const got = vendorSearchUrl({ searchUrl: TPL, website: SITE }, "염산 (35%)")!;
    expect(got).toBe("https://shop.example.test/search?kw=%EC%97%BC%EC%82%B0%20(35%25)&page=1");
    expect(new URL(got).searchParams.get("kw")).toBe("염산 (35%)");
    expect(new URL(got).searchParams.get("page"), "뒤쪽 쿼리 그대로").toBe("1");
  });

  it("[K1][S6] & · # · ? · = · / · + 가 든 이름도 쿼리를 깨지 않는다 (검색어 하나로 들어간다)", () => {
    const name = "A&B=1 #2 ?x/y+z";
    const got = vendorSearchUrl({ searchUrl: TPL, website: SITE }, name)!;
    const u = new URL(got);
    expect(u.searchParams.get("kw")).toBe(name);
    expect(u.searchParams.get("page")).toBe("1");
    expect([...u.searchParams.keys()].sort()).toEqual(["kw", "page"]);
    expect(u.hash, "# 이 조각으로 바뀌지 않음").toBe("");
  });

  it("[K1][S6] String.replace 특수 패턴($& · $1 · $$)이 든 이름도 글자 그대로", () => {
    for (const name of ["H2O$&", "x$1y", "a$$b", "$`'"]) {
      const got = vendorSearchUrl({ searchUrl: TPL, website: SITE }, name)!;
      expect(new URL(got).searchParams.get("kw"), name).toBe(name);
      expect(got, name).toBe(expected(TPL, name));
    }
  });

  it("[K1][S6] 앞뒤 공백·탭·줄바꿈만 정리하고 가운데 공백은 그대로", () => {
    const got = vendorSearchUrl({ searchUrl: TPL, website: SITE }, " \t 질산  은 \n")!;
    expect(new URL(got).searchParams.get("kw")).toBe("질산  은");
  });

  it(`[K1][S6] 긴 이름(인코딩 뒤 ${WEBSITE_MAX}자 초과)도 자르지 않고 연다`, () => {
    const name = "가".repeat(40);
    const got = vendorSearchUrl({ searchUrl: TPL, website: SITE }, name)!;
    expect(got.length, "검색 주소 길이").toBeGreaterThan(WEBSITE_MAX);
    expect(new URL(got).searchParams.get("kw")).toBe(name);
  });
});

describe("vendorSearchUrl: 검색 주소를 쓰지 않는 경우 → website (없으면 null)", () => {
  it("[K1][S6] 이름이 공백뿐·빈 문자열·null·undefined → website", () => {
    for (const name of ["", "   ", "\t\n", null, undefined]) {
      expect(vendorSearchUrl({ searchUrl: TPL, website: SITE }, name), JSON.stringify(name)).toBe(SITE);
      expect(vendorSearchUrl({ searchUrl: TPL, website: null }, name), `${JSON.stringify(name)} · website 없음`).toBeNull();
    }
  });

  it("[K1][S6] searchUrl 이 null·undefined·빈 문자열 (우리 학교 판매처) → website", () => {
    expect(vendorSearchUrl({ searchUrl: null, website: SITE }, "염산")).toBe(SITE);
    expect(vendorSearchUrl({ website: SITE }, "염산")).toBe(SITE);
    expect(vendorSearchUrl({ searchUrl: "", website: SITE }, "염산")).toBe(SITE);
  });

  it("[K1][S6] searchUrl 도 website 도 없으면 null", () => {
    expect(vendorSearchUrl({ searchUrl: null, website: null }, "염산")).toBeNull();
    expect(vendorSearchUrl({}, "염산")).toBeNull();
  });

  it("[K1][S6] searchUrl 에 {q} 가 없으면 → website (없으면 null)", () => {
    const noQ = "https://shop.example.test/search?kw=";
    expect(vendorSearchUrl({ searchUrl: noQ, website: SITE }, "염산")).toBe(SITE);
    expect(vendorSearchUrl({ searchUrl: noQ, website: null }, "염산")).toBeNull();
  });

  it("[K1][S6] searchUrl 이 https:// 가 아니면(http · javascript: · 상대 주소) → website", () => {
    for (const bad of ["http://shop.example.test/search?kw={q}", "javascript:alert('{q}')", "/search?kw={q}", "HTTP://shop.example.test/?q={q}"]) {
      expect(vendorSearchUrl({ searchUrl: bad, website: SITE }, "염산"), bad).toBe(SITE);
      expect(vendorSearchUrl({ searchUrl: bad, website: null }, "염산"), `${bad} · website 없음`).toBeNull();
    }
  });

  it("[K1][S6] 학교 판매처(website http 주소) → website 를 그대로 돌려준다", () => {
    expect(vendorSearchUrl({ searchUrl: null, website: "http://old.example.test/shop?x=1" }, "염산 (35%)")).toBe("http://old.example.test/shop?x=1");
  });
});

describe("isOpenableUrl: 새 창으로 열 수 있는 주소 (http(s) + 호스트 · 공백·제어 문자 없음 · 길이 제한 없음)", () => {
  it("[K1][S6] http · https 주소 통과", () => {
    for (const ok of ["https://a.example.test", "http://a.example.test/x?y=1", "https://a.example.test/s?kw=%EC%97%BC", ...COMMON_SEARCH.map((s) => s.searchUrl)]) {
      expect(isOpenableUrl(ok), ok).toBe(true);
    }
  });

  it(`[K1][S6] ${WEBSITE_MAX}자를 넘는 검색 주소도 통과`, () => {
    const long = `https://a.example.test/s?kw=${"%EA%B0%80".repeat(120)}`;
    expect(long.length).toBeGreaterThan(WEBSITE_MAX);
    expect(isOpenableUrl(long)).toBe(true);
  });

  it("[K1][S6] 빈 값·문자열 아님·다른 스킴·호스트 없음·공백·제어 문자 → false", () => {
    for (const bad of [
      "",
      null,
      undefined,
      42,
      {},
      "javascript:alert(1)",
      "data:text/html,<p>x</p>",
      "mailto:a@example.test",
      "ftp://a.example.test",
      "a.example.test",
      "//a.example.test",
      "https://",
      "https://a.example.test/염 산",
      "https://a.example.test/\tx",
      "https://a.example.test/\u0000",
      "https://a.example.test/\u007f",
      " https://a.example.test",
    ]) {
      expect(isOpenableUrl(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
