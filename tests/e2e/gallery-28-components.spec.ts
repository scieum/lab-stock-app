// d7 §28 새 컴포넌트 11개 — 갤러리(/gallery · /gallery/sensor-catalog · /gallery/menu, 비로그인 공개) 대상 K1.
//   sensor-type-sheet · sensor-type-group · sensor-model-suggest · catalog-fill-note · sensor-doc-add · sensor-link · new-sensor-fields
//   · mobile-menu-button · mobile-menu-sheet · invite-more-menu · invite-cancel (+ sensor-type-select box)
// 기준: harness/d7-data.md §28, harness/dev-rules.json 1.20 components, design/rules.json 1.28 sensor.type_select · filter · catalog · doc ·
//       mobile_menu · invite_cancel · colors, design/frames 17-type · 17-filter · 17-model · 17-desktop · 17-doc-review · 13-menu-mobile ·
//       13-mobile · 8-invite-cancel (구조 · 글자 · 크기 · 색). 기대값은 프레임 · rules · d7 문장에서 읽는다 (구현 상수를 읽지 않는다).
// 화면 연결(D3 — nav-pill ☰ · /sensors/doc · 화면 8 행 ⋯ · C2/C3 · R-ui)은 여기서 보지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const GALLERY = "/gallery";
const SENSOR_GALLERY = "/gallery/sensor-catalog";
const MENU_GALLERY = "/gallery/menu";

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
type Rules = {
  version: string;
  sensor: {
    types: string[];
    type_groups: Record<string, string[]>;
    type_select: string;
    filter: string;
    catalog: { maker: string; suggest: string; fill: string };
    doc: Record<string, string>;
  };
  mobile_menu: Record<string, string>;
  invite_cancel: { entry: string; confirm: string; after: string };
  colors: {
    allowed: string[];
    accent: { value: string; only_within: string[] };
    accent_soft: { value: string; only_within: string[] };
    highlight: { values: string[]; forbidden_within: string[]; no_text: string[] };
  };
};
type Dev = { components: Record<string, number[]>; routes: Record<string, string> };

