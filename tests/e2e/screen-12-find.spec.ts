// 화면 12 (QR 찾기) 번호로 찾기 · 결과(12-result) · 주소창 ?cabinet · 토스트 — C1 · R-ui (390 · 1440). 공용 학교 A 계정으로 읽기만.
// 기준: harness/d7-data.md §26 "번호로 찾기"·"결과 (12-result)"·"QR 해석"·"화면 12 데이터", §14 QR 내용,
//       design/rules.json 1.26 variants 12 result · desktop_shell.drawer_width, design/frames/12-result-mobile.json · 12-result-desktop.json.
// 기대 결과(시약장 이름·번호·캡션·칸 순서 시약·재고·칸 위치·재고 부족)는 로그인 세션(RLS)으로 읽은 DB 와 비교한다.
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES } from "./db-helpers";
import { browserSession, countComponent, rules, sel, type ViewportName } from "./screen-helpers";
import {
  DRAWER,
  LAYOUT_HREF,
  LAYOUT_LABEL,
  NOT_NUMBER,
  NOT_QR,
  NUMBER_RANGE,
  RESULT_VARIANT,
  ROW,
  SCAN,
  SCREEN,
  SHEET,
  DETAIL_HREF,
  cabinetWithLow,
  expectResultClosed,
  expectResultContent,
  expectResultOpen,
  expectToast,
  findByNumber,
  fnode,
  frameName,
  layoutLink,
  liveTracks,
  gumCalls,
  manualError,
  manualInput,
  missingText,
  notOursText,
  openScan,
  ownCabinets,
  schoolBView,
  sheet,
  sheetCaption,
  sheetClose,
  sheetTitle,
  toasts,
  waitCameraLive,
  waitScan,

} from "./screen-12-helpers";

/** 결과 열린 상태 공통: variants.result 컴포넌트 · 폭별 그릇(모바일 바텀시트 / 데스크톱 detail-drawer 480) · 카메라 꺼짐 */
async function expectResultFrame(page: Page, viewport: ViewportName, what: string): Promise<void> {
  for (const c of RESULT_VARIANT) expect(await countComponent(page, c), `${what}: variants.result ${c} ≥ 1`).toBeGreaterThanOrEqual(1);
  const frame = frameName(viewport, true);
  if (viewport === "desktop") {
    const d = page.locator(sel(DRAWER));
    await expect(d, `${what}: ${DRAWER} 1`).toHaveCount(1);
    await expect(d.locator(sel(SHEET)), `${what}: ${DRAWER} 안 ${SHEET}`).toHaveCount(1);
    const w = await d.evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.round(w), `${what}: 드로어 폭 = rules drawer_width`).toBe((rules.desktop_shell as unknown as { drawer_width: number }).drawer_width);
    await expect(page.locator(sel("tab-bar")), `${what}: tab-bar 0`).toHaveCount(0);
  } else {
    await expect(page.locator(sel(DRAWER)), `${what}: 모바일 ${DRAWER} 0`).toHaveCount(0);
    const s = sheet(page);
    const st = await s.evaluate((el) => ({ pos: getComputedStyle(el).position, r: parseFloat(getComputedStyle(el).borderTopLeftRadius), rb: parseFloat(getComputedStyle(el).borderBottomLeftRadius), bottom: el.getBoundingClientRect().bottom }));
    const radius = fnode(frame, SHEET).cornerRadius as number[];
    expect(st.pos, `${what}: 바텀시트 고정`).toBe("fixed");
    expect([st.r, st.rb], `${what}: 시트 radius = 시안 위 ${radius[0]} · 아래 ${radius[3]}`).toEqual([radius[0], radius[3]]);
    // tab-bar 위 (시안 12-result-mobile: 시트 아래 = tab-bar 위)
    await expect(page.locator(sel("tab-bar")), `${what}: tab-bar 1 (시트와 함께)`).toHaveCount(1);
    const barTop = await page.locator(sel("tab-bar")).evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.round(st.bottom), `${what}: 시트 아래 끝 = tab-bar 위`).toBeLessThanOrEqual(Math.round(barTop));
  }
  // 시안 글자: 시트 제목 20/700 · 캡션 12/400
  for (const [loc, name] of [
    [sheetTitle(page), "sheet-title-text"],
    [sheetCaption(page), "sheet-caption"],
  ] as const) {
    const n = fnode(frame, name);
    const g = await loc.evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), weight: Number(getComputedStyle(el).fontWeight) }));
    expect(g, `${what}: ${name} 글자 = 시안 ${n.text!.fontSize}/${n.text!.fontWeight}`).toEqual({ size: n.text!.fontSize, weight: n.text!.fontWeight });
  }
  // 결과가 열리면 카메라를 끈다 (d7 §26)
  await expect.poll(() => liveTracks(page), { message: `${what}: 결과 열림 = 카메라 트랙 0` }).toBe(0);
}

