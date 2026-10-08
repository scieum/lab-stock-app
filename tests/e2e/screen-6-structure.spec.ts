// 화면 6 (재주문 알림, dev-rules.json routes["6"]) 구조 규칙: R-ui · C1(기본 구성·알림 목록 = DB·판매처 연결 모달) · C2 · V1
// 기준: harness/d5-gates.md D3, harness/dev-rules.json (routes·route_auth 6·6_note·components·viewports),
//       design/rules.json (roles R1·R2·R3, tab_bar), 디자인 s2-spec "## 화면 6", design/frames/6-*.json, harness/d7-data.md §11.
// 이 파일은 공용 테스트 계정(학교 A)만 쓰고 DB 에 쓰지 않는다 — 읽기 · 모달 열고 닫기 · 새 창 확인만
// (새 창은 외부 사이트를 불러오지 않는다: stubExternal). 특정 상태·쓰기 흐름은 일회용 학교의 screen-6-states.
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { ROLE_LABEL } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, ROLE_NAME, browserClient, browserSession, countComponent, devRules, roleChecks, routeOf, rules, sel } from "./screen-helpers";
import { anonContext } from "./screen-8-helpers";
import { locationPath, shellSchoolScope } from "./shell-helpers";
import {
  BADGE,
  BASIS_WORD,
  BUSY,
  CARD,
  COMMON_NAMES,
  COMMON_SEARCH,
  COMMON_SEED,
  DIRECT_OPEN,
  EMPTY,
  EMPTY_ALERTS,
  GUIDE_TEXT,
  HOME,
  HOME_HREF,
  LINK,
  LINK_BUTTON,
  LOGIN_HREF,
  MANUAL,
  MANUAL_BUTTON,
  MANUAL_HREF,
  MODAL,
  OUTLINE,
  PILL_SOFT,
  REGISTER,
  REGISTER_BUTTON,
  REORDER,
  REORDER_HREF,
  REORDER_NAV,
  VENDORS_HREF,
  VENDORS_NAV,
  boxOf,
  cancelButton,
  cards,
  commonSearchOf,
  confirmButton,
  countsOf,
  dbLow,
  directLink,
  emptyCard,
  exact,
  expectCardMatches,
  expectTabBar,
  foreignComponents,
  linkButton,
  linkDialog,
  linksTo,
  manual,
  modal,
  navLabelFor,
  navLabels,
  navLinks,
  openLinkModal,
  optionNames,
  ownReagentsOf,
  pickVendor,
  readAlerts,
  registerEntry,
  searchHref,
  shortage,
  stubExternal,
  tabBarTop,
  visibleVendors,
  waitReorder,
  watchActions,
  watchWrites,
} from "./screen-6-9-helpers";

const SCREEN = REORDER;
const R1 = rules.roles.R1;
const R2 = rules.roles.R2;
const R3 = rules.roles.R3;
/** 학생이 들어갈 수 있는 화면 — R1·R2 컴포넌트와 화면 6 진입 링크가 없는지 보는 곳 (홈 · 시약 목록 · 사용 기록 내역 · 시약장 · 사용 기록 입력) */
const STUDENT_SCREENS = [HOME, 2, 10, 11, 4];
const STUDENT_HIDDEN = [R1.component!, ...(R2.components ?? [])];

// =====================================================================
// R-ui
// =====================================================================

