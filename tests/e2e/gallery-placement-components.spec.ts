// 디자인 1.15 컴포넌트(시약 칸 배치 · 시약장 번호 · QR 인쇄 · 재주문 기준 직접 입력 · 저장 안 한 편집 확인 · nav-account-menu)의
// 컴포넌트 수준 동작 — 갤러리(/gallery/cabinets · /gallery/placement · /gallery 외, 비로그인 공개) 대상.
// 기준: harness/dev-rules.json components(1.15 추가 13종)·components_note·route_auth.logout, harness/d5-gates.md K1,
//       harness/d7-data.md §14 · §10, design/rules.json 1.15 (cabinet.number·class_mismatch·slot_count·qr_label_text·qr_print_layout·
//       unsaved_confirm, reorder.threshold_edit, roles R5·R7, screens_required 3·11, variants 3.location·11.slot·11.print·11.unsaved,
//       app_exceptions nav-account-menu), 디자인 run 20261006-1223 s2-spec(화면 3·11, 상태 3-location·11-slot·11-print·11-unsaved).
// 기대값: 문구·개수·색은 design/frames/{3,3-location,11,11-desktop,11-slot,11-print,11-unsaved}-mobile.json 노드와 rules.json 에서 읽는다.
//         QR 내용 틀은 d7 §14 `{origin}/scan?cabinet={cabinet id}`. 갤러리 예시 시약장의 id·origin(입력 데이터)만 app/gallery/cabinets/sample.ts 에서 가져온다.
// 태그 [K1] 은 judge 규칙별 집계 대상이 아니다 — [S3]·[S11]·[S13] 로 화면 실행에 포함된다. 실제 /cabinets · /reagents/[id] 연결은 D3.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { SAMPLE_ORIGIN, sampleCabinets } from "../../app/gallery/cabinets/sample";

type FrameNode = { name: string; type: string; path: string[]; fills: string[]; strokes: string[]; width?: number; text: { characters: string } | null };
type Frame = { frames: { name: string; width: number; nodes: FrameNode[] }[] };
type Role = { role?: string; component?: string; components?: string[]; max?: number };
type Rules = {
  colors: {
    accent: { value: string; only_within: string[] };
    accent_soft: { value: string; only_within: string[] };
    highlight: { values: string[]; forbidden_within: string[] };
  };
  button: { min_height: number };
  roles: Record<string, Role>;
  screens_required: Record<string, string[]>;
  variants: Record<string, Record<string, string[]>>;
  cabinet: {
    incompatible: [string, string][];
    unassigned_label: string;
    qr_label_text: string[];
    qr_print_roles: string[];
    slot_assign_roles: string[];
  };
  app_exceptions: Record<string, string>;
  tab_bar: { component: string; item: string };
  never: { N1: { school_name_pattern: string } };
};
type Dev = { components: Record<string, number[]>; viewports: { mobile: number[]; desktop: number[] } };

const root = process.cwd();
const rules = JSON.parse(readFileSync(join(root, "design/rules.json"), "utf8")) as Rules;
const dev = JSON.parse(readFileSync(join(root, "harness/dev-rules.json"), "utf8")) as Dev;
const D7 = readFileSync(join(root, "harness/d7-data.md"), "utf8");
const D7_14 = D7.slice(D7.indexOf("## 14."), D7.indexOf("\n## ", D7.indexOf("## 14.") + 1));
const loadFrame = (name: string) => (JSON.parse(readFileSync(join(root, `design/frames/${name}.json`), "utf8")) as Frame).frames[0].nodes;
const F11 = loadFrame("11-mobile");
const F11D = loadFrame("11-desktop");
const F11S = loadFrame("11-slot-mobile");
const F11P = loadFrame("11-print-mobile");
const F11U = loadFrame("11-unsaved-mobile");
const F3 = loadFrame("3-mobile");
const F3L = loadFrame("3-location-mobile");
const cab = rules.cabinet;
const componentNames = Object.keys(dev.components);
const HIGHLIGHTS_EARLY = rules.colors.highlight.values.map((v) => v.toLowerCase());

// ---------- 프레임 도우미 ----------
const leaf = (n: FrameNode) => n.path[n.path.length - 1];
const under = (nodes: FrameNode[], ancestor: string) => nodes.filter((n) => n.path.slice(0, -1).includes(ancestor));
const texts = (nodes: FrameNode[], name: string) => nodes.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);
const firstText = (nodes: FrameNode[], name: string) => texts(nodes, name)[0];
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
/** subtree 안 dev-rules 컴포넌트 개수 */
const countIn = (nodes: FrameNode[]) => {
  const out: Record<string, number> = {};
  for (const n of nodes) if (componentNames.includes(leaf(n))) out[leaf(n)] = (out[leaf(n)] ?? 0) + 1;
  return out;
};
const subtree = (nodes: FrameNode[], rootName: string) => nodes.filter((n) => n.path.includes(rootName));

// ---------- 기대값: 프레임 ----------
const SCHOOL = firstText(under(F11, "nav-account"), "school-name");
/** 11: 전환 pill 이름 · 번호 */
const PILLS = groups(F11, "cabinet-switcher")[0].children
  .filter((n) => n.name === "label" && /cabinet-chip/.test(n.path[n.path.length - 2]))
  .map((n) => n.text!.characters);
const PILL_NUMBERS = under(F11, "cabinet-switcher")
  .filter((n) => n.name === "label" && n.path[n.path.length - 2] === "cabinet-number")
  .map((n) => n.text!.characters);
const NUMBER_NODE = F11.find((n) => leaf(n) === "cabinet-number")!;
/** 11: 칸마다 slot-count 수 (없으면 0) */
const SLOT_COUNTS = groups(F11, "cabinet-slot").map((g) => Number(g.children.find((c) => c.name === "label" && c.path.includes("slot-count"))?.text?.characters ?? 0));
const SLOT_LABELS = groups(F11, "cabinet-slot").map((g) => labelIn(g, "slot-label"));
const SLOT_COUNT_NODE = F11.find((n) => leaf(n) === "slot-count")!;
/** 11-slot: 칸 시트 */
const sheetNodes = subtree(F11S, "slot-sheet");
const SLOT = {
  title: firstText(sheetNodes, "sheet-title-text"),
  chip: labelIn(groups(sheetNodes, "storage-class-chip")[0]),
  listTitle: texts(under(sheetNodes, "slot-reagents"), "section-title")[0],
  rows: groups(under(sheetNodes, "slot-reagents"), "reagent-row").map((g) => ({ name: labelIn(g, "reagent-name"), amount: labelIn(g, "quantity"), cls: labelIn(g, "storage-class") })),
  remove: texts(under(sheetNodes, "slot-reagents"), "label")[0],
  pickerTitle: texts(under(sheetNodes, "slot-picker"), "section-title")[0],
  placeholder: firstText(sheetNodes, "placeholder"),
  candidates: groups(under(sheetNodes, "slot-picker"), "reagent-row").map((g) => ({
    name: labelIn(g, "reagent-name"),
    caption: labelIn(g, "slot-caption"),
    selected: (g.node.fills[0] ?? "").toLowerCase(),
  })),
  warning: texts(under(sheetNodes, "mix-warning"), "warning-line"),
  assign: labelIn(groups(sheetNodes, "slot-assign")[0]),
  counts: countIn(sheetNodes),
};
/** 11-print: 인쇄 시트 */
const printNodes = subtree(F11P, "qr-print-sheet");
const PRINT = {
  title: firstText(printNodes, "sheet-title-text"),
  targets: groups(printNodes, "print-target-chip").map((g) => ({
    label: g.children.filter((c) => c.name === "label" && !c.path.includes("cabinet-number")).map((c) => c.text!.characters)[0],
    selected: (g.node.fills[0] ?? "").toLowerCase(),
  })),
  labels: groups(printNodes, "qr-label").map((g) => ({
    school: labelIn(g, "label-school"),
    number: g.children.find((c) => c.name === "label" && c.path.includes("cabinet-number"))?.text?.characters ?? "",
    name: labelIn(g, "label-name"),
    help: labelIn(g, "label-help"),
  })),
  caption: firstText(printNodes, "print-caption"),
  button: labelIn(groups(printNodes, "button-primary")[0]),
  counts: countIn(printNodes),
  labelColors: [...new Set(subtree(printNodes, "qr-label").flatMap((n) => [...n.fills, ...n.strokes].map((c) => c.toLowerCase())))],
};
/** 11-unsaved: 확인 카드 */
const unsavedNodes = subtree(F11U, "ex-modal-card");
const UNSAVED = {
  title: firstText(unsavedNodes, "modal-title"),
  body: firstText(unsavedNodes, "modal-body"),
  discard: labelIn(groups(unsavedNodes, "button-outline")[0]),
  keep: labelIn(groups(unsavedNodes, "button-primary")[0]),
  counts: countIn(unsavedNodes),
};
/** 3: 보관 위치 · 재주문 기준 */
const LOC = {
  label: firstText(under(F3, "reagent-location"), "field-label"),
  value: firstText(under(F3, "reagent-location"), "value"),
  number: texts(under(F3, "reagent-location"), "label").find((t) => /^\d+$/.test(t))!,
  edit: texts(under(F3, "location-edit"), "label")[0],
  labelFill: F3.find((n) => n.name === "field-label" && n.path.includes("reagent-location"))!.fills[0],
};
const THR = {
  label: firstText(under(F3, "reorder-threshold"), "field-label"),
  value: firstText(under(F3, "reorder-threshold"), "value"),
};
/**
 * 3-location: 위치 피커.
 * 디자인 1.17(fadfee7)에서 3-location 시안이 위치 추천 시안으로 바뀌었다: 노드 이름(heading · caption · cabinet-pill · slot-grid ·
 * slot-left/label · link-action), "추천" 줄(suggest-row · suggest-badge), 고른 칸 = 추천 칸(산화제), 피커 mix-warning 없음.
 * run 20261007-1129(위치 추천, d7 §17)부터 suggest-badge · 추천 줄 · 추천 칸 선택도 대조한다.
 */
const pickerNodes = subtree(F3L, "location-picker");
/** 칸 이름: slot-left 안 label (suggest-badge 의 "추천" 글자는 빼고) */
const slotLabelOf = (g: { children: FrameNode[] }) =>
  g.children.find((c) => c.name === "label" && c.text && c.path.includes("slot-left") && !c.path.includes("suggest-badge"))?.text?.characters ?? "";
const pillGroups = groups(pickerNodes, "cabinet-pill");
const pillLabelOf = (g: { children: FrameNode[] }) => g.children.find((c) => c.name === "label" && c.text && !c.path.includes("cabinet-number"))?.text?.characters ?? "";
const PICKER = {
  title: firstText(pickerNodes, "heading"),
  caption: firstText(pickerNodes, "caption"),
  pills: pillGroups.map(pillLabelOf),
  active: pillLabelOf(pillGroups.find((g) => HIGHLIGHTS_EARLY.includes((g.node.fills[0] ?? "").toLowerCase()))!),
  slots: groups(pickerNodes, "cabinet-slot").map((g) => ({
    label: slotLabelOf(g),
    count: Number(g.children.find((c) => c.name === "label" && c.path.includes("slot-count"))?.text?.characters ?? 0),
    selected: (g.node.fills[0] ?? "").toLowerCase(),
    /** 추천 칸 (suggest-badge) */
    suggested: g.children.some((c) => leaf(c) === "suggest-badge"),
  })),
  unassign: texts(under(pickerNodes, "link-action"), "label")[0],
  warning: texts(under(pickerNodes, "mix-warning"), "warning-line"),
  save: labelIn(groups(pickerNodes, "button-primary")[0]),
  /** 추천 줄(suggest-row: 번호 원 · 위치 글자 · suggest-badge) */
  suggestRow: {
    number: texts(under(pickerNodes, "suggest-row"), "label").find((t) => /^\d+$/.test(t)) ?? "",
    value: firstText(under(pickerNodes, "suggest-row"), "value"),
    badge: texts(under(pickerNodes, "suggest-badge"), "label")[0] ?? "",
  },
  sectionTitles: texts(pickerNodes, "section-title"),
  counts: countIn(pickerNodes),
};
/** dev-rules components 에 있는 이름만 (variants 의 이름은 1.5 부터 모두 dev-rules 안 — 빠지면 아래 기대값 점검이 실패한다) */
const inScope = (names: string[]) => names.filter((n) => componentNames.includes(n));

