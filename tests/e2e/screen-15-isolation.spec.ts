// 화면 15 (랜딩, 로그인 전 `/`) 학교 격리 N1-ui:
// - 로그인 전 랜딩 본문에 학교명 패턴(rules.json never.N1.school_name_pattern) 0, seed 학교명 미노출.
// - 로그인 상태(학생·학교B 저장 세션)로 `/` 에 오면 랜딩이 아니라 화면 13 홈 (home-summary, landing-hero 0),
//   학교명 종류 = distinct_school_names, 자기 학교명만.
// - 로그인 없이 보호 경로(dev-rules routes 중 로그인 전 화면이 아닌 것)는 여전히 /login 으로.
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import {
  PROFILE_ROLE,
  browserSession,
  countComponent,
  routeOf,
  rules,
  screenOfPath,
  sel,
  seedRows,
  useProjectViewport,
} from "./screen-helpers";
import { HOME, LOGIN, SCREEN, assertSharedRootRoute, protectedRoutes, waitLanding } from "./screen-15-helpers";

const N1 = rules.never.N1;

test(`[N1-ui][S${SCREEN}] 로그인 전 랜딩: 학교명 패턴 0 · seed 학교명 미노출 · 학교 선택 단계 0`, async ({ page }, info) => {
  const schools = seedRows("schools");
  expect(schools.length, "seed 학교가 2개 이상이어야 검사가 의미 있음").toBeGreaterThan(1);
  expect(N1.screens_require_school_name, `화면 ${SCREEN} 은 학교명 표시 대상이 아님`).not.toContain(SCREEN);
  expect(N1.school_select_only_on, `화면 ${SCREEN} 은 학교 선택 화면이 아님`).not.toContain(SCREEN);

  await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLanding(page);
  expect(new URL(page.url()).pathname, "로그인 전 `/` 는 랜딩에 머무름").toBe(routeOf(SCREEN));

  const text = await page.locator("body").innerText();
  const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
  expect(names, "랜딩에 학교명 없음").toHaveLength(0);
  for (const s of schools) expect(text, `seed 학교명 ${s.name}`).not.toContain(s.name);
  for (const level of N1.school_select_levels) expect(await countComponent(page, level), level).toBe(0);
  expect(await countComponent(page, "home-summary"), "로그인 후 홈 컴포넌트 없음").toBe(0);
});

for (const role of ["student", "schoolB"] as Role[]) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 로그인 상태로 ${routeOf(SCREEN)} 접근 → 화면 ${HOME} 홈 (랜딩 0) · 학교명 종류 = rules.json distinct_school_names · 자기 학교명만`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    assertSharedRootRoute();
    const schools = seedRows("schools");
    expect(schools.length, "seed 학교가 2개 이상이어야 격리 검사가 의미 있음").toBeGreaterThan(1);
    const required = rules.screens_required[String(HOME)];
    expect(Array.isArray(required), `screens_required["${HOME}"]`).toBe(true);
    const landing = rules.screens_required[String(SCREEN)] as string[];

    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      expect(new URL(page.url()).pathname, "경로 `/` 그대로").toBe(routeOf(HOME));
      await expect(page.locator(sel("home-summary")).first(), "홈 표시").toBeVisible({ timeout: 30_000 });
      await expect(page.locator(sel("home-summary")), "home-summary 1개").toHaveCount(1);
      for (const name of required as string[]) {
        expect(await countComponent(page, name), `홈 필수 ${name}`).toBeGreaterThanOrEqual(1);
      }
      for (const name of landing) expect(await countComponent(page, name), `랜딩 컴포넌트 ${name} 0`).toBe(0);

      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const mine = schools.find((s) => s.name === me.schoolName);
      expect(mine, `자기 학교 ${me.schoolName} 는 seed 학교`).toBeTruthy();
      const foreign = schools.filter((s) => s.id !== mine!.id);

      const text = await page.locator("body").innerText();
      const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
      expect(names, "학교명 종류").toHaveLength(N1.distinct_school_names);
      for (const n of names) expect(me.schoolName, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
      expect(text, "자기 학교명 표시").toContain(me.schoolName);
      for (const s of foreign) expect(text, `다른 학교명 ${s.name}`).not.toContain(s.name);
    } finally {
      await context.close();
    }
  });
}

for (const { screen, route } of protectedRoutes()) {
  test(`[N1-ui][S${SCREEN}] 로그인 없이 ${route} (화면 ${screen}) → ${routeOf(LOGIN)} · 학교 데이터 미노출`, async ({ page }, info) => {
    const schools = seedRows("schools");
    const reagents = seedRows("reagents");
    await useProjectViewport(page, info);
    await page.goto(route);
    await page.waitForURL((u) => screenOfPath(u.pathname) === LOGIN, { timeout: 30_000 });
    await page.waitForLoadState("load");
    expect(screenOfPath(new URL(page.url()).pathname), "이동한 화면").toBe(LOGIN);
    await expect(page.locator(sel("ex-auth-form-card")).first(), "로그인 화면 표시").toBeVisible();
    const text = await page.locator("body").innerText();
    expect([...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])], "학교명 없음").toHaveLength(0);
    for (const s of schools) expect(text, `seed 학교명 ${s.name}`).not.toContain(s.name);
    for (const r of reagents) expect(text, `seed 시약명 ${r.name}`).not.toContain(r.name);
  });
}
