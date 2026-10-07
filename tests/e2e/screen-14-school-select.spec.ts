// 화면 14 (/signup) 학교 선택 (N1-d): rules.json never.N1.school_select_levels(1.18: 시/도 → 지역 → 학교급 → 학교) 순서 강제,
// 목록은 /api/neis 응답에서만, rules.json neis.exclude_sido 미포함, 브라우저가 NEIS 직접 호출 0,
// 가입 요청은 학교를 NEIS 코드로만 보낸다 (학교명·역할을 보내지 않는다).
import { test, expect, type Page } from "@playwright/test";
import { routeOf, rules, useProjectViewport } from "./screen-helpers";
import {
  KIND,
  KINDS,
  NEIS_PREFIX,
  REGION,
  SCHOOL,
  SCREEN,
  SIDO,
  SIGNUP_API,
  expectLocked,
  jsonList,
  kindSelected,
  kindTab,
  kindTabs,
  optionLabels,
  pickOption,
  selectBox,
  selectOptions,
  waitNeis,
  waitSignupScreen,
} from "./screen-14-helpers";

const N1 = rules.never.N1;
type NeisSchool = { name: string; sido: string; region: string; neis_code: string; kind: string };
const KIND_FIRST = rules.school_kind_select.default.match(/'([^']+)'/)?.[1] ?? "";

/** 학교급 단계가 잠겼는지: 칸 rules.json neis.school_kinds 개수 모두 비활성 */
async function expectKindLocked(page: Page): Promise<void> {
  await expect(kindTabs(page), `${KIND} 칸 수`).toHaveCount(KINDS.length);
  for (const k of KINDS) await expect(kindTab(page, k), `${KIND} ${k} 비활성`).toBeDisabled();
}

/** 요청 감시: 목록용 fetch/xhr 는 같은 출처 /api/neis/* 만, 외부 NEIS 직접 호출 0 */
function watchRequests(page: Page) {
  const neisCalls: string[] = [];
  const otherFetches: string[] = [];
  const externalNeis: string[] = [];
  const pending: Promise<void>[] = [];
  let origin = "";
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
    if (u.pathname === SIGNUP_API) return; // 가입 요청은 목록 요청이 아니다 (아래 테스트에서 따로 본다)
    // Next 라우터 RSC 요청(헤더 rsc: 1)은 화면 이동용이라 목록 요청이 아니다
    pending.push(
      req.allHeaders().then((h) => {
        if (h["rsc"] !== "1") otherFetches.push(u.pathname + u.search);
      }),
    );
  });
  return {
    neisCalls,
    otherFetches,
    externalNeis,
    setOrigin: (o: string) => (origin = o),
    settle: () => Promise.all(pending),
  };
}

