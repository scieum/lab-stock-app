// 화면 5 (실험 매뉴얼) 새 컴포넌트의 컴포넌트 수준 동작 — 갤러리(/gallery/manual, /gallery · 비로그인 공개) 대상.
// 기준: 디자인 run 20261002-1441 s2-spec "## 화면 5" (manual-upload 업로드 · badge-overlay · text-input 조 수 · extraction-table · 하단 버튼 · ex-toast),
//       DESIGN-HARNESS docs/design.md (badge-overlay = rgba(115,115,115,0.56) 반투명 회색 + on-primary 글자, extraction-table = ex-data-table-cell + text-input),
//       harness/d7-data.md §13 (파일 PDF·JPG·PNG 4MB · 조 수 1~20 · 단위 · 시약 연결 · 확인 표 · 저장), harness/dev-rules.json components·components_note.
// 기대값: 개수·문구·채움색은 design/frames/5-mobile.json · 5-desktop.json 노드에서, 색 범위·버튼 높이는 design/rules.json 에서,
//         컴포넌트 목록은 harness/dev-rules.json 에서, 프레임에 없는 상태의 문구·숫자는 d7-data.md §13 문장에서 읽는다 (구현에서 읽지 않는다).
//         갤러리 예시 데이터(시약 이름·수량)는 화면에서 읽어 규칙(필요량 = 사용량 × 조 수 등)으로 검산한다.
// 태그: [K1] 은 dev-rules test_rules 에 없으므로 judge 의 규칙별 e2e 집계에 섞이지 않는다. [S5] 로 화면 5 실행에 포함된다.
// /manual 화면(D3)·추출 API·DB(D2) 검사는 여기서 하지 않는다. 실제 Gemini 호출 없음 (갤러리 데모는 가짜 결과).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const S5 = 5;
const GALLERY = "/gallery";
const GALLERY_MANUAL = "/gallery/manual";

type FrameNode = { name: string; type: string; path: string[]; fills: string[]; strokes: string[]; text: { characters: string } | null };
type Frame = { frames: { name: string; nodes: FrameNode[] }[] };
type Rules = {
  colors: {
    allowed_rgba: { value: string; only_in: string }[];
    accent: { value: string; only_within: string[] };
    accent_soft: { value: string };
    on_primary: { value: string };
    highlight: { values: string[]; forbidden_within: string[] };
  };
  button: { min_height: number };
  roles: { R1: { role: string; component: string; max: number } };
  tab_bar: { component: string; item: string };
  app_exceptions: Record<string, string>;
};
type Dev = { components: Record<string, number[]>; routes: Record<string, string> };

const root = process.cwd();
const rules = JSON.parse(readFileSync(join(root, "design/rules.json"), "utf8")) as Rules;
const dev = JSON.parse(readFileSync(join(root, "harness/dev-rules.json"), "utf8")) as Dev;
const D7 = readFileSync(join(root, "harness/d7-data.md"), "utf8");
const loadFrame = (name: string) => (JSON.parse(readFileSync(join(root, `design/frames/${name}.json`), "utf8")) as Frame).frames[0].nodes;
const m5 = loadFrame(`${S5}-mobile`);
const d5 = loadFrame(`${S5}-desktop`);

// ---------- 기대값: 프레임 ----------
const leaf = (n: FrameNode) => n.path[n.path.length - 1];
const lower = (s: string | undefined) => (s ?? "").toLowerCase();
const under = (nodes: FrameNode[], ancestor: string) => nodes.filter((n) => n.path.slice(0, -1).includes(ancestor));
const textOf = (nodes: FrameNode[], name: string) => nodes.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);
const nodeOf = (nodes: FrameNode[], name: string) => nodes.find((n) => leaf(n) === name);

const UPLOAD = "manual-upload";
const OVERLAY = "badge-overlay";
const TABLE = "extraction-table";
const CELL = "ex-data-table-cell";
const INPUT = "text-input";
const TOAST = "ex-toast";
const PRIMARY = "button-primary";
const OUTLINE = "button-outline";

const uploadNodes = under(m5, UPLOAD);
const tableNodes = under(m5, TABLE);
const GUIDE = { text: textOf(uploadNodes, "upload-guide")[0], color: lower(nodeOf(uploadNodes, "upload-guide")?.fills[0]) };
const FRAME_FILE = textOf(under(m5, OVERLAY), "label")[0];
const OVERLAY_FRAME = { fill: nodeOf(m5, OVERLAY)?.fills[0] ?? "", label: lower(under(m5, OVERLAY).find((n) => n.name === "label")?.fills[0]) };
const UPLOAD_ICON = [...new Set(uploadNodes.filter((n) => n.path.includes("icon-upload")).flatMap((n) => [...n.fills, ...n.strokes].map(lower)))];
const PROGRESS = {
  track: lower(nodeOf(uploadNodes, "progress-track")?.fills[0]),
  bar: lower(nodeOf(uploadNodes, "progress-bar")?.fills[0]),
  label: textOf(uploadNodes, "progress-label")[0],
};
const groupsNodes = m5.filter((n) => n.path.includes(INPUT) && !n.path.includes(TABLE));
const GROUPS_FIELD = { label: textOf(groupsNodes, "field-label")[0], value: textOf(groupsNodes, "input-value")[0], unit: textOf(groupsNodes, "input-unit")[0] };
const GROUPS = Number(GROUPS_FIELD.value);
const TITLE = textOf(tableNodes, "table-title")[0];
const CLOSE = textOf(tableNodes, "close")[0];
const HEAD = textOf(tableNodes, "cell-label");
/** 본문 행: [시약명, 1조 사용량, 단위, 1반 1회 필요량] */
const FRAME_ROWS: string[][] = (() => {
  const values = tableNodes.filter((n) => (n.name === "cell-value" || n.name === "input-value") && n.text).map((n) => n.text!.characters);
  const out: string[][] = [];
  for (let i = 0; i < values.length; i += HEAD.length || 1) out.push(values.slice(i, i + HEAD.length));
  return out;
})();
/** 표 안 text-input 채움 (행 순서). 고친 칸 = 연하늘 */
const INPUT_FILLS = tableNodes.filter((n) => leaf(n) === INPUT).map((n) => lower(n.fills[0]));
const actionNodes = under(m5, "bottom-actions");
const RETRY = actionNodes.find((n) => n.name === "label" && n.path.includes(OUTLINE))?.text?.characters ?? "";
const SAVE = actionNodes.find((n) => n.name === "label" && n.path.includes(PRIMARY))?.text?.characters ?? "";

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
const COUNTS_5M = countByName(m5);
const COUNTS_5D = countByName(d5);
/** 2단계(결과 표 + 하단 버튼)만의 개수 */
const COUNTS_RESULT = countByName(m5.filter((n) => n.path.includes(TABLE) || n.path.includes("bottom-actions")));
const screenComponents = (screen: number) => componentNames.filter((n) => dev.components[n].includes(screen) && !SHELL.includes(n));

// ---------- 기대값: rules.json ----------
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}
const HIGHLIGHTS = rules.colors.highlight.values.map(lower);
const SKY = hexToRgb(PROGRESS.bar || "#000000");
const SOFT = hexToRgb(PROGRESS.track || "#000000");
const PINK_RGB = [rules.colors.accent.value, rules.colors.accent_soft.value].map(lower).map(hexToRgb);
const OVERLAY_RULE = rules.colors.allowed_rgba.find((c) => c.only_in === OVERLAY)?.value ?? "";
const OVERLAY_BG = OVERLAY_RULE.replace(/\s+/g, "").replace(/,/g, ", ");
const ON_PRIMARY = hexToRgb(rules.colors.on_primary.value);
const MIN_H = rules.button.min_height;

// ---------- 기대값: d7-data.md §13 ----------
const d7Section = (() => {
  const start = D7.indexOf("## 13. 실험 매뉴얼");
  const rest = D7.slice(start + 1);
  const end = rest.search(/\n## /);
  return start < 0 ? "" : D7.slice(start, end < 0 ? undefined : start + 1 + end);
})();
const d7Line = (head: string) => d7Section.split(/\r?\n/).find((l) => l.startsWith(`| ${head} |`)) ?? "";
const FILE_KINDS = (/^\| 파일 \| ([^,]+?) 1개/.exec(d7Line("파일"))?.[1] ?? "").split("·").map((s) => s.trim());
const MAX_MB = Number(/(\d+)MB 이하/.exec(d7Line("파일"))?.[1] ?? Number.NaN);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const groupsRange = /(\d+)~(\d+) 정수/.exec(d7Line("조 수"));
const G_MIN = Number(groupsRange?.[1] ?? Number.NaN);
const G_MAX = Number(groupsRange?.[2] ?? Number.NaN);
const UNITS = (/추출 단위는 (\S+) 중 하나로 정리/.exec(d7Line("단위"))?.[1] ?? "").split("·");
const EXTRACT = "AI 추출";
const TOAST_SAVED = "재주문 기준을 저장했어요";
const UNLINKED = "등록되지 않은 시약";
const OUR_REAGENT = "우리 학교 시약";
const BASIS_RE = /기존 기준 ([\d.,]+) ?(\S+)/;
const D7_QUOTES = [`"${EXTRACT}"`, `"${PROGRESS.label}"`, `"${SAVE}"`, `"${RETRY}"`, `"${TOAST_SAVED}"`, `"${UNLINKED}"`, `"${OUR_REAGENT}"`, '"기존 기준 N"'];
// 허용 형식마다 accept 에 쓸 수 있는 표기
const ACCEPT_TOKENS: Record<string, string[]> = { PDF: ["application/pdf", ".pdf"], JPG: ["image/jpeg", ".jpg", ".jpeg"], PNG: ["image/png", ".png"] };

// ---------- 주입할 파일 ----------
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const PNG_BYTES = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const pdf = (name: string, size?: number) => ({
  name,
  mimeType: "application/pdf",
  buffer: size === undefined ? PDF_BYTES : Buffer.concat([PDF_BYTES, Buffer.alloc(size - PDF_BYTES.length, 0x20)]),
});
const LONG_NAME = "2학년 1학기 과학 탐구 실험 산과 염기의 중화 반응 활동지 최종 수정본 스캔 사진 (3반 배부용).png";

const sel = (name: string) => `[data-component="${name}"]`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** 수량 표기: 소수 3자리까지, 오차 없이 ("300", "1,200", "0.3") */
const amountText = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 });
const requiredText = (perGroup: string, groups: number, unit: string) => `${amountText((Math.round(Number(perGroup) * 1000) * groups) / 1000)} ${unit}`;
const toNumber = (s: string) => Number(s.replace(/,/g, ""));

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

