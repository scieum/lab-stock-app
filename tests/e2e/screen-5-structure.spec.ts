// 화면 5 (실험 매뉴얼, dev-rules.json routes["5"]) 구조 규칙: R-ui · C1(1단계 · 추출 요청 · 처리 중 · 2단계 구성 · 실패 응답 · 닫기 · 다시 추출) · C2 · V1
// 기준: harness/d5-gates.md D3, harness/dev-rules.json (routes·route_auth 5·5_note·components·components_note·viewports),
//       design/rules.json (roles R1, tab_bar), 디자인 s2-spec "## 화면 5", design/frames/5-*.json, harness/d7-data.md §13.
// 이 파일은 공용 테스트 계정(학교 A)만 쓰고 DB 에 쓰지 않는다:
// - 추출 API 는 가로채 가짜 응답을 준다 (실제 Gemini 호출 없음). 실제 서버 응답은 "키 없음 → 503" 1종만, 서버에 키가 있으면 skip.
// - "확인 후 저장" 을 누르지 않는다. 화면 5 의 서버 액션 요청은 blockSaves 로 끊어 두고 0건을 단언한다.
// 저장 흐름·연결 상태·학교 분리는 일회용 학교의 screen-5-states.
import { join } from "node:path";
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { ROLE_LABEL } from "./db-helpers";
import { openAs, type RolePage } from "./auth-state";
import { PROFILE_ROLE, ROLE_NAME, browserClient, browserSession, countComponent, devRules, roleChecks, routeOf, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, anonContext } from "./screen-8-helpers";
import { expectShell, locationPath, shellSchoolScope } from "./shell-helpers";
import {
  BUSY,
  MANUAL_BUTTON,
  boxOf,
  countsOf,
  exact,
  foreignComponents,
  frameCounts,
  linksTo,
  manual as reorderManual,
  onTop,
  ownReagentsOf,
  sharedSnapshot,
  tabBarTop,
  waitReorder,
} from "./screen-6-9-helpers";
import {
  BOTTOM_GAP,
  CELL,
  CLOSE,
  D7_QUOTES,
  D7_S13,
  EXTRACT,
  FILE_KINDS,
  FRAME_FILE,
  FRAME_ITEMS,
  FRAME_ROWS,
  GROUPS,
  GROUPS_LABEL,
  GROUPS_UNIT,
  GUIDE,
  G_MAX,
  G_MIN,
  HAS_KEY_REASON,
  HEAD,
  HOME_HREF,
  HOME_SCREEN,
  INPUT,
  LOGIN_HREF,
  MANUAL_HREF,
  MANUAL_SCREEN,
  MAX_BYTES,
  MAX_MB,
  NAV_TITLE,
  NO_KEY_TEXT,
  OUTLINE,
  OVERLAY,
  PRIMARY,
  PROGRESS_LABEL,
  REORDER_HREF,
  REORDER_SCREEN,
  RETRY,
  SAVE,
  SERVER_HAS_KEY,
  TABLE,
  TITLE,
  TOAST,
  UNITS,
  UPLOAD,
  amountInput,
  backLink,
  backExpected,
  blockSaves,
  bodyRows,
  bottomEdgeOnTop,
  bottomNotices,
  closeButton,
  expectTabBar,
  extractButton,
  failReply,
  fileInput,
  groupsBox,
  groupsInput,
  main,
  mockExtract,
  titleScope,
  okReply,
  overlay,
  pdf,
  pickFileAndGroups,
  progress,
  readRows,
  requiredText,
  retryButton,
  roleLimitedElsewhere,
  rowByName,
  saveButton,
  screenComponents,
  scrollAllToEnd,
  squash,
  table,
  toResult,
  uploadAlerts,
  uploadArea,
  waitManual,
} from "./screen-5-helpers";

const SCREEN = MANUAL_SCREEN;
const R1 = rules.roles.R1;
const STAFF = ["teacher", "admin"] as const;
/** 학생이 들어갈 수 있는 화면 — R1 컴포넌트와 화면 5 진입 링크가 없는지 보는 곳 (홈 · 시약 목록 · 사용 기록 내역 · 시약장) */
const STUDENT_SCREENS = [HOME_SCREEN, 2, 10, 11];

let before: string[] | null = null;

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedSnapshot();
});

test.afterAll(async () => {
  if (HAS_SERVICE && before) expect(await sharedSnapshot(), "학교 A·B·데모의 시약 기준 열(min_stock·reorder_per_group·reorder_groups)이 그대로").toEqual(before);
});

type Opened = RolePage & { saves: { count: () => number } };

/** 공용 계정으로 화면 5 를 연다 — 서버 액션(저장) 요청은 끊어 둔다 */
async function openManual(browser: Browser, info: TestInfo, role: "teacher" | "admin"): Promise<Opened> {
  const opened = await openAs(browser, info, role, SCREEN);
  const saves = await blockSaves(opened.context);
  await waitManual(opened.page);
  return { ...opened, saves };
}

/** 공용 계정 화면을 닫기 전에: 저장 요청이 한 번도 나가지 않았다 */
function expectNoSave(o: Opened): void {
  expect(o.saves.count(), "공용 계정 화면의 저장(서버 액션) 요청 0건").toBe(0);
}

/** 1단계 상태인지: 표·저장 버튼 없음, "AI 추출" 있음 */
async function expectStepOne(page: Page, what: string): Promise<void> {
  await expect(table(page), `${what}: ${TABLE} 없음`).toHaveCount(0);
  await expect(saveButton(page), `${what}: "${SAVE}" 없음`).toHaveCount(0);
  await expect(retryButton(page), `${what}: "${RETRY}" 없음`).toHaveCount(0);
  await expect(extractButton(page), `${what}: "${EXTRACT}" 1개`).toHaveCount(1);
  await expect(progress(page), `${what}: 진행 막대 없음`).toHaveCount(0);
}

// =====================================================================
// 기대값 자체 점검
// =====================================================================

