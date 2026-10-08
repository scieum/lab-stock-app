// 화면 16 MSDS 요약 — 서버·공용 순수 규칙 (harness/d7-data.md §22, design/rules.json 1.21 msds_summary, design/frames/16-mobile.json).
// 실제 안전보건공단(KOSHA) 은 부르지 않는다 — 고정 XML 표본(lib/server/fixtures/kosha-chem-detail-*.xml)과 가짜 fetch 만 쓴다.
// - koshaChemIdFromUrl: 공단 상세 주소만 chem_id(6자리 앞 0) · 다른 주소·공단 첫 화면·형식 오류 → null (16-no-summary)
// - 항목별 상세 파서: 표본 4종 · 0건(nodata) · 줄 구분(개행 · | · <br>) · H 코드 지움 · "자료없음"·"※" 출처 줄 뺌 · 그림문자 GHS 코드/이름 · 신호어
// - getMsdsSummary + 가짜 fetch: 4항목 동시 · 키는 serviceKey 쿼리(헤더 아님, 결과·로그에 키 없음) · 일부 실패 = 그 항목 null ·
//   전부 실패 = upstream · 전부 시간 초과 = timeout · 키 없음 = no-key(외부 요청 0) · 하루 캐시(네 항목 모두 성공한 결과만) · 같은 chem_id 동시 요청 묶음
// - ghs-pictogram 9종 이름 = d7 §22 목록 (시안 16 캡션이 있으면 캡션 — 예: "수생환경 유해성")
// - 화면 문구 = 시안 16 · rules.json msds_summary
// 기대값은 d7 · rules.json · 프레임에서 읽는다. 구현 상수는 읽은 값과 같은지만 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT, dev, rules } from "./helpers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/msds-rules", async () => await import("../../lib/msds-rules"));
vi.mock("@/lib/msds-summary", async () => await import("../../lib/msds-summary"));

import {
  GHS_CODES,
  GHS_NAMES,
  MSDS_SECTION_KEYS,
  MSDS_SECTION_TITLES,
  MSDS_SUMMARY_PREVIEW_LINES,
  MSDS_SUMMARY_TEXT,
  koshaChemIdFromUrl,
  msdsBackHref,
  msdsSummaryPath,
  msdsTitle,
  readMsdsFrom,
} from "../../lib/msds-summary";
import {
  detailLines,
  parseChemDetailXml,
  parsePictograms,
  parseSignalWord,
  sectionLines,
  stripHazardCode,
  summarizeSection2,
  type ChemDetailItem,
} from "../../lib/server/kosha-msds-detail-xml";
import { msdsDetailUrl } from "../../lib/server/kosha-msds-xml";
import { framePath } from "../frames";

// ---------- 기대값 원본 ----------
const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const S22 = (() => {
  const s = D7.indexOf("## 22.");
  if (s < 0) throw new Error("d7 §22 없음");
  const e = D7.indexOf("\n## ", s + 5);
  return D7.slice(s, e < 0 ? undefined : e);
})();
const row22 = (head: string) => S22.split(/\r?\n/).find((l) => l.startsWith(`| ${head} |`)) ?? "";

