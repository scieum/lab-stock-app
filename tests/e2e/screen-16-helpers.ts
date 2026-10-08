// 화면 16 (MSDS 요약, dev-rules.json routes["16"]·["16-guest"]) e2e 공용 도우미.
// 기준: harness/d7-data.md §22, design/rules.json 1.21 msds_summary·screens_required 16·variants 16·colors.allowed_rgba·tab_bar·never.N2,
//       design/frames/16-mobile.json (데스크톱은 이번 run 에서 전용 화면 가운데 한 열 — 16-desktop 드로어 시안은 데스크톱 run 에서 비교).
// 문구·개수·색은 위 원본에서 읽는다 (테스트에 하드코딩하지 않는다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { framePath } from "../frames";

export const SCREEN = 16;
export const SUMMARY = "msds-summary";
export const GHS = "ghs-pictogram";
export const ORIGINAL = "msds-original-link";
export const SKELETON = "msds-skeleton";
export const EMPTY = "ex-empty-state-card";
export const OUTLINE = "button-outline";
export const ENTRY = "msds-entry";

// ---------- 원본 ----------
const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
export const S22 = (() => {
  const s = D7.indexOf("## 22.");
  if (s < 0) throw new Error("harness/d7-data.md §22 없음");
  const e = D7.indexOf("\n## ", s + 5);
  return D7.slice(s, e < 0 ? undefined : e);
})();
const row22 = (head: string) => {
  const l = S22.split(/\r?\n/).find((x) => x.startsWith(`| ${head} |`));
  if (!l) throw new Error(`d7 §22 '${head}' 행 없음`);
  return l;
};

type MsdsSummaryRules = { screen: number; sections: string; states: string; original_link: string; pictogram: string; signal_word: string };
export const MS = (rules as unknown as { msds_summary: MsdsSummaryRules }).msds_summary;
export const REQUIRED: string[] = (rules as unknown as { screens_required: Record<string, string[]> }).screens_required[String(SCREEN)] ?? [];
export const VARIANTS: Record<string, string[]> = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)] ?? {};
export const MIN_H = (rules as unknown as { button: { min_height: number } }).button.min_height;
export const N2 = (rules as unknown as { never: { N2: { banned_terms: string[]; key_value_pattern: string } } }).never.N2;
export const TAB = rules.tab_bar as unknown as { component: string; item: string; items: number; labels: string[]; mobile_screens: number[] };

/** colors.allowed_rgba 중 only_in = ghs-pictogram 인 색 (#ff0000) */
export const GHS_RED_HEX = (() => {
  const list = (rules as unknown as { colors: { allowed_rgba: { value: string; only_in: string }[] } }).colors.allowed_rgba ?? [];
  const r = list.find((x) => x.only_in === GHS);
  if (!r) throw new Error("rules.json colors.allowed_rgba 에 ghs-pictogram 색 없음");
  return r.value;
})();
export const rgbOf = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
export const GHS_RED = rgbOf(GHS_RED_HEX);