type Use = { where: string; colors: string[] };
/** scope 안 모든 요소가 실제로 쓰는 색 (글자·바탕·선·아이콘) */
async function colorUses(scope: Locator): Promise<Use[]> {
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
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo) as unknown as Record<string, string>;
        if (ps.content !== "none" && ps.content !== "normal") colors.push(ps.backgroundColor);
      }
      const section = el.closest("section[aria-labelledby]")?.getAttribute("aria-labelledby") ?? "";
      out.push({ where: `${section} ${el.tagName.toLowerCase()}${el.getAttribute("data-component") ? `[${el.getAttribute("data-component")}]` : ""}`, colors });
    }
    return out;
  });
}
const pinkUses = async (scope: Locator) => (await colorUses(scope)).filter((u) => u.colors.some((c) => PINK_RGB.includes(c))).map((u) => u.where);

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

// ---------- 업로드 영역 ----------
/** 화면 5 의 업로드 영역 = 파일 입력을 가진 manual-upload (화면 6 의 안내 박스와 이름이 같다) */
const uploadArea = (scope: Locator) => scope.locator(sel(UPLOAD)).filter({ has: scope.page().locator('input[type="file"]') });
const fileInput = (scope: Locator) => uploadArea(scope).locator('input[type="file"]');
const overlay = (scope: Locator) => uploadArea(scope).locator(sel(OVERLAY));
const alerts = (scope: Locator) => uploadArea(scope).getByRole("alert");
const progress = (scope: Locator) => uploadArea(scope).getByRole("progressbar");
/** badge-overlay 의 전체 글자 (말줄임이어도 DOM 글자 또는 title 로 얻을 수 있다) */
const overlayNames = async (badge: Locator) => badge.evaluate((el) => [(el.textContent ?? "").trim(), el.getAttribute("title") ?? "", el.getAttribute("aria-label") ?? ""]);

// ---------- 추출 결과 표 ----------
const table = (scope: Locator) => scope.locator(sel(TABLE));
const bodyRows = (scope: Locator) => table(scope).locator("tbody[data-row-id]");
const rowByName = (scope: Locator, name: string) => bodyRows(scope).filter({ has: scope.page().locator(`td${sel(CELL)}`).getByText(name, { exact: true }) });
const amountInput = (row: Locator) => row.locator(sel(CELL)).locator(`${sel(INPUT)} input`);
const unitSelect = (row: Locator) => row.getByRole("combobox", { name: /단위/ });
const reagentPicker = (row: Locator) => row.getByRole("button", { name: new RegExp(esc(OUR_REAGENT)) });
const removeButton = (row: Locator) => row.getByRole("button", { name: /삭제/ });
const saveButton = (scope: Locator) => scope.locator(`button${sel(PRIMARY)}`).filter({ hasText: exact(SAVE) });
const retryButton = (scope: Locator) => scope.locator(`button${sel(OUTLINE)}`).filter({ hasText: exact(RETRY) });
const extractButton = (scope: Locator) => scope.locator(`button${sel(PRIMARY)}`).filter({ hasText: exact(EXTRACT) });
const toasts = (scope: Locator) => scope.locator(sel(TOAST)).filter({ hasText: exact(TOAST_SAVED) });