test(`[N1-d][S${SCREEN}] ${N1.school_select_levels.join(" → ")} 순서 강제 · 상위 변경 시 하위 초기화 · 목록 = /api/neis 응답 · ${rules.neis.exclude_sido.join("·")} 미포함 · NEIS 직접 호출 0`, async ({ page }, info) => {
  test.setTimeout(150_000);
  expect(N1.school_select_screen, "rules.json 학교 선택 화면").toBe(SCREEN);
  expect(N1.school_select_only_on, "rules.json school_select_only_on").toContain(SCREEN);
  await useProjectViewport(page, info);
  const w = watchRequests(page);

  const sidoRes = waitNeis(page, "sido");
  await page.goto(routeOf(SCREEN));
  w.setOrigin(new URL(page.url()).origin);
  expect(new URL(page.url()).pathname, "비로그인 /signup 진입").toBe(routeOf(SCREEN));
  await waitSignupScreen(page);

  // 시/도 고르기 전: 지역·학교급·학교 잠김(학교급 기본값 없음), 지역·학교 목록 요청 없음
  await expectLocked(page, REGION);
  await expectKindLocked(page);
  await expect(kindSelected(page), "첫 화면 학교급 기본값 없음").toHaveCount(0);
  await expectLocked(page, SCHOOL);
  expect(w.neisCalls.filter((p) => p !== NEIS_PREFIX + "sido"), "시/도 선택 전 지역·학교 요청").toEqual([]);

  // 1단계 시/도 — 화면 목록 = /api/neis/sido 응답 그대로, 제외 시/도 없음
  const sidoList = await jsonList<string>(await sidoRes, "sido");
  expect(sidoList.length, "시/도 응답").toBeGreaterThan(1);
  for (const ex of rules.neis.exclude_sido) expect(sidoList, `응답에 ${ex}`).not.toContain(ex);
  await selectBox(page, SIDO).click();
  const sidoShown = await optionLabels(page, SIDO);
  expect(sidoShown).toEqual(sidoList);
  for (const ex of rules.neis.exclude_sido) expect(sidoShown, `화면에 ${ex}`).not.toContain(ex);
  expect(sidoShown).toContain(rules.neis.default_sido);

  const regionRes = waitNeis(page, "regions");
  await pickOption(page, SIDO, rules.neis.default_sido);
  await expect(selectBox(page, SIDO)).toContainText(rules.neis.default_sido);

  // 2단계 지역 — 목록 = /api/neis/regions?sido= 응답 그대로. 지역 고르기 전 학교 잠김·학교 요청 없음
  const rr = await regionRes;
  expect(new URL(rr.url()).searchParams.get("sido")).toBe(rules.neis.default_sido);
  const regionList = await jsonList<string>(rr, "regions");
  expect(regionList).toContain(rules.neis.default_region);
  await expectLocked(page, SCHOOL);
  expect(w.neisCalls, "지역 선택 전 학교 요청").not.toContain(NEIS_PREFIX + "schools");
  await expect(selectBox(page, REGION)).toBeEnabled();
  await selectBox(page, REGION).click();
  expect(await optionLabels(page, REGION)).toEqual(regionList);

  // 3단계 학교급 — 지역 고르기 전 잠김, 고른 뒤 열림. 기본값 없음 → 학교는 "학교급을 먼저" 잠김, 학교 요청 없음
  await expectKindLocked(page);
  await pickOption(page, REGION, rules.neis.default_region);
  await expect(selectBox(page, REGION)).toContainText(rules.neis.default_region);
  for (const k of KINDS) await expect(kindTab(page, k), `${KIND} ${k} 활성`).toBeEnabled();
  await expect(kindSelected(page), "학교급 기본값 없음").toHaveCount(0);
  await expectLocked(page, SCHOOL);
  expect(KIND_FIRST, "rules.json school_kind_select.default 안내 문구").not.toBe("");
  await expect(selectBox(page, SCHOOL), "학교급 전 안내").toContainText(KIND_FIRST);
  await page.waitForTimeout(500);
  expect(w.neisCalls, "학교급 선택 전 학교 요청").not.toContain(NEIS_PREFIX + "schools");

  const schoolRes = waitNeis(page, "schools");
  await kindTab(page, rules.neis.default_kind).click();
  await expect(kindSelected(page)).toHaveText(rules.neis.default_kind);

  // 4단계 학교 — 목록 = /api/neis/schools 응답 이름 그대로, 모두 고른 학교급 · 고른 시/도·지역
  const sr = await schoolRes;
  expect(new URL(sr.url()).searchParams.get("sido")).toBe(rules.neis.default_sido);
  expect(new URL(sr.url()).searchParams.get("region")).toBe(rules.neis.default_region);
  expect(new URL(sr.url()).searchParams.get("kind")).toBe(rules.neis.default_kind);
  const schools = await jsonList<NeisSchool>(sr, "schools");
  expect(schools.length, "학교 응답").toBeGreaterThan(0);
  for (const s of schools) {
    expect(s.kind, "학교급").toBe(rules.neis.default_kind);
    expect(s.name, "학교 이름에 학교급").toContain(rules.neis.default_kind);
    expect(s.sido).toBe(rules.neis.default_sido);
    expect(s.region).toBe(rules.neis.default_region);
  }
  await expect(selectBox(page, SCHOOL)).toBeEnabled();
  await selectBox(page, SCHOOL).click();
  const schoolShown = await optionLabels(page, SCHOOL);
  expect(schoolShown).toEqual(schools.map((s) => s.name));
  await selectOptions(page, SCHOOL).first().click();
  await expect(selectBox(page, SCHOOL)).toContainText(schoolShown[0]);

  // 지역을 바꾸면 학교 선택이 초기화되고 새 지역 목록으로 바뀐다
  const otherRegion = regionList.find((r) => r !== rules.neis.default_region);
  expect(otherRegion, `${rules.neis.default_sido} 의 두 번째 지역`).toBeTruthy();
  const schoolRes2 = waitNeis(page, "schools");
  await selectBox(page, REGION).click();
  await pickOption(page, REGION, otherRegion!);
  await expect(selectBox(page, REGION)).toContainText(otherRegion!);
  await expect(selectBox(page, SCHOOL), "지역 변경 후 학교 선택 초기화").not.toContainText(schoolShown[0]);
  await expect(kindSelected(page), "지역 변경 후 학교급 유지").toHaveText(rules.neis.default_kind);
  const sr2 = await schoolRes2;
  expect(new URL(sr2.url()).searchParams.get("region")).toBe(otherRegion);
  expect(new URL(sr2.url()).searchParams.get("kind")).toBe(rules.neis.default_kind);
  const schools2 = await jsonList<NeisSchool>(sr2, "schools");
  await expect(selectBox(page, SCHOOL)).toBeEnabled();
  await selectBox(page, SCHOOL).click();
  expect(await optionLabels(page, SCHOOL)).toEqual(schools2.map((s) => s.name));
  await selectBox(page, SCHOOL).click(); // 닫기

  // 시/도를 바꾸면 지역·학교 모두 초기화, 학교는 다시 잠긴다
  const otherSido = sidoList.find((s) => s !== rules.neis.default_sido);
  expect(otherSido, "두 번째 시/도").toBeTruthy();
  const regionRes2 = waitNeis(page, "regions");
  await selectBox(page, SIDO).click();
  await pickOption(page, SIDO, otherSido!);
  await expect(selectBox(page, SIDO)).toContainText(otherSido!);
  await expectLocked(page, SCHOOL);
  await expect(selectBox(page, REGION), "시/도 변경 후 지역 초기화").not.toContainText(otherRegion!);
  await expect(selectBox(page, SCHOOL), "시/도 변경 후 학교 초기화").not.toContainText(schoolShown[0]);
  await expectKindLocked(page);
  await expect(kindSelected(page), "시/도 변경 후 학교급 유지").toHaveText(rules.neis.default_kind);
  const rr2 = await regionRes2;
  expect(new URL(rr2.url()).searchParams.get("sido")).toBe(otherSido);
  const regionList2 = await jsonList<string>(rr2, "regions");
  await expect(selectBox(page, REGION)).toBeEnabled();
  await selectBox(page, REGION).click();
  expect(await optionLabels(page, REGION)).toEqual(regionList2);
  await page.waitForLoadState("networkidle");

  // 요청 출처
  await w.settle();
  expect(w.externalNeis, "브라우저에서 NEIS 직접 호출").toEqual([]);
  expect(w.otherFetches, "/api/neis 밖 목록 요청").toEqual([]);
  for (const p of ["sido", "regions", "schools"]) {
    expect(w.neisCalls, `${NEIS_PREFIX}${p} 요청`).toContain(NEIS_PREFIX + p);
  }
});