/** d7 §22 "표시": GHS01~GHS09 9종 이름 (괄호 설명은 뺀다) */
const D7_GHS = (() => {
  const m = /GHS01~GHS09 (\d+)종: ([^.]+)\./.exec(row22("표시"));
  if (!m) throw new Error("d7 §22 표시 행에서 GHS 9종 목록을 읽지 못함");
  const raw = m[2].split("·").map((s) => s.trim());
  return { count: Number(m[1]), raw, names: raw.map((s) => s.replace(/\(.*?\)/g, "").trim()) };
})();
/** d7 §22 "데이터": 항목 번호 (getChemDetail02 = 2 …, 04, 07, 08) */
const D7_OPS = [...row22("데이터").matchAll(/getChemDetail0(\d)/g)].map((m) => m[1]);
const D7_SECTION_NUMS = [...new Set([...row22("데이터").matchAll(/\b0(\d) = /g)].map((m) => m[1]).concat(D7_OPS))].sort();
/** d7 §22 "요약 대상": 공단 상세 주소 */
const D7_DETAIL_URL = (/`(msds\.kosha\.or\.kr\/[^`]+)`/.exec(row22("요약 대상")) ?? [])[1] ?? "";

type FrameNode = { name: string; path: string[]; fills?: string[]; text: { characters: string } | null };
const F16 = (JSON.parse(readFileSync(framePath("16-mobile"), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const frameTexts = (name: string, parent?: string) =>
  F16.filter((n) => n.name === name && n.text && (!parent || n.path.includes(parent))).map((n) => n.text!.characters);
const FRAME_TITLE = frameTexts("title", "nav-pill")[0] ?? "";
const FRAME_SOURCE = frameTexts("source-line")[0] ?? "";
const FRAME_SECTION_TITLES = frameTexts("section-title");
const FRAME_GHS_CAPTIONS = frameTexts("caption", "ghs-pictogram");
const FRAME_MORE = frameTexts("label", "more-toggle")[0] ?? "";
const FRAME_ORIGINAL = frameTexts("label", "msds-original-link")[0] ?? "";
const FRAME_SIGNAL = frameTexts("label", "signal-word")[0] ?? "";
const FRAME_SIGNAL_CAPTION = F16.find((n) => n.name === "caption" && n.path[n.path.length - 2] === "signal-word-row")?.text?.characters ?? "";

const MS = rules.msds_summary as Record<string, string>;
/** rules.json msds_summary.sections: "2. 유해·위험성 · 4. 응급조치 요령 · … — 제목은 …" */
const RULE_SECTION_TITLES = MS.sections.split(" — ")[0].split(" · ").map((s: string) => s.trim());
/** rules.json msds_summary.states 의 따옴표 문구 */
const RULE_FAIL = (/16-fail = ex-empty-state-card '([^']+)'/.exec(MS.states) ?? [])[1] ?? "";
const RULE_EMPTY = (/무채색 '([^']+)'/.exec(MS.states) ?? [])[1] ?? "";

/** ghs 이름 기대값: d7 목록, 시안 캡션이 그 이름을 품으면(예: "수생환경 유해성" ⊃ "환경 유해성") 캡션 */
const EXPECTED_GHS_NAMES = D7_GHS.names.map((n) => FRAME_GHS_CAPTIONS.find((c) => c === n || c.endsWith(n)) ?? n);

const FIX = (f: string) => readFileSync(join(ROOT, "lib/server/fixtures", f), "utf8");
const X02 = FIX("kosha-chem-detail-02-sample.xml");
const X04 = FIX("kosha-chem-detail-04-sample.xml");
const X07 = FIX("kosha-chem-detail-07-sample.xml");
const X08 = FIX("kosha-chem-detail-08-sample.xml");
const X08_NODATA = FIX("kosha-chem-detail-08-nodata.xml");
const GATEWAY = FIX("kosha-gateway-no-key.xml");

const ok = (xml: string): ChemDetailItem[] => {
  const p = parseChemDetailXml(xml);
  if (p.kind !== "ok") throw new Error(`표본 파싱 실패: ${p.kind}`);
  return p.items;
};
const item = (name: string, detail: string, order: number | null = null): ChemDetailItem => ({ name, detail, lev: 1, code: "", upCode: "", order });
const itemXml = (items: { name: string; detail: string; ord?: number }[], code = "00") =>
  `<?xml version="1.0"?><response><header><resultCode>${code}</resultCode><resultMsg>X</resultMsg></header><body><items>${items
    .map((i) => `<item><itemDetail>${i.detail}</itemDetail><lev>1</lev><msdsItemNameKor>${i.name}</msdsItemNameKor>${i.ord !== undefined ? `<ordrIdx>${i.ord}</ordrIdx>` : ""}</item>`)
    .join("")}</items></body></response>`;

// =====================================================================
describe("[K1][S16] 기대값 원본 (d7 §22 · rules.json msds_summary · 프레임 16-mobile)", () => {
  it("[K1][S16] d7 §22 에서 GHS 9종 이름·항목 번호 2·4·7·8·공단 상세 주소를, 프레임에서 시안 문구를 읽는다", () => {
    expect(D7_GHS.count, "d7 §22 GHS N종").toBe(9);
    expect(D7_GHS.names, "d7 §22 이름 수 = N종").toHaveLength(D7_GHS.count);
    expect(D7_SECTION_NUMS, "d7 §22 항목 번호").toEqual(["2", "4", "7", "8"]);
    expect(D7_DETAIL_URL, "d7 §22 공단 상세 주소").toMatch(/^msds\.kosha\.or\.kr\/.+chem_id=/);
    expect(rules.screens_required["16"], "rules.json screens_required 16").toEqual(expect.arrayContaining(["msds-summary", "ghs-pictogram", "msds-original-link"]));
    expect(FRAME_TITLE).toMatch(/^MSDS · .+/);
    expect(FRAME_SOURCE).not.toBe("");
    expect(FRAME_SECTION_TITLES).toHaveLength(4);
    expect(FRAME_GHS_CAPTIONS.length, "시안 그림문자 캡션").toBeGreaterThan(0);
    expect(RULE_SECTION_TITLES).toHaveLength(4);
    expect(RULE_FAIL).not.toBe("");
    expect(RULE_EMPTY).not.toBe("");
    for (const c of FRAME_GHS_CAPTIONS) expect(EXPECTED_GHS_NAMES, `시안 캡션 "${c}" 는 9종 이름 중 하나`).toContain(c);
  });

  it("[K1][S16] dev-rules 1.10: mvp_screens·routes 16·16-guest·guest_screens·components 에 화면 16", () => {
    expect(dev.mvp_screens).toContain(16);
    expect(dev.routes["16"]).toMatch(/^\/msds\/\[[^\]]+\]$/);
    expect(dev.routes["16-guest"]).toMatch(/^\/demo\/msds\/\[[^\]]+\]$/);
    expect(dev.guest_screens).toContain(16);
    expect(rules.guest.screens).toContain(16);
    for (const c of ["msds-summary", "ghs-pictogram", "msds-original-link", "msds-skeleton", "ex-empty-state-card"]) {
      expect(dev.components[c], `dev-rules components ${c}`).toContain(16);
    }
  });
});

// =====================================================================
describe("[K1][S16] 화면 문구·ghs-pictogram 이름 = 시안 16 · d7 §22", () => {
  it("[K1][S16] ghs-pictogram 9종: 코드 GHS01~GHS09 · 이름 = d7 목록(시안 캡션 우선)", () => {
    expect([...GHS_CODES]).toEqual(Array.from({ length: D7_GHS.count }, (_, i) => `GHS0${i + 1}`));
    expect(GHS_CODES.map((c) => GHS_NAMES[c])).toEqual(EXPECTED_GHS_NAMES);
    expect(new Set(Object.values(GHS_NAMES)).size, "이름이 서로 다르다").toBe(9);
  });

  it("[K1][S16] 제목 · 출처 줄 · 신호어 캡션 · 항목 제목 · 더 보기 · 원문 보기 · 실패 · 내용 없음", () => {
    const name = FRAME_TITLE.replace(/^MSDS · /, "");
    expect(msdsTitle(name)).toBe(FRAME_TITLE);
    expect(MSDS_SUMMARY_TEXT.source).toBe(FRAME_SOURCE);
    expect(MSDS_SUMMARY_TEXT.signalCaption).toBe(FRAME_SIGNAL_CAPTION);
    expect(MSDS_SECTION_KEYS.map((k) => MSDS_SECTION_TITLES[k])).toEqual(FRAME_SECTION_TITLES);
    expect(MSDS_SECTION_KEYS.map((k) => MSDS_SECTION_TITLES[k])).toEqual(RULE_SECTION_TITLES);
    expect(MSDS_SUMMARY_TEXT.more).toBe(FRAME_MORE);
    expect(MSDS_SUMMARY_TEXT.original).toBe(FRAME_ORIGINAL);
    expect(MSDS_SUMMARY_TEXT.fail).toBe(RULE_FAIL);
    expect(MSDS_SUMMARY_TEXT.empty).toBe(RULE_EMPTY);
    expect(MSDS_SUMMARY_PREVIEW_LINES, "rules.json sections '요약 3줄'").toBe(Number((/요약 (\d+)줄/.exec(MS.sections) ?? [])[1]));
    expect(["위험", "경고"], "시안 신호어").toContain(FRAME_SIGNAL);
  });

  it("[K1][S16] 화면 16 주소 · 뒤로 = 들어온 화면 (dev-rules routes 3·10·16·16-guest·3-guest)", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const at = (route: string) => route.replace(/\[[^\]]+\]/, id);
    expect(msdsSummaryPath(id)).toBe(at(dev.routes["16"]));
    expect(msdsSummaryPath(id, { from: "usage" })).toBe(`${at(dev.routes["16"])}?from=usage`);
    expect(msdsSummaryPath(id, { demo: true })).toBe(at(dev.routes["16-guest"]));
    expect(msdsBackHref(id)).toBe(at(dev.routes["3"]));
    expect(msdsBackHref(id, { from: "usage" })).toBe(dev.routes["10"]);
    expect(msdsBackHref(id, { demo: true })).toBe(at(dev.routes["3-guest"]));
    expect(readMsdsFrom("usage")).toBe("usage");
    expect(readMsdsFrom(["usage"])).toBe("usage");
    for (const v of [undefined, "", "x", "reagent", "USAGE", ["x"]]) expect(readMsdsFrom(v), JSON.stringify(v)).toBe("reagent");
  });
});

// =====================================================================
describe("[K1][S16] koshaChemIdFromUrl — 공단 상세 주소만 요약 (d7 §22 요약 대상)", () => {
  const base = `https://${D7_DETAIL_URL.split("?")[0]}`;
  it.each([
    [`${base}?chem_id=000699`, "000699"],
    [`${base}?chem_id=699`, "000699"],
    [`${base}?chem_id=699&viewType=msds`, "000699"],
    [`${base}?viewType=msds&chem_id=001008`, "001008"],
    [`http://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=12`, "000012"],
  ])("[K1][S16] %s → %s (앞 0 채움 6자리)", (url, want) => {
    expect(koshaChemIdFromUrl(url)).toBe(want);
  });

  it("[K1][S16] §20 MSDS 찾기가 저장하는 주소(msdsDetailUrl) 는 그대로 요약 대상", () => {
    expect(koshaChemIdFromUrl(msdsDetailUrl("699"))).toBe("000699");
  });

  it.each([
    ["공단 첫 화면 (데모 seed)", "https://msds.kosha.or.kr/"],
    ["다른 주소", "https://example.com/msds/agno3.pdf"],
    ["다른 호스트 같은 경로", "https://example.com/MSDSInfo/kcic/msdsdetail.do?chem_id=000699"],
    ["호스트 흉내", "https://msds.kosha.or.kr.example.com/MSDSInfo/kcic/msdsdetail.do?chem_id=000699"],
    ["공단 다른 경로", "https://msds.kosha.or.kr/MSDSInfo/kcic/msdslist.do?chem_id=000699"],
    ["chem_id 없음", `https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do`],
    ["chem_id 숫자 아님", `https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=abc`],
    ["chem_id 0", `https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=000000`],
    ["http(s) 아님", "ftp://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=000699"],
    ["주소 아님", "msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=000699"],
    ["빈 값", ""],
  ])("[K1][S16] %s → null (16-no-summary)", (_label, url) => {
    expect(koshaChemIdFromUrl(url)).toBeNull();
  });

  it("[K1][S16] null·undefined → null", () => {
    expect(koshaChemIdFromUrl(null)).toBeNull();
    expect(koshaChemIdFromUrl(undefined)).toBeNull();
  });
});

