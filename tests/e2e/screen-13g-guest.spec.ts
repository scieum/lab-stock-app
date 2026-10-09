// 화면 13g (둘러보기 홈, dev-rules.json routes["13-guest"]) — 비로그인 컨텍스트.
// 규칙: GM-ui (d5 §GM, rules.json guest) · C1 (screens_required[13], 데모 데이터 일치) · C2 (탭바, GM-ui 안에 포함) · N1-ui · V1
// 기대값은 design/rules.json · harness/dev-rules.json · harness/d7-data.md 에서 읽는다. 데이터는 anon 클라이언트(RLS).
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { anonClient } from "./db-helpers";
import { openAs } from "./auth-state";
import { isDeskPage } from "./desk-helpers";
import { countComponent, devRules, implementedGuestScreens, routeOf, rules, seedRows, sel } from "./screen-helpers";
import {
  GUEST,
  checkBanner,
  checkHidden,
  checkLocksAreButtons,
  checkSchoolName,
  checkTabBar,
  clickAllLocks,
  demoReagents,
  demoSchool,
  guestDetailPath,
  guestRouteOf,
  openGuest,
  waitGuestShell,
} from "./guest-helpers";

const SCREEN = 13;
const TAG = `S${SCREEN}g`;
const BADGE = "badge-low-stock";

async function waitHome(page: Page): Promise<void> {
  await waitGuestShell(page);
  await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
}

test(`[GM-ui][${TAG}] rules.json guest.screens 에 화면 ${SCREEN} · dev-rules guest_screens = guest.screens 중 구현된(mvp_screens) 화면 · routes ${SCREEN}-guest 있음`, () => {
  expect(GUEST.screens, "guest.screens").toContain(SCREEN);
  // 빠진 화면(지금 16 MSDS 요약)은 다음 run(화면 16)에서 — mvp_screens 에 들어오면 자동으로 다시 요구된다
  const { screens } = implementedGuestScreens();
  expect([...devRules.guest_screens].sort(), "dev-rules guest_screens = rules guest.screens ∩ mvp_screens").toEqual([...screens].sort());
  expect(guestRouteOf(SCREEN)).toBeTruthy();
  expect(GUEST.write_lock_screens, `화면 ${SCREEN} 은 쓰기 잠금 대상`).toContain(SCREEN);
});

// ---------- GM-ui ----------
test(`[GM-ui][${TAG}] 둘러보기 홈: guest-banner 1(가입 → 회원가입 경로) · hidden_components 0 · 학교명 = guest.school_name 만`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, response } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    expect(response?.status(), "응답 200").toBe(200);
    await waitHome(page);
    await checkBanner(page);
    await checkHidden(page);
    await checkSchoolName(page, await response!.text());
  } finally {
    await context.close();
  }
});

