// 화면 7 서류로 입고 (harness/d7-data.md §21 · §17 · §20, design/rules.json 1.18 intake · screens_required["7"] · variants["7"]
// doc-upload·doc-review·doc-fail·suggest·msds · roles R5 · guest.hidden_components · button.min_height, design/frames/7-*.json) — C1 · R-ui · GM-ui · C2 · V1.
// - 실제 Gemini 호출 없음: POST /api/intake/extract 응답을 가로채 대체한다 (d7 §21 테스트). 가로채지 않은 요청은 키 없는 서버의 503.
// - MSDS 찾기도 GET /api/msds/search 를 가로챈다 (d7 §20 테스트).
// - 저장(record_document_intake)은 일회용 학교(admin·교사·학생 — service role 로 생성, 세션은 generateLink/verifyOtp)에서만.
//   공용 학교 A·B 는 화면을 열고 가로챈 추출까지만 (저장 없음). afterAll: 일회용 잔여 0, 공용 학교 A·B·데모 시약장·배치 스냅숏 그대로.
import { join } from "node:path";
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { waitWidthSettled } from "./desk-helpers";
import { anonClient } from "./db-helpers";
import { browserSession, countComponent, devRules, routeOf, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, clientFor, openTemp, service, type TempUser } from "./screen-8-helpers";
import {
  DOUBLE,
  NO_S11_RESIDUE,
  cleanup,
  makeFixture,
  onTop,
  prepCabinet,
  prepLayout,
  prepReagent,
  purgeSchool,
  sharedCabinetSnapshot,
  type S11Fixture,
} from "./screen-11-helpers";
import { LOCATION_SUGGEST, PLACE_ALL, SUGGEST_BADGE, expectedSuggestion, suggestRowsOf } from "./suggest-helpers";
import { CONFIRM as MSDS_CONFIRM, candidatesFor, confirmButton, expectCandidates, interceptSearch, sheet as msdsSheet } from "./msds-helpers";
import { INTAKE, INTAKE_MODE, MODE_DIRECT, MODE_DOC, activeMode, intakePath, modeControl, switchMode } from "./screen-7-helpers";
import { guestDetailPath, guestRouteOf } from "./guest-helpers";
import {
  ADD_AS_REAGENT,
  AGAIN_HEADING,
  API,
  CAMERA,
  CANCEL,
  CHANGE,
  DOC_PDF,
  DOC_PNG,
  DOC_TABLE,
  DOC_UPLOAD,
  DONE_D7,
  EMPTY_ACTION,
  EMPTY_BODY,
  EMPTY_TITLE,
  EXCLUDE,
  LINK_CAPTION,
  MAX_BYTES,
  MIN_H,
  MSDS_FIND,
  NEW_FIELDS,
  NEW_FIELD_LABELS,
  NEW_REAGENT,
  NO_MSDS,
  PICK_FILE,
  READ,
  UPLOAD_BUTTONS,
  READING,
  READING_BODY,
  REAGENT_LINK,
  REVIEW_CAPTION,
  REVIEW_TITLE,
  SUBMIT,
  UPLOAD_CAPTION,
  UPLOAD_HEADING,
  VARIANTS,
  amountInput,
  dateInput,
  doneText,
  exact,
  expectButtonHeights,
  fieldsOf,
  interceptExtract,
  item,
  itemRows,
  kstDate,
  linkOf,
  notReagentText,
  notReagentToggle,
  pdfOf,
  pickFile,
  qtyInput,
  readButton,
  readToReview,
  rowOf,
  submitButton,
  table,
  upload,
  waitUpload,
  type DocItemBody,
} from "./doc-intake-helpers";

test.describe.configure({ mode: "default" });

const SCREEN = 7;
const HOME = 13;
const LIST = 2;
const GROUP = "docui";
const SAVE_TIMEOUT = 30_000;
const R5 = rules.roles.R5;
const R5_COMPONENTS = R5.components ?? [];
const CLASSES = (rules as unknown as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;
const NOTE = (/예: ([^)]+)\)/.exec((rules as unknown as { intake: { review: string } }).intake.review) ?? [])[1] ?? "";

