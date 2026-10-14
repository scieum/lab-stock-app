// manage-back '‹ 관리' · 모바일 탭 활성 (d7 §29 "manage-back" · "하단 탭", design/rules.json 1.29 manage.back · tab_bar.labels_source · guest.manage)
// - 관리 아래 화면(rules manage.back 2·5·6·7·8·9·11·17) 390: nav-pill 머리 왼쪽 manage-back 1 → routes[18] /manage, 글자 '관리', 보임 ·
//   활성 탭 = rules tab_bar.labels_source(관리). 누르면 화면 18. 1440: manage-back 0 (사이드바).
// - 더 깊은 화면(시약 상세 3 · MSDS 16 · 사용 기록 입력 4 · 센서 상세 · 센서 등록 · 센서 서류 등록)과 각자 탭 화면(13 · 10 · 12): manage-back 0, 활성 탭 = labels_source.
// - 둘러보기: 2g · 17g = manage-back → /demo/manage, 3g · 16g · 센서 상세 · 13g = 0.
// 공용 계정은 읽기만 한다.
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, anonClient, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { MANAGE_BACK_SCREENS, MANAGE_RULES, MANAGE_SCREEN, browserClient, devRules, mobileActiveTab, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { demoReagents, guestRouteOf, openGuest, waitGuestShell } from "./guest-helpers";

const BACK = "manage-back";
const TB = rules.tab_bar;
const ROUTE_AUTH = (devRules as unknown as { route_auth: Record<string, string> }).route_auth;
const GUEST_MANAGE = devRules.routes[`${MANAGE_SCREEN}-guest`];

/** dev-rules route_auth 로 그 역할이 화면에 들어갈 수 있는지 */
function canOpen(role: Role, screen: number): boolean {
  const a = ROUTE_AUTH[String(screen)] ?? "";
  if (/교사·admin만/.test(a)) return role !== "student";
  if (/admin만/.test(a)) return role === "admin";
  return true;
}

const exactRe = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
const activeTab = (page: Page) => page.locator(`${sel(TB.component)} ${sel(TB.item)}[aria-current="page"]`);
const backIn = (page: Page) => page.locator(sel(BACK));

/** 화면이 그려질 때까지 (셸 + 자리 표시 없음 + 폭 정리) */
async function settle(page: Page, viewport: ViewportName): Promise<void> {
  await page.waitForLoadState("load");
  await expect(page.locator(sel(viewport === "mobile" ? "nav-pill" : rules.desktop_shell.component))).toHaveCount(1, { timeout: 45_000 });
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, { timeout: 45_000 });
  await expect(page.locator(sel(viewport === "mobile" ? rules.desktop_shell.component : "nav-pill")), "맞지 않는 폭의 셸 0").toHaveCount(0, { timeout: 30_000 });
}

/** 390 활성 탭 = rules tab_bar.labels_source 의 화면 탭 */
async function expectActiveTab(page: Page, screen: number, where: string): Promise<void> {
  const label = mobileActiveTab(screen);
  await expect(activeTab(page), `${where}: 활성 탭 1`).toHaveCount(1);
  await expect(activeTab(page), `${where}: 활성 탭 '${label}' (rules tab_bar.labels_source)`).toHaveText(exactRe(label));
}

test(`[C2][S*] 기대값 원본: rules manage.back 관리 아래 화면 ${MANAGE_BACK_SCREENS.join("·")} = dev-rules components["${BACK}"] · 활성 탭 '관리' · routes 18 · 18-guest`, () => {
  expect([...MANAGE_BACK_SCREENS].sort((a, b) => a - b), "dev-rules components manage-back").toEqual([...(devRules.components[BACK] ?? [])].sort((a, b) => a - b));
  for (const s of MANAGE_BACK_SCREENS) expect(mobileActiveTab(s), `화면 ${s} 활성 탭`).toBe(mobileActiveTab(MANAGE_SCREEN));
  expect(routeOf(MANAGE_SCREEN)).toBe("/manage");
  expect(GUEST_MANAGE).toBe("/demo/manage");
  expect(MANAGE_RULES.back).toMatch(/더 깊은 화면은 지금처럼 ‹ 뒤로/);
});

// ---------- 관리 아래 화면 ----------

for (const role of ["admin", "student"] as Role[]) {
  for (const screen of MANAGE_BACK_SCREENS.filter((s) => canOpen(role, s))) {
    test(`[C2][S${screen}] ${ROLE_LABEL[role]} 화면 ${screen} ${routeOf(screen)}: 390 nav-pill ${BACK} 1('관리' → ${routeOf(MANAGE_SCREEN)}) · 활성 탭 '${mobileActiveTab(screen)}' · 누르면 화면 ${MANAGE_SCREEN} / 1440 ${BACK} 0`, async ({ browser }, info) => {
      test.setTimeout(120_000);
      const { context, page, viewport } = await openAs(browser, info, role, screen);
      try {
        expect(new URL(page.url()).pathname, `화면 ${screen} 도착 (리다이렉트 없음)`).toBe(routeOf(screen));
        await settle(page, viewport);
        if (viewport === "desktop") {
          await expect(backIn(page), `1440 ${BACK} 0`).toHaveCount(0);
          await expect(page.locator(sel(TB.component)), "1440 tab-bar 0").toHaveCount(0);
          return;
        }
        const back = backIn(page);
        await expect(back, `${BACK} 1`).toHaveCount(1);
        await expect(page.locator(`${sel("nav-pill")} ${sel(BACK)}`), `${BACK} 은 nav-pill 안`).toHaveCount(1);
        await expect(back).toBeVisible();
        await expect(back, `${BACK} 글자 '관리'`).toHaveText(exactRe("관리"));
        await expect(back, `${BACK} → ${routeOf(MANAGE_SCREEN)}`).toHaveAttribute("href", routeOf(MANAGE_SCREEN));
        // 머리 왼쪽: nav-pill 안에서 학교명보다 왼쪽
        const bb = await back.boundingBox();
        const nb = await page.locator(sel("nav-pill")).boundingBox();
        expect(bb && nb && bb.x - nb.x < nb.width / 2, `${BACK} 은 nav-pill 왼쪽`).toBe(true);
        await expectActiveTab(page, screen, `화면 ${screen}`);
        await back.click();
        await expect.poll(() => new URL(page.url()).pathname, { message: `${BACK} → ${routeOf(MANAGE_SCREEN)}`, timeout: 45_000 }).toBe(routeOf(MANAGE_SCREEN));
        await expect(page.locator(`main ${sel("manage-list")}`), "화면 18 manage-list").toBeVisible({ timeout: 45_000 });
        await expectActiveTab(page, MANAGE_SCREEN, "화면 18");
      } finally {
        await context.close();
      }
    });
  }
}

