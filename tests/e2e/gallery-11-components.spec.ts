// 화면 11 (시약장 설정) 새 컴포넌트 + nav-pill 로그아웃 메뉴의 컴포넌트 수준 동작 — 갤러리(/gallery/cabinets, /gallery · 비로그인 공개) 대상.
// 기준: 디자인 run 20261004-2256 s2-spec "## 화면 11" · "## 상태 화면 11-empty" · "## 상태 화면 11-delete",
//       디자인 run 20261006-1223 s2-spec "## 화면 11"(1.15 — 번호 pill · 칸 안 시약 수 · 칸 누르기 = 칸 시트 · QR 인쇄),
//       harness/d7-data.md §9(시약장 설정) · §10(로그아웃) · §14, harness/dev-rules.json components·components_note·route_auth.logout.
// 기대값: 개수·문구·채움색은 design/frames/11-mobile.json(1.15 노드: manage-row · link-delete · select-option-active · class-title ·
//         legend-item · warning-line · section-title · bottom-actions) · 11-desktop.json(편집 카드 안 구성) · 11-empty-mobile.json ·
//         11-delete-mobile.json 노드에서,
//         문 형태·단 수·분류·비호환 조합·기본 이름·"칸 없음"·역할(R7)·색 범위는 design/rules.json 에서,
//         컴포넌트 목록은 harness/dev-rules.json components 에서 읽는다 (구현에서 읽지 않는다).
//         프레임에 없는 상태(이름 시트·토스트·학생 화면·로그아웃 메뉴) 문구는 s2-spec · d7-data.md 문장에서 그대로 옮긴 상수다.
// 태그: [K1] 은 dev-rules test_rules 에 없으므로 judge 의 규칙별 e2e 집계에 섞이지 않는다. [S11] 로 화면 11 실행에 포함된다.
// /cabinets 화면(D3)·DB(D2) 검사는 여기서 하지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const SCREEN = 11;
const GALLERY_CABINETS = "/gallery/cabinets";
const GALLERY = "/gallery";

type FrameNode = { name: string; type: string; path: string[]; fills: string[]; strokes: string[]; text: { characters: string } | null };
type Frame = { frames: { name: string; nodes: FrameNode[] }[] };
type Rules = {
  colors: {
    accent: { value: string; only_within: string[] };
    accent_soft: { value: string; only_within: string[] };
    highlight: { values: string[]; forbidden_within: string[] };
  };
  button: { min_height: number };
  roles: { R7: { role: string; components: string[]; max: number } };
  never: { N1: { school_name_pattern: string } };
  screens_required: Record<string, string[]>;
  cabinet: {
    door_types: string[];
    shelves: number[];
    storage_classes: string[];
    incompatible: [string, string][];
    default_name: string;
    unassigned_label: string;
  };
  tab_bar: { component: string; item: string };
  variants: Record<string, Record<string, string[]>>;
};
type Dev = { components: Record<string, number[]> };

const root = process.cwd();
const rules = JSON.parse(readFileSync(join(root, "design/rules.json"), "utf8")) as Rules;
const dev = JSON.parse(readFileSync(join(root, "harness/dev-rules.json"), "utf8")) as Dev;
const loadFrame = (name: string) => (JSON.parse(readFileSync(join(root, `design/frames/${name}.json`), "utf8")) as Frame).frames[0].nodes;
const mainNodes = loadFrame(`${SCREEN}-mobile`);
const desktopNodes = loadFrame(`${SCREEN}-desktop`);
const emptyNodes = loadFrame(`${SCREEN}-empty-mobile`);
const deleteNodes = loadFrame(`${SCREEN}-delete-mobile`);
const cab = rules.cabinet;

// ---------- 기대값: 프레임 ----------
const leaf = (n: FrameNode) => n.path[n.path.length - 1];
const under = (nodes: FrameNode[], ancestor: string) => nodes.filter((n) => n.path.slice(0, -1).includes(ancestor));
const texts = (nodes: FrameNode[], name: string) => nodes.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);
/** 노드 목록(깊이 우선 순서)을 leafName 노드마다 { 자신, 자손들 } 로 묶는다 */
function groups(nodes: FrameNode[], leafName: string): { node: FrameNode; children: FrameNode[] }[] {
  const out: { node: FrameNode; children: FrameNode[] }[] = [];
  let cur: { node: FrameNode; children: FrameNode[] } | null = null;
  for (const n of nodes) {
    if (leaf(n) === leafName) {
      cur = { node: n, children: [] };
      out.push(cur);
    } else if (cur && n.path.length > cur.node.path.length && n.path[cur.node.path.length - 1] === leafName) {
      cur.children.push(n);
    } else {
      cur = null;
    }
  }
  return out;
}
const labelIn = (g: { children: FrameNode[] }, name = "label") => g.children.find((c) => c.name === name && c.text)?.text?.characters ?? "";

const switcherNodes = under(mainNodes, "cabinet-switcher");
// pill 이름 = cabinet-chip(-active) 바로 아래 label (pill 안 cabinet-number 의 label 은 번호)
const PILLS = switcherNodes.filter((n) => n.name === "label" && /cabinet-chip/.test(n.path[n.path.length - 2])).map((n) => n.text!.characters);
const PILL_NUMBERS = switcherNodes
  .filter((n) => n.name === "label" && n.path[n.path.length - 2] === "cabinet-number" && /cabinet-chip/.test(n.path[n.path.length - 3]))
  .map((n) => n.text!.characters);
const ACTIVE_PILL = switcherNodes.find((n) => n.name === "label" && n.path[n.path.length - 2] === "cabinet-chip-active")!.text!.characters;
const ACTIVE_PILL_NODE = mainNodes.find((n) => leaf(n) === "cabinet-chip-active")!;
const ADD_LABEL = labelIn(groups(mainNodes, "cabinet-add")[0]);
const TITLE = texts(mainNodes, "cabinet-title")[0];
/** 시약장 요약: 모바일 시안은 "양문형 · 4단"(칸 수 없음), 데스크탑 시안은 "양문형 · 4단 · 8칸" */
const META_MOBILE = texts(mainNodes, "cabinet-meta")[0];
const META_DESKTOP = texts(desktopNodes, "cabinet-meta")[0];
const HEADER_NUMBER = texts(under(mainNodes, "cabinet-header"), "label")[0];
const RENAME_LABEL = labelIn(groups(under(mainNodes, "manage-actions"), "button-outline")[0]);
const QR_PRINT_LABEL = texts(under(mainNodes, "qr-print"), "label")[0];
const DELETE_LABEL = labelIn(groups(mainNodes, "link-delete")[0]);
const selectOf = (name: string) => {
  const nodes = under(mainNodes, name);
  return {
    label: texts(nodes, "select-label")[0],
    options: nodes.filter((n) => n.name === "label" && n.text).map((n) => n.text!.characters),
    selected: nodes.find((n) => n.name === "label" && n.path[n.path.length - 2] === "select-option-active")!.text!.characters,
  };
};
const DOOR = selectOf("cabinet-door-select");
const SHELF = selectOf("cabinet-shelf-select");
const FRAME_SLOTS = groups(mainNodes, "cabinet-slot").map((g) => ({
  label: labelIn(g, "slot-label"),
  fill: (g.node.fills[0] ?? "").toLowerCase(),
  stroke: (g.node.strokes[0] ?? "").toLowerCase(),
  warning: g.children.some((c) => c.path.includes("icon-warning")),
  count: Number(g.children.find((c) => c.name === "label" && c.text && c.path.includes("slot-count"))?.text?.characters ?? 0),
}));
const FRAME_CHIPS = groups(mainNodes, "storage-class-chip").map((g) => ({ label: labelIn(g), fill: (g.node.fills[0] ?? "").toLowerCase() }));
const PICKER_TITLE = texts(mainNodes, "class-title")[0];
const PICKER_HINT = texts(mainNodes, "class-help")[0];
const LEGEND = groups(mainNodes, "legend-item").map((g) => labelIn(g));
const mixNodes = under(mainNodes, "mix-warning");
const MIX = {
  fill: (mainNodes.find((n) => leaf(n) === "mix-warning")!.fills[0] ?? "").toLowerCase(),
  title: texts(mixNodes, "warning-title")[0],
  titleColor: mixNodes.find((n) => n.name === "warning-title")!.fills[0].toLowerCase(),
  // 1.15: warning-text 는 FRAME, 글자는 그 안 warning-line
  lines: texts(mixNodes.filter((n) => n.path.includes("warning-text")), "warning-line"),
  textColor: mixNodes.find((n) => n.name === "warning-line")!.fills[0].toLowerCase(),
  iconColors: [...new Set(mixNodes.filter((n) => n.path.includes("icon-warning")).flatMap((n) => [...n.fills, ...n.strokes].map((c) => c.toLowerCase())))],
};
const unassignedNodes = under(mainNodes, "unassigned-list");
const UNASSIGNED_TITLE = texts(unassignedNodes, "section-title")[0];
const UNASSIGNED_ROWS = groups(unassignedNodes, "reagent-row").map((g) => ({
  name: labelIn(g, "reagent-name"),
  stock: labelIn(g, "quantity"),
  caption: labelIn(g, "slot-caption"),
}));
const UNASSIGNED_CAPTION_FILL = unassignedNodes.find((n) => n.name === "slot-caption")!.fills[0];
const SAVE_LABEL = labelIn(groups(under(mainNodes, "bottom-actions"), "button-primary")[0]);
const DELETE_LABEL_FILL = mainNodes.find((n) => n.name === "label" && n.path.includes("link-delete"))!.fills[0];
/** 데스크탑 시안 11-desktop: 편집 카드(cabinet-edit) 안에 든 컴포넌트 (모바일 시안은 같은 묶음을 세로로 펼쳐 그린다) */
const EDIT_INSIDE = [...new Set(under(desktopNodes, "cabinet-edit").map(leaf).filter((n) => Object.keys(dev.components).includes(n)))];

const EMPTY = {
  pageTitle: texts(emptyNodes, "page-title")[0],
  title: texts(emptyNodes, "empty-title")[0],
  guide: texts(emptyNodes, "empty-guide")[0],
  iconColor: [...new Set(emptyNodes.filter((n) => n.path.includes("icon-cabinet")).flatMap((n) => n.strokes.map((c) => c.toLowerCase())))][0],
};
const delModalNodes = under(deleteNodes, "ex-modal-card");
const delModalRoot = deleteNodes.find((n) => leaf(n) === "ex-modal-card")!;
const DEL = {
  title: texts(delModalNodes, "modal-title")[0],
  body: texts(delModalNodes, "modal-body")[0],
  caption: texts(delModalNodes, "modal-caption")[0],
  cancel: labelIn(groups(delModalNodes, "button-outline")[0]),
  confirm: labelIn(groups(delModalNodes, "button-primary")[0]),
  fill: (delModalRoot.fills[0] ?? "").toLowerCase(),
  stroke: (delModalRoot.strokes[0] ?? "").toLowerCase(),
  activePill: under(deleteNodes, "cabinet-switcher").find((n) => n.name === "label" && n.path[n.path.length - 2] === "cabinet-chip-active")!.text!
    .characters,
  meta: texts(deleteNodes, "cabinet-meta")[0],
  slots: groups(deleteNodes, "cabinet-slot").length,
};

// 프레임의 컴포넌트 개수 (dev-rules components 이름만, nav-pill·tab-bar 는 갤러리 예시 구역 밖이라 뺀다)
const componentNames = Object.keys(dev.components);
const SHELL = ["nav-pill", rules.tab_bar.component, rules.tab_bar.item];
const countByName = (nodes: FrameNode[]) => {
  const out: Record<string, number> = {};
  for (const n of nodes) {
    if (!componentNames.includes(leaf(n))) continue;
    if (n.path.some((p) => SHELL.includes(p))) continue;
    out[leaf(n)] = (out[leaf(n)] ?? 0) + 1;
  }
  return out;
};
const FRAME_MAIN_COUNTS = countByName(mainNodes);
const FRAME_EMPTY_COUNTS = countByName(emptyNodes);
const FRAME_DELETE_COUNTS = countByName(deleteNodes);
const FRAME_DELETE_MODAL_COUNTS = countByName(delModalNodes);

// ---------- 기대값: rules.json ----------
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}
const HIGHLIGHTS = rules.colors.highlight.values.map((v) => v.toLowerCase());
const HIGHLIGHT_RGB = HIGHLIGHTS.map(hexToRgb);
const ACCENT = rules.colors.accent.value.toLowerCase();
const ACCENT_SOFT = rules.colors.accent_soft.value.toLowerCase();
const PINK_RGB = [ACCENT, ACCENT_SOFT].map(hexToRgb);
const PINK_ONLY_WITHIN = [...new Set([...rules.colors.accent.only_within, ...rules.colors.accent_soft.only_within])];
// 선택 표시: 프레임의 선택 칸 채움(연하늘) + 테두리(하늘색)
const SELECTED_SLOT = FRAME_SLOTS.find((s) => HIGHLIGHTS.includes(s.fill))!;
const SOFT = hexToRgb(SELECTED_SLOT?.fill ?? "#000000");
const LINE = hexToRgb(SELECTED_SLOT?.stroke ?? "#000000");
const MIN_H = rules.button.min_height;
const MAX_SHELVES = Math.max(...cab.shelves);
const MIN_SHELVES = Math.min(...cab.shelves);
const SCHOOL_RE = new RegExp(rules.never.N1.school_name_pattern, "g");

// s2-spec 화면 11: 양문형 = 좌·우 2열, 단문형 = 1열. 칸 이름 = 양문형 "좌1단", 단문형 "1단"
const SINGLE = "단문형";
const DOUBLE = "양문형";
const columns = (door: string) => (door === SINGLE ? 1 : 2);
const slotNameAt = (index: number, door: string) =>
  door === SINGLE ? `${index + 1}단` : `${index % 2 === 0 ? "좌" : "우"}${Math.floor(index / 2) + 1}단`;
/** 시약장 요약 (1.15): full = 데스크탑 "양문형 · 4단 · 8칸", short = 모바일 "양문형 · 4단" */
const metaOf = (door: string, shelves: number, form: "full" | "short" = "full") =>
  form === "short" ? `${door} · ${shelves}단` : `${door} · ${shelves}단 · ${columns(door) * shelves}칸`;
const MOBILE_W = (JSON.parse(readFileSync(join(root, "harness/dev-rules.json"), "utf8")) as { viewports: { mobile: number[] } }).viewports.mobile[0];
const isMobile = (page: Page) => page.viewportSize()!.width <= MOBILE_W;
/** 지금 폭에서 보여야 할 요약 (모바일 = 시안 11-mobile 꼴, 데스크탑 = 시안 11-desktop 꼴) */
const metaFor = (page: Page, door: string, shelves: number) => metaOf(door, shelves, isMobile(page) ? "short" : "full");
/** 11-delete 시안(1.14)의 2번 시약장 요약 "양문형 · 3단 · 6칸" 에서 문 형태·단 수 */
const DEL_SHAPE = (() => {
  const m = /^(\S+) · (\d+)단/.exec(DEL.meta);
  return { door: m?.[1] ?? "", shelves: Number(m?.[2] ?? 0) };
})();
const pickerTitle = (slot: string) => `${slot} 보관 분류`;
// 한국어 조사: 받침이 있으면 과·은, 없으면 와·는 (분류 8종을 손으로 적은 표)
const BATCHIM: Record<string, boolean> = { 유기: false, 산: true, 염기: false, 산화제: false, 인화성: true, 무기염: true, 독성: true, 기타: false };
// d7 §9 혼재 경고: "{칸}: {A}과 {B}는 섞이면 위험해요. 다른 칸에 나눠 보관하세요"
const warningText = (slot: string, a: string, b: string) =>
  `${slot}: ${a}${BATCHIM[a] ? "과" : "와"} ${b}${BATCHIM[b] ? "은" : "는"} 섞이면 위험해요. 다른 칸에 나눠 보관하세요`;
