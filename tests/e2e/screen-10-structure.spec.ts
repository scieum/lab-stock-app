// 화면 10 (사용 기록 내역, dev-rules.json routes["10"]) 구조 규칙: R-ui · C1(기본 상태·진입점) · C2 · V1
// 기준: harness/d5-gates.md D3, harness/dev-rules.json (routes·route_auth 10·components·viewports),
//       design/rules.json (roles R1~R7, tab_bar), 디자인 s2-spec "## 화면 10",
//       design/frames/10-{mobile|desktop}.json, harness/d7-data.md §7.
// 이 파일은 DB 에 쓰지 않는다. 필터는 screen-10-filters, 상세는 screen-10-detail, 학교 격리는 screen-10-isolation.
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import {
  PROFILE_ROLE,
  ROLE_NAME,
  browserSession,
  countComponent,
  devRules,
  roleChecks,
  routeOf,
  rules,
  sel,
} from "./screen-helpers";
import { seedSchoolOf } from "./screen-3-helpers";
import {
  ACTIVE_TAB_LABEL,
  CLOSE_LABEL,
  DEFAULT_PERIOD,
  EMPTY,
  EMPTY_TITLE,
  ENTRY_LABEL,
  GROUP_LABEL,
  INPUT,
  MODAL,
  MSDS,
  MSDS_LABEL,
  NAV_LABEL,
  PERIODS,
  ROW,
  SCOPE_ALL,
  SCOPE_MINE,
  SCREEN,
  SEARCH_PLACEHOLDER,
  SEGMENT,
  SEGMENT_ACTIVE,
  activeSegment,
  closeButton,
  exact,
  expectDetail,
  expectListMatchesDb,
  frameCounts,
  gotoAndMatch,
  historyPath,
  modal,
  openRow,
  periodSelect,
  queryParam,
  readList,
  rows,
  screenComponents,
  searchInput,
  segment,
  segmentOption,
  selectedPeriodLabel,
  waitHistory,
} from "./screen-10-helpers";

const ALL_ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];
const HOME_SCREEN = 13;
const ENTRY_SCREEN = 4;
const PERIOD_DEFAULT_LABEL = PERIODS.find((p) => p.value === DEFAULT_PERIOD)!.label;
const R4 = rules.roles.R4;
/** 읽기 전용 화면 (d7 §7: 수정·삭제 없음) — 쓰기 진입으로 볼 글자 */
const WRITE_WORDS = /수정|삭제|편집|지우기/;

