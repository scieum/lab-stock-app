// d7 §29 새 컴포넌트 10개 — 갤러리(/gallery · /gallery/manage, 비로그인 공개) 대상 K1.
//   manage-list · manage-group · manage-row · manage-back · page-more-menu · reagent-wipe · record-wipe · record-wipe-range · wipe-preview
//   · school-name-confirm (+ tab-bar 1.29 라벨 · 관리 탭)
// 기준: harness/d7-data.md §29, harness/dev-rules.json components · routes, design/rules.json manage · wipe · tab_bar · guest · roles(R5 · R8)
//       · colors · mobile_menu.removed, design/frames 18-mobile · 18-guest-mobile · 2-mobile · 2-wipe-* · 10-record-wipe-* (구조 · 글자 · 크기 · 색).
// 기대값은 프레임 · rules · d7 문장에서 읽는다 (구현 상수를 읽지 않는다). 화면 연결(D3 — /manage · 화면 2·10 머리 ⋯ · R-ui · C2/C3)은 여기서 보지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const GALLERY = "/gallery";
const MANAGE_GALLERY = "/gallery/manage";

type FrameNode = {
  name: string;
  type: string;
  path: string[];
  fills?: string[];
  strokes?: string[];
  cornerRadius?: number | number[] | null;
  width?: number;
  height?: number;
  padding?: number[] | null;
  gap?: number | null;
  text?: { characters: string; fontWeight: number; fontSize: number } | null;
};
type Rules = {
  version: string;
  manage: { list: string; row: string; back: string; guest: string };
  wipe: { roles: string[]; entry: string; empty: string; danger_mark: string; school_name_confirm: string; disabled_button: string; reagent: string; record: string };
  tab_bar: { component: string; item: string; items: number; labels: string[]; labels_source: string; sensor_entry: string };
  mobile_menu: { removed: string };
  guest: { lock: string; tab_locks: number; locked_tabs: string[]; hidden_components: string[] };
  roles: Record<string, { role?: string; components?: string[]; max?: number }>;
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
const D7_29 = D7.slice(D7.indexOf("## 29."), D7.indexOf("\n## ", D7.indexOf("## 29.") + 1));
const quoted = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const pick = (s: string, pred: (q: string) => boolean, what: string) => {
  const v = quoted(s).find(pred);
  if (!v) throw new Error(`rules 에서 ${what} 를 읽지 못함`);
  return v;
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);

const NEW = [
  "manage-list",
  "manage-group",
  "manage-row",
  "manage-back",
  "page-more-menu",
  "reagent-wipe",
  "record-wipe",
  "record-wipe-range",
  "wipe-preview",
  "school-name-confirm",
] as const;
/** rules 1.29 mobile_menu.removed · tab_bar.sensor_entry 로 없앤 컴포넌트 */
const REMOVED = [
  ...(rules.mobile_menu.removed.split("없앰")[0].match(/[a-z]+(?:-[a-z]+)+/g) ?? []),
  ...(/([a-z]+(?:-[a-z]+)+) '[^']*'는 없앰/.exec(rules.tab_bar.sensor_entry) ?? []).slice(1, 2),
];

// ---------- 프레임 도우미 ----------
const leaf = (n: FrameNode) => n.path[n.path.length - 1];
const under = (nodes: FrameNode[], anc: string) => nodes.filter((n) => n.path.slice(0, -1).includes(anc));
const node = (nodes: FrameNode[], name: string, anc?: string) => {
  const hit = (anc ? under(nodes, anc) : nodes).find((n) => leaf(n) === name);
  if (!hit) throw new Error(`프레임에 ${name}${anc ? ` (${anc} 안)` : ""} 없음`);
  return hit;
};
const texts = (nodes: FrameNode[], name: string, anc?: string) => (anc ? under(nodes, anc) : nodes).filter((n) => leaf(n) === name && n.text).map((n) => n.text!);

const F18 = frame("18-mobile");
const F18G = frame("18-guest-mobile");
const F2 = frame("2-mobile");
const F2W = frame("2-wipe-mobile");
const F2WD = frame("2-wipe-desktop");
const F10W = frame("10-record-wipe-mobile");
const F10WD = frame("10-record-wipe-desktop");

/** 시안 18: 묶음 제목 · 행(이름 · 요약) */
function frameGroups(nodes: FrameNode[]) {
  const out: { title: string; rows: { name: string; caption: string | null }[] }[] = [];
  for (const n of under(nodes, "manage-list")) {
    if (!n.text) continue;
    if (leaf(n) === "caption" && n.path.includes("group-title")) out.push({ title: n.text.characters, rows: [] });
    else if (leaf(n) === "name") out[out.length - 1].rows.push({ name: n.text.characters, caption: null });
    else if (leaf(n) === "caption" && n.path.includes("manage-row")) out[out.length - 1].rows.at(-1)!.caption = n.text.characters;
  }
  return out;
}
const MANAGE = {
  groups: frameGroups(F18),
  guestGroups: frameGroups(F18G),
  list: node(F18, "manage-list"),
  groupTitle: node(F18, "group-title", "manage-group"),
  titleText: texts(F18, "caption", "group-title")[0],
  row: node(F18, "manage-row"),
  rowName: texts(F18, "name", "manage-row")[0],
  rowCaption: texts(F18, "caption", "manage-row")[0],
  icon: node(F18, "icon-row", "manage-row"),
  chevron: node(F18, "icon-chevron", "manage-row"),
  divider: node(F18, "divider", "manage-list"),
};
const BACK = {
  box: node(F2, "manage-back"),
  label: texts(F2, "label", "manage-back")[0],
  iconStroke: under(F2, "icon-back").find((n) => (n.strokes ?? []).length > 0)!.strokes![0],
};
const MORE = { open: node(F2W, "page-more-menu"), iconStroke: under(F2W, "icon-more").find((n) => (n.strokes ?? []).length > 0)!.strokes![0] };
const REAGENT = {
  heading: texts(F2W, "heading", "reagent-wipe")[0],
  warning: node(F2W, "icon-warning", "reagent-wipe"),
  bodies: texts(F2W, "body", "ex-modal-card"),
  card: node(F2W, "ex-modal-card"),
  close: texts(F2W, "label", "button-outline")[0],
  confirm: texts(F2W, "label", "button-primary")[0],
  confirmOff: node(F2W, "button-primary", "modal-actions"),
  confirmOffLabel: node(F2W, "label", "button-primary"),
};
const SNC = {
  caption: texts(F2W, "caption", "school-name-confirm")[0],
  placeholder: texts(F2W, "placeholder", "school-name-confirm")[0],
  input: node(F2W, "text-input", "school-name-confirm"),
};
const inRange = (nodes: FrameNode[], name: string, also: string) => under(nodes, "record-wipe-range").filter((n) => leaf(n) === name && n.text && n.path.includes(also)).map((n) => n.text!);
const RECORD = {
  title: texts(F10W, "title", "record-wipe")[0],
  label: under(F10W, "record-wipe-range").find((n) => leaf(n) === "label" && n.path[n.path.length - 2] === "record-wipe-range")!.text!,
  segments: inRange(F10W, "label", "segmented-control").map((t) => t.characters),
  activeSeg: inRange(F10W, "label", "segmented-control-active")[0],
  track: node(F10W, "segmented-control", "record-wipe-range"),
  activeBox: node(F10W, "segmented-control-active", "record-wipe-range"),
  date: texts(F10W, "value", "record-wipe-range")[0],
  dateCaption: texts(F10W, "caption", "record-wipe-range")[0],
  preview: node(F10W, "wipe-preview"),
  previewBody: texts(F10W, "body", "wipe-preview")[0],
  previewNote: texts(F10W, "body-sm", "wipe-preview")[0],
  button: texts(F10W, "label", "sheet-actions")[0],
  buttonOn: node(F10W, "button-primary", "sheet-actions"),
  drawer: node(F10WD, "detail-drawer"),
};
/** '사용 기록 24건 · 입고 기록 6건을 지워요' → 숫자 자리 정규식 */
const PREVIEW_RE = new RegExp(`^\\s*${esc(RECORD.previewBody.characters).replace(/\d+/g, "(\\d+)")}\\s*$`);
const BUTTON_RE = new RegExp(`^\\s*${esc(RECORD.button.characters).replace(/\d+/g, "(\\d+)")}\\s*$`);
/** rules wipe 문구 */
const W = {
  reagentItem: pick(rules.wipe.entry, (q) => q.startsWith("시약"), "시약 전체 삭제"),
  recordItem: pick(rules.wipe.entry, (q) => q.startsWith("기록"), "기록 삭제"),
  reagentEmpty: pick(rules.wipe.empty, (q) => q.includes("시약"), "지울 시약이 없어요"),
  recordEmpty: pick(rules.wipe.empty, (q) => q.includes("기록"), "지울 기록이 없어요"),
  mismatch: pick(rules.wipe.school_name_confirm, (q) => q.includes("달라요"), "학교 이름이 달라요"),
  reagentDone: pick(rules.wipe.reagent, (q) => q.endsWith("삭제했어요"), "시약 삭제 토스트"),
  recordDone: pick(rules.wipe.record, (q) => q.endsWith("삭제했어요"), "기록 삭제 토스트"),
  previewEmpty: pick(rules.wipe.record, (q) => q.includes("지울 기록이 없어요"), "0건 미리보기"),
};
/** rules wipe.disabled_button "꺼진 button-primary = #e0e0e0 채움 + #707070 글자" */
const DISABLED = (() => {
  const hex = rules.wipe.disabled_button.match(/#[0-9a-fA-F]{6}/g) ?? [];
  if (hex.length < 2) throw new Error("rules wipe.disabled_button 에서 색을 읽지 못함");
  return { fill: hex[0] as string, text: hex[1] as string };
})();
const SCHOOL = SNC.placeholder.characters;

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
const area = (page: Page, id: string) => page.locator(`section[aria-labelledby="g-${id}"]`);

async function open(page: Page, path: string): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `${path} 응답`).toBe(200);
  await page.waitForLoadState("load");
}

