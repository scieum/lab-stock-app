// 모바일 'QR 스캔' 탭 · 데스크톱 'QR 찾기' (qr_pending 끝 — 화면 12 연결) · '관리' 탭(1.29, inventory-switch 없앰) — C2 · C1 · GM-ui (390 · 1440).
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §26 "화면 12 경로·권한" · "탭·사이드바"(화면 12 가 생기면 rules tab_bar.qr_pending 끝:
//   모바일 tab-item "QR 스캔" 정상(회색·tab-soon 없음) → /scan, 데스크톱 sidebar-item "QR 찾기" → /scan 툴팁 없음, tab-soon 컴포넌트 ·
//   "준비 중이에요" 토스트는 지운다, 둘러보기는 탭바 QR guest-lock 그대로), §25 "무선 센서 (화면 17)"(모바일 = 시약 탭 안 inventory-switch,
//   마지막 고른 쪽 기억, 화면 17 에서 시약 탭 활성), design/rules.json 1.26 tab_bar(labels · items · mobile_screens · sensor_entry) ·
//   desktop_shell.menu · guest, harness/dev-rules.json 1.19 (mvp_screens 에 12 · routes 12 = /scan · components 에 tab-soon 없음).
// 2026-10-13 d7 §29 · rules 1.29 tab_bar(labels '시약' → '관리' · labels_source · sensor_entry): '관리' 탭 → /manage(둘러보기 /demo/manage),
//   inventory-switch · 마지막 고른 쪽 기억은 없앴다 — 화면 2 · 17 모바일 활성 탭 = '관리', 센서 진입 = 관리 탭 '센서' 행 · 데스크톱 사이드바 '센서'.
// 화면 12(/scan) 본문은 D3 [S12] 에서 본다 — 여기서는 다른 화면의 셸 항목이 /scan 으로 이어지는지만 (눌러서 /scan 을 열지 않는다).
// 공용 학교 A admin 계정으로 읽기만 한다 (쓰기 없음).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { openAs } from "./auth-state";
import { REMOVED_INVENTORY_SWITCH, devRules, mobileActiveTab, routeOf, rules, sel } from "./screen-helpers";
import { seedReagents, seedSchoolOf } from "./screen-3-helpers";
import { newFrame } from "./desk-helpers";

const TAB = rules.tab_bar;
/** rules 1.29 tab_bar.labels_source "'시약' 탭 → '관리' 탭" */
const RENAMED = (() => {
  const m = /'([^']+)' 탭 → '([^']+)' 탭/.exec(TAB.labels_source);
  if (!m) throw new Error("rules tab_bar.labels_source 에서 바뀐 탭 이름을 읽지 못함");
  return { from: m[1], to: m[2] };
})();
/** '관리' 탭 → 화면 18 (둘러보기 18-guest) */
const MANAGE_TAB = RENAMED.to;
type GuestRules = { lock: string; locked_tabs: string[] };
const GUEST = (rules as unknown as { guest: GuestRules }).guest;
/** 'QR 스캔' 탭 = tab_bar.labels 의 QR · 'QR 찾기' = desktop_shell.menu.all 의 QR */
const QR_TAB = TAB.labels.find((l) => l.startsWith("QR"))!;
const QR_MENU = rules.desktop_shell.menu.all.find((l) => l.startsWith("QR"))!;
const SCAN = routeOf(12);
/** 지운 컴포넌트 · 글자 (d7 §26) */
const REMOVED = "tab-soon";
const REMOVED_TEXTS = ["준비 중", "준비 중이에요"];
const MVP = new Set(devRules.mvp_screens);
/** 탭바가 있는 모바일 화면 ∩ MVP — 화면 12 자체는 D3 [S12] */
const SCREENS = TAB.mobile_screens.filter((s) => MVP.has(s) && s !== 12);
const D7_26 = (() => {
  const d7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
  const at = d7.indexOf("## 26.");
  return d7.slice(at, d7.indexOf("\n## ", at + 1));
})();
const d7Row = (head: string) => D7_26.split(/\r?\n/).find((l) => l.startsWith(`| ${head} |`)) ?? "";

/** 화면 경로 ([id] = 학교 A seed 시약) */
function pathOf(screen: number): string {
  const r = routeOf(screen);
  if (!r.includes("[")) return r;
  const school = seedSchoolOf("admin");
  const own = seedReagents().filter((x) => x.school_id === school.id);
  return r.replace(/\[[^\]]+\]/, own[0].id);
}

