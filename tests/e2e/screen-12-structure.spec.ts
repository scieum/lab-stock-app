// 화면 12 (QR 찾기 /scan) 구조·역할 — C1 · C2 · C3 · R-ui · N1-ui · GM-ui · V1 (390 · 1440). 공용 학교 A 계정으로 읽기만.
// 기준: harness/d7-data.md §26 "화면 12 경로·권한"·"화면 12 모양"·"탭·사이드바", harness/d5-gates.md (R-ui·C1·C2·C3·N1-ui·V1),
//       harness/dev-rules.json 1.19 (routes 12 · route_auth 12 · components), design/rules.json 1.26 (roles · screens_required 12 · variants 12 ·
//       tab_bar · desktop_shell · guest), design/frames/12-mobile.json · 12-desktop.json.
// 카메라는 getUserMedia 가로채기(흰 캔버스 영상)로 켠다 — 시안의 camera-preview 상태를 본다 (screen-12-helpers.ts 머리말).
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, ROLE_NAME, browserSession, countComponent, devRules, roleChecks, routeOf, rules, sel } from "./screen-helpers";
import { QR_MENU_LABEL, QR_TAB_LABEL, anonContext, componentCounts, componentsOf, expectShell, schoolNamesIn } from "./shell-helpers";
import {
  D7_14,
  D7_26,
  EMPTY,
  LAYOUT_LABEL,
  MANUAL,
  MODES,
  NOT_NUMBER,
  NOT_QR,
  NUMBER_RANGE,
  OUTLINE,
  PILL_SOFT,
  QR_SCAN,
  REQUIRED,
  RESULT_VARIANT,
  SCAN,
  SCREEN,
  SEGMENT,
  UNAVAILABLE,
  d7Row,
  fnode,
  frameComponentCounts,
  frameName,
  ftexts,
  manualCard,
  missingText,
  notOursText,
  openScan,
  waitCameraLive,
  waitScan,
} from "./screen-12-helpers";

const TB = rules.tab_bar;
const DS = rules.desktop_shell;
const SHELL = new Set(["nav-pill", TB.component, TB.item, DS.component, DS.item]);
const ROLE_KEY = { student: "student", teacher: "teacher", admin: "admin" } as const;

/** rules desktop_shell.menu 의 역할별 메뉴 수 (모두 + 교사·admin + admin) */
function menuCount(role: "student" | "teacher" | "admin"): number {
  return DS.menu.all.length + (role !== "student" ? DS.menu.teacher_admin.length : 0) + (role === "admin" ? DS.menu.admin.length : 0);
}

// =====================================================================
// 전제
// =====================================================================

