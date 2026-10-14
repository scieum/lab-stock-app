// 화면 18 관리 (/manage · 둘러보기 /demo/manage) — C1 · C2 · R-ui · N1-ui · GM-ui · V1
// 기준: harness/d7-data.md §29 "하단 탭" · "화면 18 관리" · "데스크톱 /manage", design/rules.json 1.29 manage · tab_bar · frames.mobile_only_screens ·
//       guest.manage, harness/dev-rules.json routes 18 · 18-guest · route_auth 18, design/frames 18-mobile · 18-guest-mobile.
// - 390: 제목 '관리' → manage-list(묶음 = rules manage.list 의 역할별 묶음) · manage-row(이름 = 묶음 항목, 요약 caption = 로그인 세션(RLS)으로 센 실제 숫자,
//   형식 = rules manage.row 예시) · 탭 '관리' 활성 · 행을 누르면 그 화면.
// - 1440: 데스크톱은 사이드바가 대신 — /manage → /, /demo/manage → /demo (manage-list 0).
// - 둘러보기 18g: '재고' 묶음 시약 · 센서 2행(요약 = anon 데모 숫자), 나머지 묶음 0, 탭 '관리' 활성 · QR 스캔 · 기록 guest-lock 2.
// 공용 계정은 읽기만 한다 (쓰기 요청 0).
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { anonClient, ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import {
  MANAGE_RULES,
  MOBILE_ONLY_SCREENS,
  browserSession,
  countComponent,
  devRules,
  mobileActiveTab,
  roleChecks,
  routeOf,
  rules,
  sel,
  tabItemLabels,
  type ViewportName,
} from "./screen-helpers";
import { RULE_ROLE, expectShell, schoolNamesIn } from "./shell-helpers";
import { GUEST, checkBanner, checkHidden, checkSchoolName, checkTabBar, demoSchool, guestRouteOf, openGuest, waitGuestShell } from "./guest-helpers";
import { loadShellFrameNodes } from "../frames";
import { GROUP, GROUPS, LIST, ROW, ROW_SCREEN, SCREEN, EXAMPLES, dbCounts, expectedCaption, groupsFor, readList, squash, waitManage, type Counts } from "./screen-18-helpers";

const TB = rules.tab_bar;
const ALL_ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];


/** 탭바 활성 tab-item (aria-current=page) 글자 */
function activeTab(page: Page): Locator {
  return page.locator(`${sel(TB.component)} ${sel(TB.item)}[aria-current="page"]`);
}


/** 비 GET 요청(쓰기) 기록 */
function watchWrites(page: Page): () => string[] {
  const w: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) w.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return () => w;
}

const shot = (page: Page, name: string, viewport: ViewportName) =>
  page.screenshot({ path: join(process.cwd(), "test-results", `v1-${name}-${viewport}.png`), fullPage: false });

// =====================================================================
// 기대값 원본
// =====================================================================

