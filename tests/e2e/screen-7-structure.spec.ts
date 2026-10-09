// 화면 7 (입고·시약 등록, dev-rules.json routes["7"]) 구조 규칙: R-ui · C1 · C2 · V1
// 기준: harness/d5-gates.md D3, harness/dev-rules.json (routes·route_auth 7·components·viewports),
//       design/rules.json (roles R1~R7, tab_bar, cabinet.storage_classes), 디자인 s2-spec "## 화면 7",
//       design/frames/7-{mobile|desktop}.json, harness/d7-data.md §6.
// 이 파일은 저장하지 않는다 (DB 불변). 저장 흐름·ex-toast 는 screen-7-save.spec.ts.
// 로그인은 auth-state.ts 의 역할별 storageState 를 재사용한다.
import { join } from "node:path";
import { isDeskPage, newFrame } from "./desk-helpers";
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, type Role } from "./db-helpers";
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
import { detailPath, seedSchoolOf, waitDetail } from "./screen-3-helpers";
import { expectShell, expectShellHeader, isShellComponent, shellSchoolScope } from "./shell-helpers";
import { frameActiveLabel } from "../desktop-shell";
/** 1440 본문 제목 = 새 프레임 7-desktop page-head 제목 ("입고" — 모바일 nav-pill 제목은 "입고·시약 등록", d7 §23 run c) */
const DESK_TITLE7 = newFrame("7-desktop").find((n) => n.name === "title" && n.path.includes("page-title"))!.text!.characters;

/** 셸의 입고 메뉴 글자: 폭 390 = nav-pill "입고·시약 등록", 폭 1440 = 사이드바 메뉴(rules desktop_shell.menu — 새 프레임 7-desktop 활성 메뉴) */
const shellIntakeLabel = (viewport: string) => (viewport === "desktop" ? frameActiveLabel(SCREEN) : NAV_LABEL);
import { seedOwnReagents } from "./screen-4-helpers";
import {
  ACTIVE_TAB_LABEL,
  BUTTON_TAB_GAP,
  DATE_LABEL,
  EMPTY,
  EMPTY_BODY,
  EMPTY_TITLE,
  INTAKE,
  NAV_LABEL,
  PRESETS,
  QUANTITY_HINT,
  QUANTITY_LABEL,
  REGISTER,
  REGISTER_OPTIONAL,
  REGISTER_REQUIRED,
  REQUIRED_MARK,
  SCREEN,
  SEGMENT,
  SEGMENT_ACTIVE,
  STORAGE_CLASSES,
  TAB_INTAKE,
  TAB_REGISTER,
  TOAST,
  UNITS,
  activeSegment,
  chip,
  dbReagent,
  dbReagents,
  exact,
  expectNotSelected,
  expectSelected,
  frameCounts,
  intakeButton,
  intakeForm,
  intakePath,
  openClassOptions,
  quantityInput,
  readPreview,
  registerButton,
  registerForm,
  rowNames,
  rows,
  screenComponents,
  searchAndSelect,
  searchInput,
  segmentOption,
  stepperButton,
  switchTab,
  todayDigits,
  waitIntake,
  DIRECT_PATH,
  INTAKE_MODE,
  MODE_DIRECT,
  MODE_DOC,
  activeMode,
  directSegment,
  modeControl,
  switchMode,
} from "./screen-7-helpers";

const STAFF: Role[] = ["teacher", "admin"];
const STUDENT = "student" as const;
const HOME_SCREEN = 13;
const LIST_SCREEN = 2;
const DETAIL_SCREEN = 3;
/** 화면 7 로 가는 링크 (routes["7"] 로 시작하는 href) */
const intakeLinks = (page: Page) => page.locator(`a[href="${routeOf(SCREEN)}"], a[href^="${routeOf(SCREEN)}?"], a[href^="${routeOf(SCREEN)}/"]`);
/** R5 = 학생에게 0 이어야 하는 화면 7 컴포넌트 (rules.json roles 에서) */
const R5 = rules.roles.R5;
const R5_COMPONENTS = R5.components ?? [];