test(`[R-ui][S${SCREEN}] rules.json R1 = ${MANUAL} 학생 0 · R2 = ${CARD}·${LINK} 학생 0 · R3 = ${REGISTER} 는 admin 만 · dev-rules route_auth ${SCREEN} = 교사·admin만`, () => {
  expect(R1.component, "R1 컴포넌트").toBe(MANUAL);
  expect([R1.role, R1.max], "R1 학생 max 0").toEqual([ROLE_NAME.student, 0]);
  expect(R2.components, "R2 컴포넌트").toEqual([CARD, LINK]);
  expect([R2.role, R2.max], "R2 학생 max 0").toEqual([ROLE_NAME.student, 0]);
  expect(R3.component, "R3 컴포넌트").toBe(REGISTER);
  expect(R3.only_roles, "R3 only_roles").toEqual([ROLE_NAME.admin]);
  for (const c of [MANUAL, CARD, LINK, REGISTER]) expect(devRules.components[c] ?? [], `dev-rules components ${c} 에 화면 ${SCREEN}`).toContain(SCREEN);
  for (const c of STUDENT_HIDDEN) {
    expect(
      roleChecks(SCREEN, ROLE_NAME.student).some((k) => k.component === c && k.op === "max" && k.value === 0),
      `학생 검사에 ${c} = 0`,
    ).toBe(true);
  }
  expect(roleChecks(SCREEN, ROLE_NAME.teacher).some((k) => k.rule === "R3" && k.component === REGISTER && k.value === 0), "교사 검사에 R3 = 0").toBe(true);
  expect(roleChecks(SCREEN, ROLE_NAME.admin).some((k) => k.rule === "R3"), "admin 검사에는 R3 상한 없음").toBe(false);
  const auth = (devRules as unknown as { route_auth: Record<string, string> }).route_auth;
  expect(auth[String(SCREEN)], `route_auth ${SCREEN}`).toContain("교사·admin만");
});

test(`[R-ui][S${SCREEN}] 학교A 학생 ${REORDER_HREF} → ${HOME_HREF} (HTTP 3xx · 응답 본문에 시약명·판매처명·"${BASIS_WORD}" 없음 · 도착 화면에 ${STUDENT_HIDDEN.join("·")}·${REGISTER} 0)`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "student", SCREEN);
  try {
    await page.waitForURL((u) => u.pathname === HOME_HREF, { timeout: 30_000 });
    await expect(page.locator(sel("home-summary")).first(), "홈으로 보내졌다").toBeVisible();
    const me = await browserSession(page);
    expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE.student);

    for (const c of roleChecks(SCREEN, ROLE_NAME.student).filter((k) => k.op === "max")) {
      expect(await countComponent(page, c.component), `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
    }
    await expect(page.locator(sel(MODAL)), MODAL).toHaveCount(0);
    await expect(linksTo(page, REORDER_HREF), `${REORDER_HREF} 링크`).toHaveCount(0);

    // 직접 요청: 본문을 내보내기 전에 3xx 로 판정한다 — 본문에 화면 6 의 데이터가 없다
    const { client } = await browserClient(page);
    const reagents = await ownReagentsOf(client);
    expect(reagents.length, "대조: 학생도 자기 학교 시약은 읽는다").toBeGreaterThan(0);
    const res = await context.request.get(REORDER_HREF, { maxRedirects: 0 });
    expect(res.status(), `${REORDER_HREF} 응답 코드`).toBeGreaterThanOrEqual(300);
    expect(res.status(), `${REORDER_HREF} 응답 코드`).toBeLessThan(400);
    expect(locationPath(res.headers()["location"], info), "Location").toBe(HOME_HREF);
    const body = await res.text();
    for (const word of [...reagents.map((r) => r.name), ...COMMON_NAMES, BASIS_WORD, GUIDE_TEXT, MANUAL_BUTTON, `data-component="${CARD}"`, `data-component="${LINK}"`, `data-component="${MANUAL}"`]) {
      expect(body.includes(word), `3xx 응답 본문에 '${word}'`).toBe(false);
    }
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${SCREEN}] 비로그인 ${REORDER_HREF} → ${LOGIN_HREF} (HTTP 3xx · 본문에 판매처명·"${BASIS_WORD}" 없음 · 화면 1 표시)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const context = await anonContext(browser, info);
  try {
    const res = await context.request.get(REORDER_HREF, { maxRedirects: 0 });
    expect(res.status(), "응답 코드").toBeGreaterThanOrEqual(300);
    expect(res.status(), "응답 코드").toBeLessThan(400);
    expect(locationPath(res.headers()["location"], info), "Location").toBe(LOGIN_HREF);
    const body = await res.text();
    for (const word of [...COMMON_NAMES, BASIS_WORD, MANUAL_BUTTON]) expect(body.includes(word), `3xx 응답 본문에 '${word}'`).toBe(false);
    const page = await context.newPage();
    await page.goto(REORDER_HREF);
    await page.waitForURL((u) => u.pathname === LOGIN_HREF, { timeout: 30_000 });
    await expect(page.locator(sel("ex-auth-form-card")).first(), "화면 1").toBeVisible();
    for (const c of [MANUAL, CARD, LINK, REGISTER, MODAL]) expect(await countComponent(page, c), `로그인 전 ${c}`).toBe(0);
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${SCREEN}] 학교A 학생 화면 ${STUDENT_SCREENS.join("·")}: ${STUDENT_HIDDEN.join("·")} 0 (R1·R2) · ${REORDER_HREF} 링크 0 · nav 에 "${REORDER_NAV}"·"${VENDORS_NAV}" 없음`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page, viewport } = await openAs(browser, info, "student", HOME);
  try {
    expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE.student);
    for (const screen of STUDENT_SCREENS) {
      const path = routeOf(screen);
      const res = await page.goto(path);
      expect(res?.status(), `${path} 응답`).toBe(200);
      await page.waitForLoadState("load");
      expect(new URL(page.url()).pathname, `${path} 그대로`).toBe(path);
      // 셸 (390 nav-pill / 1440 app-sidebar — rules 1.22 desktop_shell)
      await expect(shellSchoolScope(page, viewport), "셸").toHaveCount(1);
      await expect(page.locator(BUSY), "자리 표시는 본문으로 바뀐다").toHaveCount(0, { timeout: 45_000 });
      expect((await page.locator("main").innerText()).trim().length, `화면 ${screen} 본문이 그려졌다`).toBeGreaterThan(0);
      const counts = await countsOf(page, STUDENT_HIDDEN);
      for (const c of STUDENT_HIDDEN) expect(counts[c], `학생 화면 ${screen} ${c}`).toBe(0);
      await expect(linksTo(page, REORDER_HREF), `학생 화면 ${screen} ${REORDER_HREF} 링크`).toHaveCount(0);
      const labels = await navLabels(page);
      expect(labels, `학생 화면 ${screen} nav`).not.toContain(navLabelFor(page, REORDER_NAV));
      expect(labels, `학생 화면 ${screen} nav`).not.toContain(navLabelFor(page, VENDORS_NAV));
    }
  } finally {
    await context.close();
  }
});

