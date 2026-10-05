// 화면 9 (판매처 설정) 쓰기 흐름·상태·격리: C1(0건 → 등록 → 중복 → 수정 → 삭제 · 연타 · 프레임 개수 · 화면 6 모달 반영) · C2(하단 고정 버튼·마지막 행 메뉴) · R-ui · N1-ui
// 기준: harness/d7-data.md §12·§11, 디자인 s2-spec "## 화면 9", design/frames/9-*.json, design/rules.json (roles R3, tab_bar, colors.highlight, never.N1),
//       harness/dev-rules.json (components_note 화면 9: 프레임 = 목록 + 저장 직후 토스트).
// 모든 쓰기는 일회용 학교의 일회용 admin 세션으로 한다 — 공용 학교 A·B·공통 목록에는 쓰지 않는다 (공용 admin 은 N1 대조 화면을 읽기만).
// service role 은 준비·정리·대조 조회에만 쓴다. 판정 대상은 브라우저 화면과 그 화면이 보낸 요청의 결과(DB)다.
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openAs } from "./auth-state";
import { browserClient, browserSession, countComponent, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, clientFor, openTemp, tempSchool, type TempSchool } from "./screen-8-helpers";
import { locationPath } from "./shell-helpers";
import {
  BUTTON_TAB_GAP,
  CANCEL_BUTTON,
  COMMON_HEAD,
  COMMON_NAMES,
  COMMON_SEED,
  DELETE_ITEM,
  DELETE_TITLE,
  EDIT_ITEM,
  EMPTY,
  EMPTY_VENDORS,
  FIELD_CONTACT,
  FIELD_NAME,
  FIELD_WEBSITE,
  HOME_HREF,
  INPUT,
  MODAL,
  NO_RESIDUE_69,
  REGISTER,
  REGISTER_BUTTON,
  REORDER_HREF,
  SAVE_BUTTON,
  SEARCH_PLACEHOLDER,
  TAB_COMMON,
  TAB_SCHOOL,
  TOAST,
  TOAST_DELETED,
  TOAST_SAVED,
  VENDORS,
  VENDORS_HREF,
  boxOf,
  cards,
  checkSchoolNames,
  chooseRowMenu,
  cleanup,
  confirmButton,
  countsOf,
  deleteDialog,
  exact,
  expectNoOtherSchool,
  expectTabBar,
  fakeSite,
  fieldAlert,
  fieldBox,
  fieldInput,
  frameCounts,
  hex,
  highlightSoft,
  hrefOf,
  infoOf,
  linksTo,
  main,
  makeSchool,
  menuItem,
  modal,
  moreButton,
  onTop,
  openCreateForm,
  openLinkModal,
  optionNames,
  otherSchools,
  outlineIn,
  ownReagentsOf,
  ownSchoolId,
  pickVendor,
  prepReagent,
  prepVendor,
  primaryIn,
  purge,
  readCommonCells,
  readVendorRows,
  registerBlock,
  registerButton,
  saveButton,
  schoolNamesOf,
  scrollToEnd,
  searchInput,
  sharedSnapshot,
  stubExternal,
  switchTab,
  tabBarTop,
  toast,
  vendorRow,
  vendorRows,
  vendorsBySchool,
  visibleVendors,
  waitReorder,
  waitVendors,
  watchActions,
  type DbVendor,
  type Fx,
} from "./screen-6-9-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const SCREEN = VENDORS;
const GROUP = "s9wr";
const TIMEOUT = 420_000;
const BUTTON_MIN_HEIGHT = (rules as unknown as { button: { min_height: number } }).button.min_height;

let before: string[] | null = null;
let fixtureCache: Promise<Fx> | null = null;
let otherCache: Promise<{ school: TempSchool; client: SupabaseClient }> | null = null;

function fixture(info: TestInfo): Promise<Fx> {
  fixtureCache ??= makeSchool(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

/** 두 번째 일회용 학교 B' (admin 만) — 격리 대조용 */
function otherFixture(info: TestInfo): Promise<{ school: TempSchool; client: SupabaseClient }> {
  otherCache ??= (async () => {
    const school = await tempSchool(info, GROUP);
    return { school, client: await clientFor(school.admin) };
  })();
  otherCache.catch(() => {
    otherCache = null;
  });
  return otherCache;
}

/** 일회용 학교 A' 를 비운 상태에서 시작 */
async function fresh(info: TestInfo): Promise<Fx> {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id]);
  return f;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  otherCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·판매처·기록 잔여물").toEqual(NO_RESIDUE_69);
  if (before) expect(await sharedSnapshot(), "공통 판매처 목록 · 학교 A·B·데모의 판매처·시약 기준 열이 그대로").toEqual(before);
});

/** 토스트가 그 글자로 보인다 */
async function expectToast(page: import("@playwright/test").Page, text: string): Promise<void> {
  await expect(toast(page).filter({ hasText: exact(text) }), `${TOAST} "${text}"`).toBeVisible({ timeout: 20_000 });
}

/** 열린 폼을 채운다 (undefined = 그대로 둔다) */
async function fillForm(page: import("@playwright/test").Page, v: { name?: string; contact?: string; website?: string }): Promise<void> {
  if (v.name !== undefined) await fieldInput(page, FIELD_NAME).fill(v.name);
  if (v.contact !== undefined) await fieldInput(page, FIELD_CONTACT).fill(v.contact);
  if (v.website !== undefined) await fieldInput(page, FIELD_WEBSITE).fill(v.website);
}

