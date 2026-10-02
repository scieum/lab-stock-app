// 화면 14 (/signup) 구조 규칙: C1 · C2 · R-ui(로그인 전) · V1
// 기대값: design/rules.json (screens_required, tab_bar, roles, never.N1) · harness/dev-rules.json (components, viewports)
//         · design/frames/14-{mobile|desktop}.json (컴포넌트 노드 개수)
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { countComponent, devRules, roleChecks, routeOf, rules, useProjectViewport } from "./screen-helpers";
import { SCREEN, frameCount, waitSignupScreen } from "./screen-14-helpers";

// ---------- C2 ----------
test(`[C2][S${SCREEN}] 탭바 개수 = rules.json tab_bar 기준 (화면 ${SCREEN})`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitSignupScreen(page);
  const tb = rules.tab_bar;
  const shown = vp === "mobile" && tb.mobile_screens.includes(SCREEN);
  expect(await countComponent(page, tb.component), `${vp} ${tb.component}`).toBe(shown ? 1 : 0);
  expect(await countComponent(page, tb.item), `${vp} ${tb.item}`).toBe(shown ? tb.items : 0);
});

// ---------- C1 ----------
test(`[C1][S${SCREEN}] rules.json screens_required[${SCREEN}] 컴포넌트 모두 존재`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitSignupScreen(page);
  const raw = rules.screens_required[String(SCREEN)];
  const required = Array.isArray(raw) ? raw : [];
  for (const name of required) {
    expect(await countComponent(page, name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
  }
  // 화면 14 는 rules.json never.N1 의 학교 선택 화면 — 학교 선택 단계 컴포넌트는 필수
  expect(rules.never.N1.school_select_screen).toBe(SCREEN);
  for (const level of rules.never.N1.school_select_levels) {
    expect(await countComponent(page, level), `학교 선택 단계 ${level}`).toBe(1);
  }
});

test(`[C1][S${SCREEN}] 화면 ${SCREEN} 시안 컴포넌트(dev-rules components) 모두 존재 · 개수 ≥ 시안 프레임`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitSignupScreen(page);
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

// ---------- R-ui (로그인 전) ----------
test(`[R-ui][S${SCREEN}] 로그인 전 화면 ${SCREEN}: roles R1~R7 역할 제한 컴포넌트 0개`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitSignupScreen(page);
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
  await waitSignupScreen(page).catch(() => undefined);
  await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${vp}.png`), fullPage: true });
});