test(`[C2][S*] 기대값 원본: d7 §26 qr_pending 끝 — '${QR_TAB}' → ${SCAN} · '${QR_MENU}' → ${SCAN} 툴팁 없음 · ${REMOVED} · 토스트 지움 · 둘러보기 QR guest-lock / dev-rules 1.19 mvp 12 · components 에 ${REMOVED} 없음 · 프레임 12 tab-bar 라벨 = rules`, () => {
  expect(QR_TAB, "tab_bar.labels 의 QR 탭").toBe("QR 스캔");
  expect(QR_MENU, "desktop_shell.menu.all 의 QR 메뉴").toBe("QR 찾기");
  expect(SCAN, "dev-rules routes 12").toBe("/scan");
  expect(MVP.has(12), "dev-rules mvp_screens 에 12").toBe(true);
  expect(TAB.mobile_screens, "rules tab_bar.mobile_screens 에 12").toContain(12);
  const tabs = d7Row("탭·사이드바");
  expect(tabs, "d7 §26 탭·사이드바 줄").toContain("qr_pending 끝");
  expect(tabs).toContain(`tab-item "${QR_TAB}" 정상(회색·${REMOVED} 없음) → \`${SCAN}\``);
  expect(tabs).toContain(`sidebar-item "${QR_MENU}" → \`${SCAN}\`(툴팁 없음)`);
  expect(tabs).toContain(`${REMOVED} 컴포넌트·"${REMOVED_TEXTS[1]}" 토스트는 지운다`);
  expect(d7Row("화면 12 경로·권한"), "d7 §26 둘러보기 = 탭바 QR guest-lock").toContain("탭바 QR guest-lock");
  expect(Object.keys(devRules.components), `dev-rules components 에 ${REMOVED} 없음`).not.toContain(REMOVED);
  expect(GUEST.locked_tabs, "rules guest.locked_tabs 에 QR 스캔 (둘러보기 잠금 유지)").toContain(QR_TAB);
  expect(TAB.items, "탭 4개 유지").toBe(TAB.labels.length);
  for (const f of ["12-mobile", "12-result-mobile"]) {
    // 프레임 12(1.29 이전)의 '시약' 탭은 rules 1.29 labels_source "'시약' 탭 → '관리' 탭" 으로 이름만 바뀐다
    const labels = newFrame(f).filter((n) => n.name === "label" && n.text && n.path.includes(TAB.item)).map((n) => (n.text!.characters === RENAMED.from ? RENAMED.to : n.text!.characters));
    expect(labels, `${f} tab-bar 라벨(이름 바뀐 탭 반영) = rules tab_bar.labels`).toEqual(TAB.labels);
    expect(newFrame(f).filter((n) => n.name === REMOVED).length, `${f} 프레임 ${REMOVED} 0`).toBe(0);
  }
});