/** 범위 안 첫 클라이언트 컴포넌트가 붙을 때까지 (React 속성) */
async function hydrated(scope: Locator, name: string): Promise<void> {
  await expect
    .poll(async () => scope.locator(sel(name)).first().evaluate((el) => Object.keys(el).some((k) => k.startsWith("__react"))), { timeout: 30_000 })
    .toBe(true);
}

async function style(l: Locator, props: string[]): Promise<Record<string, string>> {
  return l.evaluate((el, ps) => {
    const s = getComputedStyle(el);
    return Object.fromEntries(ps.map((p) => [p, s.getPropertyValue(p)]));
  }, props);
}

/** 글자 노드의 프레임 크기 · 굵기 (+ 색) 와 같은지 */
async function expectText(l: Locator, t: { characters: string; fontSize: number; fontWeight: number }, what: string, fill?: string): Promise<void> {
  await expect(l, `${what} 글자`).toHaveText(exact(t.characters));
  const s = await style(l, ["font-size", "font-weight", "color"]);
  expect(s["font-size"], `${what} 크기`).toBe(`${t.fontSize}px`);
  expect(s["font-weight"], `${what} 굵기`).toBe(String(t.fontWeight));
  if (fill) expect(s.color, `${what} 색`).toBe(rgb(fill));
}

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b, "보이는 상자").not.toBeNull();
  return b!;
}

/** 범위 안 바탕이 칠해진 첫 요소(자신 포함)의 바탕 · radius · 높이 */
async function filled(l: Locator): Promise<{ bg: string; radius: number; height: number; border: string }> {
  return l.evaluate((rootEl) => {
    for (const el of [rootEl, ...Array.from(rootEl.querySelectorAll("*"))]) {
      const s = getComputedStyle(el);
      if (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") {
        return { bg: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius), height: el.getBoundingClientRect().height, border: s.borderTopColor };
      }
    }
    return { bg: "none", radius: NaN, height: NaN, border: "" };
  });
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

/** 꺼진 button-primary = rules wipe.disabled_button (채움 · 글자) · disabled */
async function expectOff(btn: Locator, what: string): Promise<void> {
  await expect(btn, `${what} 꺼짐`).toBeDisabled();
  const s = await style(btn, ["background-color", "color"]);
  expect(s["background-color"], `${what} 꺼진 채움 = rules ${DISABLED.fill}`).toBe(rgb(DISABLED.fill));
  expect(s.color, `${what} 꺼진 글자 = rules ${DISABLED.text}`).toBe(rgb(DISABLED.text));
}
/** 켜진 button-primary = 시안 검정 채움 · 흰 글자 */
async function expectOn(btn: Locator, what: string): Promise<void> {
  await expect(btn, `${what} 켜짐`).toBeEnabled();
  const s = await style(btn, ["background-color", "color"]);
  expect(s["background-color"], `${what} 채움 = 시안 ${RECORD.buttonOn.fills![0]}`).toBe(rgb(RECORD.buttonOn.fills![0]));
  expect(s.color, `${what} 글자 흰색`).toBe(rgb(node(F10W, "label", "sheet-actions").fills![0]));
}

