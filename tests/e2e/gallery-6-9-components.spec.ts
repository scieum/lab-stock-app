// 화면 6 (재주문 알림) · 화면 9 (판매처 설정) 새 컴포넌트의 컴포넌트 수준 동작 — 갤러리(/gallery/reorder, /gallery/vendors, /gallery · 비로그인 공개) 대상.
// 기준: 디자인 run 20261002-1441 s2-spec "## 화면 6" · "## 화면 9", harness/d7-data.md §11(재주문 알림) · §12(판매처 설정),
//       harness/dev-rules.json components·components_note·routes, design/rules.json roles(R1·R2·R3)·colors·button.
// 기대값: 개수·문구·채움색은 design/frames/6-desktop.json · 6-mobile.json · 9-desktop.json · 9-mobile.json 노드에서,
//         역할·색 범위·버튼 높이는 design/rules.json 에서, 컴포넌트 목록·경로는 harness/dev-rules.json 에서 읽는다 (구현에서 읽지 않는다).
//         프레임에 없는 상태(알림 0건 · 판매처 0개 · 삭제 확인 · 판매처 0건 · 공통 목록 · 삭제 토스트) 문구는 d7-data.md §11·§12 문장에 있는 상수다
//         (아래 "기대값 원본" 테스트가 d7-data.md 에 그 문구가 있는지 확인한다).
// 태그: [K1] 은 dev-rules test_rules 에 없으므로 judge 의 규칙별 e2e 집계에 섞이지 않는다. [S6]·[S9] 로 화면 6·9 실행에 포함된다.
// /reorder · /vendors 화면(D3)·DB(D2) 검사는 여기서 하지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const S6 = 6;
const S9 = 9;
const GALLERY = "/gallery";
const GALLERY_REORDER = "/gallery/reorder";
const GALLERY_VENDORS = "/gallery/vendors";

type FrameNode = { name: string; type: string; path: string[]; fills: string[]; strokes: string[]; text: { characters: string } | null };
type Frame = { frames: { name: string; nodes: FrameNode[] }[] };
type Rules = {
  reorder: { card_text: string };
  colors: {
    accent: { value: string; only_within: string[] };
    accent_soft: { value: string; only_within: string[] };
    highlight: { values: string[]; forbidden_within: string[] };
  };
  button: { min_height: number };
  roles: {
    R1: { role: string; component: string; max: number };
    R2: { role: string; components: string[]; max: number };
    R3: { component: string; only_roles: string[] };
  };
  tab_bar: { component: string; item: string };
};
type Dev = { components: Record<string, number[]>; routes: Record<string, string>; mvp_screens: number[] };

const root = process.cwd();
const rules = JSON.parse(readFileSync(join(root, "design/rules.json"), "utf8")) as Rules;
const dev = JSON.parse(readFileSync(join(root, "harness/dev-rules.json"), "utf8")) as Dev;
const D7 = readFileSync(join(root, "harness/d7-data.md"), "utf8");
const loadFrame = (name: string) => (JSON.parse(readFileSync(join(root, `design/frames/${name}.json`), "utf8")) as Frame).frames[0].nodes;
/** 시안 1.17 프레임 (d7 §18 로 바뀐 부분만) */
const loadFrame117 = (name: string) => (JSON.parse(readFileSync(join(root, `design/frames/${name}.json`), "utf8")) as Frame).frames[0].nodes;
const d6 = loadFrame(`${S6}-desktop`);
const m6 = loadFrame(`${S6}-mobile`);
const d9 = loadFrame(`${S9}-desktop`);
const m9 = loadFrame(`${S9}-mobile`);

// ---------- 기대값: 프레임 ----------
type Group = { node: FrameNode; children: FrameNode[] };
const leaf = (n: FrameNode) => n.path[n.path.length - 1];
const parentName = (n: FrameNode) => n.path[n.path.length - 2];
const lower = (s: string | undefined) => (s ?? "").toLowerCase();
const under = (nodes: FrameNode[], ancestor: string) => nodes.filter((n) => n.path.slice(0, -1).includes(ancestor));
const texts = (nodes: FrameNode[], name: string) => nodes.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);
/** 노드 목록(깊이 우선 순서)을 leafName 노드마다 { 자신, 자손들 } 로 묶는다 */
function groups(nodes: FrameNode[], leafName: string): Group[] {
  const out: Group[] = [];
  let cur: Group | null = null;
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
const textIn = (g: Group, name: string, parent?: string) =>
  g.children.find((c) => c.name === name && c.text && (parent === undefined || parentName(c) === parent))?.text?.characters ?? "";
const labelOf = (g: Group | undefined) => (g ? textIn(g, "label") : "");

// 화면 6 카드 문구 틀 (d7 §11 · rules.json reorder.card_text 1.21) — 아래 "기대값 원본" 테스트가 두 문서에 있는지 확인한다
const NEED = "재주문 기준";
const STOCK = "현재 재고";
const D7_CARD_TEMPLATE = `"${NEED} {min_stock}{unit} / ${STOCK} {stock}{unit}"`;
const D7_DATE_TEMPLATE = `"M월 D일 알림"(한국 시간, 올해가 아니면 "YYYY년 M월 D일 알림"`;
const RULES_CARD_QUOTES = [`'${NEED} N{단위}'`, "'10월 7일 알림'"];
/** 지금 한국 시간의 해 (갤러리 예시 날짜가 올해인지 가른다) */
const KST_YEAR = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
/** d7 §11 날짜 문구: 올해면 "M월 D일 알림", 아니면 "YYYY년 M월 D일 알림" */
const alertDate = (y: number, m: number, d: number) => `${y === KST_YEAR ? "" : `${y}년 `}${m}월 ${d}일 알림`;

// 화면 6 (시안 1.17 6 — d7 §18)
const guideNodes = under(d6, "manual-upload");
const GUIDE = {
  fill: lower(d6.find((n) => leaf(n) === "manual-upload")!.fills[0]),
  title: texts(guideNodes, "info-title")[0],
  body: texts(guideNodes, "info-body")[0],
  textColors: [...new Set(guideNodes.filter((n) => /^info-(title|body)$/.test(n.name) && n.text).map((n) => lower(n.fills[0])))],
  iconColors: [...new Set(guideNodes.filter((n) => n.path.includes("icon-info")).flatMap((n) => [...n.fills, ...n.strokes].map(lower)))],
  action: labelOf(groups(guideNodes, "button-pill-soft")[0]),
};
/**
 * 시안 1.17 6 카드: 수량 줄은 "재주문 기준 N u / 현재 재고 …"(1병(50 mL 남음) 같은 병 표기 포함), 날짜는 "YYYY-MM-DD 알림".
 * 문구 틀은 d7 §11(2026-10-08 디자인 1.21 맞춤 · rules.json reorder.card_text): 수량 줄 "재주문 기준 {min}{unit} / 현재 재고 {stock}{unit}"(숫자·단위 붙여 씀),
 * 기준 문구 "재주문 기준 N u", 날짜 "M월 D일 알림"(한국 시간, 올해가 아니면 "YYYY년 M월 D일 알림"). 시안에서는 값만 읽는다.
 */
const FRAME_CARDS = groups(d6, "reorder-alert-card").map((g) => {
  const line = g.children.filter((c) => c.text && (c.name === "stock-line" || c.name === "threshold" || c.name === "stock")).map((c) => c.text!.characters).join(" ");
  const need = /재주문 기준 ([\d.,]+) (\S+)/.exec(line);
  const left = /\(([\d.,]+) (\S+) 남음\)/.exec(line) ?? /현재 재고 ([\d.,]+) (\S+)$/.exec(line);
  const unit = need?.[2] ?? "";
  const min = need?.[1] ?? "";
  const stock = left?.[1] ?? "";
  const date = /^(\d{4})-(\d{2})-(\d{2}) 알림$/.exec(textIn(g, "alert-date"));
  const auto = textIn(g, "label", "auto-threshold-badge");
  return {
    fill: lower(g.node.fills[0]),
    badge: textIn(g, "label", "badge-low-stock"),
    name: textIn(g, "reagent-name"),
    /** d7 §11 수량 줄 (1.21) */
    amount: `${NEED} ${min}${unit} / ${STOCK} ${stock}${unit}`,
    /** 자동이면 배지 글자, 아니면 "" */
    auto,
    /** 자동이면 시안 캡션, 아니면 d7 §11 "재주문 기준 N u" (1조 사용량·조 수가 없는 시약) */
    basis: auto ? textIn(g, "auto-caption") : `재주문 기준 ${min} ${unit}`,
    date: date ? alertDate(Number(date[1]), Number(date[2]), Number(date[3])) : "",
    link: textIn(g, "label", "button-primary"),
    /** 화면에 보이는 수량 줄 조각 (자동이면 "재주문 기준 Nu" · "자동" · "/ 현재 재고 Mu" — 배지가 두 조각 사이) */
    amountLines: auto ? [`${NEED} ${min}${unit}`, auto, `/ ${STOCK} ${stock}${unit}`] : [`${NEED} ${min}${unit} / ${STOCK} ${stock}${unit}`],
    /** 시안의 새 창 안내 줄 (그 카드에서 판매처 "확인" 뒤): [안내 글자, "직접 열기"] — 화면은 안내 앞에 판매처명을 붙인다 */
    newWindow: g.children.some((c) => c.name === "vendor-new-window") ? [textIn(g, "note"), textIn(g, "label", "button-pill-soft")] : null,
    minStock: Number(min.replace(/,/g, "")),
    stock: Number(stock.replace(/,/g, "")),
    unit,
  };
});
const MOBILE_CARDS = groups(m6, "reorder-alert-card").length;
const REGISTER_ENTRY = labelOf(groups(under(d6, "vendor-register"), "button-outline")[0]);
/** 시안 1.17 6: 염산 카드의 새 창 안내 줄 (vendor-new-window) */
const NEW_WINDOW = {
  note: texts(under(d6, "vendor-new-window"), "note")[0],
  action: texts(under(d6, "vendor-new-window"), "label")[0],
};
/**
 * 판매처 연결 모달: 시안 1.17 프레임에는 모달 열린 상태가 없다(새 창 안내 상태를 그렸다).
 * 1.16 시안 6-desktop 의 모달 값을 그대로 기대한다 — 제목·확인·취소는 d7 §11 문구, 선택 행 색은 rules.json colors.highlight.
 */
const LINK = {
  fill: "#ffffff",
  stroke: "#e0e0e0",
  title: "판매처 연결",
  label: `판매처 · ${FRAME_CARDS[0]?.name ?? ""}`,
  options: [
    { name: "한빛과학교재", meta: "평균 2일 배송", fill: "#e6f4fc", stroke: "#2b9fe0", selected: true },
    { name: "미래실험사", meta: "평균 4일 배송", fill: "#ffffff", stroke: "#e0e0e0", selected: false },
  ],
  cancel: "취소",
  confirm: "확인",
};
const SELECTED_OPTION = LINK.options.find((o) => o.selected)!;
const PLAIN_OPTION = LINK.options.find((o) => !o.selected)!;

// 화면 9 (시안 1.17 9 — d7 §18)
const segNodes = under(m9, "segmented-control");
const SEG = {
  labels: segNodes.filter((n) => n.name === "label" && n.text).map((n) => n.text!.characters),
  active: segNodes.find((n) => n.name === "label" && parentName(n) === "segmented-control-active")!.text!.characters,
  activeFill: lower(segNodes.find((n) => n.name === "segmented-control-active")!.fills[0]),
};
const SEARCH = {
  placeholder: texts(m9.filter((n) => !n.path.includes("ex-modal-card")), "placeholder")[0],
  iconColors: [...new Set(m9.filter((n) => n.path.includes("icon-search")).flatMap((n) => [...n.strokes, ...n.fills].map(lower)))],
};
/**
 * 판매처 행: 이름은 시안 1.17 9-mobile, 부가 정보는 d7 §18 대로 연락처만(시안은 웹사이트를 그렸다).
 * 시안 1.17 에 연락처 글자가 없어 같은 판매처의 1.16 시안 연락처·부가 정보를 쓴다 (note 는 화면에 보이지 않아야 한다).
 */
const INFO_116: Record<string, string> = {
  "한빛 과학상사": "02-555-0192 · 시약",
  "청주 실험기자재": "043-270-1188 · 실험 기구",
  "그린케미칼": "031-778-3021 · 시약·소모품",
};
const FRAME_ROWS = groups(m9, "vendor-row").map((g) => ({
  name: textIn(g, "vendor-name"),
  info: INFO_116[textIn(g, "vendor-name")] ?? "",
  site: textIn(g, "vendor-site"),
  fill: lower(g.node.fills[0]),
}));
const MORE_COLORS = [...new Set(m9.filter((n) => n.path.includes("icon-more")).flatMap((n) => [...n.fills, ...n.strokes].map(lower)))];
const REGISTER = labelOf(groups(m9.filter((n) => !n.path.includes("ex-modal-card")), "button-primary")[0]);
/** d7 §12 저장 후 토스트 (1.17 프레임에는 토스트가 없다) · 아이콘 = rules.json colors.highlight 진한 쪽 */
const TOAST_SAVED = "판매처를 저장했어요";
const formNodes = m9.filter((n) => n.path.includes("ex-modal-card"));
const FORM = {
  /** 수정 시트 제목 (1.17 프레임은 등록 시트만 그렸다 — 1.16 9-desktop 문구) */
  editTitle: "판매처 수정",
  fields: groups(formNodes, "field").map((g) => ({
    label: textIn(g, "field-label"),
    required: textIn(g, "required"),
    value: textIn(g, "value"),
    placeholder: textIn(g, "placeholder"),
  })),
  save: labelOf(groups(formNodes, "button-primary")[0]),
};
const [F_NAME, F_CONTACT, F_WEBSITE] = FORM.fields;
// 시안 1.17 9-mobile 등록 시트 (d7 §18: × 닫기 · 안내 · 취소 · 저장, 부가 정보 칸 없음)
const sheet117 = (() => {
  const nodes = loadFrame117(`${S9}-mobile`).filter((n) => n.path.includes("ex-modal-card"));
  const label = (btn: string) => nodes.find((n) => n.name === "label" && n.path.includes("action-row") && n.path.includes(btn))?.text?.characters ?? "";
  return {
    title: texts(nodes, "sheet-title")[0],
    helper: texts(nodes, "sheet-helper")[0],
    hasClose: nodes.some((n) => n.name === "sheet-close"),
    fields: texts(nodes, "field-label"),
    cancel: label("button-outline"),
    save: label("button-primary"),
  };
})();

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
const COUNTS_6D = countByName(d6);
const COUNTS_6M = countByName(m6);
const COUNTS_9D = countByName(d9);
const COUNTS_9M = countByName(m9);
/** 판매처 연결 모달 안 컴포넌트 (1.16 시안 모달 — 1.17 프레임에 모달 상태 없음) */
const COUNTS_LINK_MODAL: Record<string, number> = { "button-outline": 1, "button-primary": 1 };
const screenComponents = (screen: number) => componentNames.filter((n) => dev.components[n].includes(screen) && !SHELL.includes(n));

// ---------- 기대값: rules.json ----------
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}
const HIGHLIGHTS = rules.colors.highlight.values.map(lower);
const HIGHLIGHT_RGB = HIGHLIGHTS.map(hexToRgb);
/** 토스트 체크 아이콘 = 하늘색 진한 쪽 (1.17 프레임에 토스트 없음 — 1.16 시안과 같다) */
const TOAST_ICON = [HIGHLIGHTS[0]];
const ACCENT = lower(rules.colors.accent.value);
const ACCENT_SOFT = lower(rules.colors.accent_soft.value);
const PINK_RGB = [ACCENT, ACCENT_SOFT].map(hexToRgb);
const BADGE = "badge-low-stock";
// 선택 표시: 프레임의 선택 판매처 행 채움(연하늘) + 테두리(하늘색)
const SOFT = hexToRgb(SELECTED_OPTION?.fill || "#000000");
const LINE = hexToRgb(SELECTED_OPTION?.stroke || "#000000");
const MIN_H = rules.button.min_height;
const { R1, R2, R3 } = rules.roles;
const ROUTE_VENDORS = dev.routes[String(S9)];