// ---------- 기대값: rules ----------
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}
const HIGHLIGHTS = rules.colors.highlight.values.map((v) => v.toLowerCase());
const HIGHLIGHT_RGB = HIGHLIGHTS.map(hexToRgb);
const PINK_RGB = [rules.colors.accent.value, rules.colors.accent_soft.value].map((v) => hexToRgb(v.toLowerCase()));
const ACCENT_SOFT_RGB = hexToRgb(rules.colors.accent_soft.value);
const MIN_H = rules.button.min_height;
const SCHOOL_RE = new RegExp(rules.never.N1.school_name_pattern, "g");
const R5 = rules.roles.R5;
const R7 = rules.roles.R7;
const STUDENT_ZERO = [...new Set([...(R5.components ?? []), ...(R7.components ?? [])])];
const UNASSIGNED = cab.unassigned_label;
const QR_HELP = cab.qr_label_text[cab.qr_label_text.length - 1];
const QR_TEMPLATE = /`\{origin\}(\/[a-z]+)\?([a-z]+)=\{cabinet id\}`/.exec(D7_14)!;
const qrContent = (origin: string, id: string) => `${origin}${QR_TEMPLATE[1]}?${QR_TEMPLATE[2]}=${id}`;
const MOBILE_W = dev.viewports.mobile[0];
const isMobile = (page: Page) => page.viewportSize()!.width <= MOBILE_W;
// 받침 표 (분류 8종을 손으로 적은 표)
const BATCHIM: Record<string, boolean> = { 유기: false, 산: true, 염기: false, 산화제: false, 인화성: true, 무기염: true, 독성: true, 기타: false };
const dangerText = (a: string, b: string) => `${a}${BATCHIM[a] ? "과" : "와"} ${b}${BATCHIM[b] ? "은" : "는"} 섞으면 위험해요`;
const pairKey = (a: string, b: string) => [a, b].sort().join("+");
const isIncompatible = (a: string, b: string) => cab.incompatible.some(([x, y]) => pairKey(x, y) === pairKey(a, b));
/** 시안 11-slot "이 칸은 유기 칸이에요 — 그래도 넣을 수 있어요" 의 틀 */
const mismatchText = (slotLabel: string) => SLOT.warning[0].replace(/^이 칸은 .+ 칸이에요/, `이 칸은 ${slotLabel} 칸이에요`);
const PUT_NOTE = SLOT.warning[0].split(" — ")[1];
/**
 * 피커 보조 줄("저장" 쪽): 1.15 시안 "그래도 저장할 수 있어요" 는 1.17 시안에서 빠졌다(원본 없음).
 * 문구 대조는 다음 run(위치 추천)에서 — 여기서는 강한 문구 + 무언가 보조 줄 1개만 본다 (null = 문구 대조 안 함).
 */
const SAVE_NOTE: string | null = PICKER.warning[1] ?? null;
/**
 * d7 §14 분류 불일치 판단(규칙에서 직접): 시약 분류가 없으면 없음 → 칸 분류·같은 칸 다른 시약 분류와 incompatible 이면 강한 문구(조합마다)
 * → 칸 분류가 있고 시약 분류가 그 안에 없으면 약한 문구 → 그 밖에는 없음
 */
function expectedWarning(reagentCls: string | null, slotClasses: string[], others: string[], note: string): { kind: "none" | "mismatch" | "incompatible"; partners: string[] } {
  if (!reagentCls) return { kind: "none", partners: [] };
  const around = new Set([...slotClasses, ...others]);
  const partners = [...around].filter((c) => isIncompatible(reagentCls, c));
  if (partners.length > 0) return { kind: "incompatible", partners };
  if (slotClasses.length > 0 && !slotClasses.includes(reagentCls)) return { kind: "mismatch", partners: [] };
  void note;
  return { kind: "none", partners: [] };
}

// ---------- DOM 도우미 ----------
const sel = (name: string) => `[data-component="${name}"]`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

async function open(page: Page, path: string): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `갤러리 ${path} 응답`).toBe(200);
  await page.waitForLoadState("networkidle");
}
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
  const scroll = await loc.page().evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  return { x: b!.x + scroll.x, y: b!.y + scroll.y, width: b!.width, height: b!.height };
}
/** scope 안 모든 요소가 실제로 쓰는 색 (글자·바탕·선·svg 채움/선) */
async function colorsIn(scope: Locator): Promise<{ where: string; colors: string[] }[]> {
  return scope.evaluate((rootEl) => {
    const out: { where: string; colors: string[] }[] = [];
    for (const el of [rootEl, ...Array.from(rootEl.querySelectorAll("*"))]) {
      const cs = getComputedStyle(el) as unknown as Record<string, string>;
      const colors: string[] = [cs.backgroundColor];
      for (const s of ["Top", "Right", "Bottom", "Left"]) {
        if (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none") colors.push(cs[`border${s}Color`]);
      }
      if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) colors.push(cs.outlineColor);
      for (const m of (cs.boxShadow === "none" ? "" : cs.boxShadow).match(/rgba?\([^)]*\)/g) ?? []) colors.push(m);
      if (el instanceof SVGElement) {
        if (cs.fill !== "none") colors.push(cs.fill);
        if (cs.stroke !== "none") colors.push(cs.stroke);
      } else if (Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "")) {
        colors.push(cs.color);
      }
      out.push({ where: `${el.tagName.toLowerCase()}${el.getAttribute("data-component") ? `[${el.getAttribute("data-component")}]` : ""}`, colors });
    }
    return out;
  });
}
const using = (uses: { where: string; colors: string[] }[], rgbs: string[]) => uses.filter((u) => u.colors.some((c) => rgbs.includes(c))).map((u) => u.where);
/** 요소 하나의 글자 (data-component 가 붙은 자손 몇 종은 뺀다) */
async function textWithout(loc: Locator, drop: string[]): Promise<string> {
  return loc.evaluate((el, names) => {
    const c = el.cloneNode(true) as Element;
    for (const n of names) for (const x of Array.from(c.querySelectorAll(`[data-component="${n}"]`))) x.remove();
    return (c.textContent ?? "").replace(/\s+/g, " ").trim();
  }, drop);
}
const pills = (scope: Locator) => scope.locator(`${sel("cabinet-switcher")} :is(button, a):not(${sel("cabinet-add")})`);
const pillNames = (scope: Locator) =>
  pills(scope).evaluateAll((els) =>
    els.map((el) => {
      const c = el.cloneNode(true) as Element;
      for (const n of Array.from(c.querySelectorAll('[data-component="cabinet-number"]'))) n.remove();
      return (c.textContent ?? "").replace(/\s+/g, " ").trim();
    }),
  );
const pill = (scope: Locator, name: string) => pills(scope).filter({ has: scope.page().getByText(name, { exact: true }) });
const slots = (scope: Locator) => scope.locator(sel("cabinet-slot"));
const board = (scope: Locator) => scope.locator(`${sel("cabinet-slot")}:not(${sel("slot-sheet")} *):not(${sel("location-picker")} *)`);
const mixLines = async (mix: Locator) => (await mix.innerText()).split("\n").map(squash).filter((l) => l !== "");
const isActivePaint = async (loc: Locator) =>
  loc.evaluate((el, hl) => {
    const cs = getComputedStyle(el);
    return hl.includes(cs.backgroundColor) && [cs.borderTopColor, cs.outlineColor].some((c) => hl.includes(c));
  }, HIGHLIGHT_RGB);

/** QR svg 를 그려 모듈마다 검정/흰색 행렬로 읽는다 (조용한 영역 포함, viewBox 한 변 = 모듈 수) */
async function readQrMatrix(svg: Locator): Promise<boolean[][]> {
  return svg.evaluate(async (el) => {
    const vb = (el.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
    const n = vb[2];
    const scale = 8;
    const clone = el.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(n * scale));
    clone.setAttribute("height", String(n * scale));
    clone.setAttribute("shape-rendering", "crispEdges");
    for (const p of Array.from(clone.querySelectorAll("path, rect"))) (p as SVGElement).setAttribute("fill", "#000");
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clone.outerHTML)}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = n * scale;
    canvas.height = n * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const out: boolean[][] = [];
    for (let y = 0; y < n; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < n; x++) {
        const i = ((y * scale + scale / 2) * canvas.width + (x * scale + scale / 2)) * 4;
        row.push(data[i] < 128);
      }
      out.push(row);
    }
    return out;
  });
}
/** 행렬이 text 를 담은 QR 인지 — 오류 정정 수준 L·M·Q·H 중 하나로 만든 QR 과 모듈이 모두 같으면 true */
function qrMatches(matrix: boolean[][], text: string): boolean {
  const n = matrix.length;
  return (["L", "M", "Q", "H"] as const).some((level) => {
    const qr = QRCode.create(text, { errorCorrectionLevel: level });
    const size = qr.modules.size;
    const q = (n - size) / 2;
    if (!Number.isInteger(q) || q < 0) return false;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const inside = y >= q && y < q + size && x >= q && x < q + size;
        const want = inside ? Boolean(qr.modules.get(y - q, x - q)) : false;
        if (matrix[y][x] !== want) return false;
      }
    }
    return true;
  });
}

