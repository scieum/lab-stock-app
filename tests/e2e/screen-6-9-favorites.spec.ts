// 화면 6 판매처 연결 · 화면 9 판매처 설정 — 즐겨찾기 (d7 §12-1, 2026-10-07 사용자 결정)
//   화면 6: 각 판매처 행에 별표(즐겨찾기 추가·해제, 누르면 바로 저장). 즐겨찾기가 1곳 이상이면 목록에는 즐겨찾기만 보이고,
//           아래 글자 버튼 "모든 판매처 보기"로 전체를 펼친다(펼친 뒤에는 즐겨찾기가 맨 위). 즐겨찾기가 없으면 처음부터 전체(지금 순서).
//   화면 9: admin 은 "우리 학교 판매처"·"공통 목록" 두 탭의 행에서도 별표로 추가·해제.
//   "확인" → 검색 주소가 있으면 검색 결과(d7 §11·§12-1), 없으면 웹사이트(덕산종합과학 등 "검색 주소 없음").
// 기준: harness/d7-data.md §12-1·§11·§12, design/rules.json button.min_height, harness/d5-gates.md C1.
//
// 모든 쓰기는 일회용 학교(일회용 admin·교사)에서 한다 — 공용 학교 A·B 의 즐겨찾기는 쓰지 않는다.
// service role 은 준비·정리·대조 조회에만 쓴다. 판정 대상은 브라우저 화면과 그 화면이 보낸 요청(서버 액션 → 로그인 세션 RLS)이다.
// 새 창은 외부 사이트를 불러오지 않는다 (stubExternal).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { HAS_SERVICE, clientFor, openTemp, service } from "./screen-8-helpers";
import {
  COMMON_NAMES,
  COMMON_NO_SEARCH,
  COMMON_SEARCH,
  COMMON_SEED,
  NO_RESIDUE_69,
  REORDER,
  REORDER_HREF,
  TAB_COMMON,
  TAB_SCHOOL,
  VENDORS,
  VENDORS_HREF,
  cards,
  cells,
  cleanup,
  confirmButton,
  fakeSite,
  hrefOf,
  linkDialog,
  makeSchool,
  openLinkModal,
  optionNames,
  pickVendor,
  prepReagent,
  prepVendor,
  purge,
  radios,
  searchHref,
  sharedSnapshot,
  stubExternal,
  switchTab,
  toast,
  vendorRow,
  waitReorder,
  waitVendors,
  type Fx,
} from "./screen-6-9-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const GROUP = "s69fav";
const TIMEOUT = 420_000;

/** design/rules.json button.min_height (누름 영역) */
const MIN_HEIGHT = (JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as { button: { min_height: number } }).button.min_height;

// ---------- d7 §12-1 문구 ----------
const SHOW_ALL = "모든 판매처 보기";
const ADD_LABEL = "즐겨찾기 추가";
const REMOVE_LABEL = "즐겨찾기 해제";
/** 별표가 바로 반영되는지 기다리는 시간 (서버 왕복보다 짧게 — 누른 즉시 바뀌어야 한다) */
const INSTANT_MS = 1_000;

// ---------- 화면 요소 (builder 표시: data-testid — 새 data-component 가 아닌 시안 예외 요소) ----------
const TOGGLE = '[data-testid="vendor-favorite-toggle"]';
const toggles = (scope: Locator) => scope.locator(TOGGLE);
const toggleOf = (scope: Locator, name: string) => scope.locator(`${TOGGLE}[data-vendor-name="${name.replace(/"/g, '\\"')}"]`);
const showAll = (page: Page) => linkDialog(page).getByRole("button", { name: SHOW_ALL, exact: true });
const favoriteAlert = (page: Page) => linkDialog(page).getByRole("alert");

