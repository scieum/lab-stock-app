// 모바일 전체 메뉴 ☰ (d7 §28 "모바일 전체 메뉴" · design/rules.json 1.28 mobile_menu · dev-rules 1.20 components mobile-menu-button ·
// mobile-menu-sheet · 시안 13-menu-mobile) — 화면 연결(D3).
// - 로그인 후 모바일(390) 기본 화면 2~13·16·17 의 nav-pill 맨 왼쪽 mobile-menu-button 1개(44×44), 데스크톱(1440) 0개(app-sidebar 가 같은 메뉴).
// - 화면 17 의 하위 화면(센서 등록 폼 · 서류로 등록)은 ×/‹ 머리만 — ☰ 0.
// - 시트 = 학교명 + "이름 · 역할" + ×, desktop_shell.menu 와 같은 역할별 묶음(학생 1 · 교사 2 · admin 3), 지금 화면 = highlight-soft 활성,
//   QR 스캔 = 화면 12 정상 링크(d7 §28), 맨 아래 로그아웃. 하단 tab-bar 4개 그대로.
// - 둘러보기 = 같은 시트(데모 학교 · 홈·시약·센서 활성 · 기록·QR 스캔 guest-lock · 관리 숨김 · '가입하기').
// 로그아웃은 공용 계정으로 하지 않는다(signOut = 그 계정의 모든 세션 종료) — 일회용 학교 학생으로만.
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import type { Role } from "./db-helpers";
import { frameActiveLabel } from "../desktop-shell";
import { browserClient, browserSession, devRules, routeOf, rules, sel, seedRows, seedSchoolNames, type ViewportName } from "./screen-helpers";
import { seedSchoolOf } from "./screen-3-helpers";
import { anonClient } from "./db-helpers";
import { HAS_SERVICE, forgetSession, openTemp } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, type S11Fixture } from "./screen-11-helpers";
import { demoReagents, lockToastMessage, openGuest, waitGuestShell } from "./guest-helpers";
import { RULE_ROLE } from "./shell-helpers";
import {
  GUEST_MENU,
  HIGHLIGHT_SOFT,
  LOGOUT,
  MENU_BUTTON,
  MENU_BUTTON_SIZE,
  MENU_GROUPS,
  MENU_GROUP_TITLES,
  MENU_SHEET,
  exact,
  fill,
  groupsFor,
  menuButton,
  menuItem,
  menuLabels,
  menuRouteOf,
  menuSheet,
  mobileLabelOf,
} from "./d7-28-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "mmenu";
const MENU_SCREENS: number[] = devRules.components[MENU_BUTTON];
const HOME = 13;
const SCAN = 12;

/** 화면마다 들어갈 수 있는 역할 (교사·admin 화면 5·6·7 = 교사, admin 화면 8·9 = admin, 그 밖 = 학생) */
const roleFor = (screen: number): Role => ([8, 9].includes(screen) ? "admin" : [5, 6, 7].includes(screen) ? "teacher" : "student");

/** 화면 경로 ([param] = 학교 A seed 시약) */
function pathOf(screen: number): string {
  if (screen !== 3) return routeOf(screen);
  const a = seedSchoolOf("student").id;
  const r = seedRows("reagents").find((x) => x.school_id === a);
  if (!r) throw new Error("seed 에 학교 A 시약 없음");
  return fill(screen, r.id);
}

/** 화면 16 경로 = 자기 세션(RLS)으로 읽은 MSDS 주소가 있는 자기 학교 시약 (없으면 화면 16 이 화면 3 으로 돌려보낸다) */
async function msdsPathFor(page: Page): Promise<string> {
  const { client } = await browserClient(page);
  const r = await client.from("reagents").select("id").not("msds_url", "is", null).neq("msds_url", "").limit(1);
  if (r.error || !r.data?.length) throw new Error(`학교 A 에 MSDS 주소가 있는 시약 없음 (${r.error?.message ?? "0행"})`);
  return fill(16, r.data[0].id as string);
}