// ---------- 더 깊은 화면 · 각자 탭 화면 ----------

type Deep = { name: string; screen: number; path: (page: Page) => Promise<string> };

async function firstId(page: Page, table: "reagents"): Promise<string> {
  const { client } = await browserClient(page);
  const r = await client.from(table).select("id").order("id").limit(1);
  expect(r.error, `${table} 조회`).toBeNull();
  expect((r.data ?? []).length, `대조: 학교 A ${table} ≥1`).toBeGreaterThan(0);
  return r.data![0].id as string;
}

const DEEP: Deep[] = [
  { name: "시약 상세", screen: 3, path: async (p) => routeOf(3).replace(/\[[^\]]+\]/, await firstId(p, "reagents")) },
  { name: "MSDS 요약", screen: 16, path: async (p) => routeOf(16).replace(/\[[^\]]+\]/, await firstId(p, "reagents")) },
  { name: "사용 기록 입력", screen: 4, path: async () => routeOf(4) },
  // 센서 상세는 공용 학교 A 에 센서가 없어(쓰기 금지) 둘러보기 17g 센서 상세로 본다 (아래)
  { name: "센서 등록", screen: 17, path: async () => `${routeOf(17)}/new` },
  { name: "센서 서류 등록", screen: 17, path: async () => devRules.routes["17-doc"] },
  { name: "홈", screen: 13, path: async () => routeOf(13) },
  { name: "기록", screen: 10, path: async () => routeOf(10) },
  { name: "QR 스캔", screen: 12, path: async () => routeOf(12) },
];

for (const d of DEEP) {
  test(`[C2][S${d.screen}] 학교A admin ${d.name}: ${BACK} 0 (rules manage.back — 더 깊은 화면 · 각자 탭 화면은 ‹ 뒤로 그대로) · 390 활성 탭 '${mobileActiveTab(d.screen)}'`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page, viewport } = await openAs(browser, info, "admin", 13);
    try {
      const path = await d.path(page);
      const res = await page.goto(path);
      expect(res?.status(), `${path} 응답`).toBe(200);
      await settle(page, viewport);
      await expect(backIn(page), `${d.name} ${BACK} 0`).toHaveCount(0);
      if (viewport === "mobile") await expectActiveTab(page, d.screen, d.name);
    } finally {
      await context.close();
    }
  });
}

// ---------- 둘러보기 ----------

async function guestPaths(): Promise<{ name: string; screen: number; path: string; back: boolean }[]> {
  const demo = (await demoReagents())[0];
  const sensors = await anonClient().from("sensors").select("id").order("id").limit(1);
  expect(sensors.error).toBeNull();
  expect((sensors.data ?? []).length, "대조: 데모 센서 ≥1").toBeGreaterThan(0);
  return [
    { name: "2g 시약", screen: 2, path: guestRouteOf(2), back: true },
    { name: "17g 센서", screen: 17, path: guestRouteOf(17), back: true },
    { name: "3g 시약 상세", screen: 3, path: guestRouteOf(3).replace(/\[[^\]]+\]/, demo.id), back: false },
    { name: "16g MSDS", screen: 16, path: guestRouteOf(16).replace(/\[[^\]]+\]/, demo.id), back: false },
    { name: "17g 센서 상세", screen: 17, path: `${guestRouteOf(17)}/${sensors.data![0].id as string}`, back: false },
    { name: "13g 홈", screen: 13, path: guestRouteOf(13), back: false },
  ];
}

test(`[GM-ui][C2][S2g] [S17g] 둘러보기: 2g · 17g 390 ${BACK} 1 → ${GUEST_MANAGE} · 3g · 16g · 센서 상세 · 13g 0 · 활성 탭 = labels_source / 1440 ${BACK} 0`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  for (const g of await guestPaths()) {
    const { context, page, viewport } = await openGuest(browser, info, g.path);
    try {
      await waitGuestShell(page);
      await settle(page, viewport);
      const want = viewport === "mobile" && g.back ? 1 : 0;
      await expect(backIn(page), `${g.name} (${viewport}) ${BACK} ${want}`).toHaveCount(want);
      if (viewport !== "mobile") continue;
      await expectActiveTab(page, g.screen, g.name);
      if (!g.back) continue;
      await expect(backIn(page), `${g.name} → ${GUEST_MANAGE}`).toHaveAttribute("href", GUEST_MANAGE);
      await expect(backIn(page)).toHaveText(exactRe("관리"));
      await backIn(page).click();
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 45_000 }).toBe(GUEST_MANAGE);
      await expect(page.locator(`main ${sel("manage-list")}`)).toBeVisible({ timeout: 30_000 });
    } finally {
      await context.close();
    }
  }
});
