// 화면 5 (실험 매뉴얼, dev-rules.json routes["5"]) e2e 도우미.
// 기준: harness/d5-gates.md D3 (R-ui·C1·C2·N1-ui·V1), harness/dev-rules.json (routes·route_auth 5·5_note·components·components_note),
//       design/rules.json (roles R1, tab_bar, never.N1), harness/d7-data.md §13·§11,
//       디자인 run 20261002-1441 s2-spec "## 화면 5", design/frames/5-mobile.json · 5-desktop.json.
// 기대값: 문구·표의 4행·조 수·버튼 이름은 프레임 노드에서, 파일 형식·크기·조 수 범위·단위·키 없음 문구는 d7 §13 문장에서 읽는다.
//
// 절대 규칙:
// - 실제 Gemini 호출 금지. 추출 API(POST /api/manual/extract)는 mockExtract 가 가로채 가짜 응답을 준다 — 요청이 서버로 나가지 않는다.
//   (실제 서버 응답을 쓰는 것은 "키 없음 → 503" 1종뿐이고, 서버에 키가 있다고 판단되면 그 테스트는 skip 한다.)
// - 공용 계정(학교 A·B)으로는 1단계와 가짜 추출 결과의 2단계 조작까지만 한다. "확인 후 저장" 을 누르지 않고,
//   만일을 위해 blockSaves 로 그 화면의 서버 액션 요청을 끊어 둔다(끊긴 요청 수 0 을 단언).
// - 저장 흐름은 일회용 학교의 일회용 계정 + 임시 시약으로만 한다 (screen-6-9-helpers · screen-8-helpers 의 준비·정리).
// - 느린 응답은 고정 대기가 아니라 응답을 붙잡았다 테스트가 직접 풀어 준다 (hold / release).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { service } from "./screen-8-helpers";
import { exact, hydrated, type Fx } from "./screen-6-9-helpers";

export const MANUAL_SCREEN = 5;
export const REORDER_SCREEN = 6;
export const HOME_SCREEN = 13;
export const LOGIN_SCREEN = 1;
export const MANUAL_HREF = routeOf(MANUAL_SCREEN);
export const REORDER_HREF = routeOf(REORDER_SCREEN);
export const HOME_HREF = routeOf(HOME_SCREEN);
export const LOGIN_HREF = routeOf(LOGIN_SCREEN);
export const EXTRACT_API = "/api/manual/extract";

// ---------- 컴포넌트 이름 ----------
export const UPLOAD = "manual-upload";
export const OVERLAY = "badge-overlay";
export const TABLE = "extraction-table";
export const CELL = "ex-data-table-cell";
export const INPUT = "text-input";
export const TOAST = "ex-toast";
export const PRIMARY = "button-primary";
export const OUTLINE = "button-outline";
export const NAV = "nav-pill";

// ---------- 기대값: 프레임 ----------
type FrameNode = { name: string; path: string[]; padding?: number[] | null; text: { characters: string } | null };
type Frame = { frames: { nodes: FrameNode[] }[] };
const root = process.cwd();
const loadFrame = (name: string) => (JSON.parse(readFileSync(join(root, "design", "frames", `${name}.json`), "utf8")) as Frame).frames[0].nodes;
const m5 = loadFrame(`${MANUAL_SCREEN}-mobile`);
const under = (nodes: FrameNode[], ancestor: string) => nodes.filter((n) => n.path.slice(0, -1).includes(ancestor));
const textOf = (nodes: FrameNode[], name: string) => nodes.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);
const one = (list: string[], what: string): string => {
  if (!list[0]) throw new Error(`design/frames/5-mobile.json 에서 ${what} 을(를) 읽지 못했습니다`);
  return list[0];
};

const tableNodes = under(m5, TABLE);
const actionNodes = under(m5, "bottom-actions");
const groupsNodes = m5.filter((n) => n.path.includes(INPUT) && !n.path.includes(TABLE));

