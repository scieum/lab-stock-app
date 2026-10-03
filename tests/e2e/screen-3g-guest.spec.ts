// 화면 3g (둘러보기 시약 상세, dev-rules.json routes["3-guest"]) — 비로그인 컨텍스트.
// 규칙: GM-ui (d5 §GM, rules.json guest) · C1 (상세 값 = anon 데모 데이터, msds-entry ≥ R4 min_per_role, 사용 기록 버튼 = guest-lock)
//       · C2 · N1-ui (실제 학교 시약 id·없는 id → 같은 404, 시약명 미노출) · V1
// 기대값은 design/rules.json · harness/dev-rules.json 에서 읽는다. 데이터는 anon 클라이언트(RLS).
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { anonClient, signIn } from "./db-helpers";
import { openAs } from "./auth-state";
import { countComponent, routeOf, rules, seedRows, sel } from "./screen-helpers";
import { seedReagents, seedSchoolOf, textAcrossTabs } from "./screen-3-helpers";
import {
  GUEST,
  checkBanner,
  checkHidden,
  checkLocksAreButtons,
  checkSchoolName,
  checkTabBar,
  clickAllLocks,
  demoDetail,
  demoReagents,
  demoSchool,
  guestDetailPath,
  guestRouteOf,
  openGuest,
  squash,
  waitGuestShell,
} from "./guest-helpers";

const SCREEN = 3;
const TAG = `S${SCREEN}g`;
const BADGE = "badge-low-stock";
const CARD = "reagent-detail-card";
const MSDS = rules.roles.R4.component!;

async function waitDetail(page: Page): Promise<void> {
  await waitGuestShell(page);
  await expect(page.locator(sel(CARD)).first()).toBeVisible({ timeout: 30_000 });
}

/** 데모 시약 중 재고 부족 1건 · 충분 1건 (둘 다 있어야 배지 있음·없음을 실제로 검사) */
async function picks() {
  const all = await demoReagents();
  const low = all.find((r) => r.low);
  const ok = all.find((r) => !r.low);
  expect(low, "데모 학교에 재고 부족 시약").toBeTruthy();
  expect(ok, "데모 학교에 재고 충분 시약").toBeTruthy();
  return { all, low: low!, ok: ok! };
}

async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

test(`[GM-ui][${TAG}] rules.json guest.screens 에 화면 ${SCREEN} · routes ${SCREEN}-guest 있음 · 쓰기 잠금 대상(write_lock_screens)`, () => {
  expect(GUEST.screens, "guest.screens").toContain(SCREEN);
  expect(guestRouteOf(SCREEN), "routes 3-guest 에 [id]").toMatch(/\[[^\]]+\]/);
  expect(GUEST.write_lock_screens, `화면 ${SCREEN} 은 쓰기 잠금 대상`).toContain(SCREEN);
});

// ---------- GM-ui ----------
test(`[GM-ui][${TAG}] 둘러보기 시약 상세: guest-banner 1(가입 → 회원가입 경로) · hidden_components 0 · 학교명 = guest.school_name 만`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { low } = await picks();
  const { context, page, response } = await openGuest(browser, info, guestDetailPath(low.id));
  try {
    expect(response?.status(), "응답 200").toBe(200);
    await waitDetail(page);
    await checkBanner(page);
    await checkHidden(page);
    await checkSchoolName(page, await response!.text());
  } finally {
    await context.close();
  }
});

