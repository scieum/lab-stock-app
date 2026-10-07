// 화면 3 (시약 상세, dev-rules.json routes["3"]) 구조 규칙: C1 · C2 · R-ui · V1
// 기대값: design/rules.json (screens_required, tab_bar, roles) · harness/dev-rules.json (viewports, components)
// 로그인은 auth-state.ts 의 역할별 storageState 를 재사용한다 (Supabase Auth 요청 최소화).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import {
  PROFILE_ROLE,
  ROLE_NAME,
  browserSession,
  countComponent,
  devRules,
  guestOnlyComponents,
  roleChecks,
  rules,
  sel,
} from "./screen-helpers";
import { SCREEN, dbDetail, detailPath, seedReagents, seedSchoolOf, waitDetail } from "./screen-3-helpers";
import { watchActions } from "./screen-11-helpers";

/** design/frames/{name}.json 의 노드 이름 (dev-rules components 에 있는 이름만) */
function frameNames(name: string): Set<string> {
  const j = JSON.parse(readFileSync(join(process.cwd(), "design", "frames", `${name}.json`), "utf8")) as { frames: { nodes: { name: string }[] }[] };
  return new Set(j.frames[0].nodes.map((n) => n.name).filter((n) => devRules.components[n]));
}

const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];
const BADGE = "badge-low-stock";

/** 이 역할 계정이 볼 seed 시약 하나 (재고 부족이 있으면 그것) */
function pickFor(role: Role) {
  const school = seedSchoolOf(role);
  const own = seedReagents().filter((r) => r.school_id === school.id);
  const pick = own.find((r) => r.low) ?? own[0];
  if (!pick) throw new Error(`seed.sql 에 학교 ${school.name} 시약 없음`);
  return { school, pick };
}

/** rules.json roles 상 이 역할에 0개여야 하는 컴포넌트 (C1 존재 검사에서 제외) */
function forbiddenFor(role: Role): Set<string> {
  const name = role === "schoolB" ? "교사" : ROLE_NAME[role as keyof typeof ROLE_NAME];
  return new Set(roleChecks(SCREEN, name).filter((c) => c.op === "max" && c.value === 0).map((c) => c.component));
}

