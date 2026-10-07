// MSDS 찾기 — 화면 3 (MSDS 없는 시약) · 화면 2 (일괄 찾기 띠) (harness/d7-data.md §20, design/rules.json 1.18 msds ·
// variants["3"].msds · variants["2"]["msds-bulk"] · roles R5 · guest.hidden_components · never.N2, design/frames/3-msds-* · 2-msds-bulk-*).
// C1 · R-ui · GM-ui · V1.
// - 실제 안전보건공단 호출 없음: /api/msds/search 응답을 가로챈다 (msds-helpers). 가로채지 않으면 이 환경(키 없음) 503 문구.
// - 저장(set_reagent_msds)은 일회용 학교(admin·교사·학생 — service role 로 생성, 세션은 generateLink/verifyOtp)의 시약에서만.
//   준비(시약 넣기 · CAS · MSDS 미리 넣기)는 register_reagent(admin 세션) · service role. 대조 조회는 그 계정 세션(RLS).
// - afterAll: 일회용 계정·학교·시약 잔여 0, 학교 A·B·데모 시약장·칸·배치 스냅숏 그대로.
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { countComponent, routeOf, rules, sel } from "./screen-helpers";
import { detailPath, waitDetail } from "./screen-3-helpers";
import { HAS_SERVICE, clientFor, openTemp, service, type TempUser } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, prepReagent, purgeSchool, sharedCabinetSnapshot, watchActions, type S11Fixture } from "./screen-11-helpers";
import { demoReagents, guestDetailPath, guestRouteOf, openGuest, waitGuestShell } from "./guest-helpers";
import {
  BULK_MAX,
  BULK_START,
  CONFIRM,
  FIND,
  MISSING,
  MSDS_BULK_BANNER,
  MSDS_CANDIDATES,
  MSDS_SEARCH,
  NO_KEY_TEXT,
  NO_RESULT,
  PICK_CAPTION,
  SAVED,
  SKIP,
  bannerText,
  candidatesFor,
  confirmButton,
  directLink,
  doneText,
  exact,
  expectCandidates,
  expectNoN2Terms,
  interceptSearch,
  progressText,
  radios,
  sheet,
} from "./msds-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "msds";
const SAVE_TIMEOUT = 20_000;
type Variants = { variants: Record<string, Record<string, string[]>> };
const V3 = (rules as unknown as Variants).variants["3"].msds;
const V2 = (rules as unknown as Variants).variants["2"]["msds-bulk"];
const R5 = (rules as unknown as { roles: Record<string, { components?: string[] }> }).roles.R5.components ?? [];
const HIDDEN = (rules as unknown as { guest: { hidden_components: string[] } }).guest.hidden_components;
const LIST = routeOf(2);
const NOMSDS = `${LIST}?nomsds=1`;
/** 옛 표시 (비활성 "MSDS 보기" + "…선생님께 문의하세요") — 1.17 3-msds 로 바뀌어 없어야 한다 */
const OLD_NOTICE = "문의하세요";
const VIEW = "MSDS 보기";
const CAS_OLD = "64-17-5";
const TOAST = "ex-toast";

const entry = (page: Page) => page.locator(`main ${sel("msds-entry")}`).first();
const toast = (page: Page, text: string) => page.locator(sel(TOAST)).filter({ hasText: exact(text) });
const banner = (page: Page) => page.locator(sel(MSDS_BULK_BANNER));
const sheetTitle = (page: Page) => sheet(page).getByRole("heading").first();
const nameOf = (tail: string) => `임시${randomBytes(3).toString("hex")}${tail}`;

// =====================================================================
// 일회용 학교
// =====================================================================
let before: string[] | null = null;
let fixtureCache: Promise<S11Fixture> | null = null;
function fixture(info: TestInfo): Promise<S11Fixture> {
  fixtureCache ??= makeFixture(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}
async function fresh(info: TestInfo): Promise<S11Fixture> {
  test.setTimeout(420_000);
  const f = await fixture(info);
  await purgeSchool(f.school.id);
  return f;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedCabinetSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약 잔여물").toEqual(NO_S11_RESIDUE);
  if (before) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치가 그대로").toEqual(before);
});