export const NAV_TITLE = one(textOf(under(m5, NAV), "nav-title"), "nav-title");
export const GUIDE = one(textOf(under(m5, UPLOAD), "upload-guide"), "upload-guide");
export const FRAME_FILE = one(textOf(under(m5, OVERLAY), "label"), "badge-overlay label");
export const PROGRESS_LABEL = one(textOf(under(m5, UPLOAD), "progress-label"), "progress-label");
export const GROUPS_LABEL = one(textOf(groupsNodes, "field-label"), "조 수 field-label");
export const GROUPS_UNIT = one(textOf(groupsNodes, "input-unit"), "조 수 input-unit");
/** 시안의 조 수 */
export const GROUPS = Number(one(textOf(groupsNodes, "input-value"), "조 수 input-value"));
export const TITLE = one(textOf(tableNodes, "table-title"), "table-title");
export const CLOSE = one(textOf(tableNodes, "close"), "close");
export const HEAD = textOf(tableNodes, "cell-label");
/** 시안 본문 행: [시약명, 1조 사용량, 단위, 1반 1회 필요량] */
export const FRAME_ROWS: string[][] = (() => {
  const values = tableNodes.filter((n) => (n.name === "cell-value" || n.name === "input-value") && n.text).map((n) => n.text!.characters);
  const out: string[][] = [];
  for (let i = 0; i < values.length; i += HEAD.length || 1) out.push(values.slice(i, i + HEAD.length));
  return out;
})();
export const RETRY = actionNodes.find((n) => n.name === "label" && n.path.includes(OUTLINE))?.text?.characters ?? "";
export const SAVE = actionNodes.find((n) => n.name === "label" && n.path.includes(PRIMARY))?.text?.characters ?? "";
/** 시안 bottom-actions 의 아래 안쪽 여백 = 버튼 아래 끝과 tab-bar 위쪽 선 사이 (padding = [위, 오른쪽, 아래, 왼쪽]) */
export const BOTTOM_GAP = (() => {
  const node = m5.find((n) => n.name === "bottom-actions");
  const pad = node?.padding;
  if (!pad || pad.length !== 4) throw new Error("design/frames/5-mobile.json bottom-actions padding 을 읽지 못했습니다");
  return pad[2];
})();

// ---------- 기대값: d7-data.md §13 ----------
const D7 = readFileSync(join(root, "harness", "d7-data.md"), "utf8");
export const D7_S13 = (() => {
  const start = D7.indexOf("## 13. 실험 매뉴얼");
  if (start < 0) throw new Error("harness/d7-data.md 에서 §13 을 찾지 못했습니다");
  const rest = D7.slice(start + 1);
  const end = rest.search(/\n## /);
  return D7.slice(start, end < 0 ? undefined : start + 1 + end);
})();
const d7Line = (head: string): string => {
  const line = D7_S13.split(/\r?\n/).find((l) => l.startsWith(`| ${head} |`));
  if (!line) throw new Error(`harness/d7-data.md §13 에서 '${head}' 행을 찾지 못했습니다`);
  return line;
};
export const FILE_KINDS = (/^\| 파일 \| ([^,]+?) 1개/.exec(d7Line("파일"))?.[1] ?? "").split("·").map((s) => s.trim());
export const MAX_MB = Number(/(\d+)MB 이하/.exec(d7Line("파일"))?.[1] ?? Number.NaN);
export const MAX_BYTES = MAX_MB * 1024 * 1024;
const groupsRange = /(\d+)~(\d+) 정수/.exec(d7Line("조 수"));
export const G_MIN = Number(groupsRange?.[1] ?? Number.NaN);
export const G_MAX = Number(groupsRange?.[2] ?? Number.NaN);
export const UNITS = (/추출 단위는 (\S+) 중 하나로 정리/.exec(d7Line("단위"))?.[1] ?? "").split("·");
/** 키가 없으면 503 "…" */
export const NO_KEY_TEXT = /키가 없으면 503 "([^"]+)"/.exec(d7Line("AI 추출 (N2)"))?.[1] ?? "";
export const EXTRACT = "AI 추출";
export const TOAST_SAVED = "재주문 기준을 저장했어요";
export const UNLINKED = "등록되지 않은 시약";
export const OUR_REAGENT = "우리 학교 시약";
/** d7 §13 에 그대로 적혀 있어야 하는 문구 (자체 점검용) */
export const D7_QUOTES = [`"${EXTRACT}"`, `"${PROGRESS_LABEL}"`, `"${SAVE}"`, `"${RETRY}"`, `"${TOAST_SAVED}"`, `"${UNLINKED}"`, `"${OUR_REAGENT}"`, '"기존 기준 N"'];
export const BASIS_RE = /기존 기준 ([\d.,]+) ?(\S+)/;
/** rules.json tab_bar · s2-spec 화면 5: 모바일 활성 탭 */
export const ACTIVE_TAB_LABEL = "기록";

