// 모바일 QR 스캔 탭 "준비 중"(tab-soon) · 시약 탭 안 inventory-switch "시약 | 센서" — C2 · C1 (390 · 1440).
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §25 "QR 스캔 탭 (모바일)" · "무선 센서 (화면 17)"(모바일 = 시약 탭 안 inventory-switch,
//   마지막 고른 쪽 기억, 화면 17 에서 시약 탭 활성), design/rules.json 1.26 tab_bar(qr_pending · sensor_entry · labels · items ·
//   mobile_screens) · desktop_shell.menu, harness/dev-rules.json 1.18 components tab-soon · inventory-switch (tab-soon = 탭바가 있는 모든 모바일 화면).
// 공용 학교 A admin 계정으로 읽기만 한다 (쓰기 없음).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { openAs } from "./auth-state";
import { devRules, routeOf, rules, sel } from "./screen-helpers";
import { seedReagents, seedSchoolOf } from "./screen-3-helpers";
import { newFrame } from "./desk-helpers";
import { quotes } from "./sensor-helpers";

type TabBarRules = typeof rules.tab_bar & { qr_pending: string; sensor_entry: string };
const TAB = rules.tab_bar as TabBarRules;
/** qr_pending: "… tab-soon '준비 중'(caption), 누르면 ex-toast '준비 중이에요'" */
const [SOON_LABEL, SOON_TOAST] = (() => {
  const q = quotes(TAB.qr_pending);
  return [q.find((x) => x === "준비 중")!, q.find((x) => x === "준비 중이에요")!];
})();
/** 준비 중 탭 = qr_pending 의 'QR 스캔' */
const SOON_TAB = quotes(TAB.qr_pending).find((x) => TAB.labels.includes(x))!;
const MVP = new Set(devRules.mvp_screens);
const SCREENS = TAB.mobile_screens.filter((s) => MVP.has(s));
const D7_QR =
  readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("| QR 스캔 탭 (모바일)")) ?? "";

/** 화면 경로 ([id] = 학교 A seed 시약) */
function pathOf(screen: number): string {
  const r = routeOf(screen);
  if (!r.includes("[")) return r;
  const school = seedSchoolOf("admin");
  const own = seedReagents().filter((x) => x.school_id === school.id);
  return r.replace(/\[[^\]]+\]/, own[0].id);
}

const soonItem = (page: Page) => page.locator(`${sel("tab-bar")} ${sel("tab-item")}`).filter({ hasText: SOON_TAB });

test(`[C2][S*] 기대값 원본: tab_bar.qr_pending '${SOON_TAB}' + tab-soon '${SOON_LABEL}' · 토스트 '${SOON_TOAST}' · d7 §25 /scan 으로 가지 않음 · dev-rules components tab-soon = 탭바 모바일 화면 ∩ MVP (${SCREENS.join("·")})`, () => {
  expect(SOON_TAB, "준비 중 탭 = tab_bar.labels 의 QR 스캔").toBe("QR 스캔");
  expect(SOON_LABEL).toBe("준비 중");
  expect(SOON_TOAST).toBe("준비 중이에요");
  expect(D7_QR, "d7 §25").toMatch(/`\/scan` 으로 가지 않음/);
  expect([...devRules.components["tab-soon"]].sort((a, b) => a - b), "dev-rules components tab-soon").toEqual([...SCREENS].sort((a, b) => a - b));
  expect(TAB.items, "탭 4개 유지").toBe(TAB.labels.length);
  const frameSoon = newFrame("13-mobile").filter((n) => n.name === "tab-soon" && n.text).map((n) => n.text!.characters);
  expect(frameSoon, "프레임 13-mobile tab-soon 글자").toEqual([SOON_LABEL]);
});