const root = process.cwd();
const rules = JSON.parse(readFileSync(join(root, "design/rules.json"), "utf8")) as Rules;
const dev = JSON.parse(readFileSync(join(root, "harness/dev-rules.json"), "utf8")) as Dev;
const frame = (name: string) => (JSON.parse(readFileSync(join(root, "design/frames", `${name}.json`), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const D7 = readFileSync(join(root, "harness/d7-data.md"), "utf8").replace(/\r\n/g, "\n");
const D7_28 = D7.slice(D7.indexOf("## 28."), D7.indexOf("\n## ", D7.indexOf("## 28.") + 1));
const d7Row = (head: string) => D7_28.split("\n").find((l) => l.startsWith(`| ${head} |`)) ?? "";
const singleQuoted = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);

const NEW = [
  "sensor-type-sheet",
  "sensor-type-group",
  "sensor-model-suggest",
  "catalog-fill-note",
  "sensor-doc-add",
  "sensor-link",
  "new-sensor-fields",
  "mobile-menu-button",
  "mobile-menu-sheet",
  "invite-more-menu",
  "invite-cancel",
] as const;

// ---------- 프레임 도우미 ----------
const leaf = (n: FrameNode) => n.path[n.path.length - 1];
const under = (nodes: FrameNode[], anc: string) => nodes.filter((n) => n.path.slice(0, -1).includes(anc));
const node = (nodes: FrameNode[], name: string, anc?: string) => {
  const hit = (anc ? under(nodes, anc) : nodes).find((n) => leaf(n) === name);
  if (!hit) throw new Error(`프레임에 ${name}${anc ? ` (${anc} 안)` : ""} 없음`);
  return hit;
};
const texts = (nodes: FrameNode[], name: string, anc?: string) => (anc ? under(nodes, anc) : nodes).filter((n) => leaf(n) === name && n.text).map((n) => n.text!);

const F_TYPE = frame("17-type-mobile");
const F_FILTER = frame("17-filter-mobile");
const F_MODEL = frame("17-model-mobile");
const F_DESK = frame("17-desktop");
const F_REVIEW = frame("17-doc-review-mobile");
const F_MENU = frame("13-menu-mobile");
const F_HOME = frame("13-mobile");
const F_INVITE = frame("8-invite-cancel-mobile");

const TYPE = {
  title: texts(F_TYPE, "sheet-title", "sensor-type-sheet")[0],
  placeholder: texts(F_TYPE, "placeholder", "sensor-type-sheet")[0],
  groupNames: texts(F_TYPE, "group-name", "sensor-type-sheet"),
  groupCounts: texts(F_TYPE, "group-count", "sensor-type-sheet"),
  row: node(F_TYPE, "group-row", "sensor-type-sheet"),
  chip: node(F_TYPE, "type-chip", "sensor-type-sheet"),
  chipLabel: texts(F_TYPE, "label", "type-chip")[0],
  selected: node(F_TYPE, "type-chip-selected", "sensor-type-sheet"),
  selectedLabel: texts(F_TYPE, "label", "type-chip-selected")[0],
  boxLabel: texts(F_TYPE, "field-label", "sensor-type-select")[0],
  box: node(F_TYPE, "select-box", "sensor-type-select"),
  boxValue: texts(F_TYPE, "input-value", "sensor-type-select")[0],
};
/** 시안 17-type: 펼친 묶음(chip-wrap 이 있는 묶음)의 이름 — 노드 순서대로 */
const TYPE_OPEN: string[] = (() => {
  const out: string[] = [];
  let cur = "";
  for (const n of under(F_TYPE, "sensor-type-sheet")) {
    if (leaf(n) === "group-name") cur = n.text!.characters;
    if (leaf(n) === "chip-wrap" && !out.includes(cur)) out.push(cur);
  }
  return out;
})();
const FILTER_COUNT = texts(F_FILTER, "group-count")[0].characters; // "· 2개"
const MODEL = {
  match: texts(F_MODEL, "match", "sensor-model-suggest")[0],
  rest: texts(F_MODEL, "rest", "sensor-model-suggest")[0],
  rests: texts(F_MODEL, "rest", "sensor-model-suggest").map((t) => t.characters),
  captions: texts(F_MODEL, "caption", "sensor-model-suggest"),
  list: node(F_MODEL, "sensor-model-suggest"),
  row: node(F_MODEL, "suggest-row", "sensor-model-suggest"),
  rawText: under(F_MODEL, "suggest-raw").find((n) => n.text)!.text!,
  note: under(F_MODEL, "catalog-fill-note").find((n) => n.text)!.text!,
  noteFill: under(F_MODEL, "catalog-fill-note").find((n) => n.text)!.fills![0],
};
/** 시안 17-model 에서 행 배경이 highlight-soft 인 행 = 고른 모델 */
const MODEL_SELECTED_INDEX = under(F_MODEL, "sensor-model-suggest").filter((n) => leaf(n) === "suggest-row").findIndex((n) => (n.fills ?? []).length > 0);
const DOC_ADD = { label: texts(F_DESK, "label", "sensor-doc-add")[0], button: node(F_DESK, "button-outline", "sensor-doc-add") };
const LINK = {
  existing: texts(F_REVIEW, "label", "link-summary")[0],
  newLabel: texts(F_REVIEW, "label", "link-summary").find((t) => t.fontWeight === 600)!,
  actions: texts(F_REVIEW, "label", "link-actions"),
  action: node(F_REVIEW, "text-action", "sensor-link"),
};
const NEW_FIELDS = {
  labels: [...new Set(texts(F_REVIEW, "field-label", "new-sensor-fields").map((t) => t.characters))],
  inside: [...new Set(under(F_REVIEW, "new-sensor-fields").map(leaf).filter((n) => Object.keys(dev.components).includes(n)))],
  segments: texts(F_REVIEW, "label", "segmented-control").map((t) => t.characters),
};
const MENU = {
  sheet: node(F_MENU, "mobile-menu-sheet"),
  school: texts(F_MENU, "school-name", "mobile-menu-sheet")[0],
  user: texts(F_MENU, "user", "mobile-menu-sheet")[0],
  item: node(F_MENU, "menu-item", "mobile-menu-sheet"),
  activeItem: under(F_MENU, "mobile-menu-sheet").find((n) => leaf(n) === "menu-item" && (n.fills ?? []).length > 0)!,
  labels: texts(F_MENU, "label", "menu-list").map((t) => t.characters),
  groupTitles: texts(F_MENU, "caption", "menu-list").map((t) => t.characters),
  logout: texts(F_MENU, "label", "menu-logout")[0],
  /** 첫 묶음 제목(menu-group-title) 앞의 항목 글자 — 노드 순서 */
  firstGroup: (() => {
    const out: string[] = [];
    for (const n of under(F_MENU, "menu-list")) {
      if (leaf(n) === "menu-group-title") break;
      if (leaf(n) === "label" && n.path.includes("menu-item")) out.push(n.text!.characters);
    }
    return out;
  })(),
  buttonOpen: node(F_MENU, "mobile-menu-button"),
  buttonClosed: node(F_HOME, "mobile-menu-button"),
};
const INVITE = {
  more: node(F_INVITE, "invite-more-menu"),
  title: texts(F_INVITE, "sheet-title", "ex-modal-card")[0],
  body: texts(F_INVITE, "sheet-body", "ex-modal-card")[0],
  close: under(F_INVITE, "action-row").find((n) => leaf(n) === "label" && n.path.includes("button-outline"))!.text!,
  confirm: under(F_INVITE, "action-row").find((n) => leaf(n) === "label" && n.path.includes("button-primary"))!.text!,
  confirmFill: node(F_INVITE, "button-primary", "ex-modal-card").fills![0],
};
/** rules 문구 */
const TYPE_EMPTY = singleQuoted(rules.sensor.type_select).find((q) => q.includes("없어요"))!;
const TYPE_BOX_PLACEHOLDER = singleQuoted(rules.sensor.type_select).find((q) => q.includes("고르기"))!;
const FILL_NOTE = singleQuoted(rules.sensor.catalog.fill).find((q) => q.startsWith("카탈로그에서"))!;
const DOC_CHOICE = /'([^']+) \/ ([^']+)'/.exec(d7Row("센서 서류로 등록"))!.slice(1, 3);
const DOC_PATH = /경로 `([^`]+)`/.exec(d7Row("센서 서류로 등록"))![1];
const CATALOG_BADGE = singleQuoted(rules.sensor.doc.new_sensor).find((q) => q === "카탈로그")!;
const GUEST_SIGNUP = singleQuoted(rules.mobile_menu.guest).find((q) => q.includes("가입"))!;
const GUEST_SCHOOL = singleQuoted(rules.mobile_menu.guest).find((q) => q.includes("학교"))!;

// ---------- 색 ----------
const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const HIGHLIGHT = rgb(rules.colors.highlight.values[0]);
const HIGHLIGHT_SOFT = rgb(rules.colors.highlight.values[1]);
const ALLOWED_RGB = rules.colors.allowed.map((c) => rgb(c.toLowerCase()));
const ACCENT_RGB = [rgb(rules.colors.accent.value), rgb(rules.colors.accent_soft.value)];
const NO_TEXT_RGB = rules.colors.highlight.no_text.map(rgb);
const TRANSPARENT = (v: string) => v === "rgba(0, 0, 0, 0)" || v === "transparent";

const sel = (n: string) => `[data-component="${n}"]`;
const dn = (n: string) => `[data-name="${n}"]`;
const area = (page: Page, id: string) => page.locator(`section[aria-labelledby="g-${id}"]`);

async function open(page: Page, path: string): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `${path} 응답`).toBe(200);
  await page.waitForLoadState("load");
}

/** 클라이언트 컴포넌트가 붙을 때까지 (React 속성) */
async function hydrated(page: Page, name: string): Promise<void> {
  await page.waitForFunction((n) => {
    const el = document.querySelector(`[data-component="${n}"]`);
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, name);
}

async function style(l: Locator, props: string[]): Promise<Record<string, string>> {
  return l.evaluate((el, ps) => {
    const s = getComputedStyle(el);
    return Object.fromEntries(ps.map((p) => [p, s.getPropertyValue(p)]));
  }, props);
}

/** 글자 노드의 프레임 크기 · 굵기 (+ 색) 와 같은지 */
async function expectText(l: Locator, t: { characters: string; fontSize: number; fontWeight: number }, what: string, fill?: string): Promise<void> {
  await expect(l, `${what} 글자`).toHaveText(t.characters);
  const s = await style(l, ["font-size", "font-weight", "color"]);
  expect(s["font-size"], `${what} 크기`).toBe(`${t.fontSize}px`);
  expect(s["font-weight"], `${what} 굵기`).toBe(String(t.fontWeight));
  if (fill) expect(s.color, `${what} 색`).toBe(rgb(fill));
}

/** 데스크톱 폭 (dev-rules viewports desktop 1440 — playwright desktop 프로젝트) */
async function isDesktop(page: Page): Promise<boolean> {
  return (page.viewportSize()?.width ?? 0) >= 1024;
}

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b, "보이는 상자").not.toBeNull();
  return b!;
}

/** 범위 안 모든 요소의 글자 · 바탕 · 테두리 · svg 색이 rules colors.allowed 안 · accent(핑크) 0 · 하늘색 글자 0 · button-primary 안 하늘색 0 */
async function expectPalette(scope: Locator, what: string): Promise<void> {
  const used = await scope.evaluate((rootEl) => {
    const out: { prop: string; value: string; hasText: boolean; inPrimary: boolean; tag: string }[] = [];
    const els = [rootEl, ...Array.from(rootEl.querySelectorAll("*"))];
    for (const el of els) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      const ownText = Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== "");
      const inPrimary = !!el.closest('[data-component="button-primary"]');
      const push = (prop: string, value: string) => out.push({ prop, value, hasText: ownText, inPrimary, tag: `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").slice(0, 40)}` });
      if (ownText) push("color", s.color);
      push("background-color", s.backgroundColor);
      for (const side of ["top", "right", "bottom", "left"]) {
        if (parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 && s.getPropertyValue(`border-${side}-style`) !== "none") push("border-color", s.getPropertyValue(`border-${side}-color`));
      }
      if (el instanceof SVGElement) {
        if (s.stroke && s.stroke !== "none") push("stroke", s.stroke);
        if (s.fill && s.fill !== "none" && el.tagName.toLowerCase() !== "svg") push("fill", s.fill);
      }
    }
    return out;
  });
  expect(used.length, `${what}: 본 요소 있음`).toBeGreaterThan(0);
  const bad = used.filter((u) => !TRANSPARENT(u.value) && !ALLOWED_RGB.includes(u.value));
  expect(bad, `${what}: rules colors.allowed 밖 색 0`).toEqual([]);
  const pink = used.filter((u) => ACCENT_RGB.includes(u.value));
  expect(pink, `${what}: accent · accent_soft(핑크) 0 — only_within ${rules.colors.accent.only_within.join("·")} 밖`).toEqual([]);
  const skyText = used.filter((u) => u.prop === "color" && u.hasText && NO_TEXT_RGB.includes(u.value));
  expect(skyText, `${what}: 하늘색 글자 0 (highlight.no_text)`).toEqual([]);
  const skyPrimary = used.filter((u) => u.inPrimary && [HIGHLIGHT, HIGHLIGHT_SOFT].includes(u.value));
  expect(skyPrimary, `${what}: button-primary 안 하늘색 0 (highlight.forbidden_within)`).toEqual([]);
}

