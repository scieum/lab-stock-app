// 로그인 후 공통 셸(nav-pill·tab-bar) · 화면 전환(자리 표시·이동 중 표식) e2e 도우미.
// 기준: harness/d5-gates.md (R-ui·C1·C2·N1-ui), harness/dev-rules.json (routes·route_auth·components·viewports), design/rules.json.
// 기대값은 규칙 파일에서 읽는다. 계정 값은 환경변수에서만 (auth-state.ts 의 역할별 저장 세션 재사용).
//
// 느린 응답 흉내: 고정 대기(sleep)를 쓰지 않는다. 화면 전환 요청(RSC, 미리 받기 제외)을 붙잡아 두었다가
// 테스트가 직접 풀어 준다 — "응답 전" 상태를 원하는 만큼 유지한 채 단언한다.
import { expect, type Browser, type BrowserContext, type Locator, type Page, type Request, type TestInfo } from "@playwright/test";
import type { Role } from "./db-helpers";
import { browserClient, devRules, routeOf, rules, sel, seedRows, type ViewportName } from "./screen-helpers";

export const HOME = 13;
export const LIST = 2;
export const DETAIL = 3;
export const USAGE_NEW = 4;
export const INTAKE = 7;
export const USERS = 8;
export const HISTORY = 10;
export const LANDING = 15;
export const LOGIN = 1;

/** rules.json roles 의 역할 이름 (학교 B 계정은 교사) */
export const RULE_ROLE: Record<Role, string> = { student: "학생", teacher: "교사", admin: "admin", schoolB: "교사" };

/** dev-rules.json components 의 모든 컴포넌트 이름 */
export const ALL_COMPONENTS = Object.keys(devRules.components);

/** 화면 N 에 속한 컴포넌트 이름 (dev-rules.json components) */
export function componentsOf(screen: number): string[] {
  return Object.entries(devRules.components)
    .filter(([, screens]) => screens.includes(screen))
    .map(([name]) => name);
}

/** 본문 자리 표시 (서버 응답 대기 중 표시) — aria-busy 로 찾는다 */
export const BUSY = 'main [aria-busy="true"]';
/** 누른 링크의 "이동 중" 표식 */
export const PENDING = "[data-pending]";

export function viewportOf(info: TestInfo): { name: ViewportName; width: number; height: number } {
  const name = info.project.name as ViewportName;
  const vp = devRules.viewports[name];
  if (!vp) throw new Error(`dev-rules.json viewports 에 '${name}' 없음`);
  return { name, width: vp[0], height: vp[1] };
}

/** 로그인하지 않은 새 컨텍스트 (프로젝트 viewport) */
export async function anonContext(browser: Browser, info: TestInfo): Promise<BrowserContext> {
  const vp = viewportOf(info);
  return browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: vp.width, height: vp.height } });
}

/** Location 헤더 → 경로 */
export function locationPath(location: string | undefined, info: TestInfo): string {
  expect(location, "Location 헤더").toBeTruthy();
  return new URL(location!, info.project.use.baseURL).pathname;
}

// ---------- 화면 전환 요청 붙잡기 ----------

const isRsc = (r: Request) => r.method() === "GET" && r.headers()["rsc"] !== undefined;
const isPrefetch = (r: Request) => r.headers()["next-router-prefetch"] !== undefined || r.headers()["next-router-segment-prefetch"] !== undefined;
/** 링크를 눌러 생기는 화면 전환 요청 (미리 받기 제외) */
const isNavigation = (r: Request) => isRsc(r) && !isPrefetch(r);

export type NavGate = {
  /** 지금부터 화면 전환 요청을 붙잡는다 */
  hold: () => void;
  /** 붙잡은 요청을 모두 보낸다 (이후 요청은 그대로 통과) */
  release: () => void;
  /** 붙잡혀 있는(아직 서버로 가지 않은) 요청의 경로 */
  held: () => string[];
  /** 끝난 미리 받기 응답의 경로 (자리 표시를 누른 즉시 보여 주려면 먼저 받아져 있어야 한다) */
  prefetched: () => string[];
  /** 지금까지의 모든 요청 경로 (문서·RSC·미리 받기) */
  requested: () => string[];
  /** 4xx·5xx 응답 "상태 경로" */
  failures: () => string[];
};