// =====================================================================
describe("[K1][S16] 항목별 상세 파서 — 고정 XML 표본", () => {
  it("[K1][S16] 표본 4종 모두 ok · 항목이 ordrIdx 순 · 0건(resultCode 03) = ok 빈 목록 · 게이트웨이 오류 · 형식 오류", () => {
    for (const [n, x] of [["02", X02], ["04", X04], ["07", X07], ["08", X08]] as const) {
      const items = ok(x);
      expect(items.length, `${n} 항목`).toBeGreaterThan(0);
      const orders = items.map((i) => i.order ?? 0);
      expect(orders, `${n} 순서`).toEqual([...orders].sort((a, b) => a - b));
    }
    expect(parseChemDetailXml(X08_NODATA)).toEqual({ kind: "ok", items: [] });
    expect(parseChemDetailXml(GATEWAY).kind).toBe("gateway-error");
    expect(parseChemDetailXml("<html><body>error</body></html>").kind).toBe("format");
    expect(parseChemDetailXml("").kind).toBe("format");
    expect(parseChemDetailXml(itemXml([], "30")).kind, "알 수 없는 결과 코드").toBe("api-error");
  });

  it("[K1][S16] ordrIdx 가 거꾸로 와도 순서대로", () => {
    const items = ok(itemXml([{ name: "나", detail: "둘", ord: 2 }, { name: "가", detail: "하나", ord: 1 }]));
    expect(items.map((i) => i.detail)).toEqual(["하나", "둘"]);
  });

  it("[K1][S16] 항목 2 (표본 02): 신호어 '위험' · 그림문자 GHS03·GHS09 · 유해·위험문구 3줄(H 코드 지움) · 예방조치문구(P)·분류·자료없음 제외", () => {
    const s = summarizeSection2(ok(X02));
    expect(s.signalWord).toBe("위험");
    expect(s.pictograms).toEqual(["GHS03", "GHS09"]);
    expect(s.lines).toEqual(["화재를 강렬하게 함:산화제", "수생생물에 매우 유독함", "장기적인 영향에 의해 수생생물에게 매우 유독함"]);
    for (const l of s.lines) {
      expect(l, "H 코드 지움").not.toMatch(/^H\d{3}/);
      expect(l, "P 문구 없음").not.toMatch(/^P\d{3}|점화원/);
      expect(l).not.toContain("자료없음");
      expect(l, "분류 줄 없음(유해·위험문구가 있으면)").not.toMatch(/구분\d/);
    }
  });

  it("[K1][S16] 항목 2: 유해·위험문구가 없으면 분류 줄 · 신호어 '경고' · 신호어 없으면 null", () => {
    const s = summarizeSection2([item("가. 유해성·위험성 분류", "피부 부식성 : 구분1|눈 손상성 : 구분1"), item("신호어", "경고")]);
    expect(s.signalWord).toBe("경고");
    expect(s.lines).toEqual(["피부 부식성 : 구분1", "눈 손상성 : 구분1"]);
    expect(summarizeSection2([item("유해·위험문구", "H315 : 피부에 자극을 일으킴")]).signalWord).toBeNull();
  });

  it("[K1][S16] 항목 4 (표본 04): 칸마다 | 로 나눈 줄이 모두 순서대로 들어간다 · 빈 줄 없음", () => {
    const items = ok(X04);
    const lines = sectionLines(items);
    const segs = items.flatMap((i) => i.detail.split("|").map((s) => s.trim()).filter(Boolean));
    expect(segs.length).toBe(7);
    expect(lines.length, "줄이 빠지거나 늘지 않는다").toBe(segs.length);
    let at = -1;
    for (const seg of segs) {
      const idx = lines.findIndex((l, i) => i > at && l.includes(seg));
      expect(idx, `"${seg}" 가 순서대로`).toBeGreaterThan(at);
      at = idx;
    }
    for (const l of lines) expect(l.trim()).not.toBe("");
  });

  it("[K1][S16] 항목 7 (표본 07): 줄바꿈 · <br>(엔티티) 로 나누고 &amp; 를 풀며 태그 글자는 남기지 않는다", () => {
    const lines = sectionLines(ok(X07));
    const want = [
      "피해야할 물질 및 조건에 유의하시오",
      "공학적 관리 및 개인보호구를 참조하여 작업하시오",
      "의류 및 그 밖의 가연성 물질로부터 멀리하시오.",
      "열,고온의 표면 & 화염으로부터 멀리하시오.",
    ];
    expect(lines).toHaveLength(want.length);
    want.forEach((w, i) => expect(lines[i], `줄 ${i + 1}`).toContain(w));
    for (const l of lines) expect(l).not.toMatch(/<|&lt;|&amp;|br>/);
  });

  it("[K1][S16] 항목 8 (표본 08): '자료없음'·빈 칸 빼고 CDATA 글자 포함 · 0건 표본 → 빈 목록", () => {
    const lines = sectionLines(ok(X08));
    expect(lines).toHaveLength(4);
    expect(lines.some((l) => l.includes("TWA : 0.01mg/m3"))).toBe(true);
    expect(lines.some((l) => l.includes("인증을 필한 호흡용 보호구를 착용하시오"))).toBe(true);
    expect(lines.join("\n")).not.toContain("자료없음");
    expect(lines.join("\n")).not.toContain("CDATA");
    expect(sectionLines(ok(X08_NODATA))).toEqual([]);
  });

  it("[K1][S16] detailLines: 줄바꿈 · CRLF · | · <br> · <br/> 로 나눔, '자료없음'·'해당없음'·'-'·'※' 출처 줄 제외", () => {
    expect(detailLines("가\n나\r\n다|라<br>마<br/>바<BR />사")).toEqual(["가", "나", "다", "라", "마", "바", "사"]);
    expect(detailLines("자료없음")).toEqual([]);
    expect(detailLines("해당없음|-| |자료 없음")).toEqual([]);
    expect(detailLines("첫 줄|※ 출처: 한국산업안전보건공단|둘째 줄")).toEqual(["첫 줄", "둘째 줄"]);
    expect(detailLines("  여러   칸   공백  ")).toEqual(["여러 칸 공백"]);
  });

  it("[K1][S16] stripHazardCode: H 코드(복합 H300+H310 포함) 지움 · 붙어 온 여러 문구는 코드 앞에서 나눔", () => {
    expect(stripHazardCode("H272 : 화재를 강렬하게 함:산화제")).toBe("화재를 강렬하게 함:산화제");
    expect(stripHazardCode("H300+H310 : 삼키거나 피부와 접촉하면 치명적임")).toBe("삼키거나 피부와 접촉하면 치명적임");
    expect(stripHazardCode("H314: 피부에 심한 화상")).toBe("피부에 심한 화상");
    expect(stripHazardCode("코드 없는 문구")).toBe("코드 없는 문구");
    const s = summarizeSection2([item("유해·위험문구", "H272 : 화재를 강렬하게 함 H400 : 수생생물에 매우 유독함")]);
    expect(s.lines).toEqual(["화재를 강렬하게 함", "수생생물에 매우 유독함"]);
  });

  it("[K1][S16] parsePictograms: GHS 코드(GHS02 · ghs05.gif · GHS-07) · 코드 없으면 이름으로 · 중복 없이 번호 순 · 없으면 빈 목록", () => {
    expect(parsePictograms("GHS09|GHS03|GHS03")).toEqual(["GHS03", "GHS09"]);
    expect(parsePictograms("/MSDSInfo/images/kcic/ghs/ghs05.gif")).toEqual(["GHS05"]);
    expect(parsePictograms("GHS-07, GHS 1")).toEqual(["GHS01", "GHS07"]);
    expect(parsePictograms("GHS10")).toEqual([]);
    expect(parsePictograms("산화성|부식성")).toEqual(["GHS03", "GHS05"]);
    expect(parsePictograms("자료없음")).toEqual([]);
    // d7 §22 9종 이름(괄호 설명 포함 원문)으로도 찾는다
    D7_GHS.raw.forEach((n, i) => expect(parsePictograms(n), `이름 "${n}"`).toEqual([GHS_CODES[i]]));
  });

  it("[K1][S16] parseSignalWord: 위험 · 경고 · 그 밖 null", () => {
    expect(parseSignalWord("위험")).toBe("위험");
    expect(parseSignalWord(" 경 고 ")).toBe("경고");
    expect(parseSignalWord("자료없음")).toBeNull();
    expect(parseSignalWord("")).toBeNull();
  });
});

