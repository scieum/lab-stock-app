// MSDS 찾기 서버·공용 규칙 (harness/d7-data.md §20, design/rules.json 1.18 msds · never.N2).
// 실제 안전보건공단(KOSHA) 은 부르지 않는다 — 고정 XML 표본(lib/server/fixtures/kosha-*.xml)과 가짜 fetch 만 쓴다.
// - parseChemListXml: 정상 · 0건 · 게이트웨이 오류 표본
// - toCandidates: 최대 개수(d7 §20 "후보 최대 10개") · openYn=N 제외 · 같은 물질 ID 처음 것만 · CAS 없음 → null
// - msdsDetailUrl · normalizeChemId: 6자리 앞 0 채움 · 숫자 아니면 null
// - checkMsdsQuery(1~60자) · isCasQuery(숫자-숫자-숫자) · isStorableCas · checkMsdsUrl(http(s) · 300자)
// - searchCondition: CAS 꼴이면 1(CAS No), 아니면 0(국문명) · searchMsds: 키 없음 → no-key(외부 요청 0) · 가짜 fetch 로 요청 변수·캐시·오류
// 숫자 한도(60·10·20·300)는 d7 §20 문장에서 읽는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT, rules } from "./helpers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/msds-rules", async () => await import("../../lib/msds-rules"));

import {
  MSDS_BULK_MAX,
  MSDS_CANDIDATES_MAX,
  MSDS_QUERY_MAX,
  MSDS_TEXT,
  MSDS_URL_MAX,
  bulkBannerText,
  bulkDoneText,
  checkMsdsQuery,
  checkMsdsUrl,
  isCasQuery,
  isStorableCas,
  readCandidates,
} from "../../lib/msds-rules";
import { msdsDetailUrl, normalizeChemId, parseChemListXml, toCandidates, type ChemItem } from "../../lib/server/kosha-msds-xml";

// ---- d7 §20 문장에서 한도 ----
const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const S20 = D7.slice(D7.indexOf("## 20."), D7.indexOf("\n## ", D7.indexOf("## 20.") + 5));
const num = (re: RegExp, what: string) => {
  const m = re.exec(S20);
  if (!m) throw new Error(`d7 §20 에서 ${what} 를 찾지 못함`);
  return Number(m[1]);
};
const Q_MAX = num(/q 1~(\d+)자/, "검색어 길이");
const CAND_MAX = num(/후보 최대 (\d+)개/, "후보 최대");
const BULK_MAX = num(/한 번에 최대 (\d+)종/, "일괄 최대");
const URL_MAX = num(/http\(s\):\/\/ (\d+)자 이하/, "주소 길이");
/** d7 §20 MSDS 상세 페이지 — 안전보건공단 (구현 주석의 형식: msdsdetail.do?chem_id={6자리}&viewType=msds) */
const DETAIL_HOST = "msds.kosha.or.kr";
const EXTERNAL_HOST = (/https:\/\/([a-z.]+)\/B552468/.exec(S20) ?? [])[1] ?? "apis.data.go.kr";

const FIX = (name: string) => readFileSync(join(ROOT, "lib/server/fixtures", name), "utf8");
const SAMPLE = FIX("kosha-chem-list-sample.xml");
const NODATA = FIX("kosha-chem-list-nodata.xml");
const GATEWAY = FIX("kosha-gateway-no-key.xml");

const BANNED: string[] = rules.never.N2.banned_terms;

