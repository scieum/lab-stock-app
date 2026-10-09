// 화면 15 (랜딩, 로그인 전 `/`) 학교 격리 N1-ui:
// - 로그인 전 랜딩 본문에 학교명 패턴(rules.json never.N1.school_name_pattern) 0, seed 학교명 미노출.
// - 로그인 상태(학생·학교B 저장 세션)로 `/` 에 오면 랜딩이 아니라 화면 13 홈 (home-summary, landing-hero 0),
//   학교명 종류 = distinct_school_names, 자기 학교명만.
// - 로그인 없이 보호 경로(dev-rules routes 중 로그인 전 화면이 아닌 것)는 여전히 /login 으로.
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { isDeskPage, newFrame, waitWidthSettled } from "./desk-helpers";
import { realSchoolNames } from "./guest-helpers";
import { landingSampleNames } from "./pre-login-helpers";

/**
 * 1440 홈 = 새 프레임 13-desktop (데스크톱 재구성 run c): home-summary = "지금 처리할 것" 타일 + 위젯.
 * 시안(교사)의 개수가 최대, 최소 = 위젯 열의 home-summary + 재고 부족 타일 1 (MSDS 타일은 역할에 따라).
 */
const DESK_HOME = newFrame("13-desktop").filter((n) => n.name === "home-summary");
const DESK_HOME_MAX = DESK_HOME.length;
const DESK_HOME_MIN = DESK_HOME.filter((n) => n.path.includes("widget-column")).length + 1;
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
import {
  HOME,
  LOGIN,
  SCREEN,
  assertSharedRootRoute,
  guestEntryRoute,
  guestRoutes,
  protectedRoutes,
  waitLanding,
} from "./screen-15-helpers";

const N1 = rules.never.N1;

// ---------- 둘러보기(/demo) 경로 — 비로그인 허용, 로그인 사용자는 홈으로 ----------
test(`[N1-ui][S${SCREEN}] 로그인 없이 둘러보기 경로(routes["${HOME}-guest"]) 접근 → 200 · 리다이렉트 없음 · 실제 학교명 미노출`, async ({ page }, info) => {
  const schools = seedRows("schools");
  expect(schools.length, "seed 학교가 2개 이상이어야 검사가 의미 있음").toBeGreaterThan(1);
  const demo = guestEntryRoute();
  expect(protectedRoutes().map((p) => p.route), "둘러보기 경로는 보호 경로 목록에 없음").not.toContain(demo);

  await useProjectViewport(page, info);
  const res = await page.goto(demo);
  await page.waitForLoadState("load");
  expect(res, "응답").not.toBeNull();
  expect(res!.status(), `${demo} 응답 상태`).toBe(200);
  expect(res!.request().redirectedFrom(), "리다이렉트 없음").toBeNull();
  expect(new URL(page.url()).pathname, "둘러보기 경로에 머무름").toBe(demo);
  await expect(page.locator(sel("ex-auth-form-card")), "로그인 화면 아님").toHaveCount(0);
  await expect(page.locator(sel("landing-hero")), "랜딩 아님").toHaveCount(0);

  const text = await page.locator("body").innerText();
  const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])].filter(
    (n) => n !== rules.guest.school_name,
  );
  expect(names, "데모 학교명 외 학교명 없음").toHaveLength(0);
  for (const s of schools) expect(text, `seed(실제) 학교명 ${s.name}`).not.toContain(s.name);
  for (const level of N1.school_select_levels) expect(await countComponent(page, level), level).toBe(0);
});