for (const screen of SCREENS) {
  test(`[C2][S${screen}] 390: tab-bar 1 · tab-item ${TAB.items} (라벨 순서 rules) · '${QR_TAB}' = ${SCAN} 링크 · ${REMOVED} 0 · '준비 중' 글자 0 / 1440: tab-bar · ${REMOVED} 0 · 사이드바 '${QR_MENU}' = ${SCAN} 링크`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { page, context } = await openAs(browser, info, "admin", screen, pathOf(screen));
    try {
      await page.waitForLoadState("load");
      if (info.project.name === "desktop") {
        const sb = page.locator(sel("app-sidebar"));
        await expect(sb, "1440 사이드바").toHaveCount(1, { timeout: 45_000 });
        await expect(page.locator(sel("tab-bar")), "1440 tab-bar 0").toHaveCount(0, { timeout: 45_000 });
        await expect(page.locator(sel(REMOVED)), `1440 ${REMOVED} 0`).toHaveCount(0);
        const qr = sb.locator(sel("sidebar-item")).filter({ has: page.getByText(QR_MENU, { exact: true }) });
        await expect(qr, `사이드바 '${QR_MENU}' 1`).toHaveCount(1);
        await expect(qr, `'${QR_MENU}' → ${SCAN}`).toHaveAttribute("href", SCAN);
        await expect(qr, "aria-disabled 없음").not.toHaveAttribute("aria-disabled", /.*/);
        for (const t of REMOVED_TEXTS) await expect(sb.getByText(t, { exact: true }), `사이드바 '${t}' 0`).toHaveCount(0);
        return;
      }
      const bar = page.locator(sel("tab-bar"));
      await expect(bar, "tab-bar 1").toHaveCount(1, { timeout: 45_000 });
      await expect(page.locator(sel("app-sidebar")), "폭 정리").toHaveCount(0, { timeout: 45_000 });
      const items = bar.locator(sel("tab-item"));
      await expect(items, `tab-item ${TAB.items}`).toHaveCount(TAB.items);
      const labels = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
      expect(labels, "탭 라벨 = rules tab_bar.labels (덧붙은 글자 없음)").toEqual(TAB.labels);
      await expect(page.locator(sel(REMOVED)), `${REMOVED} 0`).toHaveCount(0);
      const qr = items.nth(TAB.labels.indexOf(QR_TAB));
      expect(await qr.evaluate((el) => el.tagName), `'${QR_TAB}' 은 링크`).toBe("A");
      await expect(qr, `'${QR_TAB}' → ${SCAN}`).toHaveAttribute("href", SCAN);
      await expect(qr, "aria-disabled 없음").not.toHaveAttribute("aria-disabled", /.*/);
      await expect(qr.locator(sel(GUEST.lock)), "로그인 후 QR 탭 guest-lock 0").toHaveCount(0);
      for (const t of REMOVED_TEXTS) await expect(bar.getByText(t, { exact: true }), `탭바 '${t}' 0`).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test(`[GM-ui][S13g] 둘러보기 /demo: 390 '${QR_TAB}' tab-item = ${GUEST.lock} 1 · 링크 아님 · ${SCAN} 링크 0 · ${REMOVED} 0 / 1440 사이드바 '${QR_MENU}' = ${GUEST.lock} · ${SCAN} 링크 0 (d7 §26 둘러보기 잠금 유지)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const vp = devRules.viewports[info.project.name as "mobile" | "desktop"];
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: vp[0], height: vp[1] } });
  try {
    const page = await ctx.newPage();
    await page.goto(devRules.routes["13-guest"]);
    await page.waitForLoadState("load");
    if (info.project.name === "desktop") {
      const sb = page.locator(sel("app-sidebar"));
      await expect(sb, "사이드바").toHaveCount(1, { timeout: 45_000 });
      await expect(page.locator(sel(REMOVED)), `${REMOVED} 0`).toHaveCount(0);
      const qr = sb.locator(sel("sidebar-item")).filter({ has: page.getByText(QR_MENU, { exact: true }) });
      await expect(qr, `'${QR_MENU}' 1`).toHaveCount(1);
      await expect(qr.locator(sel(GUEST.lock)), `'${QR_MENU}' ${GUEST.lock}`).toHaveCount(1);
      await expect(sb.locator(`a[href="${SCAN}"], a[href^="${SCAN}?"]`), `사이드바 ${SCAN} 링크 0`).toHaveCount(0);
      return;
    }
    const bar = page.locator(sel("tab-bar"));
    await expect(bar, "tab-bar 1").toHaveCount(1, { timeout: 45_000 });
    await expect(page.locator(sel(REMOVED)), `${REMOVED} 0`).toHaveCount(0);
    const qr = bar.locator(sel("tab-item")).filter({ hasText: QR_TAB });
    await expect(qr, `'${QR_TAB}' 1`).toHaveCount(1);
    await expect(qr.locator(sel(GUEST.lock)), `'${QR_TAB}' ${GUEST.lock} 1`).toHaveCount(1);
    expect(await qr.getAttribute("href"), "잠금 탭은 링크가 아님").toBeNull();
    await expect(bar.locator(`a[href="${SCAN}"], a[href^="${SCAN}?"]`), `탭바 ${SCAN} 링크 0`).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

const exactRe = (s: string) => new RegExp(`^\\s*${s}\\s*$`);

test(`[C2][S2] [C2][S17] [C1][S17] 390: /reagents · /sensors 에 ${REMOVED_INVENTORY_SWITCH} 0 · 탭바 '${MANAGE_TAB}' 활성(rules labels_source) · '${MANAGE_TAB}' 탭 → ${routeOf(18)} (마지막 고른 쪽 기억 없음) / 1440: ${REMOVED_INVENTORY_SWITCH} 0 · 사이드바 '센서'(시약 아래) → /sensors`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  expect(RENAMED, "rules 1.29: '시약' 탭 → '관리' 탭").toEqual({ from: "시약", to: "관리" });
  expect(TAB.labels, "rules tab_bar.labels 에 관리").toContain(MANAGE_TAB);
  expect([mobileActiveTab(2), mobileActiveTab(17)], "rules labels_source: 화면 2 · 17 활성 = 관리").toEqual([MANAGE_TAB, MANAGE_TAB]);
  const { page, context } = await openAs(browser, info, "teacher", 2);
  try {
    await page.waitForLoadState("load");
    if (info.project.name === "desktop") {
      await expect(page.locator(sel("app-sidebar")), "사이드바").toHaveCount(1, { timeout: 45_000 });
      await expect(page.locator(sel(REMOVED_INVENTORY_SWITCH)), `1440 /reagents ${REMOVED_INVENTORY_SWITCH} 0`).toHaveCount(0, { timeout: 45_000 });
      const items = page.locator(`${sel("app-sidebar")} ${sel("sidebar-item")}`);
      const labels = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
      const all = rules.desktop_shell.menu.all;
      expect(all.indexOf("센서"), "rules 메뉴: 센서 = 시약 바로 아래").toBe(all.indexOf("시약") + 1);
      const iReagent = labels.findIndex((l) => l.startsWith("시약") && !l.startsWith("시약장"));
      expect(labels[iReagent + 1], "사이드바 시약 다음 = 센서").toMatch(/^센서/);
      await items.nth(iReagent + 1).click();
      await expect(page, "사이드바 센서 → /sensors").toHaveURL(new RegExp(`${routeOf(17)}(\\?|$)`));
      await expect(page.locator(`${sel("app-sidebar")} ${sel("sidebar-item")}[aria-current="page"]`), "센서 활성").toHaveText(/센서/);
      await expect(page.locator(sel(REMOVED_INVENTORY_SWITCH)), `1440 /sensors ${REMOVED_INVENTORY_SWITCH} 0`).toHaveCount(0);
      return;
    }
    const tab = (label: string) => page.locator(`${sel("tab-bar")} ${sel("tab-item")}`).filter({ hasText: exactRe(label) });
    const active = page.locator(`${sel("tab-bar")} ${sel("tab-item")}[aria-current="page"]`);
    for (const screen of [2, 17, 13]) {
      if (screen !== 2) {
        await page.goto(routeOf(screen));
        await page.waitForLoadState("load");
      }
      await expect(page.locator(sel("tab-bar")), `${routeOf(screen)} tab-bar 1`).toHaveCount(1, { timeout: 45_000 });
      await expect(page.locator(sel(REMOVED_INVENTORY_SWITCH)), `${routeOf(screen)} ${REMOVED_INVENTORY_SWITCH} 0`).toHaveCount(0);
      await expect(active, `${routeOf(screen)} 활성 = '${mobileActiveTab(screen)}'`).toHaveText(exactRe(mobileActiveTab(screen)));
      // '관리' 탭은 어디서나 /manage (1.26 의 '마지막 고른 쪽 기억'으로 바뀌지 않음)
      await expect(tab(MANAGE_TAB), `${routeOf(screen)} '${MANAGE_TAB}' → ${routeOf(18)}`).toHaveAttribute("href", routeOf(18));
      await expect(tab(RENAMED.from), `${routeOf(screen)} '${RENAMED.from}' 탭 0`).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

test(`[GM-ui][S2g] [GM-ui][S17g] 둘러보기: 390 /demo/reagents · /demo/sensors ${REMOVED_INVENTORY_SWITCH} 0 · 탭바 '${MANAGE_TAB}' = ${devRules.routes["18-guest"]} · 활성 / 1440 ${REMOVED_INVENTORY_SWITCH} 0 · 사이드바 '센서' → /demo/sensors (rules guest.desktop)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const vp = devRules.viewports[info.project.name as "mobile" | "desktop"];
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: vp[0], height: vp[1] } });
  try {
    const page = await ctx.newPage();
    await page.goto(devRules.routes["2-guest"]);
    await page.waitForLoadState("load");
    if (info.project.name === "desktop") {
      await expect(page.locator(sel("app-sidebar")), "사이드바").toHaveCount(1, { timeout: 45_000 });
      await expect(page.locator(sel(REMOVED_INVENTORY_SWITCH)), `1440 ${REMOVED_INVENTORY_SWITCH} 0`).toHaveCount(0, { timeout: 45_000 });
      const sensor = page.locator(`${sel("app-sidebar")} ${sel("sidebar-item")}`).filter({ hasText: /^\s*센서\s*$/ });
      await expect(sensor, "사이드바 '센서' 1").toHaveCount(1);
      expect(new URL((await sensor.getAttribute("href"))!, "http://x").pathname, "'센서' → /demo/sensors").toBe(devRules.routes["17-guest"]);
      return;
    }
    for (const path of [devRules.routes["2-guest"], devRules.routes["17-guest"]]) {
      if (path !== devRules.routes["2-guest"]) {
        await page.goto(path);
        await page.waitForLoadState("load");
      }
      const bar = page.locator(sel("tab-bar"));
      await expect(bar, `${path} tab-bar 1`).toHaveCount(1, { timeout: 45_000 });
      await expect(page.locator(sel(REMOVED_INVENTORY_SWITCH)), `${path} ${REMOVED_INVENTORY_SWITCH} 0`).toHaveCount(0);
      const manage = bar.locator(sel("tab-item")).filter({ hasText: exactRe(MANAGE_TAB) });
      await expect(manage, `${path} '${MANAGE_TAB}' → ${devRules.routes["18-guest"]}`).toHaveAttribute("href", devRules.routes["18-guest"]);
      await expect(manage, `${path} '${MANAGE_TAB}' 활성`).toHaveAttribute("aria-current", "page");
    }
  } finally {
    await ctx.close();
  }
});