// ---------- d7-data.md §11·§12 문장에 있는 문구 ----------
const EMPTY_ALERTS = "재고가 부족한 시약이 없어요";
const EMPTY_VENDORS = "등록한 판매처가 없어요";
const DELETE_TITLE = "이 판매처를 삭제할까요?";
const TOAST_DELETED = "판매처를 삭제했어요";
const MENU_EDIT = "수정";
const MENU_DELETE = "삭제";
const CANCEL = "취소";
const MANUAL_ROUTE = "/manual";
const CREATE_TITLE = REGISTER; // "판매처 등록" → 폼
const D7_QUOTES = [EMPTY_ALERTS, EMPTY_VENDORS, DELETE_TITLE, TOAST_DELETED, `"${MENU_EDIT}"·"${MENU_DELETE}"`, `\`${MANUAL_ROUTE}\``];
// 공통 목록 seed: "11번가(https://www.11st.co.kr), G마켓(…), …"
const seedLine = D7.split(/\r?\n/).find((l) => l.startsWith("| 공통 목록")) ?? "";
const SEED = [...seedLine.matchAll(/([^\s,():]+)\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({ name: m[1], website: m[2] }));
const d7Number = (re: RegExp) => Number(re.exec(D7)?.[1] ?? Number.NaN);
const NAME_MAX = d7Number(/name\(1~(\d+)자\)/);
// d7 §11 카드 문구 틀 (1.21: 수량 줄은 숫자·단위를 붙여 쓴다, 기준 문구는 띄어 쓴다)
const AMOUNT_RE = new RegExp(String.raw`^${NEED} ([\d.,]+)([^\d\s.,]\S*) \/ ${STOCK} ([\d.,]+)([^\d\s.,]\S*)$`);
const BASIS_PLAIN_RE = /^재주문 기준 ([\d.,]+) (\S+)$/;
const DATE_RE = /(?:\d{4}년 )?\d{1,2}월 \d{1,2}일 알림/;
const PHONE_RE = /\d{2,4}-\d{3,4}-\d{4}/;

const sel = (name: string) => `[data-component="${name}"]`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

async function open(page: Page, path: string): Promise<void> {
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

type GroupPaint = { bgs: string[]; lines: string[]; icons: string[] };
/** 요소와 자손 전체(::before·::after 포함)를 한 덩어리로 본 바탕색 · 선 색 · 아이콘(svg) 색 */
async function groupPaints(list: Locator): Promise<GroupPaint[]> {
  return list.evaluateAll((els) =>
    els.map((el) => {
      const bgs: string[] = [];
      const lines: string[] = [];
      const icons: string[] = [];
      const read = (cs: CSSStyleDeclaration) => {
        const s = cs as unknown as Record<string, string>;
        bgs.push(s.backgroundColor);
        for (const side of ["Top", "Right", "Bottom", "Left"]) {
          if (parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none") lines.push(s[`border${side}Color`]);
        }
        if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) lines.push(s.outlineColor);
        for (const m of (s.boxShadow === "none" ? "" : s.boxShadow).match(/rgba?\([^)]*\)/g) ?? []) lines.push(m);
      };
      for (const e of [el, ...Array.from(el.querySelectorAll("*"))]) {
        const cs = getComputedStyle(e);
        read(cs);
        if (e instanceof SVGElement) {
          if (cs.fill !== "none") icons.push(cs.fill);
          if (cs.stroke !== "none") icons.push(cs.stroke);
        } else {
          for (const pseudo of ["::before", "::after"]) {
            const ps = getComputedStyle(e, pseudo);
            if (ps.content !== "none" && ps.content !== "normal") read(ps);
          }
        }
      }
      return { bgs, lines, icons };
    }),
  );
}
const groupPaint = async (loc: Locator) => (await groupPaints(loc))[0];
const allColors = (p: GroupPaint) => [...p.bgs, ...p.lines, ...p.icons];

type Use = { where: string; colors: string[]; inside: boolean };
/** scope 안 모든 요소가 실제로 쓰는 색 (글자·바탕·선·아이콘). inside = within 컴포넌트 안에 있는지 */
async function colorUses(scope: Locator, within: string[] = []): Promise<Use[]> {
  return scope.evaluate((rootEl, names) => {
    const insideSel = names.map((n) => `[data-component="${n}"]`).join(",");
    const out: { where: string; colors: string[]; inside: boolean }[] = [];
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
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo) as unknown as Record<string, string>;
        if (ps.content !== "none" && ps.content !== "normal") colors.push(ps.backgroundColor);
      }
      out.push({
        where: `${el.tagName.toLowerCase()}${el.getAttribute("data-component") ? `[${el.getAttribute("data-component")}]` : ""}`,
        colors,
        inside: insideSel !== "" && el.closest(insideSel) !== null,
      });
    }
    return out;
  }, within);
}
const using = (uses: Use[], rgbs: string[]) => uses.filter((u) => u.colors.some((c) => rgbs.includes(c)));

// 이번 run 이전부터 있던 표 틀(화면 8·10 의 ex-data-table-cell 을 감싸는 table 래퍼). 새로 생긴 이름이 아니라 여기서는 따지지 않는다
const EXISTING_WRAPPERS = ["ex-data-table"];
/** 페이지에 붙어 있는 data-component 이름은 모두 dev-rules components 에 있다 (새 이름을 만들지 않았다) */
async function expectKnownNames(page: Page): Promise<void> {
  const names = await page.locator("[data-component]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-component") ?? ""))]);
  expect(names.length, "data-component 가 있다").toBeGreaterThan(0);
  const unknown = names.filter((n) => !componentNames.includes(n) && !EXISTING_WRAPPERS.includes(n));
  expect(unknown, "dev-rules components 에 없는 data-component 이름").toEqual([]);
}

async function expectMinHeight(loc: Locator, what: string): Promise<void> {
  const b = await box(loc, what);
  expect(b.height, `${what} 높이 ≥ ${MIN_H} (rules button.min_height)`).toBeGreaterThanOrEqual(MIN_H);
}

// ---------- 화면 6 예시 구역 안 요소 ----------
const cards = (scope: Locator) => scope.locator(sel("reorder-alert-card"));
const linkButton = (card: Locator) => card.locator(sel("vendor-link")).locator(sel("button-primary"));
const dialog = (scope: Locator) => scope.locator(sel("ex-modal-card"));
const radios = (scope: Locator) => scope.getByRole("radiogroup").getByRole("radio");
const confirmButton = (dlg: Locator) => dlg.locator(sel("button-primary")).filter({ hasText: exact(LINK.confirm) });
const cancelButton = (dlg: Locator) => dlg.locator(sel("button-outline")).filter({ hasText: exact(LINK.cancel) });
/** 카드 안 글자 줄 (배지·버튼 포함, 위에서 아래로) */
const cardLines = async (card: Locator) => (await card.innerText()).split("\n").map(squash).filter(Boolean);

type OptionRow = { text: string; checked: boolean; bgs: string[]; lines: string[]; icons: string[] };
/** 판매처 행(라디오를 감싼 줄)마다 글자 · 선택 여부 · 줄 전체의 색 */
async function optionRows(scope: Locator): Promise<OptionRow[]> {
  return radios(scope).evaluateAll((els) =>
    els.map((radio) => {
      const row = radio.closest("label") ?? radio.parentElement ?? radio;
      const bgs: string[] = [];
      const lines: string[] = [];
      const icons: string[] = [];
      for (const e of [row, ...Array.from(row.querySelectorAll("*"))]) {
        if (e === radio) continue;
        const cs = getComputedStyle(e) as unknown as Record<string, string>;
        bgs.push(cs.backgroundColor);
        for (const s of ["Top", "Right", "Bottom", "Left"]) {
          if (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none") lines.push(cs[`border${s}Color`]);
        }
        for (const m of (cs.boxShadow === "none" ? "" : cs.boxShadow).match(/rgba?\([^)]*\)/g) ?? []) lines.push(m);
        if (e instanceof SVGElement) {
          if (cs.fill !== "none") icons.push(cs.fill);
          if (cs.stroke !== "none") icons.push(cs.stroke);
        }
      }
      return {
        text: ((row as HTMLElement).innerText ?? row.textContent ?? "").replace(/\s+/g, " ").trim(),
        checked: (radio as HTMLInputElement).checked,
        bgs,
        lines,
        icons,
      };
    }),
  );
}
/** 모달 안에서 판매처 행 묶음(radiogroup) 밖에 보이는 글자 */
async function textOutsideOptions(dlg: Locator): Promise<string> {
  return dlg.evaluate((el) => {
    const hidden = (e: Element) => {
      const cs = getComputedStyle(e);
      return cs.display === "none" || cs.visibility === "hidden";
    };
    const parts: string[] = [];
    const walk = (node: Element) => {
      if (node.getAttribute("role") === "radiogroup" || hidden(node)) return;
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) parts.push(child.textContent ?? "");
        else if (child.nodeType === 1) walk(child as Element);
      }
    };
    walk(el);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  });
}
const isSelectedRow = (r: OptionRow) => r.bgs.includes(SOFT) && r.lines.includes(LINE);
const rowHasHighlight = (r: OptionRow) => [...r.bgs, ...r.lines, ...r.icons].some((c) => HIGHLIGHT_RGB.includes(c));
/** 판매처 이름이 놓인 자리를 실제 마우스로 누른다 (라디오 입력이 줄 전체를 덮어도 사용자와 같은 결과) */
async function pickVendor(scope: Locator, name: string): Promise<void> {
  const text = scope.getByRole("radiogroup").getByText(name, { exact: true });
  await text.scrollIntoViewIfNeeded();
  const b = await text.boundingBox();
  expect(b, `판매처 "${name}" 위치`).not.toBeNull();
  await scope.page().mouse.click(b!.x + b!.width / 2, b!.y + b!.height / 2);
  await scope.page().mouse.move(0, 0);
}
async function expectOnlySelected(scope: Locator, name: string): Promise<void> {
  await expect
    .poll(async () => (await optionRows(scope)).filter((r) => r.checked).map((r) => r.text.startsWith(name)), { message: `"${name}" 만 선택` })
    .toEqual([true]);
  await expect
    .poll(async () => (await optionRows(scope)).filter(isSelectedRow).map((r) => r.text.startsWith(name)), {
      message: `선택 표시(연하늘 바탕 + 하늘색 테두리)가 "${name}" 행에만`,
    })
    .toEqual([true]);
  const others = (await optionRows(scope)).filter((r) => !r.checked);
  expect(others.filter(rowHasHighlight).map((r) => r.text), "선택되지 않은 행에 하늘색 없음").toEqual([]);
}

// ---------- 화면 9 예시 구역 안 요소 ----------
const register = (scope: Locator) => scope.locator(sel("vendor-register"));
const rows = (scope: Locator) => register(scope).getByRole("listitem");
const rowOf = (scope: Locator, name: string) => rows(scope).filter({ hasText: name });
const moreButton = (row: Locator) => row.locator('button[aria-haspopup="menu"]');
const form = (scope: Locator) => register(scope).locator("form");
const field = (scope: Locator, label: string) => form(scope).getByLabel(label, { exact: true });
const saveButton = (scope: Locator) => form(scope).locator(sel("button-primary")).filter({ hasText: exact(FORM.save) });
const registerButton = (scope: Locator) => register(scope).locator(`button${sel("button-primary")}`).filter({ hasText: exact(REGISTER) });
const toasts = (scope: Locator, text: string) => scope.locator(sel("ex-toast")).filter({ hasText: exact(text) });
const rowNames = async (scope: Locator) => (await rows(scope).evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.split("\n")[0].trim())));
/** 연하늘 바탕으로 강조된 행의 이름 */
async function highlightedRows(scope: Locator): Promise<string[]> {
  await scope.page().mouse.move(0, 0);
  const names = await rowNames(scope);
  const paints = await groupPaints(rows(scope));
  return names.filter((_, i) => paints[i].bgs.includes(SOFT));
}
async function openMenu(scope: Locator, name: string): Promise<Locator> {
  const button = moreButton(rowOf(scope, name));
  await expect(button, `"${name}" 더보기 버튼`).toHaveCount(1);
  await button.click();
  await expect(button, "더보기 aria-expanded").toHaveAttribute("aria-expanded", "true");
  const menu = scope.getByRole("menu");
  await expect(menu, "열린 메뉴").toHaveCount(1);
  return menu;
}
async function openEdit(scope: Locator, name: string): Promise<void> {
  const menu = await openMenu(scope, name);
  await menu.getByRole("menuitem", { name: MENU_EDIT, exact: true }).click();
  await expect(form(scope), "수정 폼").toHaveCount(1);
  await expect(form(scope).getByRole("heading", { name: FORM.editTitle, exact: true }), `폼 제목 "${FORM.editTitle}"`).toBeVisible();
}

