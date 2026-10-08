// 로그인 후 공통 셸(nav-pill·tab-bar) · 화면 전환(자리 표시·이동 중 표식) e2e 도우미.
// 기준: harness/d5-gates.md (R-ui·C1·C2·N1-ui), harness/dev-rules.json (routes·route_auth·components·viewports), design/rules.json.
// 기대값은 규칙 파일에서 읽는다. 계정 값은 환경변수에서만 (auth-state.ts 의 역할별 저장 세션 재사용).
//
// 느린 응답 흉내: 고정 대기(sleep)를 쓰지 않는다. 화면 전환 요청(RSC, 미리 받기 제외)을 붙잡아 두었다가
// 테스트가 직접 풀어 준다 — "응답 전" 상태를 원하는 만큼 유지한 채 단언한다.
import { expect, type Browser, type BrowserContext, type Locator, type Page, type Request, type TestInfo } from "@playwright/test";
import type { Role } from "./db-helpers";
import { ROLE_NAME, browserClient, devRules, routeOf, rules, sel, seedRows, type ViewportName } from "./screen-helpers";
import { frameActiveLabel } from "../desktop-shell";

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

/**
 * 폭마다 바뀌는 셸 컴포넌트: 폭 390 = nav-pill · tab-bar · tab-item, 폭 1440 = app-sidebar · sidebar-item
 * (rules.json tab_bar · 1.22 desktop_shell). 화면 본문·예전 프레임 대조에서는 빼고, 셸은 expectShell(C2·C3)로 폭별 개수를 본다.
 * (nav-account-menu 는 두 셸 모두에 1개 — 본문 대조에 그대로 둔다)
 */
export const SHELL_COMPONENTS: string[] = ["nav-pill", rules.tab_bar.component, rules.tab_bar.item, rules.desktop_shell.component, rules.desktop_shell.item];
export const isShellComponent = (name: string): boolean => SHELL_COMPONENTS.includes(name);

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

/**
 * 셸의 화면 이동 링크: 폭 390 = tab-bar 의 tab-item, 폭 1440 = app-sidebar 의 sidebar-item
 * (design/rules.json 1.22 desktop_shell — 데스크톱은 nav-pill 대신 왼쪽 사이드바, d7 §23)
 */
export function shellLink(page: Page, viewport: ViewportName, screen: number): Locator {
  const href = routeOf(screen);
  const tb = rules.tab_bar;
  const ds = rules.desktop_shell;
  return viewport === "mobile"
    ? page.locator(`${sel(tb.component)} a${sel(tb.item)}[href="${href}"]`)
    : page.locator(`${sel(ds.component)} a${sel(ds.item)}[href="${href}"]`);
}

/**
 * 셸에서 학교명·계정 메뉴가 있는 곳: 폭 390 = nav-pill, 폭 1440 = app-sidebar (rules 1.22 desktop_shell, d7 §23 —
 * 위 학교명 · 아래 계정 ▾ → 로그아웃 = 예전 nav-pill 학교명 메뉴 역할)
 */
export function shellSchoolScope(page: Page, viewport: ViewportName): Locator {
  return page.locator(sel(viewport === "mobile" ? "nav-pill" : rules.desktop_shell.component));
}

/** 셸의 화면 이동 링크 전부: 폭 390 = nav-pill nav 링크, 폭 1440 = app-sidebar 의 sidebar-item 링크 */
export function shellNavLinks(page: Page, viewport: ViewportName): Locator {
  const ds = rules.desktop_shell;
  return viewport === "mobile" ? page.locator(`${sel("nav-pill")} nav a`) : page.locator(`${sel(ds.component)} a${sel(ds.item)}`);
}

