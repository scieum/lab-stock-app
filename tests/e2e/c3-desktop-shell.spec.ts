// C3 데스크톱 셸 (design/rules.json 1.22 desktop_shell, harness/d5-gates.md C3, harness/d7-data.md §23, dev-rules 1.11).
// - 셸 부분(app-sidebar · sidebar-item · nav-pill 0)은 dev-rules desktop_shell_done 이 true 이면 desktop_shell.screens 전부
//   (이 하네스가 만든 화면 = mvp_screens 안 — 화면 12 QR 찾기는 화면 12 run 에서).
// - 화면별 본문(desktop_required · 새 프레임 대조)·둘러보기·로그인 전 C3 는 dev-rules desktop_migrated_screens 에 든 화면만 —
//   아직 이전하지 않은 화면은 "예전 셸이 그대로"(로그인 전·둘러보기 nav-pill)를 확인하고, 이전되면 자동으로 새 규칙을 본다.
// - 기대값: rules.json desktop_shell(menu·width·radius·forbidden_on_desktop·min_items) · tab_bar, 새 프레임 design/frames/{N}-desktop
//   (활성 메뉴 = 시안이 칠한 sidebar-item, 색 = 시안 fills, 묶음 제목), d7 §23 문구("준비 중" 툴팁).
// - 계정: 공용 학교 A 학생·교사·admin(보기만) · 로그아웃은 일회용 학교 admin(테스트마다 새 세션) — service role 은 준비·정리에만.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { isDesktopMigrated } from "../frames";
import {
  DESKTOP_SHELL as DS,
  frameActiveLabel,
  frameNode,
  frameSidebarItems,
  frameTexts,
  shellScreens,
  sidebarMenuOf,
  type ShellRole,
} from "../desktop-shell";
import { openAs } from "./auth-state";
import { ROLE_LABEL } from "./db-helpers";
import { demoReagents, guestDetailPath } from "./guest-helpers";
import { browserClient, browserSession, devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { HAS_SERVICE, forgetSession, openTemp, sweep, tempSchool, NO_RESIDUE } from "./screen-8-helpers";
import { anonContext, expectShell, shellAccountButton, shellAccountLabel } from "./shell-helpers";

const ROLES: ShellRole[] = ["student", "teacher", "admin"];
const ROUTE_AUTH = (devRules as unknown as { route_auth: Record<string, string> }).route_auth;
const TB = rules.tab_bar;
const { screens: SHELL_SCREENS, pending: PENDING_SCREENS } = shellScreens();
const LOGOUT_LABEL = "로그아웃";
const LOGOUT_API = "/api/auth/logout";
const GROUP = "c3shell";

/** d7 §23 의 비활성 메뉴 툴팁 문구 ("준비 중" 툴팁) */
const READY_TOOLTIP = (() => {
  const d7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
  const sec = d7.slice(d7.indexOf("## 23."));
  const m = /"([^"]+)" 툴팁/.exec(sec);
  if (!m) throw new Error('d7 §23 에서 "…" 툴팁 문구를 읽지 못함');
  return m[1];
})();

/** 아직 만들지 않은 화면(desktop_shell.screens 중 mvp 밖 = 12)의 메뉴 글자 — 새 프레임 {N}-desktop 의 활성 메뉴 */
const NOT_BUILT_LABELS = PENDING_SCREENS.map((s) => frameActiveLabel(s));

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);

/** 새 프레임에서 사이드바 묶음 제목 (sidebar-group-title 안 글자) — 교사 프레임(2-desktop)·admin 프레임(8-desktop) */
const GROUP_TITLES: Record<ShellRole, string[]> = {
  student: [],
  teacher: frameTexts("2-desktop", "sidebar-group-title"),
  admin: frameTexts("8-desktop", "sidebar-group-title"),
};
const SIDEBAR_FILL = (frameNode("2-desktop", DS.component).fills as string[] | null)?.[0] ?? "";
const ACTIVE_FILL = frameSidebarItems("2-desktop").find((i) => i.active)?.fill ?? "";
const WORDMARK = frameTexts("2-desktop", "sidebar-brand")[0];

/** dev-rules route_auth 로 이 역할이 그 화면에 들어갈 수 있는지 */
function canOpen(role: ShellRole, screen: number): boolean {
  const a = ROUTE_AUTH[String(screen)] ?? "";
  if (/교사·admin만/.test(a)) return role !== "student";
  if (/admin만/.test(a)) return role === "admin";
  return true;
}

