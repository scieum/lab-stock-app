// C3 데스크톱 재구성 run b — 목록 data-table + 오른쪽 detail-drawer (harness/d5-gates.md C3, harness/d7-data.md §23 "2026-10-09 run b 세부",
// design/rules.json 1.24 desktop_shell(desktop_required · drawer_width · overlay), harness/dev-rules.json 1.12(data-table [2,8,9,10] ·
// detail-drawer [3,4,9,10,16] · desktop_migrated_screens [2,3,4,8,9,10,16])).
// - desktop_required: 2·8·9·10 data-table, 3·16 detail-drawer(+ 16 msds-summary = 요약 있는 상태), 4·9·10 의 한 건 보기·짧은 폼 = 드로어
// - 드로어 폭 rules drawer_width · 본문을 밀어냄(사이드바 + 본문 + 드로어 = 1440, 겹치지 않음) · 화면 높이
// - 드로어 상태는 주소창에: 3 /reagents/[id]?{목록 쿼리} · 16 /msds/[id]?… · 4 /usage/new?reagent=[id]&… · 10 /usage?…&id= · 9 /vendors?form=
//   × · Esc = 목록 주소(쿼리 유지) · 새로고침 · 뒤로가기에도 같은 화면 · 열면 제목으로 포커스, 닫으면 연 곳으로
// - rules overlay: 모바일 바텀시트(필터 · MSDS 후보 · 위치)는 데스크톱에서 드롭다운·팝오버 — Esc 는 열린 팝오버 먼저
// - 쪽 번호: 한 쪽 = 시안 2-desktop 표 행 수
// - 폭 390 은 변경 없음 (각 테스트의 모바일 갈래)
// 계정: 공용 학교 A 학생·admin(보기만) + 일회용 학교(교사·admin — service role 은 준비·정리·대조에만, 판정 호출은 로그인 세션).
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { DESKTOP_SHELL } from "../desktop-shell";
import { desktopMigratedScreens } from "../frames";
import { openAs } from "./auth-state";
import {
  DRAWER,
  DRAWER_W,
  PAGE_SIZE,
  ROW,
  SIDEBAR_W,
  TABLE,
  boxOf,
  deskTable,
  drawer,
  drawerClose,
  drawerTitle,
  newFrame,
  pagination,
  tableRows,
  waitDrawer,
} from "./desk-helpers";
import { browserClient, devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { HAS_SERVICE, clientFor, openTemp, service } from "./screen-8-helpers";
import { NO_RESIDUE_69, cleanup, prepVendor, type Fx } from "./screen-6-9-helpers";
import { DOUBLE, makeFixture, prepCabinet, prepLayout, prepPlace, prepReagent, sharedCabinetSnapshot, type PrepReagent } from "./screen-11-helpers";
import { BULK_START, FIND, MSDS_BULK_BANNER, MSDS_CANDIDATES, interceptSearch } from "./msds-helpers";
import { dbHistory } from "./screen-10-helpers";

const GROUP = "c3runb";
type Overlay = { overlay: string };
const OVERLAY = (DESKTOP_SHELL as unknown as Overlay).overlay;
const MIGRATED = desktopMigratedScreens();
const REQ = DESKTOP_SHELL.desktop_required;

// ---------- 기대값: 새 프레임 ----------
const frameNode = (f: string, name: string) => {
  const n = newFrame(f).find((x) => x.name === name);
  if (!n) throw new Error(`새 프레임 ${f} 에 ${name} 없음`);
  return n;
};
/** 드로어가 열린 프레임의 본문 폭 (3-desktop main = 1440 − 사이드바 − 드로어) */
const MAIN_W = frameNode("3-desktop", "main").width!;
const FILTER_W = frameNode("2-filter-desktop", "list-filter-sheet").width!;
const PICKER_W = frameNode("3-location-desktop", "location-picker").width!;
const CAND3_W = frameNode("3-msds-desktop", MSDS_CANDIDATES).width!;
const BULK_W = frameNode("2-msds-bulk-desktop", MSDS_CANDIDATES).width!;
// drawer-nav 뒤로 = 시안 16-desktop (1.25 부터 4-desktop 은 본문 페이지 — rules desktop_shell.heavy_pages)
const BACK_LABEL = newFrame("16-desktop").find((n) => n.name === "label" && n.path.includes("back-link"))!.text!.characters;
const HEAVY = (DESKTOP_SHELL as unknown as { heavy_pages: number[] }).heavy_pages;
const VIEW_W = devRules.viewports.desktop[0];
const VIEW_H = devRules.viewports.desktop[1];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);
const pathOf = (screen: number, id: string) => routeOf(screen).replace(/\[[^\]]+\]/, id);

/** 주소 = 경로 + 쿼리(순서 무관) */
function expectAt(page: Page, path: string, query: Record<string, string>, what: string): void {
  const u = new URL(page.url());
  expect(u.pathname, `${what}: 경로`).toBe(path);
  expect(Object.fromEntries(u.searchParams), `${what}: 쿼리`).toEqual(query);
}
/** 링크 href = 경로 + 쿼리(순서 무관) */
async function expectHref(l: Locator, path: string, query: Record<string, string>, what: string): Promise<void> {
  const href = await l.getAttribute("href");
  expect(href, `${what}: href`).toBeTruthy();
  const u = new URL(href!, "http://x");
  expect(u.pathname, `${what}: href 경로`).toBe(path);
  expect(Object.fromEntries(u.searchParams), `${what}: href 쿼리`).toEqual(query);
}