const classOrder = (list: string[]) => cab.storage_classes.filter((c) => list.includes(c));
const defaultName = (n: number) => cab.default_name.replace("{n}", String(n));

// ---------- s2-spec "## 화면 11" · d7-data.md §9·§10 문장 그대로 ----------
const SCHOOL = "샘플고등학교";
const UNSET = "미지정";
const NAME_MAX = 20;
const RENAME_TITLE = "시약장 이름";
const RENAME_SAVE = "저장";
const RENAME_CANCEL = "취소";
const EMPTY_GUIDE_STUDENT = "교사가 시약장을 추가하면 여기에 보여요";
const TOAST_SAVED = "시약장 설정을 저장했어요";
const TOAST_RENAMED = "이름을 바꿨어요";
const toastAdded = (name: string) => `${name}을 추가했어요`;
const toastDeleted = (name: string) => `${name}을 삭제했어요`;
const SHRINK_NOTICE = /^이 변경으로 시약 \d+종이 '칸 없음'이 돼요$/;
const LOGOUT = "로그아웃";

const sel = (name: string) => `[data-component="${name}"]`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

async function open(page: Page, path = GALLERY_CABINETS): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `갤러리 ${path} 응답`).toBe(200);
  await page.waitForLoadState("networkidle");
}

/** 갤러리 예시 구역 */
async function area(page: Page, id: string): Promise<Locator> {
  const loc = page.locator(`section[aria-labelledby="g-${id}"]`);
  await expect(loc, `예시 구역 g-${id}`).toHaveCount(1);
  await loc.scrollIntoViewIfNeeded();
  return loc;
}

async function box(loc: Locator, what: string): Promise<{ x: number; y: number; width: number; height: number }> {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  expect(b, `${what} 위치`).not.toBeNull();
  // 문서 기준 좌표 (요소마다 스크롤이 달라져도 서로 비교할 수 있게)
  const scroll = await loc.page().evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  return { x: b!.x + scroll.x, y: b!.y + scroll.y, width: b!.width, height: b!.height };
}

type Paint = { bg: string; lines: string[] };
/** 요소 자신의 바탕색 + 선(테두리·outline·box-shadow) 색 */
async function paints(list: Locator): Promise<Paint[]> {
  return list.evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el) as unknown as Record<string, string>;
      const lines: string[] = [];
      for (const s of ["Top", "Right", "Bottom", "Left"]) {
        if (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none") lines.push(cs[`border${s}Color`]);
      }
      if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) lines.push(cs.outlineColor);
      for (const m of (cs.boxShadow === "none" ? "" : cs.boxShadow).match(/rgba?\([^)]*\)/g) ?? []) lines.push(m);
      return { bg: cs.backgroundColor, lines };
    }),
  );
}
const isSelectedPaint = (p: Paint) => p.bg === SOFT && p.lines.includes(LINE);
const hasHighlight = (p: Paint) => HIGHLIGHT_RGB.includes(p.bg) || p.lines.some((l) => HIGHLIGHT_RGB.includes(l));

/** 요소와 자손 전체를 한 덩어리로 본 바탕색·선 색 (라디오 pill 처럼 표시가 안쪽 요소에 있을 때) */
async function groupPaint(loc: Locator): Promise<{ bgs: string[]; lines: string[] }> {
  return loc.evaluate((el) => {
    const bgs: string[] = [];
    const lines: string[] = [];
    for (const e of [el, ...Array.from(el.querySelectorAll("*"))]) {
      const cs = getComputedStyle(e) as unknown as Record<string, string>;
      bgs.push(cs.backgroundColor);
      for (const s of ["Top", "Right", "Bottom", "Left"]) {
        if (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none") lines.push(cs[`border${s}Color`]);
      }
      if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) lines.push(cs.outlineColor);
      for (const m of (cs.boxShadow === "none" ? "" : cs.boxShadow).match(/rgba?\([^)]*\)/g) ?? []) lines.push(m);
    }
    return { bgs, lines };
  });
}

type Use = { where: string; colors: string[]; inSvg: boolean; inside: boolean };
/** scope 안 모든 요소가 실제로 쓰는 색 (글자·바탕·선·아이콘). inside = within 컴포넌트 안에 있는지 */
async function colorUses(scope: Locator, within: string[] = []): Promise<Use[]> {
  return scope.evaluate((rootEl, names) => {
    const insideSel = names.map((n) => `[data-component="${n}"]`).join(",");
    const out: { where: string; colors: string[]; inSvg: boolean; inside: boolean }[] = [];
    for (const el of [rootEl, ...Array.from(rootEl.querySelectorAll("*"))]) {
      const cs = getComputedStyle(el) as unknown as Record<string, string>;
      const inSvg = el instanceof SVGElement;
      const colors: string[] = [cs.backgroundColor];
      for (const s of ["Top", "Right", "Bottom", "Left"]) {
        if (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none") colors.push(cs[`border${s}Color`]);
      }
      if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) colors.push(cs.outlineColor);
      for (const m of (cs.boxShadow === "none" ? "" : cs.boxShadow).match(/rgba?\([^)]*\)/g) ?? []) colors.push(m);
      if (inSvg) {
        if (cs.fill !== "none") colors.push(cs.fill);
        if (cs.stroke !== "none") colors.push(cs.stroke);
      } else if (Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "")) {
        colors.push(cs.color);
      }
      out.push({
        where: `${el.tagName.toLowerCase()}${el.getAttribute("data-component") ? `[${el.getAttribute("data-component")}]` : ""}`,
        colors,
        inSvg,
        inside: insideSel !== "" && el.closest(insideSel) !== null,
      });
    }
    return out;
  }, within);
}
const using = (uses: Use[], rgbs: string[]) => uses.filter((u) => u.colors.some((c) => rgbs.includes(c)));

// ---------- 화면 11 예시 구역 안 요소 ----------
const pills = (scope: Locator) => scope.locator(`${sel("cabinet-switcher")} :is(button, a):not(${sel("cabinet-add")})`);
/** pill 의 이름 글자 (pill 안 cabinet-number 원의 번호는 뺀다 — 1.15) */
const nameWithoutNumber = (els: Element[]) =>
  els.map((el) => {
    const c = el.cloneNode(true) as Element;
    for (const n of Array.from(c.querySelectorAll('[data-component="cabinet-number"]'))) n.remove();
    return (c.textContent ?? "").replace(/\s+/g, " ").trim();
  });
const pillNames = async (scope: Locator) => pills(scope).evaluateAll(nameWithoutNumber);
/** pill 안 cabinet-number 의 번호 (pill 마다 1개) */
const pillNumbers = async (scope: Locator) =>
  pills(scope).evaluateAll((els) => els.map((el) => Array.from(el.querySelectorAll('[data-component="cabinet-number"]')).map((n) => (n.textContent ?? "").trim())));
const pill = (scope: Locator, name: string) => pills(scope).filter({ has: scope.page().getByText(name, { exact: true }) });
const slots = (scope: Locator) => scope.locator(sel("cabinet-slot"));
const chips = (scope: Locator) => scope.locator(`button${sel("storage-class-chip")}`);
const chip = (scope: Locator, name: string) => chips(scope).filter({ hasText: exact(name) });
const pressedChips = async (scope: Locator) =>
  (await chips(scope).evaluateAll((els) => els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => (e.textContent ?? "").trim())));
/** 칸 글자 (칸 안 slot-count 의 수는 뺀다 — 1.15) */
const slotTexts = async (scope: Locator) =>
  slots(scope).evaluateAll((els) =>
    els.map((el) => {
      const c = el.cloneNode(true) as Element;
      for (const n of Array.from(c.querySelectorAll('[data-component="slot-count"]'))) n.remove();
      return (c.textContent ?? "").replace(/\s+/g, " ").trim();
    }),
  );
/** 칸 하나의 분류 글자 (slot-count 수 제외) */
async function expectSlotLabel(s: Locator, want: string, message = "칸 라벨"): Promise<void> {
  await expect
    .poll(async () => (await s.evaluateAll((els) => els.map((el) => {
      const c = el.cloneNode(true) as Element;
      for (const n of Array.from(c.querySelectorAll('[data-component="slot-count"]'))) n.remove();
      return (c.textContent ?? "").replace(/\s+/g, " ").trim();
    })))[0], { message })
    .toBe(want);
}
/** 시약장 제목(heading) 1개 + 바로 뒤 요약 줄이 지금 폭의 꼴, 바로 앞 cabinet-number = 번호 */
async function expectHeader(page: Page, scope: Locator, title: string, door: string, shelves: number, number?: string): Promise<void> {
  const h = scope.getByRole("heading", { name: title, exact: true });
  await expect(h, `시약장 이름 "${title}" (heading)`).toHaveCount(1);
  const want = metaFor(page, door, shelves);
  await expect
    .poll(async () => squash(await h.evaluate((el) => (el.nextElementSibling as HTMLElement | null)?.innerText ?? "")), { message: `요약 "${want}"` })
    .toBe(want);
  if (number !== undefined) {
    const prev = await h.evaluate((el) => {
      const p = el.previousElementSibling;
      return p ? { name: p.getAttribute("data-component"), text: (p.textContent ?? "").trim() } : null;
    });
    expect(prev, `제목 앞 cabinet-number "${number}"`).toEqual({ name: "cabinet-number", text: number });
  }
}
const radios = (scope: Locator, component: string) => scope.locator(sel(component)).getByRole("radiogroup").getByRole("radio");
/** 옵션 글자가 놓인 자리를 실제 마우스로 누른다 (라디오 입력이 pill 전체를 덮어도 사용자와 같은 결과) */
async function pickRadio(scope: Locator, component: string, name: string): Promise<void> {
  const text = scope.locator(sel(component)).getByRole("radiogroup").getByText(name, { exact: true });
  await text.scrollIntoViewIfNeeded();
  const b = await text.boundingBox();
  expect(b, `${component} "${name}" 위치`).not.toBeNull();
  await scope.page().mouse.click(b!.x + b!.width / 2, b!.y + b!.height / 2);
}
/** mix-warning 의 경고 줄 (제목 줄을 뺀 글자 줄) */
async function mixLines(scope: Locator): Promise<string[]> {
  const mix = scope.locator(sel("mix-warning"));
  if ((await mix.count()) === 0) return [];
  return (await mix.innerText())
    .split("\n")
    .map(squash)
    .filter((l) => l !== "" && l !== MIX.title);
}
async function expectSelectedSlot(scope: Locator, index: number): Promise<void> {
  await expect
    .poll(async () => (await paints(slots(scope))).map(isSelectedPaint).map((v, i) => (v ? i : -1)).filter((i) => i >= 0), {
      message: `선택 표시(연하늘 바탕 + 하늘색 테두리)가 ${index + 1}번째 칸에만`,
    })
    .toEqual([index]);
  const others = (await paints(slots(scope))).filter((_, i) => i !== index);
  expect(others.filter(hasHighlight).length, "선택되지 않은 칸에 하늘색 없음").toBe(0);
}
async function selectSlot(page: Page, scope: Locator, index: number): Promise<void> {
  await slots(scope).nth(index).click();
  await page.mouse.move(0, 0);
  await expectSelectedSlot(scope, index);
}
async function setClasses(scope: Locator, want: string[]): Promise<void> {
  for (const c of cab.storage_classes) {
    const on = (await chip(scope, c).getAttribute("aria-pressed")) === "true";
    if (on !== want.includes(c)) await chip(scope, c).click();
  }
  await expect.poll(() => pressedChips(scope), { message: `선택된 칩 = ${want.join(", ") || "없음"}` }).toEqual(classOrder(want));
}
const toast = (scope: Locator, text: string) => scope.locator(sel("ex-toast")).filter({ hasText: exact(text) });

