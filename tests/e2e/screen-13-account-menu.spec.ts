// 셸 계정 메뉴 nav-account-menu (디자인 1.15 — rules.json app_exceptions["nav-account-menu"], d7 §10, dev-rules route_auth.logout):
// 로그인 후 셸이 있는 화면(dev-rules components["nav-account-menu"])마다 정확히 1개 · 로그인 전·둘러보기에는 0. C1 · R-ui
// 공용 계정은 메뉴를 열고 닫기만 한다 — "로그아웃" 은 누르지 않는다 (로그아웃 흐름은 shell-logout.spec.ts 의 일회용 계정).
// NoSchoolScreen(프로필 없는 세션)의 0 은 shell-no-school.spec.ts 에서 본다.
import { test, expect, type Page } from "@playwright/test";
import { openAs } from "./auth-state";
import { ROLE_LABEL, SCHOOL_A_ROLES } from "./db-helpers";
import { demoReagents, guestDetailPath } from "./guest-helpers";
import { PROFILE_ROLE, browserClient, browserSession, devRules, routeOf, rules, sel } from "./screen-helpers";
import { anonContext, shellAccountButton, shellAccountLabel, shellSchoolScope } from "./shell-helpers";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SCREEN = 13;
const MENU = "nav-account-menu";
const SCREENS = (devRules.components[MENU] ?? []).slice().sort((a, b) => a - b);
const ROUTE_AUTH = (devRules as unknown as { route_auth: Record<string, string> }).route_auth;
const EXCEPTION = (rules as unknown as { app_exceptions: Record<string, string> }).app_exceptions[MENU];
const LOGOUT = "로그아웃";

/** dev-rules route_auth 로 이 역할이 그 화면에 들어갈 수 있는지 ("admin만" · "교사·admin만") */
function canOpen(role: "student" | "teacher" | "admin", screen: number): boolean {
  const a = ROUTE_AUTH[String(screen)] ?? "";
  if (/교사·admin만/.test(a)) return role !== "student";
  if (/admin만/.test(a)) return role === "admin";
  return true;
}

async function pathOf(page: Page, screen: number): Promise<string> {
  if (screen !== 3) return routeOf(screen);
  const { client } = await browserClient(page);
  const one = await client.from("reagents").select("id").order("id").limit(1).single();
  expect(one.error, "대조: 자기 학교 시약").toBeNull();
  return routeOf(3).replace(/\[[^\]]+\]/, one.data!.id as string);
}

test(`[C1][S${SCREEN}] 기대값 원본: rules.json app_exceptions["${MENU}"] = 학교명 옆 ▾ · "${LOGOUT}" 1개 · dev-rules components["${MENU}"] = 로그인 후 셸 화면 (2~11·13, 화면 12 는 다음 run)`, () => {
  expect(EXCEPTION).toMatch(/▾/);
  expect(EXCEPTION).toContain(`'${LOGOUT}' 1개`);
  expect(SCREENS, "셸 화면").toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13]);
  for (const s of [1, 14, 15]) expect(SCREENS, `로그인 전 화면 ${s} 에 없음`).not.toContain(s);
  expect(ROUTE_AUTH.logout, "route_auth.logout: 둘러보기·로그인 전·NoSchoolScreen 에는 없음").toMatch(/둘러보기·로그인 전·NoSchoolScreen 에는 없음/);
});

