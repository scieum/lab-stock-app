// 화면 2g (둘러보기 시약 목록, dev-rules.json routes["2-guest"]) — 비로그인 컨텍스트.
// 규칙: GM-ui (d5 §GM, rules.json guest) · C1 (목록 = anon 데모 reagents, 행 링크 = routes["3-guest"], ?filter=low-stock) · C2 · N1-ui · V1
// 기대값은 design/rules.json · harness/dev-rules.json 에서 읽는다. 데이터는 anon 클라이언트(RLS).
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { PAGE_SIZE, ROW as DESK_ROW, TABLE, isDeskPage, pagination, waitWidthSettled } from "./desk-helpers";
import { openAs } from "./auth-state";
import { countComponent, routeOf, rules, seedRows, sel } from "./screen-helpers";
import {
  GUEST,
  checkBanner,
  checkHidden,
  checkLocksAreButtons,
  checkSchoolName,
  checkTabBar,
  clickAllLocks,
  demoReagents,
  demoSchool,
  guestDetailPath,
  guestRouteOf,
  openGuest,
  waitGuestShell,
} from "./guest-helpers";

const SCREEN = 2;
const TAG = `S${SCREEN}g`;
const ROW = "reagent-row";
const BADGE = "badge-low-stock";

async function waitList(page: Page): Promise<void> {
  await waitGuestShell(page);
  await expect(page.locator(sel("segmented-control")).first()).toBeVisible({ timeout: 30_000 });
  await waitWidthSettled(page);
}

/**
 * 목록 행: 390 = reagent-row / 1440 = data-table 행 (d7 §23 run d 세부: 2g = data-table + 드로어, 시안 2-guest-desktop — 한 쪽 PAGE_SIZE 행)
 */
const rowsOf = (page: Page) => (isDeskPage(page) ? page.locator(`main ${sel(TABLE)} ${sel(DESK_ROW)}`) : page.locator(sel(ROW)));
/** 1440 행 링크 (행 첫 칸 a[href]) */
const rowLink = (row: Locator) => row.locator("a[href]").first();

type ShownRow = { href: string | null; badges: number; text: string };

async function readRows(page: Page): Promise<ShownRow[]> {
  if (isDeskPage(page)) return readDeskRows(page);
  const rows = page.locator(sel(ROW));
  const out: ShownRow[] = [];
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const raw = await row.getAttribute("href");
    out.push({
      href: raw === null ? null : new URL(raw, "http://x").pathname,
      badges: await row.locator(sel(BADGE)).count(),
      text: await row.innerText(),
    });
  }
  return out;
}

/** 1440: 쪽 번호를 하나씩 눌러 모든 쪽의 행을 모은다 (각 쪽 행 수 ≤ PAGE_SIZE) */
async function readDeskRows(page: Page): Promise<ShownRow[]> {
  const pager = pagination(page.locator("main"));
  const pages = (await pager.count()) > 0 ? await pager.getByRole("button").count() : 1;
  const out: ShownRow[] = [];
  for (let p = 0; p < pages; p++) {
    if (p > 0) {
      await pager.getByRole("button", { name: String(p + 1), exact: true }).click();
      await expect(pager.locator(`[aria-current="true"]`), `${p + 1}쪽`).toHaveText(String(p + 1));
    }
    const rows = rowsOf(page);
    const n = await rows.count();
    expect(n, `${p + 1}쪽 행 수 ≤ 한 쪽 ${PAGE_SIZE}`).toBeLessThanOrEqual(PAGE_SIZE);
    if (p < pages - 1) expect(n, `${p + 1}쪽(마지막 아님) 행 수 = ${PAGE_SIZE}`).toBe(PAGE_SIZE);
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const raw = await rowLink(row).getAttribute("href");
      out.push({ href: raw === null ? null : new URL(raw, "http://x").pathname, badges: await row.locator(sel(BADGE)).count(), text: await row.innerText() });
    }
  }
  if (pages > 1) {
    await pager.getByRole("button", { name: "1", exact: true }).click();
    await expect(pager.locator(`[aria-current="true"]`)).toHaveText("1");
  }
  return out;
}