test(`[GM-ui][C2][${TAG}] 둘러보기 시약 상세 탭바 = rules.json tab_bar + guest (390: 1·${rules.tab_bar.items}개·라벨 순서·잠금 ${GUEST.tab_locks}=${GUEST.locked_tabs.join("·")}, 1440: 0)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { low } = await picks();
  const { context, page, viewport } = await openGuest(browser, info, guestDetailPath(low.id));
  try {
    await waitDetail(page);
    await checkTabBar(page, viewport, SCREEN);
  } finally {
    await context.close();
  }
});

test(`[GM-ui][${TAG}] 둘러보기 시약 상세 쓰기 잠금: 본문 guest-lock ≥1 · 사용 기록 버튼은 잠금(링크 아님) · 보이는 잠금 전부 클릭 → ex-toast · 경로 유지 · non-GET 요청 0 · 재고 불변`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { low } = await picks();
  const before = await demoDetail(low.id);
  const { context, page } = await openGuest(browser, info, guestDetailPath(low.id));
  try {
    await waitDetail(page);
    const mainLocks = page.locator(`main ${sel(GUEST.lock)}`);
    expect(await mainLocks.count(), `본문(main) 안 ${GUEST.lock} ≥1 (write_lock_screens)`).toBeGreaterThanOrEqual(1);
    await expect(mainLocks.first()).toBeVisible();
    // 사용 기록(쓰기) 버튼: button-primary 이지만 링크가 아니고 guest-lock 을 품는다. 로그인 화면 4(사용 기록) 경로 링크 0
    const usageBtn = page.locator(`main ${sel("button-primary")}`, { hasText: "사용 기록" });
    await expect(usageBtn, "사용 기록 button-primary 1개").toHaveCount(1);
    await expect(usageBtn).toBeVisible();
    expect(await usageBtn.getAttribute("href"), "사용 기록 버튼은 링크가 아님").toBeNull();
    await expect(usageBtn.locator(sel(GUEST.lock)), `사용 기록 버튼 안 ${GUEST.lock}`).toHaveCount(1);
    expect(await page.locator(`a[href^="${routeOf(4)}"]`).count(), `routes["4"] 링크 0`).toBe(0);
    await checkLocksAreButtons(page);
    const clicked = await clickAllLocks(page);
    expect(clicked, "클릭한 잠금 호스트").toBeGreaterThanOrEqual(1);
    const after = await demoDetail(low.id);
    expect(after, "잠금 클릭 뒤 데모 시약 값 불변").toEqual(before);
  } finally {
    await context.close();
  }
});

// ---------- C1 ----------
for (const kind of ["low", "ok"] as const) {
  test(`[C1][${TAG}] 둘러보기 시약 상세(데모 재고 ${kind === "low" ? "부족" : "충분"} 시약): 이름·CAS·재고·단위·보관 위치·분류·${BADGE} 가 anon 데모 데이터와 일치`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const pick = (await picks())[kind];
    const db = await demoDetail(pick.id);
    expect(db, "anon 으로 데모 시약 1건").not.toBeNull();
    expect(db!.low, "부족/충분 구분").toBe(kind === "low");
    const { context, page } = await openGuest(browser, info, guestDetailPath(pick.id));
    try {
      await waitDetail(page);
      const card = page.locator(sel(CARD));
      await expect(card, `${CARD} 1개`).toHaveCount(1);
      const cardText = await card.innerText();
      expect(cardText, `카드에 시약명 ${db!.name}`).toContain(db!.name);
      expect(squash(cardText), `카드에 재고 ${db!.stock}${db!.unit}`).toContain(squash(`${db!.stock}${db!.unit}`));
      const text = await textAcrossTabs(page);
      expect(db!.cas_no, "데모 시약은 CAS 번호가 있음").toBeTruthy();
      expect(text, `CAS ${db!.cas_no}`).toContain(db!.cas_no!);
      expect(db!.cabinet, "데모 시약은 보관 칸이 지정돼 있음 (d7 §5)").toBeTruthy();
      expect(text, `보관 위치 시약장 ${db!.cabinet}`).toContain(db!.cabinet!);
      const locLine = text.split(/\r?\n/).find((l) => l.includes(db!.cabinet!)) ?? "";
      expect(locLine, `보관 위치 줄에 ${db!.shelf}단`).toMatch(new RegExp(`(^|\\D)${db!.shelf}(\\D|$)`));
      expect(text, `보관 분류 ${db!.storage_class}`).toContain(db!.storage_class!);
      expect(await card.locator(sel(BADGE)).count(), `카드 안 ${BADGE}`).toBe(db!.low ? 1 : 0);
      expect(await countComponent(page, BADGE), `화면 전체 ${BADGE}`).toBe(db!.low ? 1 : 0);
    } finally {
      await context.close();
    }
  });
}

test(`[C1][${TAG}] 둘러보기 시약 상세: 사용 기록 표 = anon demo_reagent_usage (가짜 사용자 이름)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const logs = await anonClient().from("usage_logs").select("reagent_id").order("used_at", { ascending: false });
  expect(logs.error).toBeNull();
  const reagentId = (logs.data ?? [])[0]?.reagent_id as string | undefined;
  expect(reagentId, "사용 기록이 있는 데모 시약").toBeTruthy();
  const usage = await anonClient().rpc("demo_reagent_usage", { p_reagent_id: reagentId, p_limit: 5 });
  expect(usage.error, `demo_reagent_usage: ${usage.error?.message}`).toBeNull();
  const rows = (usage.data ?? []) as { user_name: string; amount: number }[];
  expect(rows.length).toBeGreaterThan(0);
  const { context, page } = await openGuest(browser, info, guestDetailPath(reagentId!));
  try {
    await waitDetail(page);
    const text = await textAcrossTabs(page);
    for (const u of rows) expect(text, `사용자 ${u.user_name}`).toContain(u.user_name);
    const cells = page.locator(sel("ex-data-table-cell"));
    expect(await cells.count(), "사용 기록 표 셀").toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test(`[C1][${TAG}] 둘러보기 시약 상세: ${MSDS} ≥ rules.json R4 min_per_role (비회원에게도 MSDS 진입점)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const r4 = rules.roles.R4;
  expect(r4.min_per_role, "rules.json R4 min_per_role").toBeGreaterThan(0);
  const { low } = await picks();
  const { context, page } = await openGuest(browser, info, guestDetailPath(low.id));
  try {
    await waitDetail(page);
    expect(await countComponent(page, MSDS), `${MSDS} ≥ ${r4.min_per_role}`).toBeGreaterThanOrEqual(r4.min_per_role!);
    await expect(page.locator(sel(MSDS)).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

// ---------- N1-ui ----------
for (const other of ["teacher", "schoolB"] as const) {
  test(`[N1-ui][${TAG}] 둘러보기에서 실제 학교(${other === "teacher" ? "A" : "B"}) 시약 id 직접 접근: 404 · 시약명·학교명 미노출 · 없는 id 와 같은 응답`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const school = seedSchoolOf(other);
    const foreign = seedReagents().filter((r) => r.school_id === school.id);
    expect(foreign.length, "seed 실제 학교 시약").toBeGreaterThan(0);
    const target = foreign[0];
    // 양성 대조: 그 학교 계정(RLS)으로는 실제로 있는 시약 — anon 으로는 0행
    const s = await signIn(other);
    const own = await s.client.from("reagents").select("id").eq("id", target.id);
    expect(own.error).toBeNull();
    expect(own.data ?? [], `${other} 계정으로 ${target.name} 존재`).toHaveLength(1);
    expect(await demoDetail(target.id), "anon 으로 실제 학교 시약 0행").toBeNull();
    const demoNames = (await demoReagents()).map((r) => r.name);

    const { context, page, response } = await openGuest(browser, info, guestDetailPath(target.id));
    try {
      expect(response, "응답").not.toBeNull();
      expect(response!.status(), "실제 학교 시약 id → 404").toBe(404);
      const html = await response!.text();
      const shownForeign = await bodyText(page);
      expect(await countComponent(page, CARD), "시약 카드 없음").toBe(0);
      for (const r of foreign) {
        if (demoNames.some((d) => d.includes(r.name))) continue; // 데모 시약명의 부분 문자열이면 판정 불가
        expect(html, `응답 본문에 실제 학교 시약명 ${r.name}`).not.toContain(r.name);
        expect(shownForeign, `화면에 실제 학교 시약명 ${r.name}`).not.toContain(r.name);
      }
      expect(html, `응답 본문에 실제 학교명 ${school.name}`).not.toContain(school.name);
      // 둘러보기 셸(배너·데모 학교명)은 404 에서도 그대로 — 데모 밖으로 새지 않음
      expect(await countComponent(page, GUEST.banner), `404 화면에도 ${GUEST.banner}`).toBe(1);

      const missingId = randomUUID();
      expect(seedReagents().some((r) => r.id === missingId), "무작위 id 는 seed 에 없음").toBe(false);
      const missRes = await page.goto(guestDetailPath(missingId));
      await page.waitForLoadState("load");
      expect(missRes!.status(), "없는 id 상태 코드 = 실제 학교 id 상태 코드").toBe(response!.status());
      expect(await bodyText(page), "없는 id 화면 글자 = 실제 학교 id 화면 글자").toBe(shownForeign);
    } finally {
      await context.close();
    }
  });
}

test(`[N1-ui][${TAG}] 둘러보기 시약 상세에 실제 학교명(seed)·실제 학교 시약명 미노출 · 데모 학교명만`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const demo = await demoSchool();
  const { low, all } = await picks();
  const demoNames = all.map((r) => r.name);
  const realReagents = seedRows("reagents").map((r) => r.name);
  const { context, page, response } = await openGuest(browser, info, guestDetailPath(low.id));
  try {
    await waitDetail(page);
    const body = await page.locator("body").innerText();
    const html = await response!.text();
    expect(body, "데모 학교명 표시").toContain(demo.name);
    for (const n of realReagents) {
      if (demoNames.some((d) => d.includes(n))) continue;
      expect(body, `실제 학교 시약명 ${n} (화면)`).not.toContain(n);
      expect(html, `실제 학교 시약명 ${n} (응답 본문)`).not.toContain(n);
    }
  } finally {
    await context.close();
  }
});

test(`[N1-ui][${TAG}] 로그인 학생이 ${guestRouteOf(SCREEN)} 에 오면 routes["13"] 로 보내고 둘러보기 배너 없음`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { low } = await picks();
  const { context, page } = await openAs(browser, info, "student", 13, guestDetailPath(low.id));
  try {
    await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname, "로그인 사용자 → 홈 경로").toBe(routeOf(13));
    expect(await countComponent(page, GUEST.banner), `${GUEST.banner} 0`).toBe(0);
    expect(await page.locator("body").innerText(), "데모 시약명 없음").not.toContain(low.name);
  } finally {
    await context.close();
  }
});

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][${TAG}] 화면 ${SCREEN}g 스크린샷 저장 (데모 재고 부족 시약)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { low } = await picks();
  const { context, page, viewport } = await openGuest(browser, info, guestDetailPath(low.id));
  try {
    await waitDetail(page).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}g-${viewport}.png`), fullPage: true });
  } finally {
    await context.close();
  }
});