// =====================================================================
// 기대값 자체 점검
// =====================================================================
test(`[K1][S${S6}] 기대값 원본: 프레임 6-desktop·6-mobile(1.17) 과 rules.json colors·roles, d7 §11·§18 문구가 서로 맞는다`, () => {
  expect(GUIDE.title).toBe("재주문 기준");
  expect(GUIDE.body, "시안 1.17 info-body").toBe("필요량 = 1반 1회 실험량 × 조 수 · 기준이 없는 시약은 최근 사용량으로 계산해요");
  expect(D7, "d7 §11 안내 박스 앞부분").toContain(`"${GUIDE.body.split(" · ")[0]}"`);
  expect(GUIDE.action).toBe("실험 매뉴얼 올리기");
  expect(HIGHLIGHTS, "안내 박스 채움 = 연하늘").toContain(GUIDE.fill);
  expect(GUIDE.textColors, "안내 글자는 하늘색·핑크가 아니다").toHaveLength(1);
  expect([...HIGHLIGHTS, ACCENT, ACCENT_SOFT]).not.toContain(GUIDE.textColors[0]);

  expect(FRAME_CARDS.length, "6-desktop 알림 카드").toBe(3);
  expect(MOBILE_CARDS, "6-mobile 알림 카드").toBe(3);
  for (const c of FRAME_CARDS) {
    expect(c.badge).toBe("재고 부족");
    expect(c.name).not.toBe("");
    expect(c.amount, `${c.name}: d7 §11 수량 줄`).toMatch(AMOUNT_RE);
    expect(c.stock, `${c.name}: 재고 < 기준`).toBeLessThan(c.minStock);
    if (c.auto) {
      expect(c.auto).toBe("자동");
      expect(c.basis, "자동 캡션 = d7 §18").toBe("최근 사용량으로 계산했어요");
    } else expect(c.basis).toMatch(BASIS_PLAIN_RE);
    expect(c.date).toMatch(new RegExp(`^${DATE_RE.source}$`));
    expect(c.link).toBe("판매처 연결");
    expect([ACCENT, ACCENT_SOFT, ...HIGHLIGHTS], "카드 채움은 핑크·하늘색이 아니다").not.toContain(c.fill);
  }
  expect(FRAME_CARDS.filter((c) => c.auto).length, "자동 기준 카드 1").toBe(1);
  expect(FRAME_CARDS[0].amount, "염산: 1병(50 mL 남음) → 현재 재고 50mL").toBe("재주문 기준 100mL / 현재 재고 50mL");
  expect(FRAME_CARDS.map((c) => c.date), "시안 날짜 2026-10-07 → d7 §11 날짜 문구").toEqual(FRAME_CARDS.map(() => alertDate(2026, 10, 7)));
  expect(D7, "d7 §11 카드 수량 줄 틀 (1.21)").toContain(D7_CARD_TEMPLATE);
  expect(D7, "d7 §11 날짜 틀 (1.21)").toContain(D7_DATE_TEMPLATE);
  for (const q of RULES_CARD_QUOTES) expect(rules.reorder.card_text, `rules.json reorder.card_text 에 ${q}`).toContain(q);
  expect(alertDate(KST_YEAR, 10, 7), "올해 날짜 = rules 예시 모양").toBe("10월 7일 알림");
  expect(alertDate(KST_YEAR - 1, 10, 7)).toBe(`${KST_YEAR - 1}년 10월 7일 알림`);
  expect(REGISTER_ENTRY).toBe("판매처 등록");
  expect([NEW_WINDOW.note, NEW_WINDOW.action]).toEqual(["사이트를 새 창으로 열었어요. 열리지 않았다면", "직접 열기"]);

  // 프레임에서 핑크는 badge-low-stock 에만 있다
  for (const nodes of [d6, m6]) {
    const pink = nodes.filter((n) => [...n.fills, ...n.strokes].map(lower).some((c) => [ACCENT, ACCENT_SOFT].includes(c)));
    expect(pink.length, "프레임에 핑크 노드가 있다").toBeGreaterThan(0);
    expect(pink.filter((n) => !n.path.includes(BADGE)).map((n) => n.path.join("/")), "badge-low-stock 밖의 핑크 노드").toEqual([]);
  }
  expect(rules.colors.accent.only_within, "rules accent 허용 범위에 badge-low-stock").toContain(BADGE);
  expect(rules.colors.highlight.forbidden_within, "rules 하늘색 금지 범위에 reorder-alert-card").toContain("reorder-alert-card");

  expect(LINK.title).toBe("판매처 연결");
  expect(LINK.options.filter((o) => o.selected).length, "선택 행 1개").toBe(1);
  expect(HIGHLIGHTS, "선택 행 채움 = 하늘색 계열").toContain(SELECTED_OPTION.fill);
  expect(HIGHLIGHTS, "선택 행 테두리 = 하늘색 계열").toContain(SELECTED_OPTION.stroke);
  expect(HIGHLIGHTS, "선택 안 된 행은 하늘색이 아니다").not.toContain(PLAIN_OPTION.fill);
  expect([LINK.cancel, LINK.confirm]).toEqual([CANCEL, "확인"]);

  expect(R1.component).toBe("manual-upload");
  expect(R2.components.sort()).toEqual(["reorder-alert-card", "vendor-link"]);
  expect(R3).toMatchObject({ component: "vendor-register", only_roles: ["admin"] });
  expect(ROUTE_VENDORS, "dev-rules routes 9").toBe("/vendors");
  for (const q of D7_QUOTES) expect(D7, `d7-data.md 에 ${q}`).toContain(q);
  expect(COUNTS_6D).toMatchObject({ "reorder-alert-card": 3, "vendor-link": 3, "button-primary": 3, "button-pill-soft": 2, "auto-threshold-badge": 1, "vendor-register": 1, "manual-upload": 1 });
});

test(`[K1][S${S9}] 기대값 원본: 프레임 9-mobile·9-desktop(1.17) 과 d7 §12·§18 문구·공통 seed 가 서로 맞는다`, () => {
  expect(SEG.labels).toEqual(["우리 학교 판매처", "공통 목록"]);
  expect(D7, "d7 §12 탭 문구").toContain(`"${SEG.labels.join(" / ")}"`);
  expect(SEG.active).toBe(SEG.labels[0]);
  expect([...HIGHLIGHTS, ACCENT, ACCENT_SOFT], "활성 탭 채움은 하늘색·핑크 아님").not.toContain(SEG.activeFill);
  expect(SEARCH.placeholder).toBe("판매처 검색");
  expect(FRAME_ROWS.length, "9-mobile 판매처 행").toBe(3);
  for (const r of FRAME_ROWS) {
    expect(r.name).not.toBe("");
    expect(r.site, "시안 행은 웹사이트를 그렸다 (d7 §18: 화면은 연락처만)").not.toBe("");
    expect(r.info, `${r.name}: 1.16 시안 연락처 · note`).toMatch(new RegExp(`^${PHONE_RE.source} · .+$`));
  }
  expect(D7, "d7 §18 화면 9 행 = 이름 + 연락처만 (1.21)").toMatch(/목록 행은 이름 \+ 연락처만/);
  expect(D7, "d7 §18 화면 9 등록·수정 폼에는 웹사이트 칸 유지").toMatch(/등록·수정 폼에는 웹사이트 칸 유지/);
  expect(REGISTER).toBe("판매처 등록");
  expect(D7, "d7 §12 토스트").toContain(`"${TOAST_SAVED}" / "${TOAST_DELETED}"`);
  expect(FORM.fields.map((f) => f.label)).toEqual(["판매처명", "연락처", "웹사이트 주소"]);
  expect(FORM.fields.map((f) => f.required), "판매처명만 필수").toEqual(["필수", "", ""]);
  expect(F_NAME.value, "시안 등록 시트: 판매처명 입력 중").toBe("과학나라");
  expect([F_CONTACT.placeholder, F_WEBSITE.placeholder], "나머지 칸은 placeholder").toEqual(["예: 043-123-4567", "예: www.example.co.kr"]);
  expect(FORM.save).toBe("저장");
  expect(SEED.map((s) => s.name), "d7 §12 공통 seed").toEqual(["11번가", "G마켓", "오피스안", "퍼스트과학"]);
  expect(Number.isInteger(NAME_MAX) && NAME_MAX > 0, "d7 판매처명 길이").toBe(true);
  expect(COUNTS_9M).toMatchObject({ "segmented-control": 1, "segmented-control-active": 1, "text-input": 4, "vendor-register": 1, "button-primary": 2, "button-outline": 1, "ex-modal-card": 1 });
  expect(COUNTS_9D).toMatchObject({ "text-input": 4, "button-primary": 2, "button-outline": 1, "vendor-register": 1, "ex-modal-card": 1 });
});

// =====================================================================
// 갤러리 등장 (K1 의 DOM 판)
// =====================================================================
test(`[K1][S${S6}] /gallery DOM 에 새 컴포넌트 manual-upload · vendor-link · vendor-register 가 각각 1개 이상, vendor-link 는 button-primary "${FRAME_CARDS[0].link}" 1개를 감싼다`, async ({ page }) => {
  // "새 컴포넌트" = 화면 6·9 에 쓰이고, 그보다 먼저 만든 화면(dev-rules mvp_screens 순서에서 6·9 앞)에는 없는 것.
  // 뒤에 만든 화면(화면 5 가 manual-upload 를 함께 쓰게 됨)이 추가돼도 뜻이 바뀌지 않는다.
  const order = dev.mvp_screens;
  expect(order, "dev-rules mvp_screens 에 화면 6·9").toEqual(expect.arrayContaining([S6, S9]));
  const earlier = order.slice(0, Math.min(order.indexOf(S6), order.indexOf(S9)));
  expect(earlier.length, "화면 6·9 보다 먼저 만든 화면이 있다").toBeGreaterThan(0);
  const fresh = componentNames.filter(
    (n) => dev.components[n].some((s) => s === S6 || s === S9) && !dev.components[n].some((s) => earlier.includes(s)),
  );
  expect(fresh.sort(), "dev-rules 에서 화면 6·9 에 처음 나온 새 컴포넌트").toEqual(["manual-upload", "vendor-link", "vendor-register"]);
  await open(page, GALLERY);
  for (const n of fresh) expect(await page.locator(sel(n)).count(), `/gallery ${n}`).toBeGreaterThanOrEqual(1);
  const link = page.locator(sel("vendor-link")).first();
  await expect(link.locator(sel("button-primary")), "vendor-link 안 button-primary").toHaveCount(1);
  await expect(link.locator(sel("button-primary")), "vendor-link 글자").toHaveText(exact(FRAME_CARDS[0].link));
  await expectKnownNames(page);
});

test(`[K1][S${S6}] /gallery/reorder DOM 에 화면 ${S6} 컴포넌트(dev-rules, nav-pill·tab-bar 제외)가 각각 1개 이상, 새 data-component 이름 없음`, async ({ page }) => {
  const want = screenComponents(S6);
  expect(want.length, "dev-rules 화면 6 컴포넌트").toBeGreaterThanOrEqual(9);
  await open(page, GALLERY_REORDER);
  for (const n of want) expect(await page.locator(sel(n)).count(), `/gallery/reorder ${n}`).toBeGreaterThanOrEqual(1);
  await expectKnownNames(page);
});

test(`[K1][S${S9}] /gallery/vendors DOM 에 화면 ${S9} 컴포넌트(dev-rules, nav-pill·tab-bar 제외)가 각각 1개 이상, 메뉴·폼을 연 상태까지 새 data-component 이름 없음`, async ({ page }) => {
  const want = screenComponents(S9);
  expect(want.length, "dev-rules 화면 9 컴포넌트").toBeGreaterThanOrEqual(9);
  await open(page, GALLERY_VENDORS);
  for (const n of want) expect(await page.locator(sel(n)).count(), `/gallery/vendors ${n}`).toBeGreaterThanOrEqual(1);
  const sec = await area(page, "default");
  await openMenu(sec, FRAME_ROWS[1].name);
  await expectKnownNames(page);
});