// ---------- 서버에 Gemini 키가 있는가 (값은 읽어 쓰지 않는다 — screen-5-extract-api.spec 과 같은 판단) ----------
const KEY_NAME = "GEMINI_API_KEY";
export const SERVER_HAS_KEY = (() => {
  if ((process.env[KEY_NAME] ?? "").trim() !== "") return true;
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*)$/.exec(line);
      if (m && m[1].trim().replace(/^["']|["']$/g, "") !== "") return true;
    }
  }
  return false;
})();
export const HAS_KEY_REASON = "서버에 GEMINI_API_KEY 가 있어 유효한 요청은 실제 Gemini 호출이 된다 — 자동 테스트에서는 보내지 않는다 (d7 §13 테스트)";

// ---------- 수량 표기 ----------
export const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** 수량 표기: 소수 3자리까지, 오차 없이 ("300", "1,200", "0.3") */
export const amountText = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 });
/** 1반 1회 필요량 = 1조 사용량 × 조 수 (d7 §13 확인 표) */
export const requiredNumber = (perGroup: string | number, groups: number) => (Math.round(Number(perGroup) * 1000) * groups) / 1000;
export const requiredText = (perGroup: string | number, groups: number, unit: string) => `${amountText(requiredNumber(perGroup, groups))} ${unit}`;
export const toNumber = (s: string) => Number(s.replace(/,/g, ""));

// ---------- 주입할 파일 ----------
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
export type Upload = { name: string; mimeType: string; buffer: Buffer };
export const pdf = (name: string, size?: number): Upload => ({
  name,
  mimeType: "application/pdf",
  buffer: size === undefined ? PDF_BYTES : Buffer.concat([PDF_BYTES, Buffer.alloc(size - PDF_BYTES.length, 0x20)]),
});

// ---------- 가짜 추출 응답 ----------
export type FakeItem = { name: string; amount: number | null; unit: string };
/** 시안 4행과 같은 추출 결과 (d7 §13 응답: 시약별 {시약명, 1조 사용량(숫자), 단위}) */
export const FRAME_ITEMS: FakeItem[] = FRAME_ROWS.map(([name, per, unit]) => ({ name, amount: Number(per), unit }));
export type Reply = { status: number; body: unknown } | "abort";
export const okReply = (items: FakeItem[]): Reply => ({ status: 200, body: { ok: true, items } });
export const failReply = (status: number, code: string, error: string): Reply => ({ status, body: { ok: false, error, code } });

/** 가로챈 요청 (네트워크 층에서 본 것) */
export type Seen = { method: string; contentType: string; body: string | null };
/** 화면이 fetch 에 넘긴 FormData (브라우저 안에서 본 것) */
export type FormCall = { method: string; isForm: boolean; keys: string[]; files: { name: string; size: number; type: string }[]; groups: string[] };

export type ExtractMock = {
  /** 가로챈 추출 요청 (도착 순서) */
  seen: () => Seen[];
  /** 화면이 보낸 FormData 내용 (도착 순서) */
  forms: () => Promise<FormCall[]>;
  /** 다음에 풀려나는 요청부터 이 응답을 준다 */
  reply: (r: Reply) => void;
  /** 지금부터 요청을 붙잡는다 (응답 전 = 처리 중 상태를 원하는 만큼 유지) */
  hold: () => void;
  /** 붙잡은 요청에 응답을 준다 (이후 요청은 바로 응답) */
  release: () => void;
  /** 붙잡혀 있는 요청 수 */
  waiting: () => number;
};

