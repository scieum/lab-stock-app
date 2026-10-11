// 화면 12 (QR 찾기) 새 컴포넌트 qr-scan · qr-manual-entry · qr-result-sheet — 갤러리(/gallery · /gallery/scan, 비로그인 공개) 대상 K1.
// 기준: harness/d7-data.md §26 (화면 12 모양 · 카메라 · 번호로 찾기 · 결과 12-result), harness/dev-rules.json 1.19 components,
//       design/frames/12-mobile · 12-desktop · 12-result-mobile · 12-result-desktop (구조 · 글자 · 크기 · 색), design/rules.json colors.
// 기대값은 프레임 · rules · d7 문장에서 읽는다 (구현 상수를 읽지 않는다). 프레임에 없는 상태(카메라를 쓸 수 없음 · 시약 0개 · 오류 문구)는
//   d7 §26 문장에서 따옴표 글자를 그대로 옮긴다.
// /scan 화면(D3 — 카메라 · 조회 · 주소 상태 · C2/C3 · R-ui)은 여기서 보지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const SCREEN = 12;
const GALLERY = "/gallery";
const GALLERY_SCAN = "/gallery/scan";

type FrameNode = {
  name: string;
  type: string;
  path: string[];
  fills?: string[];
  strokes?: string[];
  cornerRadius?: number | number[];
  width?: number;
  height?: number;
  padding?: number[];
  gap?: number;
  text?: { characters: string; fontWeight: number; fontSize: number } | null;
};
type Rules = { colors: { allowed: string[]; accent: { value: string; only_within: string[] }; highlight: { values: string[]; no_text: string[] } } };
type Dev = { components: Record<string, number[]> };