/**
 * 화면 전환 요청 문지기. page.goto 전에 설치한다.
 * hold() 뒤에 누른 링크의 전환 요청은 release() 까지 서버에 닿지 않는다 — 응답 전 화면을 시간 제약 없이 살핀다.
 */
export async function installNavGate(page: Page, info: TestInfo): Promise<NavGate> {
  const appOrigin = new URL(info.project.use.baseURL ?? "").origin;
  let holding = false;
  let waiters: (() => void)[] = [];
  const held: string[] = [];
  const prefetched: string[] = [];
  const requested: string[] = [];
  const failures: string[] = [];
  const origin = (u: string) => new URL(u);

  await page.route(
    () => true,
    async (route) => {
      const req = route.request();
      if (holding && isNavigation(req)) {
        held.push(origin(req.url()).pathname);
        await new Promise<void>((r) => waiters.push(r));
      }
      await route.continue().catch(() => undefined);
    },
  );
  page.on("request", (req) => {
    const u = origin(req.url());
    if (u.origin === appOrigin) requested.push(u.pathname);
  });
  page.on("response", (res) => {
    const req = res.request();
    if (origin(req.url()).origin !== appOrigin) return;
    const path = origin(req.url()).pathname;
    if (res.status() >= 400) failures.push(`${res.status()} ${path}`);
  });
  // 미리 받기는 필요한 만큼 읽은 뒤 라우터가 스스로 끊는다(ERR_ABORTED) — 응답을 받은 뒤 끝났으면(완료·중단 모두) 받은 것으로 본다
  const prefetchDone = (req: Request) => {
    if (!isRsc(req) || req.headers()["next-router-prefetch"] === undefined || req.headers()["next-router-segment-prefetch"] !== undefined) return;
    void req
      .response()
      .then((res) => {
        if (res && res.ok()) prefetched.push(origin(req.url()).pathname);
      })
      .catch(() => undefined);
  };
  page.on("requestfinished", prefetchDone);
  page.on("requestfailed", prefetchDone);
  return {
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      const w = waiters;
      waiters = [];
      held.length = 0;
      w.forEach((r) => r());
    },
    held: () => [...held],
    prefetched: () => [...prefetched],
    requested: () => [...requested],
    failures: () => [...failures],
  };
}

// ---------- 화면 요소 ----------

/** 셸의 화면 이동 링크: 폭 390 = tab-bar 의 tab-item, 폭 1440 = nav-pill 의 주 메뉴 링크 */
export function shellLink(page: Page, viewport: ViewportName, screen: number): Locator {
  const href = routeOf(screen);
  const tb = rules.tab_bar;
  return viewport === "mobile"
    ? page.locator(`${sel(tb.component)} a${sel(tb.item)}[href="${href}"]`)
    : page.locator(`${sel("nav-pill")} nav a[href="${href}"]`);
}

/** 링크가 하이드레이션됐는지 (하이드레이션 전 누름은 문서 이동이 돼 버린다) */
export async function waitHydrated(link: Locator): Promise<void> {
  await expect(link, "링크 1개").toHaveCount(1);
  await expect
    .poll(() => link.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "하이드레이션", timeout: 30_000 })
    .toBe(true);
}

/** 화면 본문이 그려졌는지 (빈 화면·자리 표시에서 개수를 세어 통과하지 않도록) */
export async function waitContent(page: Page, screen: number): Promise<void> {
  const marker: Record<number, string> = {
    [HOME]: `main ${sel("home-summary")}`,
    [LIST]: `main ${sel("reagent-row")}`,
    [HISTORY]: `main ${sel("segmented-control")}`,
  };
  const m = marker[screen];
  if (!m) throw new Error(`waitContent: 화면 ${screen} 표식 없음`);
  await expect(page.locator(m).first(), `화면 ${screen} 본문`).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(BUSY), "자리 표시는 본문으로 바뀐다").toHaveCount(0);
  expect(new URL(page.url()).pathname, `화면 ${screen} 경로`).toBe(routeOf(screen));
}