// ---------- 기대값 자체 점검 ----------
test(`[K1][S${SCREEN}] 기대값 원본: 프레임 11·11-empty·11-delete 와 rules.json cabinet·colors 가 서로 맞는다`, () => {
  expect(PILLS, "프레임 시약장 pill").toEqual([defaultName(1), defaultName(2)]);
  // 1.15: pill 마다 이름 앞 cabinet-number, 기본 이름 "{n}번 시약장" 의 n = 번호 (d7 §14)
  expect(PILL_NUMBERS, "프레임 pill 번호").toEqual(PILLS.map((_, i) => String(i + 1)));
  expect(HEADER_NUMBER, "프레임 제목 앞 번호 = 활성 pill 번호").toBe(PILL_NUMBERS[PILLS.indexOf(ACTIVE_PILL)]);
  expect(QR_PRINT_LABEL, "프레임 qr-print 라벨").toBe("QR 인쇄");
  expect(META_MOBILE, "11-mobile 요약 (칸 수 없음)").toBe(metaOf(DOOR.selected, parseInt(SHELF.selected, 10), "short"));
  expect(META_DESKTOP, "11-desktop 요약 (칸 수 포함)").toBe(metaOf(DOOR.selected, parseInt(SHELF.selected, 10), "full"));
  expect(DEL.meta, "11-delete 요약 (1.14 데스크탑 꼴)").toBe(metaOf(DEL_SHAPE.door, DEL_SHAPE.shelves, "full"));
  expect(FRAME_SLOTS.map((s) => s.count), "프레임 칸 안 시약 수 (s2-spec: 좌1단 2 · 우1단 1 · 좌2단 3 · 우3단 1)").toEqual([2, 1, 3, 0, 0, 1, 0, 0]);
  expect(PICKER_HINT, "프레임 칩 묶음 안내").toBe("여러 개 고를 수 있어요");
  expect(PILLS, "프레임 활성 pill").toContain(ACTIVE_PILL);
  expect(HIGHLIGHTS, "활성 pill 채움 = 하늘색").toContain((ACTIVE_PILL_NODE.fills[0] ?? "").toLowerCase());
  expect(ADD_LABEL, "프레임 cabinet-add 라벨").toBe("시약장 추가");
  expect(TITLE, "프레임 시약장 이름 = 활성 pill").toBe(ACTIVE_PILL);
  expect(DOOR.options, "프레임 문 형태 옵션 = rules door_types").toEqual(cab.door_types);
  expect(SHELF.options, "프레임 단 수 옵션 = rules shelves").toEqual(cab.shelves.map((n) => `${n}단`));

  expect(FRAME_SLOTS.length, "프레임 칸 수 = 열 × 단").toBe(columns(DOOR.selected) * parseInt(SHELF.selected, 10));
  expect(FRAME_SLOTS.filter((s) => HIGHLIGHTS.includes(s.fill)).length, "프레임 선택 칸 1개").toBe(1);
  expect(HIGHLIGHTS, "선택 칸 테두리 = 하늘색").toContain(SELECTED_SLOT.stroke);
  expect(SELECTED_SLOT.fill, "선택 칸 채움과 테두리는 서로 다른 하늘색").not.toBe(SELECTED_SLOT.stroke);
  expect(FRAME_CHIPS.map((c) => c.label), "프레임 칩 8종 = rules storage_classes").toEqual(cab.storage_classes);
  const selectedIndex = FRAME_SLOTS.indexOf(SELECTED_SLOT);
  expect(PICKER_TITLE, "프레임 칩 묶음 제목 = {선택 칸} 보관 분류").toBe(pickerTitle(slotNameAt(selectedIndex, DOOR.selected)));
  expect(FRAME_CHIPS.filter((c) => HIGHLIGHTS.includes(c.fill)).map((c) => c.label).join(" · "), "선택된 칩 = 선택 칸 라벨").toBe(SELECTED_SLOT.label);
  expect(FRAME_SLOTS.filter((s) => s.warning).length, "프레임 경고 칸").toBe(MIX.lines.length);
  expect(MIX.fill, "mix-warning 채움 = rules accent_soft").toBe(ACCENT_SOFT);
  expect(MIX.iconColors, "mix-warning 아이콘 = rules accent").toEqual([ACCENT]);
  expect(MIX.lines, "프레임 경고 문구").toEqual([warningText(slotNameAt(selectedIndex, DOOR.selected), "산", "염기")]);
  expect(UNASSIGNED_TITLE, "프레임 칸 없음 제목").toBe(`${cab.unassigned_label} 시약 (${UNASSIGNED_ROWS.length})`);
  expect(UNASSIGNED_ROWS.every((r) => r.name && r.stock && r.caption === cab.unassigned_label), "칸 없음 행마다 이름·재고·칸 없음").toBe(true);
  expect(LEGEND, "프레임 범례").toEqual([UNSET, "선택 칸", "섞으면 위험"]);
  expect(SAVE_LABEL).toBe("저장");
  expect(RENAME_LABEL).toBe("이름 바꾸기");
  expect(DELETE_LABEL).toBe("삭제");
  expect(EMPTY.title).toBe("아직 시약장이 없어요");
  expect(EMPTY.guide).toBe("'+ 시약장 추가'를 눌러 첫 시약장을 만들어 주세요");
  expect(HIGHLIGHTS, "빈 상태 아이콘 = 하늘색").toContain(EMPTY.iconColor);
  expect(DEL.title).toBe("이 시약장을 삭제할까요?");
  expect(DEL.body).toBe(`배치된 시약 6개는 '${cab.unassigned_label}'으로 바뀌어요`);
  expect(DEL.caption).toBe("시약 정보와 재고는 지워지지 않아요");
  expect([DEL.cancel, DEL.confirm]).toEqual(["취소", "삭제"]);
  expect(DEL.activePill, "11-delete 활성 pill").toBe(defaultName(2));
  for (const n of rules.variants[String(SCREEN)].empty) expect(FRAME_EMPTY_COUNTS[n] ?? 0, `11-empty 프레임 ${n}`).toBeGreaterThanOrEqual(1);
  for (const n of rules.variants[String(SCREEN)].delete) expect(FRAME_DELETE_COUNTS[n] ?? 0, `11-delete 프레임 ${n}`).toBeGreaterThanOrEqual(1);
  for (const n of rules.screens_required[String(SCREEN)]) expect(FRAME_MAIN_COUNTS[n] ?? 0, `11 프레임 ${n}`).toBeGreaterThanOrEqual(1);
  expect(Object.keys(BATCHIM).sort(), "조사 표 = 분류 8종").toEqual([...cab.storage_classes].sort());
});

// ---------- 갤러리 등장 (K1 의 DOM 판) ----------
test(`[K1][S${SCREEN}] /gallery DOM 에 화면 ${SCREEN} 전용 컴포넌트(화면 11 에만 · 화면 3·11 에만)가 각각 1개 이상 (K1 갤러리 기준 페이지)`, async ({ page }) => {
  const only = componentNames.filter((n) => dev.components[n].length === 1 && dev.components[n][0] === SCREEN);
  // 1.15: cabinet-slot · cabinet-switcher · mix-warning 은 화면 3(위치 피커)에도 쓰여 [3, 11], 새 qr-label · qr-print · qr-print-sheet · slot-assign · slot-sheet 는 11 에만
  expect(only.sort(), "dev-rules 에서 화면 11 에만 있는 컴포넌트").toEqual(
    [
      "cabinet-add",
      "cabinet-door-select",
      "cabinet-edit",
      "cabinet-shelf-select",
      "qr-label",
      "qr-print",
      "qr-print-sheet",
      "slot-assign",
      "slot-sheet",
      "storage-class-chip",
    ].sort(),
  );
  const shared = componentNames.filter((n) => dev.components[n].includes(SCREEN) && dev.components[n].every((s) => s === SCREEN || s === 3) && !only.includes(n));
  expect(shared.sort(), "dev-rules 에서 화면 3·11 에만 있는 컴포넌트").toEqual(["cabinet-number", "cabinet-slot", "cabinet-switcher", "mix-warning", "slot-count"].sort());
  await open(page, GALLERY);
  for (const n of [...only, ...shared]) expect(await page.locator(sel(n)).count(), `/gallery ${n}`).toBeGreaterThanOrEqual(1);
});

test(`[K1][S${SCREEN}] /gallery/cabinets DOM 에 화면 ${SCREEN} 컴포넌트(dev-rules, tab-bar 제외)가 각각 1개 이상, 새 data-component 이름 없음`, async ({ page }) => {
  const want = componentNames.filter((n) => dev.components[n].includes(SCREEN) && ![rules.tab_bar.component, rules.tab_bar.item].includes(n));
  expect(want.length, "dev-rules 화면 11 컴포넌트").toBeGreaterThan(8);
  await open(page);
  for (const n of want) expect(await page.locator(sel(n)).count(), `/gallery/cabinets ${n}`).toBeGreaterThanOrEqual(1);
  // 로그아웃 메뉴를 연 상태까지 포함해, 붙어 있는 data-component 이름은 모두 dev-rules components 에 있다
  const logout = await area(page, "logout");
  await logout.locator(sel("nav-pill")).getByRole("button", { name: new RegExp(esc(SCHOOL)) }).click();
  await expect(logout.getByRole("menu")).toHaveCount(1);
  const names = await page.locator("[data-component]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-component") ?? ""))]);
  for (const n of names) expect(componentNames, `data-component="${n}" 는 dev-rules components 에 있다`).toContain(n);
});

test(`[K1][S${SCREEN}] 컴포넌트 개수: 기본 예시가 프레임 ${SCREEN}-mobile 개수 이상, 화면 ${SCREEN} 필수 컴포넌트(rules screens_required) 모두 있음`, async ({ page }) => {
  await open(page);
  const sec = await area(page, "default");
  for (const [name, n] of Object.entries(FRAME_MAIN_COUNTS)) {
    expect(await sec.locator(sel(name)).count(), `기본 예시 ${name} (프레임 ${n})`).toBeGreaterThanOrEqual(n);
  }
  for (const name of rules.screens_required[String(SCREEN)]) {
    expect(await sec.locator(sel(name)).count(), `필수 ${name}`).toBeGreaterThanOrEqual(1);
  }
  // 하나뿐이어야 하는 것·칸 수·번호 원·칸 안 시약 수는 프레임과 정확히 같다
  for (const name of ["cabinet-switcher", "cabinet-add", "cabinet-edit", "qr-print", "cabinet-door-select", "cabinet-shelf-select", "mix-warning", "cabinet-slot", "cabinet-number", "slot-count", "reagent-row"]) {
    await expect(sec.locator(sel(name)), `기본 예시 ${name}`).toHaveCount(FRAME_MAIN_COUNTS[name]);
  }
});

test(`[K1][S${SCREEN}] 컴포넌트 개수: 빈 상태 예시가 프레임 ${SCREEN}-empty-mobile 개수 이상 (rules variants.11.empty)`, async ({ page }) => {
  await open(page);
  const sec = await area(page, "empty");
  for (const [name, n] of Object.entries(FRAME_EMPTY_COUNTS)) {
    expect(await sec.locator(sel(name)).count(), `빈 상태 ${name} (프레임 ${n})`).toBeGreaterThanOrEqual(n);
  }
  for (const name of rules.variants[String(SCREEN)].empty) expect(await sec.locator(sel(name)).count(), `variants.empty ${name}`).toBeGreaterThanOrEqual(1);
});

test(`[K1][S${SCREEN}] 컴포넌트 개수: 삭제 확인 예시 카드가 프레임 ${SCREEN}-delete-mobile 의 ex-modal-card 안 개수와 같다`, async ({ page }) => {
  expect(Object.keys(FRAME_DELETE_MODAL_COUNTS).length, "프레임 확인 카드 안 컴포넌트 종류").toBeGreaterThan(0);
  await open(page);
  const sec = await area(page, "delete");
  await expect(sec.locator(sel("ex-modal-card")), "ex-modal-card").toHaveCount(FRAME_DELETE_COUNTS["ex-modal-card"]);
  for (const [name, n] of Object.entries(FRAME_DELETE_MODAL_COUNTS)) {
    await expect(sec.locator(sel("ex-modal-card")).locator(sel(name)), `확인 카드 안 ${name}`).toHaveCount(n);
  }
});

test(`[K1][S${SCREEN}] 컴포넌트 개수: 기본 예시에서 "${DEL.activePill}" → "${DELETE_LABEL}" 을 누른 상태가 프레임 ${SCREEN}-delete-mobile 개수 이상 (rules variants.11.delete)`, async ({ page }) => {
  await open(page);
  const sec = await area(page, "default");
  await pill(sec, DEL.activePill).click();
  await expectHeader(page, sec, DEL.activePill, DEL_SHAPE.door, DEL_SHAPE.shelves);
  await expect(slots(sec), "칸 수").toHaveCount(DEL.slots);
  await sec.locator(sel("cabinet-edit")).getByRole("button", { name: DELETE_LABEL, exact: true }).click();
  await expect(sec.locator(sel("ex-modal-card")), "삭제 확인 카드").toHaveCount(1);
  for (const [name, n] of Object.entries(FRAME_DELETE_COUNTS)) {
    expect(await sec.locator(sel(name)).count(), `삭제 확인 상태 ${name} (프레임 ${n})`).toBeGreaterThanOrEqual(n);
  }
  for (const name of rules.variants[String(SCREEN)].delete) expect(await sec.locator(sel(name)).count(), `variants.delete ${name}`).toBeGreaterThanOrEqual(1);
  const card = sec.locator(sel("ex-modal-card"));
  await expect(card.getByText(DEL.body, { exact: true }), `"${DEL.body}"`).toBeVisible();
});

// ---------- 색 범위 (rules.json colors) ----------
test(`[K1][S${SCREEN}] /gallery/cabinets 색 범위: 핑크(accent·accent_soft)는 ${PINK_ONLY_WITHIN.join("·")} 안에서만, 그 안에는 하늘색 없음`, async ({ page }) => {
  await open(page);
  const uses = await colorUses(page.locator("main"), PINK_ONLY_WITHIN);
  const pink = using(uses, PINK_RGB);
  expect(pink.length, "핑크를 쓰는 요소가 있다 (mix-warning)").toBeGreaterThan(0);
  expect(pink.filter((u) => !u.inside).map((u) => u.where), "허용 컴포넌트 밖에서 핑크를 쓰는 요소").toEqual([]);
  const forbidden = await colorUses(page.locator("main"), rules.colors.highlight.forbidden_within);
  expect(using(forbidden, HIGHLIGHT_RGB).filter((u) => u.inside).map((u) => u.where), "하늘색 금지 컴포넌트 안에서 하늘색을 쓰는 요소").toEqual([]);
});