// =====================================================================
// 기대값 원본
// =====================================================================

test(`[K1][S*] 기대값 원본: dev-rules components 에 새 ${NEW.length}개 · 각각 프레임에 있음 · rules ${rules.version} 문구 · d7 §28 경로`, () => {
  expect(rules.version).toBe("1.28");
  const names = Object.keys(dev.components);
  for (const n of NEW) expect(names, `dev-rules components ${n}`).toContain(n);
  const frames = [F_TYPE, F_FILTER, F_MODEL, F_DESK, F_REVIEW, F_MENU, F_HOME, F_INVITE];
  // invite-cancel 은 메뉴 항목이라 시안에 열린 메뉴가 그려지지 않았다 → rules invite_cancel.entry 문장에서 확인
  for (const n of NEW) {
    const inFrame = frames.some((f) => f.some((x) => leaf(x) === n));
    expect(inFrame || rules.invite_cancel.entry.includes(n), `프레임 또는 rules 에 ${n}`).toBe(true);
  }
  expect(rules.invite_cancel.entry).toContain("invite-cancel '초대 취소'(ink)");
  expect(TYPE.groupNames.map((t) => t.characters), "17-type 묶음 = rules type_groups").toEqual(Object.keys(rules.sensor.type_groups));
  expect(TYPE.groupCounts.map((t) => t.characters), "17-type 개수 = rules type_groups").toEqual(Object.values(rules.sensor.type_groups).map((v) => String(v.length)));
  expect(TYPE_OPEN.length, "17-type 펼친 묶음 1").toBe(1);
  expect(rules.sensor.type_groups[TYPE_OPEN[0]], "펼친 묶음에 고른 종류").toContain(TYPE.selectedLabel.characters);
  expect(TYPE.boxValue.characters, "17-type 고르기 칸 값 = 고른 chip").toBe(TYPE.selectedLabel.characters);
  expect(TYPE_EMPTY).toBe("맞는 종류가 없어요");
  expect(TYPE_BOX_PLACEHOLDER).toBe("종류 고르기");
  expect(FILL_NOTE).toBe(MODEL.note.characters);
  expect(DOC_CHOICE).toEqual(["서류로 등록", "직접 입력"]);
  expect(DOC_PATH).toBe("/sensors/doc");
  expect(DOC_ADD.label.characters).toBe(DOC_CHOICE[0]);
  expect(MODEL_SELECTED_INDEX, "17-model 고른 행 1").toBeGreaterThanOrEqual(0);
  expect(MENU.labels, "13-menu QR 스캔").toContain("QR 스캔");
  expect(GUEST_SCHOOL).toBe("데모 학교");
  expect(GUEST_SIGNUP).toBe("가입하기");
  expect(INVITE.title.characters).toContain(" 초대를 취소할까요?");
  expect([INVITE.close.characters, INVITE.confirm.characters]).toEqual(["닫기", "초대 취소"]);
});

// =====================================================================
// K1 — 갤러리에 등장
// =====================================================================

test(`[K1][S*] /gallery 에 새 컴포넌트 ${NEW.length}개 data-component 가 각각 1개 이상 · /gallery/sensor-catalog · /gallery/menu 연결`, async ({ page }) => {
  await open(page, GALLERY);
  for (const n of NEW) expect(await page.locator(sel(n)).count(), `/gallery ${n}`).toBeGreaterThanOrEqual(1);
  await expect(page.locator(`a[href="${SENSOR_GALLERY}"]`).first()).toBeAttached();
  await expect(page.locator(`a[href="${MENU_GALLERY}"]`).first()).toBeAttached();
});

test("[K1][S*] /gallery/sensor-catalog · /gallery/menu: 컴포넌트가 각각 1개 이상 (센서 7개 + sensor-type-select · 메뉴 · 초대 4개)", async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  for (const n of ["sensor-type-sheet", "sensor-type-group", "sensor-type-select", "sensor-model-suggest", "catalog-fill-note", "sensor-doc-add", "sensor-link", "new-sensor-fields"]) {
    expect(await page.locator(sel(n)).count(), `${SENSOR_GALLERY} ${n}`).toBeGreaterThanOrEqual(1);
  }
  await open(page, MENU_GALLERY);
  for (const n of ["mobile-menu-button", "mobile-menu-sheet", "invite-more-menu", "invite-cancel"]) {
    expect(await page.locator(sel(n)).count(), `${MENU_GALLERY} ${n}`).toBeGreaterThanOrEqual(1);
  }
});

// =====================================================================
// 종류 고르기 시트 (17-type) · 묶음 (17-filter) · 고르기 칸
// =====================================================================

test(`[C1][S17] sensor-type-sheet 시안 17-type: 머리 '${TYPE.title.characters}' · 검색 '${TYPE.placeholder.characters}' · 묶음 4줄(이름 · 개수) · 고른 '${TYPE.selectedLabel.characters}' 묶음만 펼침`, async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  const sheet = area(page, "type-sheet-mobile").locator(sel("sensor-type-sheet"));
  await expect(sheet).toHaveCount(1);
  await expectText(sheet.getByRole("heading", { name: TYPE.title.characters }), TYPE.title, "시트 머리", node(F_TYPE, "sheet-title").fills![0]);
  await expect(sheet.getByPlaceholder(TYPE.placeholder.characters, { exact: true }), "검색 칸").toHaveCount(1);
  const groups = sheet.locator(sel("sensor-type-group"));
  await expect(groups).toHaveCount(TYPE.groupNames.length);
  for (let i = 0; i < TYPE.groupNames.length; i++) {
    const g = groups.nth(i);
    const row = g.locator(dn("group-row"));
    await expect(row.locator("span").first(), `묶음 ${i + 1} 줄`).toContainText(TYPE.groupNames[i].characters);
    await expectText(row.getByText(TYPE.groupNames[i].characters, { exact: true }), TYPE.groupNames[i], `묶음 이름 ${i + 1}`, node(F_TYPE, "group-name").fills![0]);
    await expectText(row.getByText(TYPE.groupCounts[i].characters, { exact: true }), TYPE.groupCounts[i], `묶음 개수 ${i + 1}`, node(F_TYPE, "group-count").fills![0]);
    expect(Math.round((await box(row)).height), `묶음 줄 높이 ${i + 1}`).toBe(TYPE.row.height);
    const isOpen = TYPE_OPEN.includes(TYPE.groupNames[i].characters);
    await expect(row, `${TYPE.groupNames[i].characters} 펼침`).toHaveAttribute("aria-expanded", String(isOpen));
    await expect(g.locator(dn("chip-wrap")), `${TYPE.groupNames[i].characters} chip`).toHaveCount(isOpen ? 1 : 0);
  }
  // 줄 사이 hairline-soft (첫 줄 위 없음)
  for (let i = 1; i < TYPE.groupNames.length; i++) {
    const s = await style(groups.nth(i), ["border-top-width", "border-top-color"]);
    expect(s["border-top-width"], `묶음 ${i + 1} 위 선`).toBe("1px");
    expect(s["border-top-color"], `묶음 ${i + 1} 선 색 = 프레임`).toBe(rgb(under(F_TYPE, "type-groups").filter((n) => leaf(n) === "sensor-type-group")[i].strokes![0]));
  }
  // 펼친 묶음 chip = rules 그 묶음 종류 그대로 · 고른 chip = highlight-soft + highlight 테두리 + 600
  const openTitle = TYPE_OPEN[0];
  const openGroup = groups.filter({ has: page.getByRole("button", { name: new RegExp(openTitle) }) }).first();
  const chips = openGroup.locator(`${dn("chip-wrap")} button`);
  expect((await chips.allInnerTexts()).map((t) => t.trim()), `${openTitle} chip = rules type_groups`).toEqual(rules.sensor.type_groups[openTitle]);
  const plain = openGroup.locator(dn("type-chip")).first();
  const ps = await style(plain, ["background-color", "height", "border-top-left-radius", "font-size", "font-weight"]);
  expect(ps["background-color"], "chip 바탕").toBe(rgb(TYPE.chip.fills![0]));
  expect(ps.height, "chip 높이").toBe(`${TYPE.chip.height}px`);
  expect(parseFloat(ps["border-top-left-radius"]), "chip pill").toBeGreaterThanOrEqual(TYPE.chip.height! / 2);
  expect(ps["font-size"]).toBe(`${TYPE.chipLabel.fontSize}px`);
  const on = openGroup.locator(dn("type-chip-selected"));
  await expect(on).toHaveCount(1);
  await expect(on).toHaveText(TYPE.selectedLabel.characters);
  await expect(on).toHaveAttribute("aria-pressed", "true");
  const os = await style(on, ["background-color", "border-top-color", "border-top-width", "font-weight"]);
  expect(os["background-color"], "고른 chip 바탕 = highlight-soft").toBe(rgb(TYPE.selected.fills![0]));
  expect(os["background-color"]).toBe(HIGHLIGHT_SOFT);
  expect(os["border-top-color"], "고른 chip 테두리 = highlight").toBe(rgb(TYPE.selected.strokes![0]));
  expect(os["border-top-color"]).toBe(HIGHLIGHT);
  expect(parseFloat(os["border-top-width"]), "고른 chip 테두리 있음").toBeGreaterThan(0);
  expect(os["font-weight"], "고른 chip 굵기").toBe(String(TYPE.selectedLabel.fontWeight));
  // 27종을 한꺼번에 펼쳐 두지 않는다
  const shown = await sheet.locator(`${dn("chip-wrap")} button`).count();
  expect(shown, "보이는 chip < 27").toBeLessThan(rules.sensor.types.length);
  await expectPalette(sheet, "sensor-type-sheet");
});

