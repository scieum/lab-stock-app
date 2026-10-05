// 프로필 없는 세션(학교에서 내보낸 계정, harness/d7-data.md §8) — 셸 구조 변경(run 20261005-0149) 뒤의 회귀 방지.
// 화면 8 쓰기 스펙(screen-8-write)이 이미 보는 것: `/` 안내 문구·버튼·링크, /reagents·/usage·/usage/new·/intake·/users 의 3xx → `/`, 로그아웃.
// 여기서 더 보는 것 (중복하지 않는다):
//  - `/` 자체가 리다이렉트 없이 200 으로 끝난다 (무한 리다이렉트 없음) · 본문 자리 표시(aria-busy)가 남지 않는다 · 업무 컴포넌트 0
//  - 동적 화면(시약 상세·?reagent 사용 기록 입력)과 내부 주소 /landing 도 `/` 로 귀결, 응답(HTML·RSC)에 다른 학교 시약명·학교명 없음
//  - 링크를 눌러 올 때와 같은 요청(RSC)에도 업무 데이터가 없다
// 운영 DB: 쓰기는 일회용 학교·계정에만 (screen-8-helpers 의 service role 준비·정리), 끝나면 잔여 0 · 학교 A·B 프로필·초대 그대로.
// 판정 대상은 항상 그 계정의 로그인 세션(쿠키) 응답·화면이다 — service role 로 판정하지 않는다.
import { test, expect, type BrowserContext, type TestInfo } from "@playwright/test";
import { devRules, routeOf, rules, sel } from "./screen-helpers";
import { detailPath, seedReagents, seedSchoolOf } from "./screen-3-helpers";
import {
  NO_RESIDUE,
  NO_SCHOOL_TITLE,
  addMember,
  authUserExists,
  clientFor,
  contextFor,
  exact,
  profileByService,
  sharedSnapshot,
  sweep,
  tempSchool,
  type TempSchool,
  type TempUser,
} from "./screen-8-helpers";
import { ALL_COMPONENTS, BUSY, DETAIL, HISTORY, HOME, INTAKE, LIST, LOGIN, USAGE_NEW, USERS, componentCounts, componentsOf, schoolNamesIn } from "./shell-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "shell";
const HOME_PATH = routeOf(HOME);
/** 화면 15 랜딩의 내부 주소 — dev-rules routes 에 없다 */
const LANDING_SEGMENT = "/landing";
/** 한 요청이 `/` 에 닿기까지 허용하는 리다이렉트 수 */
const MAX_HOPS = 2;

let before: Awaited<ReturnType<typeof sharedSnapshot>> | null = null;
let prepared: Promise<{ school: TempSchool; user: TempUser }> | null = null;

/** 일회용 학교의 멤버였다가 같은 학교 admin 이 내보낸 계정 (프로필 없음, 로그인 계정은 남음) — 워커당 1개 */
function removedUser(info: TestInfo): Promise<{ school: TempSchool; user: TempUser }> {
  prepared ??= (async () => {
    const school = await tempSchool(info, GROUP);
    const user = await addMember(school, info, GROUP, "내보낸세션");
    const removed = await (await clientFor(school.admin)).rpc("remove_member", { p_user_id: user.id });
    expect(removed.error, `준비: 내보내기 (${removed.error?.message})`).toBeNull();
    expect(await profileByService(user.id), "준비: 프로필 행 없음").toBeNull();
    expect(await authUserExists(user.id), "준비: 로그인 계정은 남음").toBe(true);
    return { school, user };
  })();
  return prepared;
}

/** 학교 A (seed) 의 시약 — 프로필 없는 세션에게는 다른 학교 데이터다 */
function foreignReagent() {
  const school = seedSchoolOf("student");
  const reagent = seedReagents().filter((x) => x.school_id === school.id)[0];
  if (!reagent) throw new Error("seed 학교 A 시약 없음");
  return { school, reagent };
}

