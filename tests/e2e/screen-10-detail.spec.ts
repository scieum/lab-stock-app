// 화면 10 (사용 기록 내역) 기록 상세 C1 — 행을 누르면 ex-modal-card
// 기준: harness/d7-data.md §7 (상세 = 시약명 + 사용량, 사용자 · 메모(없으면 "-"), msds-entry "MSDS 보기"(msds_url 이 있으면 화면 16 — 2026-10-08 d7 §22), "닫기"),
//       §15 (2026-10-07: "일시" → 사용일 · 기록한 날 — design/frames/10-desktop.json ex-modal-card),
//       디자인 s2-spec "## 화면 10" (누른 행 배경 #e6f4fc, 상세 = ex-modal-card), 시안 10 프레임.
// 메모가 있는 기록·없는 기록이 모두 필요하므로 UI 전용 고정 시약(학교 A, `R-db-UI10-fixture-{project}`)의 기록을 쓴다.
// 고정 기록이 최근 목록에 없을 때만 교사 세션으로 record_usage 2건(메모 있음·없음, 각 1 mL)을 만들고 stock 을 되돌린다.
// 같은 고정 시약을 쓰는 테스트끼리 겹치지 않도록 이 파일은 한 워커에서 순서대로 돈다.
import { test, expect, type Browser, type TestInfo } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserSession, routeOf, sel } from "./screen-helpers";
import { seedSchoolOf } from "./screen-3-helpers";
import {
  CLOSE_LABEL,
  MEMO_NONE,
  MODAL,
  MSDS,
  MSDS_LABEL,
  PRESSED_ROW_BG,
  ROW,
  SCREEN,
  closeButton,
  ensureFixtureLogs,
  expectDetail,
  gotoAndMatch,
  modal,
  openRow,
  readDetail,
  rows,
  waitHistory,
  type FixtureReagent,
} from "./screen-10-helpers";

test.describe.configure({ mode: "default" });

/** 교사 세션으로 고정 시약·고정 기록 준비 (학교 A 인지 확인한 뒤에만 쓴다) */
async function prepare(browser: Browser, info: TestInfo): Promise<FixtureReagent> {
  const t = await openAs(browser, info, "teacher", SCREEN);
  try {
    await waitHistory(t.page);
    const me = await browserSession(t.page);
    expect(me.role, "준비용 계정 역할").toBe(PROFILE_ROLE.teacher);
    expect(me.schoolName, "쓰기는 테스트 학교 A 에서만").toBe(seedSchoolOf("teacher").name);
    return await ensureFixtureLogs(t.page, info);
  } finally {
    await t.context.close();
  }
}

