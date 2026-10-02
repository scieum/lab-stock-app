// 화면 15 (랜딩, 로그인 전 `/`) e2e 공용 도우미.
// 기대값은 design/rules.json · harness/dev-rules.json · design/frames/15-*.json 에서 읽는다.
import { expect, type Page } from "@playwright/test";
import { devRules, routeOf, sel } from "./screen-helpers";

export const SCREEN = 15;
export const HOME = 13;
export const SIGNUP = 14;
export const LOGIN = 1;

/** dev-rules.json route_auth: 15 와 13 은 같은 경로 `/` (로그인 전/후) */
export function assertSharedRootRoute(): void {
  expect(routeOf(SCREEN), `routes["${SCREEN}"] 와 routes["${HOME}"] 는 같은 경로`).toBe(routeOf(HOME));
}

/** 화면 15 가 그려졌는지 (빈 화면에서 0개를 세어 통과하지 않도록) */
export async function waitLanding(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await expect(page.locator(sel("landing-hero")).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * 로그인 없이는 /login 으로 가야 하는 경로 — dev-rules routes 중 로그인 전 화면(15·14·1)이 아니고,
 * `/`(15 와 공유) 가 아니고, [param] 이 없는 경로.
 */
export function protectedRoutes(): { screen: number; route: string }[] {
  const open = new Set([routeOf(SCREEN), routeOf(SIGNUP), routeOf(LOGIN)]);
  return Object.entries(devRules.routes)
    .filter(([, r]) => !open.has(r) && !r.includes("["))
    .map(([s, r]) => ({ screen: Number(s), route: r }));
}