test(`[N1-d][S${SCREEN}] 가입 요청은 학교를 /api/neis 응답의 neis_code 로만 보낸다 (학교명·시/도·지역·학교급·역할 미전송)`, async ({ page }, info) => {
  test.setTimeout(150_000);
  await useProjectViewport(page, info);
  const w = watchRequests(page);

  // 가입 요청은 서버에 닿지 않게 가로챈다 (실제 계정 생성 없음). 본문만 기록한다.
  const bodies: Record<string, unknown>[] = [];
  await page.route(`**${SIGNUP_API}`, async (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, error: "e2e 가로챔" }) });
  });

  const sidoRes = waitNeis(page, "sido");
  await page.goto(routeOf(SCREEN));
  w.setOrigin(new URL(page.url()).origin);
  await waitSignupScreen(page);
  await sidoRes;

  const regionRes = waitNeis(page, "regions");
  await selectBox(page, SIDO).click();
  await pickOption(page, SIDO, rules.neis.default_sido);
  await regionRes;
  await expect(selectBox(page, REGION)).toBeEnabled();
  await selectBox(page, REGION).click();
  await pickOption(page, REGION, rules.neis.default_region);
  const schoolRes = waitNeis(page, "schools");
  await kindTab(page, rules.neis.default_kind).click();
  const schools = await jsonList<NeisSchool>(await schoolRes, "schools");
  expect(schools.length, "학교 응답").toBeGreaterThan(0);
  const chosen = schools[0];
  await expect(selectBox(page, SCHOOL)).toBeEnabled();
  await selectBox(page, SCHOOL).click();
  await pickOption(page, SCHOOL, chosen.name);
  await expect(selectBox(page, SCHOOL)).toContainText(chosen.name);

  // 계정 입력 + 약관 동의 (값은 형식만 맞춘 가짜 — 요청은 위에서 가로챈다)
  const password = "e2e-Intercept-1234";
  await page.locator('input[name="displayName"]').fill("e2e 가로챔");
  await page.locator('input[name="email"]').fill("e2e-intercept@example.com");
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="passwordConfirm"]').fill(password);
  const boxes = page.locator('form input[type="checkbox"]');
  const n = await boxes.count();
  expect(n, "약관 체크박스").toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await boxes.nth(i).check({ force: true });

  const submitted = page.waitForRequest((r) => new URL(r.url()).pathname === SIGNUP_API && r.method() === "POST");
  await page.locator('form button[type="submit"]').click();
  await submitted;
  await expect.poll(() => bodies.length).toBe(1);
  const body = bodies[0];

  expect(body.neisCode, "neisCode = /api/neis/schools 응답의 neis_code").toBe(chosen.neis_code);
  const forbiddenKeys = /school|sido|region|role|office|kind/i;
  const extra = Object.keys(body).filter((k) => k !== "neisCode" && forbiddenKeys.test(k));
  expect(extra, "학교·역할 관련 추가 필드").toEqual([]);
  const values = JSON.stringify(Object.entries(body).filter(([k]) => k !== "neisCode"));
  expect(values, "본문에 학교명").not.toContain(chosen.name);

  await w.settle();
  expect(w.externalNeis, "브라우저에서 NEIS 직접 호출").toEqual([]);
});