for (const role of SCHOOL_A_ROLES as ("student" | "teacher" | "admin")[]) {
  const open = SCREENS.filter((s) => canOpen(role, s));
  // 폭 390 = nav-pill 학교명 버튼(글자 = 학교명), 폭 1440 = app-sidebar 계정 줄(글자 = "이름 · 역할", 시안 1.22 sidebar-account, d7 §23)
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]}: 들어갈 수 있는 셸 화면(${open.join("·")})마다 ${MENU} 정확히 1개 · 셸 계정 버튼(390 nav-pill 학교명 / 1440 app-sidebar "이름 · 역할", aria-haspopup=menu) 안 · 보임 · 홈에서 열면 role=menu 항목 "${LOGOUT}" 1개 (누르지 않음)`, async ({ browser }, info) => {
    test.setTimeout(360_000);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN);
    try {
      await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 45_000 });
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const shell = viewport === "mobile" ? "nav-pill" : rules.desktop_shell.component;
      const buttonText = await shellAccountLabel(page, viewport);
      for (const screen of open) {
        const path = await pathOf(page, screen);
        const res = await page.goto(path);
        expect(res?.status(), `화면 ${screen} ${path} 응답`).toBe(200);
        await page.waitForLoadState("load");
        expect(new URL(page.url()).pathname, `화면 ${screen}: 리다이렉트 없음`).toBe(path);
        await expect(shellSchoolScope(page, viewport), `화면 ${screen} ${shell}`).toHaveCount(1, { timeout: 45_000 });
        await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, { timeout: 45_000 });
        const menu = page.locator(sel(MENU));
        await expect(menu, `화면 ${screen}: ${MENU} 정확히 1개`).toHaveCount(1);
        await expect(menu, `화면 ${screen}: ${MENU} 보임`).toBeVisible();
        await expect(page.locator(`${sel(shell)} ${sel(MENU)}`), `화면 ${screen}: ${MENU} 는 ${shell} 안`).toHaveCount(1);
        const button = shellAccountButton(page, viewport);
        await expect(button, `화면 ${screen}: 계정 메뉴 버튼 1개`).toHaveCount(1);
        await expect(button.locator(sel(MENU)), `화면 ${screen}: ▾ 는 계정 버튼 안`).toHaveCount(1);
        await expect(button, `화면 ${screen}: 버튼 글자 = "${buttonText}"`).toHaveText(new RegExp(`^\\s*${esc(buttonText)}\\s*$`));
        // 응답 본문(서버 HTML)은 폭을 모르는 첫 그림이라 두 폭의 셸(nav-pill · app-sidebar)이 다 있다 — 개수는 하이드레이션 뒤 DOM(위 1개)으로 본다
        const html = await res!.text();
        expect(html, `화면 ${screen}: 응답 본문에 ${MENU}`).toContain(`data-component="${MENU}"`);
      }
      // 홈에서 메뉴 열고 닫기 (로그아웃은 누르지 않는다)
      await page.goto(routeOf(SCREEN));
      await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 45_000 });
      const button = shellAccountButton(page, viewport);
      await expect(async () => {
        await button.click();
        await expect(page.getByRole("menu"), "메뉴 열림").toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await expect(page.getByRole("menu").getByRole("menuitem"), "메뉴 항목 1개").toHaveCount(1);
      await expect(page.getByRole("menu").getByRole("menuitem"), `항목 "${LOGOUT}"`).toHaveText(new RegExp(`^\\s*${LOGOUT}\\s*$`));
      await expect(page.getByRole("menu"), "메뉴에 학교 목록 없음 (학교 전환 없음)").not.toContainText(me.schoolName);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu"), "Esc → 닫힘").toHaveCount(0);
      await expect(page.locator(sel(MENU))).toHaveCount(1);
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S${SCREEN}] 로그인 전(랜딩 ${routeOf(15)} · ${routeOf(1)} · ${routeOf(14)})·둘러보기(${devRules.routes["13-guest"]} · ${devRules.routes["2-guest"]} · ${devRules.routes["3-guest"]}): ${MENU} 0 (화면·응답 본문)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const demo = (await demoReagents())[0];
  const paths = [routeOf(15), routeOf(1), routeOf(14), devRules.routes["13-guest"], devRules.routes["2-guest"], guestDetailPath(demo.id)];
  const context = await anonContext(browser, info);
  try {
    const page = await context.newPage();
    for (const path of paths) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} 응답`).toBe(200);
      await page.waitForLoadState("load");
      await expect(page.locator("body"), `${path} 그려짐`).not.toBeEmpty();
      await expect(page.locator(sel("nav-pill")).or(page.locator(sel("ex-auth-form-card"))).or(page.locator(sel("landing-hero"))).first(), `${path} 본문`).toBeVisible({ timeout: 45_000 });
      await expect(page.locator(sel(MENU)), `${path}: ${MENU} 0`).toHaveCount(0);
      await expect(page.locator('button[aria-haspopup="menu"]'), `${path}: 계정 메뉴 버튼 0`).toHaveCount(0);
      expect(await res!.text(), `${path}: 응답 본문에 ${MENU}`).not.toContain(`data-component="${MENU}"`);
    }
  } finally {
    await context.close();
  }
});
