// 앱 404 두 종류 — C1 · C2 · C3 · N1-ui · V1 (390 · 1440).
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §25 "앱 404"(로그인 후 = 앱 셸 안 카드 + 홈으로 · 뒤로, 로그인 전 = web-header/nav-pill
//   + 처음으로(→ /), 다른 학교 · 삭제된 시약 404 도 같은 카드), design/rules.json 1.26 not_found(card · in_app · pre_login) · variants 1 · 13
//   not-found, 새 프레임 1-not-found-* · 13-not-found-*.
// 공용 학교 A 교사 계정 · 비로그인 · 일회용 학교(삭제된 시약 — 보관은 그 학교 교사 세션의 DB 함수)로 본다.
import { test, expect, type Page } from "@playwright/test";
import { openAs } from "./auth-state";
import { devRules, routeOf, rules, sel } from "./screen-helpers";
import { newFrame } from "./desk-helpers";
import { openGuest } from "./guest-helpers";
import { seedReagents, seedSchoolOf } from "./screen-3-helpers";
import { HAS_SERVICE, clientFor, openTemp } from "./screen-8-helpers";
import { makeFixture } from "./screen-11-helpers";
import { NO_SENSOR_RESIDUE, cleanupSensors, quotes } from "./sensor-helpers";

test.describe.configure({ mode: "default" });

type NotFoundRules = { card: string; in_app: string; pre_login: string };
const NF = (rules as unknown as { not_found: NotFoundRules }).not_found;
const [TITLE, BODY] = quotes(NF.card);
const [HOME, BACK] = quotes(NF.in_app);
const [START] = quotes(NF.pre_login);
const MISSING = "/e2e-no-such-page-404";
const GROUP = "nf404";
const STORAGE = (rules as unknown as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;

const card = (page: Page) => page.locator(sel("ex-empty-state-card")).filter({ hasText: TITLE });

/** 상태 프레임 {screen}-not-found-{vp} 의 dev-rules 화면 컴포넌트 수 ≤ 화면 (탭바 · 사이드바 셸은 위에서 따로 본다) */
async function expectFrameComponents(page: Page, screen: 1 | 13, vp: string): Promise<void> {
  const nodes = newFrame(`${screen}-not-found-${vp}`);
  const names = [...new Set(nodes.map((n) => n.name))].filter((n) => (devRules.components[n] ?? []).includes(screen));
  expect(names.length, `${screen}-not-found-${vp} 컴포넌트`).toBeGreaterThan(0);
  for (const n of names) {
    const want = nodes.filter((x) => x.name === n).length;
    expect(await page.locator(sel(n)).count(), `${n} ≥ 시안 ${screen}-not-found-${vp} ${want}`).toBeGreaterThanOrEqual(want);
  }
}

async function expectCard(page: Page, what: string): Promise<void> {
  await expect(card(page), `${what}: ex-empty-state-card '${TITLE}'`).toHaveCount(1, { timeout: 45_000 });
  await expect(card(page), `${what}: 본문`).toContainText(BODY);
}

test(`[C1][S13] [C1][S1] 기대값 원본: rules not_found 카드('${TITLE}' · '${BODY}') · 로그인 후 '${HOME}' + '${BACK}' · 로그인 전 '${START}' = 프레임 13-not-found · 1-not-found · variants`, () => {
  expect(rules.variants["1"]["not-found"], "variants 1.not-found").toEqual(["ex-empty-state-card"]);
  expect(rules.variants["13"]["not-found"], "variants 13.not-found").toEqual(["ex-empty-state-card"]);
  for (const vp of ["mobile", "desktop"]) {
    const app = newFrame(`13-not-found-${vp}`).filter((n) => n.text && n.path.includes("ex-empty-state-card")).map((n) => n.text!.characters);
    expect(app, `13-not-found-${vp} 글자`).toEqual([TITLE, BODY, HOME, BACK]);
    const pre = newFrame(`1-not-found-${vp}`).filter((n) => n.text && n.path.includes("ex-empty-state-card")).map((n) => n.text!.characters);
    expect(pre, `1-not-found-${vp} 글자`).toEqual([TITLE, BODY, START]);
  }
  expect(NF.in_app).toMatch(/button-primary '홈으로' \+ button-outline '뒤로'/);
  expect(NF.pre_login).toMatch(/button-primary '처음으로'\(→15\)/);
});

test(`[C1][S1] [C2][S1] 로그인 전 없는 주소: 404 · 프레임 1-not-found 컴포넌트(web-header 버튼 포함) · 카드 '${TITLE}' · button-primary '${START}' → / (랜딩) · 탭바 · 사이드바 0 · 390 nav-pill / 1440 web-header · V1`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const g = await openGuest(browser, info, MISSING);
  try {
    const page = g.page;
    expect(g.response?.status(), "404").toBe(404);
    await expectCard(page, "로그인 전");
    const primary = card(page).locator(sel("button-primary"));
    await expect(primary, `'${START}'`).toHaveText(START);
    await expect(card(page).locator(sel("button-outline")), "로그인 전 '뒤로' 없음").toHaveCount(0);
    for (const c of ["tab-bar", "app-sidebar", "nav-account-menu"]) await expect(page.locator(sel(c)), `${c} 0`).toHaveCount(0, { timeout: 45_000 });
    if (info.project.name === "desktop") {
      await expect(page.locator(sel("web-header")), "1440 web-header 1").toHaveCount(1);
      await expect(page.locator(sel("nav-pill")), "1440 nav-pill 0").toHaveCount(0);
    } else {
      await expect(page.locator(sel("nav-pill")), "390 nav-pill 1").toHaveCount(1);
      await expect(page.locator(sel("web-header")), "390 web-header 0").toHaveCount(0);
    }
    await expectFrameComponents(page, 1, info.project.name);
    await page.screenshot({ path: `test-results/v1-1-not-found-${info.project.name}.png` });
    await primary.click();
    await expect(page, `'${START}' → /`).toHaveURL(/\/$/, { timeout: 45_000 });
    await expect(page.locator(sel("landing-hero")).first(), "랜딩(화면 15)").toBeVisible({ timeout: 45_000 });
  } finally {
    await g.context.close();
  }
});

test(`[C1][S13] [C2][S13] [C3][S13] 로그인 후 없는 주소: 404 · 앱 셸 안 카드 '${TITLE}' · '${HOME}'(→ /) + '${BACK}'(→ 앞 화면) · 390 nav-pill + tab-bar 1 · tab-item 4 / 1440 app-sidebar 1 · 현재 메뉴 없음 · V1`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { page, context } = await openAs(browser, info, "teacher", 2);
  try {
    await page.waitForLoadState("load");
    const res = await page.goto(MISSING);
    expect(res?.status(), "404").toBe(404);
    await expectCard(page, "로그인 후");
    await expect(card(page).locator(sel("button-primary")), `'${HOME}'`).toHaveText(HOME);
    await expect(card(page).locator(sel("button-outline")), `'${BACK}'`).toHaveText(BACK);
    if (info.project.name === "desktop") {
      await expect(page.locator(sel("app-sidebar")), "1440 app-sidebar 1").toHaveCount(1);
      await expect(page.locator(`${sel("app-sidebar")} ${sel("sidebar-item")}[aria-current="page"]`), "현재 메뉴 없음").toHaveCount(0);
      await expect(page.locator(sel("tab-bar")), "1440 tab-bar 0").toHaveCount(0);
    } else {
      await expect(page.locator(sel("nav-pill")), "390 nav-pill 1").toHaveCount(1);
      await expect(page.locator(sel("tab-bar")), "390 tab-bar 1").toHaveCount(1);
      await expect(page.locator(`${sel("tab-bar")} ${sel("tab-item")}`), "tab-item 4").toHaveCount(rules.tab_bar.items);
      await expect(page.locator(`${sel("tab-bar")} [aria-current="page"]`), "현재 탭 없음").toHaveCount(0);
    }
    await expect(page.locator(sel("web-header")), "로그인 후 web-header 0").toHaveCount(0);
    await expectFrameComponents(page, 13, info.project.name);
    await page.screenshot({ path: `test-results/v1-13-not-found-${info.project.name}.png` });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-component="ex-empty-state-card"] [data-component="button-outline"]');
      return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
    });
    await card(page).locator(sel("button-outline")).click();
    await expect(page, `'${BACK}' → 앞 화면 (/reagents)`).toHaveURL(new RegExp(`${routeOf(2)}(\\?|$)`), { timeout: 45_000 });
    await page.goto(MISSING);
    await expectCard(page, "다시");
    await card(page).locator(sel("button-primary")).click();
    await expect(page, `'${HOME}' → /`).toHaveURL(/\/$/, { timeout: 45_000 });
    await expect(page.locator(sel("home-summary")).first(), "홈(화면 13)").toBeAttached({ timeout: 45_000 });
  } finally {
    await context.close();
  }
});

