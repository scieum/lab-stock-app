// 화면 2 (시약 목록, dev-rules.json routes["2"]) 구조 규칙: C1 · C2 · R-ui · V1
// 기대값: design/rules.json (screens_required, tab_bar, roles) · harness/dev-rules.json (viewports, components)
// 로그인은 auth-state.ts 의 역할별 storageState 를 재사용한다 (Supabase Auth 요청 최소화).
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
  roleChecks,
  rules,
  sel,
} from "./screen-helpers";

const SCREEN = 2;
const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];
const BADGE = "badge-low-stock";

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

// ---------- C1 ----------
for (const role of ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]}: screens_required[${SCREEN}] · dev-rules components 중 화면 ${SCREEN} 컴포넌트 표시`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    // rules.json screens_required 에 화면 2 가 있으면 그 목록도 모두 있어야 한다 (현재 없으면 dev-rules 기준만)
    const raw = rules.screens_required[String(SCREEN)];
    const required = Array.isArray(raw) ? raw : [];
    const fromDev = Object.entries(devRules.components)
      .filter(([, screens]) => screens.includes(SCREEN))
      .map(([n]) => n);
    expect(fromDev.length, `dev-rules components 에 화면 ${SCREEN} 컴포넌트가 있어야 함`).toBeGreaterThan(0);

    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitList(page);
      for (const name of required) {
        expect(await countComponent(page, name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
      }
      const low = await lowStockCount(page);
      for (const name of fromDev) {
        // 탭바는 C2 에서 폭별 기대값으로 본다
        if (name === rules.tab_bar.component || name === rules.tab_bar.item) continue;
        if (name === BADGE) {
          // 재고 부족 배지는 데이터에 따라: 부족 시약이 있으면 ≥1, 없으면 0
          if (low > 0) expect(await countComponent(page, name), `${name} (부족 ${low}종)`).toBeGreaterThanOrEqual(1);
          else expect(await countComponent(page, name), `${name} (부족 0종)`).toBe(0);
          continue;
        }
        expect(await countComponent(page, name), `${name}`).toBeGreaterThanOrEqual(1);
        await expect(page.locator(sel(name)).first(), `${name} 보임`).toBeVisible();
      }
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