// =====================================================================
// 기대값 원본
// =====================================================================

test(`[K1][S*] 기대값 원본: dev-rules components 에 새 ${NEW.length}개 · 시안 18 · 2 · 2-wipe · 10-record-wipe 에 있음 · R5 학생 · R8 교사 · 둘러보기 숨김 · 없앤 ☰ · inventory-switch`, () => {
  const names = Object.keys(dev.components);
  for (const n of NEW) expect(names, `dev-rules components ${n}`).toContain(n);
  const frames = [F18, F18G, F2, F2W, F2WD, F10W, F10WD];
  for (const n of NEW) expect(frames.some((f) => f.some((x) => leaf(x) === n)), `프레임에 ${n}`).toBe(true);
  expect(dev.components["manage-list"]).toEqual([18]);
  expect(dev.components["page-more-menu"]).toEqual([2, 10]);
  const admin = ["page-more-menu", "reagent-wipe", "record-wipe"];
  expect(rules.wipe.roles, "rules wipe.roles = admin").toEqual(["admin"]);
  expect(rules.roles.R5.components, "R5 학생 0").toEqual(expect.arrayContaining(admin));
  expect(rules.roles.R8, "R8 교사 0").toMatchObject({ role: "교사", components: admin, max: 0 });
  expect(rules.guest.hidden_components, "둘러보기 숨김").toEqual(expect.arrayContaining([...admin, "school-name-confirm"]));
  expect(REMOVED).toEqual(["mobile-menu-button", "mobile-menu-sheet", "inventory-switch"]);
  for (const n of REMOVED) expect(names, `dev-rules components 에 ${n} 없음`).not.toContain(n);
  expect(rules.tab_bar.labels).toEqual(["홈", "관리", "QR 스캔", "기록"]);
  expect(MANAGE.groups.map((g) => g.title)).toEqual(["재고", "입고·주문", "학교"]);
  expect(MANAGE.guestGroups.map((g) => g.rows.map((r) => r.name))).toEqual([["시약", "센서"]]);
  expect(D7_29, "d7 §29 관리 경로").toContain("'관리' → `/manage`");
  expect(dev.routes["18"]).toBe("/manage");
  expect(dev.routes["18-guest"]).toBe("/demo/manage");
  expect(REAGENT.bodies).toHaveLength(2);
  expect(SNC.caption.characters, "caption 안에 학교명").toContain(SCHOOL);
  expect(RECORD.segments).toEqual(pick(rules.wipe.record, (q) => q.includes("|"), "구간").split("|").map((s) => s.trim()));
  expect(PREVIEW_RE.test(RECORD.previewBody.characters)).toBe(true);
  const [, u, i] = PREVIEW_RE.exec(RECORD.previewBody.characters)!;
  expect(Number(BUTTON_RE.exec(RECORD.button.characters)![1]), "시안 버튼 수 = 사용 + 입고").toBe(Number(u) + Number(i));
});

// =====================================================================
// K1 — 갤러리에 등장
// =====================================================================

test(`[K1][S*] /gallery · ${MANAGE_GALLERY} 에 새 컴포넌트 ${NEW.length}개 data-component 가 각각 1개 이상 · ${MANAGE_GALLERY} 연결 · 없앤 ${REMOVED.join(" · ")} 0`, async ({ page }) => {
  await open(page, GALLERY);
  for (const n of NEW) expect(await page.locator(sel(n)).count(), `/gallery ${n}`).toBeGreaterThanOrEqual(1);
  await expect(page.locator(`a[href="${MANAGE_GALLERY}"]`).first()).toBeAttached();
  for (const n of REMOVED) await expect(page.locator(sel(n)), `/gallery ${n} 0`).toHaveCount(0);
  await open(page, MANAGE_GALLERY);
  for (const n of NEW) expect(await page.locator(sel(n)).count(), `${MANAGE_GALLERY} ${n}`).toBeGreaterThanOrEqual(1);
  for (const n of REMOVED) await expect(page.locator(sel(n)), `${MANAGE_GALLERY} ${n} 0`).toHaveCount(0);
});

// =====================================================================
// 관리 목록 (18-mobile · 18-guest-mobile)
// =====================================================================

test(`[C1][S18] manage-list admin 시안 18-mobile: 묶음 ${MANAGE.groups.map((g) => g.title).join(" · ")} · 행 이름 · 요약 글자 · 순서 = 시안 · 묶음 사이 hairline ${MANAGE.divider.fills![0]}`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const list = area(page, "manage-admin").locator(sel("manage-list"));
  await expect(list).toHaveCount(1);
  const groups = list.locator(sel("manage-group"));
  await expect(groups).toHaveCount(MANAGE.groups.length);
  for (const [gi, g] of MANAGE.groups.entries()) {
    const grp = groups.nth(gi);
    await expect(grp.locator("h2, h3, [role=heading]").first(), `묶음 ${gi + 1} 제목`).toHaveText(exact(g.title));
    const rows = grp.locator(sel("manage-row"));
    await expect(rows, `${g.title} 행 수`).toHaveCount(g.rows.length);
    for (const [ri, r] of g.rows.entries()) {
      const row = rows.nth(ri);
      await expect(row.getByText(r.name, { exact: true }), `${g.title} ${ri + 1} 이름`).toHaveCount(1);
      const text = (await row.innerText()).replace(/\s+/g, " ").trim();
      expect(text, `${r.name} 행 글자 = 이름 + 요약(시안)`).toBe(r.caption ? `${r.name} ${r.caption}` : r.name);
    }
    if (gi > 0) {
      // 묶음 사이 hairline-soft: 앞 묶음 끝과 이 묶음 사이에 1px 선
      const line = await grp.evaluate((el) => {
        let cur: Element | null = el;
        while (cur && cur.parentElement && !cur.previousElementSibling) cur = cur.parentElement;
        const s = cur ? getComputedStyle(cur) : null;
        return s ? { w: parseFloat(s.borderTopWidth), c: s.borderTopColor } : { w: 0, c: "" };
      });
      expect(line.w, `묶음 ${gi + 1} 위 선 두께 = 시안 ${MANAGE.divider.height}`).toBe(MANAGE.divider.height);
      expect(line.c, "묶음 사이 선 색 = 시안 hairline-soft").toBe(rgb(MANAGE.divider.fills![0]));
    }
  }
  expect((await style(list, ["background-color"]))["background-color"], "목록 바탕 = 시안 canvas").toBe(rgb(MANAGE.list.fills![0]));
  await expectPalette(area(page, "manage-admin"), "manage-list admin");
});