test(`[C1][S17] sensor-type-sheet 검색: '산소' = 맞는 묶음만 펼쳐 맞는 chip 만 · 없는 글자 = '${TYPE_EMPTY}' · 검색 지우면 4줄`, async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  const sheets = area(page, "type-sheet-search").locator(sel("sensor-type-sheet"));
  await expect(sheets).toHaveCount(2);
  const want = Object.entries(rules.sensor.type_groups)
    .map(([title, types]) => ({ title, types: types.filter((t) => t.includes("산소")) }))
    .filter((g) => g.types.length > 0);
  const s1 = sheets.nth(0);
  await expect(s1.getByPlaceholder(TYPE.placeholder.characters)).toHaveValue("산소");
  const g1 = s1.locator(sel("sensor-type-group"));
  await expect(g1).toHaveCount(want.length);
  for (const [i, w] of want.entries()) {
    await expect(g1.nth(i).locator(dn("group-row"))).toContainText(w.title);
    expect((await g1.nth(i).locator(`${dn("chip-wrap")} button`).allInnerTexts()).map((t) => t.trim()), `${w.title} 맞는 chip`).toEqual(w.types);
  }
  const s2 = sheets.nth(1);
  await expect(s2.locator(sel("sensor-type-group")), "맞는 종류 없음 = 묶음 0").toHaveCount(0);
  const empty = s2.getByText(TYPE_EMPTY, { exact: true });
  await expect(empty).toHaveCount(1);
  expect((await style(empty, ["color"])).color, "muted").toBe(rgb("#707070"));
  // 지우면 4줄 (모두 접힘 — 고른 값 없음)
  await hydrated(page, "sensor-type-sheet");
  await s2.getByPlaceholder(TYPE.placeholder.characters).fill("");
  await expect(s2.locator(sel("sensor-type-group"))).toHaveCount(Object.keys(rules.sensor.type_groups).length);
  await expect(s2.locator(`${dn("group-row")}[aria-expanded="true"]`), "고른 게 없으면 모두 접힘").toHaveCount(0);
});

test(`[C1][S17] sensor-type-select box (시안 17-type sensor-type-select): '${TYPE.boxLabel.characters} [${TYPE.boxValue.characters} ▾]' · 빈 칸 '${TYPE_BOX_PLACEHOLDER}' · 누르면 시트 · 다른 묶음 펼침 · 하나 고르면 바로 닫힘`, async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  const sec = area(page, "type-select-box");
  const selects = sec.locator(sel("sensor-type-select"));
  await expect(selects).toHaveCount(3);
  const demo = selects.nth(0);
  await expectText(demo.getByText(TYPE.boxLabel.characters, { exact: true }), TYPE.boxLabel, "라벨", node(F_TYPE, "field-label", "sensor-type-select").fills![0]);
  const boxBtn = demo.locator(dn("select-box"));
  await expect(boxBtn).toContainText(TYPE.boxValue.characters);
  const bs = await style(boxBtn, ["background-color", "border-top-left-radius", "font-size"]);
  expect(bs["background-color"], "칸 바탕 = 프레임").toBe(rgb(TYPE.box.fills![0]));
  expect(bs["border-top-left-radius"], "칸 radius").toBe(`${TYPE.box.cornerRadius}px`);
  expect(bs["font-size"]).toBe(`${TYPE.boxValue.fontSize}px`);
  await expect(selects.nth(1).locator(dn("select-box")), "빈 칸 placeholder").toHaveText(TYPE_BOX_PLACEHOLDER);
  // 카탈로그로 채운 칸 = highlight-soft (rules catalog.fill)
  expect((await style(selects.nth(2).locator(dn("select-box")), ["background-color"]))["background-color"], "채운 칸 = highlight-soft").toBe(HIGHLIGHT_SOFT);

  await hydrated(page, "sensor-type-select");
  await expect(demo.locator(sel("sensor-type-sheet")), "처음 닫힘").toHaveCount(0);
  await boxBtn.click();
  const sheet = demo.locator(sel("sensor-type-sheet"));
  await expect(sheet).toHaveCount(1);
  await expect(boxBtn).toHaveAttribute("aria-expanded", "true");
  await expect(sheet.locator(`${dn("group-row")}[aria-expanded="true"]`), "고른 종류 묶음만 펼침").toHaveCount(1);
  // 다른 묶음 누르면 함께 펼침 (여러 묶음 동시에)
  const first = Object.keys(rules.sensor.type_groups)[0];
  await sheet.locator(dn("group-row")).filter({ hasText: first }).click();
  await expect(sheet.locator(`${dn("group-row")}[aria-expanded="true"]`), "두 묶음 펼침").toHaveCount(2);
  const pick = rules.sensor.type_groups[first][0];
  await sheet.locator(dn("chip-wrap")).getByRole("button", { name: pick, exact: true }).click();
  await expect(demo.locator(sel("sensor-type-sheet")), "고르면 바로 닫힘").toHaveCount(0);
  await expect(boxBtn).toContainText(pick);
  await expectPalette(sec, "sensor-type-select box");
});

