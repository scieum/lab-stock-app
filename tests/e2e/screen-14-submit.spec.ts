// 화면 14 (/signup) 가입하기 버튼 제출 동작 (C1).
// - 가입 요청(/api/auth/signup)은 모두 page.route 로 가로채 가짜 응답을 준다. 실제 서버·auth 에는 보내지 않는다.
// - 중복 제출 방지: 요청 중 연타·Enter 반복에도 요청 1건, 요청 중 버튼 disabled·aria-busy=true, 실패 응답 뒤 다시 활성.
// - 서버 오류 응답(503·429)의 error 문구가 화면에 그대로 보인다.
import { test, expect, type Page, type Route } from "@playwright/test";
import { routeOf, sel, useProjectViewport } from "./screen-helpers";
import { SCREEN, SIGNUP_API, fillValidSignup } from "./screen-14-helpers";

const submitButton = (page: Page) => page.locator(`form ${sel("button-primary")}[type="submit"]`);
const alertBox = (page: Page) => page.locator('form [role="alert"]');

type Held = { route: Route; release: (status: number, error: string) => Promise<void> };

/** 가입 요청을 모두 가로채 붙잡아 둔다. 테스트가 release 할 때 가짜 응답을 준다. */
async function holdSignup(page: Page): Promise<Held[]> {
  const held: Held[] = [];
  await page.route(`**${SIGNUP_API}`, async (route) => {
    if (route.request().method() !== "POST") return route.abort();
    held.push({
      route,
      release: (status, error) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ok: false, error }) }),
    });
  });
  return held;
}

test(`[C1][S${SCREEN}] 가입하기 중복 제출 방지: 연타·Enter 반복에도 요청 1건 · 요청 중 disabled·aria-busy=true · 실패 응답 뒤 다시 활성`, async ({ page }, info) => {
  test.setTimeout(150_000);
  await useProjectViewport(page, info);
  const held = await holdSignup(page);
  await fillValidSignup(page, `e2e-double-${Date.now()}@example.com`);
  expect(new URL(page.url()).pathname).toBe(routeOf(SCREEN));

  const btn = submitButton(page);
  await expect(btn, "가입하기 버튼 1개").toHaveCount(1);
  await expect(btn, "요청 전 활성").toBeEnabled();
  await expect(btn, "요청 전 aria-busy").not.toHaveAttribute("aria-busy", "true");

  // 1) 같은 프레임 안 연속 클릭 (React 상태 갱신 전에 들어오는 두 번째 제출)
  await btn.evaluate((el: HTMLButtonElement) => {
    for (let i = 0; i < 5; i++) el.click();
  });
  await expect.poll(() => held.length, { message: "첫 요청 도착" }).toBeGreaterThanOrEqual(1);

  // 요청 중 상태
  await expect(btn, "요청 중 disabled").toBeDisabled();
  await expect(btn, "요청 중 aria-busy").toHaveAttribute("aria-busy", "true");

  // 2) 요청 중 추가 연타 (Playwright 클릭, 비활성 버튼에도 강제로)
  for (let i = 0; i < 3; i++) await btn.click({ force: true, noWaitAfter: true });
  // 3) 입력란에서 Enter 반복 (암묵적 제출) + form.requestSubmit 반복
  await page.locator('input[name="passwordConfirm"]').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Enter");
  await page.locator("form").first().evaluate((f: HTMLFormElement) => {
    for (let i = 0; i < 3; i++) f.requestSubmit();
  });

  // 추가 요청이 생길 시간을 준 뒤에도 1건
  await page.waitForTimeout(1500);
  expect(held.length, "요청 중 가입 요청 수").toBe(1);
  await expect(btn, "요청 중 disabled 유지").toBeDisabled();
  await expect(btn, "요청 중 aria-busy 유지").toHaveAttribute("aria-busy", "true");

  // 실패 응답(가짜 500) → 다시 활성, 오류 문구 표시
  const fail500 = "e2e 가짜 500: 학교 연결에 실패했어요.";
  await held[0].release(500, fail500);
  await expect(btn, "실패 응답 뒤 활성").toBeEnabled();
  await expect(btn, "실패 응답 뒤 aria-busy").not.toHaveAttribute("aria-busy", "true");
  await expect(alertBox(page), "실패 문구").toHaveText(fail500);
  expect(held.length, "실패 응답 뒤에도 추가 요청 없음").toBe(1);

  // 다시 활성된 버튼으로 재시도하면 새 요청이 정확히 1건 더 간다
  await btn.click();
  await expect.poll(() => held.length, { message: "재시도 요청" }).toBe(2);
  await expect(btn, "재시도 중 disabled").toBeDisabled();
  await expect(btn, "재시도 중 aria-busy").toHaveAttribute("aria-busy", "true");
  await held[1].release(500, fail500);
  await expect(btn, "재시도 실패 뒤 활성").toBeEnabled();
  await page.waitForTimeout(500);
  expect(held.length, "총 가입 요청 수").toBe(2);
});

test(`[C1][S${SCREEN}] 서버 오류 응답(503·429)의 error 문구가 화면에 그대로 표시 · 가입 화면 유지`, async ({ page }, info) => {
  test.setTimeout(150_000);
  await useProjectViewport(page, info);
  const held = await holdSignup(page);
  await fillValidSignup(page, `e2e-error-${Date.now()}@example.com`);
  const btn = submitButton(page);

  const cases: { status: number; error: string }[] = [
    { status: 503, error: "e2e 가짜 503: 서버 설정 문제로 지금은 가입할 수 없어요. 관리자에게 문의하세요." },
    { status: 429, error: "e2e 가짜 429: 확인 메일을 방금 보냈어요. 1분 뒤 다시 시도하거나 메일함을 확인하세요." },
  ];
  for (const [i, c] of cases.entries()) {
    await btn.click();
    await expect.poll(() => held.length, { message: `${c.status} 요청` }).toBe(i + 1);
    await held[i].release(c.status, c.error);
    await expect(alertBox(page), `${c.status} 문구`).toHaveText(c.error);
    await expect(btn, `${c.status} 뒤 다시 활성`).toBeEnabled();
    expect(new URL(page.url()).pathname, `${c.status} 뒤 가입 화면 유지`).toBe(routeOf(SCREEN));
    await expect(page.locator(`${sel("ex-auth-form-card")}[aria-label="가입 확인 안내"]`), "가입 완료 안내 없음").toHaveCount(0);
  }
  // 다른 문구끼리 섞이지 않는다 (마지막 응답 문구만)
  await expect(alertBox(page)).toHaveCount(1);
  await expect(alertBox(page)).not.toContainText(cases[0].error);
});