const root = process.cwd();
const rules = JSON.parse(readFileSync(join(root, "design/rules.json"), "utf8")) as Rules;
const dev = JSON.parse(readFileSync(join(root, "harness/dev-rules.json"), "utf8")) as Dev;
const frame = (name: string) => (JSON.parse(readFileSync(join(root, "design/frames", `${name}.json`), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const F_MOBILE = frame("12-mobile");
const F_DESKTOP = frame("12-desktop");
const F_RESULT_M = frame("12-result-mobile");
const F_RESULT_D = frame("12-result-desktop");
const D7 = readFileSync(join(root, "harness/d7-data.md"), "utf8");
const D7_26 = D7.slice(D7.indexOf("## 26."), D7.indexOf("\n## ", D7.indexOf("## 26.") + 1));
const d7Row = (head: string) => D7_26.split(/\r?\n/).find((l) => l.startsWith(`| ${head} |`)) ?? "";
const quoted = (s: string) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const NEW = ["qr-scan", "qr-manual-entry", "qr-result-sheet"] as const;
const componentNames = Object.keys(dev.components);

// ---------- 기대값: 프레임 ----------
const leaf = (n: FrameNode) => n.path[n.path.length - 1];
const under = (nodes: FrameNode[], anc: string) => nodes.filter((n) => n.path.slice(0, -1).includes(anc));
const node = (nodes: FrameNode[], name: string, anc?: string) => {
  const hit = (anc ? under(nodes, anc) : nodes).find((n) => leaf(n) === name);
  if (!hit) throw new Error(`프레임에 ${name}${anc ? ` (${anc} 안)` : ""} 없음`);
  return hit;
};
const text = (nodes: FrameNode[], name: string, anc?: string) => node(nodes, name, anc).text!;
/** 서브트리 안 dev-rules 컴포넌트 이름별 개수 */
const countIn = (nodes: FrameNode[], anc: string) => {
  const out: Record<string, number> = {};
  for (const n of under(nodes, anc)) if (componentNames.includes(leaf(n))) out[leaf(n)] = (out[leaf(n)] ?? 0) + 1;
  return out;
};

const SCAN = {
  title: text(F_MOBILE, "scan-title"),
  help: text(F_MOBILE, "scan-help"),
  caption: text(F_MOBILE, "scan-caption"),
  preview: node(F_MOBILE, "camera-preview"),
  previewCard: node(F_DESKTOP, "camera-preview"),
  frame: node(F_MOBILE, "scan-frame"),
  flash: text(F_MOBILE, "label", "button-pill-soft"),
  gap: node(F_MOBILE, "qr-scan").gap!,
  inside: countIn(F_MOBILE, "qr-scan"),
  insideCard: countIn(F_DESKTOP, "qr-scan"),
};
const MANUAL_BTN = { label: text(F_MOBILE, "label", "qr-manual-entry"), inside: countIn(F_MOBILE, "qr-manual-entry"), h: node(F_MOBILE, "button-outline", "qr-manual-entry").height! };
const cardNode = node(F_DESKTOP, "qr-manual-entry");
const MANUAL_CARD = {
  node: cardNode,
  heading: text(F_DESKTOP, "heading", "qr-manual-entry"),
  helper: text(F_DESKTOP, "helper", "qr-manual-entry"),
  placeholder: text(F_DESKTOP, "placeholder", "qr-manual-entry").characters,
  submit: text(F_DESKTOP, "label", "button-primary").characters,
  inside: countIn(F_DESKTOP, "qr-manual-entry"),
};
const sheetNode = node(F_RESULT_M, "qr-result-sheet");
const RESULT = {
  sheet: sheetNode,
  number: text(F_RESULT_M, "label", "cabinet-number").characters,
  title: text(F_RESULT_M, "sheet-title-text"),
  caption: text(F_RESULT_M, "sheet-caption"),
  close: node(F_RESULT_M, "sheet-close"),
  layout: text(F_RESULT_M, "label", "button-pill-soft").characters,
  rows: under(F_RESULT_M, "result-list").filter((n) => leaf(n) === "reagent-row").length,
  names: under(F_RESULT_M, "result-list").filter((n) => n.name === "reagent-name").map((n) => n.text!.characters),
  slots: under(F_RESULT_M, "result-list").filter((n) => n.name === "slot-location").map((n) => n.text!.characters),
  inside: countIn(F_RESULT_M, "qr-result-sheet"),
  insideDrawer: countIn(F_RESULT_D, "qr-result-sheet"),
  tableHead: under(F_RESULT_D, "table-head").filter((n) => n.name === "label").map((n) => n.text!.characters),
  drawerActions: countIn(F_RESULT_D, "drawer-actions"),
  drawerLayout: text(F_RESULT_D, "label", "drawer-actions").characters,
};
/** 프레임에 없는 상태 문구 (d7 §26) */
const UNAVAILABLE = quoted(d7Row("카메라")).find((q) => q.startsWith("카메라를 쓸 수 없어요"))!;
const EMPTY = quoted(d7Row("결과 (12-result)")).find((q) => q.includes("아직 시약이 없어요"))!;
const NOT_NUMBER = quoted(d7Row("번호로 찾기")).find((q) => q.includes("숫자로"))!;
const NOT_FOUND = quoted(d7Row("번호로 찾기")).find((q) => q.startsWith("{n}번"))!;

// ---------- 기대값: rules colors ----------
const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const ALLOWED_RGB = rules.colors.allowed.map((c) => rgb(c.toLowerCase()));
const ACCENT_RGB = rgb(rules.colors.accent.value);
const NO_TEXT_RGB = rules.colors.highlight.no_text.map(rgb);

const sel = (n: string) => `[data-component="${n}"]`;
const dn = (n: string) => `[data-name="${n}"]`;
const area = (page: Page, id: string) => page.locator(`section[aria-labelledby="g-${id}"]`);

async function open(page: Page, path = GALLERY_SCAN): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `${path} 응답`).toBe(200);
  await page.waitForLoadState("load");
}

async function style(l: Locator, props: string[]): Promise<Record<string, string>> {
  return l.evaluate((el, ps) => {
    const s = getComputedStyle(el);
    return Object.fromEntries(ps.map((p) => [p, s.getPropertyValue(p)]));
  }, props);
}

/** 글자 노드의 프레임 크기 · 굵기 · 색과 같은지 */
async function expectText(l: Locator, t: { characters: string; fontSize: number; fontWeight: number }, fill: string, what: string): Promise<void> {
  await expect(l, `${what} 글자`).toHaveText(t.characters);
  const s = await style(l, ["font-size", "font-weight", "color"]);
  expect(s["font-size"], `${what} 크기`).toBe(`${t.fontSize}px`);
  expect(s["font-weight"], `${what} 굵기`).toBe(String(t.fontWeight));
  expect(s.color, `${what} 색`).toBe(rgb(fill));
}

/** 컴포넌트 안 모든 요소의 글자색 · 바탕 · 테두리 · svg 선 색이 rules colors.allowed 안, accent 는 only_within 안, 하늘색 글자 0 */
async function expectPalette(scope: Locator, what: string): Promise<void> {
  const used = await scope.evaluate((root) => {
    const out: { prop: string; value: string; inAccentHost: boolean; hasText: boolean }[] = [];
    const els = [root, ...Array.from(root.querySelectorAll("*"))];
    for (const el of els) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      const accentHost = !!el.closest('[data-component="badge-low-stock"]');
      const ownText = Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== "");
      const push = (prop: string, value: string) => out.push({ prop, value, inAccentHost: accentHost, hasText: ownText });
      if (ownText) push("color", s.color);
      push("background-color", s.backgroundColor);
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        if (parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && s.getPropertyValue(`border-${side.toLowerCase()}-style`) !== "none")
          push("border-color", s.getPropertyValue(`border-${side.toLowerCase()}-color`));
      }
      if (el instanceof SVGElement) {
        if (s.stroke && s.stroke !== "none") push("stroke", s.stroke);
        if (s.fill && s.fill !== "none" && el.tagName.toLowerCase() !== "svg") push("fill", s.fill);
      }
    }
    return out;
  });
  const transparent = (v: string) => v === "rgba(0, 0, 0, 0)" || v === "transparent";
  const bad = used.filter((u) => !transparent(u.value) && !ALLOWED_RGB.includes(u.value));
  expect(bad, `${what}: rules colors.allowed 밖 색 0`).toEqual([]);
  const accentOutside = used.filter((u) => u.value === ACCENT_RGB && !u.inAccentHost);
  expect(accentOutside, `${what}: accent ${rules.colors.accent.value} 는 badge-low-stock 안에서만`).toEqual([]);
  const skyText = used.filter((u) => u.prop === "color" && u.hasText && NO_TEXT_RGB.includes(u.value));
  expect(skyText, `${what}: 하늘색 글자 0 (highlight.no_text)`).toEqual([]);
}

