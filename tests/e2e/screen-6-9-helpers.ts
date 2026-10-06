// 화면 6 (재주문 알림, dev-rules.json routes["6"]) · 화면 9 (판매처 설정, routes["9"]) e2e 도우미.
// 기준: harness/d5-gates.md D3 (R-ui·C1·C2·N1-ui·V1), harness/dev-rules.json (routes·route_auth 6·9·components·components_note),
//       design/rules.json (roles R1·R2·R3, tab_bar, colors.accent·highlight, never.N1), harness/d7-data.md §11·§12,
//       디자인 run 20261002-1441 s2-spec "## 화면 6"·"## 화면 9", design/frames/6-*.json·9-*.json.
//
// 절대 규칙 (공용 테스트 계정 4개 · 학교 A·B · 실사용 학교 · 데모 학교 · 공통 판매처 목록):
// - 공용 계정으로는 읽기 · 모달 열고 닫기 · 새 창 확인만 한다. 공용 학교에 판매처를 만들지 않고 시약의 stock·min_stock 을 바꾸지 않는다.
// - 공통 목록(vendors.school_id null)은 읽기만 한다 (service role 로도 쓰지 않는다).
// - 쓰기 흐름과 특정 상태(알림 0건, 판매처 있음, 웹사이트 없는 판매처, 기준 문구 두 형태)는 일회용 학교의 일회용 계정 세션으로만 만든다
//   (screen-8-helpers: service role 로 계정·학교 생성 — 메일이 나가지 않는다, 세션은 쿠키로 심는다).
//   service role 은 준비·정리·대조 조회에만 쓰고, 판정 대상은 항상 브라우저 화면과 그 화면이 보낸 요청이다.
// - 새 창: 외부 사이트를 실제로 불러오지 않는다 (stubExternal 이 앱 밖 주소 요청을 빈 문서로 대신 응답한다). popup 의 주소만 본다.
// - 정리 순서: usage_logs → 시약(intake_logs cascade) → 판매처 → 시약장 → 프로필 → 계정 → 학교.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserClient, devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { exact, service, sweep, todayDots, type Residue } from "./screen-8-helpers";
import { makeFixture, type S11Fixture } from "./screen-11-helpers";

export { boxOf, frameCounts, highlightSoft, hydrated, onTop, watchActions } from "./screen-11-helpers";
export { exact };

export const REORDER = 6;
export const VENDORS = 9;
export const HOME = 13;
export const LOGIN = 1;
export const REORDER_HREF = routeOf(REORDER);
export const VENDORS_HREF = routeOf(VENDORS);
export const HOME_HREF = routeOf(HOME);
export const LOGIN_HREF = routeOf(LOGIN);

// ---------- 컴포넌트 이름 ----------
export const MANUAL = "manual-upload";
export const CARD = "reorder-alert-card";
export const BADGE = "badge-low-stock";
export const LINK = "vendor-link";
export const REGISTER = "vendor-register";
export const MODAL = "ex-modal-card";
export const EMPTY = "ex-empty-state-card";
export const TOAST = "ex-toast";
export const SEGMENT = "segmented-control";
export const SEGMENT_ACTIVE = "segmented-control-active";
export const INPUT = "text-input";
export const CELL = "ex-data-table-cell";
export const PRIMARY = "button-primary";
export const OUTLINE = "button-outline";
export const PILL_SOFT = "button-pill-soft";

// ---------- 문구 (s2-spec 화면 6·9, d7 §11·§12) ----------
export const REORDER_NAV = "재주문 알림";
export const VENDORS_NAV = "판매처 설정";
export const GUIDE_TEXT = "필요량 = 1반 1회 실험량 × 조 수";
export const BASIS_WORD = "재주문 기준";
export const MANUAL_BUTTON = "실험 매뉴얼 올리기";
/** d7 §11 "매뉴얼 진입": 화면 5 (dev-rules routes["5"] — 실제 화면, 도착 확인은 screen-5-structure) */
export const MANUAL_HREF = "/manual";
export const BADGE_TEXT = "재고 부족";
export const LINK_BUTTON = "판매처 연결";
export const LINK_TITLE = "판매처 연결";
export const REGISTER_BUTTON = "판매처 등록";
export const CANCEL_BUTTON = "취소";
export const CONFIRM_BUTTON = "확인";
export const EMPTY_ALERTS = "재고가 부족한 시약이 없어요";
export const DIRECT_OPEN = "직접 열기";
export const TAB_SCHOOL = "우리 학교 판매처";
export const TAB_COMMON = "공통 목록";
export const SEARCH_PLACEHOLDER = "판매처 검색";
export const FIELD_NAME = "판매처명";
export const FIELD_CONTACT = "연락처";
export const FIELD_WEBSITE = "웹사이트 주소";
export const SAVE_BUTTON = "저장";
export const EDIT_ITEM = "수정";
export const DELETE_ITEM = "삭제";
export const DELETE_TITLE = "이 판매처를 삭제할까요?";
export const EMPTY_VENDORS = "등록한 판매처가 없어요";
export const TOAST_SAVED = "판매처를 저장했어요";
export const TOAST_DELETED = "판매처를 삭제했어요";
export const COMMON_HEAD = ["판매처명", "부가 정보"];
export const ACTIVE_TAB_LABEL = "시약";
/** s2-spec 화면 9: 버튼 아래 끝과 tab-bar 위쪽 선 사이 16 */
export const BUTTON_TAB_GAP = 16;

