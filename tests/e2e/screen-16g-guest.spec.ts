// 화면 16g (둘러보기 MSDS 요약, dev-rules.json routes["16-guest"] · route_auth 16-guest "비로그인 (데모 학교 시약만)") — 비로그인 컨텍스트.
// 기준: harness/d7-data.md §22 "둘러보기"(데모 seed 의 msds_url 이 공단 상세 주소가 아니면 16-no-summary) · design/rules.json guest·tab_bar·variants 16 ·
//       harness/dev-rules.json guest_screens · routes 16-guest.
// [GM-ui][S16g] 데모 시약 /demo/msds/{id} 200 · guest-banner · hidden_components 0 · 학교명 = 데모 학교만 · 쓰기 요청 0 · 탭바(390) · 로그인 사용자 → /
// [C1][S16g]    화면 3g "MSDS 보기" → /demo/msds/{id} (같은 창) · 16-no-summary(원문 보기만, href = 데모 msds_url, 새 창 noopener) · 뒤로 = 3g
// [N1-ui][S16g] 데모가 아닌 시약 id(학교 A·B)·없는 id·형식이 틀린 id → 404 (이름·주소 미노출)
// 데이터 비교는 anon 클라이언트(RLS). 공용 데이터는 읽기만.
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { anonClient, signIn } from "./db-helpers";
import { openAs } from "./auth-state";
import { countComponent, devRules, implementedGuestScreens, routeOf, rules, sel } from "./screen-helpers";
import { GUEST, checkBanner, checkHidden, checkLocksAreButtons, checkSchoolName, checkTabBar, demoSchool, openGuest, waitGuestShell } from "./guest-helpers";
import {
  FRAME,
  GHS,
  ORIGINAL,
  SCREEN,
  SKELETON,
  SUMMARY,
  VARIANTS,
  allowedComponents,
  entryLink,
  expectHeader,
  expectNoN2,
  expectOriginal,
  foreignOnPage,
  guestMsdsPath,
  guestReagentPath,
  koshaUrl,
  originalLink,
  redPaint,
  visibleText,
  waitMsds,
} from "./screen-16-helpers";

const TAG = `S${SCREEN}g`;

type DemoMsds = { id: string; name: string; msds_url: string | null };

/** anon 으로 데모 시약 (msds_url 포함) — RLS 로 데모 학교 행만 */
async function demoMsds(): Promise<DemoMsds[]> {
  const school = await demoSchool();
  const { data, error } = await anonClient().from("reagents").select("id, school_id, name, msds_url").order("name");
  expect(error, "anon reagents 조회").toBeNull();
  const rows = data ?? [];
  expect(rows.filter((r) => r.school_id !== school.id), "anon 은 데모 학교 행만").toHaveLength(0);
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, msds_url: (r.msds_url as string | null) ?? null }));
}

async function pick(): Promise<DemoMsds> {
  const all = await demoMsds();
  const withMsds = all.filter((r) => r.msds_url);
  expect(withMsds.length, "MSDS 주소가 있는 데모 시약").toBeGreaterThan(0);
  // 이름이 가장 긴 시약 (제목 줄 배치를 가장 빡빡하게 본다)
  return [...withMsds].sort((a, b) => b.name.length - a.name.length)[0];
}

/** 데모 seed 의 msds_url 이 공단 상세 주소면 서버가 실제 공단을 부른다 — 이 테스트는 공단 주소가 아닌 시약으로만 연다 (d7 §22 둘러보기) */
function isKoshaDetail(url: string | null): boolean {
  if (!url) return false;
  const base = koshaUrl("").split("?")[0];
  return url.startsWith(base) || url.startsWith(base.replace("https:", "http:"));
}

const allowed = () => allowedComponents([GUEST.banner, GUEST.lock, GUEST.banner_cta]);