/** scope 안(자신 제외) 자손 data-component 이름별 개수 — 컴포넌트 안에 든 컴포넌트 (프레임 countIn 과 같은 셈) */
async function componentsInside(scope: Locator): Promise<Record<string, number>> {
  return scope.evaluate((root) => {
    const out: Record<string, number> = {};
    for (const el of Array.from(root.querySelectorAll("[data-component]"))) {
      const n = el.getAttribute("data-component")!;
      out[n] = (out[n] ?? 0) + 1;
    }
    return out;
  });
}

// =====================================================================
// 기대값 원본
// =====================================================================

test(`[K1][S${SCREEN}] 기대값 원본: dev-rules 화면 12 에만 = ${NEW.join(" · ")} · 프레임 12 · 12-result 에 각각 있음 · d7 §26 상태 문구`, () => {
  const only = componentNames.filter((n) => dev.components[n].length === 1 && dev.components[n][0] === SCREEN);
  expect(only.sort(), "dev-rules 에서 화면 12 에만 있는 컴포넌트").toEqual([...NEW].sort());
  for (const n of NEW) {
    const inFrames = [F_MOBILE, F_DESKTOP, F_RESULT_M, F_RESULT_D].some((f) => f.some((x) => leaf(x) === n));
    expect(inFrames, `프레임 12-* 에 ${n}`).toBe(true);
  }
  // 프레임 12-* 의 qr-* 안 컴포넌트는 모두 dev-rules 에서 화면 12 에 속한다 (cabinet-number 3·11·12 등)
  for (const counts of [SCAN.inside, SCAN.insideCard, MANUAL_BTN.inside, MANUAL_CARD.inside, RESULT.inside, RESULT.insideDrawer, RESULT.drawerActions]) {
    for (const n of Object.keys(counts)) expect(dev.components[n], `dev-rules components ${n} 에 12`).toContain(SCREEN);
  }
  expect(dev.components["cabinet-number"].slice().sort((a, b) => a - b), "cabinet-number = 3·11·12").toEqual([3, 11, 12]);
  expect(SCAN.title.characters).toBe("시약장 문에 붙은 QR을 맞춰주세요");
  expect(SCAN.flash.characters).toBe("플래시");
  expect(MANUAL_BTN.label.characters).toBe(MANUAL_CARD.heading.characters);
  expect(RESULT.layout, "배치도 보기").toBe(RESULT.drawerLayout);
  expect(RESULT.tableHead, "d7 §26 result-table 칸").toEqual(["시약명", "칸 위치", "재고", "상태"]);
  expect(UNAVAILABLE).toBe("카메라를 쓸 수 없어요. 시약장 번호로 찾아 주세요");
  expect(EMPTY).toBe("이 시약장에는 아직 시약이 없어요");
  expect(NOT_NUMBER).toBe("시약장 번호를 숫자로 적어 주세요");
  expect(NOT_FOUND).toBe("{n}번 시약장이 없어요");
});

