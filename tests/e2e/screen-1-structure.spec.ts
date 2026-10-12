// 화면 1 (/login) 구조 규칙: C1 · C2 · R-ui · V1
// 기대값: design/rules.json (screens_required, tab_bar, roles, auth) · harness/dev-rules.json (components, routes, viewports)
//         · design/frames/1-{mobile|desktop}.json (컴포넌트 노드 개수)
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { expectPreLoginShell, preLoginZero } from "./pre-login-helpers";
import { ROLE_LABEL, SCHOOL_A_ROLES } from "./db-helpers";
import { openAs } from "./auth-state";
import {
  PROFILE_ROLE,
  browserSession,
  countComponent,
  devRules,
  roleChecks,
  routeOf,
  rules,
  sel,
  useProjectViewport,
  waitLoginScreen,
  type RoleCheck,
} from "./screen-helpers";
import { frameCount } from "./screen-14-helpers";
import { readdirSync, readFileSync as readFrame } from "node:fs";
import { NEW_FRAMES_DIR } from "../frames";

/** 화면 1 프레임의 노드 이름: 기본(1-mobile · 1-desktop) / 상태(1-not-found-* 등) */
const frameNamesOf = (files: string[]) =>
  new Set(files.flatMap((f) => (JSON.parse(readFrame(join(NEW_FRAMES_DIR, f), "utf8")) as { frames: { nodes: { name: string }[] }[] }).frames[0].nodes.map((n) => n.name)));
const SCREEN1_FILES = readdirSync(NEW_FRAMES_DIR).filter((f) => /^1-.*\.json$/.test(f));
const BASE_NAMES = frameNamesOf(SCREEN1_FILES.filter((f) => /^1-(mobile|desktop)\.json$/.test(f)));
const VARIANT_NAMES = frameNamesOf(SCREEN1_FILES.filter((f) => !/^1-(mobile|desktop)\.json$/.test(f)));

const SCREEN = 1;
const SIGNUP = Number((rules as unknown as { auth: { signup_screen: number } }).auth.signup_screen);

async function assertRoleChecks(page: Page, checks: RoleCheck[]) {
  for (const c of checks) {
    const n = await countComponent(page, c.component);
    if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
    else expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
  }
}

// ---------- C2 ----------
test(`[C2][S${SCREEN}] 탭바 개수 = rules.json tab_bar 기준 (화면 ${SCREEN})`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page);
  const tb = rules.tab_bar;
  const shown = vp === "mobile" && tb.mobile_screens.includes(SCREEN);
  expect(await countComponent(page, tb.component), `${vp} ${tb.component}`).toBe(shown ? 1 : 0);
  expect(await countComponent(page, tb.item), `${vp} ${tb.item}`).toBe(shown ? tb.items : 0);
});

// ---------- C1 ----------
test(`[C1][S${SCREEN}] rules.json screens_required[${SCREEN}] 컴포넌트 모두 존재`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page);
  const raw = rules.screens_required[String(SCREEN)];
  const required = Array.isArray(raw) ? raw : [];
  for (const name of required) {
    expect(await countComponent(page, name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
  }
});

test(`[C1][S${SCREEN}] 화면 ${SCREEN} 시안 컴포넌트(dev-rules components) 모두 존재 · 개수 ≥ 시안 프레임`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page);
  const names = Object.entries(devRules.components)
    .filter(([, screens]) => screens.includes(SCREEN))
    .map(([n]) => n);
  expect(names.length, `dev-rules components 에 화면 ${SCREEN} 컴포넌트가 있어야 함`).toBeGreaterThan(0);
  await expectPreLoginShell(page, SCREEN, vp);
  for (const name of names) {
    // 탭바는 C2 에서 화면별 기대값으로 본다
    if (name === rules.tab_bar.component || name === rules.tab_bar.item) continue;
    // 데스크톱 재구성 run d (d7 §23, rules desktop_shell.pre_login): 1440 = nav-pill·app-sidebar 0, 390 = web-header·데스크톱 랜딩 전용 0
    if (preLoginZero(SCREEN, vp, name)) {
      await expect(page.locator(sel(name)), `${name} — 폭 ${vp} 에서 0 (pre_login)`).toHaveCount(0);
      continue;
    }
    // 1.26 dev-rules: 상태 프레임(1-not-found — 404 카드 · web-header 버튼)에만 있는 컴포넌트는 로그인 화면 기본 상태에 없다 → not-found.spec.ts 에서 본다
    if (!BASE_NAMES.has(name)) {
      expect(VARIANT_NAMES.has(name), `${name}: 기본 프레임에 없으면 화면 ${SCREEN} 상태 프레임에는 있어야 함`).toBe(true);
      continue;
    }
    const want = Math.max(1, frameCount(SCREEN, vp, name));
    expect(await countComponent(page, name), `${name} (시안 ${SCREEN}-${vp} 노드 수)`).toBeGreaterThanOrEqual(want);
  }
});