/** 준비: 시약 (MSDS·CAS 없음) */
async function prep(f: S11Fixture, tail: string): Promise<{ id: string; name: string }> {
  const r = await prepReagent(f, tail, 3, "병", undefined, nameOf(tail));
  return { id: r.id, name: r.name };
}
/** 준비: 열 값 넣기 (service role — 일회용 학교 시약만) */
async function prepSet(f: S11Fixture, id: string, patch: Record<string, unknown>): Promise<void> {
  const u = await service().from("reagents").update(patch).eq("id", id).eq("school_id", f.school.id).select("id");
  expect(u.error, `준비: ${Object.keys(patch).join("·")} (${u.error?.message})`).toBeNull();
  expect(u.data ?? []).toHaveLength(1);
}
/** 그 계정 세션(RLS)으로 읽은 msds_url · cas_no */
async function msdsOf(u: TempUser, id: string): Promise<{ msds_url: string | null; cas_no: string | null }> {
  const r = await (await clientFor(u)).from("reagents").select("msds_url, cas_no").eq("id", id).single();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return r.data as { msds_url: string | null; cas_no: string | null };
}

async function waitList(page: Page): Promise<void> {
  await expect(page.locator(sel("segmented-control")).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("load");
}
async function hydratedButton(page: Page, scope: ReturnType<typeof page.locator>): Promise<void> {
  await expect
    .poll(() => scope.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "하이드레이션", timeout: 30_000 })
    .toBe(true);
}