// ---------- 기본 (교사·admin) ----------
test.describe("기본 예시 (교사·admin)", () => {
  test(`[K1][S${SCREEN}] cabinet-switcher: pill ${PILLS.length}개(${PILLS.join(" · ")}), "${ACTIVE_PILL}" 만 활성(연하늘 + 하늘색 테두리), 끝에 cabinet-add 1개`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const sw = sec.locator(sel("cabinet-switcher"));
    await expect(sw).toHaveCount(1);
    await expect(pills(sec), "pill 수").toHaveCount(PILLS.length);
    expect(await pillNames(sec), "pill 이름·순서").toEqual(PILLS);
    expect(await pillNumbers(sec), "pill 마다 cabinet-number 1개 = 시안 번호").toEqual(PILL_NUMBERS.map((n) => [n]));
    await page.mouse.move(0, 0);
    await expect
      .poll(async () => (await paints(pills(sec))).map(isSelectedPaint), { message: "활성 표시는 활성 pill 에만" })
      .toEqual(PILLS.map((p) => p === ACTIVE_PILL));
    const inactive = (await paints(pills(sec))).filter((_, i) => PILLS[i] !== ACTIVE_PILL);
    expect(inactive.filter(hasHighlight).length, "비활성 pill 에 하늘색 없음").toBe(0);
    // 읽기 도구에도 활성 상태가 하나만 전달된다
    const marked = sw.locator(':is([aria-current]:not([aria-current="false"]), [aria-pressed="true"], [aria-selected="true"])');
    await expect(marked, "활성 상태 속성은 하나").toHaveCount(1);
    expect(await marked.evaluateAll(nameWithoutNumber), "활성 pill 이름").toEqual([ACTIVE_PILL]);
    // cabinet-add: switcher 안 맨 끝, 같은 줄
    const add = sw.locator(sel("cabinet-add"));
    await expect(add, "switcher 안 cabinet-add").toHaveCount(1);
    await expect(add).toHaveText(exact(ADD_LABEL));
    await expect(sw.getByRole("button", { name: ADD_LABEL, exact: true }), "cabinet-add 는 버튼").toHaveCount(1);
    await expect(add).toBeEnabled();
    expect(await add.locator("svg").count(), '"+" 아이콘').toBeGreaterThanOrEqual(1);
    const last = pills(sec).last();
    const after = await add.evaluate((a, l) => Boolean(l && l.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING), await last.elementHandle());
    expect(after, "cabinet-add 는 마지막 pill 뒤").toBe(true);
    const a = await box(add, "cabinet-add");
    const l = await box(last, "마지막 pill");
    expect(a.x, "cabinet-add 가 마지막 pill 오른쪽").toBeGreaterThan(l.x);
    expect(Math.abs(a.y + a.height / 2 - (l.y + l.height / 2)), "cabinet-add 와 pill 은 같은 줄").toBeLessThanOrEqual(a.height / 2);
    expect(a.height, `cabinet-add 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    for (let i = 0; i < PILLS.length; i++) expect((await box(pills(sec).nth(i), PILLS[i])).height, `${PILLS[i]} pill 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
  });

  test(`[K1][S${SCREEN}] 시약장 이름 "${TITLE}" 제목(앞 cabinet-number "${HEADER_NUMBER}") + 요약 모바일 "${META_MOBILE}" · 데스크탑 "${META_DESKTOP}", switcher 아래`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const title = sec.getByRole("heading", { name: TITLE, exact: true });
    await expectHeader(page, sec, TITLE, DOOR.selected, parseInt(SHELF.selected, 10), HEADER_NUMBER);
    expect(metaFor(page, DOOR.selected, parseInt(SHELF.selected, 10)), "요약 = 지금 폭의 시안 문구").toBe(isMobile(page) ? META_MOBILE : META_DESKTOP);
    const sw = await box(sec.locator(sel("cabinet-switcher")), "switcher");
    const t = await box(title, "시약장 이름");
    const edit = await box(sec.locator(sel("cabinet-edit")), "cabinet-edit");
    expect(t.y, "이름은 switcher 아래").toBeGreaterThanOrEqual(sw.y + sw.height);
    if (isMobile(page)) {
      // 시안 11-mobile: 한 열 — cabinet-edit 관리 줄은 이름 아래
      expect(edit.y, "cabinet-edit 은 이름 아래").toBeGreaterThanOrEqual(t.y);
    } else {
      // 시안 11-desktop: 2단 — 왼쪽 열(switcher · 이름) 오른쪽에 cabinet-edit 카드, 위쪽 끝이 switcher 와 같은 줄에서 시작
      expect(edit.x, "cabinet-edit 카드는 switcher 오른쪽").toBeGreaterThanOrEqual(sw.x + sw.width);
      expect(edit.y, "cabinet-edit 카드 위쪽 끝은 switcher 아래 끝보다 위").toBeLessThan(sw.y + sw.height);
    }
  });

  test(`[K1][S${SCREEN}] cabinet-switcher: 다른 pill 을 누르면 그 시약장만 활성, 아래 이름·요약·배치도가 그 시약장으로`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const other = PILLS.find((p) => p !== ACTIVE_PILL)!;
    await pill(sec, other).click();
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await paints(pills(sec))).map(isSelectedPaint), { message: "활성 표시가 옮겨 간다" }).toEqual(PILLS.map((p) => p === other));
    await expectHeader(page, sec, other, DEL_SHAPE.door, DEL_SHAPE.shelves, PILL_NUMBERS[PILLS.indexOf(other)]);
    await expect(sec.getByRole("heading", { name: TITLE, exact: true })).toHaveCount(0);
    await expect(slots(sec), "칸 수").toHaveCount(DEL.slots);
    // 칸 없음 시약 목록은 어느 시약장을 보든 같다 (d7 §9)
    await expect(sec.getByRole("heading", { name: UNASSIGNED_TITLE, exact: true })).toHaveCount(1);
    await pill(sec, ACTIVE_PILL).click();
    await expect(sec.getByRole("heading", { name: TITLE, exact: true })).toHaveCount(1);
    await expect(slots(sec)).toHaveCount(FRAME_SLOTS.length);
    expect(await slotTexts(sec), "돌아오면 칸 라벨도 그대로").toEqual(FRAME_SLOTS.map((s) => s.label));
  });

  test(`[K1][S${SCREEN}] cabinet-add: 누르면 "${defaultName(PILLS.length + 1)}" pill 이 생겨 활성, 양문형·${MAX_SHELVES}단 칸 모두 "${UNSET}", 토스트`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const name = defaultName(PILLS.length + 1);
    await sec.locator(sel("cabinet-switcher")).locator(sel("cabinet-add")).click();
    await page.mouse.move(0, 0);
    await expect(pills(sec), "pill 수 +1").toHaveCount(PILLS.length + 1);
    expect(await pillNames(sec), "새 pill 은 맨 뒤").toEqual([...PILLS, name]);
    expect((await pillNumbers(sec)).at(-1), "새 pill 번호 = 다음 번호 (rules cabinet.number)").toEqual([String(PILLS.length + 1)]);
    await expect.poll(async () => (await paints(pills(sec))).map(isSelectedPaint), { message: "새 시약장이 활성" }).toEqual([...PILLS.map(() => false), true]);
    await expect(sec.locator(sel("cabinet-switcher")).locator(sel("cabinet-add")), "cabinet-add 는 여전히 1개").toHaveCount(1);
    await expectHeader(page, sec, name, DOUBLE, MAX_SHELVES, String(PILLS.length + 1));
    await expect(slots(sec)).toHaveCount(columns(DOUBLE) * MAX_SHELVES);
    await expect(sec.locator(sel("slot-count")), "새 시약장 칸에 시약 수 없음").toHaveCount(0);
    expect(await slotTexts(sec), "새 시약장 칸은 모두 미지정").toEqual(Array.from({ length: columns(DOUBLE) * MAX_SHELVES }, () => UNSET));
    await expect(sec.locator(sel("mix-warning")), "새 시약장에는 경고 없음").toHaveCount(0);
    await expect(toast(sec, toastAdded(name)), `ex-toast "${toastAdded(name)}"`).toBeVisible();
  });

  test(`[K1][S${SCREEN}] cabinet-edit: 관리 줄 button-outline "${RENAME_LABEL}" + 조용한 글자 버튼 "${DELETE_LABEL}"(채움·테두리·핑크 없음), 맨 아래 button-primary "${SAVE_LABEL}"`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const edit = sec.locator(sel("cabinet-edit"));
    await expect(edit).toHaveCount(1);
    const rename = edit.locator(sel("button-outline")).filter({ hasText: exact(RENAME_LABEL) });
    await expect(rename, `button-outline "${RENAME_LABEL}"`).toHaveCount(1);
    await expect(rename).toBeEnabled();
    const del = edit.getByRole("button", { name: DELETE_LABEL, exact: true });
    await expect(del, `"${DELETE_LABEL}" 버튼`).toHaveCount(1);
    await expect(del).toBeEnabled();
    expect(await del.evaluate((el) => el.closest("[data-component]")?.getAttribute("data-component")), '"삭제" 는 버튼 컴포넌트가 아닌 글자 동작').toBe("cabinet-edit");
    await page.mouse.move(0, 0);
    const [p] = await paints(del);
    expect(p.bg === "rgba(0, 0, 0, 0)" || p.bg === "transparent", `"삭제" 채움 없음 (${p.bg})`).toBe(true);
    expect(p.lines, '"삭제" 테두리 없음').toEqual([]);
    expect(using(await colorUses(del), PINK_RGB), '"삭제" 에 핑크 없음').toEqual([]);
    expect(await del.evaluate((el) => getComputedStyle(el).color), '"삭제" 글자색 = 프레임').toBe(
      hexToRgb(DELETE_LABEL_FILL),
    );
    const r = await box(rename, "이름 바꾸기");
    const d = await box(del, "삭제");
    expect(d.x, '"삭제" 는 "이름 바꾸기" 오른쪽').toBeGreaterThan(r.x + r.width - 1);
    // 1.15: "이름 바꾸기" 옆 qr-print "QR 인쇄" (button-outline 모양), "삭제" 는 그 오른쪽
    const qr = edit.locator(sel("qr-print"));
    await expect(qr, "관리 줄 qr-print").toHaveCount(1);
    await expect(qr.locator(sel("button-outline")), `qr-print 안 button-outline "${QR_PRINT_LABEL}"`).toHaveText(exact(QR_PRINT_LABEL));
    const q = await box(qr.locator(sel("button-outline")), "QR 인쇄");
    expect(q.x, '"QR 인쇄" 는 "이름 바꾸기" 오른쪽').toBeGreaterThan(r.x + r.width - 1);
    expect(d.x, '"삭제" 는 "QR 인쇄" 오른쪽').toBeGreaterThan(q.x + q.width - 1);
    expect(q.height, `"QR 인쇄" 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    expect(d.height, `"삭제" 누름 영역 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    expect(r.height, `"이름 바꾸기" 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    // 저장: cabinet-edit 안 button-primary 1개, 편집 블록 맨 아래
    const save = edit.locator(sel("button-primary"));
    await expect(save, "cabinet-edit 안 button-primary").toHaveCount(FRAME_MAIN_COUNTS["button-primary"]);
    await expect(save).toHaveText(exact(SAVE_LABEL));
    await expect(save).toBeEnabled();
    const s = await box(save, "저장");
    expect(s.height, `"저장" 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    const mix = await box(edit.locator(sel("mix-warning")), "mix-warning");
    expect(s.y, '"저장" 은 mix-warning 아래').toBeGreaterThanOrEqual(mix.y + mix.height);
    // 편집 영역 안 구성 = 시안 11-desktop 편집 카드(관리 줄 · 문 형태 · 단 수 · 선택 칸 칩 · 주의사항 · 저장)
    expect([...EDIT_INSIDE].sort(), "11-desktop cabinet-edit 안 컴포넌트").toEqual(
      ["button-outline", "qr-print", "cabinet-door-select", "cabinet-shelf-select", "storage-class-chip", "mix-warning", "button-primary"].sort(),
    );
    for (const n of EDIT_INSIDE) expect(await edit.locator(sel(n)).count(), `cabinet-edit 안 ${n}`).toBeGreaterThanOrEqual(1);
  });

  test(`[K1][S${SCREEN}] "${SAVE_LABEL}" 을 누르면 ex-toast "${TOAST_SAVED}"`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    await expect(toast(sec, TOAST_SAVED)).toHaveCount(0);
    await sec.locator(sel("cabinet-edit")).locator(sel("button-primary")).click();
    await expect(toast(sec, TOAST_SAVED)).toBeVisible();
  });

  for (const [component, spec] of [
    ["cabinet-door-select", DOOR],
    ["cabinet-shelf-select", SHELF],
  ] as const) {
    test(`[K1][S${SCREEN}] ${component}: "${spec.label}" radiogroup, 옵션 ${spec.options.join(" / ")}, 처음 "${spec.selected}" 만 선택(연하늘 + 하늘색 테두리), 한 번에 하나`, async ({ page }) => {
      await open(page);
      const sec = await area(page, "default");
      const comp = sec.locator(sel(component));
      await expect(comp).toHaveCount(1);
      await expect(comp.getByText(spec.label, { exact: true }), `라벨 "${spec.label}"`).toBeVisible();
      const group = comp.getByRole("radiogroup");
      await expect(group, "radiogroup").toHaveCount(1);
      await expect(group, "radiogroup 이름").toHaveAccessibleName(spec.label);
      const rs = radios(sec, component);
      await expect(rs, "옵션 수").toHaveCount(spec.options.length);
      for (let i = 0; i < spec.options.length; i++) {
        await expect(rs.nth(i), `${i + 1}번째 옵션 이름`).toHaveAccessibleName(spec.options[i]);
        await expect(rs.nth(i)).toBeEnabled();
      }
      const check = async (selected: string) => {
        await expect(group.getByRole("radio", { checked: true }), "선택은 하나").toHaveCount(1);
        await expect(group.getByRole("radio", { name: selected, exact: true }), `"${selected}" 선택`).toBeChecked();
        for (const o of spec.options) {
          const option = group.locator("label").filter({ hasText: exact(o) });
          await expect(option, `"${o}" 옵션 라벨`).toHaveCount(1);
          if (o === selected) {
            await expect.poll(async () => (await groupPaint(option)).bgs, { message: `선택 옵션 "${o}" 바탕` }).toContain(SOFT);
            expect((await groupPaint(option)).lines, `선택 옵션 "${o}" 테두리`).toContain(LINE);
          } else {
            await expect
              .poll(async () => {
                const p = await groupPaint(option);
                return [...p.bgs, ...p.lines].filter((c) => HIGHLIGHT_RGB.includes(c));
              }, { message: `미선택 옵션 "${o}" 에 하늘색 없음` })
              .toEqual([]);
          }
        }
      };
      await check(spec.selected);
      const other = spec.options.find((o) => o !== spec.selected)!;
      await pickRadio(sec, component, other);
      await page.mouse.move(0, 0);
      await check(other);
      // 키보드: 방향키로 선택이 옮겨 간다
      await group.getByRole("radio", { name: other, exact: true }).focus();
      await page.keyboard.press(spec.options.indexOf(other) === 0 ? "ArrowRight" : "ArrowLeft");
      await page.mouse.move(0, 0);
      await check(spec.selected);
    });
  }

  test(`[K1][S${SCREEN}] cabinet-slot 배치도: ${FRAME_SLOTS.length}칸 같은 크기 격자, 칸 라벨 = 시안, 위 문 라벨 좌/우, 왼쪽 단 라벨 1~${SHELF.selected}`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    await expect(slots(sec)).toHaveCount(FRAME_SLOTS.length);
    expect(await slotTexts(sec), "칸 라벨 (위 단부터, 좌 → 우)").toEqual(FRAME_SLOTS.map((s) => s.label));
    const shelves = parseInt(SHELF.selected, 10);
    const boxes = [] as { x: number; y: number; width: number; height: number }[];
    for (let i = 0; i < FRAME_SLOTS.length; i++) boxes.push(await box(slots(sec).nth(i), `${i + 1}번째 칸`));
    for (let i = 0; i < boxes.length; i++) {
      expect(Math.abs(boxes[i].width - boxes[0].width), `${i + 1}번째 칸 폭 = 첫 칸 폭`).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes[i].height - boxes[0].height), `${i + 1}번째 칸 높이 = 첫 칸 높이`).toBeLessThanOrEqual(1);
    }
    for (let r = 0; r < shelves; r++) {
      const l = boxes[r * 2];
      const rgt = boxes[r * 2 + 1];
      expect(Math.abs(l.y - rgt.y), `${r + 1}단 좌·우 칸은 같은 줄`).toBeLessThanOrEqual(1);
      expect(rgt.x, `${r + 1}단 우 칸은 좌 칸 오른쪽 (가운데 통로)`).toBeGreaterThan(l.x + l.width);
      if (r > 0) expect(l.y, `${r + 1}단은 ${r}단 아래`).toBeGreaterThanOrEqual(boxes[(r - 1) * 2].y + boxes[(r - 1) * 2].height);
    }
    // 라벨: 배치도 묶음(모든 칸의 가장 가까운 공통 조상) 안의 글자 위치로 확인
    const labels = await slots(sec).evaluateAll((els) => {
      let rootEl: Element | null = els[0].parentElement;
      while (rootEl && !els.every((e) => rootEl!.contains(e))) rootEl = rootEl.parentElement;
      const out: { text: string; x: number; y: number; cx: number; cy: number }[] = [];
      for (const e of Array.from(rootEl!.querySelectorAll("*"))) {
        if (e.closest('[data-component="cabinet-slot"]') || e.children.length > 0) continue;
        const text = (e.textContent ?? "").trim();
        if (!text) continue;
        const b = e.getBoundingClientRect();
        out.push({ text, x: b.x, y: b.y, cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
      }
      return out;
    });
    const fresh = [] as { x: number; y: number; width: number; height: number }[];
    for (let i = 0; i < FRAME_SLOTS.length; i++) fresh.push((await slots(sec).nth(i).boundingBox())!);
    expect(labels.map((l) => l.text).filter((t) => /^\d+단$/.test(t)), "단 라벨").toEqual(Array.from({ length: shelves }, (_, i) => `${i + 1}단`));
    expect(labels.map((l) => l.text).filter((t) => t === "좌" || t === "우"), "문 라벨").toEqual(["좌", "우"]);
    for (let r = 0; r < shelves; r++) {
      const lab = labels.find((l) => l.text === `${r + 1}단`)!;
      const s = fresh[r * 2];
      expect(lab.cy, `"${r + 1}단" 라벨은 ${r + 1}단 칸과 같은 높이`).toBeGreaterThan(s.y);
      expect(lab.cy).toBeLessThan(s.y + s.height);
      expect(lab.cx, `"${r + 1}단" 라벨은 칸 왼쪽`).toBeLessThan(s.x);
    }
    for (const [text, col] of [["좌", 0], ["우", 1]] as const) {
      const lab = labels.find((l) => l.text === text)!;
      const s = fresh[col];
      expect(lab.cx, `"${text}" 라벨은 ${text} 열 위`).toBeGreaterThan(s.x);
      expect(lab.cx).toBeLessThan(s.x + s.width);
      expect(lab.y, `"${text}" 라벨은 첫 단 위`).toBeLessThan(s.y);
    }
  });

  test(`[K1][S${SCREEN}] cabinet-slot: 칸은 누를 수 있는 버튼, 처음 "${slotNameAt(FRAME_SLOTS.indexOf(SELECTED_SLOT), DOOR.selected)}" 만 선택 표시, 경고 아이콘은 "${SELECTED_SLOT.label}" 칸에만(핑크 아님)`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    await page.mouse.move(0, 0);
    await expectSelectedSlot(sec, FRAME_SLOTS.indexOf(SELECTED_SLOT));
    for (let i = 0; i < FRAME_SLOTS.length; i++) {
      const s = slots(sec).nth(i);
      expect(await s.evaluate((el) => el.matches("button,[role=button]") || el.querySelector("button,[role=button]") !== null), `${i + 1}번째 칸은 버튼`).toBe(true);
      expect(await s.locator("svg").count(), `${i + 1}번째 칸 경고 아이콘 (${FRAME_SLOTS[i].label})`).toBe(FRAME_SLOTS[i].warning ? 1 : 0);
      expect(using(await colorUses(s), PINK_RGB), `${i + 1}번째 칸에 핑크 없음`).toEqual([]);
    }
    // 경고 아이콘 색 = 프레임(#141414), 칸 오른쪽 위
    const warned = slots(sec).nth(FRAME_SLOTS.findIndex((s) => s.warning));
    const iconColor = mainNodes.find((n) => n.path.includes("cabinet-slot") && n.path.includes("icon-warning") && n.type === "VECTOR")!;
    const want = hexToRgb([...iconColor.strokes, ...iconColor.fills][0]);
    const svgUses = (await colorUses(warned.locator("svg"))).flatMap((u) => u.colors);
    expect(svgUses, "칸 경고 아이콘 색").toContain(want);
    // 1.15 시안: 칸 = 가로 한 줄(분류 글자 · 오른쪽 slot-meta[경고 아이콘 → slot-count]), 세로 가운데
    const sb = await box(warned, "경고 칸");
    const ib = await box(warned.locator("svg"), "경고 아이콘");
    expect(ib.x + ib.width / 2, "아이콘은 칸 오른쪽 절반").toBeGreaterThan(sb.x + sb.width / 2);
    expect(ib.y, "아이콘은 칸 안 (위)").toBeGreaterThanOrEqual(sb.y);
    expect(ib.y + ib.height, "아이콘은 칸 안 (아래)").toBeLessThanOrEqual(sb.y + sb.height);
    const cb = await box(warned.locator(sel("slot-count")), "slot-count");
    expect(cb.x, "slot-count 는 경고 아이콘 오른쪽").toBeGreaterThanOrEqual(ib.x + ib.width);
    expect(Math.abs(cb.y + cb.height / 2 - (ib.y + ib.height / 2)), "경고 아이콘과 slot-count 는 같은 줄").toBeLessThanOrEqual(cb.height / 2);
  });

  test(`[K1][S${SCREEN}] 칸 선택: 누른 칸만 선택 표시, 칩 묶음 제목 "{칸} 보관 분류" 와 선택된 칩이 그 칸으로 바뀐다`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    await expect(sec.getByRole("heading", { name: PICKER_TITLE, exact: true }), `처음 제목 "${PICKER_TITLE}"`).toHaveCount(1);
    await expect(sec.getByText(PICKER_HINT, { exact: true }), `안내 "${PICKER_HINT}"`).toBeVisible();
    expect(await pressedChips(sec), "처음 선택된 칩").toEqual(FRAME_CHIPS.filter((c) => HIGHLIGHTS.includes(c.fill)).map((c) => c.label));
    for (const i of [3, 6, 1, 0]) {
      await selectSlot(page, sec, i);
      const name = slotNameAt(i, DOOR.selected);
      await expect(sec.getByRole("heading", { name: pickerTitle(name), exact: true }), `제목 "${pickerTitle(name)}"`).toHaveCount(1);
      await expect(sec.getByRole("heading", { name: /보관 분류$/ }), "칩 묶음 제목은 하나").toHaveCount(1);
      expect(await pressedChips(sec), `${name} 의 선택된 칩 = 칸 라벨`).toEqual(FRAME_SLOTS[i].label.split(" · "));
    }
    expect(await slotTexts(sec), "칸을 고르기만 해서는 라벨이 바뀌지 않는다").toEqual(FRAME_SLOTS.map((s) => s.label));
  });

  test(`[K1][S${SCREEN}] storage-class-chip: 고르는 칩 8종이 rules 순서(${cab.storage_classes.join("·")}), 두 줄, 선택 = 연하늘 + 하늘색 테두리`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    await expect(chips(sec), "고르는 칩(버튼) 수").toHaveCount(cab.storage_classes.length);
    expect((await chips(sec).allInnerTexts()).map(squash), "칩 순서").toEqual(cab.storage_classes);
    const ys = [] as number[];
    for (let i = 0; i < cab.storage_classes.length; i++) {
      const c = chips(sec).nth(i);
      await expect(c).toBeEnabled();
      ys.push(Math.round((await box(c, cab.storage_classes[i])).y));
    }
    expect(new Set(ys).size, "칩은 두 줄").toBe(2);
    await page.mouse.move(0, 0);
    const want = FRAME_CHIPS.map((c) => HIGHLIGHTS.includes(c.fill));
    await expect.poll(async () => (await paints(chips(sec))).map(isSelectedPaint), { message: "선택 표시 = 시안(산·염기)" }).toEqual(want);
    const p = await paints(chips(sec));
    expect(p.filter((x, i) => !want[i] && hasHighlight(x)).length, "선택 안 된 칩에 하늘색 없음").toBe(0);
    for (let i = 0; i < want.length; i++) {
      await expect(chips(sec).nth(i), `${cab.storage_classes[i]} aria-pressed`).toHaveAttribute("aria-pressed", String(want[i]));
    }
    // 글자색은 하늘색이 아니다 (rules highlight.no_text)
    const colors = await chips(sec).evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
    for (const c of colors) expect(HIGHLIGHT_RGB, "칩 글자색").not.toContain(c);
  });

  test(`[K1][S${SCREEN}] storage-class-chip 다중 선택: 칩을 켜고 끄면 칸 라벨이 바로 바뀐다 ("산 · 염기" ↔ "산" ↔ "${UNSET}")`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const i = FRAME_SLOTS.indexOf(SELECTED_SLOT);
    const s = slots(sec).nth(i);
    await expectSlotLabel(s, "산 · 염기");
    await chip(sec, "염기").click();
    await expectSlotLabel(s, "산", "염기를 끄면");
    await expect(chip(sec, "염기")).toHaveAttribute("aria-pressed", "false");
    await expect(chip(sec, "산")).toHaveAttribute("aria-pressed", "true");
    await chip(sec, "산").click();
    await expectSlotLabel(s, UNSET, "모두 끄면 미지정");
    expect(await pressedChips(sec)).toEqual([]);
    // 누른 순서와 무관하게 rules 순서로 적힌다
    await chip(sec, "기타").click();
    await chip(sec, "염기").click();
    await chip(sec, "산").click();
    await expectSlotLabel(s, "산 · 염기 · 기타", "세 개 선택");
    expect(await pressedChips(sec)).toEqual(["산", "염기", "기타"]);
    await page.mouse.move(0, 0);
    await expect
      .poll(async () => (await paints(chips(sec))).map(isSelectedPaint), { message: "선택 표시 3개" })
      .toEqual(cab.storage_classes.map((c) => ["산", "염기", "기타"].includes(c)));
    // 다른 칸 라벨은 그대로
    const all = await slotTexts(sec);
    expect(all.filter((_, k) => k !== i), "다른 칸 라벨").toEqual(FRAME_SLOTS.filter((_, k) => k !== i).map((x) => x.label));
    // 8종 모두 켤 수 있다
    await setClasses(sec, cab.storage_classes);
    await expectSlotLabel(s, cab.storage_classes.join(" · "));
  });

  test(`[K1][S${SCREEN}] mix-warning: 처음 1개 "${MIX.title}" + "${MIX.lines[0]}", 연핑크 바탕·테두리 없음, 진한 핑크는 경고 아이콘만, 하늘색 없음`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const mix = sec.locator(sel("mix-warning"));
    await expect(mix).toHaveCount(1);
    await expect(mix.getByRole("heading", { name: MIX.title, exact: true }), `제목 "${MIX.title}"`).toHaveCount(1);
    expect(await mixLines(sec), "경고 줄").toEqual(MIX.lines);
    const [p] = await paints(mix);
    expect(p.bg, "바탕 = rules accent_soft").toBe(hexToRgb(MIX.fill));
    expect(p.lines, "테두리 없음").toEqual([]);
    const uses = await colorUses(mix);
    const accent = using(uses, [hexToRgb(ACCENT)]);
    expect(accent.length, "진한 핑크를 쓰는 요소(아이콘)가 있다").toBeGreaterThan(0);
    expect(accent.filter((u) => !u.inSvg).map((u) => u.where), "진한 핑크는 아이콘(svg)에만 — 글자·채움 금지").toEqual([]);
    expect(using(uses, [hexToRgb(ACCENT_SOFT)]), "연핑크는 바탕(mix-warning 자신) 하나에만").toEqual([uses[0]]);
    expect(using(uses, HIGHLIGHT_RGB).map((u) => u.where), "mix-warning 안 하늘색 없음").toEqual([]);
    expect(await mix.getByRole("heading", { name: MIX.title, exact: true }).evaluate((el) => getComputedStyle(el).color), "제목 글자색").toBe(hexToRgb(MIX.titleColor));
    expect(await mix.getByText(MIX.lines[0], { exact: true }).evaluate((el) => getComputedStyle(el).color), "경고 글자색").toBe(hexToRgb(MIX.textColor));
    expect(await mix.locator("svg").count(), "줄마다 경고 아이콘").toBe(MIX.lines.length);
    // 칩 묶음과 저장 버튼 사이
    const m = await box(mix, "mix-warning");
    const lastChip = await box(chips(sec).last(), "마지막 칩");
    expect(m.y, "mix-warning 은 칩 묶음 아래").toBeGreaterThanOrEqual(lastChip.y + lastChip.height);
  });

  test(`[K1][S${SCREEN}] mix-warning: rules incompatible ${cab.incompatible.length}쌍을 한 칸에 고르면 각각 경고 1줄(문구·조사) + 칸 경고 아이콘, 해제하면 사라진다`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const i = FRAME_SLOTS.indexOf(SELECTED_SLOT);
    const name = slotNameAt(i, DOOR.selected);
    const s = slots(sec).nth(i);
    await setClasses(sec, []);
    await expect(sec.locator(sel("mix-warning")), "비호환 조합이 없으면 mix-warning 0개").toHaveCount(0);
    await expect(s.locator("svg"), "칸 경고 아이콘 없음").toHaveCount(0);
    for (const [a, b] of cab.incompatible) {
      // 한쪽만 고르면 경고 없음
      await chip(sec, b).click();
      await expectSlotLabel(s, b);
      await expect(sec.locator(sel("mix-warning")), `${b} 만`).toHaveCount(0);
      await chip(sec, a).click();
      await expect(sec.locator(sel("mix-warning")), `${a} + ${b}`).toHaveCount(1);
      await expect.poll(() => mixLines(sec), { message: `${a} + ${b} 경고 문구` }).toEqual([warningText(name, a, b)]);
      await expectSlotLabel(s, classOrder([a, b]).join(" · "), "칸 라벨");
      await expect(s.locator("svg"), "칸 경고 아이콘").toHaveCount(1);
      await chip(sec, a).click();
      await expect(sec.locator(sel("mix-warning")), `${a} 해제 뒤`).toHaveCount(0);
      await expect(s.locator("svg"), "해제 뒤 칸 경고 아이콘 없음").toHaveCount(0);
      await chip(sec, b).click();
      await expectSlotLabel(s, UNSET);
    }
  });

  test(`[K1][S${SCREEN}] mix-warning: 호환 조합은 경고 없음, 한 칸 3분류·여러 칸이면 해당 쌍마다 한 줄씩`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const first = FRAME_SLOTS.indexOf(SELECTED_SLOT);
    const firstName = slotNameAt(first, DOOR.selected);
    // 호환: 산 + 무기염, 유기 + 인화성
    await setClasses(sec, ["산", "무기염"]);
    await expect(sec.locator(sel("mix-warning")), "산 + 무기염").toHaveCount(0);
    await setClasses(sec, ["유기", "인화성", "기타"]);
    await expect(sec.locator(sel("mix-warning")), "유기 + 인화성 + 기타").toHaveCount(0);
    // 3분류: 산 + 염기 + 인화성 → 산·염기, 산·인화성
    await setClasses(sec, ["산", "염기", "인화성"]);
    await expect(sec.locator(sel("mix-warning")), "mix-warning 은 하나(줄만 늘어난다)").toHaveCount(1);
    await expect
      .poll(async () => (await mixLines(sec)).sort(), { message: "3분류 경고 줄" })
      .toEqual([warningText(firstName, "산", "염기"), warningText(firstName, "산", "인화성")].sort());
    // 다른 칸에도 비호환 조합 → 칸 이름이 다른 줄이 더해진다
    const other = 5; // 우3단 (양문형 여섯 번째 칸)
    const otherName = slotNameAt(other, DOOR.selected);
    await selectSlot(page, sec, other);
    await setClasses(sec, ["산화제", "유기"]);
    await expect(sec.locator(sel("mix-warning"))).toHaveCount(1);
    await expect
      .poll(async () => (await mixLines(sec)).sort(), { message: "두 칸 경고 줄" })
      .toEqual([warningText(firstName, "산", "염기"), warningText(firstName, "산", "인화성"), warningText(otherName, "산화제", "유기")].sort());
    await expect(slots(sec).nth(first).locator("svg"), `${firstName} 경고 아이콘`).toHaveCount(1);
    await expect(slots(sec).nth(other).locator("svg"), `${otherName} 경고 아이콘`).toHaveCount(1);
    expect(await sec.locator(`${sel("cabinet-slot")}:has(svg)`).count(), "경고 아이콘이 있는 칸은 둘").toBe(2);
    expect(await sec.locator(sel("mix-warning")).locator("svg").count(), "줄마다 아이콘").toBe(3);
    // 경고가 있어도 저장은 막지 않는다 (d7 §9)
    await expect(sec.locator(sel("cabinet-edit")).locator(sel("button-primary"))).toBeEnabled();
  });

  test(`[K1][S${SCREEN}] 문 형태·단 수를 바꾸면 배치도가 즉시 바뀐다: ${DOUBLE} ${MAX_SHELVES}단 ${columns(DOUBLE) * MAX_SHELVES}칸 → ${SINGLE} ${MAX_SHELVES}칸 → ${MIN_SHELVES}단 ${MIN_SHELVES}칸 → ${DOUBLE} ${columns(DOUBLE) * MIN_SHELVES}칸`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    await expect(slots(sec)).toHaveCount(columns(DOUBLE) * MAX_SHELVES);
    await pickRadio(sec, "cabinet-door-select", SINGLE);
    await expect(slots(sec), `${SINGLE} ${MAX_SHELVES}단`).toHaveCount(MAX_SHELVES);
    // 단문형 = 1열: 모든 칸의 x 가 같다
    const xs = [] as number[];
    for (let i = 0; i < MAX_SHELVES; i++) xs.push(Math.round((await box(slots(sec).nth(i), `${i + 1}번째 칸`)).x));
    expect(new Set(xs).size, `${SINGLE} 은 1열`).toBe(1);
    // 단문형 칸 이름은 문 구분 없이 "N단"
    await selectSlot(page, sec, 1);
    await expect(sec.getByRole("heading", { name: pickerTitle(slotNameAt(1, SINGLE)), exact: true }), `제목 "${pickerTitle(slotNameAt(1, SINGLE))}"`).toHaveCount(1);
    await expect(sec.getByRole("heading", { name: /^[좌우]\d+단 보관 분류$/ }), "단문형 제목에 좌/우 없음").toHaveCount(0);
    await pickRadio(sec, "cabinet-shelf-select", `${MIN_SHELVES}단`);
    await expect(slots(sec), `${SINGLE} ${MIN_SHELVES}단`).toHaveCount(MIN_SHELVES);
    await pickRadio(sec, "cabinet-door-select", DOUBLE);
    await expect(slots(sec), `${DOUBLE} ${MIN_SHELVES}단`).toHaveCount(columns(DOUBLE) * MIN_SHELVES);
    await pickRadio(sec, "cabinet-shelf-select", `${MAX_SHELVES}단`);
    await expect(slots(sec), `${DOUBLE} ${MAX_SHELVES}단`).toHaveCount(columns(DOUBLE) * MAX_SHELVES);
    // 저장 전에는 분류를 잃지 않는다: 되돌리면 칸 라벨이 처음과 같다
    expect(await slotTexts(sec), "되돌린 뒤 칸 라벨").toEqual(FRAME_SLOTS.map((s) => s.label));
  });

  test(`[K1][S${SCREEN}] 단문형으로 줄이면 단문형 경고 문구는 "1단: …" 꼴, 사라진 칸의 경고는 보이지 않는다`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    // 우1단(두 번째 칸)에도 비호환 조합을 만든다
    await selectSlot(page, sec, 1);
    await setClasses(sec, ["산화제", "인화성"]);
    await expect.poll(async () => (await mixLines(sec)).length, { message: "양문형에서 경고 2줄" }).toBe(2);
    await pickRadio(sec, "cabinet-door-select", SINGLE);
    await expect(slots(sec)).toHaveCount(MAX_SHELVES);
    await expect.poll(() => mixLines(sec), { message: "단문형 경고 줄" }).toEqual([warningText(slotNameAt(0, SINGLE), "산", "염기")]);
  });

  test(`[K1][S${SCREEN}] 범례: "${LEGEND.join('" · "')}" (칩 모양은 보기 전용 storage-class-chip)`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const legendChips = sec.locator(`${sel("storage-class-chip")}:not(button)`);
    expect((await legendChips.allInnerTexts()).map(squash), "보기 전용 칩").toEqual(LEGEND.slice(0, 2));
    for (let i = 0; i < 2; i++) {
      expect(await legendChips.nth(i).evaluate((el) => el.matches("button,a,[role=button],[tabindex]") || el.querySelector("button,a,[role=button]") !== null), `범례 "${LEGEND[i]}" 는 누를 수 없다`).toBe(false);
    }
    const lp = await paints(legendChips);
    expect(hasHighlight(lp[0]), `"${LEGEND[0]}" 범례 칩에 하늘색 없음`).toBe(false);
    expect(isSelectedPaint(lp[1]), `"${LEGEND[1]}" 범례 칩 = 선택 표시(연하늘 + 하늘색 테두리)`).toBe(true);
    const warn = sec.getByText(LEGEND[2], { exact: true });
    await expect(warn, `"${LEGEND[2]}"`).toHaveCount(1);
    await expect(warn).toBeVisible();
    // 범례는 배치도 아래, 칩 묶음 위
    const lastSlot = await box(slots(sec).last(), "마지막 칸");
    const lg = await box(legendChips.first(), "범례");
    const firstChip = await box(chips(sec).first(), "첫 칩");
    expect(lg.y, "범례는 배치도 아래").toBeGreaterThanOrEqual(lastSlot.y + lastSlot.height);
    if (isMobile(page)) {
      // 시안 11-mobile: 배치도 → 범례 → 칩 묶음
      expect(lg.y, "범례는 칩 묶음 위").toBeLessThan(firstChip.y);
    } else {
      // 시안 11-desktop: 범례는 왼쪽 열, 칩 묶음은 오른쪽 편집 카드
      const ed = await box(sec.locator(sel("cabinet-edit")), "cabinet-edit");
      expect(lg.x + lg.width, "범례는 편집 카드 왼쪽").toBeLessThanOrEqual(ed.x);
      expect(firstChip.x, "칩 묶음은 편집 카드 안").toBeGreaterThanOrEqual(ed.x);
    }
  });

  test(`[K1][S${SCREEN}] "${UNASSIGNED_TITLE}": N = reagent-row 수, 행마다 시약명·재고 + caption "${cab.unassigned_label}", 시약 상세로 가는 링크`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const title = sec.getByRole("heading", { name: new RegExp(`^${esc(cab.unassigned_label)} 시약 \\(\\d+\\)$`) });
    await expect(title, '"칸 없음 시약 (N)" 제목').toHaveCount(1);
    const n = Number(/\((\d+)\)/.exec(await title.innerText())![1]);
    const rows = sec.locator(sel("reagent-row"));
    await expect(rows, "행 수 = 제목의 N").toHaveCount(n);
    expect(n, "N = 프레임 행 수").toBe(UNASSIGNED_ROWS.length);
    for (let i = 0; i < UNASSIGNED_ROWS.length; i++) {
      const r = UNASSIGNED_ROWS[i];
      const row = rows.nth(i);
      await expect(row.getByText(r.name, { exact: true }), `${i + 1}행 시약명`).toBeVisible();
      await expect(row.getByText(r.stock, { exact: true }), `${i + 1}행 재고`).toBeVisible();
      const cap = row.getByText(r.caption, { exact: true });
      await expect(cap, `${i + 1}행 caption "${r.caption}"`).toHaveCount(1);
      await expect(cap).toBeVisible();
      expect(await cap.evaluate((el) => getComputedStyle(el).color), `"${r.caption}" 글자색 = 프레임`).toBe(
        hexToRgb(UNASSIGNED_CAPTION_FILL),
      );
      const nameBox = await box(row.getByText(r.name, { exact: true }), "시약명");
      const capBox = await box(cap, "칸 없음");
      expect(capBox.x, '"칸 없음" 은 시약명 오른쪽').toBeGreaterThan(nameBox.x);
      expect(using(await colorUses(row), PINK_RGB), `${i + 1}행에 핑크 없음`).toEqual([]);
      const href = await row.evaluate((el) => (el.matches("a[href]") ? el : el.querySelector("a[href]"))?.getAttribute("href") ?? "");
      expect(href, `${i + 1}행은 시약 상세 링크`).toMatch(/^\/reagents\/[^/]+$/);
    }
    const mix = await box(sec.locator(sel("mix-warning")), "mix-warning");
    const t = await box(title, "칸 없음 제목");
    if (isMobile(page)) {
      // 시안 11-mobile: 주의사항 아래
      expect(t.y, '"칸 없음 시약" 은 주의사항 아래').toBeGreaterThanOrEqual(mix.y + mix.height);
    } else {
      // 시안 11-desktop: 왼쪽 열(배치도 아래), 오른쪽 편집 카드 왼쪽
      const ed = await box(sec.locator(sel("cabinet-edit")), "cabinet-edit");
      const last = await box(slots(sec).last(), "마지막 칸");
      expect(t.x + t.width, '"칸 없음 시약" 은 편집 카드 왼쪽').toBeLessThanOrEqual(ed.x);
      expect(t.y, '"칸 없음 시약" 은 배치도 아래').toBeGreaterThanOrEqual(last.y + last.height);
    }
  });

  test(`[K1][S${SCREEN}] 이름 바꾸기: "${RENAME_LABEL}" → 이름 시트(현재 이름) → 저장하면 pill·제목이 바뀌고 ex-toast "${TOAST_RENAMED}", 취소하면 그대로`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const edit = sec.locator(sel("cabinet-edit"));
    const rename = edit.locator(sel("button-outline")).filter({ hasText: exact(RENAME_LABEL) });
    await expect(sec.locator(sel("ex-modal-card"))).toHaveCount(0);
    await rename.click();
    const sheet = sec.locator(sel("ex-modal-card"));
    await expect(sheet, "이름 시트").toHaveCount(1);
    await expect(sheet.getByRole("heading", { name: RENAME_TITLE, exact: true })).toHaveCount(1);
    const input = sheet.locator(sel("text-input")).locator("input");
    await expect(input, "현재 이름이 들어 있다").toHaveValue(TITLE);
    // 취소 → 닫히고 그대로
    await input.fill("바꾸다 만 이름");
    await sheet.locator(sel("button-outline")).filter({ hasText: exact(RENAME_CANCEL) }).click();
    await expect(sec.locator(sel("ex-modal-card")), "취소하면 닫힌다").toHaveCount(0);
    await expect(sec.getByRole("heading", { name: TITLE, exact: true })).toHaveCount(1);
    expect(await pillNames(sec)).toEqual(PILLS);
    // 저장 (앞뒤 공백은 뗀다)
    await rename.click();
    await expect(input, "다시 열면 현재 이름").toHaveValue(TITLE);
    const next = "화학 준비실 A";
    await input.fill(`  ${next} `);
    await sheet.locator(sel("button-primary")).filter({ hasText: exact(RENAME_SAVE) }).click();
    await expect(sec.locator(sel("ex-modal-card")), "저장하면 닫힌다").toHaveCount(0);
    await expect(sec.getByRole("heading", { name: next, exact: true }), "제목이 바뀐다").toHaveCount(1);
    expect(await pillNames(sec), "pill 이름이 바뀐다").toEqual(PILLS.map((p) => (p === TITLE ? next : p)));
    expect(await pillNumbers(sec), "이름을 바꿔도 번호는 그대로 (rules cabinet.number)").toEqual(PILL_NUMBERS.map((n) => [n]));
    await expect(toast(sec, TOAST_RENAMED)).toBeVisible();
    await expect(slots(sec), "배치도는 그대로").toHaveCount(FRAME_SLOTS.length);
  });

  test(`[K1][S${SCREEN}] 삭제: "${DELETE_LABEL}" → 확인 카드(뒤 관리 줄은 눌리지 않음) → 취소하면 그대로, "${DEL.confirm}" 하면 pill 이 빠지고 남은 시약장이 활성 + ex-toast`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "default");
    const target = DEL.activePill;
    await pill(sec, target).click();
    await expect(sec.getByRole("heading", { name: target, exact: true })).toHaveCount(1);
    const edit = sec.locator(sel("cabinet-edit"));
    const del = edit.getByRole("button", { name: DELETE_LABEL, exact: true });
    await del.click();
    const card = sec.locator(sel("ex-modal-card"));
    await expect(card, "확인 카드").toHaveCount(1);
    await expect(card.getByRole("heading", { name: DEL.title, exact: true })).toHaveCount(1);
    await expect(card.getByText(DEL.body, { exact: true })).toBeVisible();
    // 카드가 열린 동안 뒤 관리 줄은 눌리지 않는다
    await expect(edit.locator(sel("button-outline")).filter({ hasText: exact(RENAME_LABEL) }), `카드가 열린 동안 "${RENAME_LABEL}"`).toBeDisabled();
    // switcher 는 그대로 보여 어떤 시약장을 지우는지 알 수 있다
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await paints(pills(sec))).map(isSelectedPaint), { message: "지울 시약장이 활성" }).toEqual(PILLS.map((p) => p === target));
    await card.locator(sel("button-outline")).filter({ hasText: exact(DEL.cancel) }).click();
    await expect(sec.locator(sel("ex-modal-card")), "취소하면 닫힌다").toHaveCount(0);
    await expect(pills(sec), "취소하면 그대로").toHaveCount(PILLS.length);
    await del.click();
    await card.locator(sel("button-primary")).filter({ hasText: exact(DEL.confirm) }).click();
    await expect(sec.locator(sel("ex-modal-card"))).toHaveCount(0);
    const rest = PILLS.filter((p) => p !== target);
    await expect(pills(sec), "pill 이 하나 빠진다").toHaveCount(rest.length);
    expect(await pillNames(sec)).toEqual(rest);
    expect(await pillNumbers(sec), "남은 pill 번호는 그대로 (삭제된 번호를 다시 쓰지 않는다)").toEqual(rest.map((p) => [PILL_NUMBERS[PILLS.indexOf(p)]]));
    await expect(sec.getByRole("heading", { name: rest[0], exact: true }), "남은 시약장이 활성").toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await paints(pills(sec))).map(isSelectedPaint), { message: "남은 pill 활성" }).toEqual(rest.map((_, i) => i === 0));
    await expect(toast(sec, toastDeleted(target)), `ex-toast "${toastDeleted(target)}"`).toBeVisible();
    // 칸 없음 시약 목록은 지워지지 않는다
    await expect(sec.locator(sel("reagent-row")).first()).toBeVisible();
  });
});