describe("[K1][S*] MSDS 규칙 상수 = d7 §20", () => {
  it(`검색어 1~${Q_MAX}자 · 후보 최대 ${CAND_MAX} · 일괄 최대 ${BULK_MAX} · 주소 ${URL_MAX}자`, () => {
    expect([MSDS_QUERY_MAX, MSDS_CANDIDATES_MAX, MSDS_BULK_MAX, MSDS_URL_MAX]).toEqual([Q_MAX, CAND_MAX, BULK_MAX, URL_MAX]);
  });
  it("문구: d7 §20 의 화면 문구와 같다 · N2 금지어 0", () => {
    for (const s of [MSDS_TEXT.missing, MSDS_TEXT.noResult, MSDS_TEXT.find, MSDS_TEXT.noKey, MSDS_TEXT.upstream]) expect(S20, `d7 §20 에 "${s}"`).toContain(s);
    expect(S20).toContain(bulkBannerText(0).replace(" 0종", " N종"));
    expect(S20).toContain(bulkDoneText(0).replace("0종", "N종"));
    expect(bulkBannerText(7)).toBe("MSDS 없는 시약 7종");
    expect(bulkDoneText(3)).toBe("3종에 MSDS를 넣었어요");
    const all = Object.values(MSDS_TEXT).join("\n");
    expect(BANNED.filter((t) => all.toLowerCase().includes(t.toLowerCase())), "N2 banned_terms").toEqual([]);
    expect(all).not.toContain(EXTERNAL_HOST);
  });
});

describe("[K1][S*] parseChemListXml (고정 표본)", () => {
  it("정상 표본: ok · 5줄 · totalCount 5 · 첫 줄 = 000699 질산 은 7761-88-8 · 엔티티 풀기 · 빈 CAS ''", () => {
    const r = parseChemListXml(SAMPLE);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.items).toHaveLength(5);
    expect(r.totalCount).toBe(5);
    expect(r.items[0]).toEqual({ chemId: "000699", chemNameKor: "질산 은", casNo: "7761-88-8", openYn: "Y" });
    expect(r.items[1].chemId).toBe("12345");
    expect(r.items[2].chemNameKor).toBe("질산 은 & 질산 칼륨 혼합물");
    expect(r.items[2].casNo).toBe("");
    expect(r.items[3].openYn).toBe("N");
  });
  it("0건 표본: ok · 빈 목록 · totalCount 0", () => {
    expect(parseChemListXml(NODATA)).toEqual({ kind: "ok", items: [], totalCount: 0 });
  });
  it("게이트웨이 오류 표본: gateway-error · reason = errMsg · code = returnReasonCode", () => {
    expect(parseChemListXml(GATEWAY)).toEqual({ kind: "gateway-error", reason: "SERVICE_KEY_IS_NULL", code: "20" });
  });
  it("결과 코드 03(NODATA) → 빈 목록, 그 밖의 코드 → api-error, XML 아님·모양 다름 → format", () => {
    const wrap = (code: string) => `<response><header><resultCode>${code}</resultCode><resultMsg>M</resultMsg></header><body><items/></body></response>`;
    expect(parseChemListXml(wrap("03"))).toEqual({ kind: "ok", items: [], totalCount: 0 });
    expect(parseChemListXml(wrap("22"))).toEqual({ kind: "api-error", resultCode: "22", resultMsg: "M" });
    expect(parseChemListXml("not xml")).toEqual({ kind: "format" });
    expect(parseChemListXml("<html><body>x</body></html>")).toEqual({ kind: "format" });
    expect(parseChemListXml("<response><body/></response>")).toEqual({ kind: "format" });
  });
  it("CDATA 를 푼다", () => {
    const xml = `<response><header><resultCode>00</resultCode></header><body><items><item><chemId>7</chemId><chemNameKor><![CDATA[염산 <35%>]]></chemNameKor><casNo>7647-01-0</casNo><openYn>Y</openYn></item></items><totalCount>1</totalCount></body></response>`;
    const r = parseChemListXml(xml);
    expect(r.kind === "ok" && r.items[0].chemNameKor).toBe("염산 <35%>");
  });
});