const shot = (page: Page, info: TestInfo, state: string) =>
  page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${state}-${info.project.name}.png`), fullPage: true });

/** 화면 7 서버 동작(POST /intake 의 서버 액션) 수 */
function watchSaves(page: Page): { count: () => number } {
  let n = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === routeOf(SCREEN)) n += 1;
  });
  return { count: () => n };
}

/** 시안 7-doc-review 의 서류 (3행 + 시약 아님 2) — 이름은 바꿔 쓴다 */
function frameDoc(docDate: string | null): { docDate: string | null; items: DocItemBody[] } {
  return {
    docDate,
    items: [
      item("염산 35% 500mL", 500, "mL", 4, { suggestedClass: "산" }),
      item("질산칼륨 500g", 500, "g", 1, { suggestedClass: "산화제" }),
      item("아세트산(빙초산) 500mL", 500, "mL", 2, { suggestedClass: "산" }),
      item("비커 100mL", 100, "mL", 10, { isReagent: false, quantityUnit: "개" }),
      item("니트릴 장갑", null, null, 2, { isReagent: false, quantityUnit: "박스" }),
    ],
  };
}

// =====================================================================
// 공용 학교 A (저장 없음)
// =====================================================================

for (const role of ["teacher", "admin"] as const) {
  test(`[C1][S${SCREEN}] ${role === "teacher" ? "교사" : "admin"} 기본 = ${MODE_DOC}: screens_required ${INTAKE_MODE} · 선택 칸 "${MODE_DOC}" · 순서 "${MODE_DIRECT} / ${MODE_DOC}" · variants["7"].doc-upload · doc-upload("${UPLOAD_HEADING}"·"${UPLOAD_CAPTION}"·[${CAMERA}][${PICK_FILE}]·"${READ}" 파일 전 비활성) · ${INTAKE} 0 · 누름 높이 ≥ ${MIN_H} → "${MODE_DIRECT}" 누름 = 직접 입력 · 다시 "${MODE_DOC}" / ?mode=direct·?mode=doc`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, response, viewport } = await openAs(browser, info, role, SCREEN);
    try {
      expect(response?.status()).toBe(200);
      await waitUpload(page);
      await waitWidthSettled(page);
      for (const c of rules.screens_required[String(SCREEN)] ?? []) expect(await countComponent(page, c), `screens_required ${c}`).toBeGreaterThanOrEqual(1);
      await expect(modeControl(page)).toHaveCount(1);
      await expect(activeMode(page), "기본 선택").toHaveText(exact(MODE_DOC));
      const order = (await modeControl(page).getByRole("tab").allInnerTexts()).map((t) => t.trim());
      expect(order, "intake-mode 순서 (rules intake.entry)").toEqual([MODE_DIRECT, MODE_DOC]);
      for (const c of VARIANTS["doc-upload"]) expect(await countComponent(page, c), `variants["7"].doc-upload ${c}`).toBeGreaterThanOrEqual(1);
      const up = upload(page);
      await expect(up.getByRole("heading", { name: exact(UPLOAD_HEADING) })).toBeVisible();
      await expect(up.getByText(UPLOAD_CAPTION, { exact: true })).toBeVisible();
      // 폭별 시안: 390 = [촬영하기][파일 선택] (7-mobile) · 1440 = [파일 선택] (새 프레임 7-desktop — 촬영하기 없음)
      const want = UPLOAD_BUTTONS[viewport];
      expect(UPLOAD_BUTTONS.mobile, "7-mobile 버튼").toEqual([CAMERA, PICK_FILE]);
      expect((await up.locator(sel("button-pill-soft")).filter({ visible: true }).allInnerTexts()).map((t) => t.trim()), `${viewport} doc-upload 버튼 = 시안`).toEqual(want);
      if (viewport === "desktop") await expect(up.locator(sel("button-pill-soft")).filter({ hasText: exact(CAMERA) }), `1440 [${CAMERA}] 0`).toHaveCount(0);
      await expect(readButton(page), `"${READ}" 1`).toHaveCount(1);
      await expect(readButton(page), "파일 전 비활성").toBeDisabled();
      await expect(page.locator(sel(INTAKE)), `${INTAKE} 0`).toHaveCount(0);
      await expect(page.locator(sel(DOC_TABLE))).toHaveCount(0);
      expect(await expectButtonHeights(page.locator("main"), "올리기"), `버튼 = 시안 버튼 줄 ${want.length} + "${READ}"`).toBeGreaterThanOrEqual(want.length + 1);
      await shot(page, info, "doc-upload");

      await switchMode(page, "direct");
      await expect(page.locator(`main ${sel(INTAKE)}`), "직접 입력 → stock-intake").toHaveCount(1);
      await expect(upload(page), "직접 입력 → doc-upload 0").toHaveCount(0);
      await switchMode(page, "doc");
      await expect(upload(page), `다시 "${MODE_DOC}"`).toHaveCount(1);
      await expect(page.locator(sel(INTAKE))).toHaveCount(0);

      await page.goto(intakePath({ mode: "direct" }));
      await expect(page.locator(`main ${sel(INTAKE)}`), "?mode=direct").toHaveCount(1, { timeout: 30_000 });
      await expect(activeMode(page)).toHaveText(exact(MODE_DIRECT));
      await expect(upload(page)).toHaveCount(0);
      await page.goto(intakePath({ mode: "doc" }));
      await waitUpload(page);
      await expect(activeMode(page), "?mode=doc").toHaveText(exact(MODE_DOC));
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S${SCREEN}] 교사 파일 검사 (rules intake ${MAX_BYTES / 1024 / 1024}MB · ${["PDF", "JPG", "PNG"].join("·")}): .txt·.gif·${MAX_BYTES / 1024 / 1024}MB 초과 → 경고 · "${READ}" 비활성 · 추출 요청 0 / PNG·PDF → 미리보기(파일 이름) · "${READ}" 활성`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  try {
    await waitUpload(page);
    const route = await interceptExtract(page, () => ({ body: { ok: true, docDate: null, items: [] } }));
    for (const [what, f] of [
      [".txt", { name: "서류.txt", mimeType: "text/plain", buffer: Buffer.from("염산 500mL 4병") }],
      [".gif", { name: "서류.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a-x") }],
      [`${MAX_BYTES + 1}B PDF`, pdfOf(MAX_BYTES + 1)],
    ] as const) {
      await pickFile(page, f);
      await expect(upload(page).getByRole("alert"), `${what}: 경고`).toBeVisible();
      await expect(readButton(page), `${what}: "${READ}" 비활성`).toBeDisabled();
      await expect(upload(page).getByText(f.name), `${what}: 미리보기 없음`).toHaveCount(0);
    }
    for (const f of [DOC_PNG, DOC_PDF]) {
      await pickFile(page, f);
      await expect(upload(page).getByRole("alert"), `${f.name}: 경고 없음`).toHaveCount(0);
      await expect(upload(page).getByText(f.name, { exact: true }), `${f.name}: 미리보기 파일 이름`).toBeVisible();
      await expect(readButton(page), `${f.name}: 활성`).toBeEnabled();
    }
    await pickFile(page, pdfOf(MAX_BYTES));
    await expect(readButton(page), `정확히 ${MAX_BYTES / 1024 / 1024}MB 는 받음`).toBeEnabled();
    expect(route.calls, "누르기 전 추출 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 교사 처리 중·취소·실패: "${READ}" → 처리 중("${READING}"·"${READING_BODY}"·진행 막대·[${CANCEL}]·"${READ}" 비활성·${INTAKE_MODE} 잠김) → [${CANCEL}] → 올리기(파일 유지) / 502 → 서버 문구 경고 · 파일 유지 · 다시 읽기 가능 / 가로채지 않음 → 키 없는 서버 503 문구`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  const fail = "AI 추출에 실패했어요. 잠시 후 다시 시도해 주세요";
  let mode: "slow" | "fail" | "real" = "slow";
  try {
    await waitUpload(page);
    const route = await interceptExtract(page, () =>
      mode === "slow" ? { body: { ok: true, docDate: null, items: [] }, delayMs: 8_000 } : mode === "fail" ? { status: 502, body: { ok: false, error: fail, code: "upstream" } } : null,
    );
    await pickFile(page, DOC_PDF);
    await readButton(page).click();
    const up = upload(page);
    await expect(up.getByRole("heading", { name: exact(READING) }), `"${READING}"`).toBeVisible();
    await expect(up.getByText(READING_BODY, { exact: true }).first()).toBeVisible();
    await expect(up.getByRole("progressbar"), "진행 막대").toHaveCount(1);
    await expect(readButton(page), "처리 중 비활성").toBeDisabled();
    await expect(modeControl(page).getByRole("tab", { name: MODE_DIRECT }), "처리 중 입고 방법 전환 잠김").toBeDisabled();
    for (const c of VARIANTS["doc-upload"]) expect(await countComponent(page, c), `처리 중 ${c}`).toBeGreaterThanOrEqual(1);
    await shot(page, info, "doc-processing");
    await up.locator(sel("button-outline")).filter({ hasText: exact(CANCEL) }).click();
    await expect(up.getByRole("heading", { name: exact(UPLOAD_HEADING) }), "취소 → 올리기").toBeVisible();
    await expect(up.getByText(DOC_PDF.name, { exact: true }), "파일 유지").toBeVisible();
    await expect(table(page)).toHaveCount(0);

    mode = "fail";
    await readButton(page).click();
    await expect(up.getByRole("alert"), "502 → 경고").toContainText(fail);
    await expect(up.getByText(DOC_PDF.name, { exact: true }), "실패 뒤 파일 유지").toBeVisible();
    await expect(readButton(page), "다시 읽기 가능").toBeEnabled();
    await expect(table(page)).toHaveCount(0);

    mode = "real";
    await readButton(page).click();
    await expect(up.getByRole("alert"), "키 없는 서버 503 문구").toContainText("AI 추출을 쓸 수 없어요(서버 설정)", { timeout: 30_000 });
    expect(route.calls, "요청 3번").toBe(3);
    expect(route.files.every((f) => f.startsWith("multipart/form-data|") && f.endsWith(DOC_PDF.name)), `multipart 로 고른 파일 1개 (${route.files.join(", ")})`).toBe(true);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 교사 품목 0개 → ex-empty-state-card "${EMPTY_TITLE}"("${EMPTY_BODY}") + [${EMPTY_ACTION}] · doc-upload "${AGAIN_HEADING}" · variants["7"].doc-fail · [${EMPTY_ACTION}] → 직접 입력`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  try {
    await waitUpload(page);
    await interceptExtract(page, () => ({ body: { ok: true, docDate: "2026-10-01", items: [] } }));
    await pickFile(page, DOC_PNG);
    await readButton(page).click();
    const card = page.locator(`main ${sel("ex-empty-state-card")}`);
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card).toContainText(EMPTY_TITLE);
    await expect(card).toContainText(EMPTY_BODY);
    await expect(upload(page).getByRole("heading", { name: exact(AGAIN_HEADING) })).toBeVisible();
    for (const c of VARIANTS["doc-fail"]) expect(await countComponent(page, c), `variants["7"].doc-fail ${c}`).toBeGreaterThanOrEqual(1);
    await expect(table(page), "표 없음").toHaveCount(0);
    expect(await expectButtonHeights(page.locator("main"), "0개")).toBeGreaterThanOrEqual(3);
    await shot(page, info, "doc-fail");
    await card.getByRole("button", { name: exact(EMPTY_ACTION) }).click();
    await expect(page.locator(`main ${sel(INTAKE)}`), `[${EMPTY_ACTION}] → stock-intake`).toHaveCount(1);
    await expect(activeMode(page)).toHaveText(exact(MODE_DIRECT));
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${SCREEN}] 학교 A 학생 /intake?mode=doc → 홈 · R5(${R5_COMPONENTS.join("·")}) 0 · ${INTAKE_MODE} 0 · 응답 본문에도 없음`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const path = intakePath({ mode: "doc" });
  const { context, page } = await openAs(browser, info, "student", SCREEN, path);
  try {
    await expect(page.locator(sel("home-summary")).first(), "학생은 홈으로").toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(routeOf(HOME));
    for (const c of [...R5_COMPONENTS, INTAKE_MODE, DOC_TABLE]) expect(await countComponent(page, c), `학생 ${c}`).toBe(0);
    const html = await (await context.request.get(path, { maxRedirects: 0 })).text();
    for (const c of [...R5_COMPONENTS, INTAKE_MODE]) expect(html, `응답 본문 ${c}`).not.toContain(`data-component="${c}"`);
  } finally {
    await context.close();
  }
});