test(`[C1][S${SCREEN}] 기대값 원본: rules manage.screen ${SCREEN} · routes 18 ${routeOf(SCREEN)} · 18-guest · screens_required[18] · frames.mobile_only_screens · tab_bar.mobile_screens · 묶음 ${GROUPS.map((g) => g.title).join("·")} = 시안 18-mobile · 행 → 화면`, () => {
  expect(routeOf(SCREEN), "dev-rules routes 18").toBe("/manage");
  expect(devRules.routes[`${SCREEN}-guest`], "dev-rules routes 18-guest").toBe("/demo/manage");
  expect(MOBILE_ONLY_SCREENS, "rules frames.mobile_only_screens").toContain(SCREEN);
  expect(TB.mobile_screens, "rules tab_bar.mobile_screens").toContain(SCREEN);
  expect(rules.screens_required[String(SCREEN)], "screens_required[18]").toEqual([LIST, ROW]);
  for (const n of [LIST, GROUP, ROW]) expect(devRules.components[n], `dev-rules components ${n}`).toEqual([SCREEN]);
  expect(mobileActiveTab(SCREEN), "18 의 활성 탭 = 관리").toBe("관리");
  expect(GROUPS.map((g) => g.title), "rules manage.list 묶음 3").toEqual(["재고", "입고·주문", "학교"]);
  // 시안 18-mobile (admin 시안 — 묶음 3개 · 행 8개) 묶음 제목 · 행 이름 = rules
  const nodes = loadShellFrameNodes<{ name: string; path: string[]; text: { characters: string } | null; height: number }>("18-mobile");
  const fGroups = nodes.filter((n) => n.name === GROUP);
  expect(fGroups.length, "시안 manage-group 수").toBe(GROUPS.length);
  const fTitles = nodes.filter((n) => n.path.includes("group-title") && n.text).map((n) => n.text!.characters);
  expect(fTitles, "시안 묶음 제목").toEqual(GROUPS.map((g) => g.title));
  const fNames = nodes.filter((n) => n.path.includes(ROW) && n.name === "name" && n.text).map((n) => n.text!.characters);
  expect(fNames, "시안 행 이름").toEqual(GROUPS.flatMap((g) => g.items));
  for (const name of fNames) expect(ROW_SCREEN[name], `행 '${name}' → 관리 아래 화면 (데스크톱 메뉴 문구)`).toBeDefined();
  expect(Object.keys(ROW_SCREEN).length, "관리 아래 화면 수 = 행 수").toBe(fNames.length);
  for (const h of nodes.filter((n) => n.name === ROW).map((n) => n.height)) expect(h, "시안 manage-row 높이 56 (rules manage.row)").toBe(56);
  // 요약 예시 형식 6개
  expect(EXAMPLES.length, "rules manage.row 요약 예시").toBe(6);
  // 둘러보기: '재고' 묶음 시약 · 센서
  const g = loadShellFrameNodes<{ name: string; path: string[]; text: { characters: string } | null }>("18-guest-mobile");
  expect(g.filter((n) => n.path.includes(ROW) && n.name === "name" && n.text).map((n) => n.text!.characters), "시안 18-guest-mobile 행").toEqual(["시약", "센서"]);
  expect(g.filter((n) => n.path.includes("group-title") && n.text).map((n) => n.text!.characters), "시안 18-guest-mobile 묶음").toEqual(["재고"]);
  expect(MANAGE_RULES.guest).toMatch(/시약 · 센서 두 줄만/);
});

// =====================================================================
// 로그인 후 — 역할별
// =====================================================================