/** 셸 이동 링크 글자들 (공백 정리) */
export async function shellNavLabels(page: Page, viewport: ViewportName): Promise<string[]> {
  return (await shellNavLinks(page, viewport).allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
}

/**
 * 화면 N 으로 가는 셸 링크의 글자: 폭 390 = nav-pill 문구(mobileLabel, 예전 시안), 폭 1440 = 사이드바 메뉴 문구
 * (새 프레임 {N}-desktop 의 활성 sidebar-item — rules desktop_shell.menu 안)
 */
export function shellNavLabel(viewport: ViewportName, screen: number, mobileLabel: string): string {
  return viewport === "mobile" ? mobileLabel : frameActiveLabel(screen);
}

/** 셸 계정 메뉴 버튼 (aria-haspopup=menu): 폭 390 = nav-pill 학교명 버튼, 폭 1440 = app-sidebar 계정 줄 ("이름 · 역할" ▾) */
export function shellAccountButton(page: Page, viewport: ViewportName): Locator {
  return shellSchoolScope(page, viewport).locator('button[aria-haspopup="menu"]');
}

/**
 * 셸 머리(예전 nav-pill "워드마크 · 제목 · 학교명")의 폭별 자리:
 * - 폭 390: nav-pill 1개 안에 워드마크·제목·학교명 (그대로)
 * - 폭 1440: app-sidebar 위에 워드마크·학교명, 제목은 본문(main)에 보이는 글자 (rules 1.22 desktop_shell — nav-pill 0, d7 §23)
 */
export async function expectShellHeader(
  page: Page,
  viewport: ViewportName,
  want: { wordmark?: string; title?: string; schoolName?: string },
  where: string,
): Promise<void> {
  if (viewport === "mobile") {
    const nav = page.locator(sel("nav-pill"));
    await expect(nav, `${where}: nav-pill 1개`).toHaveCount(1);
    for (const t of [want.wordmark, want.title, want.schoolName]) if (t) await expect(nav, `${where}: nav-pill "${t}"`).toContainText(t);
    return;
  }
  const sb = page.locator(sel(rules.desktop_shell.component));
  await expect(sb, `${where}: ${rules.desktop_shell.component} 1개`).toHaveCount(1);
  for (const f of rules.desktop_shell.forbidden_on_desktop) await expect(page.locator(sel(f)), `${where}: ${f} 0`).toHaveCount(0);
  for (const t of [want.wordmark, want.schoolName]) if (t) await expect(sb, `${where}: 사이드바 "${t}"`).toContainText(t);
  if (want.title) {
    // 눈에 보이는 제목만 (화면 읽기 전용 h1 — 1px 잘라 숨김 — 은 세지 않는다)
    const all = page.locator("main").getByText(want.title, { exact: true });
    await expect
      .poll(
        () =>
          all.evaluateAll((els) =>
            els.filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== "hidden";
            }).length,
          ),
        { message: `${where}: 본문 제목 "${want.title}" 눈에 보임` },
      )
      .toBeGreaterThanOrEqual(1);
  }
}

/**
 * 셸 계정 버튼 글자의 기대값: 폭 390 = 자기 학교명(nav-pill), 폭 1440 = "이름 · 역할"(app-sidebar 계정 줄 — 시안 1.22 sidebar-account
 * "김OO · 교사"; 역할 이름 = rules.json roles 의 역할 이름 학생·교사·admin). 이름·학교명은 로그인 세션(RLS)으로 읽은 자기 행.
 */