async function runRoleChecks(page: Page, roleName: string, where: string): Promise<void> {
  for (const c of roleChecks(SCREEN, roleName)) {
    const n = await countComponent(page, c.component);
    if (c.op === "max") expect(n, `${where}: ${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
    else expect(n, `${where}: ${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
  }
}

// =====================================================================
// R-ui
// =====================================================================

test(`[R-ui][S${SCREEN}] rules.json R5 = 학생 ${INTAKE}·${REGISTER} max 0 이고, 학생 max 규칙이 화면 ${SCREEN} 학생 검사에 모두 포함됨`, () => {
  expect(R5.role, "R5 역할").toBe(ROLE_NAME.student);
  expect(R5.max, "R5 max").toBe(0);
  expect(R5_COMPONENTS, "R5 컴포넌트").toEqual(expect.arrayContaining([INTAKE, REGISTER]));
  const studentMax = Object.entries(rules.roles).filter(([, r]) => r.role === ROLE_NAME.student && r.max !== undefined);
  expect(studentMax.length, "rules.json 학생 max 규칙").toBeGreaterThan(0);
  const checks = roleChecks(SCREEN, ROLE_NAME.student);
  for (const [id] of studentMax) expect(checks.some((c) => c.rule === id), `학생 검사에 ${id}`).toBe(true);
  // 화면 7 컴포넌트가 dev-rules 에 있어야 교사·admin 존재 검사가 의미 있다.
  // rules 1.15 R5 에 더해진 threshold-edit(재주문 기준 직접 입력)는 화면 3 소속 — R5 중 stock-intake·reagent-register 가 화면 7 이다
  for (const c of [INTAKE, REGISTER]) expect(devRules.components[c] ?? [], `dev-rules components ${c}`).toContain(SCREEN);
  // R5 의 나머지 컴포넌트 화면 소속 (dev-rules 1.9): threshold-edit [3] · msds-search [3,7] · msds-bulk-banner [2] · doc-upload [7](서류로 입고, d7 §21)
  const R5_HOME: Record<string, number[]> = { "threshold-edit": [3], "msds-search": [3, SCREEN], "msds-bulk-banner": [2], "doc-upload": [SCREEN] };
  expect(R5_COMPONENTS, "1.17 R5 에 doc-upload").toContain("doc-upload");
  expect(devRules.components["doc-upload"] ?? [], "dev-rules 1.9 components 에 doc-upload").toContain(SCREEN);
  for (const c of R5_COMPONENTS.filter((x) => ![INTAKE, REGISTER].includes(x) && x in devRules.components)) {
    expect(Object.keys(R5_HOME), `R5 ${c} 의 화면 소속을 이 테스트가 안다`).toContain(c);
    expect([...(devRules.components[c] ?? [])].sort(), `R5 ${c} 화면 소속`).toEqual(R5_HOME[c]);
  }
  for (const c of ["msds-search", "msds-bulk-banner"]) expect(R5_COMPONENTS, `1.17 R5 에 ${c}`).toContain(c);
});

for (const q of [{}, { tab: "register" }, { reagent: "own" }] as const) {
  const label = "tab" in q ? "?tab=register" : "reagent" in q ? "?reagent={자기 학교 시약}" : "쿼리 없음";
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[STUDENT]} ${routeOf(SCREEN)} (${label}) 접근 → ${routeOf(HOME_SCREEN)} 로 이동 · R5 컴포넌트 0 · roles 개수`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { own } = seedOwnReagents(STUDENT);
    const path = intakePath("reagent" in q ? { reagent: own[0].id } : q);
    const { context, page } = await openAs(browser, info, STUDENT, SCREEN, path);
    try {
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[STUDENT]);
      await expect(page.locator(sel("home-summary")).first(), "학생은 홈으로 보내진다").toBeVisible({ timeout: 30_000 });
      const u = new URL(page.url());
      expect(u.pathname, "학생 최종 경로").toBe(routeOf(HOME_SCREEN));
      for (const c of R5_COMPONENTS) expect(await countComponent(page, c), `학생 ${c} (R5 max ${R5.max})`).toBeLessThanOrEqual(R5.max!);
      await expect(page.locator(`main ${sel(SEGMENT)}`).getByText(exact(TAB_REGISTER)), "입고 갈래 선택 없음").toHaveCount(0);
      await runRoleChecks(page, ROLE_NAME.student, "학생 도착 화면");

      // 리다이렉트를 따라가지 않은 응답 본문에도 화면 7 폼이 없어야 한다 (화면을 그리지 않는다)
      const res = await context.request.get(path, { maxRedirects: 0 });
      const html = await res.text();
      for (const c of R5_COMPONENTS) expect(html, `학생 ${path} 응답 본문에 ${c}`).not.toContain(`data-component="${c}"`);
      expect(html, `학생 응답 본문에 "${TAB_INTAKE}"`).not.toContain(TAB_INTAKE);
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[STUDENT]} 홈·시약 목록·시약 상세: ${routeOf(SCREEN)} 진입 링크 0 · nav 에 "${NAV_LABEL}" 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { own } = seedOwnReagents(STUDENT);
  const pages: { screen: number; path: string; ready: (p: Page) => Promise<void> }[] = [
    { screen: HOME_SCREEN, path: routeOf(HOME_SCREEN), ready: async (p) => expect(p.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 }) },
    // 화면 2 표식: 390 = reagent-row / 1440 = data-table 행 (d7 §23 run b)
    { screen: LIST_SCREEN, path: routeOf(LIST_SCREEN), ready: async (p) => expect(p.locator(isDeskPage(p) ? `main ${sel("data-table")} ${sel("ex-data-table-cell")}` : sel("reagent-row")).first()).toBeVisible({ timeout: 30_000 }) },
    { screen: DETAIL_SCREEN, path: detailPath(own[0].id), ready: waitDetail },
  ];
  for (const t of pages) {
    const { context, page, viewport } = await openAs(browser, info, STUDENT, t.screen, t.path);
    try {
      await t.ready(page);
      await page.waitForLoadState("load");
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[STUDENT]);
      await expect(intakeLinks(page), `학생 화면 ${t.screen}: ${routeOf(SCREEN)} 링크`).toHaveCount(0);
      // 셸 (390 nav-pill / 1440 app-sidebar) 에 입고 메뉴 글자 0
      const shell = shellSchoolScope(page, viewport);
      await expect(shell.getByText(shellIntakeLabel(viewport), { exact: true }), `학생 화면 ${t.screen}: 셸 "${shellIntakeLabel(viewport)}"`).toHaveCount(0);
      await expect(shell.first(), "셸은 있음 (빈 화면에서 0 을 세지 않도록)").toBeVisible();
    } finally {
      await context.close();
    }
  }
});

for (const role of STAFF) {
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${routeOf(SCREEN)} 렌더: 기본 = ${MODE_DOC}(screens_required ${INTAKE_MODE} · doc-upload 1 · ${INTAKE}·${REGISTER} 0) → intake-mode "${MODE_DIRECT}" 누름 → 기본 갈래 ${INTAKE} = 시안 개수 · 등록 갈래 ${REGISTER} 1 (한 번에 한 갈래) · roles 개수`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page, viewport, response } = await openAs(browser, info, role, SCREEN);
    try {
      expect(response?.status(), "화면 7 응답").toBe(200);
      // 기본 (d7 §21 · rules.json intake.entry): 서류로 입고
      await expect(modeControl(page), `${INTAKE_MODE} 1개`).toHaveCount(1, { timeout: 30_000 });
      for (const c of rules.screens_required[String(SCREEN)] ?? []) expect(await countComponent(page, c), `screens_required ${c}`).toBeGreaterThanOrEqual(1);
      await expect(activeMode(page), `기본 = "${MODE_DOC}"`).toHaveText(exact(MODE_DOC));
      await expect(page.locator(`main ${sel("doc-upload")}`), "기본 = doc-upload 1").toHaveCount(1);
      await expect(page.locator(sel(INTAKE)), `서류로 입고에서 ${INTAKE}`).toHaveCount(0);
      await expect(page.locator(sel(REGISTER)), `서류로 입고에서 ${REGISTER}`).toHaveCount(0);
      await runRoleChecks(page, ROLE_NAME[role as keyof typeof ROLE_NAME], "서류로 입고 (기본)");

      await switchMode(page, "direct");
      await waitIntake(page, "intake");
      expect(new URL(page.url()).pathname, "교사·admin 은 화면 7 에 머문다").toBe(routeOf(SCREEN));
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      await expect(page.locator(sel("doc-upload")), "직접 입력에서 doc-upload").toHaveCount(0);

      const frame = frameCounts(viewport);
      // 1.17 시안 7-{폭} 은 "서류로 입고"(intake-mode·doc-upload, 다음 run) 상태라 stock-intake 가 없다 —
      // 직접 입력 갈래는 1.15 시안(stock-intake 1개) 기준: 한 번에 한 갈래 = 1 (dev-rules components_note 화면 7)
      const wantIntake = frame[INTAKE] ?? 1;
      await expect(page.locator(sel(INTAKE)), `기본 갈래 ${INTAKE}`).toHaveCount(wantIntake);
      await expect(page.locator(sel(REGISTER)), `기본 갈래에서 ${REGISTER}`).toHaveCount(0);
      await runRoleChecks(page, ROLE_NAME[role as keyof typeof ROLE_NAME], "기존 시약 입고 갈래");

      await switchTab(page, "register");
      await expect(page.locator(sel(REGISTER)), `등록 갈래 ${REGISTER}`).toHaveCount(1);
      await expect(page.locator(sel(INTAKE)), `등록 갈래에서 ${INTAKE}`).toHaveCount(0);
      await runRoleChecks(page, ROLE_NAME[role as keyof typeof ROLE_NAME], "새 시약 등록 갈래");
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S${SCREEN}] ${ROLE_LABEL.teacher} 진입점(양성 대조): 시약 상세에 ${routeOf(SCREEN)} 링크 ≥ 1, 폭 1440 nav-pill 에 "${NAV_LABEL}" 링크`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { own } = seedOwnReagents("teacher");
  const { context, page, viewport } = await openAs(browser, info, "teacher", DETAIL_SCREEN, detailPath(own[0].id));
  try {
    await waitDetail(page);
    expect(await intakeLinks(page).count(), `교사 시약 상세의 ${routeOf(SCREEN)} 링크`).toBeGreaterThanOrEqual(1);
    await page.goto(DIRECT_PATH);
    await waitIntake(page, "intake");
    const label = shellIntakeLabel(viewport);
    await expect(shellSchoolScope(page, viewport).getByText(label, { exact: true }).locator("visible=true").first(), `셸 "${label}" 보임`).toBeVisible();
    if (viewport === "desktop") {
      // 데스크톱 = app-sidebar 의 sidebar-item "입고" (rules 1.22 desktop_shell.menu teacher_admin)
      const link = shellSchoolScope(page, viewport).locator(`a[href="${routeOf(SCREEN)}"]`);
      await expect(link, "데스크톱 사이드바 입고 링크").toHaveCount(1);
      await expect(link).toHaveText(exact(label));
      await expect(link, "현재 화면 활성").toHaveAttribute("aria-current", "page");
    }
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${SCREEN}] 비로그인 ${routeOf(SCREEN)} 접근 → ${routeOf(1)} · R5 컴포넌트 0`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  const vp = devRules.viewports[info.project.name];
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: vp[0], height: vp[1] } });
  try {
    const page = await context.newPage();
    for (const path of [intakePath(), intakePath({ tab: "register" })]) {
      await page.goto(path);
      await page.waitForURL((u) => u.pathname === routeOf(1), { timeout: 30_000 });
      await expect(page.locator(sel("ex-auth-form-card")).first(), "로그인 화면").toBeVisible();
      for (const c of R5_COMPONENTS) expect(await countComponent(page, c), `비로그인 ${c}`).toBe(0);
      const res = await context.request.get(path, { maxRedirects: 0 });
      const html = await res.text();
      for (const c of R5_COMPONENTS) expect(html, `비로그인 ${path} 응답 본문에 ${c}`).not.toContain(`data-component="${c}"`);
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1
// =====================================================================

for (const role of [...STAFF, "schoolB"] as Role[]) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 기본 상태: nav-pill · ${SEGMENT}(+active 1 "${TAB_INTAKE}") · ${INTAKE} · 검색 text-input · reagent-row = 자기 학교 시약 · button-primary "입고" 비활성 · ${TOAST}·${EMPTY} 0`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const comps = screenComponents();
    for (const c of ["nav-pill", SEGMENT, SEGMENT_ACTIVE, INTAKE, "text-input", "button-primary", "reagent-row", TOAST, EMPTY, REGISTER, "button-outline", "button-pill-soft"]) {
      expect(comps, `dev-rules components 화면 ${SCREEN} 에 ${c}`).toContain(c);
    }
    const school = seedSchoolOf(role);
    const { context, page, response, viewport } = await openAs(browser, info, role, SCREEN, DIRECT_PATH);
    try {
      expect(response?.status(), "화면 7 응답").toBe(200);
      await waitIntake(page, "intake");
      const me = await browserSession(page);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);

      await expectShell(page, viewport, SCREEN, `${ROLE_LABEL[role]} 화면 ${SCREEN}`);
      for (const c of [SEGMENT, INTAKE, "text-input", "button-primary", "reagent-row"]) {
        expect(await countComponent(page, c), c).toBeGreaterThanOrEqual(1);
        await expect(page.locator(sel(c)).first(), `${c} 보임`).toBeVisible();
      }
      // 셸 머리: 390 = nav-pill(워드마크 + 제목 + 학교명) / 1440 = 사이드바(워드마크 + 학교명) + 본문 제목
      await expectShellHeader(page, viewport, { wordmark: "Lab_Stock", title: viewport === "desktop" ? DESK_TITLE7 : NAV_LABEL, schoolName: me.schoolName }, `${ROLE_LABEL[role]} 화면 ${SCREEN}`);
      // 맨 위 intake-mode(직접 입력 선택) + 직접 입력의 두 갈래, 각각 한 번에 하나만 선택
      await expect(modeControl(page), `${INTAKE_MODE} 1개`).toHaveCount(1);
      await expect(activeMode(page), `?mode=direct → "${MODE_DIRECT}"`).toHaveText(exact(MODE_DIRECT));
      await expect(page.locator(`main ${sel(SEGMENT)}`), `${SEGMENT} = ${INTAKE_MODE} 안 1 + 갈래 1`).toHaveCount(2);
      await expect(directSegment(page), "직접 입력 갈래 segmented-control").toHaveCount(1);
      await expect(page.locator(`main ${sel(SEGMENT_ACTIVE)}`), `${SEGMENT_ACTIVE} = 입고 방법 1 + 갈래 1`).toHaveCount(2);
      await expect(activeSegment(page), `${SEGMENT_ACTIVE} 1개`).toHaveCount(1);
      await expect(activeSegment(page)).toHaveText(exact(TAB_INTAKE));
      await expect(segmentOption(page, TAB_REGISTER), `"${TAB_REGISTER}" 옵션`).toHaveCount(1);
      // 검색 바 · 시약 미선택 → 수량 입력 없음, 입고 비활성
      await expect(searchInput(page), "검색 바").toHaveCount(1);
      await expect(page.locator(`main ${sel(INTAKE)} ${sel("text-input")}`).first()).toBeVisible();
      await expect(intakeButton(page), '"입고" button-primary').toHaveCount(1);
      await expectNotSelected(page);
      // 저장 전·검색 전에는 상태 컴포넌트가 없다
      expect(await countComponent(page, TOAST), `${TOAST} 저장 전`).toBe(0);
      expect(await countComponent(page, EMPTY), `${EMPTY} 검색 전`).toBe(0);
      // 빈 검색어 = 자기 학교 시약 (seed 시약이 모두 행에 있다)
      const names = await rowNames(page);
      const { own } = seedOwnReagents(role);
      for (const r of own) expect(names, `결과 행에 자기 학교 seed 시약 ${r.name}`).toContain(r.name);
    } finally {
      await context.close();
    }
  });
}

for (const role of STAFF) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 검색 → 시약 선택 상태: 시안 7 컴포넌트 개수 이상 · 검색 결과 = 이름에 검색어가 든 자기 학교 시약 · 스테퍼(button-outline − +) · 프리셋 ${PRESETS.join("·")} · "현재 N → 입고 후 M" · 입고일 = 오늘`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN, DIRECT_PATH);
    try {
      await waitIntake(page, "intake");
      const frame = frameCounts(viewport);
      const { own } = seedOwnReagents(role);
      // 시안의 결과 행 수 이상이 나오는 검색어를 자기 학교 seed 시약명에서 고른다 (시안: "황산" → 행 여러 개, 그중 1개 선택)
      // 1.17 시안 7 은 "서류로 입고" 상태(다음 run) — 직접 입력 검색 결과 행 수는 1.15 시안(reagent-row 2: 여러 행 중 하나 선택) 기준
      const wantRows = frame["reagent-row"] ?? 2;
      expect(wantRows, `시안 7-${viewport} reagent-row 개수`).toBeGreaterThan(0);
      const chars = [...new Set(own.flatMap((r) => [...r.name]))].filter((c) => /[가-힣]/.test(c));
      const query = chars
        .map((c) => ({ c, n: own.filter((r) => r.name.includes(c)).length }))
        .sort((a, b) => b.n - a.n)[0];
      expect(query.n, `seed 시약명으로 시안 행 수(${wantRows}) 이상 나오는 검색어가 있어야 함`).toBeGreaterThanOrEqual(wantRows);

      // 검색 결과 = 이름에 검색어가 든 자기 학교 시약 전부 (다른 테스트의 임시 시약이 드나들 수 있어 DB 스냅샷과 짝지어 비교)
      let matched = false;
      for (let i = 0; i < 5 && !matched; i++) {
        const before = (await dbReagents(page)).map((r) => r.name).filter((n) => n.includes(query.c)).sort();
        await page.goto(DIRECT_PATH);
        await waitIntake(page, "intake");
        await searchInput(page).fill(query.c);
        await expect(rows(page).first()).toBeVisible();
        const shown = (await rowNames(page)).sort();
        const after = (await dbReagents(page)).map((r) => r.name).filter((n) => n.includes(query.c)).sort();
        if (JSON.stringify(before) !== JSON.stringify(after)) continue;
        expect(shown, `검색어 "${query.c}" 결과 행`).toEqual(after);
        matched = true;
      }
      expect(matched, "시약 목록이 계속 바뀌어 비교할 스냅샷을 얻지 못함").toBe(true);

      const target = own.find((r) => r.name.includes(query.c))!;
      await searchAndSelect(page, query.c, target.name);
      const db = await dbReagent(page, target.id);
      expect(db, "선택한 시약 DB 행").not.toBeNull();

      // 프리셋 칩 (시안: 1 · 5 · 10) — 누르면 수량 칸에 그 값
      for (const p of PRESETS) {
        await expect(chip(intakeForm(page), p), `프리셋 칩 ${p}`).toHaveCount(1);
        await chip(intakeForm(page), p).click();
        await expect(quantityInput(page), `프리셋 ${p} → 수량`).toHaveValue(String(p));
        const pv = await readPreview(page);
        expect(pv, `"현재 N → 입고 후 M" 미리보기 (수량 ${p})`).not.toBeNull();
        expect(pv!.current, "미리보기 현재 = DB stock").toBe(db!.stock);
        expect(pv!.after, "미리보기 입고 후 = 현재 + 수량").toBe(db!.stock + p);
      }
      // 시안과 같은 상태: 수량 5
      await chip(intakeForm(page), 5).click();

      // 시안 프레임에 있는 화면 7 컴포넌트는 프레임 개수 이상 (탭바는 C2)
      for (const name of screenComponents()) {
        // 셸(390 nav-pill·탭바 / 1440 app-sidebar)은 폭별 기대값 — C2 · C3 (예전 프레임의 데스크톱 nav-pill 은 1.22 에서 사이드바로 바뀜)
        if (isShellComponent(name)) continue;
        // 1.17 시안 7 은 "서류로 입고" 상태 — 서류 갈래에만 있는 컴포넌트(variants["7"] doc-*, intake-mode 제외)는 직접 입력 갈래에서 세지 않는다
        // (서류 갈래 개수는 screen-7-doc.spec.ts)
        const docOnly = Object.entries((rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)])
          .filter(([k]) => k.startsWith("doc-"))
          .flatMap(([, v]) => v)
          .filter((c) => c !== INTAKE_MODE);
        if (docOnly.includes(name)) continue;
        const want = frame[name];
        if (!want) continue; // 프레임에 없는 상태 컴포넌트(reagent-register·ex-empty-state-card·ex-toast)는 다른 테스트
        expect(await countComponent(page, name), `${name} ≥ 시안 7-${viewport} ${want}개`).toBeGreaterThanOrEqual(want);
      }
      expect(await rows(page).count(), `결과 reagent-row ≥ 시안 ${wantRows}`).toBeGreaterThanOrEqual(wantRows);
      expect(await intakeForm(page).locator(sel("text-input")).count(), "stock-intake 안 text-input (검색·수량·입고일)").toBeGreaterThanOrEqual(3);

      // 스테퍼: − · 수량 · +
      await expect(intakeForm(page).getByText(exact(QUANTITY_LABEL)).first(), `"${QUANTITY_LABEL}" 라벨`).toBeVisible();
      expect(await intakeForm(page).getByText(exact(REQUIRED_MARK)).count(), `"${REQUIRED_MARK}" 표시 (입고 수량·입고일)`).toBeGreaterThanOrEqual(2);
      await expect(stepperButton(page, "−"), "스테퍼 −").toHaveCount(1);
      await expect(stepperButton(page, "+"), "스테퍼 +").toHaveCount(1);
      await stepperButton(page, "+").click();
      await expect(quantityInput(page), "+ → 6").toHaveValue("6");
      await stepperButton(page, "−").click();
      await expect(quantityInput(page), "− → 5").toHaveValue("5");
      // 단위 suffix
      await expect(intakeForm(page)).toContainText(db!.unit);

      // 입고일: 필수, 기본값 = 오늘
      const date = intakeForm(page).getByLabel(DATE_LABEL);
      await expect(date, "입고일 입력").toHaveCount(1);
      expect((await date.inputValue()).replace(/\D/g, ""), "입고일 기본값 = 오늘(Asia/Seoul)").toBe(todayDigits());

      // 필수 항목이 찼으므로 입고 활성. 저장 전이므로 토스트 없음
      await expect(intakeButton(page), "입고 활성").toBeEnabled();
      expect(await countComponent(page, TOAST), `${TOAST} 저장 전`).toBe(0);
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S${SCREEN}] ${ROLE_LABEL.teacher} 수량 검사: 0 에서 − 비활성 · 빈 값·음수는 "${QUANTITY_HINT}" · 무효 수량·입고일 비움이면 "입고" 비활성 (저장 요청 없음)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { own } = seedOwnReagents("teacher");
  const target = own[0];
  const { context, page } = await openAs(browser, info, "teacher", SCREEN, DIRECT_PATH);
  try {
    await waitIntake(page, "intake");
    const before = await dbReagent(page, target.id);
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") posts.push(`${r.method()} ${r.url()}`);
    });
    await searchAndSelect(page, target.name, target.name);
    const q = quantityInput(page);
    const hint = intakeForm(page).getByText(QUANTITY_HINT);

    await chip(intakeForm(page), 1).click();
    await expect(q).toHaveValue("1");
    await expect(hint, "유효 수량이면 안내 없음").toHaveCount(0);
    await expect(intakeButton(page)).toBeEnabled();

    // 1 → − → 0: − 비활성, 입고 비활성
    await stepperButton(page, "−").click();
    await expect(q).toHaveValue("0");
    await expect(stepperButton(page, "−"), "수량 0 에서 − 비활성").toBeDisabled();
    await expect(intakeButton(page), "수량 0 → 입고 비활성").toBeDisabled();

    for (const bad of ["", "-1", "-0.5"]) {
      await q.fill(bad);
      await expect(hint.first(), `수량 '${bad}' → "${QUANTITY_HINT}"`).toBeVisible();
      await expect(intakeButton(page), `수량 '${bad}' → 입고 비활성`).toBeDisabled();
      expect(await readPreview(page), `수량 '${bad}' → "입고 후" 미리보기 없음`).toBeNull();
      // 비활성 버튼을 억지로 눌러도, Enter 로 제출해도 저장되지 않는다
      await intakeButton(page).click({ force: true });
      await q.press("Enter");
    }
    for (const bad of ["abc", "0"]) {
      await q.fill(bad);
      await expect(intakeButton(page), `수량 '${bad}' → 입고 비활성`).toBeDisabled();
      await q.press("Enter");
    }

    // 다시 유효 → 활성, 입고일(필수)을 비우면 비활성
    await chip(intakeForm(page), 5).click();
    await expect(hint).toHaveCount(0);
    await expect(intakeButton(page)).toBeEnabled();
    await intakeForm(page).getByLabel(DATE_LABEL).fill("");
    await expect(intakeButton(page), "입고일 비움 → 입고 비활성").toBeDisabled();

    await page.waitForTimeout(1_000);
    expect(await countComponent(page, TOAST), `${TOAST} 없음`).toBe(0);
    expect(new URL(page.url()).pathname, "화면 유지").toBe(routeOf(SCREEN));
    expect(posts, "저장 요청 없음").toEqual([]);
    expect((await dbReagent(page, target.id))?.stock, "DB stock 불변").toBe(before!.stock);
  } finally {
    await context.close();
  }
});