/** 화면의 fetch 를 감싸 추출 요청의 FormData(키·파일 이름·groups)를 기록한다 — 요청은 그대로 흘려보낸다(네트워크 층에서 mockExtract 가 가로챈다) */
const RECORD_FETCH = `(() => {
  const w = window;
  if (w.__s5Wrapped) return;
  w.__s5Wrapped = true;
  w.__s5Calls = [];
  const orig = w.fetch.bind(w);
  w.fetch = (input, init) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (new URL(url, location.href).pathname === "${EXTRACT_API}") {
        const body = init && init.body;
        const entry = { method: String((init && init.method) || "GET"), isForm: body instanceof FormData, keys: [], files: [], groups: [] };
        if (body instanceof FormData) {
          for (const [k, v] of body.entries()) {
            entry.keys.push(k);
            if (v instanceof File) entry.files.push({ name: v.name, size: v.size, type: v.type });
            else if (k === "groups") entry.groups.push(String(v));
          }
        }
        w.__s5Calls.push(entry);
      }
    } catch (e) {}
    return orig(input, init);
  };
})()`;

/**
 * 추출 API 를 가로챈다 (page.goto 뒤에 불러도 된다 — 요청은 "AI 추출" 을 누를 때 생긴다).
 * 기본 응답 = 시안 4행. 가로챈 요청은 서버로 가지 않는다(route.fulfill / abort 만 한다).
 */
export async function mockExtract(page: Page, first: Reply = okReply(FRAME_ITEMS)): Promise<ExtractMock> {
  let reply: Reply = first;
  let holding = false;
  let waiters: (() => void)[] = [];
  const seen: Seen[] = [];
  await page.context().route(`**${EXTRACT_API}`, async (route) => {
    const req = route.request();
    let body: string | null = null;
    try {
      body = req.postDataBuffer()?.toString("utf8") ?? null;
    } catch {
      body = null;
    }
    seen.push({ method: req.method(), contentType: req.headers()["content-type"] ?? "", body });
    if (holding) await new Promise<void>((r) => waiters.push(r));
    const r = reply;
    try {
      if (r === "abort") await route.abort("failed");
      else {
        await route.fulfill({
          status: r.status,
          contentType: "application/json; charset=utf-8",
          headers: { "cache-control": "no-store" },
          body: JSON.stringify(r.body),
        });
      }
    } catch {
      // 화면이 먼저 닫혔다
    }
  });
  await page.context().addInitScript(RECORD_FETCH);
  await page.evaluate(RECORD_FETCH);
  return {
    seen: () => [...seen],
    forms: () => page.evaluate(() => (window as unknown as { __s5Calls?: FormCall[] }).__s5Calls ?? []),
    reply: (r) => {
      reply = r;
    },
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      const w = waiters;
      waiters = [];
      w.forEach((r) => r());
    },
    waiting: () => waiters.length,
  };
}

/**
 * 공용 계정 화면의 안전장치: 화면 5 로 가는 서버 액션 요청(POST + next-action = "확인 후 저장")을 서버에 닿기 전에 끊는다.
 * 정상이라면 끊을 요청이 없다 — count() 가 0 임을 단언한다.
 */
export async function blockSaves(context: BrowserContext): Promise<{ count: () => number }> {
  let n = 0;
  await context.route(`**${MANUAL_HREF}*`, async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      n += 1;
      await route.abort("blockedbyclient").catch(() => undefined);
      return;
    }
    await route.fallback();
  });
  return { count: () => n };
}

