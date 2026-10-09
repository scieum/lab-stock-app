// 로그아웃 (셸 nav-pill 학교명 메뉴) — harness/d7-data.md §10, dev-rules.json route_auth.logout.
// 기준: 로그인 후 모든 화면의 nav-pill 학교명을 누르면 작은 메뉴가 열리고 "로그아웃" 1개가 있다 → POST /api/auth/logout → /login.
//       시안에 없는 요소 — 새 data-component 이름을 만들지 않는다. 학교 전환 없음(메뉴에 학교 목록 없음). 둘러보기(/demo)·로그인 전 화면에는 없다.
//
// 로그아웃은 공용 계정으로 하지 않는다: app/api/auth/logout 은 signOut() 을 scope 없이 부른다(supabase-js 기본 = global —
// 그 계정의 모든 세션을 서버에서 끝낸다). 공용 계정 세션은 역할별 storageState 로 워커들이 나눠 쓰므로(auth-state.ts)
// 여기서 로그아웃하면 같은 계정을 쓰는 다른 병렬 테스트의 세션 갱신이 깨진다.
// → 일회용 학교의 일회용 계정(학생·교사·admin)으로, 테스트마다 새로 만든 세션을 그 테스트의 브라우저 컨텍스트에만 심어서 한다.
// service role 은 준비·정리에만 쓴다. 공용 계정으로는 메뉴를 열고 닫기만 한다(로그아웃 요청 0건).
import { test, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { anonClient } from "./db-helpers";
import { browserSession, devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { HAS_SERVICE, forgetSession, openTemp, sessionFor, type TempUser } from "./screen-8-helpers";
import { anonContext, shellAccountLabel } from "./shell-helpers";
import { NO_S11_RESIDUE, cleanup, exact, makeFixture, prepCabinet, prepReagent, type S11Fixture } from "./screen-11-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "logout";
const HOME = 13;
const LIST = 2;
const HISTORY = 10;
const CABINETS = 11;
const LOGIN = 1;
const SIGNUP = 14;
const LANDING = 15;
const LOGOUT_LABEL = "로그아웃";
const LOGOUT_API = "/api/auth/logout";
const NAV = "nav-pill";
const N1 = rules.never.N1;
/** 로그인 후 셸 화면 대표 (홈·시약 목록·기록·시약장) */
const SHELL_SCREENS = [HOME, LIST, HISTORY, CABINETS];
const SESSION_COOKIE = /^sb-.*-auth-token(\.\d+)?$/;

let fixtureCache: Promise<S11Fixture> | null = null;

/** 일회용 학교(admin·교사·학생) + 시약장·시약 1개씩 (화면에 학교 데이터가 있게) */
function fixture(info: TestInfo): Promise<S11Fixture> {
  fixtureCache ??= (async () => {
    const f = await makeFixture(info, GROUP);
    await prepCabinet(f);
    await prepReagent(f, "로그아웃");
    return f;
  })();
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약장·시약 잔여물").toEqual(NO_S11_RESIDUE);
});

/** 로그인 전·둘러보기 화면의 nav-pill (폭 390) */
const nav = (page: Page) => page.locator(sel(NAV));
/**
 * 로그인 전·둘러보기 화면의 셸 (run d, d7 §23 · rules desktop_shell.pre_login · guest.desktop):
 * 폭 390 = nav-pill, 폭 1440 = 로그인 전 web-header / 둘러보기 app-sidebar
 */
const anonShellName = (page: Page, guest: boolean): string =>
  vpOf(page) === "mobile" ? NAV : guest ? rules.desktop_shell.component : (rules as unknown as { desktop_shell: { pre_login: { component: string } } }).desktop_shell.pre_login.component;
const anonShell = (page: Page, guest: boolean) => page.locator(sel(anonShellName(page, guest)));
/** 지금 폭 (dev-rules viewports) */
const vpOf = (page: Page): ViewportName => (page.viewportSize()?.width === devRules.viewports.desktop[0] ? "desktop" : "mobile");
/**
 * 로그인 후 셸의 계정 메뉴 자리: 폭 390 = nav-pill(학교명 ▾), 폭 1440 = app-sidebar(위 학교명 · 아래 계정 줄 "이름 · 역할" ▾)
 * — rules 1.22 desktop_shell, d7 §23 (계정 ▾ → 로그아웃 = d7 §10 nav-account-menu 역할)
 */
const shell = (page: Page) => page.locator(sel(vpOf(page) === "mobile" ? NAV : rules.desktop_shell.component));
const shellName = (page: Page) => (vpOf(page) === "mobile" ? NAV : rules.desktop_shell.component);
const menuButton = (page: Page) => shell(page).locator('button[aria-haspopup="menu"]');
const menu = (page: Page) => page.getByRole("menu");
const occurrences = (text: string, word: string) => text.split(word).length - 1;

async function waitShell(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await expect(shell(page), shellName(page)).toHaveCount(1);
  await expect(page.locator("main").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, { timeout: 45_000 });
}

/** 메뉴를 연다 (하이드레이션 전 누름은 아무 일도 하지 않고, 다시 누르면 닫히므로 닫혀 있을 때만 누른다) */
async function openMenu(page: Page): Promise<void> {
  const button = menuButton(page);
  await expect(button, "학교명 메뉴 버튼").toHaveCount(1);
  await expect(async () => {
    if (!(await menu(page).isVisible())) await button.click({ timeout: 5_000 });
    await expect(menu(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * 계정 메뉴의 모양 (d7 §10 · §23): 계정 버튼(390 학교명 / 1440 "이름 · 역할") = 메뉴 버튼 · 셸에 학교명 1번 · 메뉴에 "로그아웃" 1개만
 */
async function expectMenu(page: Page, schoolName: string, where: string): Promise<void> {
  const button = menuButton(page);
  const label = await shellAccountLabel(page, vpOf(page));
  const NAV = shellName(page);
  const nav = shell;
  await expect(button, `${where}: 계정 메뉴 버튼 1개`).toHaveCount(1);
  await expect(button, `${where}: 버튼 글자 = "${label}"`).toHaveText(exact(label));
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(menu(page), `${where}: 처음에는 메뉴 닫힘`).toHaveCount(0);
  await expect(nav(page).getByText(LOGOUT_LABEL), `${where}: 닫힌 메뉴의 "${LOGOUT_LABEL}" 은 없다`).toHaveCount(0);
  expect(occurrences(await nav(page).innerText(), schoolName), `${where}: 학교명은 ${NAV} 에 1번`).toBe(1);

  await openMenu(page);
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(menu(page), `${where}: 메뉴 1개`).toHaveCount(1);
  expect(await nav(page).evaluate((n, m) => !!m && n.contains(m), await menu(page).elementHandle()), `${where}: 메뉴는 ${NAV} 안`).toBe(true);
  const items = menu(page).getByRole("menuitem");
  await expect(items, `${where}: 메뉴 항목 1개`).toHaveCount(1);
  await expect(items, `${where}: 메뉴 항목 = "${LOGOUT_LABEL}"`).toHaveText(exact(LOGOUT_LABEL));
  await expect(items).toBeEnabled();
  expect((await menu(page).innerText()).trim(), `${where}: 메뉴 글자는 "${LOGOUT_LABEL}" 뿐 (학교 목록 없음)`).toBe(LOGOUT_LABEL);
  await expect(menu(page).locator("a, input, select"), `${where}: 메뉴에 링크·입력 없음`).toHaveCount(0);
  expect(occurrences(await nav(page).innerText(), schoolName), `${where}: 메뉴를 열어도 학교명은 1번`).toBe(1);
  const names = [...new Set((await page.locator("body").innerText()).match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
  expect(names, `${where}: 학교명 종류`).toHaveLength(N1.distinct_school_names);
  // 새 data-component 이름을 만들지 않는다
  const known = Object.keys(devRules.components);
  const used = await page.locator("[data-component]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-component") ?? ""))]);
  for (const name of used) expect(known, `${where}: data-component "${name}" 은 dev-rules components 에 있는 이름`).toContain(name);
}

async function closeByEscape(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(menu(page), "Esc 로 닫힘").toHaveCount(0);
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
}

function watchLogout(page: Page): { count: () => number } {
  let n = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === LOGOUT_API) n += 1;
  });
  return { count: () => n };
}

const sessionCookies = async (context: BrowserContext) => (await context.cookies()).filter((c) => SESSION_COOKIE.test(c.name) && c.value !== "");

// =====================================================================
// 메뉴 모양 — 공용 계정(학교 A)은 열고 닫기만
// =====================================================================

test(`[C1][S${HOME}] 학교A 교사 셸 화면(홈·시약 목록·기록·시약장): ${NAV} 학교명 = 메뉴 버튼(aria-haspopup=menu) · 학교명은 ${NAV} 에 1번 · 메뉴에 "${LOGOUT_LABEL}" 1개만(학교 목록 없음) · 새 data-component 없음 · Esc·바깥 누름으로 닫힘 · 로그아웃 요청 0건`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page } = await openAs(browser, info, "teacher", HOME);
  const logout = watchLogout(page);
  try {
    await waitShell(page);
    const me = await browserSession(page);
    for (const screen of SHELL_SCREENS) {
      await page.goto(routeOf(screen));
      await waitShell(page);
      expect(new URL(page.url()).pathname).toBe(routeOf(screen));
      await expectMenu(page, me.schoolName, `화면 ${screen}`);
      await closeByEscape(page);
      await expect(menuButton(page), "Esc 뒤 포커스는 계정 메뉴 버튼").toBeFocused();
      // 바깥을 누르면 닫힌다
      await openMenu(page);
      await page.mouse.click(1, 1); // 화면 왼쪽 위 모서리 (여백 — 누르는 요소가 없는 자리)
      await expect(menu(page), "바깥 누름으로 닫힘").toHaveCount(0);
      // 다시 누르면 열고 닫힌다
      await openMenu(page);
      await menuButton(page).click();
      await expect(menu(page), "버튼을 다시 누르면 닫힘").toHaveCount(0);
      expect(new URL(page.url()).pathname, "메뉴를 여닫아도 화면은 그대로").toBe(routeOf(screen));
    }
    expect(logout.count(), "로그아웃 요청 0건").toBe(0);
    expect((await sessionCookies(context)).length, "세션 쿠키는 그대로").toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S${HOME}] 로그인 전 화면(랜딩 ${routeOf(LANDING)} · ${routeOf(LOGIN)} · ${routeOf(SIGNUP)})과 둘러보기(${devRules.routes["13-guest"]} · ${devRules.routes["2-guest"]}): 셸(390 ${NAV} / 1440 web-header·app-sidebar) 에 메뉴 버튼·"${LOGOUT_LABEL}" 없음 · 둘러보기 학교명은 글자`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const context = await anonContext(browser, info);
  try {
    const page = await context.newPage();
    const logout = watchLogout(page);
    const guest = [devRules.routes["13-guest"], devRules.routes["2-guest"]];
    for (const path of [routeOf(LANDING), routeOf(LOGIN), routeOf(SIGNUP), ...guest]) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} 응답`).toBe(200);
      await page.waitForLoadState("load");
      expect(new URL(page.url()).pathname, "리다이렉트 없음").toBe(path);
      const isGuest = guest.includes(path);
      const shellNm = anonShellName(page, isGuest);
      await expect(anonShell(page, isGuest), `${path}: ${shellNm} 1`).toHaveCount(1, { timeout: 30_000 });
      await expect(anonShell(page, isGuest).first(), `${path}: ${shellNm}`).toBeVisible();
      await expect(anonShell(page, isGuest).locator("[aria-haspopup]"), `${path}: ${shellNm} 메뉴 버튼`).toHaveCount(0);
      await expect(page.locator("[aria-haspopup=\"menu\"]"), `${path}: 계정 메뉴 버튼 0`).toHaveCount(0);
      await expect(page.getByRole("menu"), `${path}: 메뉴`).toHaveCount(0);
      await expect(page.getByRole("menuitem"), `${path}: 메뉴 항목`).toHaveCount(0);
      await expect(page.getByText(LOGOUT_LABEL), `${path}: "${LOGOUT_LABEL}" 글자`).toHaveCount(0);
      expect(await res!.text(), `${path}: 응답 본문에 "${LOGOUT_LABEL}"`).not.toContain(LOGOUT_LABEL);
      if (guest.includes(path)) {
        const school = anonShell(page, true).getByText(exact(rules.guest.school_name));
        await expect(school, `${path}: 둘러보기 학교명`).toHaveCount(1);
        expect(await school.evaluate((el) => el.closest("button, a, [role=button]") === null), `${path}: 둘러보기 학교명은 누르는 요소가 아니다`).toBe(true);
        // 눌러도 메뉴가 열리지 않는다
        await school.click({ force: true });
        await expect(page.getByRole("menu")).toHaveCount(0);
      }
    }
    expect(logout.count(), "로그아웃 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 로그아웃 실행 — 일회용 계정 (테스트마다 새 세션, 그 컨텍스트에만)
// =====================================================================

const RUNS: { who: "student" | "teacher" | "admin"; label: string; from: number }[] = [
  { who: "student", label: "학생", from: HOME },
  { who: "teacher", label: "교사", from: CABINETS },
  { who: "admin", label: "admin", from: HISTORY },
];

test.describe("일회용 계정", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정을 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

  for (const run of RUNS) {
    test(`[R-ui][S${HOME}] 일회용 ${run.label}: 셸 화면마다 학교명 메뉴 = "${LOGOUT_LABEL}" 1개 → 화면 ${run.from} 에서 "${LOGOUT_LABEL}" → POST ${LOGOUT_API} 1건 → ${routeOf(LOGIN)} · 세션 쿠키 없어짐 · 뒤로가기 → 앱 화면 미표시(${routeOf(LOGIN)} 또는 로그인 전 랜딩) · 앱 주소 직접 접근 → ${routeOf(LOGIN)} (${routeOf(LANDING)} 은 로그인 전 랜딩) · 응답에 학교명 없음`, async ({ browser }, info) => {
      test.setTimeout(360_000);
      const f = await fixture(info);
      const user: TempUser = f[run.who];
      // 이 테스트만의 새 세션 (앞 테스트의 로그아웃으로 끝난 세션을 다시 심지 않는다)
      const earlier = run.who === "admin" ? await sessionFor(user) : null;
      forgetSession(user.id);
      const { context, page } = await openTemp(browser, info, user, routeOf(HOME));
      const logout = watchLogout(page);
      try {
        await waitShell(page);
        const me = await browserSession(page);
        expect(me.schoolName, "일회용 학교").toBe(f.school.name);
        expect(me.role, "일회용 계정 역할").toBe(run.who);
        const screens = [...SHELL_SCREENS.filter((s) => s !== run.from), run.from];
        for (const screen of screens) {
          await page.goto(routeOf(screen));
          await waitShell(page);
          expect(new URL(page.url()).pathname, `화면 ${screen} 경로`).toBe(routeOf(screen));
          await expectMenu(page, f.school.name, `${run.label} 화면 ${screen}`);
          if (screen !== run.from) await closeByEscape(page);
        }
        expect((await sessionCookies(context)).length, "로그아웃 전 세션 쿠키").toBeGreaterThan(0);
        expect(logout.count(), "아직 로그아웃 요청 없음").toBe(0);

        // 로그아웃
        const [res] = await Promise.all([
          page.waitForResponse((r) => new URL(r.url()).pathname === LOGOUT_API, { timeout: 30_000 }),
          menu(page).getByRole("menuitem", { name: exact(LOGOUT_LABEL) }).click(),
        ]);
        expect(res.request().method(), "로그아웃 요청 방식").toBe("POST");
        expect(res.status(), "로그아웃 응답").toBe(200);
        await page.waitForURL((u) => u.pathname === routeOf(LOGIN), { timeout: 45_000 });
        await expect(page.locator(sel("ex-auth-form-card")).first(), "로그인 화면").toBeVisible({ timeout: 30_000 });
        expect(logout.count(), "로그아웃 요청 1건").toBe(1);
        expect(await sessionCookies(context), "세션 쿠키 없어짐").toEqual([]);
        await expect(page.locator("body"), "로그인 화면에 학교명 없음").not.toContainText(f.school.name);
        await expect(nav(page).locator("[aria-haspopup]"), "로그인 화면 nav-pill 에 메뉴 없음").toHaveCount(0);
        await expect(page.locator(sel(rules.tab_bar.component)), "로그인 화면에 tab-bar 없음").toHaveCount(0);

        // 뒤로가기 → 앱 화면이 다시 보이지 않는다 (`/` 로 돌아가면 로그인 전 랜딩 — dev-rules route_auth 15, 그 밖은 로그인 화면)
        await page.goBack().catch(() => undefined);
        if (routeOf(run.from) === routeOf(LANDING)) {
          await expect(page.locator(sel("landing-hero")).first(), "뒤로가기 → 로그인 전 랜딩").toBeVisible({ timeout: 30_000 });
          expect(new URL(page.url()).pathname).toBe(routeOf(LANDING));
        } else {
          await expect.poll(() => new URL(page.url()).pathname, { message: "뒤로가기 → 로그인 화면", timeout: 30_000 }).toBe(routeOf(LOGIN));
          await expect(page.locator(sel("ex-auth-form-card")).first()).toBeVisible({ timeout: 30_000 });
        }
        await expect(page.locator("body"), "뒤로가기 뒤 학교명 없음").not.toContainText(f.school.name);
        for (const c of ["home-summary", "reagent-row", "cabinet-switcher", "cabinet-slot", rules.tab_bar.component]) await expect(page.locator(sel(c)), `뒤로가기 뒤 ${c}`).toHaveCount(0);
        await expect(nav(page).locator("[aria-haspopup]"), "뒤로가기 뒤 메뉴 없음").toHaveCount(0);

        // 앱 주소 직접 접근
        const guarded = [routeOf(LIST), routeOf(HISTORY), routeOf(CABINETS), routeOf(4), routeOf(7), routeOf(8)];
        for (const path of guarded) {
          const direct = await context.request.get(path, { maxRedirects: 0 });
          expect(direct.status(), `${path} 직접 요청은 리다이렉트`).toBeGreaterThanOrEqual(300);
          expect(direct.status()).toBeLessThan(400);
          expect(new URL(direct.headers()["location"], info.project.use.baseURL).pathname, `${path} → ${routeOf(LOGIN)}`).toBe(routeOf(LOGIN));
          expect(await direct.text(), `${path} 응답 본문에 학교명`).not.toContain(f.school.name);
          await page.goto(path);
          await page.waitForURL((u) => u.pathname === routeOf(LOGIN), { timeout: 30_000 });
          await expect(page.locator(sel("ex-auth-form-card")).first()).toBeVisible();
        }
        // `/` 는 로그인 전 랜딩 (dev-rules route_auth 15)
        const home = await page.goto(routeOf(LANDING));
        expect(home?.status()).toBe(200);
        await expect(page.locator(sel("landing-hero")).first(), "로그아웃 뒤 / = 랜딩").toBeVisible({ timeout: 30_000 });
        await expect(page.locator(sel("home-summary")), "로그아웃 뒤 홈 요약 없음").toHaveCount(0);
        await expect(page.locator("body")).not.toContainText(f.school.name);
        await expect(nav(page).locator("[aria-haspopup]")).toHaveCount(0);
        expect(await sessionCookies(context), "끝까지 세션 쿠키 없음").toEqual([]);

        // 참고 기록(판정 아님): 같은 계정의 다른 세션이 서버에서도 끝났는지 = signOut scope
        if (earlier) {
          const r = await anonClient().auth.refreshSession({ refresh_token: earlier.refresh_token });
          info.annotations.push({
            type: "logout-scope",
            description: r.error ? `같은 계정의 다른 세션 갱신 실패 (${r.error.message}) → global scope` : "같은 계정의 다른 세션 갱신 성공 → local scope",
          });
        }
      } finally {
        await context.close();
      }
    });
  }
});