/** 화면 경로 ([id] 는 자기 학교 첫 시약 — RLS) */
async function pathOf(page: Page, screen: number): Promise<string> {
  const route = routeOf(screen);
  if (!route.includes("[")) return route;
  const { client } = await browserClient(page);
  const one = await client.from("reagents").select("id").order("id").limit(1).single();
  expect(one.error, "대조: 자기 학교 시약").toBeNull();
  return route.replace(/\[[^\]]+\]/, one.data!.id as string);
}

const sidebar = (page: Page) => page.locator(sel(DS.component));
const items = (page: Page) => sidebar(page).locator(sel(DS.item));
/** sidebar-item 글자 (보이는 글자 — 숨은 툴팁 제외) */
const itemLabels = (page: Page) => items(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
/** 글자가 label 인 sidebar-item (숨은 툴팁 글자는 textContent 에 섞이므로 글자 요소로 찾는다) */
const itemByLabel = (page: Page, label: string) => items(page).filter({ has: page.getByText(label, { exact: true }) });

async function waitBody(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await expect(page.locator("main").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, { timeout: 45_000 });
}

async function bg(l: Locator): Promise<string> {
  return l.evaluate((el) => getComputedStyle(el).backgroundColor);
}

/** 데스크톱 셸 한 화면 검사 (C3) */
async function expectDesktopShell(page: Page, role: ShellRole, screen: number, where: string): Promise<void> {
  const menu = sidebarMenuOf(role);
  const sb = sidebar(page);
  await expect(sb, `${where}: ${DS.component} 1`).toHaveCount(1, { timeout: 45_000 });
  await expect(sb, `${where}: ${DS.component} 보임`).toBeVisible();
  for (const f of DS.forbidden_on_desktop) await expect(page.locator(sel(f)), `${where}: ${f} 0 (forbidden_on_desktop)`).toHaveCount(0);
  await expect(page.locator(sel(TB.component)), `${where}: ${TB.component} 0`).toHaveCount(0);
  await expect(page.locator(sel(TB.item)), `${where}: ${TB.item} 0`).toHaveCount(0);
  // 메뉴: 개수 = 역할별 메뉴 (≥ min_items), 문구·순서 = desktop_shell.menu
  await expect(items(page), `${where}: ${DS.item} = ${role} 메뉴 ${menu.length}`).toHaveCount(menu.length);
  expect(menu.length, "min_items").toBeGreaterThanOrEqual(DS.min_items);
  await expect(page.locator(sel(DS.item)), `${where}: ${DS.item} 은 사이드바 안에만`).toHaveCount(menu.length);
  expect(await itemLabels(page), `${where}: 메뉴 문구·순서`).toEqual(menu);
  // 묶음 제목 (시안 sidebar-group-title): 교사 = 관리 · admin = 관리 + 학교 설정 · 학생 = 없음
  for (const t of [...GROUP_TITLES.teacher, ...GROUP_TITLES.admin]) {
    const want = GROUP_TITLES[role].includes(t) ? 1 : 0;
    await expect(sb.getByText(exact(t)), `${where}: 묶음 제목 "${t}" ${want}`).toHaveCount(want);
  }
  // 현재 화면 활성 1 = 시안 {N}-desktop 의 칠한 메뉴, aria-current=page, 바탕 = 시안 활성 색
  const want = frameActiveLabel(screen);
  const active = sb.locator(`${sel(DS.item)}[aria-current="page"]`);
  await expect(active, `${where}: 활성 메뉴 1`).toHaveCount(1);
  await expect(active, `${where}: 활성 = 시안 "${want}"`).toHaveText(exact(want));
  expect(await bg(active), `${where}: 활성 바탕 = 시안 ${ACTIVE_FILL}`).toBe(hexToRgb(ACTIVE_FILL));
  for (const label of menu.filter((l) => l !== want)) {
    expect(await bg(itemByLabel(page, label)), `${where}: "${label}" 은 활성 바탕 아님`).not.toBe(hexToRgb(ACTIVE_FILL));
  }
  // 치수: 폭 240 · radius 0 · 바탕 = 시안 app-sidebar 색 · 본문은 사이드바 오른쪽
  const box = (await sb.boundingBox())!;
  expect(Math.round(box.width), `${where}: 폭 = rules desktop_shell.width`).toBe(DS.width);
  expect(box.x, `${where}: 왼쪽 끝`).toBe(0);
  const radii = await sb.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
  });
  expect(radii, `${where}: radius = rules desktop_shell.radius`).toEqual(Array(4).fill(`${DS.radius}px`));
  expect(await bg(sb), `${where}: 바탕 = 시안 ${SIDEBAR_FILL}`).toBe(hexToRgb(SIDEBAR_FILL));
  const main = (await page.locator("main").first().boundingBox())!;
  expect(main.x, `${where}: 본문은 사이드바 오른쪽`).toBeGreaterThanOrEqual(box.x + box.width - 0.5);
  // 위 = 워드마크 + 자기 학교명 1번, 아래 = 계정 줄 "이름 · 역할" ▾ (aria-haspopup=menu)
  const me = await browserSession(page);
  await expect(sb.getByText(exact(WORDMARK)), `${where}: 워드마크 "${WORDMARK}"`).toHaveCount(1);
  const text = await sb.innerText();
  expect(text.split(me.schoolName).length - 1, `${where}: 학교명 1번`).toBe(1);
  const label = await shellAccountLabel(page, "desktop");
  const btn = shellAccountButton(page, "desktop");
  await expect(btn, `${where}: 계정 버튼 1`).toHaveCount(1);
  await expect(btn, `${where}: 계정 줄 = "${label}"`).toHaveText(exact(label));
  const bb = (await btn.boundingBox())!;
  const firstItem = (await items(page).first().boundingBox())!;
  expect(bb.y, `${where}: 계정 줄은 메뉴 아래`).toBeGreaterThan(firstItem.y);
}