test(`[GM-ui][C2][${TAG}] 둘러보기 홈 탭바 = rules.json tab_bar + guest (390: 1·${rules.tab_bar.items}개·라벨 순서·잠금 ${GUEST.tab_locks}=${GUEST.locked_tabs.join("·")}, 1440: 0)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitHome(page);
    await checkTabBar(page, viewport, SCREEN);
  } finally {
    await context.close();
  }
});

test(`[GM-ui][${TAG}] 둘러보기 홈 쓰기 잠금: 본문 guest-lock ≥1 · 보이는 잠금 전부 클릭 → ex-toast · 경로 유지 · non-GET 요청 0`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitHome(page);
    expect(await page.locator(`main ${sel(GUEST.lock)}`).count(), `본문(main) 안 ${GUEST.lock} ≥1 (write_lock_screens)`).toBeGreaterThanOrEqual(1);
    await expect(page.locator(`main ${sel(GUEST.lock)}`).first()).toBeVisible();
    // 빠른 실행(quick-action) 칸은 둘러보기에서 전부 잠금 (쓰기·범위 밖 진입점) — 링크 0
    const quick = page.locator(sel("quick-action")).first();
    expect(await quick.locator("a").count(), "quick-action 안 링크 0 (전부 잠금)").toBe(0);
    expect(await quick.locator(sel(GUEST.lock)).count(), `quick-action 안 ${GUEST.lock} ≥1`).toBeGreaterThanOrEqual(1);
    await checkLocksAreButtons(page);
    const clicked = await clickAllLocks(page);
    expect(clicked, "클릭한 잠금 호스트").toBeGreaterThanOrEqual(1);
    // 토스트 뒤에도 둘러보기 셸 그대로
    await expect(page.locator(sel(GUEST.banner))).toHaveCount(1);
  } finally {
    await context.close();
  }
});

// ---------- C1 ----------
test(`[C1][${TAG}] 둘러보기 홈: rules.json screens_required[${SCREEN}] 컴포넌트 모두 표시`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const raw = rules.screens_required[String(SCREEN)];
  expect(Array.isArray(raw), `rules.json screens_required["${SCREEN}"] 가 목록`).toBe(true);
  const required = raw as string[];
  expect(required.length).toBeGreaterThan(0);
  const { context, page } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitHome(page);
    for (const name of required) {
      expect(await countComponent(page, name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
      await expect(page.locator(sel(name)).first(), `${name} 보임`).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test(`[C1][${TAG}] 둘러보기 홈: 재고 부족 수·시약명·${BADGE}·전체 시약 수·최근 사용 기록이 anon 데모 데이터와 일치`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const rows = await demoReagents();
  const low = rows.filter((r) => r.low);
  const ok = rows.filter((r) => !r.low);
  const N = low.length;
  expect(N, "데모 학교에 재고 부족 시약이 있어야 함 (d7 §5: 1~2종)").toBeGreaterThan(0);
  const recent = await anonClient().rpc("demo_recent_usage", { p_limit: 3 });
  expect(recent.error, `demo_recent_usage: ${recent.error?.message}`).toBeNull();
  const recentRows = (recent.data ?? []) as { reagent_name: string; user_name: string }[];

  const { context, page } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitHome(page);
    // 1440 = 새 프레임 13-guest-desktop · 13-desktop 본문(데스크톱 재구성 run c): 숫자 N 은 "지금 처리할 것" 재고 부족 타일(큰 숫자 + 배지 "재고 부족"),
    // 시약명은 재고 부족 위젯 칩, 최근 사용 기록은 data-table 행. 390 = 지금 그대로 (첫 home-summary 배지에 숫자)
    const desk = isDeskPage(page);
    const summary = desk
      ? page.locator(`main [data-name="widget-column"] > ${sel("home-summary")}`).first()
      : page.locator(sel("home-summary")).first();
    const summaryText = await summary.innerText();
    if (desk) {
      const tile = page.locator(`main [data-name="tile-row"] > ${sel("home-summary")}`).first();
      await expect(tile.locator(sel(BADGE)), `재고 부족 타일 ${BADGE}`).toHaveCount(1);
      const nums = (await tile.locator('[data-name="tile-value"]').innerText()).match(/\d+/g) ?? [];
      expect(nums, `재고 부족 타일 숫자 = ${N}`).toEqual([String(N)]);
    } else {
      const badges = summary.locator(sel(BADGE));
      expect(await badges.count(), `home-summary 안 ${BADGE} (부족 ${N}종)`).toBeGreaterThanOrEqual(1);
      await expect(badges.first()).toBeVisible();
      const badgeTexts = (await badges.allInnerTexts()).map((t) => t.trim());
      expect(
        badgeTexts.some((t) => (t.match(/\d+/g) ?? ([] as string[])).includes(String(N))),
        `${BADGE} 표시 숫자 = ${N} (보임: ${badgeTexts.join(", ")})`,
      ).toBe(true);
    }
    for (const r of low) expect(summaryText, `부족 시약 ${r.name} 표시`).toContain(r.name);
    for (const r of ok) {
      if (low.some((l) => l.name.includes(r.name))) continue;
      expect(summaryText, `부족 아닌 ${r.name} 은 요약에 없음`).not.toContain(r.name);
    }
    expect(summaryText.replace(/\s+/g, ""), `전체 시약 ${rows.length}종`).toContain(`${rows.length}종`);
    // 부족 시약 링크는 둘러보기 상세 경로
    for (const r of low) {
      const link = summary.locator(`a[href]`, { hasText: r.name }).first();
      await expect(link, `부족 시약 ${r.name} 링크`).toHaveCount(1);
      expect(new URL((await link.getAttribute("href"))!, "http://x").pathname).toBe(guestDetailPath(r.id));
    }
    // 최근 사용 기록 = demo_recent_usage (reagent-row 는 이 화면에서 최근 기록에만)
    const recentList = desk ? page.locator(`main [data-name="recent-usage-widget"] ${sel("ex-data-table-cell")}`) : page.locator(sel("reagent-row"));
    await expect(recentList, "최근 사용 기록 행 수 = demo_recent_usage").toHaveCount(recentRows.length);
    const shown = (await recentList.allInnerTexts()).join("\n");
    for (const u of recentRows) {
      expect(shown, `최근 기록 시약명 ${u.reagent_name}`).toContain(u.reagent_name);
      expect(shown, `최근 기록 사용자 ${u.user_name}`).toContain(u.user_name);
    }
  } finally {
    await context.close();
  }
});

// ---------- N1-ui ----------
test(`[N1-ui][${TAG}] 로그인 학생이 ${guestRouteOf(SCREEN)} 에 오면 routes["${SCREEN}"] 로 보내고 둘러보기 배너 없음`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "student", SCREEN, guestRouteOf(SCREEN));
  try {
    await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname, "로그인 사용자 → 홈 경로").toBe(routeOf(SCREEN));
    expect(await countComponent(page, GUEST.banner), `로그인 홈에 ${GUEST.banner} 0`).toBe(0);
    expect(await countComponent(page, GUEST.lock), `로그인 홈에 ${GUEST.lock} 0`).toBe(0);
    const body = await page.locator("body").innerText();
    expect(body, "로그인 홈에 데모 학교명 없음").not.toContain(GUEST.school_name);
  } finally {
    await context.close();
  }
});

test(`[N1-ui][${TAG}] 둘러보기 홈에 실제 학교 시약명(seed) 미노출 · 데모 학교명만`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const demo = await demoSchool();
  const demoNames = (await demoReagents()).map((r) => r.name);
  const realReagents = seedRows("reagents").map((r) => r.name);
  expect(realReagents.length, "seed 실제 학교 시약").toBeGreaterThan(0);
  const { context, page, response } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitHome(page);
    const body = await page.locator("body").innerText();
    const html = await response!.text();
    expect(body, "데모 학교명 표시").toContain(demo.name);
    for (const n of realReagents) {
      if (demoNames.some((d) => d.includes(n))) continue; // 데모 시약명의 부분 문자열이면 판정 불가
      expect(body, `실제 학교 시약명 ${n} (화면)`).not.toContain(n);
      expect(html, `실제 학교 시약명 ${n} (응답 본문)`).not.toContain(n);
    }
  } finally {
    await context.close();
  }
});

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][${TAG}] 화면 ${SCREEN}g 스크린샷 저장`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openGuest(browser, info, guestRouteOf(SCREEN));
  try {
    await waitHome(page).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}g-${viewport}.png`), fullPage: true });
  } finally {
    await context.close();
  }
});
