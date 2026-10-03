// 화면 15 (랜딩, 로그인 전 `/`) 구조 규칙: C1 · C2 · R-ui(로그인 전) · V1
// 기대값: design/rules.json (screens_required, tab_bar, roles) · harness/dev-rules.json (routes, components, viewports)
//         · design/frames/15-{mobile|desktop}.json (컴포넌트 노드 개수)
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { countComponent, devRules, roleChecks, routeOf, rules, sel, useProjectViewport } from "./screen-helpers";
import { frameCount } from "./screen-14-helpers";
import {
  HOME,
  LOGIN,
  SCREEN,
  SIGNUP,
  assertSharedRootRoute,
  frameTextsUnder,
  guestEntryRoute,
  waitLanding,
} from "./screen-15-helpers";

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

test(`[C1][S${SCREEN}] guest-entry(rules.json guest.entry_component) 1개 · href = routes["${HOME}-guest"] · 라벨 = 시안 · 클릭 시 둘러보기로 이동(200, 로그인 아님)`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  const entry = rules.guest.entry_component;
  expect(entry, "guest.entry_component").toBe("guest-entry");
  expect(rules.screens_required[String(SCREEN)], `screens_required["${SCREEN}"] 에 ${entry} 포함`).toContain(entry);
  const demo = guestEntryRoute();
  expect(demo, "둘러보기 경로는 로그인 경로가 아님").not.toBe(routeOf(LOGIN));

  await page.goto(routeOf(SCREEN));
  await waitLanding(page);
  const inFrame = frameCount(SCREEN, vp, entry);
  expect(inFrame, `시안 ${SCREEN}-${vp} 에 ${entry} 노드`).toBe(1);
  const box = page.locator(sel(entry));
  await expect(box, `${entry} 개수 = 시안 노드 수`).toHaveCount(inFrame);
  await expect(box.first(), `${entry} 보임`).toBeVisible();

  const link = box.locator("a[href]");
  await expect(link, `${entry} 안 링크 1개`).toHaveCount(1);
  await expect(link, "둘러보기 href").toHaveAttribute("href", demo);
  const labels = frameTextsUnder(SCREEN, vp, entry);
  expect(labels.length, `시안 ${entry} 문구`).toBe(1);
  expect((await link.innerText()).trim(), "둘러보기 라벨 = 시안 문구").toBe(labels[0]);

  // Next <Link> 는 클라이언트 이동(RSC fetch)이라 문서 응답이 없다 → URL 이동 뒤 같은(비로그인) 컨텍스트로 문서 응답을 확인
  await link.click();
  await page.waitForURL((u) => u.pathname === demo, { timeout: 30_000 });
  await page.waitForLoadState("load");
  expect(new URL(page.url()).pathname, "둘러보기 경로에 머무름 (/login 아님)").toBe(demo);
  await expect(page.locator(sel("ex-auth-form-card")), "로그인 화면 아님").toHaveCount(0);
  await expect(page.locator(sel("landing-hero")), "랜딩 아님").toHaveCount(0);
  const res = await page.request.get(demo, { maxRedirects: 0 });
  expect(res.status(), `${demo} 문서 응답 (리다이렉트 아님)`).toBe(200);
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