test(`[GM-ui][${TAG}] rules.json guest.screens 에 화면 ${SCREEN} · dev-rules guest_screens = guest.screens ∩ mvp_screens (빠진 화면 없음) · routes ${SCREEN}-guest · variants 16 no-summary`, () => {
  expect(GUEST.screens, "guest.screens").toContain(SCREEN);
  const { screens, pending } = implementedGuestScreens();
  expect(pending, "아직 만들지 않은 둘러보기 화면 없음 (화면 16 포함)").toEqual([]);
  expect(screens).toContain(SCREEN);
  expect([...devRules.guest_screens].sort(), "dev-rules guest_screens").toEqual([...screens].sort());
  expect(devRules.routes[`${SCREEN}-guest`]).toMatch(/^\/demo\/msds\/\[[^\]]+\]$/);
  expect(rules.tab_bar.mobile_screens, "tab_bar.mobile_screens 에 16").toContain(SCREEN);
  expect(VARIANTS["no-summary"]).toEqual([ORIGINAL]);
});

test(`[GM-ui][C1][${TAG}] 데모 시약 MSDS 요약: 200 · ${GUEST.banner} 1(가입 → 회원가입) · hidden_components 0 · 학교명 = "${GUEST.school_name}" 만 · 16-no-summary(공단 상세 주소 아님: ${VARIANTS["no-summary"]?.join("·")} 만) · ‹ "MSDS · {시약명}" · 뒤로 = 3g · 쓰기 요청 0 · N2 0`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const r = await pick();
  expect(isKoshaDetail(r.msds_url), `데모 seed ${r.name} 의 msds_url 은 공단 상세 주소가 아님 (d7 §22 둘러보기 = 16-no-summary)`).toBe(false);
  const { context, page, viewport, response } = await openGuest(browser, info, guestMsdsPath(r.id));
  const writes: string[] = [];
  page.on("request", (q) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(q.method())) writes.push(`${q.method()} ${q.url()}`);
  });
  try {
    expect(response?.status(), "응답 200").toBe(200);
    await waitGuestShell(page);
    await waitMsds(page);
    const html = (await response?.text()) ?? "";
    await checkBanner(page);
    await checkHidden(page);
    await checkSchoolName(page, html);
    await checkLocksAreButtons(page);
    await expectHeader(page, r.name, guestReagentPath(r.id), "16g", GUEST.school_name);
    await expect(visibleText(page, FRAME.source), "공단 출처 줄 없음 (요약 없음)").toHaveCount(0);
    for (const c of VARIANTS["no-summary"]) expect(await countComponent(page, c), `${c} (variants no-summary)`).toBeGreaterThanOrEqual(1);
    for (const c of [SUMMARY, GHS, SKELETON]) expect(await countComponent(page, c), `${c} 0`).toBe(0);
    await expectOriginal(page, viewport, r.msds_url!, "16g");
    expect(await foreignOnPage(page, allowed()), "화면 16 밖 컴포넌트 0").toEqual({});
    expect((await redPaint(page)).outside, "GHS 빨강은 ghs-pictogram 밖에 없음").toEqual([]);
    await expectNoN2(page, response, "16g");
    await page.waitForTimeout(500);
    expect(writes, "쓰기 요청 0").toEqual([]);
  } finally {
    await context.close();
  }
});