test(`[C1][S18] manage-row 시안 18-mobile: 높이 ${MANAGE.row.height} · 안쪽 좌우 ${MANAGE.row.padding?.[1]} · 사이 ${MANAGE.row.gap} · 사각 · canvas · 이름 ${MANAGE.rowName.fontSize}/${MANAGE.rowName.fontWeight} ink · 요약 ${MANAGE.rowCaption.fontSize}/${MANAGE.rowCaption.fontWeight} muted(무채색) · 아이콘 ${MANAGE.icon.width} · › ${MANAGE.chevron.width} · 링크 = 같은 출처 주소`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const rows = area(page, "manage-admin").locator(sel("manage-row"));
  const n = await rows.count();
  expect(n, "admin 행 수 = 시안").toBe(MANAGE.groups.flatMap((g) => g.rows).length);
  const LABEL_SCREEN: Record<string, string> = { 시약: "2", 센서: "17", 시약장: "11", 입고: "7", "실험 매뉴얼": "5", "재주문 알림": "6", 사용자: "8", 판매처: "9" };
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const b = await box(row);
    expect(Math.round(b.height), `행 ${i + 1} 높이`).toBe(MANAGE.row.height);
    const s = await style(row, ["padding-left", "padding-right", "column-gap", "border-top-left-radius", "background-color"]);
    expect(s["padding-left"], "안쪽 왼쪽").toBe(`${MANAGE.row.padding![3]}px`);
    expect(s["padding-right"], "안쪽 오른쪽").toBe(`${MANAGE.row.padding![1]}px`);
    expect(s["column-gap"], "사이").toBe(`${MANAGE.row.gap}px`);
    expect(s["border-top-left-radius"], "사각").toBe("0px");
    expect(s["background-color"], "canvas").toBe(rgb(MANAGE.row.fills![0]));
    const name = (await row.innerText()).split("\n")[0].trim();
    expect(await row.getAttribute("href"), `${name} → 화면 ${LABEL_SCREEN[name]} 경로`).toBe(dev.routes[LABEL_SCREEN[name]]);
    const svgs = row.locator("svg");
    await expect(svgs, "아이콘 + ›").toHaveCount(2);
    expect(Math.round((await box(svgs.first())).width), "아이콘 크기").toBe(MANAGE.icon.width);
    expect(Math.round((await box(svgs.last())).width), "› 크기").toBe(MANAGE.chevron.width);
    expect((await style(svgs.first(), ["color"])).color, "아이콘 = ink (rules manage.row colors.ink)").toBe(rgb(node(F18, "name", "manage-row").fills![0]));
  }
  const first = rows.first();
  await expectText(first.getByText(MANAGE.rowName.characters, { exact: true }), MANAGE.rowName, "이름", node(F18, "name", "manage-row").fills![0]);
  await expectText(first.getByText(MANAGE.rowCaption.characters, { exact: true }), MANAGE.rowCaption, "요약", node(F18, "caption", "manage-row").fills![0]);
  const title = area(page, "manage-admin").locator(sel("manage-group")).first().getByText(MANAGE.titleText.characters, { exact: true });
  await expectText(title, MANAGE.titleText, "묶음 제목", node(F18, "caption", "group-title").fills![0]);
  const ts = await style(title, ["padding-top", "padding-left", "padding-bottom"]);
  expect([ts["padding-top"], ts["padding-left"], ts["padding-bottom"]], "묶음 제목 안쪽 = 시안 group-title").toEqual([MANAGE.groupTitle.padding![0], MANAGE.groupTitle.padding![3], MANAGE.groupTitle.padding![2]].map((v) => `${v}px`));
});

test("[R-ui][S18] manage-list 역할별 (rules manage.list): 교사 = '재고' · '입고·주문' (학교 없음) · 학생 = '재고' 만", async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const titles = async (id: string) => (await area(page, id).locator(`${sel("manage-group")} h2`).allInnerTexts()).map((t) => t.trim());
  const all = MANAGE.groups.map((g) => g.title);
  expect(await titles("manage-teacher"), "교사 묶음").toEqual(all.slice(0, 2));
  expect(await titles("manage-student"), "학생 묶음").toEqual(all.slice(0, 1));
  const names = async (id: string) => (await area(page, id).locator(sel("manage-row")).allInnerTexts()).map((t) => t.split("\n")[0].trim());
  expect(await names("manage-teacher")).toEqual(MANAGE.groups.slice(0, 2).flatMap((g) => g.rows.map((r) => r.name)));
  expect(await names("manage-student")).toEqual(MANAGE.groups[0].rows.map((r) => r.name));
});

test(`[GM-ui][S18g] manage-list 둘러보기 시안 18-guest-mobile: '${MANAGE.guestGroups[0].title}' ${MANAGE.guestGroups[0].rows.map((r) => r.name).join(" · ")} 만 · 요약 = 시안 데모 값 · 주소 = 둘러보기 경로`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const sec = area(page, "manage-guest");
  await expect(sec.locator(sel("manage-group"))).toHaveCount(1);
  const rows = sec.locator(sel("manage-row"));
  await expect(rows).toHaveCount(MANAGE.guestGroups[0].rows.length);
  for (const [i, r] of MANAGE.guestGroups[0].rows.entries()) {
    expect((await rows.nth(i).innerText()).replace(/\s+/g, " ").trim(), `${r.name}`).toBe(`${r.name} ${r.caption}`);
  }
  expect(await rows.nth(0).getAttribute("href")).toBe(dev.routes["2-guest"]);
  expect(await rows.nth(1).getAttribute("href")).toBe(dev.routes["17-guest"]);
  await expectPalette(sec, "manage-list 둘러보기");
});

test("[C1][S18] manage-row 요약 없음 = 이름만 (rules manage.row '요약이 없는 항목은 이름만')", async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const sec = area(page, "manage-row");
  const noCaption = MANAGE.groups.flatMap((g) => g.rows).find((r) => r.caption === null)!;
  const row = sec.locator(sel("manage-row")).filter({ hasText: exact(noCaption.name) });
  await expect(row, `'${noCaption.name}' 이름만`).toHaveCount(1);
  expect(Math.round((await box(row)).height), "이름만이어도 높이 = 시안").toBe(MANAGE.row.height);
});

// =====================================================================
// manage-back (2-mobile nav-left) · tab-bar 1.29
// =====================================================================