// ---------- 화면 요소 ----------
export const main = (page: Page) => page.locator("main");
export const nav = (page: Page) => page.locator(sel(NAV));
/** nav-pill 의 뒤로가기 (화면 6 으로) — 데스크톱 주 메뉴(nav)의 "재주문 알림" 링크는 뒤로가기가 아니다 */
export const backLink = (page: Page) => nav(page).locator(`a[href="${REORDER_HREF}"]:not(nav a)`);
/** 화면 5 의 업로드 영역 = 파일 입력을 가진 manual-upload */
export const uploadArea = (page: Page) => main(page).locator(sel(UPLOAD)).filter({ has: page.locator('input[type="file"]') });
export const fileInput = (page: Page) => uploadArea(page).locator('input[type="file"]');
export const overlay = (page: Page) => uploadArea(page).locator(sel(OVERLAY));
export const uploadAlerts = (page: Page) => uploadArea(page).getByRole("alert");
export const progress = (page: Page) => uploadArea(page).getByRole("progressbar");
export const groupsInput = (page: Page) => main(page).getByLabel(GROUPS_LABEL, { exact: true });
export const groupsBox = (page: Page) => main(page).locator(sel(INPUT)).filter({ has: page.getByLabel(GROUPS_LABEL, { exact: true }) });
export const extractButton = (page: Page) => main(page).locator(`button${sel(PRIMARY)}`).filter({ hasText: exact(EXTRACT) });
export const saveButton = (page: Page) => main(page).locator(`button${sel(PRIMARY)}`).filter({ hasText: exact(SAVE) });
export const retryButton = (page: Page) => main(page).locator(`button${sel(OUTLINE)}`).filter({ hasText: exact(RETRY) });
export const table = (page: Page) => main(page).locator(sel(TABLE));
export const bodyRows = (page: Page) => table(page).locator("tbody[data-row-id]");
export const rowById = (page: Page, id: string) => table(page).locator(`tbody[data-row-id="${id}"]`);
export const rowByName = (page: Page, name: string) => bodyRows(page).filter({ has: page.locator(`td${sel(CELL)}`).getByText(name, { exact: true }) });
export const amountInput = (row: Locator) => row.locator(sel(CELL)).locator(`${sel(INPUT)} input`);
export const unitSelect = (row: Locator) => row.getByRole("combobox", { name: /단위/ });
export const reagentPicker = (row: Locator) => row.locator('button[aria-haspopup="listbox"]');
export const removeButton = (row: Locator) => row.getByRole("button", { name: /삭제/ });
export const closeButton = (page: Page) => table(page).getByRole("button", { name: CLOSE, exact: true });
export const savedToast = (page: Page) => page.locator(sel(TOAST)).filter({ hasText: exact(TOAST_SAVED) });

/** 화면 5 의 1단계가 그려지고 누를 준비가 됐는지 (빈 화면에서 0개를 세어 통과하지 않도록) */
export async function waitManual(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await expect.poll(() => new URL(page.url()).pathname, { message: "화면 5 경로", timeout: 45_000 }).toBe(MANUAL_HREF);
  await expect(uploadArea(page), `${UPLOAD} 업로드 영역`).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('main [aria-busy="true"]'), "자리 표시 없음").toHaveCount(0);
  await hydrated(fileInput(page));
}

/** 파일을 고르고 조 수를 넣는다 → badge-overlay 에 파일 이름 */
export async function pickFileAndGroups(page: Page, name: string, groups: number | string): Promise<void> {
  await fileInput(page).setInputFiles(pdf(name));
  await expect(overlay(page), "고른 파일 이름").toHaveText(exact(name));
  await groupsInput(page).fill(String(groups));
  await expect(groupsInput(page)).toHaveValue(String(groups));
}

/** 1단계 → "AI 추출" → (가짜 응답) → 2단계 표가 보일 때까지 */
export async function toResult(page: Page, name: string = FRAME_FILE, groups: number = GROUPS): Promise<void> {
  await pickFileAndGroups(page, name, groups);
  await expect(extractButton(page), `"${EXTRACT}" 활성`).toBeEnabled();
  await extractButton(page).click();
  await expect(table(page), TABLE).toHaveCount(1, { timeout: 20_000 });
  await expect(progress(page), "결과가 오면 진행 막대 없음").toHaveCount(0);
}

export type RowData = {
  id: string;
  status: string;
  /** 4열의 값 (입력은 value, 선택은 고른 항목 글자) */
  cells: string[];
  /** 열마다 text-input 개수 */
  inputs: number[];
  /** 사용량 칸이 고친 칸으로 표시됐는가 */
  edited: boolean;
  /** 사용량 칸(text-input 과 그 안)의 바탕색 */
  inputBgs: string[];
  /** 4열 아래 보조 줄의 안내 글자 (선택 칸·버튼 글자 제외) */
  detail: string;
  /** "우리 학교 시약" 선택 칸에 보이는 글자 */
  linked: string;
};