const d7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");

/** d7 §12 "공통 목록" 의 처음 seed: "이름(https://…)" 목록을 문서에서 읽는다 */
export const COMMON_SEED: { name: string; website: string }[] = (() => {
  const line = d7.split(/\r?\n/).find((l) => l.startsWith("| 공통 목록 |"));
  if (!line) throw new Error("harness/d7-data.md §12 에서 '공통 목록' 행을 찾지 못했습니다");
  const tail = line.slice(line.indexOf("처음 seed"));
  const list = tail.slice(tail.indexOf("):") + 2);
  const out = [...list.matchAll(/([^\s,()|]+)\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({ name: m[1], website: m[2] }));
  if (out.length === 0) throw new Error("harness/d7-data.md §12 공통 목록 seed 를 읽지 못했습니다");
  return out;
})();
export const COMMON_NAMES = COMMON_SEED.map((v) => v.name);
export const hostOf = (website: string) => new URL(website).host;
export const hrefOf = (website: string) => new URL(website).href;

// ---------- 색 (design/rules.json colors) ----------
type ColorRules = { colors: { accent: { value: string }; accent_soft: { value: string }; highlight: { values: string[] } } };
const colorRules = JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as ColorRules;
function rgbOf(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
/** 핑크(accent · accent_soft) computed style 표기 */
export const PINK = [colorRules.colors.accent.value, colorRules.colors.accent_soft.value].map(rgbOf);
/** 하늘색(highlight) computed style 표기 */
export const SKY = colorRules.colors.highlight.values.map(rgbOf);

/**
 * 주어진 색을 칠한(글자·바탕·테두리·svg fill·stroke) 보이는 요소 중, allowed 컴포넌트 안에 있지 않은 것과 안에 있는 것의 수.
 * scope 가 있으면 그 컴포넌트 안의 요소만 본다.
 */
export function paintedWith(page: Page, colors: string[], allowed: string[], scope?: string): Promise<{ inside: number; outside: string[] }> {
  return page.evaluate(
    ({ colors, allowed, scope }) => {
      const roots = scope ? [...document.querySelectorAll(`[data-component="${scope}"]`)] : [document.body];
      const allow = allowed.map((n) => `[data-component="${n}"]`).join(",");
      let inside = 0;
      const outside: string[] = [];
      for (const root of roots) {
        for (const el of [root, ...root.querySelectorAll("*")]) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          const used = [cs.color, cs.backgroundColor, cs.fill, cs.stroke];
          for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
            if (parseFloat(cs[`border${side}Width`]) > 0) used.push(cs[`border${side}Color`]);
          }
          if (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== "none") used.push(cs.outlineColor);
          if (!used.some((u) => colors.includes(u))) continue;
          if (allow && el.closest(allow)) inside += 1;
          else outside.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").slice(0, 40)} "${(el.textContent ?? "").trim().slice(0, 20)}"`);
        }
      }
      return { inside, outside };
    },
    { colors, allowed, scope },
  );
}