test(`[C1][S${SCREEN}] 기대값 원본: dev-rules routes ${SCREEN} = ${SCAN} · mvp_screens 에 ${SCREEN} · screens_required ${SCREEN}(${REQUIRED.join("·")}) · variants.result(${RESULT_VARIANT.join("·")}) ⊂ dev-rules components ${SCREEN} · d7 §26 문구 · 프레임 12 글자`, () => {
  expect(SCAN).toBe("/scan");
  expect(devRules.mvp_screens).toContain(SCREEN);
  expect(REQUIRED.length, "screens_required 12").toBeGreaterThan(0);
  expect(RESULT_VARIANT.length, "variants 12 result").toBeGreaterThan(0);
  for (const c of [...REQUIRED, ...RESULT_VARIANT]) expect(devRules.components[c], `dev-rules components ${c}`).toContain(SCREEN);
  expect(TB.mobile_screens, "tab_bar.mobile_screens 에 12").toContain(SCREEN);
  expect(DS.screens, "desktop_shell.screens 에 12").toContain(SCREEN);
  // d7 §26 문구 (helpers 가 원문에서 읽은 값)
  expect(NOT_NUMBER).toBe("시약장 번호를 숫자로 적어 주세요");
  expect(missingText(3)).toBe("3번 시약장이 없어요");
  expect(notOursText("가나고등학교")).toBe("가나고등학교 시약장 QR이 아니에요");
  expect(NOT_QR).toBe("시약장 QR이 아니에요");
  expect(UNAVAILABLE).toBe("카메라를 쓸 수 없어요. 시약장 번호로 찾아 주세요");
  expect(EMPTY).toBe("이 시약장에는 아직 시약이 없어요");
  expect(LAYOUT_LABEL).toBe("배치도 보기");
  expect(NUMBER_RANGE).toEqual({ min: 1, max: 9999 });
  expect(d7Row("화면 12 경로·권한")).toContain("로그인 후 모든 역할(학생 포함, 읽기만)");
  expect(D7_14, "d7 §14 QR 내용").toContain("`{origin}/scan?cabinet={cabinet id}`");
  expect(D7_26).toContain("탭바 QR guest-lock, /demo 에 화면 12 없음");
  // 프레임: segmented 라벨 = d7 · 탭 라벨 · 사이드바 메뉴
  expect(ftexts(frameName("mobile"), "label", SEGMENT), "프레임 12-mobile segmented 라벨 = d7").toEqual([MODES.scan, MODES.manual]);
  expect(fnode(frameName("mobile"), "nav-title").text!.characters, "프레임 nav-title = 탭 라벨").toBe(QR_TAB_LABEL);
  expect(ftexts(frameName("mobile"), "label", TB.component), "프레임 12-mobile 탭 라벨 = rules").toEqual(TB.labels);
  expect(ftexts(frameName("desktop"), "label", DS.component), "프레임 12-desktop 사이드바에 QR 메뉴").toContain(QR_MENU_LABEL);
  expect(fnode(frameName("desktop"), "title", "page-head").text!.characters, "프레임 page-head 제목 = QR 메뉴").toBe(QR_MENU_LABEL);
});

// =====================================================================
// 역할별 렌더 (R-ui · C1 · C2 · C3 · N1-ui · V1)
// =====================================================================