test(`[GM-ui][S*] 둘러보기 /demo·/demo/reagents·/demo/reagents/[id]: guest.hidden_components 의 doc-upload·location-suggest 0 · ${INTAKE_MODE} 0 · 화면 7 링크 0 · 비로그인 /intake?mode=doc → /login`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const hidden = rules.guest.hidden_components;
  for (const c of ["doc-upload", "location-suggest", "msds-search"]) expect(hidden, `guest.hidden_components 에 ${c}`).toContain(c);
  const demo = await anonClient().from("reagents").select("id").order("id").limit(1);
  expect(demo.data?.length, "데모 시약").toBe(1);
  const vp = devRules.viewports[info.project.name];
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: vp[0], height: vp[1] } });
  try {
    const page = await context.newPage();
    for (const path of [guestRouteOf(13), guestRouteOf(2), guestDetailPath(demo.data![0].id as string)]) {
      await page.goto(path);
      await expect(page.locator(sel("guest-banner")).first(), `${path} 둘러보기`).toBeVisible({ timeout: 30_000 });
      for (const c of [...hidden, INTAKE_MODE, DOC_TABLE, REAGENT_LINK, NEW_FIELDS]) expect(await countComponent(page, c), `${path} ${c}`).toBe(0);
      await expect(page.locator(`a[href^="${routeOf(SCREEN)}"]`), `${path} 화면 7 링크`).toHaveCount(0);
    }
    await page.goto(intakePath({ mode: "doc" }));
    await page.waitForURL((u) => u.pathname === routeOf(1), { timeout: 30_000 });
    expect(await countComponent(page, "doc-upload")).toBe(0);
  } finally {
    await context.close();
  }
});

