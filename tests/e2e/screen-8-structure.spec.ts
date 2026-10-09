// 화면 8 (사용자 관리, dev-rules.json routes["8"]) 구조 규칙: R-ui · C1(기본 상태·시트 구성) · C2 · V1
// 기준: harness/d5-gates.md D3, harness/dev-rules.json (routes·route_auth 8·components·viewports),
//       design/rules.json (roles R6 = user-manage 는 admin 만, tab_bar), 디자인 s2-spec "## 화면 8",
//       design/frames/8-{mobile|desktop}.json, harness/d7-data.md §8.
// 이 파일은 공용 테스트 계정(학교 A·B)만 쓰고 DB 에 쓰지 않는다 — 읽기 · 시트 열고 닫기 · 거부 확인만.
// "변경"·"N명 초대"·"삭제" 는 여기서 누르지 않는다 (쓰기 흐름은 일회용 학교의 screen-8-write).
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, ROLE_NAME, browserClient, browserSession, countComponent, devRules, roleChecks, routeOf, rules, sel } from "./screen-helpers";
import { DESKTOP_SHELL, frameActiveLabel } from "../desktop-shell";
import { newFrame, waitWidthSettled } from "./desk-helpers";
import { expectShellHeader, shellSchoolScope } from "./shell-helpers";
import {
  ACTIVE_TAB_LABEL,
  CHANGE_BUTTON,
  CLOSE_LABEL,
  COPIED_NOTICE,
  COPY_LINK,
  DELETE_USER_BUTTON,
  EMPTY,
  EMPTY_SEARCH,
  HOME_SCREEN,
  INPUT,
  INVITE_BUTTON,
  INVITE_ROLE_ORDER,
  INVITE_TITLE,
  LAST_ADMIN_HINT,
  LOGIN_SCREEN,
  MODAL,
  NAV_LABEL,
  OUTLINE,
  PILL_SOFT,
  PRIMARY,
  ROLE_ORDER,
  ROLE_TEXT,
  ROW,
  SCREEN,
  SEARCH_PLACEHOLDER,
  SECTION_MEMBERS,
  SEGMENT,
  SEGMENT_ACTIVE,
  SIGNUP_SCREEN,
  STAFF_NAV_LABEL,
  USER_MANAGE,
  WORDMARK,
  anonContext,
  boxOf,
  closeIcon,
  countsOf,
  dbMembers,
  dbPendingInvites,
  emptyCard,
  exact,
  inviteButton,
  inviteSubmit,
  inviteSubmitLabel,
  invitesHeading,
  manage,
  memberRow,
  memberRows,
  membersByService,
  modal,
  noteText,
  onTop,
  openInviteSheet,
  openRoleSheet,
  outlineIn,
  pickRole,
  primaryIn,
  radio,
  readHeader,
  readInvites,
  readMembers,
  roleSheetTitle,
  searchInput,
  selfRowBackground,
  waitUsers,
  watchActions,
  inviteDialog,
  type DbMember,
} from "./screen-8-helpers";

const R6 = rules.roles.R6;
/** 로그인 후 최상위 화면 — 학생·교사 nav 에 화면 8 진입이 없는지 보는 곳 (홈 · 시약 목록 · 사용 기록 내역) */
const NAV_SCREENS = [HOME_SCREEN, 2, 10];
const USERS_HREF = routeOf(SCREEN);

const isDesktopPage = (page: Page) => page.viewportSize()?.width === devRules.viewports.desktop[0];
/** 새 프레임 8-desktop (d7 §23 run b): 본문 제목 · 초대 줄(page-actions) · 가운데 확인 카드 폭 */
const F8D = newFrame(`${SCREEN}-desktop`);
const DESK_TITLE8 = F8D.find((n) => n.name === "title" && n.path.includes("page-title"))!.text!.characters;
const DESK_INVITE_PLACEHOLDER = F8D.find((n) => n.name === "placeholder" && n.path.includes("page-actions"))!.text!.characters;
const DESK_INVITE_ROLES = F8D.filter((n) => n.name === "label" && n.path.includes("page-actions") && n.path.includes(SEGMENT)).map((n) => n.text!.characters);
const DESK_CARD_W = F8D.find((n) => n.name === MODAL)!.width!;
/** 셸 이동 링크: 폭 390 = nav-pill nav 링크, 폭 1440 = app-sidebar 의 sidebar-item 링크 (rules 1.22 desktop_shell) */
const navLinks = (page: Page) =>
  isDesktopPage(page) ? page.locator(`${sel(DESKTOP_SHELL.component)} a${sel(DESKTOP_SHELL.item)}`) : page.locator(`${sel("nav-pill")} nav a`);
/** 셸 링크 글자: 폭 390 = nav-pill 문구, 폭 1440 = 사이드바 메뉴 문구(새 프레임 8-desktop · 7-desktop 활성 메뉴 "사용자" · "입고") */
const navLabel = (page: Page, label: string): string => {
  if (!isDesktopPage(page)) return label;
  const desk: Record<string, string> = { [NAV_LABEL]: frameActiveLabel(SCREEN), [STAFF_NAV_LABEL]: frameActiveLabel(7) };
  if (!desk[label]) throw new Error(`데스크톱 사이드바 문구 대응 없음: ${label}`);
  return desk[label];
};