type FrameNode = { name: string; type: string; path: string[]; fills: string[]; strokes: string[]; width?: number; height?: number; text: { characters: string } | null };
export const F16: FrameNode[] = (JSON.parse(readFileSync(framePath(`${SCREEN}-mobile`), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const parentIs = (n: FrameNode, p: string) => n.path[n.path.length - 2] === p;
const textOf = (pred: (n: FrameNode) => boolean, what: string) => {
  const n = F16.find((x) => x.text && pred(x));
  if (!n) throw new Error(`프레임 16-mobile 에서 ${what} 를 찾지 못함`);
  return n.text!.characters;
};
export const FRAME = {
  title: textOf((n) => n.name === "title" && n.path.includes("nav-pill"), "nav 제목"),
  source: textOf((n) => n.name === "source-line", "출처 줄"),
  signalCaption: textOf((n) => n.name === "caption" && parentIs(n, "signal-word-row"), "신호어 캡션"),
  signal: textOf((n) => n.name === "label" && parentIs(n, "signal-word"), "신호어"),
  signalFill: F16.find((n) => n.name === "signal-word")?.fills[0] ?? "",
  signalText: F16.find((n) => n.name === "label" && parentIs(n, "signal-word"))?.fills[0] ?? "",
  more: textOf((n) => n.name === "label" && parentIs(n, "more-toggle"), "더 보기"),
  original: textOf((n) => n.name === "label" && n.path.includes(ORIGINAL), "원문 보기"),
  sectionTitles: F16.filter((n) => n.name === "section-title" && n.text).map((n) => n.text!.characters),
  /** 항목별 요약 줄 (시안 순서) */
  sectionLines: (() => {
    const out: string[][] = [];
    for (const n of F16) {
      if (n.name === "msds-section") out.push([]);
      else if (n.name === "line" && n.text && n.path.includes("msds-section")) out[out.length - 1].push(n.text.characters);
    }
    return out;
  })(),
  ghsCaptions: F16.filter((n) => n.name === "caption" && n.text && n.path.includes(GHS)).map((n) => n.text!.characters),
  ghsCaptionFill: F16.find((n) => n.name === "caption" && n.path.includes(GHS))?.fills[0] ?? "",
  diamondFill: F16.find((n) => n.name === "diamond")?.fills[0] ?? "",
  diamondStroke: F16.find((n) => n.name === "diamond")?.strokes[0] ?? "",
  symbolColor: (() => {
    const s = F16.find((n) => n.name === "symbol");
    return (s?.fills[0] ?? s?.strokes[0] ?? "") as string;
  })(),
  ghsWidth: F16.find((n) => n.name === GHS)?.width ?? NaN,
  diamondBox: F16.find((n) => n.name === "diamond-box")?.width ?? NaN,
  /** 시안의 활성 탭 = 라벨 글자가 ink 인 tab-item */
  activeTab: (() => {
    const labels = F16.filter((n) => n.name === "label" && n.path.includes("tab-item") && n.text);
    const ink = FRAME_INK();
    return labels.find((n) => (n.fills[0] ?? "").toLowerCase() === ink)?.text?.characters ?? "";
  })(),
};
function FRAME_INK(): string {
  return (F16.find((n) => n.name === "section-title")?.fills[0] ?? "").toLowerCase();
}
export const INK = FRAME_INK();

/** rules.json msds_summary.states 의 실패 · 내용 없음 문구 */
export const FAIL_TEXT = (() => {
  const m = /16-fail = ex-empty-state-card '([^']+)'/.exec(MS.states);
  if (!m) throw new Error("rules.json msds_summary.states 에서 16-fail 문구를 읽지 못함");
  return m[1];
})();
export const EMPTY_TEXT = (() => {
  const m = /무채색 '([^']+)'/.exec(MS.states);
  if (!m) throw new Error("rules.json msds_summary.states 에서 '내용 없음' 문구를 읽지 못함");
  return m[1];
})();
/** rules.json sections: 요약 N줄 */
export const PREVIEW_LINES = Number((/요약 (\d+)줄/.exec(MS.sections) ?? [])[1]);
export const SECTION_TITLES = MS.sections.split(" — ")[0].split(" · ").map((s) => s.trim());

/** d7 §22 GHS 9종 이름 (괄호 설명 뺌), 시안 캡션이 그 이름을 품으면 캡션 */
export const GHS_NAMES: string[] = (() => {
  const m = /GHS01~GHS09 (\d+)종: ([^.]+)\./.exec(row22("표시"));
  if (!m) throw new Error("d7 §22 표시 행에서 GHS 9종을 읽지 못함");
  const names = m[2].split("·").map((s) => s.replace(/\(.*?\)/g, "").trim());
  expect(names.length, "d7 §22 GHS N종").toBe(Number(m[1]));
  return names.map((n) => FRAME.ghsCaptions.find((c) => c === n || c.endsWith(n)) ?? n);
})();

/** d7 §22 공단 상세 주소 꼴 (chem_id 를 붙여 쓴다) */
export const KOSHA_DETAIL = (() => {
  const m = /`(msds\.kosha\.or\.kr\/[^`?]+)\?chem_id=/.exec(row22("요약 대상"));
  if (!m) throw new Error("d7 §22 요약 대상에서 공단 상세 주소를 읽지 못함");
  return `https://${m[1]}`;
})();
export const koshaUrl = (chemId: string) => `${KOSHA_DETAIL}?chem_id=${chemId}`;

