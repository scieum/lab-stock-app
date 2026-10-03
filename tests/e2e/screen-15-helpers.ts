// 화면 15 (랜딩, 로그인 전 `/`) e2e 공용 도우미.
// 기대값은 design/rules.json · harness/dev-rules.json · design/frames/15-*.json 에서 읽는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { devRules, routeOf, rules, sel } from "./screen-helpers";

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

/** dev-rules routes 의 둘러보기 키: `{화면}-guest` (예: "13-guest") */
const GUEST_SUFFIX = "-guest";

export function isGuestRouteKey(key: string): boolean {
  return key.endsWith(GUEST_SUFFIX);
}

/** 둘러보기 키 → 화면 번호 ("13-guest" → 13) */
export function guestScreenOfKey(key: string): number {
  return Number(key.slice(0, -GUEST_SUFFIX.length));
}

/** dev-rules.json routes["{screen}-guest"] — 둘러보기 경로 (비로그인 허용) */
export function guestRouteOf(screen: number): string {
  const key = `${screen}${GUEST_SUFFIX}`;
  const r = devRules.routes[key];
  if (!r) throw new Error(`dev-rules.json routes 에 ${key} 없음`);
  return r;
}

/** 둘러보기 진입 경로: rules.json guest.entry_screen 이 이 화면이고, 진입 대상은 dev-rules guest_screens[0] (13g) */
export function guestEntryRoute(): string {
  expect(rules.guest.entry_screen, "rules.json guest.entry_screen 은 화면 15").toBe(SCREEN);
  expect(devRules.guest_screens.length, "dev-rules.json guest_screens").toBeGreaterThan(0);
  expect(devRules.guest_screens, `guest_screens 는 rules.json guest.screens 와 같음`).toEqual(rules.guest.screens);
  return guestRouteOf(HOME);
}

/**
 * dev-rules routes 의 둘러보기 경로 전부 — 키가 `-guest` 이고 화면 번호가 guest_screens 에 있어야 한다.
 * (키만 보고 넘기지 않도록 guest_screens 와 교차 확인)
 */
export function guestRoutes(): { screen: number; route: string }[] {
  const out = Object.entries(devRules.routes)
    .filter(([k]) => isGuestRouteKey(k))
    .map(([k, r]) => ({ screen: guestScreenOfKey(k), route: r }));
  expect(out.length, "dev-rules routes 에 -guest 경로").toBe(devRules.guest_screens.length);
  for (const g of out) expect(devRules.guest_screens, `${g.screen}-guest 는 guest_screens 에 있음`).toContain(g.screen);
  return out;
}

/**
 * 로그인 없이는 /login 으로 가야 하는 경로 — dev-rules routes 중 로그인 전 화면(15·14·1)이 아니고,
 * `/`(15 와 공유) 가 아니고, 둘러보기(`-guest`, guest_screens) 경로가 아니고, [param] 이 없는 경로.
 */
export function protectedRoutes(): { screen: number; route: string }[] {
  const open = new Set([routeOf(SCREEN), routeOf(SIGNUP), routeOf(LOGIN)]);
  const guest = new Set(guestRoutes().map((g) => g.route));
  return Object.entries(devRules.routes)
    .filter(([k, r]) => !isGuestRouteKey(k) && !guest.has(r) && !open.has(r) && !r.includes("["))
    .map(([s, r]) => ({ screen: Number(s), route: r }));
}

type FrameNode = { name: string; type: string; path: string[]; text: { characters: string } | null };
type FrameFile = { frames: { name: string; nodes: FrameNode[] }[] };

/** design/frames/{screen}-{viewport}.json 에서 조상 이름이 ancestor 인 TEXT 노드의 문구들 */
export function frameTextsUnder(screen: number, viewport: string, ancestor: string): string[] {
  const file = JSON.parse(
    readFileSync(join(process.cwd(), "design", "frames", `${screen}-${viewport}.json`), "utf8"),
  ) as FrameFile;
  const frame = file.frames.find((f) => f.name === `${screen}-${viewport}`);
  if (!frame) throw new Error(`design/frames/${screen}-${viewport}.json 에 프레임 ${screen}-${viewport} 없음`);
  return frame.nodes
    .filter((n) => n.type === "TEXT" && n.text && n.path.includes(ancestor))
    .map((n) => n.text!.characters.trim());
}
