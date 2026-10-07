// 화면 9 판매처 설정 · 화면 6 판매처 연결 순수 규칙 (lib/vendor-rules).
// 기대값: harness/d7-data.md §12(vendors 열 길이 · website = null 또는 http(s):// · 이름 중복 = 대소문자·공백 무시 ·
//         부가 정보 = "연락처 · note" · 판매처명 검색 · 공통 목록 seed), §11(판매처 연결 순서 = 우리 학교 먼저, 그다음 공통),
//         §18(화면 9 목록 행의 부가 정보 = 연락처만), design/frames/9-mobile.json(시안 1.17 예시 판매처 3곳의 이름).
//         구현에서 읽지 않는다 — 구현 상수는 d7 문장에서 읽은 숫자와 같은지 비교만 한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VENDOR_CONTACT_MAX,
  VENDOR_NAME_MAX,
  VENDOR_NOTE_MAX,
  VENDOR_WEBSITE_MAX,
  checkVendor,
  filterVendors,
  isOpenableWebsite,
  normalizeWebsite,
  orderVendorsForLink,
  vendorContactInfo,
  vendorInfo,
  vendorNameKey,
} from "../../lib/vendor-rules";
import { ROOT, read } from "./helpers";

// ---------- d7-data.md §12 에서 읽은 기대값 ----------
const D7 = read(join(ROOT, "harness/d7-data.md"));
const num = (re: RegExp, what: string): number => {
  const m = re.exec(D7);
  if (!m) throw new Error(`d7-data.md 에서 ${what} 를 찾지 못함`);
  return Number(m[1]);
};
const NAME_MAX = num(/name\(1~(\d+)자\)/, "name 길이");
const CONTACT_MAX = num(/contact\(연락처, null 허용 (\d+)자\)/, "contact 길이");
const WEBSITE_MAX = num(/website\(null 또는 http\(s\):\/\/ 로 시작, (\d+)자\)/, "website 길이");
const NOTE_MAX = num(/note\(부가 정보, null 허용 (\d+)자\)/, "note 길이");
// 공통 목록 seed: "11번가(https://www.11st.co.kr), G마켓(…), …"
const seedLine = D7.split("\n").find((l) => l.startsWith("| 공통 목록")) ?? "";
const SEED = [...seedLine.matchAll(/([^\s,():]+)\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({ name: m[1], website: m[2] }));

// ---------- 시안 프레임 9-mobile(1.17) 의 예시 판매처 ----------
// 시안 1.17 행 = vendor-name + vendor-site(웹사이트). 부가 정보 줄(vendor-info)은 시안에 없고, d7 §18 이 행의 부가 정보를
// "연락처만"으로 정했다 — 부가 정보 문구 틀("연락처 · note")의 예시는 아래 D7_INFOS(d7 §12 틀).
type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const frame = JSON.parse(readFileSync(join(ROOT, "design/frames/9-mobile.json"), "utf8")) as { frames: { nodes: FrameNode[] }[] };
const frameText = (name: string) => frame.frames[0].nodes.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);
const FRAME_NAMES = frameText("vendor-name");
const FRAME_SITES = frameText("vendor-site");
/** d7 §12 "부가 정보 = 연락처 · note" 틀의 예시 (화면 6 판매처 연결 행이 쓰는 vendorInfo) */
const D7_INFOS = ["043-221-4560 · 시약·실험 기구", "02-555-0192 · 시약", "043-270-1188 · 실험 기구"];

const HTTP = /^https?:\/\//;
const of = (n: number, ch = "가") => ch.repeat(n);
const ok = (input: Parameters<typeof checkVendor>[0]) => {
  const r = checkVendor(input);
  if (!r.ok) throw new Error(`통과해야 하는 입력이 거부됨: ${r.field} ${r.error}`);
  return r.value;
};
const fail = (input: Parameters<typeof checkVendor>[0]) => {
  const r = checkVendor(input);
  if (r.ok) throw new Error(`거부해야 하는 입력이 통과됨: ${JSON.stringify(r.value)}`);
  return r;
};
/** 길이가 정확히 n 인 https 주소 */
const urlOfLength = (n: number) => {
  const head = "https://example.com/";
  return head + "a".repeat(n - head.length);
};