/** 셸이 그려지고 하이드레이션까지 (390 = nav-pill, 1440 = app-sidebar) */
async function waitShell(page: Page, vp: ViewportName): Promise<void> {
  const shell = page.locator(sel(vp === "desktop" ? "app-sidebar" : "nav-pill")).first();
  await expect(shell, "셸 보임").toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("load");
  await expect
    .poll(() => shell.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__react"))), { message: "셸 하이드레이션", timeout: 30_000 })
    .toBe(true);
  // 폭 정리 (데스크톱 = nav-pill 0 / 모바일 = app-sidebar 0)
  await expect(page.locator(sel(vp === "desktop" ? "nav-pill" : "app-sidebar")), "폭 정리").toHaveCount(0, { timeout: 30_000 });
}

const bg = (l: import("@playwright/test").Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);

/** ☰ 가 nav-pill 맨 왼쪽 (nav-pill 안 다른 보이는 링크·버튼보다 왼쪽) · 44×44 */
async function expectLeftmost(page: Page, where: string): Promise<void> {
  const nav = page.locator(sel("nav-pill"));
  const btn = nav.locator(sel(MENU_BUTTON));
  await expect(btn, `${where}: nav-pill 안 ${MENU_BUTTON} 1`).toHaveCount(1);
  await expect(btn, `${where}: ☰ 보임`).toBeVisible();
  const box = (await btn.boundingBox())!;
  expect(Math.round(box.width), `${where}: ☰ 폭 = rules ${MENU_BUTTON_SIZE}`).toBe(MENU_BUTTON_SIZE);
  expect(Math.round(box.height), `${where}: ☰ 높이 = rules ${MENU_BUTTON_SIZE}`).toBe(MENU_BUTTON_SIZE);
  await expect(btn, `${where}: ☰ 글자 없음`).toHaveText(/^\s*$/);
  const others = await nav.locator("a:visible, button:visible").evaluateAll(
    (els, me) => els.filter((e) => !e.closest(me)).map((e) => e.getBoundingClientRect().left),
    sel(MENU_BUTTON),
  );
  expect(others.length, `${where}: nav-pill 안 다른 요소`).toBeGreaterThan(0);
  expect(box.x, `${where}: ☰ = nav-pill 맨 왼쪽`).toBeLessThan(Math.min(...others));
}

async function openSheet(page: Page): Promise<import("@playwright/test").Locator> {
  const sheet = menuSheet(page);
  await expect(async () => {
    if (!(await sheet.isVisible())) await menuButton(page).click({ timeout: 3_000 });
    await expect(sheet).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  return sheet;
}

// ---------------------------------------------------------------- 화면별 ☰ 개수

test(`[C1][S*] 기대값 원본: dev-rules ${MENU_BUTTON} = 화면 ${MENU_SCREENS.join("·")} · ${MENU_SHEET} · rules mobile_menu 묶음 ${MENU_GROUPS.map((g) => g.length).join("/")} = desktop_shell.menu · 시안 13-menu-mobile 묶음 제목 ${MENU_GROUP_TITLES.join("·")}`, () => {
  expect(MENU_SCREENS, "dev-rules mobile-menu-button 화면").toEqual(expect.arrayContaining([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17]));
  expect(devRules.components[MENU_SHEET], "dev-rules mobile-menu-sheet").toEqual([HOME]);
  const d = rules.desktop_shell.menu;
  expect(MENU_GROUPS.map((g) => g.length), "모바일 묶음 크기 = 데스크톱 사이드바 묶음").toEqual([d.all.length, d.teacher_admin.length, d.admin.length]);
  expect(MENU_GROUP_TITLES.length, "시안 묶음 제목 = 둘째·셋째 묶음").toBe(MENU_GROUPS.length - 1);
  expect(MENU_BUTTON_SIZE, "rules mobile_menu.button 크기").toBeGreaterThan(0);
});

for (const screen of MENU_SCREENS) {
  const role = roleFor(screen);
  test(`[C1][S${screen}] 화면 ${screen}(${RULE_ROLE[role]}) ☰: 390 = nav-pill 맨 왼쪽 ${MENU_BUTTON} 1(44×44, 글자 없음) · 누르면 ${MENU_SHEET} · 지금 화면 항목 활성(highlight-soft) · × 닫기 · tab-bar ${rules.tab_bar.items} 그대로 / 1440 = ☰ 0 · 시트 0`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const opened = await openAs(browser, info, role, screen === 16 ? 2 : screen, screen === 16 ? routeOf(2) : pathOf(screen));
    const { context, page, viewport } = opened;
    try {
      const path = screen === 16 ? await msdsPathFor(page) : pathOf(screen);
      if (screen === 16) await page.goto(path);
      expect(new URL(page.url()).pathname, "그 화면에 머묾").toBe(path);
      await waitShell(page, viewport);
      if (viewport === "desktop") {
        await expect(menuButton(page), `1440 ${MENU_BUTTON} 0`).toHaveCount(0);
        await expect(menuSheet(page), `1440 ${MENU_SHEET} 0`).toHaveCount(0);
        await expect(page.locator(sel("app-sidebar")), "1440 app-sidebar 1 (같은 메뉴)").toHaveCount(1);
        return;
      }
      await expectLeftmost(page, `화면 ${screen}`);
      await expect(menuButton(page), "☰ 전체 1").toHaveCount(1);
      await expect(page.locator(`${sel(rules.tab_bar.component)} ${sel(rules.tab_bar.item)}`), "tab-item 그대로").toHaveCount(rules.tab_bar.items);
      await expect(menuSheet(page), "누르기 전 시트 0").toHaveCount(0);
      const sheet = await openSheet(page);
      await expect(menuSheet(page), "시트 1").toHaveCount(1);
      const want = mobileLabelOf(frameActiveLabel(screen));
      const active = sheet.locator('[aria-current="page"]');
      await expect(active, "활성 항목 1").toHaveCount(1);
      await expect(active, `활성 = '${want}' (시안 ${screen}-desktop 활성 사이드바 항목과 같은 자리)`).toHaveText(exact(want));
      expect(await bg(active), "활성 바탕 = colors.highlight-soft").toBe(HIGHLIGHT_SOFT);
      await sheet.getByRole("button", { name: "닫기", exact: true }).click();
      await expect(menuSheet(page), "× → 시트 0").toHaveCount(0);
      expect(new URL(page.url()).pathname, "닫아도 화면 그대로").toBe(path);
      if (screen === HOME) await page.screenshot({ path: `test-results/v1-13-menu-${viewport}.png` });
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S17] 화면 17 하위 화면(센서 등록 폼 · 서류로 등록 ${devRules.routes["17-doc"]}) = ×/‹ 머리만, ☰ 0 · 목록 ${routeOf(17)} = ☰ 1 (390) / 1440 = 모두 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 17);
  try {
    await waitShell(page, viewport);
    await expect(menuButton(page), `${routeOf(17)} ☰`).toHaveCount(viewport === "desktop" ? 0 : 1);
    for (const p of [`${routeOf(17)}/new`, devRules.routes["17-doc"]]) {
      await page.goto(p);
      await waitShell(page, viewport);
      expect(new URL(page.url()).pathname, `교사 ${p} 에 머묾`).toBe(p);
      await expect(menuButton(page), `${p} ☰ 0`).toHaveCount(0);
      if (viewport === "mobile") {
        await expect(page.locator(sel("nav-pill")).getByRole("link", { name: "닫기", exact: true }), `${p} 머리 × 1`).toHaveCount(1);
      }
    }
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------- 역할별 시트 내용

for (const role of ["student", "teacher", "admin"] as const) {
  test(`[R-ui][S13] ${RULE_ROLE[role]} 전체 메뉴 시트(390): 학교명 + '· ${RULE_ROLE[role]}' · 묶음 ${groupsFor(role).length}개(${groupsFor(role).map((g) => g.join("·")).join(" / ")}) · 항목 경로 = 화면 경로 · QR 스캔 = 화면 12 링크(준비 중 없음) · 맨 아래 '${LOGOUT}' / 1440 = ☰ 0`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, viewport } = await openAs(browser, info, role, HOME);
    try {
      await waitShell(page, viewport);
      if (viewport === "desktop") {
        await expect(menuButton(page), "1440 ☰ 0").toHaveCount(0);
        await expect(menuSheet(page), "1440 시트 0").toHaveCount(0);
        return;
      }
      const me = await browserSession(page);
      const sheet = await openSheet(page);
      const head = sheet.locator("h2").first();
      await expect(head, "시트 머리 학교명").toHaveText(exact(me.schoolName));
      await expect(sheet, `이름 · 역할 caption`).toContainText(` · ${RULE_ROLE[role]}`);
      const groups = groupsFor(role);
      expect(await menuLabels(sheet), "항목 = 역할별 묶음 (순서)").toEqual(groups.flat());
      // 다른 역할 묶음 항목 0
      for (const g of MENU_GROUPS.slice(groups.length)) for (const label of g) await expect(menuItem(sheet, label), `${RULE_ROLE[role]}에게 '${label}' 0`).toHaveCount(0);
      // 묶음 제목 (시안 13-menu-mobile) — 둘째 묶음부터
      for (const [i, t] of MENU_GROUP_TITLES.entries()) {
        await expect(sheet.getByText(t, { exact: true }), `묶음 제목 '${t}'`).toHaveCount(i + 1 < groups.length ? 1 : 0);
      }
      for (const label of groups.flat()) {
        const it = menuItem(sheet, label);
        await expect(it, `'${label}' 1`).toHaveCount(1);
        await expect(it, `'${label}' → ${menuRouteOf(label)}`).toHaveAttribute("href", menuRouteOf(label));
      }
      await expect(menuItem(sheet, groups[0][groups[0].length - 1]), "QR 스캔 = 화면 12 경로").toHaveAttribute("href", routeOf(SCAN));
      await expect(sheet.getByText("준비 중"), "QR 스캔 '준비 중' 없음 (화면 12 있음)").toHaveCount(0);
      const logout = sheet.getByRole("button", { name: LOGOUT, exact: true });
      await expect(logout, `'${LOGOUT}' 1`).toHaveCount(1);
      // 맨 아래: 메뉴 목록(nav — 길면 안에서 스크롤) 아래 · 문서 순서도 마지막 항목 뒤
      const navBox = (await sheet.locator("nav").first().boundingBox())!;
      expect((await logout.boundingBox())!.y, `'${LOGOUT}' = 메뉴 목록 아래`).toBeGreaterThanOrEqual(navBox.y + navBox.height - 1);
      const after = await logout.evaluate((el) => {
        const items = Array.from(el.closest('[data-component="mobile-menu-sheet"]')!.querySelectorAll("nav a, nav button"));
        return items.every((i) => (i.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
      });
      expect(after, `'${LOGOUT}' = 모든 항목 뒤`).toBe(true);
      // 학교명은 자기 학교만 (seed 의 다른 학교명 0)
      const text = await sheet.innerText();
      expect(text, "시트에 자기 학교명").toContain(me.schoolName);
      for (const other of seedSchoolNames().filter((n) => n !== me.schoolName)) expect(text, `다른 학교명 ${other} 0`).not.toContain(other);
      // 시트 안 항목 개수 + 셸 그대로
      await expect(page.locator(`${sel(rules.tab_bar.component)} ${sel(rules.tab_bar.item)}`), "tab-item 그대로").toHaveCount(rules.tab_bar.items);
      await page.screenshot({ path: `test-results/v1-13-menu-${role}-${viewport}.png` });
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S13] admin 390 시트 항목으로 이동: '${MENU_GROUPS[2][0]}' → ${routeOf(8)} (시트 닫힘) → 다시 열면 그 항목 활성 · '${MENU_GROUPS[0][2]}' → ${routeOf(17)} / 1440 = ☰ 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "admin", HOME);
  try {
    await waitShell(page, viewport);
    if (viewport === "desktop") {
      await expect(menuButton(page), "1440 ☰ 0").toHaveCount(0);
      return;
    }
    for (const label of [MENU_GROUPS[2][0], MENU_GROUPS[0][2]]) {
      const sheet = await openSheet(page);
      await menuItem(sheet, label).click();
      await expect(page, `'${label}' → ${menuRouteOf(label)}`).toHaveURL(new RegExp(`${menuRouteOf(label)}(\\?|$)`), { timeout: 45_000 });
      await expect(menuSheet(page), "이동 뒤 시트 닫힘").toHaveCount(0);
      await waitShell(page, viewport);
      const again = await openSheet(page);
      await expect(again.locator('[aria-current="page"]'), `다시 열면 '${label}' 활성`).toHaveText(exact(label));
      await again.getByRole("button", { name: "닫기", exact: true }).click();
    }
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------- 로그아웃 (일회용 학교)

let fx: Promise<S11Fixture> | null = null;
function fixture(info: TestInfo): Promise<S11Fixture> {
  fx ??= makeFixture(info, GROUP);
  fx.catch(() => (fx = null));
  return fx;
}
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE || !fx) return;
  fx = null;
  expect(await cleanup(GROUP, info.project.name), "일회용 학교·계정 잔여물").toEqual(NO_S11_RESIDUE);
});

test(`[R-ui][S13] 시트 맨 아래 '${LOGOUT}' (일회용 학생, 390) → ${routeOf(1)} · 세션 쿠키 없음 · 다시 ${routeOf(2)} = 로그인 화면 / 1440 = ☰ 0`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  if ((info.project.name as ViewportName) === "desktop") {
    const { context, page, viewport } = await openAs(browser, info, "student", HOME);
    try {
      await waitShell(page, viewport);
      await expect(menuButton(page), "1440 ☰ 0").toHaveCount(0);
    } finally {
      await context.close();
    }
    return;
  }
  expect(HAS_SERVICE, "일회용 계정을 만들 SUPABASE_SERVICE_ROLE_KEY 필요").toBe(true);
  const f = await fixture(info);
  forgetSession(f.student.id);
  const { context, page, viewport } = await openTemp(browser, info, f.student, routeOf(HOME));
  try {
    await waitShell(page, viewport);
    const sheet = await openSheet(page);
    await sheet.getByRole("button", { name: LOGOUT, exact: true }).click();
    await expect(page, `로그아웃 → ${routeOf(1)}`).toHaveURL(new RegExp(`${routeOf(1)}(\\?|$)`), { timeout: 45_000 });
    const left = (await context.cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
    expect(left, "세션 쿠키 0").toHaveLength(0);
    await page.goto(routeOf(2));
    await expect(page, "로그아웃 뒤 시약 목록 → 로그인").toHaveURL(new RegExp(`${routeOf(1)}`), { timeout: 30_000 });
  } finally {
    forgetSession(f.student.id);
    await context.close();
  }
});

// ---------------------------------------------------------------- 둘러보기

const GUEST_SCREENS: { tag: string; path: () => Promise<string> }[] = [
  { tag: "S13g", path: async () => devRules.routes["13-guest"] },
  { tag: "S2g", path: async () => devRules.routes["2-guest"] },
  { tag: "S3g", path: async () => fill("3-guest", (await demoReagents())[0].id) },
  {
    tag: "S16g",
    path: async () => {
      // MSDS 주소가 있는 데모 시약 (없으면 화면 3 으로 돌려보낸다)
      const r = await anonClient().from("reagents").select("id").not("msds_url", "is", null).neq("msds_url", "").limit(1);
      if (r.error || !r.data?.length) throw new Error(`데모 학교 MSDS 있는 시약 없음: ${r.error?.message}`);
      return fill("16-guest", r.data[0].id as string);
    },
  },
  { tag: "S17g", path: async () => devRules.routes["17-guest"] },
];

for (const g of GUEST_SCREENS) {
  test(`[GM-ui][${g.tag}] 둘러보기 ☰: 390 = nav-pill 맨 왼쪽 ${MENU_BUTTON} 1 / 1440 = 0`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const path = await g.path();
    const { context, page, viewport } = await openGuest(browser, info, path);
    try {
      await waitGuestShell(page);
      await waitShell(page, viewport);
      if (viewport === "desktop") {
        await expect(menuButton(page), "1440 ☰ 0").toHaveCount(0);
        return;
      }
      await expectLeftmost(page, `둘러보기 ${path}`);
    } finally {
      await context.close();
    }
  });
}

test(`[GM-ui][S13g] 둘러보기 시트(390): 학교 '${GUEST_MENU.school}' · ${GUEST_MENU.active.join("·")} 활성 링크(둘러보기 경로) · ${GUEST_MENU.locked.join("·")} guest-lock(누르면 잠금 토스트, 이동 없음) · 관리 묶음 0 · '${GUEST_MENU.signup}' button-primary → 회원가입 · '${LOGOUT}' 0 / 1440 = ☰ 0`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openGuest(browser, info, devRules.routes["13-guest"]);
  try {
    await waitGuestShell(page);
    await waitShell(page, viewport);
    if (viewport === "desktop") {
      await expect(menuButton(page), "1440 ☰ 0").toHaveCount(0);
      await expect(menuSheet(page), "1440 시트 0").toHaveCount(0);
      return;
    }
    const sheet = await openSheet(page);
    await expect(sheet.locator("h2").first(), "시트 머리 = 데모 학교").toHaveText(exact(GUEST_MENU.school));
    const guestRoute: Record<string, string> = {
      [MENU_GROUPS[0][0]]: devRules.routes["13-guest"],
      [MENU_GROUPS[0][1]]: devRules.routes["2-guest"],
      [MENU_GROUPS[0][2]]: devRules.routes["17-guest"],
    };
    for (const label of GUEST_MENU.active) {
      const it = menuItem(sheet, label);
      await expect(it, `'${label}' 1`).toHaveCount(1);
      await expect(it, `'${label}' → 둘러보기 경로`).toHaveAttribute("href", guestRoute[label]);
    }
    await expect(sheet.locator('[aria-current="page"]'), "지금 화면 = 홈 활성").toHaveText(exact(MENU_GROUPS[0][0]));
    for (const label of GUEST_MENU.locked) {
      const it = menuItem(sheet, label);
      await expect(it, `'${label}' 1`).toHaveCount(1);
      await expect(it.locator(sel(rules.guest.lock)), `'${label}' guest-lock`).toHaveCount(1);
      expect(await it.evaluate((e) => e.tagName.toLowerCase()), `'${label}' 링크 아님`).not.toBe("a");
    }
    const others = MENU_GROUPS.flat().filter((l) => !GUEST_MENU.active.includes(l) && !GUEST_MENU.locked.includes(l));
    for (const label of others) await expect(menuItem(sheet, label), `둘러보기 '${label}' 0 (관리 숨김)`).toHaveCount(0);
    for (const t of MENU_GROUP_TITLES) await expect(sheet.getByText(t, { exact: true }), `묶음 제목 '${t}' 0`).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: LOGOUT, exact: true }), `'${LOGOUT}' 0`).toHaveCount(0);
    const signup = sheet.locator(sel("button-primary")).filter({ hasText: exact(GUEST_MENU.signup) });
    await expect(signup, `'${GUEST_MENU.signup}' button-primary 1`).toHaveCount(1);
    await expect(signup.locator("xpath=self::a | .//a").first(), "가입하기 → 회원가입").toHaveAttribute("href", routeOf(14));
    // 잠금 항목 누르기 → 잠금 토스트 · 주소 그대로
    const before = page.url();
    await menuItem(sheet, GUEST_MENU.locked[0]).click();
    await expect(page.locator(sel("ex-toast")).filter({ hasText: lockToastMessage() }).first(), "잠금 토스트").toBeVisible({ timeout: 10_000 });
    expect(page.url(), "잠금 → 이동 없음").toBe(before);
    await page.screenshot({ path: `test-results/v1-13g-menu-${viewport}.png` });
  } finally {
    await context.close();
  }
});