async function navLabels(page: Page): Promise<string[]> {
  return (await navLinks(page).allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
}

/** 화면 어디든 화면 8 로 가는 링크 */
const usersLinks = (page: Page) => page.locator(`a[href="${USERS_HREF}"], a[href^="${USERS_HREF}?"], a[href^="${USERS_HREF}/"]`);

/** 같은 학교의 다른 멤버 (본인이 아닌 행) 중 주어진 역할 */
function otherMember(members: DbMember[], selfId: string, role: string): DbMember {
  const m = members.find((x) => x.user_id !== selfId && x.role === role);
  if (!m) throw new Error(`학교 A 에 본인이 아닌 ${role} 멤버가 없음 (seed 확인)`);
  return m;
}

// =====================================================================
// R-ui
// =====================================================================

test(`[R-ui][S${SCREEN}] rules.json R6 = ${USER_MANAGE} 는 admin 만(only_roles) · 학생·교사·로그인 전 검사에 R6 = 0 포함 · dev-rules route_auth ${SCREEN} = admin만`, () => {
  expect(R6.component, "R6 컴포넌트").toBe(USER_MANAGE);
  expect(R6.only_roles, "R6 only_roles").toEqual([ROLE_NAME.admin]);
  expect(devRules.components[USER_MANAGE] ?? [], `dev-rules components ${USER_MANAGE} 에 화면 ${SCREEN}`).toContain(SCREEN);
  for (const who of [ROLE_NAME.student, ROLE_NAME.teacher, null]) {
    for (const screen of [SCREEN, ...NAV_SCREENS]) {
      const checks = roleChecks(screen, who);
      expect(
        checks.some((c) => c.rule === "R6" && c.component === USER_MANAGE && c.op === "max" && c.value === 0),
        `${who ?? "로그인 전"} 화면 ${screen} 검사에 R6 ${USER_MANAGE} = 0`,
      ).toBe(true);
    }
  }
  expect(roleChecks(SCREEN, ROLE_NAME.admin).some((c) => c.rule === "R6"), "admin 검사에는 R6 상한 없음").toBe(false);
  const auth = (devRules as unknown as { route_auth: Record<string, string> }).route_auth;
  expect(auth[String(SCREEN)], "route_auth 8").toContain("admin만");
});

for (const role of ["student", "teacher"] as const) {
  const roleName = ROLE_NAME[role];
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${USERS_HREF} → ${routeOf(HOME_SCREEN)} (화면 8 미표시 · ${USER_MANAGE} 0 · 응답 본문에 멤버 이름·"초대 대기" 없음)`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await page.waitForURL((u) => u.pathname === routeOf(HOME_SCREEN), { timeout: 30_000 });
      await expect(page.locator(sel("home-summary")).first(), "홈으로 보내졌다").toBeVisible();
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);

      // rules.json roles (R6 포함): 화면 8 을 요청한 뒤 보이는 화면에서 역할 제한 컴포넌트 0
      const checks = roleChecks(SCREEN, roleName).filter((c) => c.op === "max");
      expect(checks.some((c) => c.rule === "R6"), "R6 검사 포함").toBe(true);
      for (const c of checks) expect(await countComponent(page, c.component), `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
      await expect(page.locator(sel(MODAL)), `${MODAL}`).toHaveCount(0);
      await expect(usersLinks(page), `${USERS_HREF} 링크`).toHaveCount(0);

      // 쿼리를 붙여도, 직접 요청해도 화면 8 은 그려지지 않는다
      const { client, userId } = await browserClient(page);
      const own = await client.from("profiles").select("school_id").eq("user_id", userId).single();
      const members = await membersByService(own.data!.school_id as string);
      expect(members.length, "대조: 같은 학교 멤버").toBeGreaterThanOrEqual(SCHOOL_A_ROLES.length);
      for (const path of [USERS_HREF, `${USERS_HREF}?role=admin`, `${USERS_HREF}/`]) {
        const res = await context.request.get(path, { maxRedirects: 0 });
        expect(res.status(), `${path} 는 리다이렉트`).toBeGreaterThanOrEqual(300);
        expect(res.status()).toBeLessThan(400);
        if (path !== `${USERS_HREF}/`) expect(new URL(res.headers()["location"], info.project.use.baseURL).pathname, `${path} → 홈`).toBe(routeOf(HOME_SCREEN));
        const html = await res.text();
        expect(html, "응답 본문에 user-manage").not.toContain(`data-component="${USER_MANAGE}"`);
        expect(html, '응답 본문에 "초대 대기"').not.toContain("초대 대기");
        expect(html, '응답 본문에 "사용자 삭제"').not.toContain(DELETE_USER_BUTTON);
        // 다른 사람 이름은 없다 — 본인 이름은 데스크톱 사이드바 계정 줄("이름 · 역할", rules 1.22 desktop_shell)로 셸에 있을 수 있다
        const others = members.filter((m) => m.user_id !== userId);
        expect(others.length, "대조: 본인 말고 다른 멤버").toBeGreaterThan(0);
        for (const m of others) expect(html, `응답 본문에 다른 멤버 이름 ${m.display_name}`).not.toContain(m.display_name);
      }
      await page.goto(`${USERS_HREF}?role=admin`);
      await page.waitForURL((u) => u.pathname === routeOf(HOME_SCREEN), { timeout: 30_000 });
      await expect(page.locator(sel(USER_MANAGE))).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S${SCREEN}] 비로그인 ${USERS_HREF} 접근 → ${routeOf(LOGIN_SCREEN)} · 화면 8 컴포넌트·학교명 미노출`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  const context = await anonContext(browser, info);
  try {
    const page = await context.newPage();
    await page.goto(USERS_HREF);
    await page.waitForURL((u) => u.pathname === routeOf(LOGIN_SCREEN), { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get("next"), "로그인 뒤 돌아올 곳").toBe(USERS_HREF);
    await expect(page.locator(sel("ex-auth-form-card")).first(), "로그인 화면").toBeVisible();
    for (const c of [USER_MANAGE, ROW, MODAL]) expect(await countComponent(page, c), `비로그인 ${c}`).toBe(0);
    const res = await context.request.get(USERS_HREF, { maxRedirects: 0 });
    expect(res.status(), "비로그인 요청은 리다이렉트").toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(new URL(res.headers()["location"], info.project.use.baseURL).pathname).toBe(routeOf(LOGIN_SCREEN));
    const html = await res.text();
    expect(html).not.toContain(`data-component="${USER_MANAGE}"`);
    expect(html, "응답 본문에 학교명").not.toMatch(new RegExp(rules.never.N1.school_name_pattern));
  } finally {
    await context.close();
  }
});

for (const role of SCHOOL_A_ROLES) {
  const roleName = ROLE_NAME[role as keyof typeof ROLE_NAME];
  const isAdmin = (R6.only_roles ?? []).includes(roleName);
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 홈·시약 목록·사용 기록 내역: ${USER_MANAGE}·${USERS_HREF} 링크 ${isAdmin ? "= 홈 quick-action 1 + nav 링크(admin 진입점)" : "0 (R6)"} · nav 링크 구성이 세 화면에서 같음${role === "student" ? "" : ` ("${STAFF_NAV_LABEL}" 포함)`}`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, viewport } = await openAs(browser, info, role, HOME_SCREEN);
    try {
      const perScreen: Record<number, string[]> = {};
      for (const screen of NAV_SCREENS) {
        if (screen !== HOME_SCREEN) await page.goto(routeOf(screen));
        await page.waitForLoadState("load");
        // 서버 HTML 에는 두 폭(홈 quick-action 모바일 칸 · 데스크톱 버튼 줄)이 함께 있다 — 맞지 않는 폭이 빠진 뒤 센다
        await waitWidthSettled(page);
        expect(new URL(page.url()).pathname, `화면 ${screen}`).toBe(routeOf(screen));
        await expect(shellSchoolScope(page, viewport).first(), "셸 (390 nav-pill / 1440 app-sidebar)").toBeVisible();
        if (screen === HOME_SCREEN) await expect(page.locator(sel("quick-action")).first()).toBeVisible();
        const labels = await navLabels(page);
        perScreen[screen] = labels;
        const entries = page.locator(sel(USER_MANAGE));
        if (!isAdmin) {
          await expect(entries, `화면 ${screen} ${USER_MANAGE} (R6)`).toHaveCount(0);
          await expect(usersLinks(page), `화면 ${screen} ${USERS_HREF} 링크`).toHaveCount(0);
          expect(labels, `화면 ${screen} nav 에 "${navLabel(page, NAV_LABEL)}"`).not.toContain(navLabel(page, NAV_LABEL));
          expect(await page.locator("body").textContent(), `화면 ${screen} 글자에 "${NAV_LABEL}"`).not.toContain(NAV_LABEL);
        } else {
          // s2-spec 역할별 노출: user-manage = 화면 8 1 + 홈 quick-action 1 (admin 만)
          await expect(entries, `화면 ${screen} ${USER_MANAGE} 진입점`).toHaveCount(screen === HOME_SCREEN ? 1 : 0);
          expect(labels.filter((l) => l === navLabel(page, NAV_LABEL)), `화면 ${screen} nav "${navLabel(page, NAV_LABEL)}" 링크`).toHaveLength(1);
          const link = navLinks(page).filter({ hasText: exact(navLabel(page, NAV_LABEL)) });
          await expect(link).toHaveAttribute("href", USERS_HREF);
          if (viewport === "desktop") await expect(link, "데스크탑 nav 진입점이 보임").toBeVisible();
          if (screen === HOME_SCREEN) {
            const quick = page.locator(`${sel("quick-action")} ${sel(USER_MANAGE)}`);
            await expect(quick, "홈 quick-action 진입점").toHaveCount(1);
            await expect(quick).toBeVisible();
            await expect(quick).toContainText(NAV_LABEL);
            await expect(quick).toHaveAttribute("href", USERS_HREF);
          }
        }
        // 교사·admin 에게는 입고 진입, 학생에게는 없음 (s2-spec 화면 7)
        if (role === "student") expect(labels, `화면 ${screen} 학생 nav`).not.toContain(navLabel(page, STAFF_NAV_LABEL));
        else expect(labels, `화면 ${screen} ${roleName} nav`).toContain(navLabel(page, STAFF_NAV_LABEL));
        if (viewport === "desktop") {
          for (const l of await navLinks(page).all()) await expect(l, "데스크탑 nav 링크가 보임").toBeVisible();
        }
      }
      expect(perScreen[HOME_SCREEN].length, "nav 링크가 있어야 비교가 의미 있음").toBeGreaterThan(0);
      for (const screen of NAV_SCREENS) expect(perScreen[screen], `화면 ${screen} nav 링크 구성 = 홈`).toEqual(perScreen[HOME_SCREEN]);

      if (isAdmin) {
        // 홈 quick-action → 화면 8
        await page.goto(routeOf(HOME_SCREEN));
        await page.waitForLoadState("load");
        await waitWidthSettled(page);
        // 폭 전용 사본(모바일 quick-action 칸)이 빠질 때까지 — 홈 quick-action 진입점 1
        await expect(page.locator(`${sel("quick-action")} ${sel(USER_MANAGE)}`), "홈 quick-action 진입점 1").toHaveCount(1, { timeout: 45_000 });
        await page.locator(`${sel("quick-action")} ${sel(USER_MANAGE)}`).click();
        await page.waitForURL((u) => u.pathname === USERS_HREF, { timeout: 30_000 });
        await waitUsers(page);
      }
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S${SCREEN}] 학교A admin ${USERS_HREF} 렌더(리다이렉트 없음) · ${USER_MANAGE} 1 · 시트를 연 상태에서도 roles R1~R7 개수 · 데스크탑 nav 현재 섹션 "${NAV_LABEL}"`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport, response } = await openAs(browser, info, "admin", SCREEN);
  try {
    expect(response?.status(), "화면 8 응답").toBe(200);
    await waitUsers(page);
    expect(new URL(page.url()).pathname, "admin 은 화면 8 에 머문다").toBe(USERS_HREF);
    const me = await browserSession(page);
    expect(me.role).toBe(PROFILE_ROLE.admin);
    await expect(page.locator(sel(USER_MANAGE)), `${USER_MANAGE} (화면 본문 블록 1개)`).toHaveCount(1);
    await expect(manage(page)).toBeVisible();
    const check = async (state: string) => {
      for (const c of roleChecks(SCREEN, ROLE_NAME.admin)) {
        const n = await countComponent(page, c.component);
        if (c.op === "max") expect(n, `${state}: ${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
        else expect(n, `${state}: ${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
      }
      await expect(page.locator(sel(USER_MANAGE)), `${state}: ${USER_MANAGE}`).toHaveCount(1);
    };
    await check("기본");
    const members = await dbMembers(page);
    await openRoleSheet(page, otherMember(members, me.userId, "student").display_name);
    await check("역할 변경 시트");
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    await openInviteSheet(page);
    await check("초대 시트");

    const current = navLinks(page).and(page.locator('[aria-current="page"]'));
    await expect(current, "nav 현재 섹션 링크 1개").toHaveCount(1);
    await expect(current).toHaveText(exact(navLabel(page, NAV_LABEL)));
    if (viewport === "desktop") await expect(current).toBeVisible();
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 기본 상태
// =====================================================================

test(`[C1][S${SCREEN}] 학교A admin 기본 상태: nav-pill(워드마크·"${NAV_LABEL}"·학교명) · ${USER_MANAGE} 1 · ${PRIMARY} "${INVITE_BUTTON}" · ${INPUT} "${SEARCH_PLACEHOLDER}" · "${SECTION_MEMBERS}" ${ROW} 행 = 로그인 세션 profiles(이름·역할) · 헤더 인원 수·역할별 인원 = DB · 유의사항 · 시트 없음`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitUsers(page);
    const me = await browserSession(page);
    // 셸 머리: 390 = nav-pill(워드마크·제목·학교명) / 1440 = 사이드바(워드마크·학교명) + 본문 제목 (rules 1.22 desktop_shell)
    // 본문 제목: 390 = nav-pill "사용자 관리" / 1440 = 새 프레임 8-desktop page-title (d7 §23 run b)
    await expectShellHeader(page, viewport, { wordmark: WORDMARK, title: viewport === "desktop" ? DESK_TITLE8 : NAV_LABEL, schoolName: me.schoolName }, "화면 8");
    if (viewport === "mobile") {
      await expect(page.locator(sel("nav-pill")).getByText(exact(NAV_LABEL)).locator("visible=true"), `nav-pill 에 "${NAV_LABEL}" 가 보임`).toHaveCount(1);
    }
    if (viewport === "desktop") await expect(page.getByRole("heading", { level: 1, name: exact(DESK_TITLE8) }), "데스크탑 page-title").toBeVisible();

    await expect(page.locator(sel(USER_MANAGE))).toHaveCount(1);
    await expect(inviteButton(page), `헤더 ${PRIMARY} "${INVITE_BUTTON}"`).toHaveCount(1);
    await expect(inviteButton(page)).toBeVisible();
    await expect(inviteButton(page)).toBeEnabled();
    await expect(searchInput(page), `"${SEARCH_PLACEHOLDER}"`).toHaveCount(1);
    await expect(searchInput(page)).toBeVisible();
    await expect(searchInput(page)).toHaveValue("");
    await expect(manage(page).locator(sel(INPUT)), `${USER_MANAGE} 안 ${INPUT}`).toHaveCount(1);
    await expect(manage(page).getByRole("heading", { name: exact(SECTION_MEMBERS) }), `섹션 "${SECTION_MEMBERS}"`).toBeVisible();

    // 멤버 행 = 같은 학교 profiles (로그인 세션, RLS)
    const members = await dbMembers(page);
    expect(members.length, "학교 A 멤버(seed 3명 이상)").toBeGreaterThanOrEqual(SCHOOL_A_ROLES.length);
    expect(new Set(members.map((m) => m.school_id)).size, "admin 에게 보이는 profiles 는 한 학교").toBe(1);
    const shown = await readMembers(page);
    const key = (name: string, role: string | null) => `${name}|${role}`;
    expect(shown.map((s) => key(s.name, s.role)).sort(), "멤버 행(이름·역할) = DB").toEqual(members.map((m) => key(m.display_name, m.role)).sort());
    for (const row of await memberRows(page).all()) await expect(row).toBeVisible();

    // 헤더
    const header = await readHeader(page);
    expect(header, "헤더 = DB").toEqual({ school: me.schoolName, ...countsOf(members) });
    expect(header.total, "N명 = 역할별 합").toBe(header.student + header.teacher + header.admin);

    // 초대 대기: 대기 초대가 있으면 "초대 대기 (N)" + 행 N개, 행은 누를 수 없다
    const invites = await dbPendingInvites(page);
    const shownInvites = await readInvites(page);
    expect(shownInvites.map((i) => i.email).sort(), "초대 대기 행 = DB 대기 초대").toEqual(invites.map((i) => i.email).sort());
    if (invites.length > 0) await expect(manage(page).getByRole("heading", { name: exact(invitesHeading(invites.length)) })).toBeVisible();
    await expect(manage(page).locator(sel(ROW)), `${ROW} = 멤버 + 초대`).toHaveCount(members.length + invites.length);

    await expect(manage(page).getByText(exact(noteText(me.schoolName))), "하단 유의사항").toBeVisible();
    // 기본 상태에는 시트·토스트·0건 카드가 없다 (1440 의 segmented-control 은 page-head 초대 줄의 학생·교사 — 시안 8-desktop)
    const noneHere = viewport === "desktop" ? [MODAL, "ex-toast", EMPTY] : [MODAL, "ex-toast", EMPTY, SEGMENT, SEGMENT_ACTIVE];
    for (const c of noneHere) expect(await countComponent(page, c), `기본 상태 ${c}`).toBe(0);
    if (viewport === "desktop") {
      await expect(inviteDialog(page).locator(sel(SEGMENT)), "1440 초대 줄 segmented-control 1").toHaveCount(1);
      await expect(page.locator(sel(SEGMENT)), "1440 segmented-control = 초대 줄 1").toHaveCount(1);
    }
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A admin 본인 행: "나" 배지 1개 = 내 이름 · 배경 = rules.json highlight 연하늘 · 다른 행은 그 배경이 아님 · 멤버 행에 이메일 없음`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitUsers(page);
    const me = await browserSession(page);
    const members = await dbMembers(page);
    const mine = members.find((m) => m.user_id === me.userId)!;
    const shown = await readMembers(page);
    const selfRows = shown.filter((s) => s.self);
    expect(selfRows.map((s) => s.name), '"나" 배지 행').toEqual([mine.display_name]);
    const bg = (name: string) => memberRow(page, name).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await bg(mine.display_name), "본인 행 배경").toBe(selfRowBackground());
    for (const m of members.filter((x) => x.user_id !== me.userId)) {
      expect(await bg(m.display_name), `${m.display_name} 행 배경`).not.toBe(selfRowBackground());
    }
    // d7 §8: 멤버의 이메일은 보여 주지 않는다
    for (const s of shown) for (const t of s.texts) expect(t, `멤버 행 글자 '${t}'`).not.toContain("@");
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A admin 이름 검색: 부분 일치(대소문자 무시)만 남음 · 0건이면 검색 바 유지 + ${EMPTY} "${EMPTY_SEARCH}" + 유의사항 유지 · 지우면 전체`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitUsers(page);
    const me = await browserSession(page);
    const members = await dbMembers(page);
    const actions = watchActions(page);
    const names = members.map((m) => m.display_name);
    const matching = (q: string) => names.filter((n) => n.toLowerCase().includes(q.toLowerCase())).sort();
    // 한 멤버 이름의 뒤쪽 조각 (부분 일치) — 전체보다 적게 걸리는 조각을 고른다
    const target = otherMember(members, me.userId, "student").display_name;
    const part = [target.slice(-2), target.slice(1), target].find((q) => q.length > 0 && matching(q).length < names.length);
    expect(part, "전체보다 적게 걸리는 검색어").toBeTruthy();
    const shownNames = async () => (await readMembers(page)).map((s) => s.name).sort();

    // 하이드레이션 전 입력은 반영되지 않을 수 있어 결과가 맞을 때까지 다시 넣는다
    await expect(async () => {
      await searchInput(page).fill(part!);
      await expect(memberRows(page)).toHaveCount(matching(part!).length, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    expect(await shownNames(), `"${part}" 부분 일치`).toEqual(matching(part!));
    expect(await shownNames()).toContain(target);
    await expect(emptyCard(page)).toHaveCount(0);

    // 대문자로 넣어도 같은 결과
    await searchInput(page).fill(part!.toUpperCase());
    await expect(memberRows(page)).toHaveCount(matching(part!).length);
    // 앞뒤 공백
    await searchInput(page).fill(`  ${part}  `);
    await expect(memberRows(page)).toHaveCount(matching(part!).length);

    // 0건
    const none = "없는이름-zz-9173";
    expect(matching(none)).toEqual([]);
    await searchInput(page).fill(none);
    await expect(memberRows(page)).toHaveCount(0);
    await expect(emptyCard(page), `${EMPTY}`).toHaveCount(1);
    await expect(emptyCard(page)).toBeVisible();
    await expect(emptyCard(page)).toContainText(EMPTY_SEARCH);
    await expect(searchInput(page), "검색 바 유지").toBeVisible();
    await expect(searchInput(page)).toHaveValue(none);
    await expect(manage(page).getByText(exact(noteText(me.schoolName))), "유의사항 유지").toBeVisible();
    // 헤더 인원 수는 검색과 무관하게 학교 전체
    expect(await readHeader(page)).toEqual({ school: me.schoolName, ...countsOf(members) });

    // 지우면 전체
    await searchInput(page).fill("");
    await expect(memberRows(page)).toHaveCount(names.length);
    await expect(emptyCard(page)).toHaveCount(0);
    expect(await shownNames()).toEqual([...names].sort());
    expect(actions.count(), "검색은 쓰기 요청을 보내지 않는다").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 역할 변경 시트 (열고 닫기만, "변경" 을 누르지 않는다)
// =====================================================================

test(`[C1][S${SCREEN}] 학교A admin 역할 변경 시트(다른 멤버): ${MODAL} 1 · 제목 "{이름}의 역할" · 라디오 3행 "학생 / 교사 / admin"(지금 역할 선택) · ${PRIMARY} "${CHANGE_BUTTON}" · ${OUTLINE} "${DELETE_USER_BUTTON}" · 요청 0건`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitUsers(page);
    const me = await browserSession(page);
    const members = await dbMembers(page);
    const actions = watchActions(page);
    for (const role of ["student", "teacher"] as const) {
      const m = otherMember(members, me.userId, role);
      const dialog = await openRoleSheet(page, m.display_name);
      await expect(modal(page)).toHaveCount(1);
      await expect(dialog.getByRole("heading", { name: exact(roleSheetTitle(m.display_name)) })).toBeVisible();
      const radios = dialog.getByRole("radio");
      await expect(radios, "라디오 3행").toHaveCount(ROLE_ORDER.length);
      const labels = (await dialog.getByRole("radiogroup").locator("label").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
      expect(labels, "라디오 순서").toEqual(ROLE_ORDER.map((r) => ROLE_TEXT[r]));
      for (const r of ROLE_ORDER) {
        await expect(radio(dialog, r), `${ROLE_TEXT[r]} 라디오`).toHaveCount(1);
        await expect(radio(dialog, r)).toBeEnabled();
        if (r === m.role) await expect(radio(dialog, r), "지금 역할이 선택돼 있다").toBeChecked();
        else await expect(radio(dialog, r)).not.toBeChecked();
      }
      await expect(primaryIn(dialog, CHANGE_BUTTON)).toHaveCount(1);
      await expect(primaryIn(dialog, CHANGE_BUTTON)).toBeEnabled();
      await expect(dialog.locator(sel(PRIMARY)), `시트 안 ${PRIMARY}`).toHaveCount(1);
      await expect(outlineIn(dialog, DELETE_USER_BUTTON)).toHaveCount(1);
      await expect(outlineIn(dialog, DELETE_USER_BUTTON)).toBeVisible();
      await expect(dialog.locator(sel(OUTLINE)), `시트 안 ${OUTLINE}`).toHaveCount(1);
      await expect(dialog.getByText(LAST_ADMIN_HINT), "마지막 admin 안내는 없다").toHaveCount(0);
      // 라디오는 한 번에 하나 (고르기만 하고 저장하지 않는다)
      const other = ROLE_ORDER.find((r) => r !== m.role && r !== "admin")!;
      await pickRole(dialog, other);
      await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(1);
      await pickRole(dialog, m.role);
      await page.keyboard.press("Escape");
      await expect(modal(page)).toHaveCount(0);
    }
    expect(actions.count(), "시트를 열고 닫는 동안 쓰기 요청 없음").toBe(0);
    expect((await dbMembers(page)).map((m) => `${m.user_id}|${m.role}`).sort(), "역할 그대로").toEqual(members.map((m) => `${m.user_id}|${m.role}`).sort());
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A admin 본인·마지막 admin 시트: 라디오 3개 비활성 · "${LAST_ADMIN_HINT}" · "${DELETE_USER_BUTTON}" 없음 · "${CHANGE_BUTTON}" 비활성`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitUsers(page);
    const me = await browserSession(page);
    const members = await dbMembers(page);
    const mine = members.find((m) => m.user_id === me.userId)!;
    expect(members.filter((m) => m.role === "admin").map((m) => m.user_id), "전제: 학교 A admin = 공용 admin 1명").toEqual([me.userId]);
    const actions = watchActions(page);
    if (isDesktopPage(page)) {
      // 1440 (시안 8-desktop 본인 행 empty-cell): 마지막 admin 인 본인 행에는 더보기가 없다 — 역할·삭제를 바꿀 수 없다
      await expect(memberRow(page, mine.display_name).getByRole("button", { name: /더보기/ }), "본인(마지막 admin) 행 더보기 0").toHaveCount(0);
      for (const m of members.filter((x) => x.user_id !== me.userId)) {
        await expect(memberRow(page, m.display_name).getByRole("button", { name: /더보기/ }), `${m.display_name} 행 더보기 1`).toHaveCount(1);
      }
      expect(actions.count(), "쓰기 요청 없음").toBe(0);
      return;
    }
    const dialog = await openRoleSheet(page, mine.display_name);
    await expect(dialog.getByRole("radio")).toHaveCount(ROLE_ORDER.length);
    for (const r of ROLE_ORDER) await expect(radio(dialog, r), `${ROLE_TEXT[r]} 라디오 비활성`).toBeDisabled();
    await expect(radio(dialog, "admin")).toBeChecked();
    await expect(dialog.getByText(LAST_ADMIN_HINT)).toBeVisible();
    await expect(outlineIn(dialog, DELETE_USER_BUTTON), `"${DELETE_USER_BUTTON}" 숨김`).toHaveCount(0);
    await expect(dialog.getByText(DELETE_USER_BUTTON)).toHaveCount(0);
    await expect(primaryIn(dialog, CHANGE_BUTTON)).toHaveCount(1);
    await expect(primaryIn(dialog, CHANGE_BUTTON)).toBeDisabled();
    // 비활성 라디오의 행을 눌러도 선택이 바뀌지 않는다
    await radio(dialog, "student").click({ force: true, timeout: 10_000 });
    await expect(radio(dialog, "admin")).toBeChecked();
    await expect(radio(dialog, "student")).not.toBeChecked();
    expect(actions.count(), "쓰기 요청 없음").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A admin 시트 닫기 3종(Esc · 같은 행 다시 누르기 · 시트의 "${CLOSE_LABEL}" 버튼) → 시트 0 · 포커스가 누른 행("${INVITE_BUTTON}")으로 복귀 · 다른 행을 누르면 그 사람 시트로 바뀜`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitUsers(page);
    const me = await browserSession(page);
    const members = await dbMembers(page);
    const student = otherMember(members, me.userId, "student");
    const teacher = otherMember(members, me.userId, "teacher");
    const row = memberRow(page, student.display_name);
    const actions = watchActions(page);
    if (isDesktopPage(page)) {
      // 1440: 역할 바꾸기 = 행 끝 더보기 → 가운데 확인 카드. 닫기 = Esc · ×(닫기) → 포커스는 연 더보기로. 다른 행 더보기 → 그 사람 카드 (초대는 시트 없이 page-head 초대 줄)
      const more = row.getByRole("button", { name: /더보기/ });
      await openRoleSheet(page, student.display_name);
      await page.keyboard.press("Escape");
      await expect(modal(page), "Esc 로 닫힘").toHaveCount(0);
      await expect(more, "포커스가 누른 더보기로").toBeFocused();
      const d2 = await openRoleSheet(page, student.display_name);
      await expect(closeIcon(d2), "카드 닫기 버튼").toHaveCount(1);
      await closeIcon(d2).click();
      await expect(modal(page), "닫기 버튼으로 닫힘").toHaveCount(0);
      await expect(more).toBeFocused();
      await openRoleSheet(page, teacher.display_name);
      await expect(page.getByRole("dialog", { name: exact(roleSheetTitle(teacher.display_name)) })).toBeVisible();
      await expect(modal(page)).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(modal(page)).toHaveCount(0);
      await expect(inviteDialog(page), "1440 초대 줄은 늘 보임 (닫을 시트 없음)").toBeVisible();
      expect(actions.count(), "쓰기 요청 없음").toBe(0);
      return;
    }

    // 1) Esc
    let dialog = await openRoleSheet(page, student.display_name);
    await page.keyboard.press("Escape");
    await expect(modal(page), "Esc 로 닫힘").toHaveCount(0);
    await expect(row, "포커스가 누른 행으로").toBeFocused();

    // 2) 같은 행 다시 누르기
    dialog = await openRoleSheet(page, student.display_name);
    await row.click();
    await expect(modal(page), "같은 행을 다시 눌러 닫힘").toHaveCount(0);
    await expect(row).toBeFocused();

    // 3) 시트의 닫기(×)
    dialog = await openRoleSheet(page, student.display_name);
    await expect(closeIcon(dialog), "시트 닫기 버튼").toHaveCount(1);
    await closeIcon(dialog).click();
    await expect(modal(page), "닫기 버튼으로 닫힘").toHaveCount(0);
    await expect(row).toBeFocused();

    // 다른 행을 누르면 시트는 하나인 채 그 사람 것으로 바뀐다 (비모달 — 뒤 목록을 계속 누를 수 있다)
    await openRoleSheet(page, student.display_name);
    await page.evaluate(() => window.scrollTo(0, 0));
    await memberRow(page, teacher.display_name).click();
    await expect(page.getByRole("dialog", { name: exact(roleSheetTitle(teacher.display_name)) })).toBeVisible();
    await expect(modal(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);

    // 초대 시트도 같은 세 가지로 닫힌다
    await openInviteSheet(page);
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    await expect(inviteButton(page), `포커스가 "${INVITE_BUTTON}" 로`).toBeFocused();
    await openInviteSheet(page);
    await inviteButton(page).click();
    await expect(modal(page), `"${INVITE_BUTTON}" 을 다시 눌러 닫힘`).toHaveCount(0);
    const inv = await openInviteSheet(page);
    await closeIcon(inv).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(inviteButton(page)).toBeFocused();
    expect(actions.count(), "쓰기 요청 없음").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 초대 시트 (열고 닫기·링크 복사만, "N명 초대" 를 누르지 않는다)
// =====================================================================

test(`[C1][S${SCREEN}] 학교A admin 초대 시트: ${MODAL} 1 · 제목 "${INVITE_TITLE}" · ${PILL_SOFT} "${COPY_LINK}" · ${INPUT} · ${SEGMENT} 1("학생 / 교사") + ${SEGMENT_ACTIVE} 1 · ${PRIMARY} "${inviteSubmitLabel(0)}" 비활성 · admin 초대 선택지 없음`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitUsers(page);
    const actions = watchActions(page);
    if (isDesktopPage(page)) {
      // 1440 = page-head 초대 줄 (시안 8-desktop page-actions: 이메일 text-input · segmented-control 학생/교사 · button-primary "초대" · button-pill-soft "초대 링크 복사") — 모달 0
      const form = await openInviteSheet(page);
      await expect(modal(page)).toHaveCount(0);
      await expect(form.getByPlaceholder(DESK_INVITE_PLACEHOLDER), `이메일 칸 "${DESK_INVITE_PLACEHOLDER}"`).toHaveCount(1);
      const seg = form.locator(sel(SEGMENT));
      await expect(seg).toHaveCount(1);
      const options = (await seg.locator("> *").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
      expect(options, "초대 역할 선택지 = 시안 8-desktop (admin 없음)").toEqual(DESK_INVITE_ROLES);
      expect(options).toEqual(INVITE_ROLE_ORDER.map((r) => ROLE_TEXT[r]));
      await expect(seg.locator(sel(SEGMENT_ACTIVE)), "활성 하나").toHaveCount(1);
      await expect(form.locator(sel(PILL_SOFT)), `${PILL_SOFT} "${COPY_LINK}"`).toHaveText(exact(COPY_LINK));
      await expect(inviteSubmit(page), `${PRIMARY} "${INVITE_BUTTON}"`).toHaveCount(1);
      await inviteSubmit(page).click();
      await expect(page.locator("main").getByRole("alert"), "빈 칸 → 안내").toHaveCount(1);
      expect(actions.count(), "빈 칸 초대는 요청을 보내지 않는다").toBe(0);
      expect(await dbPendingInvites(page), "학교 A 에 초대가 생기지 않았다").toHaveLength(0);
      return;
    }
    const dialog = await openInviteSheet(page);
    await expect(modal(page)).toHaveCount(1);
    await expect(dialog.getByRole("heading", { name: exact(INVITE_TITLE) })).toBeVisible();
    const copy = dialog.locator(sel(PILL_SOFT));
    await expect(copy, `${PILL_SOFT}`).toHaveCount(1);
    await expect(copy).toHaveText(exact(COPY_LINK));
    await expect(copy).toBeVisible();
    expect(await dialog.locator(sel(INPUT)).count(), `시트 안 ${INPUT}`).toBeGreaterThanOrEqual(1);
    await expect(dialog.locator(`${sel(INPUT)} input`).first()).toBeVisible();

    const seg = dialog.locator(sel(SEGMENT));
    await expect(seg, `${SEGMENT}`).toHaveCount(1);
    const options = (await seg.locator("> *").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    expect(options, "초대 역할 선택지 (admin 없음)").toEqual(INVITE_ROLE_ORDER.map((r) => ROLE_TEXT[r]));
    const active = seg.locator(sel(SEGMENT_ACTIVE));
    await expect(active, `${SEGMENT_ACTIVE} 는 한 번에 하나`).toHaveCount(1);
    const first = (await active.innerText()).trim();
    const otherLabel = options.find((o) => o !== first)!;
    await seg.getByText(exact(otherLabel)).click();
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(exact(otherLabel));
    await expect(page.locator(sel(SEGMENT_ACTIVE)), `화면 전체 ${SEGMENT_ACTIVE}`).toHaveCount(1);

    const submit = inviteSubmit(page);
    await expect(submit, '"N명 초대"').toHaveCount(1);
    await expect(submit).toHaveText(exact(inviteSubmitLabel(0)));
    await expect(submit, "0명이면 비활성").toBeDisabled();
    await expect(dialog.locator(sel(PRIMARY)), `시트 안 ${PRIMARY}`).toHaveCount(1);
    // 비활성 버튼을 억지로 눌러도 요청이 없다
    await submit.click({ force: true });
    await submit.evaluate((el) => (el as HTMLElement).click());
    await expect(dialog).toBeVisible();
    expect(actions.count(), "0명 초대는 요청을 보내지 않는다").toBe(0);
    expect(await dbPendingInvites(page), "학교 A 에 초대가 생기지 않았다").toHaveLength(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A admin "${COPY_LINK}" → 클립보드 = {origin}${routeOf(SIGNUP_SCREEN)} · "${COPIED_NOTICE}" · 쓰기 요청 0건(메일을 보내지 않는다)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await waitUsers(page);
    const actions = watchActions(page);
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") posts.push(`${r.method()} ${r.url()}`);
    });
    const dialog = await openInviteSheet(page);
    await page.evaluate(() => navigator.clipboard.writeText("before-copy"));
    await dialog.locator(sel(PILL_SOFT)).click();
    // 안내: 390 = 시트 안 / 1440 = 초대 줄 바로 아래
    await expect((isDesktopPage(page) ? page.locator("main") : dialog).getByText(COPIED_NOTICE)).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied, "복사된 주소 = 회원가입(화면 14)").toBe(`${new URL(page.url()).origin}${routeOf(SIGNUP_SCREEN)}`);
    await expect(dialog, "시트는 열린 채").toBeVisible();
    expect(actions.count(), "서버 액션 요청").toBe(0);
    expect(posts, "GET 이 아닌 요청").toEqual([]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C2
// =====================================================================

test(`[C2][S${SCREEN}] 학교A admin: 탭바 = rules.json tab_bar (390 표시·항목 수·라벨·활성 "${ACTIVE_TAB_LABEL}", 1440 미표시) — 역할 변경·초대 시트를 열어도 같음`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const tb = rules.tab_bar;
  expect(tb.labels, `tab_bar labels 에 "${ACTIVE_TAB_LABEL}"`).toContain(ACTIVE_TAB_LABEL);
  const { context, page, viewport } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitUsers(page);
    const me = await browserSession(page);
    const members = await dbMembers(page);
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
    await openRoleSheet(page, otherMember(members, me.userId, "student").display_name);
    await check("역할 변경 시트");
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    await openInviteSheet(page);
    await check("초대 시트");
  } finally {
    await context.close();
  }
});

test(`[C2][S${SCREEN}] 폭 390 학교A admin: 시트(역할 변경·초대)는 tab-bar 위쪽 선에 붙고 전폭 · 시트 하단 전폭 버튼이 tab-bar 에 가려지지 않음 · 시트가 열린 채 마지막 멤버 행·유의사항까지 스크롤로 보임 / 폭 1440: 시트는 본문 옆(겹치지 않음)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const tb = rules.tab_bar;
  const { context, page, viewport } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitUsers(page);
    const me = await browserSession(page);
    const members = await dbMembers(page);
    const student = otherMember(members, me.userId, "student");
    const note = manage(page).getByText(exact(noteText(me.schoolName)));
    const lastRow = memberRows(page).last();
    const toBottom = () => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const toTop = () => page.evaluate(() => window.scrollTo(0, 0));

    if (viewport === "desktop") {
      // 1440 (시안 8-desktop · d7 §23 "역할 변경·초대·삭제 확인 시트는 시안 8-desktop 대로"): 역할 바꾸기 = 본문 가운데 확인 카드(폭 = 시안), 초대 = page-head 줄
      await expect(page.locator(sel(tb.component))).toHaveCount(0);
      const dialog = await openRoleSheet(page, student.display_name);
      const m = await boxOf(modal(page));
      const sb = await boxOf(page.locator(sel(DESKTOP_SHELL.component)));
      const vw = page.viewportSize()!.width;
      expect(Math.abs(m.width - DESK_CARD_W), `카드 폭 = 시안 ${DESK_CARD_W}`).toBeLessThanOrEqual(1);
      expect(Math.abs((m.left + m.right) / 2 - (sb.right + vw) / 2), "카드는 본문(사이드바 오른쪽) 가운데").toBeLessThanOrEqual(16);
      expect(m.top, "카드가 화면 안").toBeGreaterThanOrEqual(0);
      expect(m.bottom, "카드가 화면 안").toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
      expect(await onTop(dialog.locator(sel(PRIMARY)).last()), "카드 버튼이 덮이지 않음").toBe(true);
      await page.keyboard.press("Escape");
      await expect(modal(page)).toHaveCount(0);
      const form = await openInviteSheet(page);
      const f = await boxOf(form);
      expect(f.top, "초대 줄은 본문 위(page-head)").toBeLessThan((await boxOf(manage(page))).top);
      return;
    }

    const bar = page.locator(sel(tb.component));
    await expect(bar).toHaveCount(1);
    const vw = page.viewportSize()!.width;

    // 시트 없이: 끝까지 내리면 유의사항·마지막 행이 tab-bar 위에 있다 (스크롤 영역은 tab-bar 위쪽 선에서 끝난다)
    await toBottom();
    const t = await boxOf(bar);
    expect((await boxOf(note)).bottom, "유의사항 아래 끝 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual(t.top + 0.5);
    expect(await onTop(note), "유의사항이 tab-bar 에 덮이지 않음").toBe(true);
    expect(await onTop(lastRow), "마지막 멤버 행이 tab-bar 에 덮이지 않음").toBe(true);
    await toTop();

    const sheetChecks = async (dialog: ReturnType<typeof modal>, buttons: ReturnType<typeof modal>[], what: string) => {
      const m = await boxOf(dialog);
      const tab = await boxOf(bar);
      expect(m.bottom, `${what}: 시트 아래 끝 ≤ tab-bar 위쪽 선`).toBeLessThanOrEqual(tab.top + 0.5);
      expect(Math.abs(tab.top - m.bottom), `${what}: 시트는 tab-bar 위쪽 선에 붙는다 (틈 ${tab.top - m.bottom})`).toBeLessThanOrEqual(1);
      expect(Math.round(m.left), `${what}: 시트 왼쪽 끝`).toBe(0);
      expect(Math.round(m.right), `${what}: 시트 전폭`).toBe(vw);
      expect(m.top, `${what}: 시트가 화면 안`).toBeGreaterThanOrEqual(0);
      for (const b of buttons) {
        await expect(b, `${what}: 시트 하단 버튼`).toHaveCount(1);
        const bb = await boxOf(b);
        expect(bb.bottom, `${what}: 버튼 아래 끝 ≤ tab-bar 위쪽 선`).toBeLessThanOrEqual(tab.top + 0.5);
        expect(bb.top, `${what}: 버튼이 화면 안`).toBeGreaterThanOrEqual(0);
        expect(await onTop(b), `${what}: 버튼이 tab-bar 에 덮이지 않음`).toBe(true);
        // 전폭 버튼: 시트 안쪽 여백(좌우 대칭)을 뺀 폭을 꽉 채운다
        expect(Math.abs(bb.left - m.left - (m.right - bb.right)), `${what}: 버튼 좌우 여백 대칭`).toBeLessThanOrEqual(1);
        expect(bb.width, `${what}: 버튼은 전폭 (시트 폭의 80% 이상)`).toBeGreaterThanOrEqual(m.width * 0.8);
        expect(bb.height, "버튼 높이 ≥ rules.json button.min_height").toBeGreaterThanOrEqual(BUTTON_MIN_HEIGHT);
      }
      const tabHit = await onTop(bar.locator(sel(tb.item)).first());
      expect(tabHit, `${what}: tab-item 이 시트에 덮이지 않음`).toBe(true);
    };

    // 역할 변경 시트
    const dialog = await openRoleSheet(page, student.display_name);
    await sheetChecks(dialog, [primaryIn(dialog, CHANGE_BUTTON), outlineIn(dialog, DELETE_USER_BUTTON)], "역할 변경 시트");
    // 누른 행은 시트 위에 보인다
    expect((await boxOf(memberRow(page, student.display_name))).bottom, "누른 행이 시트 위에 보임").toBeLessThanOrEqual((await boxOf(dialog)).top + 0.5);
    // 시트가 열린 채 끝까지 내리면 마지막 멤버 행·유의사항이 시트 위로 올라온다
    await toBottom();
    await expect
      .poll(async () => (await boxOf(note)).bottom <= (await boxOf(dialog)).top + 0.5, { message: "유의사항 아래 끝 ≤ 시트 위", timeout: 5_000 })
      .toBe(true);
    expect((await boxOf(lastRow)).bottom, "마지막 멤버 행 아래 끝 ≤ 시트 위").toBeLessThanOrEqual((await boxOf(dialog)).top + 0.5);
    expect(await onTop(note), "유의사항이 시트·tab-bar 에 덮이지 않음").toBe(true);
    expect(await onTop(lastRow), "마지막 멤버 행이 시트·tab-bar 에 덮이지 않음").toBe(true);
    // 스크롤해도 시트는 tab-bar 위에 그대로
    await sheetChecks(dialog, [primaryIn(dialog, CHANGE_BUTTON)], "역할 변경 시트(스크롤 후)");
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    await toTop();

    // 초대 시트
    const inv = await openInviteSheet(page);
    await sheetChecks(inv, [inviteSubmit(page)], "초대 시트");
    await toBottom();
    await expect
      .poll(async () => (await boxOf(note)).bottom <= (await boxOf(inv)).top + 0.5, { message: "초대 시트: 유의사항 아래 끝 ≤ 시트 위", timeout: 5_000 })
      .toBe(true);
    expect(await onTop(lastRow), "초대 시트: 마지막 멤버 행이 덮이지 않음").toBe(true);
  } finally {
    await context.close();
  }
});

const BUTTON_MIN_HEIGHT = (rules as unknown as { button: { min_height: number } }).button.min_height;

// =====================================================================
// V1 (보고용 스크린샷, 실패 조건 아님) — 시안과 같은 상태: admin, 멤버 목록 + 한 멤버의 역할 변경 시트 열림
// =====================================================================
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (학교A admin, 멤버 목록 + 다른 멤버의 역할 변경 시트 열림)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openAs(browser, info, "admin", SCREEN);
  try {
    await (async () => {
      await waitUsers(page);
      const me = await browserSession(page);
      const members = await dbMembers(page);
      // 시안: 교사 행의 시트가 열려 있다 (본인이 아닌 멤버)
      const target = members.find((m) => m.user_id !== me.userId && m.role === "teacher") ?? members.find((m) => m.user_id !== me.userId);
      if (target) await openRoleSheet(page, target.display_name);
    })().catch(() => undefined);
    // 시안 프레임 크기(390×844 · 1440×900) 그대로 — 하단 시트·옆 열이 보이는 첫 화면
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: false });
  } finally {
    await context.close();
  }
});