for (const role of STAFF) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 새 시약 등록 갈래: ${REGISTER} · 필수 ${REGISTER_REQUIRED.join("·")} · 종류 = rules.json storage_classes · 단위 ${UNITS.join("·")} · 필수 비면 "시약 등록" 비활성 · 재고량 무효 "${QUANTITY_HINT}"`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    expect(STORAGE_CLASSES.length, "rules.json cabinet.storage_classes").toBeGreaterThan(0);
    const { context, page } = await openAs(browser, info, role, SCREEN, DIRECT_PATH);
    try {
      await waitIntake(page, "intake");
      const posts: string[] = [];
      page.on("request", (r) => {
        if (r.method() !== "GET") posts.push(`${r.method()} ${r.url()}`);
      });
      await switchTab(page, "register");
      const form = registerForm(page);
      await expect(page.locator(sel(REGISTER))).toHaveCount(1);
      await expect(activeSegment(page), `${SEGMENT_ACTIVE} 1개`).toHaveCount(1);
      await expect(activeSegment(page)).toHaveText(exact(TAB_REGISTER));

      for (const l of [...REGISTER_REQUIRED, ...REGISTER_OPTIONAL]) {
        await expect(form.getByText(exact(l)).first(), `라벨 "${l}"`).toBeVisible();
      }
      expect(await form.getByText(exact(REQUIRED_MARK)).count(), `"${REQUIRED_MARK}" 표시 수`).toBe(REGISTER_REQUIRED.length);
      expect(await form.locator(sel("text-input")).count(), "text-input (시약명·재고량·입고일·MSDS)").toBeGreaterThanOrEqual(4);
      expect((await form.getByLabel(DATE_LABEL).inputValue()).replace(/\D/g, ""), "입고일 기본값 = 오늘").toBe(todayDigits());

      // 종류 = storage_classes (순서까지)
      const options = await openClassOptions(page);
      expect((await options.allInnerTexts()).map((t) => t.trim()), "종류 옵션").toEqual(STORAGE_CLASSES);
      await page.keyboard.press("Escape");

      // 단위 = 병·mL·g
      for (const u of UNITS) await expect(chip(form, u), `단위 ${u}`).toHaveCount(1);

      const btn = registerButton(page);
      await expect(btn, '"시약 등록" button-primary').toHaveCount(1);
      await expect(btn, "빈 폼 → 비활성").toBeDisabled();

      // 필수 항목을 하나씩 채운다 — 전부 차야 활성
      await form.getByLabel("시약명").fill("C1 검사용 (저장 안 함)");
      await expect(btn, "시약명만 → 비활성").toBeDisabled();
      const opts = await openClassOptions(page);
      await opts.filter({ hasText: exact(STORAGE_CLASSES[0]) }).click();
      await expect(form.getByRole("listbox"), "고르면 목록 닫힘").toHaveCount(0);
      await expect(btn, "재고량 비어 있음 → 비활성").toBeDisabled();
      const stock = form.getByLabel("재고량");
      for (const bad of ["0", "-3"]) {
        await stock.fill(bad);
        await expect(form.getByText(QUANTITY_HINT).first(), `재고량 '${bad}' → "${QUANTITY_HINT}"`).toBeVisible();
        await expect(btn, `재고량 '${bad}' → 비활성`).toBeDisabled();
        await btn.click({ force: true });
        await stock.press("Enter");
      }
      await stock.fill("3");
      await expect(form.getByText(QUANTITY_HINT), "유효 재고량이면 안내 없음").toHaveCount(0);
      for (const u of UNITS) {
        await chip(form, u).click();
        await expect(form.locator(sel("text-input")).filter({ has: page.getByLabel("재고량") }), `단위 suffix ${u}`).toContainText(u);
      }
      await expect(btn, "필수 모두 채움 → 활성").toBeEnabled();
      // 필수 하나를 다시 비우면 비활성
      await form.getByLabel("시약명").fill("   ");
      await expect(btn, "시약명 공백 → 비활성").toBeDisabled();
      await form.getByLabel("시약명").fill("C1 검사용 (저장 안 함)");
      await form.getByLabel(DATE_LABEL).fill("");
      await expect(btn, "입고일 비움 → 비활성").toBeDisabled();

      await page.waitForTimeout(1_000);
      expect(await countComponent(page, TOAST), `${TOAST} 없음`).toBe(0);
      expect(posts, "저장 요청 없음").toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S${SCREEN}] ${ROLE_LABEL.teacher} 검색 0건: 검색 바 유지 · ${EMPTY} 1("${EMPTY_TITLE}") · reagent-row 0 · button-pill-soft "${TAB_REGISTER}" → 등록 갈래 전환`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN, DIRECT_PATH);
  try {
    await waitIntake(page, "intake");
    const none = `없는시약-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await searchInput(page).fill(none);
    const card = page.locator(`main ${sel(EMPTY)}`);
    await expect(card, `${EMPTY}`).toHaveCount(1);
    await expect(card).toBeVisible();
    await expect(card).toContainText(EMPTY_TITLE);
    await expect(card).toContainText(EMPTY_BODY);
    await expect(rows(page), "결과 행 0").toHaveCount(0);
    await expect(searchInput(page), "검색 바 유지").toHaveValue(none);
    await expect(intakeButton(page), "선택 없음 → 입고 비활성").toBeDisabled();
    const action = card.locator(sel("button-pill-soft")).filter({ hasText: exact(TAB_REGISTER) });
    await expect(action, `"${TAB_REGISTER}" button-pill-soft`).toHaveCount(1);

    await action.click();
    await waitIntake(page, "register");
    await expect(page.locator(sel(REGISTER)), "등록 갈래").toHaveCount(1);
    await expect(page.locator(sel(INTAKE))).toHaveCount(0);
    await expect(activeSegment(page)).toHaveText(exact(TAB_REGISTER));
    expect(await countComponent(page, EMPTY), "등록 갈래에는 빈 상태 카드 없음").toBe(0);

    // 검색어를 지우면 빈 상태 카드가 사라지고 목록이 다시 보인다
    await switchTab(page, "intake");
    await searchInput(page).fill(none);
    await expect(page.locator(`main ${sel(EMPTY)}`)).toHaveCount(1);
    await searchInput(page).fill("");
    await expect(page.locator(`main ${sel(EMPTY)}`), "검색어 비움 → 카드 없음").toHaveCount(0);
    await expect(rows(page).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const role of STAFF) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} ?tab=register → 등록 갈래로 시작 · ?reagent={자기 학교 시약} → 그 시약 선택 상태로 시작`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { own } = seedOwnReagents(role);
    const target = own[own.length - 1];
    const { context, page, response } = await openAs(browser, info, role, SCREEN, intakePath({ tab: "register" }));
    try {
      expect(response?.status()).toBe(200);
      await waitIntake(page, "register");
      await expect(page.locator(sel(REGISTER))).toHaveCount(1);
      await expect(page.locator(sel(INTAKE))).toHaveCount(0);
      // 예전 링크(?tab·?reagent)는 mode 가 없어도 직접 입력으로 연다 (d7 §21 진입)
      await expect(activeMode(page), `?tab=register → "${MODE_DIRECT}"`).toHaveText(exact(MODE_DIRECT));
      await expect(page.locator(`main ${sel(SEGMENT_ACTIVE)}`), `${SEGMENT_ACTIVE} = 입고 방법 1 + 갈래 1`).toHaveCount(2);
      await expect(page.locator(sel("doc-upload")), "직접 입력에서 doc-upload").toHaveCount(0);
      await expect(activeSegment(page)).toHaveText(exact(TAB_REGISTER));

      const res = await page.goto(intakePath({ reagent: target.id }));
      expect(res?.status()).toBe(200);
      await waitIntake(page, "intake");
      await expect(activeMode(page), `?reagent → "${MODE_DIRECT}"`).toHaveText(exact(MODE_DIRECT));
      await expect(activeSegment(page)).toHaveText(exact(TAB_INTAKE));
      await expectSelected(page, target.name);
      const db = await dbReagent(page, target.id);
      const text = (await intakeForm(page).innerText()).replace(/[\s,]/g, "");
      expect(text, "현재 재고 표시").toContain(`현재${db!.stock}${db!.unit}`.replace(/\s/g, ""));
      await expect(intakeForm(page).getByLabel(DATE_LABEL)).toHaveCount(1);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// C2
// =====================================================================

for (const role of [...STAFF, "schoolB"] as Role[]) {
  for (const tab of ["intake", "register"] as const) {
    test(`[C2][S${SCREEN}] ${ROLE_LABEL[role]} (${tab === "intake" ? TAB_INTAKE : TAB_REGISTER}): 탭바 = rules.json tab_bar (390 표시·항목 수·라벨·활성 "${ACTIVE_TAB_LABEL}", 1440 미표시) · 모바일 하단 버튼이 tab-bar 위`, async ({ browser }, info) => {
      test.setTimeout(120_000);
      const tb = rules.tab_bar;
      expect(tb.labels, `tab_bar labels 에 "${ACTIVE_TAB_LABEL}"`).toContain(ACTIVE_TAB_LABEL);
      const { context, page, viewport } = await openAs(browser, info, role, SCREEN, intakePath(tab === "register" ? { tab } : { mode: "direct" }));
      try {
        await waitIntake(page, tab);
        const shown = viewport === "mobile" && tb.mobile_screens.includes(SCREEN);
        if (viewport === "mobile") expect(shown, `rules.json tab_bar.mobile_screens 에 화면 ${SCREEN}`).toBe(true);
        await expect(page.locator(sel(tb.component)), `${viewport} ${tb.component}`).toHaveCount(shown ? 1 : 0);
        await expect(page.locator(sel(tb.item)), `${viewport} ${tb.item}`).toHaveCount(shown ? tb.items : 0);
        if (!shown) return;

        expect(tb.labels.length, "rules.json tab_bar labels 수 = items").toBe(tb.items);
        const bar = page.locator(sel(tb.component));
        await expect(bar).toBeVisible();
        const items = bar.locator(sel(tb.item));
        await expect(items, "tab-item 은 tab-bar 안에").toHaveCount(tb.items);
        const labels = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
        expect(labels, "탭 라벨 순서").toEqual(tb.labels);
        // 활성 탭 = "시약" 하나
        const active = bar.locator(`${sel(tb.item)}[aria-current="page"]`);
        await expect(active, "활성 tab-item 1개").toHaveCount(1);
        await expect(active).toHaveText(exact(ACTIVE_TAB_LABEL));

        // 하단 전폭 버튼은 tab-bar 바로 위 (가려지지 않음, 간격 16)
        const btn = tab === "intake" ? intakeButton(page) : registerButton(page);
        const check = async (state: string) => {
          await expect(btn, `${state}: 하단 버튼 보임`).toBeVisible();
          const b = (await btn.boundingBox())!;
          const t = (await bar.boundingBox())!;
          const vp = page.viewportSize()!;
          expect(Math.round(t.y + t.height), "tab-bar 는 화면 아래 끝").toBe(vp.height);
          expect(b.y, `${state}: 버튼이 화면 안`).toBeGreaterThanOrEqual(0);
          expect(b.y + b.height, `${state}: 버튼 아래 끝 ≤ tab-bar 위`).toBeLessThanOrEqual(t.y + 0.5);
          expect(Math.abs(t.y - (b.y + b.height) - BUTTON_TAB_GAP), `${state}: 버튼과 tab-bar 사이 ${BUTTON_TAB_GAP} (실제 ${t.y - (b.y + b.height)})`).toBeLessThanOrEqual(1.5);
          expect(b.height, "버튼 높이 ≥ rules.json button.min_height").toBeGreaterThanOrEqual(BUTTON_MIN_HEIGHT);
          // 버튼 가운데 지점의 맨 위 요소가 버튼 자신 (다른 것에 덮이지 않음)
          const onTop = await btn.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return !!top && (top === el || el.contains(top));
          });
          expect(onTop, `${state}: 버튼이 다른 요소에 덮이지 않음`).toBe(true);
        };
        await check("처음");
        if (tab === "intake") {
          // 시약을 고르면 폼이 길어진다 — 맨 아래까지 내려도 버튼·마지막 입력이 탭바에 가려지지 않는다
          const { own } = seedOwnReagents(role);
          await searchAndSelect(page, own[0].name, own[0].name);
          await check("시약 선택 후");
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await check("맨 아래로 스크롤");
          const date = intakeForm(page).getByLabel(DATE_LABEL);
          await date.scrollIntoViewIfNeeded();
          const d = (await date.boundingBox())!;
          const b = (await btn.boundingBox())!;
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          const d2 = (await date.boundingBox())!;
          expect(d2.y + d2.height, `맨 아래에서 입고일 입력(아래 끝 ${d2.y + d2.height})이 하단 버튼(위 ${b.y})에 가려지지 않음`).toBeLessThanOrEqual(b.y + 0.5);
          expect(d.height).toBeGreaterThan(0);
        } else {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await check("맨 아래로 스크롤");
          const last = registerForm(page).getByLabel(REGISTER_OPTIONAL[0]);
          const l = (await last.boundingBox())!;
          const b = (await btn.boundingBox())!;
          expect(l.y + l.height, `맨 아래에서 마지막 입력(아래 끝 ${l.y + l.height})이 하단 버튼(위 ${b.y})에 가려지지 않음`).toBeLessThanOrEqual(b.y + 0.5);
        }
      } finally {
        await context.close();
      }
    });
  }
}

const BUTTON_MIN_HEIGHT = (rules as unknown as { button: { min_height: number } }).button.min_height;

// =====================================================================
// V1 (보고용 스크린샷, 실패 조건 아님) — 시안과 같은 상태: 검색어 "황산" → 시약 선택 → 수량 5
// =====================================================================
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (교사, 검색 "황산" → 시약 선택 · 수량 5, 저장 전)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN, DIRECT_PATH);
  try {
    await (async () => {
      await waitIntake(page, "intake");
      await searchInput(page).fill("황산");
      if ((await rows(page).count()) === 0) await searchInput(page).fill("");
      await rows(page).first().click({ timeout: 10_000 });
      await chip(intakeForm(page), 5).click({ timeout: 10_000 });
    })().catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: true });
  } finally {
    await context.close();
  }
});