// =====================================================================
// 기대값 자체 점검
// =====================================================================
test("[K1][S11] 기대값 원본: 1.15 프레임(11 · 11-slot · 11-print · 11-unsaved · 3 · 3-location) · rules variants · d7 §14 가 서로 맞는다", () => {
  expect(PILLS).toEqual(["1번 시약장", "2번 시약장"]);
  expect(PILL_NUMBERS, "pill 번호").toEqual(["1", "2"]);
  expect(SLOT_COUNTS.filter((c) => c > 0).length, "slot-count 가 있는 칸").toBe(F11.filter((n) => leaf(n) === "slot-count").length);
  expect(SLOT.title).toBe("좌 2단");
  expect(SLOT.chip).toBe("유기");
  expect(SLOT.listTitle).toBe(`이 칸의 시약 (${SLOT.rows.length})`);
  expect(SLOT.remove).toBe("빼기");
  expect(SLOT.assign).toBe("시약 넣기");
  expect(SLOT.warning).toEqual(["이 칸은 유기 칸이에요 — 그래도 넣을 수 있어요"]);
  expect(SLOT.candidates.map((c) => c.caption.endsWith(`· ${UNASSIGNED}`)), "후보 caption = 분류 · 칸 없음").toEqual(SLOT.candidates.map(() => true));
  expect(SLOT.candidates.filter((c) => HIGHLIGHTS.includes(c.selected)).length, "선택 후보 1개").toBe(1);
  expect(PRINT.title).toBe("QR 인쇄");
  expect(PRINT.targets.map((t) => t.label)).toEqual([...PILLS, "모두"]);
  expect(PRINT.labels.map((l) => l.name)).toEqual(PILLS);
  expect(PRINT.labels.map((l) => l.number)).toEqual(PILL_NUMBERS);
  for (const l of PRINT.labels) {
    expect(l.school).toBe(SCHOOL);
    expect(l.help).toBe(QR_HELP);
  }
  expect(cab.qr_label_text.slice(0, 3)).toEqual(["학교명", "시약장 번호", "시약장 이름"]);
  expect(PRINT.caption).toBe(`A4 한 장에 라벨 ${PRINT.labels.length}개`);
  expect(UNSAVED.title).toBe("저장하지 않은 변경이 있어요");
  expect(UNSAVED.body).toBe(`이동하면 ${PILLS[0]}에서 바꾼 내용이 사라져요`);
  expect([UNSAVED.discard, UNSAVED.keep]).toEqual(["버리고 이동", "계속 편집"]);
  expect(LOC.value).toBe("1번 시약장 · 우 1단");
  expect(THR.value).toBe("3병");
  expect(PICKER.title).toBe("보관 위치 바꾸기");
  expect(PICKER.caption).toBe("과산화수소 · 산화제");
  expect(PICKER.pills).toEqual(PILLS);
  expect(PICKER.active).toBe(PILLS[1]);
  // 1.17: 피커 mix-warning 은 시안에서 빠짐, 추천 칸 1개 = 고른 칸, 추천 줄 = 그 칸 (d7 §17)
  expect(PICKER.warning).toEqual([]);
  expect(PICKER.slots.filter((s) => s.suggested).length, "1.17 3-location 추천 칸").toBe(1);
  expect(PICKER.slots.filter((s) => HIGHLIGHTS_EARLY.includes(s.selected)).map((s) => s.suggested), "고른 칸 = 추천 칸").toEqual([true]);
  expect(PICKER.suggestRow.value, "추천 줄 = 고른 시약장 · 칸").toBe(`${PICKER.active} · 우 2단`);
  expect(PICKER.suggestRow.badge, "suggest-badge 글자").toBe("추천");
  expect(PICKER.sectionTitles, "피커 소제목").toEqual(["추천", "전체"]);
  expect(PICKER.unassign).toBe(`${UNASSIGNED}으로`);
  expect(QR_TEMPLATE, "d7 §14 QR 내용 틀").toBeTruthy();
  // variants 필수 컴포넌트가 상태 프레임에 있다
  for (const n of rules.variants["11"].slot) expect(countIn(F11S)[n] ?? 0, `11-slot ${n}`).toBeGreaterThanOrEqual(1);
  for (const n of rules.variants["11"].print) expect(countIn(F11P)[n] ?? 0, `11-print ${n}`).toBeGreaterThanOrEqual(1);
  for (const n of rules.variants["11"].unsaved) expect(countIn(F11U)[n] ?? 0, `11-unsaved ${n}`).toBeGreaterThanOrEqual(1);
  expect(inScope(rules.variants["3"].location), "variants 3.location 은 모두 dev-rules components 안 (suggest-badge 포함)").toEqual(rules.variants["3"].location);
  for (const n of rules.variants["3"].location) expect(countIn(F3L)[n] ?? 0, `3-location ${n}`).toBeGreaterThanOrEqual(1);
  expect(countIn(F3L)["suggest-badge"], "3-location 시안 suggest-badge = 추천 줄 1 + 추천 칸 1").toBe(2);
  for (const n of rules.screens_required["3"]) expect(countIn(F3)[n] ?? 0, `3 ${n}`).toBeGreaterThanOrEqual(1);
  // 갤러리 예시 데이터(입력)가 시안 상태와 같다
  expect(sampleCabinets.map((c) => c.label)).toEqual(PILLS);
  expect(sampleCabinets.map((c) => String(c.number))).toEqual(PILL_NUMBERS);
});

// =====================================================================
// 화면 11 — cabinet-number · slot-count
// =====================================================================
test.describe("화면 11 시약장 번호 · 칸 안 시약 수 (/gallery/cabinets)", () => {
  test(`[K1][S11] cabinet-switcher: pill 마다 이름 앞 cabinet-number 1개(${PILL_NUMBERS.join("·")}), 흰 원 + 회색 테두리, 숫자는 기본색(핑크·하늘색 아님)`, async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "default");
    expect(await pillNames(sec)).toEqual(PILLS);
    for (let i = 0; i < PILLS.length; i++) {
      const p = pills(sec).nth(i);
      const num = p.locator(sel("cabinet-number"));
      await expect(num, `${PILLS[i]} 번호 원`).toHaveCount(1);
      await expect(num).toHaveText(exact(PILL_NUMBERS[i]));
      // 가로 스크롤 줄 안이라 한 번에 잰다
      const order = await p.evaluate((el, name) => {
        const n = el.querySelector('[data-component="cabinet-number"]')!.getBoundingClientRect();
        const l = Array.from(el.querySelectorAll("*")).find((e) => e.children.length === 0 && (e.textContent ?? "").trim() === name)!.getBoundingClientRect();
        return { numRight: n.right, labelLeft: l.left };
      }, PILLS[i]);
      expect(order.numRight, "번호는 이름 앞").toBeLessThanOrEqual(order.labelLeft + 1);
      const style = await num.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, border: cs.borderTopColor, width: cs.borderTopWidth, color: cs.color };
      });
      expect(style.bg, "번호 원 채움 = 프레임").toBe(hexToRgb(NUMBER_NODE.fills[0]));
      expect(style.border, "번호 원 테두리 = 프레임").toBe(hexToRgb(NUMBER_NODE.strokes[0]));
      expect(style.width).toBe("1px");
      expect([...HIGHLIGHT_RGB, ...PINK_RGB], "번호 글자색").not.toContain(style.color);
    }
    // 활성 pill 도 번호 원은 같은 흰 원 (하늘색 글자 금지)
    expect(using(await colorsIn(sec.locator(sel("cabinet-number")).first()), PINK_RGB)).toEqual([]);
  });

  test(`[K1][S11] slot-count: 칸 안 시약 수 = 시안(${SLOT_COUNTS.join(",")}), 0 이면 없음, 무채색(핑크·하늘색 없음)`, async ({ page }) => {
    await open(page, "/gallery/cabinets");
    for (const id of ["default", "student"]) {
      const sec = await area(page, id);
      await expect(board(sec)).toHaveCount(SLOT_COUNTS.length);
      for (let i = 0; i < SLOT_COUNTS.length; i++) {
        const s = board(sec).nth(i);
        expect(await textWithout(s, ["slot-count"]), `${id} ${i + 1}번째 칸 라벨`).toBe(SLOT_LABELS[i]);
        const c = s.locator(sel("slot-count"));
        if (SLOT_COUNTS[i] === 0) {
          await expect(c, `${id} ${i + 1}번째 칸: 시약 0 → slot-count 없음`).toHaveCount(0);
        } else {
          await expect(c, `${id} ${i + 1}번째 칸 slot-count`).toHaveCount(1);
          await expect(c).toHaveText(exact(String(SLOT_COUNTS[i])));
          const uses = await colorsIn(c);
          expect(using(uses, PINK_RGB), "slot-count 핑크 금지 (rules cabinet.slot_count)").toEqual([]);
          expect(using(uses, HIGHLIGHT_RGB), "slot-count 하늘색 없음").toEqual([]);
          expect(await c.evaluate((el) => getComputedStyle(el).backgroundColor), "slot-count 채움 = 프레임(흰색)").toBe(hexToRgb(SLOT_COUNT_NODE.fills[0]));
        }
      }
    }
  });
});

