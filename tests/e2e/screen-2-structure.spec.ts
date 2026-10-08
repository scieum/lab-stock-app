// 화면 2 (시약 목록, dev-rules.json routes["2"]) 구조 규칙: C1 · C2 · R-ui · V1
// 기대값: design/rules.json (screens_required, tab_bar, roles) · harness/dev-rules.json (viewports, components)
// 로그인은 auth-state.ts 의 역할별 storageState 를 재사용한다 (Supabase Auth 요청 최소화).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import {
  PROFILE_ROLE,
  ROLE_NAME,
  browserClient,
  browserSession,
  countComponent,
  devRules,
  guestOnlyComponents,
  roleChecks,
  routeOf,
  rules,
  sel,
} from "./screen-helpers";
import { framePath } from "../frames";
import { expectShell, isShellComponent } from "./shell-helpers";

const SCREEN = 2;
const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];
const BADGE = "badge-low-stock";

/** design/frames/{name}.json 의 노드 이름 (dev-rules components 에 있는 이름만) */
function frameNames(name: string): Set<string> {
  const j = JSON.parse(readFileSync(framePath(`${name}`), "utf8")) as { frames: { nodes: { name: string }[] }[] };
  return new Set(j.frames[0].nodes.map((n) => n.name).filter((n) => devRules.components[n]));
}
/** rules.json variants[2] (디자인 1.17: filter · filter-empty · msds-bulk) */
const VARIANTS2 = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)] ?? {};
/** 어떤 시약 이름에도 없을 검색어 (빈 결과 상태용) */
const NO_MATCH_QUERY = "없는시약zzq";