// ---------- 공통 화면 요소 ----------
export const main = (page: Page) => page.locator("main");
export const modal = (page: Page) => page.locator(sel(MODAL));
export const toast = (page: Page) => page.locator(sel(TOAST));
export const BUSY = 'main [aria-busy="true"]';
export const linksTo = (page: Page, href: string) => page.locator(`a[href="${href}"], a[href^="${href}?"], a[href^="${href}/"]`);
export const navLinks = (page: Page) => page.locator(`${sel("nav-pill")} nav a`);
export async function navLabels(page: Page): Promise<string[]> {
  return (await navLinks(page).allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
}
export const primaryIn = (scope: Locator, label: string) => scope.locator(sel(PRIMARY)).filter({ hasText: exact(label) });
export const outlineIn = (scope: Locator, label: string) => scope.locator(sel(OUTLINE)).filter({ hasText: exact(label) });
export const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export const squash = (s: string) => s.replace(/[\s,]/g, "");
export const linesOf = (s: string) => s.split(/\n/).map(clean).filter(Boolean);

/** 화면에 보이는 글자에서 학교명 패턴(rules.json never.N1.school_name_pattern)에 맞는 이름 종류 */
export function schoolNamesOf(text: string): string[] {
  return [...new Set(text.match(new RegExp(rules.never.N1.school_name_pattern, "g")) ?? [])];
}

/** dev-rules.json components 이름별 DOM 개수 (문서 전체) */
export function countsOf(page: Page, names: string[]): Promise<Record<string, number>> {
  return page.evaluate((list) => Object.fromEntries(list.map((n) => [n, document.querySelectorAll(`[data-component="${n}"]`).length])), names);
}

/** 그 화면에 속하지 않는 컴포넌트 이름 (dev-rules.json components) — 그 화면에서는 0 이어야 한다 */
export function foreignComponents(screen: number): string[] {
  return Object.entries(devRules.components)
    .filter(([, screens]) => !screens.includes(screen))
    .map(([name]) => name);
}

/** rules.json tab_bar 검사: 390 = 1개·항목 수·라벨·활성 탭, 1440 = 0 */
export async function expectTabBar(page: Page, viewport: ViewportName, screen: number, state: string): Promise<void> {
  const tb = rules.tab_bar;
  const shown = viewport === "mobile" && tb.mobile_screens.includes(screen);
  if (viewport === "mobile") expect(shown, `rules.json tab_bar.mobile_screens 에 화면 ${screen}`).toBe(true);
  await expect(page.locator(sel(tb.component)), `${state}: ${viewport} ${tb.component}`).toHaveCount(shown ? 1 : 0);
  await expect(page.locator(sel(tb.item)), `${state}: ${viewport} ${tb.item}`).toHaveCount(shown ? tb.items : 0);
  if (!shown) return;
  expect(tb.labels.length, "rules.json tab_bar labels 수 = items").toBe(tb.items);
  expect(tb.labels, `tab_bar labels 에 "${ACTIVE_TAB_LABEL}"`).toContain(ACTIVE_TAB_LABEL);
  const bar = page.locator(sel(tb.component));
  await expect(bar).toBeVisible();
  const items = bar.locator(sel(tb.item));
  await expect(items, "tab-item 은 tab-bar 안에").toHaveCount(tb.items);
  expect((await items.allInnerTexts()).map(clean), `${state}: 탭 라벨 순서`).toEqual(tb.labels);
  const active = bar.locator(`${sel(tb.item)}[aria-current="page"]`);
  await expect(active, `${state}: 활성 tab-item 1개`).toHaveCount(1);
  await expect(active, `${state}: 활성 탭 "${ACTIVE_TAB_LABEL}"`).toHaveText(exact(ACTIVE_TAB_LABEL));
  const t = (await bar.boundingBox())!;
  expect(Math.round(t.y + t.height), `${state}: tab-bar 는 화면 아래 끝`).toBe(page.viewportSize()!.height);
  expect(Math.round(t.width), `${state}: tab-bar 전폭`).toBe(page.viewportSize()!.width);
}

/** tab-bar 위쪽 선의 y (모바일) */
export async function tabBarTop(page: Page): Promise<number> {
  const t = await page.locator(sel(rules.tab_bar.component)).boundingBox();
  if (!t) throw new Error("tab-bar 가 보이지 않음");
  return t.y;
}

/** 문서를 끝까지 내린다 */
export async function scrollToEnd(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(150);
}

/** GET 이 아닌 요청(쓰기 요청) 기록 */
export function watchWrites(page: Page): { list: () => string[] } {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.method() !== "HEAD" && r.method() !== "OPTIONS") seen.push(`${r.method()} ${r.url()}`);
  });
  return { list: () => [...seen] };
}

/**
 * 앱(baseURL) 밖 http(s) 주소로 가는 요청을 빈 문서로 대신 응답한다 — 판매처 사이트를 실제로 불러오지 않는다.
 * Supabase 주소는 건드리지 않는다.
 */
export async function stubExternal(context: BrowserContext, info: TestInfo): Promise<{ hits: () => string[] }> {
  const base = info.project.use.baseURL;
  if (!base) throw new Error("playwright.config baseURL 없음");
  const appHost = new URL(base).host;
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : "";
  const hits: string[] = [];
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.host !== appHost && url.host !== supa,
    async (route) => {
      hits.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>stub</title><p>stub</p>" });
    },
  );
  return { hits: () => [...hits] };
}

// ======================================================================
// 화면 6
// ======================================================================
export const manual = (page: Page) => main(page).locator(sel(MANUAL));
export const cards = (page: Page) => main(page).locator(sel(CARD));
export const cardOf = (page: Page, name: string) => cards(page).filter({ has: page.getByRole("heading", { name: exact(name) }) });
export const linkButton = (card: Locator) => card.locator(`${sel(LINK)} ${sel(PRIMARY)}`);
export const linkDialog = (page: Page) => page.getByRole("dialog", { name: exact(LINK_TITLE) });
export const radios = (page: Page) => linkDialog(page).getByRole("radio");
export const confirmButton = (page: Page) => primaryIn(linkDialog(page), CONFIRM_BUTTON);
export const cancelButton = (page: Page) => outlineIn(linkDialog(page), CANCEL_BUTTON);
export const registerEntry = (page: Page) => main(page).locator(sel(REGISTER));
export const emptyCard = (page: Page) => main(page).locator(sel(EMPTY));
export const directLink = (page: Page) => page.getByRole("link", { name: exact(DIRECT_OPEN) });