test(`[C1][S${SCREEN}] 기대값 원본: 프레임 5 의 문구·4행·조 수와 d7 §13 (파일 ${FILE_KINDS.join("·")} ${MAX_MB}MB · 조 수 ${G_MIN}~${G_MAX} · 단위 · 키 없음 문구), dev-rules routes·components 가 서로 맞는다`, () => {
  expect(MANUAL_HREF, "dev-rules routes 5").toBe("/manual");
  expect(NAV_TITLE).toBe("실험 매뉴얼");
  expect(GUIDE).toBe("실험 매뉴얼을 올리면 시약별 사용량을 찾아드려요");
  expect([GROUPS_LABEL, GROUPS, GROUPS_UNIT]).toEqual(["조 수", 4, "조"]);
  expect(TITLE).toBe("추출 결과 확인");
  expect(CLOSE).toBe("닫기");
  expect(HEAD).toEqual(["시약명", "1조 사용량", "단위", "1반 1회 필요량"]);
  expect(FRAME_ROWS.map((r) => r[0]), "시안 1.17 4행의 시약명").toEqual(["염산", "수산화나트륨", "페놀프탈레인 용액", "증류수"]);
  for (const [name, per, unit, required] of FRAME_ROWS) {
    expect(UNITS, `${name} 단위`).toContain(unit);
    expect(required, `${name} 필요량 = 사용량 × 조 수`).toBe(requiredText(per, GROUPS, unit));
  }
  expect([RETRY, SAVE]).toEqual(["다시 추출", "확인 후 저장"]);
  expect(FILE_KINDS).toEqual(["PDF", "JPG", "PNG"]);
  expect(MAX_MB).toBe(4);
  expect([G_MIN, G_MAX]).toEqual([1, 20]);
  expect(UNITS).toEqual(["병", "mL", "g"]);
  expect(NO_KEY_TEXT, "d7 §13 키 없음 문구").toBe("AI 추출을 쓸 수 없어요(서버 설정)");
  for (const q of D7_QUOTES) expect(D7_S13, `d7 §13 에 ${q}`).toContain(q);
  // 디자인 1.15: 공통 셸 예외 nav-account-menu (rules.json app_exceptions) 가 로그인 후 셸 화면 모두에 더해졌다 (dev-rules components_note)
  expect((rules as unknown as { app_exceptions: Record<string, string> }).app_exceptions, "rules app_exceptions nav-account-menu").toHaveProperty("nav-account-menu");
  // 1.22: 데스크톱 셸 app-sidebar · sidebar-item (rules desktop_shell, dev-rules 1.11) 도 로그인 후 셸 화면 모두에 더해졌다
  const ds = (rules as unknown as { desktop_shell: { component: string; item: string } }).desktop_shell;
  expect(screenComponents().sort(), "dev-rules 화면 5 컴포넌트").toEqual([OVERLAY, OUTLINE, PRIMARY, CELL, TOAST, TABLE, UPLOAD, "nav-pill", "nav-account-menu", "tab-bar", "tab-item", ds.component, ds.item, INPUT].sort());
  expect(BOTTOM_GAP, "시안 bottom-actions 아래 여백").toBeGreaterThan(0);
});

// =====================================================================
// R-ui
// =====================================================================

test(`[R-ui][S${SCREEN}] rules.json R1 = ${UPLOAD} 학생 0 · dev-rules components ${UPLOAD} 에 화면 ${SCREEN} · route_auth ${SCREEN} = 교사·admin만`, () => {
  expect(R1.component, "R1 컴포넌트").toBe(UPLOAD);
  expect([R1.role, R1.max], "R1 학생 max 0").toEqual([ROLE_NAME.student, 0]);
  expect(devRules.components[UPLOAD] ?? [], `dev-rules components ${UPLOAD}`).toContain(SCREEN);
  expect(
    roleChecks(SCREEN, ROLE_NAME.student).some((k) => k.component === UPLOAD && k.op === "max" && k.value === 0),
    `학생 검사에 ${UPLOAD} = 0`,
  ).toBe(true);
  for (const role of [ROLE_NAME.teacher, ROLE_NAME.admin]) {
    expect(roleChecks(SCREEN, role).some((k) => k.component === UPLOAD && k.op === "max"), `${role} 검사에는 ${UPLOAD} 상한 없음`).toBe(false);
  }
  const auth = (devRules as unknown as { route_auth: Record<string, string> }).route_auth;
  expect(auth[String(SCREEN)], `route_auth ${SCREEN}`).toContain("교사·admin만");
  expect(auth[`${SCREEN}_note`], `route_auth ${SCREEN}_note`).toContain("학생이 /manual 에 오면 / 로 보낸다");
});