async function runRoleChecks(page: Page, roleName: string, where: string): Promise<void> {
  const checks = roleChecks(SCREEN, roleName);
  expect(checks.length, `${where}: 화면 ${SCREEN} 역할 검사`).toBeGreaterThan(0);
  for (const c of checks) {
    const n = await countComponent(page, c.component);
    if (c.op === "max") expect(n, `${where}: ${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
    else {
      expect(n, `${where}: ${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
      await expect(page.locator(sel(c.component)).first(), `${where}: ${c.rule} ${c.component} 보임`).toBeVisible();
    }
  }
}

/** main 안 버튼·링크 중 쓰기 진입(수정·삭제…)이나 사용 기록 입력(화면 4) 진입 */
async function writeEntries(page: Page): Promise<string[]> {
  return page.locator("main").evaluate(
    (main, a) => {
      const out: string[] = [];
      for (const el of main.querySelectorAll("a, button, [role='button'], input[type='submit']")) {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        const href = el.getAttribute("href") ?? "";
        if (new RegExp(a.words).test(text) || text.includes(a.entry) || href.startsWith(a.entryHref)) out.push(`${el.tagName} ${text} ${href}`.trim());
      }
      return out;
    },
    { words: WRITE_WORDS.source, entry: ENTRY_LABEL, entryHref: routeOf(ENTRY_SCREEN) },
  );
}

// =====================================================================
// R-ui
// =====================================================================

test(`[R-ui][S${SCREEN}] rules.json R4 = ${MSDS} 를 학생·교사·admin 모두에게(min_per_role), 화면 ${SCREEN} 검사에 학생 max 규칙·R4 가 모두 포함됨`, () => {
  expect(R4.component, "R4 컴포넌트").toBe(MSDS);
  expect(R4.min_per_role, "R4 min_per_role").toBeGreaterThanOrEqual(1);
  expect(devRules.components[MSDS] ?? [], `dev-rules components ${MSDS} 에 화면 ${SCREEN}`).toContain(SCREEN);
  for (const role of SCHOOL_A_ROLES) {
    const name = ROLE_NAME[role as keyof typeof ROLE_NAME];
    expect(R4.roles, `R4 roles 에 ${name}`).toContain(name);
    expect(roleChecks(SCREEN, name).some((c) => c.rule === "R4" && c.op === "min" && c.component === MSDS), `${name} 검사에 R4`).toBe(true);
  }
  const studentMax = Object.entries(rules.roles).filter(([, r]) => r.role === ROLE_NAME.student && r.max !== undefined);
  expect(studentMax.length, "rules.json 학생 max 규칙").toBeGreaterThan(0);
  const checks = roleChecks(SCREEN, ROLE_NAME.student);
  for (const [id] of studentMax) expect(checks.some((c) => c.rule === id), `학생 검사에 ${id}`).toBe(true);
  const onlyRoles = Object.entries(rules.roles).filter(([, r]) => r.only_roles);
  for (const [id] of onlyRoles) expect(checks.some((c) => c.rule === id && c.value === 0), `학생 검사에 ${id} = 0`).toBe(true);
});

for (const role of SCHOOL_A_ROLES) {
  const roleName = ROLE_NAME[role as keyof typeof ROLE_NAME];
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${routeOf(SCREEN)} 렌더(리다이렉트 없음) · 상세를 연 상태에서 roles R1~R7 개수(${MSDS} ≥ min_per_role) · 수정·삭제·"${ENTRY_LABEL}" 진입 0 (읽기 전용)`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, response } = await openAs(browser, info, role, SCREEN);
    try {
      expect(response?.status(), "화면 10 응답").toBe(200);
      await waitHistory(page);
      expect(new URL(page.url()).pathname, "모든 역할이 화면 10 에 머문다").toBe(routeOf(SCREEN));
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      await expect(page.locator(sel("nav-pill")).first()).toContainText(NAV_LABEL);
      await expect(rows(page).first(), "기록 행이 있어야 상세를 열 수 있음").toBeVisible();

      // 상세를 열기 전: 역할 제한 컴포넌트(max 0)는 0
      for (const c of roleChecks(SCREEN, roleName).filter((x) => x.op === "max")) {
        expect(await countComponent(page, c.component), `상세 전: ${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
      }
      expect(await writeEntries(page), "상세 전: 쓰기 진입").toEqual([]);

      // 상세를 연 상태: R4 msds-entry ≥ 1 (모든 역할), 나머지 역할 제한 0
      await openRow(page, 0);
      await runRoleChecks(page, roleName, "상세 열림");
      const entry = modal(page).locator(sel(MSDS));
      await expect(entry, `상세 안 ${MSDS}`).toHaveCount(1);
      await expect(entry).toContainText(MSDS_LABEL);
      expect(await writeEntries(page), "상세 열림: 쓰기 진입").toEqual([]);
      // 상세 안 조작은 MSDS 보기 · 닫기 뿐
      const actions = (await modal(page).locator("a, button").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
      for (const a of actions) expect([MSDS_LABEL, CLOSE_LABEL].some((l) => a.includes(l)), `상세 안 조작 '${a}'`).toBe(true);
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S${SCREEN}] MSDS 주소가 없는 시약의 기록도 상세에 ${MSDS} 가 있다 (R4: 진입점은 역할마다 항상) — 학생`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "student", SCREEN);
  try {
    await waitHistory(page);
    const snap = await gotoAndMatch(page, {});
    const noMsds = snap.shown.find((r) => r.msds_url === null);
    expect(noMsds, "최근 1개월 목록에 MSDS 주소가 없는 시약의 기록이 있어야 함 (seed 시약)").toBeTruthy();
    // 그 시약 이름으로 좁혀 연다
    const narrowed = await gotoAndMatch(page, { q: noMsds!.reagent_name });
    const idx = narrowed.shown.findIndex((r) => r.msds_url === null);
    expect(idx, "좁힌 목록에 MSDS 없는 기록").toBeGreaterThanOrEqual(0);
    await openRow(page, idx);
    await expectDetail(page, narrowed.shown[idx]);
    expect(await countComponent(page, MSDS), `${MSDS} ≥ R4 min_per_role`).toBeGreaterThanOrEqual(R4.min_per_role!);
    // 주소가 없으면 눌러서 갈 곳이 없어야 한다 (빈 주소로 이동하지 않음)
    const links = await modal(page).locator(`${sel(MSDS)} a`).evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    for (const href of links) expect(href, "MSDS 주소 없는 기록의 링크").toMatch(/^https?:\/\//);
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${SCREEN}] 비로그인 ${routeOf(SCREEN)} 접근 → ${routeOf(1)} · 기록 행·학교명 미노출`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  const vp = devRules.viewports[info.project.name];
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: vp[0], height: vp[1] } });
  try {
    const page = await context.newPage();
    const school = seedSchoolOf("teacher");
    for (const path of [historyPath(), historyPath({ mine: true, period: "all" }), historyPath({ q: "염" })]) {
      await page.goto(path);
      await page.waitForURL((u) => u.pathname === routeOf(1), { timeout: 30_000 });
      await expect(page.locator(sel("ex-auth-form-card")).first(), "로그인 화면").toBeVisible();
      for (const c of [ROW, MODAL, MSDS]) expect(await countComponent(page, c), `비로그인 ${c}`).toBe(0);
      const res = await context.request.get(path, { maxRedirects: 0 });
      expect(res.status(), `비로그인 ${path} 는 리다이렉트`).toBeGreaterThanOrEqual(300);
      expect(res.status()).toBeLessThan(400);
      const html = await res.text();
      expect(html, `비로그인 ${path} 응답 본문에 ${ROW}`).not.toContain(`data-component="${ROW}"`);
      expect(html, "비로그인 응답 본문에 학교명").not.toContain(school.name);
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 기본 상태
// =====================================================================

for (const role of ALL_ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 기본 상태: nav-pill(워드마크·"${NAV_LABEL}"·학교명) · ${SEGMENT} 1(+active 1 "${SCOPE_ALL}") · ${INPUT} 2(기간 "${PERIOD_DEFAULT_LABEL}" · "${SEARCH_PLACEHOLDER}") · ${ROW} = DB 최근 1개월 · ${MODAL} 0 · "${ENTRY_LABEL}" 버튼 없음`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const comps = screenComponents();
    for (const c of ["nav-pill", SEGMENT, SEGMENT_ACTIVE, INPUT, ROW, MODAL, MSDS, EMPTY, "button-outline", "button-pill-soft"]) {
      expect(comps, `dev-rules components 화면 ${SCREEN} 에 ${c}`).toContain(c);
    }
    const school = seedSchoolOf(role);
    const t0 = Date.now();
    const { context, page, viewport, response } = await openAs(browser, info, role, SCREEN);
    try {
      expect(response?.status(), "화면 10 응답").toBe(200);
      await waitHistory(page);
      const me = await browserSession(page);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);

      // nav-pill: 워드마크 + 제목 + 학교명
      const nav = page.locator(sel("nav-pill"));
      await expect(nav, "nav-pill 1개").toHaveCount(1);
      await expect(nav).toContainText("Lab_Stock");
      await expect(nav.getByText(NAV_LABEL).locator("visible=true").first(), `nav-pill "${NAV_LABEL}" 보임`).toBeVisible();
      await expect(nav).toContainText(me.schoolName);
      if (viewport === "desktop") {
        // 데스크탑: 현재 섹션 링크 = "사용 기록 내역"
        const link = nav.locator(`a[href="${routeOf(SCREEN)}"]`);
        await expect(link, "데스크탑 nav-pill 섹션 링크").toHaveCount(1);
        await expect(link).toHaveText(exact(NAV_LABEL));
        await expect(link, "현재 섹션 표시").toHaveAttribute("aria-current", "page");
        // 화면 제목 (시안 screen-title)
        await expect(page.locator("main").getByRole("heading", { name: NAV_LABEL }).locator("visible=true"), "screen-title").toHaveCount(1);
      }

      // 필터: 전체 / 내 기록 (하나만 선택, 기본 전체)
      await expect(segment(page), `${SEGMENT} 1개`).toHaveCount(1);
      await expect(page.locator(`main ${sel(SEGMENT_ACTIVE)}`), `${SEGMENT_ACTIVE} 1개`).toHaveCount(1);
      await expect(activeSegment(page)).toHaveText(exact(SCOPE_ALL));
      await expect(segmentOption(page, SCOPE_MINE), `"${SCOPE_MINE}" 옵션`).toHaveCount(1);
      const segTexts = (await segment(page).locator(":scope > *").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
      expect(segTexts, "필터 옵션 = 전체 · 내 기록").toEqual([SCOPE_ALL, SCOPE_MINE]);

      // text-input 2: 기간 드롭다운(기본 최근 1개월) + 시약명 검색 바
      await expect(page.locator(`main ${sel(INPUT)}`), `${INPUT} 2개`).toHaveCount(2);
      await expect(periodSelect(page), "기간 드롭다운").toHaveCount(1);
      await expect(periodSelect(page)).toBeVisible();
      expect(await selectedPeriodLabel(page), "기간 기본값").toBe(PERIOD_DEFAULT_LABEL);
      await expect(searchInput(page), "시약명 검색 바").toHaveCount(1);
      await expect(searchInput(page)).toBeVisible();
      await expect(searchInput(page)).toHaveValue("");
      await expect(page.locator(`main ${sel(INPUT)}`).filter({ has: page.getByPlaceholder(SEARCH_PLACEHOLDER) }), "검색 바는 text-input 안").toHaveCount(1);
      // 기본 주소에는 필터 쿼리가 없다
      for (const k of ["mine", "period", "q"]) expect(queryParam(page, k), `기본 주소 ?${k}`).toBeNull();

      // 목록 = DB(전체 · 최근 1개월), 행이 1개 이상
      const snap = await expectListMatchesDb(page, {}, t0);
      expect(snap.flat.length, `${ROW} ≥ 1 (테스트 학교에는 최근 사용 기록이 있다)`).toBeGreaterThanOrEqual(1);
      await expect(rows(page).first()).toBeVisible();

      // 상세는 행을 누르기 전에는 없다 · 0건 카드 없음 · 사용 기록 입력 버튼 없음(시안)
      expect(await countComponent(page, MODAL), `${MODAL} 누르기 전`).toBe(0);
      expect(await countComponent(page, EMPTY), `${EMPTY} 기록이 있을 때`).toBe(0);
      await expect(page.locator("main").getByText(ENTRY_LABEL), `main 에 "${ENTRY_LABEL}"`).toHaveCount(0);
      await expect(page.locator(`main a[href^="${routeOf(ENTRY_SCREEN)}"]`), `main 에 ${routeOf(ENTRY_SCREEN)} 링크`).toHaveCount(0);
      await expect(page.locator("main").getByText(EMPTY_TITLE), "기록이 있으면 0건 문구 없음").toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S${SCREEN}] 학교A 교사 목록: 월 그룹 헤더 "YYYY년 M월" 최신순 · 행 3열(날짜 MM.DD · 시약명/사용자 · 사용량 단위) = 로그인 세션 usage_history, 행 날짜의 달 = 그룹의 달`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  try {
    await waitHistory(page);
    // 기간 전체 — 여러 달이 있으면 그룹이 여러 개
    for (const f of [{}, { period: "all" as const }]) {
      const snap = await gotoAndMatch(page, f);
      expect(snap.flat.length, "행 수").toBeGreaterThan(0);
      const entries = await readList(page);
      expect(entries[0].kind, "목록은 월 그룹 헤더로 시작").toBe("group");
      const labels = entries.filter((e) => e.kind === "group").map((e) => (e as { label: string }).label);
      for (const l of labels) expect(l, "그룹 헤더 형식").toMatch(GROUP_LABEL);
      // DB 의 달 수 = 그룹 수
      const months = [...new Set(snap.flat.map((r) => r.group))];
      expect(labels, "그룹 = 기록이 있는 달 (최신순)").toEqual(months);
      for (const r of snap.flat) {
        expect(r.date, "행 날짜 MM.DD").toMatch(/^\d{2}\.\d{2}$/);
        const m = /^(\d{4})년 (\d{1,2})월$/.exec(r.group)!;
        expect(Number(r.date.slice(0, 2)), `행 ${r.date} 는 그룹 ${r.group} 의 달`).toBe(Number(m[2]));
        expect(r.name.length, "시약명").toBeGreaterThan(0);
        expect(r.user.length, "사용자 이름").toBeGreaterThan(0);
        expect(r.amount, "사용량 + 단위").toMatch(/^\d+(\.\d+)?\D+$/);
      }
      // 그룹 헤더는 보인다
      await expect(page.locator("main").getByText(exact(labels[0])).locator("visible=true").first()).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 진입점 (d7 §7): 탭바 "${ACTIVE_TAB_LABEL}"(390) · nav "${NAV_LABEL}"(1440) · 홈 "더 보기" → ${routeOf(SCREEN)}`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "student", HOME_SCREEN);
  try {
    await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("load");
    const more = page.locator("main a").filter({ hasText: exact("더 보기") });
    await expect(more, '홈 "더 보기" 링크').toHaveCount(1);
    await expect(more).toHaveAttribute("href", routeOf(SCREEN));
    const entry =
      viewport === "mobile"
        ? page.locator(`${sel(rules.tab_bar.component)} ${sel(rules.tab_bar.item)}`).filter({ hasText: exact(ACTIVE_TAB_LABEL) })
        : page.locator(sel("nav-pill")).locator("a").filter({ hasText: exact(NAV_LABEL) });
    await expect(entry, viewport === "mobile" ? `탭바 "${ACTIVE_TAB_LABEL}"` : `nav "${NAV_LABEL}"`).toHaveCount(1);
    await expect(entry).toHaveAttribute("href", routeOf(SCREEN));
    await entry.click();
    await page.waitForURL((u) => u.pathname === routeOf(SCREEN), { timeout: 30_000 });
    await waitHistory(page);
    await expect(rows(page).first()).toBeVisible();
    // 홈 "더 보기" 로도 도착
    await page.goto(routeOf(HOME_SCREEN));
    await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
    await page.locator("main a").filter({ hasText: exact("더 보기") }).click();
    await page.waitForURL((u) => u.pathname === routeOf(SCREEN), { timeout: 30_000 });
    await waitHistory(page);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A 학생 첫 행 상세 열림(시안과 같은 상태): 시안 10 프레임에 있는 화면 ${SCREEN} 컴포넌트가 프레임 개수 이상 · ${MODAL}·${SEGMENT}·${SEGMENT_ACTIVE}·${MSDS} 는 정확히 프레임 개수`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "student", SCREEN);
  try {
    await waitHistory(page);
    const snap = await gotoAndMatch(page, {});
    const frame = frameCounts(viewport);
    expect(snap.flat.length, `시안 행 수(${frame[ROW]}) 이상의 기록이 있어야 함`).toBeGreaterThanOrEqual(frame[ROW]);
    await openRow(page, 0);
    await expectDetail(page, snap.shown[0]);
    const tb = rules.tab_bar;
    let checked = 0;
    for (const name of screenComponents()) {
      if (name === tb.component || name === tb.item) continue; // C2
      const want = frame[name] ?? 0;
      if (want === 0) {
        // 프레임에 없는 상태 컴포넌트 (0건 카드) — 기록이 있을 때는 없어야 한다
        expect(name, "프레임에 없는 화면 10 컴포넌트는 0건 카드뿐").toBe(EMPTY);
        expect(await countComponent(page, name), `${name} (기록 있음)`).toBe(0);
        continue;
      }
      const n = await countComponent(page, name);
      expect(n, `${name} ≥ 시안 ${want}`).toBeGreaterThanOrEqual(want);
      await expect(page.locator(sel(name)).locator("visible=true").first(), `${name} 보임`).toBeVisible();
      if ([MODAL, SEGMENT, SEGMENT_ACTIVE, MSDS, "nav-pill", INPUT].includes(name)) expect(n, `${name} = 시안 ${want}`).toBe(want);
      checked++;
    }
    expect(checked, "프레임과 비교한 컴포넌트 수").toBeGreaterThanOrEqual(8);
    // 상세 안: 닫기 button-outline · MSDS 보기 button-pill-soft (시안 개수)
    await expect(closeButton(page)).toHaveCount(1);
    await expect(modal(page).locator(sel("button-pill-soft")), "상세 안 button-pill-soft").toHaveCount(frame["button-pill-soft"]);
    await expect(modal(page).locator(sel("button-outline")), "상세 안 button-outline").toHaveCount(frame["button-outline"]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C2
// =====================================================================

for (const role of ALL_ROLES) {
  test(`[C2][S${SCREEN}] ${ROLE_LABEL[role]}: 탭바 = rules.json tab_bar (390 표시·항목 수·라벨·활성 "${ACTIVE_TAB_LABEL}", 1440 미표시) — 상세를 열어도 같음`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const tb = rules.tab_bar;
    expect(tb.labels, `tab_bar labels 에 "${ACTIVE_TAB_LABEL}"`).toContain(ACTIVE_TAB_LABEL);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN);
    try {
      await waitHistory(page);
      const shown = viewport === "mobile" && tb.mobile_screens.includes(SCREEN);
      if (viewport === "mobile") expect(shown, `rules.json tab_bar.mobile_screens 에 화면 ${SCREEN}`).toBe(true);
      const check = async (state: string) => {
        await expect(page.locator(sel(tb.component)), `${state}: ${viewport} ${tb.component}`).toHaveCount(shown ? 1 : 0);
        await expect(page.locator(sel(tb.item)), `${state}: ${viewport} ${tb.item}`).toHaveCount(shown ? tb.items : 0);
        if (!shown) return;
        expect(tb.labels.length, "rules.json tab_bar labels 수 = items").toBe(tb.items);
        const bar = page.locator(sel(tb.component));
        await expect(bar).toBeVisible();
        const items = bar.locator(sel(tb.item));
        await expect(items, "tab-item 은 tab-bar 안에").toHaveCount(tb.items);
        const labels = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
        expect(labels, "탭 라벨 순서").toEqual(tb.labels);
        const active = bar.locator(`${sel(tb.item)}[aria-current="page"]`);
        await expect(active, `${state}: 활성 tab-item 1개`).toHaveCount(1);
        await expect(active).toHaveText(exact(ACTIVE_TAB_LABEL));
        const t = (await bar.boundingBox())!;
        expect(Math.round(t.y + t.height), "tab-bar 는 화면 아래 끝").toBe(page.viewportSize()!.height);
        expect(Math.round(t.width), "tab-bar 전폭").toBe(page.viewportSize()!.width);
      };
      await check("기본");
      await expect(rows(page).first()).toBeVisible();
      await openRow(page, 0);
      await check("상세 열림");
    } finally {
      await context.close();
    }
  });
}

test(`[C2][S${SCREEN}] 폭 390 학교A 학생: 상세 시트는 tab-bar 위쪽 선에 붙고(시트 아래 끝 = tab-bar 위) 전폭 · 마지막 행이 tab-bar·시트에 가려지지 않고 눌린다 / 폭 1440: 상세는 목록 옆(겹치지 않음)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const tb = rules.tab_bar;
  const { context, page, viewport } = await openAs(browser, info, "student", SCREEN);
  try {
    await waitHistory(page);
    const snap = await gotoAndMatch(page, {});
    const n = snap.flat.length;
    expect(n, "행이 2개 이상").toBeGreaterThanOrEqual(2);
    const last = rows(page).nth(n - 1);
    const box = (l: ReturnType<typeof rows>) => l.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
    /** 행 가운데 지점의 맨 위 요소가 그 행인지 (다른 것에 덮이지 않음) */
    const onTop = (l: ReturnType<typeof rows>) => l.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    });
    const toBottom = () => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    if (viewport === "desktop") {
      await expect(page.locator(sel(tb.component))).toHaveCount(0);
      await openRow(page, 0);
      await expectDetail(page, snap.shown[0]);
      const m = await box(modal(page));
      const r = await box(rows(page).first());
      expect(m.left, "데스크탑 상세는 목록 오른쪽 옆").toBeGreaterThanOrEqual(r.right - 0.5);
      // 목록을 끝까지 내려도 마지막 행을 누를 수 있다
      await toBottom();
      expect(await onTop(last), "마지막 행이 덮이지 않음").toBe(true);
      await last.click();
      await expectDetail(page, snap.shown[n - 1]);
      return;
    }

    const bar = page.locator(sel(tb.component));
    await expect(bar).toHaveCount(1);
    // 상세 없이: 끝까지 내리면 마지막 행이 tab-bar 위에 있다 (목록 스크롤 영역은 tab-bar 위쪽 선에서 끝난다)
    await toBottom();
    const t = await box(bar);
    expect((await box(last)).bottom, "마지막 행 아래 끝 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual(t.top + 0.5);
    expect(await onTop(last), "마지막 행이 tab-bar 에 덮이지 않음").toBe(true);

    // 첫 행 상세: 시트가 tab-bar 위쪽 선에 붙는다
    await page.evaluate(() => window.scrollTo(0, 0));
    await openRow(page, 0);
    await expectDetail(page, snap.shown[0]);
    const m = await box(modal(page));
    expect(m.bottom, "시트 아래 끝 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual(t.top + 0.5);
    expect(Math.abs(t.top - m.bottom), `시트는 tab-bar 위쪽 선에 붙는다 (틈 ${t.top - m.bottom})`).toBeLessThanOrEqual(1);
    expect(Math.round(m.left), "시트 왼쪽 끝").toBe(0);
    expect(Math.round(m.right), "시트 전폭").toBe(page.viewportSize()!.width);
    expect(m.top, "시트가 화면 안").toBeGreaterThanOrEqual(0);
    // tab-bar 는 시트에 덮이지 않는다
    const tabHit = await bar.locator(sel(tb.item)).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    });
    expect(tabHit, "tab-item 이 시트에 덮이지 않음").toBe(true);

    // 시트가 열린 채 끝까지 내리면 마지막 행이 시트 위로 올라와 눌린다 → 상세가 그 기록으로 바뀐다
    await toBottom();
    await expect.poll(async () => (await box(last)).bottom <= (await box(modal(page))).top + 0.5, { message: "마지막 행 아래 끝 ≤ 시트 위", timeout: 5_000 }).toBe(true);
    expect(await onTop(last), "마지막 행이 시트·tab-bar 에 덮이지 않음").toBe(true);
    await last.click();
    await expectDetail(page, snap.shown[n - 1]);
    const m2 = await box(modal(page));
    expect(Math.abs((await box(bar)).top - m2.bottom), "바뀐 상세도 tab-bar 위에 붙는다").toBeLessThanOrEqual(1);
    // 누른 행은 시트에 가려지지 않은 채 보인다
    expect((await box(last)).bottom, "누른 마지막 행이 시트 위에 보임").toBeLessThanOrEqual(m2.top + 0.5);
  } finally {
    await context.close();
  }
});

// =====================================================================
// V1 (보고용 스크린샷, 실패 조건 아님) — 시안과 같은 상태: 전체 · 최근 1개월 · 첫 행 상세 열림
// =====================================================================
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (학생, 전체 · 최근 1개월, 첫 행 상세 열림)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openAs(browser, info, "student", SCREEN);
  try {
    await (async () => {
      await waitHistory(page);
      await rows(page).first().click({ timeout: 10_000 });
      await modal(page).waitFor({ state: "visible", timeout: 10_000 });
    })().catch(() => undefined);
    // 시안 프레임 크기(390×844 · 1440×900) 그대로 — 하단 시트·옆 패널이 보이는 첫 화면
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: false });
  } finally {
    await context.close();
  }
});