type RowData = {
  id: string;
  status: string;
  /** 4열의 값 (입력은 value, 선택은 고른 항목 글자) */
  cells: string[];
  /** 열마다 text-input 개수 */
  inputs: number[];
  /** 사용량 칸이 고친 칸으로 표시됐는가 (data-edited) */
  edited: boolean;
  /** 사용량 칸(text-input 과 그 안)의 바탕색 */
  inputBgs: string[];
  /** 4열 아래 보조 줄의 글자 */
  detail: string;
  /** 연결된 우리 학교 시약 선택 칸 글자 */
  linked: string;
};
async function readRows(scope: Locator): Promise<RowData[]> {
  return bodyRows(scope).evaluateAll(
    (els, arg) =>
      els.map((tb) => {
        const cells = Array.from(tb.querySelectorAll(`td${arg.cell}`));
        const value = (c: Element) => {
          const input = c.querySelector("input");
          if (input) return input.value;
          const select = c.querySelector("select");
          if (select) return (select.selectedOptions[0]?.textContent ?? "").trim();
          return ((c as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim();
        };
        const inputEls = Array.from(tb.querySelectorAll(arg.input));
        const inputBgs = inputEls.flatMap((el) => [el, ...Array.from(el.querySelectorAll("*"))].map((e) => getComputedStyle(e).backgroundColor));
        // 보조 줄의 안내 글자만: 선택 칸·버튼·목록의 글자는 뺀다
        const detail = Array.from(tb.querySelectorAll("tr"))
          .slice(1)
          .map((r) => {
            const copy = r.cloneNode(true) as HTMLElement;
            for (const e of Array.from(copy.querySelectorAll('button, select, input, [role="listbox"], svg'))) e.remove();
            return copy.textContent ?? "";
          })
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        const picker = Array.from(tb.querySelectorAll('button[aria-haspopup="listbox"]'))[0] as HTMLElement | undefined;
        return {
          id: tb.getAttribute("data-row-id") ?? "",
          status: tb.getAttribute("data-status") ?? "",
          cells: cells.map(value),
          inputs: cells.map((c) => c.querySelectorAll(arg.input).length),
          edited: inputEls.some((el) => el.hasAttribute("data-edited")),
          inputBgs,
          detail,
          linked: (picker?.innerText ?? "").replace(/\s+/g, " ").trim(),
        };
      }),
    { cell: sel(CELL), input: sel(INPUT) },
  );
}
/** "염산 0.1M (mL)" → "mL" */
const linkedUnit = (r: RowData) => /\(([^()]+)\)\s*$/.exec(r.linked)?.[1] ?? "";
/** 저장할 수 없는 이유: 표·토스트·업로드 영역·입력 밖에 보이는 status/alert 문구 */
async function blockReasons(scope: Locator): Promise<string[]> {
  return scope.locator('[role="status"], [role="alert"]').evaluateAll((els) =>
    els
      .filter((e) => e.closest('[data-component="extraction-table"], [data-component="ex-toast"], [data-component="manual-upload"], [data-component="text-input"]') === null)
      .filter((e) => {
        const cs = getComputedStyle(e);
        return cs.display !== "none" && cs.visibility !== "hidden";
      })
      .map((e) => ((e as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
}
/** 우리 학교 시약 선택 칸을 열어 pick 이 고른 항목을 누른다. 고른 항목 글자를 돌려준다 */
async function chooseReagent(row: Locator, pick: (labels: string[]) => number): Promise<string> {
  const button = reagentPicker(row);
  await expect(button, `"${OUR_REAGENT}" 선택 칸`).toHaveCount(1);
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const options = row.getByRole("listbox").getByRole("option");
  await expect(options.first()).toBeVisible();
  const labels = (await options.allInnerTexts()).map(squash);
  const index = pick(labels);
  expect(index, `고를 항목 (${labels.join(" / ")})`).toBeGreaterThanOrEqual(0);
  await options.nth(index).click();
  await expect(row.getByRole("listbox"), "고르면 목록이 닫힌다").toHaveCount(0);
  return labels[index];
}

// =====================================================================
// 기대값 자체 점검
// =====================================================================
test(`[K1][S${S5}] 기대값 원본: 프레임 5-mobile·5-desktop 과 rules.json colors, d7 §13 문구가 서로 맞는다`, () => {
  expect(GUIDE.text).toBe("실험 매뉴얼을 올리면 시약별 사용량을 찾아드려요");
  expect(FRAME_FILE).toBe("산과 염기의 중화 반응.pdf");
  expect(OVERLAY_FRAME.fill.replace(/\s+/g, ""), "프레임 badge-overlay 채움 = rules allowed_rgba(only_in badge-overlay)").toBe(OVERLAY_RULE.replace(/\s+/g, ""));
  expect(OVERLAY_BG).toBe("rgba(115, 115, 115, 0.56)");
  expect(OVERLAY_FRAME.label, "badge-overlay 글자 = on_primary").toBe(lower(rules.colors.on_primary.value));
  expect(UPLOAD_ICON.length > 0 && UPLOAD_ICON.every((c) => HIGHLIGHTS.includes(c)), "업로드 아이콘 = 하늘색").toBe(true);
  expect(HIGHLIGHTS, "진행 막대 = 하늘색").toContain(PROGRESS.bar);
  expect(HIGHLIGHTS, "진행 트랙 = 연하늘").toContain(PROGRESS.track);
  expect(PROGRESS.bar).not.toBe(PROGRESS.track);
  expect(PROGRESS.label).toBe("사용량을 찾고 있어요");
  expect(GROUPS_FIELD).toEqual({ label: "조 수", value: "6", unit: "조" });
  expect(TITLE).toBe("추출 결과 확인");
  expect(CLOSE).toBe("닫기");
  expect(HEAD).toEqual(["시약명", "1조 사용량", "단위", "1반 1회 필요량"]);
  expect(d7Line("확인 표"), "d7 §13 확인 표 4열").toContain("4열(시약명 · 1조 사용량 · 단위 · 1반 1회 필요량");
  expect(FRAME_ROWS.length, "프레임 본문 4행").toBe(4);
  for (const [name, per, unit, required] of FRAME_ROWS) {
    expect(UNITS, `${name} 단위`).toContain(unit);
    expect(required, `${name} 필요량 = 사용량 × 조 수`).toBe(requiredText(per, GROUPS, unit));
  }
  expect(INPUT_FILLS.length, "표 안 text-input = 행 수").toBe(FRAME_ROWS.length);
  expect(INPUT_FILLS.map((f) => hexToRgb(f) === SOFT), "프레임에서 첫 행 사용량만 연하늘(고친 칸)").toEqual([true, false, false, false]);
  expect([RETRY, SAVE]).toEqual(["다시 추출", "확인 후 저장"]);
  for (const q of D7_QUOTES) expect(d7Section, `d7 §13 에 ${q}`).toContain(q);
  expect(FILE_KINDS).toEqual(["PDF", "JPG", "PNG"]);
  expect(MAX_MB).toBe(4);
  expect([G_MIN, G_MAX]).toEqual([1, 20]);
  expect(UNITS).toEqual(["병", "mL", "g"]);
  expect(rules.roles.R1.component, "R1 대상 컴포넌트").toBe(UPLOAD);
  expect(dev.routes[String(S5)], "dev-rules routes 5").toBe("/manual");
  for (const counts of [COUNTS_5M, COUNTS_5D]) {
    expect(counts).toEqual({ [UPLOAD]: 1, [OVERLAY]: 1, [INPUT]: 5, [TABLE]: 1, [CELL]: 20, [OUTLINE]: 1, [PRIMARY]: 1 });
  }
  expect(COUNTS_RESULT).toEqual({ [TABLE]: 1, [CELL]: 20, [INPUT]: 4, [OUTLINE]: 1, [PRIMARY]: 1 });
  // 프레임에 핑크가 없다 (rules: 핑크는 badge-low-stock·reorder-alert-card·mix-warning 안에서만)
  for (const nodes of [m5, d5]) {
    const pink = nodes.filter((n) => [...n.fills, ...n.strokes].map(lower).some((c) => [rules.colors.accent.value, rules.colors.accent_soft.value].map(lower).includes(c)));
    expect(pink.map((n) => n.path.join("/")), "화면 5 프레임의 핑크 노드").toEqual([]);
  }
  for (const name of [UPLOAD, OVERLAY, TABLE, CELL, INPUT, TOAST]) expect(rules.colors.accent.only_within, `핑크 허용 범위에 ${name} 없음`).not.toContain(name);
});

// =====================================================================
// 갤러리 등장 (K1 의 DOM 판)
// =====================================================================
test(`[K1][S${S5}] /gallery DOM 에 새 컴포넌트 badge-overlay · extraction-table 이 각각 1개 이상, manual-upload 는 화면 6 안내 박스와 화면 5 업로드 영역(파일 입력) 둘 다, 새 data-component 이름 없음`, async ({ page }) => {
  const fresh = componentNames.filter((n) => dev.components[n].length === 1 && dev.components[n][0] === S5);
  expect(fresh.sort(), "dev-rules 에서 화면 5 에만 있는 컴포넌트").toEqual([OVERLAY, TABLE]);
  expect(dev.components[UPLOAD], "manual-upload 는 화면 5·6").toEqual(expect.arrayContaining([S5, 6]));
  await open(page, GALLERY);
  for (const n of fresh) expect(await page.locator(sel(n)).count(), `/gallery ${n}`).toBeGreaterThanOrEqual(1);
  const body = page.locator("body");
  expect(await uploadArea(body).count(), "/gallery manual-upload 업로드 영역").toBeGreaterThanOrEqual(1);
  expect(await page.locator(sel(UPLOAD)).filter({ has: page.locator(`a[href="${dev.routes[String(S5)]}"]`) }).count(), "/gallery manual-upload 안내 박스(→ /manual)").toBeGreaterThanOrEqual(1);
  // 표는 시안 4열 머리행 + ex-data-table-cell, badge-overlay 는 반투명 회색
  const t = page.locator(sel(TABLE)).first();
  await expect(t.getByRole("columnheader")).toHaveText(HEAD.map(exact));
  expect(await t.locator(sel(CELL)).count(), "/gallery extraction-table 안 ex-data-table-cell").toBeGreaterThanOrEqual(COUNTS_5M[CELL]);
  expect(await page.locator(sel(OVERLAY)).first().evaluate((el) => getComputedStyle(el).backgroundColor), "badge-overlay 바탕").toBe(OVERLAY_BG);
  await expectKnownNames(page);
});

test(`[K1][S${S5}] /gallery/manual DOM 에 화면 ${S5} 컴포넌트(dev-rules, nav-pill·tab-bar 제외)가 각각 1개 이상, 새 data-component 이름 없음, 가로 넘침 없음, 핑크 없음`, async ({ page }) => {
  const want = screenComponents(S5);
  // 공통 셸 예외(rules.json app_exceptions — 디자인 1.15 nav-account-menu)는 시안 5 프레임에 없고 dev-rules 가 화면 5 에 더한다
  const shellExceptions = componentNames.filter((n) => n in rules.app_exceptions && dev.components[n].includes(S5));
  expect(shellExceptions, "app_exceptions 중 화면 5 셸 컴포넌트 (nav-account-menu)").toEqual(["nav-account-menu"]);
  expect(want.sort(), "dev-rules 화면 5 컴포넌트").toEqual([OVERLAY, OUTLINE, PRIMARY, CELL, TOAST, TABLE, UPLOAD, INPUT, ...shellExceptions].sort());
  await open(page, GALLERY_MANUAL);
  for (const n of want) expect(await page.locator(sel(n)).count(), `/gallery/manual ${n}`).toBeGreaterThanOrEqual(1);
  await expectKnownNames(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "페이지 가로 넘침(px)").toBeLessThanOrEqual(0);
  // 오류·경고 상태(파일 오류 · 단위 불일치 · 미연결 · 저장 불가 이유) 예시까지 통틀어 핑크를 쓰지 않는다
  expect(await pinkUses(page.locator("main")), "핑크(accent·accent_soft)를 쓰는 요소").toEqual([]);
});

// =====================================================================
// manual-upload (업로드 영역) · badge-overlay
// =====================================================================
test.describe("화면 5 업로드 영역 (/gallery/manual)", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, GALLERY_MANUAL);
  });

  test(`[K1][S${S5}] manual-upload 선택 전: 안내 "${GUIDE.text}", 실제 input[type=file] 1개(accept = PDF·JPG·PNG 만, 이름 있음, 키보드로 닿음), 업로드 아이콘 하늘색, badge-overlay·오류·진행 막대 없음`, async ({ page }) => {
    const sec = await area(page, "empty");
    const up = uploadArea(sec);
    await expect(up).toHaveCount(1);
    const guide = up.getByText(GUIDE.text, { exact: true });
    await expect(guide).toBeVisible();
    expect(await guide.evaluate((el) => getComputedStyle(el).color), "안내 글자색 = 프레임").toBe(hexToRgb(GUIDE.color));

    const input = fileInput(sec);
    await expect(input, "파일 입력").toHaveCount(1);
    const info = await input.evaluate((el) => {
      const i = el as HTMLInputElement;
      const cs = getComputedStyle(i);
      const labelled = (i.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      const labels = Array.from(i.labels ?? []).map((l) => l.textContent ?? "").join(" ");
      return {
        tag: i.tagName.toLowerCase(),
        type: i.type,
        accept: i.accept,
        multiple: i.multiple,
        disabled: i.disabled,
        tabIndex: i.tabIndex,
        hidden: cs.display === "none" || cs.visibility === "hidden",
        name: [i.getAttribute("aria-label") ?? "", labelled, labels].join(" ").replace(/\s+/g, " ").trim(),
      };
    });
    expect(info).toMatchObject({ tag: "input", type: "file", multiple: false, disabled: false, hidden: false });
    expect(info.tabIndex, "Tab 으로 닿는다").toBeGreaterThanOrEqual(0);
    expect(info.name, "파일 입력의 접근 가능한 이름").not.toBe("");
    const accept = info.accept.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    expect(accept.length, "accept 가 있다").toBeGreaterThan(0);
    for (const kind of FILE_KINDS) expect(accept.some((a) => ACCEPT_TOKENS[kind].includes(a)), `accept 에 ${kind}`).toBe(true);
    expect(accept.filter((a) => !Object.values(ACCEPT_TOKENS).flat().includes(a)), "accept 에 허용 형식 밖의 값").toEqual([]);

    const paint = await groupPaint(up);
    expect(paint.icons, "업로드 아이콘 = 하늘색").toContain(hexToRgb(UPLOAD_ICON[0]));
    await expect(overlay(sec), "선택 전 badge-overlay").toHaveCount(0);
    await expect(alerts(sec), "선택 전 오류").toHaveCount(0);
    await expect(progress(sec), "선택 전 진행 막대").toHaveCount(0);
    await expect(up.getByText(PROGRESS.label), "선택 전 처리 중 문구").toHaveCount(0);
    expect(await up.getAttribute("aria-busy"), "선택 전 aria-busy").not.toBe("true");  });

  test(`[K1][S${S5}] manual-upload 선택 후(PDF): 미리보기 위 badge-overlay 1개 "${FRAME_FILE}" — 반투명 회색 ${OVERLAY_BG} + 흰 글자, 미리보기 타일 안`, async ({ page }) => {
    const sec = await area(page, "selected-pdf");
    const up = uploadArea(sec);
    await expect(up).toHaveCount(1);
    await expect(up.getByText(GUIDE.text, { exact: true })).toBeVisible();
    const badge = overlay(sec);
    await expect(badge).toHaveCount(1);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(exact(FRAME_FILE));
    expect(await badge.evaluate((el) => getComputedStyle(el).backgroundColor), "badge-overlay 바탕").toBe(OVERLAY_BG);
    const colors = await badge.evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll("*"))]
        .filter((e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== ""))
        .map((e) => getComputedStyle(e).color),
    );
    expect(colors, "badge-overlay 글자 = on_primary(흰색)").toEqual([ON_PRIMARY]);
    const ub = await box(up, "manual-upload");
    const bb = await box(badge, "badge-overlay");
    expect(bb.x, "badge 왼쪽이 업로드 영역 안").toBeGreaterThanOrEqual(ub.x);
    expect(bb.x + bb.width, "badge 오른쪽이 업로드 영역 안").toBeLessThanOrEqual(ub.x + ub.width + 0.5);
    expect(bb.y, "badge 가 안내 문구 아래(미리보기 위)").toBeGreaterThan((await box(up.getByText(GUIDE.text, { exact: true }), "안내")).y);
    await expect(fileInput(sec), "선택 후에도 파일 입력은 하나 (다른 파일로 바꿀 수 있다)").toHaveCount(1);
    await expect(alerts(sec)).toHaveCount(0);
    await expect(progress(sec)).toHaveCount(0);
  });

  test(`[K1][S${S5}] manual-upload 선택 후(이미지·긴 이름): 썸네일 img + badge-overlay 가 업로드 영역을 넘지 않고(말줄임) 전체 파일 이름을 얻을 수 있다`, async ({ page }) => {
    const sec = await area(page, "selected-image");
    const up = uploadArea(sec);
    const badge = overlay(sec);
    await expect(badge).toHaveCount(1);
    await expect(up.locator("img"), "이미지 미리보기").toHaveCount(1);
    await expect(up.locator("img")).toBeVisible();
    const [text, title, aria] = await overlayNames(badge);
    const full = [text, title, aria].find((s) => /\.(jpe?g|png)$/i.test(s)) ?? "";
    expect(full, "전체 파일 이름(확장자까지)").not.toBe("");
    expect(full.length, "긴 이름 예시").toBeGreaterThan(FRAME_FILE.length);
    const ub = await box(up, "manual-upload");
    const bb = await box(badge, "badge-overlay");
    expect(bb.x, "badge 왼쪽").toBeGreaterThanOrEqual(ub.x);
    expect(bb.x + bb.width, "긴 이름이어도 업로드 영역을 넘지 않는다").toBeLessThanOrEqual(ub.x + ub.width + 0.5);
    expect(await badge.evaluate((el) => el.getBoundingClientRect().height), "한 줄").toBeLessThan(MIN_H);
  });

  for (const [id, what, needle] of [
    ["file-error", "형식", FILE_KINDS],
    ["file-error-size", "크기", [`${MAX_MB}MB`]],
  ] as const) {
    test(`[K1][S${S5}] manual-upload 파일 오류(${what}): 문구가 role=alert 1개(${needle.join("·")} 안내), badge-overlay 없음, 핑크 없음`, async ({ page }) => {
      const sec = await area(page, id);
      const up = uploadArea(sec);
      await expect(up).toHaveCount(1);
      const alert = alerts(sec);
      await expect(alert).toHaveCount(1);
      await expect(alert).toBeVisible();
      const text = squash(await alert.innerText());
      for (const n of needle) expect(text, `오류 문구에 ${n}`).toContain(n);      await expect(overlay(sec), "오류 파일은 선택되지 않는다").toHaveCount(0);
      await expect(progress(sec)).toHaveCount(0);
      expect(await pinkUses(up), "오류에 핑크 없음").toEqual([]);
    });
  }

  test(`[K1][S${S5}] manual-upload 처리 중: role=progressbar 1개 + "${PROGRESS.label}" + aria-busy, 진행 막대 하늘색·트랙 연하늘, 파일 이름 badge 는 그대로`, async ({ page }) => {
    const sec = await area(page, "processing");
    const up = uploadArea(sec);
    await expect(up).toHaveCount(1);
    await expect(up, "처리 중 aria-busy").toHaveAttribute("aria-busy", "true");
    const bar = progress(sec);
    await expect(bar).toHaveCount(1);
    await expect(bar).toBeVisible();
    const label = up.getByText(PROGRESS.label, { exact: true });
    await expect(label).toBeVisible();
    const paint = await groupPaint(bar);
    expect(paint.bgs, "트랙 = 연하늘(프레임 progress-track)").toContain(SOFT);
    expect(paint.bgs, "막대 = 하늘색(프레임 progress-bar)").toContain(SKY);
    expect(await bar.evaluate((el) => getComputedStyle(el).backgroundColor), "progressbar 바탕 = 트랙").toBe(SOFT);
    const bb = await box(bar, "진행 막대");
    expect(bb.width, "진행 막대 폭").toBeGreaterThan(MIN_H);
    expect((await box(label, "처리 중 문구")).y, "문구가 막대 아래").toBeGreaterThanOrEqual(bb.y);
    const name = await bar.evaluate((el) => `${el.getAttribute("aria-label") ?? ""} ${(el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "").join(" ")}`.trim());
    expect(name, "progressbar 의 접근 가능한 이름").not.toBe("");
    await expect(overlay(sec), "처리 중에도 파일 이름").toHaveText(exact(FRAME_FILE));
    await expect(alerts(sec)).toHaveCount(0);
  });

  test(`[K1][S${S5}] badge-overlay 단독: 반투명 회색 ${OVERLAY_BG} + 흰 글자, 하늘색·핑크 없음, 긴 이름은 한 줄 말줄임 + 전체 이름 유지`, async ({ page }) => {
    const sec = await area(page, "badge");
    const badges = sec.locator(sel(OVERLAY));
    expect(await badges.count(), "badge-overlay 예시").toBeGreaterThanOrEqual(2);
    const data = await badges.evaluateAll((els) =>
      els.map((el) => {
        const all = [el, ...Array.from(el.querySelectorAll("*"))];
        const textEls = all.filter((e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== ""));
        const parent = el.parentElement!.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return {
          bg: getComputedStyle(el).backgroundColor,
          innerBgs: all.slice(1).map((e) => getComputedStyle(e).backgroundColor),
          colors: textEls.map((e) => getComputedStyle(e).color),
          text: (el.textContent ?? "").trim(),
          title: el.getAttribute("title") ?? "",
          inside: r.left >= parent.left - 0.5 && r.right <= parent.right + 0.5,
          height: r.height,
          clipped: textEls.some((e) => e.scrollWidth > e.clientWidth),
          lineHeights: textEls.map((e) => parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.5),
        };
      }),
    );
    for (const [i, b] of data.entries()) {
      expect(b.bg, `badge ${i + 1} 바탕`).toBe(OVERLAY_BG);
      expect(b.colors, `badge ${i + 1} 글자 = 흰색`).toEqual([ON_PRIMARY]);
      expect(b.innerBgs.filter((c) => [SKY, SOFT, ...PINK_RGB].includes(c)), `badge ${i + 1} 안 하늘색·핑크`).toEqual([]);
      expect(b.inside, `badge ${i + 1} 가 놓인 자리를 넘지 않는다`).toBe(true);
      expect(b.height, `badge ${i + 1} 한 줄`).toBeLessThan(b.lineHeights[0] * 2);
      expect(b.text.length > 0 || b.title.length > 0, `badge ${i + 1} 글자`).toBe(true);
    }
    expect(data.map((b) => b.text), `시안 파일 이름 "${FRAME_FILE}" 예시`).toContain(FRAME_FILE);
    const longest = [...data].sort((a, b) => b.text.length - a.text.length)[0];
    expect(longest.text.length, "긴 이름 예시").toBeGreaterThan(FRAME_FILE.length);
    if (longest.clipped) expect([longest.text, longest.title].some((s) => /\.\w+$/.test(s)), "말줄임이어도 전체 이름(확장자까지)").toBe(true);
  });
});

