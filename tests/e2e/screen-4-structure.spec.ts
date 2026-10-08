// 화면 4 (사용 기록 입력, dev-rules.json routes["4"]) 구조 규칙: C1 · C2 · R-ui · V1
// 기대값: design/rules.json (screens_required, tab_bar, roles) · harness/dev-rules.json (viewports, components)
// 로그인은 auth-state.ts 의 역할별 storageState 를 재사용한다 (Supabase Auth 요청 최소화).
// 이 파일은 제출하지 않는다 (재고 불변). ex-toast 의 제출 후 표시는 screen-4-record.spec.ts 에서 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, ROLE_NAME, browserSession, countComponent, devRules, roleChecks, rules, sel } from "./screen-helpers";
import { CARD, SCREEN, TOAST, seedOwnReagents, submitButton, usagePath, waitUsage } from "./screen-4-helpers";
import { framePath } from "../frames";
import { SHELL_COMPONENTS, expectShell, isShellComponent } from "./shell-helpers";
import { deskOnlyComponents } from "../desktop-shell";
import { DRAWER, countScoped, drawer, frameNamesIn, mobileOnlyOf, screenScope } from "./desk-helpers";

const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];

/** design/frames/{name}.json 의 노드 이름 (dev-rules components 에 있는 이름만) */
function frameNames(name: string): Set<string> {
  const j = JSON.parse(readFileSync(framePath(`${name}`), "utf8")) as { frames: { nodes: { name: string }[] }[] };
  return new Set(j.frames[0].nodes.map((n) => n.name).filter((n) => devRules.components[n]));
}
/** rules.json variants[4] (디자인 1.17: "past-date" = usage-date + past-date-note) */
const VARIANTS4 = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)] ?? {};
/** 한국 날짜 "YYYY-MM-DD" (오늘 − days) */
const seoulDaysAgo = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - days * 86_400_000));

/** rules.json roles 상 이 역할에 0개여야 하는 컴포넌트 (C1 존재 검사에서 제외) */
function forbiddenFor(role: Role): Set<string> {
  const name = role === "schoolB" ? "교사" : ROLE_NAME[role as keyof typeof ROLE_NAME];
  return new Set(roleChecks(SCREEN, name).filter((c) => c.op === "max" && c.value === 0).map((c) => c.component));
}

