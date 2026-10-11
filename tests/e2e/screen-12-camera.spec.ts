// 화면 12 (QR 찾기) 카메라 — 실제 QR 읽기 · 같은 코드 한 번 · 닫은 뒤 다시 읽기 · 토스트 · 권한 거부 · 카메라 끄기 (390 · 1440). C1.
// 기준: harness/d7-data.md §26 "카메라"·"QR 해석"·"결과 (12-result)", §14 QR 내용 `{origin}/scan?cabinet={cabinet id}`.
// 방법: getUserMedia 를 가로채 캔버스 영상을 돌려주고, 그 캔버스에 qrcode 패키지로 만든 진짜 QR 그림을 그린다.
// 화면의 읽기 도구(BarcodeDetector · 없으면 jsqr)가 영상 프레임에서 직접 읽는다 — 디코드 결과를 주입하지 않는다 (screen-12-helpers.ts).
import { test, expect } from "@playwright/test";
import { browserSession, sel } from "./screen-helpers";
import {
  MANUAL,
  MODES,
  NOT_QR,
  OUTLINE,
  PILL_SOFT,
  QR_SCAN,
  SCAN,
  SCREEN,
  SEGMENT,
  UNAVAILABLE,
  cabinetQr,
  cabinetWithLow,
  expectResultClosed,
  expectResultContent,
  expectResultOpen,
  gumCalls,
  liveTracks,
  manualInput,
  notOursText,
  openScan,
  ownCabinets,
  schoolBView,
  sheet,
  sheetAdds,
  sheetClose,
  showQr,
  toastAdds,
  toasts,
  waitCameraLive,
  waitScan,
  watchSheets,
  watchToasts,
} from "./screen-12-helpers";

/** d7 §26 "같은 코드를 연달아 읽어도 토스트·시트는 한 번" — 같은 QR 을 이만큼 계속 비춰도 한 번 (읽기 간격 200ms 기준 여러 번 읽힘) */
const HOLD_MS = 2_000;