// ---------- C1 ----------
for (const role of ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]}: screens_required[${SCREEN}] · dev-rules components 중 화면 ${SCREEN} 컴포넌트 표시 (roles 로 금지된 것 제외)`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const raw = rules.screens_required[String(SCREEN)];
    const required = Array.isArray(raw) ? raw : [];
    const forbidden = forbiddenFor(role);
    // rules.guest 의 둘러보기 전용 컴포넌트(배너·잠금·진입점)는 /demo 버전 화면 소속 — 로그인 화면에서는 0 (아래)
    const guestOnly = new Set(guestOnlyComponents());
    // 디자인 1.15: 상태 프레임(3-location, rules.json variants["3"].location — 교사·admin 이 "위치 바꾸기"를 연 상태) 에만 있는 컴포넌트
    // (dev-rules 화면 3 컴포넌트 중 기본 프레임 3-{폭} 에 없는 것: location-picker·cabinet-switcher·cabinet-slot·slot-count·mix-warning)는
    // 기본 상태가 아니라 그 상태에서 본다 (아래 · screen-3-location.spec.ts)
    const viewportName = info.project.name as "mobile" | "desktop";
    const baseFrame = frameNames(`${SCREEN}-${viewportName}`);
    const fromDevAll = Object.entries(devRules.components)
      .filter(([, screens]) => screens.includes(SCREEN))
      .map(([n]) => n)
      .filter((n) => !guestOnly.has(n))
      // 탭바는 폭별 기대값이 다르다 (C2 에서 본다)
      .filter((n) => n !== rules.tab_bar.component && n !== rules.tab_bar.item);
    const stateOnly = fromDevAll.filter((n) => !baseFrame.has(n));
    // 1.17: variants["3"].location 에 suggest-badge(위치 추천)가 더해졌지만 dev-rules components 밖 — 위치 추천 run(다음 run)에서. 이번 범위 = dev-rules 에 있는 것
    const variant = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)].location.filter((n) => devRules.components[n]);
    for (const n of variant) expect(stateOnly, `variants["${SCREEN}"].location ${n} 은 기본 프레임에 없는 상태 컴포넌트`).toContain(n);
    // mix-warning 은 고른 칸이 분류와 안 맞을 때만 나오는 조건부 상태 — 1.17 3-location 시안은 추천 칸을 고른 상태라 없다 (경고 동작은 screen-3-location)
    for (const n of stateOnly.filter((x) => x !== "mix-warning")) expect(frameNames(`${SCREEN}-location-${viewportName}`), `상태 컴포넌트 ${n} 은 3-location 프레임에 있다`).toContain(n);
    const fromDev = fromDevAll.filter((n) => baseFrame.has(n));
    expect(fromDev.length, `dev-rules components 에 화면 ${SCREEN} 컴포넌트가 있어야 함`).toBeGreaterThan(0);

    const { school, pick } = pickFor(role);
    const { context, page } = await openAs(browser, info, role, SCREEN, detailPath(pick.id));
    const actions = watchActions(page);
    try {
      await waitDetail(page);
      for (const name of guestOnly) {
        expect(await countComponent(page, name), `로그인 화면에 둘러보기 전용 ${name} 0개`).toBe(0);
      }
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);
      for (const name of required) {
        if (forbidden.has(name)) continue;
        expect(await countComponent(page, name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
      }
      const db = await dbDetail(page, pick.id);
      expect(db, "자기 세션으로 이 시약이 읽힘").not.toBeNull();
      for (const name of fromDev) {
        // 탭바는 C2 에서 폭별 기대값으로 본다
        if (name === rules.tab_bar.component || name === rules.tab_bar.item) continue;
        if (forbidden.has(name)) {
          expect(await countComponent(page, name), `${name} (roles 상 ${ROLE_LABEL[role]} 0)`).toBe(0);
          continue;
        }
        if (name === BADGE) {
          // 재고 부족 배지는 그 시약 데이터에 따라 (값 일치는 screen-3-detail 에서)
          expect(await countComponent(page, name), `${name} (${db!.low ? "부족" : "충분"})`).toBe(db!.low ? 1 : 0);
          continue;
        }
        expect(await countComponent(page, name), `${name}`).toBeGreaterThanOrEqual(1);
        await expect(page.locator(sel(name)).first(), `${name} 보임`).toBeVisible();
      }
      // 상태 컴포넌트: 기본 상태에는 없다 → 교사·admin 은 "위치 바꾸기"를 열면 variants["3"].location 이 모두 보인다 (저장하지 않고 닫는다)
      for (const name of stateOnly) expect(await countComponent(page, name), `기본 상태에 상태 컴포넌트 ${name} 없음`).toBe(0);
      if (forbidden.has("location-edit")) {
        expect(await countComponent(page, "location-edit"), "학생 location-edit (R7)").toBe(0);
      } else {
        const edit = page.locator(`main ${sel("location-edit")}`).getByRole("button");
        await expect(edit, "location-edit 버튼").toHaveCount(1);
        await expect(async () => {
          await edit.click();
          await expect(page.locator(sel("location-picker")), "위치 바꾸기 → location-picker").toBeVisible({ timeout: 2_000 });
        }).toPass({ timeout: 30_000 });
        for (const name of variant) {
          expect(await countComponent(page, name), `variants["${SCREEN}"].location ${name}`).toBeGreaterThanOrEqual(1);
          await expect(page.locator(sel(name)).first(), `${name} 보임`).toBeVisible();
        }
        await page.locator(sel("location-picker")).getByRole("button", { name: /^\s*닫기\s*$/ }).click();
        await expect(page.locator(sel("location-picker")), "× → 닫힘").toHaveCount(0);
      }
      expect(actions.count(), "쓰기 요청 0건 (저장하지 않음)").toBe(0);
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
    const { pick } = pickFor(role);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN, detailPath(pick.id));
    try {
      await waitDetail(page);
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
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 시약 상세: roles ${[...new Set(checks.map((c) => c.rule))].join("·")} 개수`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { pick } = pickFor(role);
    const { context, page } = await openAs(browser, info, role, SCREEN, detailPath(pick.id));
    try {
      await waitDetail(page);
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

// R4 는 rules.json 상 역할마다 min_per_role 이 있으므로, 이 화면에 R4 검사가 실제로 생기는지 따로 확인한다
test(`[R-ui][S${SCREEN}] rules.json R4 msds-entry min_per_role 이 학생·교사·admin 모두에 적용됨`, () => {
  const r4 = rules.roles.R4;
  expect(r4?.component, "rules.json roles.R4").toBeTruthy();
  for (const role of SCHOOL_A_ROLES) {
    const name = ROLE_NAME[role as keyof typeof ROLE_NAME];
    expect(r4.roles ?? [], `R4 roles 에 ${name}`).toContain(name);
    const min = roleChecks(SCREEN, name).find((c) => c.rule === "R4" && c.op === "min");
    expect(min, `${name} 화면 ${SCREEN} R4 min 검사`).toBeTruthy();
    expect(min!.value).toBe(r4.min_per_role);
  }
});

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
// 디자인 1.15 시안 3-mobile·3-desktop 은 교사 기준(보관 위치·재주문 기준 + location-edit·threshold-edit) — 교사로 읽기만 한다
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (학교A 교사, seed 재고 부족 시약 — 읽기만)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const school = seedSchoolOf("teacher");
  const low = seedReagents().find((r) => r.school_id === school.id && r.low) ?? seedReagents().find((r) => r.school_id === school.id);
  if (!low) return;
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN, detailPath(low.id));
  try {
    await waitDetail(page).catch(() => undefined);
    // 시안 프레임 크기(390×844 · 1440×900) 그대로
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: false });
  } finally {
    await context.close();
  }
});