// ---------- 학생 (보기 전용) ----------
test.describe("학생 예시 (보기 전용)", () => {
  const R7 = rules.roles.R7;

  test(`[K1][S${SCREEN}] 학생: ${R7.components.join("·")} = ${R7.max}개 (rules roles.R7), 문 형태·단 수 선택·고르는 칩·저장·버튼 없음`, async ({ page }) => {
    expect(R7.role, "R7 대상 역할").toBe("학생");
    await open(page);
    const sec = await area(page, "student");
    for (const n of R7.components) await expect(sec.locator(sel(n)), `학생 ${n}`).toHaveCount(R7.max);
    for (const n of ["cabinet-door-select", "cabinet-shelf-select", "button-primary", "button-outline", "ex-modal-card", "text-input"]) {
      await expect(sec.locator(sel(n)), `학생 ${n}`).toHaveCount(0);
    }
    await expect(chips(sec), "학생에게 고르는 칩 없음").toHaveCount(0);
    await expect(sec.getByRole("radio"), "학생에게 라디오 없음").toHaveCount(0);
    for (const label of [SAVE_LABEL, RENAME_LABEL, DELETE_LABEL, ADD_LABEL, QR_PRINT_LABEL]) {
      await expect(sec.getByRole("button", { name: label, exact: true }), `학생에게 "${label}" 버튼 없음`).toHaveCount(0);
    }
    await expect(sec.getByRole("heading", { name: /보관 분류$/ }), "학생에게 칩 묶음 제목 없음").toHaveCount(0);
  });

  test(`[K1][S${SCREEN}] 학생: cabinet-switcher(pill 만)·시약장 이름·배치도 ${FRAME_SLOTS.length}칸·범례·mix-warning·칸 없음 시약은 보인다`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "student");
    await expect(sec.locator(sel("cabinet-switcher"))).toHaveCount(1);
    expect(await pillNames(sec), "pill").toEqual(PILLS);
    await expect(sec.locator(sel("cabinet-switcher")).locator(":is(button, a)"), "switcher 안에는 시약장 pill 만").toHaveCount(PILLS.length);
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await paints(pills(sec))).map(isSelectedPaint), { message: "활성 pill 하나" }).toEqual(PILLS.map((p) => p === ACTIVE_PILL));
    await expectHeader(page, sec, TITLE, DOOR.selected, parseInt(SHELF.selected, 10), HEADER_NUMBER);
    await expect(slots(sec)).toHaveCount(FRAME_SLOTS.length);
    expect(await slotTexts(sec), "칸 라벨 = 교사 화면과 같다").toEqual(FRAME_SLOTS.map((s) => s.label));
    await expect(sec.getByText(UNSET, { exact: true }).first(), `범례 "${UNSET}"`).toBeVisible();
    const mix = sec.locator(sel("mix-warning"));
    await expect(mix, "학생에게도 mix-warning").toHaveCount(1);
    expect(await mixLines(sec)).toEqual(MIX.lines);
    expect((await paints(mix))[0].bg, "mix-warning 바탕").toBe(hexToRgb(MIX.fill));
    expect(await mix.evaluate((el) => el.querySelector("button,a,input,[role=button]") !== null), "mix-warning 은 보기 전용").toBe(false);
    for (let i = 0; i < FRAME_SLOTS.length; i++) {
      expect(await slots(sec).nth(i).locator("svg").count(), `${i + 1}번째 칸 경고 아이콘`).toBe(FRAME_SLOTS[i].warning ? 1 : 0);
    }
    await expect(sec.getByRole("heading", { name: UNASSIGNED_TITLE, exact: true })).toHaveCount(1);
    await expect(sec.locator(sel("reagent-row"))).toHaveCount(UNASSIGNED_ROWS.length);
  });

  // 1.15 (s2-spec 화면 11 cabinet-slot · 상태 11-slot): 칸을 누르면 칸 시트가 열린다 — 학생은 그 칸 시약 목록 보기만(빼기·넣기 없음).
  // 학생에게는 분류 편집이 없으므로 선택 표시(선택 칸)·고르는 칩은 생기지 않는다.
  test(`[K1][S${SCREEN}] 학생: 칸을 누르면 slot-sheet(목록만 — slot-assign·"빼기" 0), 선택 표시·고르는 칩은 생기지 않는다`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "student");
    await expect(sec.locator(sel("slot-sheet")), "처음에는 칸 시트 없음").toHaveCount(0);
    expect((await paints(slots(sec))).filter(hasHighlight).length, "처음에 선택 표시 없음").toBe(0);
    const titleAt = (i: number) => `${i % 2 === 0 ? "좌" : "우"} ${Math.floor(i / 2) + 1}단`;
    for (const i of [2, 0]) {
      await slots(sec).nth(i).click();
      const sheet = sec.locator(sel("slot-sheet"));
      await expect(sheet, `${titleAt(i)} 칸 시트`).toHaveCount(1);
      await expect(sheet.getByRole("heading", { name: titleAt(i), exact: true }), `시트 제목 "${titleAt(i)}"`).toHaveCount(1);
      await expect(sheet.getByRole("heading", { name: `이 칸의 시약 (${FRAME_SLOTS[i].count})`, exact: true }), "이 칸의 시약 수 = 시안 slot-count").toHaveCount(1);
      await expect(sheet.locator(sel("reagent-row")), "목록 행 수").toHaveCount(FRAME_SLOTS[i].count);
      await expect(sheet.locator(sel("slot-assign")), "학생 slot-assign").toHaveCount(0);
      await expect(sheet.getByRole("button", { name: /빼기$/ }), '학생 "빼기"').toHaveCount(0);
      await expect(sheet.getByText("빼기", { exact: true }), '학생 "빼기" 글자').toHaveCount(0);
    }
    await page.mouse.move(0, 0);
    expect((await paints(slots(sec))).filter(hasHighlight).length, "눌러도 선택 표시 없음").toBe(0);
    await expect(chips(sec), "눌러도 고르는 칩이 생기지 않는다").toHaveCount(0);
    for (const n of rules.roles.R7.components) await expect(sec.locator(sel(n)), `칸 시트를 연 뒤에도 학생 ${n}`).toHaveCount(rules.roles.R7.max);
    expect(await slotTexts(sec)).toEqual(FRAME_SLOTS.map((s) => s.label));
  });

  test(`[K1][S${SCREEN}] 학생: pill 을 눌러 시약장을 바꿔 볼 수 있다 (보기만)`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "student");
    const other = PILLS.find((p) => p !== ACTIVE_PILL)!;
    await pill(sec, other).click();
    await expect(sec.getByRole("heading", { name: other, exact: true })).toHaveCount(1);
    await expect(slots(sec)).toHaveCount(DEL.slots);
    for (const n of rules.roles.R7.components) await expect(sec.locator(sel(n)), `전환 뒤에도 학생 ${n}`).toHaveCount(rules.roles.R7.max);
    await expect(sec.locator(sel("button-primary"))).toHaveCount(0);
  });
});