// =====================================================================
// C1 — 0건 → 등록
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 admin: 0건 "${EMPTY_VENDORS}" → "${REGISTER_BUTTON}" → 폼("${FIELD_NAME}"(필수)·"${FIELD_CONTACT}"·"${FIELD_WEBSITE}") · ${FIELD_NAME} 이 비면 "${SAVE_BUTTON}" 비활성 · 잘못된 웹사이트는 그 칸 아래 안내(저장 안 됨) · 스킴 없는 주소 저장 → ${TOAST} "${TOAST_SAVED}" · 목록에 행(이름 + 부가 정보)·강조 · DB 일치(website 는 http(s):// 로 시작)`, async ({ browser }, info) => {
  const f = await fresh(info);
  const { context, page, viewport, response } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  const actions = watchActions(page);
  try {
    expect(response?.status(), "응답").toBe(200);
    await waitVendors(page);

    // 0건
    await expect(registerBlock(page).locator(sel(EMPTY)), EMPTY).toHaveCount(1);
    await expect(registerBlock(page).locator(sel(EMPTY)).getByText(exact(EMPTY_VENDORS)), `"${EMPTY_VENDORS}"`).toHaveCount(1);
    await expect(vendorRows(page), "행 0").toHaveCount(0);
    await expect(registerButton(page), `"${REGISTER_BUTTON}"`).toBeVisible();

    // 폼
    await openCreateForm(page);
    for (const label of [FIELD_NAME, FIELD_CONTACT, FIELD_WEBSITE]) {
      await expect(fieldInput(page, label), `입력 "${label}"`).toHaveCount(1);
      await expect(fieldInput(page, label)).toBeVisible();
      await expect(fieldBox(page, label), `"${label}" 은 ${INPUT}`).toHaveCount(1);
    }
    await expect(fieldBox(page, FIELD_NAME).getByText(exact("필수")), `"${FIELD_NAME}" 필수 표시`).toHaveCount(1);
    await expect(fieldBox(page, FIELD_CONTACT).getByText(exact("필수")), `"${FIELD_CONTACT}" 는 선택`).toHaveCount(0);
    await expect(saveButton(page), `"${SAVE_BUTTON}"`).toHaveCount(1);
    await expect(saveButton(page), "판매처명이 비면 저장 비활성").toBeDisabled();
    await fillForm(page, { contact: "043-221-4560", website: "www.example.test" });
    await expect(saveButton(page), "판매처명 없이 다른 칸만 채워도 비활성").toBeDisabled();
    await fillForm(page, { name: "   " });
    await expect(saveButton(page), "공백뿐인 판매처명도 비활성").toBeDisabled();

    const name = `과학나라 교육사-${hex()}`;
    await fillForm(page, { name });
    await expect(saveButton(page), "판매처명을 쓰면 저장 활성").toBeEnabled();

    // 잘못된 웹사이트 주소
    for (const bad of ["javascript:alert(1)", "ftp://files.example.test/a"]) {
      await fillForm(page, { website: bad });
      await saveButton(page).click();
      await expect(fieldAlert(page, FIELD_WEBSITE), `"${bad}": 웹사이트 칸 아래 안내`).toHaveCount(1);
      await expect(fieldAlert(page, FIELD_WEBSITE)).toBeVisible();
      expect((await fieldAlert(page, FIELD_WEBSITE).innerText()).trim().length, "안내 문구").toBeGreaterThan(0);
      await expect(fieldAlert(page, FIELD_NAME), "다른 칸에는 안내 없음").toHaveCount(0);
      await expect(fieldInput(page, FIELD_NAME), "폼 유지").toHaveValue(name);
      await page.waitForTimeout(500);
      await expect(toast(page), "저장 토스트 없음").toHaveCount(0);
      expect(await vendorsBySchool(f.school.id), `"${bad}": DB 에 행 없음`).toEqual([]);
    }

    // 스킴 없는 주소 → 저장
    const host = `www.s9-${hex()}.example.test`;
    const contact = "043-221-4560";
    await fillForm(page, { website: host, contact });
    await expect(fieldAlert(page, FIELD_WEBSITE), "고치면 안내가 사라진다").toHaveCount(0);
    await saveButton(page).click();
    await expectToast(page, TOAST_SAVED);
    await expect(toast(page), `${TOAST} 1개`).toHaveCount(1);

    const row = vendorRow(page, name);
    await expect(row, "새 행").toHaveCount(1);
    await expect(row).toBeVisible();
    expect(await readVendorRows(page), "행 = 판매처명 + 부가 정보(연락처)").toEqual([[name, contact]]);
    await expect(row, "방금 등록한 행 강조 (rules.json colors.highlight 연한 쪽)").toHaveCSS("background-color", highlightSoft());
    await expect(moreButton(row), "행의 더보기").toHaveCount(1);
    await expect(registerBlock(page).locator(sel(EMPTY)), "0건 안내는 사라진다").toHaveCount(0);
    if (viewport === "mobile") {
      await expect(fieldInput(page, FIELD_NAME), "모바일: 저장 후 목록 복귀 (폼 닫힘)").toHaveCount(0);
      await expect(registerButton(page)).toBeVisible();
    }

    // DB
    const db = await vendorsBySchool(f.school.id);
    expect(db, "DB 행 1").toHaveLength(1);
    expect(db[0], "DB 값").toMatchObject({ school_id: f.school.id, name, contact, note: null });
    expect(db[0].website, "website 는 http(s):// 로 시작").toMatch(/^https?:\/\//);
    expect(new URL(db[0].website!).host, "website 호스트 = 입력한 주소").toBe(host);
    expect((await visibleVendors(page)).filter((v) => v.school_id !== null).map((v) => v.id), "로그인 세션에도 그 행").toEqual([db[0].id]);
    expect(actions.count(), "저장 요청이 나갔다").toBeGreaterThanOrEqual(1);

    // 다시 열어도 남아 있다
    await page.reload();
    await waitVendors(page);
    expect(await readVendorRows(page), "새로 고친 뒤").toEqual([[name, contact]]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 중복 이름
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 admin: 같은 이름(대소문자·공백만 다른 것 포함) 등록 → "${FIELD_NAME}" 칸 아래 오류 · 폼 유지 · 토스트 없음 · DB 불변 → 이름을 고치면 저장`, async ({ browser }, info) => {
  const f = await fresh(info);
  const existing = await prepVendor(f, { name: `한빛 Science-${hex()}`, contact: "02-555-0192", note: "시약" });
  const { context, page } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    await waitVendors(page);
    await expect(vendorRow(page, existing.name)).toHaveCount(1);
    const dbBefore = await vendorsBySchool(f.school.id);

    for (const dup of [existing.name, existing.name.replace(/\s+/g, "").toUpperCase()]) {
      await openCreateForm(page);
      await fillForm(page, { name: dup, contact: "010-0000-0000", website: "" });
      await saveButton(page).click();
      await expect(fieldAlert(page, FIELD_NAME), `"${dup}": 판매처명 칸 아래 오류`).toHaveCount(1);
      await expect(fieldAlert(page, FIELD_NAME)).toBeVisible();
      expect((await fieldAlert(page, FIELD_NAME).innerText()).trim().length, "오류 문구").toBeGreaterThan(0);
      await expect(fieldAlert(page, FIELD_CONTACT), "연락처 칸에는 오류 없음").toHaveCount(0);
      await expect(fieldAlert(page, FIELD_WEBSITE), "웹사이트 칸에는 오류 없음").toHaveCount(0);
      const nameBox = await boxOf(fieldInput(page, FIELD_NAME));
      const alertBox = await boxOf(fieldAlert(page, FIELD_NAME));
      const contactBox = await boxOf(fieldInput(page, FIELD_CONTACT));
      expect(alertBox.top, "오류는 판매처명 입력 아래").toBeGreaterThanOrEqual(nameBox.bottom - 0.5);
      expect(alertBox.bottom, "오류는 연락처 입력 위").toBeLessThanOrEqual(contactBox.top + 0.5);
      await expect(fieldInput(page, FIELD_NAME), "폼 유지 (입력 값 그대로)").toHaveValue(dup);
      await expect(fieldInput(page, FIELD_CONTACT), "폼 유지").toHaveValue("010-0000-0000");
      await expect(toast(page), "저장 토스트 없음").toHaveCount(0);
      expect(await vendorsBySchool(f.school.id), `"${dup}": DB 불변`).toEqual(dbBefore);
    }

    // 이름을 고치면 저장된다
    const fixed = `${existing.name}-2`;
    await fillForm(page, { name: fixed });
    await expect(fieldAlert(page, FIELD_NAME), "고치면 오류가 사라진다").toHaveCount(0);
    await saveButton(page).click();
    await expectToast(page, TOAST_SAVED);
    await expect(vendorRow(page, fixed).filter({ hasText: "010-0000-0000" }), "고친 이름의 행").toHaveCount(1);
    const db = await vendorsBySchool(f.school.id);
    expect(db.map((v) => v.name).sort(), "DB 행 2").toEqual([existing.name, fixed].sort());
    expect(db.find((v) => v.id === existing.id), "기존 행 불변").toEqual(dbBefore[0]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 수정
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 admin: 더보기 "${EDIT_ITEM}" → 폼에 기존 값 → 값 변경 "${SAVE_BUTTON}" → ${TOAST} "${TOAST_SAVED}" · 행 반영(이름 + 연락처 · 부가 정보)·강조 · DB 같은 행이 바뀜(다른 행 불변)`, async ({ browser }, info) => {
  const f = await fresh(info);
  const target = await prepVendor(f, { name: `청주 실험기자재-${hex()}`, contact: "043-270-1188", note: "실험 기구", website: fakeSite("old") });
  const other = await prepVendor(f, { name: `그린케미칼-${hex()}`, contact: "031-778-3021", note: "시약·소모품" });
  const { context, page, viewport } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    await waitVendors(page);
    expect((await readVendorRows(page)).sort(), "행 = 판매처명 + '연락처 · 부가 정보'").toEqual([[target.name, infoOf(target)], [other.name, infoOf(other)]].sort());

    await chooseRowMenu(page, target.name, EDIT_ITEM);
    await expect(fieldInput(page, FIELD_NAME), "폼: 기존 판매처명").toHaveValue(target.name);
    await expect(fieldInput(page, FIELD_CONTACT), "폼: 기존 연락처").toHaveValue(target.contact!);
    await expect(fieldInput(page, FIELD_WEBSITE), "폼: 기존 웹사이트").toHaveValue(target.website!);
    await expect(saveButton(page)).toBeEnabled();

    const next = { name: `청주 과학상사-${hex()}`, contact: "043-999-0000", website: fakeSite("new") };
    await fillForm(page, next);
    await saveButton(page).click();
    await expectToast(page, TOAST_SAVED);

    await expect(vendorRow(page, target.name), "옛 이름의 행은 없다").toHaveCount(0);
    const row = vendorRow(page, next.name);
    await expect(row, "바뀐 행").toHaveCount(1);
    expect((await readVendorRows(page)).sort(), "행 반영").toEqual([[next.name, `${next.contact} · ${target.note}`], [other.name, infoOf(other)]].sort());
    await expect(row, "방금 수정한 행 강조").toHaveCSS("background-color", highlightSoft());
    await expect(vendorRow(page, other.name), "다른 행은 강조 없음").not.toHaveCSS("background-color", highlightSoft());
    if (viewport === "mobile") await expect(fieldInput(page, FIELD_NAME), "모바일: 저장 후 목록 복귀").toHaveCount(0);

    const db = await vendorsBySchool(f.school.id);
    expect(db, "DB 행 수 그대로").toHaveLength(2);
    expect(db.find((v) => v.id === target.id), "같은 행이 바뀜").toEqual({ ...target, ...next });
    expect(db.find((v) => v.id === other.id), "다른 행 불변").toEqual(other);

    // 판매처명을 지우면 저장할 수 없다
    await chooseRowMenu(page, next.name, EDIT_ITEM);
    await fillForm(page, { name: "" });
    await expect(saveButton(page), "수정 폼도 판매처명이 비면 비활성").toBeDisabled();
    expect((await vendorsBySchool(f.school.id)).find((v) => v.id === target.id)?.name, "DB 그대로").toBe(next.name);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 삭제
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 admin: 더보기 "${DELETE_ITEM}" → ${MODAL} "${DELETE_TITLE}"(button-outline "${CANCEL_BUTTON}" + button-primary "${DELETE_ITEM}") · 취소·Esc 로 닫힘(삭제 안 됨) → "${DELETE_ITEM}" → ${TOAST} "${TOAST_DELETED}" · 목록에서 사라짐 · DB 행 없음(다른 행 불변) · 모바일 확인 카드 아래 끝 ≤ tab-bar 위쪽 선`, async ({ browser }, info) => {
  const f = await fresh(info);
  const target = await prepVendor(f, { name: `지울 판매처-${hex()}`, contact: "043-111-0000" });
  const keep = await prepVendor(f, { name: `남길 판매처-${hex()}`, contact: "043-222-0000" });
  const { context, page, viewport } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  const actions = watchActions(page);
  try {
    await waitVendors(page);

    // 취소
    await chooseRowMenu(page, target.name, DELETE_ITEM);
    const dlg = deleteDialog(page);
    await expect(dlg, `"${DELETE_TITLE}"`).toBeVisible();
    await expect(modal(page), `${MODAL} 1`).toHaveCount(1);
    await expect(outlineIn(dlg, CANCEL_BUTTON), `button-outline "${CANCEL_BUTTON}"`).toHaveCount(1);
    await expect(primaryIn(dlg, DELETE_ITEM), `button-primary "${DELETE_ITEM}"`).toHaveCount(1);
    await expect(dlg, "어느 판매처인지 보인다").toContainText(target.name);
    const box = await boxOf(dlg);
    const vp = page.viewportSize()!;
    expect(box.top, "확인 카드가 화면 안").toBeGreaterThanOrEqual(0);
    expect(box.bottom, "확인 카드 아래 끝 ≤ tab-bar 위쪽 선(모바일)·화면 아래(데스크탑)").toBeLessThanOrEqual((viewport === "mobile" ? await tabBarTop(page) : vp.height) + 0.5);
    expect(await onTop(primaryIn(dlg, DELETE_ITEM)), '"삭제" 가 가려지지 않음').toBe(true);
    await outlineIn(dlg, CANCEL_BUTTON).click();
    await expect(deleteDialog(page), "취소로 닫힘").toHaveCount(0);
    await expect(vendorRow(page, target.name), "취소: 행 그대로").toHaveCount(1);

    // Esc
    await chooseRowMenu(page, target.name, DELETE_ITEM);
    await expect(deleteDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(deleteDialog(page), "Esc 로 닫힘").toHaveCount(0);
    expect(actions.count(), "취소·Esc 는 쓰기 요청 0건").toBe(0);
    expect((await vendorsBySchool(f.school.id)).map((v) => v.id).sort(), "취소·Esc: DB 그대로").toEqual([target.id, keep.id].sort());

    // 삭제
    await chooseRowMenu(page, target.name, DELETE_ITEM);
    await primaryIn(deleteDialog(page), DELETE_ITEM).click();
    await expectToast(page, TOAST_DELETED);
    await expect(deleteDialog(page), "삭제 뒤 확인 카드 닫힘").toHaveCount(0);
    await expect(vendorRow(page, target.name), "목록에서 사라짐").toHaveCount(0);
    expect(await readVendorRows(page), "남은 행").toEqual([[keep.name, infoOf(keep)]]);
    expect(await vendorsBySchool(f.school.id), "DB: 지운 행 없음 · 다른 행 불변").toEqual([keep]);

    // 마지막 행까지 지우면 0건 안내
    await chooseRowMenu(page, keep.name, DELETE_ITEM);
    await primaryIn(deleteDialog(page), DELETE_ITEM).click();
    await expectToast(page, TOAST_DELETED);
    await expect(vendorRows(page)).toHaveCount(0);
    await expect(registerBlock(page).locator(sel(EMPTY)).getByText(exact(EMPTY_VENDORS)), `0건 "${EMPTY_VENDORS}"`).toHaveCount(1);
    expect(await vendorsBySchool(f.school.id), "DB 0행").toEqual([]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 연타
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 admin: "${SAVE_BUTTON}"·"${DELETE_ITEM}" 연타에도 쓰기 요청 1건 · 저장 행 1개 · 오류 안내 없음`, async ({ browser }, info) => {
  const f = await fresh(info);
  const { context, page } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  const actions = watchActions(page);
  try {
    await waitVendors(page);
    const name = `연타 판매처-${hex()}`;
    await openCreateForm(page);
    await fillForm(page, { name, contact: "043-333-0000" });
    await expect(saveButton(page)).toBeEnabled();
    await saveButton(page).evaluate((el) => {
      for (let i = 0; i < 4; i++) (el as HTMLElement).click();
    });
    await expectToast(page, TOAST_SAVED);
    await expect(vendorRow(page, name), "행 1개").toHaveCount(1);
    await page.waitForTimeout(1_500);
    expect(actions.count(), "저장 연타: 쓰기 요청 1건").toBe(1);
    await expect(registerBlock(page).getByRole("alert"), "오류 안내 없음").toHaveCount(0);
    const db = await vendorsBySchool(f.school.id);
    expect(db.map((v) => v.name), "DB 행 1개").toEqual([name]);

    await chooseRowMenu(page, name, DELETE_ITEM);
    const del = primaryIn(deleteDialog(page), DELETE_ITEM);
    await expect(del).toBeEnabled();
    await del.evaluate((el) => {
      for (let i = 0; i < 4; i++) (el as HTMLElement).click();
    });
    await expectToast(page, TOAST_DELETED);
    await expect(vendorRow(page, name)).toHaveCount(0);
    await page.waitForTimeout(1_500);
    expect(actions.count(), "삭제 연타: 쓰기 요청 1건 더").toBe(2);
    // (문서 맨 끝의 경로 안내 영역은 Next 의 것이라 본문·카드 안만 본다)
    await expect(page.locator("main, [role=dialog]").getByRole("alert").filter({ visible: true }), "오류 안내 없음").toHaveCount(0);
    expect(await vendorsBySchool(f.school.id), "DB 0행").toEqual([]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 프레임 개수 · 검색
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 admin(판매처 3 + 화면에서 1 등록 = 4): 저장 직후 화면이 프레임 9 의 컴포넌트 개수 이상 · "${SEARCH_PLACEHOLDER}" 부분 일치·0건(${EMPTY}) · 공통 탭에는 학교 판매처 없음`, async ({ browser }, info) => {
  const f = await fresh(info);
  const seeded = [
    await prepVendor(f, { name: `한빛 과학상사-${hex()}`, contact: "02-555-0192", note: "시약" }),
    await prepVendor(f, { name: `청주 실험기자재-${hex()}`, contact: "043-270-1188", note: "실험 기구" }),
    await prepVendor(f, { name: `그린케미칼-${hex()}`, contact: "031-778-3021", note: "시약·소모품" }),
  ];
  const frame = frameCounts(`${SCREEN}-${info.project.name}`);
  expect(frame[TOAST], "프레임은 저장 직후 (토스트 있음)").toBe(1);
  const { context, page, viewport } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    await waitVendors(page);
    await expect(vendorRows(page)).toHaveCount(seeded.length);
    const name = `과학나라 교육사-${hex()}`;
    await openCreateForm(page);
    await fillForm(page, { name, contact: "043-221-4560", website: "www.sciencenara.example.test" });
    await saveButton(page).click();
    await expectToast(page, TOAST_SAVED);
    await expect(vendorRow(page, name)).toHaveCount(1);
    const got = await countsOf(page, Object.keys(frame));
    for (const [comp, n] of Object.entries(frame)) expect(got[comp], `${viewport} ${comp} ≥ 프레임 ${n}`).toBeGreaterThanOrEqual(n);
    expect(got[REGISTER], REGISTER).toBe(1);
    const all = [...seeded.map((v) => v.name), name];
    expect((await readVendorRows(page)).map((r) => r[0]).sort(), "행 = DB 의 학교 판매처").toEqual([...all].sort());
    expect((await vendorsBySchool(f.school.id)).map((v) => v.name).sort()).toEqual([...all].sort());

    // 검색 (부분 일치 — 이름 가운데 글자, 대소문자 무시)
    await page.reload();
    await waitVendors(page);
    const target = seeded[1];
    const part = target.name.slice(5, 12);
    const want = all.filter((n) => n.toLowerCase().includes(part.toLowerCase()));
    expect(want, "대조: 검색어에 걸리는 판매처").toContain(target.name);
    await searchInput(page).fill(part.toUpperCase());
    await expect.poll(async () => (await readVendorRows(page)).map((r) => r[0]).sort(), { message: `"${part}" 검색 결과` }).toEqual([...want].sort());
    await searchInput(page).fill("없는판매처zzqq");
    await expect(vendorRows(page), "0건: 행 0").toHaveCount(0);
    await expect(registerBlock(page).locator(sel(EMPTY)), `0건: ${EMPTY}`).toHaveCount(1);
    await expect(searchInput(page), "검색 바는 유지").toBeVisible();
    await searchInput(page).fill("");
    await expect(vendorRows(page), "검색어를 지우면 전체").toHaveCount(all.length);

    // 공통 탭: 공통 판매처만, 학교 판매처·더보기 없음
    await switchTab(page, TAB_COMMON);
    const cellsAll = await readCommonCells(page);
    expect(cellsAll.filter((_, i) => i % COMMON_HEAD.length === 0).sort(), "공통 탭 = 공통 목록").toEqual([...COMMON_NAMES].sort());
    for (const n of all) expect((await main(page).innerText()).includes(n), `공통 탭에 학교 판매처 '${n}'`).toBe(false);
    await expect(main(page).getByRole("button", { name: /더보기|수정|삭제/ }), "공통 탭: 수정·삭제·더보기 0").toHaveCount(0);
    await switchTab(page, TAB_SCHOOL);
    await expect(vendorRows(page)).toHaveCount(all.length);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 화면 6 판매처 연결에 반영
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교: admin 이 화면 9 에서 등록한 판매처가 같은 학교 교사의 ${REORDER_HREF} 판매처 연결 모달 맨 앞(공통 ${COMMON_SEED.length}곳보다 먼저)에 나타나고 "확인" → 새 창 = 등록한 웹사이트`, async ({ browser }, info) => {
  const f = await fresh(info);
  await prepReagent(f, { tag: "연결", stock: 2, min: 10, unit: "g" });
  const name = `우리학교 판매처-${hex()}`;
  const site = fakeSite("link");

  const teacherBefore = await openTemp(browser, info, f.teacher, REORDER_HREF);
  try {
    await waitReorder(teacherBefore.page);
    await openLinkModal(teacherBefore.page, cards(teacherBefore.page).first());
    expect((await optionNames(teacherBefore.page)).sort(), "등록 전: 공통 목록만").toEqual([...COMMON_NAMES].sort());
  } finally {
    await teacherBefore.context.close();
  }

  const admin = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    await waitVendors(admin.page);
    await openCreateForm(admin.page);
    await fillForm(admin.page, { name, contact: "043-777-0000", website: site });
    await saveButton(admin.page).click();
    await expectToast(admin.page, TOAST_SAVED);
    await expect(vendorRow(admin.page, name)).toHaveCount(1);
  } finally {
    await admin.context.close();
  }
  const db = await vendorsBySchool(f.school.id);
  expect(db.map((v) => [v.name, v.website]), "DB: 등록한 판매처").toEqual([[name, site]]);

  const teacher = await openTemp(browser, info, f.teacher, REORDER_HREF);
  await stubExternal(teacher.context, info);
  try {
    await waitReorder(teacher.page);
    await openLinkModal(teacher.page, cards(teacher.page).first());
    const names = await optionNames(teacher.page);
    expect(names[0], "모달 맨 앞 = 방금 등록한 판매처").toBe(name);
    expect(names.slice(1).sort(), "그다음 = 공통 목록").toEqual([...COMMON_NAMES].sort());
    await pickVendor(teacher.page, name);
    await expect(confirmButton(teacher.page)).toBeEnabled();
    const [popup] = await Promise.all([teacher.context.waitForEvent("page", { timeout: 20_000 }), confirmButton(teacher.page).click()]);
    await popup.waitForURL((u) => u.href !== "about:blank", { timeout: 20_000 });
    expect(popup.url(), "새 창 = 등록한 웹사이트").toBe(hrefOf(site));
  } finally {
    await teacher.context.close();
  }
});

// =====================================================================
// C2
// =====================================================================

test(`[C2][S${SCREEN}] 일회용 학교 admin(판매처 12개): 390 tab-bar 1·tab-item ${rules.tab_bar.items}·활성 "시약" / 1440 = 0 · 모바일 하단 고정 "${REGISTER_BUTTON}"·폼 "${SAVE_BUTTON}" 이 tab-bar 바로 위(사이 ${BUTTON_TAB_GAP}, 가려지지 않음) · 마지막 행의 더보기 메뉴가 고정 줄·tab-bar 에 가려지지 않고 눌림`, async ({ browser }, info) => {
  const f = await fresh(info);
  const made: DbVendor[] = [];
  for (let i = 0; i < 12; i++) made.push(await prepVendor(f, { name: `줄${String(i).padStart(2, "0")} 판매처-${hex()}`, contact: `043-100-00${String(i).padStart(2, "0")}`, note: "시약" }));
  const { context, page, viewport } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    await waitVendors(page);
    await expect(vendorRows(page)).toHaveCount(made.length);
    await expectTabBar(page, viewport, SCREEN, "목록");
    const vp = page.viewportSize()!;
    const limit = viewport === "mobile" ? await tabBarTop(page) : vp.height;

    const pinned = async (btn: import("@playwright/test").Locator, what: string) => {
      // 데스크탑에는 하단 고정이 없다 — 목록 아래 제자리의 버튼을 화면 안으로 올려서 본다
      if (viewport !== "mobile") await btn.scrollIntoViewIfNeeded();
      await expect(btn, `${what} 보임`).toBeVisible();
      const b = await boxOf(btn);
      expect(b.height, `${what} 높이 ≥ rules.json button.min_height`).toBeGreaterThanOrEqual(BUTTON_MIN_HEIGHT);
      expect(await onTop(btn), `${what}: 다른 요소에 덮이지 않음`).toBe(true);
      if (viewport !== "mobile") return;
      expect(b.bottom, `${what}: 아래 끝 ≤ tab-bar 위쪽 선`).toBeLessThanOrEqual(limit + 0.5);
      expect(Math.abs(limit - b.bottom - BUTTON_TAB_GAP), `${what}: tab-bar 와 사이 ${BUTTON_TAB_GAP} (실제 ${limit - b.bottom})`).toBeLessThanOrEqual(1.5);
    };

    // 하단 고정 "판매처 등록": 처음·끝까지 내린 뒤 모두
    await pinned(registerButton(page), `처음 "${REGISTER_BUTTON}"`);
    await scrollToEnd(page);
    await pinned(registerButton(page), `끝까지 내림 "${REGISTER_BUTTON}"`);

    // 끝까지 내리면 마지막 행이 고정 버튼 위에 다 보인다
    const lastRow = vendorRows(page).last();
    const lastName = (await readVendorRows(page))[made.length - 1][0];
    const fixedTop = viewport === "mobile" ? (await boxOf(registerButton(page))).top : limit;
    expect((await boxOf(lastRow)).bottom, "마지막 행 아래 끝 ≤ 고정 버튼 위(모바일)·화면 아래(데스크탑)").toBeLessThanOrEqual(fixedTop + 0.5);
    expect(await onTop(moreButton(lastRow)), "마지막 행의 더보기가 가려지지 않음").toBe(true);

    // 마지막 행의 더보기 메뉴
    await moreButton(lastRow).click();
    for (const item of [EDIT_ITEM, DELETE_ITEM]) {
      const it = menuItem(page, item);
      await expect(it, `메뉴 "${item}"`).toBeVisible();
      const b = await boxOf(it);
      expect(b.top, `메뉴 "${item}" 위 끝이 화면 안`).toBeGreaterThanOrEqual(0);
      expect(b.bottom, `메뉴 "${item}" 아래 끝 ≤ 고정 버튼 위(모바일)·화면 아래(데스크탑)`).toBeLessThanOrEqual((viewport === "mobile" ? (await boxOf(registerButton(page))).top : limit) + 0.5);
      expect(await onTop(it), `메뉴 "${item}" 이 고정 줄·tab-bar 에 가려지지 않음`).toBe(true);
    }
    await menuItem(page, EDIT_ITEM).click();
    await expect(fieldInput(page, FIELD_NAME), "마지막 행의 수정 폼이 열림").toHaveValue(lastName);

    // 폼 "저장"
    await expectTabBar(page, viewport, SCREEN, "폼 열림");
    await pinned(saveButton(page), `폼 "${SAVE_BUTTON}"`);
    for (const label of [FIELD_NAME, FIELD_CONTACT, FIELD_WEBSITE]) {
      await fieldInput(page, label).scrollIntoViewIfNeeded();
      expect(await onTop(fieldInput(page, label)), `입력 "${label}" 이 고정 버튼·tab-bar 에 가려지지 않음`).toBe(true);
    }
    expect(await vendorsBySchool(f.school.id), "저장하지 않았다 — DB 그대로").toHaveLength(made.length);
  } finally {
    await context.close();
  }
});

// =====================================================================
// R-ui
// =====================================================================

test(`[R-ui][S${SCREEN}] 일회용 학교(판매처 있음): 학생·교사 ${VENDORS_HREF} → ${HOME_HREF} (3xx · 본문에 그 학교 판매처명·연락처·공통 판매처명 없음 · 도착 화면에 ${REGISTER} 0·${VENDORS_HREF} 링크 0) · admin 은 렌더`, async ({ browser }, info) => {
  const f = await fresh(info);
  const vendor = await prepVendor(f, { contact: "043-444-0000", website: fakeSite("role") });
  for (const who of ["student", "teacher"] as const) {
    const { context, page } = await openTemp(browser, info, f[who], VENDORS_HREF);
    try {
      await page.waitForURL((u) => u.pathname === HOME_HREF, { timeout: 30_000 });
      await expect(page.locator(sel("home-summary")).first(), `${who}: 홈으로 보내졌다`).toBeVisible();
      expect((await browserSession(page)).role, "일회용 계정 역할").toBe(who);
      expect(await countComponent(page, REGISTER), `${who} 홈 ${REGISTER}`).toBe(0);
      await expect(linksTo(page, VENDORS_HREF), `${who} 홈 ${VENDORS_HREF} 링크`).toHaveCount(0);
      const res = await context.request.get(VENDORS_HREF, { maxRedirects: 0 });
      expect(res.status(), `${who} 응답 코드`).toBeGreaterThanOrEqual(300);
      expect(res.status(), `${who} 응답 코드`).toBeLessThan(400);
      expect(locationPath(res.headers()["location"], info), "Location").toBe(HOME_HREF);
      const body = await res.text();
      for (const word of [vendor.name, vendor.contact!, ...COMMON_NAMES, SEARCH_PLACEHOLDER]) expect(body.includes(word), `${who} 3xx 응답 본문에 '${word}'`).toBe(false);
      if (who === "teacher") {
        // 교사는 화면 6 에서 판매처를 읽지만 등록 진입은 없다
        await page.goto(REORDER_HREF);
        await waitReorder(page);
        expect(await countComponent(page, REGISTER), `교사 화면 6 ${REGISTER}`).toBe(0);
        await expect(linksTo(page, VENDORS_HREF), `교사 화면 6 ${VENDORS_HREF} 링크`).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  }
  const admin = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    expect(admin.response?.status(), "admin 응답").toBe(200);
    await waitVendors(admin.page);
    await expect(vendorRow(admin.page, vendor.name), "admin 에게는 행이 보인다").toHaveCount(1);
    expect(await countComponent(admin.page, REGISTER), `admin ${REGISTER}`).toBe(1);
  } finally {
    await admin.context.close();
  }
});

// =====================================================================
// N1-ui
// =====================================================================

/** 화면 글자(두 탭) + 응답 본문 */
async function collect(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  out[`화면 "${TAB_SCHOOL}"`] = await page.locator("body").innerText();
  await switchTab(page, TAB_COMMON);
  out[`화면 "${TAB_COMMON}"`] = await page.locator("body").innerText();
  await switchTab(page, TAB_SCHOOL);
  const res = await context.request.get(VENDORS_HREF);
  expect(res.status(), `${VENDORS_HREF} 응답`).toBe(200);
  out["응답 본문"] = await res.text();
  return out;
}

/** 일회용 학교 A' 판매처 3 + 일회용 학교 B' 판매처 1 */
async function isolationData(info: TestInfo) {
  const f = await fresh(info);
  const o = await otherFixture(info);
  await purge([o.school.id]);
  const mine = [
    await prepVendor(f, { contact: "043-501-0001", note: "격리 하나", website: fakeSite("iso1") }, "격리A"),
    await prepVendor(f, { contact: "043-501-0002" }, "격리A"),
    await prepVendor(f, {}, "격리A"),
  ];
  const ins = await o.client
    .from("vendors")
    .insert({ school_id: o.school.id, name: `임시격리B-${hex()}`, contact: "043-502-0001" })
    .select("id, school_id, name, contact, website, note");
  expect(ins.error, `준비: B' 판매처 (${ins.error?.message})`).toBeNull();
  const theirs = (ins.data ?? [])[0] as DbVendor;
  return { f, o, mine, theirs };
}

test(`[N1-ui][S${SCREEN}] 학교A admin ${VENDORS_HREF}: 화면(두 탭)·응답 본문에 일회용 학교 A'·B'·학교 B·그 밖의 학교의 학교명·판매처명·연락처 0 · 학교명 종류 = rules.json distinct_school_names · 행 = 로그인 세션의 자기 학교 판매처만`, async ({ browser }, info) => {
  const { f, o, mine, theirs } = await isolationData(info);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  const actions = watchActions(page);
  try {
    await waitVendors(page);
    const me = await browserSession(page);
    const schoolId = await ownSchoolId(page);
    expect([f.school.id, o.school.id], "일회용 학교와 다른 학교").not.toContain(schoolId);
    const visible = await visibleVendors(page);
    expect(visible.filter((v) => v.school_id !== null && v.school_id !== schoolId), "대조: 세션에 다른 학교 판매처 0행").toEqual([]);
    const ownReagents = await ownReagentsOf((await browserClient(page)).client);

    const others = await otherSchools(schoolId);
    const a = others.find((x) => x.id === f.school.id);
    const b = others.find((x) => x.id === o.school.id);
    expect(a?.vendors.sort(), "대조: A' 판매처").toEqual(mine.map((v) => v.name).sort());
    expect(b?.vendors, "대조: B' 판매처").toEqual([theirs.name]);

    const texts = await collect(page, context);
    const compared = expectNoOtherSchool(texts, others, [me.schoolName, ...ownReagents.map((r) => r.name), ...visible.map((v) => v.name)]);
    expect(compared[a!.id], "대조: A' 값 비교 수 (학교명 + 판매처 3)").toBe(1 + mine.length);
    expect(compared[b!.id], "대조: B' 값 비교 수 (학교명 + 판매처 1)").toBe(2);
    for (const [where, text] of Object.entries(texts)) {
      for (const contact of [...mine.map((v) => v.contact), theirs.contact]) if (contact) expect(text.includes(contact), `${where} 에 다른 학교 판매처 연락처 '${contact}'`).toBe(false);
      if (where.startsWith("화면")) checkSchoolNames(text, me.schoolName, where);
      else for (const n of schoolNamesOf(text)) expect(me.schoolName, `${where}: 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
    }
    expect((await readVendorRows(page)).map((r) => r[0]).sort(), "행 = 자기 학교 판매처만").toEqual(visible.filter((v) => v.school_id === schoolId).map((v) => v.name).sort());
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[N1-ui][S${SCREEN}] 일회용 학교 B' admin ${VENDORS_HREF}: 자기 학교 판매처만 — 화면(두 탭)·응답 본문에 일회용 학교 A'·학교 A·B 의 학교명·판매처명·연락처 0 · 학교명 1종 · 공통 탭 = 공통 ${COMMON_SEED.length}곳만 · A' admin 화면에도 B' 것 0`, async ({ browser }, info) => {
  const { f, o, mine, theirs } = await isolationData(info);
  const views = [
    { who: "B'", user: o.school.admin, school: o.school, own: [theirs], foreign: mine },
    { who: "A'", user: f.admin, school: f.school, own: mine, foreign: [theirs] },
  ];
  for (const v of views) {
    const { context, page, response } = await openTemp(browser, info, v.user, VENDORS_HREF);
    try {
      expect(response?.status(), `${v.who} 응답`).toBe(200);
      await waitVendors(page);
      const me = await browserSession(page);
      expect(me.schoolName, `${v.who} 학교명`).toBe(v.school.name);
      expect((await readVendorRows(page)).map((r) => r[0]).sort(), `${v.who}: 행 = 자기 학교 판매처만`).toEqual(v.own.map((x) => x.name).sort());
      expect((await visibleVendors(page)).filter((x) => x.school_id !== null).map((x) => x.id).sort(), `대조: ${v.who} 세션의 학교 판매처`).toEqual(v.own.map((x) => x.id).sort());

      const others = await otherSchools(v.school.id);
      const texts = await collect(page, context);
      const compared = expectNoOtherSchool(texts, others, [me.schoolName, ...v.own.map((x) => x.name), ...COMMON_NAMES]);
      const foreignSchool = others.find((x) => x.vendors.includes(v.foreign[0].name));
      expect(compared[foreignSchool!.id], `대조: ${v.who} 화면에서 비교한 상대 일회용 학교 값 수`).toBe(1 + v.foreign.length);
      const schoolA = others.find((x) => x.neis === "TEST-SCHOOL-A");
      expect(compared[schoolA!.id], "대조: 학교 A 값 비교 수").toBeGreaterThanOrEqual(1);
      for (const [where, text] of Object.entries(texts)) {
        for (const x of v.foreign) if (x.contact) expect(text.includes(x.contact), `${v.who} ${where} 에 다른 학교 판매처 연락처`).toBe(false);
        if (where.startsWith("화면")) checkSchoolNames(text, me.schoolName, `${v.who} ${where}`);
        else for (const n of schoolNamesOf(text)) expect(me.schoolName, `${v.who} ${where}: 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
      }
      await switchTab(page, TAB_COMMON);
      expect((await readCommonCells(page)).filter((_, i) => i % COMMON_HEAD.length === 0).sort(), `${v.who}: 공통 탭 = 공통 목록만`).toEqual([...COMMON_NAMES].sort());
    } finally {
      await context.close();
    }
  }
});