/** 학교 소속이 있어야 열리는 경로 (dev-rules routes) + 내부 주소 */
function memberPaths(): string[] {
  const { reagent } = foreignReagent();
  return [
    routeOf(LIST),
    `${routeOf(LIST)}?filter=low-stock`,
    routeOf(HISTORY),
    `${routeOf(HISTORY)}?mine=1`,
    detailPath(reagent.id),
    routeOf(USAGE_NEW),
    `${routeOf(USAGE_NEW)}?reagent=${reagent.id}`,
    routeOf(INTAKE),
    `${routeOf(INTAKE)}?reagent=${reagent.id}`,
    routeOf(USERS),
    LANDING_SEGMENT,
  ];
}

/** 리다이렉트를 한 단계씩 따라가 3xx 가 아닌 응답에 닿을 때까지 (MAX_HOPS 를 넘으면 실패) */
async function follow(context: BrowserContext, info: TestInfo, path: string): Promise<{ hops: string[]; status: number; body: string }> {
  const hops: string[] = [];
  let at = path;
  for (let i = 0; i <= MAX_HOPS; i++) {
    const res = await context.request.get(at, { maxRedirects: 0 });
    const body = await res.text();
    if (res.status() < 300 || res.status() >= 400) return { hops, status: res.status(), body };
    const to = new URL(res.headers()["location"], info.project.use.baseURL);
    at = to.pathname + to.search;
    hops.push(at);
  }
  throw new Error(`${path}: 리다이렉트가 ${MAX_HOPS} 번을 넘는다 (${hops.join(" → ")})`);
}