// ---------- 빈 상태 ----------
test.describe("빈 상태 예시 (시약장 0개)", () => {
  test(`[K1][S${SCREEN}] 빈 상태(교사): ex-empty-state-card 1개 — 아이콘(하늘색) → "${EMPTY.title}" → 안내 → cabinet-add 1개, switcher·배치도·cabinet-edit·mix-warning·칸 없음 목록 없음, 핑크 없음`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "empty");
    const card = sec.locator(sel("ex-empty-state-card"));
    await expect(card).toHaveCount(1);
    await expect(sec.getByText(EMPTY.pageTitle, { exact: true }), `제목 줄 "${EMPTY.pageTitle}"`).toBeVisible();
    const title = card.getByText(EMPTY.title, { exact: true });
    await expect(title, `"${EMPTY.title}"`).toHaveCount(1);
    await expect(title).toBeVisible();
    const guide = card.getByText(EMPTY.guide, { exact: true });
    await expect(guide, "안내 문구").toHaveCount(1);
    await expect(guide).toBeVisible();
    const add = card.locator(sel("cabinet-add"));
    await expect(add, "카드 안 cabinet-add").toHaveCount(1);
    await expect(sec.locator(sel("cabinet-add")), "빈 상태 cabinet-add 는 카드 안 하나뿐").toHaveCount(1);
    await expect(add).toHaveText(exact(ADD_LABEL));
    await expect(add).toBeEnabled();
    for (const n of ["cabinet-switcher", "cabinet-slot", "cabinet-edit", "mix-warning", "cabinet-door-select", "cabinet-shelf-select", "storage-class-chip", "reagent-row", "button-primary"]) {
      await expect(sec.locator(sel(n)), `빈 상태 ${n}`).toHaveCount(0);
    }
    await expect(sec.getByText(new RegExp(`${esc(cab.unassigned_label)} 시약`)), "칸 없음 시약 목록 없음").toHaveCount(0);
    // 위 → 아래: 아이콘 → 제목 → 안내 → cabinet-add, 가운데 정렬
    const icon = card.locator(`svg:not(${sel("cabinet-add")} svg)`);
    await expect(icon, "시약장 아이콘").toHaveCount(1);
    const ib = await box(icon, "아이콘");
    const tb = await box(title, "제목");
    const gb = await box(guide, "안내");
    const ab = await box(add, "cabinet-add");
    const cb = await box(card, "카드");
    expect(ib.y + ib.height, "아이콘이 제목 위").toBeLessThanOrEqual(tb.y + 1);
    expect(tb.y + tb.height, "제목이 안내 위").toBeLessThanOrEqual(gb.y + 1);
    expect(gb.y + gb.height, "안내가 cabinet-add 위").toBeLessThanOrEqual(ab.y + 1);
    expect(Math.abs(ab.x + ab.width / 2 - (cb.x + cb.width / 2)), "cabinet-add 가운데 정렬").toBeLessThanOrEqual(2);
    expect(ab.height, `cabinet-add 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    // 색: 아이콘 하늘색, 핑크 없음, 카드 = 프레임 채움·테두리
    expect((await colorUses(icon)).flatMap((u) => u.colors), "시약장 아이콘 색 = 프레임").toContain(hexToRgb(EMPTY.iconColor));
    expect(using(await colorUses(sec), PINK_RGB).map((u) => u.where), "빈 상태에 핑크 없음").toEqual([]);
    const cardNode = emptyNodes.find((n) => leaf(n) === "ex-empty-state-card")!;
    const [cp] = await paints(card);
    expect(cp.bg, "카드 채움 = 프레임").toBe(hexToRgb(cardNode.fills[0]));
    expect(cp.lines, "카드 테두리 = 프레임").toContain(hexToRgb(cardNode.strokes[0]));
  });

  test(`[K1][S${SCREEN}] 빈 상태(교사): cabinet-add 를 누르면 "${defaultName(1)}" 이 생기고 기본 화면(switcher·배치도·cabinet-edit)으로 바뀐다`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "empty");
    await sec.locator(sel("cabinet-add")).click();
    await expect(sec.locator(sel("ex-empty-state-card")), "빈 상태 카드가 사라진다").toHaveCount(0);
    await expect(sec.locator(sel("cabinet-switcher"))).toHaveCount(1);
    expect(await pillNames(sec), "pill").toEqual([defaultName(1)]);
    expect(await pillNumbers(sec), "첫 시약장 번호 1").toEqual([["1"]]);
    await expectHeader(page, sec, defaultName(1), DOUBLE, MAX_SHELVES, "1");
    await expect(slots(sec)).toHaveCount(columns(DOUBLE) * MAX_SHELVES);
    expect(new Set(await slotTexts(sec)), "칸은 모두 미지정").toEqual(new Set([UNSET]));
    await expect(sec.locator(sel("cabinet-edit"))).toHaveCount(1);
    await expect(sec.locator(sel("cabinet-add")), "cabinet-add 는 switcher 끝 하나").toHaveCount(1);
    await expect(sec.locator(sel("mix-warning"))).toHaveCount(0);
    await expect(toast(sec, toastAdded(defaultName(1)))).toBeVisible();
  });

  test(`[K1][S${SCREEN}] 빈 상태(학생): 같은 카드에 cabinet-add 없이 "${EMPTY_GUIDE_STUDENT}"`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "empty-student");
    const card = sec.locator(sel("ex-empty-state-card"));
    await expect(card).toHaveCount(1);
    await expect(card.getByText(EMPTY.title, { exact: true })).toBeVisible();
    await expect(card.getByText(EMPTY_GUIDE_STUDENT, { exact: true })).toBeVisible();
    await expect(sec.getByText(EMPTY.guide, { exact: true }), "교사용 안내는 없다").toHaveCount(0);
    for (const n of rules.roles.R7.components) await expect(sec.locator(sel(n)), `학생 빈 상태 ${n}`).toHaveCount(rules.roles.R7.max);
    await expect(sec.getByRole("button"), "학생 빈 상태에 버튼 없음").toHaveCount(0);
    for (const n of ["cabinet-switcher", "cabinet-slot", "mix-warning", "button-primary", "button-outline"]) {
      await expect(sec.locator(sel(n)), `학생 빈 상태 ${n}`).toHaveCount(0);
    }
    expect(using(await colorUses(sec), PINK_RGB).map((u) => u.where), "핑크 없음").toEqual([]);
  });
});

// ---------- ex-modal-card 삭제 확인 ----------
test.describe("ex-modal-card 삭제 확인", () => {
  test(`[K1][S${SCREEN}] 삭제 확인 카드: "${DEL.title}" → "${DEL.body}" → "${DEL.caption}" → button-outline "${DEL.cancel}" · button-primary "${DEL.confirm}" 가로 배치`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "delete");
    const card = sec.locator(sel("ex-modal-card"));
    await expect(card).toHaveCount(1);
    const title = card.getByRole("heading", { name: DEL.title, exact: true });
    await expect(title, "제목(heading)").toHaveCount(1);
    const body = card.getByText(DEL.body, { exact: true });
    await expect(body, "안내").toHaveCount(1);
    await expect(body).toBeVisible();
    const caption = card.getByText(DEL.caption, { exact: true });
    await expect(caption, "보조 문구").toHaveCount(1);
    await expect(caption).toBeVisible();
    const cancel = card.locator(sel("button-outline"));
    const confirm = card.locator(sel("button-primary"));
    await expect(cancel).toHaveCount(1);
    await expect(cancel).toHaveText(exact(DEL.cancel));
    await expect(confirm).toHaveCount(1);
    await expect(confirm).toHaveText(exact(DEL.confirm));
    await expect(card.getByRole("button"), "카드 안 버튼은 둘뿐 (닫기 X 없음)").toHaveCount(2);
    await expect(cancel).toBeEnabled();
    await expect(confirm).toBeEnabled();
    const t = await box(title, "제목");
    const b = await box(body, "안내");
    const cp = await box(caption, "보조");
    const c = await box(cancel, "취소");
    const d = await box(confirm, "삭제");
    expect(t.y + t.height, "제목 → 안내").toBeLessThanOrEqual(b.y + 1);
    expect(b.y + b.height, "안내 → 보조").toBeLessThanOrEqual(cp.y + 1);
    expect(cp.y + cp.height, "보조 → 버튼").toBeLessThanOrEqual(Math.min(c.y, d.y) + 1);
    expect(Math.abs(c.y - d.y), "취소·삭제는 같은 줄").toBeLessThanOrEqual(1);
    expect(d.x, "취소(왼쪽) · 삭제(오른쪽)").toBeGreaterThanOrEqual(c.x + c.width);
    expect(c.height, `취소 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    expect(d.height, `삭제 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    // 글자색 = 프레임 (안내는 본문색, 보조는 회색)
    const fillOf = (name: string) => hexToRgb(delModalNodes.find((n) => n.name === name)!.fills[0]);
    expect(await body.evaluate((el) => getComputedStyle(el).color), "안내 글자색").toBe(fillOf("modal-body"));
    expect(await caption.evaluate((el) => getComputedStyle(el).color), "보조 글자색").toBe(fillOf("modal-caption"));
  });

  test(`[K1][S${SCREEN}] 삭제 확인 카드: 핑크·하늘색 없음, 그림자 없음 + 1px 테두리(프레임 색), 흰 채움`, async ({ page }) => {
    await open(page);
    for (const id of ["delete", "delete-none"]) {
      const sec = await area(page, id);
      const card = sec.locator(sel("ex-modal-card"));
      await page.mouse.move(0, 0);
      const uses = await colorUses(card);
      expect(using(uses, PINK_RGB).map((u) => u.where), `${id}: 핑크 없음 (시약장 삭제는 재고·안전 신호가 아니다)`).toEqual([]);
      expect(using(uses, HIGHLIGHT_RGB).map((u) => u.where), `${id}: 하늘색 없음`).toEqual([]);
      const style = await card.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { shadow: cs.boxShadow, width: cs.borderTopWidth, style: cs.borderTopStyle, color: cs.borderTopColor, bg: cs.backgroundColor };
      });
      expect(style.shadow, `${id}: 그림자`).toBe("none");
      expect(style.width, `${id}: 테두리 두께`).toBe("1px");
      expect(style.style, `${id}: 테두리`).toBe("solid");
      expect(style.color, `${id}: 테두리 색 = 프레임`).toBe(hexToRgb(DEL.stroke));
      expect(style.bg, `${id}: 채움 = 프레임`).toBe(hexToRgb(DEL.fill));
    }
  });

  test(`[K1][S${SCREEN}] 삭제 확인 카드(배치된 시약 0개): 같은 제목·보조 문구·버튼, "N개는 '칸 없음'으로" 문장은 없다`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "delete-none");
    const card = sec.locator(sel("ex-modal-card"));
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("heading", { name: DEL.title, exact: true })).toHaveCount(1);
    await expect(card.getByText(DEL.caption, { exact: true })).toBeVisible();
    await expect(card.locator(sel("button-outline"))).toHaveText(exact(DEL.cancel));
    await expect(card.locator(sel("button-primary"))).toHaveText(exact(DEL.confirm));
    expect(await card.innerText(), "옮겨질 시약이 없는데 개수를 말하지 않는다").not.toMatch(/시약 \d+개는/);
  });
});

// ---------- ex-modal-card 이름 바꾸기 ----------
test.describe("ex-modal-card 이름 바꾸기 시트", () => {
  const input = (card: Locator) => card.locator(sel("text-input")).locator("input");
  const save = (card: Locator) => card.locator(sel("button-primary"));
  const shows = (text: string, n: number) => new RegExp(`(^|\\D)${n}(\\D|$)`).test(text);

  test(`[K1][S${SCREEN}] 이름 시트 구성: 제목 "${RENAME_TITLE}" · text-input(현재 이름 "${TITLE}") · 글자 수 · 전폭 button-primary "${RENAME_SAVE}" · button-outline "${RENAME_CANCEL}", 핑크·하늘색 없음`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "rename");
    const card = sec.locator(sel("ex-modal-card"));
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("heading", { name: RENAME_TITLE, exact: true }), "제목(heading)").toHaveCount(1);
    await expect(card.locator(sel("text-input")), "text-input").toHaveCount(1);
    await expect(input(card), "입력").toHaveCount(1);
    await expect(input(card), "현재 이름").toHaveValue(TITLE);
    await expect(input(card), "입력의 접근 가능한 이름").toHaveAccessibleName(/이름/);
    await expect(save(card)).toHaveCount(1);
    await expect(save(card)).toHaveText(exact(RENAME_SAVE));
    await expect(save(card), "이름이 있으면 활성").toBeEnabled();
    const cancel = card.locator(sel("button-outline"));
    await expect(cancel).toHaveCount(1);
    await expect(cancel).toHaveText(exact(RENAME_CANCEL));
    await expect(cancel).toBeEnabled();
    await expect(card.getByRole("button"), "카드 안 버튼은 둘뿐").toHaveCount(2);
    // 글자 수 표시: 지금 길이가 카드에 적혀 있다 (입력 값은 innerText 에 없다)
    expect(shows(await card.innerText(), [...TITLE].length), `글자 수 ${[...TITLE].length} 표시`).toBe(true);
    // 순서·폭: 제목 → 입력 → 저장(전폭)
    const t = await box(card.getByRole("heading", { name: RENAME_TITLE, exact: true }), "제목");
    const i = await box(input(card), "입력");
    const s = await box(save(card), "저장");
    const field = await box(card.locator(sel("text-input")), "text-input");
    expect(t.y + t.height, "제목 → 입력").toBeLessThanOrEqual(i.y + 1);
    expect(i.y + i.height, "입력 → 저장").toBeLessThanOrEqual(s.y + 1);
    expect(Math.abs(s.width - field.width), "저장 폭 = 입력 폭 (전폭)").toBeLessThanOrEqual(1);
    expect(s.height, `저장 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    expect((await box(cancel, "취소")).height, `취소 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    await sec.getByRole("heading").first().click();
    await page.mouse.move(0, 0);
    const uses = await colorUses(card);
    expect(using(uses, PINK_RGB).map((u) => u.where), "핑크 없음").toEqual([]);
    expect(using(uses, HIGHLIGHT_RGB).map((u) => u.where), "하늘색 없음").toEqual([]);
    const style = await card.evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, width: getComputedStyle(el).borderTopWidth }));
    expect(style.shadow, "그림자").toBe("none");
    expect(style.width, "테두리 두께").toBe("1px");
  });

  test(`[K1][S${SCREEN}] 이름 시트: 비우거나 공백만이면 "${RENAME_SAVE}" 비활성, 글자를 쓰면 활성, 글자 수 표시가 따라 바뀐다`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "rename");
    const card = sec.locator(sel("ex-modal-card"));
    await input(card).fill("");
    await expect(save(card), "비우면 비활성").toBeDisabled();
    await expect.poll(async () => shows(await card.innerText(), 0), { message: "글자 수 0" }).toBe(true);
    await input(card).fill("   ");
    await expect(save(card), "공백만이면 비활성").toBeDisabled();
    await input(card).fill("가");
    await expect(save(card), "한 글자면 활성").toBeEnabled();
    await expect.poll(async () => shows(await card.innerText(), 1), { message: "글자 수 1" }).toBe(true);
    const twelve = "가나다라마바사아자차카타";
    await input(card).fill(twelve);
    await expect.poll(async () => shows(await card.innerText(), twelve.length), { message: `글자 수 ${twelve.length}` }).toBe(true);
    await expect(save(card)).toBeEnabled();
    await expect(card.locator(sel("button-outline")), "취소는 늘 활성").toBeEnabled();
  });

  test(`[K1][S${SCREEN}] 이름 시트: ${NAME_MAX}자까지만 입력된다 (${NAME_MAX}자는 저장 가능)`, async ({ page }) => {
    await open(page);
    const sec = await area(page, "rename");
    const card = sec.locator(sel("ex-modal-card"));
    await input(card).fill("");
    await input(card).pressSequentially("a".repeat(NAME_MAX + 5));
    await expect(input(card), `${NAME_MAX + 5}자를 쳐도 ${NAME_MAX}자`).toHaveValue("a".repeat(NAME_MAX));
    await expect(save(card), `${NAME_MAX}자는 저장 가능`).toBeEnabled();
    await expect.poll(async () => shows(await card.innerText(), NAME_MAX), { message: `글자 수 ${NAME_MAX}` }).toBe(true);
    // 붙여넣기처럼 한 번에 넣어도 넘지 않는다
    await input(card).fill("");
    await input(card).focus();
    await page.keyboard.insertText("가".repeat(NAME_MAX + 5));
    expect([...(await input(card).inputValue())].length, `한 번에 넣어도 ${NAME_MAX}자 이하`).toBeLessThanOrEqual(NAME_MAX);
  });
});

// ---------- 저장 줄 안내 · ex-toast ----------
test(`[K1][S${SCREEN}] 저장 줄: 칸을 줄일 때 "이 변경으로 시약 N종이 '칸 없음'이 돼요" 안내가 button-primary "${SAVE_LABEL}" 위에`, async ({ page }) => {
  await open(page);
  const sec = await area(page, "save-notice");
  const notice = sec.getByText(SHRINK_NOTICE);
  await expect(notice, "안내 문구 (d7 §9 칸 줄이기)").toHaveCount(1);
  await expect(notice).toBeVisible();
  const save = sec.locator(sel("button-primary"));
  await expect(save).toHaveCount(1);
  await expect(save).toHaveText(exact(SAVE_LABEL));
  const n = await box(notice, "안내");
  const s = await box(save, "저장");
  expect(n.y + n.height, "안내는 저장 버튼 위").toBeLessThanOrEqual(s.y + 1);
  expect(using(await colorUses(sec), PINK_RGB).map((u) => u.where), "안내에 핑크 없음").toEqual([]);
});

test(`[K1][S${SCREEN}] ex-toast: "${TOAST_SAVED}" · "${TOAST_RENAMED}" · "${toastAdded(defaultName(3))}" · "${toastDeleted(defaultName(2))}" 문구`, async ({ page }) => {
  await open(page);
  const sec = await area(page, "toast");
  for (const t of [TOAST_SAVED, TOAST_RENAMED, toastAdded(defaultName(3)), toastDeleted(defaultName(2))]) {
    await expect(toast(sec, t), `ex-toast "${t}"`).toHaveCount(1);
    await expect(toast(sec, t)).toBeVisible();
  }
  expect(using(await colorUses(sec), PINK_RGB).map((u) => u.where), "토스트에 핑크 없음").toEqual([]);
});

// ---------- nav-pill 로그아웃 메뉴 (d7 §10) ----------
test.describe("nav-pill 학교명 메뉴 (로그아웃)", () => {
  const navOf = async (page: Page) => {
    const sec = await area(page, "logout");
    const nav = sec.locator(sel("nav-pill"));
    await expect(nav, "예시 구역의 nav-pill").toHaveCount(1);
    return { sec, nav, button: nav.getByRole("button", { name: new RegExp(esc(SCHOOL)) }) };
  };

  test(`[K1][S${SCREEN}] nav-pill 학교명 "${SCHOOL}" 은 버튼(aria-haspopup=menu, aria-expanded=false), 닫힌 동안 메뉴 없음, 학교명은 nav-pill 안에 한 번`, async ({ page }) => {
    await open(page);
    const { nav, button } = await navOf(page);
    await expect(button, "학교명 버튼").toHaveCount(1);
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute("aria-haspopup", "menu");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("menu"), "닫힌 동안 메뉴 없음").toHaveCount(0);
    await expect(nav.getByText(LOGOUT), '닫힌 동안 "로그아웃" 없음').toHaveCount(0);
    expect(((await nav.innerText()).match(SCHOOL_RE) ?? []), "nav-pill 안 학교명").toEqual([SCHOOL]);
    expect(await button.evaluate((el) => el.closest("[data-component]")?.getAttribute("data-component")), "버튼은 nav-pill 안의 일반 버튼").toBe("nav-pill");
    expect(using(await colorUses(nav), PINK_RGB).map((u) => u.where), "nav-pill 에 핑크 없음").toEqual([]);
  });

  test(`[K1][S${SCREEN}] 학교명을 누르면 메뉴가 열린다(aria-expanded=true): menuitem "${LOGOUT}" 1개뿐, 학교 목록 없음, 다시 누르면 닫힌다`, async ({ page }) => {
    await open(page);
    const { nav, button } = await navOf(page);
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const menu = nav.getByRole("menu");
    await expect(menu, "메뉴").toHaveCount(1);
    await expect(menu).toBeVisible();
    const items = menu.getByRole("menuitem");
    await expect(items, "메뉴 항목 수").toHaveCount(1);
    await expect(items).toHaveText(exact(LOGOUT));
    await expect(items).toBeEnabled();
    expect(squash(await menu.innerText()), '메뉴 안 글자는 "로그아웃" 뿐').toBe(LOGOUT);
    expect((await menu.innerText()).match(SCHOOL_RE) ?? [], "메뉴에 학교 이름 없음").toEqual([]);
    await expect(menu.getByRole("link"), "메뉴에 링크 없음").toHaveCount(0);
    await expect(menu.locator("select, input, [role=option], [role=menuitemradio]"), "메뉴에 학교 선택 없음").toHaveCount(0);
    expect(((await nav.innerText()).match(SCHOOL_RE) ?? []), "열린 동안에도 학교명은 한 번").toEqual([SCHOOL]);
    // 메뉴가 화면 안에 보인다
    const m = await menu.boundingBox();
    const vp = page.viewportSize()!;
    expect(m!.x, "메뉴 왼쪽 끝이 화면 안").toBeGreaterThanOrEqual(0);
    expect(m!.x + m!.width, "메뉴 오른쪽 끝이 화면 안").toBeLessThanOrEqual(vp.width);
    expect((await items.boundingBox())!.height, `"${LOGOUT}" 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    await button.click();
    await expect(nav.getByRole("menu"), "다시 누르면 닫힌다").toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test(`[K1][S${SCREEN}] 메뉴는 Esc 로 닫히고 포커스가 학교명 버튼으로 돌아온다, 바깥을 눌러도 닫힌다`, async ({ page }) => {
    await open(page);
    const { sec, nav, button } = await navOf(page);
    await button.click();
    await expect(nav.getByRole("menu")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(nav.getByRole("menu"), "Esc 로 닫힌다").toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button, "포커스 복귀").toBeFocused();
    // 키보드로 연다
    await page.keyboard.press("Enter");
    await expect(nav.getByRole("menu"), "Enter 로 열린다").toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(nav.getByRole("menu")).toHaveCount(0);
    await expect(button).toBeFocused();
    // 바깥 클릭
    await button.click();
    await expect(nav.getByRole("menu")).toHaveCount(1);
    await sec.getByRole("heading").first().click();
    await expect(nav.getByRole("menu"), "바깥을 누르면 닫힌다").toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test(`[K1][S${SCREEN}] "${LOGOUT}" 을 누르면 onLogout 이 한 번 불린다 (갤러리는 실제로 로그아웃하지 않고 주소 그대로)`, async ({ page }) => {
    await open(page);
    const { sec, nav, button } = await navOf(page);
    const status = sec.getByRole("status");
    await expect(status, "갤러리 안내 줄").toHaveCount(1);
    const before = squash(await status.innerText());
    await button.click();
    expect(squash(await status.innerText()), "메뉴를 여는 것만으로는 불리지 않는다").toBe(before);
    await nav.getByRole("menuitem", { name: LOGOUT, exact: true }).click();
    await expect.poll(async () => squash(await status.innerText()), { message: "누른 횟수 안내" }).toMatch(/1번/);
    expect(new URL(page.url()).pathname).toBe(GALLERY_CABINETS);
  });

  test(`[K1][S${SCREEN}] onLogout 없는 nav-pill(/gallery 기존 예시): 학교명은 버튼이 아닌 글자, 메뉴 없음`, async ({ page }) => {
    await open(page, GALLERY);
    const navs = page.locator(sel("nav-pill")).filter({ hasText: SCHOOL });
    expect(await navs.count(), `/gallery 의 학교명이 있는 nav-pill`).toBeGreaterThanOrEqual(1);
    await expect(page.locator(`${sel("nav-pill")} [aria-haspopup]`), "aria-haspopup 요소 없음").toHaveCount(0);
    await expect(page.locator(`${sel("nav-pill")} :is(button, [role=button])`).filter({ hasText: SCHOOL }), "학교명 버튼 없음").toHaveCount(0);
    await expect(page.locator(`${sel("nav-pill")} [role=menu]`), "메뉴 없음").toHaveCount(0);
    for (let i = 0; i < (await navs.count()); i++) {
      expect(((await navs.nth(i).innerText()).match(SCHOOL_RE) ?? []), `${i + 1}번째 nav-pill 안 학교명은 한 번`).toEqual([SCHOOL]);
    }
  });
});
