// 화면 9 (판매처 설정, dev-rules.json routes["9"]) 구조 규칙: R-ui · C1(기본 구성·공통 목록 탭·검색) · C2 · V1
// 기준: harness/d5-gates.md D3, harness/dev-rules.json (routes·route_auth 9·9_note·components·viewports),
//       design/rules.json (roles R3 = vendor-register 는 admin 만, tab_bar), 디자인 s2-spec "## 화면 9", design/frames/9-*.json, harness/d7-data.md §12.
// 이 파일은 공용 테스트 계정(학교 A)만 쓰고 DB 에 쓰지 않는다 — 읽기 · 탭 전환 · 검색 입력만 ("저장"·"삭제" 를 누르지 않는다).
// 등록·수정·삭제 흐름과 판매처가 있는 상태는 일회용 학교의 screen-9-write.
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { ROLE_LABEL } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, ROLE_NAME, browserClient, browserSession, countComponent, devRules, roleChecks, routeOf, rules, sel } from "./screen-helpers";
import { anonContext } from "./screen-8-helpers";
import { locationPath } from "./shell-helpers";
import {
  BUSY,
  BUTTON_TAB_GAP,
  CELL,
  COMMON_HEAD,
  COMMON_NAMES,
  COMMON_SEED,
  EMPTY,
  EMPTY_VENDORS,
  HOME,
  HOME_HREF,
  INPUT,
  LOGIN_HREF,
  MODAL,
  REGISTER,
  REGISTER_BUTTON,
  REORDER,
  SEARCH_PLACEHOLDER,
  SEGMENT,
  SEGMENT_ACTIVE,
  TAB_COMMON,
  TAB_SCHOOL,
  TOAST,
  VENDORS,
  VENDORS_HREF,
  VENDORS_NAV,
  boxOf,
  clean,
  countsOf,
  exact,
  expectTabBar,
  foreignComponents,
  hostOf,
  linksTo,
  main,
  navLabels,
  navLinks,
  onTop,
  ownReagentsOf,
  readCommonCells,
  readVendorRows,
  registerBlock,
  registerButton,
  scrollToEnd,
  searchInput,
  segment,
  segmentActive,
  switchTab,
  tabBarTop,
  visibleVendors,
  waitVendors,
  watchWrites,
} from "./screen-6-9-helpers";

const SCREEN = VENDORS;
const R3 = rules.roles.R3;
/** admin 이 아닌 역할이 들어갈 수 있는 화면 — vendor-register 와 화면 9 진입 링크가 없는지 보는 곳 */
const SCREENS_OF = { student: [HOME, 2, 10, 11, 4], teacher: [HOME, 2, 10, 11, 4, REORDER, 7] } as const;
const BUTTON_MIN_HEIGHT = (rules as unknown as { button: { min_height: number } }).button.min_height;

// =====================================================================
// R-ui
// =====================================================================

test(`[R-ui][S${SCREEN}] rules.json R3 = ${REGISTER} 는 admin 만(only_roles) · 학생·교사·로그인 전 검사에 R3 = 0 포함 · dev-rules route_auth ${SCREEN} = admin만`, () => {
  expect(R3.component, "R3 컴포넌트").toBe(REGISTER);
  expect(R3.only_roles, "R3 only_roles").toEqual([ROLE_NAME.admin]);
  expect(devRules.components[REGISTER] ?? [], `dev-rules components ${REGISTER} 에 화면 ${SCREEN}`).toContain(SCREEN);
  for (const who of [ROLE_NAME.student, ROLE_NAME.teacher, null]) {
    expect(
      roleChecks(SCREEN, who).some((c) => c.rule === "R3" && c.component === REGISTER && c.op === "max" && c.value === 0),
      `${who ?? "로그인 전"} 검사에 R3 ${REGISTER} = 0`,
    ).toBe(true);
  }
  expect(roleChecks(SCREEN, ROLE_NAME.admin).some((c) => c.rule === "R3"), "admin 검사에는 R3 상한 없음").toBe(false);
  const auth = (devRules as unknown as { route_auth: Record<string, string> }).route_auth;
  expect(auth[String(SCREEN)], `route_auth ${SCREEN}`).toContain("admin만");
});