describe("[K1][S*] normalizeChemId · msdsDetailUrl", () => {
  it("앞 0 채움 6자리 · 숫자 아니면 null", () => {
    expect(normalizeChemId("699")).toBe("000699");
    expect(normalizeChemId(" 000699 ")).toBe("000699");
    expect(normalizeChemId("12345")).toBe("012345");
    expect(normalizeChemId("123456")).toBe("123456");
    expect(normalizeChemId("")).toBeNull();
    expect(normalizeChemId("12a")).toBeNull();
    expect(normalizeChemId("-1")).toBeNull();
  });
  it(`상세 주소 = https://${DETAIL_HOST}/MSDSInfo/kcic/msdsdetail.do?chem_id={6자리}&viewType=msds`, () => {
    expect(msdsDetailUrl("699")).toBe(`https://${DETAIL_HOST}/MSDSInfo/kcic/msdsdetail.do?chem_id=000699&viewType=msds`);
    expect(msdsDetailUrl("x")).toBeNull();
    const u = msdsDetailUrl("1")!;
    expect(checkMsdsUrl(u).ok, "set_reagent_msds 에 넣을 수 있는 주소").toBe(true);
    expect(u).not.toContain(EXTERNAL_HOST);
    expect(u).not.toMatch(/serviceKey/i);
  });
});

describe("[K1][S*] toCandidates", () => {
  it("정상 표본 → openYn=N 제외 · 같은 ID(699 = 000699) 처음 것만 · 빈 CAS → null · 앞 0 채움", () => {
    const r = parseChemListXml(SAMPLE);
    if (r.kind !== "ok") throw new Error("표본 파싱");
    const c = toCandidates(r.items);
    expect(c.map((x) => x.chemId)).toEqual(["000699", "012345", "023456"]);
    expect(c[0]).toEqual({ chemId: "000699", name: "질산 은", cas: "7761-88-8", msdsUrl: msdsDetailUrl("000699") });
    expect(c[2].cas).toBeNull();
    expect(c.find((x) => x.name === "비공개 물질"), "openYn=N 제외").toBeUndefined();
    expect(c.find((x) => x.name.includes("중복")), "중복 ID 뒤엣것 제외").toBeUndefined();
  });
  it(`최대 ${CAND_MAX}개 (더 많아도) · 이름 없음·ID 숫자 아님 제외 · CAS "-" → null`, () => {
    const many: ChemItem[] = Array.from({ length: CAND_MAX + 5 }, (_, i) => ({ chemId: String(i + 1), chemNameKor: `물질${i + 1}`, casNo: "-", openYn: "Y" }));
    many.unshift({ chemId: "abc", chemNameKor: "나쁜 ID", casNo: "", openYn: "Y" }, { chemId: "999", chemNameKor: "  ", casNo: "", openYn: "Y" });
    const c = toCandidates(many);
    expect(c).toHaveLength(CAND_MAX);
    expect(c[0].name).toBe("물질1");
    expect(c.every((x) => x.cas === null)).toBe(true);
    expect(toCandidates([{ chemId: "5", chemNameKor: "a", casNo: "", openYn: "n" }]), "openYn 소문자 n 도 비공개").toEqual([]);
  });
  it("0건 표본 → 빈 목록", () => {
    const r = parseChemListXml(NODATA);
    expect(r.kind === "ok" && toCandidates(r.items)).toEqual([]);
  });
});