async function hydrated(l: Locator): Promise<void> {
  await expect.poll(() => l.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__react"))), { message: "하이드레이션", timeout: 30_000 }).toBe(true);
}

/** 데스크톱 시약 목록 표가 그려지고 하이드레이션 */
async function waitDeskList(page: Page): Promise<Locator> {
  const t = deskTable(page);
  await expect(t, "시약 목록 data-table").toBeVisible({ timeout: 45_000 });
  await expect(page.locator(sel("nav-pill")), "하이드레이션 뒤 1440 nav-pill 0").toHaveCount(0, { timeout: 45_000 });
  const first = tableRows(t).first().locator("a[data-row-link], button[data-row-link]").first();
  if ((await tableRows(t).count()) > 0) await hydrated(first);
  return t;
}

/** 표 행 (대표 칸 글자 = name) */
const rowNamed = (t: Locator, name: string) => tableRows(t).filter({ has: t.page().getByText(name, { exact: true }) });
const rowLink = (row: Locator) => row.locator("a[data-row-link], button[data-row-link]").first();

/** 드로어 상자 검사: 폭 = drawer_width · 오른쪽 끝 = 화면 끝 · 위 0 · 화면 높이 · 사이드바와 본문 사이 = 시안 본문 폭 · 목록과 겹치지 않음 */
async function expectDrawerLayout(page: Page, list: Locator | null, what: string): Promise<void> {
  const d = await boxOf(drawer(page), `${what} 드로어`);
  expect(Math.round(d.width), `${what}: 드로어 폭 = rules drawer_width`).toBe(DRAWER_W);
  expect(Math.round(d.x + d.width), `${what}: 드로어 오른쪽 끝 = 화면 끝`).toBe(VIEW_W);
  expect(Math.round(d.y), `${what}: 드로어 위 = 0`).toBe(0);
  expect(Math.round(d.height), `${what}: 드로어 높이 = 화면 높이`).toBe(VIEW_H);
  const sb = await boxOf(page.locator(sel(DESKTOP_SHELL.component)), "사이드바");
  expect(Math.round(sb.width), `${what}: 사이드바 폭`).toBe(SIDEBAR_W);
  expect(Math.round(d.x - (sb.x + sb.width)), `${what}: 사이드바 ~ 드로어 사이 본문 = 시안 ${MAIN_W} (${SIDEBAR_W} + ${MAIN_W} + ${DRAWER_W})`).toBe(MAIN_W);
  if (list) {
    const l = await boxOf(list, `${what} 목록`);
    expect(l.x, `${what}: 목록은 사이드바 오른쪽`).toBeGreaterThanOrEqual(sb.x + sb.width - 0.5);
    expect(l.x + l.width, `${what}: 목록은 드로어 왼쪽 (밀어냄 — 겹치지 않음)`).toBeLessThanOrEqual(d.x + 0.5);
    const covered = await list.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60));
      return !!hit && el.contains(hit);
    });
    expect(covered, `${what}: 목록이 드로어에 덮이지 않음`).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${what}: 가로 스크롤 없음`).toBe(true);
  // 본문을 내려도 드로어는 화면에 고정 (sticky)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(Math.round((await boxOf(drawer(page), "드로어")).y), `${what}: 내려도 드로어 위 = 0`).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** 모바일(390): run b 데스크톱 컴포넌트 0 */
async function expectMobileUnchanged(page: Page, what: string): Promise<void> {
  await expect(page.locator(sel("nav-pill")), `${what}: 390 nav-pill 1`).toHaveCount(1, { timeout: 45_000 });
  await expect(page.locator(sel(TABLE)), `${what}: 390 ${TABLE} 0`).toHaveCount(0);
  await expect(page.locator(sel(DRAWER)), `${what}: 390 ${DRAWER} 0`).toHaveCount(0);
  await expect(page.locator(sel(DESKTOP_SHELL.component)), `${what}: 390 app-sidebar 0`).toHaveCount(0);
}

// =====================================================================
// 기대값 원본
// =====================================================================

test(`[C3][S*] 기대값 원본 (run b): desktop_migrated_screens ${MIGRATED.join("·")} · desktop_required ${Object.entries(REQ).map(([k, v]) => `${k}=${v.join("+")}`).join(" ")} · drawer_width ${DRAWER_W} · 본문 ${SIDEBAR_W}+${MAIN_W}+${DRAWER_W} · 한 쪽 ${PAGE_SIZE}행 · 팝오버 폭 ${FILTER_W}/${PICKER_W}/${CAND3_W}/${BULK_W} · overlay "드롭다운·팝오버"`, () => {
  // run b 화면 2·3·4·8·9·10·16 이 desktop_migrated_screens 에 들어 있다 (목록은 run 마다 늘어난다 — dev-rules 에서 읽는다, 1.13 = + 5·6·7·11·13)
  for (const s of [2, 3, 4, 8, 9, 10, 16]) expect(MIGRATED, `run b 화면 ${s} 이전됨 (dev-rules desktop_migrated_screens)`).toContain(s);
  // run d (dev-rules 1.14): desktop_migrated_screens = 1~16 전부 — 로그인 전 1·14·15 는 사이드바 셸(desktop_shell.screens)이 아니라
  // desktop_shell.pre_login.screens (web-header) 로 판정한다. 두 목록은 겹치지 않고, 이전 화면은 둘 중 하나에 든다.
  const preScreens = (DESKTOP_SHELL as unknown as { pre_login: { screens: number[] } }).pre_login.screens;
  for (const s of preScreens) expect(DESKTOP_SHELL.screens, `로그인 전 화면 ${s} 은 사이드바 셸 대상 아님`).not.toContain(s);
  for (const s of MIGRATED) {
    expect([...DESKTOP_SHELL.screens, ...preScreens], `이전 화면 ${s} 은 desktop_shell.screens 또는 pre_login.screens 안`).toContain(s);
  }
  for (const s of devRules.components[TABLE]) expect(MIGRATED, `data-table 화면 ${s} 이전됨`).toContain(s);
  for (const s of devRules.components[DRAWER]) expect(MIGRATED, `detail-drawer 화면 ${s} 이전됨`).toContain(s);
  expect(SIDEBAR_W + MAIN_W + DRAWER_W, "사이드바 + 본문 + 드로어 = 데스크톱 폭").toBe(VIEW_W);
  expect(frameNode("3-desktop", DRAWER).width).toBe(DRAWER_W);
  expect(frameNode("2-desktop", "main").width, "드로어 없는 목록 본문").toBe(VIEW_W - SIDEBAR_W);
  expect(PAGE_SIZE, "시안 2-desktop 표 행 수").toBe(10);
  expect(newFrame("2-desktop").filter((n) => n.name === "page-number").length, "시안 쪽 번호 여러 개").toBeGreaterThan(1);
  expect(OVERLAY, "rules overlay: 모바일 바텀시트는 데스크톱에서 드롭다운·팝오버").toMatch(/드롭다운/);
  expect(OVERLAY).toMatch(/팝오버/);
  for (const w of [FILTER_W, PICKER_W, CAND3_W, BULK_W]) expect(w, "팝오버 폭 < 본문").toBeLessThan(MAIN_W);
  expect(BACK_LABEL, "16 drawer-nav 뒤로").toBe("‹ 시약 상세");
  expect(HEAVY, "rules heavy_pages 에 4 (1.25 — 사용 기록 = 본문 페이지)").toContain(4);
  expect(devRules.components[DRAWER], "dev-rules detail-drawer 에 4 없음").not.toContain(4);
});

// =====================================================================
// desktop_required — 공용 학교 A (보기만)
// =====================================================================

/** 자기 학교 시약 (RLS) — MSDS 있는 것 우선 옵션 */
async function ownReagent(page: Page, withMsds = false): Promise<{ id: string; name: string } | null> {
  const { client } = await browserClient(page);
  let q = client.from("reagents").select("id, name, msds_url").order("id").limit(50);
  if (withMsds) q = q.not("msds_url", "is", null);
  const r = await q;
  expect(r.error, "자기 학교 시약 (RLS)").toBeNull();
  const row = (r.data ?? []).find((x) => !withMsds || String(x.msds_url ?? "").trim() !== "");
  return row ? { id: row.id as string, name: row.name as string } : null;
}

type ReqCase = { screen: number; role: "student" | "admin"; what: string };
const REQ_CASES: ReqCase[] = [
  { screen: 2, role: "student", what: "목록" },
  { screen: 3, role: "student", what: "시약 상세" },
  { screen: 4, role: "student", what: "사용 기록 입력" },
  { screen: 16, role: "student", what: "MSDS 요약" },
  { screen: 8, role: "admin", what: "사용자" },
  { screen: 9, role: "admin", what: "판매처 + 등록 드로어" },
  { screen: 10, role: "student", what: "기록 + 상세 드로어" },
];

for (const c of REQ_CASES) {
  const want = [...(REQ[String(c.screen)] ?? []), ...(devRules.components[DRAWER].includes(c.screen) && !(REQ[String(c.screen)] ?? []).includes(DRAWER) ? [DRAWER] : [])];
  test(`[C3][S${c.screen}] 학교A ${c.role === "admin" ? "admin" : "학생"} ${c.what}: 1440 = ${want.join(" · ")} 보임 (rules desktop_required${want.includes(DRAWER) && !(REQ[String(c.screen)] ?? []).includes(DRAWER) ? " + dev-rules detail-drawer" : ""}) · 모바일 전용 본문 0 / 390 = ${TABLE}·${DRAWER} 0 (변경 없음)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    expect(MIGRATED, `화면 ${c.screen} 은 run b 이전 화면`).toContain(c.screen);
    const { context, page, viewport } = await openAs(browser, info, c.role, 13);
    try {
      let path = routeOf(c.screen);
      if (c.screen === 3 || c.screen === 16 || c.screen === 4) {
        const r = await ownReagent(page, c.screen === 16);
        expect(r, `학교 A 시약${c.screen === 16 ? " (MSDS 있음)" : ""}`).not.toBeNull();
        path = c.screen === 4 ? `${routeOf(4)}?reagent=${r!.id}` : pathOf(c.screen, r!.id);
      }
      const res = await page.goto(path);
      expect(res?.status(), `${path} 응답`).toBe(200);
      await page.waitForLoadState("load");
      const where = `화면 ${c.screen} ${path} (${viewport})`;
      if (viewport === "mobile") {
        await expectMobileUnchanged(page, where);
        if (c.screen === 2) expect(await page.locator(sel("reagent-row")).count(), "390 reagent-row ≥ 1").toBeGreaterThan(0);
        if (c.screen === 3) await expect(page.locator(sel("reagent-detail-card")), "390 reagent-detail-card 1").toHaveCount(1);
        // 화면 4 (1.25 4-mobile): 전용 화면 = 담은 시약 카드 목록 (usage-batch-list 1 · ?reagent 의 시약 1행)
        if (c.screen === 4) {
          await expect(page.locator(sel("usage-batch-list")), "390 usage-batch-list 1").toHaveCount(1, { timeout: 45_000 });
          await expect(page.locator(sel("usage-item-row")), "390 담은 시약 1").toHaveCount(1);
        }
        return;
      }
      await expect(page.locator(sel("nav-pill")), `${where}: nav-pill 0`).toHaveCount(0, { timeout: 45_000 });
      if (c.screen === 9) {
        await expect(page.locator(`main ${sel(TABLE)}`).first(), `${where}: ${TABLE}`).toBeVisible({ timeout: 45_000 });
        await expect(drawer(page), "등록 폼 닫힘 → 드로어 0").toHaveCount(0);
        await page.goto(`${path}?form=new`);
        await waitDrawer(page);
        await expect(drawerTitle(page), "?form=new → 판매처 등록 드로어").toHaveText("판매처 등록");
      } else if (c.screen === 10) {
        await expect(page.locator(`main ${sel(TABLE)}`).first(), `${where}: ${TABLE}`).toBeVisible({ timeout: 45_000 });
        await expect(drawer(page), "상세 닫힘 → 드로어 0").toHaveCount(0);
        const rows = await dbHistory(page, {});
        expect(rows.length, "학교 A 최근 기록").toBeGreaterThan(0);
        await page.goto(`${path}?id=${rows[0].id}`);
        await waitDrawer(page);
        await expect(drawerTitle(page), "?id → 그 기록의 시약명").toHaveText(rows[0].reagent_name);
        await expect(page.locator(sel("ex-modal-card")), "1440 기록 상세 = 드로어 (모달 0)").toHaveCount(0);
      }
      for (const name of want) {
        if (c.screen === 16 && name === "msds-summary" && (await page.locator(sel(name)).count()) === 0) {
          // 요약 없음·실패 상태 (rules variants 16) — 요약 있는 상태는 아래 갤러리 테스트
          const v16 = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants["16"];
          const ok = await Promise.all(["no-summary", "fail"].map(async (k) => (await Promise.all(v16[k].map(async (n) => (await drawer(page).locator(sel(n)).count()) > 0))).every(Boolean)));
          expect(ok.some(Boolean), `${where}: msds-summary 없음 → 드로어가 variants 16 no-summary · fail 상태`).toBe(true);
          continue;
        }
        await expect(page.locator(sel(name)).first(), `${where}: ${name}`).toBeVisible({ timeout: 45_000 });
      }
      for (const m of ["reagent-row", "reagent-detail-card"]) await expect(page.locator(sel(m)), `${where}: 1440 모바일 전용 ${m} 0`).toHaveCount(0);
      if ([3, 16].includes(c.screen)) await expect(deskTable(page), `${where}: 드로어 뒤 시약 목록 ${TABLE}`).toBeVisible();
      if (HEAVY.includes(c.screen)) {
        // 본문 페이지 (rules heavy_pages): 드로어 0 · 표는 담은 시약 표(usage-batch-list 안) 하나
        await expect(drawer(page), `${where}: 본문 페이지 = ${DRAWER} 0`).toHaveCount(0);
        await expect(page.locator(`main ${sel(TABLE)}`), `${where}: ${TABLE} 1 (담은 시약 표)`).toHaveCount(1);
        await expect(page.locator(`main ${sel("usage-batch-list")} ${sel(TABLE)}`), `${where}: ${TABLE} 는 usage-batch-list 안`).toHaveCount(1);
      }
    } finally {
      await context.close();
    }
  });
}

