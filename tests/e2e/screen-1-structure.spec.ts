// 화면 1 (/login) 구조 규칙: C1 · C2 · R-ui · V1
// 기대값: design/rules.json (screens_required, tab_bar, roles) · harness/dev-rules.json (components, viewports)
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES } from "./db-helpers";
import {
  PROFILE_ROLE,
  browserSession,
  ROLE_NAME,
  countComponent,
  devRules,
  loginViaUi,
  roleChecks,
  routeOf,
  rules,
  sel,
  useProjectViewport,
  waitLoginScreen,
  type RoleCheck,
} from "./screen-helpers";

const SCREEN = 1;

async function assertRoleChecks(page: import("@playwright/test").Page, checks: RoleCheck[]) {
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

test(`[C1][S${SCREEN}] 화면 ${SCREEN} 시안 컴포넌트(dev-rules components) 모두 존재`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page);
  const names = Object.entries(devRules.components)
    .filter(([, screens]) => screens.includes(SCREEN))
    .map(([n]) => n);
  expect(names.length, "dev-rules components 에 화면 1 컴포넌트가 있어야 함").toBeGreaterThan(0);
  for (const name of names) {
    // 탭바는 C2 에서 화면별 기대값으로 본다
    if (name === rules.tab_bar.component || name === rules.tab_bar.item) continue;
    expect(await countComponent(page, name), `${name}`).toBeGreaterThanOrEqual(1);
  }
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

for (const role of SCHOOL_A_ROLES) {
  const roleName = ROLE_NAME[role as keyof typeof ROLE_NAME];
  const checks = roleChecks(SCREEN, roleName);
  if (checks.length === 0) continue; // 이 역할에 화면 1 에서 적용되는 roles 규칙 없음 (예: admin)
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 로그인 상태 화면 ${SCREEN}: roles ${[
    ...new Set(checks.map((c) => c.rule)),
  ].join("·")}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await useProjectViewport(page, info);
    await loginViaUi(page, role);
    expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
    await page.goto(routeOf(SCREEN));
    await waitLoginScreen(page);
    await assertRoleChecks(page, checks);
  });
}

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page);
  // 시/도 목록이 채워진 뒤 찍는다 (시안과 같은 상태)
  await page
    .locator(`${sel("school-select-sido")} button[aria-haspopup="listbox"]`)
    .waitFor({ state: "visible" });
  await expect(page.locator(`${sel("school-select-sido")} button[aria-haspopup="listbox"]`))
    .toBeEnabled({ timeout: 30_000 })
    .catch(() => undefined);
  await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${vp}.png`), fullPage: true });
});
