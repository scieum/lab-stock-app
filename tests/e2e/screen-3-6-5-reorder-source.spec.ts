// 재주문 기준 출처 표시 (d7 §11-1 "표시"·"화면 3 직접 입력"·"화면 5 와의 관계", §13 "중복", 2026-10-06 사용자 결정 — d2 §5 시안 예외):
// [C1][S3] 출처 표시(자동 · 최근 4주 사용량 / 마지막 입고량 / 0 · 매뉴얼 근거 · 직접 입력 · 직접 0) — 교사·admin·학생 같은 표시
// [R-ui][S3] 학생: threshold-edit·"자동으로 돌리기" 0 (R5)
// [C1][S3] "자동으로 돌리기": 자동이 아닐 때만 입력 상태 안에 · 누르면 출처 'auto'·자동 값·표시 갱신 · 직접 입력 → 다시 "직접 입력"
// [C1][S3g]·[GM-ui][S3g] 둘러보기: 정보 표의 재주문 기준에 출처 · 쓰기 진입점 0
// [C1][S6] 알림 카드 기준 문구: 자동이면 "자동" + 근거, 매뉴얼·직접 입력은 기존 두 형태 그대로
// [C1][S5] 추출 표: 자동 기준 표기 · 자동 기준은 작은 필요량이어도 바뀜 예고 → 저장 후 'basis' · 같은 열쇠·같은 단위 행 합치기 "N개 행을 합쳤어요" · 다른 단위는 두 행
//
// 문구는 d7 §11-1 "표시"·"기준의 출처"·"화면 3 직접 입력" 행과 §13 "중복" 행에서 읽는다. 숫자(20% · ÷ 2)는 reorder-auto-helpers 가 d7 에서 읽는다.
// 모든 쓰기는 일회용 학교(일회용 admin·교사·학생)의 임시 시약으로만. 판정 대상 호출은 로그인 세션(publishable 키)으로.
// service role 은 준비(입고 기록 지우기 · 재고 낮추기 — 함수로 만들 수 없는 상태)·정리·대조 조회에만 쓴다.
// 공용 학교 A·B 는 쓰지 않는다. 데모 학교는 읽기만 (afterAll 에서 학교 A·B·데모의 기준 열 불변 확인).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drawer, isDeskPage } from "./desk-helpers";
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { countComponent, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, clientFor, openTemp, service } from "./screen-8-helpers";
import { detailPath, waitDetail } from "./screen-3-helpers";
import { demoReagents, guestDetailPath, openGuest } from "./guest-helpers";
import { autoFromIntake, autoFromUsage } from "./reorder-auto-helpers";
import { frameCounts, hydrated, prepReagent, watchActions } from "./screen-11-helpers";
import { CARD_AMOUNT, MANUAL_BASIS_TEXT, NO_RESIDUE_69, cleanup, makeSchool, purge, readAlerts, sharedSnapshot, waitReorder, type Fx } from "./screen-6-9-helpers";
import {
  BASIS_RE,
  GROUPS,
  MANUAL_HREF,
  REORDER_HREF,
  bodyRows,
  mockExtract,
  okReply,
  optionLabel,
  readRows,
  removeButton,
  requiredNumber,
  requiredText,
  rowById,
  saveButton,
  savedToast,
  toNumber,
  toResult,
  waitManual,
  type FakeItem,
} from "./screen-5-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const GROUP = "rsrc";
const TIMEOUT = 420_000;
const SAVE_TIMEOUT = 20_000;