test(`[GM-ui][${TAG}] rules.json guest.screens 에 화면 ${SCREEN} · routes ${SCREEN}-guest 있음 · 쓰기 잠금 대상 아님(write_lock_screens)`, () => {
  expect(GUEST.screens, "guest.screens").toContain(SCREEN);
  expect(guestRouteOf(SCREEN)).toBeTruthy();
  expect(GUEST.write_lock_screens, `화면 ${SCREEN} 은 읽기 전용 목록 — 쓰기 잠금 대상 아님`).not.toContain(SCREEN);
});

// ---------- GM-ui ----------
test(`[GM-ui][${TAG}] 둘러보기 시약 목록: guest-banner 1(가입 → 회원가입 경로) · hidden_components 0 · 학교명 = guest.school_name 만`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, response } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    expect(response?.status(), "응답 200").toBe(200);
    await waitList(page);
    await expect(rowsOf(page).first(), "양성 대조: 시약 행이 그려짐").toBeVisible({ timeout: 30_000 });
    await checkBanner(page);
    await checkHidden(page);
    await checkSchoolName(page, await response!.text());
  } finally {
    await context.close();
  }
});

test(`[GM-ui][C2][${TAG}] 둘러보기 시약 목록 탭바 = rules.json tab_bar + guest (390: 1·${rules.tab_bar.items}개·라벨 순서·잠금 ${GUEST.tab_locks}=${GUEST.locked_tabs.join("·")}, 1440: 0)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitList(page);
    await checkTabBar(page, viewport, SCREEN);
  } finally {
    await context.close();
  }
});

test(`[GM-ui][${TAG}] 둘러보기 시약 목록 잠금(탭·nav): 보이는 잠금 전부 클릭 → ex-toast · 경로 유지 · non-GET 요청 0 · 본문에 쓰기 진입점 없음`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitList(page);
    // 목록은 읽기 전용 — 본문(main) 안에 잠금·버튼형 쓰기 진입점이 없다 (검색 입력·필터만)
    expect(await page.locator(`main ${sel(GUEST.lock)}`).count(), `본문 안 ${GUEST.lock} 0 (목록은 쓰기 동작 없음)`).toBe(0);
    expect(await page.locator(`main ${sel("button-primary")}`).count(), "본문 안 button-primary 0").toBe(0);
    await checkLocksAreButtons(page);
    const clicked = await clickAllLocks(page);
    // 390: 탭바 잠금 tab_locks 개 / 1440: 사이드바 잠금 guest.sidebar_locks 개 (기록·QR 찾기, rules guest.desktop)
    const want = isDeskPage(page) ? (GUEST as unknown as { sidebar_locks: number }).sidebar_locks : GUEST.tab_locks;
    expect(clicked, `보이는 잠금 호스트 수 = ${isDeskPage(page) ? "guest.sidebar_locks" : "guest.tab_locks"} ${want}`).toBe(want);
  } finally {
    await context.close();
  }
});

// ---------- C1 ----------
test(`[C1][${TAG}] 둘러보기 시약 목록: 행 수·행 링크(routes["3-guest"])·${BADGE}(stock<min_stock 행만) 가 anon 데모 reagents 와 일치`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const db = await demoReagents();
  const { context, page } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitList(page);
    const firstPage = isDeskPage(page) ? Math.min(PAGE_SIZE, db.length) : db.length;
    await expect(rowsOf(page), `${isDeskPage(page) ? `1440 첫 쪽 ${DESK_ROW}` : ROW} 수 = ${firstPage} (데모 reagents ${db.length}행)`).toHaveCount(firstPage, { timeout: 15_000 });
    const shown = await readRows(page);
    expect(shown.length, `모든 쪽 행 수 = 데모 reagents ${db.length}행`).toBe(db.length);
    const byHref = new Map(db.map((r) => [guestDetailPath(r.id), r]));
    expect(shown.map((s) => s.href).sort(), "행 링크 = 둘러보기 상세 경로 (데모 id 집합)").toEqual([...byHref.keys()].sort());
    for (const s of shown) {
      const r = byHref.get(s.href ?? "")!;
      expect(s.text, `행 ${s.href} 에 시약명 ${r.name}`).toContain(r.name);
      expect(s.badges, `${r.name} (${r.low ? "부족" : "충분"}) 행 안 ${BADGE}`).toBe(r.low ? 1 : 0);
    }
    const lowN = db.filter((r) => r.low).length;
    expect(lowN, "데모 학교에 재고 부족 시약이 있어야 배지 검사가 의미 있음").toBeGreaterThan(0);
    if (isDeskPage(page)) expect(shown.reduce((a, s) => a + s.badges, 0), `모든 쪽 ${BADGE} = 부족 행 ${lowN}개`).toBe(lowN);
    else expect(await countComponent(page, BADGE), `화면 전체 ${BADGE} = 부족 행 ${lowN}개`).toBe(lowN);
  } finally {
    await context.close();
  }
});

test(`[C1][${TAG}] 둘러보기 시약 목록 ?filter=low-stock: 재고 부족 데모 시약 행만`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const db = await demoReagents();
  const low = db.filter((r) => r.low);
  expect(low.length, "데모 학교에 재고 부족 시약이 있어야 함").toBeGreaterThan(0);
  const { context, page } = await openGuest(browser, info, `${guestRouteOf(SCREEN)}?filter=low-stock`);
  try {
    await waitList(page);
    await expect(rowsOf(page), `부족 필터 행 수 = ${low.length}`).toHaveCount(Math.min(low.length, isDeskPage(page) ? PAGE_SIZE : low.length), { timeout: 15_000 });
    const shown = await readRows(page);
    expect(shown.map((s) => s.href).sort(), "부족 필터 행 = 부족 시약 id 집합").toEqual(low.map((r) => guestDetailPath(r.id)).sort());
    for (const s of shown) expect(s.badges, `부족 필터 행 ${s.href} 안 ${BADGE}`).toBe(1);
    const text = await page.locator("main").innerText();
    for (const r of db.filter((x) => !x.low)) {
      if (low.some((l) => l.name.includes(r.name))) continue;
      expect(text, `부족 아닌 ${r.name} 은 부족 필터에 없음`).not.toContain(r.name);
    }
  } finally {
    await context.close();
  }
});

// ---------- N1-ui ----------
test(`[N1-ui][${TAG}] 둘러보기 시약 목록에 실제 학교 시약명(seed) 미노출 · 데모 학교명만`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const demo = await demoSchool();
  const demoNames = (await demoReagents()).map((r) => r.name);
  const realReagents = seedRows("reagents").map((r) => r.name);
  expect(realReagents.length, "seed 실제 학교 시약").toBeGreaterThan(0);
  const { context, page, response } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitList(page);
    await expect(rowsOf(page).first()).toBeVisible({ timeout: 30_000 });
    const body = await page.locator("body").innerText();
    const html = await response!.text();
    expect(body, "데모 학교명 표시").toContain(demo.name);
    for (const n of realReagents) {
      if (demoNames.some((d) => d.includes(n))) continue; // 데모 시약명의 부분 문자열이면 판정 불가
      expect(body, `실제 학교 시약명 ${n} (화면)`).not.toContain(n);
      expect(html, `실제 학교 시약명 ${n} (응답 본문)`).not.toContain(n);
    }
  } finally {
    await context.close();
  }
});

test(`[N1-ui][${TAG}] 로그인 학생이 ${guestRouteOf(SCREEN)} 에 오면 routes["13"] 로 보내고 둘러보기 배너 없음`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "student", 13, guestRouteOf(SCREEN));
  try {
    await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname, "로그인 사용자 → 홈 경로").toBe(routeOf(13));
    expect(await countComponent(page, GUEST.banner), `${GUEST.banner} 0`).toBe(0);
    expect(await page.locator("body").innerText(), "데모 학교명 없음").not.toContain(GUEST.school_name);
  } finally {
    await context.close();
  }
});

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][${TAG}] 화면 ${SCREEN}g 스크린샷 저장`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitList(page).catch(() => undefined);
    await rowsOf(page).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}g-${viewport}.png`), fullPage: true });
  } finally {
    await context.close();
  }
});