// =====================================================================
// 화면 11 — 칸 시트 (slot-sheet · slot-assign · mix-warning)
// =====================================================================
test.describe("화면 11 칸 시트 (rules variants 11.slot)", () => {
  test(`[K1][S11] 상태 11-slot 예시: slot-sheet "${SLOT.title}" + 칩 "${SLOT.chip}" + "${SLOT.listTitle}" + 행마다 "${SLOT.remove}" + "${SLOT.pickerTitle}" + mix-warning + slot-assign "${SLOT.assign}" — 프레임 개수 이상`, async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "slot");
    for (const n of rules.variants["11"].slot) expect(await sec.locator(sel(n)).count(), `variants.11.slot ${n}`).toBeGreaterThanOrEqual(1);
    const sheet = sec.locator(sel("slot-sheet"));
    await expect(sheet).toHaveCount(1);
    for (const [n, c] of Object.entries(SLOT.counts)) {
      if (n === "slot-sheet") continue;
      expect(await sheet.locator(sel(n)).count(), `시트 안 ${n} (프레임 ${c})`).toBeGreaterThanOrEqual(c);
    }
    await expect(sheet.getByRole("heading", { name: SLOT.title, exact: true }), "시트 제목").toHaveCount(1);
    const chip = sheet.locator(sel("storage-class-chip"));
    await expect(chip, "제목 옆 칸 분류 칩 (보기 전용)").toHaveCount(1);
    await expect(chip).toHaveText(exact(SLOT.chip));
    expect(await chip.evaluate((el) => el.matches("button,a,[role=button]")), "칩은 누를 수 없다").toBe(false);
    await expect(sheet.getByRole("heading", { name: SLOT.listTitle, exact: true })).toHaveCount(1);
    for (const r of SLOT.rows) {
      const row = sheet.locator(sel("reagent-row")).filter({ hasText: r.name });
      await expect(row, `행 ${r.name}`).toHaveCount(1);
      await expect(row.getByText(r.amount, { exact: true })).toBeVisible();
      await expect(row.getByText(r.cls, { exact: true })).toBeVisible();
      const remove = row.getByRole("button", { name: new RegExp(`${esc(SLOT.remove)}$`) });
      await expect(remove, `${r.name} "${SLOT.remove}"`).toHaveCount(1);
      await expect(remove).toHaveText(exact(SLOT.remove));
      expect((await box(remove, "빼기")).height, `"빼기" 누름 영역 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
      expect(using(await colorsIn(remove), PINK_RGB), '"빼기" 핑크 없음').toEqual([]);
    }
    await expect(sheet.getByRole("heading", { name: SLOT.pickerTitle, exact: true })).toHaveCount(1);
    await expect(sheet.getByPlaceholder(SLOT.placeholder), `검색 "${SLOT.placeholder}"`).toHaveCount(1);
    for (const c of SLOT.candidates) {
      const row = sheet.locator(sel("reagent-row")).filter({ hasText: c.name });
      await expect(row.getByText(c.caption, { exact: true }), `후보 ${c.name} caption`).toBeVisible();
    }
    const mix = sheet.locator(sel("mix-warning"));
    await expect(mix).toHaveCount(1);
    expect(await mixLines(mix), "약한 문구 = 시안").toEqual(SLOT.warning);
    expect(await mix.evaluate((el) => getComputedStyle(el).backgroundColor), "mix-warning 바탕 = accent_soft").toBe(ACCENT_SOFT_RGB);
    const assign = sheet.locator(sel("slot-assign"));
    await expect(assign).toHaveCount(1);
    const btn = assign.getByRole("button", { name: SLOT.assign, exact: true });
    await expect(btn, "경고가 있어도 넣기는 막지 않는다 (rules class_mismatch)").toBeEnabled();
    expect((await box(btn, "시약 넣기")).height).toBeGreaterThanOrEqual(MIN_H);
    // 순서: 이 칸의 시약 → 넣을 시약 고르기 → mix-warning → slot-assign
    const a = await box(sheet.getByRole("heading", { name: SLOT.listTitle, exact: true }), "목록 제목");
    const b = await box(sheet.getByRole("heading", { name: SLOT.pickerTitle, exact: true }), "고르기 제목");
    const m = await box(mix, "mix-warning");
    const s = await box(assign, "slot-assign");
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(m.y);
    expect(m.y + m.height).toBeLessThanOrEqual(s.y + 1);
  });

  test("[K1][S11] 상태 11-slot 위험 조합 예시: 후보 분류(caption)와 칸 분류가 rules incompatible 이면 강한 문구 + 보조 줄 (약한 문구와 다름)", async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "slot-danger");
    const sheet = sec.locator(sel("slot-sheet"));
    const slotCls = squash(await sheet.locator(sel("storage-class-chip")).innerText());
    // 고른 후보 = 눌린 상태(aria-pressed) 행 1개
    const selectedRow = sheet.locator(`${sel("reagent-row")}[aria-pressed="true"]`);
    await expect(selectedRow, "고른 후보 1개").toHaveCount(1);
    const caption = squash(await selectedRow.innerText());
    const cls = cab.incompatible.flat().find((c) => caption.includes(`${c} · ${UNASSIGNED}`)) ?? "";
    expect(cls, `고른 후보의 분류 (caption "${caption}")`).not.toBe("");
    const want = expectedWarning(cls, [slotCls], [], PUT_NOTE);
    expect(want.kind, `${cls} → ${slotCls} 칸`).toBe("incompatible");
    const lines = await mixLines(sheet.locator(sel("mix-warning")));
    for (const p of want.partners) expect(lines.some((l) => l === dangerText(cls, p) || l === dangerText(p, cls)), `"${cls}·${p}" 강한 문구`).toBe(true);
    expect(lines, "보조 줄").toContain(PUT_NOTE);
    expect(lines.some((l) => /^이 칸은 .+ 칸이에요/.test(l)), "약한 문구와 겹쳐 쓰지 않는다").toBe(false);
    await expect(sheet.locator(sel("slot-assign")).getByRole("button")).toBeEnabled();
  });

  test(`[K1][S11] 교사: 칸 "${SLOT.title}" 을 누르면 slot-sheet — "${SLOT.remove}" 로 빼면 목록·slot-count·칸 없음 목록이 바뀌고, "${SLOT.assign}" 로 후보를 고르면 규칙대로 경고, 넣으면 칸으로`, async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "default");
    const idx = SLOT_LABELS.indexOf(SLOT.chip);
    expect(idx, "시안 11 에서 유기 칸 = 좌2단").toBe(2);
    await expect(sec.locator(sel("slot-sheet"))).toHaveCount(0);
    await board(sec).nth(idx).click();
    const sheet = sec.locator(sel("slot-sheet"));
    await expect(sheet, "칸을 누르면 칸 시트").toHaveCount(1);
    await expect(sheet.getByRole("heading", { name: SLOT.title, exact: true })).toHaveCount(1);
    await expect(sheet.getByRole("heading", { name: `이 칸의 시약 (${SLOT_COUNTS[idx]})`, exact: true })).toHaveCount(1);
    for (const r of SLOT.rows) await expect(sheet.locator(sel("reagent-row")).filter({ hasText: r.name }), r.name).toHaveCount(1);
    // 처음에는 고르기 목록이 닫혀 있고 "시약 넣기" 만
    await expect(sheet.getByRole("heading", { name: SLOT.pickerTitle, exact: true })).toHaveCount(0);
    const btn = sheet.locator(sel("slot-assign")).getByRole("button", { name: SLOT.assign, exact: true });
    await expect(btn).toBeEnabled();
    // 빼기
    const unassignedTitle = (n: number) => sec.getByRole("heading", { name: `${UNASSIGNED} 시약 (${n})`, exact: true });
    const before = Number(/\((\d+)\)/.exec(await sec.getByRole("heading", { name: new RegExp(`^${esc(UNASSIGNED)} 시약 \\(\\d+\\)$`) }).innerText())![1]);
    const out = SLOT.rows[0].name;
    await sheet.locator(sel("reagent-row")).filter({ hasText: out }).getByRole("button", { name: new RegExp(`${esc(SLOT.remove)}$`) }).click();
    await expect(sheet.locator(sel("reagent-row")).filter({ hasText: out }), `${out} 이 칸에서 빠진다`).toHaveCount(0);
    await expect(sheet.getByRole("heading", { name: `이 칸의 시약 (${SLOT_COUNTS[idx] - 1})`, exact: true })).toHaveCount(1);
    await expect(board(sec).nth(idx).locator(sel("slot-count")), "배치도 칸 수도 줄어든다").toHaveText(exact(String(SLOT_COUNTS[idx] - 1)));
    await expect(unassignedTitle(before + 1), "칸 없음 목록에 더해진다").toHaveCount(1);
    await expect(sec.locator(sel("ex-toast")).filter({ hasText: out })).toBeVisible();
    // 시약 넣기 → 고르기 목록
    await btn.click();
    await expect(sheet.getByRole("heading", { name: SLOT.pickerTitle, exact: true }), "누르면 고르기 목록").toHaveCount(1);
    await expect(btn, "고르기 전에는 넣을 수 없다").toBeDisabled();
    const candidateRows = sheet.locator(sel("reagent-row")).filter({ hasText: `· ${UNASSIGNED}` });
    const n = await candidateRows.count();
    expect(n, "후보 = 칸 없음 시약").toBe(before + 1);
    const otherCls = (await sheet.locator(sel("reagent-row")).filter({ hasNotText: UNASSIGNED }).allInnerTexts()).map((t) => cab.incompatible.flat().concat(["유기", "산", "염기", "산화제", "인화성", "무기염", "독성", "기타"]).find((c) => t.split("\n").map(squash).includes(c)) ?? "");
    let checked = 0;
    for (let i = 0; i < n; i++) {
      const row = candidateRows.nth(i);
      const lines = (await row.innerText()).split("\n").map(squash);
      const name = lines[0];
      const capLine = lines.find((l) => l.endsWith(`· ${UNASSIGNED}`)) ?? "";
      const cls = capLine.split(" · ")[0];
      await row.click();
      const want = expectedWarning(cls, [SLOT.chip], otherCls.filter(Boolean), PUT_NOTE);
      const mix = sheet.locator(sel("mix-warning"));
      if (want.kind === "none") {
        await expect(mix, `${name}(${cls}) → 경고 없음`).toHaveCount(0);
      } else if (want.kind === "mismatch") {
        await expect.poll(() => mixLines(mix), { message: `${name}(${cls}) → 약한 문구` }).toEqual([mismatchText(SLOT.chip)]);
      } else {
        await expect(mix).toHaveCount(1);
        const got = await mixLines(mix);
        for (const p of want.partners) expect(got.some((l) => l === dangerText(cls, p) || l === dangerText(p, cls)), `${name}(${cls}) · ${p} 강한 문구`).toBe(true);
        expect(got).toContain(PUT_NOTE);
      }
      await expect(btn, "경고가 있어도 넣을 수 있다").toBeEnabled();
      checked += 1;
      if (i < n - 1) {
        await row.click(); // 고르기 해제
        await expect(btn).toBeDisabled();
      } else {
        await btn.click();
        await expect(sheet.locator(sel("reagent-row")).filter({ hasText: name }).filter({ hasNotText: UNASSIGNED }), `${name} 이 칸으로`).toHaveCount(1);
        await expect(unassignedTitle(before), "칸 없음 목록에서 빠진다").toHaveCount(1);
        await expect(sec.locator(sel("ex-toast")).filter({ hasText: `${SLOT.title}에 넣었어요` })).toBeVisible();
      }
    }
    expect(checked).toBe(before + 1);
  });

  test("[K1][S11] slot-assign 검색: 시약명 일부로 후보를 좁힌다, 없으면 안내", async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "slot-closed");
    const sheet = sec.locator(sel("slot-sheet"));
    await sheet.locator(sel("slot-assign")).getByRole("button").click();
    const rows = sheet.locator(sel("reagent-row")).filter({ hasText: `· ${UNASSIGNED}` });
    const all = await rows.count();
    expect(all).toBeGreaterThan(1);
    const firstName = (await rows.first().innerText()).split("\n").map(squash)[0];
    await sheet.getByPlaceholder(SLOT.placeholder).fill(firstName.slice(0, 2));
    await expect.poll(() => rows.count(), { message: "좁혀진 후보" }).toBeLessThan(all + 1);
    await expect(rows.filter({ hasText: firstName })).toHaveCount(1);
    await sheet.getByPlaceholder(SLOT.placeholder).fill("없는시약이름zz");
    await expect(rows).toHaveCount(0);
    await expect(sheet.getByRole("status")).toHaveCount(1);
  });

  test("[K1][S11] 학생 칸 시트(slot-student): 목록만 — slot-assign 0 · \"빼기\" 0 · 고르기 목록 0", async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "slot-student");
    const sheet = sec.locator(sel("slot-sheet"));
    await expect(sheet).toHaveCount(1);
    await expect(sheet.locator(sel("reagent-row"))).toHaveCount(SLOT.rows.length);
    await expect(sheet.locator(sel("slot-assign"))).toHaveCount(0);
    await expect(sheet.getByText(SLOT.remove, { exact: true })).toHaveCount(0);
    await expect(sheet.getByRole("heading", { name: SLOT.pickerTitle, exact: true })).toHaveCount(0);
    await expect(sheet.locator(sel("text-input"))).toHaveCount(0);
  });

  test("[K1][S11] 빈 칸 시트(slot-empty): \"이 칸의 시약 (0)\" + 미지정 칩, slot-count 0", async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "slot-empty");
    const sheet = sec.locator(sel("slot-sheet"));
    await expect(sheet.getByRole("heading", { name: "이 칸의 시약 (0)", exact: true })).toHaveCount(1);
    await expect(sheet.locator(sel("storage-class-chip"))).toHaveText(exact("미지정"));
    await expect(sheet.locator(sel("slot-count"))).toHaveCount(0);
  });
});

// =====================================================================
// 화면 11 — QR 인쇄 (qr-print · qr-print-sheet · qr-label)
// =====================================================================
test.describe("화면 11 QR 인쇄 (rules variants 11.print · cabinet.qr_print_layout)", () => {
  const targets = (sheet: Locator) => sheet.getByRole("group", { name: /인쇄할 시약장/ }).getByRole("button");
  const labelsIn = (sheet: Locator) => sheet.locator(sel("qr-label"));

  test(`[K1][S11] 상태 11-print 예시(print-all): qr-print-sheet "${PRINT.title}" · 대상 ${PRINT.targets.map((t) => t.label).join("·")} ("모두" 선택) · qr-label ${PRINT.labels.length}개 · "${PRINT.caption}" · "${PRINT.button}" — 프레임 개수 이상`, async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "print-all");
    for (const n of rules.variants["11"].print) expect(await sec.locator(sel(n)).count(), `variants.11.print ${n}`).toBeGreaterThanOrEqual(1);
    const sheet = sec.locator(sel("qr-print-sheet"));
    await expect(sheet).toHaveCount(1);
    for (const [n, c] of Object.entries(PRINT.counts)) {
      if (n === "qr-print-sheet") continue;
      expect(await sheet.locator(sel(n)).count(), `시트 안 ${n} (프레임 ${c})`).toBeGreaterThanOrEqual(c);
    }
    await expect(sheet.getByRole("heading", { name: PRINT.title, exact: true })).toHaveCount(1);
    const t = targets(sheet);
    await expect(t).toHaveCount(PRINT.targets.length);
    expect(await t.evaluateAll((els) => els.map((el) => {
      const c = el.cloneNode(true) as Element;
      for (const n of Array.from(c.querySelectorAll('[data-component="cabinet-number"]'))) n.remove();
      return (c.textContent ?? "").replace(/\s+/g, " ").trim();
    })), "대상 pill").toEqual(PRINT.targets.map((x) => x.label));
    const pressed = await t.evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed") === "true"));
    expect(pressed, "선택 = 시안(모두)").toEqual(PRINT.targets.map((x) => HIGHLIGHTS.includes(x.selected)));
    await expect(labelsIn(sheet)).toHaveCount(PRINT.labels.length);
    await expect(sheet.getByText(PRINT.caption, { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: PRINT.button, exact: true })).toBeEnabled();
  });

  test(`[K1][S11] qr-label: 학교명 "${SCHOOL}" · cabinet-number · 시약장 이름 · "${QR_HELP}"(rules qr_label_text), 흑백만(핑크·하늘색 없음)`, async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sheet = (await area(page, "print-all")).locator(sel("qr-print-sheet"));
    for (let i = 0; i < PRINT.labels.length; i++) {
      const l = labelsIn(sheet).nth(i);
      const want = PRINT.labels[i];
      await expect(l.getByText(want.school, { exact: true }), "학교명").toHaveCount(1);
      await expect(l.locator(sel("cabinet-number")), "번호").toHaveText(exact(want.number));
      await expect(l.getByText(want.name, { exact: true }), "이름").toHaveCount(1);
      await expect(l.getByText(QR_HELP, { exact: true }), "안내").toHaveCount(1);
      expect(((await l.innerText()).match(SCHOOL_RE) ?? []), "라벨 안 학교명 1번").toEqual([SCHOOL]);
      const uses = await colorsIn(l);
      expect(using(uses, PINK_RGB), "라벨 핑크 없음").toEqual([]);
      expect(using(uses, HIGHLIGHT_RGB), "라벨 하늘색 없음").toEqual([]);
      const allowed = [...PRINT.labelColors.map(hexToRgb), "rgba(0, 0, 0, 0)"];
      const extra = uses.flatMap((u) => u.colors).filter((c) => !allowed.includes(c));
      expect([...new Set(extra)], `라벨 색 = 시안 흑백(${PRINT.labelColors.join(" ")})`).toEqual([]);
      await expect(l.locator("svg").first(), "QR 이미지").toBeVisible();
    }
  });

  test(`[K1][S11] qr-label QR 내용 = d7 §14 \`{origin}${QR_TEMPLATE[1]}?${QR_TEMPLATE[2]}={cabinet id}\` (그려진 QR 모듈 = 그 내용으로 만든 QR)`, async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sheet = (await area(page, "print-all")).locator(sel("qr-print-sheet"));
    const matrices: string[] = [];
    for (let i = 0; i < sampleCabinets.length; i++) {
      const c = sampleCabinets[i];
      const l = labelsIn(sheet).filter({ has: page.getByText(c.label, { exact: true }) });
      await expect(l).toHaveCount(1);
      const svg = l.locator("svg").first();
      const box1 = await svg.boundingBox();
      expect(Math.abs(box1!.width - box1!.height), "QR 1:1").toBeLessThanOrEqual(1);
      const matrix = await readQrMatrix(svg);
      expect(qrMatches(matrix, qrContent(SAMPLE_ORIGIN, c.id)), `${c.label} QR = ${qrContent(SAMPLE_ORIGIN, c.id)}`).toBe(true);
      for (const other of sampleCabinets.filter((o) => o.id !== c.id)) expect(qrMatches(matrix, qrContent(SAMPLE_ORIGIN, other.id)), `${c.label} QR ≠ ${other.label}`).toBe(false);
      matrices.push(JSON.stringify(matrix));
    }
    expect(new Set(matrices).size, "시약장마다 다른 QR").toBe(sampleCabinets.length);
    // 라벨 1장 예시(label)도 같은 규칙
    const single = (await area(page, "label")).locator(sel("qr-label"));
    await expect(single).toHaveCount(1);
    expect(qrMatches(await readQrMatrix(single.locator("svg").first()), qrContent(SAMPLE_ORIGIN, sampleCabinets[0].id))).toBe(true);
  });

  test("[K1][S11] 교사: 관리 줄 qr-print \"QR 인쇄\" → qr-print-sheet, 기본 대상 = 지금 시약장(라벨 1개), \"모두\" = 시약장 수만큼, × 로 닫힌다", async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "default");
    await expect(sec.locator(sel("qr-print-sheet"))).toHaveCount(0);
    for (const active of PILLS) {
      await pill(sec, active).click();
      const qr = sec.locator(sel("cabinet-edit")).locator(sel("qr-print")).getByRole("button");
      await expect(qr).toHaveText(exact("QR 인쇄"));
      await qr.click();
      const sheet = sec.locator(sel("qr-print-sheet"));
      await expect(sheet, "QR 인쇄 시트").toHaveCount(1);
      const t = targets(sheet);
      const n = await pills(sec).count();
      await expect(t, "대상 = 시약장마다 1개 + 모두").toHaveCount(n + 1);
      const pressedNames = await t.evaluateAll((els) =>
        els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => {
          const c = e.cloneNode(true) as Element;
          for (const x of Array.from(c.querySelectorAll('[data-component="cabinet-number"]'))) x.remove();
          return (c.textContent ?? "").replace(/\s+/g, " ").trim();
        }),
      );
      expect(pressedNames, `기본 대상 = 지금 시약장 "${active}" (rules qr_print_layout)`).toEqual([active]);
      await expect(labelsIn(sheet)).toHaveCount(1);
      await expect(labelsIn(sheet).getByText(active, { exact: true })).toHaveCount(1);
      await expect(sheet.getByText(`A4 한 장에 라벨 1개`, { exact: true })).toBeVisible();
      await t.filter({ hasText: exact("모두") }).click();
      await expect(labelsIn(sheet), "모두 = 시약장 수").toHaveCount(n);
      await expect(sheet.getByText(`A4 한 장에 라벨 ${n}개`, { exact: true })).toBeVisible();
      await sheet.getByRole("button", { name: "닫기" }).click();
      await expect(sec.locator(sel("qr-print-sheet")), "× 로 닫힌다").toHaveCount(0);
    }
  });

  test("[K1][S11] 인쇄 CSS: 인쇄할 때는 QR 라벨 사본만 보이고 화면(nav·시트·배치도)은 숨는다, A4 한 장 = 2열 × 4줄 8개, 넘으면 다음 장", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "default");
    // 시약장을 9개로 늘린다 (2 + 7)
    const add = sec.locator(sel("cabinet-switcher")).locator(sel("cabinet-add"));
    for (let i = 0; i < 7; i++) await add.click();
    await expect(pills(sec)).toHaveCount(9);
    await sec.locator(sel("qr-print")).getByRole("button").click();
    const sheet = sec.locator(sel("qr-print-sheet"));
    await targets(sheet).filter({ hasText: exact("모두") }).click();
    await expect(labelsIn(sheet)).toHaveCount(9);
    await expect(sheet.getByText(/2장/), "안내에 장 수").toBeVisible();
    await page.emulateMedia({ media: "print" });
    try {
      await expect(page.locator("main"), "인쇄 때 화면 본문(nav·시트·배치도)은 숨는다").toBeHidden();
      await expect(page.locator(sel("nav-pill")).first()).toBeHidden();
      await expect(page.locator(sel("qr-print-sheet")).first()).toBeHidden();
      // 보이는 라벨 = 안내 문구가 있는 상자들 (main 밖 인쇄 사본)
      const printed = await page.evaluate((help) => {
        const out: { x: number; y: number; w: number; h: number; name: string; page: number }[] = [];
        const pagesSeen: Element[] = [];
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          if (el.closest("main")) continue;
          if ((el.textContent ?? "").trim() !== help || el.children.length > 0) continue;
          const r0 = el.getBoundingClientRect();
          if (r0.width === 0 || r0.height === 0) continue;
          // 라벨 상자 = svg 를 품은 가장 가까운 조상
          let label: Element | null = el.parentElement;
          while (label && !label.querySelector("svg")) label = label.parentElement;
          if (!label) continue;
          const pg = label.parentElement!;
          if (!pagesSeen.includes(pg)) pagesSeen.push(pg);
          const r = label.getBoundingClientRect();
          out.push({ x: Math.round(r.x), y: Math.round(r.y), w: r.width, h: r.height, name: (label.textContent ?? "").replace(help, "").trim(), page: pagesSeen.indexOf(pg) });
        }
        const breaks = pagesSeen.map((p) => {
          const cs = getComputedStyle(p);
          return { after: cs.breakAfter, before: cs.breakBefore };
        });
        return { out, breaks };
      }, QR_HELP);
      // 갤러리에는 정적 인쇄 시트가 더 있다 — 방금 연 시트(마지막에 그려진 사본)의 9장만 본다
      const mine = printed.out.slice(-9);
      expect(mine.length, "인쇄 사본 라벨 9개").toBe(9);
      for (let i = 0; i < 9; i++) expect(mine[i].name, `${i + 1}번째 라벨`).toContain(`${i + 1}번 시약장`);
      const pageIds = [...new Set(mine.map((m) => m.page))];
      expect(pageIds.length, "9개 = 2장").toBe(2);
      const first = mine.filter((m) => m.page === pageIds[0]);
      const second = mine.filter((m) => m.page === pageIds[1]);
      expect(first.length, "첫 장 8개").toBe(8);
      expect(second.length, "둘째 장 1개").toBe(1);
      expect(new Set(first.map((m) => m.x)).size, "첫 장 2열").toBe(2);
      expect(new Set(first.map((m) => m.y)).size, "첫 장 4줄").toBe(4);
      const [b1] = printed.breaks.slice(pageIds[0], pageIds[0] + 1);
      const [b2] = printed.breaks.slice(pageIds[1], pageIds[1] + 1);
      expect(b1.after === "page" || b2.before === "page", `첫 장 뒤 쪽 나눔 (break-after ${b1.after} / break-before ${b2.before})`).toBe(true);
    } finally {
      await page.emulateMedia({ media: "screen" });
    }
  });

  test("[K1][S11] 화면에서는 인쇄 사본이 보이지 않는다 (라벨은 시트 미리보기에만)", async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const visibleOutsideMain = await page.evaluate((help) => {
      let n = 0;
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (el.closest("main")) continue;
        if ((el.textContent ?? "").trim() !== help || el.children.length > 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) n += 1;
      }
      return n;
    }, QR_HELP);
    expect(visibleOutsideMain).toBe(0);
  });
});