for (const role of SCHOOL_A_ROLES) {
  const roleName = ROLE_NAME[role as keyof typeof ROLE_NAME];
  test(`[R-ui][S${SCREEN}] [C1][S${SCREEN}] [C2][S${SCREEN}] [C3][S${SCREEN}] [N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${SCAN} 렌더(리다이렉트 없음) · roles R1~R7 · screens_required · 화면 12 밖 컴포넌트 0 · 390 nav-pill(× "${QR_TAB_LABEL}")·${SEGMENT}·${QR_SCAN}·${MANUAL}·tab-bar('${QR_TAB_LABEL}' 활성) / 1440 app-sidebar('${QR_MENU_LABEL}' 활성)·page-head·find-cards · 프레임 컴포넌트 수 · 학교명 1종 · V1`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, viewport } = await openScan(browser, info, role);
    try {
      await waitScan(page);
      await waitCameraLive(page);
      expect(new URL(page.url()).pathname, "리다이렉트 없음").toBe(SCAN);
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);

      // R-ui: rules.json roles R1~R7
      const checks = roleChecks(SCREEN, roleName);
      for (const c of checks) {
        const n = await countComponent(page, c.component);
        if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
        else expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
      }
      // 화면 12 에 속하지 않는 컴포넌트(역할 제한 컴포넌트 포함)는 0
      const own = new Set(componentsOf(SCREEN));
      const foreign = Object.keys(devRules.components).filter((c) => !own.has(c));
      for (const c of ["stock-intake", "reagent-register", "user-manage", "qr-print", "cabinet-edit"]) expect(foreign, `대조: ${c} 는 화면 12 밖`).toContain(c);
      expect(await componentCounts(page.locator("body"), foreign), "화면 12 밖 컴포넌트").toEqual(Object.fromEntries(foreign.map((n) => [n, 0])));

      // C1: screens_required
      for (const c of REQUIRED) await expect(page.locator(sel(c)).first(), `screens_required ${c} 보임`).toBeVisible();
      await expect(page.locator(sel(QR_SCAN)), `${QR_SCAN} 1`).toHaveCount(1);
      const scan = page.locator(sel(QR_SCAN));
      await expect(scan.locator('[data-name="camera-preview"]'), "camera-preview 1").toHaveCount(1);
      await expect(scan.locator('[data-name="camera-preview"] [data-name="scan-frame"]'), "scan-frame 1").toHaveCount(1);
      await expect(scan.locator('[data-name="camera-unavailable"]'), "카메라 켜짐: 안내 0").toHaveCount(0);
      const frame = frameName(viewport);
      for (const n of ["scan-title", "scan-help", "scan-caption"]) {
        await expect(scan.locator(`[data-name="${n}"]`), `${n} = 시안 글자`).toHaveText(fnode(frame, n).text!.characters);
      }

      // C2 · C3: 셸
      await expectShell(page, viewport, SCREEN, `${ROLE_LABEL[role]} ${SCAN}`);
      if (viewport === "mobile") {
        const nav = page.locator(sel("nav-pill"));
        await expect(nav, "nav-pill 1").toHaveCount(1);
        await expect(nav.getByText(fnode(frame, "nav-title").text!.characters, { exact: true }), `nav-pill 제목 "${QR_TAB_LABEL}"`).toBeVisible();
        await expect(nav.getByRole("link", { name: "닫기", exact: true }), "nav-close (×) 링크 1").toHaveCount(1);
        await expect(nav.getByRole("link", { name: "뒤로", exact: true }), "뒤로(‹) 0 — × 하나").toHaveCount(0);
        await expect(nav, "nav-pill 학교명 = 자기 학교").toContainText(me.schoolName);
        const items = page.locator(`${sel(TB.component)} ${sel(TB.item)}`);
        await expect(items, `tab-item ${TB.items}`).toHaveCount(TB.items);
        const active = page.locator(`${sel(TB.component)} ${sel(TB.item)}[aria-current="page"]`);
        await expect(active, "활성 tab-item 1").toHaveCount(1);
        await expect(active, `활성 = '${QR_TAB_LABEL}'`).toHaveText(QR_TAB_LABEL);
        await expect(active, `활성 → ${SCAN}`).toHaveAttribute("href", SCAN);
        // segmented-control "QR 스캔 | 번호로 찾기" · QR 스캔 활성
        const seg = page.locator(sel(SEGMENT));
        await expect(seg, `${SEGMENT} 1`).toHaveCount(1);
        expect((await seg.getByRole("tab").allInnerTexts()).map((t) => t.trim()), "segmented 라벨 = d7").toEqual([MODES.scan, MODES.manual]);
        await expect(seg.locator(sel("segmented-control-active")), `활성 = "${MODES.scan}"`).toHaveText(MODES.scan);
        // 플래시 · 번호로 찾기 버튼
        await expect(scan.locator(sel(PILL_SOFT)), "플래시 button-pill-soft 1").toHaveCount(1);
        await expect(scan.locator(sel(PILL_SOFT)), "플래시 글자 = 시안").toHaveText(fnode(frame, "label", PILL_SOFT).text!.characters);
        await expect(scan.locator(sel(PILL_SOFT)), "torch 미지원 = 플래시 비활성 (d7 §26)").toBeDisabled();
        const entry = page.locator(sel(MANUAL));
        await expect(entry, `${MANUAL} 1`).toHaveCount(1);
        await expect(entry.locator(sel(OUTLINE)), `${MANUAL} = button-outline "${fnode(frame, "label", MANUAL).text!.characters}"`).toHaveText(fnode(frame, "label", MANUAL).text!.characters);
        await expect(entry.locator("input"), "모바일 첫 화면: 번호 입력 0 (버튼만)").toHaveCount(0);
      } else {
        const sb = page.locator(sel(DS.component));
        await expect(sb.locator(sel(DS.item)), `sidebar-item = rules 메뉴 수 (${roleName})`).toHaveCount(menuCount(ROLE_KEY[role as keyof typeof ROLE_KEY]));
        const active = sb.locator(`${sel(DS.item)}[aria-current="page"]`);
        await expect(active, "활성 sidebar-item 1").toHaveCount(1);
        await expect(active, `활성 = '${QR_MENU_LABEL}'`).toHaveText(QR_MENU_LABEL);
        await expect(active, `활성 → ${SCAN}`).toHaveAttribute("href", SCAN);
        await expect(sb, "사이드바 학교명 = 자기 학교").toContainText(me.schoolName);
        await expect(page.locator(sel("nav-pill")), "nav-pill 0").toHaveCount(0);
        const head = page.locator('main [data-name="page-head"]');
        await expect(head, "page-head 1").toHaveCount(1);
        await expect.poll(() => head.locator("h1").innerText(), { message: `page-head 제목 "${QR_MENU_LABEL}" (보이는 글자)` }).toBe(fnode(frame, "title", "page-head").text!.characters);
        await expect(head.locator('[data-name="page-title"] p'), "page-head 부제 = 시안 summary").toHaveText(fnode(frame, "summary", "page-head").text!.characters);
        const cards = page.locator('main [data-name="find-cards"]');
        await expect(cards, "find-cards 1").toHaveCount(1);
        await expect(cards.locator(`[data-name="scan-card"] ${sel(QR_SCAN)}`), "scan-card 안 qr-scan 1").toHaveCount(1);
        await expect(cards.locator(sel(MANUAL)), `find-cards 안 ${MANUAL} 1`).toHaveCount(1);
        await expect(page.locator(sel(SEGMENT)), `데스크톱 ${SEGMENT} 0 (시안 12-desktop)`).toHaveCount(0);
        await expect(scan.locator(sel(PILL_SOFT)), "데스크톱 플래시 0 (시안 12-desktop)").toHaveCount(0);
        const card = manualCard(page);
        await expect(card.locator('[data-name="heading"]'), "번호 카드 제목 = 시안").toHaveText(fnode(frame, "heading", MANUAL).text!.characters);
        await expect(card.locator('[data-name="helper"]'), "번호 카드 helper = 시안").toHaveText(fnode(frame, "helper", MANUAL).text!.characters);
        await expect(card.locator("input"), "text-input placeholder = 시안").toHaveAttribute("placeholder", fnode(frame, "placeholder", "text-input").text!.characters);
        await expect(card.locator(sel("button-primary")), "button-primary = 시안").toHaveText(fnode(frame, "label", "button-primary").text!.characters);
      }

      // 프레임 12-{폭} 의 컴포넌트 수 (사이드바 메뉴 수는 역할별 — 위에서 rules 로 봤다)
      const want = frameComponentCounts(frame);
      delete want[DS.item];
      const got = await componentCounts(page.locator("body"), Object.keys(want));
      expect(got, `프레임 ${frame} 컴포넌트 수`).toEqual(want);
      for (const s of SHELL) if (!(s in want) && s !== DS.item) expect(await countComponent(page, s), `프레임에 없는 셸 ${s} 0`).toBe(0);

      // N1-ui: 학교명 1종 = 자기 학교
      const names = await schoolNamesIn(page.locator("body"));
      expect(names.length, "학교명 종류 = rules distinct_school_names").toBe(rules.never.N1.distinct_school_names);
      expect(names, "학교명 = 자기 학교 (패턴에 맞는 부분)").toEqual(me.schoolName.match(new RegExp(rules.never.N1.school_name_pattern, "g")));

      if (role === "teacher") await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: false });
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 시안 글자 크기·굵기 · 미리보기 크기 (토큰)
// =====================================================================