// ---------- C1 ----------
for (const role of ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]}: screens_required[${SCREEN}] · dev-rules components 중 화면 ${SCREEN} 컴포넌트 표시 (${TOAST} 는 제출 전 0개) · variants 상태 컴포넌트는 그 상태에서(past-date: 지난 날짜를 고르면)`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const raw = rules.screens_required[String(SCREEN)];
    const required = Array.isArray(raw) ? raw : [];
    const forbidden = forbiddenFor(role);
    const fromDev = Object.entries(devRules.components)
      .filter(([, screens]) => screens.includes(SCREEN))
      .map(([n]) => n);
    expect(fromDev.length, `dev-rules components 에 화면 ${SCREEN} 컴포넌트가 있어야 함`).toBeGreaterThan(0);
    expect(fromDev, `${TOAST} 는 화면 ${SCREEN} 컴포넌트 (제출 후 검사는 screen-4-record)`).toContain(TOAST);
    // 디자인 1.17: 기본 프레임 4-{폭} 에 없고 rules.json variants[4] 상태 프레임에만 있는 컴포넌트(past-date-note)는 기본 상태 0, 그 상태에서 ≥ 1
    // 데스크톱 재구성 run b (d7 §23 세부): 1440 의 화면 4 = 시약 목록 옆 오른쪽 detail-drawer — 본문은 드로어 안(뒤 목록은 화면 2).
    // 1440 기본 프레임 = 새 프레임 4-desktop 의 detail-drawer 아래, 개수도 드로어 안. 폭 전용: 390 reagent-detail-card / 1440 detail-drawer
    const desk = info.project.name === "desktop";
    const deskOnly = deskOnlyComponents();
    const mobileOnly = mobileOnlyOf(SCREEN, SHELL_COMPONENTS);
    expect(mobileOnly, "새 프레임: 화면 4 모바일 전용 = reagent-detail-card").toEqual([CARD]);
    const widthOff = desk ? mobileOnly : deskOnly;
    const baseFrame = desk ? frameNamesIn(`${SCREEN}-desktop`, DRAWER) : frameNames(`${SCREEN}-${info.project.name}`);
    const variantOnly = [...new Set(Object.values(VARIANTS4).flat())].filter((n) => fromDev.includes(n) && !baseFrame.has(n));
    expect(variantOnly, "variants[4] 에만 있는 화면 4 컴포넌트").toContain("past-date-note");

    const { school, own } = seedOwnReagents(role);
    const pick = own[0];
    const { context, page, response, viewport } = await openAs(browser, info, role, SCREEN, usagePath(pick.id));
    try {
      expect(response?.status(), "자기 학교 시약 사용 기록 화면 응답").toBe(200);
      await waitUsage(page, true);
      // 셸(390 nav-pill·탭바 / 1440 app-sidebar·sidebar-item)은 폭별 기대값으로 (rules tab_bar · desktop_shell)
      await expectShell(page, viewport, SCREEN, `${ROLE_LABEL[role]} 화면 ${SCREEN}`);
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);
      // 고른 시약명: 390 = reagent-detail-card / 1440 = 드로어 제목 아래 캡션 (시안 4-desktop drawer-title "에탄올 · 현재 1,200 mL")
      if (desk) await expect(drawer(page).locator('[data-name="drawer-title"]'), "드로어 캡션에 고른 시약명").toContainText(pick.name);
      else await expect(page.locator(sel(CARD)).first(), "카드에 고른 시약명").toContainText(pick.name);
      const scope = screenScope(page, SCREEN, viewport);
      const countComponent = (_p: unknown, name: string) => countScoped(scope, name);
      // 하이드레이션 뒤 맞지 않는 폭의 사본이 빠질 때까지 (서버 HTML 에는 두 폭 모두 있다)
      for (const name of widthOff) await expect(page.locator(sel(name)), `${name} — ${desk ? "모바일" : "데스크톱"} 전용 (폭 ${viewport}: 0)`).toHaveCount(0, { timeout: 30_000 });

      for (const name of required) {
        if (forbidden.has(name)) continue;
        expect(await countComponent(page, name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
      }
      const appEx = (rules as unknown as { app_exceptions: Record<string, string> }).app_exceptions;
      for (const name of fromDev) {
        // 셸은 위 expectShell 에서 폭별 기대값으로 봤다
        if (isShellComponent(name) || widthOff.includes(name)) continue;
        // 셸 예외(nav-account-menu — 1440 은 사이드바 계정 줄)는 드로어 밖: 문서 전체에서 1
        if (name in appEx) {
          expect(await countScoped(page.locator("body"), name), `셸 ${name} = 1`).toBe(1);
          continue;
        }
        if (forbidden.has(name)) {
          expect(await countComponent(page, name), `${name} (roles 상 ${ROLE_LABEL[role]} 0)`).toBe(0);
          continue;
        }
        if (name === TOAST) {
          // 저장 성공 후에만 나타나는 상태 컴포넌트 — 제출 전에는 없어야 한다
          expect(await countComponent(page, name), `${name} 제출 전`).toBe(0);
          continue;
        }
        if (variantOnly.includes(name)) {
          expect(await countComponent(page, name), `${name} 기본 상태(사용일 = 오늘) 0`).toBe(0);
          continue;
        }
        expect(await countComponent(page, name), `${name}`).toBeGreaterThanOrEqual(1);
        if (desk && name === DRAWER) await expect(scope, `${name} 보임`).toBeVisible();
        else await expect(scope.locator(sel(name)).first(), `${name} 보임`).toBeVisible();
      }
      // 사용량 입력(text-input 안)과 저장 버튼(button-primary) — 390 은 폼 안, 1440 은 드로어 아래 drawer-actions(form 속성으로 이어짐)
      await expect(page.locator(`main ${sel("text-input")} input[name="amount"]`), "사용량 text-input").toHaveCount(1);
      await expect(submitButton(page), "저장 button-primary").toHaveCount(1);
      if (desk) {
        const formId = await page.locator('main input[name="amount"]').evaluate((el) => (el as HTMLInputElement).form?.id ?? "");
        expect(formId, "사용량 칸은 id 있는 폼 안").not.toBe("");
        await expect(submitButton(page), "저장 버튼은 그 폼을 제출 (form 속성)").toHaveAttribute("form", formId);
      }

      // variants[4] 상태: 사용일을 어제(한국 날짜)로 고르면 그 상태의 컴포넌트가 모두 보인다 (저장하지 않는다)
      await page.locator(`main ${sel("usage-date")} input`).fill(seoulDaysAgo(1));
      for (const [state, names] of Object.entries(VARIANTS4)) {
        for (const name of names) {
          await expect(page.locator(sel(name)).first(), `variants[4].${state} ${name} 보임`).toBeVisible();
          expect(await countComponent(page, name), `variants[4].${state} ${name}`).toBeGreaterThanOrEqual(1);
        }
      }
      expect(await countComponent(page, TOAST), `${TOAST} (저장 안 함)`).toBe(0);
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