/** 대조 조회 (service role): 한 학교의 즐겨찾기 */
type Fav = { school_id: string; vendor_id: string; created_by: string | null };
async function favsOf(schoolId: string): Promise<Fav[]> {
  const r = await service().from("vendor_favorites").select("school_id, vendor_id, created_by").eq("school_id", schoolId).order("vendor_id");
  expect(r.error, `vendor_favorites 대조 조회: ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as Fav[];
}
async function commonByName(): Promise<Map<string, { id: string; website: string }>> {
  const r = await service().from("vendors").select("id, name, website").is("school_id", null);
  expect(r.error, `공통 목록 대조 조회: ${r.error?.message}`).toBeNull();
  return new Map(((r.data ?? []) as { id: string; name: string; website: string }[]).map((v) => [v.name, { id: v.id, website: v.website }]));
}
const favPairs = (rows: Fav[]) => rows.map((r) => `${r.vendor_id}|${r.created_by}`).sort();

/** 별표의 누름 영역 ≥ rules.json button.min_height (가로·세로) */
async function expectTapTarget(t: Locator, what: string): Promise<void> {
  await t.scrollIntoViewIfNeeded();
  const b = await t.boundingBox();
  expect(b, `${what}: 별표 크기`).not.toBeNull();
  expect(Math.round(b!.height), `${what}: 별표 누름 높이 ≥ ${MIN_HEIGHT}`).toBeGreaterThanOrEqual(MIN_HEIGHT);
  expect(Math.round(b!.width), `${what}: 별표 누름 너비 ≥ ${MIN_HEIGHT}`).toBeGreaterThanOrEqual(MIN_HEIGHT);
}

/** 별표 상태 = aria-pressed + 이름 */
async function expectStar(t: Locator, on: boolean, what: string, timeout = 20_000): Promise<void> {
  await expect(t, `${what}: aria-pressed ${on}`).toHaveAttribute("aria-pressed", String(on), { timeout });
  await expect(t, `${what}: 이름 "${on ? REMOVE_LABEL : ADD_LABEL}"`).toHaveAttribute("aria-label", on ? REMOVE_LABEL : ADD_LABEL);
}

const checkedName = async (page: Page): Promise<string | null> => {
  const opts = await optionNames(page);
  const states = await radios(page).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).checked));
  const at = states.indexOf(true);
  return at < 0 ? null : opts[at];
};

/** 화면 6 서버 액션(POST + next-action 헤더) 을 끊는다 — 저장 실패를 만든다 */
async function breakActions(page: Page, path: string): Promise<{ count: () => number }> {
  let n = 0;
  await page.route(
    (u) => u.pathname === path,
    async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) {
        n += 1;
        await route.abort("failed");
        return;
      }
      await route.continue();
    },
  );
  return { count: () => n };
}

// ---------- 일회용 학교 ----------
let before: string[] | null = null;
let fixtureCache: Promise<Fx> | null = null;

function fixture(info: TestInfo): Promise<Fx> {
  fixtureCache ??= makeSchool(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

async function fresh(info: TestInfo): Promise<Fx> {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id]);
  expect(await favsOf(f.school.id), "준비: 즐겨찾기 0").toEqual([]);
  return f;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·판매처·즐겨찾기 잔여물").toEqual(NO_RESIDUE_69);
  if (before) expect(await sharedSnapshot(), "공통 판매처 목록 · 학교 A·B·데모의 판매처·즐겨찾기·시약 기준 열이 그대로").toEqual(before);
});

// =====================================================================
// 화면 6
// =====================================================================

test(`[C1][S${REORDER}] 일회용 학교 교사: 판매처 연결 모달 별표 — 처음엔 즐겨찾기 0 → 전체 ${COMMON_SEED.length}+학교 행 · 별표마다 누름 ≥ rules.button.min_height · 누르면 즉시 aria-pressed true(행 선택 그대로) + DB 1행(created_by = 교사) → 다시 열면 즐겨찾기만 + "${SHOW_ALL}" → 펼치면 전체·즐겨찾기 먼저(나머지는 지금 순서)·버튼 사라짐 → 해제해 0개면 처음부터 전체`, async ({ browser }, info) => {
  const f = await fresh(info);
  await prepReagent(f, { tag: "즐겨찾기", stock: 1, min: 9, unit: "g" });
  const own = await prepVendor(f, { contact: "043-000-7777", website: fakeSite("fav") }, "즐겨찾기");
  const common = await commonByName();
  const target = COMMON_SEARCH[COMMON_SEARCH.length - 1].name; // 검색 주소가 있는 공통 판매처
  const second = COMMON_NO_SEARCH.length ? COMMON_NO_SEARCH[0].name : COMMON_SEARCH[0].name;
  expect(common.has(target) && common.has(second), "대조: 공통 목록에 대상 판매처").toBe(true);

  const { context, page } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  await stubExternal(context, info);
  try {
    await waitReorder(page);
    const card = cards(page).first();
    let dlg = await openLinkModal(page, card);

    // 1) 즐겨찾기 0 → 전체 (지금 순서), "모든 판매처 보기" 없음, 별표 = 행마다 1개 · 모두 꺼짐
    const initial = await optionNames(page);
    expect(initial.length, "즐겨찾기 0: 행 = 학교 판매처 1 + 공통").toBe(1 + COMMON_SEED.length);
    expect(initial[0], "우리 학교 판매처 먼저 (d7 §11)").toBe(own.name);
    expect(initial.slice(1).sort(), "그다음 공통 목록").toEqual([...COMMON_NAMES].sort());
    await expect(showAll(page), `즐겨찾기 0: "${SHOW_ALL}" 없음`).toHaveCount(0);
    await expect(toggles(dlg), "별표 = 행마다 1개").toHaveCount(initial.length);
    expect(await toggles(dlg).evaluateAll((els) => els.map((e) => e.getAttribute("data-vendor-name"))), "별표 순서 = 행 순서").toEqual(initial);
    for (const name of initial) await expectStar(toggleOf(dlg, name), false, `처음 "${name}"`);
    for (const name of [initial[0], target, initial[initial.length - 1]]) await expectTapTarget(toggleOf(dlg, name), `"${name}"`);

    // 2) 대상 행을 고르고 그 별표를 누름 → 즉시 켜짐 · 선택 그대로 · DB 1행
    await pickVendor(page, target);
    await toggleOf(dlg, target).click();
    await expectStar(toggleOf(dlg, target), true, `누른 뒤 "${target}"`, INSTANT_MS);
    expect(await checkedName(page), "별표를 눌러도 행 선택은 그대로").toBe(target);
    await expect.poll(async () => favPairs(await favsOf(f.school.id)), { message: "DB: 즐겨찾기 1행", timeout: 20_000 }).toEqual([`${common.get(target)!.id}|${f.teacher.id}`]);
    await expect(favoriteAlert(page), "저장 성공: 오류 안내 없음").toHaveCount(0);

    // 3) 새로 불러와 다시 열면 즐겨찾기만 + "모든 판매처 보기"
    await page.reload();
    await waitReorder(page);
    dlg = await openLinkModal(page, cards(page).first());
    expect(await optionNames(page), "즐겨찾기 ≥1: 즐겨찾기만").toEqual([target]);
    await expectStar(toggleOf(dlg, target), true, `다시 연 뒤 "${target}"`);
    await expect(showAll(page), `"${SHOW_ALL}" 1개`).toHaveCount(1);
    await expect(showAll(page)).toBeVisible();
    await expectTapTarget(showAll(page), `"${SHOW_ALL}"`);

    // 4) 펼침 → 전체 · 즐겨찾기 먼저 + 나머지는 지금 순서 · 버튼 사라짐
    await showAll(page).click();
    await expect.poll(async () => (await optionNames(page)).length, { message: "펼치면 전체" }).toBe(initial.length);
    expect(await optionNames(page), "펼친 뒤: 즐겨찾기 맨 위, 나머지는 지금 순서").toEqual([target, ...initial.filter((n) => n !== target)]);
    await expect(showAll(page), `펼친 뒤 "${SHOW_ALL}" 사라짐`).toHaveCount(0);

    // 5) 펼친 상태에서 다른 행(우리 학교 판매처)을 고르고, 또 다른 판매처의 별표 → 선택 그대로 · DB 2행
    await pickVendor(page, own.name);
    await toggleOf(dlg, second).click();
    await expectStar(toggleOf(dlg, second), true, `"${second}"`, INSTANT_MS);
    expect(await checkedName(page), "다른 행 별표를 눌러도 선택은 그대로").toBe(own.name);
    await expect
      .poll(async () => favPairs(await favsOf(f.school.id)), { message: "DB: 즐겨찾기 2행", timeout: 20_000 })
      .toEqual([`${common.get(target)!.id}|${f.teacher.id}`, `${common.get(second)!.id}|${f.teacher.id}`].sort());

    // 6) 다시 열면 즐겨찾기 2곳만 (지금 순서) → 하나 해제하면 남은 하나만 → 마지막 해제하면 전체
    await page.reload();
    await waitReorder(page);
    dlg = await openLinkModal(page, cards(page).first());
    expect(await optionNames(page), "즐겨찾기 2곳만 (지금 순서)").toEqual(initial.filter((n) => n === target || n === second));
    await toggleOf(dlg, target).click();
    await expect(toggleOf(dlg, target), `"${target}" 해제 → 목록에서 빠짐 (즐겨찾기만 보기)`).toHaveCount(0, { timeout: INSTANT_MS * 5 });
    expect(await optionNames(page), "남은 즐겨찾기만").toEqual([second]);
    await expect.poll(async () => favPairs(await favsOf(f.school.id)), { message: "DB: 1행", timeout: 20_000 }).toEqual([`${common.get(second)!.id}|${f.teacher.id}`]);
    await toggleOf(dlg, second).click();
    await expect.poll(async () => (await optionNames(page)).length, { message: "즐겨찾기 0 → 전체", timeout: INSTANT_MS * 5 }).toBe(initial.length);
    await expect.poll(async () => favsOf(f.school.id), { message: "DB: 0행", timeout: 20_000 }).toEqual([]);
    await page.reload();
    await waitReorder(page);
    dlg = await openLinkModal(page, cards(page).first());
    expect(await optionNames(page), "새로 불러와도 전체 · 지금 순서").toEqual(initial);
    await expect(showAll(page), `"${SHOW_ALL}" 없음`).toHaveCount(0);
    for (const name of initial) await expectStar(toggleOf(dlg, name), false, `해제 뒤 "${name}"`);
  } finally {
    await context.close();
  }
});

test(`[C1][S${REORDER}] 일회용 학교 교사: 즐겨찾기 판매처 "확인" → 새 창 = 검색 주소(d7 §11·§12-1, {q} = 시약 이름) · 검색 주소 없는 공통 판매처(d7 §12-1) → 웹사이트 · 우리 학교 판매처 즐겨찾기 → 웹사이트`, async ({ browser }, info) => {
  const f = await fresh(info);
  const reagent = await prepReagent(f, { tag: "즐겨 확인 (1M)", stock: 1, min: 9, unit: "g" });
  const own = await prepVendor(f, { contact: "043-000-8888", website: fakeSite("favok") }, "즐겨확인");
  const common = await commonByName();
  const withSearch = COMMON_SEARCH[0];
  const picks: { name: string; url: string; what: string }[] = [
    { name: withSearch.name, url: searchHref(withSearch.searchUrl, reagent.name), what: "검색 주소" },
    ...COMMON_NO_SEARCH.map((s) => ({ name: s.name, url: hrefOf(s.website), what: "검색 주소 없음 → 웹사이트" })),
    { name: own.name, url: hrefOf(own.website!), what: "우리 학교 판매처 웹사이트" },
  ];
  // 준비: 교사 세션 RLS 로 즐겨찾기 (화면에서 누르는 흐름은 위 테스트가 확인)
  const tc = await clientFor(f.teacher);
  for (const p of picks) {
    const vendorId = p.name === own.name ? own.id : common.get(p.name)!.id;
    const r = await tc.from("vendor_favorites").insert({ school_id: f.school.id, vendor_id: vendorId, created_by: f.teacher.id }).select("vendor_id");
    expect(r.error, `준비: 즐겨찾기 ${p.name} (${r.error?.message})`).toBeNull();
  }

  const { context, page } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  const stub = await stubExternal(context, info);
  try {
    await waitReorder(page);
    await openLinkModal(page, cards(page).first());
    expect((await optionNames(page)).sort(), "즐겨찾기만").toEqual(picks.map((p) => p.name).sort());
    for (const p of picks) {
      await openLinkModal(page, cards(page).first());
      await pickVendor(page, p.name);
      await expect(confirmButton(page), `${p.name}: 확인 활성`).toBeEnabled();
      const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 20_000 }), confirmButton(page).click()]);
      await popup.waitForURL((u) => u.href !== "about:blank", { timeout: 20_000 });
      expect(popup.url(), `${p.name}: 새 창 = ${p.what}`).toBe(p.url);
      await popup.close();
      await expect(linkDialog(page), "확인 뒤 모달 닫힘").toHaveCount(0);
    }
    const hosts = picks.map((p) => new URL(p.url).host);
    expect(stub.hits().filter((u) => !hosts.includes(new URL(u).host)), "고르지 않은 주소로의 요청 0").toEqual([]);
    expect(favPairs(await favsOf(f.school.id)), "확인은 즐겨찾기를 바꾸지 않는다").toHaveLength(picks.length);
  } finally {
    await context.close();
  }
});

test(`[C1][S${REORDER}] 일회용 학교 교사: 즐겨찾기 저장 실패(서버 액션 요청 끊김) → 별표 되돌림(aria-pressed false) + 모달 안 role=alert 안내 · 목록 그대로 · DB 0행`, async ({ browser }, info) => {
  const f = await fresh(info);
  await prepReagent(f, { tag: "실패", stock: 1, min: 9, unit: "g" });
  const { context, page } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  try {
    await waitReorder(page);
    const dlg = await openLinkModal(page, cards(page).first());
    const initial = await optionNames(page);
    const target = initial[initial.length - 1];
    const broken = await breakActions(page, REORDER_HREF);
    await toggleOf(dlg, target).click();
    await expect.poll(() => broken.count(), { message: "저장 요청이 나갔다(끊김)" }).toBeGreaterThan(0);
    await expectStar(toggleOf(dlg, target), false, `실패 뒤 "${target}" 되돌림`);
    await expect(favoriteAlert(page), "실패 안내 (role=alert)").toHaveCount(1);
    await expect(favoriteAlert(page)).toBeVisible();
    expect((await favoriteAlert(page).innerText()).trim().length, "안내 문구 있음").toBeGreaterThan(0);
    expect(await optionNames(page), "목록 그대로 (즐겨찾기 0 → 전체)").toEqual(initial);
    await page.waitForTimeout(1_000);
    expect(await favsOf(f.school.id), "DB 0행").toEqual([]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 9
// =====================================================================

test(`[C1][S${VENDORS}] 일회용 학교 admin: "${TAB_SCHOOL}" 행·"${TAB_COMMON}" 셀의 별표로 추가(누름 ≥ min_height, 더보기 메뉴 안 열림) → DB(created_by = admin) → 같은 학교 교사의 화면 6 모달 = 그 즐겨찾기만 → admin 이 해제 → 교사 모달 전체 · 저장 실패 → 되돌림 + ex-toast`, async ({ browser }, info) => {
  const f = await fresh(info);
  await prepReagent(f, { tag: "화면9", stock: 1, min: 9, unit: "g" });
  const own = await prepVendor(f, { contact: "043-000-9999", website: fakeSite("fav9") }, "화면9");
  const common = await commonByName();
  const pick = COMMON_SEED[Math.floor(COMMON_SEED.length / 2)].name;

  const admin = await openTemp(browser, info, f.admin, VENDORS_HREF);
  const page = admin.page;
  try {
    await waitVendors(page);
    // 우리 학교 탭: 행 안 별표
    const row = vendorRow(page, own.name);
    await expect(row).toHaveCount(1);
    const ownStar = toggles(row);
    await expect(ownStar, "우리 학교 행의 별표 1개").toHaveCount(1);
    await expectStar(ownStar, false, "우리 학교 행 처음");
    await expectTapTarget(ownStar, "우리 학교 행 별표");
    await ownStar.click();
    await expectStar(ownStar, true, "우리 학교 행 누른 뒤", INSTANT_MS);
    await expect(page.getByRole("menuitem"), "별표는 더보기 메뉴를 열지 않는다").toHaveCount(0);
    await expect.poll(async () => favPairs(await favsOf(f.school.id)), { message: "DB: 우리 학교 판매처 1행", timeout: 20_000 }).toEqual([`${own.id}|${f.admin.id}`]);

    // 공통 목록 탭: 판매처명 칸 앞 별표
    await switchTab(page, TAB_COMMON);
    const commonStars = toggles(page.locator("main"));
    await expect(commonStars, "공통 탭 별표 = 공통 판매처 수").toHaveCount(COMMON_SEED.length);
    const cellStar = toggleOf(cells(page).filter({ hasText: pick }), pick);
    await expect(cellStar).toHaveCount(1);
    await expectStar(cellStar, false, `공통 "${pick}" 처음`);
    await expectTapTarget(cellStar, `공통 "${pick}" 별표`);
    await cellStar.click();
    await expectStar(cellStar, true, `공통 "${pick}" 누른 뒤`, INSTANT_MS);
    await expect.poll(async () => favPairs(await favsOf(f.school.id)), { message: "DB: 2행", timeout: 20_000 }).toEqual(
      [`${own.id}|${f.admin.id}`, `${common.get(pick)!.id}|${f.admin.id}`].sort(),
    );
    // 새로 불러와도 유지
    await page.reload();
    await waitVendors(page);
    await expectStar(toggles(vendorRow(page, own.name)), true, "새로 불러온 뒤 우리 학교 행");
    await switchTab(page, TAB_COMMON);
    await expectStar(toggleOf(cells(page).filter({ hasText: pick }), pick), true, `새로 불러온 뒤 공통 "${pick}"`);
  } finally {
    await admin.context.close();
  }

  // 같은 학교 교사의 화면 6: 즐겨찾기만 (우리 학교 먼저)
  const teacher = await openTemp(browser, info, f.teacher, REORDER_HREF);
  try {
    await waitReorder(teacher.page);
    const dlg = await openLinkModal(teacher.page, cards(teacher.page).first());
    expect(await optionNames(teacher.page), "교사 모달 = admin 이 화면 9 에서 고른 즐겨찾기만 (우리 학교 먼저)").toEqual([own.name, pick]);
    await expect(showAll(teacher.page), `"${SHOW_ALL}"`).toHaveCount(1);
    for (const n of [own.name, pick]) await expectStar(toggleOf(dlg, n), true, `교사 모달 "${n}"`);
  } finally {
    await teacher.context.close();
  }

  // admin 이 화면 9 에서 해제 → 교사 모달 전체
  const admin2 = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    await waitVendors(admin2.page);
    const ownStar = toggles(vendorRow(admin2.page, own.name));
    await ownStar.click();
    await expectStar(ownStar, false, "우리 학교 행 해제", INSTANT_MS);
    await switchTab(admin2.page, TAB_COMMON);
    const cellStar = toggleOf(cells(admin2.page).filter({ hasText: pick }), pick);
    await cellStar.click();
    await expectStar(cellStar, false, `공통 "${pick}" 해제`, INSTANT_MS);
    await expect.poll(async () => favsOf(f.school.id), { message: "DB: 0행", timeout: 20_000 }).toEqual([]);

    // 저장 실패 → 되돌림 + ex-toast
    const broken = await breakActions(admin2.page, VENDORS_HREF);
    await cellStar.click();
    await expect.poll(() => broken.count(), { message: "저장 요청이 나갔다(끊김)" }).toBeGreaterThan(0);
    await expectStar(cellStar, false, `실패 뒤 공통 "${pick}" 되돌림`);
    await expect(toast(admin2.page), "실패 안내 ex-toast").toHaveCount(1, { timeout: 20_000 });
    expect((await toast(admin2.page).innerText()).trim().length, "토스트 문구 있음").toBeGreaterThan(0);
    await admin2.page.waitForTimeout(1_000);
    expect(await favsOf(f.school.id), "실패 뒤 DB 0행").toEqual([]);
  } finally {
    await admin2.context.close();
  }

  const teacher2 = await openTemp(browser, info, f.teacher, REORDER_HREF);
  try {
    await waitReorder(teacher2.page);
    await openLinkModal(teacher2.page, cards(teacher2.page).first());
    expect((await optionNames(teacher2.page)).length, "해제 뒤 교사 모달 = 전체").toBe(1 + COMMON_SEED.length);
    await expect(showAll(teacher2.page)).toHaveCount(0);
  } finally {
    await teacher2.context.close();
  }
});

// 학생·교사의 화면 6·9 진입(학생 /reorder → /, 교사 /vendors → /)은 screen-6-structure·screen-9-structure 의 [R-ui] 가 확인한다.
// 아래는 즐겨찾기 별표가 역할 밖에서 보이지 않는지: 일회용 학생은 화면 6·9 에 들어가지 못해 별표 0.
test(`[R-ui][S${REORDER}] 일회용 학생: ${REORDER_HREF}·${VENDORS_HREF} 진입 시 별표(vendor-favorite-toggle) 0 · 교사: ${VENDORS_HREF} 진입 시 별표 0`, async ({ browser }, info) => {
  const f = await fresh(info);
  await prepReagent(f, { tag: "학생", stock: 1, min: 9, unit: "g" });
  for (const [who, u, path] of [
    ["학생", f.student, REORDER_HREF],
    ["학생", f.student, VENDORS_HREF],
    ["교사", f.teacher, VENDORS_HREF],
  ] as const) {
    const t = await openTemp(browser, info, u, path);
    try {
      await t.page.waitForLoadState("load");
      await expect.poll(() => new URL(t.page.url()).pathname, { message: `${who} ${path} → 다른 화면` }).not.toBe(path);
      await expect(t.page.locator(TOGGLE), `${who} ${path}: 별표`).toHaveCount(0);
    } finally {
      await t.context.close();
    }
  }
});

