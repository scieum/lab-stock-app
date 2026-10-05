// 공통 셸 · 화면 전환 (run 20261005-0149 화면 전환 반응 개선의 회귀 방지).
// 전제: "화면 구성 변경 없음" — 전환 방식이 바뀌어도 화면 구성·역할 노출·학교 분리는 규칙 그대로여야 한다.
// 기준: harness/d5-gates.md (R-ui·C1·C2·N1-ui), harness/dev-rules.json (routes·route_auth: `/` = 로그인 전 15 / 로그인 후 13),
//       design/rules.json (roles·screens_required·tab_bar·never.N1).
// 보는 것:
//  1) `/` 주소 하나: 로그인 전 = 화면 15 (리다이렉트 없이), 로그인 후 = 화면 13. dev-rules routes 에 없는 내부 주소(/landing)는 화면이 아니다.
//  2) 응답을 기다리는 동안의 본문 자리 표시: 학교 데이터·컴포넌트 0, 셸은 규칙 개수 그대로, 응답 뒤에는 직접 연 화면과 같은 구성.
//  3) 누른 즉시 반응: 응답 전에도 누른 링크에 표식(또는 자리 표시), 현재 위치 표시(aria-current="page")는 항상 1개.
//  4) 탭 이동에 셸(nav-pill·tab-bar)이 다시 만들어지지 않는다.
//  5) 아직 없는 화면(dev-rules routes 에 없는 경로)으로의 요청(404)이 저절로 나가지 않는다.
// 느린 응답은 화면 전환 요청을 붙잡았다 풀어 흉내 낸다 (shell-helpers.ts installNavGate, 고정 대기 없음).
import { test, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserSession, countComponent, roleChecks, routeOf, rules, screenOfPath, sel, type ViewportName } from "./screen-helpers";
import { detailPath, seedReagents, seedSchoolOf } from "./screen-3-helpers";
import {
  ALL_COMPONENTS,
  BUSY,
  DETAIL,
  HISTORY,
  HOME,
  INTAKE,
  LANDING,
  LIST,
  PENDING,
  RULE_ROLE,
  USAGE_NEW,
  anonContext,
  ariaCurrentHrefs,
  ariaCurrentSeen,
  componentCounts,
  componentsOf,
  expectShell,
  installNavGate,
  locationPath,
  schoolDataWords,
  schoolNamesIn,
  shellLink,
  waitContent,
  waitHydrated,
  watchAriaCurrent,
  type NavGate,
} from "./shell-helpers";

const N1 = rules.never.N1;
const ALL_ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];
/** 화면 15 랜딩의 내부 주소 — dev-rules routes 에 없다 (화면이 아니다). 주소창·링크에 드러나면 안 된다 */
const LANDING_SEGMENT = "/landing";

const requiredOf = (screen: number): string[] => {
  const raw = rules.screens_required[String(screen)];
  expect(Array.isArray(raw), `rules.json screens_required["${screen}"] 가 목록`).toBe(true);
  expect((raw as string[]).length, "screens_required 항목").toBeGreaterThan(0);
  return raw as string[];
};

type Gated = { context: BrowserContext; page: Page; viewport: ViewportName; gate: NavGate };

/** 역할 계정으로 start 화면을 열고(문지기 설치 뒤 다시 로드), 본문·셸이 그려질 때까지 기다린다 */
async function openGated(browser: Browser, info: TestInfo, role: Role, start: number): Promise<Gated> {
  const { context, page, viewport } = await openAs(browser, info, role, start);
  const gate = await installNavGate(page, info);
  await page.goto(routeOf(start));
  await waitContent(page, start);
  await expectShell(page, viewport, start, `화면 ${start}`);
  return { context, page, viewport, gate };
}

/** 셸 링크를 눌러 화면을 옮긴다 (문지기가 열려 있을 때) */
async function softNav(page: Page, viewport: ViewportName, target: number): Promise<void> {
  const link = shellLink(page, viewport, target);
  await waitHydrated(link);
  await link.click();
  await waitContent(page, target);
}

// =====================================================================
// 1) `/` — 로그인 전 화면 15, 로그인 후 화면 13
// =====================================================================