test(`[C1][S2] manage-back 시안 2-mobile: '‹ ${BACK.label.characters}' ${BACK.label.fontSize}/${BACK.label.fontWeight} ink · 높이 ${BACK.box.height} · 사이 ${BACK.box.gap} · ‹ 하늘색(아이콘만) · → ${dev.routes["18"]} · nav-pill 맨 왼쪽`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const sec = area(page, "manage-back");
  const backs = sec.locator(sel("manage-back"));
  await expect(backs, "단독 + nav-pill 안").toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const b = backs.nth(i);
    await expect(b).toHaveAttribute("href", dev.routes["18"]);
    await expectText(b.getByText(BACK.label.characters, { exact: true }), BACK.label, "‹ 관리 글자", node(F2, "label", "manage-back").fills![0]);
    expect(Math.round((await box(b)).height), "높이(누름 영역)").toBe(BACK.box.height);
    expect((await style(b, ["column-gap"]))["column-gap"], "사이").toBe(`${BACK.box.gap}px`);
    const icon = b.locator("svg").first();
    expect((await style(icon, ["color"])).color, "‹ = 시안 하늘색 (아이콘 — 글자 아님)").toBe(rgb(BACK.iconStroke));
  }
  const nav = sec.locator(sel("nav-pill"));
  await expect(nav.locator(sel("manage-back")), "nav-pill 안 manage-back 1").toHaveCount(1);
  const navBox = await box(nav);
  const backBox = await box(nav.locator(sel("manage-back")));
  const school = await box(nav.getByText("샘플고등학교", { exact: true }).first());
  expect(backBox.x, "manage-back = nav-pill 왼쪽").toBeLessThan(navBox.x + navBox.width / 2);
  expect(backBox.x, "학교명보다 왼쪽").toBeLessThan(school.x);
  await expectPalette(sec, "manage-back");
});

test(`[C2][S18] tab-bar 1.29: 라벨 ${rules.tab_bar.labels.join(" · ")} · '관리' 활성 → ${dev.routes["18"]} / 둘러보기 '관리' → ${dev.routes["18-guest"]} · 잠금 ${rules.guest.tab_locks}(${rules.guest.locked_tabs.join(" · ")})`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const bars = area(page, "tab-bar").locator(sel(rules.tab_bar.component));
  await expect(bars).toHaveCount(2);
  const manage = rules.tab_bar.labels[1];
  for (const [i, guest] of [false, true].entries()) {
    const items = bars.nth(i).locator(sel(rules.tab_bar.item));
    await expect(items).toHaveCount(rules.tab_bar.items);
    const labels = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    expect(labels, `${guest ? "둘러보기" : "로그인"} 라벨`).toEqual(rules.tab_bar.labels);
    const m = items.nth(1);
    await expect(m, "'관리' 활성").toHaveAttribute("aria-current", "page");
    await expect(m).toHaveText(exact(manage));
    await expect(m, "'관리' 주소").toHaveAttribute("href", dev.routes[guest ? "18-guest" : "18"]);
    const locks = bars.nth(i).locator(sel(rules.guest.lock));
    await expect(locks, "잠금").toHaveCount(guest ? rules.guest.tab_locks : 0);
    if (guest) {
      const locked = (await bars.nth(i).locator(`${sel(rules.tab_bar.item)}:has(${sel(rules.guest.lock)})`).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).sort();
      expect(locked).toEqual([...rules.guest.locked_tabs].sort());
    }
  }
  // 시안 18 tab-bar: 활성 '관리' 라벨 ink · 다른 탭 muted
  const tabLabels = texts(F18, "label", "tab-item");
  const activeFill = tabLabels.find((t) => t.characters === manage)!;
  const act = bars.first().locator(sel(rules.tab_bar.item)).nth(1).getByText(manage, { exact: true });
  await expectText(act, activeFill, "'관리' 활성 라벨", under(F18, "tab-item").find((n) => leaf(n) === "label" && n.text?.characters === manage)!.fills![0]);
  await expectPalette(area(page, "tab-bar"), "tab-bar 1.29");
});

// =====================================================================
// page-more-menu (2-wipe · 10-record-wipe list-head ⋯)
// =====================================================================

test(`[C1][S2] [C1][S10] page-more-menu 시안 2-wipe: ⋯ ${MORE.open.width} 동그라미 · 열림 = highlight-soft · 항목 '${W.reagentItem}' ink · 0건 = '${W.recordItem}' 비활성(text-faint) + caption '${W.recordEmpty}'`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const sec = area(page, "page-more-menu");
  const menus = sec.locator(sel("page-more-menu"));
  await expect(menus).toHaveCount(2);
  const btn = menus.first().locator("button").first();
  const b = await box(btn);
  expect(Math.round(b.width), "⋯ 폭").toBe(MORE.open.width);
  expect(Math.round(b.height), "⋯ 높이").toBe(MORE.open.height);
  const bs = await style(btn, ["background-color", "border-top-left-radius"]);
  expect(parseFloat(bs["border-top-left-radius"]), "동그라미").toBeGreaterThanOrEqual(MORE.open.height! / 2);
  expect(bs["background-color"], "열림 = 시안 highlight-soft").toBe(rgb(MORE.open.fills![0]));
  expect(await btn.getAttribute("aria-expanded"), "열림").toBe("true");
  expect((await style(btn.locator("svg").first(), ["color"])).color, "⋯ = 시안 ink").toBe(rgb(MORE.iconStroke));

  const on = menus.first().locator(sel("reagent-wipe"));
  await expect(on, "시약 전체 삭제 항목").toHaveCount(1);
  await expect(on).toHaveAttribute("role", "menuitem");
  await expect(on).toBeEnabled();
  await expect(on).toHaveText(exact(W.reagentItem));
  expect((await style(on.getByText(W.reagentItem, { exact: true }), ["color"])).color, "켜진 항목 ink").toBe(rgb("#141414"));

  const off = menus.nth(1).locator(sel("record-wipe"));
  await expect(off, "기록 삭제 항목 (0건)").toHaveCount(1);
  await expect(off).toBeDisabled();
  await expect(off.getByText(W.recordItem, { exact: true })).toHaveCount(1);
  await expect(off.getByText(W.recordEmpty, { exact: true }), "0건 이유 caption").toHaveCount(1);
  expect((await style(off.getByText(W.recordItem, { exact: true }), ["color"])).color, "비활성 = text-faint").toBe(rgb("#adadad"));
  await expectPalette(sec, "page-more-menu");
});