test(`[C1][S17] 필터 종류 묶음 (시안 17-filter): 고른 묶음 줄 '${FILTER_COUNT}' · 그 묶음만 펼침 · 여러 개 고르기 · 다른 묶음에서 고르면 그 줄에 '· 1개'`, async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  const sec = area(page, "type-filter");
  const groups = sec.locator(sel("sensor-type-group"));
  await expect(groups).toHaveCount(Object.keys(rules.sensor.type_groups).length);
  const n = Number(/(\d+)개/.exec(FILTER_COUNT)![1]);
  const chem = groups.filter({ hasText: "화학" });
  await expect(chem.locator(dn("group-row"))).toContainText(FILTER_COUNT);
  await expect(chem.locator(dn("group-row"))).toHaveAttribute("aria-expanded", "true");
  await expect(chem.locator(dn("type-chip-selected"))).toHaveCount(n);
  await expect(sec.locator(`${dn("group-row")}[aria-expanded="true"]`), "고른 게 있는 묶음만 펼침").toHaveCount(1);
  // 개수가 없는 줄은 개수 글자 없음 (고르기 시트와 달리 전체 개수 아님)
  for (const t of Object.keys(rules.sensor.type_groups).filter((x) => x !== "화학")) {
    await expect(groups.filter({ hasText: t }).locator(dn("group-row")), `${t} 줄 개수 없음`).not.toContainText("개");
  }
  await hydrated(page, "sensor-type-group");
  const phys = groups.filter({ hasText: "물리" });
  await phys.locator(dn("group-row")).click();
  await expect(phys.locator(dn("group-row"))).toHaveAttribute("aria-expanded", "true");
  await phys.locator(dn("chip-wrap")).getByRole("button", { name: rules.sensor.type_groups["물리"][0], exact: true }).click();
  await expect(phys.locator(dn("group-row"))).toContainText("· 1개");
  await expect(chem.locator(dn("type-chip-selected")), "앞 묶음 고른 것 그대로 (여러 개)").toHaveCount(n);
  await expectPalette(sec, "필터 종류 묶음");
});

// =====================================================================
// 파스코 모델 후보 (17-model) · 채움 안내
// =====================================================================

test(`[C1][S17] sensor-model-suggest 시안 17-model: '${MODEL.match.characters}' 후보 ≤ 6줄 · 앞 4줄 모델 · caption '이름 · 종류' · 맞은 글자 ${MODEL.match.fontWeight} · 고른 행 highlight-soft ✓ · 맨 끝 '${MODEL.rawText.characters}'`, async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  const lists = area(page, "model-suggest-static").locator(sel("sensor-model-suggest"));
  await expect(lists).toHaveCount(2);
  const list = lists.nth(0);
  const max = Number(/최대 (\d+)줄/.exec(rules.sensor.catalog.suggest)![1]);
  const rows = list.getByRole("option");
  const count = await rows.count();
  expect(count, `후보 ≤ ${max}`).toBeLessThanOrEqual(max);
  expect(count, "후보가 있음").toBeGreaterThanOrEqual(MODEL.rests.length);
  const ls = await style(list, ["background-color", "border-top-color", "border-top-width"]);
  expect(ls["background-color"], "목록 바탕").toBe(rgb(MODEL.list.fills![0]));
  expect(ls["border-top-color"], "목록 테두리").toBe(rgb(MODEL.list.strokes![0]));
  const frameModels = MODEL.rests.map((r) => `${MODEL.match.characters}${r}`);
  for (let i = 0; i < 4; i++) {
    const row = rows.nth(i);
    await expect(row.locator(dn("model-number")), `${i + 1}줄 모델`).toHaveText(frameModels[i]);
    await expectText(row.locator(dn("match")), MODEL.match, `${i + 1}줄 맞은 글자`, node(F_MODEL, "match").fills![0]);
    const rest = row.locator(dn("model-number")).locator("span").last();
    const rs = await style(rest, ["font-weight", "font-size"]);
    expect(rs["font-weight"], "나머지 글자 굵기").toBe(String(MODEL.rest.fontWeight));
    expect(rs["font-size"]).toBe(`${MODEL.rest.fontSize}px`);
    await expectText(row.getByText(MODEL.captions[i].characters, { exact: true }), MODEL.captions[i], `${i + 1}줄 caption`, node(F_MODEL, "caption", "suggest-row").fills![0]);
  }
  // 고른 모델 (시안 고른 행) = highlight-soft + aria-selected + ✓
  const selectedModel = frameModels[MODEL_SELECTED_INDEX];
  const sel1 = rows.filter({ hasText: selectedModel });
  await expect(sel1).toHaveCount(1);
  await expect(sel1).toHaveAttribute("aria-selected", "true");
  expect((await style(sel1, ["background-color"]))["background-color"], "고른 행 바탕").toBe(HIGHLIGHT_SOFT);
  await expect(sel1.locator("svg"), "고른 행 ✓").toHaveCount(1);
  await expect(list.locator('[aria-selected="true"]'), "고른 행 1").toHaveCount(1);
  expect(Math.round((await box(rows.nth(0))).height), "행 높이").toBe(MODEL.row.height);
  await expectText(list.locator(dn("suggest-raw")), MODEL.rawText, "그대로 적기", under(F_MODEL, "suggest-raw").find((n) => n.text)!.fills![0]);
  // 이름 검색 '편광' (rules suggest 예시)
  const ex = /'([^']+ · [^']+)'/.exec(rules.sensor.catalog.suggest)![1];
  await expect(lists.nth(1).getByRole("option").first(), `'편광' 첫 줄 caption`).toContainText(ex);
  await expectPalette(area(page, "model-suggest-static"), "sensor-model-suggest");
});

test(`[C1][S17] 모델 고르면 채움 (rules catalog.fill): 모델명 = 모델번호 · 종류 칸 = 카탈로그 종류(highlight-soft) · 빈 이름 = 한국어 이름 · catalog-fill-note '${FILL_NOTE}'`, async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  const sec = area(page, "model-suggest");
  await hydrated(page, "sensor-model-suggest");
  await expect(sec.locator(sel("catalog-fill-note")), "고르기 전 안내 없음").toHaveCount(0);
  const selectedModel = `${MODEL.match.characters}${MODEL.rests[MODEL_SELECTED_INDEX]}`;
  const [wantName, wantType] = MODEL.captions[MODEL_SELECTED_INDEX].characters.split(" · ");
  await sec.locator(sel("sensor-model-suggest")).getByRole("option").filter({ hasText: selectedModel }).click();
  await expect(sec.locator(sel("sensor-model-suggest")), "고르면 목록 닫힘").toHaveCount(0);
  await expect(sec.getByLabel("모델명")).toHaveValue(selectedModel);
  await expect(sec.getByLabel("이름")).toHaveValue(wantName);
  const typeBox = sec.locator(`${sel("sensor-type-select")} ${dn("select-box")}`);
  await expect(typeBox).toContainText(wantType);
  expect((await style(typeBox, ["background-color"]))["background-color"], "채운 종류 칸 = highlight-soft").toBe(HIGHLIGHT_SOFT);
  const note = sec.locator(sel("catalog-fill-note"));
  await expect(note).toHaveCount(1);
  await expectText(note.locator("span"), MODEL.note, "채움 안내", MODEL.noteFill);
  await expect(note.locator("svg"), "icon-info").toHaveCount(1);
  await expectPalette(sec, "모델 채움 데모");
});

test(`[C1][S17] catalog-fill-note 시안 17-model: icon-info + '${MODEL.note.characters}' ${MODEL.note.fontSize}/${MODEL.note.fontWeight} muted · 종류만 채우면 '이름' 빠짐`, async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  const notes = area(page, "model-suggest-static").locator(sel("catalog-fill-note"));
  await expect(notes).toHaveCount(2);
  await expectText(notes.nth(0).locator("span"), MODEL.note, "안내", MODEL.noteFill);
  const iconColor = await notes.nth(0).locator("svg").evaluate((e) => getComputedStyle(e).color);
  expect(iconColor, "아이콘 muted").toBe(rgb(under(F_MODEL, "icon-info")[0].strokes![0]));
  const typeOnly = (await notes.nth(1).innerText()).trim();
  expect(typeOnly.startsWith("카탈로그에서")).toBe(true);
  expect(typeOnly).toContain("종류");
  expect(typeOnly).not.toContain("이름");
});