// =====================================================================
// 갤러리 등장 (K1)
// =====================================================================

test(`[K1][S${SCREEN}] /gallery DOM 에 ${NEW.join(" · ")} 각각 1개 이상 (K1 갤러리 기준 페이지) · 지운 tab-soon 0`, async ({ page }) => {
  await open(page, GALLERY);
  for (const n of NEW) expect(await page.locator(sel(n)).count(), `/gallery ${n}`).toBeGreaterThanOrEqual(1);
  await expect(page.locator(sel("tab-soon")), "지운 tab-soon 0 (d7 §26)").toHaveCount(0);
});

test(`[K1][S${SCREEN}] /gallery/scan DOM: 프레임 12-* 의 qr-* 안 컴포넌트가 모두 있고 새 data-component 이름 없음`, async ({ page }) => {
  await open(page);
  const want = new Set([...NEW, ...[SCAN.inside, SCAN.insideCard, MANUAL_BTN.inside, MANUAL_CARD.inside, RESULT.inside, RESULT.insideDrawer, RESULT.drawerActions].flatMap((c) => Object.keys(c))]);
  for (const n of want) expect(await page.locator(sel(n)).count(), `/gallery/scan ${n}`).toBeGreaterThanOrEqual(1);
  const names = await page.locator("[data-component]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-component") ?? ""))]);
  for (const n of names) expect(componentNames, `data-component="${n}"`).toContain(n);
});

// =====================================================================
// qr-scan
// =====================================================================

test(`[K1][S${SCREEN}] qr-scan (12-mobile): scan-guide(제목 ${SCAN.title.fontSize}/${SCAN.title.fontWeight} · scan-help ${SCAN.help.fontSize}) → camera-preview(${SCAN.preview.height} · radius ${SCAN.preview.cornerRadius} · ${SCAN.preview.fills![0]}) + scan-frame ${SCAN.frame.width} → scan-caption → 플래시 button-pill-soft, 순서 · 사이 ${SCAN.gap} · 색 = rules`, async ({ page }) => {
  await open(page);
  const scan = area(page, "scan-mobile").locator(sel("qr-scan"));
  await expect(scan, "qr-scan 1").toHaveCount(1);
  await expect(scan.getByRole("heading", { name: SCAN.title.characters }), "제목은 heading").toHaveCount(1);
  await expectText(scan.locator(dn("scan-title")), SCAN.title, node(F_MOBILE, "scan-title").fills![0], "scan-title");
  await expectText(scan.locator(dn("scan-help")), SCAN.help, node(F_MOBILE, "scan-help").fills![0], "scan-help");
  await expectText(scan.locator(dn("scan-caption")), SCAN.caption, node(F_MOBILE, "scan-caption").fills![0], "scan-caption");
  // 시안 순서: scan-guide → camera-preview → scan-caption → button-pill-soft
  const order = await scan.evaluate((el) =>
    Array.from(el.children).map((c) => c.getAttribute("data-name") ?? c.getAttribute("data-component") ?? c.tagName.toLowerCase()),
  );
  const frameOrder = F_MOBILE.filter((n) => n.path[n.path.length - 2] === "qr-scan").map(leaf);
  expect(order, "qr-scan 자식 순서 = 시안").toEqual(frameOrder);
  // camera-preview
  const preview = scan.locator(dn("camera-preview"));
  const pb = (await preview.boundingBox())!;
  expect(Math.round(pb.height), "camera-preview 높이").toBe(SCAN.preview.height);
  const ps = await style(preview, ["background-color", "border-top-left-radius", "border-bottom-right-radius"]);
  expect(ps["background-color"], "camera-preview 바탕").toBe(rgb(SCAN.preview.fills![0]));
  expect([ps["border-top-left-radius"], ps["border-bottom-right-radius"]], "camera-preview radius").toEqual(Array(2).fill(`${SCAN.preview.cornerRadius}px`));
  const sb = (await preview.locator(dn("scan-frame")).boundingBox())!;
  expect([Math.round(sb.width), Math.round(sb.height)], "scan-frame 크기").toEqual([SCAN.frame.width, SCAN.frame.height]);
  expect(Math.abs(sb.x + sb.width / 2 - (pb.x + pb.width / 2)), "scan-frame 가로 가운데").toBeLessThanOrEqual(1);
  expect(Math.abs(sb.y + sb.height / 2 - (pb.y + pb.height / 2)), "scan-frame 세로 가운데").toBeLessThanOrEqual(1);
  expect((await style(preview.locator(dn("scan-frame")), ["color"])).color, "scan-frame 선 = 시안 흰색").toBe(rgb(SCAN.frame.strokes![0]));
  // 사이 16 (guide 아래 → preview 위)
  const gb = (await scan.locator(dn("scan-guide")).boundingBox())!;
  expect(Math.round(pb.y - (gb.y + gb.height)), "scan-guide ↔ camera-preview 사이").toBe(SCAN.gap);
  // 플래시: 안에 든 컴포넌트 = 시안
  expect(await componentsInside(scan), "qr-scan 안 컴포넌트 = 12-mobile").toEqual(SCAN.inside);
  const flash = scan.locator(sel("button-pill-soft"));
  await expect(flash, "플래시 버튼 글자").toHaveText(SCAN.flash.characters);
  expect(await flash.evaluate((el) => el.tagName), "플래시는 button").toBe("BUTTON");
  await expect(flash, "플래시 aria-pressed (켜기/끄기)").toHaveAttribute("aria-pressed", "false");
  await flash.click();
  await expect(flash, "누르면 켜짐").toHaveAttribute("aria-pressed", "true");
  await expectPalette(scan, "qr-scan");
});