for (const role of ALL_ROLES) {
  const ruleRole = RULE_ROLE[role];
  const want = groupsFor(ruleRole);
  test(`[C1][R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 390: 제목 '관리' · ${GROUP} = ${want.map((g) => g.title).join("·")} · ${ROW} = ${want.flatMap((g) => g.items).join("·")} (rules manage.list) · 요약 caption = 로그인 세션(RLS) 숫자 (rules manage.row 형식) · 행 href = 관리 아래 화면 / 1440: ${routeOf(SCREEN)} → ${routeOf(13)}`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN);
    const writes = watchWrites(page);
    try {
      if (viewport === "desktop") {
        // d7 §29 "데스크톱 /manage": 1440 에서 /manage 로 오면 / 로 (사이드바가 같은 목록)
        await expect.poll(() => new URL(page.url()).pathname, { message: `1440 ${routeOf(SCREEN)} → ${routeOf(13)}`, timeout: 30_000 }).toBe(routeOf(13));
        await expect(page.locator(sel("home-summary")).first(), "홈 본문").toBeVisible({ timeout: 30_000 });
        await expect(page.locator(sel(LIST)), "1440 manage-list 0").toHaveCount(0);
        await expect(page.locator(sel(ROW)), "1440 manage-row 0").toHaveCount(0);
        await expectShell(page, viewport, 13, "1440 / 도착");
        await shot(page, `${SCREEN}`, viewport);
        expect(writes(), "쓰기 요청 0").toEqual([]);
        return;
      }
      await waitManage(page);
      const me = await browserSession(page);
      await expectShell(page, viewport, SCREEN, `화면 ${SCREEN}`);
      // 머리: nav-pill(학교명 ▾) · 제목 '관리' (시안 18-mobile page-title)
      await expect(page.locator(sel("nav-pill")), "nav-pill 학교명").toContainText(me.schoolName);
      await expect(page.locator(sel("nav-account-menu")), "nav-account-menu 1").toHaveCount(1);
      await expect(page.locator("main h1").filter({ hasText: /^\s*관리\s*$/ }), "제목 '관리'").toBeVisible();
      for (const n of rules.screens_required[String(SCREEN)] as string[]) {
        await expect(page.locator(`main ${sel(n)}`).first(), `screens_required ${n} 보임`).toBeVisible();
      }
      // 묶음 · 행
      const shown = await readList(page);
      expect(shown.groups, `${ROLE_LABEL[role]} 묶음`).toEqual(want.map((g) => g.title));
      expect(shown.rows.map((r) => r.label), `${ROLE_LABEL[role]} 행 이름`).toEqual(want.flatMap((g) => g.items));
      expect(shown.rows.map((r) => r.group), "행이 속한 묶음").toEqual(want.flatMap((g) => g.items.map(() => g.title)));
      await expect(page.locator(sel(GROUP)), `${GROUP} 수`).toHaveCount(want.length);
      await expect(page.locator(sel(ROW)), `${ROW} 수`).toHaveCount(want.flatMap((g) => g.items).length);
      for (const r of shown.rows) expect(r.href, `행 '${r.label}' → 화면 ${ROW_SCREEN[r.label]}`).toBe(routeOf(ROW_SCREEN[r.label]));
      // 행 높이 56 (rules manage.row)
      for (const h of await page.locator(`main ${sel(ROW)}`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))) {
        expect(h, "manage-row 높이 56").toBe(56);
      }
      // 요약 caption = DB(RLS) 숫자
      const counts = await dbCounts(page, ruleRole === "admin");
      expect(counts.reagents, "대조: 학교 시약 ≥1").toBeGreaterThan(0);
      for (const r of shown.rows) {
        const cap = expectedCaption(r.label, counts);
        expect(r.text, `행 '${r.label}' 글자 = 이름${cap ? ` + '${cap}'` : "만"}`).toBe(squash(r.label + (cap ?? "")));
      }
      // 숫자는 무채색 글자만 (rules manage.row) — caption 색에 채도 없음
      const colors = await page.locator(`main ${sel(ROW)} span`).evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
      for (const c of colors) {
        const m = c.match(/\d+(\.\d+)?/g)!.map(Number);
        expect(Math.max(m[0], m[1], m[2]) - Math.min(m[0], m[1], m[2]), `행 글자 색 무채색 (${c})`).toBeLessThanOrEqual(8);
      }
      // 탭 '관리' 활성 (rules tab_bar.labels_source)
      expect(await tabItemLabels(page.locator(`${sel(TB.component)} ${sel(TB.item)}`)), "탭 라벨").toEqual(TB.labels);
      await expect(activeTab(page), "활성 탭 1").toHaveCount(1);
      await expect(activeTab(page), `활성 탭 = '${mobileActiveTab(SCREEN)}'`).toHaveText(new RegExp(`^\\s*${mobileActiveTab(SCREEN)}\\s*$`));
      await expect(activeTab(page)).toHaveAttribute("href", routeOf(SCREEN));
      // R-ui: rules roles (화면 18) · manage-back 0 (화면 18 자체는 관리 아래 화면이 아님)
      for (const c of roleChecks(SCREEN, ruleRole)) {
        const n = await countComponent(page, c.component);
        if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
        else expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
      }
      await expect(page.locator(sel("manage-back")), "화면 18 에 manage-back 0").toHaveCount(0);
      for (const gone of ["mobile-menu-button", "mobile-menu-sheet", "inventory-switch"]) await expect(page.locator(sel(gone)), `${gone} 0`).toHaveCount(0);
      // N1-ui: 학교명 = 자기 학교 하나
      const names = await schoolNamesIn(page.locator("body"));
      expect(names, "학교명 종류").toHaveLength(rules.never.N1.distinct_school_names);
      for (const n of names) expect(me.schoolName).toContain(n);
      if (role === "admin") await shot(page, `${SCREEN}`, viewport);
      expect(writes(), "쓰기 요청 0").toEqual([]);
    } finally {
      await context.close();
    }
  });
}