// =====================================================================
// extraction-table
// =====================================================================
test.describe("화면 5 추출 결과 확인 표 (/gallery/manual)", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, GALLERY_MANUAL);
  });

  test(`[K1][S${S5}] extraction-table(시안 상태): 제목 "${TITLE}", 머리행 4열 ${HEAD.join(" · ")}, ex-data-table-cell ≥ 프레임, 본문 4행의 시약명·사용량·단위·필요량 = 시안, 사용량 칸만 text-input(행당 1)`, async ({ page }) => {
    const sec = await area(page, "result");
    const t = table(sec);
    await expect(t).toHaveCount(1);
    await expect(t.getByRole("heading", { name: TITLE, exact: true }), `제목 "${TITLE}"`).toBeVisible();
    await expect(t.getByRole("table"), "표는 하나").toHaveCount(1);

    const heads = t.getByRole("columnheader");
    await expect(heads, "머리행 열 이름과 순서").toHaveText(HEAD.map(exact));
    expect(await heads.evaluateAll((els) => els.map((e) => e.getAttribute("data-component"))), "머리 셀 = ex-data-table-cell").toEqual(HEAD.map(() => CELL));
    const xs: number[] = [];
    for (let i = 0; i < HEAD.length; i += 1) xs.push((await box(heads.nth(i), HEAD[i])).x);
    expect(xs, "열이 왼쪽→오른쪽 순서").toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size, "4열이 한 줄에 나란히").toBe(HEAD.length);
    const viewport = page.viewportSize()!.width;
    const lastHead = await box(heads.last(), "마지막 열");
    expect(xs[0], "표 왼쪽이 화면 안").toBeGreaterThanOrEqual(0);
    expect(lastHead.x + lastHead.width, "표 오른쪽이 화면 안(4열이 390 폭에 다 보인다)").toBeLessThanOrEqual(viewport + 0.5);

    expect(await t.locator(sel(CELL)).count(), `ex-data-table-cell (프레임 ${COUNTS_5M[CELL]})`).toBeGreaterThanOrEqual(COUNTS_5M[CELL]);
    const rows = await readRows(sec);
    expect(rows.map((r) => r.cells), "본문 행 = 시안 4행").toEqual(FRAME_ROWS);
    expect(rows.map((r) => r.inputs), "사용량 칸에만 text-input 1개").toEqual(FRAME_ROWS.map(() => [0, 1, 0, 0]));
    expect(await t.locator(`thead ${sel(INPUT)}`).count(), "머리행에 입력 없음").toBe(0);
    expect(rows.map((r) => r.status), "시안 4행은 모두 저장 가능").toEqual(FRAME_ROWS.map(() => "ok"));
    // 사용량 입력마다 접근 가능한 이름(시약명 포함), 고칠 수 있다
    for (const [name] of FRAME_ROWS) {
      const input = amountInput(rowByName(sec, name));
      await expect(input, `${name} 사용량 입력`).toHaveCount(1);
      await expect(input).toBeEditable();
      const label = await input.evaluate((el) => `${el.getAttribute("aria-label") ?? ""} ${Array.from((el as HTMLInputElement).labels ?? []).map((l) => l.textContent).join(" ")}`.trim());
      expect(label, `${name} 사용량 입력의 이름`).toContain(name);
    }
    // 프레임 2단계(표 + 하단 버튼) 개수 이상
    for (const [name, n] of Object.entries(COUNTS_RESULT)) {
      expect(await sec.locator(sel(name)).count(), `result 구역 ${name} (프레임 ${n})`).toBeGreaterThanOrEqual(n);
    }
    await expect(sec.locator(sel(TABLE))).toHaveCount(COUNTS_RESULT[TABLE]);
    await expect(sec.locator(sel(TOAST)), "저장 전에는 토스트 없음").toHaveCount(0);
  });

  test(`[K1][S${S5}] extraction-table(시안 상태): 고친 칸(첫 행 사용량)만 연하늘, 나머지 사용량 칸은 프레임 채움 그대로`, async ({ page }) => {
    const sec = await area(page, "result");
    await page.mouse.move(0, 0);
    const rows = await readRows(sec);
    expect(rows.length).toBe(FRAME_ROWS.length);
    expect(rows.map((r) => r.edited), "data-edited 는 첫 행만").toEqual(INPUT_FILLS.map((f) => hexToRgb(f) === SOFT));
    for (const [i, r] of rows.entries()) {
      expect(r.inputBgs, `${r.cells[0]} 사용량 칸 바탕 = 프레임 ${INPUT_FILLS[i]}`).toContain(hexToRgb(INPUT_FILLS[i]));
      if (hexToRgb(INPUT_FILLS[i]) !== SOFT) expect(r.inputBgs, `${r.cells[0]} 사용량 칸에 연하늘 없음`).not.toContain(SOFT);
    }
    // 연하늘은 사용량 칸에만 (시약명·단위·필요량 셀 바탕에는 없다)
    const cellBgs = await bodyRows(sec).locator(`td${sel(CELL)}`).evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    expect(cellBgs.filter((c) => c === SOFT || c === SKY), "셀 자체 바탕에 하늘색").toEqual([]);
  });

  test(`[K1][S${S5}] extraction-table 고치기: 사용량을 바꾸면 그 칸만 연하늘(data-edited) + 필요량 즉시 재계산(× ${GROUPS}), 원래 값으로 되돌리면 표시가 사라진다`, async ({ page }) => {
    const sec = await area(page, "edited");
    const before = await readRows(sec);
    expect(before.map((r) => r.cells), "추출 직후 = 시안 4행").toEqual(FRAME_ROWS);
    expect(before.map((r) => r.edited), "추출 직후 고친 칸 없음").toEqual(FRAME_ROWS.map(() => false));
    expect(before.flatMap((r) => r.inputBgs).filter((c) => c === SOFT), "추출 직후 연하늘 칸 없음").toEqual([]);

    const [name, per, unit] = FRAME_ROWS[1];
    const changed = String(Number(per) + 1.5);
    const row = rowByName(sec, name);
    await amountInput(row).fill(changed);
    await amountInput(row).blur();
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await readRows(sec)).map((r) => r.edited), { message: "고친 행만 data-edited" }).toEqual([false, true, false, false]);
    let now = await readRows(sec);
    expect(now[1].cells, "고친 행: 사용량·필요량").toEqual([name, changed, unit, requiredText(changed, GROUPS, unit)]);
    expect(now[1].inputBgs, "고친 칸 = 연하늘").toContain(SOFT);
    for (const i of [0, 2, 3]) {
      expect(now[i].cells, `${FRAME_ROWS[i][0]} 행은 그대로`).toEqual(FRAME_ROWS[i]);
      expect(now[i].inputBgs, `${FRAME_ROWS[i][0]} 칸은 연하늘이 아니다`).not.toContain(SOFT);
    }
    await expect(saveButton(sec), "고친 뒤에도 저장 가능").toBeEnabled();

    // 다른 행도 고치면 그 칸도 연하늘
    const [name4, , unit4] = FRAME_ROWS[3];
    await amountInput(rowByName(sec, name4)).fill("0.1");
    await amountInput(rowByName(sec, name4)).blur();
    await expect.poll(async () => (await readRows(sec)).map((r) => r.edited)).toEqual([false, true, false, true]);
    now = await readRows(sec);
    expect(now[3].cells[3], "0.1 × 조 수 (부동소수 오차 없음)").toBe(requiredText("0.1", GROUPS, unit4));

    // 원래 값으로 되돌리면 표시가 사라진다
    await amountInput(row).fill(per);
    await amountInput(row).blur();
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await readRows(sec)).map((r) => r.edited), { message: "되돌린 칸은 고친 칸이 아니다" }).toEqual([false, false, false, true]);
    now = await readRows(sec);
    expect(now[1].cells).toEqual(FRAME_ROWS[1]);
    expect(now[1].inputBgs, "되돌린 칸에 연하늘 없음").not.toContain(SOFT);
  });

  test(`[K1][S${S5}] extraction-table 사용량을 비우거나 0·문자로 고치면 그 행에 안내 + "${SAVE}" 비활성 + 이유, 다시 숫자를 넣으면 풀린다`, async ({ page }) => {
    const sec = await area(page, "edited");
    const [name, per] = FRAME_ROWS[0];
    const row = rowByName(sec, name);
    await expect(saveButton(sec)).toBeEnabled();
    expect(await blockReasons(sec), "처음에는 저장 불가 이유 없음").toEqual([]);
    for (const bad of ["", "0", "많이"]) {
      await amountInput(row).fill(bad);
      await expect(saveButton(sec), `사용량 "${bad}" → 저장 비활성`).toBeDisabled();
      await expect.poll(async () => (await blockReasons(sec)).length, { message: "저장할 수 없는 이유" }).toBeGreaterThanOrEqual(1);
      const data = (await readRows(sec))[0];
      expect(data.status, `사용량 "${bad}" 행 상태`).not.toBe("ok");
      expect(data.detail, "그 행의 안내").toMatch(/사용량/);
      expect(data.cells[3], "필요량은 계산하지 않는다").not.toMatch(/\d/);
    }
    await amountInput(row).fill(per);
    await expect(saveButton(sec)).toBeEnabled();
    expect(await blockReasons(sec)).toEqual([]);
    expect(await pinkUses(sec), "오류 안내에 핑크 없음").toEqual([]);
  });

  test(`[K1][S${S5}] extraction-table 미연결 행: "${UNLINKED}" 표시 + 저장 제외 안내, 필요량은 그대로 보이고 저장은 막지 않는다 · "${OUR_REAGENT}" 선택으로 연결을 바꿀 수 있다`, async ({ page }) => {
    const sec = await area(page, "unlinked");
    let rows = await readRows(sec);
    const unlinked = rows.filter((r) => r.status === "unlinked");
    const linked = rows.filter((r) => r.status === "ok");
    expect(unlinked.length, "미연결 행").toBe(1);
    expect(linked.length, "연결된 행").toBeGreaterThanOrEqual(1);
    const target = unlinked[0];
    expect(target.linked, "선택 칸 글자").toBe(UNLINKED);
    expect(target.detail, "저장 제외 안내").toMatch(new RegExp(`${esc(UNLINKED)}.*저장에서 빠`));
    expect(target.cells[3], "미연결 행도 필요량은 계산").toBe(requiredText(target.cells[1], GROUPS, target.cells[2]));
    for (const r of linked) {
      expect(r.linked, `${r.cells[0]} 연결 시약`).not.toBe(UNLINKED);
      expect(r.detail, `${r.cells[0]} 행에는 미연결 안내 없음`).not.toContain("저장에서 빠");
    }
    await expect(saveButton(sec), "미연결 행이 있어도 저장 가능").toBeEnabled();
    expect(await blockReasons(sec)).toEqual([]);
    // 선택 칸은 행마다 하나
    for (const r of rows) await expect(reagentPicker(sec.locator(`tbody[data-row-id="${r.id}"]`)), `${r.cells[0]} 행의 선택 칸`).toHaveCount(1);

    // 미연결 → 같은 단위의 우리 학교 시약에 연결
    const row = sec.locator(`tbody[data-row-id="${target.id}"]`);
    const picked = await chooseReagent(row, (labels) => labels.findIndex((l) => l !== UNLINKED && l.endsWith(`(${target.cells[2]})`) && !linked.some((r) => r.linked === l)));
    await expect.poll(async () => (await readRows(sec)).find((r) => r.id === target.id)?.status, { message: "연결하면 저장 대상" }).toBe("ok");
    rows = await readRows(sec);
    const after = rows.find((r) => r.id === target.id)!;
    expect(after.linked).toBe(picked);
    expect(after.detail, "연결하면 미연결 안내가 사라진다").not.toContain("저장에서 빠");
    expect(after.cells.slice(0, 3), "추출한 시약명·사용량·단위는 그대로").toEqual(target.cells.slice(0, 3));

    // 다시 "등록되지 않은 시약" 으로
    await chooseReagent(row, (labels) => labels.indexOf(UNLINKED));
    await expect.poll(async () => (await readRows(sec)).find((r) => r.id === target.id)?.status).toBe("unlinked");
    expect((await readRows(sec)).find((r) => r.id === target.id)!.detail).toMatch(/저장에서 빠/);

    // 연결돼 있던 행을 끊으면 저장할 시약이 없어진다 → 저장 비활성 + 이유
    for (const r of linked) await chooseReagent(sec.locator(`tbody[data-row-id="${r.id}"]`), (labels) => labels.indexOf(UNLINKED));
    await expect(saveButton(sec), "전부 미연결이면 저장 비활성").toBeDisabled();
    await expect.poll(async () => (await blockReasons(sec)).length).toBeGreaterThanOrEqual(1);
    expect(await pinkUses(sec), "미연결 안내에 핑크 없음").toEqual([]);
  });

  test(`[K1][S${S5}] extraction-table 전부 미연결: 행마다 "${UNLINKED}" 안내, "${SAVE}" 비활성 + 이유, "${RETRY}" 는 누를 수 있다`, async ({ page }) => {
    const sec = await area(page, "all-unlinked");
    const rows = await readRows(sec);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.map((r) => r.status)).toEqual(rows.map(() => "unlinked"));
    for (const r of rows) expect(r.detail, `${r.cells[0]} 안내`).toContain(UNLINKED);
    await expect(saveButton(sec)).toHaveCount(1);
    await expect(saveButton(sec)).toBeDisabled();
    const reasons = await blockReasons(sec);
    expect(reasons.length, "저장할 수 없는 이유").toBe(1);
    expect(reasons[0], "이유에 할 일(시약 연결)").toMatch(/연결|시약/);
    await expect(retryButton(sec)).toBeEnabled();
    await saveButton(sec).click({ force: true });
    await expect(sec.locator(sel(TOAST)), "비활성 저장을 눌러도 토스트 없음").toHaveCount(0);
  });

  test(`[K1][S${S5}] extraction-table 단위 불일치·사용량 없음·단위 미확정: 행마다 경고, "${SAVE}" 비활성 + 이유 → 행을 모두 맞추면 저장 가능`, async ({ page }) => {
    const sec = await area(page, "mismatch");
    let rows = await readRows(sec);
    const byStatus = (s: string) => rows.filter((r) => r.status === s);
    expect(byStatus("mismatch").length, "단위 불일치 행").toBeGreaterThanOrEqual(1);
    expect(byStatus("amount").length, "사용량 없는 행").toBeGreaterThanOrEqual(1);
    expect(byStatus("unit").length, "단위 미확정 행").toBeGreaterThanOrEqual(1);
    for (const r of byStatus("mismatch")) {
      expect(linkedUnit(r), `${r.cells[0]} 연결 시약 단위`).not.toBe("");
      expect(r.cells[2], `${r.cells[0]} 추출 단위 ≠ 시약 단위`).not.toBe(linkedUnit(r));
      expect(r.detail, `${r.cells[0]} 경고에 우리 학교 시약 단위(${linkedUnit(r)})`).toMatch(new RegExp(`단위[^.]{0,6}${esc(linkedUnit(r))}`));
    }
    for (const r of byStatus("amount")) {
      expect(r.cells[1], `${r.cells[0]} 사용량 비어 있음`).toBe("");
      expect(r.detail, `${r.cells[0]} 경고`).toMatch(/사용량/);
    }
    for (const r of byStatus("unit")) {
      expect(UNITS, `${r.cells[0]} 단위 미확정`).not.toContain(r.cells[2]);
      expect(r.detail, `${r.cells[0]} 경고`).toMatch(/단위/);
      expect(r.cells[1], "미확정 단위여도 추출 수량은 보존").toMatch(/^\d/);
    }
    await expect(saveButton(sec)).toBeDisabled();
    const reasons = await blockReasons(sec);
    expect(reasons.length, "저장할 수 없는 이유").toBe(1);
    const errors = rows.filter((r) => ["mismatch", "amount", "unit"].includes(r.status));    expect(await pinkUses(sec), "경고에 핑크 없음").toEqual([]);
    // 경고 행의 입력·선택에 aria-invalid
    for (const r of errors) {
      const row = sec.locator(`tbody[data-row-id="${r.id}"]`);
      expect(await row.locator('[aria-invalid="true"]').count(), `${r.cells[0]} 행의 aria-invalid`).toBeGreaterThanOrEqual(1);
    }

    // 하나씩 맞춘다: 단위는 연결 시약의 단위로, 사용량은 숫자로
    for (const r of errors) {
      const row = sec.locator(`tbody[data-row-id="${r.id}"]`);
      if (r.status === "amount") await amountInput(row).fill("5");
      else await unitSelect(row).selectOption({ label: linkedUnit(r) });
      await expect.poll(async () => (await readRows(sec)).find((x) => x.id === r.id)?.status, { message: `${r.cells[0]} 행을 맞추면 ok` }).toBe("ok");
    }
    rows = await readRows(sec);
    for (const r of rows) {
      expect(r.cells[2], `${r.cells[0]} 단위 = 시약 단위`).toBe(linkedUnit(r));
      expect(r.cells[3], `${r.cells[0]} 필요량`).toBe(requiredText(r.cells[1], GROUPS, r.cells[2]));
    }
    await expect(saveButton(sec)).toBeEnabled();
    expect(await blockReasons(sec), "이유가 사라진다").toEqual([]);
    await saveButton(sec).click();
    await expect(toasts(sec)).toHaveCount(1);
  });

  test(`[K1][S${S5}] extraction-table 기존 기준: 이미 기준이 있는 시약의 행에 "기존 기준 N 단위" 표시(새 필요량이 더 큰 행·작거나 같은 행 모두), 기준이 없는 시약의 행에는 없다`, async ({ page }) => {
    const sec = await area(page, "basis");
    const rows = await readRows(sec);
    expect(rows.map((r) => r.cells), "기준 예시 = 시안 4행").toEqual(FRAME_ROWS);
    const withBasis = rows.filter((r) => BASIS_RE.test(r.detail));
    expect(withBasis.length, "기존 기준이 있는 행").toBeGreaterThanOrEqual(2);
    expect(withBasis.length, "기준이 없는 행도 있다").toBeLessThan(rows.length);
    const compare = withBasis.map((r) => {
      const m = BASIS_RE.exec(r.detail)!;
      expect(m[2].replace(/[^\w가-힣]/g, ""), `${r.cells[0]} 기존 기준 단위 = 시약 단위`).toBe(linkedUnit(r));
      return toNumber(r.cells[3].split(" ")[0]) > toNumber(m[1]);
    });
    expect(compare, "새 필요량이 기존 기준보다 큰 행이 있다").toContain(true);
    expect(compare, "새 필요량이 기존 기준 이하인 행이 있다").toContain(false);
    await expect(saveButton(sec), "기존 기준이 더 커도 저장은 막지 않는다").toBeEnabled();
    // 기준이 없는 학교(추출 직후 예시)에는 "기존 기준" 글자가 없다
    const plain = await area(page, "edited");
    expect((await readRows(plain)).filter((r) => r.detail.includes("기존 기준")).map((r) => r.cells[0])).toEqual([]);
  });

  test(`[K1][S${S5}] extraction-table 같은 시약에 두 행: 두 행 모두에 합산 안내(합친 필요량), 연결을 바꾸면 안내가 사라진다`, async ({ page }) => {
    const sec = await area(page, "merged");
    const rows = await readRows(sec);
    const groupsByReagent = new Map<string, RowData[]>();
    for (const r of rows.filter((x) => x.status === "ok")) groupsByReagent.set(r.linked, [...(groupsByReagent.get(r.linked) ?? []), r]);
    const merged = [...groupsByReagent.values()].find((g) => g.length >= 2);
    expect(merged, "같은 시약에 연결된 두 행").toBeDefined();
    const unit = linkedUnit(merged![0]);
    const sum = merged!.reduce((acc, r) => acc + Math.round(Number(r.cells[1]) * 1000), 0) / 1000;
    const total = requiredText(String(sum), GROUPS, unit);
    for (const r of merged!) {
      expect(r.cells[2], `${r.cells[0]} 단위`).toBe(unit);
      expect(r.cells[3], `${r.cells[0]} 행의 필요량은 그 행 것`).toBe(requiredText(r.cells[1], GROUPS, unit));
      expect(r.detail, `${r.cells[0]} 합산 안내`).toMatch(/합쳐|합산|합친/);
      expect(r.detail, `${r.cells[0]} 합친 필요량 ${total}`).toContain(total);
    }
    await expect(saveButton(sec)).toBeEnabled();
    // 한 행의 연결을 끊으면 남은 행의 합산 안내가 사라진다
    await chooseReagent(sec.locator(`tbody[data-row-id="${merged![1].id}"]`), (labels) => labels.indexOf(UNLINKED));
    await expect.poll(async () => (await readRows(sec)).find((r) => r.id === merged![0].id)?.detail ?? "", { message: "합산 안내 사라짐" }).not.toMatch(/합쳐|합산|합친/);
  });

  test(`[K1][S${S5}] extraction-table 0행: 머리행 4열은 그대로 · 본문 행 0 · 안내 문구, "${SAVE}" 비활성 + 이유, "${RETRY}" 는 누를 수 있다`, async ({ page }) => {
    const sec = await area(page, "zero");
    const t = table(sec);
    await expect(t).toHaveCount(1);
    await expect(t.getByRole("heading", { name: TITLE, exact: true })).toBeVisible();
    await expect(bodyRows(sec)).toHaveCount(0);
    await expect(t.locator(`td${sel(CELL)}`)).toHaveCount(0);
    await expect(t.locator(sel(INPUT))).toHaveCount(0);
    const empty = t.getByRole("status");
    await expect(empty, "0행 문구").toHaveCount(1);
    await expect(empty).toBeVisible();
    expect(squash(await empty.innerText()), "0행 문구").toMatch(/시약/);
    await expect(saveButton(sec)).toBeDisabled();
    expect((await blockReasons(sec)).length, "저장할 수 없는 이유").toBe(1);
    await expect(retryButton(sec)).toBeEnabled();
  });

  test(`[K1][S${S5}] extraction-table 행 삭제: 행마다 삭제 버튼(이름에 시약명), 누르면 그 행만 사라지고 나머지는 그대로 · 전부 지우면 0행 문구 + 저장 비활성`, async ({ page }) => {
    const sec = await area(page, "edited");
    await expect(bodyRows(sec)).toHaveCount(FRAME_ROWS.length);
    for (const [name] of FRAME_ROWS) {
      const button = removeButton(rowByName(sec, name));
      await expect(button, `${name} 삭제 버튼`).toHaveCount(1);
      expect(`${(await button.getAttribute("aria-label")) ?? ""} ${await button.innerText()}`, "삭제 버튼 이름에 시약명").toContain(name);
    }
    const victim = FRAME_ROWS[1][0];
    await removeButton(rowByName(sec, victim)).click();
    await expect(bodyRows(sec)).toHaveCount(FRAME_ROWS.length - 1);
    expect((await readRows(sec)).map((r) => r.cells), "나머지 행은 그대로").toEqual(FRAME_ROWS.filter((r) => r[0] !== victim));
    await expect(table(sec).getByRole("columnheader")).toHaveText(HEAD.map(exact));
    await expect(saveButton(sec)).toBeEnabled();
    for (const [name] of FRAME_ROWS.filter((r) => r[0] !== victim)) await removeButton(rowByName(sec, name)).click();
    await expect(bodyRows(sec)).toHaveCount(0);
    await expect(table(sec).getByRole("status"), "0행 문구").toBeVisible();
    await expect(saveButton(sec)).toBeDisabled();
  });

  test(`[K1][S${S5}] extraction-table 단위 바꾸기: 단위 선택지는 ${UNITS.join("·")} 만, 시약 단위와 다르게 바꾸면 경고 + 저장 비활성, 되돌리면 풀린다`, async ({ page }) => {
    const sec = await area(page, "edited");
    const [name, per, unit] = FRAME_ROWS[0];
    const row = rowByName(sec, name);
    const select = unitSelect(row);
    await expect(select, `${name} 단위 선택`).toHaveCount(1);
    const options = await select.locator("option").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
    expect([...options].sort(), "단위 선택지").toEqual([...UNITS].sort());
    const other = UNITS.find((u) => u !== unit)!;
    await select.selectOption({ label: other });
    await expect.poll(async () => (await readRows(sec))[0].status).toBe("mismatch");
    const data = (await readRows(sec))[0];
    expect(data.cells, "단위를 바꿔도 수량은 그대로(자동 환산 없음), 필요량 단위는 고른 단위").toEqual([name, per, other, requiredText(per, GROUPS, other)]);
    expect(data.detail, "시약 단위 안내").toContain(unit);
    await expect(saveButton(sec)).toBeDisabled();
    await select.selectOption({ label: unit });
    await expect.poll(async () => (await readRows(sec))[0].status).toBe("ok");
    await expect(saveButton(sec)).toBeEnabled();
  });

  test(`[K1][S${S5}] 버튼 줄: button-outline "${RETRY}" 1 + button-primary "${SAVE}" 1 이 표 아래 한 줄(outline 왼쪽, primary 가 더 넓다), 높이 ≥ ${MIN_H}, 저장하면 ex-toast "${TOAST_SAVED}"(체크 아이콘 하늘색)`, async ({ page }) => {
    const sec = await area(page, "result");
    const retry = retryButton(sec);
    const save = saveButton(sec);
    await expect(retry).toHaveCount(1);
    await expect(save).toHaveCount(1);
    await expect(sec.locator(sel(OUTLINE)), "result 구역 button-outline").toHaveCount(COUNTS_RESULT[OUTLINE]);
    await expect(sec.locator(sel(PRIMARY)), "result 구역 button-primary").toHaveCount(COUNTS_RESULT[PRIMARY]);
    await expect(retry).toBeEnabled();
    await expect(save).toBeEnabled();
    await expectMinHeight(retry, `"${RETRY}"`);
    await expectMinHeight(save, `"${SAVE}"`);
    const rb = await box(retry, RETRY);
    const sb = await box(save, SAVE);
    const tb = await box(table(sec), "표");
    expect(rb.y, "버튼 줄이 표 아래").toBeGreaterThanOrEqual(tb.y + tb.height - 0.5);
    expect(Math.abs(rb.y + rb.height / 2 - (sb.y + sb.height / 2)), "두 버튼이 한 줄").toBeLessThan(2);
    expect(rb.x + rb.width, "outline 이 primary 왼쪽").toBeLessThanOrEqual(sb.x + 0.5);
    expect(sb.width, "primary 가 남는 폭을 채운다").toBeGreaterThan(rb.width);
    expect(await table(sec).locator(`${sel(PRIMARY)}, ${sel(OUTLINE)}`).count(), "버튼은 표 밖(화면 쪽 구성)").toBe(0);
    const savePaint = await groupPaint(save);
    expect([...savePaint.bgs, ...savePaint.lines, ...savePaint.icons].filter((c) => [SKY, SOFT].includes(c)), "button-primary 에 하늘색 없음").toEqual([]);

    await expect(sec.locator(sel(TOAST))).toHaveCount(0);
    await save.click();
    const toast = toasts(sec);
    await expect(toast, `ex-toast "${TOAST_SAVED}"`).toHaveCount(1);
    await expect(toast).toBeVisible();
    expect((await groupPaint(toast)).icons, "토스트 체크 아이콘 = 하늘색").toContain(SKY);  });

  test(`[K1][S${S5}] ex-toast 예시: "${TOAST_SAVED}" 1개, role=status, 체크 아이콘 하늘색, 핑크 없음`, async ({ page }) => {
    const sec = await area(page, "toast");
    const toast = sec.locator(sel(TOAST));
    await expect(toast).toHaveCount(1);
    await expect(toast).toHaveText(exact(TOAST_SAVED));
    await expect(toast).toHaveAttribute("role", "status");
    expect((await groupPaint(toast)).icons, "체크 아이콘 = 하늘색").toContain(SKY);
    expect(await pinkUses(toast)).toEqual([]);
  });
});