test(`[C1][S2] page-more-menu 닫힘 → ⋯ 누르면 열림(highlight-soft) → '${W.reagentItem}' → 확인 카드 · Esc 로 메뉴 닫힘`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const sec = area(page, "reagent-wipe");
  await hydrated(sec, "page-more-menu");
  const btn = sec.locator(`${sel("page-more-menu")} button`).first();
  expect(await btn.getAttribute("aria-expanded"), "처음 닫힘").toBe("false");
  const closed = (await style(btn, ["background-color"]))["background-color"];
  expect(closed === HIGHLIGHT_SOFT, "닫힘 바탕 ≠ highlight-soft").toBe(false);
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  expect((await style(btn, ["background-color"]))["background-color"], "열림 바탕").toBe(HIGHLIGHT_SOFT);
  await page.keyboard.press("Escape");
  await expect(btn, "Esc → 닫힘").toHaveAttribute("aria-expanded", "false");
  await btn.click();
  await sec.locator(sel("reagent-wipe")).filter({ hasText: W.reagentItem }).first().click();
  await expect(sec.locator(sel("ex-modal-card")), "확인 카드 열림").toHaveCount(1);
});

// =====================================================================
// 시약 전체 삭제 확인 (2-wipe ex-modal-card)
// =====================================================================

async function openReagentWipe(page: Page): Promise<Locator> {
  await open(page, MANAGE_GALLERY);
  const sec = area(page, "reagent-wipe");
  await hydrated(sec, "page-more-menu");
  await sec.locator(`${sel("page-more-menu")} button`).first().click();
  await sec.locator(sel("reagent-wipe")).filter({ hasText: W.reagentItem }).first().click();
  const card = sec.locator(sel("ex-modal-card"));
  await expect(card).toHaveCount(1);
  return card;
}

test(`[C1][S2] reagent-wipe 확인 시안 2-wipe: 경고 아이콘(ink 외곽선) + '${REAGENT.heading.characters}' ${REAGENT.heading.fontSize}/${REAGENT.heading.fontWeight} · 본문 2줄 · school-name-confirm · '${REAGENT.close.characters}' | '${REAGENT.confirm.characters}'(꺼짐 = rules disabled_button) · 카드 radius ${REAGENT.card.cornerRadius}`, async ({ page }) => {
  const card = await openReagentWipe(page);
  const head = card.locator(sel("reagent-wipe"));
  await expect(head, "제목 = reagent-wipe").toHaveCount(1);
  await expectText(head.getByText(REAGENT.heading.characters, { exact: true }), REAGENT.heading, "제목", node(F2W, "heading", "reagent-wipe").fills![0]);
  const warn = head.locator("svg").first();
  expect(Math.round((await box(warn)).width), "경고 아이콘 크기").toBe(REAGENT.warning.width);
  expect((await style(warn, ["color"])).color, "경고 아이콘 = ink (rules danger_mark 무채색)").toBe(rgb("#141414"));
  expect(rules.wipe.danger_mark).toContain("핑크·빨강 없음");
  for (const [i, t] of REAGENT.bodies.entries()) await expectText(card.getByText(t.characters, { exact: true }), t, `본문 ${i + 1}`, node(F2W, "body", "ex-modal-card").fills![0]);
  await expect(card.locator(sel("school-name-confirm")), "school-name-confirm 1").toHaveCount(1);
  const outline = card.locator(sel("button-outline"));
  await expect(outline).toHaveText(exact(REAGENT.close.characters));
  const primary = card.locator(sel("button-primary"));
  await expect(primary).toHaveText(exact(REAGENT.confirm.characters));
  await expectOff(primary, "학교명 쓰기 전 전체 삭제");
  expect(rgb(REAGENT.confirmOff.fills![0]), "시안 꺼진 채움 = rules").toBe(rgb(DISABLED.fill));
  expect(rgb(REAGENT.confirmOffLabel.fills![0]), "시안 꺼진 글자 = rules").toBe(rgb(DISABLED.text));
  const cs = await style(card, ["border-top-left-radius", "background-color", "border-top-color"]);
  expect(cs["border-top-left-radius"], "카드 radius").toBe(`${REAGENT.card.cornerRadius}px`);
  expect(cs["background-color"]).toBe(rgb(REAGENT.card.fills![0]));
  await expectPalette(card, "reagent-wipe 확인");
});

test(`[C1][S2] reagent-wipe 흐름: 다른 이름 = '${W.mismatch}' + 꺼짐 · 앞뒤 공백 붙인 학교명 = 켜짐(검정) · '${REAGENT.confirm.characters}' → '${W.reagentDone.replace("{N}", "N")}' · '닫기' = 카드 닫힘`, async ({ page }) => {
  const card = await openReagentWipe(page);
  const input = card.locator(`${sel("school-name-confirm")} input`);
  const primary = card.locator(sel("button-primary"));
  await input.fill(SCHOOL.slice(0, 2));
  await expect(card.getByText(W.mismatch, { exact: true }), "다름 안내").toHaveCount(1);
  await expectOff(primary, "다른 이름");
  await input.fill(` ${SCHOOL} `);
  await expect(card.getByText(W.mismatch, { exact: true }), "같으면 안내 없음").toHaveCount(0);
  await expectOn(primary, "학교명 같음");
  const n = Number(/\d+/.exec(REAGENT.heading.characters)![0]);
  await primary.click();
  await expect(card, "실행 뒤 카드 닫힘").toHaveCount(0);
  await expect(area(page, "reagent-wipe").getByText(W.reagentDone.replace("{N}", String(n)), { exact: true }), "결과 문구").toHaveCount(1);
  // 다시 열어 닫기
  const sec = area(page, "reagent-wipe");
  await sec.locator(`${sel("page-more-menu")} button`).first().click();
  await sec.locator(sel("reagent-wipe")).filter({ hasText: W.reagentItem }).first().click();
  await sec.locator(sel("ex-modal-card")).getByRole("button", { name: REAGENT.close.characters, exact: true }).first().click();
  await expect(sec.locator(sel("ex-modal-card")), "닫기 → 카드 0").toHaveCount(0);
});

// =====================================================================
// school-name-confirm
// =====================================================================

test(`[C1][S2] [C1][S10] school-name-confirm 시안 2-wipe: caption = 시안 '${SNC.caption.characters}' ${SNC.caption.fontSize} muted`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const c = area(page, "school-name-confirm").locator(sel("school-name-confirm")).first();
  await expectText(c.getByText(/^확인을 위해/), SNC.caption, "caption", node(F2W, "caption", "school-name-confirm").fills![0]);
});