// ---------- d7 에서 읽는 문구 ----------
const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
function section(head: string): string {
  const s = D7.indexOf(head);
  if (s < 0) throw new Error(`harness/d7-data.md 에서 "${head}" 를 찾지 못했습니다`);
  const after = D7.slice(s + head.length);
  const e = after.search(/\n#{2,3} /);
  return D7.slice(s, e < 0 ? undefined : s + head.length + e);
}
function row(sec: string, key: string): string {
  const line = sec.split(/\r?\n/).find((l) => l.startsWith(`| ${key}`));
  if (!line) throw new Error(`harness/d7-data.md 에서 "| ${key}" 행을 찾지 못했습니다`);
  return line;
}
const quotes = (line: string) => [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
function pick(list: string[], re: RegExp, what: string): string {
  const v = list.find((q) => re.test(q));
  if (!v) throw new Error(`harness/d7-data.md 에서 ${what} 문구를 읽지 못했습니다`);
  return v;
}
const S11_1 = section("### 11-1.");
const SHOW = quotes(row(S11_1, "표시"));
/** 값 옆 "자동" 표시 */
const AUTO_LABEL = SHOW[0];
// d7 §18 "자동 기준 표시": 자동이면 auto-threshold-badge "자동" + 캡션 한 줄 — 캡션 문구는 §18 의 굵은 따옴표 두 개
// (§11-1 "표시" 의 옛 근거 문구 "최근 4주 사용량 기준"·"마지막 입고량의 20%" 를 대신한다. 값 0 은 §11-1 그대로 "아직 없어요")
const S18 = section("## 18.");
const S18_CAPTIONS = [...row(S18, "자동 기준 표시").matchAll(/\*\*"([^"]+)"\*\*/g)].map((m) => m[1]);
const USAGE_TEXT = pick(S18_CAPTIONS, /사용량/, "§18 자동 캡션(사용 기록)");
const INTAKE_TEXT = pick(S18_CAPTIONS, /입고량/, "§18 자동 캡션(입고량)");
/** 자동 기준 배지 컴포넌트 (dev-rules components, rules.json reorder.auto) */
const AUTO_BADGE = "auto-threshold-badge";
const NONE_TEXT = pick(SHOW, /아직/, "자동 0");
const RESET_LABEL = pick(quotes(row(S11_1, "화면 3 직접 입력")), /자동/, "자동으로 돌리기");
/** 'manual'(화면 3 직접 입력) */
const MANUAL_TEXT = (() => {
  const m = /'manual'\(화면 3 ([^)]+)\)/.exec(row(S11_1, "기준의 출처"));
  if (!m) throw new Error("harness/d7-data.md §11-1 '기준의 출처' 에서 manual 문구를 읽지 못했습니다");
  return m[1];
})();
const S13 = section("## 13.");
const MERGED_TPL = pick(quotes(row(S13, "중복")), /합쳤/, "행 합치기 안내");
const mergedNote = (n: number) => MERGED_TPL.replace("N", String(n));

const THRESH = "reorder-threshold";
const THRESH_EDIT = "threshold-edit";
const THRESH_CAPTION = "재주문 기준";
const AUTO_TESTID = "reorder-threshold-auto";
const SOURCE_TESTID = "reorder-threshold-source";
const RESET_TESTID = "threshold-reset-auto";
const BADGE = "badge-low-stock";
const CARD = "reagent-detail-card";
const SAVE = "저장";
const MIN_H = (rules as unknown as { button: { min_height: number } }).button.min_height;
const ACCENTS = (() => {
  const c = (rules as unknown as { colors: Record<string, { value: string }> }).colors;
  return [c.accent?.value, c.accent_soft?.value].filter(Boolean).map((v) => v.toLowerCase());
})();

const nospace = (s: string) => s.replace(/[\s,]/g, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${escapeRe(s)}\\s*$`);
const basisLine = (per: number, unit: string, groups: number) => `1반 1회 실험량 ${per} ${unit} × ${groups}조 기준`;
const toastThreshold = (v: string, unit: string) => `재주문 기준을 ${v}${unit}으로 바꿨어요`;
const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

// ---------- DB (대조 조회 = service role) ----------
type Src = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
  reorder_per_group: number | null;
  reorder_groups: number | null;
  min_stock_source: string;
  min_stock_auto_basis: string | null;
  low_stock_since: string | null;
};
const COLS = "id, name, unit, stock, min_stock, reorder_per_group, reorder_groups, min_stock_source, min_stock_auto_basis, low_stock_since";
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
function toSrc(r: Record<string, unknown>): Src {
  return {
    id: r.id as string,
    name: r.name as string,
    unit: r.unit as string,
    stock: Number(r.stock),
    min_stock: Number(r.min_stock),
    reorder_per_group: numOrNull(r.reorder_per_group),
    reorder_groups: numOrNull(r.reorder_groups),
    min_stock_source: r.min_stock_source as string,
    min_stock_auto_basis: (r.min_stock_auto_basis as string | null) ?? null,
    low_stock_since: (r.low_stock_since as string | null) ?? null,
  };
}
async function byService(id: string): Promise<Src> {
  const r = await service().from("reagents").select(COLS).eq("id", id).single();
  if (r.error) throw new Error(`시약 대조 조회 실패: ${r.error.message}`);
  return toSrc(r.data as Record<string, unknown>);
}
const thresholdCols = (r: Src) => ({
  min_stock: r.min_stock,
  reorder_per_group: r.reorder_per_group,
  reorder_groups: r.reorder_groups,
  min_stock_source: r.min_stock_source,
  min_stock_auto_basis: r.min_stock_auto_basis,
});
const autoCols = (value: number, basis: "usage" | "intake" | null) => ({
  min_stock: value,
  reorder_per_group: null,
  reorder_groups: null,
  min_stock_source: "auto",
  min_stock_auto_basis: basis,
});

/** d7 §11-1 "표시": reorder-threshold 줄에 보일 것 */
type Shown = { value: string; pill: string[]; caption: string[] };
function expectedShown(r: Src): Shown {
  const value = r.min_stock > 0 ? `${r.min_stock}${r.unit}` : NONE_TEXT;
  if (r.min_stock_source === "auto") {
    if (r.min_stock > 0 && r.min_stock_auto_basis !== "usage" && r.min_stock_auto_basis !== "intake") throw new Error(`대조: 자동 값 ${r.min_stock} 의 근거가 없음`);
    // 0 이면 근거 줄 자리 = "아직 없어요" — 값 자리에 이미 있으므로 한 번만
    return { value, pill: [AUTO_LABEL], caption: r.min_stock > 0 ? [r.min_stock_auto_basis === "usage" ? USAGE_TEXT : INTAKE_TEXT] : [] };
  }
  if (r.min_stock_source === "basis") {
    if (r.reorder_per_group === null || r.reorder_groups === null) throw new Error("대조: 'basis' 인데 근거 열이 비어 있음");
    return { value, pill: [], caption: [basisLine(r.reorder_per_group, r.unit, r.reorder_groups)] };
  }
  return { value, pill: [], caption: [MANUAL_TEXT] };
}

// ---------- 화면 3 요소 ----------
const thrRow = (page: Page) => page.locator(`main ${sel(THRESH)}`);
const pencil = (page: Page) => thrRow(page).locator(`${sel(THRESH_EDIT)} button`).first();
const thrInput = (page: Page) => thrRow(page).locator(`${sel("text-input")} input`);
const resetButton = (page: Page) => thrRow(page).getByTestId(RESET_TESTID);
const thrSave = (page: Page) => thrRow(page).locator(sel("button-primary")).filter({ hasText: exact(SAVE) });
/** 시약 상세의 재고 부족 배지: 390 = 카드 안 / 1440 = 드로어 안 status-chips (d7 §23 run b — 뒤 목록 행의 배지는 화면 2 것) */
const badge = (page: Page) => (isDeskPage(page) ? drawer(page).locator(sel(BADGE)) : page.locator(`main ${sel(CARD)} ${sel(BADGE)}`));
const toastWith = (page: Page, text: string | RegExp) => page.locator(sel("ex-toast")).filter({ hasText: text });

/** reorder-threshold 줄: 글자(연필 버튼 제외)·"자동" 표시·출처 줄 */
async function readShown(page: Page): Promise<{ text: string; pill: string[]; caption: string[] }> {
  const text = await thrRow(page).evaluate((el, editSel) => {
    const hide = Array.from(el.querySelectorAll<HTMLElement>(editSel));
    const prev = hide.map((h) => h.style.display);
    for (const h of hide) h.style.display = "none";
    const t = (el as HTMLElement).innerText;
    hide.forEach((h, i) => (h.style.display = prev[i]));
    return t.replace(/\s+/g, " ").trim();
  }, sel(THRESH_EDIT));
  const pill = (await thrRow(page).getByTestId(AUTO_TESTID).allInnerTexts()).map((s) => s.trim());
  const caption = (await thrRow(page).getByTestId(SOURCE_TESTID).allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim());
  return { text: nospace(text), pill, caption: caption.map(nospace) };
}
const wantShown = (w: Shown) => ({
  text: nospace(`${THRESH_CAPTION} ${w.value} ${w.pill.join(" ")} ${w.caption.join(" ")}`),
  pill: w.pill,
  caption: w.caption.map(nospace),
});
async function expectShown(page: Page, r: Src, what: string): Promise<void> {
  await expect.poll(() => readShown(page), { message: `${what}: ${THRESH} 표시 (d7 §11-1)`, timeout: SAVE_TIMEOUT }).toEqual(wantShown(expectedShown(r)));
}

async function burst(l: Locator): Promise<void> {
  await l.evaluate((el) => {
    for (let i = 0; i < 3; i += 1) (el as HTMLElement).click();
  });
}

// ---------- 일회용 학교 ----------
let before: string[] | null = null;
let fixtureCache: Promise<Fx> | null = null;
function fixture(info: TestInfo): Promise<Fx> {
  fixtureCache ??= makeSchool(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}
async function fresh(info: TestInfo): Promise<Fx> {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id]);
  return f;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·기록 잔여물").toEqual(NO_RESIDUE_69);
  if (before) expect(await sharedSnapshot(), "학교 A·B·데모의 판매처·시약 기준 열이 그대로").toEqual(before);
});

// ---------- 준비 (일회용 교사 세션의 DB 함수) ----------
async function teacherRpc(f: Fx, fn: string, args: Record<string, unknown>): Promise<void> {
  const c = await clientFor(f.teacher);
  const res = await c.rpc(fn, args);
  expect(res.error, `준비: 교사 ${fn} (${res.error?.code} ${res.error?.message})`).toBeNull();
}
/** 준비(service role): 그 시약의 입고 기록을 지운다 — "계산할 기록이 없는" 자동 0 을 만든다 */
async function dropIntakeLogs(id: string): Promise<void> {
  const r = await service().from("intake_logs").delete().eq("reagent_id", id);
  expect(r.error, `준비: 입고 기록 지우기 (${r.error?.message})`).toBeNull();
}
/** 준비(service role): 재고만 낮춘다 — 입고 근거 자동 기준보다 적은 재고(사용 기록 없이)는 함수로 만들 수 없다 */
async function lowerStock(id: string, stock: number): Promise<void> {
  const r = await service().from("reagents").update({ stock }).eq("id", id).select("id");
  expect(r.error, `준비: 재고 낮추기 (${r.error?.message})`).toBeNull();
  expect(r.data ?? [], "준비: 재고 낮춘 행").toHaveLength(1);
}

type States = Record<"intake" | "usage" | "zero" | "basis" | "manual" | "manual0", Src>;

/** 출처 여섯 상태 (d7 §11-1) */
async function prepStates(f: Fx): Promise<States> {
  const intake = await prepReagent(f, "입고", 10);
  const usage = await prepReagent(f, "사용", 10);
  await teacherRpc(f, "record_usage", { reagent_id: usage.id, amount: 6 });
  const zero = await prepReagent(f, "영", 10);
  await dropIntakeLogs(zero.id);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: zero.id, p_min_stock: 4 });
  await teacherRpc(f, "reset_reorder_threshold", { p_reagent_id: zero.id });
  const basis = await prepReagent(f, "근거", 30);
  await teacherRpc(f, "save_reorder_basis", { p_items: [{ reagent_id: basis.id, per_group: 10, groups: 6 }] });
  const manual = await prepReagent(f, "직접", 10);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: manual.id, p_min_stock: 5 });
  const manual0 = await prepReagent(f, "직접영", 10);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: manual0.id, p_min_stock: 0 });
  const s: States = {
    intake: await byService(intake.id),
    usage: await byService(usage.id),
    zero: await byService(zero.id),
    basis: await byService(basis.id),
    manual: await byService(manual.id),
    manual0: await byService(manual0.id),
  };
  // 대조: 준비한 상태가 d7 §11-1 대로인가
  expect(thresholdCols(s.intake), "대조: 새 시약 = 자동(입고량 × 비율)").toEqual(autoCols(autoFromIntake(10), "intake"));
  expect(thresholdCols(s.usage), "대조: 사용 기록 → 자동(사용량)").toEqual(autoCols(autoFromUsage([6]), "usage"));
  expect(s.zero.min_stock_source, "대조: 기록 없는 자동").toBe("auto");
  expect(s.zero.min_stock, "대조: 기록 없는 자동 = 0").toBe(0);
  expect(thresholdCols(s.basis), "대조: 화면 5 근거").toMatchObject({ min_stock: 60, reorder_per_group: 10, reorder_groups: 6, min_stock_source: "basis" });
  expect(thresholdCols(s.manual), "대조: 직접 입력").toMatchObject({ min_stock: 5, reorder_per_group: null, min_stock_source: "manual" });
  expect(thresholdCols(s.manual0), "대조: 직접 입력 0").toMatchObject({ min_stock: 0, min_stock_source: "manual" });
  return s;
}

// =====================================================================
// 화면 3 — 출처 표시 (모든 역할 같은 표시)
// =====================================================================

test(`[C1][S3] 일회용 학교 교사·admin·학생 시약 상세 ${THRESH}: 출처 여섯 상태 — 자동(입고) "${AUTO_LABEL}"+"${INTAKE_TEXT}" · 자동(사용) "${AUTO_LABEL}"+"${USAGE_TEXT}" · 자동 0 "${NONE_TEXT}"+"${AUTO_LABEL}"(근거 줄 없음) · 매뉴얼 "1반 1회 실험량 … × …조 기준"(표시 없음) · 직접 입력 "${MANUAL_TEXT}" · 직접 0 "${NONE_TEXT}"+"${MANUAL_TEXT}" = DB · "${AUTO_LABEL}" 표시는 무채색(accent 아님) · 쓰기 0건`, async ({ browser }, info) => {
  const f = await fresh(info);
  const s = await prepStates(f);
  const order = ["intake", "usage", "zero", "basis", "manual", "manual0"] as const;
  for (const who of ["teacher", "admin", "student"] as const) {
    const user = f[who];
    const { context, page, viewport } = await openTemp(browser, info, user, detailPath(s.intake.id));
    const actions = watchActions(page);
    try {
      const frame = frameCounts(`3-${viewport}`);
      for (const k of order) {
        if (k !== "intake") await page.goto(detailPath(s[k].id));
        await waitDetail(page);
        await expectShown(page, s[k], `${who} ${k}`);
        // 기본 상태에서는 "자동으로 돌리기" 가 없다 (입력 상태 안에만)
        await expect(resetButton(page), `${who} ${k}: 입력 상태가 아니면 "${RESET_LABEL}" 0`).toHaveCount(0);
        if (who === "student") expect(await countComponent(page, THRESH_EDIT), `학생 ${k}: ${THRESH_EDIT} 0 (R5)`).toBe(0);
        else expect(await countComponent(page, THRESH_EDIT), `${who} ${k}: ${THRESH_EDIT} = 시안 3-${viewport}`).toBe(frame[THRESH_EDIT]);
        if (s[k].min_stock_source === "auto") {
          const bg = await thrRow(page).getByTestId(AUTO_TESTID).evaluate((el) => getComputedStyle(el).backgroundColor);
          for (const a of ACCENTS) expect(bg, `"${AUTO_LABEL}" 표시 바탕은 accent(${a}) 아님`).not.toBe(hexToRgb(a));
          await expect(thrRow(page).locator(sel(AUTO_BADGE)), `${who} ${k}: "${AUTO_LABEL}" 표시 = ${AUTO_BADGE} 1개`).toHaveCount(1);
        } else {
          await expect(thrRow(page).locator(sel(AUTO_BADGE)), `${who} ${k}: 자동이 아니면 ${AUTO_BADGE} 0`).toHaveCount(0);
        }
      }
      expect(actions.count(), `${who}: 쓰기 요청 0건`).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "가로 스크롤 없음").toBe(true);
    } finally {
      await context.close();
    }
  }
});

test(`[R-ui][S3] 일회용 학교 학생 시약 상세(직접 입력·매뉴얼 근거 시약 — 교사에게는 "${RESET_LABEL}" 이 있는 출처): ${THRESH_EDIT}·"${RESET_LABEL}" 0 (R5) · 응답 본문에도 없음 · ${THRESH} 줄에 버튼 0`, async ({ browser }, info) => {
  const f = await fresh(info);
  const s = await prepStates(f);
  expect(rules.roles.R5.components, "R5 에 threshold-edit").toContain(THRESH_EDIT);
  for (const k of ["manual", "basis"] as const) {
    const { context, page, response } = await openTemp(browser, info, f.student, detailPath(s[k].id));
    try {
      await waitDetail(page);
      const html = await response!.text();
      expect(await countComponent(page, THRESH_EDIT), `학생 ${k}: ${THRESH_EDIT}`).toBe(0);
      await expect(resetButton(page), `학생 ${k}: "${RESET_LABEL}"`).toHaveCount(0);
      await expect(page.getByRole("button", { name: RESET_LABEL }), `학생 ${k}: "${RESET_LABEL}" 버튼`).toHaveCount(0);
      expect(html, `학생 ${k} 응답 본문 ${THRESH_EDIT}`).not.toContain(`data-component="${THRESH_EDIT}"`);
      expect(html, `학생 ${k} 응답 본문 ${RESET_TESTID}`).not.toContain(RESET_TESTID);
      await expect(thrRow(page).getByRole("button"), `학생 ${k}: ${THRESH} 줄에 버튼 없음`).toHaveCount(0);
      await expectShown(page, s[k], `학생 ${k}`);
    } finally {
      await context.close();
    }
  }
});

// =====================================================================
// 화면 3 — 자동으로 돌리기
// =====================================================================

test(`[C1][S3] 일회용 학교 교사 "${RESET_LABEL}"(d7 §11-1): 직접 입력 시약 → 연필 → 입력 상태 안 ${THRESH_EDIT} 에 "${RESET_LABEL}"(누름 높이 ≥ ${MIN_H}) → 연타에도 요청 1건 · 토스트 · "${AUTO_LABEL}"+"${INTAKE_TEXT}" · DB 'auto'·자동 값 · 재고 부족 배지 갱신 / 자동 시약은 버튼 없음 / 직접 입력 저장 → "${MANUAL_TEXT}" / 매뉴얼 근거 시약도 돌리기 가능 / 기록 없는 시약 → 자동 0 "${NONE_TEXT}"`, async ({ browser }, info) => {
  const f = await fresh(info);
  // 직접 입력 50 > 재고 10 → 재고 부족. 돌리면 자동(입고 10 × 비율) → 부족 아님
  const manual = await prepReagent(f, "직접", 10);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: manual.id, p_min_stock: 50 });
  const basis = await prepReagent(f, "근거", 30);
  await teacherRpc(f, "save_reorder_basis", { p_items: [{ reagent_id: basis.id, per_group: 10, groups: 6 }] });
  const bare = await prepReagent(f, "기록없음", 10);
  await dropIntakeLogs(bare.id);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: bare.id, p_min_stock: 4 });
  expect(thresholdCols(await byService(manual.id)), "대조: 직접 입력 50").toMatchObject({ min_stock: 50, min_stock_source: "manual" });

  const { context, page } = await openTemp(browser, info, f.teacher, detailPath(manual.id));
  const actions = watchActions(page);
  try {
    await waitDetail(page);
    await expectShown(page, await byService(manual.id), "돌리기 전");
    await expect(badge(page), "직접 입력 50 > 재고 10 → 재고 부족 배지").toHaveCount(1);
    await expect(resetButton(page), "입력 상태 전에는 없음").toHaveCount(0);
    await hydrated(pencil(page));
    await pencil(page).click();
    await expect(thrInput(page), "입력 상태").toBeVisible();
    const reset = resetButton(page);
    await expect(reset, `직접 입력 시약: "${RESET_LABEL}" 1개`).toHaveCount(1);
    await expect(reset, `"${RESET_LABEL}" 글자`).toHaveText(exact(RESET_LABEL));
    await expect(thrRow(page).locator(sel(THRESH_EDIT)).getByTestId(RESET_TESTID), `"${RESET_LABEL}" 는 ${THRESH_EDIT} 안`).toHaveCount(1);
    await expect(page.getByRole("button", { name: RESET_LABEL }), `"${RESET_LABEL}" 는 버튼`).toHaveCount(1);
    const box = await reset.boundingBox();
    expect(box?.height ?? 0, `"${RESET_LABEL}" 누름 높이 ≥ rules.button.min_height ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "입력 상태 가로 스크롤 없음").toBe(true);
    expect(actions.count(), "누르기 전 요청 0").toBe(0);

    await burst(reset);
    const want = autoFromIntake(10);
    await expect(toastWith(page, new RegExp(`재주문 기준을 ${AUTO_LABEL}`)), "토스트").toBeVisible({ timeout: SAVE_TIMEOUT });
    expect(nospace(await toastWith(page, new RegExp(`재주문 기준을 ${AUTO_LABEL}`)).first().innerText()), "토스트에 자동 값").toContain(nospace(`${want}${manual.unit}`));
    expect(actions.count(), "연타에도 요청 1건").toBe(1);
    await expect.poll(async () => thresholdCols(await byService(manual.id)), { message: "DB: 'auto' + 자동 값", timeout: SAVE_TIMEOUT }).toEqual(autoCols(want, "intake"));
    await expectShown(page, await byService(manual.id), "돌린 뒤");
    await expect(thrInput(page), "돌리면 입력 상태가 닫힌다").toHaveCount(0);
    await expect(badge(page), "자동 값 < 재고 → 배지 없음").toHaveCount(0, { timeout: SAVE_TIMEOUT });

    // 자동이 된 시약: 입력 상태에 "자동으로 돌리기" 없음
    await hydrated(pencil(page));
    await pencil(page).click();
    await expect(thrInput(page)).toBeVisible();
    await expect(resetButton(page), `자동 시약: "${RESET_LABEL}" 0`).toHaveCount(0);
    // 직접 입력 저장 → 다시 "직접 입력"
    await thrInput(page).fill("3");
    await thrSave(page).click();
    await expect(toastWith(page, toastThreshold("3", manual.unit)), "직접 입력 토스트").toBeVisible({ timeout: SAVE_TIMEOUT });
    await expect.poll(async () => thresholdCols(await byService(manual.id)), { timeout: SAVE_TIMEOUT }).toMatchObject({ min_stock: 3, reorder_per_group: null, min_stock_source: "manual" });
    await expectShown(page, await byService(manual.id), "직접 입력 저장 뒤");
    await expect(thrRow(page).getByTestId(AUTO_TESTID), `직접 입력 → "${AUTO_LABEL}" 표시 없음`).toHaveCount(0);
    expect(actions.count(), "요청 = 돌리기 1 + 저장 1").toBe(2);

    // 매뉴얼 근거 시약도 돌릴 수 있다 (출처 ≠ auto)
    await page.goto(detailPath(basis.id));
    await waitDetail(page);
    await expectShown(page, await byService(basis.id), "매뉴얼 근거");
    await hydrated(pencil(page));
    await pencil(page).click();
    await expect(resetButton(page), `매뉴얼 근거 시약: "${RESET_LABEL}" 1개`).toHaveCount(1);
    await resetButton(page).click();
    await expect.poll(async () => thresholdCols(await byService(basis.id)), { message: "DB: 매뉴얼 근거 → 자동", timeout: SAVE_TIMEOUT }).toEqual(autoCols(autoFromIntake(30), "intake"));
    await expectShown(page, await byService(basis.id), "매뉴얼 근거 → 자동");
    await expect(badge(page), "재고 30 ≥ 자동 값 → 배지 없음").toHaveCount(0, { timeout: SAVE_TIMEOUT });

    // 계산할 기록이 없는 시약 → 자동 0 ("아직 없어요")
    await page.goto(detailPath(bare.id));
    await waitDetail(page);
    await hydrated(pencil(page));
    await pencil(page).click();
    await expect(resetButton(page)).toHaveCount(1);
    await resetButton(page).click();
    await expect(toastWith(page, new RegExp(`재주문 기준을 ${AUTO_LABEL}`)), "자동 0 토스트").toBeVisible({ timeout: SAVE_TIMEOUT });
    await expect.poll(async () => thresholdCols(await byService(bare.id)), { message: "DB: 자동 0", timeout: SAVE_TIMEOUT }).toMatchObject({ min_stock: 0, reorder_per_group: null, reorder_groups: null, min_stock_source: "auto" });
    await expectShown(page, await byService(bare.id), "자동 0");
    await expect(badge(page), "자동 0 → 배지 없음").toHaveCount(0);
    expect(actions.count(), "요청 = 4건").toBe(4);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 3 — 둘러보기 (데모 학교: 읽기만)
// =====================================================================

/** 둘러보기 정보 표의 재주문 기준 값 칸 글자 */
async function guestThresholdCell(page: Page): Promise<string> {
  // 1440 = 시약 목록 옆 드로어 (d7 §23 run d 세부, 시안 3-guest-desktop: 정보 줄 info-row · reorder-threshold "재주문 기준 | 값 | 출처")
  if (isDeskPage(page)) {
    const d = drawer(page);
    await expect(d, "detail-drawer 1").toHaveCount(1, { timeout: 45_000 });
    const dtab = d.locator(`${sel("segmented-control")} [role="tab"]`, { hasText: "정보" }).first();
    await expect(dtab, `드로어 "정보" 탭`).toBeVisible({ timeout: 45_000 });
    await expect(async () => {
      if ((await dtab.getAttribute("aria-selected")) !== "true") await dtab.click();
      await expect(dtab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    const row = d.getByRole("tabpanel", { name: "정보" }).locator(sel("reorder-threshold"));
    await expect(row, `드로어 정보 "${THRESH_CAPTION}" 줄`).toHaveCount(1, { timeout: 45_000 });
    const text = (await row.innerText()).replace(/s+/g, " ").trim();
    expect(text.startsWith(THRESH_CAPTION), `줄 이름 "${THRESH_CAPTION}"`).toBe(true);
    return text.slice(THRESH_CAPTION.length).trim();
  }
  // 정보 탭으로 (하이드레이션 전 클릭 무시 방지: 선택될 때까지)
  const tab = page.locator(`main ${sel("segmented-control")} [role="tab"]`, { hasText: "정보" }).first();
  await expect(tab, `"정보" 탭`).toBeVisible({ timeout: 45_000 });
  await expect(async () => {
    if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const rowEl = page.getByRole("tabpanel", { name: "정보" }).locator("tr").filter({ has: page.getByText(exact(THRESH_CAPTION)) });
  await expect(rowEl, `정보 표 "${THRESH_CAPTION}" 행`).toHaveCount(1, { timeout: 45_000 });
  const cells = await rowEl.locator("td, th").allInnerTexts();
  expect(cells.length, "정보 표 행 = 이름 + 값").toBe(2);
  expect(cells[0].trim()).toBe(THRESH_CAPTION);
  return cells[1].replace(/\s+/g, " ").trim();
}

test(`[C1][S3g] 둘러보기 시약 상세 정보 표 "${THRESH_CAPTION}": 값 + 출처(d7 §11-1 — 직접 입력 "${MANUAL_TEXT}" · 매뉴얼 근거 · 자동 "${AUTO_LABEL}"+근거) = 데모 DB`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const demos = await demoReagents();
  const ids = demos.map((d) => d.id);
  const rows = await service().from("reagents").select(COLS).in("id", ids);
  expect(rows.error, `대조 조회: ${rows.error?.message}`).toBeNull();
  const all = ((rows.data ?? []) as Record<string, unknown>[]).map(toSrc);
  // 출처별로 하나씩 + 0 인 시약이 있으면 하나 (데모 시약 전부를 열지 않는다)
  const picks: Src[] = [];
  for (const key of ["manual", "basis", "auto"]) {
    const one = all.find((r) => r.min_stock_source === key && r.min_stock > 0);
    if (one) picks.push(one);
  }
  const zero = all.find((r) => r.min_stock === 0);
  if (zero) picks.push(zero);
  expect(picks.length, "대조: 확인할 데모 시약").toBeGreaterThan(0);
  const { context, page } = await openGuest(browser, info, guestDetailPath(picks[0].id));
  try {
    for (const [i, r] of picks.entries()) {
      if (i > 0) await page.goto(guestDetailPath(r.id));
      const w = expectedShown(r);
      const cell = nospace(await guestThresholdCell(page));
      expect(cell, `${r.name}: 값 ${w.value}`).toContain(nospace(w.value));
      for (const p of w.pill) expect(cell, `${r.name}: "${p}"`).toContain(nospace(p));
      for (const c of w.caption) expect(cell, `${r.name}: 출처 "${c}"`).toContain(nospace(c));
      if (r.min_stock_source !== "auto") expect(cell, `${r.name}: 자동이 아니면 "${AUTO_LABEL}" 없음`).not.toContain(AUTO_LABEL);
    }
  } finally {
    await context.close();
  }
});

test(`[GM-ui][S3g] 둘러보기 시약 상세: ${THRESH_EDIT}·"${RESET_LABEL}" 0 (응답 본문에도 없음) · 쓰기 요청 0건`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const demo = (await demoReagents())[0];
  const { context, page, response } = await openGuest(browser, info, guestDetailPath(demo.id));
  const actions = watchActions(page);
  try {
    await guestThresholdCell(page);
    const html = await response!.text();
    expect(await countComponent(page, THRESH_EDIT), `둘러보기 ${THRESH_EDIT}`).toBe(0);
    await expect(page.getByTestId(RESET_TESTID), `둘러보기 "${RESET_LABEL}"`).toHaveCount(0);
    await expect(page.getByRole("button", { name: RESET_LABEL }), `둘러보기 "${RESET_LABEL}" 버튼`).toHaveCount(0);
    expect(html, `둘러보기 응답 본문 ${THRESH_EDIT}`).not.toContain(`data-component="${THRESH_EDIT}"`);
    expect(html, `둘러보기 응답 본문 ${RESET_TESTID}`).not.toContain(RESET_TESTID);
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 6 — 알림 카드 기준 문구
// =====================================================================

test(`[C1][S6] 일회용 학교 교사 재주문 알림 카드 기준 문구(d7 §11-1 "같은 세 형태 + 기존 두 형태" · §18 배지·캡션): 자동(사용) "${AUTO_LABEL}"+"${USAGE_TEXT}" · 자동(입고) "${AUTO_LABEL}"+"${INTAKE_TEXT}" · 매뉴얼 "1반 1회 실험량 …" · 직접 입력 "${MANUAL_BASIS_TEXT}" ("${AUTO_LABEL}" 없음) · 재주문 기준/현재 재고 = DB · 부족하지 않은 자동·0 은 카드 없음`, async ({ browser }, info) => {
  const f = await fresh(info);
  // 자동(사용): 재고 10 → 사용 9 → 재고 1 < 사용량 근거 값
  const usage = await prepReagent(f, "사용", 10);
  await teacherRpc(f, "record_usage", { reagent_id: usage.id, amount: 9 });
  // 자동(입고): 재고 100 → 입고 근거 값, 재고만 5 로 (사용 기록 없이)
  const intake = await prepReagent(f, "입고", 100);
  await lowerStock(intake.id, 5);
  const basis = await prepReagent(f, "근거", 30);
  await teacherRpc(f, "save_reorder_basis", { p_items: [{ reagent_id: basis.id, per_group: 10, groups: 6 }] });
  const manual = await prepReagent(f, "직접", 7);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: manual.id, p_min_stock: 9 });
  const enough = await prepReagent(f, "충분", 10);
  const zero = await prepReagent(f, "영", 10);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: zero.id, p_min_stock: 0 });

  const db = {
    usage: await byService(usage.id),
    intake: await byService(intake.id),
    basis: await byService(basis.id),
    manual: await byService(manual.id),
    enough: await byService(enough.id),
    zero: await byService(zero.id),
  };
  expect(thresholdCols(db.usage), "대조: 자동(사용)").toEqual(autoCols(autoFromUsage([9]), "usage"));
  expect(thresholdCols(db.intake), "대조: 자동(입고)").toEqual(autoCols(autoFromIntake(100), "intake"));
  const low = [db.usage, db.intake, db.basis, db.manual];
  for (const r of low) expect(r.stock < r.min_stock, `대조: ${r.name} 재고 부족`).toBe(true);
  expect(db.enough.stock < db.enough.min_stock, "대조: 충분한 자동 시약").toBe(false);

  const { context, page } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  try {
    await waitReorder(page);
    const shown = await readAlerts(page);
    expect(shown.map((c) => c.name).sort(), "알림 카드 = 재고 부족 시약").toEqual(low.map((r) => r.name).sort());
    for (const r of low) {
      const card = shown.find((c) => c.name === r.name)!;
      const sq = card.lines.map(nospace);
      const cardEl = page.locator(sel("reorder-alert-card")).filter({ has: page.getByRole("heading", { name: r.name, exact: true }) });
      await expect(cardEl, `${r.name}: 카드 1장`).toHaveCount(1);
      if (r.min_stock_source === "auto") {
        // d7 §18 · 시안 6 stock-line: "재주문 기준 Nu [자동] / 현재 재고 Mu"(d7 §11 1.21) — 배지는 수량 줄 안 두 조각 사이, 그 아래 캡션 한 줄
        const text = r.min_stock_auto_basis === "usage" ? USAGE_TEXT : INTAKE_TEXT;
        expect(sq.join(""), `${r.name}: ${CARD_AMOUNT.need} + "${AUTO_LABEL}" + 재고`).toContain(nospace(`${CARD_AMOUNT.need} ${r.min_stock}${r.unit} ${AUTO_LABEL} / ${CARD_AMOUNT.stock} ${r.stock}${r.unit}`));
        await expect(cardEl.locator(sel(AUTO_BADGE)), `${r.name}: ${AUTO_BADGE} 1개`).toHaveCount(1);
        await expect(cardEl.locator(sel(AUTO_BADGE)), `${r.name}: ${AUTO_BADGE} "${AUTO_LABEL}"`).toHaveText(exact(AUTO_LABEL));
        expect(card.lines.filter((l) => l.trim() === text), `${r.name}: 캡션 "${text}" 한 줄`).toHaveLength(1);
        for (const old of quotes(row(S11_1, "표시")).filter((q) => /최근 4주|마지막 입고량의/.test(q))) {
          expect(card.lines.map((l) => l.trim()), `${r.name}: §11-1 옛 근거 문구 "${old}" 줄 없음`).not.toContain(old);
          expect(card.lines.map((l) => l.trim()), `${r.name}: 옛 형태 "${AUTO_LABEL} · ${old}" 줄 없음`).not.toContain(`${AUTO_LABEL} · ${old}`);
        }
        expect(card.lines.map((l) => l.trim()), `${r.name}: 자동이면 기준 문구 "재주문 기준 N u" 줄이 없다`).not.toContain(`재주문 기준 ${r.min_stock} ${r.unit}`);
        expect(card.lines.filter((l) => l.includes(CARD_AMOUNT.need)), `${r.name}: "${CARD_AMOUNT.need}" 은 수량 줄 한 번만`).toHaveLength(1);
      } else {
        expect(sq, `${r.name}: 수량 줄 (d7 §11 1.21)`).toContain(nospace(`${CARD_AMOUNT.need} ${r.min_stock}${r.unit} / ${CARD_AMOUNT.stock} ${r.stock}${r.unit}`));
        await expect(cardEl.locator(sel(AUTO_BADGE)), `${r.name}: 자동이 아니면 ${AUTO_BADGE} 0`).toHaveCount(0);
        const text = r.min_stock_source === "basis" ? basisLine(r.reorder_per_group!, r.unit, r.reorder_groups!) : MANUAL_BASIS_TEXT;
        expect(sq, `${r.name}: 기준 문구 "${text}"`).toContain(nospace(text));
        expect(card.lines.filter((l) => l.includes(AUTO_LABEL)), `${r.name}: "${AUTO_LABEL}" 없음`).toEqual([]);
      }
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 5 — 자동 기준 표기 · 저장 · 행 합치기
// =====================================================================

const AUTO_BASIS_RE = /자동 기준 ([\d.,]+) ?(\S+)/;

test(`[C1][S5] 일회용 학교 교사 추출 표: 같은 이름 열쇠·같은 단위(정규화 뒤 — mg→g 포함) 행은 한 줄 + "${mergedNote(2)}"·"${mergedNote(3)}" · 단위가 다르면 두 행(안내 없음) · 자동 기준 시약은 "자동 기준 N" + 필요량이 더 작아도 바뀐다고 알림 · 직접 입력 시약은 "기존 기준 N" + 그대로 · 저장 → 자동 시약은 필요량·'basis', 직접 입력 시약은 그대로`, async ({ browser }, info) => {
  const f = await fresh(info);
  const prepNamedReagent = async (name: string, unit: string, stock: number) => {
    const r = await prepReagent(f, name, stock, unit, undefined, name);
    return byService(r.id);
  };
  // 자동(입고) 기준이 새 필요량보다 크다 — d7 §11-1: 자동이면 "항상 바꾸고 'basis'"
  const hcl = await prepNamedReagent("염산(0.1 M)", "mL", 5000);
  let naoh = await prepNamedReagent("수산화 나트륨", "g", 50);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: naoh.id, p_min_stock: 20 });
  naoh = await byService(naoh.id);
  const etoh = await prepNamedReagent("에탄올", "mL", 500);
  expect(thresholdCols(hcl), "대조: 염산 자동").toEqual(autoCols(autoFromIntake(5000), "intake"));
  expect(thresholdCols(naoh), "대조: 수산화나트륨 직접 입력 20").toMatchObject({ min_stock: 20, min_stock_source: "manual" });
  expect(etoh.min_stock_source, "대조: 에탄올 자동").toBe("auto");

  const items: FakeItem[] = [
    { name: "염산 0.1M", amount: 50, unit: "mL" },
    { name: "수산화나트륨", amount: 2, unit: "g" },
    { name: "염산(0.1M)", amount: 30, unit: "mL" },
    { name: "에탄올 95%", amount: 20, unit: "mL" },
    { name: "수산화 나트륨", amount: 500, unit: "mg" },
    { name: "페놀프탈레인", amount: 1, unit: "mL" },
    { name: "에탄올 95%", amount: 5, unit: "g" },
    { name: "페놀프탈레인", amount: 1, unit: "mL" },
    { name: "페놀프탈레인", amount: 1, unit: "mL" },
  ];
  /** 합친 뒤 (처음 나온 순서·이름): [이름, 1조 사용량, 단위, 합친 행 수] */
  const MERGED: [string, string, string, number][] = [
    ["염산 0.1M", "80", "mL", 2],
    ["수산화나트륨", "2.5", "g", 2],
    ["에탄올 95%", "20", "mL", 1],
    ["페놀프탈레인", "3", "mL", 3],
    ["에탄올 95%", "5", "g", 1],
  ];
  const hclNeed = requiredNumber(80, GROUPS);
  const naohNeed = requiredNumber(2.5, GROUPS);
  const etohNeed = requiredNumber(20, GROUPS);
  expect(hclNeed, "대조: 염산 새 필요량 < 자동 기준").toBeLessThan(hcl.min_stock);
  expect(naohNeed, "대조: 수산화나트륨 새 필요량 < 직접 입력 기준").toBeLessThan(naoh.min_stock);

  const { context, page } = await openTemp(browser, info, f.teacher, MANUAL_HREF);
  const actions = watchActions(page);
  try {
    await waitManual(page);
    const mock = await mockExtract(page, okReply(items));
    await toResult(page);
    expect(mock.seen().length, "추출 요청 1건").toBe(1);
    let rows = await readRows(page);
    expect(rows.map((r) => r.cells.slice(0, 3)), "합친 뒤 행 (이름·1조 사용량·단위)").toEqual(MERGED.map(([n, a, u]) => [n, a, u]));
    expect(rows.map((r) => r.edited), "합친 값은 추출값 (고친 칸 아님)").toEqual(MERGED.map(() => false));
    for (const [i, [name, , unit, n]] of MERGED.entries()) {
      const notes = rowById(page, rows[i].id).getByTestId("extract-merged-note");
      if (n >= 2) {
        await expect(notes, `${name} (${unit}): 안내 1개`).toHaveCount(1);
        await expect(notes, `${name} (${unit}): "${mergedNote(n)}"`).toHaveText(exact(mergedNote(n)));
        expect(rows[i].detail, `${name} 보조 줄`).toContain(mergedNote(n));
      } else {
        await expect(notes, `${name} (${unit}): 합치지 않은 행은 안내 없음`).toHaveCount(0);
        expect(rows[i].detail, `${name} (${unit}): "합쳤어요" 없음`).not.toContain("합쳤어요");
      }
    }
    expect(rows.map((r) => r.linked).slice(0, 3), "자동 연결").toEqual([optionLabel(hcl), optionLabel(naoh), optionLabel(etoh)]);

    // 자동 기준 시약: "자동 기준 N" + 더 작은 필요량이어도 바뀐다
    const a0 = AUTO_BASIS_RE.exec(rows[0].detail);
    expect(a0 && [toNumber(a0[1]), a0[2]], `염산: "자동 기준 ${hcl.min_stock} ${hcl.unit}"`).toEqual([hcl.min_stock, hcl.unit]);
    expect(rows[0].detail, "염산: 자동이면 '기존 기준' 이 아니다").not.toMatch(BASIS_RE);
    expect(rows[0].detail, "염산: 바뀔 값(새 필요량)").toContain(requiredText(80, GROUPS, "mL"));
    expect(rows[0].detail, "염산: 자동 기준은 유지 예고가 아니다").not.toMatch(/그대로|유지/);
    expect(rows[0].detail, "염산: 바뀐다고 알린다").toMatch(/바뀌/);
    const a2 = AUTO_BASIS_RE.exec(rows[2].detail);
    expect(a2 && [toNumber(a2[1]), a2[2]], `에탄올: "자동 기준 ${etoh.min_stock} ${etoh.unit}"`).toEqual([etoh.min_stock, etoh.unit]);
    // 직접 입력 시약: "기존 기준 N" + 더 큰 값 유지
    const b1 = BASIS_RE.exec(rows[1].detail);
    expect(b1 && [toNumber(b1[1]), b1[2]], `수산화나트륨: "기존 기준 ${naoh.min_stock} ${naoh.unit}"`).toEqual([naoh.min_stock, naoh.unit]);
    expect(rows[1].detail, "수산화나트륨: 자동 기준 표기 아님").not.toMatch(AUTO_BASIS_RE);
    expect(rows[1].detail, "수산화나트륨: 직접 입력 기준이 더 커서 그대로").toMatch(/그대로|유지/);

    // 단위가 다른 에탄올(g) 행은 연결 시약(mL)과 단위가 달라 저장을 막는다 → 행 삭제
    const gRow = rows[4];
    await removeButton(rowById(page, gRow.id)).click();
    await expect(bodyRows(page), "한 행만 사라진다").toHaveCount(MERGED.length - 1);
    rows = await readRows(page);
    expect(rows.map((r) => r.status), "남은 행 상태 (페놀프탈레인은 미연결)").toEqual(["ok", "ok", "ok", "unlinked"]);
    await expect(saveButton(page)).toBeEnabled();
    expect(actions.count(), "저장 전 요청 0").toBe(0);

    await saveButton(page).click();
    await expect(savedToast(page)).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe(REORDER_HREF);
    expect(actions.count(), "저장 요청 1건").toBe(1);
    expect(thresholdCols(await byService(hcl.id)), "DB: 염산 자동 → 필요량(더 작아도) · 'basis'").toEqual({
      min_stock: hclNeed,
      reorder_per_group: 80,
      reorder_groups: GROUPS,
      min_stock_source: "basis",
      min_stock_auto_basis: null,
    });
    expect(thresholdCols(await byService(etoh.id)), "DB: 에탄올 자동 → 필요량 · 'basis'").toMatchObject({
      min_stock: etohNeed,
      reorder_per_group: 20,
      reorder_groups: GROUPS,
      min_stock_source: "basis",
    });
    expect(thresholdCols(await byService(naoh.id)), "DB: 수산화나트륨 직접 입력 20 그대로").toEqual(thresholdCols(naoh));

    // 화면 3 에 매뉴얼 근거로 보인다
    await page.goto(detailPath(hcl.id));
    await waitDetail(page);
    await expectShown(page, await byService(hcl.id), "저장 뒤 염산 (화면 3)");
  } finally {
    await context.close();
  }
});