// =====================================================================
// 센서 서류로 등록 (17-desktop · 17-doc-review)
// =====================================================================

test(`[C1][S17] sensor-doc-add 시안 17-desktop: button-outline '${DOC_ADD.label.characters}' ${DOC_ADD.label.fontSize}/${DOC_ADD.label.fontWeight} · 높이 ${DOC_ADD.button.height} · 주소 ${DOC_PATH} · 모바일 시트 '${DOC_CHOICE.join(" / ")}'`, async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  const add = area(page, "doc-add").locator(sel("sensor-doc-add")).first();
  const btn = add.locator(sel("button-outline"));
  await expect(btn).toHaveCount(1);
  await expect(btn).toHaveAttribute("href", DOC_PATH);
  await expectText(btn.getByText(DOC_ADD.label.characters, { exact: true }), DOC_ADD.label, "버튼 글자", node(F_DESK, "label", "sensor-doc-add").fills![0]);
  const bs = await style(btn, ["background-color", "border-top-color", "min-height"]);
  expect(bs["background-color"], "바탕").toBe(rgb(DOC_ADD.button.fills![0]));
  expect(bs["border-top-color"], "테두리").toBe(rgb(DOC_ADD.button.strokes![0]));
  expect(Math.round((await box(btn)).height), "높이").toBe(DOC_ADD.button.height);
  await expect(btn.locator("svg"), "문서 아이콘").toHaveCount(1);
  // 모바일 '등록' 시트 2줄
  const choice = area(page, "doc-add-choice");
  const links = choice.getByRole("link");
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toContainText(DOC_CHOICE[0]);
  await expect(links.nth(0)).toHaveAttribute("href", DOC_PATH);
  await expect(links.nth(1)).toContainText(DOC_CHOICE[1]);
  await expect(choice.locator(sel("sensor-doc-add")), "서류로 등록 줄 = sensor-doc-add").toHaveCount(1);
  await expectPalette(area(page, "doc-add"), "sensor-doc-add");
  await expectPalette(choice, "등록 시트");
});

test(`[C1][S17] sensor-link 시안 17-doc-review: '${LINK.existing.characters}' ${LINK.existing.fontSize}px · '${LINK.actions.slice(0, 2).map((t) => t.characters).join("'·'")}' muted 높이 ${LINK.action.height} · '${LINK.newLabel.characters}' ${LINK.newLabel.fontWeight} · 바꾸기 = 우리 학교 센서 + 새 센서`, async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  const sec = area(page, "sensor-link");
  const links = sec.locator(sel("sensor-link"));
  await expect(links).toHaveCount(2);
  const a = links.nth(0);
  await expectText(a.locator(dn("link-summary")).locator("span").last(), LINK.existing, "기존 센서 줄", node(F_REVIEW, "label", "link-summary").fills![0]);
  const acts = a.locator(`${dn("link-actions")} button`);
  await expect(acts).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expectText(acts.nth(i), LINK.actions[i], `조용한 버튼 ${i + 1}`, under(F_REVIEW, "text-action").find((n) => n.text)!.fills![0]);
    expect(Math.round((await box(acts.nth(i))).height), "누름 높이").toBe(LINK.action.height);
  }
  const icon = a.locator(dn("link-summary")).locator("svg").first();
  expect(await icon.evaluate((e) => getComputedStyle(e).color), "icon-link = highlight").toBe(rgb(under(F_REVIEW, "icon-link")[0].strokes![0]));
  const b = links.nth(1);
  await expectText(b.locator(dn("link-summary")).getByText(LINK.newLabel.characters, { exact: true }), LINK.newLabel, "새 센서 줄", node(F_REVIEW, "label", "link-summary").fills![0]);
  await expect(b.locator(dn("link-summary"))).toHaveAttribute("aria-expanded", "true");
  await expect(sec.locator(sel("new-sensor-fields")), "새 센서 펼침").toHaveCount(1);
  // 바꾸기 → 우리 학교 센서 고르기 + '새 센서로 등록'
  await hydrated(page, "sensor-link");
  await acts.nth(0).click();
  const picker = a.getByRole("listbox");
  await expect(picker).toHaveCount(1);
  await expect(picker.getByRole("option").last()).toHaveText(LINK.newLabel.characters);
  await picker.getByRole("option").last().click();
  await expect(a).toHaveAttribute("data-link", "new");
  await expect(a.locator(dn("link-summary"))).toContainText(LINK.newLabel.characters);
  // 접기
  await b.locator(dn("link-summary")).click();
  await expect(sec.locator(sel("new-sensor-fields")), "접으면 칸 숨김").toHaveCount(0);
  await expectPalette(sec, "sensor-link");
});

test(`[C1][S17] new-sensor-fields 시안 17-doc-review: 라벨 ${NEW_FIELDS.labels.join(" · ")} · 안 컴포넌트 ${NEW_FIELDS.inside.join(" · ")} · 보관 위치 '${NEW_FIELDS.segments.slice(0, 2).join(" | ")}' · 상태 기본 정상 · 카탈로그 값 옆 '${CATALOG_BADGE}'`, async ({ page }) => {
  await open(page, SENSOR_GALLERY);
  const fields = area(page, "sensor-link").locator(sel("new-sensor-fields"));
  await expect(fields).toHaveCount(1);
  const labelTexts = (await fields.locator("label, span[id]").allInnerTexts()).map((t) => t.trim()).filter((t) => NEW_FIELDS.labels.includes(t));
  expect(labelTexts, "라벨 순서 = 프레임").toEqual(NEW_FIELDS.labels);
  for (const c of NEW_FIELDS.inside) expect(await fields.locator(sel(c)).count(), `안 컴포넌트 ${c}`).toBeGreaterThanOrEqual(1);
  await expect(fields.locator(`${sel("sensor-type-select")} ${dn("select-box")}`), "종류 = box 고르기 칸").toHaveCount(1);
  const segs = fields.locator(sel("segmented-control"));
  expect((await segs.nth(0).locator(":scope > *").allInnerTexts()).map((t) => t.trim()), "보관 위치").toEqual(NEW_FIELDS.segments.slice(0, 2));
  expect((await segs.nth(1).locator(":scope > *").allInnerTexts()).map((t) => t.trim()), "상태").toEqual(NEW_FIELDS.segments.slice(2));
  await expect(segs.nth(1).locator(sel("segmented-control-active")), "상태 기본 = 정상").toHaveText(NEW_FIELDS.segments[2]);
  await expect(segs.nth(0).locator(sel("segmented-control-active")), "보관 위치 기본 = 직접 입력").toHaveText(NEW_FIELDS.segments[0]);
  const label = await style(fields.getByText(NEW_FIELDS.labels[0], { exact: true }), ["font-size", "font-weight"]);
  const lt = texts(F_REVIEW, "field-label", "new-sensor-fields")[0];
  expect(label["font-size"]).toBe(`${lt.fontSize}px`);
  expect(label["font-weight"]).toBe(String(lt.fontWeight));
  const fill = await style(fields, ["background-color", "border-top-color"]);
  expect(fill["background-color"], "칸 묶음 바탕").toBe(rgb(node(F_REVIEW, "new-sensor-fields").fills![0]));
  expect(fill["border-top-color"], "칸 묶음 테두리").toBe(rgb(node(F_REVIEW, "new-sensor-fields").strokes![0]));
  // 카탈로그로 채운 값 옆 caption
  const cat = area(page, "new-sensor-fields-static").locator(sel("new-sensor-fields"));
  await expect(cat.getByText(CATALOG_BADGE, { exact: true }).first(), "카탈로그 caption").toBeVisible();
  expect((await style(cat.getByText(CATALOG_BADGE, { exact: true }).first(), ["color"])).color, "caption muted").toBe(rgb("#707070"));
  await expectPalette(area(page, "sensor-link"), "new-sensor-fields");
  await expectPalette(area(page, "new-sensor-fields-static"), "new-sensor-fields 카탈로그");
});