// =====================================================================
// 기대값 원본
// =====================================================================

test(`[C3][S*] 기대값 원본: dev-rules desktop_shell_done · desktop_shell.screens(${DS.screens.join("·")}) 중 만든 화면 ${SHELL_SCREENS.join("·")} (아직 없음 ${PENDING_SCREENS.join("·")}) · 새 프레임 {N}-desktop 의 app-sidebar 폭·radius·메뉴 문구 = rules desktop_shell · 활성 메뉴 1 · 비활성 툴팁 "${READY_TOOLTIP}"`, () => {
  expect(SHELL_SCREENS.length, "desktop_shell_done 이면 셸 화면 있음").toBeGreaterThan(0);
  expect(SHELL_SCREENS, "dev-rules app-sidebar 화면 = 만든 셸 화면").toEqual(devRules.components[DS.component].slice().sort((a, b) => a - b));
  expect(devRules.components[DS.item].slice().sort((a, b) => a - b)).toEqual(SHELL_SCREENS);
  expect(NOT_BUILT_LABELS, "아직 없는 화면 메뉴 (QR 찾기)").toEqual(["QR 찾기"]);
  for (const s of DS.screens) {
    const frame = `${s}-desktop`;
    const sb = frameNode(frame, DS.component);
    expect(sb.width, `${frame} app-sidebar 폭`).toBe(DS.width);
    expect(sb.cornerRadius, `${frame} app-sidebar radius`).toBe(DS.radius);
    const fi = frameSidebarItems(frame);
    expect(fi.filter((i) => i.active), `${frame} 활성 1`).toHaveLength(1);
    const role: ShellRole = fi.length === sidebarMenuOf("admin").length ? "admin" : "teacher";
    expect(fi.map((i) => i.label), `${frame} 메뉴 문구·순서 = rules menu (${role})`).toEqual(sidebarMenuOf(role));
  }
  expect(sidebarMenuOf("student").length).toBeGreaterThanOrEqual(DS.min_items);
  expect(GROUP_TITLES.teacher.length).toBeGreaterThan(0);
  expect(GROUP_TITLES.admin.slice(0, GROUP_TITLES.teacher.length)).toEqual(GROUP_TITLES.teacher);
  expect(ACTIVE_FILL, "시안 활성 색은 rules highlight").toMatch(/^#/);
  expect((rules as unknown as { colors: { highlight: { values: string[] } } }).colors.highlight.values).toContain(ACTIVE_FILL);
  expect(SIDEBAR_FILL).toMatch(/^#/);
});

// =====================================================================
// 화면마다: 1440 = 사이드바 셸 / 390 = 모바일 셸 그대로
// =====================================================================

for (const screen of SHELL_SCREENS) {
  const roles = ROLES.filter((r) => canOpen(r, screen));
  test(`[C3][S${screen}] ${roles.map((r) => ROLE_LABEL[r]).join("·")} ${routeOf(screen)}: 1440 = ${DS.component} 1 · ${DS.item} = 역할별 메뉴(문구·순서 = desktop_shell.menu) · 활성 1 = 시안 "${frameActiveLabel(screen)}" · nav-pill·tab-bar 0 · 폭 ${DS.width} · radius ${DS.radius} · 본문은 오른쪽 · 학교명·계정 줄 / 390 = nav-pill 1 · tab-bar 1 · ${DS.component} 0`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    for (const role of roles) {
      const { context, page, viewport } = await openAs(browser, info, role, 13);
      try {
        const path = await pathOf(page, screen);
        const res = await page.goto(path);
        expect(res?.status(), `${ROLE_LABEL[role]} ${path} 응답`).toBe(200);
        await waitBody(page);
        expect(new URL(page.url()).pathname, `${ROLE_LABEL[role]} 화면 ${screen}: 리다이렉트 없음`).toBe(path);
        const where = `${ROLE_LABEL[role]} 화면 ${screen} (${viewport})`;
        if (viewport === "desktop") {
          await expectDesktopShell(page, role, screen, where);
          // 화면별 본문(desktop_required)은 이전된 화면만 (d5 C3)
          if (isDesktopMigrated(screen)) {
            for (const name of DS.desktop_required[String(screen)] ?? []) {
              // 화면 16 msds-summary 는 "요약 있음" 상태의 컴포넌트 (rules variants 16: no-summary · fail 상태에는 없다).
              // 실제 경로의 시약이 요약 없음·실패 상태면 그 상태의 컴포넌트가 드로어 안에 있어야 한다 — 요약 있는 상태는 c3-run-b(갤러리)에서 본다
              if (screen === 16 && name === "msds-summary" && (await page.locator(sel(name)).count()) === 0) {
                const v16 = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants["16"];
                const states = ["no-summary", "fail"].filter((k) => v16[k]);
                expect(states.length, "rules variants 16 no-summary · fail").toBe(2);
                const hit: string[] = [];
                for (const k of states) {
                  const ok = await Promise.all(v16[k].map(async (c) => (await page.locator(`${sel("detail-drawer")} ${sel(c)}`).count()) > 0));
                  if (ok.every(Boolean)) hit.push(k);
                }
                expect(hit.length, `${where}: msds-summary 없음 → 드로어가 variants 16 ${states.join("·")} 상태 (${states.map((k) => v16[k].join("+")).join(" / ")})`).toBeGreaterThan(0);
                info.annotations.push({ type: "C3 범위", description: `${where}: 이 시약은 MSDS 요약 ${hit.join("·")} 상태 — msds-summary 는 c3-run-b 갤러리에서` });
                continue;
              }
              await expect(page.locator(sel(name)).first(), `${where}: desktop_required ${name}`).toBeVisible();
            }
          } else {
            info.annotations.push({ type: "C3 범위", description: `화면 ${screen} 본문(desktop_required ${(DS.desktop_required[String(screen)] ?? []).join("·") || "없음"}) — desktop_migrated_screens 에 없음 (run b·c·d)` });
          }
        } else {
          await expectShell(page, viewport, screen, where);
          expect(TB.mobile_screens, `tab_bar.mobile_screens 에 ${screen}`).toContain(screen);
          const tabs = (await page.locator(`${sel(TB.component)} ${sel(TB.item)}`).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
          expect(tabs, `${where}: 탭 라벨`).toEqual(TB.labels);
        }
      } finally {
        await context.close();
      }
    }
  });
}

// =====================================================================
// 사이드바로 이동 · 아직 없는 화면(QR 찾기) 비활성
// =====================================================================

test(`[C3][S13] 학교A 교사: 1440 사이드바 메뉴를 누르면 그 화면으로(같은 문서) · 활성 메뉴가 따라 바뀜 · 아직 없는 화면 메뉴(${NOT_BUILT_LABELS.join("·")})는 링크가 아닌 버튼(aria-disabled) — 눌러도 이동·요청 없음 · 올리거나 포커스하면 툴팁 "${READY_TOOLTIP}" / 390 = 사이드바 메뉴 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 13);
  try {
    await waitBody(page);
    if (viewport === "mobile") {
      await expectShell(page, viewport, 13, "390");
      for (const l of NOT_BUILT_LABELS) await expect(page.getByText(l, { exact: true }), `390: 사이드바 메뉴 "${l}" 없음`).toHaveCount(0);
      return;
    }
    await expectDesktopShell(page, "teacher", 13, "홈");
    // 이동: 시약 → 기록 → 홈 (사이드바 링크 href = dev-rules routes)
    await page.evaluate(() => ((window as unknown as { __c3: boolean }).__c3 = true));
    for (const screen of [2, 10, 13]) {
      const label = frameActiveLabel(screen);
      const link = itemByLabel(page, label);
      await expect(link, `"${label}" 링크`).toHaveAttribute("href", routeOf(screen));
      await expect.poll(() => link.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "하이드레이션", timeout: 30_000 }).toBe(true);
      await link.click();
      await page.waitForURL((u) => u.pathname === routeOf(screen), { timeout: 45_000 });
      await waitBody(page);
      await expect(sidebar(page).locator(`${sel(DS.item)}[aria-current="page"]`), `화면 ${screen}: 활성 = "${label}"`).toHaveText(exact(label));
      expect(await page.evaluate(() => (window as unknown as { __c3?: boolean }).__c3 === true), `화면 ${screen}: 문서를 다시 받지 않았다`).toBe(true);
    }
    // 아직 없는 화면 메뉴
    const requests: string[] = [];
    page.on("request", (r) => requests.push(new URL(r.url()).pathname));
    for (const label of NOT_BUILT_LABELS) {
      const it = itemByLabel(page, label);
      await expect(it, `"${label}" 1`).toHaveCount(1);
      expect(await it.evaluate((el) => el.tagName), `"${label}" 은 버튼`).toBe("BUTTON");
      await expect(it, `"${label}" href 없음`).not.toHaveAttribute("href", /.*/);
      await expect(it).toHaveAttribute("aria-disabled", "true");
      const tip = page.getByRole("tooltip").filter({ hasText: exact(READY_TOOLTIP) });
      await expect(tip, "툴팁은 평소 숨김").toBeHidden();
      await it.hover();
      await expect(tip, `올리면 툴팁 "${READY_TOOLTIP}"`).toBeVisible();
      const describedBy = await it.getAttribute("aria-describedby");
      expect(describedBy, "툴팁이 버튼 설명 (aria-describedby)").toBeTruthy();
      expect(await tip.getAttribute("id")).toBe(describedBy);
      const before = page.url();
      const n = requests.length;
      // aria-disabled 는 Playwright 가 "누를 수 없음"으로 보고 기다리므로 강제로 누른다 (사용자가 눌러 보는 것과 같다)
      await it.click({ force: true });
      await page.waitForLoadState("networkidle");
      expect(page.url(), "눌러도 주소 그대로").toBe(before);
      expect(requests.slice(n).filter((p) => p !== before && !p.startsWith("/_next")), "눌러도 화면 요청 없음").toEqual([]);
      // 키보드 포커스로도 툴팁
      await page.mouse.move(info.project.use.viewport!.width - 5, info.project.use.viewport!.height - 5);
      await expect(tip).toBeHidden();
      await it.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(it).toBeFocused();
      await expect(tip, `포커스하면 툴팁 "${READY_TOOLTIP}"`).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// 데스크톱 page-head (run a 최소 보완): 4 사용 기록 · 5 실험 매뉴얼 · 11 시약장
// =====================================================================

/** 제목 = 새 프레임 문구, 뒤로 = 모바일 nav-pill 과 같은 대상 (4 → 화면 2, 5 → 화면 6, 11 = 최상위 메뉴라 없음) */
const PAGE_HEADS: { screen: number; title: string; back: number | null; role: ShellRole }[] = [
  { screen: 4, title: frameTexts("4-desktop", "drawer-title")[0], back: 2, role: "student" },
  { screen: 5, title: frameTexts("5-desktop", "page-title")[0], back: 6, role: "teacher" },
  { screen: 11, title: frameTexts("11-desktop", "page-title")[0], back: null, role: "teacher" },
];

for (const h of PAGE_HEADS) {
  test(`[C3][S${h.screen}] 학교A ${ROLE_LABEL[h.role]} ${routeOf(h.screen)}: 1440 제목 "${h.title}"(새 프레임) 보이는 것 1 · 뒤로 ${h.back === null ? "없음" : `→ ${routeOf(h.back)} (누르면 도착)`}${h.screen === 4 ? " (화면 4 1440 = 드로어 제목 — 드로어 뒤로는 c3-run-b)" : ""} · nav-pill 0 / 390 = nav-pill 뒤로 대상 같음`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    expect(h.title, "프레임 제목").toBeTruthy();
    const { context, page, viewport } = await openAs(browser, info, h.role, h.screen);
    try {
      await waitBody(page);
      const back = page.getByRole("link", { name: "뒤로", exact: true }).filter({ visible: true });
      if (viewport === "desktop" && isDesktopMigrated(h.screen) && h.screen === 4) {
        // 화면 4 는 run b 로 이전 (d7 §23 세부): 1440 = 시약 목록 옆 드로어 — 제목은 드로어 drawer-title, 뒤로 = drawer-nav "‹ 시약 상세"(시약을 고른 경우)
        // → c3-run-b.spec 이 본다. 여기서는 셸만: nav-pill 0 · 본문(드로어) 제목 "${h.title}" 1 · 사이드바 오른쪽
        await expect(page.locator(sel("nav-pill")), "nav-pill 0").toHaveCount(0);
        const d = page.locator(sel("detail-drawer"));
        await expect(d, "detail-drawer 1").toHaveCount(1);
        await expect(d.getByRole("heading", { name: h.title, exact: true }), `드로어 제목 "${h.title}"`).toBeVisible();
        const sb = (await sidebar(page).boundingBox())!;
        expect((await d.boundingBox())!.x, "드로어는 본문(사이드바 오른쪽)").toBeGreaterThanOrEqual(sb.x + sb.width);
        return;
      }
      if (viewport === "desktop") {
        await expect(page.locator(sel("nav-pill")), "nav-pill 0").toHaveCount(0);
        // 본문(main) 안 제목 — 사이드바 메뉴 글자(예: "실험 매뉴얼" · "시약장")와 따로 센다
        // 화면 읽기 전용 h1(1px 잘라 숨김, sr-only)은 "보이는 제목"으로 세지 않는다
        const all = page.locator("main").getByText(h.title, { exact: true });
        const seen = await all.evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== "hidden";
          }),
        );
        expect(seen.filter(Boolean).length, `본문 제목 "${h.title}" 눈에 보이는 것 1`).toBe(1);
        const t = (await all.nth(seen.indexOf(true)).boundingBox())!;
        const sb = (await sidebar(page).boundingBox())!;
        expect(t.x, "제목은 본문(사이드바 오른쪽)").toBeGreaterThanOrEqual(sb.x + sb.width);
        // 제목이 h1 으로 두 번 읽히지 않는다 (보이는 h1 + 숨은 h1 이 함께 있지 않다)
        const h1 = await page.locator("h1").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.trim()).filter((s) => s !== ""));
        expect(h1.filter((s) => s === h.title).length, `h1 "${h.title}" 은 최대 1`).toBeLessThanOrEqual(1);
      } else {
        await expect(page.locator(sel("nav-pill")), "390 nav-pill 1").toHaveCount(1);
      }
      if (h.back === null) {
        await expect(back, "뒤로 없음").toHaveCount(0);
        return;
      }
      await expect(back, "보이는 뒤로 1").toHaveCount(1);
      await expect(back, `뒤로 → ${routeOf(h.back)}`).toHaveAttribute("href", routeOf(h.back));
      if (viewport === "desktop") {
        const bb = (await back.boundingBox())!;
        const sb = (await sidebar(page).boundingBox())!;
        expect(bb.x, "뒤로는 본문 안").toBeGreaterThanOrEqual(sb.x + sb.width);
        await expect.poll(() => back.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "하이드레이션", timeout: 30_000 }).toBe(true);
        await back.click();
        await page.waitForURL((u) => u.pathname === routeOf(h.back!), { timeout: 45_000 });
        await waitBody(page);
        await expect(sidebar(page).locator(`${sel(DS.item)}[aria-current="page"]`), "도착 화면 활성").toHaveText(exact(frameActiveLabel(h.back)));
      }
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 사이드바 계정 메뉴 → 로그아웃 (일회용 학교 admin — 공용 계정 세션을 끊지 않는다)
// =====================================================================

test.describe("일회용 계정 로그아웃", () => {
  test.describe.configure({ mode: "default" });

  test.afterAll(async ({}, info) => {
    info.setTimeout(300_000);
    if (!HAS_SERVICE) return;
    expect(await sweep(GROUP, info.project.name), "일회용 계정·학교 잔여물").toEqual(NO_RESIDUE);
  });

  test(`[C3][S*] 일회용 admin 1440: 사이드바 계정 줄 "이름 · admin" ▾ (aria-haspopup=menu) → 메뉴가 위로 열림 · menuitem "${LOGOUT_LABEL}" 1개 · Esc 로 닫힘 → 다시 열어 "${LOGOUT_LABEL}" → POST ${LOGOUT_API} 1건 → ${routeOf(1)} · 세션 쿠키 없음 · 앱 주소 → ${routeOf(1)} / 390 = 계정 메뉴는 nav-pill (사이드바 0)`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    if (info.project.name === "mobile") {
      // 390 은 변경 없음 — 계정 메뉴는 nav-pill 학교명 (로그아웃 흐름은 shell-logout.spec.ts). 공용 admin 은 보기만
      const { context, page, viewport } = await openAs(browser, info, "admin", 10);
      try {
        await waitBody(page);
        await expectShell(page, viewport, 10, "390");
        await expect(shellAccountButton(page, viewport), "390 계정 버튼 = nav-pill 학교명").toHaveText(exact((await browserSession(page)).schoolName));
      } finally {
        await context.close();
      }
      return;
    }
    expect(HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY (일회용 계정 준비·정리)").toBe(true);
    const school = await tempSchool(info, GROUP);
    forgetSession(school.admin.id);
    const { context, page, viewport } = await openTemp(browser, info, school.admin, routeOf(10));
    try {
      await waitBody(page);
      const menu = page.getByRole("menu");
      const btn = shellAccountButton(page, viewport);
      await expectDesktopShell(page, "admin", 10, "일회용 admin 화면 10");
      await expect(btn).toHaveText(exact(`${school.admin.name} · admin`));
      await expect(btn).toHaveAttribute("aria-expanded", "false");
      await expect(menu).toHaveCount(0);
      await expect(async () => {
        if (!(await menu.isVisible())) await btn.click({ timeout: 5_000 });
        await expect(menu).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await expect(btn).toHaveAttribute("aria-expanded", "true");
      expect(await sidebar(page).evaluate((s, m) => !!m && s.contains(m), await menu.elementHandle()), "메뉴는 사이드바 안").toBe(true);
      const mb = (await menu.boundingBox())!;
      const bb = (await btn.boundingBox())!;
      expect(mb.y + mb.height, "메뉴는 계정 줄 위로 열림").toBeLessThanOrEqual(bb.y + 1);
      const vh = page.viewportSize()!.height;
      expect(mb.y, "메뉴가 화면 안").toBeGreaterThanOrEqual(0);
      expect(mb.y + mb.height).toBeLessThanOrEqual(vh);
      await expect(menu.getByRole("menuitem"), "항목 1개").toHaveCount(1);
      await expect(menu.getByRole("menuitem")).toHaveText(exact(LOGOUT_LABEL));
      await page.keyboard.press("Escape");
      await expect(menu, "Esc 로 닫힘").toHaveCount(0);
      await expect(btn, "포커스는 계정 버튼").toBeFocused();

      let posts = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname === LOGOUT_API) posts += 1;
      });
      await btn.click();
      await expect(menu).toBeVisible();
      const [res] = await Promise.all([
        page.waitForResponse((r) => new URL(r.url()).pathname === LOGOUT_API, { timeout: 30_000 }),
        menu.getByRole("menuitem", { name: exact(LOGOUT_LABEL) }).click(),
      ]);
      expect(res.request().method()).toBe("POST");
      expect(res.status()).toBe(200);
      await page.waitForURL((u) => u.pathname === routeOf(1), { timeout: 45_000 });
      await expect(page.locator(sel("ex-auth-form-card")).first(), "로그인 화면").toBeVisible({ timeout: 30_000 });
      expect(posts, "로그아웃 요청 1건").toBe(1);
      const cookies = (await context.cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name) && c.value !== "");
      expect(cookies, "세션 쿠키 없음").toEqual([]);
      await expect(sidebar(page), "로그인 화면 사이드바 0").toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(school.name);
      await page.goto(routeOf(10));
      await page.waitForURL((u) => u.pathname === routeOf(1), { timeout: 30_000 });
    } finally {
      await context.close();
    }
  });
});

// =====================================================================
// 범위 밖(다음 run) — 로그인 전 1·14·15 · 둘러보기: 이전 전에는 예전 셸 그대로, 이전되면 C3 새 규칙
// =====================================================================

type PreLogin = { screens: number[]; component: string; forbidden: string[]; desktop_required: Record<string, string[]> };
const PRE = (DS as unknown as { pre_login: PreLogin }).pre_login;

test(`[C3][S*] 로그인 전 ${PRE.screens.join("·")} · 둘러보기 ${rules.guest.screens.join("·")}: desktop_migrated_screens 에 든 화면은 C3(로그인 전 = ${PRE.component} 1 · ${PRE.forbidden.join("·")} 0 / 둘러보기 1440 = ${DS.component} 1 · ${rules.guest.lock} ${rules.guest.tab_locks}), 아직이면 셸 run a 가 바꾸지 않았다(nav-pill 1 · ${DS.component}·${DS.item} 0)`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const demo = (await demoReagents())[0];
  const guestPath: Record<number, string> = {
    13: devRules.routes["13-guest"],
    2: devRules.routes["2-guest"],
    3: guestDetailPath(demo.id),
    16: devRules.routes["16-guest"].replace(/\[[^\]]+\]/, demo.id),
  };
  const targets: { screen: number; path: string; kind: "pre" | "guest" }[] = [
    ...PRE.screens.map((s) => ({ screen: s, path: routeOf(s), kind: "pre" as const })),
    ...rules.guest.screens.filter((s) => guestPath[s]).map((s) => ({ screen: s, path: guestPath[s], kind: "guest" as const })),
  ];
  const viewport = info.project.name as ViewportName;
  const context = await anonContext(browser, info);
  try {
    const page = await context.newPage();
    for (const t of targets) {
      const res = await page.goto(t.path);
      expect(res?.status(), `${t.path} 응답`).toBe(200);
      await page.waitForLoadState("load");
      await expect(page.locator("main, body").first()).toBeVisible();
      const where = `${t.kind === "pre" ? "로그인 전" : "둘러보기"} 화면 ${t.screen} ${t.path} (${viewport})`;
      // 둘러보기(/demo) 데스크톱은 로그인 전 1·14·15 와 함께 run d (d7 §23 "로그인 전·둘러보기 (run d)") — 같은 화면 번호(2·3·16)가
      // 로그인 화면으로 이전(run b)됐어도 둘러보기 판은 run d 표시(로그인 전 화면이 모두 이전됐을 때)를 따른다
      const migrated = t.kind === "pre" ? isDesktopMigrated(t.screen) : PRE.screens.every((x) => isDesktopMigrated(x));
      if (viewport === "desktop" && migrated) {
        if (t.kind === "pre") {
          await expect(page.locator(sel(PRE.component)), `${where}: ${PRE.component} 1`).toHaveCount(1, { timeout: 30_000 });
          for (const f of PRE.forbidden) await expect(page.locator(sel(f)), `${where}: ${f} 0`).toHaveCount(0);
          for (const n of PRE.desktop_required[String(t.screen)] ?? []) await expect(page.locator(sel(n)).first(), `${where}: ${n}`).toBeVisible();
        } else {
          await expect(sidebar(page), `${where}: ${DS.component} 1`).toHaveCount(1, { timeout: 30_000 });
          await expect(page.locator(sel(rules.guest.lock)), `${where}: ${rules.guest.lock}`).toHaveCount(rules.guest.tab_locks);
          for (const f of DS.forbidden_on_desktop) await expect(page.locator(sel(f)), `${where}: ${f} 0`).toHaveCount(0);
        }
        continue;
      }
      // 아직 이전 전 (또는 폭 390 = 변경 없음): 예전 셸
      await expect(page.locator(sel("nav-pill")), `${where}: nav-pill 1`).toHaveCount(1, { timeout: 30_000 });
      await expect(sidebar(page), `${where}: ${DS.component} 0`).toHaveCount(0);
      await expect(page.locator(sel(DS.item)), `${where}: ${DS.item} 0`).toHaveCount(0);
      if (viewport === "desktop") info.annotations.push({ type: "C3 범위", description: `${where} — ${t.kind === "pre" ? "desktop_migrated_screens 에 없음" : "둘러보기 데스크톱"} (run d)` });
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// 갤러리 (K1) — /gallery/sidebar
// =====================================================================

test(`[K1][S*] /gallery/sidebar: 역할별 ${DS.component} 3종(학생 ${sidebarMenuOf("student").length} · 교사 ${sidebarMenuOf("teacher").length} · admin ${sidebarMenuOf("admin").length}, 문구·순서 = desktop_shell.menu) · 각 활성 1 · 폭 ${DS.width} · radius ${DS.radius} · ${NOT_BUILT_LABELS.join("·")} 는 aria-disabled 버튼`, async ({ page }) => {
  await page.goto("/gallery/sidebar");
  await page.waitForLoadState("load");
  const bars = page.locator(sel(DS.component));
  await expect(bars, "사이드바 3종").toHaveCount(ROLES.length);
  const byLen = new Map<number, ShellRole>(ROLES.map((r) => [sidebarMenuOf(r).length, r]));
  const seen: ShellRole[] = [];
  for (let i = 0; i < ROLES.length; i++) {
    const bar = bars.nth(i);
    const labels = await bar.locator(sel(DS.item)).evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
    const role = byLen.get(labels.length);
    expect(role, `사이드바 ${i + 1}: 메뉴 수 ${labels.length} = 역할 메뉴`).toBeTruthy();
    expect(labels, `${role} 메뉴 문구·순서`).toEqual(sidebarMenuOf(role!));
    seen.push(role!);
    await expect(bar.locator(`${sel(DS.item)}[aria-current="page"]`), `${role} 활성 1`).toHaveCount(1);
    const box = (await bar.boundingBox())!;
    expect(Math.round(box.width), `${role} 폭`).toBe(DS.width);
    expect(await bar.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe(`${DS.radius}px`);
    for (const l of NOT_BUILT_LABELS) {
      const it = bar.locator(sel(DS.item)).filter({ has: page.getByText(l, { exact: true }) });
      expect(await it.evaluate((el) => el.tagName)).toBe("BUTTON");
      await expect(it).toHaveAttribute("aria-disabled", "true");
    }
  }
  expect(seen.sort(), "학생·교사·admin 각 1").toEqual([...ROLES].sort());
});