test(`[C3][S16] /gallery: 요약 있는 상태의 msds-summary 보임 (desktop_required 16 — 실제 경로는 공단 키가 없어 요약 없음·실패 상태)`, async ({ page }, info) => {
  const res = await page.goto("/gallery");
  expect(res?.status()).toBe(200);
  await expect(page.locator(sel("msds-summary")).first(), "msds-summary").toBeVisible({ timeout: 30_000 });
  if ((info.project.name as ViewportName) === "desktop") expect(await page.locator(sel("ghs-pictogram")).count(), "요약 있는 상태 = 그림문자").toBeGreaterThan(0);
});

// =====================================================================
// 드로어 폭 · 본문 밀어냄 — 공용 학교 A (보기만)
// =====================================================================

type LayoutCase = { screen: number; role: "student" | "admin"; open: (page: Page) => Promise<string> };
const LAYOUTS: LayoutCase[] = [
  { screen: 3, role: "student", open: async (p) => pathOf(3, (await ownReagent(p))!.id) },
  // 화면 4 는 1.25 부터 본문 페이지(heavy_pages) — 드로어 배치 대상 아님 (위 REQ_CASES 4 에서 드로어 0 확인)
  { screen: 16, role: "student", open: async (p) => pathOf(16, (await ownReagent(p, true))!.id) },
  { screen: 10, role: "student", open: async (p) => `${routeOf(10)}?id=${(await dbHistory(p, {}))[0].id}` },
  { screen: 9, role: "admin", open: async () => `${routeOf(9)}?form=new` },
];
for (const c of LAYOUTS) {
  test(`[C3][S${c.screen}] 학교A 드로어 배치: 폭 ${DRAWER_W}(rules drawer_width) · 오른쪽 끝·화면 높이·위 0 고정 · ${SIDEBAR_W} + ${MAIN_W} + ${DRAWER_W} 으로 본문을 밀어냄(목록과 겹치지 않음) · 가로 스크롤 없음 / 390 = 드로어 0`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, viewport } = await openAs(browser, info, c.role, 13);
    try {
      const path = await c.open(page);
      await page.goto(path);
      await page.waitForLoadState("load");
      if (viewport === "mobile") {
        await expectMobileUnchanged(page, `화면 ${c.screen} ${path}`);
        return;
      }
      await waitDrawer(page);
      const list = page.locator(`main ${sel(TABLE)}`).first();
      await expect(list, "드로어 옆 목록").toBeVisible();
      await expectDrawerLayout(page, list, `화면 ${c.screen}`);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 화면 10 주소 규칙 — 공용 학교 A 학생 (보기만)
// =====================================================================

test(`[C3][S10] 학교A 학생 기록 상세 드로어 주소: 행 → ?id= (push) · 선택 행 data-selected · 제목 포커스 · Esc → id 없는 주소(다른 쿼리 유지)·포커스 행으로 · 새로고침 = 같은 드로어 · 뒤로가기 = 닫힘 · ?order=asc = 사용일 오름차순(aria-sort) 유지 / 390 = 모달`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "student", 10);
  try {
    const t0 = `${routeOf(10)}?mine=1`;
    await page.goto(t0);
    await page.waitForLoadState("load");
    if (viewport === "mobile") {
      await expectMobileUnchanged(page, "화면 10");
      return;
    }
    const table = page.locator(`main ${sel(TABLE)}`).first();
    await expect(table).toBeVisible({ timeout: 45_000 });
    const rows = await dbHistory(page, { mine: true });
    expect(rows.length, "학생 자기 기록 (최근 1개월)").toBeGreaterThan(0);
    const row = tableRows(table).first();
    const link = rowLink(row);
    await hydrated(link);
    await link.click();
    await page.waitForURL((u) => u.searchParams.has("id"));
    const id = new URL(page.url()).searchParams.get("id")!;
    expect(rows.map((r) => r.id), "?id = 그 기록 id").toContain(id);
    expectAt(page, routeOf(10), { mine: "1", id }, "열림");
    await waitDrawer(page);
    await expect(drawerTitle(page)).toHaveText(rows.find((r) => r.id === id)!.reagent_name);
    await expect(row, "선택 행").toHaveAttribute("data-selected", "true");
    await expect(drawerTitle(page), "열면 제목으로 포커스").toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer(page), "Esc → 닫힘").toHaveCount(0);
    expectAt(page, routeOf(10), { mine: "1" }, "Esc 뒤");
    await expect(link, "닫으면 포커스는 연 행으로").toBeFocused();
    // 새로고침 · 뒤로가기
    await link.click();
    await page.waitForURL((u) => u.searchParams.get("id") === id);
    await page.reload();
    await waitDrawer(page);
    await expect(drawerTitle(page), "새로고침 = 같은 드로어").toHaveText(rows.find((r) => r.id === id)!.reagent_name);
    expectAt(page, routeOf(10), { mine: "1", id }, "새로고침 뒤");
    await page.goBack();
    await page.waitForURL((u) => !u.searchParams.has("id"));
    await expect(drawer(page), "뒤로가기 → 닫힘").toHaveCount(0);
    // × (drawer-close) · "닫기"(button-outline) 도 같은 주소로
    await rowLink(tableRows(table).first()).click();
    await waitDrawer(page);
    await drawerClose(page).click();
    await expect(drawer(page), "× → 닫힘").toHaveCount(0);
    expectAt(page, routeOf(10), { mine: "1" }, "× 뒤");
    await rowLink(tableRows(table).first()).click();
    await waitDrawer(page);
    await drawer(page).locator(sel("button-outline")).filter({ hasText: exact("닫기") }).click();
    await expect(drawer(page), '"닫기" → 닫힘').toHaveCount(0);
    expectAt(page, routeOf(10), { mine: "1" }, '"닫기" 뒤');
    // 사용일 정렬 ?order=asc (새로고침에도)
    const head = table.locator("thead th").filter({ hasText: "사용일" });
    await expect(head).toHaveAttribute("aria-sort", "descending");
    await head.getByRole("button").click();
    await expect(head).toHaveAttribute("aria-sort", "ascending");
    expect(new URL(page.url()).searchParams.get("order"), "?order=asc").toBe("asc");
    await page.reload();
    await expect(page.locator(`main ${sel(TABLE)}`).first().locator("thead th").filter({ hasText: "사용일" }), "새로고침 뒤 오름차순").toHaveAttribute("aria-sort", "ascending");
  } finally {
    await context.close();
  }
});

