// 화면 15 (랜딩, 로그인 전 `/`) 구조 규칙: C1 · C2 · R-ui(로그인 전) · V1
// 기대값: design/rules.json (screens_required, tab_bar, roles) · harness/dev-rules.json (routes, components, viewports)
//         · design/frames/15-{mobile|desktop}.json (컴포넌트 노드 개수)
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { countComponent, devRules, roleChecks, routeOf, rules, sel, useProjectViewport } from "./screen-helpers";
import { frameCount } from "./screen-14-helpers";
import { LOGIN, SCREEN, SIGNUP, assertSharedRootRoute, waitLanding } from "./screen-15-helpers";

// ---------- C1 ----------
test(`[C1][S${SCREEN}] rules.json screens_required[${SCREEN}] 컴포넌트 모두 존재·보임 · feature-card 개수 = 시안 노드 수`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  assertSharedRootRoute();
  await page.goto(routeOf(SCREEN));
  await waitLanding(page);
  expect(new URL(page.url()).pathname, "로그인 전 `/` 는 랜딩에 머무름").toBe(routeOf(SCREEN));

  const raw = rules.screens_required[String(SCREEN)];
  expect(Array.isArray(raw), `rules.json screens_required["${SCREEN}"] 가 목록`).toBe(true);
  const required = raw as string[];
  expect(required.length, "screens_required 항목").toBeGreaterThan(0);
  for (const name of required) {
    const inFrame = frameCount(SCREEN, vp, name);
    expect(inFrame, `시안 ${SCREEN}-${vp} 에 ${name} 노드`).toBeGreaterThanOrEqual(1);
    await expect(page.locator(sel(name)), `${name} 개수 = 시안 노드 수 ${inFrame}`).toHaveCount(inFrame);
    for (let i = 0; i < inFrame; i++) {
      await expect(page.locator(sel(name)).nth(i), `${name}[${i}] 보임`).toBeVisible();
    }
  }
});

test(`[C1][S${SCREEN}] 화면 ${SCREEN} 시안 컴포넌트(dev-rules components) 모두 존재 · 개수 ≥ 시안 프레임`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLanding(page);
  const names = Object.entries(devRules.components)
    .filter(([, screens]) => screens.includes(SCREEN))
    .map(([n]) => n);
  expect(names.length, `dev-rules components 에 화면 ${SCREEN} 컴포넌트가 있어야 함`).toBeGreaterThan(0);
  for (const name of names) {
    // 탭바는 C2 에서 화면별 기대값으로 본다
    if (name === rules.tab_bar.component || name === rules.tab_bar.item) continue;
    const want = Math.max(1, frameCount(SCREEN, vp, name));
    expect(await countComponent(page, name), `${name} (시안 ${SCREEN}-${vp} 노드 수)`).toBeGreaterThanOrEqual(want);
  }
});

test(`[C1][S${SCREEN}] landing-cta 링크 href = routes["${SIGNUP}"]·routes["${LOGIN}"] · 클릭 시 실제 이동`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLanding(page);
  const cta = page.locator(sel("landing-cta"));
  await expect(cta, "landing-cta 1개").toHaveCount(1);

  const signup = cta.locator(`${sel("button-primary")}[href]`);
  const login = cta.locator(`${sel("button-outline")}[href]`);
  await expect(signup, "회원가입 버튼(button-primary) 링크").toHaveCount(1);
  await expect(login, "로그인 버튼(button-outline) 링크").toHaveCount(1);
  await expect(signup, "회원가입 href").toHaveAttribute("href", routeOf(SIGNUP));
  await expect(login, "로그인 href").toHaveAttribute("href", routeOf(LOGIN));
  expect((await signup.innerText()).trim(), "회원가입 라벨").toBe("회원가입");
  expect((await login.innerText()).trim(), "로그인 라벨").toBe("로그인");

  await signup.click();
  await page.waitForURL((u) => u.pathname === routeOf(SIGNUP), { timeout: 30_000 });
  await expect(page.locator(sel("ex-auth-form-card")).first(), "회원가입 화면 표시").toBeVisible();

  await page.goto(routeOf(SCREEN));
  await waitLanding(page);
  await page.locator(sel("landing-cta")).locator(`${sel("button-outline")}[href]`).click();
  await page.waitForURL((u) => u.pathname === routeOf(LOGIN), { timeout: 30_000 });
  await expect(page.locator(sel("ex-auth-form-card")).first(), "로그인 화면 표시").toBeVisible();
});

// ---------- C2 ----------
test(`[C2][S${SCREEN}] 탭바 개수 = rules.json tab_bar 기준 (화면 ${SCREEN} 은 mobile_screens 에 없음)`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLanding(page);
  const tb = rules.tab_bar;
  const shown = vp === "mobile" && tb.mobile_screens.includes(SCREEN);
  await expect(page.locator(sel(tb.component)), `${vp} ${tb.component}`).toHaveCount(shown ? 1 : 0);
  await expect(page.locator(sel(tb.item)), `${vp} ${tb.item}`).toHaveCount(shown ? tb.items : 0);
});

// ---------- R-ui (로그인 전) ----------
test(`[R-ui][S${SCREEN}] 로그인 전 화면 ${SCREEN}: roles R1~R7 역할 제한 컴포넌트 0개`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLanding(page);
  const checks = roleChecks(SCREEN, null);
  expect(checks.length, "rules.json roles 에서 만든 검사").toBeGreaterThan(0);
  for (const c of checks) {
    const n = await countComponent(page, c.component);
    if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
    else expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
  }
});

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLanding(page).catch(() => undefined);
  await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${vp}.png`), fullPage: true });
});
