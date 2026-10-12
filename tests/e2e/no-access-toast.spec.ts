// 권한 없는 주소 → 홈 ex-toast 한 번 (d7 §28 "권한 없는 주소" · design/rules.json 1.28 no_access · 시안 13-no-access-*) — 화면 연결(D3).
// - 학생이 교사·admin 화면(7 입고 · 5 실험 매뉴얼 · 6 재주문 알림)으로 → 홈 + "교사·관리자만 쓸 수 있는 화면이에요".
// - 교사가 admin 화면(8 사용자 · 9 판매처)으로 → 홈 + "관리자만 쓸 수 있는 화면이에요".
// - 토스트 뒤 주소에서 ?denied 를 지운다 → 새로고침해도 다시 안 뜬다. 무채색(핑크 없음).
// 공용 학교 A 계정 — 읽기만 (쓰기 요청 없음).
import { test, expect, type Page } from "@playwright/test";
import { openAs } from "./auth-state";
import type { Role } from "./db-helpers";
import { routeOf, rules, sel } from "./screen-helpers";
import { NO_ACCESS, R, rgbOf } from "./d7-28-helpers";

const HOME = routeOf(13);
const ACCENT = rgbOf((rules as unknown as { colors: { accent: { value: string } } }).colors.accent.value);
const ACCENT_SOFT = rgbOf((rules as unknown as { colors: { accent_soft: { value: string } } }).colors.accent_soft.value);

const CASES: { screen: number; role: Role; copy: string; kind: string }[] = [
  { screen: 7, role: "student", copy: NO_ACCESS.teacher_admin, kind: "교사·admin 화면" },
  { screen: 6, role: "student", copy: NO_ACCESS.teacher_admin, kind: "교사·admin 화면" },
  { screen: 8, role: "teacher", copy: NO_ACCESS.admin, kind: "admin 화면" },
  { screen: 9, role: "student", copy: NO_ACCESS.admin, kind: "admin 화면" },
];

const toasts = (page: Page, text: string) => page.locator(sel("ex-toast")).filter({ hasText: text });

/** 토스트 안 어떤 요소도 accent(핑크) 글자·바탕이 아님 */
async function noPink(page: Page, text: string): Promise<void> {
  const colors = await toasts(page, text)
    .first()
    .evaluate((el) => [el, ...Array.from(el.querySelectorAll("*"))].flatMap((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor, getComputedStyle(e).borderColor]));
  expect(colors, "토스트 무채색 (accent 없음)").not.toContain(ACCENT);
  expect(colors, "토스트 무채색 (accent-soft 없음)").not.toContain(ACCENT_SOFT);
}

test(`[R-ui][S13] 기대값 원본: rules no_access.copy 2종 = 시안 13-no-access ex-toast 글자(교사·admin)`, async () => {
  const { newFrame } = await import("./desk-helpers");
  const label = newFrame("13-no-access-mobile").find((n) => n.path.includes("ex-toast") && n.text)?.text?.characters;
  expect(label, "시안 13-no-access-mobile 토스트 = rules copy.teacher_admin").toBe(NO_ACCESS.teacher_admin);
  expect(NO_ACCESS.admin, "rules copy.admin").toMatch(/^관리자만/);
  expect(R.no_access.copy, "두 문구").toEqual({ teacher_admin: NO_ACCESS.teacher_admin, admin: NO_ACCESS.admin });
});

for (const c of CASES) {
  test(`[R-ui][S13] ${c.role === "student" ? "학생" : "교사"}이 ${c.kind} ${routeOf(c.screen)} → 홈 ${HOME} + ex-toast '${c.copy}' 한 번 · 주소에서 denied 지움 · 새로고침 = 토스트 0 · 무채색`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page } = await openAs(browser, info, c.role, 13);
    try {
      await expect(page.locator(sel("home-summary")).first(), "홈 그려짐").toBeVisible({ timeout: 45_000 });
      await page.goto(routeOf(c.screen));
      await expect.poll(() => new URL(page.url()).pathname, { message: "홈으로", timeout: 45_000 }).toBe(HOME);
      await expect(toasts(page, c.copy), `토스트 '${c.copy}'`).toBeVisible({ timeout: 20_000 });
      await expect(toasts(page, c.copy), "토스트 1개").toHaveCount(1);
      // 다른 문구 토스트 없음
      const other = c.copy === NO_ACCESS.admin ? NO_ACCESS.teacher_admin : NO_ACCESS.admin;
      await expect(page.locator(sel("ex-toast")).filter({ hasText: new RegExp(`^\\s*${other}\\s*$`) }), "다른 권한 문구 0").toHaveCount(0);
      await noPink(page, c.copy);
      await expect.poll(() => new URL(page.url()).searchParams.has("denied"), { message: "주소에서 denied 지움", timeout: 20_000 }).toBe(false);
      expect(new URL(page.url()).pathname, "주소 = 홈").toBe(HOME);
      await page.screenshot({ path: `test-results/v1-13-no-access-${info.project.name}${c.screen === 7 ? "" : `-${c.screen}`}.png` });
      // 새로고침 → 다시 안 뜸
      await page.reload();
      await expect(page.locator(sel("home-summary")).first(), "새로고침 뒤 홈").toBeVisible({ timeout: 45_000 });
      await page.waitForTimeout(2_000);
      await expect(toasts(page, c.copy), "새로고침 뒤 토스트 0").toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S13] 양성 대조: 교사가 ${routeOf(7)} · admin 이 ${routeOf(8)} = 그 화면에 머묾 · 권한 토스트 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  for (const [role, screen] of [["teacher", 7], ["admin", 8]] as const) {
    const { context, page } = await openAs(browser, info, role, screen);
    try {
      expect(new URL(page.url()).pathname, `${role} ${routeOf(screen)} 머묾`).toBe(routeOf(screen));
      await page.waitForTimeout(1_500);
      for (const t of [NO_ACCESS.teacher_admin, NO_ACCESS.admin]) await expect(toasts(page, t), `권한 토스트 0 (${t})`).toHaveCount(0);
    } finally {
      await context.close();
    }
  }
});

test(`[R-ui][S13] 홈 주소에 직접 ?denied=그밖의값 → 토스트 0 (staff·admin 만)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "student", 13, `${HOME}?denied=x`);
  try {
    await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(1_500);
    for (const t of [NO_ACCESS.teacher_admin, NO_ACCESS.admin]) await expect(toasts(page, t), `토스트 0 (${t})`).toHaveCount(0);
  } finally {
    await context.close();
  }
});