test(`[N1-ui][S13] 다른 학교 시약 주소(/reagents · /msds · /usage/new?reagent= 학교 B 시약) = 같은 404 카드 '${TITLE}' · 학교 B 시약 이름 · 학교명 노출 0`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const b = seedSchoolOf("schoolB");
  const other = seedReagents().find((r) => r.school_id === b.id);
  expect(other, "seed 학교 B 시약").toBeTruthy();
  const { page, context } = await openAs(browser, info, "teacher", 13);
  try {
    for (const p of [`${routeOf(2)}/${other!.id}`, routeOf(16).replace(/\[[^\]]+\]/, other!.id), `${routeOf(4)}?reagent=${other!.id}`]) {
      const res = await page.goto(p);
      expect(res?.status(), `${p} = 404`).toBe(404);
      await expectCard(page, p);
      const text = await page.locator("body").innerText();
      expect(text, `${p}: 학교 B 시약 이름 노출 0`).not.toContain(other!.name);
      expect(text, `${p}: 학교 B 이름 노출 0`).not.toContain(b.name);
    }
  } finally {
    await context.close();
  }
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음");
  test.afterAll(async ({}, info) => {
    info.setTimeout(300_000);
    expect(await cleanupSensors(GROUP, info.project.name), "잔여물").toEqual(NO_SENSOR_RESIDUE);
  });

  test(`[C1][S13] 삭제된(보관) 시약 주소 = 같은 404 카드 '${TITLE}' (+ '${HOME}' · '${BACK}')`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const f = await makeFixture(info, GROUP);
    const teacher = await clientFor(f.teacher);
    const reg = await f.prep.rpc("register_reagent", { p_name: `보관404-${info.project.name}`, p_storage_class: STORAGE[0], p_stock: 1, p_unit: "g", p_intake_date: "2026-09-15", p_msds_url: null });
    expect(reg.error, `준비: register_reagent (${reg.error?.message})`).toBeNull();
    const id = ((Array.isArray(reg.data) ? reg.data[0] : reg.data) as { id: string }).id;
    const arc = await teacher.rpc("archive_reagent", { p_reagent_id: id });
    expect(arc.error, `준비: archive_reagent (${arc.error?.message})`).toBeNull();
    const t = await openTemp(browser, info, f.teacher, `${routeOf(2)}/${id}`);
    try {
      expect(t.response?.status(), "보관 시약 상세 = 404").toBe(404);
      await expectCard(t.page, "보관 시약");
      await expect(card(t.page).locator(sel("button-primary")), `'${HOME}'`).toHaveText(HOME);
      await expect(card(t.page).locator(sel("button-outline")), `'${BACK}'`).toHaveText(BACK);
      await expect(t.page.locator(sel("reagent-detail-card")), "상세 카드 0").toHaveCount(0);
    } finally {
      await t.context.close();
    }
  });
});