/** 화면 6 본문이 그려졌는지 (빈 화면·자리 표시에서 0개를 세어 통과하지 않도록) */
export async function waitReorder(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await expect.poll(() => new URL(page.url()).pathname, { message: "화면 6 경로", timeout: 45_000 }).toBe(REORDER_HREF);
  await expect(manual(page), MANUAL).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(BUSY), "자리 표시는 본문으로 바뀐다").toHaveCount(0);
  await expect(cards(page).or(emptyCard(page)).first(), "알림 카드 또는 빈 상태").toBeVisible();
}

export type ShownAlert = { name: string; lines: string[]; badges: string[]; links: number; buttons: string[] };

/** 알림 카드 (보이는 순서): 시약명(제목)·글자 줄·배지·vendor-link 수 */
export async function readAlerts(page: Page): Promise<ShownAlert[]> {
  const raw = await cards(page).evaluateAll((els) =>
    els.map((el) => ({
      name: (el.querySelector("h1,h2,h3,h4,h5,h6") as HTMLElement | null)?.innerText ?? "",
      text: (el as HTMLElement).innerText,
      badges: [...el.querySelectorAll('[data-component="badge-low-stock"]')].map((b) => (b as HTMLElement).innerText),
      links: el.querySelectorAll('[data-component="vendor-link"]').length,
      buttons: [...el.querySelectorAll('[data-component="vendor-link"] [data-component="button-primary"]')].map((b) => (b as HTMLElement).innerText),
    })),
  );
  return raw.map((c) => ({ name: clean(c.name), lines: linesOf(c.text), badges: c.badges.map(clean), links: c.links, buttons: c.buttons.map(clean) }));
}

