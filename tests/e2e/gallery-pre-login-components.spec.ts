// 데스크톱 재구성 run d 컴포넌트 (D1) — 갤러리 /gallery/pre-login (비로그인 공개).
// 기준: design/rules.json 1.24 desktop_shell.pre_login(desktop_required[15]) · landing_rhythm(inverted_button) · footer · guest(sidebar_locks · school_name),
//       harness/dev-rules.json 1.14 components(web-header [1,14,15] · product-shot·landing-tabs·landing-section·step-flow·cta-band·web-footer [15]),
//       harness/d7-data.md §23 run d 세부, 새 프레임 1·14·15-desktop · 13-guest-desktop.
// 기대값은 규칙 파일·새 프레임에서 읽는다. 태그 [K1] 은 dev-rules test_rules 밖 (D1 실행에 포함).
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP_SHELL } from "../desktop-shell";
import { HEADER, PRE, R, frameNodes, frameOf, frameTextsIn, hexToRgb } from "./pre-login-helpers";
import { devRules, rules, sel } from "./screen-helpers";

const GALLERY = "/gallery/pre-login";
const REQ15 = PRE.desktop_required["15"] ?? [];
const GUEST_LOCKS = (rules.guest as unknown as { sidebar_locks: number }).sidebar_locks;

/** 시안 {screen}-desktop web-header 버튼 글자 (순서) */
const headerLabels = (screen: number): string[] => frameTextsIn(`${screen}-desktop`, "header-actions");

async function open(page: Page): Promise<void> {
  const res = await page.goto(GALLERY);
  expect(res?.status(), `${GALLERY} 응답`).toBe(200);
  await page.waitForLoadState("load");
  await expect(page.locator(sel(HEADER)).first()).toBeVisible({ timeout: 30_000 });
}

test(`[K1][S15] ${GALLERY}: desktop_required[15] ${REQ15.join("·")} · ${HEADER} 각 1개 이상 (dev-rules components 의 [15]·[1,14,15] 이름)`, async ({ page }) => {
  await open(page);
  for (const n of [HEADER, ...REQ15]) {
    expect(devRules.components[n], `dev-rules components ${n}`).toBeTruthy();
    expect(await page.locator(sel(n)).count(), `${GALLERY} ${n}`).toBeGreaterThanOrEqual(1);
  }
});

test(`[K1][S1] ${GALLERY}: ${HEADER} 버튼 구성 3종 = 시안 1-desktop(${headerLabels(1).join("·")}) · 14-desktop(${headerLabels(14).join("·")}) · 15-desktop(${headerLabels(15).join("·")}) · 높이·radius 0`, async ({ page }) => {
  await open(page);
  const headers = page.locator(sel(HEADER));
  const sets = await headers.evaluateAll((els) =>
    els.map((e) => [...e.querySelectorAll('[data-component^="button-"]')].map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim()).join("|")),
  );
  const want = PRE.screens.map((s) => headerLabels(s).join("|"));
  expect([...new Set(want)].length, "시안 버튼 구성 3종").toBe(3);
  expect([...sets].sort(), `${HEADER} 버튼 구성 = 시안 1·14·15`).toEqual([...want].sort());
  const fh = frameNodes("15-desktop", HEADER)[0];
  const isDesk = (page.viewportSize()?.width ?? 0) >= devRules.viewports.desktop[0];
  for (let i = 0; i < (await headers.count()); i++) {
    const h = headers.nth(i);
    expect(await h.evaluate((e) => getComputedStyle(e).borderTopLeftRadius), "radius 0").toBe("0px");
    if (isDesk) expect(Math.round((await h.boundingBox())!.height), `높이 = 시안 ${fh.height}`).toBe(fh.height);
  }
});

test(`[K1][S15] ${GALLERY}: cta-band 반전 버튼(rules landing_rhythm.inverted_button) · web-footer = rules footer.text 한 줄 · landing-tabs 글자 = 시안 탭 순서`, async ({ page }) => {
  await open(page);
  const inv = R.landing_rhythm.inverted_button;
  const fill = (/(#[0-9a-fA-F]{6})\s*채움/.exec(inv)?.[1] ?? "").toLowerCase();
  const label = (/(#[0-9a-fA-F]{6})\s*라벨/.exec(inv)?.[1] ?? "").toLowerCase();
  const outline = (/button-outline\s*=\s*(#[0-9a-fA-F]{6})/.exec(inv)?.[1] ?? "").toLowerCase();
  const band = page.locator(sel("cta-band")).first();
  const p = await band.locator(sel("button-primary")).first().evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, c: getComputedStyle(e).color }));
  expect(p.bg, "반전 button-primary 채움").toBe(hexToRgb(fill));
  expect(p.c, "반전 button-primary 라벨").toBe(hexToRgb(label));
  const o = await band.locator(sel("button-outline")).first().evaluate((e) => ({ b: getComputedStyle(e).borderTopColor, c: getComputedStyle(e).color }));
  expect(o.b, "반전 button-outline 테두리").toBe(hexToRgb(outline));
  expect(o.c, "반전 button-outline 라벨").toBe(hexToRgb(outline));
  const foot = page.locator(sel("web-footer")).first();
  expect((await foot.innerText()).replace(/\s+/g, " ").trim(), "footer 글자").toBe(R.footer.text);
  await expect(foot.locator("a"), "footer 링크 0").toHaveCount(0);
  const tabs = (await page.locator(`${sel("landing-tabs")} a`).allInnerTexts()).map((t) => t.trim());
  // 갤러리는 컴포넌트 예시 (탭 일부) — 글자는 시안 15-desktop 탭 글자 중에서, 순서 유지. 화면 15 의 전체 탭은 c3-run-d 에서 시안과 같음을 본다
  const frameTabs = frameOf("15-desktop").nodes.filter((n) => n.type === "TEXT" && n.path.includes("landing-tabs")).map((n) => n.text!.characters.trim());
  expect(tabs.length, "갤러리 landing-tabs 탭").toBeGreaterThan(0);
  expect(tabs, "갤러리 탭 = 시안 탭 글자 앞부분 (순서)").toEqual(frameTabs.slice(0, tabs.length));
});

test(`[K1][S13] ${GALLERY}: 둘러보기 ${DESKTOP_SHELL.component} — 위 "${rules.guest.school_name}" · 메뉴 = 시안 13-guest-desktop · 잠금 ${GUEST_LOCKS}(버튼) · 아래 "둘러보는 중" + 로그인`, async ({ page }) => {
  await open(page);
  const sb = page.locator(sel(DESKTOP_SHELL.component));
  await expect(sb, "둘러보기 사이드바 1").toHaveCount(1);
  await expect(sb.getByText(rules.guest.school_name, { exact: true })).toHaveCount(1);
  const want = frameOf("13-guest-desktop").nodes.filter((n) => n.type === "TEXT" && n.path.includes(DESKTOP_SHELL.item)).map((n) => n.text!.characters.trim());
  expect((await sb.locator(sel(DESKTOP_SHELL.item)).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()), "메뉴 = 시안").toEqual(want);
  await expect(sb.locator(sel(rules.guest.lock)), `잠금 ${GUEST_LOCKS}`).toHaveCount(GUEST_LOCKS);
  await expect(sb.locator(`button:has(${sel(rules.guest.lock)})`), "잠금은 버튼 안").toHaveCount(GUEST_LOCKS);
  for (const t of frameTextsIn("13-guest-desktop", "sidebar-account")) await expect(sb, `아래 "${t}"`).toContainText(t);
});