export async function readRows(page: Page): Promise<RowData[]> {
  return bodyRows(page).evaluateAll(
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
export const linkedUnit = (r: RowData) => /\(([^()]+)\)\s*$/.exec(r.linked)?.[1] ?? "";
/** 선택 칸 글자 "{시약명} ({단위})" */
export const optionLabel = (r: { name: string; unit: string }) => `${r.name} (${r.unit})`;

/** 저장할 수 없는 이유·저장 오류: 표·토스트·업로드 영역·입력 밖에 보이는 status/alert 문구 */
export async function bottomNotices(page: Page): Promise<string[]> {
  return main(page)
    .locator('[role="status"], [role="alert"]')
    .evaluateAll((els) =>
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

/** 행의 "우리 학교 시약" 선택 칸을 열어 선택지 글자를 읽고 닫는다 */
export async function optionLabels(row: Locator): Promise<string[]> {
  const button = reagentPicker(row);
  await expect(button, `"${OUR_REAGENT}" 선택 칸`).toHaveCount(1);
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const options = row.getByRole("listbox").getByRole("option");
  await expect(options.first()).toBeVisible();
  const labels = (await options.allInnerTexts()).map(squash);
  await button.press("Escape");
  await expect(row.getByRole("listbox"), "목록이 닫힌다").toHaveCount(0);
  return labels;
}

/** 선택 칸을 열어 pick 이 고른 항목을 누른다. 고른 항목 글자를 돌려준다 */
export async function chooseReagent(row: Locator, pick: (labels: string[]) => number): Promise<string> {
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

/** rules.json tab_bar 검사: 390 = 1개·항목 수·라벨·활성 "기록", 1440 = 0 */
export async function expectTabBar(page: Page, viewport: ViewportName, state: string): Promise<void> {
  const tb = rules.tab_bar;
  const shown = viewport === "mobile" && tb.mobile_screens.includes(MANUAL_SCREEN);
  if (viewport === "mobile") expect(shown, `rules.json tab_bar.mobile_screens 에 화면 ${MANUAL_SCREEN}`).toBe(true);
  await expect(page.locator(sel(tb.component)), `${state}: ${viewport} ${tb.component}`).toHaveCount(shown ? 1 : 0);
  await expect(page.locator(sel(tb.item)), `${state}: ${viewport} ${tb.item}`).toHaveCount(shown ? tb.items : 0);
  if (!shown) return;
  expect(tb.labels.length, "rules.json tab_bar labels 수 = items").toBe(tb.items);
  expect(tb.labels, `tab_bar labels 에 "${ACTIVE_TAB_LABEL}"`).toContain(ACTIVE_TAB_LABEL);
  const bar = page.locator(sel(tb.component));
  await expect(bar).toBeVisible();
  const items = bar.locator(sel(tb.item));
  await expect(items, "tab-item 은 tab-bar 안에").toHaveCount(tb.items);
  expect((await items.allInnerTexts()).map(squash), `${state}: 탭 라벨 순서`).toEqual(tb.labels);
  const active = bar.locator(`${sel(tb.item)}[aria-current="page"]`);
  await expect(active, `${state}: 활성 tab-item 1개`).toHaveCount(1);
  await expect(active, `${state}: 활성 탭 "${ACTIVE_TAB_LABEL}"`).toHaveText(exact(ACTIVE_TAB_LABEL));
  const t = (await bar.boundingBox())!;
  expect(Math.round(t.y + t.height), `${state}: tab-bar 는 화면 아래 끝`).toBe(page.viewportSize()!.height);
  expect(Math.round(t.width), `${state}: tab-bar 전폭`).toBe(page.viewportSize()!.width);
}

/** 문서와, 그 요소를 감싼 스크롤 상자를 모두 끝까지 내린다 */
export async function scrollAllToEnd(target: Locator): Promise<void> {
  await target.evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) p.scrollTop = p.scrollHeight;
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect
    .poll(() => target.page().evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1), { message: "문서 끝까지 내림" })
    .toBe(true);
}

/** 요소의 아래 가장자리(조금 안쪽)가 다른 것에 덮이지 않았는지 */
export const bottomEdgeOnTop = (l: Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.bottom - 2);
    return !!hit && (hit === el || el.contains(hit));
  });

/** 화면 5 에 속한 컴포넌트 이름 (dev-rules.json components) */
export function screenComponents(): string[] {
  return Object.entries(devRules.components)
    .filter(([, screens]) => screens.includes(MANUAL_SCREEN))
    .map(([name]) => name);
}

/** rules.json roles R1~R7 의 컴포넌트 중 화면 5 에 속하지 않는 것 — 어느 역할이든 화면 5 에서는 0 */
export function roleLimitedElsewhere(): string[] {
  const own = screenComponents();
  const all = Object.values(rules.roles).flatMap((r) => r.components ?? (r.component ? [r.component] : []));
  return [...new Set(all)].filter((c) => !own.includes(c));
}

// ======================================================================
// 일회용 학교의 임시 시약 (이름을 정해서 만든다 — 자동 연결 규칙 확인용)
// ======================================================================

export type TempReagent = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
  reorder_per_group: number | null;
  reorder_groups: number | null;
  low_stock_since: string | null;
};
const COLS = "id, name, unit, stock, min_stock, reorder_per_group, reorder_groups, low_stock_since";
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
function toTemp(r: Record<string, unknown>): TempReagent {
  return {
    id: r.id as string,
    name: r.name as string,
    unit: r.unit as string,
    stock: Number(r.stock),
    min_stock: Number(r.min_stock),
    reorder_per_group: numOrNull(r.reorder_per_group),
    reorder_groups: numOrNull(r.reorder_groups),
    low_stock_since: (r.low_stock_since as string | null) ?? null,
  };
}