// =====================================================================
// 화면 11 — 저장 안 한 편집 확인 (ex-modal-card)
// =====================================================================
test.describe("화면 11 저장 안 한 편집 (rules cabinet.unsaved_confirm · variants 11.unsaved)", () => {
  test(`[K1][S11] 상태 11-unsaved 예시: ex-modal-card "${UNSAVED.title}" · "${UNSAVED.body}" · button-outline "${UNSAVED.discard}"(왼쪽) · button-primary "${UNSAVED.keep}"(오른쪽), 핑크·하늘색 없음`, async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "unsaved");
    for (const n of rules.variants["11"].unsaved) expect(await sec.locator(sel(n)).count(), `variants.11.unsaved ${n}`).toBeGreaterThanOrEqual(1);
    const card = sec.locator(sel("ex-modal-card"));
    await expect(card).toHaveCount(1);
    for (const [n, c] of Object.entries(UNSAVED.counts)) {
      if (n === "ex-modal-card") continue;
      await expect(card.locator(sel(n)), `카드 안 ${n}`).toHaveCount(c);
    }
    await expect(card.getByRole("heading", { name: UNSAVED.title, exact: true })).toHaveCount(1);
    await expect(card.getByText(UNSAVED.body, { exact: true })).toBeVisible();
    const discard = card.locator(sel("button-outline"));
    const keep = card.locator(sel("button-primary"));
    await expect(discard).toHaveText(exact(UNSAVED.discard));
    await expect(keep).toHaveText(exact(UNSAVED.keep));
    const d = await box(discard, "버리고 이동");
    const k = await box(keep, "계속 편집");
    expect(Math.abs(d.y - k.y), "가로 2버튼").toBeLessThanOrEqual(1);
    expect(k.x, "계속 편집이 오른쪽").toBeGreaterThanOrEqual(d.x + d.width);
    const uses = await colorsIn(card);
    expect(using(uses, PINK_RGB), "핑크 없음").toEqual([]);
    expect(using(uses, HIGHLIGHT_RGB), "하늘색 없음").toEqual([]);
  });

  test(`[K1][S11] 동작: 분류를 바꾼 채 다른 pill → 확인 카드, "${UNSAVED.keep}" = 그대로 머묾(편집 유지), "${UNSAVED.discard}" = 편집을 버리고 이동, 편집 없으면 카드 없이 이동`, async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "default");
    const card = sec.locator(sel("ex-modal-card"));
    // 편집 없음 → 바로 이동
    await pill(sec, PILLS[1]).click();
    await expect(card, "편집 없으면 카드 없음").toHaveCount(0);
    await expect(sec.getByRole("heading", { name: PILLS[1], exact: true })).toHaveCount(1);
    await pill(sec, PILLS[0]).click();
    await expect(sec.getByRole("heading", { name: PILLS[0], exact: true })).toHaveCount(1);
    // 좌1단(선택 칸) 분류를 바꾼다
    const first = board(sec).first();
    const original = await textWithout(first, ["slot-count"]);
    const chip = sec.locator(`button${sel("storage-class-chip")}`).filter({ hasText: exact("기타") });
    await chip.click();
    await expect.poll(() => textWithout(first, ["slot-count"]), { message: "바꾼 라벨" }).not.toBe(original);
    const edited = await textWithout(first, ["slot-count"]);
    // 다른 pill → 확인 카드
    await pill(sec, PILLS[1]).click();
    await expect(card, "저장 안 한 편집 → 확인 카드").toHaveCount(1);
    await expect(card.getByRole("heading", { name: UNSAVED.title, exact: true })).toHaveCount(1);
    await expect(card.getByText(UNSAVED.body, { exact: true })).toBeVisible();
    await expect(sec.getByRole("heading", { name: PILLS[0], exact: true }), "카드가 떠 있는 동안 아직 지금 시약장").toHaveCount(1);
    // 계속 편집
    await card.getByRole("button", { name: UNSAVED.keep, exact: true }).click();
    await expect(card).toHaveCount(0);
    await expect(sec.getByRole("heading", { name: PILLS[0], exact: true }), "계속 편집 = 머문다").toHaveCount(1);
    expect(await textWithout(first, ["slot-count"]), "편집 내용 유지").toBe(edited);
    // 다시 → 버리고 이동
    await pill(sec, PILLS[1]).click();
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: UNSAVED.discard, exact: true }).click();
    await expect(card).toHaveCount(0);
    await expect(sec.getByRole("heading", { name: PILLS[1], exact: true }), "버리고 이동 = 누른 시약장으로").toHaveCount(1);
    // 돌아오면 바꾸기 전 그대로 (카드 없이)
    await pill(sec, PILLS[0]).click();
    await expect(card, "버린 뒤에는 편집 없음").toHaveCount(0);
    await expect.poll(() => textWithout(board(sec).first(), ["slot-count"]), { message: "편집이 버려졌다" }).toBe(original);
  });

  test("[K1][S11] 동작 예시(unsaved-flow): 편집 중 다른 시약장을 누른 상태 = 확인 카드가 열려 있다", async ({ page }) => {
    await open(page, "/gallery/cabinets");
    const sec = await area(page, "unsaved-flow");
    const card = sec.locator(sel("ex-modal-card"));
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("heading", { name: UNSAVED.title, exact: true })).toHaveCount(1);
    await card.getByRole("button", { name: UNSAVED.discard, exact: true }).click();
    await expect(sec.getByRole("heading", { name: PILLS[1], exact: true })).toHaveCount(1);
  });
});