for (const role of ["teacher", "admin"] as const) {
  const isAdmin = role === "admin";
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${REORDER_HREF} 렌더(200) · ${MANUAL} 1 · ${REGISTER} ${isAdmin ? "1 (→ " + VENDORS_HREF + ")" : "0 (R3)"} · nav "${REORDER_NAV}" 링크 있음 · "${VENDORS_NAV}" ${isAdmin ? "있음" : "없음"}`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, viewport, response } = await openAs(browser, info, role, SCREEN);
    try {
      expect(response?.status(), "응답").toBe(200);
      await waitReorder(page);
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      await expect(manual(page), MANUAL).toHaveCount(1);
      await expect(page.locator(sel(MANUAL)), `${MANUAL} 은 본문에만`).toHaveCount(1);

      // R3
      await expect(page.locator(sel(REGISTER)), `${ROLE_LABEL[role]} ${REGISTER}`).toHaveCount(isAdmin ? 1 : 0);
      if (isAdmin) {
        const entry = registerEntry(page).locator(`a${sel(OUTLINE)}[href="${VENDORS_HREF}"]`);
        await expect(entry, `${REGISTER} 안 ${OUTLINE} "${REGISTER_BUTTON}" → ${VENDORS_HREF}`).toHaveCount(1);
        await expect(entry).toHaveText(exact(REGISTER_BUTTON));
        await expect(entry).toBeVisible();
      } else {
        await expect(linksTo(page, VENDORS_HREF), `교사 화면 ${VENDORS_HREF} 링크 (DOM)`).toHaveCount(0);
      }

      // nav
      const labels = await navLabels(page);
      expect(labels.filter((l) => l === navLabelFor(page, REORDER_NAV)), `nav "${REORDER_NAV}"`).toHaveLength(1);
      expect(labels.filter((l) => l === navLabelFor(page, VENDORS_NAV)), `nav "${VENDORS_NAV}"`).toHaveLength(isAdmin ? 1 : 0);
      const reorderLink = navLinks(page).filter({ hasText: exact(navLabelFor(page, REORDER_NAV)) });
      await expect(reorderLink, `nav "${REORDER_NAV}" → ${REORDER_HREF}`).toHaveAttribute("href", REORDER_HREF);
      if (viewport === "desktop") {
        await expect(reorderLink).toBeVisible();
        await expect(reorderLink, "현재 섹션 표시").toHaveAttribute("aria-current", "page");
        if (isAdmin) await expect(navLinks(page).filter({ hasText: exact(navLabelFor(page, VENDORS_NAV)) })).toBeVisible();
      }
      // 다른 최상위 화면에서도 같은 nav
      await page.goto(routeOf(2));
      await page.waitForLoadState("load");
      await expect(page.locator(BUSY)).toHaveCount(0, { timeout: 45_000 });
      const listLabels = await navLabels(page);
      expect(listLabels.filter((l) => l === navLabelFor(page, REORDER_NAV)), `화면 2 nav "${REORDER_NAV}"`).toHaveLength(1);
      expect(listLabels.filter((l) => l === navLabelFor(page, VENDORS_NAV)), `화면 2 nav "${VENDORS_NAV}"`).toHaveLength(isAdmin ? 1 : 0);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// C1
// =====================================================================

for (const role of ["teacher", "admin"] as const) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]}: 기본 구성 (${MANUAL} 안내 "${GUIDE_TEXT}" + ${PILL_SOFT} "${MANUAL_BUTTON}" → ${MANUAL_HREF}) · 화면 ${SCREEN} 밖 컴포넌트 0 · 알림 목록 = DB 의 stock < min_stock (부족 비율 큰 순) · 카드 = ${BADGE} + 시약명 + 재주문 기준/현재 재고(d7 §11 1.21) + 기준 문구 + 알림 날짜("M월 D일 알림") + ${LINK}`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const { context, page, response } = await openAs(browser, info, role, SCREEN);
    const actions = watchActions(page);
    try {
      expect(response?.status(), "응답").toBe(200);
      await waitReorder(page);

      // manual-upload
      await expect(manual(page), MANUAL).toHaveCount(1);
      await expect(manual(page).getByText(exact(GUIDE_TEXT)), `안내 "${GUIDE_TEXT}"`).toHaveCount(1);
      const entry = manual(page).locator(sel(PILL_SOFT)).filter({ hasText: exact(MANUAL_BUTTON) });
      await expect(entry, `${PILL_SOFT} "${MANUAL_BUTTON}"`).toHaveCount(1);
      await expect(entry).toBeVisible();
      await expect(manual(page).locator(`a[href="${MANUAL_HREF}"]`).filter({ hasText: exact(MANUAL_BUTTON) }), `"${MANUAL_BUTTON}" 의 href = ${MANUAL_HREF}`).toHaveCount(1);
      const mb = await boxOf(manual(page));
      const firstBody = await boxOf(cards(page).or(emptyCard(page)).first());
      if (info.project.name === "mobile") expect(mb.bottom, `${MANUAL} 은 알림 목록 위`).toBeLessThanOrEqual(firstBody.top + 0.5);

      // 화면 6 에 속하지 않는 컴포넌트 0 (dev-rules components)
      const foreign = await countsOf(page, foreignComponents(SCREEN));
      for (const [name, n] of Object.entries(foreign)) expect(n, `화면 ${SCREEN} 에 속하지 않는 ${name}`).toBe(0);
      await expect(modal(page), "닫힌 상태 — 모달 0").toHaveCount(0);

      // 알림 목록 = DB (다른 스펙이 병렬로 학교 A 재고를 잠깐 바꿨다 되돌린다 — 앞뒤 DB 가 같을 때의 화면으로 판정)
      await expect(async () => {
        const before = await dbLow(page);
        await page.reload();
        await waitReorder(page);
        const shown = await readAlerts(page);
        const low = await dbLow(page);
        expect(low, "화면을 읽는 동안 DB 가 그대로").toEqual(before);
        expect(shown.map((s) => s.name).sort(), "알림 카드 = 부족 시약").toEqual(low.map((r) => r.name).sort());
        expect(new Set(low.map((r) => r.name)).size, "대조: 부족 시약 이름이 서로 다름").toBe(low.length);
        const byName = new Map(low.map((r) => [r.name, r]));
        for (const card of shown) expectCardMatches(card, byName.get(card.name)!, `카드 "${card.name}"`);
        const ratios = shown.map((s) => shortage(byName.get(s.name)!));
        for (let i = 1; i < ratios.length; i++) {
          expect(ratios[i], `부족 비율 큰 순 (${shown.map((s, k) => `${s.name}=${ratios[k].toFixed(3)}`).join(", ")})`).toBeLessThanOrEqual(ratios[i - 1] + 1e-9);
        }
        expect(await countComponent(page, CARD), `${CARD} 수`).toBe(low.length);
        expect(await countComponent(page, LINK), `${LINK} 수`).toBe(low.length);
        expect(await countComponent(page, BADGE), `${BADGE} 수`).toBe(low.length);
        expect(await countComponent(page, EMPTY), `${EMPTY} 수`).toBe(low.length === 0 ? 1 : 0);
        if (low.length === 0) await expect(emptyCard(page)).toContainText(EMPTY_ALERTS);
      }).toPass({ timeout: 120_000 });
      expect(actions.count(), "쓰기 요청 0건").toBe(0);
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S${SCREEN}] 학교A 교사: "${LINK_BUTTON}" → ${MODAL} (판매처 · {시약명} · 판매처 행 = 로그인 세션에 보이는 판매처 = 공통 ${COMMON_SEED.length}곳 · "취소"·"확인") → 고르고 "확인" → 새 창 주소 = 그 공통 판매처의 검색 주소(d7 §11, {q} = 시약 이름) · 모달 닫힘 · "${DIRECT_OPEN}" 링크 · 쓰기 요청 0건`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  const stub = await stubExternal(context, info);
  const writes = watchWrites(page);
  try {
    await waitReorder(page);
    const low = await dbLow(page);
    expect(low.length, "대조: 학교 A 에 부족 시약이 있다 (seed)").toBeGreaterThan(0);
    const visible = await visibleVendors(page);
    expect(visible.filter((v) => v.school_id !== null), "대조: 학교 A 에는 학교 판매처가 없다 (공용 학교에 만들지 않는다)").toHaveLength(0);
    expect(visible.map((v) => v.name).sort(), "대조: 공통 목록 = d7 §12·§12-1 seed").toEqual([...COMMON_NAMES].sort());
    for (const s of COMMON_SEED) expect(visible.find((v) => v.name === s.name)?.website, `대조: ${s.name} 웹사이트`).toBe(s.website);

    const first = (await readAlerts(page))[0];
    const card = cards(page).first();
    const dlg = await openLinkModal(page, card);
    await expect(dlg.getByText(exact(`판매처 · ${first.name}`)), `"판매처 · ${first.name}"`).toHaveCount(1);
    expect((await optionNames(page)).sort(), "판매처 행 = 공통 목록").toEqual([...COMMON_NAMES].sort());
    await expect(cancelButton(page), `${OUTLINE} "취소"`).toHaveCount(1);
    await expect(confirmButton(page), `button-primary "확인"`).toHaveCount(1);

    // 검색 주소가 있는 공통 판매처 중 마지막 (d7 §11·§12-1 — 검색 주소 없는 곳은 웹사이트를 연다, screen-6-favorites 에서 확인)
    const pick = COMMON_SEARCH[COMMON_SEARCH.length - 1];
    await pickVendor(page, pick.name);
    await expect(confirmButton(page), "웹사이트가 있는 판매처 → 확인 활성").toBeEnabled();
    // d7 §11 "검색어 자동 입력": 공통 목록 판매처는 웹사이트 대신 그 판매처의 검색 결과 주소({q} = 카드 시약 이름)
    const want = searchHref(commonSearchOf(pick.name), first.name);
    const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 20_000 }), confirmButton(page).click()]);
    await popup.waitForURL((u) => u.href !== "about:blank", { timeout: 20_000 });
    expect(popup.url(), "새 창 주소 = 공통 판매처 검색 주소 (d7 §11 검색어 자동 입력)").toBe(want);
    expect(await popup.evaluate(() => window.opener), "새 창은 opener 없음 (noopener)").toBeNull();
    await popup.close();
    await expect(linkDialog(page), "확인 뒤 모달 닫힘").toHaveCount(0);
    await expect(modal(page)).toHaveCount(0);

    const direct = directLink(page);
    await expect(direct, `"${DIRECT_OPEN}" 링크`).toHaveCount(1);
    await expect(direct).toBeVisible();
    expect(new URL((await direct.getAttribute("href"))!).href, `"${DIRECT_OPEN}" href = 새 창과 같은 검색 주소`).toBe(want);
    await expect(direct).toHaveAttribute("target", "_blank");
    expect(((await direct.getAttribute("rel")) ?? "").split(/\s+/), `"${DIRECT_OPEN}" rel`).toContain("noopener");
    await expect(page.getByRole("status").filter({ has: direct }), "안내 줄에 판매처명").toContainText(pick.name);

    expect(stub.hits().every((u) => new URL(u).host === new URL(want).host), `앱 밖 요청은 고른 판매처 검색 주소뿐 (${stub.hits().join(", ")})`).toBe(true);
    expect(writes.list(), "쓰기 요청 0건 (아무것도 저장하지 않는다)").toEqual([]);
    expect((await visibleVendors(page)).map((v) => v.id).sort(), "판매처 행 불변").toEqual(visible.map((v) => v.id).sort());
  } finally {
    await context.close();
  }
});

// =====================================================================
// C2
// =====================================================================

for (const role of ["teacher", "admin"] as const) {
  test(`[C2][S${SCREEN}] ${ROLE_LABEL[role]}: 390 = tab-bar 1·tab-item ${rules.tab_bar.items}·활성 "시약", 1440 = 0 (모달 닫힘·열림 모두) · 모바일 모달 시트 아래 끝 ≤ tab-bar 위쪽 선`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN);
    try {
      await waitReorder(page);
      await expectTabBar(page, viewport, SCREEN, "모달 닫힘");
      expect((await dbLow(page)).length, "대조: 학교 A 에 부족 시약이 있다 (seed)").toBeGreaterThan(0);
      const dlg = await openLinkModal(page, cards(page).first());
      await expectTabBar(page, viewport, SCREEN, "모달 열림");
      const box = await boxOf(dlg);
      const vp = page.viewportSize()!;
      expect(box.top, "모달 위 끝이 화면 안").toBeGreaterThanOrEqual(0);
      expect(box.left, "모달 왼쪽 끝이 화면 안").toBeGreaterThanOrEqual(0);
      expect(box.right, "모달 오른쪽 끝이 화면 안").toBeLessThanOrEqual(vp.width + 0.5);
      if (viewport === "mobile") {
        expect(box.bottom, "모바일 시트 아래 끝 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual((await tabBarTop(page)) + 0.5);
        expect(Math.round(box.width), "모바일 시트 전폭").toBe(vp.width);
      } else {
        expect(box.bottom, "모달 아래 끝이 화면 안").toBeLessThanOrEqual(vp.height + 0.5);
      }
      await cancelButton(page).click();
      await expect(linkDialog(page)).toHaveCount(0);
      await expect(linkButton(cards(page).first()), "닫으면 포커스가 누른 버튼으로").toBeFocused();
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// V1 (보고용 스크린샷, 실패 조건 아님)
// =====================================================================

test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (학교A admin, 판매처 연결 모달 열림 — 읽기만)`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitReorder(page).catch(() => undefined);
    if ((await cards(page).count()) > 0) await openLinkModal(page, cards(page).first()).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: false });
  } finally {
    await context.close();
  }
});