describe("[K1][S*] 입력 규칙", () => {
  it(`checkMsdsQuery: 앞뒤 공백 정리 · 1~${Q_MAX}자 · 제어 문자 거부 · 문자열 아님 거부`, () => {
    expect(checkMsdsQuery("  질산  은 ")).toEqual({ ok: true, value: "질산 은" });
    expect(checkMsdsQuery("가".repeat(Q_MAX))).toEqual({ ok: true, value: "가".repeat(Q_MAX) });
    expect(checkMsdsQuery("가".repeat(Q_MAX + 1)).ok).toBe(false);
    expect(checkMsdsQuery("").ok).toBe(false);
    expect(checkMsdsQuery("   ").ok).toBe(false);
    expect(checkMsdsQuery("a\u0000b").ok).toBe(false);
    expect(checkMsdsQuery(null).ok).toBe(false);
    expect(checkMsdsQuery(12).ok).toBe(false);
  });
  it("isCasQuery: 숫자-숫자-숫자 꼴만", () => {
    for (const q of ["7761-88-8", " 64-17-5 ", "1-2-3"]) expect(isCasQuery(q), q).toBe(true);
    for (const q of ["질산 은", "7761-88", "7761-88-8a", "7761 88 8", "CAS 7761-88-8", ""]) expect(isCasQuery(q), q).toBe(false);
  });
  it("isStorableCas: 2~7자리-2자리-1자리 (set_reagent_msds 와 같은 규칙)", () => {
    for (const c of ["64-17-5", "7761-88-8", "1234567-12-3"]) expect(isStorableCas(c), c).toBe(true);
    for (const c of ["1-17-5", "12345678-12-3", "64-1-5", "64-17-55", "-", "", null, undefined]) expect(isStorableCas(c as string), String(c)).toBe(false);
  });
  it(`checkMsdsUrl: http(s):// · 공백 없음 · ${URL_MAX}자 이하`, () => {
    const base = "https://msds.example.test/";
    expect(checkMsdsUrl(` ${base}a `)).toEqual({ ok: true, value: `${base}a` });
    expect(checkMsdsUrl("HTTP://x.test/a").ok).toBe(true);
    expect(checkMsdsUrl(base + "a".repeat(URL_MAX - base.length)).ok).toBe(true);
    expect(checkMsdsUrl(base + "a".repeat(URL_MAX - base.length + 1)).ok).toBe(false);
    for (const u of ["javascript:alert(1)", "ftp://x.test/a", "x.test/a", "https://", "https://a b.test", "", null]) expect(checkMsdsUrl(u).ok, String(u)).toBe(false);
  });
  it(`readCandidates: http(s) 주소만 · 최대 ${CAND_MAX} · 모양이 다르면 null`, () => {
    const ok = { chemId: "000001", name: "a", cas: " 64-17-5 ", msdsUrl: "https://x.test/1" };
    expect(readCandidates({ candidates: [ok, { ...ok, msdsUrl: "javascript:x" }, { ...ok, name: 1 }] })).toEqual([{ ...ok, cas: "64-17-5" }]);
    expect(readCandidates({ candidates: Array.from({ length: CAND_MAX + 3 }, () => ok) })).toHaveLength(CAND_MAX);
    expect(readCandidates({ candidates: [{ ...ok, cas: "" }] })![0].cas).toBeNull();
    expect(readCandidates({})).toBeNull();
    expect(readCandidates(null)).toBeNull();
  });
});