// =====================================================================
// 화면 6 — 재주문 알림
// =====================================================================
test.describe("화면 6 재주문 알림 (/gallery/reorder)", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, GALLERY_REORDER);
  });

  test(`[K1][S${S6}] 컴포넌트 개수: admin 기본 예시가 프레임 6-desktop · 6-mobile 개수 이상, 하나뿐인 것·카드 수는 6-desktop 과 같다`, async ({ page }) => {
    const sec = await area(page, "default");
    for (const [frameName, counts] of [["6-desktop", COUNTS_6D], ["6-mobile", COUNTS_6M]] as const) {
      for (const [name, n] of Object.entries(counts)) {
        expect(await sec.locator(sel(name)).count(), `기본 예시 ${name} (프레임 ${frameName} ${n})`).toBeGreaterThanOrEqual(n);
      }
    }
    for (const name of ["manual-upload", "vendor-register", "reorder-alert-card", "vendor-link", BADGE, "auto-threshold-badge"]) {
      await expect(sec.locator(sel(name)), `기본 예시 ${name}`).toHaveCount(COUNTS_6D[name]);
    }
    await expect(sec.locator(sel("ex-modal-card")), "시안 1.17 6: 모달 닫힘").toHaveCount(0);
    await expect(sec.locator(sel("ex-empty-state-card")), "알림이 있으면 빈 상태 카드 없음").toHaveCount(0);
  });

  test(`[K1][S${S6}] manual-upload: 연하늘 안내 박스 "${GUIDE.title}" · "${GUIDE.body}" + button-pill-soft "${GUIDE.action}"(→ ${MANUAL_ROUTE}), 정보 아이콘 하늘색, 핑크 없음`, async ({ page }) => {
    const sec = await area(page, "default");
    const boxEl = sec.locator(sel("manual-upload"));
    await expect(boxEl).toHaveCount(1);
    await expect(boxEl).toBeVisible();
    expect(await boxEl.evaluate((el) => getComputedStyle(el).backgroundColor), "안내 박스 바탕 = 프레임 채움(연하늘)").toBe(hexToRgb(GUIDE.fill));

    const title = boxEl.getByText(GUIDE.title, { exact: true });
    const body = boxEl.getByText(GUIDE.body, { exact: true });
    await expect(title, `"${GUIDE.title}"`).toBeVisible();
    await expect(body, `"${GUIDE.body}"`).toBeVisible();
    for (const [what, loc] of [["제목", title], ["본문", body]] as const) {
      expect(await loc.evaluate((el) => getComputedStyle(el).color), `안내 ${what} 글자색 = 프레임(${GUIDE.textColors[0]})`).toBe(hexToRgb(GUIDE.textColors[0]));
    }
    expect((await box(title, "제목")).y, "제목이 본문 위").toBeLessThan((await box(body, "본문")).y);

    const action = boxEl.locator(sel("button-pill-soft"));
    await expect(action, "안내 박스 안 button-pill-soft").toHaveCount(1);
    await expect(action).toContainText(GUIDE.action);
    expect(await action.evaluate((el) => el.tagName.toLowerCase()), "화면 5 로 가는 링크").toBe("a");
    await expect(action).toHaveAttribute("href", MANUAL_ROUTE);
    await expectMinHeight(action, `"${GUIDE.action}"`);
    // 시안 1.17 6-mobile: 버튼은 안내 글 아래 / 6-desktop: 글자 칸 왼쪽 · 버튼 오른쪽 (d7 §18 화면 6 배치)
    if (isMobile(page)) {
      expect((await box(action, "버튼")).y, "모바일: 버튼은 안내 글 아래(박스 끝)").toBeGreaterThanOrEqual((await box(body, "본문")).y);
    } else {
      const a = await box(action, "버튼");
      const t = await box(title, "제목");
      expect(a.x, "데스크톱: 버튼은 안내 글 오른쪽").toBeGreaterThan(t.x + t.width);
      const bx = await box(boxEl, "안내 박스");
      expect(a.x + a.width, "데스크톱: 버튼은 박스 오른쪽 끝 쪽").toBeGreaterThan(bx.x + bx.width / 2);
    }

    const paint = await groupPaint(boxEl);
    expect(paint.icons, "정보 아이콘 = 하늘색").toContain(hexToRgb(GUIDE.iconColors[0]));
    expect(allColors(paint).filter((c) => PINK_RGB.includes(c)), "안내 박스에 핑크 없음").toEqual([]);
    expect(await boxEl.locator(sel(BADGE)).count(), "안내 박스에 배지 없음").toBe(0);
  });

  test(`[K1][S${S6}] reorder-alert-card: 배지 "${FRAME_CARDS[0].badge}" 1 → 시약명 → 재주문 기준/현재 재고(d7 §11 1.21) → 기준 문구 → 알림 날짜 → vendor-link 1(button-primary "${FRAME_CARDS[0].link}"), 시안 2건 문구 그대로`, async ({ page }) => {
    const sec = await area(page, "default");
    await expect(cards(sec)).toHaveCount(FRAME_CARDS.length);
    for (const [i, want] of FRAME_CARDS.entries()) {
      const card = cards(sec).nth(i);
      await expect(card.locator(sel(BADGE)), `카드 ${i + 1} 배지`).toHaveCount(1);
      await expect(card.locator(sel(BADGE))).toHaveText(exact(want.badge));
      await expect(card.getByRole("heading", { name: want.name, exact: true }), `카드 ${i + 1} 시약명 제목`).toHaveCount(1);
      await expect(card.locator(sel("vendor-link")), `카드 ${i + 1} vendor-link`).toHaveCount(1);
      await expect(linkButton(card), `카드 ${i + 1} vendor-link 안 button-primary`).toHaveCount(1);
      await expect(card.locator(sel("button-primary")), `카드 ${i + 1} button-primary 는 vendor-link 것 하나`).toHaveCount(1);
      await expect(linkButton(card)).toHaveText(exact(want.link));
      expect(await linkButton(card).evaluate((el) => el.tagName.toLowerCase()), "판매처 연결은 버튼").toBe("button");
      await expectMinHeight(linkButton(card), `카드 ${i + 1} "${want.link}"`);
      // 줄 순서 = 프레임 노드 순서
      const nw = want.newWindow ? [`${SELECTED_OPTION.name} ${want.newWindow[0]}`, want.newWindow[1]] : [];
      expect(await cardLines(card), `카드 ${i + 1} 줄 순서`).toEqual([want.badge, want.name, ...want.amountLines, want.basis, want.date, want.link, ...nw]);
      if (want.auto) await expect(card.locator(sel("auto-threshold-badge")), `카드 ${i + 1} 자동 배지`).toHaveText(exact(want.auto));
      else await expect(card.locator(sel("auto-threshold-badge")), `카드 ${i + 1} 자동 배지 없음`).toHaveCount(0);
      // 시안 1.17 6: 모바일 = 한 열 위→아래, 데스크톱 = 왼쪽 정보 칸(배지→시약명→수량→기준→날짜) · 오른쪽 vendor-link
      const info = [want.badge, want.name, want.amountLines[0], want.basis, want.date];
      const boxes = [];
      for (const t of info) boxes.push(await box(card.getByText(t, { exact: true }), t));
      const ys = boxes.map((b) => b.y);
      expect(ys, `카드 ${i + 1} 정보 칸 위→아래 배치`).toEqual([...ys].sort((a, b) => a - b));
      const lb = await box(card.getByText(want.link, { exact: true }), want.link);
      if (isMobile(page)) {
        expect(lb.y, `카드 ${i + 1} 모바일: "${want.link}" 은 날짜 아래`).toBeGreaterThan(ys[ys.length - 1]);
      } else {
        const right = Math.max(...boxes.map((b) => b.x + b.width));
        expect(lb.x, `카드 ${i + 1} 데스크톱: "${want.link}" 은 정보 칸 오른쪽`).toBeGreaterThanOrEqual(right);
      }
      expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor), `카드 ${i + 1} 바탕 = 프레임 채움`).toBe(hexToRgb(want.fill));
    }
  });

  test(`[K1][S${S6}] 색 범위: 핑크(accent·accent_soft)는 badge-low-stock 에만 — 카드 다른 곳·안내 박스·모달·빈 상태에 없음, 알림 카드·button-primary 안에 하늘색 없음`, async ({ page }) => {
    const main = page.locator("main");
    const uses = await colorUses(main, [BADGE]);
    const pink = using(uses, PINK_RGB);
    expect(pink.length, "핑크를 쓰는 요소가 있다 (배지)").toBeGreaterThan(0);
    expect(pink.filter((u) => !u.inside).map((u) => u.where), "badge-low-stock 밖에서 핑크를 쓰는 요소").toEqual([]);
    const badgeBg = await page.locator(sel(BADGE)).first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(PINK_RGB, "배지 바탕 = 핑크").toContain(badgeBg);

    const forbidden = await colorUses(main, rules.colors.highlight.forbidden_within);
    expect(using(forbidden, HIGHLIGHT_RGB).filter((u) => u.inside).map((u) => u.where), "하늘색 금지 컴포넌트(알림 카드·배지·button-primary) 안에서 하늘색을 쓰는 요소").toEqual([]);
    for (const id of ["modal", "modal-no-website", "modal-none", "modal-none-admin"]) {
      const sec = await area(page, id);
      expect(allColors(await groupPaint(dialog(sec))).filter((c) => PINK_RGB.includes(c)), `${id} 모달에 핑크 없음`).toEqual([]);
    }
  });

  test(`[K1][S${S6}] vendor-register(admin): button-outline "${REGISTER_ENTRY}" 1개를 감싼 링크(→ ${ROUTE_VENDORS}), 모바일에서는 알림 목록 아래`, async ({ page }) => {
    const sec = await area(page, "default");
    const entry = sec.locator(sel("vendor-register"));
    await expect(entry).toHaveCount(1);
    const button = entry.locator(sel("button-outline"));
    await expect(button, "vendor-register 안 button-outline").toHaveCount(1);
    await expect(button).toHaveText(exact(REGISTER_ENTRY));
    expect(await button.evaluate((el) => el.tagName.toLowerCase()), "화면 9 로 가는 링크").toBe("a");
    await expect(button).toHaveAttribute("href", ROUTE_VENDORS);
    await expectMinHeight(button, `"${REGISTER_ENTRY}"`);
    expect(await entry.locator(sel("button-primary")).count(), "진입 버튼은 outline 만").toBe(0);
    if (isMobile(page)) {
      const last = await box(cards(sec).last(), "마지막 알림 카드");
      expect((await box(button, "판매처 등록")).y, "판매처 등록이 목록 아래").toBeGreaterThanOrEqual(last.y + last.height);
    }
  });

  test(`[K1][S${S6}] 교사 예시: vendor-register 0개 (rules roles.R3 only_roles admin), manual-upload·알림 카드·vendor-link 는 그대로`, async ({ page }) => {
    expect(R3.only_roles, "교사는 vendor-register 대상이 아니다").not.toContain("teacher");
    const sec = await area(page, "teacher");
    await expect(sec.locator(sel(R3.component)), "교사 화면 vendor-register").toHaveCount(0);
    await expect(sec.getByText(REGISTER_ENTRY, { exact: true }), `교사 화면에 "${REGISTER_ENTRY}" 글자 없음`).toHaveCount(0);
    await expect(sec.locator(`a[href="${ROUTE_VENDORS}"]`), "교사 화면에 판매처 설정 링크 없음").toHaveCount(0);
    await expect(sec.locator(sel("manual-upload")), "교사 manual-upload").toHaveCount(1);
    await expect(cards(sec), "교사 알림 카드").toHaveCount(FRAME_CARDS.length);
    await expect(sec.locator(sel("vendor-link")), "교사 vendor-link").toHaveCount(FRAME_CARDS.length);
    expect((await cards(sec).evaluateAll((els) => els.map((e) => e.querySelector("h1,h2,h3,h4")?.textContent?.trim() ?? ""))).sort(), "교사 화면 시약 = 시안 카드").toEqual(
      FRAME_CARDS.map((c) => c.name).sort(),
    );
    for (const c of FRAME_CARDS) {
      const card = cards(sec).filter({ hasText: c.name });
      expect(await cardLines(card), `교사 "${c.name}" 카드 줄`).toEqual([c.badge, c.name, ...c.amountLines, c.basis, c.date, c.link]);
    }
  });

  test(`[K1][S${S6}] 교사 예시: "${FRAME_CARDS[0].link}" 을 누르면 그 시약의 판매처 연결 모달이 열린다(aria-expanded), 우리 학교 판매처가 공통 목록보다 앞, "${CANCEL}" 로 닫힌다`, async ({ page }) => {
    const sec = await area(page, "teacher");
    await expect(dialog(sec), "처음에는 모달 없음").toHaveCount(0);
    const target = FRAME_CARDS[1];
    const button = linkButton(cards(sec).filter({ hasText: target.name }));
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(dialog(sec), "판매처 연결 모달").toHaveCount(1);
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const other = linkButton(cards(sec).filter({ hasText: FRAME_CARDS[0].name }));
    await expect(other, "다른 카드의 버튼은 닫힘 표시").toHaveAttribute("aria-expanded", "false");
    await expect(dialog(sec).getByRole("heading", { name: LINK.title, exact: true })).toBeVisible();
    await expect(dialog(sec).getByText(`판매처 · ${target.name}`, { exact: true }), "누른 카드의 시약명").toBeVisible();

    // d7 §11: 우리 학교 판매처 먼저, 그다음 공통 목록 (공통 = d7 §12 seed 이름)
    const names = (await optionRows(dialog(sec))).map((r) => r.text);
    const isCommon = names.map((t) => SEED.some((s) => t.startsWith(s.name)));
    expect(isCommon.includes(true) && isCommon.includes(false), "예시에 학교 판매처와 공통 판매처가 모두 있다").toBe(true);
    expect(isCommon, "학교 판매처가 모두 공통 목록보다 앞").toEqual([...isCommon].sort((a, b) => Number(a) - Number(b)));
    // 교사에게는 판매처 설정으로 가는 길이 없다
    await expect(dialog(sec).locator(`a[href="${ROUTE_VENDORS}"]`)).toHaveCount(0);

    await cancelButton(dialog(sec)).click();
    await expect(dialog(sec), "취소하면 닫힌다").toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(cards(sec), "아무것도 바뀌지 않는다").toHaveCount(FRAME_CARDS.length);
  });

  for (const [id, role] of [["empty", "admin"], ["empty-teacher", "교사"]] as const) {
    test(`[K1][S${S6}] 알림 0건(${role}): ex-empty-state-card "${EMPTY_ALERTS}" 1개, 알림 카드·배지·vendor-link 0, manual-upload 1, vendor-register ${role === "admin" ? 1 : 0}, 핑크 없음`, async ({ page }) => {
      const sec = await area(page, id);
      const empty = sec.locator(sel("ex-empty-state-card"));
      await expect(empty).toHaveCount(1);
      await expect(empty.getByText(EMPTY_ALERTS, { exact: true }), `"${EMPTY_ALERTS}"`).toBeVisible();
      await expect(cards(sec), "알림 카드").toHaveCount(0);
      await expect(sec.locator(sel(BADGE)), "배지").toHaveCount(0);
      await expect(sec.locator(sel("vendor-link")), "vendor-link").toHaveCount(0);
      await expect(dialog(sec), "모달").toHaveCount(0);
      await expect(sec.locator(sel("manual-upload")), "안내 박스는 그대로").toHaveCount(1);
      await expect(sec.locator(sel(R3.component)), `vendor-register (${role})`).toHaveCount(role === "admin" ? 1 : 0);
      const paint = await groupPaint(empty);
      expect(paint.icons.some((c) => HIGHLIGHT_RGB.includes(c)), "빈 상태 안내 아이콘 = 하늘색").toBe(true);
      const uses = await colorUses(sec);
      expect(using(uses, PINK_RGB).map((u) => u.where), "알림 0건 화면에 핑크 없음").toEqual([]);
    });
  }

  test(`[K1][S${S6}] 판매처 연결 모달: 제목 "${LINK.title}" → "${LINK.label}" → 판매처 행 radiogroup ${LINK.options.length}개(이름 + 부가 정보) → button-outline "${LINK.cancel}" · button-primary "${LINK.confirm}"`, async ({ page }) => {
    const sec = await area(page, "modal");
    const dlg = dialog(sec);
    await expect(dlg).toHaveCount(1);
    await expect(dlg).toHaveAttribute("role", "dialog");
    await expect(dlg.getByRole("heading", { name: LINK.title, exact: true })).toBeVisible();
    await expect(dlg.getByText(LINK.label, { exact: true })).toBeVisible();
    await expect(dlg.getByRole("radiogroup")).toHaveCount(1);
    await expect(radios(dlg)).toHaveCount(LINK.options.length);
    const optionRowsNow = await optionRows(dlg);
    expect(optionRowsNow.map((r) => r.text), "판매처 행 = 이름 + 부가 정보 (프레임 순서)").toEqual(LINK.options.map((o) => `${o.name} ${o.meta}`));
    for (const o of LINK.options) {
      await expect(dlg.getByRole("radio", { name: new RegExp(esc(o.name)) }), `라디오 "${o.name}"`).toHaveCount(1);
    }

    for (const [name, n] of Object.entries(COUNTS_LINK_MODAL)) {
      await expect(dlg.locator(sel(name)), `모달 안 ${name} (프레임 ${n})`).toHaveCount(n);
    }
    const cancel = cancelButton(dlg);
    const confirm = confirmButton(dlg);
    await expect(cancel).toHaveCount(1);
    await expect(confirm).toHaveCount(1);
    await expect(confirm, "웹사이트가 있는 판매처면 확인 활성").toBeEnabled();
    await expectMinHeight(cancel, LINK.cancel);
    await expectMinHeight(confirm, LINK.confirm);
    const cb = await box(cancel, LINK.cancel);
    const ob = await box(confirm, LINK.confirm);
    expect(cb.x, "취소가 확인 왼쪽").toBeLessThan(ob.x);
    expect(Math.abs(cb.y - ob.y), "취소·확인 같은 줄").toBeLessThan(cb.height);

    // 위→아래: 제목 → 라벨 → 판매처 행 → 버튼
    const ys = [
      (await box(dlg.getByRole("heading", { name: LINK.title, exact: true }), "제목")).y,
      (await box(dlg.getByText(LINK.label, { exact: true }), "라벨")).y,
      (await box(dlg.getByRole("radiogroup"), "판매처 행")).y,
      cb.y,
    ];
    expect(ys, "모달 위→아래 배치").toEqual([...ys].sort((a, b) => a - b));
    const own = await dlg.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderTopColor, width: parseFloat(cs.borderTopWidth) };
    });
    expect(own.bg, "모달 바탕 = 프레임 채움").toBe(hexToRgb(LINK.fill));
    expect(own.width > 0 && own.border === hexToRgb(LINK.stroke), `모달 테두리 = 프레임 선(${LINK.stroke})`).toBe(true);
  });

  test(`[K1][S${S6}] 판매처 연결 모달: 처음 "${SELECTED_OPTION.name}" 만 선택(연하늘 바탕 + 하늘색 테두리), 다른 행을 누르면 그 행만 선택 — 한 번에 하나`, async ({ page }) => {
    const sec = await area(page, "modal");
    const dlg = dialog(sec);
    await expectOnlySelected(dlg, SELECTED_OPTION.name);
    const plain = (await optionRows(dlg)).find((r) => r.text.startsWith(PLAIN_OPTION.name))!;
    expect(plain.bgs, `선택 안 된 행 바탕 = 프레임(${PLAIN_OPTION.fill})`).toContain(hexToRgb(PLAIN_OPTION.fill));
    expect(plain.lines, `선택 안 된 행 테두리 = 프레임(${PLAIN_OPTION.stroke})`).toContain(hexToRgb(PLAIN_OPTION.stroke));

    await pickVendor(dlg, PLAIN_OPTION.name);
    await expectOnlySelected(dlg, PLAIN_OPTION.name);
    await expect(confirmButton(dlg)).toBeEnabled();
    await pickVendor(dlg, SELECTED_OPTION.name);
    await expectOnlySelected(dlg, SELECTED_OPTION.name);

    // 키보드: 라디오 묶음 안에서 화살표로 옮겨도 하나만 선택
    await radios(dlg).first().focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await optionRows(dlg)).filter((r) => r.checked).length, { message: "키보드로 옮겨도 하나만 선택" }).toBe(1);
    await expect.poll(async () => (await optionRows(dlg)).find((r) => r.checked)?.text.startsWith(PLAIN_OPTION.name)).toBe(true);
  });

  test(`[K1][S${S6}] 판매처 연결 모달: 웹사이트가 없는 판매처를 고르면 "${LINK.confirm}" 비활성 + 연락처 안내, 웹사이트가 있는 판매처로 바꾸면 활성·안내 사라짐`, async ({ page }) => {
    const sec = await area(page, "modal-no-website");
    const dlg = dialog(sec);
    await expect(dlg).toHaveCount(1);
    const confirm = confirmButton(dlg);
    await expect(confirm, "웹사이트 없는 판매처 → 확인 비활성").toBeDisabled();
    await expect(cancelButton(dlg), "취소는 활성").toBeEnabled();

    // 선택된 행의 연락처가 안내 문구에 다시 나온다 (행 밖)
    const selected = (await optionRows(dlg)).filter((r) => r.checked);
    expect(selected.length, "선택된 행 1개").toBe(1);
    const contact = PHONE_RE.exec(selected[0].text)?.[0] ?? "";
    expect(contact, "예시에서 선택된 판매처에 연락처가 있다").not.toBe("");
    const selectedName = selected[0].text.slice(0, selected[0].text.indexOf(contact)).trim();
    expect(selectedName, "선택된 판매처 이름").not.toBe("");
    const hint = await textOutsideOptions(dlg);
    expect(hint, `판매처 행 밖에 연락처 ${contact} 안내`).toContain(contact);
    expect(hint, "웹사이트가 없다는 안내").toContain("웹사이트");
    await expectOnlySelected(dlg, selectedName);

    // 확인을 눌러도(비활성) 모달은 그대로
    await confirm.click({ force: true });
    await expect(dlg, "비활성 확인은 아무 일도 하지 않는다").toHaveCount(1);

    // 웹사이트가 있는 판매처(시안의 선택 행)로 바꾸면 활성
    await pickVendor(dlg, SELECTED_OPTION.name);
    await expectOnlySelected(dlg, SELECTED_OPTION.name);
    await expect(confirm, "웹사이트 있는 판매처 → 확인 활성").toBeEnabled();
    await expect.poll(() => textOutsideOptions(dlg), { message: "연락처 안내 사라짐" }).not.toContain(contact);

    // 공통 목록(d7 §12 seed — 모두 웹사이트가 있다)도 열 수 있다
    for (const seed of SEED) {
      if ((await dlg.getByRole("radiogroup").getByText(seed.name, { exact: true }).count()) === 0) continue;
      await pickVendor(dlg, seed.name);
      await expectOnlySelected(dlg, seed.name);
      await expect(confirm, `공통 판매처 "${seed.name}" → 확인 활성`).toBeEnabled();
    }
    // 다시 웹사이트 없는 판매처 → 비활성 + 안내
    await pickVendor(dlg, selectedName);
    await expectOnlySelected(dlg, selectedName);
    await expect(confirm).toBeDisabled();
    await expect.poll(() => textOutsideOptions(dlg), { message: "연락처 안내 다시 표시" }).toContain(contact);
  });

  test(`[K1][S${S6}] 판매처 연결 모달(판매처 0개 · 교사): 판매처 행 없음 + 안내 문구, "${LINK.confirm}" 비활성, 판매처 설정으로 가는 링크 없음`, async ({ page }) => {
    const sec = await area(page, "modal-none");
    const dlg = dialog(sec);
    await expect(dlg).toHaveCount(1);
    await expect(dlg.getByRole("heading", { name: LINK.title, exact: true })).toBeVisible();
    await expect(dlg.getByRole("radio"), "판매처 행").toHaveCount(0);
    await expect(dlg.getByText(/판매처가 없어요/), "판매처 0개 안내").toBeVisible();
    await expect(confirmButton(dlg)).toBeDisabled();
    await expect(cancelButton(dlg)).toBeEnabled();
    await expect(dlg.locator("a"), "교사에게는 링크 없음").toHaveCount(0);
    await expect(dlg.locator(sel(R3.component)), "교사 모달에 vendor-register 없음").toHaveCount(0);
  });

  test(`[K1][S${S6}] 판매처 연결 모달(판매처 0개 · admin): 같은 안내 + 판매처 설정(${ROUTE_VENDORS})으로 가는 링크 1개`, async ({ page }) => {
    const sec = await area(page, "modal-none-admin");
    const dlg = dialog(sec);
    await expect(dlg).toHaveCount(1);
    await expect(dlg.getByRole("radio"), "판매처 행").toHaveCount(0);
    await expect(dlg.getByText(/판매처가 없어요/), "판매처 0개 안내").toBeVisible();
    await expect(confirmButton(dlg)).toBeDisabled();
    const link = dlg.locator(`a[href="${ROUTE_VENDORS}"]`);
    await expect(link, "판매처 설정 링크").toHaveCount(1);
    await expect(link).toBeVisible();
    await expect(link, "링크 글자에 '판매처'").toContainText("판매처");
  });

  test(`[K1][S${S6}] admin 기본 예시 흐름: 첫 카드 모달이 열려 있다 → "${LINK.confirm}" 하면 닫히고 저장 요청 없음 → 둘째 카드 "${FRAME_CARDS[1].link}" → "판매처 · ${FRAME_CARDS[1].name}" → Esc 로 닫힘`, async ({ page }) => {
    // 시안 1.17 기본 예시는 새 창 안내 상태 — 모달이 열린 예시는 "open-modal"
    const sec = await area(page, "open-modal");
    const dlg = dialog(sec);
    await expect(dlg).toHaveCount(1);
    await expect(dlg.getByText(LINK.label, { exact: true })).toBeVisible();
    const first = linkButton(cards(sec).nth(0));
    const second = linkButton(cards(sec).nth(1));
    await expect(first).toHaveAttribute("aria-haspopup", "dialog");
    await expect(first, "열린 카드의 버튼").toHaveAttribute("aria-expanded", "true");
    await expect(second).toHaveAttribute("aria-expanded", "false");

    // d7 §11: 아무것도 저장하지 않는다 — 확인을 눌러도 쓰기 요청이 없다
    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET" && r.method() !== "HEAD") writes.push(`${r.method()} ${r.url()}`);
    });
    await expect(confirmButton(dlg)).toBeEnabled();
    await confirmButton(dlg).click();
    await expect(dlg, "확인하면 모달이 닫힌다").toHaveCount(0);
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(cards(sec), "알림 카드는 그대로").toHaveCount(FRAME_CARDS.length);
    expect(page.url(), "갤러리 주소 그대로").toContain(GALLERY_REORDER);

    await second.click();
    await expect(dlg).toHaveCount(1);
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(dlg.getByText(`판매처 · ${FRAME_CARDS[1].name}`, { exact: true }), "둘째 카드의 시약명").toBeVisible();
    await expect(dlg.getByText(LINK.label, { exact: true }), "첫 카드 시약명은 없다").toHaveCount(0);
    await expectOnlySelected(dlg, SELECTED_OPTION.name);
    await page.keyboard.press("Escape");
    await expect(dlg, "Esc 로 닫힌다").toHaveCount(0);
    await expect(second).toHaveAttribute("aria-expanded", "false");
    expect(writes, "쓰기 요청 없음").toEqual([]);
  });

  test(`[K1][S${S6}] 기준 문구 두 번째 형태: 실험 매뉴얼 값·알림 날짜가 없는 시약 카드는 "재주문 기준 {필요량} {단위}", 날짜 줄 없음`, async ({ page }) => {
    const sec = await area(page, "basis");
    const card = cards(sec);
    await expect(card).toHaveCount(1);
    const lines = await cardLines(card);
    expect(lines[0], "배지").toBe(FRAME_CARDS[0].badge);
    expect(lines[lines.length - 1], "맨 아래 판매처 연결").toBe(FRAME_CARDS[0].link);
    const amount = lines.find((l) => AMOUNT_RE.test(l));
    expect(amount, `"${NEED} Nu / ${STOCK} Mu" 줄 (d7 §11 1.21)`).toBeTruthy();
    const a = AMOUNT_RE.exec(amount!)!;
    expect(a[2], "재주문 기준·현재 재고 단위가 같다").toBe(a[4]);
    const basis = lines.find((l) => BASIS_PLAIN_RE.test(l));
    expect(basis, '"재주문 기준 N 단위" 줄').toBeTruthy();
    const b = BASIS_PLAIN_RE.exec(basis!)!;
    expect([b[1], b[2]], "재주문 기준 = 필요량(min_stock)·단위").toEqual([a[1], a[2]]);
    expect(lines.filter((l) => /1반 1회 실험량/.test(l)), "첫 번째 형태 문구는 없다").toEqual([]);
    expect(lines.filter((l) => DATE_RE.test(l) || /알림$/.test(l)), "알림 날짜 줄 없음").toEqual([]);
    expect(lines.length, "배지 · 시약명 · 재주문 기준/현재 재고 · 기준 · 판매처 연결 5줄").toBe(5);
    await expect(card.locator(sel(BADGE))).toHaveCount(1);
    await expect(card.locator(sel("vendor-link"))).toHaveCount(1);
    await expect(linkButton(card)).toHaveCount(1);
  });
});