test(`[K1][S${SCREEN}] qr-scan 카드 (12-desktop scan-card): camera-preview ${SCAN.previewCard.height} · 플래시 없음(시안 데스크톱) / 카메라를 쓸 수 없음 (d7 §26): 안내 "${UNAVAILABLE}" + 번호로 찾기 button-outline · 플래시 비활성`, async ({ page }) => {
  await open(page);
  const card = area(page, "scan-card").locator(sel("qr-scan"));
  await expect(card).toHaveCount(1);
  expect(Math.round((await card.locator(dn("camera-preview")).boundingBox())!.height), "카드 camera-preview 높이").toBe(SCAN.previewCard.height);
  expect(await componentsInside(card), "카드 qr-scan 안 컴포넌트 = 12-desktop (플래시 없음)").toEqual(SCAN.insideCard);
  await expectText(card.locator(dn("scan-title")), text(F_DESKTOP, "scan-title"), node(F_DESKTOP, "scan-title").fills![0], "카드 scan-title");
  await expectPalette(card, "qr-scan 카드");

  const un = area(page, "scan-unavailable").locator(sel("qr-scan"));
  await expect(un).toHaveCount(1);
  await expect(un.locator(dn("camera-preview")), "카메라 없음: camera-preview 자리 대신 안내").toHaveCount(0);
  const status = un.getByRole("status");
  await expect(status, "안내 status").toHaveCount(1);
  await expect(status).toContainText(UNAVAILABLE);
  await expect(status.locator(sel("button-outline")), "번호로 찾기로 전환하는 button-outline").toHaveCount(1);
  await expect(status.locator(sel("button-outline"))).toContainText("번호로 찾기");
  const flash = un.locator(sel("button-pill-soft"));
  await expect(flash, "플래시 1").toHaveCount(1);
  const disabled = await flash.evaluate((el) => {
    const b = el.matches("button") ? el : el.querySelector("button");
    return !!b && ((b as HTMLButtonElement).disabled || b.getAttribute("aria-disabled") === "true");
  });
  expect(disabled, "카메라가 없으면 플래시 비활성 (d7 §26 torch 없음 → 비활성)").toBe(true);
  await expectPalette(un, "qr-scan 카메라 없음");
});

// =====================================================================
// qr-manual-entry
// =====================================================================

