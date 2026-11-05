// d7 §30 새 컴포넌트 22개 (design/rules.json 1.30~1.32) — D1 단위 검사.
//   feature-intro-popup · feature-intro-dismiss · board-link · guide-link · footer-links · terms-agree · age-confirm
//   · privacy-consent-detail · privacy-link · privacy-doc · privacy-toc · privacy-table · board-tabs · faq-item · board-post-row
//   · board-status-badge · board-write · board-form · board-privacy-note · board-detail · board-answer · board-post-menu
// K1 = 폴더·data-component·갤러리(k1-components.test.ts 가 dev-rules components 로 이미 셈) + 여기서 rules 가 정한 문구·구성.
// T2 = 이 컴포넌트들의 CSS·TSX 가 토큰만 쓰는지 + 색 제한(핑크·하늘 없음, 그림자 없음).
// 기대 문구는 design/rules.json (feature_intro · privacy_consent · privacy_page · footer · guide · board · desktop_shell · manage)
// 과 harness/d7-data.md §30 에서 읽는다. 화면 연결(D3: /board · /privacy · 홈 팝업 · 가입 폼)은 여기서 보지 않는다.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOARD_BODY_MAX,
  BOARD_CATEGORIES,
  BOARD_HREF,
  BOARD_LABEL,
  BOARD_POST_CATEGORIES,
  BOARD_TEXT,
  BOARD_TITLE_MAX,
  boardAnsweredCaption,
  boardAuthorLabel,
} from "../../lib/board";
import { FEATURE_INTRO_TEXT } from "../../lib/feature-intro";
import { GUIDE_LABEL, GUIDE_LINK_PROPS } from "../../lib/guide-link";
import {
  PRIVACY_CONSENT_ITEMS,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_HREF,
  PRIVACY_LINK_LABEL,
  PRIVACY_OFFICER,
  PRIVACY_PROCESSORS,
  PRIVACY_SECTIONS,
  PRIVACY_TITLE,
} from "../../lib/privacy";
import {
  ROOT,
  aliasesIn,
  dev,
  normColor,
  read,
  refersTo,
  rel,
  resolveValue,
  rules,
  tokenVars,
  varsResolvingTo,
  walk,
} from "./helpers";

const NEW = [
  "feature-intro-popup",
  "feature-intro-dismiss",
  "board-link",
  "guide-link",
  "footer-links",
  "terms-agree",
  "age-confirm",
  "privacy-consent-detail",
  "privacy-link",
  "privacy-doc",
  "privacy-toc",
  "privacy-table",
  "board-tabs",
  "faq-item",
  "board-post-row",
  "board-status-badge",
  "board-write",
  "board-form",
  "board-privacy-note",
  "board-detail",
  "board-answer",
  "board-post-menu",
] as const;

const D7 = read(join(ROOT, "harness/d7-data.md"));
const D7_30 = (() => {
  const start = D7.indexOf("\n## 30.");
  const end = D7.indexOf("\n## ", start + 5);
  return D7.slice(start, end < 0 ? undefined : end);
})();

/** 작은따옴표 안 문구들 */
const quotes = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
/** 공백 무시 비교용 */
const squash = (s: string) => s.replace(/\s+/g, "");
/** 괄호 설명 지우기: 'FAQ(맨 앞, 고정)' → 'FAQ' */
const dropParens = (s: string) => s.replace(/\([^)]*\)/g, "").trim();

/** components/{이름}/ 의 소스 (주석 제거 안 함 — 구현 문구 확인용) */
function compSrc(name: string, exts = [".tsx", ".ts"]): string {
  return walk([`components/${name}`], exts)
    .map((f) => read(f))
    .join("\n");
}
/** 주석을 지운 소스 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}
function rendersComponent(src: string, componentDir: string, jsxName: string): boolean {
  const esc = componentDir.replace(/[-]/g, "\\-");
  const imported = new RegExp(`from\\s*["'](?:@/|\\.\\./)components/${esc}["']`).test(src);
  return imported && new RegExp(`<${jsxName}[\\s/>]`).test(src);
}

/* ───────── 기대값 원본 ───────── */