test(`[C1][S2] [C1][S10] school-name-confirm: placeholder = 학교명 '${SNC.placeholder.characters}' · 입력 칸 field 채움 ${SNC.input.fills![0]} · radius ${SNC.input.cornerRadius} · 빈 칸/같음 = 안내 0 · 다름 = '${W.mismatch}' muted · 붙여 넣기 허용`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const all = area(page, "school-name-confirm").locator(sel("school-name-confirm"));
  await expect(all).toHaveCount(3);
  const [empty, wrong, same] = [all.nth(0), all.nth(1), all.nth(2)];
  const input = empty.locator("input");
  await expect(input).toHaveAttribute("placeholder", SNC.placeholder.characters);
  const f = await filled(empty.locator(sel("text-input")));
  expect(f.bg, "입력 칸 채움 = 시안").toBe(rgb(SNC.input.fills![0]));
  expect(f.radius, "입력 칸 radius").toBe(SNC.input.cornerRadius);
  const ph = await input.evaluate((el) => getComputedStyle(el, "::placeholder").color);
  expect(ph, "placeholder 색 = 시안 text-faint").toBe(rgb(node(F2W, "placeholder", "school-name-confirm").fills![0]));
  await expect(empty.getByText(W.mismatch, { exact: true }), "빈 칸 = 안내 0").toHaveCount(0);
  const note = wrong.getByText(W.mismatch, { exact: true });
  await expect(note, "다름 = 안내 1").toHaveCount(1);
  expect((await style(note, ["color"])).color, "안내 = muted").toBe(rgb("#707070"));
  await expect(same.getByText(W.mismatch, { exact: true }), "앞뒤 공백만 다름 = 같음").toHaveCount(0);
  await hydrated(area(page, "school-name-confirm"), "school-name-confirm");
  const prevented = await input.evaluate((el) => {
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented, "붙여 넣기 막지 않음").toBe(false);
  await input.fill(SCHOOL);
  await expect(input, "붙여 넣은/쓴 값 그대로").toHaveValue(SCHOOL);
  await expectPalette(area(page, "school-name-confirm"), "school-name-confirm");
});

// =====================================================================
// 기록 삭제 (10-record-wipe) — record-wipe-range · wipe-preview · record-wipe
// =====================================================================

test(`[C1][S10] record-wipe-range 시안 10-record-wipe: 라벨 '${RECORD.label.characters}' · segmented '${RECORD.segments.join(" | ")}'(트랙 ${RECORD.track.height} · 활성 '${RECORD.activeSeg.characters}' 흰 바탕 + 하늘 테두리) · 날짜 ${RECORD.date.characters} · caption '${RECORD.dateCaption.characters}' · 미래 불가(max = 오늘)`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const r = area(page, "record-wipe-range").locator(sel("record-wipe-range"));
  await expect(r).toHaveCount(1);
  await expectText(r.getByText(RECORD.label.characters, { exact: true }).first(), RECORD.label, "라벨");
  const seg = r.locator(sel("segmented-control"));
  await expect(seg.getByRole("tab")).toHaveText(RECORD.segments.map((s) => exact(s)));
  const active = seg.locator('[aria-selected="true"]');
  await expect(active, "기본 = 시안 활성").toHaveText(exact(RECORD.activeSeg.characters));
  const as = await style(active, ["background-color", "border-top-color"]);
  expect(as["background-color"], "활성 바탕").toBe(rgb(RECORD.activeBox.fills![0]));
  expect(as["border-top-color"], "활성 테두리 = 시안 하늘색").toBe(rgb(RECORD.activeBox.strokes![0]));
  expect(Math.round((await box(seg)).height), "트랙 높이").toBe(RECORD.track.height);
  const sb = await box(seg);
  const tabs = seg.getByRole("tab");
  const half = (await box(tabs.first())).width + (await box(tabs.last())).width;
  expect(half, "두 칸이 트랙 폭을 채움 (시안 163 + 165 ≈ 340)").toBeGreaterThan(sb.width * 0.9);
  const date = r.locator('input[type="date"]');
  await expect(date, "날짜 = 시안 값").toHaveValue(RECORD.date.characters);
  const max = await date.getAttribute("max");
  expect(max, "미래 불가 = max 있음").toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(RECORD.date.characters <= max!, "시안 날짜 ≤ max").toBe(true);
  await expectText(r.getByText(RECORD.dateCaption.characters, { exact: true }), RECORD.dateCaption, "caption", node(F10W, "caption", "record-wipe-range").fills![0]);
  await expectPalette(area(page, "record-wipe-range"), "record-wipe-range · wipe-preview");
});

test(`[C1][S10] wipe-preview 시안 10-record-wipe: canvas-soft ${RECORD.preview.fills![0]} · radius ${RECORD.preview.cornerRadius} · 안쪽 ${RECORD.preview.padding?.slice(0, 2).join(" ")} · '사용 기록 N건 · 입고 기록 M건을 지워요' ${RECORD.previewBody.fontSize} ink + '${RECORD.previewNote.characters}' ${RECORD.previewNote.fontSize} muted · 0건 = '${W.previewEmpty}' · '전체' 로 바꾸면 수 ≥ 이 날짜 이전`, async ({ page }) => {
  await open(page, MANAGE_GALLERY);
  const sec = area(page, "record-wipe-range");
  const previews = sec.locator(sel("wipe-preview"));
  await expect(previews).toHaveCount(2);
  const p = previews.first();
  const ps = await style(p, ["background-color", "border-top-left-radius", "padding-top", "padding-left", "row-gap"]);
  expect(ps["background-color"], "바탕").toBe(rgb(RECORD.preview.fills![0]));
  expect(ps["border-top-left-radius"]).toBe(`${RECORD.preview.cornerRadius}px`);
  expect([ps["padding-top"], ps["padding-left"]]).toEqual([`${RECORD.preview.padding![0]}px`, `${RECORD.preview.padding![1]}px`]);
  expect(ps["row-gap"], "사이").toBe(`${RECORD.preview.gap}px`);
  const body = p.getByText(PREVIEW_RE);
  await expect(body, "미리보기 글자 틀 = 시안").toHaveCount(1);
  const bs = await style(body, ["font-size", "font-weight", "color"]);
  expect([bs["font-size"], bs["font-weight"], bs.color]).toEqual([`${RECORD.previewBody.fontSize}px`, String(RECORD.previewBody.fontWeight), rgb(node(F10W, "body", "wipe-preview").fills![0])]);
  await expectText(p.getByText(RECORD.previewNote.characters, { exact: true }), RECORD.previewNote, "안내", node(F10W, "body-sm", "wipe-preview").fills![0]);
  const total = async () => {
    const [, u, i] = PREVIEW_RE.exec((await p.innerText()).split("\n")[0].trim())!;
    return Number(u) + Number(i);
  };
  const before = await total();
  await hydrated(sec, "record-wipe-range");
  await sec.locator(sel("segmented-control")).getByRole("tab", { name: RECORD.segments[0], exact: true }).click();
  await expect(sec.locator(`${sel("segmented-control")} [aria-selected="true"]`)).toHaveText(exact(RECORD.segments[0]));
  await expect.poll(total, { message: "'전체' 수 ≥ '이 날짜 이전' 수" }).toBeGreaterThanOrEqual(before);
  const zero = previews.nth(1);
  await expect(zero, "0건 문구").toHaveText(exact(W.previewEmpty));
});