test(`[C1][S${SCREEN}] 교사: 시안 12 글자 크기·굵기 (scan-title·scan-help·scan-caption · 390 nav-title·segmented·플래시·번호 버튼 / 1440 page-head 제목·부제·번호 카드 제목·helper·찾기) · camera-preview 높이·radius = 프레임`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openScan(browser, info, "teacher");
  try {
    await waitScan(page);
    await waitCameraLive(page);
    const frame = frameName(viewport);
    const scan = page.locator(sel(QR_SCAN));
    const targets: { what: string; sel: ReturnType<typeof page.locator>; node: ReturnType<typeof fnode> }[] = [
      { what: "scan-title", sel: scan.locator('[data-name="scan-title"]'), node: fnode(frame, "scan-title") },
      { what: "scan-help", sel: scan.locator('[data-name="scan-help"]'), node: fnode(frame, "scan-help") },
      { what: "scan-caption", sel: scan.locator('[data-name="scan-caption"]'), node: fnode(frame, "scan-caption") },
    ];
    if (viewport === "mobile") {
      const nav = page.locator(sel("nav-pill"));
      targets.push(
        { what: "nav-title", sel: nav.getByText(QR_TAB_LABEL, { exact: true }), node: fnode(frame, "nav-title") },
        { what: "segmented 활성 라벨", sel: page.locator(sel("segmented-control-active")), node: fnode(frame, "label", "segmented-control-active") },
        { what: "segmented 옵션 라벨", sel: page.locator(sel(SEGMENT)).getByRole("tab", { name: MODES.manual }), node: fnode(frame, "label", "segmented-option") },
        { what: "플래시", sel: scan.locator(sel(PILL_SOFT)), node: fnode(frame, "label", PILL_SOFT) },
        { what: "번호로 찾기 버튼", sel: page.locator(`${sel(MANUAL)} ${sel(OUTLINE)}`), node: fnode(frame, "label", MANUAL) },
      );
    } else {
      const card = manualCard(page);
      targets.push(
        { what: "page-head 제목", sel: page.locator('main [data-name="page-head"] h1'), node: fnode(frame, "title", "page-head") },
        { what: "page-head 부제", sel: page.locator('main [data-name="page-title"] p'), node: fnode(frame, "summary", "page-head") },
        { what: "번호 카드 제목", sel: card.locator('[data-name="heading"]'), node: fnode(frame, "heading", MANUAL) },
        { what: "번호 카드 helper", sel: card.locator('[data-name="helper"]'), node: fnode(frame, "helper", MANUAL) },
        { what: "찾기", sel: card.locator(sel("button-primary")), node: fnode(frame, "label", "button-primary") },
      );
    }
    for (const t of targets) {
      await expect(t.sel.first(), `${t.what} 보임`).toBeVisible();
      const st = await t.sel.first().evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), weight: Number(getComputedStyle(el).fontWeight) }));
      expect(st.size, `${t.what} 글자 크기 = 시안 ${t.node.text!.fontSize}`).toBe(t.node.text!.fontSize);
      expect(st.weight, `${t.what} 굵기 = 시안 ${t.node.text!.fontWeight}`).toBe(t.node.text!.fontWeight);
    }
    const pv = fnode(frame, "camera-preview");
    const box = await scan.locator('[data-name="camera-preview"]').evaluate((el) => ({ h: el.getBoundingClientRect().height, r: parseFloat(getComputedStyle(el).borderTopLeftRadius) }));
    expect(box.h, `camera-preview 높이 = 시안 ${pv.height}`).toBe(pv.height);
    expect(box.r, `camera-preview radius = 시안 ${pv.cornerRadius}`).toBe(pv.cornerRadius);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 비로그인 · 둘러보기