describe("vendor rules: 기대값 원본 · 상수", () => {
  it("[K1][S9] 기대값 원본: d7 §12 에서 길이 4개·공통 seed 4곳, 프레임 9-mobile(1.17) 에서 판매처 3곳을 읽었다", () => {
    expect([NAME_MAX, CONTACT_MAX, WEBSITE_MAX, NOTE_MAX].every((n) => Number.isInteger(n) && n > 0)).toBe(true);
    expect(SEED.length).toBe(4);
    for (const s of SEED) expect(s.website).toMatch(HTTP);
    expect(FRAME_NAMES.length).toBe(3);
    expect(FRAME_SITES.length, "시안 행마다 웹사이트 줄").toBe(FRAME_NAMES.length);
    expect(frameText("vendor-info"), "시안 1.17 행에는 부가 정보(연락처 · note) 줄이 없다").toEqual([]);
    for (const info of D7_INFOS) expect(info).toMatch(/^\S+ · .+$/);
  });

  it("[K1][S9] 길이 상수 = d7 §12 (판매처명·연락처·웹사이트·부가 정보)", () => {
    expect(VENDOR_NAME_MAX).toBe(NAME_MAX);
    expect(VENDOR_CONTACT_MAX).toBe(CONTACT_MAX);
    expect(VENDOR_WEBSITE_MAX).toBe(WEBSITE_MAX);
    expect(VENDOR_NOTE_MAX).toBe(NOTE_MAX);
  });
});

describe("vendor rules: checkVendor 판매처명", () => {
  it("[K1][S9] 판매처명만 있으면 통과, 나머지는 null", () => {
    expect(ok({ name: FRAME_NAMES[0] })).toEqual({ name: FRAME_NAMES[0], contact: null, website: null, note: null });
  });

  it("[K1][S9] 판매처명 앞뒤 공백은 잘라서 저장", () => {
    expect(ok({ name: `  ${FRAME_NAMES[1]} \n` }).name).toBe(FRAME_NAMES[1]);
  });

  it.each([["빈 문자열", ""], ["공백만", "   "], ["탭·줄바꿈만", "\t\n"], ["null", null], ["undefined", undefined], ["숫자", 123]])(
    "[K1][S9] 판매처명 %s → 거부 (field = name, 안내 문구 있음)",
    (_label, name) => {
      const r = fail({ name });
      expect(r.field).toBe("name");
      expect(r.error.trim()).not.toBe("");
    },
  );

  it(`[K1][S9] 판매처명 ${NAME_MAX}자 통과 · ${NAME_MAX + 1}자 거부`, () => {
    expect(ok({ name: of(NAME_MAX) }).name).toBe(of(NAME_MAX));
    expect(fail({ name: of(NAME_MAX + 1) }).field).toBe("name");
  });

  it(`[K1][S9] 길이는 trim 뒤에 센다: 공백 + ${NAME_MAX}자 + 공백 통과`, () => {
    expect(ok({ name: `  ${of(NAME_MAX)}  ` }).name).toBe(of(NAME_MAX));
  });

  it("[K1][S9] 판매처명 1자 통과", () => {
    expect(ok({ name: "A" }).name).toBe("A");
  });
});

describe("vendor rules: checkVendor 연락처 · 부가 정보", () => {
  it(`[K1][S9] 연락처 ${CONTACT_MAX}자 통과 · ${CONTACT_MAX + 1}자 거부 (field = contact)`, () => {
    expect(ok({ name: "가", contact: of(CONTACT_MAX, "1") }).contact).toBe(of(CONTACT_MAX, "1"));
    expect(fail({ name: "가", contact: of(CONTACT_MAX + 1, "1") }).field).toBe("contact");
  });

  it.each([["빈 문자열", ""], ["공백만", "  "], ["null", null], ["undefined", undefined]])("[K1][S9] 연락처 %s → null", (_l, contact) => {
    expect(ok({ name: "가", contact }).contact).toBeNull();
  });

  it("[K1][S9] 연락처 앞뒤 공백은 잘라서 저장", () => {
    expect(ok({ name: "가", contact: " 043-221-4560 " }).contact).toBe("043-221-4560");
  });

  it(`[K1][S9] 부가 정보 ${NOTE_MAX}자 통과 · ${NOTE_MAX + 1}자 거부 (field = note)`, () => {
    expect(ok({ name: "가", note: of(NOTE_MAX) }).note).toBe(of(NOTE_MAX));
    expect(fail({ name: "가", note: of(NOTE_MAX + 1) }).field).toBe("note");
  });

  it.each([["빈 문자열", ""], ["공백만", "  "], ["null", null], ["undefined", undefined]])("[K1][S9] 부가 정보 %s → null", (_l, note) => {
    expect(ok({ name: "가", note }).note).toBeNull();
  });
});