for (const role of SCHOOL_A_ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 행을 누르면 ${MODAL} 1개: 시약명 · 사용량+단위 · 사용자 · 사용일(YYYY-MM-DD) · 기록한 날(YYYY-MM-DD HH:mm) · 메모 = DB · ${MSDS} "${MSDS_LABEL}"(화면 16 /msds/{id}?from=usage, 같은 창 — d7 §22) · button-outline "${CLOSE_LABEL}" · 누른 행 배경 · 메모 없는 기록은 "${MEMO_NONE}" · 다른 행을 누르면 교체`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const fx = await prepare(browser, info);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN);
    try {
      await waitHistory(page);
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const snap = await gotoAndMatch(page, { q: fx.name });
      const withMemo = snap.shown.findIndex((r) => r.reagent_id === fx.id && r.memo !== null);
      const noMemo = snap.shown.findIndex((r) => r.reagent_id === fx.id && r.memo === null);
      expect(withMemo, "고정 시약의 메모 있는 기록이 목록에").toBeGreaterThanOrEqual(0);
      expect(noMemo, "고정 시약의 메모 없는 기록이 목록에").toBeGreaterThanOrEqual(0);
      await expect(modal(page), "누르기 전 상세 없음").toHaveCount(0);

      // 메모 있는 기록
      const a = snap.shown[withMemo];
      const rowA = await openRow(page, withMemo);
      await expectDetail(page, a);
      const d = await readDetail(page);
      expect(d.fields["메모"], "메모 그대로 표시").toBe(a.memo);
      expect(d.fields["메모"]).not.toBe(MEMO_NONE);
      // 상세는 화면 안에 보인다
      const vp = page.viewportSize()!;
      const mb = (await modal(page).boundingBox())!;
      expect(mb.y, "상세가 화면 안 (위)").toBeGreaterThanOrEqual(0);
      expect(mb.y + mb.height, "상세가 화면 안 (아래)").toBeLessThanOrEqual(vp.height + 0.5);
      await expect(modal(page).getByText(a.memo!), "메모 글자 보임").toBeVisible();
      // 누른 행 배경 (s2-spec: #e6f4fc), 다른 행은 아님
      await expect.poll(() => rowA.evaluate((el) => getComputedStyle(el).backgroundColor), { message: "누른 행 배경 #e6f4fc" }).toBe(PRESSED_ROW_BG);
      const rowB = rows(page).nth(noMemo);
      expect(await rowB.evaluate((el) => getComputedStyle(el).backgroundColor), "누르지 않은 행 배경").not.toBe(PRESSED_ROW_BG);
      // MSDS 보기: 시약에 msds_url 이 있으면 화면 16(MSDS 요약)으로 — 바깥 링크로 바로 가지 않는다, 뒤로 = 화면 10 (d7 §22 · rules 1.21 msds_summary.entry)
      expect(a.msds_url, "고정 시약은 MSDS 주소가 있음").toBe(fx.msds_url);
      const link = modal(page).locator(`${sel(MSDS)} a`);
      await expect(link, "MSDS 링크 1개").toHaveCount(1);
      await expect(link).toHaveText(new RegExp(MSDS_LABEL));
      await expect(link, "화면 16 주소 (?from=usage)").toHaveAttribute("href", `${routeOf(16).replace(/\[[^\]]+\]/, fx.id)}?from=usage`);
      expect(await link.getAttribute("href"), "바깥 MSDS 주소로 바로 가지 않는다").not.toBe(fx.msds_url);
      expect(await link.getAttribute("target"), "같은 창 (target 없음)").toBeNull();
      expect((await link.boundingBox())!.height, "MSDS 보기 높이 ≥ 44").toBeGreaterThanOrEqual(44);
      expect((await closeButton(page).boundingBox())!.height, "닫기 높이 ≥ 44").toBeGreaterThanOrEqual(44);

      // 상세가 열린 채 다른 행(메모 없음)을 누르면 그 기록으로 바뀐다 (상세는 하나)
      const b = snap.shown[noMemo];
      await rowB.scrollIntoViewIfNeeded();
      await rowB.click();
      await expectDetail(page, b);
      expect((await readDetail(page)).fields["메모"], `메모 없는 기록은 "${MEMO_NONE}"`).toBe(MEMO_NONE);
      await expect(modal(page), `${MODAL} 는 하나`).toHaveCount(1);
      await expect.poll(() => rowB.evaluate((el) => getComputedStyle(el).backgroundColor), { message: "새로 누른 행 배경" }).toBe(PRESSED_ROW_BG);
      await expect.poll(() => rowA.evaluate((el) => getComputedStyle(el).backgroundColor), { message: "앞서 누른 행 배경 해제" }).not.toBe(PRESSED_ROW_BG);
      // 목록은 그대로
      await expect(rows(page), "상세를 열어도 목록 행 수 그대로").toHaveCount(snap.flat.length);
      if (viewport === "desktop") {
        const rb = (await rowB.boundingBox())!;
        const m2 = (await modal(page).boundingBox())!;
        expect(m2.x, "데스크탑 상세는 목록 옆").toBeGreaterThanOrEqual(rb.x + rb.width - 0.5);
      }
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S${SCREEN}] 학교A 학생 상세 닫기: "${CLOSE_LABEL}" · Esc 로 닫히고(${MODAL} 0 · 누른 행 배경 해제) 포커스가 누른 행으로 돌아온다 · 다시 열 수 있다`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const fx = await prepare(browser, info);
  const { context, page } = await openAs(browser, info, "student", SCREEN);
  try {
    await waitHistory(page);
    const snap = await gotoAndMatch(page, { q: fx.name });
    expect(snap.flat.length, "행 ≥ 2").toBeGreaterThanOrEqual(2);

    const closedState = async (row: ReturnType<typeof rows>, how: string) => {
      await expect(modal(page), `${how}: ${MODAL} 0`).toHaveCount(0);
      await expect(page.locator(sel(MSDS)), `${how}: 상세가 닫히면 ${MSDS} 도 없다`).toHaveCount(0);
      await expect(row, `${how}: 포커스가 누른 행으로`).toBeFocused();
      await expect.poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor), { message: `${how}: 누른 행 배경 해제` }).not.toBe(PRESSED_ROW_BG);
      await expect(rows(page), `${how}: 목록 그대로`).toHaveCount(snap.flat.length);
    };

    // 닫기 버튼
    const row0 = await openRow(page, 0);
    await expectDetail(page, snap.shown[0]);
    await closeButton(page).click();
    await closedState(row0, "닫기 버튼");

    // Esc
    const row1 = await openRow(page, 1);
    await expectDetail(page, snap.shown[1]);
    await page.keyboard.press("Escape");
    await closedState(row1, "Esc");

    // 키보드로 열고(Enter) Esc 로 닫기 — 행은 키보드로 누를 수 있다
    await row0.focus();
    await page.keyboard.press("Enter");
    await expectDetail(page, snap.shown[0]);
    await page.keyboard.press("Escape");
    await closedState(row0, "키보드 Enter → Esc");

    // 닫은 뒤 다시 열린다
    await openRow(page, 1);
    await expectDetail(page, snap.shown[1]);
    // 행은 ex-data-table-cell
    expect(await rows(page).nth(1).getAttribute("data-component")).toBe(ROW);
  } finally {
    await context.close();
  }
});