// =====================================================================
// 모바일 전체 메뉴 (13-menu-mobile) · 버튼 (13-mobile)
// =====================================================================

test(`[C1][S13] mobile-menu-button 시안 13-mobile · 13-menu-mobile: ${MENU.buttonClosed.width}×${MENU.buttonClosed.height} 동그라미 · 글자 없음 · 열림 = highlight-soft`, async ({ page }) => {
  await open(page, MENU_GALLERY);
  const btns = area(page, "menu-button").locator(sel("mobile-menu-button"));
  await expect(btns).toHaveCount(2);
  if (await isDesktop(page)) {
    // rules mobile_menu.button "모바일 nav-pill" — 데스크톱(사이드바가 있는 폭)에서는 보이지 않는다
    for (let i = 0; i < 2; i++) await expect(btns.nth(i), "데스크톱 숨김").toBeHidden();
    return;
  }
  for (let i = 0; i < 2; i++) {
    const b = await box(btns.nth(i));
    expect(Math.round(b.width), "폭").toBe(MENU.buttonClosed.width);
    expect(Math.round(b.height), "높이").toBe(MENU.buttonClosed.height);
    expect((await btns.nth(i).innerText()).trim(), "글자 없음").toBe("");
    await expect(btns.nth(i), "이름 있음(보조기기)").toHaveAttribute("aria-label", /.+/);
    const s = await style(btns.nth(i), ["border-top-left-radius"]);
    expect(parseFloat(s["border-top-left-radius"]), "동그라미").toBeGreaterThanOrEqual(MENU.buttonClosed.height! / 2);
  }
  const closed = (await style(btns.nth(0), ["background-color"]))["background-color"];
  expect(TRANSPARENT(closed) || closed === rgb("#f3f3f3"), `닫힘 바탕 (프레임 ${MENU.buttonClosed.fills?.join(",") || "없음"})`).toBe(true);
  expect((await style(btns.nth(1), ["background-color"]))["background-color"], "열림 = highlight-soft").toBe(rgb(MENU.buttonOpen.fills![0]));
  await expect(btns.nth(1)).toHaveAttribute("aria-expanded", "true");
  const iconColor = await btns.nth(0).locator("svg").evaluate((e) => getComputedStyle(e).color);
  expect(iconColor, "아이콘 ink").toBe(rgb(under(F_MENU, "icon-menu")[0].strokes![0]));
  await expectPalette(area(page, "menu-button"), "mobile-menu-button");
});