test(`[C1][S${LANDING}] 비로그인 ${routeOf(LANDING)}: 리다이렉트 없이 200 · 주소 유지 · screens_required[${LANDING}] 표시`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  expect(routeOf(LANDING), "dev-rules route_auth: 15 와 13 은 같은 경로").toBe(routeOf(HOME));
  const required = requiredOf(LANDING);
  const context = await anonContext(browser, info);
  try {
    const res = await context.request.get(routeOf(LANDING), { maxRedirects: 0 });
    expect(res.status(), `${routeOf(LANDING)} 는 리다이렉트 없이 200`).toBe(200);
    const html = await res.text();
    for (const name of required) expect(html, `응답 본문에 ${name}`).toContain(`data-component="${name}"`);

    const page = await context.newPage();
    const nav = await page.goto(routeOf(LANDING));
    await page.waitForLoadState("load");
    expect(nav!.status()).toBe(200);
    expect(nav!.request().redirectedFrom(), "문서 요청은 리다이렉트를 거치지 않는다").toBeNull();
    const u = new URL(page.url());
    expect(u.pathname + u.search, "주소 유지").toBe(routeOf(LANDING));
    for (const name of required) {
      expect(await countComponent(page, name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
      await expect(page.locator(sel(name)).first(), `${name} 보임`).toBeVisible();
    }
    // 내부 주소는 링크로도 드러나지 않는다
    await expect(page.locator(`a[href^="${LANDING_SEGMENT}"]`), `${LANDING_SEGMENT} 링크`).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${LANDING}] 비로그인 ${routeOf(LANDING)}: 로그인 전 화면에 없는 컴포넌트(앱 셸·업무 화면) 0 · 학교명 0 · 본문 자리 표시 0 (화면·응답 본문)`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  const tb = rules.tab_bar;
  expect(tb.mobile_screens, `화면 ${LANDING} 은 tab-bar 대상이 아님`).not.toContain(LANDING);
  // 로그인 전 화면(15·14·1) 어디에도 없는 컴포넌트 = 로그인 후(학교 소속) 화면 전용
  const allowed = new Set([LANDING, 14, 1].flatMap((n) => componentsOf(n)));
  const forbidden = ALL_COMPONENTS.filter((n) => !allowed.has(n));
  expect(forbidden, "대조: 로그인 후 전용 컴포넌트").toEqual(expect.arrayContaining([tb.component, tb.item, ...requiredOf(HOME)]));
  const context = await anonContext(browser, info);
  try {
    const html = await (await context.request.get(routeOf(LANDING))).text();
    for (const name of forbidden) expect(html, `응답 본문에 ${name}`).not.toContain(`data-component="${name}"`);
    expect(html, "응답 본문에 자리 표시").not.toContain("aria-busy");

    const page = await context.newPage();
    await page.goto(routeOf(LANDING));
    await expect(page.locator(sel(requiredOf(LANDING)[0])).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("load");
    const counts = await componentCounts(page.locator("body"), forbidden);
    expect(counts, "로그인 후 전용 컴포넌트").toEqual(Object.fromEntries(forbidden.map((n) => [n, 0])));
    for (const c of roleChecks(LANDING, null)) {
      expect(await countComponent(page, c.component), `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
    }
    await expect(page.locator("[aria-busy]"), "자리 표시").toHaveCount(0);
    expect(await schoolNamesIn(page.locator("body")), "로그인 전 화면에 학교명").toEqual([]);
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${LANDING}] 비로그인 ${LANDING_SEGMENT} 직접 요청: 3xx → ${routeOf(LANDING)} (dev-rules routes 에 없는 주소는 화면이 아니다) · 도착 화면 = 화면 ${LANDING}`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  expect(screenOfPath(LANDING_SEGMENT), `${LANDING_SEGMENT} 는 dev-rules routes 에 없음`).toBeNull();
  const context = await anonContext(browser, info);
  try {
    for (const path of [LANDING_SEGMENT, `${LANDING_SEGMENT}?next=${encodeURIComponent(routeOf(LIST))}`]) {
      const res = await context.request.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} 는 리다이렉트`).toBeGreaterThanOrEqual(300);
      expect(res.status()).toBeLessThan(400);
      const to = new URL(res.headers()["location"], info.project.use.baseURL);
      expect(to.pathname + to.search, `${path} → ${routeOf(LANDING)}`).toBe(routeOf(LANDING));
      const body = await res.text();
      for (const name of requiredOf(LANDING)) expect(body, `리다이렉트 응답 본문에 ${name}`).not.toContain(`data-component="${name}"`);
    }
    const page = await context.newPage();
    await page.goto(LANDING_SEGMENT);
    await page.waitForLoadState("load");
    const u = new URL(page.url());
    expect(u.pathname + u.search, "주소창").toBe(routeOf(LANDING));
    for (const name of requiredOf(LANDING)) await expect(page.locator(sel(name)).first(), `${name} 보임`).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(sel(rules.tab_bar.component))).toHaveCount(0);
  } finally {
    await context.close();
  }
});