describe("vendor rules: 웹사이트 주소 (null 또는 http(s):// 로 시작)", () => {
  it.each([["null", null], ["undefined", undefined], ["빈 문자열", ""], ["공백만", "   "]])("[K1][S9] 웹사이트 %s → null (웹사이트 없음)", (_l, website) => {
    expect(ok({ name: "가", website }).website).toBeNull();
    expect(normalizeWebsite(website)).toBeNull();
  });

  it.each(["https://www.sciencenara.co.kr", "http://example.com", "https://example.com/shop?q=1&b=2#top", ...SEED.map((s) => s.website)])(
    "[K1][S9] %s → 그대로 저장",
    (website) => {
      expect(ok({ name: "가", website }).website).toBe(website);
      expect(normalizeWebsite(website)).toBe(website);
    },
  );

  it("[K1][S9] 주소 앞뒤 공백은 잘라서 저장", () => {
    expect(ok({ name: "가", website: "  https://example.com  " }).website).toBe("https://example.com");
  });

  it(`[K1][S9] 웹사이트 ${WEBSITE_MAX}자 통과 · ${WEBSITE_MAX + 1}자 거부 (field = website)`, () => {
    expect(urlOfLength(WEBSITE_MAX)).toHaveLength(WEBSITE_MAX);
    expect(ok({ name: "가", website: urlOfLength(WEBSITE_MAX) }).website).toBe(urlOfLength(WEBSITE_MAX));
    expect(fail({ name: "가", website: urlOfLength(WEBSITE_MAX + 1) }).field).toBe("website");
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["JavaScript: (대문자 섞임)", "JaVaScRiPt:alert(1)"],
    ["앞 공백 + javascript:", "  javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["mailto:", "mailto:shop@example.com"],
    ["ftp:", "ftp://example.com/file"],
    ["file:", "file:///c:/windows"],
    ["vbscript:", "vbscript:msgbox(1)"],
    ["//host (스킴 생략)", "//example.com"],
    ["가운데 공백 (https)", "https://exa mple.com"],
    ["가운데 공백 (스킴 없음)", "www.exa mple.co.kr"],
    ["가운데 탭", "https://example.com/\tpath"],
    ["가운데 줄바꿈", "https://example.com/\npath"],
  ])("[K1][S9] 웹사이트 %s 거부 (field = website, 저장값 없음)", (_label, website) => {
    const r = fail({ name: "가", website });
    expect(r.field).toBe("website");
    expect(r.error.trim()).not.toBe("");
    expect(normalizeWebsite(website)).toBeUndefined();
  });

  it("[K1][S9] 문자열이 아닌 웹사이트 값은 거부", () => {
    expect(fail({ name: "가", website: 123 }).field).toBe("website");
    expect(fail({ name: "가", website: {} }).field).toBe("website");
  });

  it.each(["www.x.co.kr", "www.sciencenara.co.kr", "example.com/shop"])(
    '[K1][S9] 스킴 없이 적은 "%s": 거부하거나, 저장한다면 저장값이 http(s):// 로 시작하고 적은 주소를 담는다',
    (website) => {
      const r = checkVendor({ name: "가", website });
      if (r.ok) {
        expect(r.value.website).not.toBeNull();
        expect(r.value.website!).toMatch(HTTP);
        expect(r.value.website!).toContain(website);
        expect(isOpenableWebsite(r.value.website)).toBe(true);
      } else {
        expect(r.field).toBe("website");
      }
    },
  );

  it(`[K1][S9] 통과한 저장값은 언제나 null 이거나 http(s):// 로 시작하고 ${WEBSITE_MAX}자 이하 (스킴 없는 긴 주소 포함)`, () => {
    const inputs = [
      "",
      "www.x.co.kr",
      "x.kr",
      "https://x.kr",
      "http://x.kr",
      "localhost:3000",
      "example.com:8080/a",
      `www.${"a".repeat(WEBSITE_MAX - 12)}.co.kr`, // 스킴을 붙이면 한도를 넘는 길이
      `www.${"a".repeat(WEBSITE_MAX - 20)}.co.kr`,
      "a".repeat(WEBSITE_MAX),
    ];
    for (const website of inputs) {
      const r = checkVendor({ name: "가", website });
      if (!r.ok) {
        expect(r.field, website).toBe("website");
        continue;
      }
      if (r.value.website === null) continue;
      expect(r.value.website, website).toMatch(HTTP);
      expect(r.value.website.length, website).toBeLessThanOrEqual(WEBSITE_MAX);
      expect(/\s/.test(r.value.website), website).toBe(false);
    }
  });
});

describe("vendor rules: isOpenableWebsite (새 창으로 열 수 있는 값 = http(s) 만)", () => {
  it.each(["https://www.11st.co.kr", "http://example.com", "https://example.com/a?b=c", ...SEED.map((s) => s.website)])("[K1][S6] %s → true", (v) => {
    expect(isOpenableWebsite(v)).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["빈 문자열", ""],
    ["숫자", 1],
    ["객체", {}],
    ["javascript:", "javascript:alert(1)"],
    ["JAVASCRIPT:", "JAVASCRIPT:alert(1)"],
    ["data:", "data:text/html,hi"],
    ["mailto:", "mailto:a@b.c"],
    ["ftp:", "ftp://example.com"],
    ["//host", "//example.com"],
    ["스킴 없음", "www.x.co.kr"],
    ["앞 공백", " https://example.com"],
    ["가운데 공백", "https://exa mple.com"],
    ["줄바꿈", "https://example.com\n"],
    [`${WEBSITE_MAX + 1}자`, urlOfLength(WEBSITE_MAX + 1)],
  ])("[K1][S6] %s → false", (_label, v) => {
    expect(isOpenableWebsite(v)).toBe(false);
  });

  it(`[K1][S6] ${WEBSITE_MAX}자 http(s) 주소 → true`, () => {
    expect(isOpenableWebsite(urlOfLength(WEBSITE_MAX))).toBe(true);
  });
});

describe('vendor rules: 부가 정보 한 줄 = "연락처 · note"', () => {
  it("[K1][S6] d7 §12 틀 예시: 연락처 + note → \"연락처 · note\" 그대로", () => {
    for (const info of D7_INFOS) {
      const at = info.indexOf(" · ");
      const contact = info.slice(0, at);
      const note = info.slice(at + 3);
      expect(vendorInfo({ contact, note, website: null })).toBe(info);
      // 웹사이트가 있어도 연락처·note 가 있으면 같은 줄
      expect(vendorInfo({ contact, note, website: "https://example.com" })).toBe(info);
    }
  });

  it("[K1][S9] 연락처만 있으면 연락처만, note 만 있으면 note 만 (구분점 없음)", () => {
    expect(vendorInfo({ contact: "043-221-4560", note: null, website: null })).toBe("043-221-4560");
    expect(vendorInfo({ contact: null, note: "시약·실험 기구", website: null })).toBe("시약·실험 기구");
    expect(vendorInfo({ contact: "043-221-4560", note: "", website: null })).toBe("043-221-4560");
    expect(vendorInfo({ contact: "  ", note: "시약", website: null })).toBe("시약");
  });

  it("[K1][S9] 연락처·note·웹사이트가 모두 없으면 빈 문자열", () => {
    expect(vendorInfo({ contact: null, note: null, website: null })).toBe("");
    expect(vendorInfo({})).toBe("");
  });
});

describe("vendor rules: 화면 9 목록 행 부가 정보 = 연락처만 (d7 §18)", () => {
  it("[K1][S9] 연락처가 있으면 연락처만 — note·웹사이트는 보이지 않는다", () => {
    for (const info of D7_INFOS) {
      const contact = info.slice(0, info.indexOf(" · "));
      const note = info.slice(info.indexOf(" · ") + 3);
      const out = vendorContactInfo({ contact, note, website: "https://example.com" } as { contact: string });
      expect(out).toBe(contact);
      expect(out).not.toContain(note);
      expect(out).not.toContain("example.com");
    }
  });

  it("[K1][S9] 연락처가 없거나 공백뿐이면 빈 문자열 (note·웹사이트로 대신하지 않는다)", () => {
    expect(vendorContactInfo({ contact: null, note: "시약", website: "https://example.com" } as { contact: null })).toBe("");
    expect(vendorContactInfo({ contact: "  " })).toBe("");
    expect(vendorContactInfo({ contact: " 043-221-4560 " })).toBe("043-221-4560");
  });
});

describe("vendor rules: 같은 이름 판정 (대소문자·공백 무시)", () => {
  it.each([
    ["ABC 과학", "abc과학"],
    ["한빛 과학상사", "한빛과학상사"],
    [" 한빛  과학상사 ", "한빛 과학상사"],
    ["Green Chemical", "GREEN CHEMICAL"],
    ["G마켓", "g 마켓"],
    ["과학\t나라", "과학나라"],
  ])('[K1][S9] "%s" 와 "%s" 는 같은 이름', (a, b) => {
    expect(vendorNameKey(a)).toBe(vendorNameKey(b));
  });

  it("[K1][S9] 다른 이름은 다르다 (시안 판매처 + 공통 seed 4곳이 서로 다른 값)", () => {
    const names = [...FRAME_NAMES, ...SEED.map((s) => s.name)];
    expect(new Set(names.map(vendorNameKey)).size).toBe(names.length);
    expect(vendorNameKey("한빛 과학상사")).not.toBe(vendorNameKey("한빛 과학상회"));
  });
});

describe("vendor rules: 판매처명 검색 (부분 일치)", () => {
  const vendors = FRAME_NAMES.map((name, i) => ({ id: `v-${i}`, name }));

  it('[K1][S9] "과학" → 이름에 "과학" 이 든 판매처만, 원래 순서 그대로', () => {
    const want = FRAME_NAMES.filter((n) => n.includes("과학"));
    expect(want.length).toBeGreaterThan(0);
    expect(want.length).toBeLessThan(FRAME_NAMES.length);
    expect(filterVendors(vendors, "과학").map((v) => v.name)).toEqual(want);
  });

  it("[K1][S9] 이름 가운데·끝 글자로도 찾는다", () => {
    for (const name of FRAME_NAMES) {
      const mid = name.slice(1, 3);
      expect(filterVendors(vendors, mid).map((v) => v.name)).toEqual(FRAME_NAMES.filter((n) => n.includes(mid)));
      const tail = name.slice(-2);
      expect(filterVendors(vendors, tail).map((v) => v.name)).toContain(name);
    }
  });

  it("[K1][S9] 빈 검색어 = 전체, 맞는 것이 없으면 0건", () => {
    expect(filterVendors(vendors, "").map((v) => v.name)).toEqual(FRAME_NAMES);
    expect(filterVendors(vendors, "없는 판매처")).toEqual([]);
  });

  it("[K1][S9] 연락처·부가 정보가 아니라 판매처명으로만 찾는다", () => {
    const list = [{ name: "한빛 과학상사", contact: "02-555-0192", note: "시약" }];
    expect(filterVendors(list, "02-555")).toEqual([]);
    expect(filterVendors(list, "시약")).toEqual([]);
  });

  it("[K1][S9] 원본 배열을 바꾸지 않는다", () => {
    const copy = [...vendors];
    filterVendors(vendors, "과학");
    expect(vendors).toEqual(copy);
  });
});

describe("vendor rules: 판매처 연결 순서 (우리 학교 판매처 먼저, 그다음 공통 목록)", () => {
  const school = FRAME_NAMES.map((name, i) => ({ id: `s-${i}`, name, schoolId: "school-a" as string | null }));
  const common = SEED.map((s, i) => ({ id: `c-${i}`, name: s.name, schoolId: null as string | null }));
  const groupsOf = (list: { schoolId: string | null }[]) => list.map((v) => (v.schoolId === null ? "공통" : "학교"));

  it.each([
    ["공통이 앞에 온 입력", [...common, ...school]],
    [
      "번갈아 섞인 입력",
      Array.from({ length: Math.max(school.length, common.length) }, (_, i) => [common[i], school[i]]).flat().filter((v) => v !== undefined),
    ],
    ["이미 맞는 입력", [...school, ...common]],
  ])("[K1][S6] %s → 학교 판매처가 모두 공통 목록보다 앞", (_label, input) => {
    const out = orderVendorsForLink(input);
    expect(groupsOf(out)).toEqual([...school.map(() => "학교"), ...common.map(() => "공통")]);
    expect(out.map((v) => v.id).sort()).toEqual(input.map((v) => v.id).sort());
  });

  it("[K1][S6] 학교 판매처만·공통만·0개도 그대로 (빠지거나 늘지 않는다)", () => {
    expect(orderVendorsForLink(school).map((v) => v.id).sort()).toEqual(school.map((v) => v.id).sort());
    expect(groupsOf(orderVendorsForLink(common))).toEqual(common.map(() => "공통"));
    expect(orderVendorsForLink([])).toEqual([]);
  });

  it("[K1][S6] 원본 배열을 바꾸지 않는다", () => {
    const input = [...common, ...school];
    const copy = [...input];
    orderVendorsForLink(input);
    expect(input).toEqual(copy);
  });
});