const storageClasses = (JSON.parse(readFileSync(join(root, "design", "rules.json"), "utf8")) as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;

export type NamedSpec = { name: string; unit: string; stock: number; min?: number; perGroup?: number; groups?: number };

/**
 * 준비: 이름을 정한 임시 시약 (admin 세션 — register_reagent 는 min_stock 0 으로 시작, d7 §6).
 * min 을 주면 같은 세션으로 기존 재주문 기준을 미리 넣는다.
 */
export async function prepNamed(f: Fx, spec: NamedSpec): Promise<TempReagent> {
  const made = await f.prep.rpc("register_reagent", {
    p_name: spec.name,
    p_storage_class: storageClasses[0],
    p_stock: spec.stock,
    p_unit: spec.unit,
    p_intake_date: "2026-09-15",
    p_msds_url: null,
  });
  expect(made.error, `준비: register_reagent ${spec.name} (${made.error?.message})`).toBeNull();
  const row = (Array.isArray(made.data) ? made.data[0] : made.data) as { id: string } | null;
  if (!row) throw new Error("준비: register_reagent 가 행을 돌려주지 않음");
  if (spec.min !== undefined) {
    const up = await f.prep
      .from("reagents")
      .update({ min_stock: spec.min, reorder_per_group: spec.perGroup ?? null, reorder_groups: spec.groups ?? null })
      .eq("id", row.id)
      .select("id");
    expect(up.error, `준비: 기존 기준 지정 ${spec.name} (${up.error?.message})`).toBeNull();
    expect(up.data ?? [], "준비: 기존 기준 지정 행").toHaveLength(1);
  }
  const all = await schoolReagents(f.school.id);
  const got = all.find((r) => r.id === row.id);
  if (!got) throw new Error(`준비: 만든 시약 ${spec.name} 을 다시 읽지 못함`);
  expect(got.name, "준비: 시약명").toBe(spec.name);
  return got;
}

/** 대조 조회 (service role): 한 학교의 시약 전체 (id 순) */
export async function schoolReagents(schoolId: string): Promise<TempReagent[]> {
  const r = await service().from("reagents").select(COLS).eq("school_id", schoolId).order("id");
  if (r.error) throw new Error(`reagents 대조 조회 실패: ${r.error.message}`);
  return ((r.data ?? []) as Record<string, unknown>[]).map(toTemp);
}

/** 재주문 기준 세 열만 (id → 값) — 저장 전후 비교용 */
export function basisOf(list: TempReagent[]): Record<string, { min: number; per: number | null; groups: number | null }> {
  return Object.fromEntries(list.map((r) => [r.name, { min: r.min_stock, per: r.reorder_per_group, groups: r.reorder_groups }]));
}

/** 준비: 임시 시약 삭제 (service role) — 저장 직전에 시약이 사라진 상황을 만든다 */
export async function dropReagent(id: string): Promise<void> {
  const r = await service().from("reagents").delete().eq("id", id).select("id");
  expect(r.error, `준비: 시약 삭제 (${r.error?.message})`).toBeNull();
  expect(r.data ?? [], "준비: 삭제한 시약 행").toHaveLength(1);
}