// =====================================================================

test(`[C1][S${SCREEN}] 비로그인 ${SCAN} → ${routeOf(1)}?next=${SCAN} (화면 1) · 화면 12 컴포넌트 0`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  const context = await anonContext(browser, info);
  try {
    const page = await context.newPage();
    await page.goto(SCAN);
    await page.waitForURL((u) => u.pathname === routeOf(1), { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get("next"), "next = /scan").toBe(SCAN);
    for (const c of [QR_SCAN, MANUAL, "qr-result-sheet"]) expect(await countComponent(page, c), `${c} 0`).toBe(0);
  } finally {
    await context.close();
  }
});

test(`[GM-ui][S13g] 둘러보기: /demo${SCAN} 없음(404 · 화면 12 컴포넌트 0) · /demo 화면에 ${SCAN} 링크 0 · '${QR_TAB_LABEL}'/'${QR_MENU_LABEL}' = ${rules.guest.lock} (d7 §26)`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  const context = await anonContext(browser, info);
  try {
    const page = await context.newPage();
    const res = await page.goto(`${devRules.routes["13-guest"]}${SCAN}`);
    expect(res?.status(), `/demo${SCAN} = 404`).toBe(404);
    for (const c of [QR_SCAN, MANUAL, "qr-result-sheet"]) expect(await countComponent(page, c), `/demo${SCAN}: ${c} 0`).toBe(0);
    const demo = await page.goto(devRules.routes["13-guest"]);
    expect(demo?.status()).toBe(200);
    await expect(page.locator(sel(rules.guest.banner)).first(), "둘러보기 배너").toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`a[href="${SCAN}"], a[href^="${SCAN}?"]`), `/demo 의 ${SCAN} 링크 0`).toHaveCount(0);
    const mobile = info.project.name === "mobile";
    const label = mobile ? QR_TAB_LABEL : QR_MENU_LABEL;
    const item = page.locator(sel(mobile ? TB.item : DS.item)).filter({ hasText: label });
    await expect(item, `'${label}' 1`).toHaveCount(1);
    await expect(item.locator(sel(rules.guest.lock)), `'${label}' 안 ${rules.guest.lock} 1`).toHaveCount(1);
  } finally {
    await context.close();
  }
});