describe("[K1][N2][S*] searchMsds · searchCondition (가짜 fetch — 실제 KOSHA 호출 없음)", () => {
  const KEY_NAME = "KOSHA_MSDS_API_KEY";
  let saved: string | undefined;
  let fetchSpy: ReturnType<typeof vi.fn>;
  const urls: string[] = [];

  beforeEach(() => {
    saved = process.env[KEY_NAME];
    vi.resetModules();
    urls.length = 0;
    fetchSpy = vi.fn(async () => {
      throw new Error("이 테스트에서 외부 요청을 하면 안 됨");
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY_NAME];
    else process.env[KEY_NAME] = saved;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const load = () => import("../../lib/server/kosha-msds");
  const reply = (body: string, status = 200) => {
    fetchSpy.mockImplementation(async (u: string | URL) => {
      urls.push(String(u));
      return new Response(body, { status, headers: { "Content-Type": "application/xml" } });
    });
  };

  it("searchCondition: CAS 꼴 → '1', 아니면 '0'", async () => {
    const { searchCondition } = await load();
    expect(searchCondition("7761-88-8")).toBe("1");
    expect(searchCondition(" 64-17-5 ")).toBe("1");
    expect(searchCondition("질산 은")).toBe("0");
    expect(searchCondition("7761-88")).toBe("0");
  });

  it("키 없음 → isMsdsConfigured false · no-key · 외부 요청 0", async () => {
    delete process.env[KEY_NAME];
    const m = await load();
    expect(m.isMsdsConfigured()).toBe(false);
    expect(await m.searchMsds("질산 은")).toEqual({ ok: false, code: "no-key" });
    process.env[KEY_NAME] = "   ";
    expect(m.isMsdsConfigured(), "공백뿐인 키 = 없음").toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("가짜 키 + 정상 표본: 요청 = getChemList001 · searchWrd · searchCnd(국문 0 / CAS 1) · serviceKey · 결과 = toCandidates · 같은 검색어는 하루 캐시(요청 1번)", async () => {
    const fake = "FAKE-TEST-VALUE";
    process.env[KEY_NAME] = fake;
    reply(SAMPLE);
    const m = await load();
    const r = await m.searchMsds("질산 은");
    expect(r.ok).toBe(true);
    const parsed = parseChemListXml(SAMPLE);
    if (parsed.kind !== "ok") throw new Error("표본");
    expect(r.ok && r.candidates).toEqual(toCandidates(parsed.items));
    expect(urls).toHaveLength(1);
    const u = new URL(urls[0]);
    expect(u.hostname).toBe(EXTERNAL_HOST);
    expect(u.pathname.endsWith("/getChemList001")).toBe(true);
    expect(u.searchParams.get("searchWrd")).toBe("질산 은");
    expect(u.searchParams.get("searchCnd")).toBe("0");
    expect(u.searchParams.get("serviceKey")).toBe(fake);
    // 캐시: 다시 불러도 요청 없음 · cachedMsdsSearch 가 같은 값
    expect(await m.searchMsds("  질산 은 ")).toEqual(r);
    expect(urls).toHaveLength(1);
    expect(m.cachedMsdsSearch("질산 은")).toEqual(r.ok && r.candidates);
    expect(m.cachedMsdsSearch("질산 은", Date.now() + (m.MSDS_CACHE_SECONDS + 1) * 1000), "하루 지나면 캐시 없음").toBeNull();
    // CAS
    await m.searchMsds("7761-88-8");
    expect(new URL(urls[1]).searchParams.get("searchCnd")).toBe("1");
    // 결과에 키·외부 주소 없음
    expect(JSON.stringify(r)).not.toContain(fake);
    expect(JSON.stringify(r)).not.toContain(EXTERNAL_HOST);
  });

  it("가짜 키 + 0건 표본 → ok 빈 목록", async () => {
    process.env[KEY_NAME] = "FAKE-TEST-VALUE";
    reply(NODATA);
    const m = await load();
    expect(await m.searchMsds("없는물질")).toEqual({ ok: true, candidates: [] });
  });

  it("가짜 키 + 게이트웨이 오류 표본(4xx) → upstream · 캐시하지 않음 · 결과에 키 없음", async () => {
    const fake = "FAKE-TEST-VALUE";
    process.env[KEY_NAME] = fake;
    reply(GATEWAY, 401);
    const m = await load();
    const r = await m.searchMsds("질산 은");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("upstream");
    expect(JSON.stringify(r)).not.toContain(fake);
    expect(m.cachedMsdsSearch("질산 은")).toBeNull();
    await m.searchMsds("질산 은");
    expect(urls, "오류는 캐시 안 함 → 다시 요청").toHaveLength(2);
  });

  it("가짜 키 + 네트워크 오류 → upstream (오류 메시지에 요청 주소·키 없음) · HTML 응답 → upstream", async () => {
    const fake = "FAKE-TEST-VALUE";
    process.env[KEY_NAME] = fake;
    fetchSpy.mockImplementation(async (u: string | URL) => {
      throw new Error(`connect failed ${String(u)}`);
    });
    const m = await load();
    const r = await m.searchMsds("질산 은");
    expect(r).toEqual({ ok: false, code: "upstream", reason: "network" });
    reply("<html><body>error</body></html>", 200);
    const r2 = await m.searchMsds("염산");
    expect(!r2.ok && r2.code).toBe("upstream");
    for (const w of (console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.flat()) {
      expect(String(w)).not.toContain(fake);
      expect(String(w)).not.toContain(EXTERNAL_HOST);
    }
  });
});