/** rules.json tab_bar · nav-pill 이 그 폭의 기대 개수가 될 때까지 (하이드레이션 뒤 폭 판정) */
export async function expectShell(page: Page, viewport: ViewportName, screen: number, when: string): Promise<void> {
  const tb = rules.tab_bar;
  const shown = viewport === "mobile" && tb.mobile_screens.includes(screen);
  await expect(page.locator(sel("nav-pill")), `${when}: nav-pill`).toHaveCount(1);
  await expect(page.locator(sel(tb.component)), `${when}: ${viewport} ${tb.component}`).toHaveCount(shown ? 1 : 0);
  await expect(page.locator(sel(tb.item)), `${when}: ${viewport} ${tb.item}`).toHaveCount(shown ? tb.items : 0);
}

/** dev-rules.json components 이름별 DOM 개수 (scope 안) */
export function componentCounts(scope: Locator, names: string[] = ALL_COMPONENTS): Promise<Record<string, number>> {
  return scope.evaluate(
    (root, list) => Object.fromEntries(list.map((n) => [n, root.querySelectorAll(`[data-component="${n}"]`).length])),
    names,
  );
}

/** 보이는 글자에서 학교명 패턴(rules.json never.N1.school_name_pattern)에 맞는 이름 종류 */
export async function schoolNamesIn(scope: Locator): Promise<string[]> {
  const text = await scope.innerText();
  return [...new Set(text.match(new RegExp(rules.never.N1.school_name_pattern, "g")) ?? [])];
}

/** 학교 데이터로 볼 글자: seed 의 모든 학교 시약명 + 로그인 세션(RLS)으로 보이는 사용자 이름 */
export async function schoolDataWords(page: Page): Promise<string[]> {
  const reagents = seedRows("reagents").map((r) => r.name);
  const { client } = await browserClient(page);
  const profs = await client.from("profiles").select("display_name");
  if (profs.error) throw new Error(`profiles 조회 실패: ${profs.error.message}`);
  const names = (profs.data ?? []).map((p) => p.display_name as string);
  expect(names.length, "대조: 자기 이름은 보인다").toBeGreaterThan(0);
  return [...new Set([...reagents, ...names].filter(Boolean))];
}

// ---------- aria-current 기록 ----------

/**
 * 보이는 aria-current="page" 개수를 DOM 이 바뀔 때마다 기록한다 (React 커밋 하나 = 기록 하나 이상).
 * 화면 전환 도중 잠깐이라도 0개·2개가 되면 기록에 남는다.
 */
export async function watchAriaCurrent(page: Page): Promise<void> {
  await page.evaluate(() => {
    const count = () =>
      [...document.querySelectorAll('[aria-current="page"]')].filter((e) => e.getClientRects().length > 0).length;
    const w = window as unknown as { __ariaCurrent: number[] };
    w.__ariaCurrent = [count()];
    new MutationObserver(() => w.__ariaCurrent.push(count())).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });
}

/** 기록된 개수의 종류 (정렬) — 문서가 다시 만들어졌으면(기록 없음) 오류 */
export async function ariaCurrentSeen(page: Page): Promise<number[]> {
  const seen = await page.evaluate(() => (window as unknown as { __ariaCurrent?: number[] }).__ariaCurrent ?? null);
  if (!seen) throw new Error("aria-current 기록이 없다 — 문서가 다시 로드됐다 (클라이언트 전환이 아님)");
  return [...new Set(seen)].sort();
}

/** 지금 보이는 aria-current="page" 요소의 href */
export function ariaCurrentHrefs(page: Page): Promise<string[]> {
  return page
    .locator('[aria-current="page"]')
    .evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).map((e) => e.getAttribute("href") ?? ""));
}
