// 화면 1 학교 선택 (N1-d): rules.json never.N1.school_select_levels 순서 강제, 목록은 /api/neis 응답에서만,
// rules.json neis.exclude_sido (재외한국학교) 미포함.
import { test, expect, type Page, type Response } from "@playwright/test";
import { routeOf, rules, sel, useProjectViewport, waitLoginScreen } from "./screen-helpers";

const SCREEN = 1;
const N1 = rules.never.N1;
const [SIDO, REGION, SCHOOL] = N1.school_select_levels;
const NEIS_PREFIX = "/api/neis/";

const box = (page: Page, level: string) => page.locator(`${sel(level)} button[aria-haspopup="listbox"]`);
const options = (page: Page, level: string) => page.locator(`${sel(level)} [role=option]`);

function waitNeis(page: Page, path: string): Promise<Response> {
  return page.waitForResponse((r) => new URL(r.url()).pathname === NEIS_PREFIX + path, { timeout: 60_000 });
}

async function jsonList<T>(res: Response, key: string): Promise<T[]> {
  expect(res.status(), `${new URL(res.url()).pathname} HTTP`).toBe(200);
  const body = (await res.json()) as Record<string, T[]>;
  expect(Array.isArray(body[key]), `${key} 배열`).toBe(true);
  return body[key];
}

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (t: string) => new RegExp(`^\\s*${escapeRe(t)}\\s*$`);
const pick = (page: Page, level: string, label: string) => options(page, level).filter({ hasText: exact(label) }).click();

async function optionLabels(page: Page, level: string): Promise<string[]> {
  return (await options(page, level).allTextContents()).map((t) => t.trim());
}

/** 이 단계가 아직 열리지 않았는지: 선택 상자 비활성 + 옵션 0개 */
async function expectLocked(page: Page, level: string) {
  await expect(box(page, level), `${level} 비활성`).toBeDisabled();
  await expect(options(page, level), `${level} 옵션 없음`).toHaveCount(0);
}

test(`[N1-d][S${SCREEN}] ${N1.school_select_levels.join(" → ")} 순서 강제 · 목록은 /api/neis 응답만 · ${rules.neis.exclude_sido.join("·")} 미포함`, async ({ page }, info) => {
  test.setTimeout(120_000);
  await useProjectViewport(page, info);

  // 요청 감시: 목록용 fetch/xhr 는 같은 출처 /api/neis/* 만 (Next RSC 요청은 제외), 외부 NEIS 직접 호출 0
  const neisCalls: string[] = [];
  const otherFetches: string[] = [];
  const externalNeis: string[] = [];
  let origin = "";
  const pending: Promise<void>[] = [];
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (/neis\.go\.kr$/i.test(u.hostname)) externalNeis.push(u.hostname + u.pathname);
    const type = req.resourceType();
    if (type !== "fetch" && type !== "xhr") return;
    if (origin && u.origin !== origin) {
      otherFetches.push(u.origin + u.pathname);
      return;
    }
    if (u.pathname.startsWith(NEIS_PREFIX)) {
      neisCalls.push(u.pathname);
      return;
    }
    // Next 라우터 RSC 요청(헤더 rsc: 1)은 화면 이동용이라 목록 요청이 아니다
    pending.push(
      req.allHeaders().then((h) => {
        if (h["rsc"] !== "1") otherFetches.push(u.pathname + u.search);
      }),
    );
  });

  const sidoRes = waitNeis(page, "sido");
  await page.goto(routeOf(SCREEN));
  origin = new URL(page.url()).origin;
  await waitLoginScreen(page);

  // 시/도 고르기 전: 지역·학교 잠김
  await expectLocked(page, REGION);
  await expectLocked(page, SCHOOL);

  // 1단계 시/도 — 목록 = /api/neis/sido 응답 그대로, 제외 시/도 없음
  const sidoList = await jsonList<string>(await sidoRes, "sido");
  expect(sidoList.length, "시/도 응답").toBeGreaterThan(0);
  for (const ex of rules.neis.exclude_sido) expect(sidoList, `응답에 ${ex}`).not.toContain(ex);
  await expect(box(page, SIDO)).toBeEnabled();
  await box(page, SIDO).click();
  const sidoShown = await optionLabels(page, SIDO);
  expect(sidoShown).toEqual(sidoList);
  for (const ex of rules.neis.exclude_sido) expect(sidoShown, `화면에 ${ex}`).not.toContain(ex);
  expect(sidoShown).toContain(rules.neis.default_sido);

  const regionRes = waitNeis(page, "regions");
  await pick(page, SIDO, rules.neis.default_sido);
  await expect(box(page, SIDO)).toContainText(rules.neis.default_sido);
  await expectLocked(page, SCHOOL); // 지역 고르기 전 학교 잠김

  // 2단계 지역 — 목록 = /api/neis/regions 응답 그대로
  const rr = await regionRes;
  expect(new URL(rr.url()).searchParams.get("sido")).toBe(rules.neis.default_sido);
  const regionList = await jsonList<string>(rr, "regions");
  expect(regionList).toContain(rules.neis.default_region);
  await expect(box(page, REGION)).toBeEnabled();
  await box(page, REGION).click();
  expect(await optionLabels(page, REGION)).toEqual(regionList);

  const schoolRes = waitNeis(page, "schools");
  await pick(page, REGION, rules.neis.default_region);
  await expect(box(page, REGION)).toContainText(rules.neis.default_region);

  // 3단계 학교 — 목록 = /api/neis/schools 응답 이름 그대로, 모두 school_kind
  const sr = await schoolRes;
  expect(new URL(sr.url()).searchParams.get("sido")).toBe(rules.neis.default_sido);
  expect(new URL(sr.url()).searchParams.get("region")).toBe(rules.neis.default_region);
  const schools = await jsonList<{ name: string; sido: string; region: string }>(sr, "schools");
  expect(schools.length, "학교 응답").toBeGreaterThan(0);
  for (const s of schools) {
    expect(s.name, "학교 종류").toContain(rules.neis.school_kind);
    expect(s.sido).toBe(rules.neis.default_sido);
    expect(s.region).toBe(rules.neis.default_region);
  }
  await expect(box(page, SCHOOL)).toBeEnabled();
  await box(page, SCHOOL).click();
  const schoolShown = await optionLabels(page, SCHOOL);
  expect(schoolShown).toEqual(schools.map((s) => s.name));
  await options(page, SCHOOL).first().click();
  await expect(box(page, SCHOOL)).toContainText(schoolShown[0]);

  // 앞 단계를 바꾸면 뒤 단계가 다시 잠긴다 (다른 시/도)
  const otherSido = sidoList.find((s) => s !== rules.neis.default_sido);
  expect(otherSido, "두 번째 시/도").toBeTruthy();
  await box(page, SIDO).click();
  const regionRes2 = waitNeis(page, "regions");
  await pick(page, SIDO, otherSido!);
  await expectLocked(page, SCHOOL);
  await expect(box(page, SCHOOL)).not.toContainText(schoolShown[0]);
  await expect(box(page, REGION)).not.toContainText(rules.neis.default_region);
  await regionRes2;
  await page.waitForLoadState("networkidle");

  // 요청 출처
  await Promise.all(pending);
  expect(externalNeis, "브라우저에서 NEIS 직접 호출").toEqual([]);
  expect(otherFetches, "/api/neis 밖 목록 요청").toEqual([]);
  for (const p of ["sido", "regions", "schools"]) {
    expect(neisCalls, `${NEIS_PREFIX}${p} 요청`).toContain(NEIS_PREFIX + p);
  }
});