test(`[C1][S13] mobile-menu-sheet admin 시안 13-menu-mobile: '${MENU.school.characters}' · '${MENU.user.characters}' · 항목 ${MENU.labels.length}개 · 묶음 ${MENU.groupTitles.join("·")} · 홈 활성 · QR 스캔 정상(준비 중 없음 — d7 §28)`, async ({ page }) => {
  await open(page, MENU_GALLERY);
  const sheet = area(page, "menu-admin").locator(sel("mobile-menu-sheet"));
  await expect(sheet).toHaveCount(1);
  await expectText(sheet.getByRole("heading", { name: MENU.school.characters }), MENU.school, "학교명", node(F_MENU, "school-name", "mobile-menu-sheet").fills![0]);
  await expectText(sheet.getByText(MENU.user.characters, { exact: true }), MENU.user, "이름 · 역할", node(F_MENU, "user", "mobile-menu-sheet").fills![0]);
  const items = sheet.locator(dn("menu-item"));
  const shown = (await items.locator("span:not([data-pending])").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  expect(shown, "항목 글자 = 시안 (준비 중 빼고)").toEqual(MENU.labels);
  expect(await sheet.getByText("준비 중").count(), "준비 중 0 (화면 12 있음)").toBe(0);
  await expect(items).toHaveCount(MENU.labels.length);
  const titles = (await sheet.locator(dn("menu-group-title")).allInnerTexts()).map((t) => t.trim());
  expect(titles, "묶음 제목").toEqual(MENU.groupTitles);
  for (let i = 0; i < MENU.labels.length; i++) {
    expect(Math.round((await box(items.nth(i))).height), `항목 ${i + 1} 높이`).toBe(MENU.item.height);
    const s = await style(items.nth(i), ["border-top-left-radius"]);
    expect(s["border-top-left-radius"], "사각").toBe("0px");
  }
  // 활성 = 홈: highlight-soft + highlight 아이콘 + aria-current
  const activeLabel = texts(F_MENU, "label", "menu-item").find((t) => t.fontWeight === 600)!;
  const active = items.filter({ hasText: activeLabel.characters }).first();
  await expect(active).toHaveAttribute("aria-current", "page");
  expect((await style(active, ["background-color"]))["background-color"], "활성 바탕").toBe(rgb(MENU.activeItem.fills![0]));
  expect(await active.locator("svg").first().evaluate((e) => getComputedStyle(e).color), "활성 아이콘 = highlight").toBe(HIGHLIGHT);
  await expect(sheet.locator('[aria-current="page"]'), "활성 1").toHaveCount(1);
  // QR 스캔 = /scan, ink 글자 (회색 준비 중 아님)
  const qr = items.filter({ hasText: "QR 스캔" });
  await expect(qr).toHaveAttribute("href", dev.routes["12"]);
  expect((await style(qr.getByText("QR 스캔", { exact: true }), ["color"])).color, "QR 스캔 글자 = 다른 항목과 같은 ink (준비 중 회색 아님)").toBe(rgb(node(F_MENU, "label", "menu-item").fills![0]));
  const inactive = items.filter({ hasText: MENU.labels[1] }).first();
  await expectText(inactive.getByText(MENU.labels[1], { exact: true }), texts(F_MENU, "label", "menu-item")[1], "비활성 항목");
  // 시트 모양: 위 radius · 테두리
  const ss = await style(sheet, ["border-top-left-radius", "border-bottom-left-radius", "background-color"]);
  const r = MENU.sheet.cornerRadius as number[];
  expect(ss["border-top-left-radius"], "위 radius").toBe(`${r[0]}px`);
  expect(ss["border-bottom-left-radius"], "아래 0").toBe("0px");
  expect(ss["background-color"]).toBe(rgb(MENU.sheet.fills![0]));
  // 주소 = 데스크톱 사이드바와 같은 화면 (dev-rules routes)
  for (const [label, screen] of [["홈", "13"], ["시약", "2"], ["센서", "17"], ["시약장", "11"], ["입고", "7"], ["실험 매뉴얼", "5"], ["재주문 알림", "6"], ["사용자", "8"], ["판매처", "9"]] as const) {
    await expect(items.filter({ hasText: new RegExp(`^${label}$`) }), `${label} 주소`).toHaveAttribute("href", dev.routes[screen]);
  }
  await expectPalette(sheet, "mobile-menu-sheet admin");
});

test("[C1][S13] mobile-menu-sheet 학생 · 둘러보기 (rules mobile_menu.guest): 학생 = 관리 묶음 없음 · 둘러보기 = 데모 학교 · 기록·QR 스캔 guest-lock · 가입하기 · 로그아웃 없음", async ({ page }) => {
  await open(page, MENU_GALLERY);
  const st = area(page, "menu-student").locator(sel("mobile-menu-sheet"));
  const stLabels = (await st.locator(`${dn("menu-item")} span:not([data-pending])`).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  expect(stLabels, "학생 = 첫 묶음 (관리 · 학교 설정 없음)").toEqual(MENU.firstGroup);
  await expect(st.locator(dn("menu-group-title")), "학생 묶음 제목 0").toHaveCount(0);
  await expect(st.locator('[aria-current="page"]')).toHaveText(/시약/);

  const g = area(page, "menu-guest").locator(sel("mobile-menu-sheet"));
  await expect(g.getByRole("heading", { name: GUEST_SCHOOL })).toHaveCount(1);
  await expect(g.locator(dn("menu-group-title")), "관리 묶음 숨김").toHaveCount(0);
  const gItems = g.locator(dn("menu-item"));
  expect((await gItems.locator("span:not([data-pending])").allInnerTexts()).map((t) => t.trim()).filter(Boolean)).toEqual(["홈", "시약", "센서", "기록", "QR 스캔"]);
  for (const t of ["기록", "QR 스캔"]) {
    const it = gItems.filter({ hasText: t });
    await expect(it.locator(sel("guest-lock")), `${t} guest-lock`).toHaveCount(1);
    expect(await it.evaluate((e) => e.tagName.toLowerCase()), `${t} 이동 없음`).toBe("button");
  }
  for (const t of ["홈", "시약", "센서"]) {
    await expect(gItems.filter({ hasText: t }).locator(sel("guest-lock")), `${t} 잠금 없음`).toHaveCount(0);
    await expect(gItems.filter({ hasText: new RegExp(`^${t}$`) }), `${t} 둘러보기 주소`).toHaveAttribute("href", /^\/demo/);
  }
  await expect(g.locator(sel("button-primary")), GUEST_SIGNUP).toHaveText(GUEST_SIGNUP);
  await expect(g.getByText(MENU.logout.characters, { exact: true }), "둘러보기 로그아웃 없음").toHaveCount(0);
  await expectPalette(st, "mobile-menu-sheet 학생");
  await expectPalette(g, "mobile-menu-sheet 둘러보기");
});

test(`[C1][S13] mobile-menu-button → mobile-menu-sheet: 누르면 열림 · 맨 아래 '${MENU.logout.characters}' ${MENU.logout.fontSize}px muted · 닫기 ×`, async ({ page }) => {
  await open(page, MENU_GALLERY);
  const sec = area(page, "menu-demo");
  await hydrated(page, "mobile-menu-button");
  const btn = sec.locator(sel("mobile-menu-button"));
  if (await isDesktop(page)) {
    await expect(btn, "데스크톱 숨김 (rules mobile_menu.button 모바일)").toBeHidden();
    return;
  }
  await expect(sec.locator(sel("mobile-menu-sheet")), "처음 닫힘").toHaveCount(0);
  await btn.click();
  const sheet = sec.locator(sel("mobile-menu-sheet"));
  await expect(sheet).toHaveCount(1);
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  const logout = sheet.getByRole("button", { name: MENU.logout.characters, exact: true });
  await expectText(logout, MENU.logout, "로그아웃", node(F_MENU, "label", "menu-logout").fills![0]);
  const lb = await box(logout);
  const items = await sheet.locator(dn("menu-item")).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  expect(lb.y, "로그아웃은 맨 아래").toBeGreaterThanOrEqual(Math.max(...items) - 1);
  await sheet.getByRole("button", { name: "닫기" }).click();
  await expect(sec.locator(sel("mobile-menu-sheet")), "× 로 닫힘").toHaveCount(0);
  await btn.click();
  await expect(sheet).toHaveCount(1);
  await logout.click();
  await expect(sec.locator(sel("mobile-menu-sheet")), "로그아웃 누르면 닫힘(데모)").toHaveCount(0);
});

// =====================================================================
// 초대 취소 (8-invite-cancel)
// =====================================================================

test(`[C1][S8] invite-more-menu · invite-cancel 시안 8-invite-cancel: ⋯ ${INVITE.more.width} 동그라미(열림 highlight-soft) → '초대 취소' ink · 확인 '${INVITE.title.characters}' ${INVITE.title.fontSize}/${INVITE.title.fontWeight} · '${INVITE.close.characters}' | '${INVITE.confirm.characters}'(검정)`, async ({ page }) => {
  await open(page, MENU_GALLERY);
  const menu = area(page, "invite-menu").locator(sel("invite-more-menu"));
  await expect(menu).toHaveCount(1);
  const trigger = menu.getByRole("button", { name: /초대 더보기/ });
  const tb = await box(trigger);
  expect(Math.round(tb.width), "⋯ 폭").toBe(INVITE.more.width);
  expect(Math.round(tb.height), "⋯ 높이").toBe(INVITE.more.height);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect((await style(trigger, ["background-color"]))["background-color"], "열림 = highlight-soft").toBe(rgb(INVITE.more.fills![0]));
  const item = menu.locator(sel("invite-cancel"));
  await expect(item).toHaveCount(1);
  await expect(item).toHaveText(INVITE.confirm.characters);
  await expect(item).toHaveAttribute("role", "menuitem");
  expect((await style(item, ["color"])).color, "초대 취소 = ink (핑크 없음)").toBe(rgb("#141414"));
  await expectPalette(area(page, "invite-menu"), "invite-more-menu");

  const card = area(page, "invite-confirm").locator(sel("ex-modal-card"));
  await expect(card).toHaveCount(1);
  await expectText(card.getByRole("heading"), INVITE.title, "확인 제목", node(F_INVITE, "sheet-title", "ex-modal-card").fills![0]);
  await expectText(card.getByText(INVITE.body.characters, { exact: true }), INVITE.body, "확인 본문", node(F_INVITE, "sheet-body", "ex-modal-card").fills![0]);
  const outline = card.locator(sel("button-outline"));
  const primary = card.locator(sel("button-primary"));
  await expect(outline).toHaveText(INVITE.close.characters);
  await expect(primary).toHaveText(INVITE.confirm.characters);
  expect((await box(outline)).x, "왼쪽 = 닫기").toBeLessThan((await box(primary)).x);
  expect((await style(primary, ["background-color"]))["background-color"], "초대 취소 = 검정").toBe(rgb(INVITE.confirmFill));
  expect(await card.getByRole("button", { name: /취소/ }).filter({ hasText: /^취소$/ }).count(), "'취소' 단독 버튼 0").toBe(0);
  await expectPalette(card, "초대 취소 확인");
});

test("[C1][S8] 초대 취소 흐름 (rules invite_cancel): ⋯ → 초대 취소 → 확인 카드 → 닫기 = 그대로 · 초대 취소 = 행 빠짐", async ({ page }) => {
  await open(page, MENU_GALLERY);
  const sec = area(page, "invite-demo");
  await hydrated(page, "invite-more-menu");
  const email = INVITE.title.characters.replace(/ 초대를 취소할까요\?$/, "");
  await expect(sec.getByText(email, { exact: true })).toHaveCount(1);
  const trigger = sec.getByRole("button", { name: /초대 더보기/ });
  // 7c02164: 메뉴는 화면 기준(fixed)이고 스크롤하면 닫힌다(rules invite_cancel.entry — 표 틀이 자르지 않게) — 메뉴가 화면 안에 열리도록 ⋯ 를 가운데로 먼저 옮긴다
  await trigger.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await trigger.click();
  await page.locator(sel("invite-cancel")).click();
  const card = sec.locator(sel("ex-modal-card"));
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("heading")).toHaveText(INVITE.title.characters);
  await card.locator(sel("button-outline")).click();
  await expect(card, "닫기 = 카드 닫힘").toHaveCount(0);
  await expect(sec.getByText(email, { exact: true }), "닫기 = 행 그대로").toHaveCount(1);
  await trigger.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await trigger.click();
  await page.locator(sel("invite-cancel")).click();
  await sec.locator(`${sel("ex-modal-card")} ${sel("button-primary")}`).click();
  await expect(sec.getByText(email, { exact: true }), "초대 취소 = 행 빠짐").toHaveCount(0);
  await expect(sec.locator(sel("invite-more-menu"))).toHaveCount(0);
});
