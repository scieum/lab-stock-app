// 화면 14 (/signup) 로그인 상태 접근:
// - N1-ui: 로그인된 계정이 /signup 에 오면 화면 13(/) 로 이동, 학교명 종류 = rules.json never.N1.distinct_school_names,
//          자기 학교명만 (다른 seed 학교명 미노출).
// - R-ui: 로그인된 학교 A 역할마다 /signup 에서 가입 폼·학교 선택 단계(rules.json never.N1.school_select_levels) 0 —
//         가입 뒤 학교·역할을 다시 고를 수 없다.
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserSession, countComponent, routeOf, rules, screenOfPath, sel, seedRows } from "./screen-helpers";
import { SCREEN } from "./screen-14-helpers";

const N1 = rules.never.N1;
const HOME = 13;

for (const role of ["student", "schoolB"] as Role[]) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 로그인 상태로 ${routeOf(SCREEN)} 접근 → ${routeOf(HOME)} · 학교명 종류 = rules.json distinct_school_names · 다른 학교명 미노출`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const schools = seedRows("schools");
    expect(schools.length, "seed 학교가 2개 이상이어야 격리 검사가 의미 있음").toBeGreaterThan(1);

    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      expect(screenOfPath(new URL(page.url()).pathname), "이동한 화면").toBe(HOME);
      await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const mine = schools.find((s) => s.name === me.schoolName);
      expect(mine, `자기 학교 ${me.schoolName} 는 seed 학교`).toBeTruthy();
      const foreign = schools.filter((s) => s.id !== mine!.id);

      const text = await page.locator("body").innerText();
      const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
      expect(names, "학교명 종류").toHaveLength(N1.distinct_school_names);
      for (const n of names) expect(me.schoolName, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
      expect(text, "자기 학교명 표시").toContain(me.schoolName);
      for (const s of foreign) expect(text, `다른 학교명 ${s.name}`).not.toContain(s.name);
      // 학교 선택 단계는 로그인 뒤에 보이지 않는다
      for (const level of N1.school_select_levels) expect(await countComponent(page, level), level).toBe(0);
    } finally {
      await context.close();
    }
  });
}

for (const role of SCHOOL_A_ROLES) {
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 로그인 상태 ${routeOf(SCREEN)}: 가입 폼·학교 선택 0 (학교·역할 재선택 불가)`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      expect(new URL(page.url()).pathname, "로그인 상태에서 가입 화면 머무름").not.toBe(routeOf(SCREEN));
      expect(screenOfPath(new URL(page.url()).pathname), "이동한 화면").toBe(HOME);
      await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      for (const level of N1.school_select_levels) expect(await countComponent(page, level), level).toBe(0);
      await expect(page.locator(`${sel("ex-auth-form-card")}[aria-label="회원가입"]`), "가입 폼").toHaveCount(0);
      await expect(page.locator('input[name="passwordConfirm"]'), "가입 비밀번호 확인 입력").toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