for (const role of ["student", "teacher"] as const) {
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${VENDORS_HREF} → ${HOME_HREF} (HTTP 3xx · 응답 본문에 공통 판매처명·"${SEARCH_PLACEHOLDER}"·"${TAB_COMMON}" 없음 · 도착 화면에 ${REGISTER} 0 · ${VENDORS_HREF} 링크 0)`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await page.waitForURL((u) => u.pathname === HOME_HREF, { timeout: 30_000 });
      await expect(page.locator(sel("home-summary")).first(), "홈으로 보내졌다").toBeVisible();
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const checks = roleChecks(SCREEN, ROLE_NAME[role]).filter((c) => c.op === "max");
      expect(checks.some((c) => c.rule === "R3"), "R3 검사 포함").toBe(true);
      for (const c of checks) expect(await countComponent(page, c.component), `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
      await expect(page.locator(sel(MODAL)), MODAL).toHaveCount(0);
      await expect(linksTo(page, VENDORS_HREF), `${VENDORS_HREF} 링크`).toHaveCount(0);

      const res = await context.request.get(VENDORS_HREF, { maxRedirects: 0 });
      expect(res.status(), "응답 코드").toBeGreaterThanOrEqual(300);
      expect(res.status(), "응답 코드").toBeLessThan(400);
      expect(locationPath(res.headers()["location"], info), "Location").toBe(HOME_HREF);
      const body = await res.text();
      for (const word of [...COMMON_NAMES, ...COMMON_SEED.map((s) => hostOf(s.website)), SEARCH_PLACEHOLDER, TAB_COMMON, TAB_SCHOOL, `data-component="${REGISTER}"`]) {
        expect(body.includes(word), `3xx 응답 본문에 '${word}'`).toBe(false);
      }
    } finally {
      await context.close();
    }
  });

  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 화면 ${SCREENS_OF[role].join("·")}: ${REGISTER} 0 (R3) · ${VENDORS_HREF} 링크 0 · nav 에 "${VENDORS_NAV}" 없음`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const { context, page } = await openAs(browser, info, role, HOME);
    try {
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      // 화면 3 (시약 상세) 도 본다 — 자기 학교 시약 1개
      const reagents = await ownReagentsOf((await browserClient(page)).client);
      expect(reagents.length, "대조: 자기 학교 시약").toBeGreaterThan(0);
      const paths = [...SCREENS_OF[role].map((s) => routeOf(s)), routeOf(3).replace(/\[[^\]]+\]/, reagents[0].id)];
      for (const path of paths) {
        const res = await page.goto(path);
        expect(res?.status(), `${path} 응답`).toBe(200);
        await page.waitForLoadState("load");
        expect(new URL(page.url()).pathname, `${path} 그대로`).toBe(path);
        await expect(page.locator(sel("nav-pill")), "nav-pill").toHaveCount(1);
        await expect(page.locator(BUSY), "자리 표시는 본문으로 바뀐다").toHaveCount(0, { timeout: 45_000 });
        expect((await page.locator("main").innerText()).trim().length, `${path} 본문이 그려졌다`).toBeGreaterThan(0);
        expect(await countComponent(page, REGISTER), `${ROLE_LABEL[role]} ${path} ${REGISTER}`).toBe(0);
        await expect(linksTo(page, VENDORS_HREF), `${ROLE_LABEL[role]} ${path} ${VENDORS_HREF} 링크`).toHaveCount(0);
        expect(await navLabels(page), `${ROLE_LABEL[role]} ${path} nav`).not.toContain(VENDORS_NAV);
        expect((await page.locator("body").innerText()).includes(REGISTER_BUTTON), `${ROLE_LABEL[role]} ${path} 에 "${REGISTER_BUTTON}"`).toBe(false);
      }
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S${SCREEN}] 비로그인 ${VENDORS_HREF} → ${LOGIN_HREF} (HTTP 3xx · 본문에 공통 판매처명 없음 · 화면 1 표시 · ${REGISTER} 0)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const context = await anonContext(browser, info);
  try {
    const res = await context.request.get(VENDORS_HREF, { maxRedirects: 0 });
    expect(res.status(), "응답 코드").toBeGreaterThanOrEqual(300);
    expect(res.status(), "응답 코드").toBeLessThan(400);
    expect(locationPath(res.headers()["location"], info), "Location").toBe(LOGIN_HREF);
    const body = await res.text();
    for (const word of [...COMMON_NAMES, SEARCH_PLACEHOLDER, TAB_COMMON]) expect(body.includes(word), `3xx 응답 본문에 '${word}'`).toBe(false);
    const page = await context.newPage();
    await page.goto(VENDORS_HREF);
    await page.waitForURL((u) => u.pathname === LOGIN_HREF, { timeout: 30_000 });
    await expect(page.locator(sel("ex-auth-form-card")).first(), "화면 1").toBeVisible();
    for (const c of [REGISTER, SEGMENT, CELL, MODAL]) expect(await countComponent(page, c), `로그인 전 ${c}`).toBe(0);
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${SCREEN}] 학교A admin ${VENDORS_HREF} 렌더(200) · ${REGISTER} 1 · nav "${VENDORS_NAV}" → ${VENDORS_HREF} (데스크탑: 보임·현재 섹션)`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport, response } = await openAs(browser, info, "admin", SCREEN);
  try {
    expect(response?.status(), "응답").toBe(200);
    await waitVendors(page);
    expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE.admin);
    await expect(page.locator(sel(REGISTER)), REGISTER).toHaveCount(1);
    const labels = await navLabels(page);
    expect(labels.filter((l) => l === VENDORS_NAV), `nav "${VENDORS_NAV}"`).toHaveLength(1);
    const link = navLinks(page).filter({ hasText: exact(VENDORS_NAV) });
    await expect(link).toHaveAttribute("href", VENDORS_HREF);
    if (viewport === "desktop") {
      await expect(link).toBeVisible();
      await expect(link, "현재 섹션 표시").toHaveAttribute("aria-current", "page");
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1
// =====================================================================

test(`[C1][S${SCREEN}] 학교A admin 기본 구성: ${SEGMENT} 1("${TAB_SCHOOL}" / "${TAB_COMMON}") + ${SEGMENT_ACTIVE} 1 = "${TAB_SCHOOL}" · ${INPUT} 검색("${SEARCH_PLACEHOLDER}") · ${REGISTER} 1 · button-primary "${REGISTER_BUTTON}" · 목록 = 로그인 세션의 자기 학교 판매처(0건이면 ${EMPTY} "${EMPTY_VENDORS}")`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, response } = await openAs(browser, info, "admin", SCREEN);
  const writes = watchWrites(page);
  try {
    expect(response?.status(), "응답").toBe(200);
    await waitVendors(page);
    await expect(segment(page), SEGMENT).toHaveCount(1);
    await expect(page.locator(sel(SEGMENT)), `${SEGMENT} 은 본문에 1개`).toHaveCount(1);
    await expect(page.locator(sel(SEGMENT_ACTIVE)), `${SEGMENT_ACTIVE} 1`).toHaveCount(1);
    await expect(segmentActive(page), `활성 탭 = "${TAB_SCHOOL}"`).toHaveText(exact(TAB_SCHOOL));
    expect(clean(await segment(page).innerText()).replace(/\s+/g, ""), "탭 두 개").toBe(`${TAB_SCHOOL}${TAB_COMMON}`.replace(/\s+/g, ""));
    await expect(searchInput(page), `검색 "${SEARCH_PLACEHOLDER}"`).toHaveCount(1);
    await expect(main(page).locator(sel(INPUT)).filter({ has: page.getByPlaceholder(SEARCH_PLACEHOLDER) }), `검색은 ${INPUT}`).toHaveCount(1);
    await expect(main(page).locator(sel(INPUT)), `폼이 닫힌 상태의 ${INPUT} = 검색 1개 (시안 9-mobile)`).toHaveCount(1);
    await expect(registerBlock(page), REGISTER).toHaveCount(1);
    await expect(registerButton(page), `button-primary "${REGISTER_BUTTON}"`).toHaveCount(1);
    await expect(registerButton(page)).toBeVisible();
    await expect(registerButton(page)).toBeEnabled();

    const school = (await visibleVendors(page)).filter((v) => v.school_id !== null);
    const rows = await readVendorRows(page);
    expect(rows.map((r) => r[0]).sort(), "행 = 자기 학교 판매처").toEqual(school.map((v) => v.name).sort());
    await expect(registerBlock(page).locator(sel(EMPTY)), `${EMPTY}`).toHaveCount(school.length === 0 ? 1 : 0);
    if (school.length === 0) await expect(registerBlock(page).locator(sel(EMPTY)).getByText(exact(EMPTY_VENDORS)), `"${EMPTY_VENDORS}"`).toHaveCount(1);
    // 우리 학교 탭에는 공통 판매처가 섞이지 않는다
    const text = await registerBlock(page).innerText();
    for (const name of COMMON_NAMES) expect(text.includes(name), `우리 학교 탭에 공통 판매처 '${name}'`).toBe(false);

    expect(await countsOf(page, [MODAL, TOAST]), "처음 상태: 모달·토스트 0").toEqual({ [MODAL]: 0, [TOAST]: 0 });
    expect(writes.list(), "쓰기 요청 0건").toEqual([]);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A admin: 화면 ${SCREEN} 에 속하지 않는 컴포넌트(dev-rules.json components 에 ${SCREEN} 이 없는 이름) 0 — 두 탭 모두 (학교 판매처 0건 상태 포함)`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitVendors(page);
    for (const tab of [TAB_SCHOOL, TAB_COMMON]) {
      await switchTab(page, tab);
      const foreign = Object.entries(await countsOf(page, foreignComponents(SCREEN))).filter(([, n]) => n > 0);
      expect(foreign, `"${tab}" 탭: 화면 ${SCREEN} 에 속하지 않는 컴포넌트 (이름·개수)`).toEqual([]);
    }
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A admin "${TAB_COMMON}" 탭: ${CELL} 2열(${COMMON_HEAD.join(" · ")}) = d7 §12 공통 ${COMMON_SEED.length}곳(이름 · 웹사이트 호스트) · 보기 전용(수정·삭제·더보기 0) · 검색 부분 일치·0건(${EMPTY}) · 쓰기 요청 0건`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  const writes = watchWrites(page);
  try {
    await waitVendors(page);
    const common = (await visibleVendors(page)).filter((v) => v.school_id === null);
    expect(common.map((v) => v.name).sort(), "대조: 세션에 보이는 공통 목록 = d7 §12 seed").toEqual([...COMMON_NAMES].sort());

    await switchTab(page, TAB_COMMON);
    await expect(page.locator(sel(SEGMENT_ACTIVE)), `${SEGMENT_ACTIVE} 1`).toHaveCount(1);
    for (const head of COMMON_HEAD) await expect(main(page).locator(sel(CELL)).filter({ hasText: exact(head) }), `머리글 "${head}"`).toHaveCount(1);
    const cellsAll = await readCommonCells(page);
    expect(cellsAll.length, `셀 수 = ${COMMON_SEED.length}곳 × 2열`).toBe(COMMON_SEED.length * COMMON_HEAD.length);
    const pairs: [string, string][] = [];
    for (let i = 0; i < cellsAll.length; i += 2) pairs.push([cellsAll[i], cellsAll[i + 1]]);
    expect([...pairs].sort((a, b) => a[0].localeCompare(b[0])), "행 = 판매처명 · 웹사이트 호스트").toEqual(
      COMMON_SEED.map((s) => [s.name, hostOf(s.website)] as [string, string]).sort((a, b) => a[0].localeCompare(b[0])),
    );

    // 보기 전용
    await expect(main(page).getByRole("button", { name: /더보기|수정|삭제/ }), "수정·삭제·더보기 버튼").toHaveCount(0);
    await expect(page.getByRole("menuitem"), "메뉴 항목").toHaveCount(0);
    await expect(main(page).locator("input, textarea, select").filter({ visible: true }), "입력 칸은 검색뿐").toHaveCount(1);
    for (const name of COMMON_NAMES) {
      await main(page).locator(sel(CELL)).filter({ hasText: exact(name) }).click();
      await expect(page.locator(sel(MODAL)), `공통 행 "${name}" 을 눌러도 모달 없음`).toHaveCount(0);
      await expect(page.getByRole("menuitem")).toHaveCount(0);
    }

    // 검색: 부분 일치
    const target = [...COMMON_NAMES].sort((a, b) => b.length - a.length)[0];
    const part = target.slice(1, Math.max(2, target.length - 1));
    const want = COMMON_NAMES.filter((n) => n.toLowerCase().includes(part.toLowerCase()));
    expect(want, "대조: 부분 검색어에 걸리는 공통 판매처").toContain(target);
    expect(want.length, "대조: 일부만 걸린다").toBeLessThan(COMMON_NAMES.length);
    await searchInput(page).fill(part);
    await expect.poll(async () => (await readCommonCells(page)).filter((_, i) => i % 2 === 0).sort(), { message: `"${part}" 검색 결과` }).toEqual([...want].sort());
    // 0건
    await searchInput(page).fill("없는판매처zzqq");
    await expect.poll(async () => (await readCommonCells(page)).length, { message: "0건: 셀 0" }).toBe(0);
    await expect(main(page).locator(sel(EMPTY)), `0건: ${EMPTY}`).toHaveCount(1);
    await expect(searchInput(page), "검색 바는 유지").toBeVisible();
    // 지우면 전체
    await searchInput(page).fill("");
    await expect.poll(async () => (await readCommonCells(page)).length, { message: "검색어를 지우면 전체" }).toBe(COMMON_SEED.length * COMMON_HEAD.length);
    await expect(main(page).locator(sel(EMPTY))).toHaveCount(0);

    // 탭을 되돌리면 우리 학교 블록
    await switchTab(page, TAB_SCHOOL);
    await expect(registerBlock(page)).toHaveCount(1);
    await expect(main(page).locator(sel(CELL)), "우리 학교 탭에는 공통 목록 셀 없음").toHaveCount(0);
    expect(writes.list(), "쓰기 요청 0건").toEqual([]);
    expect((await visibleVendors(page)).filter((v) => v.school_id === null), "공통 목록 불변").toEqual(common);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C2
// =====================================================================

test(`[C2][S${SCREEN}] 학교A admin: 390 = tab-bar 1·tab-item ${rules.tab_bar.items}·활성 "시약", 1440 = 0 (두 탭 모두) · 모바일 하단 고정 "${REGISTER_BUTTON}" 이 tab-bar 바로 위(사이 ${BUTTON_TAB_GAP}, 가려지지 않음)`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitVendors(page);
    await expectTabBar(page, viewport, SCREEN, `"${TAB_SCHOOL}" 탭`);
    const btn = registerButton(page);
    await expect(btn).toBeVisible();
    const b = await boxOf(btn);
    expect(b.height, "버튼 높이 ≥ rules.json button.min_height").toBeGreaterThanOrEqual(BUTTON_MIN_HEIGHT);
    expect(await onTop(btn), "버튼이 다른 요소에 덮이지 않음").toBe(true);
    if (viewport === "mobile") {
      const top = await tabBarTop(page);
      for (const state of ["처음", "끝까지 내림"]) {
        if (state !== "처음") await scrollToEnd(page);
        const box = await boxOf(btn);
        expect(box.bottom, `${state}: 버튼 아래 끝 ≤ tab-bar 위쪽 선`).toBeLessThanOrEqual(top + 0.5);
        expect(Math.abs(top - box.bottom - BUTTON_TAB_GAP), `${state}: 버튼과 tab-bar 사이 ${BUTTON_TAB_GAP} (실제 ${top - box.bottom})`).toBeLessThanOrEqual(1.5);
        expect(await onTop(btn), `${state}: 버튼이 덮이지 않음`).toBe(true);
      }
    }
    await switchTab(page, TAB_COMMON);
    await expectTabBar(page, viewport, SCREEN, `"${TAB_COMMON}" 탭`);
  } finally {
    await context.close();
  }
});

// =====================================================================
// V1 (보고용 스크린샷, 실패 조건 아님)
// =====================================================================

test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (학교A admin, "${TAB_SCHOOL}" 탭 — 읽기만)`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitVendors(page).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: false });
  } finally {
    await context.close();
  }
});
