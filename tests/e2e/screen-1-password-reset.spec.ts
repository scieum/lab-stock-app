// 화면 1 "비밀번호 찾기" 흐름 (d7 §4-3: Supabase 비밀번호 재설정 메일)
// - /api/auth/password-reset: 이메일 존재 여부를 응답으로 드러내지 않는다 (없는 이메일 = 있는 이메일 응답)
//   실제 메일이 나가는 "있는 이메일" 요청은 실행당 1회만 (desktop 프로젝트) — Supabase 메일 발송 한도.
// - 세션 없이 /reset-password → 화면 1, /api/auth/password-update → 401
// - /auth/confirm 잘못된 링크 → 화면 1 (세션 없음), 외부 next 로 리다이렉트하지 않음
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { PASSWORD_MIN } from "../../lib/auth/signup-rules";
import { credentialsOf, routeOf, sel, useProjectViewport, waitLoginScreen } from "./screen-helpers";

const SCREEN = 1;
const FORGOT = "/forgot-password";
const RESET = "/reset-password";
const RESET_API = "/api/auth/password-reset";
const UPDATE_API = "/api/auth/password-update";

type Body = { ok?: boolean; error?: string; message?: string };

const nobody = (tag: string) => `e2e-nobody-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function post(request: APIRequestContext, path: string, data: unknown): Promise<{ res: APIResponse; body: Body }> {
  const res = await request.post(path, { data, failOnStatusCode: false, maxRedirects: 0 });
  const body = (await res.json().catch(() => ({}))) as Body;
  return { res, body };
}

function sessionCookies(res: APIResponse): string[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value.split("=")[0])
    .filter((n) => /^sb-.*-auth-token(\.\d+)?$/.test(n)); // 세션 토큰 (PKCE code-verifier 쿠키는 세션 아님)
}

test(`[C1][S${SCREEN}] 비밀번호 찾기 API: 없는 이메일과 있는 이메일(테스트 계정) 응답 동일 (이메일 존재 비노출)`, async ({ request }, info) => {
  // 있는 이메일 요청은 실제 재설정 메일을 보낸다 → 실행당 1회로 제한 (viewport 와 무관한 API 검사)
  test.skip(info.project.name !== "desktop", "실제 메일 발송 1회 제한: desktop 프로젝트에서만");
  test.setTimeout(60_000);
  const missing = await post(request, RESET_API, { email: nobody("reset") });
  const existing = await post(request, RESET_API, { email: credentialsOf("student").email });

  expect(missing.res.status(), "없는 이메일 HTTP").toBe(200);
  expect(missing.body.ok, "없는 이메일 ok").toBe(true);
  expect(typeof missing.body.message === "string" && missing.body.message.length > 0, "안내 문구").toBe(true);
  expect(existing.res.status(), "있는 이메일 HTTP = 없는 이메일 HTTP").toBe(missing.res.status());
  expect(existing.body, "있는 이메일 본문 = 없는 이메일 본문").toEqual(missing.body);
  expect(sessionCookies(missing.res), "세션 쿠키 (없는 이메일)").toEqual([]);
  expect(sessionCookies(existing.res), "세션 쿠키 (있는 이메일)").toEqual([]);
});

test(`[C1][S${SCREEN}] 비밀번호 찾기 API: 서로 다른 없는 이메일 응답 동일 · 형식 오류·JSON 아님 400`, async ({ request }) => {
  const a = await post(request, RESET_API, { email: nobody("a") });
  const b = await post(request, RESET_API, { email: nobody("b") });
  expect(a.res.status()).toBe(200);
  expect(a.body.ok).toBe(true);
  expect(b.res.status()).toBe(a.res.status());
  expect(b.body).toEqual(a.body);

  for (const bad of [{ email: "not-an-email" }, { email: "" }, {}]) {
    const r = await post(request, RESET_API, bad);
    expect(r.res.status(), `형식 오류 ${JSON.stringify(bad)}`).toBe(400);
    expect(r.body.ok).toBe(false);
    expect(typeof r.body.error === "string" && r.body.error.length > 0, "오류 문구").toBe(true);
  }
  const raw = await request.post(RESET_API, {
    data: "not json",
    headers: { "content-type": "text/plain" },
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  expect(raw.status(), "JSON 아닌 본문").toBe(400);
});

test(`[C1][S${SCREEN}] 비밀번호 찾기 화면: 없는 이메일 제출 → API 안내 문구 그대로 표시 (학교 선택 0)`, async ({ page }, info) => {
  test.setTimeout(60_000);
  await useProjectViewport(page, info);
  await page.goto(FORGOT);
  await page.waitForLoadState("load");
  await expect(page.locator(sel("ex-auth-form-card")).first()).toBeVisible();
  await expect(page.locator('[data-component^="school-select"]')).toHaveCount(0);

  const submit = page.locator('form button[type="submit"]');
  await expect(async () => {
    await page.locator('input[name="email"]').fill(nobody(info.project.name));
    await expect(submit).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const resP = page.waitForResponse((r) => new URL(r.url()).pathname === RESET_API);
  await submit.click();
  const res = await resP;
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Body;
  expect(body.ok).toBe(true);
  await expect(page.locator(`${sel("ex-auth-form-card")} [role="status"]`)).toHaveText(body.message!);
  await expect(page.locator(`${sel("ex-auth-form-card")} [role="alert"]`)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe(FORGOT);
});

test(`[C1][S${SCREEN}] 세션 없이 ${RESET} → 화면 ${SCREEN} (routes[${SCREEN}])`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await page.goto(RESET);
  await page.waitForURL((u) => u.pathname === routeOf(SCREEN), { timeout: 30_000 });
  await waitLoginScreen(page);
  await expect(page.locator('input[name="passwordConfirm"]')).toHaveCount(0);
});

test(`[C1][S${SCREEN}] 세션 없이 비밀번호 변경 API → 401 · 세션 쿠키 없음`, async ({ request }) => {
  const pw = `e2e-New-${"7".repeat(PASSWORD_MIN)}`;
  const r = await post(request, UPDATE_API, { password: pw, passwordConfirm: pw });
  expect(r.res.status()).toBe(401);
  expect(r.body.ok).toBe(false);
  expect(sessionCookies(r.res)).toEqual([]);
});

test(`[C1][S${SCREEN}] 잘못된 재설정 메일 링크(/auth/confirm) → 화면 ${SCREEN} · 세션 없음 · 외부 next 무시`, async ({ request }) => {
  for (const q of [
    "token_hash=e2e-invalid-token&type=recovery",
    "code=e2e-invalid-code&next=/reset-password",
    "token_hash=e2e-invalid-token&type=recovery&next=//example.com/",
    "next=https://example.com/",
  ]) {
    const res = await request.get(`/auth/confirm?${q}`, { failOnStatusCode: false, maxRedirects: 0 });
    expect(res.status(), `${q}: 리다이렉트`).toBeGreaterThanOrEqual(300);
    expect(res.status(), `${q}: 리다이렉트`).toBeLessThan(400);
    const loc = new URL(res.headers()["location"] ?? "", "http://placeholder.invalid");
    expect(loc.pathname, `${q}: 이동 경로`).toBe(routeOf(SCREEN));
    expect(loc.host, `${q}: 같은 출처`).not.toContain("example.com");
    expect(sessionCookies(res), `${q}: 세션 쿠키`).toEqual([]);
  }
});