test(`[K1][S${SCREEN}] qr-manual-entry 버튼 (12-mobile): 전폭 button-outline "${MANUAL_BTN.label.characters}" 높이 ${MANUAL_BTN.h}, 안 컴포넌트 = 시안`, async ({ page }) => {
  await open(page);
  const m = area(page, "manual-button").locator(sel("qr-manual-entry"));
  await expect(m).toHaveCount(1);
  expect(await componentsInside(m), "안 컴포넌트 = 12-mobile").toEqual(MANUAL_BTN.inside);
  const btn = m.locator(sel("button-outline"));
  await expect(btn).toHaveText(MANUAL_BTN.label.characters);
  const [mb, bb] = [(await m.boundingBox())!, (await btn.boundingBox())!];
  expect(Math.round(bb.width), "전폭 (qr-manual-entry 폭)").toBe(Math.round(mb.width));
  expect(Math.round(bb.height), "높이 = 시안").toBe(MANUAL_BTN.h);
  await expectPalette(m, "qr-manual-entry 버튼");
});

test(`[K1][S${SCREEN}] qr-manual-entry 카드 (12-desktop): 흰 카드(radius ${JSON.stringify(cardNode.cornerRadius)} · 안쪽 ${cardNode.padding?.[0]} · 테두리 ${cardNode.strokes?.[0]}) — 제목 ${MANUAL_CARD.heading.fontSize}/${MANUAL_CARD.heading.fontWeight} · helper · text-input "${MANUAL_CARD.placeholder}" + button-primary "${MANUAL_CARD.submit}" · 숫자 아님 → "${NOT_NUMBER}" · Enter = 찾기`, async ({ page }) => {
  await open(page);
  const c = area(page, "manual-card").locator(sel("qr-manual-entry"));
  await expect(c).toHaveCount(1);
  expect(await componentsInside(c), "안 컴포넌트 = 12-desktop").toEqual(MANUAL_CARD.inside);
  await expect(c.getByRole("heading", { name: MANUAL_CARD.heading.characters }), "제목은 heading").toHaveCount(1);
  await expectText(c.locator(dn("heading")), MANUAL_CARD.heading, node(F_DESKTOP, "heading", "qr-manual-entry").fills![0], "heading");
  await expectText(c.locator(dn("helper")), MANUAL_CARD.helper, node(F_DESKTOP, "helper", "qr-manual-entry").fills![0], "helper");
  const s = await style(c, ["background-color", "border-top-color", "border-top-width", "border-top-left-radius", "padding-top", "padding-left"]);
  expect(s["background-color"], "카드 바탕").toBe(rgb(cardNode.fills![0]));
  expect(s["border-top-color"], "카드 테두리 색").toBe(rgb(cardNode.strokes![0]));
  expect(parseFloat(s["border-top-width"]), "테두리 있음").toBeGreaterThan(0);
  expect(s["border-top-left-radius"], "카드 radius").toBe(`${cardNode.cornerRadius}px`);
  expect([s["padding-top"], s["padding-left"]], "카드 안쪽").toEqual([`${cardNode.padding![0]}px`, `${cardNode.padding![3]}px`]);
  const input = c.locator(`${sel("text-input")} input`);
  await expect(input, "placeholder = 시안").toHaveAttribute("placeholder", MANUAL_CARD.placeholder);
  await expect(input, "숫자 키패드").toHaveAttribute("inputmode", "numeric");
  const submit = c.locator(sel("button-primary"));
  await expect(submit).toHaveText(MANUAL_CARD.submit);
  // 같은 줄: 입력 오른쪽에 찾기
  const [ib, sb] = [(await c.locator(sel("text-input")).first().boundingBox())!, (await submit.boundingBox())!];
  expect(sb.x, "찾기는 입력 오른쪽").toBeGreaterThan(ib.x + ib.width - 1);
  expect(Math.round(sb.height), "찾기 높이 = 시안").toBe(node(F_DESKTOP, "button-primary", "qr-manual-entry").height);
  // 오류 자리: 숫자가 아니면 d7 문구가 입력 아래 (갤러리 예시가 부르는 쪽 검사를 흉내)
  await expect.poll(() => input.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__react"))), { message: "하이드레이션", timeout: 30_000 }).toBe(true);
  await input.fill("가");
  await submit.click();
  const err = c.getByText(NOT_NUMBER, { exact: true });
  await expect(err, `오류 "${NOT_NUMBER}"`).toBeVisible();
  const ib2 = (await input.boundingBox())!;
  expect((await err.boundingBox())!.y, "오류는 입력 아래").toBeGreaterThan(ib2.y + ib2.height - 1);
  const describedBy = await input.getAttribute("aria-describedby");
  expect(describedBy, "오류는 입력 설명 (aria-describedby)").toBeTruthy();
  // Enter 도 찾기
  await input.fill("7");
  await input.press("Enter");
  await expect(c.getByText(NOT_FOUND.replace("{n}", "7"), { exact: true }), "Enter = 찾기").toBeVisible();
  await expectPalette(c, "qr-manual-entry 카드");
});

// =====================================================================
// qr-result-sheet
// =====================================================================

test(`[K1][S${SCREEN}] qr-result-sheet 바텀시트 (12-result-mobile): 머리 = cabinet-number "${RESULT.number}" + "${RESULT.title.characters}"(${RESULT.title.fontSize}/${RESULT.title.fontWeight}) + 닫기 ${RESULT.close.width} / 캡션 "${RESULT.caption.characters}" → reagent-row ${RESULT.rows} → button-pill-soft "${RESULT.layout}" · 흰 바탕 · 테두리 ${sheetNode.strokes?.[0]} · 위쪽 radius ${JSON.stringify(sheetNode.cornerRadius)} · 안쪽 ${sheetNode.padding?.[0]}`, async ({ page }) => {
  await open(page);
  const s = area(page, "result-sheet").locator(sel("qr-result-sheet"));
  await expect(s).toHaveCount(1);
  await expect(s, "dialog").toHaveAttribute("role", "dialog");
  const titleId = await s.getAttribute("aria-labelledby");
  expect(titleId, "aria-labelledby").toBeTruthy();
  await expect(page.locator(`[id="${titleId}"]`), "이름 = 시약장 이름").toHaveText(RESULT.title.characters);
  expect(await componentsInside(s), "안 컴포넌트 = 12-result-mobile (cabinet-number 1 · reagent-row · badge-low-stock · button-pill-soft)").toEqual(RESULT.inside);
  // 머리: 번호 → 제목 (같은 줄), 닫기 오른쪽
  const num = s.locator(dn("sheet-head")).locator(sel("cabinet-number"));
  await expect(num, "머리 cabinet-number").toHaveText(RESULT.number);
  const title = s.locator(dn("sheet-title-text"));
  await expectText(title, RESULT.title, node(F_RESULT_M, "sheet-title-text").fills![0], "시약장 이름");
  const [nb, tb] = [(await num.boundingBox())!, (await title.boundingBox())!];
  expect(nb.x + nb.width, "번호는 제목 왼쪽").toBeLessThanOrEqual(tb.x + 0.5);
  expect(Math.abs(nb.y + nb.height / 2 - (tb.y + tb.height / 2)), "번호·제목 같은 줄").toBeLessThanOrEqual(3);
  const close = s.getByRole("button", { name: "닫기" }).or(s.getByRole("link", { name: "닫기" }));
  await expect(close, "닫기 1").toHaveCount(1);
  const cb = (await close.boundingBox())!;
  expect([Math.round(cb.width), Math.round(cb.height)], "닫기 크기 = 시안").toEqual([RESULT.close.width, RESULT.close.height]);
  expect(cb.x, "닫기는 오른쪽").toBeGreaterThan(tb.x + tb.width);
  await expectText(s.locator(dn("sheet-caption")), RESULT.caption, node(F_RESULT_M, "sheet-caption").fills![0], "캡션");
  // 목록
  const rows = s.locator(sel("reagent-row"));
  await expect(rows, `reagent-row ${RESULT.rows}`).toHaveCount(RESULT.rows);
  for (let i = 0; i < RESULT.rows; i++) {
    await expect(rows.nth(i), `행 ${i + 1} 이름`).toContainText(RESULT.names[i]);
    await expect(rows.nth(i), `행 ${i + 1} 칸 위치`).toContainText(RESULT.slots[i]);
  }
  // 배치도 보기 = 맨 아래 button-pill-soft 링크
  const layout = s.locator(sel("button-pill-soft"));
  await expect(layout).toHaveText(RESULT.layout);
  const href = await layout.evaluate((el) => (el.matches("a") ? el.getAttribute("href") : el.querySelector("a")?.getAttribute("href") ?? null));
  expect(href, "배치도 보기는 링크").toBeTruthy();
  expect((await layout.boundingBox())!.y, "배치도 보기는 목록 아래").toBeGreaterThan((await rows.last().boundingBox())!.y);
  // 모양 (시안 sheet)
  const st = await style(s, ["background-color", "border-top-color", "border-top-width", "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "padding-top", "padding-left"]);
  const radius = sheetNode.cornerRadius as number[];
  expect(st["background-color"], "시트 바탕").toBe(rgb(sheetNode.fills![0]));
  expect(st["border-top-color"], "시트 테두리").toBe(rgb(sheetNode.strokes![0]));
  expect(parseFloat(st["border-top-width"]), "테두리 있음").toBeGreaterThan(0);
  expect([st["border-top-left-radius"], st["border-top-right-radius"], st["border-bottom-left-radius"]], "위쪽만 radius").toEqual([`${radius[0]}px`, `${radius[1]}px`, `${radius[3]}px`]);
  expect([st["padding-top"], st["padding-left"]], "안쪽").toEqual([`${sheetNode.padding![0]}px`, `${sheetNode.padding![3]}px`]);
  await expectPalette(s, "qr-result-sheet");
});

test(`[K1][S${SCREEN}] qr-result-sheet 시약 0개: 목록 대신 "${EMPTY}" · reagent-row 0 · 배치도 보기 유지`, async ({ page }) => {
  await open(page);
  const s = area(page, "result-empty").locator(sel("qr-result-sheet"));
  await expect(s).toHaveCount(1);
  await expect(s.getByText(EMPTY, { exact: true }), "빈 안내").toBeVisible();
  await expect(s.locator(sel("reagent-row")), "reagent-row 0").toHaveCount(0);
  await expect(s.locator(sel("cabinet-number")), "머리 번호 1").toHaveCount(1);
  await expect(s.locator(sel("button-pill-soft")), "배치도 보기").toHaveText(RESULT.layout);
  await expectPalette(s, "qr-result-sheet 빈");
});

test(`[K1][S${SCREEN}] qr-result-sheet 드로어 (12-result-desktop): detail-drawer 안 qr-result-sheet · 표 머리 ${RESULT.tableHead.join("·")} · ex-data-table-cell · 배치도 보기 = drawer-actions(시트 밖) button-pill-soft`, async ({ page }) => {
  await open(page);
  const a = area(page, "result-drawer");
  const drawer = a.locator(sel("detail-drawer"));
  await expect(drawer, "detail-drawer 1").toHaveCount(1);
  const s = drawer.locator(sel("qr-result-sheet"));
  await expect(s, "드로어 안 qr-result-sheet 1").toHaveCount(1);
  // 시안 ex-data-table-cell 노드 = 표 한 줄 (시안 표기) — 코드는 칸마다 붙으므로 줄 수(tbody tr)로 센다. 나머지 이름 · 개수는 같다
  const inside = await componentsInside(s);
  expect(Object.keys(inside).sort(), "시트 안 컴포넌트 이름 = 12-result-desktop qr-result-sheet").toEqual(Object.keys(RESULT.insideDrawer).sort());
  for (const [n, k] of Object.entries(RESULT.insideDrawer)) {
    if (n === "ex-data-table-cell") await expect(s.locator(`tbody tr:has(${sel(n)})`), `표 줄 ${k}`).toHaveCount(k);
    else expect(inside[n], `시트 안 ${n}`).toBe(k);
  }
  await expect(s.locator(sel("cabinet-number"))).toHaveText(text(F_RESULT_D, "label", "cabinet-number").characters);
  await expectText(s.locator(dn("sheet-title-text")), text(F_RESULT_D, "sheet-title-text"), node(F_RESULT_D, "sheet-title-text").fills![0], "드로어 시약장 이름");
  await expect(s.locator(dn("sheet-caption"))).toHaveText(text(F_RESULT_D, "sheet-caption").characters);
  const head = await s.locator("thead").first().locator(sel("ex-data-table-cell")).allInnerTexts();
  expect(head.map((t) => t.trim()), "표 머리 = 시안").toEqual(RESULT.tableHead);
  // 배치도 보기: 시트 밖 · 드로어 안 (drawer-actions)
  const outside = drawer.locator(sel("button-pill-soft")).filter({ hasText: RESULT.drawerLayout });
  await expect(outside, "드로어 안 배치도 보기 1").toHaveCount(1);
  await expect(s.locator(sel("button-pill-soft")), "시트 안 배치도 보기 0 (drawer-actions)").toHaveCount(0);
  const actions = drawer.locator(dn("drawer-actions"));
  await expect(actions, "drawer-actions 1").toHaveCount(1);
  expect(await componentsInside(actions), "drawer-actions 안 컴포넌트 = 시안").toEqual(RESULT.drawerActions);
  await expectPalette(s, "qr-result-sheet 드로어");
});