test(`[C1][S${SCREEN}] 학생: 카메라 영상의 우리 학교 시약장 QR(${SCAN}?cabinet={id}) → 결과 열림 = DB · 계속 비춰도 시트 한 번 · 결과 열림 = 카메라 끔 · × 닫기 → 카메라 다시 켬 · 같은 QR 다시 비추면 다시 열림 · 다른 시약장 QR → 그 시약장`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openScan(browser, info, "student");
  try {
    await waitScan(page);
    await waitCameraLive(page);
    const cabs = await ownCabinets(page);
    const cab = cabinetWithLow(cabs);
    const origin = new URL(page.url()).origin;
    await watchSheets(page);

    await showQr(page, cabinetQr(origin, cab.id));
    await expectResultOpen(page, cab, "QR 읽기");
    await expectResultContent(page, viewport, cab, "QR 읽기");
    await expect.poll(() => liveTracks(page), { message: "결과 열림 = 카메라 트랙 0" }).toBe(0);
    await page.waitForTimeout(HOLD_MS);
    expect(await sheetAdds(page), "같은 QR 을 계속 비춰도 시트는 한 번").toBe(1);

    // 닫기 (QR 을 치운 채) → 카메라 다시 켬 · 다시 열리지 않음
    await showQr(page, null);
    const before = await gumCalls(page);
    await sheetClose(page).click();
    await expectResultClosed(page, "× 닫기");
    await expect.poll(() => gumCalls(page), { message: "닫기 = 카메라 다시 켬" }).toBeGreaterThan(before);
    await waitCameraLive(page);
    await page.waitForTimeout(1_000);
    await expect(sheet(page), "QR 이 없으면 결과 0").toHaveCount(0);

    // 같은 시약장 QR 을 다시 비추면 다시 열린다 (닫으면 새 스캔)
    await showQr(page, cabinetQr(origin, cab.id));
    await expectResultOpen(page, cab, "같은 QR 다시");
    expect(await sheetAdds(page), "다시 비춤 = 두 번째 시트").toBe(2);

    // Esc 로 닫고 다른 시약장 QR → 그 시약장
    const other = cabs.find((c) => c.id !== cab.id);
    if (other) {
      await showQr(page, null);
      await page.keyboard.press("Escape");
      await expectResultClosed(page, "Esc 닫기");
      await waitCameraLive(page);
      await showQr(page, cabinetQr(origin, other.id));
      await expectResultOpen(page, other, "다른 시약장 QR");
      await expectResultContent(page, viewport, other, "다른 시약장 QR");
    }
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 교사: 카메라 영상의 학교B 시약장 QR → "{자기 학교명} 시약장 QR이 아니에요" 토스트 한 번(계속 비춰도) · 결과 0 · 주소 ${SCAN} / 다른 origin QR · 시약장 QR 아닌 글자 → "${NOT_QR}" 한 번`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const b = await schoolBView(browser, info);
  expect(b.cabs.length, "대조: 학교 B 시약장 ≥ 1").toBeGreaterThan(0);
  const { context, page } = await openScan(browser, info, "teacher");
  try {
    await waitScan(page);
    await waitCameraLive(page);
    const me = await browserSession(page);
    const origin = new URL(page.url()).origin;
    const ownId = (await ownCabinets(page))[0].id;
    await watchSheets(page);
    const cases: { qr: string; text: string; what: string }[] = [
      { qr: cabinetQr(origin, b.cabs[0].id), text: notOursText(me.schoolName), what: "학교 B 시약장 QR" },
      { qr: cabinetQr("https://example.com", ownId), text: NOT_QR, what: "다른 origin QR" },
      { qr: "LAB-STOCK hello", text: NOT_QR, what: "시약장 QR 아닌 글자" },
    ];
    for (const c of cases) {
      await showQr(page, null);
      await expect(toasts(page), `${c.what}: 앞 토스트가 사라질 때까지`).toHaveCount(0, { timeout: 15_000 });
      await watchToasts(page);
      await showQr(page, c.qr);
      await expect(toasts(page).filter({ hasText: c.text }), `${c.what}: 토스트 "${c.text}"`).toHaveCount(1, { timeout: 20_000 });
      await expect(toasts(page).first(), `${c.what}: 토스트 글자 그대로`).toHaveText(c.text);
      await page.waitForTimeout(HOLD_MS);
      expect(await toastAdds(page), `${c.what}: 계속 비춰도 토스트 한 번`).toEqual([c.text]);
      await expect(sheet(page), `${c.what}: 결과 0`).toHaveCount(0);
      expect(`${new URL(page.url()).pathname}${new URL(page.url()).search}`, `${c.what}: 주소 ${SCAN}`).toBe(SCAN);
    }
    expect(await sheetAdds(page), "시트 0번").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학생: 카메라 권한 거부 → camera-preview 자리에 "${UNAVAILABLE}" + button-outline "번호로 찾기" → 누르면 번호 입력(포커스) · 390 플래시 비활성`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openScan(browser, info, "student", SCAN, "deny");
  try {
    await waitScan(page);
    await expect.poll(() => gumCalls(page), { message: "getUserMedia 요청됨" }).toBeGreaterThan(0);
    const scan = page.locator(sel(QR_SCAN));
    const box = scan.locator('[data-name="camera-unavailable"]');
    await expect(box, "안내 1").toHaveCount(1, { timeout: 20_000 });
    await expect(box, "안내 글자").toContainText(UNAVAILABLE);
    await expect(scan.locator('[data-name="camera-preview"]'), "camera-preview 0 (그 자리에 안내)").toHaveCount(0);
    await expect(scan.locator("video"), "video 0").toHaveCount(0);
    const btn = box.locator(sel(OUTLINE));
    await expect(btn, "button-outline 1").toHaveCount(1);
    await expect(btn, `button-outline "${MODES.manual}"`).toHaveText(MODES.manual);
    if (viewport === "mobile") await expect(scan.locator(sel(PILL_SOFT)), "플래시 비활성").toBeDisabled();
    await btn.click();
    await expect(manualInput(page), "번호 입력 보임").toBeVisible();
    await expect(manualInput(page), "번호 입력 포커스").toBeFocused();
    if (viewport === "mobile") {
      await expect(page.locator(sel("segmented-control-active")), `segmented 활성 = "${MODES.manual}"`).toHaveText(MODES.manual);
      await expect(page.locator(sel(QR_SCAN)), "번호로 찾기 탭: qr-scan 0").toHaveCount(0);
    }
    await expect(page.locator(`${sel(MANUAL)}:has(input)`), "번호 카드 1").toHaveCount(1);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 교사 390: "${MODES.manual}" 로 바꾸면 카메라 끔(트랙 끝남) · "${MODES.scan}" 로 돌아오면 다시 켬 / 1440: 화면을 떠나면 카메라 끔`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openScan(browser, info, "teacher");
  try {
    await waitScan(page);
    await waitCameraLive(page);
    expect(await liveTracks(page), "켜짐: 트랙 1").toBe(1);
    if (viewport === "mobile") {
      const seg = page.locator(sel(SEGMENT));
      await seg.getByRole("tab", { name: MODES.manual, exact: true }).click();
      await expect.poll(() => liveTracks(page), { message: "번호로 찾기 = 카메라 끔" }).toBe(0);
      await seg.getByRole("tab", { name: MODES.scan, exact: true }).click();
      await waitCameraLive(page);
      await expect.poll(() => liveTracks(page), { message: "QR 스캔으로 돌아옴 = 카메라 켬" }).toBe(1);
      return;
    }
    const home = page.locator(`${sel("app-sidebar")} a${sel("sidebar-item")}[href="/"]`);
    await home.click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
    await expect.poll(() => liveTracks(page), { message: "화면을 떠남 = 카메라 끔" }).toBe(0);
  } finally {
    await context.close();
  }
});