// =====================================================================
// 화면 11 — 데스크탑 2단 · 모바일 한 열 (시안 11-desktop · 11-mobile)
// =====================================================================
test("[K1][S11] 배치: 데스크탑 = 왼쪽 배치도 열 · 오른쪽 편집 카드(폭 비율 = 시안 11-desktop), 모바일 = 한 열(관리 줄 → 배치도 → 칩 → 주의사항 → 칸 없음)", async ({ page }) => {
  await open(page, "/gallery/cabinets");
  const sec = await area(page, "default");
  const edit = sec.locator(sel("cabinet-edit"));
  const sw = await box(sec.locator(sel("cabinet-switcher")), "switcher");
  const e = await box(edit, "cabinet-edit");
  const firstSlot = await box(board(sec).first(), "첫 칸");
  const lastSlot = await box(board(sec).last(), "마지막 칸");
  const unassigned = await box(sec.getByRole("heading", { name: new RegExp(`^${esc(UNASSIGNED)} 시약`) }), "칸 없음 제목");
  if (isMobile(page)) {
    const rename = await box(edit.getByRole("button", { name: "이름 바꾸기", exact: true }), "이름 바꾸기");
    const chip = await box(sec.locator(`button${sel("storage-class-chip")}`).first(), "첫 칩");
    const mix = await box(sec.locator(sel("mix-warning")), "mix-warning");
    expect(rename.y + rename.height, "관리 줄 → 배치도").toBeLessThanOrEqual(firstSlot.y);
    expect(lastSlot.y + lastSlot.height, "배치도 → 칩").toBeLessThanOrEqual(chip.y);
    expect(chip.y, "칩 → 주의사항").toBeLessThan(mix.y);
    expect(mix.y + mix.height, "주의사항 → 칸 없음").toBeLessThanOrEqual(unassigned.y);
  } else {
    const frameCol = F11D.find((n) => leaf(n) === "layout-column")!.width!;
    const frameEdit = F11D.find((n) => leaf(n) === "cabinet-edit")!.width!;
    expect(e.x, "편집 카드는 배치도 오른쪽").toBeGreaterThanOrEqual(lastSlot.x + lastSlot.width);
    expect(e.x, "편집 카드는 switcher 오른쪽").toBeGreaterThanOrEqual(sw.x + sw.width);
    expect(unassigned.x + unassigned.width, "칸 없음 목록은 왼쪽 열").toBeLessThanOrEqual(e.x);
    expect(Math.abs(e.y - sw.y), "편집 카드 위쪽 = 왼쪽 열 위쪽").toBeLessThanOrEqual(sw.height);
    const ratio = e.width / sw.width;
    expect(Math.abs(ratio - frameEdit / frameCol) / (frameEdit / frameCol), `편집 카드 : 왼쪽 열 폭 비율 ≈ 시안 ${frameEdit}:${frameCol}`).toBeLessThanOrEqual(0.15);
    for (const n of ["cabinet-door-select", "cabinet-shelf-select", "mix-warning", "button-primary"]) {
      const b = await box(edit.locator(sel(n)).first(), n);
      expect(b.x, `${n} 은 편집 카드 안`).toBeGreaterThanOrEqual(e.x);
      expect(b.x + b.width, `${n} 은 편집 카드 안`).toBeLessThanOrEqual(e.x + e.width + 1);
    }
  }
});