test("[C1][S*] 전제: 시안·규칙 문구와 variants", () => {
  for (const s of [FIND, MISSING, CONFIRM, NO_RESULT, SKIP, PICK_CAPTION, SAVED, BULK_START, NO_KEY_TEXT]) expect(s.length, s).toBeGreaterThan(0);
  expect(V3).toEqual(expect.arrayContaining([MSDS_SEARCH, MSDS_CANDIDATES]));
  expect(V2).toEqual(expect.arrayContaining([MSDS_BULK_BANNER, MSDS_CANDIDATES]));
  expect(R5).toEqual(expect.arrayContaining([MSDS_SEARCH, MSDS_BULK_BANNER]));
  expect(HIDDEN).toEqual(expect.arrayContaining([MSDS_SEARCH, MSDS_BULK_BANNER]));
  expect(BULK_MAX).toBeGreaterThan(1);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

  // ---------------------------------------------------------------
  // 화면 3
  // ---------------------------------------------------------------
  for (const who of ["teacher", "admin"] as const) {
    test(`[C1][S3] 일회용 ${who === "teacher" ? "교사" : "admin"} MSDS 없는 시약: msds-entry 안 캡션 "${MISSING}" + msds-search "${FIND}" 1 (옛 비활성 "${VIEW}"·"…${OLD_NOTICE}" 없음) → 누르면 시약 이름으로 찾기 → msds-candidates(variants["3"].msds) → 다른 행 고르고 "${CONFIRM}" → 토스트 "${SAVED}" · DB msds_url = 고른 주소 · CAS 비어 있던 시약은 후보 CAS 로 채움 / CAS 있던 시약은 그대로 · 저장 뒤 찾기 0 · "${VIEW}" 링크 = 주소 / MSDS 있는 시약은 찾기 0`, async ({ browser }, info) => {
      const f = await fresh(info);
      const user = who === "teacher" ? f.teacher : f.admin;
      const a = await prep(f, "질산은");
      const b = await prep(f, "에탄올");
      await prepSet(f, b.id, { cas_no: CAS_OLD });
      const c = await prep(f, "염산");
      const HAS_URL = "https://example.test/msds/hcl.pdf";
      await prepSet(f, c.id, { msds_url: HAS_URL });

      const { context, page, viewport } = await openTemp(browser, info, user, detailPath(a.id));
      const actions = watchActions(page);
      try {
        const calls = await interceptSearch(page);
        await waitDetail(page);
        // 기본 화면 (3-msds 의 시트 열기 전)
        await expect(entry(page).getByText(MISSING, { exact: true }), `캡션 "${MISSING}"`).toBeVisible();
        const find = entry(page).locator(sel(MSDS_SEARCH));
        await expect(find, `msds-entry 안 ${MSDS_SEARCH} 1`).toHaveCount(1);
        expect(await countComponent(page, MSDS_SEARCH), `화면 전체 ${MSDS_SEARCH} 1`).toBe(1);
        await expect(find).toHaveText(exact(FIND));
        await expect(entry(page).getByText(VIEW), `MSDS 없음 → "${VIEW}" 없음`).toHaveCount(0);
        await expect(page.getByText(OLD_NOTICE), `"…${OLD_NOTICE}" 없음`).toHaveCount(0);
        expect(await countComponent(page, MSDS_CANDIDATES), "누르기 전 시트 0").toBe(0);
        expect(calls.queries, "열기만 해서는 검색하지 않음").toEqual([]);

        await hydratedButton(page, find);
        await find.click();
        const s = sheet(page);
        await expect(s).toBeVisible();
        const cands = candidatesFor(a.name);
        await expectCandidates(s, cands, "화면 3 후보");
        expect(calls.queries, "검색어 = 시약 이름").toEqual([a.name]);
        for (const n of V3) await expect(page.locator(sel(n)).first(), `variants["3"].msds ${n} 보임`).toBeVisible();
        await expectNoN2Terms(page, "화면 3 후보 시트");
        if (who === "teacher") await page.screenshot({ path: join(process.cwd(), "test-results", `v1-3-msds-${viewport}.png`) });
        expect(actions.count(), "고르기 전 쓰기 0").toBe(0);

        await radios(s).nth(1).click();
        await confirmButton(s).click();
        await expect(toast(page, SAVED), `토스트 "${SAVED}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
        await expect(s, "저장 → 시트 닫힘").toHaveCount(0);
        expect(actions.count(), "저장 요청 1").toBe(1);
        await expect.poll(() => msdsOf(user, a.id), { message: "DB msds_url · cas_no (CAS 비어 있었음 → 채움)", timeout: SAVE_TIMEOUT }).toEqual({
          msds_url: cands[1].msdsUrl,
          cas_no: cands[1].cas,
        });
        // 다시 받은 화면: 찾기 없음 · MSDS 보기 = 저장한 주소
        await expect(page.locator(sel(MSDS_SEARCH)), "저장 뒤 msds-search 0").toHaveCount(0, { timeout: SAVE_TIMEOUT });
        await expect(entry(page).locator(`a[href="${cands[1].msdsUrl}"]`), `"${VIEW}" 링크 = 저장한 주소`).toHaveCount(1);
        await expect(entry(page).getByText(MISSING, { exact: true })).toHaveCount(0);

        // CAS 가 이미 있는 시약: 첫 후보(다른 CAS)를 골라도 CAS 그대로
        await page.goto(detailPath(b.id));
        await waitDetail(page);
        const findB = entry(page).locator(sel(MSDS_SEARCH));
        await hydratedButton(page, findB);
        await findB.click();
        const candsB = candidatesFor(b.name);
        await expectCandidates(sheet(page), candsB, "CAS 있는 시약 후보");
        await confirmButton(sheet(page)).click();
        await expect(toast(page, SAVED)).toBeVisible({ timeout: SAVE_TIMEOUT });
        await expect.poll(() => msdsOf(user, b.id), { message: "CAS 있던 시약: 주소만 · CAS 그대로", timeout: SAVE_TIMEOUT }).toEqual({
          msds_url: candsB[0].msdsUrl,
          cas_no: CAS_OLD,
        });

        // MSDS 가 이미 있는 시약: 찾기 없음 (바꾸기는 범위 밖)
        await page.goto(detailPath(c.id));
        await waitDetail(page);
        expect(await countComponent(page, MSDS_SEARCH), "MSDS 있음 → msds-search 0").toBe(0);
        await expect(entry(page).locator(`a[href="${HAS_URL}"]`), `"${VIEW}" 링크`).toHaveCount(1);
        await expect(entry(page).getByText(MISSING, { exact: true })).toHaveCount(0);
        expect(calls.queries, "검색은 MSDS 없는 시약 2번만").toEqual([a.name, b.name]);
      } finally {
        await context.close();
      }
    });
  }

  test(`[C1][S3] 일회용 교사 MSDS 없는 시약: 후보 0개 → "${NO_RESULT}" → 시트 안 주소 입력(잘못된 주소는 저장 불가) → 저장 → DB msds_url · CAS 그대로 비어 있음 / 가로채지 않으면(키 없음) "${NO_KEY_TEXT}" · 쓰기 0`, async ({ browser }, info) => {
    const f = await fresh(info);
    const a = await prep(f, "황산구리");
    const b = await prep(f, "수산화나트륨");
    const URL = "https://example.test/msds/cuso4.pdf";
    const { context, page } = await openTemp(browser, info, f.teacher, detailPath(b.id));
    const actions = watchActions(page);
    try {
      // 키 없음 (가로채지 않음)
      const real = await interceptSearch(page, () => null);
      await waitDetail(page);
      const findB = entry(page).locator(sel(MSDS_SEARCH));
      await hydratedButton(page, findB);
      await findB.click();
      await expect(sheet(page).getByText(NO_KEY_TEXT), "서버 503 문구").toBeVisible({ timeout: 15_000 });
      await expect(radios(sheet(page))).toHaveCount(0);
      await expectNoN2Terms(page, "키 없음 오류");
      expect(real.queries).toEqual([b.name]);
      await sheet(page).getByRole("button", { name: exact("닫기") }).click();
      await expect(sheet(page)).toHaveCount(0);
      expect(actions.count(), "오류 → 쓰기 0").toBe(0);
      expect(await msdsOf(f.teacher, b.id)).toEqual({ msds_url: null, cas_no: null });
      await page.unrouteAll();

      // 0개 → 직접 입력
      await interceptSearch(page, () => ({ body: { candidates: [] } }));
      await page.goto(detailPath(a.id));
      await waitDetail(page);
      const find = entry(page).locator(sel(MSDS_SEARCH));
      await hydratedButton(page, find);
      await find.click();
      const s = sheet(page);
      await expect(directLink(s, NO_RESULT), `0개 → "${NO_RESULT}"`).toBeVisible({ timeout: 15_000 });
      await expect(radios(s)).toHaveCount(0);
      await directLink(s, NO_RESULT).click();
      const input = s.locator('input[type="url"]');
      await expect(input, "시트 안 주소 입력").toHaveCount(1);
      const save = s.locator(sel("button-primary"));
      await expect(save).toHaveCount(1);
      await input.fill("ftp://example.test/x.pdf");
      await expect(save, "http(s) 아님 → 저장 비활성").toBeDisabled();
      await input.fill(URL);
      await expect(save).toBeEnabled();
      await save.click();
      await expect(toast(page, SAVED)).toBeVisible({ timeout: SAVE_TIMEOUT });
      await expect.poll(() => msdsOf(f.teacher, a.id), { message: "직접 주소 저장 · CAS 비어 있음", timeout: SAVE_TIMEOUT }).toEqual({ msds_url: URL, cas_no: null });
      expect(actions.count(), "저장 1").toBe(1);
    } finally {
      await context.close();
    }
  });

  test(`[R-ui][S3] 일회용 학생 MSDS 없는 시약: 캡션 "${MISSING}" 만 — msds-search·msds-candidates 0 (R5) · "${VIEW}"·"…${OLD_NOTICE}" 없음 · 검색 요청 0`, async ({ browser }, info) => {
    const f = await fresh(info);
    const a = await prep(f, "질산칼륨");
    const { context, page } = await openTemp(browser, info, f.student, detailPath(a.id));
    try {
      const calls = await interceptSearch(page);
      await waitDetail(page);
      await expect(entry(page).getByText(MISSING, { exact: true }), `캡션 "${MISSING}"`).toBeVisible();
      for (const c of [MSDS_SEARCH, MSDS_CANDIDATES, MSDS_BULK_BANNER]) expect(await countComponent(page, c), `학생 ${c} 0`).toBe(0);
      await expect(entry(page).getByText(VIEW)).toHaveCount(0);
      await expect(page.getByText(OLD_NOTICE)).toHaveCount(0);
      await expectNoN2Terms(page, "학생 화면 3");
      expect(calls.queries).toEqual([]);
    } finally {
      await context.close();
    }
  });

  // ---------------------------------------------------------------
  // 화면 2 일괄
  // ---------------------------------------------------------------
  for (const who of ["teacher", "admin"] as const) {
    test(`[C1][S2] 일회용 ${who === "teacher" ? "교사" : "admin"} ?nomsds=1: msds-bulk-banner "${bannerText(3)}" · "${BULK_START}" → 시약마다 차례로 msds-candidates(제목 = 시약 이름 · "${progressText(1, 3)}" · "${PICK_CAPTION}", variants["2"]["msds-bulk"]) → 고르기 · "${SKIP}" · 고르기 → 토스트 "${doneText(2)}" · DB 고른 것만 저장 · 띠 "${bannerText(1)}" / 필터 없음 → 띠 0`, async ({ browser }, info) => {
      const f = await fresh(info);
      const user = who === "teacher" ? f.teacher : f.admin;
      const list = [await prep(f, "질산은"), await prep(f, "황산"), await prep(f, "아세톤")];
      const has = await prep(f, "염화나트륨");
      await prepSet(f, has.id, { msds_url: "https://example.test/msds/nacl.pdf" });
      const byName = new Map(list.map((r) => [r.name, r]));

      const { context, page, viewport } = await openTemp(browser, info, user, LIST);
      const actions = watchActions(page);
      try {
        const calls = await interceptSearch(page);
        await waitList(page);
        expect(await countComponent(page, MSDS_BULK_BANNER), "필터 없음 → 띠 0").toBe(0);
        await page.goto(NOMSDS);
        await waitList(page);
        await expect(banner(page), "띠 1").toHaveCount(1);
        await expect(banner(page).getByText(bannerText(list.length), { exact: true }), `"${bannerText(list.length)}"`).toBeVisible();
        const start = banner(page).getByRole("button", { name: exact(BULK_START) });
        await expect(start).toBeVisible();
        expect(calls.queries, "띠만으로는 검색하지 않음").toEqual([]);
        await hydratedButton(page, start);
        await start.click();

        const s = sheet(page);
        const order: string[] = [];
        // 1: 첫 후보 고르기
        await expect(s).toBeVisible();
        await expect(s.getByText(progressText(1, list.length), { exact: true })).toBeVisible();
        await expect(s.getByText(PICK_CAPTION, { exact: true })).toBeVisible();
        order.push((await sheetTitle(page).innerText()).trim());
        expect(byName.has(order[0]), `제목 = 대상 시약 이름 (${order[0]})`).toBe(true);
        await expectCandidates(s, candidatesFor(order[0]), "1번째");
        for (const n of V2) await expect(page.locator(sel(n)).first(), `variants["2"]["msds-bulk"] ${n} 보임`).toBeVisible();
        await expectNoN2Terms(page, "일괄 후보 시트");
        if (who === "teacher") await page.screenshot({ path: join(process.cwd(), "test-results", `v1-2-msds-bulk-${viewport}.png`) });
        await confirmButton(s).click();
        // 2: 건너뛰기
        await expect(s.getByText(progressText(2, list.length), { exact: true })).toBeVisible({ timeout: SAVE_TIMEOUT });
        order.push((await sheetTitle(page).innerText()).trim());
        await expectCandidates(s, candidatesFor(order[1]), "2번째");
        await s.getByRole("button", { name: exact(SKIP) }).click();
        // 3: 두 번째 후보 고르기
        await expect(s.getByText(progressText(3, list.length), { exact: true })).toBeVisible({ timeout: SAVE_TIMEOUT });
        order.push((await sheetTitle(page).innerText()).trim());
        await expectCandidates(s, candidatesFor(order[2]), "3번째");
        await radios(s).nth(1).click();
        await confirmButton(s).click();

        await expect(toast(page, doneText(2)), `토스트 "${doneText(2)}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
        await expect(s, "끝 → 시트 닫힘").toHaveCount(0);
        expect([...order].sort(), "세 시약을 한 번씩").toEqual(list.map((r) => r.name).sort());
        expect(calls.queries, "검색어 = 차례의 시약 이름").toEqual(order);
        const c0 = candidatesFor(order[0])[0];
        const c2 = candidatesFor(order[2])[1];
        await expect.poll(() => msdsOf(user, byName.get(order[0])!.id), { message: "1번째: 고른 주소 · CAS 채움", timeout: SAVE_TIMEOUT }).toEqual({ msds_url: c0.msdsUrl, cas_no: c0.cas });
        expect(await msdsOf(user, byName.get(order[1])!.id), "2번째: 건너뜀 → 그대로").toEqual({ msds_url: null, cas_no: null });
        expect(await msdsOf(user, byName.get(order[2])!.id), "3번째: 두 번째 후보").toEqual({ msds_url: c2.msdsUrl, cas_no: c2.cas });
        expect(actions.count(), "저장 = 고른 2종 (+ 끝난 뒤 다시 받기 1)").toBeLessThanOrEqual(3);
        expect(actions.count()).toBeGreaterThanOrEqual(2);
        await expect(banner(page).getByText(bannerText(1), { exact: true }), `다시 받은 목록: "${bannerText(1)}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
      } finally {
        await context.close();
      }
    });
  }

  test(`[C1][S2] 일회용 교사 ?nomsds=1 MSDS 없는 시약 ${BULK_MAX + 2}종: 띠 "${bannerText(BULK_MAX + 2)}" → 한 번에 최대 ${BULK_MAX}종 ("${progressText(1, BULK_MAX)}") · × 로 닫으면 토스트 없음 · 쓰기 0 · DB 그대로`, async ({ browser }, info) => {
    const f = await fresh(info);
    const n = BULK_MAX + 2;
    const rows = Array.from({ length: n }, (_, i) => ({ school_id: f.school.id, name: nameOf(`대량${String(i).padStart(2, "0")}`), unit: "병", stock: 1, min_stock: 0 }));
    const ins = await service().from("reagents").insert(rows).select("id");
    expect(ins.error, `준비: 시약 ${n}종 (${ins.error?.message})`).toBeNull();
    expect(ins.data ?? []).toHaveLength(n);
    const { context, page } = await openTemp(browser, info, f.teacher, NOMSDS);
    const actions = watchActions(page);
    try {
      const calls = await interceptSearch(page);
      await waitList(page);
      await expect(banner(page).getByText(bannerText(n), { exact: true })).toBeVisible();
      const start = banner(page).getByRole("button", { name: exact(BULK_START) });
      await hydratedButton(page, start);
      await start.click();
      await expect(sheet(page).getByText(progressText(1, BULK_MAX), { exact: true }), `최대 ${BULK_MAX}`).toBeVisible();
      await expect(radios(sheet(page))).toHaveCount(3);
      await sheet(page).getByRole("button", { name: exact("닫기") }).click();
      await expect(sheet(page)).toHaveCount(0);
      await page.waitForTimeout(500);
      await expect(page.locator(sel(TOAST)), "저장 0 → 토스트 없음").toHaveCount(0);
      expect(actions.count(), "쓰기 0").toBe(0);
      expect(calls.queries).toHaveLength(1);
      const left = await service().from("reagents").select("id").eq("school_id", f.school.id).is("msds_url", null);
      expect((left.data ?? []).length, "DB 그대로").toBe(n);
    } finally {
      await context.close();
    }
  });

  test(`[R-ui][S2] 일회용 학생 ?nomsds=1: 목록은 걸러지지만 msds-bulk-banner·msds-candidates 0 (R5) · 검색 요청 0`, async ({ browser }, info) => {
    const f = await fresh(info);
    await prep(f, "질산은");
    await prep(f, "황산");
    const { context, page } = await openTemp(browser, info, f.student, NOMSDS);
    try {
      const calls = await interceptSearch(page);
      await waitList(page);
      await expect(page.locator(`main ${sel("reagent-row")}`), "MSDS 없는 시약 2행").toHaveCount(2);
      for (const c of [MSDS_BULK_BANNER, MSDS_CANDIDATES, MSDS_SEARCH]) expect(await countComponent(page, c), `학생 ${c} 0`).toBe(0);
      await expectNoN2Terms(page, "학생 화면 2");
      expect(calls.queries).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

// =====================================================================
// 둘러보기 (데모 학교 — 읽기만)
// =====================================================================
test(`[GM-ui][S3g] 둘러보기 시약 상세: msds-search·msds-candidates 0 (guest.hidden_components) · "MSDS 없음"이면 캡션 "${MISSING}"만 · 검색 요청 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const demo = await demoReagents();
  for (const r of demo.slice(0, 4)) {
    const { context, page } = await openGuest(browser, info, guestDetailPath(r.id));
    try {
      const calls = await interceptSearch(page);
      await waitGuestShell(page);
      await expect(page.locator(`main ${sel("reagent-detail-card")}`).first()).toBeVisible();
      for (const c of [MSDS_SEARCH, MSDS_CANDIDATES]) expect(await countComponent(page, c), `${r.name}: ${c} 0`).toBe(0);
      const missing = await page.getByText(MISSING, { exact: true }).count();
      const link = await entry(page).locator("a[href]").count();
      expect(missing + link, `${r.name}: MSDS 링크 또는 캡션 "${MISSING}" 중 하나`).toBe(1);
      await expect(page.getByText(OLD_NOTICE)).toHaveCount(0);
      await expectNoN2Terms(page, `둘러보기 ${r.name}`);
      expect(calls.queries).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test(`[GM-ui][S2g] 둘러보기 시약 목록 ?nomsds=1: msds-bulk-banner·msds-candidates 0 (guest.hidden_components)`, async ({ browser }, info) => {
  const { context, page } = await openGuest(browser, info, `${guestRouteOf(2)}?nomsds=1`);
  try {
    const calls = await interceptSearch(page);
    await waitGuestShell(page);
    for (const c of [MSDS_BULK_BANNER, MSDS_CANDIDATES, MSDS_SEARCH]) expect(await countComponent(page, c), `${c} 0`).toBe(0);
    expect(calls.queries).toEqual([]);
  } finally {
    await context.close();
  }
});