for (const screen of SCREENS) {
  test(`[C2][S${screen}] 390: tab-bar 1 · tab-item ${TAB.items} (라벨 순서 rules) · '${SOON_TAB}' 안 tab-soon '${SOON_LABEL}' 1 · 링크 아님 · 누르면 ex-toast '${SOON_TOAST}' · 주소 그대로 / 1440: tab-bar · tab-soon 0`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { page, context } = await openAs(browser, info, "admin", screen, pathOf(screen));
    try {
      await page.waitForLoadState("load");
      if (info.project.name === "desktop") {
        await expect(page.locator(sel("app-sidebar")), "1440 사이드바").toHaveCount(1, { timeout: 45_000 });
        await expect(page.locator(sel("tab-bar")), "1440 tab-bar 0").toHaveCount(0, { timeout: 45_000 });
        await expect(page.locator(sel("tab-soon")), "1440 tab-soon 0").toHaveCount(0);
        return;
      }
      const bar = page.locator(sel("tab-bar"));
      await expect(bar, "tab-bar 1").toHaveCount(1, { timeout: 45_000 });
      await expect(page.locator(sel("app-sidebar")), "폭 정리").toHaveCount(0, { timeout: 45_000 });
      const items = bar.locator(sel("tab-item"));
      await expect(items, `tab-item ${TAB.items}`).toHaveCount(TAB.items);
      for (const [i, label] of TAB.labels.entries()) await expect(items.nth(i), `탭 ${i + 1} 라벨`).toContainText(label);
      await expect(page.locator(sel("tab-soon")), "tab-soon 1 (탭바 안)").toHaveCount(1);
      const soon = soonItem(page);
      await expect(soon.locator(sel("tab-soon")), `'${SOON_TAB}' 안 tab-soon`).toHaveText(SOON_LABEL);
      expect(await soon.getAttribute("href"), "준비 중 탭은 링크가 아님").toBeNull();
      await expect(bar.locator('a[href="/scan"], a[href^="/scan?"]'), "/scan 링크 0").toHaveCount(0);
      const before = new URL(page.url()).pathname;
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-component="tab-bar"]');
        return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
      });
      await expect(async () => {
        await soon.click({ timeout: 3_000 });
        await expect(page.locator(sel("ex-toast")).filter({ hasText: SOON_TOAST }), `토스트 '${SOON_TOAST}'`).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 20_000 });
      await page.waitForTimeout(500);
      expect(new URL(page.url()).pathname, "주소 그대로 (/scan 으로 가지 않음)").toBe(before);
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S2] [C1][S17] [C2][S17] 390 inventory-switch '시약 | 센서': /reagents 시약 활성 → '센서' → /sensors(센서 활성 · 탭바 '시약' 활성) → 홈 → '시약' 탭 = /sensors(마지막 고른 쪽 기억) → '시약' → /reagents → 홈 → '시약' 탭 = /reagents / 1440 inventory-switch 0 · 사이드바 '센서'(시약 아래) → /sensors`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { page, context } = await openAs(browser, info, "teacher", 2);
  try {
    await page.waitForLoadState("load");
    if (info.project.name === "desktop") {
      await expect(page.locator(sel("app-sidebar")), "사이드바").toHaveCount(1, { timeout: 45_000 });
      for (const f of ["2-desktop", "17-desktop"]) expect(newFrame(f).filter((n) => n.name === "inventory-switch").length, `${f} 프레임 inventory-switch 0`).toBe(0);
      await expect(page.locator(sel("inventory-switch")), "1440 /reagents inventory-switch 0").toHaveCount(0, { timeout: 45_000 });
      const items = page.locator(`${sel("app-sidebar")} ${sel("sidebar-item")}`);
      const labels = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
      const all = rules.desktop_shell.menu.all;
      expect(all.indexOf("센서"), "rules 메뉴: 센서 = 시약 바로 아래").toBe(all.indexOf("시약") + 1);
      const iReagent = labels.findIndex((l) => l.startsWith("시약") && !l.startsWith("시약장"));
      expect(labels[iReagent + 1], "사이드바 시약 다음 = 센서").toMatch(/^센서/);
      await items.nth(iReagent + 1).click();
      await expect(page, "사이드바 센서 → /sensors").toHaveURL(new RegExp(`${routeOf(17)}(\\?|$)`));
      await expect(page.locator(`${sel("app-sidebar")} ${sel("sidebar-item")}[aria-current="page"]`), "센서 활성").toHaveText(/센서/);
      await expect(page.locator(sel("inventory-switch")), "1440 /sensors inventory-switch 0").toHaveCount(0);
      return;
    }
    const sw = () => page.locator(`main ${sel("inventory-switch")}`);
    const tabReagent = () => page.locator(`${sel("tab-bar")} ${sel("tab-item")}`).filter({ hasText: TAB.labels[1] });
    const tabHome = () => page.locator(`${sel("tab-bar")} ${sel("tab-item")}`).filter({ hasText: TAB.labels[0] });
    await expect(sw(), "/reagents inventory-switch 1").toHaveCount(1, { timeout: 45_000 });
    await expect(sw().locator('[role="tab"]'), "'시약 | 센서'").toHaveText(["시약", "센서"]);
    await expect(sw().locator(sel("segmented-control-active")), "시약 활성").toHaveText("시약");
    await page.waitForFunction(() => {
      const el = document.querySelector('main [data-component="inventory-switch"]');
      return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
    });
    await sw().getByRole("tab", { name: "센서" }).click();
    await expect(page, "→ /sensors").toHaveURL(new RegExp(`${routeOf(17)}(\\?|$)`), { timeout: 45_000 });
    await expect(sw().locator(sel("segmented-control-active")), "센서 활성").toHaveText("센서", { timeout: 45_000 });
    await expect(tabReagent(), "화면 17 탭바 '시약' 활성").toHaveAttribute("aria-current", "page");
    await tabHome().click();
    await expect(page, "홈").toHaveURL(new RegExp(`${routeOf(13)}$`), { timeout: 45_000 });
    await expect(tabReagent(), "'시약' 탭 → 마지막 고른 /sensors").toHaveAttribute("href", routeOf(17), { timeout: 15_000 });
    await tabReagent().click();
    await expect(page, "'시약' 탭 → /sensors").toHaveURL(new RegExp(`${routeOf(17)}(\\?|$)`), { timeout: 45_000 });
    await expect(sw(), "/sensors inventory-switch 1").toHaveCount(1, { timeout: 45_000 });
    await sw().getByRole("tab", { name: "시약" }).click();
    await expect(page, "→ /reagents").toHaveURL(new RegExp(`${routeOf(2)}(\\?|$)`), { timeout: 45_000 });
    await tabHome().click();
    await expect(page, "홈").toHaveURL(new RegExp(`${routeOf(13)}$`), { timeout: 45_000 });
    await expect(tabReagent(), "'시약' 탭 → 마지막 고른 /reagents").toHaveAttribute("href", routeOf(2), { timeout: 15_000 });
  } finally {
    await context.close();
  }
});

test(`[GM-ui][S2g] [GM-ui][S17g] 둘러보기: 390 inventory-switch /demo/reagents ↔ /demo/sensors (탭바 '시약' = 둘러보기 경로) / 1440 inventory-switch 0 · 사이드바 '센서' → /demo/sensors (rules guest.desktop)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const vp = devRules.viewports[info.project.name as "mobile" | "desktop"];
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: vp[0], height: vp[1] } });
  try {
    const page = await ctx.newPage();
    await page.goto(devRules.routes["2-guest"]);
    await page.waitForLoadState("load");
    if (info.project.name === "desktop") {
      await expect(page.locator(sel("app-sidebar")), "사이드바").toHaveCount(1, { timeout: 45_000 });
      await expect(page.locator(sel("inventory-switch")), "1440 inventory-switch 0").toHaveCount(0, { timeout: 45_000 });
      const sensor = page.locator(`${sel("app-sidebar")} ${sel("sidebar-item")}`).filter({ hasText: /^\s*센서\s*$/ });
      await expect(sensor, "사이드바 '센서' 1").toHaveCount(1);
      expect(new URL((await sensor.getAttribute("href"))!, "http://x").pathname, "'센서' → /demo/sensors").toBe(devRules.routes["17-guest"]);
      return;
    }
    const sw = page.locator(`main ${sel("inventory-switch")}`);
    await expect(sw, "둘러보기 inventory-switch").toHaveCount(1, { timeout: 45_000 });
    await expect(sw.locator(sel("segmented-control-active"))).toHaveText("시약");
    expect(await sw.getByRole("tab", { name: "센서" }).getAttribute("href"), "센서 → /demo/sensors").toBe(devRules.routes["17-guest"]);
    await page.waitForFunction(() => {
      const el = document.querySelector('main [data-component="inventory-switch"]');
      return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
    });
    await sw.getByRole("tab", { name: "센서" }).click();
    await expect(page).toHaveURL(new RegExp(`${devRules.routes["17-guest"]}(\\?|$)`), { timeout: 45_000 });
    await expect(page.locator(`${sel("tab-bar")} ${sel("tab-item")}`).filter({ hasText: TAB.labels[1] }), "탭바 '시약' → /demo/sensors").toHaveAttribute("href", devRules.routes["17-guest"], { timeout: 15_000 });
  } finally {
    await ctx.close();
  }
});