/** 시약 목록 화면이 그려질 때까지 (필터 세그먼트는 시약이 0개여도 항상 있다) */
async function waitList(page: Page): Promise<void> {
  await expect(page.locator(sel("segmented-control")).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("load");
}

/** 자기 세션(RLS)으로 읽은 재고 부족(stock < min_stock) 시약 수 */
async function lowStockCount(page: Page): Promise<number> {
  const { client } = await browserClient(page);
  const { data, error } = await client.from("reagents").select("stock, min_stock");
  expect(error, "자기 학교 reagents 조회").toBeNull();
  return (data ?? []).filter((r) => Number(r.stock) < Number(r.min_stock)).length;
}

const MSDS_BANNER = "msds-bulk-banner";

/** 자기 세션(RLS)으로 읽은 MSDS 없는(msds_url 비어 있음) 시약 수 */
async function noMsdsCount(page: Page): Promise<number> {
  const { client } = await browserClient(page);
  const { data, error } = await client.from("reagents").select("msds_url");
  expect(error, "자기 학교 reagents msds_url 조회").toBeNull();
  return (data ?? []).filter((r) => !String(r.msds_url ?? "").trim()).length;
}

// ---------- C1 ----------
for (const role of ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]}: screens_required[${SCREEN}] · dev-rules components 중 화면 ${SCREEN} 컴포넌트 표시`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    // rules.json screens_required 에 화면 2 가 있으면 그 목록도 모두 있어야 한다 (현재 없으면 dev-rules 기준만)
    const raw = rules.screens_required[String(SCREEN)];
    const required = Array.isArray(raw) ? raw : [];
    // rules.guest 의 둘러보기 전용 컴포넌트(배너·잠금·진입점)는 /demo 버전 화면 소속 — 로그인 화면에서는 0 (아래)
    const guestOnly = new Set(guestOnlyComponents());
    const fromDev = Object.entries(devRules.components)
      .filter(([, screens]) => screens.includes(SCREEN))
      .map(([n]) => n)
      .filter((n) => !guestOnly.has(n));
    expect(fromDev.length, `dev-rules components 에 화면 ${SCREEN} 컴포넌트가 있어야 함`).toBeGreaterThan(0);
    // 디자인 1.17: 기본 프레임 2-{폭} 에 없고 rules.json variants[2] 상태 프레임에만 있는 컴포넌트
    // (list-filter-sheet · storage-class-chip · filter-chip-row · ex-empty-state-card)는 기본 상태 0, 그 상태를 만들어 ≥ 1.
    // dev-rules 1.8: msds-bulk(variants[2]["msds-bulk"]) — msds-candidates 는 상태 프레임 2-msds-bulk 에만(일괄 찾기를 연 상태 → screen-2-msds-bulk.spec).
    // msds-bulk-banner 는 기본 프레임 2-{폭}(교사 시안)에도 있지만 d7 §20 상 교사·admin 이 "MSDS 없는 시약만"(?nomsds=1)을 켰을 때만 → 아래 MSDS_BANNER.
    const baseFrame = frameNames(`${SCREEN}-${info.project.name}`);
    const variantOnly = [...new Set(Object.values(VARIANTS2).flat())].filter((n) => fromDev.includes(n) && !baseFrame.has(n));
    expect(variantOnly.sort(), "variants[2] 에만 있는 화면 2 컴포넌트").toEqual(["ex-empty-state-card", "filter-chip-row", "list-filter-sheet", "msds-candidates", "storage-class-chip"]);
    expect(VARIANTS2["msds-bulk"] ?? [], "variants[2].msds-bulk 에 msds-bulk-banner").toContain(MSDS_BANNER);
    const staff = role !== "student";

    const { context, page, viewport } = await openAs(browser, info, role, SCREEN);
    try {
      await waitList(page);
      // 셸(390 nav-pill·tab-bar / 1440 app-sidebar·sidebar-item)은 폭별 기대값으로 (rules tab_bar · desktop_shell)
      await expectShell(page, viewport, SCREEN, `${ROLE_LABEL[role]} 화면 ${SCREEN}`);
      for (const name of guestOnly) {
        expect(await countComponent(page, name), `로그인 화면에 둘러보기 전용 ${name} 0개`).toBe(0);
      }
      for (const name of required) {
        expect(await countComponent(page, name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
      }
      const low = await lowStockCount(page);
      for (const name of fromDev) {
        // 셸(탭바·nav-pill·사이드바)은 위 expectShell 에서 폭별 기대값으로 봤다
        if (isShellComponent(name)) continue;
        if (name === BADGE) {
          // 재고 부족 배지는 데이터에 따라: 부족 시약이 있으면 ≥1, 없으면 0
          if (low > 0) expect(await countComponent(page, name), `${name} (부족 ${low}종)`).toBeGreaterThanOrEqual(1);
          else expect(await countComponent(page, name), `${name} (부족 0종)`).toBe(0);
          continue;
        }
        if (variantOnly.includes(name) || name === MSDS_BANNER) {
          expect(await countComponent(page, name), `${name} 기본 상태(필터 없음·시트 닫힘) 0`).toBe(0);
          continue;
        }
        expect(await countComponent(page, name), `${name}`).toBeGreaterThanOrEqual(1);
        await expect(page.locator(sel(name)).first(), `${name} 보임`).toBeVisible();
      }

      const inScope = (names: string[]) => names.filter((n) => n in devRules.components);
      // variants[2].filter: 필터 1개(정렬 = 재고 적은 순)를 적용한 목록에서 시트를 연 상태 (시안 2-filter: 칩 줄 + 시트)
      await page.goto(`${routeOf(SCREEN)}?sort=stock`);
      await waitList(page);
      await expect(page.locator(sel("filter-chip-row")), "적용 필터가 있으면 filter-chip-row").toHaveCount(1);
      await expect(async () => {
        await page.locator(`main ${sel("list-filter-button")}`).click();
        await expect(page.locator(sel("list-filter-sheet"))).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      for (const name of inScope(VARIANTS2.filter ?? [])) {
        await expect(page.locator(sel(name)).first(), `variants[2].filter ${name} 보임`).toBeVisible();
      }
      // variants[2]["filter-empty"]: 적용 필터가 있고 결과 0 (검색어와 함께 AND)
      await page.goto(`${routeOf(SCREEN)}?sort=stock&q=${encodeURIComponent(NO_MATCH_QUERY)}`);
      await waitList(page);
      for (const name of inScope(VARIANTS2["filter-empty"] ?? [])) {
        await expect(page.locator(sel(name)).first(), `variants[2].filter-empty ${name} 보임`).toBeVisible();
      }
      await expect(page.locator(sel("list-filter-sheet")), "빈 결과 상태에서 시트는 닫힘").toHaveCount(0);
      // d7 §20: "MSDS 없는 시약만"(?nomsds=1) — 교사·admin 이고 MSDS 없는 시약이 있으면 msds-bulk-banner 1, 학생(R5)은 0. 후보 시트는 열지 않음
      const noMsds = await noMsdsCount(page);
      await page.goto(`${routeOf(SCREEN)}?nomsds=1`);
      await waitList(page);
      await expect(page.locator(sel(MSDS_BANNER)), `?nomsds=1 ${MSDS_BANNER} (${staff ? "교사·admin" : "학생 R5"}, MSDS 없음 ${noMsds}종)`).toHaveCount(staff && noMsds > 0 ? 1 : 0);
      expect(await countComponent(page, "msds-candidates"), "띠만 — 후보 시트 닫힘").toBe(0);
    } finally {
      await context.close();
    }
  });
}

// ---------- C2 ----------
for (const role of ROLES) {
  test(`[C2][S${SCREEN}] ${ROLE_LABEL[role]}: 탭바 = rules.json tab_bar 기준 (390 표시·항목 수·라벨 순서, 1440 미표시)`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const tb = rules.tab_bar;
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN);
    try {
      await waitList(page);
      const shown = viewport === "mobile" && tb.mobile_screens.includes(SCREEN);
      await expect(page.locator(sel(tb.component)), `${viewport} ${tb.component}`).toHaveCount(shown ? 1 : 0);
      await expect(page.locator(sel(tb.item)), `${viewport} ${tb.item}`).toHaveCount(shown ? tb.items : 0);
      if (shown) {
        expect(tb.labels.length, "rules.json tab_bar labels 수 = items").toBe(tb.items);
        await expect(page.locator(sel(tb.component))).toBeVisible();
        const items = page.locator(`${sel(tb.component)} ${sel(tb.item)}`);
        await expect(items, "tab-item 은 tab-bar 안에").toHaveCount(tb.items);
        const labels = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
        expect(labels, "탭 라벨 순서").toEqual(tb.labels);
        // 활성 탭 표시: rules.json tab_bar 에 활성 기준 항목이 없어 검사하지 않는다
      }
    } finally {
      await context.close();
    }
  });
}

// ---------- R-ui ----------
for (const role of SCHOOL_A_ROLES) {
  const roleName = ROLE_NAME[role as keyof typeof ROLE_NAME];
  const checks = roleChecks(SCREEN, roleName);
  if (checks.length === 0) continue; // 이 역할에 화면 2 에서 적용되는 roles 규칙 없음
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 시약 목록: roles ${[...new Set(checks.map((c) => c.rule))].join("·")} 개수`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitList(page);
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      for (const c of checks) {
        const n = await countComponent(page, c.component);
        if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
        else expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
      }
    } finally {
      await context.close();
    }
  });
}

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (학생)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openAs(browser, info, "student", SCREEN);
  try {
    await waitList(page).catch(() => undefined);
    await page.locator(sel("reagent-row")).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: true });
  } finally {
    await context.close();
  }
});