// ---------- 경로 ----------
const withId = (route: string, id: string) => route.replace(/\[[^\]]+\]/, id);
export const msdsPath = (id: string) => withId(routeOf(SCREEN), id);
export const guestMsdsPath = (id: string) => withId(devRules.routes[`${SCREEN}-guest`], id);
export const reagentPath = (id: string) => withId(routeOf(3), id);
export const guestReagentPath = (id: string) => withId(devRules.routes["3-guest"], id);

/** 화면 16 에 있어도 되는 컴포넌트 = 프레임 16-mobile 의 이름 ∪ variants 16 ∪ dev-rules components 16 (dev-rules components 이름만) */
export function allowedComponents(extra: string[] = []): Set<string> {
  const known = new Set(Object.keys(devRules.components));
  const out = new Set<string>();
  for (const n of F16) if (known.has(n.name)) out.add(n.name);
  for (const list of Object.values(VARIANTS)) for (const c of list) out.add(c);
  for (const [c, screens] of Object.entries(devRules.components)) if (screens.includes(SCREEN)) out.add(c);
  for (const c of extra) out.add(c);
  return out;
}

/** dev-rules components 중 문서에 있는데 화면 16 에 없어야 하는 것 */
export async function foreignOnPage(page: Page, allowed: Set<string>): Promise<Record<string, number>> {
  const names = Object.keys(devRules.components).filter((c) => !allowed.has(c));
  const counts = await page.evaluate(
    (list) => Object.fromEntries(list.map((n) => [n, document.querySelectorAll(`[data-component="${n}"]`).length])),
    names,
  );
  return Object.fromEntries(Object.entries(counts).filter(([, v]) => v > 0));
}

// ---------- 요소 ----------
export const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
export const originalLink = (page: Page) => page.locator(`${sel(ORIGINAL)} a`);
export const visibleBack = (page: Page) => page.getByRole("link", { name: "뒤로", exact: true }).filter({ visible: true });
export const visibleText = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true });
export const entryLink = (page: Page) => page.locator(`main ${sel(ENTRY)} a`).filter({ hasText: "MSDS 보기" });

/** 화면 16 이 그려질 때까지 (원문 보기 버튼 보임 · 불러오는 중 끝) */
export async function waitMsds(page: Page): Promise<void> {
  await expect(page.locator(sel(ORIGINAL)).first(), `${ORIGINAL} 보임`).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(sel(SKELETON)), "불러오는 중 끝").toHaveCount(0, { timeout: 30_000 });
  await page.waitForLoadState("load");
}

export const boxOf = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error("요소가 보이지 않음");
  return b;
};

/** 위에 덮인 것이 없는지 (가운데 지점의 맨 위 요소가 그 요소 안) */
export const onTop = (l: Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });

/** 뒤로 1 · 제목 "MSDS · {이름}" 1 (보이는 것만) */
export async function expectHeader(page: Page, name: string, backHref: string, what: string, schoolName?: string): Promise<void> {
  const title = `${FRAME.title.split(" · ")[0]} · ${name}`;
  await expect(visibleText(page, title), `${what}: 제목 "${title}" 보이는 것 1`).toHaveCount(1);
  if (schoolName) {
    // 시안 16-mobile nav-pill: nav-left(뒤로 + 제목) 와 nav-account(학교명 ▾) 가 나란히 — 글자가 겹치지 않는다
    const t = await boxOf(visibleText(page, title));
    const s = await boxOf(visibleText(page, schoolName).first());
    const w = Math.max(0, Math.min(t.x + t.width, s.x + s.width) - Math.max(t.x, s.x));
    const h = Math.max(0, Math.min(t.y + t.height, s.y + s.height) - Math.max(t.y, s.y));
    expect(w * h, `${what}: 제목과 학교명 글자가 겹치지 않는다 (제목 ${Math.round(t.x)}~${Math.round(t.x + t.width)}, 학교명 ${Math.round(s.x)}~${Math.round(s.x + s.width)})`).toBe(0);
  }
  const back = visibleBack(page);
  await expect(back, `${what}: 보이는 뒤로 1`).toHaveCount(1);
  await expect(back, `${what}: 뒤로 = 들어온 화면`).toHaveAttribute("href", backHref);
  // 누름 높이(rules.json button.min_height)는 button- 컴포넌트 규칙이라 원문 보기·더 보기에서 본다.
  // 뒤로(nav-pill 공용 링크)의 크기는 시안 nav-back 44×44 와 V1 에서 비교한다 (모바일 nav-pill 뒤로 = 20px — 보고 항목).
}