for (const role of ["student", "schoolB"] as Role[]) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 로그인 상태로 둘러보기 경로(routes["${HOME}-guest"]) 접근 → ${routeOf(HOME)} 홈으로 리다이렉트 · 자기 학교명만`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    assertSharedRootRoute();
    const demo = guestEntryRoute();
    const schools = seedRows("schools");
    expect(schools.length, "seed 학교가 2개 이상이어야 격리 검사가 의미 있음").toBeGreaterThan(1);

    const { context, page, response } = await openAs(browser, info, role, HOME, demo);
    try {
      expect(response, "응답").not.toBeNull();
      expect(response!.request().redirectedFrom(), `${demo} 에서 리다이렉트됨`).not.toBeNull();
      expect(new URL(page.url()).pathname, "홈 경로").toBe(routeOf(HOME));
      await expect(page.locator(sel("home-summary")).first(), "홈 표시").toBeVisible({ timeout: 30_000 });
      await expect(page.locator(sel("landing-hero")), "랜딩 0").toHaveCount(0);
      await expect(page.locator(sel(rules.guest.banner)), "둘러보기 배너 0").toHaveCount(0);

      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const text = await page.locator("body").innerText();
      const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
      expect(names, "학교명 종류").toHaveLength(N1.distinct_school_names);
      for (const n of names) expect(me.schoolName, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
      expect(text, `데모 학교명 미노출`).not.toContain(rules.guest.school_name);
      for (const s of schools.filter((s) => s.name !== me.schoolName)) {
        expect(text, `다른 학교명 ${s.name}`).not.toContain(s.name);
      }
    } finally {
      await context.close();
    }
  });
}

test(`[N1-ui][S${SCREEN}] dev-rules routes 의 둘러보기 경로(-guest) = guest_screens · 보호 경로 목록에서 제외`, async () => {
  const guest = guestRoutes();
  const protectedList = protectedRoutes().map((p) => p.route);
  for (const g of guest) {
    expect(protectedList, `${g.route} (화면 ${g.screen}g) 는 보호 경로 아님`).not.toContain(g.route);
    expect(g.route.startsWith(guestEntryRoute()), `${g.route} 는 둘러보기 진입 경로 아래`).toBe(true);
  }
  expect(protectedList.length, "보호 경로가 1개 이상 남아야 N1-ui 보호 검사가 의미 있음").toBeGreaterThan(0);
});

test(`[N1-ui][S${SCREEN}] 로그인 전 랜딩: 학교명 패턴 0(시안 product-shot 샘플 표기만 허용) · seed 학교명 미노출(화면·응답) · 학교 선택 단계 0`, async ({ page }, info) => {
  const schools = seedRows("schools");
  expect(schools.length, "seed 학교가 2개 이상이어야 검사가 의미 있음").toBeGreaterThan(1);
  expect(N1.screens_require_school_name, `화면 ${SCREEN} 은 학교명 표시 대상이 아님`).not.toContain(SCREEN);
  expect(N1.school_select_only_on, `화면 ${SCREEN} 은 학교 선택 화면이 아님`).not.toContain(SCREEN);

  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLanding(page);
  expect(new URL(page.url()).pathname, "로그인 전 `/` 는 랜딩에 머무름").toBe(routeOf(SCREEN));

  // 시안 샘플 표기: 새 프레임 15-{폭} 의 product-shot 그림 안 학교명(브라우저 주소줄 "샘플고등학교")은 rules/시안의 샘플이라
  // 랜딩 그림(앱 화면 조각)에서 허용. 단 seed·실제 학교명이 아니어야 하고, 그 밖의 학교명 패턴은 0.
  const re = new RegExp(N1.school_name_pattern, "g");
  const sampleNames = landingSampleNames(SCREEN, vp);
  for (const n of sampleNames) {
    expect(schools.map((s) => s.name), `시안 샘플 학교명 ${n} 은 seed 학교명이 아님`).not.toContain(n);
    expect(realSchoolNames(), `시안 샘플 학교명 ${n} 은 실제 학교명이 아님`).not.toContain(n);
  }
  const text = await page.locator("body").innerText();
  const names = [...new Set(text.match(re) ?? [])];
  for (const n of names) expect(sampleNames, `랜딩의 학교명 ${n} 은 시안 product-shot 샘플 표기만`).toContain(n);
  for (const s of schools) expect(text, `seed 학교명 ${s.name}`).not.toContain(s.name);
  // 응답 본문에도 seed 학교명 없음
  const html = await (await page.request.get(routeOf(SCREEN))).text();
  for (const s of schools) expect(html, `응답 본문 seed 학교명 ${s.name}`).not.toContain(s.name);
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
      await page.waitForLoadState("load");
      await waitWidthSettled(page);
      if (isDeskPage(page)) {
        const n = await page.locator(sel("home-summary")).count();
        expect(n, `1440 home-summary ${DESK_HOME_MIN}~${DESK_HOME_MAX} (새 프레임 13-desktop 타일 + 위젯 — 홈 한 벌)`).toBeGreaterThanOrEqual(DESK_HOME_MIN);
        expect(n).toBeLessThanOrEqual(DESK_HOME_MAX);
      } else await expect(page.locator(sel("home-summary")), "home-summary 1개").toHaveCount(1);
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
