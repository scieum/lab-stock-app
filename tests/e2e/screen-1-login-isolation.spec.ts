// 화면 1 로그인 후 학교 격리 (N1-ui): 이동한 화면의 학교명 종류 = rules.json never.N1.distinct_school_names,
// 그 이름은 자기 학교(RLS 로 읽은 schools), 다른 학교(seed schools) 이름 미노출.
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import {
  PROFILE_ROLE,
  browserSession,
  loginViaUi,
  rules,
  screenOfPath,
  seedSchoolNames,
  useProjectViewport,
} from "./screen-helpers";

const SCREEN = 1;
const N1 = rules.never.N1;
const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];

for (const role of ROLES) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 로그인(학교 미선택) 후 화면의 학교명 종류 = ${N1.distinct_school_names} · 다른 학교명 미노출`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const seedNames = seedSchoolNames();
    expect(seedNames.length, "seed 학교가 2개 이상이어야 격리 검사가 의미 있음").toBeGreaterThan(1);

    await useProjectViewport(page, info);
    await loginViaUi(page, role);

    const me = await browserSession(page);
    expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
    expect(seedNames, "자기 학교는 seed 학교").toContain(me.schoolName);
    const foreign = seedNames.filter((n) => n !== me.schoolName);

    const landed = screenOfPath(new URL(page.url()).pathname);
    expect(landed, `로그인 후 경로 ${new URL(page.url()).pathname} 가 dev-rules routes 화면`).not.toBeNull();
    expect(N1.screens_require_school_name, `화면 ${landed} 는 학교명 표시 대상`).toContain(landed);

    const text = await page.locator("body").innerText();
    const names = new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? []);
    expect([...names], "학교명 종류").toHaveLength(N1.distinct_school_names);
    expect(text, "자기 학교명 표시").toContain(me.schoolName);
    for (const f of foreign) expect(text, `다른 학교명 ${f}`).not.toContain(f);
  });
}