/** 원문 보기: msds-original-link 1 · 안 button-outline · 문구 · href = 시약 MSDS 주소 · 새 창 noopener · 높이 */
export async function expectOriginal(page: Page, viewport: ViewportName, url: string, what: string): Promise<void> {
  await expect(page.locator(sel(ORIGINAL)), `${what}: ${ORIGINAL} 1`).toHaveCount(1);
  const a = originalLink(page);
  await expect(a, `${what}: 원문 링크 1`).toHaveCount(1);
  await expect(a, `${what}: 원문 링크 = ${OUTLINE}`).toHaveAttribute("data-component", OUTLINE);
  await expect(a, `${what}: 문구 "${FRAME.original}"`).toContainText(FRAME.original);
  await expect(a, `${what}: href = 시약 MSDS 주소`).toHaveAttribute("href", url);
  await expect(a, `${what}: 새 창`).toHaveAttribute("target", "_blank");
  expect((await a.getAttribute("rel")) ?? "", `${what}: noopener`).toContain("noopener");
  await expect(a).toBeVisible();
  const b = await boxOf(a);
  expect(b.height, `${what}: 원문 보기 누름 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
  if (viewport === "mobile") {
    const vw = page.viewportSize()!.width;
    expect(b.width, `${what}: 모바일 전폭 버튼 (좌우 여백만)`).toBeGreaterThan(vw * 0.85);
    const tab = await boxOf(page.locator(sel(TAB.component)));
    expect(b.y + b.height, `${what}: 원문 보기는 tab-bar 위`).toBeLessThanOrEqual(tab.y + 0.5);
    expect(await onTop(a), `${what}: 원문 보기가 덮이지 않음`).toBe(true);
  }
}

/** 탭바: 390 = 1개 · 항목 수 · 라벨 순서 · 활성 = 시안(시약), 1440 = 0 (rules.json tab_bar) */
export async function expectTabBar(page: Page, viewport: ViewportName, what: string): Promise<void> {
  const shown = viewport === "mobile";
  if (shown) expect(TAB.mobile_screens, `rules.json tab_bar.mobile_screens 에 ${SCREEN}`).toContain(SCREEN);
  await expect(page.locator(sel(TAB.component)), `${what}: ${viewport} ${TAB.component}`).toHaveCount(shown ? 1 : 0);
  await expect(page.locator(sel(TAB.item)), `${what}: ${viewport} ${TAB.item}`).toHaveCount(shown ? TAB.items : 0);
  if (!shown) return;
  const items = page.locator(`${sel(TAB.component)} ${sel(TAB.item)}`);
  expect((await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()), `${what}: 탭 라벨`).toEqual(TAB.labels);
  expect(FRAME.activeTab, "시안 16 활성 탭").not.toBe("");
  const active = page.locator(`${sel(TAB.component)} ${sel(TAB.item)}[aria-current="page"]`);
  await expect(active, `${what}: 활성 탭 1`).toHaveCount(1);
  await expect(active, `${what}: 활성 탭 = 시안 "${FRAME.activeTab}"`).toHaveText(exact(FRAME.activeTab));
}

/** N2: 화면 글자·응답 본문에 금지어 0, 키 값 꼴 0, 외부 API 주소 0 */
export async function expectNoN2(page: Page, response: Pick<Response, "text"> | null, what: string): Promise<void> {
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(N2.banned_terms.filter((t) => body.includes(t.toLowerCase())), `${what}: 화면 N2 금지어 0`).toEqual([]);
  expect(body, `${what}: 화면에 외부 API 주소 없음`).not.toContain("data.go.kr");
  if (response) {
    const html = await response.text();
    expect(new RegExp(N2.key_value_pattern).test(html), `${what}: 응답 본문에 키 값 꼴(32자리 16진수) 없음`).toBe(false);
    expect(html, `${what}: 응답 본문에 외부 API 주소 없음`).not.toContain("apis.data.go.kr");
    expect(html.toLowerCase(), `${what}: 응답 본문에 serviceKey 없음`).not.toContain("servicekey");
    for (const t of N2.banned_terms) expect(html.includes(t), `${what}: 응답 본문 N2 금지어 "${t}"`).toBe(false);
  }
}

/** GHS 빨강(#ff0000)이 ghs-pictogram 밖에 칠해진 요소 · 안에 칠해진 수 (color·background·border·outline·fill·stroke) */
export function redPaint(page: Page): Promise<{ inside: number; outside: string[] }> {
  return page.evaluate(
    ({ red, ghs }) => {
      const props = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor", "fill", "stroke"] as const;
      let inside = 0;
      const outside: string[] = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const cs = getComputedStyle(el);
        const hit = props.filter((p) => {
          const v = cs[p as keyof CSSStyleDeclaration] as string;
          if (v !== red) return false;
          // 테두리 두께 0 · 외곽선 없음은 칠해진 것이 아니다
          if (p.startsWith("border") && parseFloat(cs[(p.replace("Color", "Width")) as keyof CSSStyleDeclaration] as string) === 0) return false;
          if (p === "outlineColor" && (cs.outlineStyle === "none" || parseFloat(cs.outlineWidth) === 0)) return false;
          if (p === "color" && !(el.textContent ?? "").trim() && !(el instanceof SVGElement)) return false;
          if (p === "stroke" && cs.stroke === "none") return false;
          return true;
        });
        if (hit.length === 0) continue;
        if (el.closest(`[data-component="${ghs}"]`)) inside++;
        else outside.push(`${el.tagName.toLowerCase()}${el.getAttribute("data-component") ? `[${el.getAttribute("data-component")}]` : ""} ${hit.join(",")}`);
      }
      return { inside, outside };
    },
    { red: GHS_RED, ghs: GHS },
  );
}

/** ghs-pictogram 하나: 흰 마름모 + 빨강 테두리 · 검정 그림 · 아래 이름 · 크기 (시안 16) */
export async function expectPictogram(p: Locator, name: string, what: string): Promise<void> {
  await expect(p, `${what}: 이름 (그림 아래 글자)`).toHaveText(exact(name));
  const paint = await p.evaluate(
    (el, { red, white, ink }) => {
      let diamond = 0;
      let symbol = 0;
      for (const c of Array.from(el.querySelectorAll("svg *"))) {
        const cs = getComputedStyle(c);
        if (cs.stroke === red && cs.fill === white) diamond++;
        if (cs.fill === ink || (cs.stroke === ink && cs.stroke !== "none")) symbol++;
      }
      return { diamond, symbol };
    },
    { red: GHS_RED, white: rgbOf(FRAME.diamondFill), ink: rgbOf(FRAME.symbolColor) },
  );
  expect(paint.diamond, `${what}: 흰 바탕(${FRAME.diamondFill}) + ${GHS_RED_HEX} 테두리 마름모 1`).toBe(1);
  expect(paint.symbol, `${what}: 검정(${FRAME.symbolColor}) 그림`).toBeGreaterThan(0);
  const cap = p.getByText(name, { exact: true });
  expect(await cap.evaluate((e) => getComputedStyle(e).color), `${what}: 이름 글자색 = 시안 ${FRAME.ghsCaptionFill}`).toBe(rgbOf(FRAME.ghsCaptionFill));
  const box = await boxOf(p.locator("svg").first());
  expect(Math.abs(box.width - FRAME.diamondBox), `${what}: 마름모 상자 폭 = 시안 ${FRAME.diamondBox}`).toBeLessThanOrEqual(1);
  expect(Math.abs((await boxOf(p)).width - FRAME.ghsWidth), `${what}: 폭 = 시안 ${FRAME.ghsWidth}`).toBeLessThanOrEqual(1);
}