test(`[C3][S10] 학교A 학생 기록 쪽 번호: 한 쪽 ${PAGE_SIZE}행(시안) · 쪽 수 = ⌈기록 수/${PAGE_SIZE}⌉ · 다른 쪽을 누르면 aria-current 이동·행 바뀜 / 390 = 쪽 번호 없음`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "student", 10);
  try {
    await page.goto(`${routeOf(10)}?period=all`);
    await page.waitForLoadState("load");
    const total = (await dbHistory(page, { period: "all" })).length;
    expect(total, "학교 A 전체 기록").toBeGreaterThan(0);
    if (viewport === "mobile") {
      await expectMobileUnchanged(page, "화면 10");
      await expect(pagination(page.locator("main")), "390 쪽 번호 0").toHaveCount(0);
      return;
    }
    const table = page.locator(`main ${sel(TABLE)}`).first();
    await expect(table).toBeVisible({ timeout: 45_000 });
    const shown = Math.min(total, 200);
    const pages = Math.ceil(shown / PAGE_SIZE);
    await expect(tableRows(table), "1쪽 행 수").toHaveCount(Math.min(PAGE_SIZE, shown));
    const nav = pagination(page.locator("main"));
    await expect(nav.locator('[aria-current="true"]')).toHaveText("1");
    const nums = (await nav.locator("button, a").allInnerTexts()).map((s) => Number(s.trim()));
    expect(Math.max(...nums), "마지막 쪽 번호").toBe(pages);
    if (pages > 1) {
      const firstName = await tableRows(table).first().innerText();
      await nav.getByRole("button", { name: "2", exact: true }).click();
      await expect(nav.locator('[aria-current="true"]'), "2쪽").toHaveText("2");
      await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
      await expect(tableRows(table), "2쪽 행 수").toHaveCount(Math.min(PAGE_SIZE, shown - PAGE_SIZE));
      expect(await tableRows(table).first().innerText(), "2쪽은 다른 행").not.toBe(firstName);
      expect(new URL(page.url()).searchParams.get("page"), "?page=2").toBe("2");
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// 일회용 학교 — 시약 목록 드로어 주소 · 포커스 · 팝오버 · 쪽 번호 · 판매처 드로어
// =====================================================================

type RunB = { f: Fx; items: PrepReagent[]; msds: PrepReagent; placed: PrepReagent; low: PrepReagent[]; prefix: string; vendor: { id: string; name: string } };
let cache: Promise<RunB> | null = null;
let beforeSnap: string[] | null = null;

const pad = (n: number) => String(n).padStart(2, "0");
async function prepRunB(info: TestInfo): Promise<RunB> {
  const f = await makeFixture(info, GROUP);
  const prefix = `가런비${Math.random().toString(36).slice(2, 6)}`;
  const items: PrepReagent[] = [];
  // 한 쪽(PAGE_SIZE) + 3 → 2쪽. 이름 = 같은 앞말 + 번호 (이름순 = 번호순)
  for (let i = 1; i <= PAGE_SIZE + 3; i++) items.push(await prepReagent(f, `r${i}`, 20, "g", "산화제", `${prefix}-${pad(i)}`));
  const teacher = await clientFor(f.teacher);
  const low = [items[1], items[PAGE_SIZE + 1]];
  for (const r of low) {
    const res = await teacher.rpc("set_reorder_threshold", { p_reagent_id: r.id, p_min_stock: 100 });
    expect(res.error, `준비: 재고 부족 기준 (${res.error?.message})`).toBeNull();
  }
  // MSDS 있는 시약 1 (공단 주소 아님 → 요약 없음 상태, 외부 호출 없음)
  const msds = items[2];
  const up = await service().from("reagents").update({ msds_url: "https://example.test/msds/c3-run-b.pdf" }).eq("id", msds.id).eq("school_id", f.school.id).select("id");
  expect(up.error, "준비: msds_url").toBeNull();
  expect(up.data ?? []).toHaveLength(1);
  // 시약장 1 + 칸 배치 1 (위치 바꾸기 팝오버)
  const cab = await prepCabinet(f);
  await prepLayout(f, cab.id, DOUBLE, 3, { L1: ["산화제"], R1: ["산"] });
  const placed = items[0];
  await prepPlace(f, placed.id, cab.id, "L1");
  const v = await prepVendor(f, { name: `${prefix}판매처`, contact: "043-000-0000" });
  return { f, items, msds, placed, low, prefix, vendor: { id: v.id, name: v.name } };
}
function runB(info: TestInfo): Promise<RunB> {
  cache ??= prepRunB(info);
  cache.catch(() => {
    cache = null;
  });
  return cache;
}

test.describe("일회용 학교 (run b 드로어·팝오버·쪽 번호)", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

  test.beforeAll(async () => {
    beforeSnap = await sharedCabinetSnapshot();
  });
  test.afterAll(async ({}, info) => {
    info.setTimeout(300_000);
    cache = null;
    const left = await cleanup(GROUP, info.project.name);
    expect(left, "일회용 계정·학교·시약·판매처 잔여물").toEqual(NO_RESIDUE_69);
    if (beforeSnap) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치가 그대로").toEqual(beforeSnap);
  });

  test(`[C3][S3] 일회용 교사 시약 상세 드로어 주소: 목록(?sort=stock&q=) 행 → /reagents/[id]?(같은 목록 쿼리) · 선택 행 · 제목 포커스 · × / Esc → /reagents?(쿼리 유지)·포커스는 연 행 · 새로고침 = 같은 드로어·검색어 유지 · 뒤로/앞으로 / 390 = 전용 화면`, async ({ browser }, info) => {
    test.setTimeout(420_000);
    const s = await runB(info);
    const q = s.prefix;
    const query = { sort: "stock", q };
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, `${routeOf(2)}?sort=stock&q=${encodeURIComponent(q)}`);
    try {
      if (viewport === "mobile") {
        await expectMobileUnchanged(page, "화면 2");
        await page.goto(pathOf(3, s.items[3].id));
        await expect(page.locator(sel("reagent-detail-card")), "390 시약 상세 = 카드 화면").toHaveCount(1, { timeout: 45_000 });
        await expectMobileUnchanged(page, "화면 3");
        return;
      }
      const t = await waitDeskList(page);
      const target = s.items[3];
      const row = rowNamed(t, target.name);
      await expect(row, `행 "${target.name}"`).toHaveCount(1);
      await expect(row).not.toHaveAttribute("data-selected", "true");
      const link = rowLink(row);
      await link.click();
      await page.waitForURL((u) => u.pathname === pathOf(3, target.id));
      expectAt(page, pathOf(3, target.id), query, "행 → 드로어");
      await waitDrawer(page);
      await expect(drawerTitle(page), "드로어 제목 = 시약명").toHaveText(target.name);
      await expect(row, "드로어에 열린 행 = 선택 행").toHaveAttribute("data-selected", "true");
      await expect(tableRows(t).filter({ has: page.locator('[data-selected="true"]') }).or(t.locator(`${sel(ROW)}[data-selected="true"]`)), "선택 행 1").toHaveCount(1);
      await expect(drawerTitle(page), "열면 제목으로 포커스").toBeFocused();
      await expectDrawerLayout(page, t, "화면 3 (일회용)");
      // Esc → 목록 주소 (쿼리 유지) · 포커스 복귀
      await page.keyboard.press("Escape");
      await page.waitForURL((u) => u.pathname === routeOf(2));
      expectAt(page, routeOf(2), query, "Esc 뒤");
      await expect(drawer(page), "Esc → 드로어 0").toHaveCount(0);
      await expect(link, "닫으면 포커스는 연 행 링크").toBeFocused();
      await expect(page.locator("main").getByPlaceholder("시약명 검색"), "검색어 유지").toHaveValue(q);
      // × 도 같은 주소
      await link.click();
      await waitDrawer(page);
      await expectHref(drawerClose(page), routeOf(2), query, "×");
      await drawerClose(page).click();
      await page.waitForURL((u) => u.pathname === routeOf(2));
      expectAt(page, routeOf(2), query, "× 뒤");
      await expect(drawer(page)).toHaveCount(0);
      // 새로고침 · 뒤로 · 앞으로
      await link.click();
      await page.waitForURL((u) => u.pathname === pathOf(3, target.id));
      await page.reload();
      await waitDrawer(page);
      await expect(drawerTitle(page), "새로고침 = 같은 드로어").toHaveText(target.name);
      expectAt(page, pathOf(3, target.id), query, "새로고침 뒤");
      await expect(page.locator("main").getByPlaceholder("시약명 검색"), "새로고침 뒤 목록 검색어").toHaveValue(q);
      await expect(rowNamed(deskTable(page), target.name), "새로고침 뒤 선택 행").toHaveAttribute("data-selected", "true");
      await page.goBack();
      await page.waitForURL((u) => u.pathname === routeOf(2));
      await expect(drawer(page), "뒤로가기 → 닫힘").toHaveCount(0);
      expectAt(page, routeOf(2), query, "뒤로가기 뒤");
      await page.goForward();
      await page.waitForURL((u) => u.pathname === pathOf(3, target.id));
      await waitDrawer(page);
      await expect(drawerTitle(page), "앞으로가기 → 다시 열림").toHaveText(target.name);
      // 다른 행을 누르면 같은 드로어가 그 시약으로 (주소도)
      const other = s.items[4];
      await rowLink(rowNamed(deskTable(page), other.name)).click();
      await page.waitForURL((u) => u.pathname === pathOf(3, other.id));
      await expect(drawerTitle(page), "다른 행 → 그 시약").toHaveText(other.name);
      await expect(drawer(page)).toHaveCount(1);
      expectAt(page, pathOf(3, other.id), query, "다른 행");
    } finally {
      await context.close();
    }
  });

  test(`[C3][S4] [C3][S16] 일회용 교사 드로어·본문 페이지 이동: 3 "사용 기록" → /usage/new?reagent=[id]&(목록 쿼리) = 본문 페이지(드로어 0 · 그 시약 담김, heavy_pages) · 3 "MSDS 보기" → /msds/[id]?(쿼리) · 16 drawer-nav "${BACK_LABEL}" → /reagents/[id]?(쿼리) · 16 × → /reagents?(쿼리) / 390 = 전용 화면`, async ({ browser }, info) => {
    test.setTimeout(420_000);
    const s = await runB(info);
    const query = { filter: "low-stock", q: s.prefix };
    const listUrl = `${routeOf(2)}?filter=low-stock&q=${encodeURIComponent(s.prefix)}`;
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, listUrl);
    try {
      if (viewport === "mobile") {
        await expectMobileUnchanged(page, "화면 2");
        await page.goto(`${routeOf(4)}?reagent=${s.msds.id}`);
        await expectMobileUnchanged(page, "화면 4");
        return;
      }
      const t = await waitDeskList(page);
      await expect(tableRows(t), "재고 부족 + 검색 = 부족 시약 2").toHaveCount(s.low.length);
      // 3 → 4 (본문 페이지)
      const r = s.low[0];
      await rowLink(rowNamed(t, r.name)).click();
      await waitDrawer(page);
      const usage = drawer(page).getByRole("link", { name: "사용 기록", exact: true });
      await expectHref(usage, routeOf(4), { reagent: r.id, ...query }, '3 "사용 기록"');
      await usage.click();
      await page.waitForURL((u) => u.pathname === routeOf(4));
      expectAt(page, routeOf(4), { reagent: r.id, ...query }, "4 열림");
      const batch = page.locator(`main ${sel("usage-batch-list")}`);
      await expect(batch, "4 = 본문 페이지의 담은 시약 목록").toHaveCount(1, { timeout: 45_000 });
      await expect(drawer(page), "4 = 본문 페이지 (드로어 0)").toHaveCount(0);
      await expect(batch.locator(sel("usage-item-row")), "그 시약이 담긴 채 시작").toHaveCount(1);
      await expect(batch.locator(sel("usage-item-row")).first()).toContainText(r.name);
      await expect(page.locator(`main ${sel(TABLE)}`), "4: 시약 목록 표 없음 (담은 시약 표 1)").toHaveCount(1);
      // 3 → 16 (MSDS 있는 시약 — 목록 쿼리 없이 q 만)
      const q2 = { q: s.msds.name };
      await page.goto(`${pathOf(3, s.msds.id)}?q=${encodeURIComponent(s.msds.name)}`);
      await waitDrawer(page);
      const view = drawer(page).getByRole("link", { name: /MSDS 보기/ });
      await expect(view, '3 "MSDS 보기"').toHaveCount(1);
      await expectHref(view, pathOf(16, s.msds.id), q2, '3 "MSDS 보기"');
      await view.click();
      await page.waitForURL((u) => u.pathname === pathOf(16, s.msds.id));
      await waitDrawer(page);
      await expect(drawerTitle(page), "16 제목에 시약명").toContainText(s.msds.name);
      await expectDrawerLayout(page, deskTable(page), "화면 16");
      const back16 = drawer(page).getByRole("link", { name: BACK_LABEL, exact: true });
      await expectHref(back16, pathOf(3, s.msds.id), q2, "16 뒤로");
      await expectHref(drawerClose(page), routeOf(2), q2, "16 ×");
      await expect(drawer(page).locator(sel("msds-original-link")), "16 요약 없음 상태 = 원문 보기 (variants 16 no-summary)").toHaveCount(1);
      await page.keyboard.press("Escape");
      await page.waitForURL((u) => u.pathname === routeOf(2));
      expectAt(page, routeOf(2), q2, "16 Esc 뒤");
    } finally {
      await context.close();
    }
  });

  test(`[C3][S3] 일회용 교사 Esc 순서 · 위치 바꾸기 = 드로어 왼쪽 팝오버(폭 ${PICKER_W}, 바텀시트 아님): 피커 Esc → 피커만 닫힘(주소·드로어 그대로) → 다시 Esc → 드로어 닫힘 / 390 = 하단 시트(전폭)`, async ({ browser }, info) => {
    test.setTimeout(420_000);
    const s = await runB(info);
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, pathOf(3, s.placed.id));
    try {
      const edit = page.locator(`main ${sel("location-edit")}`).getByRole("button");
      const picker = page.locator(sel("location-picker"));
      if (viewport === "mobile") {
        await expect(page.locator(sel("reagent-detail-card"))).toHaveCount(1, { timeout: 45_000 });
        await hydrated(edit);
        await edit.click();
        await expect(picker).toBeVisible();
        expect(Math.round((await boxOf(picker, "피커")).width), "390 피커 = 전폭 하단 시트").toBe(devRules.viewports.mobile[0]);
        return;
      }
      await waitDrawer(page);
      await hydrated(edit);
      await edit.click();
      await expect(picker, "피커 열림").toBeVisible();
      const p = await boxOf(picker, "피커");
      const d = await boxOf(drawer(page), "드로어");
      expect(Math.abs(p.width - PICKER_W), `피커 폭 = 시안 3-location-desktop ${PICKER_W}`).toBeLessThanOrEqual(1);
      expect(p.x + p.width, "피커는 드로어 왼쪽").toBeLessThanOrEqual(d.x + 1);
      expect(p.x, "피커는 사이드바 오른쪽").toBeGreaterThanOrEqual(SIDEBAR_W - 1);
      expect(p.y, "화면 안").toBeGreaterThanOrEqual(0);
      expect(p.y + p.height, "화면 안 (바텀시트 아님)").toBeLessThanOrEqual(VIEW_H + 1);
      expect(p.width, "전폭 아님").toBeLessThan(VIEW_W / 2);
      const titleSeen = await drawerTitle(page).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
        return !!hit && el.contains(hit);
      });
      expect(titleSeen, "드로어 제목은 덮이지 않음").toBe(true);
      const url = page.url();
      await page.keyboard.press("Escape");
      await expect(picker, "Esc → 피커 닫힘").toHaveCount(0);
      await expect(drawer(page), "드로어는 그대로").toHaveCount(1);
      expect(page.url(), "주소 그대로").toBe(url);
      await page.keyboard.press("Escape");
      await page.waitForURL((u) => u.pathname === routeOf(2));
      await expect(drawer(page), "두 번째 Esc → 드로어 닫힘").toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test(`[C3][S3] 일회용 교사 MSDS 없는 시약 "${FIND}" → msds-candidates = 드로어 왼쪽 팝오버(폭 ${CAND3_W}) · Esc 는 팝오버 먼저 · 저장 요청 0 / 390 = 하단 시트`, async ({ browser }, info) => {
    test.setTimeout(420_000);
    const s = await runB(info);
    const target = s.items[5];
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, pathOf(3, target.id));
    const route = await interceptSearch(page);
    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && !new URL(r.url()).pathname.startsWith("/_next")) writes.push(r.url());
    });
    try {
      const find = page.locator(`main ${sel("msds-search")}`).filter({ hasText: exact(FIND) }).first();
      const cand = page.locator(sel(MSDS_CANDIDATES));
      if (viewport !== "mobile") await waitDrawer(page);
      else await expect(page.locator(sel("reagent-detail-card"))).toHaveCount(1, { timeout: 45_000 });
      await hydrated(find);
      await find.click();
      await expect(cand, "후보 열림").toBeVisible({ timeout: 30_000 });
      expect(route.queries.length, "검색 요청 (가로챔)").toBeGreaterThan(0);
      const c = await boxOf(cand, "후보");
      if (viewport === "mobile") {
        expect(Math.round(c.width), "390 후보 = 전폭 하단 시트").toBe(devRules.viewports.mobile[0]);
        return;
      }
      const d = await boxOf(drawer(page), "드로어");
      expect(Math.abs(c.width - CAND3_W), `후보 폭 = 시안 3-msds-desktop ${CAND3_W}`).toBeLessThanOrEqual(1);
      expect(c.x + c.width, "후보는 드로어 왼쪽").toBeLessThanOrEqual(d.x + 1);
      expect(c.y + c.height, "화면 안").toBeLessThanOrEqual(VIEW_H + 1);
      await page.keyboard.press("Escape");
      await expect(cand, "Esc → 후보 닫힘").toHaveCount(0);
      await expect(drawer(page), "드로어 그대로").toHaveCount(1);
      expect(writes.filter((u) => !u.includes("/api/msds/search")), "저장 요청 0").toEqual([]);
    } finally {
      await context.close();
    }
  });

  test(`[C3][S2] 일회용 교사 목록 팝오버: 필터 = list-filter-button 아래 드롭다운(폭 ${FILTER_W}) · ${MSDS_BULK_BANNER} "${BULK_START}" → msds-candidates 팝오버(폭 ${BULK_W}) — 바텀시트 아님 · Esc 로 닫힘(드로어 열린 채면 팝오버 먼저) / 390 = 하단 시트`, async ({ browser }, info) => {
    test.setTimeout(420_000);
    const s = await runB(info);
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, `${routeOf(2)}?q=${encodeURIComponent(s.prefix)}&nomsds=1`);
    await interceptSearch(page);
    try {
      const btn = page.locator(`main ${sel("list-filter-button")}`).first();
      const sheet = page.locator(sel("list-filter-sheet"));
      if (viewport === "mobile") {
        await expect(page.locator(sel("reagent-row")).first()).toBeVisible({ timeout: 45_000 });
        await hydrated(btn);
        await btn.click();
        await expect(sheet).toBeVisible();
        expect(Math.round((await boxOf(sheet, "필터")).width), "390 필터 = 전폭 하단 시트").toBe(devRules.viewports.mobile[0]);
        return;
      }
      const t = await waitDeskList(page);
      await hydrated(btn);
      await btn.click();
      await expect(sheet, "필터 열림").toBeVisible();
      const b = await boxOf(btn, "필터 버튼");
      const f = await boxOf(sheet, "필터 팝오버");
      expect(Math.abs(f.width - FILTER_W), `필터 폭 = 시안 2-filter-desktop ${FILTER_W}`).toBeLessThanOrEqual(1);
      expect(f.y, "버튼 바로 아래로 내려옴").toBeGreaterThanOrEqual(b.y + b.height - 1);
      expect(f.y - (b.y + b.height), "버튼 바로 아래 (≤ 16)").toBeLessThanOrEqual(16);
      expect(f.x < b.x + b.width && b.x < f.x + f.width, "버튼과 가로로 겹침 (드롭다운)").toBe(true);
      expect(f.x + f.width, "화면 안").toBeLessThanOrEqual(VIEW_W + 1);
      expect(f.x, "사이드바를 덮지 않음").toBeGreaterThanOrEqual(SIDEBAR_W - 1);
      await page.keyboard.press("Escape");
      await expect(sheet, "Esc → 필터 닫힘").toHaveCount(0);
      // 드로어가 열린 채 필터: Esc 는 필터 먼저
      await rowLink(tableRows(t).first()).click();
      await waitDrawer(page);
      await btn.click();
      await expect(sheet).toBeVisible();
      const url = page.url();
      await page.keyboard.press("Escape");
      await expect(sheet, "Esc → 필터 먼저 닫힘").toHaveCount(0);
      await expect(drawer(page), "드로어 그대로").toHaveCount(1);
      expect(page.url(), "주소 그대로").toBe(url);
      await page.keyboard.press("Escape");
      await expect(drawer(page), "다음 Esc → 드로어").toHaveCount(0);
      // MSDS 일괄 찾기 팝오버
      const banner = page.locator(`main ${sel(MSDS_BULK_BANNER)}`);
      await expect(banner, "MSDS 없는 시약 띠 (교사, ?nomsds=1)").toBeVisible();
      await banner.getByRole("button", { name: exact(BULK_START) }).click();
      const cand = page.locator(sel(MSDS_CANDIDATES));
      await expect(cand, "일괄 후보 열림").toBeVisible({ timeout: 30_000 });
      const c = await boxOf(cand, "일괄 후보");
      expect(Math.abs(c.width - BULK_W), `일괄 후보 폭 = 시안 2-msds-bulk-desktop ${BULK_W}`).toBeLessThanOrEqual(1);
      expect(c.width, "전폭 아님").toBeLessThan(VIEW_W / 2);
      expect(c.x, "본문 안").toBeGreaterThanOrEqual(SIDEBAR_W - 1);
      expect(c.y + c.height, "화면 안 (바텀시트 아님)").toBeLessThanOrEqual(VIEW_H + 1);
    } finally {
      await context.close();
    }
  });

  test(`[C3][S2] 일회용 교사 쪽 번호: 시약 ${PAGE_SIZE + 3}종 → 1쪽 ${PAGE_SIZE}행 · 쪽 [1, 2] · 2쪽 3행 · ?page=2 (새로고침 유지) · 2쪽 행 드로어 닫기 → /reagents?page=2 · 범위(재고 부족)를 바꾸면 1쪽부터 / 390 = 쪽 번호 없음(전체 목록)`, async ({ browser }, info) => {
    test.setTimeout(420_000);
    const s = await runB(info);
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, routeOf(2));
    try {
      if (viewport === "mobile") {
        await expect(page.locator(sel("reagent-row")).first()).toBeVisible({ timeout: 45_000 });
        await expect(page.locator(sel("reagent-row")), "390 = 전체 목록").toHaveCount(s.items.length);
        await expect(pagination(page.locator("main")), "390 쪽 번호 0").toHaveCount(0);
        return;
      }
      const t = await waitDeskList(page);
      const names = s.items.map((r) => r.name);
      await expect(tableRows(t), `1쪽 ${PAGE_SIZE}행`).toHaveCount(PAGE_SIZE);
      expect((await tableRows(t).locator("td:first-child").allInnerTexts()).map((x) => x.trim()), "1쪽 = 이름순 앞 10").toEqual(names.slice(0, PAGE_SIZE));
      const nav = pagination(page.locator("main"));
      expect((await nav.locator("button, a").allInnerTexts()).map((x) => x.trim()), "쪽 번호").toEqual(["1", "2"]);
      await expect(nav.locator('[aria-current="true"]')).toHaveText("1");
      await nav.getByRole("button", { name: "2", exact: true }).click();
      await expect(nav.locator('[aria-current="true"]'), "2쪽").toHaveText("2");
      await expect(tableRows(t), "2쪽 3행").toHaveCount(3);
      expect((await tableRows(t).locator("td:first-child").allInnerTexts()).map((x) => x.trim())).toEqual(names.slice(PAGE_SIZE));
      expectAt(page, routeOf(2), { page: "2" }, "2쪽");
      await page.reload();
      const t2 = await waitDeskList(page);
      await expect(pagination(page.locator("main")).locator('[aria-current="true"]'), "새로고침 뒤 2쪽").toHaveText("2");
      await expect(tableRows(t2)).toHaveCount(3);
      const r = s.items[PAGE_SIZE];
      await rowLink(rowNamed(t2, r.name)).click();
      await page.waitForURL((u) => u.pathname === pathOf(3, r.id));
      expectAt(page, pathOf(3, r.id), { page: "2" }, "2쪽 행 → 드로어");
      await waitDrawer(page);
      await page.keyboard.press("Escape");
      await page.waitForURL((u) => u.pathname === routeOf(2));
      expectAt(page, routeOf(2), { page: "2" }, "닫기 → 2쪽 목록");
      await expect(pagination(page.locator("main")).locator('[aria-current="true"]')).toHaveText("2");
      // 범위 바꾸기 → page 없음
      await page.locator(`main ${sel("segmented-control")}`).getByRole("tab", { name: "재고 부족" }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("filter")).toBe("low-stock");
      expect(new URL(page.url()).searchParams.get("page"), "범위를 바꾸면 1쪽부터").toBeNull();
      await expect(tableRows(deskTable(page)), "재고 부족 2").toHaveCount(s.low.length);
    } finally {
      await context.close();
    }
  });

  test(`[C3][S9] 일회용 admin 판매처 드로어 주소: "판매처 등록" → ?form=new · 행 더보기 "수정" → ?form=[id](기존 값) · × / Esc / "취소" → form 없는 주소 · 새로고침 = 같은 드로어 · 뒤로가기 = 닫힘 · 저장 요청 0 / 390 = 하단 시트`, async ({ browser }, info) => {
    test.setTimeout(420_000);
    const s = await runB(info);
    const { context, page, viewport } = await openTemp(browser, info, s.f.admin, routeOf(9));
    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && !new URL(r.url()).pathname.startsWith("/_next")) writes.push(r.url());
    });
    try {
      if (viewport === "mobile") {
        await expectMobileUnchanged(page, "화면 9");
        return;
      }
      const t = page.locator(`main ${sel(TABLE)}`).first();
      await expect(t).toBeVisible({ timeout: 45_000 });
      const register = page.locator(`main ${sel("vendor-register")}`).getByRole("button", { name: "판매처 등록" });
      await hydrated(register);
      await register.click();
      await expect.poll(() => new URL(page.url()).searchParams.get("form"), { message: "?form=new" }).toBe("new");
      await waitDrawer(page);
      await expect(drawerTitle(page)).toHaveText("판매처 등록");
      await expect(drawerTitle(page), "제목 포커스").toBeFocused();
      await expectDrawerLayout(page, t, "화면 9 등록");
      await page.keyboard.press("Escape");
      await expect(drawer(page), "Esc → 닫힘").toHaveCount(0);
      expectAt(page, routeOf(9), {}, "Esc 뒤");
      await expect(register, "포커스는 연 버튼으로").toBeFocused();
      // 수정
      const row = tableRows(t).filter({ hasText: s.vendor.name });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: /더보기/ }).click();
      await page.getByRole("menuitem", { name: "수정", exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("form"), { message: "?form=id" }).toBe(s.vendor.id);
      await waitDrawer(page);
      await expect(drawerTitle(page)).toHaveText("판매처 수정");
      await expect(drawer(page).getByLabel("판매처명", { exact: true }), "기존 값").toHaveValue(s.vendor.name);
      await expect(row, "수정 중인 행 = 선택 행").toHaveAttribute("data-selected", "true");
      await page.reload();
      await waitDrawer(page);
      await expect(drawerTitle(page), "새로고침 = 같은 수정 드로어").toHaveText("판매처 수정");
      await expect(drawer(page).getByLabel("판매처명", { exact: true })).toHaveValue(s.vendor.name);
      await drawerClose(page).click();
      await expect(drawer(page), "× → 닫힘").toHaveCount(0);
      expectAt(page, routeOf(9), {}, "× 뒤");
      await page.goBack();
      await expect.poll(() => new URL(page.url()).searchParams.get("form"), { message: "뒤로가기 → 직전 드로어 주소" }).toBe(s.vendor.id);
      await waitDrawer(page);
      await drawer(page).locator(sel("button-outline")).filter({ hasText: exact("취소") }).click();
      await expect(drawer(page), '"취소" → 닫힘').toHaveCount(0);
      expectAt(page, routeOf(9), {}, '"취소" 뒤');
      expect(writes, "저장 요청 0").toEqual([]);
    } finally {
      await context.close();
    }
  });
});