// =====================================================================
// nav-close (들어온 화면, 없으면 /) · 셸에서 들어오기
// =====================================================================

test(`[C2][S${SCREEN}] 교사: 390 = ${routeOf(2)} 에서 '${QR_TAB_LABEL}' 탭 → ${SCAN} · nav-close × → 들어온 화면(${routeOf(2)}) · 바로 연 ${SCAN} 의 × = / / 1440 = 사이드바 '${QR_MENU_LABEL}' → ${SCAN}(활성 이동, 같은 문서)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 2);
  try {
    await page.evaluate(() => ((window as unknown as { __sameDoc: boolean }).__sameDoc = true));
    const link =
      viewport === "mobile"
        ? page.locator(`${sel(TB.component)} a${sel(TB.item)}[href="${SCAN}"]`)
        : page.locator(`${sel(DS.component)} a${sel(DS.item)}[href="${SCAN}"]`);
    await expect(link, "셸의 /scan 링크 1").toHaveCount(1);
    await expect
      .poll(() => link.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "하이드레이션", timeout: 30_000 })
      .toBe(true);
    await link.click();
    await waitScan(page);
    expect(await page.evaluate(() => (window as unknown as { __sameDoc?: boolean }).__sameDoc), "클라이언트 이동 (같은 문서)").toBe(true);
    if (viewport === "desktop") {
      await expect(page.locator(`${sel(DS.component)} ${sel(DS.item)}[aria-current="page"]`), `활성 = '${QR_MENU_LABEL}'`).toHaveText(QR_MENU_LABEL);
      await expect(page.locator(sel("nav-pill")), "데스크톱 nav-pill 0 (× 없음)").toHaveCount(0);
      return;
    }
    const close = page.locator(sel("nav-pill")).getByRole("link", { name: "닫기", exact: true });
    await expect(close, `× → ${routeOf(2)} (들어온 화면)`).toHaveAttribute("href", routeOf(2));
    await close.click();
    await page.waitForURL((u) => u.pathname === routeOf(2), { timeout: 30_000 });

    // 새 탭에서 바로 연 /scan (휴대폰 카메라 QR 링크) → × = /
    const fresh = await context.newPage();
    await fresh.goto(SCAN);
    await waitScan(fresh);
    await expect(fresh.locator(sel("nav-pill")).getByRole("link", { name: "닫기", exact: true }), "바로 연 /scan 의 × → /").toHaveAttribute("href", "/");
  } finally {
    await context.close();
  }
});
