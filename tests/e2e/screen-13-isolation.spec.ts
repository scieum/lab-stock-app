// 화면 13 (홈) 학교 격리 N1-ui: 학교명 종류 = rules.json never.N1.distinct_school_names, 자기 학교명만,
// 다른 학교(seed schools) 이름·다른 학교 시약명(seed reagents) 미노출.
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserSession, rules, sel, seedRows } from "./screen-helpers";

const SCREEN = 13;
const N1 = rules.never.N1;
const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];

for (const role of ROLES) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 홈: 학교명 종류 = rules.json distinct_school_names · 다른 학교명·다른 학교 시약명 미노출`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const schools = seedRows("schools");
    const reagents = seedRows("reagents");
    expect(schools.length, "seed 학교가 2개 이상이어야 격리 검사가 의미 있음").toBeGreaterThan(1);
    expect(N1.screens_require_school_name, `화면 ${SCREEN} 은 학교명 표시 대상`).toContain(SCREEN);

    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState("load");
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const mine = schools.find((s) => s.name === me.schoolName);
      expect(mine, `자기 학교 ${me.schoolName} 는 seed 학교`).toBeTruthy();
      const foreignSchools = schools.filter((s) => s.id !== mine!.id);
      const foreignIds = new Set(foreignSchools.map((s) => s.id));
      const foreignReagents = reagents.filter((r) => foreignIds.has(r.school_id)).map((r) => r.name);
      expect(foreignReagents.length, "다른 학교 seed 시약이 있어야 검사가 의미 있음").toBeGreaterThan(0);

      const text = await page.locator("body").innerText();
      const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
      expect(names, "학교명 종류").toHaveLength(N1.distinct_school_names);
      // 패턴 일치 부분은 자기 학교명에서 나온 것이어야 한다 (seed 이름 '…고등학교A' 는 패턴상 '…고등학교' 까지 일치)
      for (const n of names) expect(me.schoolName, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
      expect(text, "자기 학교명 표시").toContain(me.schoolName);
      for (const s of foreignSchools) expect(text, `다른 학교명 ${s.name}`).not.toContain(s.name);
      for (const n of foreignReagents) expect(text, `다른 학교 시약명 ${n}`).not.toContain(n);
    } finally {
      await context.close();
    }
  });
}