for (const role of ["student", "admin"] as Role[]) {
  test(`[C2][S${SCREEN}] ${ROLE_LABEL[role]} 390: 탭 '관리' → ${routeOf(SCREEN)} · 행마다 누르면 그 화면에 도착(탭 '관리' 활성 유지) · '‹ 관리' 로 돌아옴 / 1440: 사이드바에 ${routeOf(SCREEN)} 링크 0`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const { context, page, viewport } = await openAs(browser, info, role, 13);
    try {
      await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 45_000 });
      if (viewport === "desktop") {
        await expect(page.locator(`a[href="${routeOf(SCREEN)}"]`), "1440 화면 18 링크 0 (데스크톱은 사이드바)").toHaveCount(0);
        await expect(page.locator(sel(rules.desktop_shell.component)), "app-sidebar 1").toHaveCount(1);
        return;
      }
      const tab = page.locator(`${sel(TB.component)} ${sel(TB.item)}`).filter({ hasText: mobileActiveTab(SCREEN) });
      await expect(tab, "'관리' 탭 1").toHaveCount(1);
      await expect(tab).toHaveAttribute("href", routeOf(SCREEN));
      await tab.click();
      await waitManage(page);
      const rows = (await readList(page)).rows;
      for (const r of rows) {
        const target = ROW_SCREEN[r.label];
        await page.locator(`main ${sel(ROW)}[href="${r.href}"]`).click();
        await expect.poll(() => new URL(page.url()).pathname, { message: `행 '${r.label}' → ${r.href}`, timeout: 45_000 }).toBe(routeOf(target));
        await expect(page.locator(sel("nav-pill")), `화면 ${target} nav-pill`).toHaveCount(1, { timeout: 30_000 });
        await expect(activeTab(page), `화면 ${target} 활성 탭 = '${mobileActiveTab(target)}'`).toHaveText(new RegExp(`^\\s*${mobileActiveTab(target)}\\s*$`), { timeout: 30_000 });
        const back = page.locator(`${sel("nav-pill")} ${sel("manage-back")}`);
        await expect(back, `화면 ${target} manage-back`).toBeVisible({ timeout: 30_000 });
        await back.click();
        await waitManage(page);
      }
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 둘러보기 18g
// =====================================================================

test(`[GM-ui][C1][S${SCREEN}g] 둘러보기 ${devRules.routes[`${SCREEN}-guest`]} 390: guest-banner · '재고' 묶음 시약 · 센서 2행(→ 데모 경로, 요약 = anon 데모 숫자) · 나머지 묶음 0 · hidden_components 0 · 학교명 '${GUEST.school_name}' · 탭 4(관리 활성 · QR 스캔·기록 잠금 ${GUEST.tab_locks}) · 쓰기 0 / 1440: → ${guestRouteOf(13)}`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const path = devRules.routes[`${SCREEN}-guest`];
  const { context, page, viewport, response } = await openGuest(browser, info, path);
  const writes = watchWrites(page);
  try {
    expect(response?.status(), `${path} 응답`).toBe(200);
    if (viewport === "desktop") {
      await expect.poll(() => new URL(page.url()).pathname, { message: `1440 ${path} → ${guestRouteOf(13)}`, timeout: 30_000 }).toBe(guestRouteOf(13));
      await waitGuestShell(page);
      await expect(page.locator(sel(LIST)), "1440 manage-list 0").toHaveCount(0);
      await shot(page, `${SCREEN}g`, viewport);
      expect(writes(), "쓰기 요청 0").toEqual([]);
      return;
    }
    await waitGuestShell(page);
    await expect(page.locator(`main ${sel(LIST)}`)).toBeVisible({ timeout: 30_000 });
    await checkBanner(page);
    await checkHidden(page);
    await checkSchoolName(page, null);
    await checkTabBar(page, viewport, SCREEN);
    await expect(activeTab(page), "활성 탭 1").toHaveCount(1);
    await expect(activeTab(page), `활성 탭 '${mobileActiveTab(SCREEN)}'`).toHaveText(new RegExp(`^\\s*${mobileActiveTab(SCREEN)}\\s*$`));
    const shown = await readList(page);
    const stock = GROUPS[0];
    const guestItems = stock.items.filter((label) => ROW_SCREEN[label] === 2 || ROW_SCREEN[label] === 17);
    expect(shown.groups, "둘러보기 묶음 = '재고' 만").toEqual([stock.title]);
    expect(shown.rows.map((r) => r.label), "둘러보기 행 = 시약 · 센서").toEqual(guestItems);
    for (const r of shown.rows) expect(r.href, `행 '${r.label}' → 데모 경로`).toBe(guestRouteOf(ROW_SCREEN[r.label]));
    // 요약 = anon(데모 학교) 숫자
    const demo = await demoSchool();
    const anon = anonClient();
    const [rg, sn] = await Promise.all([anon.from("reagents").select("school_id, stock, min_stock"), anon.from("sensors").select("school_id, status")]);
    expect(rg.error).toBeNull();
    expect(sn.error).toBeNull();
    for (const rows of [rg.data, sn.data]) expect((rows ?? []).filter((x) => x.school_id !== demo.id), "anon = 데모 학교 행만").toEqual([]);
    const c: Counts = {
      reagents: (rg.data ?? []).length,
      low: (rg.data ?? []).filter((x) => Number(x.stock) < Number(x.min_stock)).length,
      sensors: (sn.data ?? []).length,
      broken: (sn.data ?? []).filter((x) => x.status === "broken").length,
      cabinets: 0,
    };
    expect(c.reagents, "대조: 데모 시약 ≥1").toBeGreaterThan(0);
    for (const r of shown.rows) {
      const cap = expectedCaption(r.label, c);
      expect(r.text, `행 '${r.label}' = 이름 + '${cap}'`).toBe(squash(r.label + (cap ?? "")));
    }
    await expect(page.locator(sel("manage-back")), "18g manage-back 0").toHaveCount(0);
    // 잠긴 탭(QR 스캔 · 기록)을 눌러도 이동 · 쓰기 없음
    for (const label of GUEST.locked_tabs) {
      await page.locator(`${sel(TB.component)} ${sel(TB.item)}`).filter({ hasText: label }).click();
      expect(new URL(page.url()).pathname, `잠긴 탭 '${label}' — 이동 없음`).toBe(path);
    }
    // 행을 누르면 데모 화면 → '‹ 관리' 로 돌아옴
    const first = shown.rows[0];
    await page.locator(`main ${sel(ROW)}[href="${first.href}"]`).click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 45_000 }).toBe(first.href);
    const back = page.locator(`${sel("nav-pill")} ${sel("manage-back")}`);
    await expect(back, "2g manage-back").toBeVisible({ timeout: 30_000 });
    await expect(back).toHaveAttribute("href", path);
    await back.click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 45_000 }).toBe(path);
    await expect(page.locator(`main ${sel(LIST)}`)).toBeVisible({ timeout: 30_000 });
    await shot(page, `${SCREEN}g`, viewport);
    expect(writes(), "쓰기 요청 0").toEqual([]);
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${SCREEN}] 비로그인 ${routeOf(SCREEN)} → ${routeOf(1)} (dev-rules route_auth 18 "로그인 후") · manage-list 0`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  expect((devRules as unknown as { route_auth: Record<string, string> }).route_auth[String(SCREEN)]).toMatch(/^로그인 후/);
  const vp = devRules.viewports[info.project.name];
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: vp[0], height: vp[1] } });
  try {
    const page = await context.newPage();
    await page.goto(routeOf(SCREEN));
    await page.waitForURL((u) => u.pathname === routeOf(1), { timeout: 30_000 });
    await expect(page.locator(sel(LIST))).toHaveCount(0);
  } finally {
    await context.close();
  }
});
