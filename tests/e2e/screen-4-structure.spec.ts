// 화면 4 (사용 기록 입력, dev-rules.json routes["4"]) 구조 규칙: C1 · C2 · R-ui · V1
// 기대값: design/rules.json (screens_required, tab_bar, roles) · harness/dev-rules.json (viewports, components)
// 로그인은 auth-state.ts 의 역할별 storageState 를 재사용한다 (Supabase Auth 요청 최소화).
// 이 파일은 제출하지 않는다 (재고 불변). ex-toast 의 제출 후 표시는 screen-4-record.spec.ts 에서 본다.
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, ROLE_NAME, browserSession, countComponent, devRules, roleChecks, rules, sel } from "./screen-helpers";
import { CARD, SCREEN, TOAST, seedOwnReagents, usagePath, waitUsage } from "./screen-4-helpers";

const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];

/** rules.json roles 상 이 역할에 0개여야 하는 컴포넌트 (C1 존재 검사에서 제외) */
function forbiddenFor(role: Role): Set<string> {
  const name = role === "schoolB" ? "교사" : ROLE_NAME[role as keyof typeof ROLE_NAME];
  return new Set(roleChecks(SCREEN, name).filter((c) => c.op === "max" && c.value === 0).map((c) => c.component));
}

// ---------- C1 ----------
for (const role of ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]}: screens_required[${SCREEN}] · dev-rules components 중 화면 ${SCREEN} 컴포넌트 표시 (${TOAST} 는 제출 전 0개)`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const raw = rules.screens_required[String(SCREEN)];
    const required = Array.isArray(raw) ? raw : [];
    const forbidden = forbiddenFor(role);
    const fromDev = Object.entries(devRules.components)
      .filter(([, screens]) => screens.includes(SCREEN))
      .map(([n]) => n);
    expect(fromDev.length, `dev-rules components 에 화면 ${SCREEN} 컴포넌트가 있어야 함`).toBeGreaterThan(0);
    expect(fromDev, `${TOAST} 는 화면 ${SCREEN} 컴포넌트 (제출 후 검사는 screen-4-record)`).toContain(TOAST);

    const { school, own } = seedOwnReagents(role);
    const pick = own[0];
    const { context, page, response } = await openAs(browser, info, role, SCREEN, usagePath(pick.id));
    try {
      expect(response?.status(), "자기 학교 시약 사용 기록 화면 응답").toBe(200);
      await waitUsage(page, true);
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);
      await expect(page.locator(sel(CARD)).first(), "카드에 고른 시약명").toContainText(pick.name);

      for (const name of required) {
        if (forbidden.has(name)) continue;
        expect(await countComponent(page, name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
      }
      for (const name of fromDev) {
        // 탭바는 C2 에서 폭별 기대값으로 본다
        if (name === rules.tab_bar.component || name === rules.tab_bar.item) continue;
        if (forbidden.has(name)) {
          expect(await countComponent(page, name), `${name} (roles 상 ${ROLE_LABEL[role]} 0)`).toBe(0);
          continue;
        }
        if (name === TOAST) {
          // 저장 성공 후에만 나타나는 상태 컴포넌트 — 제출 전에는 없어야 한다
          expect(await countComponent(page, name), `${name} 제출 전`).toBe(0);
          continue;
        }
        expect(await countComponent(page, name), `${name}`).toBeGreaterThanOrEqual(1);
        await expect(page.locator(sel(name)).first(), `${name} 보임`).toBeVisible();
      }
      // 사용량 입력(text-input 안)과 저장 버튼(button-primary)이 폼 안에 있음
      await expect(page.locator(`main ${sel("text-input")} input[name="amount"]`), "사용량 text-input").toHaveCount(1);
      await expect(page.locator(`main form button[type="submit"]${sel("button-primary")}`), "저장 button-primary").toHaveCount(1);
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
    const { own } = seedOwnReagents(role);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN, usagePath(own[0].id));
    try {
      await waitUsage(page, true);
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
  if (checks.length === 0) continue;
  for (const withReagent of [true, false]) {
    test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 사용 기록 입력(${withReagent ? "?reagent 지정" : "시약 선택"}): roles ${[...new Set(checks.map((c) => c.rule))].join("·")} 개수`, async ({ browser }, info) => {
      test.setTimeout(120_000);
      const { own } = seedOwnReagents(role);
      const { context, page } = await openAs(browser, info, role, SCREEN, usagePath(withReagent ? own[0].id : undefined));
      try {
        await waitUsage(page, withReagent);
        expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
        for (const c of checks) {
          const n = await countComponent(page, c.component);
          if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
          else {
            expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
            await expect(page.locator(sel(c.component)).first(), `${c.rule} ${c.component} 보임`).toBeVisible();
          }
        }
      } finally {
        await context.close();
      }
    });
  }
}

// 학생은 rules.json 상 max 0 규칙이 있으므로 이 화면에서 검사가 실제로 생기는지 확인한다 (빈 루프로 통과 방지)
test(`[R-ui][S${SCREEN}] rules.json roles 중 학생 max 규칙이 화면 ${SCREEN} 학생 검사에 모두 포함됨`, () => {
  const studentMax = Object.entries(rules.roles).filter(([, r]) => r.role === ROLE_NAME.student && r.max !== undefined);
  expect(studentMax.length, "rules.json 학생 max 규칙").toBeGreaterThan(0);
  const checks = roleChecks(SCREEN, ROLE_NAME.student);
  for (const [id] of studentMax) expect(checks.some((c) => c.rule === id), `학생 검사에 ${id}`).toBe(true);
});

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (학생, ?reagent 학교 A seed 시약, 제출 전)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { own } = seedOwnReagents("student");
  const { context, page, viewport } = await openAs(browser, info, "student", SCREEN, usagePath(own[0].id));
  try {
    await waitUsage(page, true).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: true });
  } finally {
    await context.close();
  }
});