test(`[R-ui][S${SCREEN}] 학교A 학생 ${MANUAL_HREF} → ${HOME_HREF} (HTTP 3xx · 응답 본문에 "${GUIDE.slice(0, 11)}"·"${EXTRACT}"·시약명·${UPLOAD} 없음 · 도착 화면에 ${UPLOAD}·${TABLE} 0 · ${MANUAL_HREF} 링크 0)`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "student", SCREEN);
  try {
    await page.waitForURL((u) => u.pathname === HOME_HREF, { timeout: 30_000 });
    await expect(page.locator(sel("home-summary")).first(), "홈으로 보내졌다").toBeVisible();
    expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE.student);
    for (const c of roleChecks(SCREEN, ROLE_NAME.student).filter((k) => k.op === "max")) {
      expect(await countComponent(page, c.component), `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
    }
    expect(await countsOf(page, [UPLOAD, TABLE, OVERLAY]), "학생 도착 화면").toEqual({ [UPLOAD]: 0, [TABLE]: 0, [OVERLAY]: 0 });
    await expect(linksTo(page, MANUAL_HREF), `${MANUAL_HREF} 링크`).toHaveCount(0);

    // 직접 요청: 본문을 내보내기 전에 3xx 로 판정한다 — 본문에 화면 5 의 내용·시약 목록이 없다
    const { client } = await browserClient(page);
    const reagents = await ownReagentsOf(client);
    expect(reagents.length, "대조: 학생도 자기 학교 시약은 읽는다").toBeGreaterThan(0);
    const res = await context.request.get(MANUAL_HREF, { maxRedirects: 0 });
    expect(res.status(), `${MANUAL_HREF} 응답 코드`).toBeGreaterThanOrEqual(300);
    expect(res.status(), `${MANUAL_HREF} 응답 코드`).toBeLessThan(400);
    expect(locationPath(res.headers()["location"], info), "Location").toBe(HOME_HREF);
    const body = await res.text();
    for (const word of [GUIDE, GUIDE.slice(0, 11), EXTRACT, GROUPS_LABEL, ...reagents.map((r) => r.name), `data-component="${UPLOAD}"`, `data-component="${TABLE}"`]) {
      expect(body.includes(word), `3xx 응답 본문에 '${word}'`).toBe(false);
    }
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${SCREEN}] 비로그인 ${MANUAL_HREF} → ${LOGIN_HREF} (HTTP 3xx · 본문에 "${GUIDE.slice(0, 11)}"·"${EXTRACT}" 없음 · 화면 1 표시 · ${UPLOAD} 0)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const context = await anonContext(browser, info);
  try {
    const res = await context.request.get(MANUAL_HREF, { maxRedirects: 0 });
    expect(res.status(), "응답 코드").toBeGreaterThanOrEqual(300);
    expect(res.status(), "응답 코드").toBeLessThan(400);
    expect(locationPath(res.headers()["location"], info), "Location").toBe(LOGIN_HREF);
    const body = await res.text();
    for (const word of [GUIDE, GUIDE.slice(0, 11), EXTRACT, `data-component="${UPLOAD}"`]) expect(body.includes(word), `3xx 응답 본문에 '${word}'`).toBe(false);
    const page = await context.newPage();
    await page.goto(MANUAL_HREF);
    await page.waitForURL((u) => u.pathname === LOGIN_HREF, { timeout: 30_000 });
    await expect(page.locator(sel("ex-auth-form-card")).first(), "화면 1").toBeVisible();
    for (const c of [UPLOAD, TABLE, OVERLAY]) expect(await countComponent(page, c), `로그인 전 ${c}`).toBe(0);
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${SCREEN}] 학교A 학생 화면 ${STUDENT_SCREENS.join("·")}: ${UPLOAD} 0 (R1) · ${MANUAL_HREF} 링크 0 · "${MANUAL_BUTTON}" 글자 없음`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page, viewport } = await openAs(browser, info, "student", HOME_SCREEN);
  try {
    expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE.student);
    for (const screen of STUDENT_SCREENS) {
      const path = routeOf(screen);
      const res = await page.goto(path);
      expect(res?.status(), `${path} 응답`).toBe(200);
      await page.waitForLoadState("load");
      expect(new URL(page.url()).pathname, `${path} 그대로`).toBe(path);
      // 셸 (390 nav-pill / 1440 app-sidebar)
      await expect(shellSchoolScope(page, viewport), "셸").toHaveCount(1);
      await expect(page.locator(BUSY), "자리 표시는 본문으로 바뀐다").toHaveCount(0, { timeout: 45_000 });
      expect((await main(page).innerText()).trim().length, `화면 ${screen} 본문이 그려졌다`).toBeGreaterThan(0);
      expect(await countComponent(page, UPLOAD), `학생 화면 ${screen} ${UPLOAD} ≤ ${R1.max}`).toBeLessThanOrEqual(R1.max!);
      await expect(linksTo(page, MANUAL_HREF), `학생 화면 ${screen} ${MANUAL_HREF} 링크`).toHaveCount(0);
      expect((await page.locator("body").innerText()).includes(MANUAL_BUTTON), `학생 화면 ${screen} 에 "${MANUAL_BUTTON}"`).toBe(false);
    }
  } finally {
    await context.close();
  }
});

