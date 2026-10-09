// 화면 13 (홈) 재고 부족 표시가 DB 와 일치하는지 (C1 — badge-low-stock 은 dev-rules components 상 화면 13 컴포넌트).
// DB 값은 그 계정의 브라우저 세션(publishable 키 + RLS)으로 읽는다. service role 미사용.
//  - 재고 부족 = stock < min_stock 인 자기 학교 시약 (N종)
//  - N > 0: home-summary 안 badge-low-stock 표시·그 숫자 = N, 부족 시약명 모두 표시, 부족 아닌 시약명 미표시
//  - N = 0: 화면 전체 badge-low-stock 0개
//  - 화면에 reorder-alert-card 가 있으면 그 카드의 수 = N, 카드 안 badge-low-stock 은 N>0 일 때만
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserClient, browserSession, countComponent, sel } from "./screen-helpers";
import { isDeskPage, newFrame, waitWidthSettled } from "./desk-helpers";

const SCREEN = 13;
const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];
const BADGE = "badge-low-stock";
const squashText = (t: string) => t.replace(/\s+/g, " ").trim();
/**
 * 1440 = 새 프레임 13-desktop (run c): "지금 처리할 것" 의 재고 부족 타일(home-summary — 큰 숫자 display + badge-low-stock "재고 부족")과
 * 위젯 "재고 부족"(home-summary — stock-chips 에 시약명). 숫자 N 은 타일 숫자, 시약명은 위젯 칩.
 */
const DESK_TILE_CAPTION = newFrame("13-desktop").find((n) => n.name === "caption" && n.path.includes("tile-row") && n.path.includes("home-summary"))!.text!.characters;
const DESK_BADGE_LABEL = newFrame("13-desktop").find((n) => n.name === "label" && n.path.includes("tile-row") && n.path.includes(BADGE))!.text!.characters;

for (const role of ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 홈: 재고 부족(stock<min_stock) 수·시약명과 ${BADGE} 표시가 DB 와 일치`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await expect(page.locator(sel("home-summary")).first()).toBeAttached({ timeout: 30_000 });
      await page.waitForLoadState("load");
      await waitWidthSettled(page);
      const desk = isDeskPage(page);
      // 390: 첫 home-summary(재고 부족 요약) / 1440: 위젯 열 첫 home-summary = 재고 부족 위젯 (새 프레임 13-desktop widget-column)
      const summary = desk
        ? page.locator(`main [data-name="widget-column"] > ${sel("home-summary")}`).first()
        : page.locator(sel("home-summary")).first();
      const tile = page.locator(`main [data-name="tile-row"] > ${sel("home-summary")}`).first();
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);

      const { client } = await browserClient(page);
      const { data, error } = await client.from("reagents").select("name, stock, min_stock");
      expect(error, "자기 학교 reagents 조회").toBeNull();
      const rows = (data ?? []).map((r) => ({ name: r.name as string, stock: Number(r.stock), min_stock: Number(r.min_stock) }));
      expect(rows.length, "자기 학교 시약이 있어야 검사가 의미 있음 (seed.sql)").toBeGreaterThan(0);
      const low = rows.filter((r) => r.stock < r.min_stock).map((r) => r.name);
      const ok = rows.filter((r) => !(r.stock < r.min_stock)).map((r) => r.name);
      const N = low.length;

      const summaryText = await summary.innerText();
      const summaryBadges = summary.locator(sel(BADGE));
      if (N > 0 && desk) {
        // 새 프레임 13-desktop: 타일 caption "재고 부족" · 숫자 N · 배지 "재고 부족" / 위젯 칩에 부족 시약명
        await expect(summary, "1440 재고 부족 위젯 1").toHaveCount(1);
        await expect(tile, "1440 재고 부족 타일").toBeVisible();
        expect(squashText(await tile.innerText()).startsWith(DESK_TILE_CAPTION), `타일 caption "${DESK_TILE_CAPTION}"`).toBe(true);
        const nums = (await tile.locator('[data-name="tile-value"]').innerText()).match(/\d+/g) ?? [];
        expect(nums, `타일 숫자 = ${N}`).toEqual([String(N)]);
        await expect(tile.locator(sel(BADGE)), `타일 ${BADGE} 1`).toHaveCount(1);
        await expect(tile.locator(sel(BADGE))).toHaveText(DESK_BADGE_LABEL);
        for (const n of low) expect(summaryText, `부족 시약 ${n} 표시 (위젯 칩)`).toContain(n);
      } else if (N > 0) {
        expect(await summaryBadges.count(), `home-summary 안 ${BADGE} (부족 ${N}종)`).toBeGreaterThanOrEqual(1);
        await expect(summaryBadges.first()).toBeVisible();
        const badgeTexts = (await summaryBadges.allInnerTexts()).map((t) => t.trim());
        expect(
          badgeTexts.some((t) => (t.match(/\d+/g) ?? ([] as string[])).includes(String(N))),
          `${BADGE} 표시 숫자 = ${N} (보임: ${badgeTexts.join(", ")})`,
        ).toBe(true);
        for (const n of low) expect(summaryText, `부족 시약 ${n} 표시`).toContain(n);
      } else {
        expect(await countComponent(page, BADGE), `부족 0종이면 ${BADGE} 0개`).toBe(0);
      }
      for (const n of ok) {
        if (low.some((l) => l.includes(n))) continue; // 부족 시약명의 부분 문자열이면 판정 불가
        expect(summaryText, `부족 아닌 시약 ${n} 은 재고 부족 요약에 없음`).not.toContain(n);
      }

      const cards = page.locator(sel("reorder-alert-card"));
      const nCards = await cards.count();
      for (let i = 0; i < nCards; i++) {
        const card = cards.nth(i);
        const nums: string[] = (await card.innerText()).match(/\d+/g) ?? [];
        expect(nums, `reorder-alert-card 의 수 = ${N}`).toContain(String(N));
        expect(await card.locator(sel(BADGE)).count(), `reorder-alert-card 안 ${BADGE}`).toBe(N > 0 ? 1 : 0);
      }
    } finally {
      await context.close();
    }
  });
}