// =====================================================================
describe("[K1][N2][S16] getMsdsSummary (가짜 fetch — 실제 KOSHA 호출 없음)", () => {
  const KEY_NAME = "KOSHA_MSDS_API_KEY";
  const FAKE = "FAKE-TEST-VALUE-16";
  let saved: string | undefined;
  let fetchSpy: ReturnType<typeof vi.fn>;
  type Call = { url: URL; init: RequestInit | undefined };
  const calls: Call[] = [];
  const XML: Record<string, string> = { "2": X02, "4": X04, "7": X07, "8": X08 };
  const sectionOf = (u: URL) => (/getChemDetail0(\d)\d*$/.exec(u.pathname) ?? [])[1] ?? "";

  beforeEach(() => {
    saved = process.env[KEY_NAME];
    vi.resetModules();
    calls.length = 0;
    fetchSpy = vi.fn(async () => {
      throw new Error("이 테스트에서 외부 요청을 하면 안 됨");
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY_NAME];
    else process.env[KEY_NAME] = saved;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const load = async () => {
    const m = await import("../../lib/server/kosha-msds-detail");
    m.clearMsdsSummaryCache();
    return m;
  };
  /** 항목 번호별 응답 (없으면 표본) — 함수면 그 결과(던지면 네트워크 오류) */
  const fake = (over: Record<string, string | ((u: URL) => Promise<Response>)> = {}) =>
    vi.fn(async (u: string | URL, init?: RequestInit) => {
      const url = new URL(String(u));
      calls.push({ url, init });
      const sec = sectionOf(url);
      const o = over[sec];
      if (typeof o === "function") return o(url);
      return new Response(o ?? XML[sec], { status: 200, headers: { "Content-Type": "application/xml" } });
    }) as unknown as typeof fetch;
  const logs = () =>
    [console.warn, console.error, console.log].flatMap((f) => (f as unknown as ReturnType<typeof vi.fn>).mock.calls.flat()).map(String);

  it("[K1][N2][S16] 키 없음 → no-key · 외부 요청 0 (전역 fetch·넘긴 fetch 모두)", async () => {
    delete process.env[KEY_NAME];
    const m = await load();
    const f = fake();
    expect(await m.getMsdsSummary("000699", f)).toEqual({ ok: false, code: "no-key" });
    process.env[KEY_NAME] = "   ";
    expect(await m.getMsdsSummary("000699", f), "공백뿐인 키 = 없음").toEqual({ ok: false, code: "no-key" });
    expect(await m.getMsdsSummary("000699"), "기본 fetch").toEqual({ ok: false, code: "no-key" });
    expect(calls).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("[K1][S16] 형식이 틀린 chem_id → bad-id · 요청 0", async () => {
    process.env[KEY_NAME] = FAKE;
    const m = await load();
    for (const id of ["abc", "0", "000000", "", "12-34"]) expect(await m.getMsdsSummary(id, fake()), JSON.stringify(id)).toEqual({ ok: false, code: "bad-id" });
    expect(calls).toHaveLength(0);
  });

  it("[K1][N2][S16] 정상 표본: 항목 2·4·7·8 네 번 요청(d7 §22) · 키 = serviceKey 쿼리(헤더 아님) · chemId 6자리 · 결과 = 표본 파싱 · 결과·로그에 키 없음", async () => {
    process.env[KEY_NAME] = FAKE;
    const m = await load();
    const r = await m.getMsdsSummary("699", fake());
    expect(r.ok).toBe(true);
    expect(calls.map((c) => sectionOf(c.url)).sort(), "항목 번호 = d7 §22").toEqual(D7_SECTION_NUMS);
    for (const c of calls) {
      expect(c.url.protocol).toBe("https:");
      expect(c.url.searchParams.get("serviceKey"), "키는 serviceKey 쿼리").toBe(FAKE);
      expect(c.url.searchParams.get("chemId"), "chemId 6자리 앞 0").toBe("000699");
      const headers = new Headers(c.init?.headers ?? {});
      const hv: string[] = [];
      headers.forEach((v, k) => hv.push(`${k}:${v}`));
      expect(hv.join("|"), "요청 헤더에 키 없음").not.toContain(FAKE);
    }
    if (!r.ok) throw new Error("ok 아님");
    expect(r.summary.signalWord).toBe("위험");
    expect(r.summary.pictograms).toEqual(["GHS03", "GHS09"]);
    expect(r.summary.sections.s2).toEqual(summarizeSection2(ok(X02)).lines);
    expect(r.summary.sections.s4).toEqual(sectionLines(ok(X04)));
    expect(r.summary.sections.s7).toEqual(sectionLines(ok(X07)));
    expect(r.summary.sections.s8).toEqual(sectionLines(ok(X08)));
    const out = JSON.stringify(r);
    expect(out).not.toContain(FAKE);
    expect(out).not.toContain("apis.data.go.kr");
    for (const l of logs()) expect(l, "로그에 키 없음").not.toContain(FAKE);
  });

  it("[K1][S16] 네 항목을 동시에 부른다 (하나가 끝나기 전에 네 요청이 모두 나감)", async () => {
    process.env[KEY_NAME] = FAKE;
    const m = await load();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = async (u: URL) => {
      await gate;
      return new Response(XML[sectionOf(u)], { status: 200 });
    };
    const p = m.getMsdsSummary("000699", fake({ "2": slow, "4": slow, "7": slow, "8": slow }));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls, "끝나기 전 요청 수").toHaveLength(4);
    release();
    expect((await p).ok).toBe(true);
  });

  it("[K1][S16] 하루 캐시: 네 항목 모두 성공한 결과만 · 같은 chem_id(앞 0 차이 포함)는 요청 0 · 같은 chem_id 동시 요청은 한 번", async () => {
    process.env[KEY_NAME] = FAKE;
    const m = await load();
    const f = fake();
    const [a, b] = await Promise.all([m.getMsdsSummary("000699", f), m.getMsdsSummary("699", f)]);
    expect(calls, "동시 요청 묶음 → 네 번").toHaveLength(4);
    expect(b).toEqual(a);
    expect(await m.getMsdsSummary("699", f)).toEqual(a);
    expect(calls, "캐시 → 요청 없음").toHaveLength(4);
    expect(m.MSDS_SUMMARY_CACHE_SECONDS, "하루").toBe(86_400);
    await m.getMsdsSummary("001008", f);
    expect(calls, "다른 chem_id 는 새로 요청").toHaveLength(8);
  });

  it("[K1][S16] 0건(항목 8 nodata) → 그 항목 빈 목록(화면 '내용이 없어요') · 나머지는 그대로", async () => {
    process.env[KEY_NAME] = FAKE;
    const m = await load();
    const r = await m.getMsdsSummary("000699", fake({ "8": X08_NODATA }));
    if (!r.ok) throw new Error("ok 아님");
    expect(r.summary.sections.s8).toEqual([]);
    expect(r.summary.sections.s4).toEqual(sectionLines(ok(X04)));
  });

  it("[K1][N2][S16] 일부 실패(네트워크 오류·게이트웨이 오류·HTML) → 그 항목만 null · 나머지 ok · 캐시하지 않음 · 로그에 키·요청 주소 없음", async () => {
    process.env[KEY_NAME] = FAKE;
    const m = await load();
    const boom = async (u: URL) => {
      throw new Error(`connect failed ${u.toString()}`);
    };
    const f = fake({
      "4": boom,
      "7": async () => new Response(GATEWAY, { status: 401 }),
      "8": async () => new Response("<html><body>error</body></html>", { status: 200 }),
    });
    const r = await m.getMsdsSummary("000699", f);
    if (!r.ok) throw new Error("일부 실패는 ok 여야 함");
    expect(r.summary.sections.s4).toBeNull();
    expect(r.summary.sections.s7).toBeNull();
    expect(r.summary.sections.s8).toBeNull();
    expect(r.summary.sections.s2).toEqual(summarizeSection2(ok(X02)).lines);
    expect(r.summary.signalWord).toBe("위험");
    await m.getMsdsSummary("000699", f);
    expect(calls, "일부 실패 결과는 캐시하지 않음 → 다시 네 번").toHaveLength(8);
    for (const l of logs()) {
      expect(l).not.toContain(FAKE);
      expect(l).not.toContain("serviceKey");
    }
  });

  it("[K1][S16] 항목 2 만 실패 → 신호어·그림문자 없음 · s2 null · 나머지 ok", async () => {
    process.env[KEY_NAME] = FAKE;
    const m = await load();
    const r = await m.getMsdsSummary("000699", fake({ "2": async () => new Response(GATEWAY, { status: 401 }) }));
    if (!r.ok) throw new Error("ok 아님");
    expect(r.summary.signalWord).toBeNull();
    expect(r.summary.pictograms).toEqual([]);
    expect(r.summary.sections.s2).toBeNull();
    expect(r.summary.sections.s7).toEqual(sectionLines(ok(X07)));
  });

  it("[K1][S16] 네 항목 모두 실패 → upstream (16-fail) · 결과에 키 없음 · 캐시 안 함", async () => {
    process.env[KEY_NAME] = FAKE;
    const m = await load();
    const boom = async () => {
      throw new Error("down");
    };
    const f = fake({ "2": boom, "4": async () => new Response(GATEWAY, { status: 401 }), "7": boom, "8": boom });
    const r = await m.getMsdsSummary("000699", f);
    expect(r).toEqual({ ok: false, code: "upstream" });
    await m.getMsdsSummary("000699", f);
    expect(calls).toHaveLength(8);
  });

  it("[K1][S16] 네 항목 모두 시간 초과 → timeout · 일부만 시간 초과(나머지 실패) → upstream", async () => {
    process.env[KEY_NAME] = FAKE;
    const m = await load();
    const late = async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    };
    expect(await m.getMsdsSummary("000699", fake({ "2": late, "4": late, "7": late, "8": late }))).toEqual({ ok: false, code: "timeout" });
    const boom = async () => {
      throw new Error("down");
    };
    expect(await m.getMsdsSummary("000699", fake({ "2": late, "4": boom, "7": late, "8": late }))).toEqual({ ok: false, code: "upstream" });
  });

  it("[K1][S16] 요청에 시간 제한(signal)이 걸려 있다", async () => {
    process.env[KEY_NAME] = FAKE;
    const m = await load();
    await m.getMsdsSummary("000699", fake());
    for (const c of calls) expect(c.init?.signal, "AbortSignal").toBeInstanceOf(AbortSignal);
  });
});