// =====================================================================
// 번호로 찾기 — 오류
// =====================================================================

test(`[C1][S${SCREEN}] 학생: 번호로 찾기 "abc"·"0"·"${NUMBER_RANGE.max + 1}"·"1.5" → "${NOT_NUMBER}" · 없는 번호 → "${missingText(0).replace("0", "{n}")}" · 결과 0 · 주소 ${SCAN} 그대로 · 고치면 오류 사라짐`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openScan(browser, info, "student");
  try {
    await waitScan(page);
    const cabs = await ownCabinets(page);
    expect(cabs.length, "대조: 자기 학교 시약장 ≥ 1").toBeGreaterThan(0);
    for (const bad of ["abc", "0", String(NUMBER_RANGE.max + 1), "1.5"]) {
      await findByNumber(page, viewport, bad);
      await expect(manualError(page), `"${bad}" → 입력 아래 오류`).toHaveText(NOT_NUMBER);
      await expect(sheet(page), `"${bad}": 결과 0`).toHaveCount(0);
    }
    const used = new Set(cabs.map((c) => c.number));
    let missing = Math.max(...used) + 1;
    while (used.has(missing)) missing += 1;
    expect(missing, "대조: 범위 안 없는 번호").toBeLessThanOrEqual(NUMBER_RANGE.max);
    await findByNumber(page, viewport, String(missing));
    await expect(manualError(page), `${missing} → "${missingText(missing)}"`).toHaveText(missingText(missing), { timeout: 20_000 });
    await expect(sheet(page), "없는 번호: 결과 0").toHaveCount(0);
    await expect(toasts(page), "번호 오류는 토스트가 아니라 입력 아래").toHaveCount(0);
    expect(`${new URL(page.url()).pathname}${new URL(page.url()).search}`, "주소 그대로").toBe(SCAN);
    await manualInput(page).fill("1");
    await expect(manualError(page), "고치면 오류 사라짐").toHaveCount(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 번호로 찾기 — 결과 (모든 역할)
// =====================================================================

for (const role of SCHOOL_A_ROLES) {
  test(`[C1][S${SCREEN}] [R-ui][S${SCREEN}] ${ROLE_LABEL[role]}: 번호로 찾기 → 결과(390 바텀시트 reagent-row · badge-low-stock · 칸 위치 · 화살표 없음 / 1440 detail-drawer result-table 열 4) = DB(RLS) · 주소 ?cabinet={id} · "${LAYOUT_LABEL}" → ${LAYOUT_HREF("{id}")} · 카메라 끔 · × 닫기 → ${SCAN} · 카메라 다시 켬 · Esc 닫기`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, viewport } = await openScan(browser, info, role);
    try {
      await waitScan(page);
      await waitCameraLive(page);
      const cab = cabinetWithLow(await ownCabinets(page));
      await findByNumber(page, viewport, ` ${cab.number} `);
      await expectResultOpen(page, cab, `${cab.number}번`);
      await expectResultContent(page, viewport, cab, `${cab.number}번`);
      await expectResultFrame(page, viewport, `${cab.number}번`);
      // 읽기 전용: 결과 안 쓰기 버튼 0 (배치도 보기 링크 + 닫기만)
      await expect(sheet(page).locator("button:not([data-name='sheet-close'])"), "결과 시트 안 버튼 = 닫기만").toHaveCount(0);

      // × 닫기 → /scan · 카메라 다시 켬
      const before = await gumCalls(page);
      await sheetClose(page).click();
      await expectResultClosed(page, "× 닫기");
      if (viewport === "desktop") {
        // 1440: 카메라는 scan-card 에 늘 있다 — 닫으면 다시 켠다. (390 은 번호로 찾기 탭에서 연 결과라 카메라는 꺼진 채 —
        // d7 §26 "번호로 찾기로 바꾸면 카메라를 끈다". QR 로 연 결과의 닫기 → 카메라 다시 켬은 screen-12-camera.spec.ts)
        await expect.poll(() => gumCalls(page), { message: "닫기 = 카메라 다시 켬 (getUserMedia 다시)" }).toBeGreaterThan(before);
        await waitCameraLive(page);
      }

      // Esc 닫기
      await findByNumber(page, viewport, String(cab.number));
      await expectResultOpen(page, cab, "다시 찾기");
      await page.keyboard.press("Escape");
      await expectResultClosed(page, "Esc 닫기");

      // 모바일: 시트 바깥 누름 = 닫기
      if (viewport === "mobile") {
        await findByNumber(page, viewport, String(cab.number));
        await expectResultOpen(page, cab, "다시 찾기 (바깥)");
        await page.locator('[data-component="qr-manual-entry"] [data-name="heading"]').click();
        await expectResultClosed(page, "시트 바깥 누름");
      }
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 결과에서 이동
// =====================================================================

test(`[C1][S${SCREEN}] 교사: 결과 행 → 화면 3 (/reagents/{id}) · "${LAYOUT_LABEL}" → ${LAYOUT_HREF("{id}")}`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openScan(browser, info, "teacher");
  try {
    await waitScan(page);
    const cab = cabinetWithLow(await ownCabinets(page));
    await findByNumber(page, viewport, String(cab.number));
    await expectResultOpen(page, cab, "결과");
    const first = cab.rows[0];
    const row = viewport === "mobile" ? sheet(page).locator(sel(ROW)).first() : sheet(page).locator("tbody tr").first().locator("a");
    await row.click();
    await page.waitForURL((u) => u.pathname === DETAIL_HREF(first.id), { timeout: 30_000 });

    await page.goto(`${SCAN}?cabinet=${cab.id}`);
    await waitScan(page);
    await expectResultOpen(page, cab, "주소창 진입");
    await layoutLink(page).click();
    await page.waitForURL((u) => `${u.pathname}${u.search}` === LAYOUT_HREF(cab.id), { timeout: 30_000 });
  } finally {
    await context.close();
  }
});

// =====================================================================
// 주소창 /scan?cabinet=…
// =====================================================================

test(`[C1][S${SCREEN}] 학생: ${SCAN}?cabinet={우리 학교 시약장 id} 직접 진입 = 결과 열림(서버 HTML 에 이미) · 새로고침해도 같음 · 대문자 id 도 같은 시약장`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openScan(browser, info, "student");
  try {
    await waitScan(page);
    const cabs = await ownCabinets(page);
    for (const cab of cabs) {
      const res = await page.goto(`${SCAN}?cabinet=${cab.id}`);
      expect(res?.status(), "200").toBe(200);
      const html = await res!.text();
      expect(html, "서버 HTML 에 결과(시약장 이름)").toContain(cab.label);
      await waitScan(page);
      await expectResultOpen(page, cab, `${cab.number}번 직접 진입`);
      await expectResultContent(page, viewport, cab, `${cab.number}번 직접 진입`);
      await page.reload();
      await waitScan(page);
      await expectResultOpen(page, cab, `${cab.number}번 새로고침`);
    }
    const upper = cabs[0];
    await page.goto(`${SCAN}?cabinet=${upper.id.toUpperCase()}`);
    await waitScan(page);
    await expect(sheetTitle(page), "대문자 id → 같은 시약장").toHaveText(upper.label);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 교사: ${SCAN}?cabinet={학교B 시약장 id} → "{자기 학교명} 시약장 QR이 아니에요" 토스트 · 결과 0 · 주소 ${SCAN} / 없는 uuid(삭제된 시약장) → 같은 토스트 / uuid 아님 → "${NOT_QR}"`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const b = await schoolBView(browser, info);
  expect(b.cabs.length, "대조: 학교 B 시약장 ≥ 1").toBeGreaterThan(0);
  const { context, page } = await openScan(browser, info, "teacher");
  try {
    await waitScan(page);
    const me = await browserSession(page);
    expect(me.schoolName).not.toBe(b.schoolName);
    const cases: { q: string; text: string; what: string }[] = [
      { q: b.cabs[0].id, text: notOursText(me.schoolName), what: "학교 B 시약장" },
      { q: "00000000-0000-4000-8000-000000000000", text: notOursText(me.schoolName), what: "없는 uuid" },
      { q: "not-a-cabinet", text: NOT_QR, what: "uuid 아님" },
    ];
    for (const c of cases) {
      const res = await page.goto(`${SCAN}?cabinet=${encodeURIComponent(c.q)}`);
      expect(res?.status(), `${c.what}: 200`).toBe(200);
      await waitScan(page);
      await expectToast(page, c.text, c.what);
      await expect(sheet(page), `${c.what}: 결과 0`).toHaveCount(0);
      await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`, { message: `${c.what}: 주소 → ${SCAN}` }).toBe(SCAN);
    }
  } finally {
    await context.close();
  }
});