test(`[GM-ui][C2][${TAG}] 둘러보기 MSDS 요약 탭바 = rules.json tab_bar + guest (390: 1·${rules.tab_bar.items}개·잠금 ${GUEST.tab_locks} · 활성 = 시안 "${FRAME.activeTab}", 1440: 0)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const r = await pick();
  const { context, page, viewport } = await openGuest(browser, info, guestMsdsPath(r.id));
  try {
    await waitMsds(page);
    await checkTabBar(page, viewport, SCREEN);
    if (viewport === "mobile") {
      const active = page.locator(`${sel(rules.tab_bar.component)} ${sel(rules.tab_bar.item)}[aria-current="page"]`);
      await expect(active, "활성 탭 1").toHaveCount(1);
      await expect(active, `활성 탭 = "${FRAME.activeTab}"`).toHaveText(new RegExp(`^\\s*${FRAME.activeTab}\\s*$`));
    }
  } finally {
    await context.close();
  }
});

test(`[C1][${TAG}] 화면 3g "MSDS 보기" → ${devRules.routes[`${SCREEN}-guest`]} (같은 창) → 뒤로 = 3g`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const r = await pick();
  const { context, page } = await openGuest(browser, info, guestReagentPath(r.id));
  try {
    await waitGuestShell(page);
    const link = entryLink(page);
    await expect(link, "3g msds-entry \"MSDS 보기\" 1").toHaveCount(1);
    await expect(link, "둘러보기 화면 16 으로").toHaveAttribute("href", guestMsdsPath(r.id));
    expect(await link.getAttribute("target"), "같은 창").toBeNull();
    await link.scrollIntoViewIfNeeded();
    await expect(async () => {
      if (new URL(page.url()).pathname !== guestMsdsPath(r.id)) await link.click({ timeout: 3_000 });
      await page.waitForURL((u) => u.pathname === guestMsdsPath(r.id), { timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
    await waitMsds(page);
    expect(context.pages(), "새 창 없음").toHaveLength(1);
    await expect(originalLink(page)).toHaveAttribute("href", r.msds_url!);
    await page.getByRole("link", { name: "뒤로", exact: true }).filter({ visible: true }).click();
    await page.waitForURL((u) => u.pathname === guestReagentPath(r.id), { timeout: 30_000 });
  } finally {
    await context.close();
  }
});

async function expect404(page: Page, path: string, hide: string[], what: string): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `${what}: 404`).toBe(404);
  expect(new URL(page.url()).pathname, `${what}: 다른 화면으로 보내지 않음`).toBe(path);
  const body = await page.locator("body").innerText();
  const html = (await res?.text()) ?? "";
  for (const h of hide.filter(Boolean)) {
    expect(body, `${what}: 화면에 "${h}" 없음`).not.toContain(h);
    expect(html, `${what}: 응답 본문에 "${h}" 없음`).not.toContain(h);
  }
  for (const c of [SUMMARY, ORIGINAL, GHS]) expect(await countComponent(page, c), `${what}: ${c} 0`).toBe(0);
}

test(`[N1-ui][GM-ui][${TAG}] 비로그인: 데모가 아닌 시약 id(학교 A·B) · 없는 id · 형식이 틀린 id → 404 (이름·MSDS 주소 미노출)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const a = await signIn("teacher");
  const aRows = await a.client.from("reagents").select("id, name, msds_url").not("msds_url", "is", null).limit(1);
  expect(aRows.error).toBeNull();
  expect(aRows.data ?? [], "학교 A 의 MSDS 있는 시약 (양성 대조)").toHaveLength(1);
  const b = await signIn("schoolB");
  const bRows = await b.client.from("reagents").select("id, name, msds_url").limit(1);
  expect(bRows.error).toBeNull();
  expect(bRows.data ?? [], "학교 B 시약").toHaveLength(1);
  const r = await pick();
  const { context, page } = await openGuest(browser, info, guestMsdsPath(r.id));
  try {
    await waitMsds(page);
    expect(await originalLink(page).count(), "양성 대조: 데모 시약은 보인다").toBe(1);
    for (const [what, row] of [["학교 A 시약", aRows.data![0]], ["학교 B 시약", bRows.data![0]]] as const) {
      await expect404(page, guestMsdsPath(row.id as string), [row.name as string, (row.msds_url as string | null) ?? ""], what);
    }
    await expect404(page, guestMsdsPath("00000000-0000-4000-8000-000000000000"), [], "없는 id");
    await expect404(page, guestMsdsPath("not-a-uuid"), [], "형식이 틀린 id");
  } finally {
    await context.close();
  }
});

test(`[GM-ui][${TAG}] 로그인 학생이 ${devRules.routes[`${SCREEN}-guest`]} 에 오면 routes["13"] 로 · 둘러보기 배너·데모 시약명 없음`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const r = await pick();
  const { context, page } = await openAs(browser, info, "student", 13, guestMsdsPath(r.id));
  try {
    await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname, "로그인 사용자 → 홈 경로").toBe(routeOf(13));
    expect(await countComponent(page, GUEST.banner), `${GUEST.banner} 0`).toBe(0);
    expect(await countComponent(page, ORIGINAL), `${ORIGINAL} 0`).toBe(0);
  } finally {
    await context.close();
  }
});

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][${TAG}] 화면 16g 스크린샷 저장 (데모 시약 — 16-no-summary)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const r = await pick();
  const { context, page, viewport } = await openGuest(browser, info, guestMsdsPath(r.id));
  try {
    await waitMsds(page).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}g-${viewport}.png`), fullPage: true });
  } finally {
    await context.close();
  }
});
