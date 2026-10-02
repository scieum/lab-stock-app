// 화면 1 로그인 후 학교 격리 (N1-ui):
// - 이동한 화면의 학교명 종류 = rules.json never.N1.distinct_school_names, 그 이름은 자기 학교(RLS 로 읽은 schools),
//   다른 학교(seed schools) 이름 미노출.
// - 로그인 요청 본문에 다른 학교 값(neisCode·school_id·학교명·시/도·지역)과 역할을 끼워 보내도 무시된다 (d7 §4-2):
//   profiles 의 school_id·role 그대로, 화면에는 자기 학교명만.
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import {
  PROFILE_ROLE,
  browserClient,
  browserSession,
  loginViaUi,
  rules,
  screenOfPath,
  seedRows,
  seedSchoolNames,
  useProjectViewport,
} from "./screen-helpers";

const SCREEN = 1;
const HOME = 13;
const LOGIN_API = "/api/auth/login";
const N1 = rules.never.N1;
const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];

/** 로그인 뒤 도착한 화면의 학교명 = 자기 학교 1종, 다른 학교명 없음 */
async function expectOwnSchoolOnly(page: Page, own: string, foreign: string[]) {
  const landed = screenOfPath(new URL(page.url()).pathname);
  expect(landed, `로그인 후 경로 ${new URL(page.url()).pathname} 가 dev-rules routes 화면`).not.toBeNull();
  expect(N1.screens_require_school_name, `화면 ${landed} 는 학교명 표시 대상`).toContain(landed);
  const text = await page.locator("body").innerText();
  const names = new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? []);
  expect([...names], "학교명 종류").toHaveLength(N1.distinct_school_names);
  expect(text, "자기 학교명 표시").toContain(own);
  for (const f of foreign) expect(text, `다른 학교명 ${f}`).not.toContain(f);
}

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
    await expectOwnSchoolOnly(
      page,
      me.schoolName,
      seedNames.filter((n) => n !== me.schoolName),
    );
  });
}

// 학교 A 학생(가장 낮은 권한)과 학교 B 계정: 서로 상대 학교 값을 끼워 넣는다
for (const role of ["student", "schoolB"] as Role[]) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 로그인 요청에 다른 학교 neisCode·school_id·학교명·역할을 넣어도 무시 → profiles 학교·역할 그대로 · 화면 학교명 = 자기 학교`, async ({ browser, page }, info) => {
    test.setTimeout(120_000);
    const schools = seedRows("schools");
    expect(schools.length, "seed 학교가 2개 이상").toBeGreaterThan(1);

    // 로그인 전 기준값: 저장 세션(RLS)으로 읽은 자기 profiles 행
    const before = await (async () => {
      const { context, page: p } = await openAs(browser, info, role, HOME);
      try {
        const { client, userId } = await browserClient(p);
        const prof = await client.from("profiles").select("school_id, role").eq("user_id", userId).single();
        if (prof.error || !prof.data) throw new Error(`profiles 자기 행 없음: ${prof.error?.message}`);
        return { userId, schoolId: prof.data.school_id as string, role: prof.data.role as string };
      } finally {
        await context.close();
      }
    })();
    expect(before.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
    const own = schools.find((s) => s.id === before.schoolId);
    expect(own, "자기 학교는 seed 학교").toBeTruthy();
    const other = schools.find((s) => s.id !== before.schoolId)!;
    const injectedRole = before.role === "admin" ? "student" : "admin";

    // 로그인 요청 본문에 다른 학교·역할 값을 끼워 넣는다 (이메일·비밀번호는 그대로)
    const injected = {
      neisCode: other.neis_code,
      neis_code: other.neis_code,
      officeCode: other.office_code,
      schoolId: other.id,
      school_id: other.id,
      schoolName: other.name,
      school: other.name,
      sido: other.sido,
      region: other.region,
      role: injectedRole,
    };
    let sentBody: Record<string, unknown> | null = null;
    await page.route(`**${LOGIN_API}`, async (route) => {
      const req = route.request();
      if (req.method() !== "POST") return route.continue();
      const orig = (req.postDataJSON() ?? {}) as Record<string, unknown>;
      sentBody = { ...orig, ...injected };
      await route.continue({ postData: JSON.stringify(sentBody), headers: { ...req.headers(), "content-type": "application/json" } });
    });
    const loginRes = page.waitForResponse((r) => new URL(r.url()).pathname === LOGIN_API && r.request().method() === "POST");

    await useProjectViewport(page, info);
    await loginViaUi(page, role);

    const res = await loginRes;
    expect(sentBody, "끼워 넣은 본문으로 로그인 요청이 나감").not.toBeNull();
    expect(sentBody!.neisCode, "다른 학교 neisCode 전송").toBe(other.neis_code);
    expect(res.status(), "로그인 성공 (학교 값은 무시)").toBe(200);

    // 로그인 후: profiles 학교·역할 그대로
    const { client, userId } = await browserClient(page);
    expect(userId, "같은 계정").toBe(before.userId);
    const after = await client.from("profiles").select("school_id, role").eq("user_id", userId).single();
    expect(after.error, "profiles 조회").toBeNull();
    expect(after.data!.school_id, "profiles.school_id 그대로").toBe(before.schoolId);
    expect(after.data!.school_id, "다른 학교로 바뀌지 않음").not.toBe(other.id);
    expect(after.data!.role, "profiles.role 그대로").toBe(before.role);

    // 화면: 자기 학교명 1종, 끼워 넣은 학교명 없음
    await expectOwnSchoolOnly(
      page,
      own!.name,
      schools.filter((s) => s.id !== before.schoolId).map((s) => s.name),
    );
  });
}