test(`[C1][S${SCREEN}] 로그인 폼 = 개인 이메일·비밀번호 입력만 (rules.json auth.login_id)`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page);
  const form = page.locator(`form${sel("ex-auth-form-card")}, ${sel("ex-auth-form-card")} form`).first();
  await expect(form).toBeVisible();
  const fields = form.locator("input:not([type=hidden]), select, textarea");
  const names = (await fields.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).name))).sort();
  expect(names, "로그인 폼 입력").toEqual(["email", "password"]);
  await expect(form.locator('input[name="email"]')).toHaveAttribute("type", "email");
  await expect(form.locator('input[name="password"]')).toHaveAttribute("type", "password");
});

test(`[C1][S${SCREEN}] 회원가입 링크(button-pill-soft) → routes[${SIGNUP}] 화면`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page);
  const link = page.locator(`a${sel("button-pill-soft")}[href="${routeOf(SIGNUP)}"]`);
  await expect(link, `href=${routeOf(SIGNUP)} 인 button-pill-soft`).toHaveCount(1);
  await link.click();
  await page.waitForURL((u) => u.pathname === routeOf(SIGNUP), { timeout: 30_000 });
  await expect(page.locator(sel("ex-auth-form-card")).first()).toBeVisible();
  // 회원가입 화면에는 학교 선택이 있다 (rules.json never.N1.school_select_screen)
  expect(rules.never.N1.school_select_screen).toBe(SIGNUP);
  for (const level of rules.never.N1.school_select_levels) {
    await expect(page.locator(sel(level)), `${routeOf(SIGNUP)} ${level}`).toHaveCount(1);
  }
});

test(`[C1][S${SCREEN}] 비밀번호 찾기 링크 → /forgot-password (이메일 입력 폼, 학교 선택 0)`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page);
  const link = page.locator(`${sel("ex-auth-form-card")} a[href="/forgot-password"]`);
  await expect(link).toHaveCount(1);
  await link.click();
  await page.waitForURL((u) => u.pathname === "/forgot-password", { timeout: 30_000 });
  await expect(page.locator(sel("ex-auth-form-card")).first()).toBeVisible();
  await expect(page.locator('form input[name="email"]')).toHaveCount(1);
  await expect(page.locator('form input[name="password"]')).toHaveCount(0);
  await expect(page.locator('[data-component^="school-select"]')).toHaveCount(0);
});

// ---------- R-ui ----------
test(`[R-ui][S${SCREEN}] 로그인 전 화면 ${SCREEN}: roles R1~R7 역할 제한 컴포넌트 0개`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page);
  const checks = roleChecks(SCREEN, null);
  expect(checks.length, "rules.json roles 에서 만든 검사").toBeGreaterThan(0);
  await assertRoleChecks(page, checks);
});

// d7 §26 QA 개선 (1): 로그인 상태로 화면 1(/login) 을 열면 홈(/) 으로 보낸다 — 로그인 상태의 화면 1 은 없다.
// (이전 run 의 "로그인 상태에서도 화면 1 이 열린다 + roles 검사" 기대를 이 결정으로 바꿨다. 비로그인 화면 1 roles 검사는 위 테스트)
for (const role of SCHOOL_A_ROLES) {
  test(`[R-ui][C1][S${SCREEN}] ${ROLE_LABEL[role]} 로그인 상태로 화면 ${SCREEN} → ${routeOf(13)} (d7 §26 QA (1)) · 화면 ${SCREEN} 폼 0`, async ({ browser }, info) => {
    test.setTimeout(90_000);
    const { context, page } = await openAs(browser, info, role, 13);
    try {
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      await page.goto(routeOf(SCREEN));
      await page.waitForURL((u) => u.pathname === routeOf(13), { timeout: 30_000 });
      await expect(page.locator(sel("home-summary")).first(), "홈 화면").toBeVisible({ timeout: 30_000 });
      expect(await page.locator(sel("ex-auth-form-card")).count(), `화면 ${SCREEN} 폼 0`).toBe(0);
    } finally {
      await context.close();
    }
  });
}

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page).catch(() => undefined);
  await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${vp}.png`), fullPage: true });
});