for (const role of STAFF) {
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${MANUAL_HREF} 렌더(200) · ${UPLOAD} 1(파일 입력 있음) · 다른 화면의 역할 제한 컴포넌트(${roleLimitedElsewhere().join("·")}) 0 — 1단계·2단계 모두`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const o = await openManual(browser, info, role);
    const { context, page, response } = o;
    try {
      expect(response?.status(), "응답").toBe(200);
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      await expect(page.locator(sel(UPLOAD)), `${UPLOAD} 은 화면에 1개`).toHaveCount(1);
      await expect(uploadArea(page), "업로드 영역(파일 입력)").toHaveCount(1);
      const limited = roleLimitedElsewhere();
      expect(limited.length, "대조: 화면 5 밖의 역할 제한 컴포넌트가 있다").toBeGreaterThan(0);
      for (const [name, n] of Object.entries(await countsOf(page, limited))) expect(n, `1단계 ${name}`).toBe(0);

      await mockExtract(page);
      await toResult(page);
      await expect(page.locator(sel(UPLOAD)), `2단계 ${UPLOAD}`).toHaveCount(1);
      for (const [name, n] of Object.entries(await countsOf(page, limited))) expect(n, `2단계 ${name}`).toBe(0);
      expectNoSave(o);
    } finally {
      await context.close();
    }
  });

  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 화면 ${REORDER_SCREEN} 의 "${MANUAL_BUTTON}" 을 누르면 ${MANUAL_HREF} 에 실제로 도착(업로드 영역 표시) · nav-pill 뒤로가기를 누르면 ${REORDER_HREF}`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page } = await openAs(browser, info, role, REORDER_SCREEN);
    const saves = await blockSaves(context);
    try {
      await waitReorder(page);
      const entry = reorderManual(page).locator(`a[href="${MANUAL_HREF}"]`).filter({ hasText: exact(MANUAL_BUTTON) });
      await expect(entry, `"${MANUAL_BUTTON}" → ${MANUAL_HREF}`).toHaveCount(1);
      await expect(async () => {
        if (new URL(page.url()).pathname !== MANUAL_HREF) await entry.click({ timeout: 5_000 });
        await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe(MANUAL_HREF);
      }).toPass({ timeout: 45_000 });
      await waitManual(page);
      await expect(extractButton(page), `"${EXTRACT}"`).toHaveCount(1);
      await expect(titleScope(page).getByText(exact(NAV_TITLE)).first(), `제목 "${NAV_TITLE}"`).toBeVisible();

      const back = backLink(page);
      if (!backExpected(page)) {
        // 1440: 새 프레임 5-desktop page-head 에는 뒤로가 없다 (d7 §23 run c) — 화면 6 으로는 사이드바 메뉴
        await expect(back, "1440 뒤로가기 없음 (새 프레임 5-desktop)").toHaveCount(0);
        expect(saves.count(), "저장 요청 0건").toBe(0);
        return;
      }
      await expect(back, "뒤로가기 링크").toHaveCount(1);
      await expect(back).toBeVisible();
      await back.click();
      await waitReorder(page);
      expect(saves.count(), "저장 요청 0건").toBe(0);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// C1 — 1단계
// =====================================================================

for (const role of STAFF) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 1단계 구성: nav-pill 뒤로가기(→ ${REORDER_HREF}) + 제목 "${NAV_TITLE}" · ${UPLOAD} 1 + 안내 "${GUIDE}" · ${INPUT} "${GROUPS_LABEL}"(빈 값) · ${PRIMARY} "${EXTRACT}" 비활성 → 파일 + 조 수 ${GROUPS} → 활성 · 조 수 ${G_MIN - 1}·${G_MAX + 1}·문자는 비활성 · 파일 이름은 ${OVERLAY} · 화면 ${SCREEN} 밖 컴포넌트 0`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const o = await openManual(browser, info, role);
    const { context, page, viewport } = o;
    try {
      // 셸 (390 nav-pill · tab-bar / 1440 app-sidebar) · 제목·뒤로가기 (390 nav-pill / 1440 본문 page-head)
      await expectShell(page, viewport, SCREEN, "1단계");
      const back = backLink(page);
      if (backExpected(page)) {
        await expect(back, `뒤로가기 → ${REORDER_HREF}`).toHaveCount(1);
        await expect(back).toBeVisible();
      } else await expect(back, "1440 뒤로가기 없음 (새 프레임 5-desktop page-head = 제목만)").toHaveCount(0);
      await expect(titleScope(page).getByText(exact(NAV_TITLE)).first(), `제목 "${NAV_TITLE}"`).toBeVisible();
      const me = await browserSession(page);
      await expect(shellSchoolScope(page, viewport), "셸에 자기 학교명").toContainText(me.schoolName);

      // 업로드 영역
      await expect(uploadArea(page), UPLOAD).toHaveCount(1);
      await expect(uploadArea(page).getByText(GUIDE, { exact: true }), `안내 "${GUIDE}"`).toBeVisible();
      await expect(fileInput(page), "파일 입력 1개").toHaveCount(1);
      await expect(fileInput(page)).toBeEnabled();
      await expect(overlay(page), `선택 전 ${OVERLAY}`).toHaveCount(0);
      await expect(uploadAlerts(page), "선택 전 오류").toHaveCount(0);

      // 조 수
      const groups = groupsInput(page);
      await expect(groups, `"${GROUPS_LABEL}" 입력`).toHaveCount(1);
      await expect(groups, "조 수 기본값은 비어 있다").toHaveValue("");
      await expect(groupsBox(page), `"${GROUPS_LABEL}" 은 ${INPUT}`).toHaveCount(1);
      await expect(groupsBox(page).getByText(GROUPS_UNIT, { exact: true }), `단위 "${GROUPS_UNIT}"`).toBeVisible();
      await expect(main(page).locator(sel(INPUT)), `1단계 ${INPUT} 1개`).toHaveCount(1);

      // AI 추출
      const extract = extractButton(page);
      await expectStepOne(page, "처음");
      await expect(extract, "파일·조 수가 비면 비활성").toBeDisabled();
      await groups.fill(String(GROUPS));
      await expect(extract, "파일이 없으면 비활성").toBeDisabled();
      await groups.fill("");
      await fileInput(page).setInputFiles(pdf(FRAME_FILE));
      await expect(overlay(page), `파일 이름은 ${OVERLAY} 에`).toHaveCount(1);
      await expect(overlay(page)).toHaveText(exact(FRAME_FILE));
      await expect(overlay(page)).toBeVisible();
      await expect(extract, "조 수가 비면 비활성").toBeDisabled();
      await groups.fill(String(GROUPS));
      await expect(extract, `파일 + 조 수 ${GROUPS} → 활성`).toBeEnabled();
      for (const bad of [String(G_MIN - 1), String(G_MAX + 1), "여섯", "2.5", "-3", ""]) {
        await groups.fill(bad);
        await expect(extract, `조 수 "${bad}" → 비활성`).toBeDisabled();
      }
      await groups.fill(String(G_MAX + 1));
      const hint = groupsBox(page).getByRole("alert");
      await expect(hint, "범위를 벗어난 조 수 안내").toBeVisible();
      expect(squash(await hint.innerText()), "안내에 범위").toMatch(new RegExp(`${G_MIN}\\D+${G_MAX}`));
      for (const ok of [String(G_MIN), String(G_MAX), String(GROUPS)]) {
        await groups.fill(ok);
        await expect(extract, `조 수 "${ok}" → 활성`).toBeEnabled();
      }
      await expect(groupsBox(page).getByRole("alert"), "올바른 조 수 → 안내 사라짐").toHaveCount(0);

      // 화면 5 에 속하지 않는 컴포넌트 0 (dev-rules components) · 1단계에는 표·토스트 없음
      for (const [name, n] of Object.entries(await countsOf(page, foreignComponents(SCREEN)))) expect(n, `1단계: 화면 ${SCREEN} 에 속하지 않는 ${name}`).toBe(0);
      expect(await countsOf(page, [TABLE, TOAST, OUTLINE, CELL]), "1단계에 없는 것").toEqual({ [TABLE]: 0, [TOAST]: 0, [OUTLINE]: 0, [CELL]: 0 });
      await expect(main(page).locator(sel(PRIMARY)), `1단계 ${PRIMARY} 1개`).toHaveCount(1);
      expectNoSave(o);
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S${SCREEN}] 학교A 교사 1단계 파일 오류: 형식(.docx·.gif·확장자 없음) → role=alert(${FILE_KINDS.join("·")} 안내) · ${MAX_MB}MB 초과 → role=alert(${MAX_MB}MB 안내) · 오류 파일은 선택되지 않고 "${EXTRACT}" 비활성 · 정확히 ${MAX_MB}MB 는 선택 · 추출 요청 0건`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const o = await openManual(browser, info, "teacher");
  const { context, page } = o;
  try {
    const mock = await mockExtract(page);
    await groupsInput(page).fill(String(GROUPS));
    for (const [name, mimeType] of [
      ["매뉴얼.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["움짤.gif", "image/gif"],
      ["확장자없음", "application/pdf"],
    ] as const) {
      await fileInput(page).setInputFiles({ name, mimeType, buffer: pdf("x.pdf").buffer });
      const alert = uploadAlerts(page);
      await expect(alert, `${name}: 형식 오류`).toHaveCount(1);
      await expect(alert).toBeVisible();
      const text = squash(await alert.innerText());
      for (const kind of FILE_KINDS) expect(text, `${name}: 오류 문구에 ${kind}`).toContain(kind);
      await expect(overlay(page), `${name}: 선택되지 않는다`).toHaveCount(0);
      await expect(extractButton(page), `${name}: "${EXTRACT}" 비활성`).toBeDisabled();
    }

    await fileInput(page).setInputFiles(pdf("너무 큰 파일.pdf", MAX_BYTES + 1));
    await expect(uploadAlerts(page), "크기 오류").toHaveCount(1);
    expect(squash(await uploadAlerts(page).innerText()), "크기 오류 문구").toContain(`${MAX_MB}MB`);
    await expect(overlay(page), "큰 파일은 선택되지 않는다").toHaveCount(0);
    await expect(extractButton(page), "큰 파일: 비활성").toBeDisabled();

    await fileInput(page).setInputFiles(pdf("딱 맞는 크기.pdf", MAX_BYTES));
    await expect(overlay(page), `정확히 ${MAX_MB}MB 는 선택`).toHaveText(exact("딱 맞는 크기.pdf"));
    await expect(uploadAlerts(page), "올바른 파일 → 오류 사라짐").toHaveCount(0);
    await expect(extractButton(page)).toBeEnabled();

    await expectStepOne(page, "파일 오류 뒤");
    expect(mock.seen(), "누르지 않았으니 추출 요청 0건").toEqual([]);
    expectNoSave(o);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 추출 요청 · 처리 중 · 2단계 구성
// =====================================================================

test(`[C1][S${SCREEN}] 학교A 교사 "${EXTRACT}": 요청 = POST ${"/api/manual/extract"} · FormData file(올린 파일 이름)·groups=${GROUPS} · 연타에도 1건 · 응답 전 = 처리 중("${PROGRESS_LABEL}"·progressbar·aria-busy) + 파일·조 수·버튼 잠금 · 응답 뒤 2단계: ${TABLE} 1 · "${TITLE}" · 머리행 ${HEAD.length}열 · 본문 = 시안 4행(필요량 = 사용량 × ${GROUPS}) · "${RETRY}"·"${SAVE}" · 프레임 5 개수 이상 · 화면 ${SCREEN} 밖 컴포넌트 0 · 저장 요청 0건`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const o = await openManual(browser, info, "teacher");
  const { context, page, viewport } = o;
  try {
    const mock = await mockExtract(page);
    const fileName = "산과 염기의 중화 반응 (2학년 3반).pdf";
    await pickFileAndGroups(page, fileName, GROUPS);
    await expect(extractButton(page)).toBeEnabled();

    // 응답을 붙잡은 채 연타
    mock.hold();
    await extractButton(page).dblclick();
    await expect.poll(() => mock.seen().length, { message: "추출 요청이 나갔다" }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => mock.waiting(), { message: "응답을 붙잡고 있다" }).toBe(1);

    // 처리 중
    await expect(progress(page), "처리 중 진행 막대").toHaveCount(1);
    await expect(progress(page)).toBeVisible();
    await expect(uploadArea(page), "처리 중 aria-busy").toHaveAttribute("aria-busy", "true");
    await expect(uploadArea(page).getByText(PROGRESS_LABEL, { exact: true }), `"${PROGRESS_LABEL}"`).toBeVisible();
    await expect(table(page), "처리 중에는 결과 표 없음").toHaveCount(0);
    await expect(extractButton(page), "처리 중 버튼 잠금").toBeDisabled();
    await expect(groupsInput(page), "처리 중 조 수 잠금").toBeDisabled();
    await expect(fileInput(page), "처리 중 파일 잠금").toBeDisabled();
    await expect(overlay(page), "처리 중에도 파일 이름").toHaveText(exact(fileName));
    // 잠긴 버튼을 더 눌러도 요청이 늘지 않는다
    await extractButton(page).click({ force: true, timeout: 5_000 }).catch(() => undefined);
    await extractButton(page).click({ force: true, timeout: 5_000 }).catch(() => undefined);
    expect(mock.seen().length, "응답 전 연타에도 요청 1건").toBe(1);
    expect(mock.waiting(), "붙잡힌 요청 1건").toBe(1);

    // 요청 내용
    const seen = mock.seen()[0];
    expect(seen.method, "메서드").toBe("POST");
    expect(seen.contentType, "multipart/form-data").toContain("multipart/form-data");
    const forms = await mock.forms();
    expect(forms.length, "화면이 보낸 추출 요청 1건").toBe(1);
    expect(forms[0].method.toUpperCase(), "fetch 메서드").toBe("POST");
    expect(forms[0].isForm, "본문 = FormData").toBe(true);
    expect([...forms[0].keys].sort(), "FormData 칸 = file · groups").toEqual(["file", "groups"]);
    expect(forms[0].files.map((f) => f.name), "file = 올린 파일 이름").toEqual([fileName]);
    expect(forms[0].files[0].size, "file 크기 = 올린 파일").toBe(pdf(fileName).buffer.length);
    expect(forms[0].groups, `groups = ${GROUPS}`).toEqual([String(GROUPS)]);
    if (seen.body !== null) {
      expect(seen.body, "요청 본문에 groups 칸").toContain('name="groups"');
      expect(seen.body, "요청 본문에 file 칸").toContain('name="file"');
    }

    // 응답을 풀어 준다 → 2단계
    mock.release();
    await expect(table(page), "응답 뒤 결과 표").toHaveCount(1, { timeout: 20_000 });
    await expect(progress(page), "결과가 오면 진행 막대 없음").toHaveCount(0);
    expect(await uploadArea(page).getAttribute("aria-busy"), "결과가 오면 aria-busy 해제").not.toBe("true");
    expect(mock.seen().length, "응답 뒤에도 요청은 1건").toBe(1);

    await expect(table(page).getByRole("heading", { name: TITLE, exact: true }), `제목 "${TITLE}"`).toBeVisible();
    await expect(closeButton(page), `"${CLOSE}"`).toHaveCount(1);
    const heads = table(page).getByRole("columnheader");
    await expect(heads, "머리행 열 이름과 순서").toHaveText(HEAD.map(exact));
    expect(await heads.evaluateAll((els) => els.map((e) => e.getAttribute("data-component"))), `머리 셀 = ${CELL}`).toEqual(HEAD.map(() => CELL));
    const rows = await readRows(page);
    expect(rows.map((r) => r.cells), "본문 = 시안 4행 (시약명·사용량·단위·필요량)").toEqual(FRAME_ROWS);
    for (const [i, item] of FRAME_ITEMS.entries()) {
      expect(rows[i].cells[3], `${item.name} 필요량 = ${item.amount} × ${GROUPS}`).toBe(requiredText(item.amount!, GROUPS, item.unit));
    }
    expect(rows.map((r) => r.inputs), `사용량 칸에만 ${INPUT} 1개`).toEqual(FRAME_ROWS.map(() => [0, 1, 0, 0]));
    expect(rows.map((r) => r.edited), "추출 직후 고친 칸 없음").toEqual(FRAME_ROWS.map(() => false));
    await expect(retryButton(page), `${OUTLINE} "${RETRY}"`).toHaveCount(1);
    await expect(saveButton(page), `${PRIMARY} "${SAVE}"`).toHaveCount(1);
    await expect(extractButton(page), `2단계에는 "${EXTRACT}" 없음`).toHaveCount(0);
    await expect(fileInput(page), "2단계에서 파일은 잠긴다").toBeDisabled();
    await expect(overlay(page), "2단계에도 파일 이름").toHaveText(exact(fileName));
    await expect(groupsInput(page), "2단계에도 조 수").toHaveValue(String(GROUPS));

    // 프레임(시안 1.17, 2단계 상태) 개수 — 시안 1.17 은 사용량·단위·우리 학교 시약 상자를 모두 text-input 으로 그렸고
    // 5-desktop 은 행마다 ex-data-table-cell 1개(4칸 한 줄)다. 화면은 d7 §13 의 4열 표(머리 + 행마다 4칸 셀)로 읽히게 두고
    // 단위·연결은 선택 상자이므로, 개수는 "프레임 이름 → 화면에서 같은 역할"로 맞춰 센다.
    const frame = frameCounts(`${SCREEN}-${viewport}`);
    expect(frame[TABLE], "프레임에 결과 표").toBe(1);
    const got = await countsOf(page, Object.keys(frame));
    for (const name of [UPLOAD, OVERLAY, TABLE, OUTLINE]) expect(got[name], `2단계 ${name} = 프레임`).toBe(frame[name]);
    expect(await main(page).locator(sel(PRIMARY)).count(), `2단계 ${PRIMARY} = 프레임`).toBe(frame[PRIMARY]);
    for (const name of Object.keys(frame).filter((n) => ![INPUT, CELL].includes(n))) {
      expect(got[name], `${viewport} 2단계 ${name} ≥ 프레임 ${frame[name]}`).toBeGreaterThanOrEqual(frame[name]);
    }
    // 프레임 text-input = 조 수 1 + 행마다 (사용량 · 단위 · 우리 학교 시약) 3
    expect(frame[INPUT], `프레임 ${INPUT} = 1 + ${FRAME_ROWS.length}행 × 3`).toBe(1 + FRAME_ROWS.length * 3);
    for (const name of FRAME_ROWS.map((r) => r[0])) {
      const row = rowByName(page, name);
      await expect(amountInput(row), `${name}: 사용량 ${INPUT} 1`).toHaveCount(1);
      await expect(row.getByRole("combobox", { name: `${name} 단위` }), `${name}: 단위 선택 상자 1`).toHaveCount(1);
      await expect(row.locator('button[aria-haspopup="listbox"]'), `${name}: 우리 학교 시약 선택 1`).toHaveCount(1);
    }
    await expect(groupsInput(page), "조 수 입력 1").toHaveCount(1);
    // 표: 머리 + 행마다 4칸 = ex-data-table-cell
    expect(await table(page).locator(sel(CELL)).count(), `${TABLE} 안 ${CELL} = (머리 + ${FRAME_ROWS.length}행) × ${HEAD.length}칸`).toBe((FRAME_ROWS.length + 1) * HEAD.length);

    // 화면 5 에 속하지 않는 컴포넌트 0
    for (const [name, n] of Object.entries(await countsOf(page, foreignComponents(SCREEN)))) expect(n, `2단계: 화면 ${SCREEN} 에 속하지 않는 ${name}`).toBe(0);
    expect(await countComponent(page, TOAST), "저장 전에는 토스트 없음").toBe(0);
    expectNoSave(o);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 실패 응답 · 0건
// =====================================================================

test(`[C1][S${SCREEN}] 학교A 교사 추출 실패(가로챈 503 no-key·429·504·413·네트워크 중단): 1단계 유지 · 파일·조 수 유지 · 오류 문구 = 서버 error 그대로(role=alert) · "${EXTRACT}" 다시 활성 → 다시 누르면 새 요청 1건 / items 0 → 2단계 0행 문구 + "${SAVE}" 비활성 + 이유`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const o = await openManual(browser, info, "teacher");
  const { context, page } = o;
  try {
    const mock = await mockExtract(page);
    await pickFileAndGroups(page, FRAME_FILE, GROUPS);

    const failures: [string, ReturnType<typeof failReply> | "abort", string | null][] = [
      ["503 no-key", failReply(503, "no-key", NO_KEY_TEXT), NO_KEY_TEXT],
      ["429", failReply(429, "rate-limit", "요청이 너무 잦아요. 1분 뒤에 다시 시도해 주세요 (테스트 문구 가)"), "요청이 너무 잦아요. 1분 뒤에 다시 시도해 주세요 (테스트 문구 가)"],
      ["504", failReply(504, "timeout", "시간이 너무 오래 걸렸어요. 다시 시도해 주세요 (테스트 문구 나)"), "시간이 너무 오래 걸렸어요. 다시 시도해 주세요 (테스트 문구 나)"],
      ["413", failReply(413, "too-large", "파일이 너무 커요 (테스트 문구 다)"), "파일이 너무 커요 (테스트 문구 다)"],
      ["네트워크 중단", "abort", null],
    ];
    let sent = 0;
    for (const [what, reply, text] of failures) {
      mock.reply(reply);
      mock.hold();
      await expect(extractButton(page), `${what}: 누르기 전 활성`).toBeEnabled();
      await extractButton(page).click();
      sent += 1;
      await expect.poll(() => mock.waiting(), { message: `${what}: 요청을 붙잡았다` }).toBe(1);
      await expect(progress(page), `${what}: 처리 중`).toHaveCount(1);
      mock.release();

      const alert = uploadAlerts(page);
      await expect(alert, `${what}: 오류 문구 1개`).toHaveCount(1, { timeout: 20_000 });
      await expect(alert).toBeVisible();
      const shown = squash(await alert.innerText());
      if (text !== null) expect(shown, `${what}: 서버 error 그대로`).toBe(text);
      else {
        expect(shown.length, `${what}: 오류 문구가 비어 있지 않다`).toBeGreaterThan(0);
        expect(shown, `${what}: 사람이 읽을 한국어 문구`).toMatch(/[가-힣]/);
        expect(shown, `${what}: 내부 오류 글자 없음`).not.toMatch(/TypeError|Failed to fetch|ERR_|undefined|null/);
      }
      await expectStepOne(page, what);
      expect(await uploadArea(page).getAttribute("aria-busy"), `${what}: aria-busy 해제`).not.toBe("true");
      await expect(overlay(page), `${what}: 파일 유지`).toHaveText(exact(FRAME_FILE));
      await expect(groupsInput(page), `${what}: 조 수 유지`).toHaveValue(String(GROUPS));
      await expect(groupsInput(page), `${what}: 조 수 잠금 해제`).toBeEnabled();
      await expect(fileInput(page), `${what}: 파일 잠금 해제`).toBeEnabled();
      await expect(extractButton(page), `${what}: "${EXTRACT}" 다시 활성`).toBeEnabled();
      expect(mock.seen().length, `${what}: 요청 수`).toBe(sent);
    }

    // items 0 → 2단계 0행
    mock.reply(okReply([]));
    await extractButton(page).click();
    sent += 1;
    await expect(table(page), "items 0 → 2단계").toHaveCount(1, { timeout: 20_000 });
    await expect(uploadAlerts(page), "성공하면 오류 문구 없음").toHaveCount(0);
    await expect(table(page).getByRole("columnheader"), "머리행은 그대로").toHaveText(HEAD.map(exact));
    await expect(bodyRows(page), "본문 행 0").toHaveCount(0);
    const empty = table(page).getByRole("status");
    await expect(empty, "0행 문구").toHaveCount(1);
    await expect(empty).toBeVisible();
    expect(squash(await empty.innerText()), "0행 문구 = 시약을 찾지 못함").toMatch(/시약을? ?찾지 못/);
    await expect(saveButton(page), `"${SAVE}" 비활성`).toBeDisabled();
    await expect.poll(async () => (await bottomNotices(page)).length, { message: "저장할 수 없는 이유" }).toBeGreaterThanOrEqual(1);
    await expect(retryButton(page), `"${RETRY}" 는 누를 수 있다`).toBeEnabled();
    await saveButton(page).click({ force: true, timeout: 5_000 }).catch(() => undefined);
    expect(await countComponent(page, TOAST), "비활성 저장을 눌러도 토스트 없음").toBe(0);
    expect(mock.seen().length, "요청 수").toBe(sent);
    expect(mock.seen().every((s) => s.method === "POST"), "모든 추출 요청은 POST").toBe(true);
    expectNoSave(o);
  } finally {
    await context.close();
  }
});

test.describe("실제 서버 응답 (서버에 키가 없을 때만)", () => {
  test.skip(SERVER_HAS_KEY, HAS_KEY_REASON);

  test(`[C1][S${SCREEN}] 학교A 교사 "${EXTRACT}" (가로채지 않음): 키 없는 서버 → 1단계 유지 + role=alert "${NO_KEY_TEXT}" · 파일·조 수 유지 · "${EXTRACT}" 다시 활성`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const o = await openManual(browser, info, "teacher");
    const { context, page } = o;
    try {
      await pickFileAndGroups(page, FRAME_FILE, GROUPS);
      const [res] = await Promise.all([
        page.waitForResponse((r) => new URL(r.url()).pathname === "/api/manual/extract", { timeout: 60_000 }),
        extractButton(page).click(),
      ]);
      expect(res.request().method(), "메서드").toBe("POST");
      expect(res.status(), "키 없는 서버 응답").toBe(503);
      const alert = uploadAlerts(page);
      await expect(alert, "오류 문구").toHaveCount(1, { timeout: 20_000 });
      expect(squash(await alert.innerText()), "d7 §13 키 없음 문구").toBe(NO_KEY_TEXT);
      await expectStepOne(page, "키 없음");
      await expect(overlay(page), "파일 유지").toHaveText(exact(FRAME_FILE));
      await expect(groupsInput(page), "조 수 유지").toHaveValue(String(GROUPS));
      await expect(extractButton(page), `"${EXTRACT}" 다시 활성`).toBeEnabled();
      expectNoSave(o);
    } finally {
      await context.close();
    }
  });
});

// =====================================================================
// C1 — 닫기 · 다시 추출
// =====================================================================

test(`[C1][S${SCREEN}] 학교A 교사 2단계: "${RETRY}" — 고친 뒤 확인 창 거절 → 요청 0·값 유지 / 수락 → 같은 파일·조 수로 재요청 1건·값 원복 / 고친 것이 없으면 확인 창 없이 재요청 · "${CLOSE}" → 1단계(파일·조 수 유지, 표 없음)`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const o = await openManual(browser, info, "teacher");
  const { context, page } = o;
  try {
    const mock = await mockExtract(page);
    const dialogs: string[] = [];
    let accept = false;
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void (accept ? d.accept() : d.dismiss());
    });
    await toResult(page);
    expect(mock.seen().length, "첫 추출 1건").toBe(1);
    const [name, per, unit] = FRAME_ROWS[0];
    const changed = String(Number(per) + 27);
    const row = rowByName(page, name);
    await amountInput(row).fill(changed);
    await expect.poll(async () => (await readRows(page))[0].edited, { message: "고친 칸 표시" }).toBe(true);
    expect((await readRows(page))[0].cells, "고친 행").toEqual([name, changed, unit, requiredText(changed, GROUPS, unit)]);

    // 거절
    accept = false;
    await retryButton(page).click();
    await expect.poll(() => dialogs.length, { message: "고친 내용이 있으면 확인 창" }).toBe(1);
    expect(dialogs[0], "확인 창 문구에 다시 추출").toContain(RETRY);
    await expect(table(page), "거절: 표 그대로").toHaveCount(1);
    await expect(progress(page), "거절: 처리 중 아님").toHaveCount(0);
    expect(mock.seen().length, "거절: 추가 요청 0").toBe(1);
    expect((await readRows(page))[0].cells[1], "거절: 고친 값 유지").toBe(changed);
    expect((await readRows(page))[0].edited, "거절: 고친 칸 표시 유지").toBe(true);

    // 수락
    accept = true;
    mock.hold();
    await retryButton(page).click();
    await expect.poll(() => dialogs.length, { message: "다시 확인 창" }).toBe(2);
    await expect.poll(() => mock.waiting(), { message: "수락: 재요청을 붙잡았다" }).toBe(1);
    await expect(progress(page), "수락: 처리 중").toHaveCount(1);
    await expect(overlay(page), "수락: 같은 파일").toHaveText(exact(FRAME_FILE));
    mock.release();
    await expect(progress(page)).toHaveCount(0, { timeout: 20_000 });
    await expect(table(page)).toHaveCount(1);
    expect(mock.seen().length, "수락: 재요청 1건").toBe(2);
    const forms = await mock.forms();
    expect(forms.length, "화면이 보낸 요청 2건").toBe(2);
    expect(forms[1].files.map((f) => f.name), "재요청 file = 같은 파일").toEqual([FRAME_FILE]);
    expect(forms[1].groups, "재요청 groups").toEqual([String(GROUPS)]);
    let rows = await readRows(page);
    expect(rows.map((r) => r.cells), "수락: 값 원복 = 추출 결과").toEqual(FRAME_ROWS);
    expect(rows.map((r) => r.edited), "수락: 고친 칸 표시 없음").toEqual(FRAME_ROWS.map(() => false));

    // 고친 것이 없으면 확인 창 없이 바로
    await retryButton(page).click();
    await expect.poll(() => mock.seen().length, { message: "고친 것이 없으면 바로 재요청" }).toBe(3);
    await expect(table(page)).toHaveCount(1, { timeout: 20_000 });
    await expect(progress(page)).toHaveCount(0);
    expect(dialogs.length, "고친 것이 없으면 확인 창 없음").toBe(2);
    rows = await readRows(page);
    expect(rows.map((r) => r.cells)).toEqual(FRAME_ROWS);

    // 닫기
    await closeButton(page).click();
    await expectStepOne(page, `"${CLOSE}" 뒤`);
    await expect(overlay(page), "닫기: 파일 유지").toHaveText(exact(FRAME_FILE));
    await expect(groupsInput(page), "닫기: 조 수 유지").toHaveValue(String(GROUPS));
    await expect(fileInput(page), "닫기: 파일 잠금 해제").toBeEnabled();
    await expect(extractButton(page), `닫기: "${EXTRACT}" 활성`).toBeEnabled();
    expect(mock.seen().length, "닫기는 요청을 만들지 않는다").toBe(3);
    expect(await countComponent(page, TOAST)).toBe(0);
    expectNoSave(o);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C2
// =====================================================================

for (const role of STAFF) {
  test(`[C2][S${SCREEN}] ${ROLE_LABEL[role]}: 390 = tab-bar 1·tab-item ${rules.tab_bar.items}·활성 "기록", 1440 = 0 (1단계·2단계) · 모바일: "${EXTRACT}"·2단계 버튼 줄이 tab-bar 바로 위(아래 여백 = 시안 ${BOTTOM_GAP})·가려지지 않음 · 표 마지막 행이 버튼 줄·tab-bar 에 가려지지 않음`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const o = await openManual(browser, info, role);
    const { context, page, viewport } = o;
    const vp = page.viewportSize()!;
    /** 버튼이 화면 안에 있고 덮이지 않았으며, 모바일에서는 tab-bar 바로 위 */
    const expectAboveTabBar = async (button: ReturnType<typeof extractButton>, what: string) => {
      await expect(button, what).toBeVisible();
      if (viewport === "desktop") await button.scrollIntoViewIfNeeded();
      const b = await boxOf(button);
      expect(await onTop(button), `${what}: 다른 것에 덮이지 않음`).toBe(true);
      expect(b.left, `${what}: 왼쪽 끝이 화면 안`).toBeGreaterThanOrEqual(0);
      expect(b.right, `${what}: 오른쪽 끝이 화면 안`).toBeLessThanOrEqual(vp.width + 0.5);
      if (viewport === "mobile") {
        const top = await tabBarTop(page);
        expect(b.bottom, `${what}: 아래 끝 ≤ tab-bar 위쪽 선`).toBeLessThanOrEqual(top + 0.5);
        expect(top - b.bottom, `${what}: tab-bar 바로 위 (사이 ≤ 시안 여백 ${BOTTOM_GAP})`).toBeLessThanOrEqual(BOTTOM_GAP + 1.5);
      } else {
        expect(b.bottom, `${what}: 화면 안`).toBeLessThanOrEqual(vp.height + 0.5);
      }
    };
    try {
      // 1단계
      await expectTabBar(page, viewport, "1단계");
      await pickFileAndGroups(page, FRAME_FILE, GROUPS);
      await expectAboveTabBar(extractButton(page), `1단계 "${EXTRACT}"`);
      if (viewport === "mobile") {
        // 끝까지 내려도 버튼은 그 자리, 조 수 입력은 버튼 줄에 가려지지 않는다
        await scrollAllToEnd(groupsInput(page));
        await expectAboveTabBar(extractButton(page), `1단계(끝까지 내림) "${EXTRACT}"`);
        expect(await onTop(groupsInput(page)), "조 수 입력이 버튼 줄에 가려지지 않음").toBe(true);
        expect((await boxOf(groupsBox(page))).bottom, "조 수 입력 아래 끝 ≤ 버튼 위").toBeLessThanOrEqual((await boxOf(extractButton(page))).top + 0.5);
      }

      // 2단계
      await mockExtract(page);
      await extractButton(page).click();
      await expect(table(page)).toHaveCount(1, { timeout: 20_000 });
      await expectTabBar(page, viewport, "2단계");
      await expectAboveTabBar(saveButton(page), `2단계 "${SAVE}"`);
      await expectAboveTabBar(retryButton(page), `2단계 "${RETRY}"`);
      const rb = await boxOf(retryButton(page));
      const sb = await boxOf(saveButton(page));
      expect(Math.abs(rb.top + rb.height / 2 - (sb.top + sb.height / 2)), "두 버튼이 한 줄").toBeLessThan(2);
      expect(rb.right, `"${RETRY}" 가 "${SAVE}" 왼쪽`).toBeLessThanOrEqual(sb.left + 0.5);

      // 표 마지막 행
      const last = bodyRows(page).last();
      await scrollAllToEnd(last);
      const lb = await boxOf(last);
      expect(lb.height, "마지막 행이 그려졌다").toBeGreaterThan(0);
      expect(await bottomEdgeOnTop(last), "마지막 행의 아래 끝이 버튼 줄·tab-bar 에 가려지지 않음").toBe(true);
      if (viewport === "mobile") {
        expect(lb.bottom, "마지막 행 아래 끝 ≤ 버튼 줄 위").toBeLessThanOrEqual((await boxOf(retryButton(page))).top + 0.5);
        expect(lb.bottom, "마지막 행 아래 끝 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual((await tabBarTop(page)) + 0.5);
        await expectAboveTabBar(saveButton(page), `2단계(끝까지 내림) "${SAVE}"`);
      } else {
        expect(lb.bottom, "마지막 행 아래 끝이 화면 안").toBeLessThanOrEqual(vp.height + 0.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "가로 넘침 없음").toBeLessThanOrEqual(0);
      const heads = table(page).getByRole("columnheader");
      const lastHead = await boxOf(heads.last());
      expect(lastHead.right, `${HEAD.length}열이 화면 폭 안`).toBeLessThanOrEqual(vp.width + 0.5);
      expectNoSave(o);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// V1 (보고용 스크린샷, 실패 조건 아님)
// =====================================================================

test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (학교A 교사, 가짜 추출 결과의 2단계 — 저장하지 않음)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN);
  await blockSaves(context);
  try {
    await waitManual(page).catch(() => undefined);
    await mockExtract(page).catch(() => undefined);
    await toResult(page).catch(() => undefined);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: false });
  } finally {
    await context.close();
  }
});