// =====================================================================
// 동작 데모 (파일 → 조 수 → AI 추출 → 처리 중 → 결과 → 저장)
// =====================================================================
test.describe("화면 5 흐름 데모 (/gallery/manual demo 구역)", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, GALLERY_MANUAL);
  });

  const groupsInput = (demo: Locator) => demo.getByLabel(GROUPS_FIELD.label, { exact: true });

  test(`[K1][S${S5}] 1단계: "${EXTRACT}" 는 파일·조 수가 비면 비활성 — 파일 없음 · 조 수 빈 값 · ${G_MIN - 1} · ${G_MAX + 1} · 소수 · 문자, 경계 ${G_MIN}·${G_MAX} 는 활성`, async ({ page }) => {
    const demo = await area(page, "demo");
    await expect(uploadArea(demo)).toHaveCount(1);
    await expect(table(demo), "1단계에는 결과 표 없음").toHaveCount(0);
    await expect(saveButton(demo), "1단계에는 저장 버튼 없음").toHaveCount(0);
    const extract = extractButton(demo);
    await expect(extract).toHaveCount(1);
    await expectMinHeight(extract, `"${EXTRACT}"`);
    const groups = groupsInput(demo);
    await expect(groups, `"${GROUPS_FIELD.label}" 입력`).toHaveCount(1);
    expect(await groups.evaluate((el) => el.closest('[data-component="text-input"]') !== null), "조 수 = text-input").toBe(true);
    await expect(demo.locator(sel(INPUT)).filter({ has: page.getByLabel(GROUPS_FIELD.label, { exact: true }) }).getByText(GROUPS_FIELD.unit, { exact: true }), `단위 "${GROUPS_FIELD.unit}"`).toBeVisible();

    await groups.fill(GROUPS_FIELD.value);
    await expect(extract, "파일이 없으면 비활성").toBeDisabled();
    await fileInput(demo).setInputFiles(pdf(FRAME_FILE));
    await expect(overlay(demo)).toHaveText(exact(FRAME_FILE));
    await expect(extract, "파일 + 조 수 → 활성").toBeEnabled();
    for (const bad of ["", String(G_MIN - 1), String(G_MAX + 1), "2.5", "-3", "여섯"]) {
      await groups.fill(bad);
      await expect(extract, `조 수 "${bad}" → 비활성`).toBeDisabled();
    }
    // 범위를 벗어난 값에는 안내(범위)가 보인다
    await groups.fill(String(G_MAX + 1));
    const hint = demo.locator(sel(INPUT)).filter({ has: page.getByLabel(GROUPS_FIELD.label, { exact: true }) }).getByRole("alert");
    await expect(hint, "조 수 오류 안내").toBeVisible();
    expect(squash(await hint.innerText()), "안내에 범위").toMatch(new RegExp(`${G_MIN}\\D+${G_MAX}`));
    for (const ok of [String(G_MIN), String(G_MAX), GROUPS_FIELD.value]) {
      await groups.fill(ok);
      await expect(extract, `조 수 "${ok}" → 활성`).toBeEnabled();
    }
    await expect(table(demo), "누르기 전에는 결과 표 없음").toHaveCount(0);
    expect(await pinkUses(demo), "조 수 오류에 핑크 없음").toEqual([]);
  });

  test(`[K1][S${S5}] 전체 흐름: PDF 주입 → 조 수 ${GROUPS} → "${EXTRACT}" → 처리 중(progressbar·"${PROGRESS.label}"·aria-busy) → 결과 표(필요량 = 사용량 × ${GROUPS}) → 고치기 → "${SAVE}" → ex-toast "${TOAST_SAVED}", 프레임 5-mobile·5-desktop 개수 이상`, async ({ page }) => {
    const demo = await area(page, "demo");
    await fileInput(demo).setInputFiles(pdf(FRAME_FILE));
    await expect(uploadArea(demo).locator(sel(OVERLAY)), "선택한 파일 이름").toHaveText(exact(FRAME_FILE));
    await groupsInput(demo).fill(String(GROUPS));
    await expect(progress(demo), "누르기 전 진행 막대 없음").toHaveCount(0);
    await extractButton(demo).click();

    // 처리 중
    await expect(progress(demo), "처리 중 진행 막대").toHaveCount(1);
    await expect(uploadArea(demo)).toHaveAttribute("aria-busy", "true");
    await expect(uploadArea(demo).getByText(PROGRESS.label, { exact: true })).toBeVisible();
    await expect(table(demo), "처리 중에는 결과 표 없음").toHaveCount(0);
    await expect(extractButton(demo), "처리 중 다시 누를 수 없다").toBeDisabled();
    await expect(overlay(demo), "처리 중에도 파일 이름").toHaveText(exact(FRAME_FILE));

    // 결과
    await expect(table(demo), "추출 결과 표").toHaveCount(1, { timeout: 15_000 });
    await expect(progress(demo), "결과가 오면 진행 막대 없음").toHaveCount(0);
    expect(await uploadArea(demo).getAttribute("aria-busy"), "결과가 오면 aria-busy 해제").not.toBe("true");
    await expect(table(demo).getByRole("heading", { name: TITLE, exact: true })).toBeVisible();
    await expect(table(demo).getByRole("columnheader")).toHaveText(HEAD.map(exact));
    const close = table(demo).getByRole("button", { name: CLOSE, exact: true });
    await expect(close, `표 머리 "${CLOSE}"`).toHaveCount(1);
    await expect(retryButton(demo)).toHaveCount(1);
    await expect(saveButton(demo)).toHaveCount(1);
    await expect(demo.locator(sel(TOAST)), "저장 전 토스트 없음").toHaveCount(0);

    let rows = await readRows(demo);
    expect(rows.length, "추출 행").toBeGreaterThanOrEqual(FRAME_ROWS.length);
    expect(rows.map((r) => r.edited), "추출 직후 고친 칸 없음").toEqual(rows.map(() => false));
    for (const r of rows) {
      expect(r.inputs, `${r.cells[0]} 사용량 칸만 입력`).toEqual([0, 1, 0, 0]);
      if (r.status === "unit") continue;
      expect(UNITS, `${r.cells[0]} 단위는 ${UNITS.join("·")} 중 하나`).toContain(r.cells[2]);
      if (/^\d/.test(r.cells[1])) expect(r.cells[3], `${r.cells[0]} 필요량 = 사용량 × ${GROUPS}`).toBe(requiredText(r.cells[1], GROUPS, r.cells[2]));
    }
    // 프레임(합성 상태: 업로드 미리보기 + 조 수 + 결과 표 + 하단 버튼) 개수 이상
    for (const [frameName, counts] of [["5-mobile", COUNTS_5M], ["5-desktop", COUNTS_5D]] as const) {
      for (const [name, n] of Object.entries(counts)) {
        expect(await demo.locator(sel(name)).count(), `데모 2단계 ${name} (프레임 ${frameName} ${n})`).toBeGreaterThanOrEqual(n);
      }
    }
    for (const name of [UPLOAD, OVERLAY, TABLE, OUTLINE, PRIMARY]) await expect(demo.locator(sel(name)), `데모 2단계 ${name}`).toHaveCount(COUNTS_5M[name]);
    await expectKnownNames(page);
    expect(await pinkUses(demo), "결과 단계에 핑크 없음").toEqual([]);

    // 고치기: 저장을 막는 행(추출이 틀린 행)은 지우고, 첫 저장 가능 행의 사용량을 고친다
    for (const r of rows.filter((x) => ["mismatch", "amount", "unit"].includes(x.status))) await removeButton(demo.locator(`tbody[data-row-id="${r.id}"]`)).click();
    rows = await readRows(demo);
    const target = rows.find((r) => r.status === "ok");
    expect(target, "저장할 수 있는 행").toBeDefined();
    const edited = String(Number(target!.cells[1]) + 2);
    await amountInput(demo.locator(`tbody[data-row-id="${target!.id}"]`)).fill(edited);
    await expect.poll(async () => (await readRows(demo)).find((r) => r.id === target!.id)?.cells[3], { message: "고치면 필요량 재계산" }).toBe(requiredText(edited, GROUPS, target!.cells[2]));
    const after = (await readRows(demo)).find((r) => r.id === target!.id)!;
    expect(after.edited, "고친 칸 표시").toBe(true);
    expect(after.inputBgs, "고친 칸 = 연하늘").toContain(SOFT);

    // 저장
    await expect(saveButton(demo)).toBeEnabled();
    await saveButton(demo).click();
    await expect(toasts(demo), `ex-toast "${TOAST_SAVED}"`).toHaveCount(1);
    await expect(toasts(demo)).toBeVisible();
  });

  test(`[K1][S${S5}] 결과 단계: "${RETRY}" 는 같은 파일로 다시 처리 중 → 결과(고친 값은 버려진다), "${CLOSE}" 는 표를 닫고 1단계로`, async ({ page }) => {
    const demo = await area(page, "demo");
    await fileInput(demo).setInputFiles(pdf(FRAME_FILE));
    await groupsInput(demo).fill(String(GROUPS));
    await extractButton(demo).click();
    await expect(table(demo)).toHaveCount(1, { timeout: 15_000 });
    const first = await readRows(demo);
    const target = first.find((r) => r.status === "ok")!;
    await amountInput(demo.locator(`tbody[data-row-id="${target.id}"]`)).fill(String(Number(target.cells[1]) + 7));
    await expect.poll(async () => (await readRows(demo)).some((r) => r.edited)).toBe(true);

    await retryButton(demo).click();
    await expect(progress(demo), `"${RETRY}" → 처리 중`).toHaveCount(1);
    await expect(uploadArea(demo)).toHaveAttribute("aria-busy", "true");
    await expect(overlay(demo), "같은 파일").toHaveText(exact(FRAME_FILE));
    await expect(progress(demo)).toHaveCount(0, { timeout: 15_000 });
    await expect(table(demo)).toHaveCount(1);
    const again = await readRows(demo);
    expect(again.map((r) => r.cells), "다시 추출한 결과 = 처음 결과").toEqual(first.map((r) => r.cells));
    expect(again.map((r) => r.edited), "고친 칸 표시 없음").toEqual(again.map(() => false));

    await table(demo).getByRole("button", { name: CLOSE, exact: true }).click();
    await expect(table(demo), `"${CLOSE}" → 표 닫힘`).toHaveCount(0);
    await expect(saveButton(demo)).toHaveCount(0);
    await expect(extractButton(demo), "1단계로 돌아온다").toHaveCount(1);
    await expect(overlay(demo), "파일은 그대로").toHaveText(exact(FRAME_FILE));
    await expect(extractButton(demo)).toBeEnabled();
  });

  test(`[K1][S${S5}] 파일 주입(PNG·긴 이름): 썸네일 img + badge-overlay 에서 전체 파일 이름을 얻을 수 있고 업로드 영역을 넘지 않는다 · JPG·JPEG 도 선택된다`, async ({ page }) => {
    const demo = await area(page, "demo");
    await fileInput(demo).setInputFiles({ name: LONG_NAME, mimeType: "image/png", buffer: PNG_BYTES });
    const badge = overlay(demo);
    await expect(badge).toHaveCount(1);
    await expect(alerts(demo)).toHaveCount(0);
    const names = await overlayNames(badge);
    expect(names, "badge-overlay 에서 전체 파일 이름").toContain(LONG_NAME);
    const img = uploadArea(demo).locator("img");
    await expect(img, "이미지 미리보기").toHaveCount(1);
    await expect.poll(async () => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), { message: "미리보기 이미지가 실제로 그려진다" }).toBe(true);
    expect(await img.getAttribute("src"), "미리보기는 브라우저 안 주소(서버에 보내지 않는다)").toMatch(/^(blob:|data:)/);
    const ub = await box(uploadArea(demo), "manual-upload");
    const bb = await box(badge, "badge-overlay");
    expect(bb.x).toBeGreaterThanOrEqual(ub.x);
    expect(bb.x + bb.width, "긴 이름이어도 업로드 영역 안").toBeLessThanOrEqual(ub.x + ub.width + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "가로 넘침 없음").toBeLessThanOrEqual(0);
    await expect(extractButton(demo)).toBeEnabled();

    for (const [name, mimeType] of [["사진.jpg", "image/jpeg"], ["사진.jpeg", "image/jpeg"], ["매뉴얼.pdf", "application/pdf"]]) {
      await fileInput(demo).setInputFiles({ name, mimeType, buffer: name.endsWith(".pdf") ? PDF_BYTES : PNG_BYTES });
      await expect(overlay(demo), `${name} 선택`).toHaveText(exact(name));
      await expect(alerts(demo)).toHaveCount(0);
    }
    await expect(uploadArea(demo).locator("img"), "PDF 는 이미지 미리보기가 아니다").toHaveCount(0);
  });

  test(`[K1][S${S5}] 파일 주입(크기): 1바이트 넘으면 role=alert(${MAX_MB}MB 안내) + 선택 안 됨 + "${EXTRACT}" 비활성 · 정확히 ${MAX_MB}MB 는 선택(오류 사라짐) · 0바이트 거부`, async ({ page }) => {
    const demo = await area(page, "demo");
    await groupsInput(demo).fill(String(GROUPS));
    await fileInput(demo).setInputFiles(pdf("너무 큰 파일.pdf", MAX_BYTES + 1));
    const alert = alerts(demo);
    await expect(alert, "크기 오류").toHaveCount(1);
    expect(squash(await alert.innerText())).toContain(`${MAX_MB}MB`);
    await expect(overlay(demo), "큰 파일은 선택되지 않는다").toHaveCount(0);
    await expect(extractButton(demo), "파일이 없으니 비활성").toBeDisabled();
    expect(await pinkUses(demo), "오류에 핑크 없음").toEqual([]);

    await fileInput(demo).setInputFiles(pdf("딱 맞는 크기.pdf", MAX_BYTES));
    await expect(overlay(demo), `${MAX_MB}MB 정확히`).toHaveText(exact("딱 맞는 크기.pdf"));
    await expect(alerts(demo), "올바른 파일 → 오류 사라짐").toHaveCount(0);
    await expect(extractButton(demo)).toBeEnabled();

    await fileInput(demo).setInputFiles({ name: "빈 파일.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
    await expect(alerts(demo), "빈 파일 오류").toHaveCount(1);
    await expect(overlay(demo).filter({ hasText: "빈 파일.pdf" }), "빈 파일은 선택되지 않는다").toHaveCount(0);

    await fileInput(demo).setInputFiles(pdf(FRAME_FILE));
    await expect(alerts(demo), "올바른 파일 → 오류 사라짐").toHaveCount(0);
    await expect(overlay(demo)).toHaveText(exact(FRAME_FILE));
    await expect(extractButton(demo)).toBeEnabled();
  });

  for (const [name, mimeType] of [
    ["매뉴얼.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["매뉴얼.hwp", "application/x-hwp"],
    ["움짤.gif", "image/gif"],
    ["확장자없음", "application/pdf"],
    ["이름만 pdf.pdf", "image/gif"],
  ] as const) {
    test(`[K1][S${S5}] 파일 주입(형식): ${name} (${mimeType}) → role=alert(${FILE_KINDS.join("·")} 안내) + 선택 안 됨 + "${EXTRACT}" 비활성`, async ({ page }) => {
      const demo = await area(page, "demo");
      await groupsInput(demo).fill(String(GROUPS));
      await fileInput(demo).setInputFiles({ name, mimeType, buffer: PDF_BYTES });
      const alert = alerts(demo);
      await expect(alert).toHaveCount(1);
      await expect(alert).toBeVisible();
      const text = squash(await alert.innerText());
      for (const kind of FILE_KINDS) expect(text, `오류 문구에 ${kind}`).toContain(kind);
      await expect(overlay(demo), "선택되지 않는다").toHaveCount(0);
      await expect(extractButton(demo)).toBeDisabled();
      await expect(table(demo)).toHaveCount(0);
      expect(await pinkUses(demo), "오류에 핑크 없음").toEqual([]);
    });
  }
});