export type DbReagent = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
  reorder_per_group: number | null;
  reorder_groups: number | null;
  low_stock_since: string | null;
};
const REAGENT_COLS = "id, name, unit, stock, min_stock, reorder_per_group, reorder_groups, low_stock_since";
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
function toReagent(r: Record<string, unknown>): DbReagent {
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

/** 로그인 세션(RLS)으로 읽은 자기 학교 시약 전체 */
export async function ownReagentsOf(client: SupabaseClient): Promise<DbReagent[]> {
  const r = await client.from("reagents").select(REAGENT_COLS).order("name").order("id");
  if (r.error) throw new Error(`reagents 조회 실패: ${r.error.message}`);
  return ((r.data ?? []) as Record<string, unknown>[]).map(toReagent);
}

/** d7 §11 "알림 대상": stock < min_stock */
export const isLow = (r: DbReagent) => r.stock < r.min_stock;
/** d7 §11 "부족한 정도": 모자란 양 ÷ 필요량 */
export const shortage = (r: DbReagent) => (r.min_stock - Math.max(r.stock, 0)) / r.min_stock;

/** 브라우저 로그인 세션(RLS)으로 읽은 자기 학교의 부족 시약 */
export async function dbLow(page: Page): Promise<DbReagent[]> {
  const { client } = await browserClient(page);
  return (await ownReagentsOf(client)).filter(isLow);
}

/** d7 §11 카드 문구 */
export const amountText = (r: DbReagent) => `필요량 ${r.min_stock} ${r.unit} / 현재 재고 ${r.stock} ${r.unit}`;
export const basisText = (r: DbReagent) =>
  r.reorder_per_group !== null && r.reorder_groups !== null
    ? `1반 1회 실험량 ${r.reorder_per_group} ${r.unit} × ${r.reorder_groups}조 기준`
    : `재주문 기준 ${r.min_stock} ${r.unit}`;
/** "YYYY.MM.DD 알림" — low_stock_since 의 한국 날짜 */
export const dateText = (r: DbReagent) => `${todayDots(new Date(r.low_stock_since!))} 알림`;
export const DATE_LINE = /^\d{4}\.\d{2}\.\d{2} 알림$/;

/** 카드 한 장이 DB 행과 맞는지 (숫자 표기의 자릿수 쉼표·공백 차이는 무시한다) */
export function expectCardMatches(card: ShownAlert, r: DbReagent, what: string): void {
  expect(card.name, `${what}: 시약명`).toBe(r.name);
  expect(card.badges, `${what}: ${BADGE} "${BADGE_TEXT}" 1개`).toEqual([BADGE_TEXT]);
  const sq = card.lines.map(squash);
  expect(sq, `${what}: "${amountText(r)}"`).toContain(squash(amountText(r)));
  expect(sq, `${what}: 기준 문구 "${basisText(r)}"`).toContain(squash(basisText(r)));
  expect(r.low_stock_since, `${what}: 대조 — 부족 시약의 low_stock_since`).not.toBeNull();
  expect(card.lines.filter((l) => DATE_LINE.test(l)), `${what}: 알림 날짜 (한국 날짜)`).toEqual([dateText(r)]);
  expect(card.links, `${what}: ${LINK} 1개`).toBe(1);
  expect(card.buttons, `${what}: ${LINK} 안 ${PRIMARY} "${LINK_BUTTON}"`).toEqual([LINK_BUTTON]);
}

/** 카드의 "판매처 연결" 을 눌러 모달을 연다 (같은 버튼을 다시 누르면 닫히므로 닫혀 있을 때만 누른다) */
export async function openLinkModal(page: Page, card: Locator): Promise<Locator> {
  const btn = linkButton(card);
  await expect(btn, `"${LINK_BUTTON}" 버튼`).toHaveCount(1);
  const dlg = linkDialog(page);
  await expect(async () => {
    if (!(await dlg.isVisible())) await btn.click({ timeout: 5_000 });
    await expect(dlg).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(modal(page), `${MODAL} 은 한 번에 하나`).toHaveCount(1);
  return dlg;
}

/** 모달의 판매처 행 (보이는 순서): 라디오의 라벨 글자 줄 */
export async function readOptions(page: Page): Promise<{ lines: string[]; checked: boolean }[]> {
  const raw = await radios(page).evaluateAll((els) =>
    els.map((el) => {
      const input = el as HTMLInputElement;
      const label = input.labels?.[0] ?? input.closest("label");
      return { text: (label as HTMLElement | null)?.innerText ?? input.getAttribute("aria-label") ?? "", checked: input.checked };
    }),
  );
  return raw.map((o) => ({ lines: linesOf(o.text), checked: o.checked }));
}
export const optionNames = async (page: Page) => (await readOptions(page)).map((o) => o.lines[0] ?? "");

/** 판매처 행 고르기 (행의 글자를 누른다) → 그 행만 선택 */
export async function pickVendor(page: Page, name: string): Promise<void> {
  const names = await optionNames(page);
  const at = names.indexOf(name);
  expect(at, `모달 판매처 행 "${name}" (보이는 행: ${names.join(" / ")})`).toBeGreaterThanOrEqual(0);
  const radio = radios(page).nth(at);
  // 행을 누른다: 라디오 입력이 행 전체를 덮는 구조면 입력을, 아니면 행의 글자를 누른다
  await radio.check({ timeout: 5_000 }).catch(() => radio.locator("xpath=ancestor::label[1]").getByText(name, { exact: true }).click({ timeout: 10_000 }));
  await expect(radio, `"${name}" 선택`).toBeChecked();
  await expect(linkDialog(page).getByRole("radio", { checked: true }), "선택된 판매처는 하나").toHaveCount(1);
}

// ======================================================================
// 화면 9
// ======================================================================
export const segment = (page: Page) => main(page).locator(sel(SEGMENT));
export const segmentActive = (page: Page) => segment(page).locator(sel(SEGMENT_ACTIVE));
export const tabOf = (page: Page, label: string) => segment(page).getByText(exact(label));
export const searchInput = (page: Page) => main(page).getByPlaceholder(SEARCH_PLACEHOLDER);
export const registerBlock = (page: Page) => main(page).locator(sel(REGISTER));
export const vendorRows = (page: Page) => registerBlock(page).getByRole("listitem");
export const vendorRow = (page: Page, name: string) => vendorRows(page).filter({ hasText: name });
export const moreButton = (row: Locator) => row.getByRole("button", { name: /더보기/ });
export const menuItem = (page: Page, label: string) => page.getByRole("menuitem", { name: exact(label) });
export const registerButton = (page: Page) => primaryIn(registerBlock(page), REGISTER_BUTTON);
export const saveButton = (page: Page) => primaryIn(registerBlock(page), SAVE_BUTTON);
export const fieldInput = (page: Page, label: string) => registerBlock(page).getByLabel(label, { exact: true });
export const fieldBox = (page: Page, label: string) => registerBlock(page).locator(sel(INPUT)).filter({ has: page.getByLabel(label, { exact: true }) });
export const fieldAlert = (page: Page, label: string) => fieldBox(page, label).getByRole("alert");
export const deleteDialog = (page: Page) => page.getByRole("dialog", { name: exact(DELETE_TITLE) });
export const cells = (page: Page) => main(page).locator(sel(CELL));

/** 화면 9 본문이 그려졌는지 */
export async function waitVendors(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await expect.poll(() => new URL(page.url()).pathname, { message: "화면 9 경로", timeout: 45_000 }).toBe(VENDORS_HREF);
  await expect(segment(page), SEGMENT).toBeVisible({ timeout: 45_000 });
  await expect(registerBlock(page), REGISTER).toBeVisible();
  await expect(page.locator(BUSY), "자리 표시는 본문으로 바뀐다").toHaveCount(0);
}

/** 탭 바꾸기 → 활성 탭이 그 라벨 */
export async function switchTab(page: Page, label: string): Promise<void> {
  await expect(async () => {
    if (clean(await segmentActive(page).innerText()) !== label) await tabOf(page, label).click({ timeout: 5_000 });
    await expect(segmentActive(page)).toHaveText(exact(label), { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(segmentActive(page), "활성 탭은 하나").toHaveCount(1);
}

/** "판매처 등록" 을 눌러 폼을 연다 (판매처명 입력이 보일 때까지) */
export async function openCreateForm(page: Page): Promise<void> {
  const name = fieldInput(page, FIELD_NAME);
  await expect(async () => {
    if (!(await name.isVisible())) await registerButton(page).click({ timeout: 5_000 });
    await expect(name).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** 행의 더보기 메뉴를 열고 항목을 누른다 */
export async function chooseRowMenu(page: Page, name: string, item: string): Promise<void> {
  const row = vendorRow(page, name);
  await expect(row, `판매처 행 "${name}"`).toHaveCount(1);
  const target = menuItem(page, item);
  await expect(async () => {
    if (!(await target.isVisible())) await moreButton(row).click({ timeout: 5_000 });
    await expect(target).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("menuitem"), '더보기 메뉴 = "수정"·"삭제"').toHaveText([exact(EDIT_ITEM), exact(DELETE_ITEM)]);
  await target.click();
}

/** 우리 학교 판매처 행 (보이는 순서): 글자 줄 */
export async function readVendorRows(page: Page): Promise<string[][]> {
  return (await vendorRows(page).allInnerTexts()).map(linesOf);
}

/** 공통 목록 탭의 셀 글자 (머리글 제외) */
export async function readCommonCells(page: Page): Promise<string[]> {
  const all = (await cells(page).allInnerTexts()).map(clean);
  return all.filter((t) => !COMMON_HEAD.includes(t));
}

export type DbVendor = { id: string; school_id: string | null; name: string; contact: string | null; website: string | null; note: string | null };
const VENDOR_COLS = "id, school_id, name, contact, website, note";

/** 로그인 세션(RLS)으로 보이는 판매처 (자기 학교 + 공통) */
export async function visibleVendors(page: Page): Promise<DbVendor[]> {
  const { client } = await browserClient(page);
  const r = await client.from("vendors").select(VENDOR_COLS).order("name");
  if (r.error) throw new Error(`vendors 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as DbVendor[];
}

/** 대조 조회 (service role): 한 학교의 판매처 */
export async function vendorsBySchool(schoolId: string): Promise<DbVendor[]> {
  const r = await service().from("vendors").select(VENDOR_COLS).eq("school_id", schoolId).order("name");
  if (r.error) throw new Error(`vendors 대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as DbVendor[];
}

/** d7 §12 행의 부가 정보 = "연락처 · note" (있는 것만) */
export const infoOf = (v: Pick<DbVendor, "contact" | "note">) => [v.contact, v.note].filter(Boolean).join(" · ");

// ======================================================================
// 일회용 학교 (쓰기 흐름·특정 상태)
// ======================================================================
export type Fx = S11Fixture;
export const makeSchool = makeFixture;
export const hex = (n = 3) => randomBytes(n).toString("hex");

/** 일회용 학교의 사용 기록·시약(intake_logs cascade)·판매처를 비운다 (service role — 준비·정리) */
export async function purge(schoolIds: string[]): Promise<void> {
  if (!schoolIds.length) return;
  const sb = service();
  for (const table of ["usage_logs", "reagents", "vendors"]) {
    const r = await sb.from(table).delete().in("school_id", schoolIds);
    expect(r.error, `일회용 학교 ${table} 정리: ${r.error?.message}`).toBeNull();
  }
}

const storageClasses = (JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as { cabinet: { storage_classes: string[] } }).cabinet
  .storage_classes;

export type ReagentSpec = { tag: string; stock: number; min: number; unit?: string; perGroup?: number; groups?: number };

/**
 * 준비: 임시 시약 (admin 세션 — register_reagent 는 자동 기준 = 첫 재고 × 입고 비율로 시작, d7 §11-1) → 같은 세션으로 min_stock·기준 열을 정한다.
 * low_stock_since 는 DB 가 맞춘다 (d7 §11). 돌려주는 값은 로그인 세션으로 다시 읽은 행.
 */
export async function prepReagent(f: Fx, spec: ReagentSpec): Promise<DbReagent> {
  const name = `임시시약-${spec.tag}-${hex()}`;
  const made = await f.prep.rpc("register_reagent", {
    p_name: name,
    p_storage_class: storageClasses[0],
    p_stock: spec.stock,
    p_unit: spec.unit ?? "g",
    p_intake_date: "2026-09-15",
    p_msds_url: null,
  });
  expect(made.error, `준비: register_reagent (${made.error?.message})`).toBeNull();
  const row = (Array.isArray(made.data) ? made.data[0] : made.data) as { id: string } | null;
  if (!row) throw new Error("준비: register_reagent 가 행을 돌려주지 않음");
  const up = await f.prep
    .from("reagents")
    .update({ min_stock: spec.min, reorder_per_group: spec.perGroup ?? null, reorder_groups: spec.groups ?? null })
    .eq("id", row.id)
    .select(REAGENT_COLS);
  expect(up.error, `준비: 재주문 기준 지정 (${up.error?.message})`).toBeNull();
  expect(up.data ?? [], "준비: 재주문 기준 지정 행").toHaveLength(1);
  const r = toReagent((up.data ?? [])[0] as Record<string, unknown>);
  expect(r.low_stock_since !== null, `준비: ${name} low_stock_since 는 부족할 때만 값이 있다 (d7 §11)`).toBe(isLow(r));
  return r;
}

export type VendorSpec = { name?: string; contact?: string | null; website?: string | null; note?: string | null };

/** 준비: 일회용 학교 판매처 (admin 세션의 직접 insert — d7 §12 "쓰기 방식") */
export async function prepVendor(f: Fx, spec: VendorSpec = {}, tag = "판매처"): Promise<DbVendor> {
  const row = {
    school_id: f.school.id,
    name: spec.name ?? `임시${tag}-${hex()}`,
    contact: spec.contact ?? null,
    website: spec.website ?? null,
    note: spec.note ?? null,
  };
  const r = await f.prep.from("vendors").insert(row).select(VENDOR_COLS);
  expect(r.error, `준비: vendors insert (${r.error?.message})`).toBeNull();
  expect(r.data ?? [], "준비: vendors insert 행").toHaveLength(1);
  return (r.data ?? [])[0] as DbVendor;
}

/** 외부로 나가지 않는 판매처 주소 (.test 는 실제로 풀리지 않는 최상위 도메인) */
export const fakeSite = (tag: string) => `https://${tag}-${hex()}.example.test/shop`;

export type Residue69 = Residue & { vendors: number; reagents: number; intake_logs: number; usage_logs: number; cabinets: number };
export const NO_RESIDUE_69: Residue69 = { users: 0, schools: 0, invites: 0, profiles: 0, vendors: 0, reagents: 0, intake_logs: 0, usage_logs: 0, cabinets: 0 };

/** 이 묶음(group)·프로젝트의 일회용 학교·계정과 그 학교의 기록·시약·판매처·시약장을 지우고 남은 수를 돌려준다 */
export async function cleanup(group: string, project: string): Promise<Residue69> {
  const sb = service();
  const schools = await sb.from("schools").select("id").like("neis_code", `S8UI-${group}-${project}-%`);
  const ids = (schools.data ?? []).map((s) => s.id as string);
  if (ids.length) {
    for (const table of ["usage_logs", "reagents", "vendors", "cabinets"]) await sb.from(table).delete().in("school_id", ids);
  }
  const left = await sweep(group, project);
  const rest: Record<string, number> = {};
  for (const table of ["vendors", "reagents", "intake_logs", "usage_logs", "cabinets"]) {
    const r = ids.length ? await sb.from(table).select("id").in("school_id", ids) : { data: [] as unknown[] };
    rest[table] = (r.data ?? []).length;
  }
  return { ...left, ...(rest as Omit<Residue69, keyof Residue>) };
}

/** 다른 스펙이 학교 A·B 에 잠깐 만드는 임시 시약 이름 접두사 (db-helpers pickReagent 가 건너뛰는 것과 같은 목록) */
const FOREIGN_TEMP = ["R-db-", "N1-db-", "S7-ui-"];

/**
 * 공용 학교 A·B·데모 학교 스냅숏 (service role 읽기) — 이 스펙들이 건드리지 않았는지 대조한다.
 * 판매처: 공통 목록 전체 열 + 공용·데모 학교의 판매처. 시약: id·이름·단위·필요량·기준 열
 * (stock·low_stock_since 는 다른 스펙이 병렬로 잠깐 바꿨다 되돌리므로 넣지 않는다 — 이 스펙들은 공용 학교 시약에 쓰지 않는다).
 */
export async function sharedSnapshot(): Promise<string[]> {
  const sb = service();
  const schools = await sb.from("schools").select("id, neis_code, is_demo").or("neis_code.like.TEST-SCHOOL-%,is_demo.eq.true");
  if (schools.error) throw new Error(`schools 대조 조회 실패: ${schools.error.message}`);
  const ids = (schools.data ?? []).map((s) => s.id as string);
  expect(ids.length, "대조: 학교 A·B·데모 학교").toBeGreaterThanOrEqual(3);
  const [common, own, reagents] = await Promise.all([
    sb.from("vendors").select("*").is("school_id", null).order("id"),
    sb.from("vendors").select("*").in("school_id", ids).order("id"),
    sb.from("reagents").select("id, school_id, name, unit, min_stock, reorder_per_group, reorder_groups, min_stock_source").in("school_id", ids).order("id"),
  ]);
  for (const q of [common, own, reagents]) if (q.error) throw new Error(`대조 조회 실패: ${q.error.message}`);
  return [
    ...(common.data ?? []).map((v) => `common|${JSON.stringify(v)}`),
    ...(own.data ?? []).map((v) => `vendor|${JSON.stringify(v)}`),
    ...(reagents.data ?? [])
      .filter((r) => !FOREIGN_TEMP.some((p) => String(r.name).startsWith(p)))
      // 출처가 'auto' 인 시약의 min_stock 은 다른 스펙의 사용·입고 기록으로 DB 가 다시 계산한다(d7 §11-1) — 값 대신 출처만 견준다
      .map((r) => `reagent|${r.school_id}|${r.id}|${r.name}|${r.unit}|${r.min_stock_source === "auto" ? "auto" : r.min_stock}|${r.reorder_per_group}|${r.reorder_groups}|${r.min_stock_source}`),
  ];
}

/** 대조 조회 (service role): 주어진 학교가 아닌 모든 학교의 이름·시약명·판매처명 */
export type Other = { id: string; name: string; isDemo: boolean; neis: string | null; reagents: string[]; vendors: string[] };
export async function otherSchools(ownSchoolId: string): Promise<Other[]> {
  const sb = service();
  const [schools, reagents, vendors] = await Promise.all([
    sb.from("schools").select("id, name, is_demo, neis_code").neq("id", ownSchoolId),
    sb.from("reagents").select("school_id, name").neq("school_id", ownSchoolId),
    sb.from("vendors").select("school_id, name").not("school_id", "is", null).neq("school_id", ownSchoolId),
  ]);
  for (const q of [schools, reagents, vendors]) if (q.error) throw new Error(`대조 조회 실패: ${q.error.message}`);
  return (schools.data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    isDemo: Boolean(s.is_demo),
    neis: (s.neis_code as string | null) ?? null,
    reagents: (reagents.data ?? []).filter((r) => r.school_id === s.id).map((r) => r.name as string),
    vendors: (vendors.data ?? []).filter((v) => v.school_id === s.id).map((v) => v.name as string),
  }));
}

/**
 * 다른 학교의 학교명·시약명·판매처명이 글자(화면·응답 본문)에 없는지.
 * 자기 학교의 글자에 포함되는 값(같은 시약명 등)은 비교에서 빼고, 비교한 값의 수를 학교별로 돌려준다.
 */
export function expectNoOtherSchool(texts: Record<string, string>, others: Other[], ownStrings: string[]): Record<string, number> {
  const compared: Record<string, number> = {};
  const own = ownStrings.map((s) => s.toLowerCase());
  const distinct = (v: string) => v.trim().length >= 2 && !own.some((o) => o.includes(v.toLowerCase()));
  for (const o of others) {
    compared[o.id] = 0;
    for (const v of [o.name, ...o.reagents, ...o.vendors]) {
      if (!distinct(v)) continue;
      compared[o.id] += 1;
      for (const [where, text] of Object.entries(texts)) {
        expect(text.toLowerCase().includes(v.toLowerCase()), `${where} 에 다른 학교(${o.name})의 '${v}'`).toBe(false);
      }
    }
  }
  return compared;
}

/** 학교명 종류 = rules.json distinct_school_names, 보이는 학교명은 자기 학교명뿐 */
export function checkSchoolNames(text: string, mine: string, where: string): void {
  const N1 = rules.never.N1;
  const names = schoolNamesOf(text);
  expect(names, `${where}: 학교명 종류`).toHaveLength(N1.distinct_school_names);
  for (const n of names) expect(mine, `${where}: 보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
  expect(text, `${where}: 자기 학교명 표시`).toContain(mine);
}

/** 브라우저 세션의 자기 학교 id */
export async function ownSchoolId(page: Page): Promise<string> {
  const { client, userId } = await browserClient(page);
  const prof = await client.from("profiles").select("school_id").eq("user_id", userId).single();
  if (prof.error || !prof.data) throw new Error(`profiles 자기 행 없음: ${prof.error?.message}`);
  return prof.data.school_id as string;
}