// =====================================================================
// 화면 3 — reagent-location · location-edit · location-picker
// =====================================================================
test.describe("화면 3 보관 위치 (/gallery/placement)", () => {
  test(`[K1][S3] reagent-location(교사): "${LOC.label}" + cabinet-number "${LOC.number}" + "${LOC.value}", 오른쪽 location-edit "${LOC.edit}"(높이 ≥ ${MIN_H})`, async ({ page }) => {
    await open(page, "/gallery/placement");
    const sec = await area(page, "teacher");
    for (const n of rules.screens_required["3"]) await expect(sec.locator(sel(n)), `screens_required 3 ${n}`).toHaveCount(1);
    const row = sec.locator(sel("reagent-location"));
    await expect(row.getByText(LOC.label, { exact: true })).toBeVisible();
    await expect(row.locator(sel("cabinet-number"))).toHaveText(exact(LOC.number));
    await expect(row.getByText(LOC.value, { exact: true })).toBeVisible();
    const nb = await box(row.locator(sel("cabinet-number")), "번호");
    const vb = await box(row.getByText(LOC.value, { exact: true }), "값");
    expect(nb.x + nb.width, "번호는 값 앞").toBeLessThanOrEqual(vb.x + 1);
    const edit = row.locator(sel("location-edit"));
    await expect(edit, "location-edit 1개").toHaveCount(1);
    const btn = edit.getByRole("button", { name: LOC.edit, exact: true });
    await expect(btn).toBeEnabled();
    expect((await box(btn, "위치 바꾸기")).height).toBeGreaterThanOrEqual(MIN_H);
    expect((await box(btn, "위치 바꾸기")).x, "location-edit 는 값 오른쪽").toBeGreaterThan(vb.x);
    expect(using(await colorsIn(row), PINK_RGB), "보관 위치 줄 핑크 없음").toEqual([]);
  });

  test(`[K1][S3] reagent-location: 칸이 없으면 "${UNASSIGNED}"(회색, 번호 원 없음)`, async ({ page }) => {
    await open(page, "/gallery/placement");
    const row = (await area(page, "unassigned")).locator(sel("reagent-location"));
    await expect(row.getByText(UNASSIGNED, { exact: true })).toBeVisible();
    await expect(row.locator(sel("cabinet-number"))).toHaveCount(0);
    expect(await row.getByText(UNASSIGNED, { exact: true }).evaluate((el) => getComputedStyle(el).color), "칸 없음 = 회색 (s2-spec #707070 = 프레임 라벨 색)").toBe(hexToRgb(LOC.labelFill));
  });

  test(`[K1][S3] variants 3.location 예시(picker): location-picker "${PICKER.title}" · caption "${PICKER.caption}" · 전환 pill(번호, cabinet-add 없음) "${PICKER.active}" 활성 · 칸 ${PICKER.slots.length}개 · slot-count · "${PICKER.unassign}" · 규칙대로 mix-warning · "${PICKER.save}" 활성 · 추천(d7 §17): 소제목 "추천"·"전체", 추천 줄(번호 ${PICKER.suggestRow.number} · "${PICKER.suggestRow.value}" · suggest-badge), 추천 칸에 suggest-badge · 처음 선택 = 추천 칸 — 프레임 개수 이상`, async ({ page }) => {
    await open(page, "/gallery/placement");
    const sec = await area(page, "picker");
    for (const n of rules.variants["3"].location) expect(await sec.locator(sel(n)).count(), `variants.3.location ${n}`).toBeGreaterThanOrEqual(1);
    const p = sec.locator(sel("location-picker"));
    await expect(p).toHaveCount(1);
    for (const [n, c] of Object.entries(PICKER.counts)) {
      if (n === "location-picker") continue;
      expect(await p.locator(sel(n)).count(), `피커 안 ${n} (프레임 ${c})`).toBeGreaterThanOrEqual(c);
    }
    await expect(p.getByRole("heading", { name: PICKER.title, exact: true })).toHaveCount(1);
    await expect(p.getByText(PICKER.caption, { exact: true })).toBeVisible();
    await expect(p.getByRole("button", { name: "닫기" }), "× 닫기").toHaveCount(0); // 갤러리 정적 예시는 onClose 없음 — 동작 데모에서 확인
    expect(await pillNames(p)).toEqual(PICKER.pills);
    await expect(p.locator(sel("cabinet-add")), "피커 안 cabinet-add 없음").toHaveCount(0);
    for (let i = 0; i < PICKER.pills.length; i++) {
      expect(await isActivePaint(pills(p).nth(i)), `${PICKER.pills[i]} 활성 표시`).toBe(PICKER.pills[i] === PICKER.active);
    }
    const s = slots(p);
    await expect(s).toHaveCount(PICKER.slots.length);
    for (let i = 0; i < PICKER.slots.length; i++) {
      // 칸 글자 = 분류 (추천 칸의 suggest-badge "추천" 글자는 빼고) · 추천 칸에만 suggest-badge 1개
      expect(await textWithout(s.nth(i), ["slot-count", "suggest-badge"]), `${i + 1}번째 칸`).toBe(PICKER.slots[i].label);
      await expect(s.nth(i).locator(sel("suggest-badge")), `${i + 1}번째 칸 suggest-badge (시안 추천 칸만)`).toHaveCount(PICKER.slots[i].suggested ? 1 : 0);
      const c = s.nth(i).locator(sel("slot-count"));
      if (PICKER.slots[i].count === 0) await expect(c).toHaveCount(0);
      else await expect(c).toHaveText(exact(String(PICKER.slots[i].count)));
    }
    // 고른 칸 = 시안의 선택 칸 = 추천 칸 (d7 §17 처음 선택)
    await page.mouse.move(0, 0);
    const activeAt: number[] = [];
    for (let i = 0; i < PICKER.slots.length; i++) if (await isActivePaint(s.nth(i))) activeAt.push(i);
    expect(activeAt, "선택 표시 칸 = 시안의 선택 칸").toEqual(PICKER.slots.flatMap((x, i) => (HIGHLIGHTS.includes(x.selected) ? [i] : [])));
    expect(activeAt.map((i) => PICKER.slots[i].suggested), "처음 선택 = 추천 칸").toEqual([true]);
    // 추천 줄: 소제목 "추천" 아래 번호 원 + 위치 글자 + suggest-badge, 그 아래 "전체"
    for (const t of PICKER.sectionTitles) await expect(p.getByText(t, { exact: true }).first(), `소제목 "${t}"`).toBeVisible();
    const row = p.getByRole("button", { name: new RegExp(`추천 위치 .*${esc(PICKER.suggestRow.value)}`) });
    await expect(row, "추천 줄 (누르면 그 칸 선택)").toHaveCount(1);
    await expect(row.locator(sel("cabinet-number")), "추천 줄 번호 원").toHaveText(exact(PICKER.suggestRow.number));
    await expect(row.getByText(PICKER.suggestRow.value, { exact: true }), "추천 줄 위치 글자").toBeVisible();
    await expect(row.locator(sel("suggest-badge")), "추천 줄 suggest-badge").toHaveText(exact(PICKER.suggestRow.badge));
    const rb = await box(row, "추천 줄");
    const sw = await box(p.locator(sel("cabinet-switcher")), "전환");
    expect(rb.y + rb.height, "추천 줄은 시약장 전환 위").toBeLessThanOrEqual(sw.y + 1);
    expect(await sec.locator(sel("suggest-badge")).count(), "suggest-badge = 시안 수 (추천 줄 + 추천 칸)").toBe(PICKER.counts["suggest-badge"]);
    const unassign = p.getByRole("button", { name: PICKER.unassign, exact: true });
    await expect(unassign, `"${PICKER.unassign}" 조용한 텍스트 동작`).toHaveCount(1);
    expect((await box(unassign, "칸 없음으로")).height).toBeGreaterThanOrEqual(MIN_H);
    const unassignPaint = await unassign.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, bw: getComputedStyle(el).borderTopWidth }));
    expect(["rgba(0, 0, 0, 0)", "transparent"], "칸 없음으로 = 채움 없음").toContain(unassignPaint.bg);
    expect(parseFloat(unassignPaint.bw), "칸 없음으로 = 테두리 없음").toBe(0);
    // 1.17 시안에는 피커 mix-warning 이 없다(추천 칸을 고른 상태). 갤러리 예시는 고른 칸에 대해 d7 §14 규칙대로 경고해야 한다.
    {
      const [, cls] = PICKER.caption.split(" · ");
      let chosen = "";
      for (let i = 0; i < PICKER.slots.length; i++) if (await isActivePaint(s.nth(i))) chosen = await textWithout(s.nth(i), ["slot-count", "suggest-badge"]);
      const want = expectedWarning(cls, chosen === "미지정" ? [] : chosen.split(" · "), [], "");
      const mix = p.locator(sel("mix-warning"));
      if (want.kind === "none") await expect(mix, `${cls} → ${chosen}: 경고 없음`).toHaveCount(0);
      else if (want.kind === "mismatch") expect((await mixLines(mix))[0], `${cls} → ${chosen}: 약한 문구`).toBe(mismatchText(chosen));
      else {
        const got = await mixLines(mix);
        for (const q of want.partners) expect(got.some((l) => l === dangerText(cls, q) || l === dangerText(q, cls)), `${cls}·${q} 강한 문구`).toBe(true);
      }
    }
    await expect(p.locator(sel("button-primary")), `"${PICKER.save}"`).toHaveText(exact(PICKER.save));
    await expect(p.locator(sel("button-primary")), "경고가 있어도 저장 가능").toBeEnabled();
  });

  test("[K1][S3] location-picker: 칸을 고르기 전에는 저장 비활성·경고 없음, 칸을 고르면 규칙대로 경고·저장 활성, 시약장을 바꾸면 고른 칸이 풀린다", async ({ page }) => {
    await open(page, "/gallery/placement");
    const p = (await area(page, "picker-empty")).locator(sel("location-picker"));
    const save = p.locator(sel("button-primary"));
    await expect(save, "칸을 고르기 전").toBeDisabled();
    await expect(p.locator(sel("mix-warning"))).toHaveCount(0);
    const [, cls] = PICKER.caption.split(" · ");
    // 2번 시약장으로 바꿔 칸마다 눌러 본다
    await pill(p, PICKER.active).click();
    const s = slots(p);
    const n = await s.count();
    expect(n).toBe(PICKER.slots.length);
    for (let i = 0; i < n; i++) {
      await s.nth(i).click();
      const label = await textWithout(s.nth(i), ["slot-count"]);
      const slotClasses = label === "미지정" ? [] : label.split(" · ");
      const want = expectedWarning(cls, slotClasses, [], SAVE_NOTE);
      const mix = p.locator(sel("mix-warning"));
      if (want.kind === "none") {
        // 칸 안 다른 시약과 위험 조합일 수 있다 — 강한 문구가 있다면 칸 분류가 아닌 칸 안 시약 때문이어야 한다
        if ((await mix.count()) > 0) expect((await mixLines(mix)).some((l) => /^이 칸은/.test(l)), `${label}: 약한 문구는 없다`).toBe(false);
      } else if (want.kind === "mismatch") {
        await expect.poll(async () => ((await mix.count()) ? (await mixLines(mix))[0] : ""), { message: `${label}: 약한 문구` }).toBe(mismatchText(label));
      } else {
        const got = await mixLines(mix);
        for (const q of want.partners) expect(got.some((l) => l === dangerText(cls, q) || l === dangerText(q, cls)), `${label}: ${cls}·${q}`).toBe(true);
        // 보조 줄 문구 대조는 시안 원본이 생기는 다음 run 에서 (SAVE_NOTE null) — 지금은 강한 문구 뒤 보조 줄 1개
        if (SAVE_NOTE !== null) expect(got).toContain(SAVE_NOTE);
        else expect(got.length, `${label}: 강한 문구 ${want.partners.length}줄 + 보조 줄`).toBe(want.partners.length + 1);
      }
      await expect(save, `${label} 고름 → 저장 가능`).toBeEnabled();
    }
    // 시약장을 바꾸면 고른 칸이 풀려 저장 비활성
    await pill(p, PICKER.pills.find((x) => x !== PICKER.active)!).click();
    await expect(save, "시약장을 바꾸면 다시 고르기 전").toBeDisabled();
  });

  test(`[K1][S3] 동작 데모: location-edit → 피커 → 칸 고르고 저장 = 보관 위치가 바뀌고 토스트, "${PICKER.unassign}" = "${UNASSIGNED}", × 로 닫힌다`, async ({ page }) => {
    await open(page, "/gallery/placement");
    const sec = await area(page, "demo");
    const row = sec.locator(sel("reagent-location"));
    await expect(row.getByText(LOC.value, { exact: true })).toBeVisible();
    await row.locator(sel("location-edit")).getByRole("button").click();
    const p = sec.locator(sel("location-picker"));
    await expect(p, "위치 피커").toHaveCount(1);
    // × 닫기
    await p.getByRole("button", { name: "닫기" }).click();
    await expect(p).toHaveCount(0);
    await row.locator(sel("location-edit")).getByRole("button").click();
    await pill(p, PICKER.active).click();
    const target = slots(p).filter({ hasText: "유기" }).first();
    await target.click();
    await p.locator(sel("button-primary")).click();
    await expect(p, "저장하면 닫힌다").toHaveCount(0);
    const number = String(PICKER.pills.indexOf(PICKER.active) + 1);
    await expect(row.locator(sel("cabinet-number")), "새 위치 번호").toHaveText(exact(number));
    await expect(row.getByText(`${PICKER.active} · 좌 2단`, { exact: true }), "새 위치 문구").toBeVisible();
    await expect(sec.locator(sel("ex-toast")).filter({ hasText: "보관 위치를 바꿨어요" })).toBeVisible();
    // 칸 없음으로
    await row.locator(sel("location-edit")).getByRole("button").click();
    await p.getByRole("button", { name: PICKER.unassign, exact: true }).click();
    await expect(row.getByText(UNASSIGNED, { exact: true })).toBeVisible();
    await expect(row.locator(sel("cabinet-number"))).toHaveCount(0);
  });
});