for (const role of ["teacher", "admin"] as const) {
  test(`[C1][S${HOME}] ${role === "teacher" ? "교사" : "admin"} 홈 quick-action "입고" → ${routeOf(SCREEN)} (rules intake.entry) · 도착 = ${MODE_DOC}(doc-upload)`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page } = await openAs(browser, info, role, HOME);
    try {
      const qa = page.locator(`main ${sel("quick-action")}`);
      await expect(qa, "quick-action").toHaveCount(1, { timeout: 30_000 });
      const link = qa.getByRole("link", { name: exact("입고") });
      await expect(link, '"입고" 칸').toHaveCount(1);
      expect(new URL((await link.getAttribute("href"))!, "http://x").pathname, "href = 화면 7").toBe(routeOf(SCREEN));
      await link.click();
      await page.waitForURL((u) => u.pathname === routeOf(SCREEN), { timeout: 30_000 });
      await waitUpload(page);
      await expect(activeMode(page)).toHaveText(exact(MODE_DOC));
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 일회용 학교 — 확인 표 · 저장 · 위치 추천
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

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedCabinetSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약장·칸·시약·입고 기록 잔여물").toEqual(NO_S11_RESIDUE);
  if (before) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치 그대로").toEqual(before);
});

type Prepared = { f: S11Fixture; hcl: { id: string; stock: number }; etoh: { id: string; stock: number } };
/** 일회용 학교: 시약장 1개(양문형 3단: 좌1단 산 · 우1단 산화제 · 좌2단 무기염) + 우리 학교 시약 "염산"(mL 100, 산)·"에탄올"(mL 50, 유기) */
async function prepared(info: TestInfo): Promise<Prepared> {
  test.setTimeout(480_000);
  const f = await fixture(info);
  await purgeSchool(f.school.id);
  const cab = await prepCabinet(f);
  await prepLayout(f, cab.id, DOUBLE, 3, { L1: ["산"], R1: ["산화제"], L2: ["무기염"] });
  const hcl = await prepReagent(f, "hcl", 100, "mL", "산", "염산");
  const etoh = await prepReagent(f, "etoh", 50, "mL", "유기", "에탄올");
  return { f, hcl, etoh };
}
async function row(id: string): Promise<Record<string, unknown>> {
  const r = await service().from("reagents").select("*").eq("id", id).single();
  if (r.error) throw new Error(r.error.message);
  return r.data as Record<string, unknown>;
}
async function byName(schoolId: string, name: string): Promise<Record<string, unknown>[]> {
  const r = await service().from("reagents").select("*").eq("school_id", schoolId).eq("name", name);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as Record<string, unknown>[];
}
async function logs(reagentId: string): Promise<Record<string, unknown>[]> {
  const r = await service().from("intake_logs").select("*").eq("reagent_id", reagentId).order("created_at");
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as Record<string, unknown>[];
}
const linkButton = (r: Locator, label: string) => linkOf(r).getByRole("button", { name: new RegExp(`${label}$`) });

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

  test(`[C1][S${SCREEN}] 일회용 교사 서류 → 확인 표 (시안 7-doc-review): "${REVIEW_TITLE}" · ${"서류 날짜"} = 서류 날짜(미래 불가) · 자동 연결 "염산" + 환산 줄 "${NOTE}" · 수량·입고량 고치기 · 새 시약 펼침(${NEW_FIELD_LABELS.join("·")}, 추천 분류 + ${SUGGEST_BADGE}, "${NO_MSDS}" + ${MSDS_FIND} → 후보 → 주소) · 접힌 새 시약 요약 · [${CHANGE}](다른 시약 → 계산 불가로 저장 막힘 → "${NEW_REAGENT}") · "${notReagentText(2)}" → "${ADD_AS_REAGENT}" → [${EXCLUDE}] · variants doc-review·msds · 누름 높이 → "${SUBMIT}" → DB(한 번) → 토스트 "${doneText(3)}" → ${LOCATION_SUGGEST} 2줄 → "${PLACE_ALL}" → DB 칸 = 추천 → 화면 2`, async ({ browser }, info) => {
    const { f, hcl } = await prepared(info);
    const docDate = kstDate(-2);
    const { context, page, viewport } = await openTemp(browser, info, f.teacher, routeOf(SCREEN));
    try {
      await waitUpload(page);
      const saves = watchSaves(page);
      await interceptExtract(page, () => ({ body: { ok: true, ...frameDoc(docDate) } }));
      const msds = await interceptSearch(page);
      await readToReview(page);
      const t = table(page);
      await expect(t.getByRole("heading", { name: exact(REVIEW_TITLE) })).toBeVisible();
      await expect(t.getByText(REVIEW_CAPTION, { exact: true })).toBeVisible();
      await expect(dateInput(page), "입고일 = 서류 날짜").toHaveValue(docDate);
      await expect(itemRows(page), "표 = 시약 3행 (시약 아님 2개는 묶음)").toHaveCount(3);
      await expect(notReagentToggle(page)).toHaveText(exact(notReagentText(2)));
      for (const c of VARIANTS["doc-review"]) expect(await countComponent(page, c), `variants["7"].doc-review ${c}`).toBeGreaterThanOrEqual(1);
      await expect(linkOf(itemRows(page)), `${REAGENT_LINK} = 행마다`).toHaveCount(3);
      await expect(page.locator(`main ${sel(REAGENT_LINK)}`).getByText(LINK_CAPTION, { exact: true }), `"${LINK_CAPTION}" 3`).toHaveCount(3);

      // 1행: 자동 연결 + 환산
      const r1 = rowOf(page, "염산 35% 500mL");
      await expect(linkOf(r1)).toContainText("염산");
      for (const l of [CHANGE, EXCLUDE]) await expect(linkButton(r1, l), `1행 [${l}]`).toHaveCount(1);
      await expect(amountInput(r1), "입고량 = 500 × 4").toHaveValue("2000");
      await expect(r1.getByText(NOTE, { exact: true }), `환산 줄 "${NOTE}"`).toBeVisible();
      await qtyInput(r1).fill("3");
      await expect(amountInput(r1), "수량 3 → 1500").toHaveValue("1500");
      await expect(r1.getByText("500 mL × 3병 = 1,500 mL", { exact: true })).toBeVisible();
      await amountInput(r1).fill("1600");
      await expect(amountInput(r1)).toHaveValue("1600");

      // 2행: 새 시약 (펼침)
      const r2 = rowOf(page, "질산칼륨 500g");
      const f2 = fieldsOf(r2);
      await expect(f2, "2행 new-reagent-fields 펼침").toHaveCount(1);
      await expect(linkOf(r2).getByText(NEW_REAGENT, { exact: true })).toBeVisible();
      for (const l of NEW_FIELD_LABELS) await expect(f2.getByText(l, { exact: true }).first(), `칸 "${l}"`).toBeVisible();
      await expect(f2.getByLabel("이름", { exact: true }), "이름 = 규격 뗀 품명").toHaveValue("질산칼륨");
      const chips = f2.locator(`button${sel("storage-class-chip")}`);
      expect((await chips.allInnerTexts()).map((x) => x.trim()), "보관 분류 = rules storage_classes").toEqual(CLASSES);
      await expect(chips.filter({ hasText: exact("산화제") }), "추천 분류 처음 선택").toHaveAttribute("aria-pressed", "true");
      await expect(f2.locator(sel(SUGGEST_BADGE)), `${SUGGEST_BADGE} 1 (추천 분류 옆)`).toHaveCount(1);
      expect(
        await f2.locator(sel(SUGGEST_BADGE)).evaluate((b, s) => !!b.parentElement?.querySelector(s), `button${sel("storage-class-chip")}`),
        "배지는 산화제 칩과 같은 자리",
      ).toBe(true);
      await expect(f2.locator(sel(SUGGEST_BADGE)).locator("xpath=..").locator(`button${sel("storage-class-chip")}`)).toHaveText(exact("산화제"));
      await expect(f2.getByRole("combobox", { name: "단위" }), "단위 = 규격에서 g").toHaveValue("g");
      await expect(f2.getByLabel("재고량", { exact: true }), "재고량 = 500 × 1").toHaveValue("500");
      await expect(f2.getByText(NO_MSDS, { exact: true })).toBeVisible();

      // 3행: 접힌 새 시약 요약
      const r3 = rowOf(page, "아세트산(빙초산) 500mL");
      await expect(fieldsOf(r3), "3행 접힘").toHaveCount(0);
      await expect(r3.getByRole("button", { name: "새 시약 · 산 · 1,000 mL" }), "요약 (시안)").toBeVisible();
      await r3.getByRole("button", { name: "새 시약 · 산 · 1,000 mL" }).click();
      await expect(fieldsOf(r3), "요약 누름 → 펼침").toHaveCount(1);

      // 입고일 미래 → 저장 막힘
      await expect(submitButton(page), "모두 찬 상태 → 활성").toBeEnabled();
      await dateInput(page).fill(kstDate(1));
      await expect(submitButton(page), "미래 입고일 → 비활성").toBeDisabled();
      await dateInput(page).fill(docDate);
      await expect(submitButton(page)).toBeEnabled();

      // 2행 바꾸기 → 다른 시약(mL ↔ g 계산 불가) → 저장 막힘 → 새 시약으로 되돌림
      await linkButton(r2, CHANGE).click();
      const pick = linkOf(r2).getByRole("combobox");
      const opts = (await pick.locator("option").allInnerTexts()).map((x) => x.trim());
      expect(opts.some((o) => o.startsWith("염산")) && opts.some((o) => o.startsWith("에탄올")), `바꾸기 목록 = 우리 학교 시약 (${opts.join(", ")})`).toBe(true);
      expect(opts, `바꾸기 목록에 "${NEW_REAGENT}"`).toContain(NEW_REAGENT);
      await pick.selectOption({ label: opts.find((o) => o.startsWith("에탄올"))! });
      await expect(linkOf(r2)).toContainText("에탄올");
      await expect(fieldsOf(r2)).toHaveCount(0);
      await expect(amountInput(r2), "g 규격 → mL 시약: 계산 불가 → 빈 칸").toHaveValue("");
      await expect(submitButton(page), "입고량 빈 행 → 비활성").toBeDisabled();
      await linkButton(r2, CHANGE).click();
      await linkOf(r2).getByRole("combobox").selectOption({ label: NEW_REAGENT });
      await expect(fieldsOf(r2), "새 시약으로 → 펼침").toHaveCount(1);
      await expect(fieldsOf(r2).getByLabel("이름", { exact: true }), "값 유지").toHaveValue("질산칼륨");

      // MSDS 찾기 (가로챔)
      await fieldsOf(r2).locator(sel("msds-search")).click();
      const sh = msdsSheet(page);
      await expect(sh).toBeVisible();
      for (const c of VARIANTS.msds) expect(await countComponent(page, c), `variants["7"].msds ${c}`).toBeGreaterThanOrEqual(1);
      await expectCandidates(sh, candidatesFor("질산칼륨"), "후보");
      expect(msds.queries, "검색어 = 새 시약 이름").toEqual(["질산칼륨"]);
      await confirmButton(sh).click();
      await expect(sh).toHaveCount(0);
      const url = candidatesFor("질산칼륨")[0].msdsUrl;
      await expect(fieldsOf(r2).getByRole("textbox", { name: /MSDS/ }), `"${MSDS_CONFIRM}" → 주소`).toHaveValue(url);

      // 시약 아님 → 시약으로 넣기 → 빼기
      await notReagentToggle(page).click();
      await t.getByRole("button", { name: new RegExp(`^비커 100mL ${ADD_AS_REAGENT}$`) }).click();
      await expect(itemRows(page), "표 4행").toHaveCount(4);
      await expect(notReagentToggle(page)).toHaveText(exact(notReagentText(1)));
      const r4 = rowOf(page, "비커 100mL");
      await expect(fieldsOf(r4), "연결 없음 → 새 시약 펼침").toHaveCount(1);
      await expect(fieldsOf(r4).locator(sel(SUGGEST_BADGE)), "추천 없음 → 배지 0").toHaveCount(0);
      await expect(submitButton(page), "분류 없는 새 시약 → 비활성").toBeDisabled();
      await linkButton(r4, EXCLUDE).click();
      await expect(fieldsOf(r4), "빼기 → 칸 닫힘").toHaveCount(0);
      await expect(submitButton(page), "뺀 행은 저장에서 빠짐 → 활성").toBeEnabled();

      expect(await expectButtonHeights(page.locator("main"), "확인 표")).toBeGreaterThanOrEqual(1);
      if (viewport === "mobile") {
        await expect(page.locator(sel(rules.tab_bar.component))).toHaveCount(1);
        await expect(page.locator(sel(rules.tab_bar.item))).toHaveCount(rules.tab_bar.items);
        await submitButton(page).scrollIntoViewIfNeeded();
        expect(await onTop(submitButton(page)), `"${SUBMIT}" 가 tab-bar 에 가려지지 않음`).toBe(true);
      } else await expect(page.locator(sel(rules.tab_bar.component))).toHaveCount(0);
      expect(saves.count(), "확인 전 저장 0").toBe(0);
      await shot(page, info, "doc-review");

      // 저장
      await submitButton(page).click();
      const toast = page.locator(sel("ex-toast")).filter({ hasText: doneText(3) });
      await expect(toast, `토스트 "${doneText(3)}" (d7 ${DONE_D7})`).toBeVisible({ timeout: SAVE_TIMEOUT });
      const box = page.locator(`main ${sel(LOCATION_SUGGEST)}`);
      await expect(box, `${LOCATION_SUGGEST}`).toHaveCount(1, { timeout: SAVE_TIMEOUT });
      expect(new URL(page.url()).pathname, "화면 7 에 머문다").toBe(routeOf(SCREEN));
      expect(saves.count(), "저장 요청 1").toBe(1);
      for (const c of VARIANTS.suggest) expect(await countComponent(page, c), `variants["7"].suggest ${c}`).toBeGreaterThanOrEqual(1);

      // DB
      const h = await row(hcl.id);
      expect([Number(h.stock), h.intake_date], "염산 stock += 고친 입고량 · intake_date = 서류 날짜").toEqual([hcl.stock + 1600, docDate]);
      const hl = await logs(hcl.id);
      expect(hl.at(-1), "염산 intake_logs").toMatchObject({ user_id: f.teacher.id, intake_date: docDate });
      expect(Number(hl.at(-1)!.amount)).toBe(1600);
      const kn = await byName(f.school.id, "질산칼륨");
      const ac = await byName(f.school.id, "아세트산(빙초산)");
      expect([kn.length, ac.length], "새 시약 2행").toEqual([1, 1]);
      expect([kn[0].storage_class, kn[0].unit, Number(kn[0].stock), kn[0].msds_url, kn[0].intake_date]).toEqual(["산화제", "g", 500, url, docDate]);
      expect([ac[0].storage_class, ac[0].unit, Number(ac[0].stock), ac[0].msds_url, ac[0].intake_date]).toEqual(["산", "mL", 1000, null, docDate]);
      expect(await byName(f.school.id, "비커"), "뺀 행 없음").toHaveLength(0);
      for (const r of [kn[0], ac[0]]) expect(await logs(r.id as string), `${r.name} 첫 재고 기록`).toHaveLength(1);

      // 위치 추천: 2줄, 모두 추천대로 → DB 칸 = 추천
      await expect(box.locator('[data-testid="location-suggest-row"]'), "새 시약 2줄").toHaveCount(2);
      const rowsNow = await suggestRowsOf(await clientFor(f.teacher));
      const want = [kn[0], ac[0]].map((r) => expectedSuggestion(rowsNow, { id: r.id as string, storage_class: r.storage_class as string }));
      expect(want.every(Boolean), "둘 다 추천 칸 있음").toBe(true);
      const btns = box.locator("button, a");
      for (let i = 0; i < (await btns.count()); i++) {
        if (!(await btns.nth(i).isVisible())) continue;
        expect((await btns.nth(i).boundingBox())!.height, `${LOCATION_SUGGEST} 누름 높이`).toBeGreaterThanOrEqual(MIN_H);
      }
      await box.getByRole("button", { name: exact(PLACE_ALL) }).click();
      await page.waitForURL((u) => u.pathname === routeOf(LIST), { timeout: SAVE_TIMEOUT });
      expect([(await row(kn[0].id as string)).slot_id, (await row(ac[0].id as string)).slot_id], "DB 칸 = 추천").toEqual(want.map((w) => w!.slotId));
    } finally {
      await context.close();
    }
  });

  test(`[C1][S${SCREEN}] 일회용 admin 새 시약 없는 서류 (서류 날짜 없음 → 입고일 오늘 → 고쳐서 과거): L→mL 환산(1 L × 2병 = 2,000 mL) · 연타에도 저장 1번 → 토스트 "${doneText(1)}" → ${LOCATION_SUGGEST} 없이 화면 2 · DB stock·intake_date = 고친 날짜`, async ({ browser }, info) => {
    const { f, etoh } = await prepared(info);
    const picked = kstDate(-10);
    const { context, page } = await openTemp(browser, info, f.admin, routeOf(SCREEN));
    try {
      await waitUpload(page);
      const saves = watchSaves(page);
      await interceptExtract(page, () => ({ body: { ok: true, docDate: null, items: [item("에탄올 1L", 1, "L", 2, { suggestedClass: "인화성" })] } }));
      await readToReview(page, DOC_PNG);
      await expect(dateInput(page), "서류 날짜 없음 → 오늘").toHaveValue(kstDate());
      const r = rowOf(page, "에탄올 1L");
      await expect(linkOf(r)).toContainText("에탄올");
      await expect(amountInput(r)).toHaveValue("2000");
      await expect(r.getByText("1 L × 2병 = 2,000 mL", { exact: true })).toBeVisible();
      await expect(notReagentToggle(page), "시약 아님 0 → 묶음 없음").toHaveCount(0);
      await dateInput(page).fill(picked);
      await submitButton(page).dblclick();
      await submitButton(page).click({ force: true, timeout: 2_000 }).catch(() => undefined);
      await expect(page.locator(sel("ex-toast")).filter({ hasText: doneText(1) })).toBeVisible({ timeout: SAVE_TIMEOUT });
      await page.waitForURL((u) => u.pathname === routeOf(LIST), { timeout: SAVE_TIMEOUT });
      expect(await countComponent(page, LOCATION_SUGGEST), "새 시약 없음 → location-suggest 0").toBe(0);
      expect(saves.count(), "저장 요청 1").toBe(1);
      const now = await row(etoh.id);
      expect([Number(now.stock), now.intake_date]).toEqual([etoh.stock + 2000, picked]);
      expect(await logs(etoh.id), "등록 1 + 이번 1").toHaveLength(2);
    } finally {
      await context.close();
    }
  });

  test(`[R-ui][S${SCREEN}] 일회용 학생 /intake → 홈 · doc-upload 0 (같은 학교 교사는 doc-upload 1 — 양성 대조)`, async ({ browser }, info) => {
    const { f } = await prepared(info);
    for (const [u, staff] of [
      [f.teacher, true],
      [f.student, false],
    ] as [TempUser, boolean][]) {
      const { context, page } = await openTemp(browser, info, u, routeOf(SCREEN));
      try {
        if (staff) {
          await waitUpload(page);
          expect((await browserSession(page)).role).toBe("teacher");
        } else {
          await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 30_000 });
          expect(new URL(page.url()).pathname).toBe(routeOf(HOME));
          expect(await countComponent(page, "doc-upload")).toBe(0);
          expect(await countComponent(page, INTAKE_MODE)).toBe(0);
        }
      } finally {
        await context.close();
      }
    }
  });
});

void API;