// =====================================================================
// 화면 9 — 판매처 설정
// =====================================================================
test.describe("화면 9 판매처 설정 (/gallery/vendors)", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, GALLERY_VENDORS);
  });

  test(`[K1][S${S9}] 컴포넌트 개수: 시안 1.17 상태 예시(frame — 등록 시트 열림 "${F_NAME.value}" 입력 중)가 프레임 9-mobile·9-desktop 개수 이상, 하나뿐인 것·행 수는 프레임과 같다`, async ({ page }) => {
    const sec = await area(page, "frame");
    for (const [frameName, counts] of [["9-mobile", COUNTS_9M], ["9-desktop", COUNTS_9D]] as const) {
      for (const [name, n] of Object.entries(counts)) {
        expect(await sec.locator(sel(name)).count(), `frame 예시 ${name} (프레임 ${frameName} ${n})`).toBeGreaterThanOrEqual(n);
      }
    }
    for (const name of ["segmented-control", "segmented-control-active", "vendor-register", "ex-modal-card", "text-input"]) {
      await expect(sec.locator(sel(name)), `frame 예시 ${name}`).toHaveCount(COUNTS_9M[name]);
    }
    await expect(rows(sec), "판매처 행").toHaveCount(FRAME_ROWS.length);
    await expect(form(sec), "등록 시트가 열려 있다").toHaveCount(1);
    await expect(field(sec, F_NAME.label), `"${F_NAME.label}" = 시안 입력값`).toHaveValue(F_NAME.value);
    await expect(field(sec, F_CONTACT.label), `"${F_CONTACT.label}" placeholder`).toHaveAttribute("placeholder", F_CONTACT.placeholder);
    await expect(field(sec, F_WEBSITE.label), `"${F_WEBSITE.label}" placeholder`).toHaveAttribute("placeholder", F_WEBSITE.placeholder);
    await expect(sec.locator(sel("ex-toast")), "시안 1.17: 토스트 없음").toHaveCount(0);
    await expect(sec.locator(sel("ex-empty-state-card")), "빈 상태 없음").toHaveCount(0);
  });

  test(`[K1][S${S9}] 컴포넌트 개수: 기본 예시에서 첫 행 "${MENU_EDIT}" 을 연 상태가 프레임 9-desktop 개수 이상 (text-input ${COUNTS_9D["text-input"]} · button-primary ${COUNTS_9D["button-primary"]} · ex-toast ${COUNTS_9D["ex-toast"]})`, async ({ page }) => {
    const sec = await area(page, "default");
    await openEdit(sec, FRAME_ROWS[0].name);
    for (const [name, n] of Object.entries(COUNTS_9D)) {
      expect(await sec.locator(sel(name)).count(), `수정 폼을 연 상태 ${name} (프레임 9-desktop ${n})`).toBeGreaterThanOrEqual(n);
    }
    await expect(sec.locator(sel("text-input")), "text-input = 검색 1 + 폼 3").toHaveCount(COUNTS_9D["text-input"]);
    await expect(register(sec).locator(sel("button-primary")), `vendor-register 안 button-primary = "${REGISTER}" + "${FORM.save}"`).toHaveCount(COUNTS_9D["button-primary"]);
    await expect(register(sec), "vendor-register 는 하나").toHaveCount(1);
    // 시안 1.17 9: 폼은 목록 위에 뜬다(모바일 하단 시트 · 데스크톱 가운데 카드) — 뒤의 목록 행은 그대로 있다
    await expect(rows(sec), "목록 행은 그대로").toHaveCount(FRAME_ROWS.length);
    await expect(form(sec), "폼이 보인다").toBeVisible();
  });

  test(`[K1][S${S9}] 수정 폼 예시(시안 9-desktop): 프레임 개수 중 폼·목록 부분(text-input ${COUNTS_9D["text-input"]} · button-primary ${COUNTS_9D["button-primary"]}) 과 같다`, async ({ page }) => {
    const sec = await area(page, "edit");
    await expect(sec.locator(sel("text-input"))).toHaveCount(COUNTS_9D["text-input"]);
    await expect(sec.locator(sel("button-primary"))).toHaveCount(COUNTS_9D["button-primary"]);
    await expect(sec.locator(sel("segmented-control"))).toHaveCount(COUNTS_9D["segmented-control"]);
    await expect(sec.locator(sel("segmented-control-active"))).toHaveCount(COUNTS_9D["segmented-control-active"]);
    await expect(register(sec)).toHaveCount(COUNTS_9D["vendor-register"]);
    await expect(form(sec)).toHaveCount(1);
  });

  test(`[K1][S${S9}] segmented-control: 탭 "${SEG.labels.join(" / ")}", "${SEG.active}" 만 활성(segmented-control-active 1 + 하늘색 인디케이터)`, async ({ page }) => {
    const sec = await area(page, "default");
    const seg = sec.locator(sel("segmented-control"));
    await expect(seg).toHaveCount(1);
    await expect(seg.getByRole("tab")).toHaveCount(SEG.labels.length);
    expect((await seg.getByRole("tab").allInnerTexts()).map(squash), "탭 글자·순서").toEqual(SEG.labels);
    const active = seg.locator(sel("segmented-control-active"));
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(exact(SEG.active));
    await expect(active).toHaveAttribute("aria-selected", "true");
    await expect(seg.getByRole("tab", { selected: true }), "선택된 탭은 하나").toHaveCount(1);
    // 시안 1.17 9: 활성 탭 = 흰 채움 (하늘색 인디케이터 없음)
    expect(await active.evaluate((el) => getComputedStyle(el).backgroundColor), `활성 탭 채움 = 시안 ${SEG.activeFill}`).toBe(hexToRgb(SEG.activeFill));
    expect(HIGHLIGHT_RGB, "활성 탭 글자는 하늘색이 아니다").not.toContain(await active.evaluate((el) => getComputedStyle(el).color));
    const idle = seg.getByRole("tab", { selected: false });
    const idlePaint = await groupPaint(idle);
    expect(allColors(idlePaint).filter((c) => HIGHLIGHT_RGB.includes(c)), "비활성 탭에 하늘색 없음").toEqual([]);
  });

  test(`[K1][S${S9}] 탭 전환: "${SEG.labels[1]}" 을 누르면 그 탭만 활성 + vendor-register 0 + ex-data-table-cell 목록, "${SEG.labels[0]}" 로 돌아오면 원래대로`, async ({ page }) => {
    const sec = await area(page, "default");
    const seg = sec.locator(sel("segmented-control"));
    await seg.getByRole("tab", { name: SEG.labels[1], exact: true }).click();
    await expect(seg.locator(sel("segmented-control-active"))).toHaveCount(1);
    await expect(seg.locator(sel("segmented-control-active"))).toHaveText(exact(SEG.labels[1]));
    await expect(register(sec), "공통 목록 탭에는 vendor-register 없음").toHaveCount(0);
    expect(await sec.locator(sel("ex-data-table-cell")).count(), "공통 목록 셀").toBeGreaterThan(0);
    for (const s of SEED) await expect(sec.getByText(s.name, { exact: true }), `공통 판매처 "${s.name}"`).toBeVisible();
    for (const r of FRAME_ROWS) await expect(sec.getByText(r.name, { exact: true }), `학교 판매처 "${r.name}" 는 공통 목록에 없다`).toHaveCount(0);

    await seg.getByRole("tab", { name: SEG.labels[0], exact: true }).click();
    await expect(seg.locator(sel("segmented-control-active"))).toHaveText(exact(SEG.labels[0]));
    await expect(register(sec)).toHaveCount(1);
    await expect(rows(sec)).toHaveCount(FRAME_ROWS.length);
    await expect(sec.locator(sel("ex-data-table-cell")), "학교 탭에는 표 셀 없음").toHaveCount(0);
  });

  test(`[K1][S${S9}] text-input 검색: "${SEARCH.placeholder}" + 하늘색 검색 아이콘, 탭 아래·목록 위, 판매처명 부분 일치로 행이 줄고 지우면 돌아온다`, async ({ page }) => {
    const sec = await area(page, "default");
    const input = sec.getByPlaceholder(SEARCH.placeholder, { exact: true });
    await expect(input).toHaveCount(1);
    const wrap = sec.locator(sel("text-input")).filter({ has: page.getByPlaceholder(SEARCH.placeholder, { exact: true }) });
    await expect(wrap, "검색은 text-input").toHaveCount(1);
    await expect(register(sec).locator(sel("text-input")), "검색 입력은 vendor-register 밖").toHaveCount(0);
    expect((await groupPaint(wrap)).icons, "검색 아이콘 = 하늘색").toContain(hexToRgb(SEARCH.iconColors[0]));
    const segBox = await box(sec.locator(sel("segmented-control")), "탭");
    const inputBox = await box(input, "검색");
    const listBox = await box(rows(sec).first(), "첫 행");
    expect(inputBox.y, "검색이 목록 위").toBeLessThan(listBox.y);
    if (isMobile(page)) expect(inputBox.y, "모바일: 검색이 탭 아래").toBeGreaterThanOrEqual(segBox.y + segBox.height);
    else expect(inputBox.y, "검색이 탭보다 위에 있지 않다").toBeGreaterThanOrEqual(segBox.y - 1);

    const query = "과학";
    const want = FRAME_ROWS.map((r) => r.name).filter((n) => n.includes(query));
    expect(want.length > 0 && want.length < FRAME_ROWS.length, "검색어가 일부만 거른다").toBe(true);
    await input.fill(query);
    await expect.poll(() => rowNames(sec), { message: `"${query}" 검색 결과` }).toEqual(want);
    // 연락처·부가 정보로는 찾지 않는다 (판매처명 검색)
    await input.fill(PHONE_RE.exec(FRAME_ROWS[1].info)![0]);
    await expect(rows(sec), "연락처로는 찾지 않는다").toHaveCount(0);
    await input.fill("");
    await expect.poll(() => rowNames(sec), { message: "검색어를 지우면 전체" }).toEqual(FRAME_ROWS.map((r) => r.name));
  });

  test(`[K1][S${S9}] 검색 예시: '과학' 예시는 이름에 '과학' 이 든 행만, 검색 0건 예시는 행 0 + ex-empty-state-card 1 ("${EMPTY_VENDORS}" 문구는 아니다 — 등록된 판매처는 있다)`, async ({ page }) => {
    const search = await area(page, "search");
    const value = await search.getByPlaceholder(SEARCH.placeholder, { exact: true }).inputValue();
    expect(value.trim(), "검색 예시의 검색어").not.toBe("");
    expect(await rowNames(search), "검색 예시 행").toEqual(FRAME_ROWS.map((r) => r.name).filter((n) => n.includes(value.trim())));
    expect((await rowNames(search)).length, "검색 예시 행 수").toBeGreaterThan(0);

    const none = await area(page, "search-empty");
    await expect(rows(none), "검색 0건 행").toHaveCount(0);
    await expect(none.locator(sel("ex-empty-state-card")), "검색 0건 안내 카드").toHaveCount(1);
    await expect(none.locator(sel("ex-empty-state-card")).getByText(EMPTY_VENDORS, { exact: true }), "검색 0건은 '등록한 판매처가 없어요' 가 아니다").toHaveCount(0);
    await none.getByPlaceholder(SEARCH.placeholder, { exact: true }).fill("");
    await expect(rows(none), "검색어를 지우면 목록").toHaveCount(FRAME_ROWS.length);
    await expect(none.locator(sel("ex-empty-state-card"))).toHaveCount(0);
  });

  test(`[K1][S${S9}] vendor-register 목록: 행 ${FRAME_ROWS.length}개 = 판매처명 + 부가 정보 = 연락처만(d7 §18 — note 는 보이지 않음), 행마다 더보기 버튼(하늘색 아이콘), 첫 행만 연하늘 강조`, async ({ page }) => {
    const sec = await area(page, "default");
    await expect(rows(sec)).toHaveCount(FRAME_ROWS.length);
    for (const [i, want] of FRAME_ROWS.entries()) {
      const row = rows(sec).nth(i);
      const lines = (await row.innerText()).split("\n").map(squash).filter(Boolean);
      const contact = PHONE_RE.exec(want.info)![0];
      const note = want.info.slice(want.info.indexOf(" · ") + 3);
      expect(lines, `행 ${i + 1} 글자 = 판매처명 + 연락처`).toEqual([want.name, contact]);
      expect((await row.innerText()).includes(note), `행 ${i + 1}: note "${note}" 는 보이지 않는다`).toBe(false);
      const nameBox = await box(row.getByText(want.name, { exact: true }), "이름");
      const infoBox = await box(row.getByText(contact, { exact: true }), "연락처");
      expect(nameBox.y, `행 ${i + 1}: 이름이 부가 정보 위`).toBeLessThan(infoBox.y);
      const more = moreButton(row);
      await expect(more, `행 ${i + 1} 더보기`).toHaveCount(1);
      await expect(more).toHaveAttribute("aria-expanded", "false");
      expect(await more.getAttribute("aria-label"), `행 ${i + 1} 더보기 이름에 판매처명`).toContain(want.name);
      expect((await box(more, "더보기")).x, `행 ${i + 1}: 더보기가 이름 오른쪽`).toBeGreaterThan(nameBox.x + nameBox.width - 1);
      expect((await groupPaint(more)).icons, `행 ${i + 1} 더보기 아이콘 = 하늘색`).toContain(hexToRgb(MORE_COLORS[0]));
      await expect(row.locator("a"), "행은 링크가 아니다").toHaveCount(0);
    }
    await expect(sec.getByRole("menu"), "닫힌 동안 메뉴 없음").toHaveCount(0);
    expect(await highlightedRows(sec), "방금 저장한 행(첫 행)만 연하늘").toEqual([FRAME_ROWS[0].name]);
    const plain = await rows(sec).nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(plain, `다른 행 바탕 = 프레임(${FRAME_ROWS[1].fill})`).toBe(hexToRgb(FRAME_ROWS[1].fill));
    // 버튼은 목록 아래
    const last = await box(rows(sec).last(), "마지막 행");
    expect((await box(registerButton(sec), REGISTER)).y, `"${REGISTER}" 이 목록 아래`).toBeGreaterThanOrEqual(last.y + last.height);
    await expectMinHeight(registerButton(sec), REGISTER);
  });

  test(`[K1][S${S9}] 더보기 메뉴: 누르면 열린다(aria-haspopup=menu · aria-expanded=true) — menuitem "${MENU_EDIT}" · "${MENU_DELETE}" 2개뿐, 다시 누르면 닫힌다, 한 번에 하나`, async ({ page }) => {
    const sec = await area(page, "default");
    const button = moreButton(rowOf(sec, FRAME_ROWS[1].name));
    await expect(button).toHaveAttribute("aria-haspopup", "menu");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    const menu = await openMenu(sec, FRAME_ROWS[1].name);
    await expect(menu).toBeVisible();
    expect((await menu.getByRole("menuitem").allInnerTexts()).map(squash), "메뉴 항목").toEqual([MENU_EDIT, MENU_DELETE]);
    const controls = await button.getAttribute("aria-controls");
    if (controls) expect(await menu.getAttribute("id"), "aria-controls = 메뉴 id").toBe(controls);
    expect(allColors(await groupPaint(menu)).filter((c) => PINK_RGB.includes(c)), "메뉴에 핑크 없음 ('삭제' 포함)").toEqual([]);
    await expect(sec.locator(sel("ex-modal-card")), "메뉴를 여는 것만으로는 삭제 확인이 뜨지 않는다").toHaveCount(0);

    await button.click();
    await expect(sec.getByRole("menu"), "다시 누르면 닫힌다").toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "false");

    // 다른 행의 더보기를 누르면 앞의 메뉴는 닫힌다
    await openMenu(sec, FRAME_ROWS[1].name);
    const other = moreButton(rowOf(sec, FRAME_ROWS[0].name));
    await other.click();
    await expect(sec.getByRole("menu"), "열린 메뉴는 하나").toHaveCount(1);
    await expect(other).toHaveAttribute("aria-expanded", "true");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(rows(sec), "행 수 그대로").toHaveCount(FRAME_ROWS.length);
  });

  test(`[K1][S${S9}] 더보기 메뉴 접근성: Esc 로 닫히고 포커스가 더보기 버튼으로, 바깥을 눌러도 닫힌다, 키보드(Enter·화살표)로 열고 고를 수 있다`, async ({ page }) => {
    const sec = await area(page, "default");
    const button = moreButton(rowOf(sec, FRAME_ROWS[2].name));
    await openMenu(sec, FRAME_ROWS[2].name);
    await page.keyboard.press("Escape");
    await expect(sec.getByRole("menu"), "Esc 로 닫힘").toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button, "포커스가 더보기 버튼으로 돌아온다").toBeFocused();
    await expect(rows(sec), "Esc 는 목록을 바꾸지 않는다").toHaveCount(FRAME_ROWS.length);

    await openMenu(sec, FRAME_ROWS[2].name);
    await page.locator("#g-default").click();
    await expect(sec.getByRole("menu"), "바깥을 누르면 닫힘").toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "false");

    // 키보드만으로: 버튼에 포커스 → Enter → 첫 항목에 포커스 → 아래 화살표 → 둘째 항목
    await button.focus();
    await page.keyboard.press("Enter");
    const menu = sec.getByRole("menu");
    await expect(menu).toHaveCount(1);
    await expect(menu.getByRole("menuitem", { name: MENU_EDIT, exact: true }), "열리면 첫 항목에 포커스").toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: MENU_DELETE, exact: true })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("menuitem", { name: MENU_EDIT, exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(sec.getByRole("menu"), "항목을 고르면 닫힘").toHaveCount(0);
    await expect(form(sec).getByRole("heading", { name: FORM.editTitle, exact: true }), "수정 폼이 열린다").toBeVisible();
    await expect(field(sec, F_NAME.label)).toHaveValue(FRAME_ROWS[2].name);
  });

  test(`[K1][S${S9}] 더보기 메뉴 예시: 펼쳐진 메뉴 1개 "${MENU_EDIT}" · "${MENU_DELETE}", "${MENU_DELETE}" → 삭제 확인 → "${CANCEL}" 는 그대로, 다시 "${MENU_DELETE}" → 행이 빠지고 ex-toast "${TOAST_DELETED}"`, async ({ page }) => {
    const sec = await area(page, "menu");
    const menu = sec.getByRole("menu");
    await expect(menu, "처음부터 펼쳐진 메뉴").toHaveCount(1);
    expect((await menu.getByRole("menuitem").allInnerTexts()).map(squash)).toEqual([MENU_EDIT, MENU_DELETE]);
    const opened = sec.locator('button[aria-haspopup="menu"][aria-expanded="true"]');
    await expect(opened, "펼쳐진 더보기 버튼 1개").toHaveCount(1);
    const target = (await rows(sec).filter({ has: page.locator('button[aria-haspopup="menu"][aria-expanded="true"]') }).innerText()).split("\n")[0].trim();
    expect(FRAME_ROWS.map((r) => r.name), "메뉴가 열린 행은 시안의 판매처").toContain(target);
    const before = await rowNames(sec);

    await menu.getByRole("menuitem", { name: MENU_DELETE, exact: true }).click();
    await expect(sec.getByRole("menu")).toHaveCount(0);
    const confirm = sec.locator(sel("ex-modal-card"));
    await expect(confirm, "삭제 확인 카드").toHaveCount(1);
    await expect(confirm.getByRole("heading", { name: DELETE_TITLE, exact: true })).toBeVisible();
    await expect(confirm.locator(sel("button-outline")), "확인 카드 button-outline").toHaveCount(1);
    await expect(confirm.locator(sel("button-primary")), "확인 카드 button-primary").toHaveCount(1);
    expect(await rowNames(sec), "확인 전에는 지워지지 않는다").toEqual(before);

    await confirm.locator(sel("button-outline")).filter({ hasText: exact(CANCEL) }).click();
    await expect(confirm, "취소하면 닫힌다").toHaveCount(0);
    expect(await rowNames(sec), "취소하면 그대로").toEqual(before);
    await expect(toasts(sec, TOAST_DELETED), "취소하면 토스트 없음").toHaveCount(0);

    const again = await openMenu(sec, target);
    await again.getByRole("menuitem", { name: MENU_DELETE, exact: true }).click();
    await expect(confirm).toHaveCount(1);
    await confirm.locator(sel("button-primary")).filter({ hasText: exact(MENU_DELETE) }).click();
    await expect(confirm, "삭제하면 닫힌다").toHaveCount(0);
    await expect.poll(() => rowNames(sec), { message: "그 행만 빠진다" }).toEqual(before.filter((n) => n !== target));
    await expect(toasts(sec, TOAST_DELETED), `ex-toast "${TOAST_DELETED}"`).toHaveCount(1);
    await expect(toasts(sec, TOAST_DELETED)).toBeVisible();
    await expect(toasts(sec, TOAST_SAVED), "저장 토스트는 없다").toHaveCount(0);
    expect(await highlightedRows(sec), "삭제 뒤 강조 행 없음").toEqual([]);
  });

  test(`[K1][S${S9}] 등록 폼 예시: 제목 "${CREATE_TITLE}" + text-input 3 ("${F_NAME.label}"(필수) · "${F_CONTACT.label}" · "${F_WEBSITE.label}") 빈 값 + 전폭 button-primary "${FORM.save}" — 판매처명이 비면 비활성`, async ({ page }) => {
    const sec = await area(page, "create");
    const f = form(sec);
    await expect(f).toHaveCount(1);
    await expect(f.getByRole("heading", { name: CREATE_TITLE, exact: true })).toBeVisible();
    await expect(f.locator(sel("text-input")), "폼 text-input").toHaveCount(FORM.fields.length);
    const ys: number[] = [];
    for (const spec of FORM.fields) {
      const input = field(sec, spec.label);
      await expect(input, `"${spec.label}" 입력`).toHaveCount(1);
      await expect(input).toHaveValue("");
      await expect(input).toBeEditable();
      const wrap = f.locator(sel("text-input")).filter({ has: page.getByLabel(spec.label, { exact: true }) });
      await expect(wrap, `"${spec.label}" 은 text-input`).toHaveCount(1);
      if (spec.required) await expect(wrap.getByText(spec.required, { exact: true }), `"${spec.label}" 필수 표시`).toBeVisible();
      else await expect(wrap.getByText(F_NAME.required, { exact: true }), `"${spec.label}" 에는 필수 표시 없음`).toHaveCount(0);
      ys.push((await box(input, spec.label)).y);
    }
    expect(ys, "세로 폼: 판매처명 → 연락처 → 웹사이트 주소").toEqual([...ys].sort((a, b) => a - b));
    expect(new Set(ys).size, "입력은 한 줄에 하나").toBe(ys.length);

    const save = saveButton(sec);
    await expect(save).toHaveCount(1);
    await expect(f.locator(sel("button-primary")), "폼 button-primary 는 저장 하나").toHaveCount(1);
    await expect(save, "판매처명이 비면 저장 비활성").toBeDisabled();
    const sb = await box(save, FORM.save);
    expect(sb.y, "저장은 입력 아래").toBeGreaterThan(ys[ys.length - 1]);
    await expectMinHeight(save, FORM.save);
    // 시안 1.17 9 등록 시트(d7 §18): × 닫기 · 안내 · 취소(button-outline) + 저장(button-primary) 한 줄, 부가 정보 칸 없음
    expect([sheet117.title, sheet117.helper, sheet117.cancel, sheet117.save, sheet117.hasClose], "기대값 원본: 시안 1.17 9 등록 시트").toEqual([CREATE_TITLE, "우리 학교에서만 보여요", CANCEL, FORM.save, true]);
    expect(sheet117.fields, "시안 1.17 입력 칸 = 판매처명·연락처·웹사이트 주소 (부가 정보 없음)").toEqual(FORM.fields.map((x) => x.label));
    await expect(f.getByText(sheet117.helper, { exact: true }), `안내 "${sheet117.helper}"`).toBeVisible();
    await expect(f.getByRole("button", { name: "닫기", exact: true }), "오른쪽 위 × 닫기").toHaveCount(1);
    await expect(f.getByLabel("부가 정보"), "부가 정보 칸 없음").toHaveCount(0);
    const cancel = f.locator(sel("button-outline")).filter({ hasText: exact(sheet117.cancel) });
    await expect(cancel, `button-outline "${sheet117.cancel}"`).toHaveCount(1);
    await expectMinHeight(cancel, sheet117.cancel);
    const cb = await box(cancel, sheet117.cancel);
    expect(Math.abs(cb.y + cb.height / 2 - (sb.y + sb.height / 2)), "취소·저장 한 줄").toBeLessThan(2);
    expect(cb.x + cb.width, "취소가 저장 왼쪽").toBeLessThanOrEqual(sb.x + 0.5);
    expect(sb.width, "저장이 취소보다 넓다 (시안 116:232 · 140:284)").toBeGreaterThan(cb.width);
    const closeB = await box(f.getByRole("button", { name: "닫기", exact: true }), "닫기");
    const titleB = await box(f.getByRole("heading", { name: CREATE_TITLE, exact: true }), "제목");
    expect(closeB.x, "× 닫기는 제목 오른쪽").toBeGreaterThan(titleB.x + titleB.width);
    expect(closeB.y, "× 닫기는 입력 칸 위").toBeLessThan(ys[0]);

    // 다른 칸만 채워도 비활성, 공백만이어도 비활성, 글자를 쓰면 활성, 지우면 다시 비활성
    await field(sec, F_CONTACT.label).fill("043-000-0000");
    await field(sec, F_WEBSITE.label).fill("https://example.com");
    await expect(save, "판매처명 없이 다른 칸만 → 비활성").toBeDisabled();
    await field(sec, F_NAME.label).fill("   ");
    await expect(save, "공백만 → 비활성").toBeDisabled();
    await field(sec, F_NAME.label).fill("새 과학사");
    await expect(save, "판매처명을 쓰면 활성").toBeEnabled();
    await field(sec, F_NAME.label).fill("");
    await expect(save).toBeDisabled();
    expect(allColors(await groupPaint(f)).filter((c) => PINK_RGB.includes(c)), "폼에 핑크 없음").toEqual([]);
  });

  test(`[K1][S${S9}] 등록 폼: 잘못된 웹사이트 주소(javascript: · ftp: · 공백 포함)는 안내가 뜨고 저장되지 않는다 — 행·토스트 변화 없음`, async ({ page }) => {
    const sec = await area(page, "create");
    // 데스크탑: 목록이 폼 옆에 보인다. 모바일: 폼이 열린 동안 목록 자리에 폼이 온다 (저장 뒤 목록에서 확인)
    const before = FRAME_ROWS.map((r) => r.name);
    const listShown = !isMobile(page);
    if (listShown) expect(await rowNames(sec), "등록 폼 예시의 목록 = 시안 4곳").toEqual(before);
    const name = "새 과학사";
    await field(sec, F_NAME.label).fill(name);
    for (const bad of ["javascript:alert(1)", "ftp://example.com/file", "https://exa mple.com", "mailto:shop@example.com", "//example.com"]) {
      await field(sec, F_WEBSITE.label).fill(bad);
      await expect(saveButton(sec)).toBeEnabled();
      await saveButton(sec).click();
      const alert = form(sec).getByRole("alert");
      await expect(alert, `"${bad}" → 안내`).toHaveCount(1);
      await expect(alert).toBeVisible();
      expect(squash(await alert.innerText()), "안내 문구가 비어 있지 않다").not.toBe("");
      await expect(form(sec), "폼은 열린 채").toHaveCount(1);
      await expect(field(sec, F_NAME.label), "입력한 판매처명은 그대로").toHaveValue(name);
      if (listShown) expect(await rowNames(sec), `"${bad}" 는 저장되지 않는다`).toEqual(before);
      await expect(sec.locator(sel("ex-toast")), "토스트 없음").toHaveCount(0);
    }
    // 고치기 시작하면 안내가 사라진다
    await field(sec, F_WEBSITE.label).fill("https://example.com");
    await expect(form(sec).getByRole("alert")).toHaveCount(0);
    // 올바른 주소로 저장하면 그때 한 번만 저장된다 — 앞의 잘못된 시도는 하나도 남지 않았다
    await saveButton(sec).click();
    await expect(form(sec), "올바른 주소는 저장된다").toHaveCount(0);
    await expect(rowOf(sec, name), "새 행은 하나").toHaveCount(1);
    expect((await rowNames(sec)).filter((n) => n !== name), "기존 행은 그대로, 잘못된 시도의 행 없음").toEqual(before);
    await expect(toasts(sec, TOAST_SAVED)).toHaveCount(1);
  });

  test(`[K1][S${S9}] 등록 흐름: "${REGISTER}" → 폼 → "${FORM.save}" → 목록 복귀 + 새 행만 연하늘 강조 + ex-toast "${TOAST_SAVED}", 스킴 없이 적은 주소는 http(s):// 로 저장`, async ({ page }) => {
    const sec = await area(page, "default");
    await expect(form(sec)).toHaveCount(0);
    expect(await highlightedRows(sec), "처음 강조 = 시안 첫 행").toEqual([FRAME_ROWS[0].name]);
    await registerButton(sec).click();
    const f = form(sec);
    await expect(f).toHaveCount(1);
    await expect(f.getByRole("heading", { name: CREATE_TITLE, exact: true })).toBeVisible();
    for (const spec of FORM.fields) await expect(field(sec, spec.label), `"${spec.label}" 빈 값`).toHaveValue("");
    await expect(saveButton(sec)).toBeDisabled();

    const name = "새봄 과학사";
    const contact = "043-123-4567";
    const typed = "www.saebom-science.co.kr";
    await field(sec, F_NAME.label).fill(name);
    await field(sec, F_CONTACT.label).fill(contact);
    await field(sec, F_WEBSITE.label).fill(typed);
    await saveButton(sec).click();

    await expect(form(sec), "저장하면 폼이 닫히고 목록으로").toHaveCount(0);
    await expect(rows(sec)).toHaveCount(FRAME_ROWS.length + 1);
    const row = rowOf(sec, name);
    await expect(row, "새 행").toHaveCount(1);
    await expect(row).toBeVisible();
    await expect(row.getByText(contact), "새 행 부가 정보에 연락처").toBeVisible();
    await expect(moreButton(row), "새 행에도 더보기").toHaveCount(1);
    expect(await highlightedRows(sec), "방금 등록한 행만 연하늘").toEqual([name]);
    await expect(toasts(sec, TOAST_SAVED), `ex-toast "${TOAST_SAVED}"`).toHaveCount(1);
    await expect(toasts(sec, TOAST_SAVED)).toBeVisible();
    expect((await rowNames(sec)).filter((n) => n !== name), "기존 행은 그대로").toEqual(FRAME_ROWS.map((r) => r.name));

    // 저장된 웹사이트 값: http(s):// 로 시작하고 적은 주소를 담는다 (d7 §12)
    await openEdit(sec, name);
    await expect(field(sec, F_NAME.label)).toHaveValue(name);
    await expect(field(sec, F_CONTACT.label)).toHaveValue(contact);
    const saved = await field(sec, F_WEBSITE.label).inputValue();
    expect(saved, "저장된 웹사이트 주소").toMatch(/^https?:\/\//);
    expect(saved).toContain(typed);
  });

  test(`[K1][S${S9}] 등록 폼: 판매처명은 ${NAME_MAX}자까지만 (d7 §12) — 더 길게 쳐도 ${NAME_MAX}자를 넘는 이름은 저장되지 않는다`, async ({ page }) => {
    const sec = await area(page, "create");
    const long = "가".repeat(NAME_MAX + 5);
    await field(sec, F_NAME.label).click();
    await page.keyboard.insertText(long);
    const typed = await field(sec, F_NAME.label).inputValue();
    if (typed.length > NAME_MAX) {
      // 입력을 막지 않는 구현이라면 저장에서 거부해야 한다
      await saveButton(sec).click();
      await expect(form(sec), `${NAME_MAX}자 초과는 저장되지 않는다`).toHaveCount(1);
      await expect(form(sec).getByRole("alert")).toHaveCount(1);
    } else {
      expect(typed.length, `입력은 ${NAME_MAX}자에서 멈춘다`).toBe(NAME_MAX);
      await saveButton(sec).click();
      await expect(form(sec), `${NAME_MAX}자는 저장된다`).toHaveCount(0);
    }
    const names = await rowNames(sec);
    expect(names.every((n) => n.length <= NAME_MAX), `목록에 ${NAME_MAX}자를 넘는 이름 없음`).toBe(true);
  });

  test(`[K1][S${S9}] 수정 폼 예시: 제목 "${FORM.editTitle}" + 첫 행 기존 값("${FRAME_ROWS[0].name}" · 연락처 · 웹사이트 "${FRAME_ROWS[0].site}") + "${FORM.save}" 활성 · 부가 정보 칸 없음`, async ({ page }) => {
    const sec = await area(page, "edit");
    const f = form(sec);
    await expect(f).toHaveCount(1);
    await expect(f.getByRole("heading", { name: FORM.editTitle, exact: true })).toBeVisible();
    await expect(f.getByRole("heading", { name: CREATE_TITLE, exact: true }), "등록 제목은 아니다").toHaveCount(0);
    await expect(f.locator(sel("text-input"))).toHaveCount(FORM.fields.length);
    await expect(field(sec, F_NAME.label)).toHaveValue(FRAME_ROWS[0].name);
    await expect(field(sec, F_CONTACT.label)).toHaveValue(PHONE_RE.exec(FRAME_ROWS[0].info)![0]);
    const website = await field(sec, F_WEBSITE.label).inputValue();
    expect(website, "웹사이트 값에 시안 주소").toContain(FRAME_ROWS[0].site);
    await expect(f.getByLabel(/부가 정보/), "부가 정보 칸 없음 (d7 §18)").toHaveCount(0);
    await expect(saveButton(sec), "판매처명이 있으니 저장 활성").toBeEnabled();
    await field(sec, F_NAME.label).fill("");
    await expect(saveButton(sec), "판매처명을 지우면 비활성").toBeDisabled();
  });

  test(`[K1][S${S9}] 수정 흐름: 더보기 "${MENU_EDIT}" → 기존 값이 채워진 폼 → 연락처를 바꿔 "${FORM.save}" → 그 행의 연락처가 바뀌고(행 = 연락처만, d7 §18) 그 행만 강조 + ex-toast "${TOAST_SAVED}"`, async ({ page }) => {
    const sec = await area(page, "default");
    const target = FRAME_ROWS[2];
    const oldContact = PHONE_RE.exec(target.info)![0];
    const note = target.info.slice(target.info.indexOf(" · ") + 3);
    await openEdit(sec, target.name);
    await expect(field(sec, F_NAME.label)).toHaveValue(target.name);
    await expect(field(sec, F_CONTACT.label)).toHaveValue(oldContact);

    const contact = "043-999-0000";
    await field(sec, F_CONTACT.label).fill(contact);
    await saveButton(sec).click();
    await expect(form(sec), "저장하면 폼이 닫힌다").toHaveCount(0);
    await expect(rows(sec), "행 수 그대로 (새 행이 생기지 않는다)").toHaveCount(FRAME_ROWS.length);
    const lines = (await rowOf(sec, target.name).innerText()).split("\n").map(squash).filter(Boolean);
    expect(lines, "행 글자 = 이름 + 새 연락처 (note 는 행에 보이지 않는다)").toEqual([target.name, contact]);
    expect(lines.join(" ").includes(note), `note "${note}" 는 보이지 않는다`).toBe(false);
    expect(await rowNames(sec), "행 순서 그대로").toEqual(FRAME_ROWS.map((r) => r.name));
    expect(await highlightedRows(sec), "방금 수정한 행만 연하늘").toEqual([target.name]);
    await expect(toasts(sec, TOAST_SAVED)).toHaveCount(1);

    // 이름 바꾸기
    await openEdit(sec, target.name);
    const renamed = "청주 과학기자재";
    await field(sec, F_NAME.label).fill(renamed);
    await saveButton(sec).click();
    await expect(form(sec)).toHaveCount(0);
    await expect(rowOf(sec, renamed)).toHaveCount(1);
    await expect(rowOf(sec, target.name), "옛 이름 행은 없다").toHaveCount(0);
    await expect(rows(sec)).toHaveCount(FRAME_ROWS.length);
    expect(await highlightedRows(sec)).toEqual([renamed]);
  });

  test(`[K1][S${S9}] 수정 폼: 같은 학교 안 같은 이름(대소문자·공백 무시)은 저장되지 않고 안내가 뜬다`, async ({ page }) => {
    const sec = await area(page, "edit");
    // 수정 폼 예시의 목록 = 시안 4곳 (모바일은 폼이 열린 동안 목록 자리에 폼이 온다 — 저장 뒤 목록에서 확인)
    const before = FRAME_ROWS.map((r) => r.name);
    const listShown = !isMobile(page);
    if (listShown) expect(await rowNames(sec), "수정 폼 예시의 목록 = 시안 4곳").toEqual(before);
    const dup = FRAME_ROWS[1].name.replace(/\s+/g, "");
    expect(dup, "공백만 다른 이름").not.toBe(FRAME_ROWS[1].name);
    await field(sec, F_NAME.label).fill(dup);
    await expect(saveButton(sec)).toBeEnabled();
    await saveButton(sec).click();
    const alert = form(sec).getByRole("alert");
    await expect(alert, "같은 이름 안내").toHaveCount(1);
    await expect(alert).toBeVisible();
    await expect(form(sec), "폼은 열린 채").toHaveCount(1);
    if (listShown) expect(await rowNames(sec), "목록은 그대로").toEqual(before);
    await expect(toasts(sec, TOAST_SAVED), "저장 토스트 없음").toHaveCount(0);

    // 자기 이름 그대로 저장하는 것은 중복이 아니다
    await field(sec, F_NAME.label).fill(FRAME_ROWS[0].name);
    await saveButton(sec).click();
    await expect(form(sec), "자기 이름 그대로는 저장된다").toHaveCount(0);
    await expect(toasts(sec, TOAST_SAVED)).toHaveCount(1);
    expect(await rowNames(sec), "이름이 겹치는 행이 생기지 않았다").toEqual(before);
  });

  test(`[K1][S${S9}] 삭제 확인 예시: ex-modal-card "${DELETE_TITLE}" + button-outline "${CANCEL}" · button-primary "${MENU_DELETE}" 가로 배치, 핑크·하늘색 없음`, async ({ page }) => {
    const sec = await area(page, "delete");
    const card = sec.locator(sel("ex-modal-card"));
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("role", "dialog");
    await expect(card.getByRole("heading", { name: DELETE_TITLE, exact: true })).toBeVisible();
    const cancel = card.locator(sel("button-outline"));
    const confirm = card.locator(sel("button-primary"));
    await expect(cancel).toHaveCount(1);
    await expect(confirm).toHaveCount(1);
    await expect(cancel).toHaveText(exact(CANCEL));
    await expect(confirm).toHaveText(exact(MENU_DELETE));
    await expect(cancel).toBeEnabled();
    await expect(confirm).toBeEnabled();
    await expectMinHeight(cancel, CANCEL);
    await expectMinHeight(confirm, MENU_DELETE);
    const cb = await box(cancel, CANCEL);
    const ob = await box(confirm, MENU_DELETE);
    expect(cb.x, "취소가 삭제 왼쪽").toBeLessThan(ob.x);
    expect(Math.abs(cb.y - ob.y), "취소·삭제 같은 줄").toBeLessThan(cb.height);
    expect((await box(card.getByRole("heading", { name: DELETE_TITLE, exact: true }), "제목")).y, "제목이 버튼 위").toBeLessThan(cb.y);
    await expect(card.locator(sel("text-input")), "확인 카드에 입력 없음").toHaveCount(0);
    // 카드는 열릴 때 포커스를 받는다 — 포커스 표시(포커스 링)를 빼고 카드 자체의 색만 본다
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    const colors = allColors(await groupPaint(card));
    expect(colors.filter((c) => PINK_RGB.includes(c)), "삭제 확인에 핑크 없음").toEqual([]);
    expect(colors.filter((c) => HIGHLIGHT_RGB.includes(c)), "삭제 확인에 하늘색 없음").toEqual([]);
  });

  test(`[K1][S${S9}] 판매처 0건: ex-empty-state-card "${EMPTY_VENDORS}" 1개(하늘색 안내 아이콘) + 등록 진입, 행·더보기 0, 카드의 등록 진입을 누르면 "${CREATE_TITLE}" 폼`, async ({ page }) => {
    const sec = await area(page, "empty");
    await expect(register(sec), "0건이어도 vendor-register 블록").toHaveCount(1);
    const empty = sec.locator(sel("ex-empty-state-card"));
    await expect(empty).toHaveCount(1);
    await expect(empty.getByText(EMPTY_VENDORS, { exact: true })).toBeVisible();
    await expect(rows(sec), "행").toHaveCount(0);
    await expect(sec.locator('button[aria-haspopup="menu"]'), "더보기").toHaveCount(0);
    expect((await groupPaint(empty)).icons.some((c) => HIGHLIGHT_RGB.includes(c)), "안내 아이콘 = 하늘색").toBe(true);
    await expect(registerButton(sec), `button-primary "${REGISTER}" 는 그대로`).toHaveCount(1);
    const entry = empty.getByRole("button", { name: REGISTER, exact: true });
    await expect(entry, "빈 상태 카드 안 등록 진입").toHaveCount(1);
    await expect(form(sec)).toHaveCount(0);
    await entry.click();
    await expect(form(sec), "등록 폼이 열린다").toHaveCount(1);
    await expect(form(sec).getByRole("heading", { name: CREATE_TITLE, exact: true })).toBeVisible();

    // 첫 판매처를 등록하면 빈 상태가 사라지고 행 1개
    await field(sec, F_NAME.label).fill("첫 판매처");
    await saveButton(sec).click();
    await expect(form(sec)).toHaveCount(0);
    await expect(rows(sec)).toHaveCount(1);
    await expect(sec.locator(sel("ex-empty-state-card")), "빈 상태 사라짐").toHaveCount(0);
    await expect(toasts(sec, TOAST_SAVED)).toHaveCount(1);
    expect(await highlightedRows(sec)).toEqual(["첫 판매처"]);
  });

  test(`[K1][S${S9}] 판매처 0건의 "${REGISTER}" 버튼도 같은 등록 폼을 연다`, async ({ page }) => {
    const sec = await area(page, "empty");
    await registerButton(sec).click();
    await expect(form(sec)).toHaveCount(1);
    await expect(form(sec).getByRole("heading", { name: CREATE_TITLE, exact: true })).toBeVisible();
    await expect(saveButton(sec)).toBeDisabled();
  });

  test(`[K1][S${S9}] 공통 목록 탭: ex-data-table-cell 2열 보기 전용 — d7 seed ${SEED.length}곳, vendor-register·더보기·"${MENU_EDIT}"·"${MENU_DELETE}"·"${REGISTER}" 0, 하늘색 없음`, async ({ page }) => {
    const sec = await area(page, "common");
    const seg = sec.locator(sel("segmented-control"));
    await expect(seg.locator(sel("segmented-control-active"))).toHaveText(exact(SEG.labels[1]));
    await expect(register(sec), "공통 목록 탭에 vendor-register 없음").toHaveCount(0);
    const table = sec.getByRole("table");
    await expect(table).toHaveCount(1);
    const headers = table.getByRole("columnheader");
    await expect(headers, "2열").toHaveCount(2);
    expect((await headers.allInnerTexts()).map(squash), "열 = 판매처명 · 부가 정보").toEqual([F_NAME.label, "부가 정보"]);
    expect(await headers.evaluateAll((els) => els.map((e) => e.getAttribute("data-component"))), "머리글 셀 = ex-data-table-cell").toEqual(["ex-data-table-cell", "ex-data-table-cell"]);
    const bodyRows = table.locator("tbody tr");
    await expect(bodyRows, "공통 판매처 행").toHaveCount(SEED.length);
    for (const row of await bodyRows.all()) {
      await expect(row.locator(sel("ex-data-table-cell")), "행마다 셀 2개").toHaveCount(2);
      expect(await row.locator(sel("ex-data-table-cell")).evaluateAll((els) => els.map((e) => e.tagName.toLowerCase())), "셀은 누를 수 없는 td").toEqual(["td", "td"]);
    }
    const firstColumn = (await bodyRows.evaluateAll((els) => els.map((e) => (e.querySelector("td")?.textContent ?? "").trim()))).sort();
    expect(firstColumn, "공통 목록 = d7 §12 seed").toEqual(SEED.map((s) => s.name).sort());

    // 보기 전용
    await expect(table.getByRole("button"), "표 안 버튼").toHaveCount(0);
    await expect(sec.locator('button[aria-haspopup="menu"]'), "더보기").toHaveCount(0);
    await expect(sec.getByRole("menu")).toHaveCount(0);
    for (const label of [MENU_EDIT, MENU_DELETE, REGISTER, FORM.save]) {
      await expect(sec.getByRole("button", { name: label, exact: true }), `"${label}" 버튼`).toHaveCount(0);
    }
    await expect(sec.locator(sel("button-primary")), "button-primary").toHaveCount(0);
    await expect(sec.locator("form"), "폼").toHaveCount(0);
    await expect(sec.locator(sel("text-input")), "입력은 검색 하나").toHaveCount(1);
    for (const r of FRAME_ROWS) await expect(table.getByText(r.name, { exact: true }), `학교 판매처 "${r.name}" 는 공통 목록에 없다`).toHaveCount(0);
    const colors = allColors(await groupPaint(table));
    expect(colors.filter((c) => HIGHLIGHT_RGB.includes(c)), "공통 목록 표에 하늘색 없음").toEqual([]);
    expect(colors.filter((c) => PINK_RGB.includes(c)), "공통 목록 표에 핑크 없음").toEqual([]);
  });

  test(`[K1][S${S9}] ex-toast: "${TOAST_SAVED}" · "${TOAST_DELETED}" 문구 + 하늘색 체크 아이콘, 기본 예시(저장 직후)에는 "${TOAST_SAVED}" 1개`, async ({ page }) => {
    const sec = await area(page, "toast");
    for (const text of [TOAST_SAVED, TOAST_DELETED]) {
      await expect(toasts(sec, text), `ex-toast "${text}"`).toHaveCount(1);
      await expect(toasts(sec, text)).toBeVisible();
      expect((await groupPaint(toasts(sec, text))).icons, `"${text}" 체크 아이콘 = 하늘색`).toContain(hexToRgb(TOAST_ICON[0]));
    }
    await expect(sec.locator(sel("ex-toast"))).toHaveCount(2);
    const def = await area(page, "default");
    await expect(def.locator(sel("ex-toast"))).toHaveCount(1);
    await expect(toasts(def, TOAST_SAVED)).toBeVisible();
  });

  test(`[K1][S${S9}] /gallery/vendors 색 범위: 핑크(accent·accent_soft) 0곳 — 메뉴 "${MENU_DELETE}"·삭제 확인 포함, button-primary 안에 하늘색 없음`, async ({ page }) => {
    const main = page.locator("main");
    const sec = await area(page, "default");
    await openMenu(sec, FRAME_ROWS[1].name);
    const uses = await colorUses(main);
    expect(using(uses, PINK_RGB).map((u) => u.where), "판매처 설정 화면에서 핑크를 쓰는 요소").toEqual([]);
    await expect(main.locator(sel(BADGE)), "배지 없음").toHaveCount(0);
    const forbidden = await colorUses(main, rules.colors.highlight.forbidden_within);
    expect(using(forbidden, HIGHLIGHT_RGB).filter((u) => u.inside).map((u) => u.where), "하늘색 금지 컴포넌트 안에서 하늘색을 쓰는 요소").toEqual([]);
  });
});
