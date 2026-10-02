// 화면 1 (/login) 학교 선택 없음 (N1-d, d5-gates.md: "화면 1(로그인)에는 school-select* 0"):
// - rules.json never.N1.school_select_only_on 밖 화면이면 school_select_levels 컴포넌트 0 · school-select* 0
// - /api/neis/* 요청 0, 브라우저에서 NEIS 직접 호출 0 (입력·제출 실패까지 거쳐도)
import { test, expect, type Page } from "@playwright/test";
import { routeOf, rules, sel, useProjectViewport, waitLoginScreen } from "./screen-helpers";

const SCREEN = 1;
const N1 = rules.never.N1;
const NEIS_PREFIX = "/api/neis/";

function watchNeis(page: Page): { local: string[]; external: string[] } {
  const seen = { local: [] as string[], external: [] as string[] };
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (/neis\.go\.kr$/i.test(u.hostname)) seen.external.push(u.hostname + u.pathname);
    if (u.pathname.startsWith(NEIS_PREFIX)) seen.local.push(u.pathname + u.search);
  });
  return seen;
}

async function expectNoSchoolSelect(page: Page, when: string) {
  for (const level of N1.school_select_levels) {
    expect(await page.locator(sel(level)).count(), `${when}: ${level}`).toBe(0);
  }
  expect(await page.locator('[data-component^="school-select"]').count(), `${when}: school-select*`).toBe(0);
}

test(`[N1-d][S${SCREEN}] 화면 ${SCREEN} 은 rules.json school_select_only_on 밖 → school-select* 0 · /api/neis 요청 0`, async ({ page }, info) => {
  test.setTimeout(60_000);
  expect(N1.school_select_only_on, "화면 1 은 학교 선택 화면이 아님").not.toContain(SCREEN);
  const vp = await useProjectViewport(page, info);
  const seen = watchNeis(page);

  await page.goto(routeOf(SCREEN));
  await waitLoginScreen(page);
  await page.waitForLoadState("networkidle");
  await expectNoSchoolSelect(page, `${vp} 첫 화면`);

  // 하이드레이션 뒤 입력 (제출 버튼이 켜짐 = React 상태 반영) → 틀린 비밀번호로 제출해 오류까지 본다
  const submit = page.locator('form button[type="submit"]');
  await expect(async () => {
    await page.locator('input[name="email"]').fill(`n1d-nobody-${Date.now()}@example.com`);
    await page.locator('input[name="password"]').fill("n1d-wrong-password");
    await expect(submit).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const login = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/login");
  await submit.click();
  expect((await login).status(), "없는 계정 로그인 거부").toBe(401);
  await expect(page.locator(`${sel("ex-auth-form-card")} [role="alert"]`)).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).pathname).toBe(routeOf(SCREEN));
  await expectNoSchoolSelect(page, `${vp} 로그인 실패 뒤`);

  expect(seen.local, `${vp} ${NEIS_PREFIX}* 요청`).toEqual([]);
  expect(seen.external, `${vp} NEIS 직접 호출`).toEqual([]);
});
