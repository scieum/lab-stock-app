// 로그인 상태 /login·/signup → / · 비로그인 /scan?cabinet={id} → /login?next=… → 로그인 뒤 같은 주소 — 주소 흐름만 (화면 12 자체 검사는 D3).
// 기준: harness/d7-data.md §26 "화면 12 경로·권한"(비로그인으로 /scan?cabinet=… 이 열리면 /login 으로 보내고 로그인 뒤 같은 주소로 돌아온다)
//       · QA 개선 (1)(로그인 상태로 /login·/signup = / 로 보낸다), harness/dev-rules.json routes(1 · 12 · 13 · 14) · route_auth.
// [C1][S1]  로그인 상태 /login → / (홈) · next 가 같은 origin 앱 경로면 그곳 · 다른 호스트 next 는 무시하고 /
// [C1][S14] 로그인 상태 /signup → /
// [C1][S12] 비로그인 /scan?cabinet={id} → /login?next=/scan?cabinet={id} → 화면 1 로그인 → /scan?cabinet={id}
// [C1][S1]  비로그인 /login?next=(다른 호스트로 해석되는 값) → 로그인 뒤 같은 origin 에 머문다 (열린 리다이렉트 금지)
// 계정 값은 환경변수(TEST_*_EMAIL/PASSWORD)에서만 읽는다.
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./db-helpers";
import { openAs } from "./auth-state";
import { credentialsOf, routeOf, sel, waitLoginScreen } from "./screen-helpers";

const LOGIN = routeOf(1);
const HOME = routeOf(13);
const SCAN = routeOf(12);
const SIGNUP = routeOf(14);
const EVIL = "evil.example";

/** 학교 A 의 실제 시약장 id (교사 세션 · RLS) */
async function schoolACabinetId(): Promise<string> {
  const t = await signIn("teacher");
  const { data, error } = await t.client.from("cabinets").select("id").order("id").limit(1);
  expect(error).toBeNull();
  expect(data ?? [], "학교 A 시약장 (seed)").toHaveLength(1);
  return data![0].id as string;
}

/** 지금 열린 화면 1 폼에 학생 계정으로 로그인 (page.goto 하지 않는다 — next 를 지키기 위해) */
async function submitLoginHere(page: Page): Promise<void> {
  const { email, password } = credentialsOf("student");
  await waitLoginScreen(page);
  const submit = page.locator('form button[type="submit"]');
  await expect(async () => {
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await expect(submit).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await submit.click();
  await page.waitForURL((u) => !u.pathname.startsWith(LOGIN), { timeout: 45_000 });
}

test(`[C1][S1] 로그인 상태(학생)로 ${LOGIN} → ${HOME} (홈 home-summary) · ${LOGIN}?next=${SCAN}?cabinet={id} → 그 주소 · 다른 호스트 next → ${HOME}`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const cabId = await schoolACabinetId();
  const { context, page } = await openAs(browser, info, "student", 13);
  try {
    const origin = new URL(page.url()).origin;
    await page.goto(LOGIN);
    await page.waitForURL((u) => u.pathname === HOME, { timeout: 30_000 });
    await expect(page.locator(sel("home-summary")).first(), "홈 화면").toBeVisible({ timeout: 30_000 });
    expect(await page.locator(sel("ex-auth-form-card")).count(), "로그인 폼 0").toBe(0);

    const target = `${SCAN}?cabinet=${cabId}`;
    await page.goto(`${LOGIN}?next=${encodeURIComponent(target)}`);
    await page.waitForURL((u) => u.pathname === SCAN, { timeout: 30_000 });
    const u = new URL(page.url());
    expect(u.origin).toBe(origin);
    expect(u.searchParams.get("cabinet"), "같은 시약장 id").toBe(cabId);

    for (const bad of [`//${EVIL}`, `https://${EVIL}/`, `/\\${EVIL}`, `/.//${EVIL}`, `${LOGIN}?next=/scan`, SIGNUP]) {
      await page.goto(`${LOGIN}?next=${encodeURIComponent(bad)}`);
      await page.waitForURL((x) => x.pathname !== LOGIN, { timeout: 30_000 });
      const v = new URL(page.url());
      expect(v.origin, `next=${bad}: 같은 origin`).toBe(origin);
      expect(v.pathname, `next=${bad}: 홈`).toBe(HOME);
    }
  } finally {
    await context.close();
  }
});

test(`[C1][S14] 로그인 상태(교사)로 ${SIGNUP} → ${HOME}`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "teacher", 13);
  try {
    await page.goto(SIGNUP);
    await page.waitForURL((u) => u.pathname === HOME, { timeout: 30_000 });
    await expect(page.locator(sel("home-summary")).first(), "홈 화면").toBeVisible({ timeout: 30_000 });
  } finally {
    await context.close();
  }
});

test(`[C1][S12] 비로그인 ${SCAN}?cabinet={id} → ${LOGIN}?next=${SCAN}?cabinet={id} → 로그인 → ${SCAN}?cabinet={id} 로 복귀`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const cabId = await schoolACabinetId();
  const target = `${SCAN}?cabinet=${cabId}`;
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport ?? undefined });
  try {
    const page = await context.newPage();
    await page.goto(target);
    await page.waitForURL((u) => u.pathname === LOGIN, { timeout: 30_000 });
    const atLogin = new URL(page.url());
    expect(atLogin.searchParams.get("next"), "next = 들어온 주소 그대로").toBe(target);
    await submitLoginHere(page);
    await page.waitForURL((u) => u.pathname === SCAN, { timeout: 45_000 });
    const back = new URL(page.url());
    expect(back.pathname).toBe(SCAN);
    expect(back.searchParams.get("cabinet"), "같은 시약장 id 로 복귀").toBe(cabId);
    expect([...back.searchParams.keys()], "쿼리 = cabinet 하나").toEqual(["cabinet"]);
  } finally {
    await context.close();
  }
});

test(`[C1][S1] 비로그인 ${LOGIN}?next=(점 경로로 만든 //${EVIL}) → 로그인 뒤 같은 origin (열린 리다이렉트 금지)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport ?? undefined });
  const offsite: string[] = [];
  try {
    const page = await context.newPage();
    page.on("request", (r) => {
      if (r.isNavigationRequest() && new URL(r.url()).hostname.endsWith(EVIL)) offsite.push(r.url());
    });
    await context.route(`**://*${EVIL}/**`, (route) => route.abort());
    await page.goto(`${LOGIN}?next=${encodeURIComponent(`/.//${EVIL}`)}`);
    const origin = new URL(page.url()).origin;
    await submitLoginHere(page).catch(() => undefined);
    await page.waitForTimeout(1_500);
    expect(offsite, "다른 호스트로 이동 요청 0").toEqual([]);
    expect(new URL(page.url()).origin, "같은 origin").toBe(origin);
  } finally {
    await context.close();
  }
});