// =====================================================================
// 화면 3 — reorder-threshold · threshold-edit
// =====================================================================
test.describe("화면 3 재주문 기준 (rules reorder.threshold_edit · d7 §14)", () => {
  test(`[K1][S3] reorder-threshold(교사): "${THR.label}" + "${THR.value}" + 연필 threshold-edit(이름 있음, 누름 영역 ≥ ${MIN_H}, 하늘색 아이콘만)`, async ({ page }) => {
    await open(page, "/gallery/placement");
    const row = (await area(page, "teacher")).locator(sel("reorder-threshold"));
    await expect(row.getByText(THR.label, { exact: true })).toBeVisible();
    await expect(row.getByText(THR.value, { exact: true })).toBeVisible();
    const edit = row.locator(sel("threshold-edit"));
    await expect(edit).toHaveCount(1);
    const btn = edit.getByRole("button");
    await expect(btn).toHaveCount(1);
    await expect(btn).toHaveAccessibleName(/재주문 기준/);
    const b = await box(btn, "연필");
    expect(b.height).toBeGreaterThanOrEqual(MIN_H);
    expect(b.width).toBeGreaterThanOrEqual(MIN_H);
    expect(b.x, "연필은 값 오른쪽").toBeGreaterThan((await box(row.getByText(THR.value, { exact: true }), "값")).x);
    const uses = await colorsIn(edit);
    expect(using(uses, PINK_RGB)).toEqual([]);
    expect(uses.filter((u) => !u.where.startsWith("svg") && !u.where.startsWith("path") && u.colors.some((c) => HIGHLIGHT_RGB.includes(c))).map((u) => u.where), "하늘색은 아이콘에만").toEqual([]);
  });

  test("[K1][S3] reorder-threshold 문구 두 형태: \"재주문 기준 N\" 값 · 화면 5 근거 \"1반 1회 실험량 … × …조 기준\", 기준이 없으면 \"아직 없어요\"", async ({ page }) => {
    await open(page, "/gallery/placement");
    const basis = (await area(page, "basis")).locator(sel("reorder-threshold"));
    const text = squash(await basis.innerText());
    expect(text).toMatch(/1반 1회 실험량 .+ × \d+조 기준/);
    expect(text).toContain("60");
    const none = (await area(page, "unassigned")).locator(sel("reorder-threshold"));
    await expect(none.getByText("아직 없어요", { exact: true })).toBeVisible();
  });

  test("[K1][S3] threshold-edit 입력 중 예시: 숫자 입력(단위 suffix) · \"0이면 …\" 안내 · button-primary \"저장\" · button-outline \"취소\"", async ({ page }) => {
    await open(page, "/gallery/placement");
    const form = (await area(page, "threshold-editing")).locator(sel("threshold-edit"));
    const input = form.getByRole("textbox", { name: /재주문 기준/ });
    await expect(input).toHaveValue("3");
    await expect(form.getByText("병", { exact: true }), "단위 suffix").toBeVisible();
    await expect(form.getByText(/^0이면 .*알림/), "0 = 알림 없음 안내 (d7 §14)").toBeVisible();
    await expect(form.locator(sel("button-primary"))).toHaveText(exact("저장"));
    await expect(form.locator(sel("button-outline"))).toHaveText(exact("취소"));
    expect(using(await colorsIn(form), PINK_RGB)).toEqual([]);
  });

  test("[K1][S3] threshold-edit 오류 예시: 음수 → 입력 아래 안내(핑크 아님), 저장 비활성", async ({ page }) => {
    await open(page, "/gallery/placement");
    const form = (await area(page, "threshold-error")).locator(sel("threshold-edit"));
    await expect(form.getByRole("textbox")).toHaveValue("-1");
    const text = squash(await form.innerText());
    expect(text).toMatch(/0 이상/);
    expect(text, "0 은 허용 — '1 이상' 안내 금지 (d7 §14)").not.toMatch(/1 이상/);
    expect(using(await colorsIn(form), PINK_RGB), "오류 안내 핑크 금지").toEqual([]);
  });

  test("[K1][S3] 동작 데모: 연필 → 입력 → 빈 값·음수·문자·지수는 안내 + 저장 비활성, 0 저장 = \"아직 없어요\"(알림 없음), 5 저장 = \"5병\" + 토스트, 취소·Esc = 그대로", async ({ page }) => {
    await open(page, "/gallery/placement");
    const sec = await area(page, "demo");
    const row = sec.locator(sel("reorder-threshold"));
    const pencil = () => row.locator(sel("threshold-edit")).getByRole("button", { name: /재주문 기준/ });
    await pencil().click();
    const input = row.getByRole("textbox", { name: /재주문 기준/ });
    await expect(input, "연필을 누르면 입력").toBeFocused();
    const save = row.locator(sel("button-primary"));
    for (const bad of ["", "-1", "abc", "1e3", "1,000", "1.2345"]) {
      await input.fill(bad);
      await expect(save, `"${bad}" → 저장 비활성`).toBeDisabled();
      expect(squash(await row.innerText()), `"${bad}" → 안내`).not.toBe("");
    }
    // 취소 → 그대로
    await row.locator(sel("button-outline")).click();
    await expect(row.getByText(THR.value, { exact: true }), "취소하면 그대로").toBeVisible();
    // Esc → 그대로
    await pencil().click();
    await input.fill("9");
    await page.keyboard.press("Escape");
    await expect(row.getByText(THR.value, { exact: true }), "Esc 면 그대로").toBeVisible();
    // 0 = 알림 없음
    await pencil().click();
    await input.fill("0");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(row.getByText("아직 없어요", { exact: true }), "0 저장 = 기준 없음").toBeVisible();
    // 5
    await pencil().click();
    await input.fill("5");
    await save.click();
    await expect(row.getByText("5병", { exact: true })).toBeVisible();
    await expect(sec.locator(sel("ex-toast")).filter({ hasText: "재주문 기준을 5병으로 바꿨어요" })).toBeVisible();
  });
});

// =====================================================================
// R5 · R7: 학생 예시에는 쓰기 컴포넌트 0
// =====================================================================
test(`[K1][S11] 학생 예시(/gallery/cabinets student · empty-student · slot-student): ${STUDENT_ZERO.join("·")} = 0 (rules R5·R7)`, async ({ page }) => {
  expect(R5.role).toBe("학생");
  expect(R7.role).toBe("학생");
  await open(page, "/gallery/cabinets");
  for (const id of ["student", "empty-student", "slot-student"]) {
    const sec = await area(page, id);
    for (const n of STUDENT_ZERO) await expect(sec.locator(sel(n)), `${id} ${n}`).toHaveCount(0);
    await expect(sec.getByRole("button", { name: "QR 인쇄", exact: true }), `${id} "QR 인쇄"`).toHaveCount(0);
  }
  // 학생 화면에서 칸을 눌러 칸 시트를 열어도 0
  const sec = await area(page, "student");
  await board(sec).first().click();
  await expect(sec.locator(sel("slot-sheet"))).toHaveCount(1);
  for (const n of STUDENT_ZERO) await expect(sec.locator(sel(n)), `칸 시트를 연 뒤 ${n}`).toHaveCount(0);
});

test(`[K1][S3] 학생 예시(/gallery/placement student): ${STUDENT_ZERO.join("·")} = 0 (rules R5·R7), 보관 위치·재주문 기준 값은 보인다`, async ({ page }) => {
  await open(page, "/gallery/placement");
  const sec = await area(page, "student");
  for (const n of STUDENT_ZERO) await expect(sec.locator(sel(n)), `학생 ${n}`).toHaveCount(0);
  await expect(sec.getByRole("button", { name: "위치 바꾸기", exact: true })).toHaveCount(0);
  await expect(sec.getByRole("button", { name: /재주문 기준/ })).toHaveCount(0);
  await expect(sec.locator(sel("reagent-location")).getByText(LOC.value, { exact: true })).toBeVisible();
  await expect(sec.locator(sel("reagent-location")).locator(sel("cabinet-number"))).toHaveText(exact(LOC.number));
  await expect(sec.locator(sel("reorder-threshold")).getByText(THR.value, { exact: true })).toBeVisible();
});

// =====================================================================
// nav-account-menu (rules app_exceptions · d7 §10)
// =====================================================================
test.describe("nav-account-menu (학교명 옆 ▾ — 로그아웃 메뉴)", () => {
  test("[K1][S13] 기대값 원본: rules app_exceptions nav-account-menu = 학교명 옆 ▾ · '로그아웃' 1개, 시안 13 nav-pill > nav-account 안 school-name 옆", () => {
    expect(rules.app_exceptions["nav-account-menu"]).toMatch(/▾/);
    expect(rules.app_exceptions["nav-account-menu"]).toMatch(/로그아웃' 1개/);
    const f13 = loadFrame("13-mobile");
    const acc = under(f13, "nav-account");
    expect(acc.map(leaf)).toEqual(expect.arrayContaining(["school-name", "nav-account-menu"]));
    expect(firstText(acc, "school-name")).toBe(SCHOOL);
    expect(acc.findIndex((n) => leaf(n) === "school-name"), "학교명 → ▾ 순서").toBeLessThan(acc.findIndex((n) => leaf(n) === "nav-account-menu"));
  });

  for (const [path, id] of [
    ["/gallery/cabinets", "logout"],
    ["/gallery/placement", "account-menu"],
    ["/gallery/manual", "account-menu"],
    ["/gallery/reorder", "account-menu"],
    ["/gallery/vendors", "account-menu"],
  ] as const) {
    test(`[K1][S13] ${path} (${id}): nav-account-menu ▾ 는 학교명 버튼(aria-haspopup=menu) 안, 학교명 1번, 누르면 role=menu · menuitem "로그아웃" 1개`, async ({ page }) => {
      await open(page, path);
      const sec = await area(page, id);
      const caret = sec.locator(sel("nav-account-menu"));
      await expect(caret, "nav-account-menu 1개").toHaveCount(1);
      expect(await caret.locator("svg").count(), "▾ 아이콘").toBeGreaterThanOrEqual(1);
      const button = sec.getByRole("button", { name: new RegExp(esc(SCHOOL)) });
      await expect(button, "학교명 버튼").toHaveCount(1);
      expect(await caret.evaluate((el) => el.closest("button")?.getAttribute("aria-haspopup")), "▾ 는 메뉴 버튼 안").toBe("menu");
      await expect(button).toHaveAttribute("aria-expanded", "false");
      expect(((await sec.innerText()).match(SCHOOL_RE) ?? []), "학교명 1번").toEqual([SCHOOL]);
      const b = await box(button.getByText(SCHOOL, { exact: true }), "학교명");
      const c = await box(caret, "▾");
      expect(c.x, "▾ 는 학교명 오른쪽").toBeGreaterThanOrEqual(b.x + b.width - 1);
      expect(using(await colorsIn(caret), [...PINK_RGB, ...HIGHLIGHT_RGB]), "▾ 하늘색·핑크 없음").toEqual([]);
      await expect(sec.getByRole("menu")).toHaveCount(0);
      await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      const menu = sec.getByRole("menu");
      await expect(menu).toHaveCount(1);
      await expect(menu.getByRole("menuitem")).toHaveCount(1);
      await expect(menu.getByRole("menuitem")).toHaveText(exact("로그아웃"));
      expect(((await sec.innerText()).match(SCHOOL_RE) ?? []), "열려도 학교명 1번 (메뉴에 학교 목록 없음)").toEqual([SCHOOL]);
      await page.keyboard.press("Escape");
      await expect(sec.getByRole("menu")).toHaveCount(0);
    });
  }

  test("[K1][S13] /gallery (K1 기준 페이지): nav-account-menu 1개 이상", async ({ page }) => {
    await open(page, "/gallery");
    expect(await page.locator(sel("nav-account-menu")).count()).toBeGreaterThanOrEqual(1);
  });
});