test.beforeAll(async () => {
  before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  prepared = null;
  const left = await sweep(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·초대·프로필 잔여물").toEqual(NO_RESIDUE);
  if (before) expect(await sharedSnapshot(), "학교 A·B 의 프로필·초대가 그대로").toEqual(before);
});

test(`[R-ui][S${HOME}] 프로필 없는 세션 ${HOME_PATH}: 리다이렉트 없이 200 ("${NO_SCHOOL_TITLE}") · 업무 컴포넌트·tab-bar 0 · 본문 자리 표시가 남지 않음 · 다시 요청해도 같음`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { school, user } = await removedUser(info);
  const tb = rules.tab_bar;
  // 로그인 화면(1)에도 쓰이는 공용 컴포넌트(nav-pill·카드·버튼)를 뺀 나머지 = 학교 소속이 있어야 보이는 컴포넌트
  const preLogin = new Set(componentsOf(LOGIN));
  const business = ALL_COMPONENTS.filter((n) => !preLogin.has(n));
  expect(business, "대조: 업무 컴포넌트").toEqual(expect.arrayContaining([tb.component, tb.item, "home-summary", "quick-action", "reagent-row"]));
  const context = await contextFor(browser, info, user);
  try {
    for (const pass of ["처음", "다시"]) {
      const res = await context.request.get(HOME_PATH, { maxRedirects: 0 });
      expect(res.status(), `${pass}: ${HOME_PATH} 는 리다이렉트 없이 200`).toBe(200);
      const html = await res.text();
      expect(html, `${pass}: 응답 본문에 안내`).toContain(NO_SCHOOL_TITLE);
      for (const n of business) expect(html, `${pass}: 응답 본문에 ${n}`).not.toContain(`data-component="${n}"`);
      expect(html, `${pass}: 응답 본문에 전 학교명`).not.toContain(school.name);
    }
    const page = await context.newPage();
    const nav = await page.goto(HOME_PATH);
    expect(nav!.status()).toBe(200);
    expect(nav!.request().redirectedFrom(), "문서 요청은 리다이렉트를 거치지 않는다").toBeNull();
    await expect(page.getByRole("heading", { name: exact(NO_SCHOOL_TITLE) })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("load");
    await expect(page.locator(sel(tb.component)), "하이드레이션 뒤에도 tab-bar 0").toHaveCount(0);
    await expect(page.locator("[aria-busy='true']"), "자리 표시가 남지 않는다").toHaveCount(0);
    expect(await componentCounts(page.locator("body"), business), "업무 컴포넌트").toEqual(Object.fromEntries(business.map((n) => [n, 0])));
    expect(await schoolNamesIn(page.locator("body")), "학교명").toEqual([]);
    expect(new URL(page.url()).pathname).toBe(HOME_PATH);
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${LIST}] 프로필 없는 세션: 학교 소속 화면(목록·내역·상세·사용 기록 입력·입고·사용자 관리)과 ${LANDING_SEGMENT} → ${HOME_PATH} 로 ${MAX_HOPS} 번 안에 귀결 (무한 리다이렉트 없음) · 도착 화면 = "${NO_SCHOOL_TITLE}"`, async ({ browser }, info) => {
  test.setTimeout(300_000);
  const { user } = await removedUser(info);
  const tb = rules.tab_bar;
  const context = await contextFor(browser, info, user);
  try {
    for (const path of memberPaths()) {
      const first = await context.request.get(path, { maxRedirects: 0 });
      expect(first.status(), `${path} 는 리다이렉트 (200·404 로 화면을 그리지 않는다)`).toBeGreaterThanOrEqual(300);
      expect(first.status(), `${path}`).toBeLessThan(400);
      const r = await follow(context, info, path);
      expect(r.status, `${path} 의 끝`).toBe(200);
      expect(r.hops.at(-1), `${path} 의 끝 주소`).toBe(HOME_PATH);
      expect(r.body, `${path} 의 끝 화면`).toContain(NO_SCHOOL_TITLE);
    }
    // 브라우저로도: 동적 화면 주소·내부 주소에서 `/` 안내로 온다
    const page = await context.newPage();
    const { reagent } = foreignReagent();
    for (const path of [detailPath(reagent.id), `${routeOf(USAGE_NEW)}?reagent=${reagent.id}`, LANDING_SEGMENT]) {
      await page.goto(path);
      await page.waitForURL((u) => u.pathname === HOME_PATH, { timeout: 30_000 });
      await expect(page.getByRole("heading", { name: exact(NO_SCHOOL_TITLE) }), `${path} → 안내`).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(sel(tb.component)), `${path}: tab-bar`).toHaveCount(0);
      await expect(page.locator(BUSY), `${path}: 자리 표시`).toHaveCount(0);
      await expect(page.locator(sel("landing-hero")), `${path}: 랜딩이 아니다`).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

test(`[N1-ui][S${DETAIL}] 프로필 없는 세션 → 학교 A 시약 id 로 상세·사용 기록 입력·입고 접근: 응답(HTML·RSC, 리다이렉트 전·후)에 그 시약명·학교명·업무 컴포넌트 없음`, async ({ browser }, info) => {
  test.setTimeout(300_000);
  const { school: own, user } = await removedUser(info);
  const { school, reagent } = foreignReagent();
  expect(devRules.routes[String(DETAIL)], "dev-rules routes 3 은 [id] 경로").toContain("[");
  const context = await contextFor(browser, info, user);
  try {
    const paths = [detailPath(reagent.id), `${routeOf(USAGE_NEW)}?reagent=${reagent.id}`, `${routeOf(INTAKE)}?reagent=${reagent.id}`, routeOf(LIST), routeOf(HISTORY), HOME_PATH];
    for (const path of paths) {
      for (const headers of [undefined, { RSC: "1" }]) {
        const kind = headers ? "RSC" : "HTML";
        // 리다이렉트를 따라가지 않은 첫 응답과, 따라간 최종 응답 모두
        const responses = [await context.request.get(path, { maxRedirects: 0, headers }), await context.request.get(path, { headers })];
        for (const res of responses) {
          expect(res.status(), `${kind} ${path} 는 서버 오류가 아니다`).toBeLessThan(500);
          const body = await res.text();
          expect(body, `${kind} ${path} 응답에 학교 A 시약명`).not.toContain(reagent.name);
          expect(body, `${kind} ${path} 응답에 학교 A 이름`).not.toContain(school.name);
          expect(body, `${kind} ${path} 응답에 전 학교명`).not.toContain(own.name);
          for (const n of ["reagent-detail-card", "reagent-row", "home-summary", rules.tab_bar.component]) {
            expect(body, `${kind} ${path} 응답에 ${n}`).not.toContain(`data-component="${n}"`);
            expect(body, `${kind} ${path} 응답에 ${n}`).not.toContain(`"data-component":"${n}"`);
          }
        }
      }
    }
  } finally {
    await context.close();
  }
});