async function recordSheet(page: Page, id: "record-wipe-sheet" | "record-wipe-drawer") {
  await open(page, MANAGE_GALLERY);
  const sec = area(page, id);
  await hydrated(sec, "school-name-confirm");
  return sec;
}

test(`[C1][S10] record-wipe 모바일 바텀시트 시안 10-record-wipe-mobile: 경고 아이콘 + '${RECORD.title.characters}' ${RECORD.title.fontSize}/${RECORD.title.fontWeight} · × · 범위 → 미리보기 → 학교명 → '${RECORD.button.characters.replace(/\d+/, "N")}'(꺼짐 → 학교명 같으면 검정) · 버튼 수 = 미리보기 합 · 실행 → '${W.recordDone.replace("{N}", "N")}'`, async ({ page }) => {
  const sec = await recordSheet(page, "record-wipe-sheet");
  const card = sec.locator(sel("ex-modal-card"));
  await expect(card).toHaveCount(1);
  const head = card.locator(sel("record-wipe"));
  await expectText(head.getByText(RECORD.title.characters, { exact: true }), RECORD.title, "제목", node(F10W, "title", "record-wipe").fills![0]);
  expect((await style(head.locator("svg").first(), ["color"])).color, "경고 아이콘 ink").toBe(rgb("#141414"));
  await expect(card.getByRole("button", { name: /닫기|close/i }).first(), "× 닫기").toBeVisible();
  const order = await card.evaluate((el) =>
    Array.from(el.querySelectorAll('[data-component="record-wipe-range"], [data-component="wipe-preview"], [data-component="school-name-confirm"], [data-component="button-primary"]')).map((x) => x.getAttribute("data-component")),
  );
  expect(order, "순서 = 시안 (범위 → 미리보기 → 학교명 → 버튼)").toEqual(["record-wipe-range", "wipe-preview", "school-name-confirm", "button-primary"]);
  const btn = card.locator(sel("button-primary"));
  await expect(btn).toHaveText(BUTTON_RE);
  const [, u, i] = PREVIEW_RE.exec((await card.locator(sel("wipe-preview")).innerText()).split("\n")[0].trim())!;
  const sum = Number(u) + Number(i);
  expect(Number(BUTTON_RE.exec((await btn.innerText()).trim())![1]), "버튼 수 = 사용 + 입고").toBe(sum);
  await expectOff(btn, "학교명 전 기록 삭제");
  const input = card.locator(`${sel("school-name-confirm")} input`);
  await input.fill(`${SCHOOL}x`);
  await expect(card.getByText(W.mismatch, { exact: true })).toHaveCount(1);
  await expectOff(btn, "다른 학교명");
  await input.fill(SCHOOL);
  await expectOn(btn, "학교명 같음");
  expect(Math.round((await box(btn)).height), "버튼 높이 = 시안").toBe(RECORD.buttonOn.height);
  await expectPalette(card, "record-wipe 바텀시트");
  await btn.click();
  await expect(card, "실행 뒤 닫힘").toHaveCount(0);
  await expect(sec.getByText(W.recordDone.replace("{N}", String(sum)), { exact: true }), "결과 문구").toHaveCount(1);
});

test(`[C1][S10] record-wipe: 미래 날짜 = 버튼 꺼짐 (미래 불가) · '전체' = 날짜 상관없이 미리보기 수 · 0건이면 '${W.previewEmpty}' + 꺼짐`, async ({ page }) => {
  const sec = await recordSheet(page, "record-wipe-sheet");
  const card = sec.locator(sel("ex-modal-card"));
  const btn = card.locator(sel("button-primary"));
  await card.locator(`${sel("school-name-confirm")} input`).fill(SCHOOL);
  await expectOn(btn, "기본 날짜 + 학교명 같음");
  const date = card.locator('input[type="date"]');
  const max = (await date.getAttribute("max"))!;
  const next = new Date(`${max}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  await date.fill(next.toISOString().slice(0, 10));
  await expectOff(btn, "미래 날짜");
  await date.fill("2000-01-01");
  await expect(card.locator(sel("wipe-preview")), "그 전 기록 0건").toHaveText(exact(W.previewEmpty));
  await expectOff(btn, "0건");
  await card.locator(sel("segmented-control")).getByRole("tab", { name: RECORD.segments[0], exact: true }).click();
  await expect(card.locator(sel("wipe-preview")).getByText(PREVIEW_RE), "'전체' 미리보기").toHaveCount(1);
  await expectOn(btn, "'전체' + 학교명 같음");
});

test(`[C1][S10] record-wipe 데스크톱 detail-drawer 시안 10-record-wipe-desktop: 바탕 ${RECORD.drawer.fills![0]} · 제목 '${RECORD.title.characters}' · 같은 순서 · 버튼 꺼짐 → 켜짐`, async ({ page }) => {
  const sec = await recordSheet(page, "record-wipe-drawer");
  const drawer = sec.locator(sel("detail-drawer"));
  await expect(drawer).toHaveCount(1);
  expect((await style(drawer, ["background-color"]))["background-color"]).toBe(rgb(RECORD.drawer.fills![0]));
  await expect(drawer.locator(sel("record-wipe")).getByText(RECORD.title.characters, { exact: true })).toHaveCount(1);
  for (const n of ["record-wipe-range", "wipe-preview", "school-name-confirm"]) await expect(drawer.locator(sel(n)), `드로어 ${n}`).toHaveCount(1);
  const btn = drawer.locator(sel("button-primary"));
  await expect(btn).toHaveText(BUTTON_RE);
  await expectOff(btn, "드로어 학교명 전");
  await drawer.locator(`${sel("school-name-confirm")} input`).fill(SCHOOL);
  await expectOn(btn, "드로어 학교명 같음");
  await expectPalette(drawer, "record-wipe 드로어");
});