export async function shellAccountLabel(page: Page, viewport: ViewportName): Promise<string> {
  const { client, userId } = await browserClient(page);
  const prof = await client.from("profiles").select("display_name, role, school_id").eq("user_id", userId).single();
  if (prof.error || !prof.data) throw new Error(`profiles 자기 행 없음: ${prof.error?.message}`);
  if (viewport === "mobile") {
    const sch = await client.from("schools").select("name").eq("id", prof.data.school_id as string).single();
    if (sch.error || !sch.data) throw new Error(`schools 자기 학교 없음: ${sch.error?.message}`);
    return sch.data.name as string;
  }
  const name = String(prof.data.display_name ?? "").trim();
  expect(name, "계정 이름 있음 (사이드바 계정 줄)").not.toBe("");
  const r = (ROLE_NAME as Record<string, string>)[prof.data.role as string];
  expect(r, `profiles.role '${prof.data.role}' → rules roles 역할 이름`).toBeTruthy();
  return `${name} · ${r}`;
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
  // 화면 2 표식: 폭 390 = reagent-row / 폭 1440 = data-table 행 (d7 §23 run b — 데스크톱 시약 목록은 data-table)
  const desk = (page.viewportSize()?.width ?? 0) >= devRules.viewports.desktop[0];
  const marker: Record<number, string> = {
    [HOME]: `main ${sel("home-summary")}`,
    [LIST]: desk ? `main ${sel("data-table")} ${sel("ex-data-table-cell")}` : `main ${sel("reagent-row")}`,
    [HISTORY]: `main ${sel("segmented-control")}`,
  };
  const m = marker[screen];
  if (!m) throw new Error(`waitContent: 화면 ${screen} 표식 없음`);
  // 주소가 먼저다: 표식 컴포넌트는 다른 화면에도 있다(화면 2 의 segmented-control, 화면 13 의 reagent-row).
  // 링크를 누른 직후 — 전환이 커밋되기 전 — 에는 출발 화면이 "표식 보임 · 자리 표시 0" 을 이미 만족하므로,
  // 도착 화면의 주소가 될 때까지 기다린 뒤에 본문을 본다 (주소는 새 화면 트리와 같은 커밋에서 바뀐다).
  await expect.poll(() => new URL(page.url()).pathname, { message: `화면 ${screen} 경로`, timeout: 45_000 }).toBe(routeOf(screen));
  await expect(page.locator(m).first(), `화면 ${screen} 본문`).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(BUSY), "자리 표시는 본문으로 바뀐다").toHaveCount(0);
  expect(new URL(page.url()).pathname, `화면 ${screen} 경로`).toBe(routeOf(screen));
}

/**
 * 셸 개수가 그 폭의 기대값이 될 때까지 (하이드레이션 뒤 폭 판정 — 서버 HTML 에는 두 폭의 셸이 다 있고 하이드레이션 뒤 한쪽이 빠진다).
 * - 폭 390: nav-pill 1 · rules.json tab_bar (mobile_screens 면 1 · items) · app-sidebar·sidebar-item 0
 * - 폭 1440: desktop_shell.screens 면 app-sidebar 1 · sidebar-item ≥ min_items · forbidden_on_desktop(nav-pill) 0, tab-bar 0
 *   (rules 1.22 desktop_shell, d5 C3)
 */
export async function expectShell(page: Page, viewport: ViewportName, screen: number, when: string): Promise<void> {
  const tb = rules.tab_bar;
  const ds = rules.desktop_shell;
  if (viewport === "mobile") {
    const shown = tb.mobile_screens.includes(screen);
    await expect(page.locator(sel("nav-pill")), `${when}: nav-pill`).toHaveCount(1);
    await expect(page.locator(sel(tb.component)), `${when}: ${viewport} ${tb.component}`).toHaveCount(shown ? 1 : 0);
    await expect(page.locator(sel(tb.item)), `${when}: ${viewport} ${tb.item}`).toHaveCount(shown ? tb.items : 0);
    await expect(page.locator(sel(ds.component)), `${when}: ${viewport} ${ds.component}`).toHaveCount(0);
    await expect(page.locator(sel(ds.item)), `${when}: ${viewport} ${ds.item}`).toHaveCount(0);
    return;
  }
  const sidebar = ds.screens.includes(screen);
  await expect(page.locator(sel(ds.component)), `${when}: ${viewport} ${ds.component}`).toHaveCount(sidebar ? 1 : 0);
  if (sidebar) {
    for (const f of ds.forbidden_on_desktop) await expect(page.locator(sel(f)), `${when}: ${viewport} ${f} (forbidden_on_desktop)`).toHaveCount(0);
    expect(await page.locator(`${sel(ds.component)} ${sel(ds.item)}`).count(), `${when}: ${ds.item} ≥ min_items`).toBeGreaterThanOrEqual(ds.min_items);
  }
  await expect(page.locator(sel(tb.component)), `${when}: ${viewport} ${tb.component}`).toHaveCount(0);
  await expect(page.locator(sel(tb.item)), `${when}: ${viewport} ${tb.item}`).toHaveCount(0);
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