for (const role of ALL_ROLES) {
  test(`[R-ui][S${HOME}] ${ROLE_LABEL[role]} ${LANDING_SEGMENT} 직접 접근: 3xx → ${routeOf(HOME)} = 화면 ${HOME} (랜딩 전용 컴포넌트 0 · screens_required[${HOME}] 표시)`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const home = new Set(componentsOf(HOME));
    const landingOnly = componentsOf(LANDING).filter((n) => !home.has(n));
    expect(landingOnly, "대조: 랜딩 전용 컴포넌트").toEqual(expect.arrayContaining(requiredOf(LANDING).filter((n) => !home.has(n))));
    expect(landingOnly.length).toBeGreaterThan(0);
    const { context, page, viewport } = await openAs(browser, info, role, HOME);
    try {
      await waitContent(page, HOME);
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);

      const res = await context.request.get(LANDING_SEGMENT, { maxRedirects: 0 });
      expect(res.status(), `${LANDING_SEGMENT} 는 리다이렉트`).toBeGreaterThanOrEqual(300);
      expect(res.status()).toBeLessThan(400);
      expect(locationPath(res.headers()["location"], info), `${LANDING_SEGMENT} → ${routeOf(HOME)}`).toBe(routeOf(HOME));
      const body = await res.text();
      for (const name of landingOnly) expect(body, `리다이렉트 응답 본문에 ${name}`).not.toContain(`data-component="${name}"`);

      // 로그인 사용자의 `/` 응답은 화면 13 — 랜딩이 섞이지 않는다
      const homeRes = await context.request.get(routeOf(HOME), { maxRedirects: 0 });
      expect(homeRes.status(), `로그인 후 ${routeOf(HOME)}`).toBe(200);
      const homeHtml = await homeRes.text();
      for (const name of landingOnly) expect(homeHtml, `로그인 후 ${routeOf(HOME)} 응답 본문에 ${name}`).not.toContain(`data-component="${name}"`);

      await page.goto(LANDING_SEGMENT);
      await waitContent(page, HOME);
      await expectShell(page, viewport, HOME, `${LANDING_SEGMENT} 도착`);
      for (const name of requiredOf(HOME)) expect(await countComponent(page, name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
      expect(await componentCounts(page.locator("body"), landingOnly), "랜딩 전용 컴포넌트").toEqual(Object.fromEntries(landingOnly.map((n) => [n, 0])));
      for (const c of roleChecks(HOME, RULE_ROLE[role])) {
        const n = await countComponent(page, c.component);
        if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
        else expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
      }
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 2) 응답을 기다리는 동안 (본문 자리 표시) — 학교 데이터·컴포넌트 비노출, 셸 유지
// =====================================================================

const SKELETON_MOVES: { start: number; target: number }[] = [
  { start: LIST, target: HOME },
  { start: HOME, target: LIST },
  { start: HOME, target: HISTORY },
];
const SKELETON_ROLES: Role[] = ["student", "admin", "schoolB"];

for (const { start, target } of SKELETON_MOVES) {
  for (const role of SKELETON_ROLES) {
    test(`[N1-ui][S${target}] ${ROLE_LABEL[role]} 화면 ${start} → ${target} 응답 대기 중: 본문에 학교 데이터(시약명·사용자 이름·학교명) 0 · 자리 표시 안 컴포넌트 0 · 학교명 종류 = distinct_school_names · 응답 뒤 직접 연 화면과 같은 구성`, async ({ browser }, info) => {
      test.setTimeout(240_000);
      const tb = rules.tab_bar;
      const { context, page, viewport, gate } = await openGated(browser, info, role, start);
      try {
        const me = await browserSession(page);
        expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
        const words = await schoolDataWords(page);
        // 양성 대조: 출발 화면 본문에는 학교 데이터가 있다 (같은 판정이 빈 화면에서만 통과하는 것이 아니다)
        const before = await page.locator("main").innerText();
        expect(words.some((w) => before.includes(w)) || before.includes(me.schoolName), "대조: 출발 화면 본문에 학교 데이터").toBe(true);

        const link = shellLink(page, viewport, target);
        await waitHydrated(link);
        // 자리 표시를 누른 즉시 보여 주려면 그 화면의 미리 받기가 끝나 있어야 한다
        await expect.poll(() => gate.prefetched(), { message: `${routeOf(target)} 미리 받기`, timeout: 30_000 }).toContain(routeOf(target));

        gate.hold();
        await link.click();
        await expect.poll(() => gate.held(), { message: "전환 요청이 붙잡혔다 (응답 전)", timeout: 30_000 }).toContain(routeOf(target));
        const busy = page.locator(BUSY);
        await expect(busy, "본문 자리 표시 (aria-busy)").toBeVisible({ timeout: 30_000 });
        await expect(busy).toHaveCount(1);
        expect(gate.held(), "여전히 응답 전").toContain(routeOf(target));

        // --- 응답 전 화면 ---
        const main = page.locator("main");
        const mainText = await main.innerText();
        for (const w of words) expect(mainText, `응답 전 본문에 학교 데이터 "${w}"`).not.toContain(w);
        expect(await schoolNamesIn(main), "응답 전 본문에 학교명").toEqual([]);
        expect((await busy.innerText()).trim(), "자리 표시 안 글자").toBe("");
        expect(await componentCounts(busy), "자리 표시 안 컴포넌트").toEqual(Object.fromEntries(ALL_COMPONENTS.map((n) => [n, 0])));
        expect(await busy.locator("a, button, input, select, textarea").count(), "자리 표시 안 조작 요소").toBe(0);
        // 셸은 규칙 개수 그대로
        await expectShell(page, viewport, target, "응답 전");
        if (viewport === "mobile") {
          const labels = (await page.locator(`${sel(tb.component)} ${sel(tb.item)}`).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
          expect(labels, "응답 전 탭 라벨 순서").toEqual(tb.labels);
        }
        // 화면 전체: 학교명은 자기 학교 하나, 역할 상한 유지
        const names = await schoolNamesIn(page.locator("body"));
        expect(names, "응답 전 학교명 종류").toHaveLength(N1.distinct_school_names);
        for (const n of names) expect(me.schoolName, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
        for (const c of roleChecks(target, RULE_ROLE[role]).filter((c) => c.op === "max")) {
          expect(await countComponent(page, c.component), `응답 전 ${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
        }

        // --- 응답 뒤: 자리 표시가 본문으로 바뀌고, 직접 연 화면과 같은 구성 ---
        gate.release();
        await waitContent(page, target);
        await expectShell(page, viewport, target, "응답 뒤");
        let first = true;
        await expect(async () => {
          if (!first) {
            // 다른 테스트의 쓰기로 목록 길이가 그 사이 달라졌을 수 있다 — 전환부터 다시 해서 비교한다
            await page.goto(routeOf(start));
            await waitContent(page, start);
            await softNav(page, viewport, target);
          }
          first = false;
          const soft = await componentCounts(page.locator("body"));
          await page.reload();
          await waitContent(page, target);
          await expectShell(page, viewport, target, "직접 연 화면");
          const hard = await componentCounts(page.locator("body"));
          expect(soft, "전환으로 온 화면의 컴포넌트 개수 = 직접 연 화면").toEqual(hard);
        }).toPass({ timeout: 150_000 });
        const after = await schoolNamesIn(page.locator("body"));
        expect(after, "응답 뒤 학교명 종류").toHaveLength(N1.distinct_school_names);
        // 역할 상한 (하한은 시트를 연 상태 등 화면별 스펙이 본다 — 여기서는 직접 연 화면과 개수가 같음을 위에서 봤다)
        for (const c of roleChecks(target, RULE_ROLE[role]).filter((c) => c.op === "max")) {
          expect(await countComponent(page, c.component), `응답 뒤 ${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
        }
      } finally {
        gate.release();
        await context.close();
      }
    });
  }
}

// =====================================================================
// 3) 누른 즉시 반응 — 응답 전 표식, 현재 위치 표시는 항상 1개
// =====================================================================

const TAB_MOVES: { start: number; target: number }[] = [
  { start: HOME, target: LIST },
  { start: LIST, target: HISTORY },
  { start: LIST, target: HOME },
];

for (const { start, target } of TAB_MOVES) {
  test(`[C2][S${start}] 학교A 교사 화면 ${start} 에서 화면 ${target} 탭·nav 링크: 응답 전에도 누른 링크 표식 또는 본문 자리 표시 · 보이는 aria-current="page" 는 내내 1개 · 셸 개수 유지`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, viewport, gate } = await openGated(browser, info, "teacher", start);
    try {
      const link = shellLink(page, viewport, target);
      await waitHydrated(link);
      expect(await ariaCurrentHrefs(page), "누르기 전 현재 위치").toEqual([routeOf(start)]);
      await expect(link.locator(PENDING), "누르기 전 표식 없음").toHaveCount(0);
      await watchAriaCurrent(page);

      gate.hold();
      await link.click();
      await expect.poll(() => gate.held(), { message: "전환 요청이 붙잡혔다 (응답 전)", timeout: 30_000 }).toContain(routeOf(target));
      await expect
        .poll(async () => (await link.locator(PENDING).count()) + (await page.locator(BUSY).count()), { message: "누른 링크 표식 또는 본문 자리 표시", timeout: 15_000 })
        .toBeGreaterThan(0);
      expect(gate.held(), "여전히 응답 전").toContain(routeOf(target));
      const during = await ariaCurrentHrefs(page);
      expect(during, "응답 전 현재 위치 표시 1개").toHaveLength(1);
      expect([routeOf(start), routeOf(target)], "응답 전 현재 위치 = 출발 또는 도착 화면").toContain(during[0]);
      expect(await ariaCurrentSeen(page), "응답 전: 보이는 aria-current 개수 기록").toEqual([1]);
      await expectShell(page, viewport, start, "응답 전");

      gate.release();
      await waitContent(page, target);
      await expectShell(page, viewport, target, "응답 뒤");
      await expect.poll(() => ariaCurrentHrefs(page), { message: "응답 뒤 현재 위치" }).toEqual([routeOf(target)]);
      await expect(page.locator(PENDING), "응답 뒤 표식 없음").toHaveCount(0);
      expect(await ariaCurrentSeen(page), "전환 내내 보이는 aria-current 개수 기록").toEqual([1]);
    } finally {
      gate.release();
      await context.close();
    }
  });
}

// 본문 자리 표시가 없는 화면(시약 상세·사용 기록 입력)으로 가는 링크 — 응답 전에는 누른 링크의 표식만이 반응이다
const DEEP_MOVES: { start: number; target: number; pick: (page: Page) => ReturnType<Page["locator"]>; done: string }[] = [
  { start: HOME, target: USAGE_NEW, pick: (page) => page.locator(`main a[href="${routeOf(USAGE_NEW)}"]`).first(), done: "nav-pill" },
  { start: LIST, target: DETAIL, pick: (page) => page.locator(`main a${sel("reagent-row")}`).first(), done: "reagent-detail-card" },
];

for (const { start, target, pick, done } of DEEP_MOVES) {
  test(`[C2][S${start}] 학교A 학생 화면 ${start} 에서 화면 ${target} 링크: 응답 전 누른 링크에 표식 · 주소·현재 위치 표시(1개)는 그대로 · 응답 뒤 화면 ${target}`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const tb = rules.tab_bar;
    const { context, page, viewport, gate } = await openGated(browser, info, "student", start);
    try {
      const link = pick(page);
      await expect(link, `화면 ${target} 링크`).toBeVisible();
      await expect.poll(() => link.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "하이드레이션", timeout: 30_000 }).toBe(true);
      const href = (await link.getAttribute("href")) ?? "";
      const path = new URL(href, info.project.use.baseURL).pathname;
      expect(screenOfPath(path), `${href} = 화면 ${target}`).toBe(target);
      await expect(link.locator(PENDING), "누르기 전 표식 없음").toHaveCount(0);
      await link.scrollIntoViewIfNeeded();
      await watchAriaCurrent(page);

      gate.hold();
      await link.click();
      await expect.poll(() => gate.held(), { message: "전환 요청이 붙잡혔다 (응답 전)", timeout: 30_000 }).toContain(path);
      await expect(link.locator(PENDING), "응답 전 누른 링크 표식").toHaveCount(1);
      await expect(page.locator(PENDING), "표식은 누른 링크에만").toHaveCount(1);
      expect(new URL(page.url()).pathname, "응답 전 주소").toBe(routeOf(start));
      expect(await ariaCurrentHrefs(page), "응답 전 현재 위치").toEqual([routeOf(start)]);
      expect(await ariaCurrentSeen(page), "응답 전: 보이는 aria-current 개수 기록").toEqual([1]);
      await expectShell(page, viewport, start, "응답 전");

      gate.release();
      await page.waitForURL((u) => u.pathname === path, { timeout: 45_000 });
      await expect(page.locator(sel(done)).first(), `화면 ${target} 본문`).toBeVisible({ timeout: 45_000 });
      await expect(page.locator(PENDING), "응답 뒤 표식 없음").toHaveCount(0);
      await expectShell(page, viewport, target, "응답 뒤");
      expect(tb.mobile_screens, `화면 ${target} 은 tab-bar 대상`).toContain(target);
    } finally {
      gate.release();
      await context.close();
    }
  });
}

// =====================================================================
// 4) 탭 이동에 셸이 다시 만들어지지 않는다
// =====================================================================

const KEEP = "data-e2e-kept";
const TOURS: { role: Role; path: number[] }[] = [
  { role: "admin", path: [HOME, LIST, HISTORY, HOME] },
  { role: "student", path: [LIST, HOME, HISTORY, LIST] },
];

for (const { role, path } of TOURS) {
  const start = path[0];
  test(`[C2][S${start}] ${ROLE_LABEL[role]} 화면 ${path.join(" → ")} 탭 이동: nav-pill·tab-bar 가 같은 DOM 노드로 남고 화면마다 rules.json tab_bar 개수 · 학교명 유지`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const tb = rules.tab_bar;
    const { context, page, viewport } = await openGated(browser, info, role, start);
    try {
      const me = await browserSession(page);
      const shellParts = viewport === "mobile" ? ["nav-pill", tb.component] : ["nav-pill"];
      for (const name of shellParts) {
        await expect(page.locator(sel(name))).toHaveCount(1);
        await page.locator(sel(name)).evaluate((el, attr) => el.setAttribute(attr, "1"), KEEP);
      }
      if (viewport === "mobile") {
        await page.locator(`${sel(tb.component)} ${sel(tb.item)}`).evaluateAll((els, attr) => els.forEach((el) => el.setAttribute(attr, "1")), KEEP);
      }
      await page.evaluate(() => {
        (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
      });

      for (const screen of path.slice(1)) {
        await softNav(page, viewport, screen);
        await expectShell(page, viewport, screen, `화면 ${screen}`);
        expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true), `화면 ${screen}: 문서를 다시 받지 않았다`).toBe(true);
        for (const name of shellParts) {
          await expect(page.locator(`${sel(name)}[${KEEP}]`), `화면 ${screen}: ${name} 은 이동 전과 같은 노드`).toHaveCount(1);
        }
        if (viewport === "mobile") {
          await expect(page.locator(`${sel(tb.item)}[${KEEP}]`), `화면 ${screen}: ${tb.item} 은 이동 전과 같은 노드`).toHaveCount(tb.items);
        }
        await expect(page.locator(sel("nav-pill")), `화면 ${screen}: 학교명`).toContainText(me.schoolName);
        expect(await ariaCurrentHrefs(page), `화면 ${screen}: 현재 위치`).toEqual([routeOf(screen)]);
        const names = await schoolNamesIn(page.locator("body"));
        expect(names, `화면 ${screen}: 학교명 종류`).toHaveLength(N1.distinct_school_names);
      }
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 5) 아직 없는 화면으로의 요청(404)이 저절로 나가지 않는다
// =====================================================================

for (const { role, screen } of [
  { role: "admin" as Role, screen: HOME },
  { role: "student" as Role, screen: HOME },
  { role: "admin" as Role, screen: LIST },
]) {
  test(`[C2][S${screen}] ${ROLE_LABEL[role]} 화면 ${screen} 을 열어 둔 동안: dev-rules routes 에 없는 경로로의 요청 0 · 4xx 응답 0 (링크가 보이고 가리켜도)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, viewport, gate } = await openGated(browser, info, role, screen);
    try {
      // 대조: 이미 있는 화면은 미리 받는다 (요청 감시가 살아 있다)
      const other = screen === HOME ? LIST : HOME;
      await waitHydrated(shellLink(page, viewport, other));
      await expect.poll(() => gate.prefetched(), { message: `${routeOf(other)} 미리 받기`, timeout: 30_000 }).toContain(routeOf(other));

      const hrefs = await page.locator('a[href^="/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
      const pathOf = (h: string) => new URL(h, info.project.use.baseURL).pathname;
      const unbuilt = [...new Set(hrefs.map(pathOf).filter((p) => screenOfPath(p) === null))];

      // 링크를 화면에 들이고(스크롤) 가리킨다 — 미리 받기가 일어날 수 있는 모든 계기
      for (const p of unbuilt) {
        const links = page.locator(`a[href="${p}"]`);
        for (let i = 0; i < (await links.count()); i++) {
          const a = links.nth(i);
          if (!(await a.isVisible())) continue;
          await a.scrollIntoViewIfNeeded();
          await a.hover();
        }
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForLoadState("networkidle");

      const stray = gate.requested().filter((p) => unbuilt.includes(p));
      expect(stray, `없는 화면(${unbuilt.join(", ") || "-"})으로의 요청`).toEqual([]);
      expect(gate.failures(), "4xx·5xx 응답").toEqual([]);
      expect(new URL(page.url()).pathname, "화면은 그대로").toBe(routeOf(screen));
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 상태 코드 — 학생 /intake (화면 7 스펙은 응답 본문만 본다. /users·다른 학교 시약 404 는 화면 8·3·4 스펙이 본다)
// =====================================================================

test(`[R-ui][S${INTAKE}] 학교A 학생 ${routeOf(INTAKE)} 직접 요청: HTTP 3xx → ${routeOf(HOME)} (본문을 흘려보내기 전에 판정) · 화면 전환(RSC) 요청에도 R5 컴포넌트 0`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const hidden = roleChecks(INTAKE, RULE_ROLE.student).filter((c) => c.op === "max" && c.value === 0).map((c) => c.component);
  expect(hidden.length, "rules.json roles: 학생에게 0 인 컴포넌트").toBeGreaterThan(0);
  const own = seedReagents().filter((r) => r.school_id === seedSchoolOf("student").id);
  const { context, page } = await openAs(browser, info, "student", HOME);
  try {
    await waitContent(page, HOME);
    expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE.student);
    for (const path of [routeOf(INTAKE), `${routeOf(INTAKE)}?tab=register`, `${routeOf(INTAKE)}?reagent=${own[0].id}`]) {
      const res = await context.request.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} 는 리다이렉트`).toBeGreaterThanOrEqual(300);
      expect(res.status()).toBeLessThan(400);
      expect(locationPath(res.headers()["location"], info), `${path} → ${routeOf(HOME)}`).toBe(routeOf(HOME));
      // 링크를 눌러 올 때와 같은 요청(RSC)에도 화면 7 을 그리지 않는다
      const rsc = await context.request.get(path, { headers: { RSC: "1" } });
      const body = await rsc.text();
      for (const c of hidden) {
        expect(body, `RSC 응답 본문에 ${c}`).not.toContain(`"data-component":"${c}"`);
        expect(body, `RSC 응답 본문에 ${c}`).not.toContain(`data-component="${c}"`);
      }
    }
    // 대조: 같은 학교 시약 상세는 학생에게 열린다 (세션이 살아 있다)
    const detail = await context.request.get(detailPath(own[0].id), { maxRedirects: 0 });
    expect(detail.status(), "대조: 자기 학교 시약 상세").toBe(200);
  } finally {
    await context.close();
  }
});
