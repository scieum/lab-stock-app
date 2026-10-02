// 역할별 로그인 상태(storageState) 재사용 — Supabase Auth 요청 한도를 아끼기 위해
// 역할마다 UI 로그인을 한 번만 하고, 그 쿠키를 OS 임시 폴더 파일로 워커끼리 나눠 쓴다.
// - 저장 위치: os.tmpdir()/lab-stock-e2e-auth/{role}.json (저장소 밖, 계정 이메일·비밀번호는 쓰지 않음)
// - 워커 동시 로그인을 막기 위해 mkdir 잠금을 쓴다.
// - 저장된 세션이 만료돼 로그인 화면으로 돌아가면 한 번만 다시 로그인한다.
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, BrowserContext, Page, Response, TestInfo } from "@playwright/test";
import type { Role } from "./db-helpers";
import { devRules, loginViaUi, routeOf, sel, type ViewportName } from "./screen-helpers";

const DIR = join(tmpdir(), "lab-stock-e2e-auth");
const MAX_AGE_MS = 30 * 60 * 1000;
const LOCK_WAIT_MS = 180_000;

const statePath = (role: Role) => join(DIR, `${role}.json`);

function fresh(path: string): boolean {
  return existsSync(path) && Date.now() - statSync(path).mtimeMs < MAX_AGE_MS;
}

async function withLock<T>(role: Role, fn: () => Promise<T>): Promise<T> {
  mkdirSync(DIR, { recursive: true });
  const lock = join(DIR, `${role}.lock`);
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      // 오래된 잠금(죽은 워커)은 치운다
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > LOCK_WAIT_MS) rmSync(lock, { recursive: true, force: true });
      if (Date.now() - start > LOCK_WAIT_MS) throw new Error(`로그인 잠금 대기 초과 (${role})`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function baseURLOf(info: TestInfo): string {
  const u = info.project.use.baseURL;
  if (!u) throw new Error("playwright.config baseURL 없음");
  return u;
}

function viewportOf(info: TestInfo): { name: ViewportName; width: number; height: number } {
  const name = info.project.name as ViewportName;
  const vp = devRules.viewports[name];
  if (!vp) throw new Error(`dev-rules.json viewports 에 '${name}' 없음`);
  return { name, width: vp[0], height: vp[1] };
}

/** 역할 storageState 파일 경로 (없거나 오래됐으면 UI 로그인 1회로 만든다) */
async function ensureState(browser: Browser, info: TestInfo, role: Role, force = false): Promise<string> {
  const path = statePath(role);
  if (!force && fresh(path)) return path;
  return withLock(role, async () => {
    if (!force && fresh(path)) return path; // 잠금 대기 중 다른 워커가 만들었다
    if (force && fresh(path) && Date.now() - statSync(path).mtimeMs < 60_000) return path; // 방금 다른 워커가 새로 만듦
    const vp = viewportOf(info);
    const ctx = await browser.newContext({ baseURL: baseURLOf(info), viewport: { width: vp.width, height: vp.height } });
    try {
      const page = await ctx.newPage();
      await loginViaUi(page, role);
      await ctx.storageState({ path });
    } finally {
      await ctx.close();
    }
    return path;
  });
}

export type RolePage = { context: BrowserContext; page: Page; viewport: ViewportName; response: Response | null };

/**
 * 역할 계정으로 로그인된 새 컨텍스트에서 화면을 연다 (프로젝트 viewport = dev-rules.json viewports).
 * 저장 세션이 거부되면(로그인 화면으로 이동) 한 번 다시 로그인한다.
 * path: 화면 route 에 [param] 이 있을 때 실제 경로 (예: /reagents/{id}). 생략하면 routes[screen].
 */
export async function openAs(browser: Browser, info: TestInfo, role: Role, screen: number, path?: string): Promise<RolePage> {
  const vp = viewportOf(info);
  const route = path ?? routeOf(screen);
  for (const force of [false, true]) {
    const storageState = await ensureState(browser, info, role, force);
    const context = await browser.newContext({
      baseURL: baseURLOf(info),
      viewport: { width: vp.width, height: vp.height },
      storageState,
    });
    const page = await context.newPage();
    const response = await page.goto(route);
    await page.waitForLoadState("load");
    if (!new URL(page.url()).pathname.startsWith(routeOf(1)) && !(await showsLanding(page))) {
      return { context, page, viewport: vp.name, response };
    }
    await context.close();
  }
  throw new Error(`${role} 저장 세션으로 ${route} 진입 실패 (로그인 화면 또는 로그인 전 랜딩 표시)`);
}

/**
 * 세션이 거부됐는데 `/` 는 /login 으로 가지 않고 화면 15 랜딩을 보여 준다 (dev-rules.json route_auth).
 * `/` 에 도착했는데 landing-hero 가 있거나 home-summary 가 끝내 안 나오면 세션 없음으로 본다.
 */
async function showsLanding(page: Page): Promise<boolean> {
  if (new URL(page.url()).pathname !== routeOf(15)) return false;
  if ((await page.locator(sel("landing-hero")).count()) > 0) return true;
  try {
    await page.locator(sel("home-summary")).first().waitFor({ state: "attached", timeout: 30_000 });
    return false;
  } catch {
    return true;
  }
}