describe("§30 기대값 원본", () => {
  it(`[K1][S*] dev-rules components 에 새 ${NEW.length}개가 모두 있고 화면 번호가 붙음`, () => {
    const comps = dev.components as Record<string, number[]>;
    const missing = NEW.filter((n) => !Array.isArray(comps[n]) || comps[n].length === 0);
    expect(missing).toEqual([]);
  });

  it("[K1][S*] rules.json 1.32 이상에 feature_intro · privacy_consent · privacy_page · footer · guide · board 절이 있음", () => {
    expect(Number(rules.version)).toBeGreaterThanOrEqual(1.32);
    for (const k of ["feature_intro", "privacy_consent", "privacy_page", "footer", "guide", "board"]) {
      expect(rules[k], k).toBeTruthy();
    }
    expect(D7_30.length).toBeGreaterThan(0);
  });
});

/* ───────── 화면 13 신기능 소개 팝업 ───────── */

describe("feature-intro-popup · feature-intro-dismiss (rules feature_intro)", () => {
  const copy = rules.feature_intro.copy as { tag: string; title: string; steps: string[]; cta: string };
  const [dismissWeek, close] = quotes(rules.feature_intro.dismiss as string);

  it("[K1][S13] 문구 = rules feature_intro.copy (꼬리표 · 제목 · 단계 3줄 · 주 버튼)", () => {
    expect(FEATURE_INTRO_TEXT.tag).toBe(copy.tag);
    expect(FEATURE_INTRO_TEXT.title).toBe(copy.title);
    expect([...FEATURE_INTRO_TEXT.steps]).toEqual(copy.steps);
    expect(FEATURE_INTRO_TEXT.cta).toBe(copy.cta);
  });

  it(`[K1][S13] feature-intro-dismiss 문구 = rules feature_intro.dismiss 왼쪽 '${dismissWeek}' · 오른쪽 '${close}'`, () => {
    expect(FEATURE_INTRO_TEXT.dismissWeek).toBe(dismissWeek);
    expect(FEATURE_INTRO_TEXT.close).toBe(close);
    const src = codeOnly(compSrc("feature-intro-dismiss"));
    const iWeek = src.indexOf("FEATURE_INTRO_TEXT.dismissWeek");
    const iClose = src.indexOf("FEATURE_INTRO_TEXT.close");
    expect(iWeek, "dismissWeek 문구를 그리지 않음").toBeGreaterThan(-1);
    expect(iClose, "close 문구를 그리지 않음").toBeGreaterThan(-1);
    expect(iWeek, "왼쪽 = 일주일, 오른쪽 = 닫기").toBeLessThan(iClose);
  });

  it("[K1][S13] feature-intro-popup 순서 = rules feature_intro.order: 꼬리표 → 제목 → (그림) → 단계 → 주 버튼 → feature-intro-dismiss", () => {
    const src = codeOnly(compSrc("feature-intro-popup"));
    expect(rendersComponent(src, "feature-intro-dismiss", "FeatureIntroDismiss")).toBe(true);
    const order = [
      "FEATURE_INTRO_TEXT.tag",
      "FEATURE_INTRO_TEXT.title",
      "FEATURE_INTRO_TEXT.steps",
      "FEATURE_INTRO_TEXT.cta",
      "<FeatureIntroDismiss",
    ].map((t) => src.indexOf(t));
    expect(order.every((i) => i > -1), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("[K1][S13] feature-intro-popup 주 버튼 = button-primary (rules feature_intro.order '전폭 button-primary')", () => {
    const src = codeOnly(compSrc("feature-intro-popup"));
    expect(rendersComponent(src, "button-primary", "ButtonPrimary")).toBe(true);
  });
});

/* ───────── 화면 14 동의 펼침 ───────── */

describe("terms-agree · age-confirm · privacy-consent-detail · privacy-link (rules privacy_consent)", () => {
  const pc = rules.privacy_consent;
  const copy = pc.copy as Record<string, string>;
  /** rules privacy_consent.detail 의 순서 '수집 목적 → 수집 항목 → … → 보호책임자' */
  const ORDER = (() => {
    const m = /순서\s*=\s*([^.]+?)\.\s/.exec(pc.detail as string)!;
    return m[1].split("→").map((s) => s.trim());
  })();
  /** 순서별 rules copy 키 (officer 는 자리 표시라 d7 §30 값으로) */
  const COPY_KEYS = ["purpose", "items", "period", "processors", "refuse", "officer"];
  const OFFICER = /보호책임자\s*=\s*'([^']+)'/.exec(D7_30)![1];

  it(`[K1][S14] privacy-consent-detail 항목 제목·순서 = rules privacy_consent.detail (${ORDER.join(" → ")})`, () => {
    expect(ORDER.length).toBe(COPY_KEYS.length);
    expect(PRIVACY_CONSENT_ITEMS.map((i) => i.title)).toEqual(ORDER);
  });

  it("[K1][S14] privacy-consent-detail 본문 = rules privacy_consent.copy (목적 · 항목 · 기간 · 위탁 · 거부 권리)", () => {
    COPY_KEYS.slice(0, 5).forEach((k, i) => {
      expect(PRIVACY_CONSENT_ITEMS[i]?.body, k).toBe(copy[k]);
    });
  });

  it(`[K1][S14] 보호책임자 = d7 §30 '${OFFICER}' (rules copy.officer 자리 표시 '{…}' 가 남지 않음)`, () => {
    expect(PRIVACY_OFFICER).toBe(OFFICER);
    expect(PRIVACY_CONSENT_ITEMS[5]?.body).toBe(OFFICER);
    expect(PRIVACY_CONSENT_ITEMS.some((i) => /[{}]/.test(i.body))).toBe(false);
  });

  it("[K1][S14] privacy-consent-detail = 항목 목록(표 아님) + 마지막 줄 privacy-link", () => {
    const src = codeOnly(compSrc("privacy-consent-detail"));
    expect(src).toContain("PRIVACY_CONSENT_ITEMS");
    expect(rendersComponent(src, "privacy-link", "PrivacyLink")).toBe(true);
    expect(src).not.toMatch(/<table|DataTable/);
    const iList = src.search(/\.map\(/);
    const iLink = src.indexOf("<PrivacyLink");
    expect(iList).toBeGreaterThan(-1);
    expect(iLink, "privacy-link 가 항목 뒤 마지막 줄").toBeGreaterThan(iList);
  });

  it("[K1][S14] privacy-link 문구 = rules privacy_consent.link · 주소 = privacy_page.path · 새 탭", () => {
    const [label] = quotes(pc.link as string); // '개인정보 처리방침 전문 보기 ↗'
    expect(`${PRIVACY_LINK_LABEL} ↗`).toBe(label);
    expect(PRIVACY_HREF).toBe(rules.privacy_page.path);
    const src = codeOnly(compSrc("privacy-link"));
    expect(src).toContain("PRIVACY_LINK_LABEL");
    expect(src).toMatch(/PRIVACY_LINK_LABEL\}\s*↗/);
    expect(src).toMatch(/target=["']_blank["']/);
  });

  it("[K1][S14] age-confirm 라벨·펼침 한 줄 = rules privacy_consent.age_confirm", () => {
    const ac = pc.age_confirm as { component: string; label: string; detail: string };
    expect(ac.component).toBe("age-confirm");
    const [line] = quotes(ac.detail);
    const src = compSrc("age-confirm");
    expect(src).toContain(`"${ac.label}"`);
    expect(src).toContain(`"${line}"`);
  });

  it("[K1][S14] terms-agree 행 = rules privacy_consent.rows (모두 동의 · 이용약관(필수) · 개인정보(필수)) + age-confirm + privacy-consent-detail", () => {
    const rows = /terms-agree\s*=\s*(.+?)\s*\+\s*age-confirm/.exec(pc.rows as string)![1].split("+").map((s) => s.trim());
    expect(rows.length).toBe(3);
    const src = codeOnly(compSrc("terms-agree"));
    const flat = squash(src);
    for (const r of rows) expect(flat, r).toContain(squash(r));
    expect(rendersComponent(src, "age-confirm", "AgeConfirm")).toBe(true);
    expect(rendersComponent(src, "privacy-consent-detail", "PrivacyConsentDetail")).toBe(true);
  });
});

/* ───────── 화면 19 처리방침 ───────── */

describe("privacy-doc · privacy-toc · privacy-table (rules privacy_page · d7 §30)", () => {
  const pp = rules.privacy_page;
  /** '1 수집 목적 · 2 수집 항목 · … · 7 시행일' */
  const SECTIONS = (() => {
    const m = /번호 절[^:]*:\s*(.+)$/.exec(pp.doc as string)!;
    return m[1].split(" · ").map(dropParens);
  })();
  const EFFECTIVE = /시행일\s*(\d{4}-\d{2}-\d{2})/.exec(D7_30)![1];

  it(`[K1][S19] 제목 = rules privacy_page.doc '${quotes(pp.doc as string)[0]}'`, () => {
    expect(PRIVACY_TITLE).toBe(quotes(pp.doc as string)[0]);
  });

  it(`[K1][S19] 절 = rules privacy_page.doc 순서 (${SECTIONS.join(" · ")})`, () => {
    expect(SECTIONS.length).toBe(7);
    expect(PRIVACY_SECTIONS.map((s) => s.title)).toEqual(SECTIONS);
  });

  it("[K1][S19] privacy-table 은 4절(처리 위탁·국외 이전)에만", () => {
    const withTable = PRIVACY_SECTIONS.filter((s) => s.table).map((s) => s.title);
    expect(withTable).toEqual([SECTIONS[3]]);
  });

  it(`[K1][S19] 시행일 = d7 §30 '${EFFECTIVE}' · 7절 본문에 같은 날짜 · 6절 = 보호책임자`, () => {
    expect(PRIVACY_EFFECTIVE_DATE).toBe(EFFECTIVE);
    expect(PRIVACY_SECTIONS[6].paragraphs.join(" ")).toContain(EFFECTIVE);
    expect(PRIVACY_SECTIONS[5].paragraphs).toContain(PRIVACY_OFFICER);
  });

  it("[K1][S19] 4절 국외 이전 고지 = d7 §30 항목(국가·받는 자·항목·시기·방법·보유 기간·거부 방법과 결과) 문장으로", () => {
    const s4 = PRIVACY_SECTIONS[3];
    const text = [...s4.paragraphs, ...(s4.after ?? [])].join("\n");
    for (const word of ["미국", "Google", "이전 항목", "시기", "방법", "보유", "거부"]) expect(text, word).toContain(word);
  });

  it("[K1][S19] privacy-table 업체 = rules privacy_consent.copy.processors (Supabase · Vercel · Google Gemini, 하는 일 · 위치)", () => {
    const parts = (rules.privacy_consent.copy.processors as string).split(" · ").map((p) => {
      const m = /^([^(]+)\((.+)\)$/.exec(p.trim())!;
      return { name: m[1].trim(), inner: m[2] };
    });
    expect(PRIVACY_PROCESSORS.map((p) => p.name)).toEqual(parts.map((p) => p.name));
    PRIVACY_PROCESSORS.forEach((p, i) => {
      expect(parts[i].inner.startsWith(p.role.split("(")[0]), `${p.name} 하는 일`).toBe(true);
      const loc = p.location.split("(")[0];
      expect(parts[i].inner, `${p.name} 위치`).toContain(loc);
    });
  });

  it("[K1][S19] privacy-table 데스크톱 열 = rules privacy_page.table '업체 · 하는 일 · 위치'", () => {
    const m = /열\s+(.+?)\s*,\s*mobile/.exec(pp.table as string)!;
    const cols = m[1].split(" · ").map((s) => s.trim());
    const src = codeOnly(compSrc("privacy-table"));
    const idx = cols.map((c) => src.indexOf(`"${c}"`));
    expect(idx.every((i) => i > -1), JSON.stringify(cols)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("[K1][S19] privacy-doc = 제목 → 시행일 → privacy-toc → 절(4절에 privacy-table)", () => {
    const src = codeOnly(compSrc("privacy-doc"));
    expect(rendersComponent(src, "privacy-toc", "PrivacyToc")).toBe(true);
    expect(rendersComponent(src, "privacy-table", "PrivacyTable")).toBe(true);
    expect(src).toContain("PRIVACY_SECTIONS");
    expect(src.indexOf("<PrivacyToc")).toBeLessThan(src.indexOf("<PrivacyTable"));
  });
});

/* ───────── 화면 15·19 footer · 사용 가이드 ───────── */

describe("footer-links · guide-link (rules footer · guide)", () => {
  it(`[K1][S15] [K1][S19] footer-links 라벨·순서 = rules footer.links (${(rules.footer.links as string[]).join(" · ")})`, () => {
    const links = rules.footer.links as string[];
    expect(rules.footer.component).toBe("footer-links");
    expect([PRIVACY_TITLE, GUIDE_LABEL]).toEqual(links);
    const src = codeOnly(compSrc("footer-links"));
    const iP = src.indexOf("{PRIVACY_TITLE}");
    const iG = src.indexOf("{GUIDE_LABEL}");
    expect(iP).toBeGreaterThan(-1);
    expect(iG).toBeGreaterThan(iP);
  });

  it("[K1][S15] [K1][S19] footer-links: 처리방침 = privacy_page.path · 사용 가이드 = 새 탭", () => {
    const src = codeOnly(compSrc("footer-links"));
    expect(src).toMatch(/href=\{PRIVACY_HREF\}/);
    expect(src).toContain("GUIDE_LINK_PROPS");
    expect(GUIDE_LINK_PROPS.target).toBe("_blank");
  });

  it(`[K1][S*] guide-link 라벨 = rules guide.label '${rules.guide.label}' · 새 탭 · ↗(external 아이콘)`, () => {
    expect(rules.guide.component).toBe("guide-link");
    expect(GUIDE_LABEL).toBe(rules.guide.label);
    expect(GUIDE_LINK_PROPS.target).toBe("_blank");
    const src = codeOnly(compSrc("guide-link"));
    expect(src).toContain("GUIDE_LINK_PROPS");
    expect(src).toContain("{GUIDE_LABEL}");
    // sidebar · row 두 모양 모두 ↗ (external)
    expect((src.match(/name="external"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // sidebar-item · manage-row 이름을 달지 않음 (메뉴 수 = desktop_shell.menu)
    expect(src).not.toMatch(/data-component=["'](sidebar-item|manage-row)["']/);
  });
});

/* ───────── 화면 18·20 게시판 진입 ───────── */

describe("board-link (rules desktop_shell.board_link · manage.guide)", () => {
  const [label] = quotes(rules.desktop_shell.board_link as string);
  const [captionExample] = quotes(rules.manage.guide as string).filter((q) => /\d/.test(q));

  it(`[K1][S18] [K1][S20] board-link 라벨 = '${label}' · 주소 = rules board.paths.list`, () => {
    expect(BOARD_LABEL).toBe(label);
    expect(BOARD_HREF).toBe(rules.board.paths.list);
    const src = codeOnly(compSrc("board-link"));
    expect(src).toContain("{BOARD_LABEL}");
    expect(src).not.toMatch(/data-component=["'](sidebar-item|manage-row)["']/);
  });

  it(`[K1][S18] board-link 요약 caption = rules manage.guide 예 '${captionExample}' · 0 이면 없음 (d7 §30)`, () => {
    const n = Number(/\d+/.exec(captionExample)![0]);
    expect(boardAnsweredCaption(n)).toBe(captionExample);
    expect(boardAnsweredCaption(0)).toBeNull();
    expect(boardAnsweredCaption(3)).toBe(captionExample.replace(/\d+/, "3"));
  });
});

/* ───────── 화면 20 게시판 ───────── */

describe("board-* (rules board · d7 §30)", () => {
  const b = rules.board;

  it("[K1][S20] board-tabs = segmented-control 3칸, 라벨·순서 = rules board.tabs · 값 = d7 §30 category", () => {
    const m = /3칸\s+(.+?)\.\s/.exec(b.tabs as string)!;
    const labels = m[1].split(" · ").map(dropParens);
    expect(BOARD_CATEGORIES.map((c) => c.label)).toEqual(labels);
    const dbValues = /category text check ∈ \{([^}]+)\}/.exec(D7_30)![1].split(",").map((s) => s.trim());
    expect(BOARD_CATEGORIES.map((c) => c.value)).toEqual(dbValues);
    const src = codeOnly(compSrc("board-tabs"));
    expect(rendersComponent(src, "segmented-control", "SegmentedControl")).toBe(true);
    expect(src).toContain("BOARD_CATEGORIES");
    expect(src).toMatch(/defaultValue\s*=\s*["']faq["']/); // 목록 기본 = FAQ
  });

  it("[K1][S20] board-form 분류 = rules board.form '오류 문의 · 개선 제안 — FAQ 없음'", () => {
    const m = /분류\(([^—)]+)—\s*FAQ 없음\)/.exec(b.form as string)!;
    const labels = m[1].split(" · ").map((s) => s.trim());
    expect(BOARD_POST_CATEGORIES.map((c) => c.label)).toEqual(labels);
    expect(BOARD_POST_CATEGORIES.some((c) => c.value === "faq")).toBe(false);
  });

  it("[K1][S20] board-form 순서 = 분류 → 제목 → board-privacy-note → 본문 → button-primary '등록'", () => {
    const [submit] = quotes(b.form as string);
    expect(BOARD_TEXT.submit).toBe(submit);
    const src = codeOnly(compSrc("board-form"));
    expect(rendersComponent(src, "board-privacy-note", "BoardPrivacyNote")).toBe(true);
    expect(rendersComponent(src, "button-primary", "ButtonPrimary")).toBe(true);
    const order = ["<SegmentedControl", "<TextInput\n", "<BoardPrivacyNote", "<TextInputArea", "<ButtonPrimary"].map((t) =>
      src.indexOf(t),
    );
    expect(order.every((i) => i > -1), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, c) => a - c)).toEqual(order);
    expect(src).toMatch(/submitLabel\s*=\s*BOARD_TEXT\.submit/);
  });

  it("[K1][S20] board-form 제목·본문 길이 = d7 §30 board_posts (1~N자)", () => {
    const t = /title text\(1~(\d+)자\)/.exec(D7_30)!;
    const bd = /body text\(1~(\d+)자\)/.exec(D7_30)!;
    expect(BOARD_TITLE_MAX).toBe(Number(t[1]));
    expect(BOARD_BODY_MAX).toBe(Number(bd[1]));
    const src = codeOnly(compSrc("board-form"));
    expect(src).toContain("maxLength={BOARD_TITLE_MAX}");
    expect(src).toContain("maxLength={BOARD_BODY_MAX}");
  });

  it("[K1][S20] board-privacy-note 문구 = rules board.form 따옴표 문구 · 정보 아이콘", () => {
    const note = quotes(b.form as string).find((q) => q.includes("개인정보"))!;
    expect(BOARD_TEXT.privacyNote).toBe(note);
    const src = codeOnly(compSrc("board-privacy-note"));
    expect(src).toContain("BOARD_TEXT.privacyNote");
    expect(src).toMatch(/name="info"/);
  });

  it("[K1][S20] board-status-badge 라벨 = rules board.status ('접수' · '답변 완료')", () => {
    const [received, answered] = quotes(b.status as string);
    expect(BOARD_TEXT.statusReceived).toBe(received);
    expect(BOARD_TEXT.statusAnswered).toBe(answered);
    const src = codeOnly(compSrc("board-status-badge"));
    expect(src).toContain("BOARD_TEXT.statusAnswered");
    expect(src).toContain("BOARD_TEXT.statusReceived");
  });

  it(`[K1][S20] board-write 라벨 = rules board.write '${quotes(b.write as string)[0]}' · button-primary`, () => {
    expect(BOARD_TEXT.write).toBe(quotes(b.write as string)[0]);
    const src = codeOnly(compSrc("board-write"));
    expect(rendersComponent(src, "button-primary", "ButtonPrimary")).toBe(true);
    expect(src).toContain("BOARD_TEXT.write");
  });

  it("[K1][S20] 글쓴이 = 학교명 + ' 선생님' (rules board.author 예)", () => {
    const example = quotes(b.author as string).find((q) => /\S+\s+선생님$/.test(q))!;
    const school = example.replace(/\s*선생님$/, "");
    expect(boardAuthorLabel(school)).toBe(example);
  });

  it("[K1][S20] board-detail = 분류 → 제목 → 글쓴이·날짜 + board-status-badge → 본문, 답 있으면 board-answer", () => {
    const src = codeOnly(compSrc("board-detail"));
    expect(rendersComponent(src, "board-status-badge", "BoardStatusBadge")).toBe(true);
    // board-answer 는 board-detail 안에서 그리거나 부르는 쪽이 아래에 붙인다 — 어느 쪽이든 board-answer 머리 문구는 rules 대로
    const [head] = quotes(b.detail as string);
    expect(BOARD_TEXT.answerHead).toBe(head);
    const ans = codeOnly(compSrc("board-answer"));
    expect(ans).toContain("BOARD_TEXT.answerHead");
  });

  it("[K1][S20] board-post-row = 제목 줄 + 아래 줄 오른쪽 board-status-badge", () => {
    const src = codeOnly(compSrc("board-post-row"));
    expect(rendersComponent(src, "board-status-badge", "BoardStatusBadge")).toBe(true);
  });

  it("[K1][S20] faq-item = 펼침(› / ⌄) · 글쓴이·상태 배지 없음 (rules board.faq)", () => {
    const src = codeOnly(compSrc("faq-item"));
    expect(src).toMatch(/chevron-down/);
    expect(src).toMatch(/chevron-right/);
    expect(src).toMatch(/aria-expanded/);
    expect(src).not.toMatch(/BoardStatusBadge|board-status-badge/);
  });

  it("[K1][S20] board-post-menu = 수정 · 삭제, 답변 뒤 이유 = rules board.own_post 문구", () => {
    const own = b.own_post as string;
    expect(own).toContain(`${BOARD_TEXT.edit} · ${BOARD_TEXT.delete}`);
    const reason = quotes(own).find((q) => q.includes("답변"))!;
    expect(BOARD_TEXT.editLocked).toBe(reason);
    const src = codeOnly(compSrc("board-post-menu"));
    for (const k of ["BOARD_TEXT.edit", "BOARD_TEXT.delete", "BOARD_TEXT.editLocked"]) expect(src, k).toContain(k);
  });

  it("[K1][S20] 빈 목록 문구 = rules board.empty · 토스트 = d7 §30 '글을 올렸어요' · '글을 삭제했어요'", () => {
    expect(BOARD_TEXT.empty).toBe(quotes(b.empty as string)[0]);
    const toasts = quotes(D7_30).filter((q) => /^글을 .+어요$/.test(q));
    expect(toasts).toContain(BOARD_TEXT.posted);
    expect(toasts).toContain(BOARD_TEXT.deleted);
  });

  it("[K1][S20] board-detail 숨긴 글 표시 = d7 §30 '숨긴 글' caption", () => {
    expect(quotes(D7_30)).toContain(BOARD_TEXT.hidden);
    expect(codeOnly(compSrc("board-detail"))).toContain("BOARD_TEXT.hidden");
  });
});

/* ───────── T2 토큰만 · 색 제한 ───────── */

describe("§30 컴포넌트 토큰 (T2)", () => {
  const vars = tokenVars();
  const highlightVars = varsResolvingTo(vars, rules.colors.highlight.values);
  const accentVars = varsResolvingTo(vars, [rules.colors.accent.value, rules.colors.accent_soft.value]);
  const patterns = Object.entries(dev.scan.T2_patterns as Record<string, string>);
  const allow: string = dev.scan.T2_allow_line;

  /** 파일에서 names(+로컬 별칭) 를 참조하는 줄 (pred 로 줄 거르기) */
  function refLines(src: string, names: Set<string>, skip: (line: string) => boolean = () => false): string[] {
    const all = aliasesIn(src, names);
    const out: string[] = [];
    src.split("\n").forEach((line, i) => {
      if (skip(line)) return;
      if ([...all].some((n) => refersTo(line, n))) out.push(`${i + 1}: ${line.trim()}`);
    });
    return out;
  }
  const cssOf = (name: string) => walk([`components/${name}`], [".css"]);

  it.each(NEW)("[T2][S*] components/%s: hex·px·rgb 직접 값 0 (dev-rules scan.T2_patterns)", (name) => {
    const files = walk([`components/${name}`], dev.scan.T2_exts as string[]);
    expect(files.length, `components/${name} 소스 없음`).toBeGreaterThan(0);
    const out: string[] = [];
    for (const f of files) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          if (line.includes(allow)) return;
          for (const [pname, src] of patterns) {
            for (const m of line.matchAll(new RegExp(src, "g"))) out.push(`${rel(f)}:${i + 1} ${pname} ${m[0]}`);
          }
        });
    }
    expect(out).toEqual([]);
  });

  it.each(NEW)("[T2][S*] components/%s: 핑크(colors.accent·accent_soft) 토큰 0 — rules accent.only_within 밖", (name) => {
    const only = new Set<string>([...rules.colors.accent.only_within, ...rules.colors.accent_soft.only_within]);
    expect(only.has(name)).toBe(false);
    const out = cssOf(name).flatMap((f) => refLines(read(f), accentVars).map((l) => `${rel(f)} ${l}`));
    expect(out).toEqual([]);
  });

  // feature_intro.style 은 '핑크 없음' 만 정함 (하늘 제한 없음) → 여기 넣지 않는다
  it.each(["board-status-badge", "board-privacy-note", "privacy-link"])(
    "[T2][S*] components/%s: 하늘색(colors.highlight) 은 포커스 outline 에만 — 글자·바탕·테두리 0 (rules '핑크·하늘 없음' · 'highlight 아님')",
    (name) => {
      const out = cssOf(name).flatMap((f) =>
        refLines(read(f), highlightVars, (line) => /^\s*outline(-color)?\s*:/.test(line)).map((l) => `${rel(f)} ${l}`),
      );
      expect(out).toEqual([]);
    },
  );

  it("[T2][S20] board-status-badge 무채색: '답변 완료' 글자 = colors.on_primary · '접수'·'답변 완료' 바탕이 다름 · 둘 다 allowed 색", () => {
    const [f] = cssOf("board-status-badge");
    expect(f && existsSync(f)).toBe(true);
    const css = read(f);
    const block = (cls: string) => new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
    const prop = (body: string, p: string) => new RegExp(`(?:^|[;\\s])${p}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? "";
    const resolve = (v: string) => normColor(resolveValue(v, vars));
    const answered = block("answered");
    const received = block("received");
    const ansBg = resolve(prop(answered, "background(?:-color)?"));
    const recBg = resolve(prop(received, "background(?:-color)?"));
    expect(resolve(prop(answered, "color"))).toBe(normColor(rules.colors.on_primary.value));
    expect(ansBg).not.toBe(recBg);
    const allowed = new Set((rules.colors.allowed as string[]).map(normColor));
    const chromatic = new Set([...rules.colors.highlight.values, rules.colors.accent.value, rules.colors.accent_soft.value].map(normColor));
    for (const c of [ansBg, recBg, resolve(prop(received, "color"))]) {
      expect(allowed.has(c), c).toBe(true);
      expect(chromatic.has(c), `${c} 는 무채색이 아님`).toBe(false);
    }
  });

  it("[T2][S13] feature-intro-popup 그림자 없음 (rules feature_intro.style · effects) — box-shadow 는 none 만", () => {
    const out = cssOf("feature-intro-popup").flatMap((f) =>
      read(f)
        .split("\n")
        .map((line, i) => [line, i] as const)
        .filter(([line]) => {
          const m = /box-shadow\s*:\s*([^;]+)/.exec(line);
          return m !== null && resolveValue(m[1].trim(), vars).trim() !== "none";
        })
        .map(([line, i]) => `${rel(f)}:${i + 1} ${line.trim()}`),
    );
    expect(out).toEqual([]);
  });
});
