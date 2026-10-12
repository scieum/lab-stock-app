// 화면 17 무선 센서 — C1 · R-ui · N1-ui · N1-db(화면 쪽) · V1 (390 · 1440). 일회용 학교(교사가 DB 함수로 등록한 센서).
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §25 "무선 센서 (화면 17)" · "여러 개 삭제", design/rules.json 1.26 sensor
//   (list · filter · detail · form · types · makers · maker_select · status · empty · delete · roles) · bulk_delete · roles R5 ·
//   screens_required["17"] · variants["17"] · tab_bar.sensor_entry, harness/dev-rules.json 1.18 routes["17"] · components, 새 프레임 17-*.
// - 목록(모바일 sensor-row 카드 / 데스크톱 data-table) · 검색(이름 · 모델) · 필터(종류 · 회사 · 상태) · 상세(모바일 화면 / 데스크톱 드로어) ·
//   등록 · 수정 폼(종류 14 · 회사 묶음 + 직접 입력) · 상태 배지 · 빈 상태 · ⋯ 삭제(확인 모달, Esc → 포커스 ⋯) · 여러 개 삭제 ·
//   학생 보기만(R5) · 다른 학교 격리(학교 B 계정 = 404, 목록에 없음).
// 데이터: 일회용 학교에만 쓴다(정리 후 잔여 0). 공용 학교 A·B·데모 센서는 그대로(앞뒤 스냅숏).
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { devRules, routeOf, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, openTemp, watchActions, type TempUser } from "./screen-8-helpers";
import { newFrame } from "./desk-helpers";
import {
  ADD_LABEL,
  BULK,
  CANCEL,
  CONFIRM,
  DELETE_ITEM,
  DELETE_NOTE,
  DESK_COLUMNS,
  DETAIL_KEYS,
  EDIT_LABEL,
  EMPTY_BODY,
  EMPTY_TITLE,
  MAKERS,
  MAKER_DIRECT,
  MAKER_GROUPS,
  NO_SENSOR_RESIDUE,
  SCREEN,
  SELECT_LABEL,
  SENSOR,
  SENSOR_DELETE_BODY,
  SINGLE_DONE,
  STATUS,
  bulkDone,
  bulkNames,
  bulkTitle,
  cleanupSensors,
  detailPath,
  exact,
  isDesk,
  listPath,
  liveSensors,
  makeSensor,
  quotes,
  rowNamed,
  rowsOf,
  selectedText,
  sensorFixture,
  sensorRow,
  sharedSensorSnapshot,
  singleDeleteTitle,
  statusLabel,
  waitSensorList,
  type MadeSensor,
  type SensorFixture,
} from "./sensor-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "s17";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

const NOT_FOUND = quotes((rules as unknown as { not_found: { card: string } }).not_found.card);
/** R5 중 화면 17 소속 (dev-rules components) — 학생 0 */
const R5 = (rules.roles.R5.components ?? []).filter((c) => (devRules.components[c] ?? []).includes(SCREEN));
/** 프레임 17-mobile 검색 칸 글자 */
const SEARCH_PLACEHOLDER = newFrame("17-mobile").find((n) => n.name === "value" && n.path.includes("search-row"))?.text?.characters ?? "";
/** 프레임 17-mobile 머리 "센서 N개" · 17-desktop 요약 "고장 n · 점검 필요 n" 틀 */
const MOBILE_HEADING = (n: number) => (newFrame("17-mobile").find((x) => x.name === "heading")?.text?.characters ?? "").replace(/\d+/, String(n));
const DESK_SUMMARY = (broken: number, check: number) => {
  const t = newFrame("17-desktop").find((x) => x.name === "summary")?.text?.characters ?? "";
  let i = 0;
  return t.replace(/\d+/g, () => String(i++ === 0 ? broken : check));
};

// ---------- 일회용 학교 ----------
let main: Promise<SensorFixture> | null = null;
let empty: Promise<SensorFixture> | null = null;
function fixture(info: TestInfo): Promise<SensorFixture> {
  main ??= sensorFixture(info, GROUP, true);
  main.catch(() => (main = null));
  return main;
}
function emptyFixture(info: TestInfo): Promise<SensorFixture> {
  empty ??= sensorFixture(info, GROUP, false);
  empty.catch(() => (empty = null));
  return empty;
}

let sharedBefore: string[] | null = null;
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (HAS_SERVICE) sharedBefore = await sharedSensorSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(TIMEOUT);
  if (!HAS_SERVICE) return;
  main = null;
  empty = null;
  const left = await cleanupSensors(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·센서·시약 잔여물").toEqual(NO_SENSOR_RESIDUE);
  if (sharedBefore) expect(await sharedSensorSnapshot(), "학교 A·B·데모 센서 그대로").toEqual(sharedBefore);
});

// ---------- 화면 읽기 ----------
const mainText = async (page: Page) => (await page.locator("main").innerText()).replace(/\s+/g, " ");

/** 행 한 개의 글자 (모바일 카드 / 데스크톱 행) */
async function rowText(page: Page, name: string): Promise<string> {
  const r = rowNamed(page, name);
  await expect(r, `행 ${name}`).toHaveCount(1);
  return (await r.innerText()).replace(/\s+/g, " ").trim();
}

/** 상세 범위: 모바일 = main 의 sensor-detail · 데스크톱 = detail-drawer */
const detailScope = (page: Page) => (isDesk(page) ? page.locator(sel("detail-drawer")) : page.locator("main"));

async function openDetail(page: Page, s: MadeSensor): Promise<void> {
  const row = rowNamed(page, s.name);
  await expect(async () => {
    if (isDesk(page)) await row.locator("a, button").first().click({ timeout: 5_000 });
    else await row.click({ timeout: 5_000 });
    await expect(detailScope(page).locator(sel("sensor-detail")), "sensor-detail").toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 45_000 });
  await expect(page, "상세 주소 /sensors/{id}").toHaveURL(new RegExp(`${routeOf(SCREEN)}/${s.id}(\\?|$)`));
}

const expectedCaption = (s: MadeSensor) => [s.type, s.maker, s.model].filter(Boolean).join(" · ");

/** 일회용 계정으로 /sensors 열기 */
async function openList(browserPage: { browser: import("@playwright/test").Browser }, info: TestInfo, u: TempUser, path = listPath(), state: "some" | "empty" = "some") {
  const t = await openTemp(browserPage.browser, info, u, path);
  await waitSensorList(t.page, state);
  return t;
}

test(`[C1][S17] 기대값 원본: screens_required 17 · variants 17 · rules sensor(종류 ${SENSOR.types.length} · 회사 묶음 ${MAKER_GROUPS.map((g) => g.title).join("·")} + '${MAKER_DIRECT}' · 상태 ${STATUS.map((s) => s.label).join("·")}) = 프레임 17-form · 17-mobile · 17-desktop · 17-detail · 17-empty`, () => {
  expect(rules.screens_required["17"], "screens_required 17").toEqual(["sensor-list", "sensor-row", "sensor-status-badge", "list-filter-button"]);
  expect(rules.variants["17"], "variants 17").toMatchObject({
    detail: ["sensor-detail", "sensor-status-badge"],
    form: ["sensor-form", "sensor-type-select", "sensor-maker-select"],
    empty: ["ex-empty-state-card", "sensor-add"],
    select: ["list-select-toggle", "select-checkbox", "bulk-action-bar"],
  });
  expect(devRules.routes["17"], "dev-rules routes 17").toBe("/sensors");
  expect(devRules.routes["17-guest"], "dev-rules routes 17-guest").toBe("/demo/sensors");
  expect(devRules.guest_screens, "dev-rules guest_screens 에 17").toContain(17);
  // 종류 (rules 1.28 · d7 §28): 27종 묶음 4줄 = 프레임 17-type-mobile group-name · group-count (17-form 의 예전 chip 줄은 type_select 로 바뀜)
  const typeGroups = (rules as unknown as { sensor: { type_groups: Record<string, string[]> } }).sensor.type_groups;
  expect(Object.values(typeGroups).flat(), "rules type_groups = sensor.types").toEqual(SENSOR.types);
  const groupNames = newFrame("17-type-mobile").filter((n) => n.name === "group-name" && n.text).map((n) => n.text!.characters);
  const groupCounts = newFrame("17-type-mobile").filter((n) => n.name === "group-count" && n.text).map((n) => n.text!.characters);
  expect(groupNames, "17-type 묶음 이름 = rules type_groups").toEqual(Object.keys(typeGroups));
  expect(groupCounts, "17-type 묶음 개수 = rules type_groups").toEqual(Object.values(typeGroups).map((v) => String(v.length)));
  expect(MAKER_GROUPS.map((g) => g.title), "회사 묶음 제목").toEqual(["센서", "현미경"]);
  expect(MAKERS.length, "회사 수 (센서 + 현미경)").toBe(MAKER_GROUPS.reduce((a, g) => a + g.makers.length, 0));
  // 상태 글자 = 프레임 17-form 상태 segmented
  const statusSeg = newFrame("17-form-mobile").filter((n) => n.path.includes("field-status") && n.text && n.name === "label").map((n) => n.text!.characters);
  expect(statusSeg, "17-form 상태 = d7 §25 정상 · 점검 필요 · 고장").toEqual(STATUS.map((s) => s.label));
  // 데스크톱 표 머리 = rules sensor.list 열
  const heads = newFrame("17-desktop").filter((n) => n.path.includes("head-cell") && n.text).map((n) => n.text!.characters);
  expect(heads, "17-desktop 표 머리 = rules 열").toEqual(DESK_COLUMNS);
  // 상세 항목 = 프레임 17-detail
  const keys = newFrame("17-detail-mobile").filter((n) => n.name === "key" && n.text).map((n) => n.text!.characters);
  expect(keys, "17-detail 항목 = rules sensor.detail").toEqual(DETAIL_KEYS);
  // 빈 상태
  const emptyTexts = newFrame("17-empty-mobile").filter((n) => n.path.includes("ex-empty-state-card") && n.text).map((n) => n.text!.characters);
  expect(emptyTexts, "17-empty 카드 글자").toEqual(expect.arrayContaining([EMPTY_TITLE, EMPTY_BODY, ADD_LABEL]));
  expect(SEARCH_PLACEHOLDER, "17-mobile 검색 칸 글자").not.toBe("");
  // R5: 학생 0 (센서 등록 · 수정 · 삭제 · 선택 모드)
  expect(R5, "R5 화면 17 소속").toEqual(expect.arrayContaining(["sensor-add", "sensor-edit", "sensor-delete", "list-select-toggle", "select-checkbox", "bulk-action-bar"]));
  expect(BULK.screens, "bulk_delete 화면").toContain(SCREEN);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test(`[C1][S17] [C3][S17] [R-ui][S17] [N1-ui][S17] 교사 목록: screens_required 17 · 행 = DB 센서(이름 · 종류 · 회사 · 모델 · 수량 · 보관 위치 · 상태 배지 글자) · 모바일 inventory-switch '센서' 활성 + 탭바 '시약' 활성 · 데스크톱 app-sidebar 1 · desktop_required data-table · 표 머리 = rules 열 · 학교명 1종 · V1 스크린샷`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const { page, context } = await openList({ browser }, info, f.teacher);
    try {
      const live = await liveSensors(f.school.id);
      expect(live.length, "준비한 센서 (대조)").toBe(f.sensors.length);
      for (const c of rules.screens_required["17"] as string[]) await expect(page.locator(`main ${sel(c)}`).first(), `C1 ${c}`).toBeAttached();
      await expect(rowsOf(page), "sensor-row = DB 센서 수").toHaveCount(live.length);
      await expect(page.locator(`main ${sel("sensor-status-badge")}`), "행마다 상태 배지").toHaveCount(live.length);
      for (const s of f.sensors) {
        const t = await rowText(page, s.name);
        expect(t, `${s.name} 상태 = ${statusLabel(s.status)}`).toContain(statusLabel(s.status));
        expect(t, `${s.name} 수량`).toContain(`${s.quantity}개`);
        if (s.location) expect(t, `${s.name} 보관 위치`).toContain(s.location);
        if (isDesk(page)) {
          for (const v of [s.type, s.maker, s.model ?? "—"]) expect(t, `${s.name} 칸 ${v}`).toContain(v);
        } else {
          expect(t, `${s.name} 캡션 (종류 · 회사 · 모델)`).toContain(expectedCaption(s));
        }
        await expect(rowNamed(page, s.name).locator(sel("sensor-status-badge")), `${s.name} 배지 글자`).toHaveText(exact(statusLabel(s.status)));
      }
      const broken = live.filter((s) => s.status === STATUS[2].db).length;
      const check = live.filter((s) => s.status === STATUS[1].db).length;
      if (isDesk(page)) {
        await expect(page.locator(sel("app-sidebar")), "C3 app-sidebar 1").toHaveCount(1);
        for (const c of rules.desktop_shell.desktop_required["17"]) await expect(page.locator(`main ${sel(c)}`).first(), `C3 desktop_required ${c}`).toBeVisible();
        const heads = await page.locator(`main ${sel("data-table")} thead th`).evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean));
        expect(heads, "표 머리 = rules sensor.list 열").toEqual(DESK_COLUMNS);
        await expect(page.locator("main"), "머리 요약 (고장 · 점검 필요)").toContainText(DESK_SUMMARY(broken, check));
        await expect(page.locator(sel("inventory-switch")), "데스크톱 inventory-switch 0 (사이드바 '센서')").toHaveCount(0);
      } else {
        await expect(page.locator("main h1"), "머리 '센서 N개'").toHaveText(exact(MOBILE_HEADING(live.length)));
        const sw = page.locator(`main ${sel("inventory-switch")}`);
        await expect(sw, "inventory-switch 1").toHaveCount(1);
        await expect(sw.locator(sel("segmented-control-active")), "inventory-switch 센서 활성").toHaveText(exact("센서"));
        const tabs = page.locator(`${sel("tab-bar")} ${sel("tab-item")}`);
        await expect(tabs, "tab-item 4").toHaveCount(rules.tab_bar.items);
        await expect(page.locator(`${sel("tab-bar")} [aria-current="page"]`), "탭바 '시약' 활성 (rules tab_bar.sensor_entry)").toHaveText(/시약/);
      }
      // 교사: 선택 · 등록 진입 1
      await expect(page.locator(`main ${sel("list-select-toggle")}`), "교사 list-select-toggle 1").toHaveCount(1);
      await expect(page.locator(`main ${sel("sensor-add")}`), "교사 sensor-add 1").toHaveCount(1);
      const addText = newFrame(`17-${info.project.name}`).find((n) => n.text && n.path.includes("sensor-add"))?.text?.characters ?? "";
      await expect(page.locator(`main ${sel("sensor-add")}`), `sensor-add 글자 = 프레임 17-${info.project.name} '${addText}'`).toHaveText(exact(addText));
      // N1-ui: 학교명 1종 = 일회용 학교
      const names = new Set((await page.locator("body").innerText()).match(new RegExp(rules.never.N1.school_name_pattern, "g")) ?? []);
      expect([...names], "화면의 학교명 = 자기 학교 1종").toEqual([f.school.name]);
      await page.screenshot({ path: `test-results/v1-17-${info.project.name}.png`, fullPage: false });
    } finally {
      await context.close();
    }
  });

  test(`[C1][S17] 검색(이름 · 모델) · 필터(rules sensor.filter: 종류 → 회사 → 상태, 같은 묶음 OR · 묶음 사이 AND) · 결과 0 = 빈 카드`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const { page, context } = await openList({ browser }, info, f.teacher);
    try {
      const live = await liveSensors(f.school.id);
      const search = page.locator("main").getByPlaceholder(SEARCH_PLACEHOLDER);
      // 모델로 검색
      const pH = f.sensors.find((s) => s.model === "GDX-PH")!;
      await search.fill("GDX-PH");
      await expect(rowsOf(page), "모델 검색 → 1행").toHaveCount(1);
      await expect(rowsOf(page).first()).toContainText(pH.name);
      // 이름 일부로 검색
      await search.fill("현미경");
      await expect(rowsOf(page), "이름 검색 → 1행").toHaveCount(live.filter((s) => s.name.includes("현미경")).length);
      await search.fill("");
      await expect(rowsOf(page), "검색 지움 → 전부").toHaveCount(live.length);

      // 필터 시트: 묶음 순서 종류 → 회사 → 상태
      const openFilter = async () => {
        await expect(async () => {
          await page.locator(`main ${sel("list-filter-button")}`).first().click({ timeout: 3_000 });
          await expect(page.getByRole("dialog", { name: "필터" })).toBeVisible({ timeout: 3_000 });
        }).toPass({ timeout: 20_000 });
        return page.getByRole("dialog", { name: "필터" });
      };
      let sheet = await openFilter();
      const groupTitles = (await sheet.locator("h3").allInnerTexts()).map((t) => t.trim());
      expect(groupTitles, "필터 묶음 순서 (rules sensor.filter)").toEqual(["종류", "회사", "상태"]);
      const statusChips = (await sheet.locator('section[aria-label="상태"] button').allInnerTexts()).map((t) => t.trim());
      expect(statusChips, "상태 칩 3개 = d7 상태 글자").toEqual(STATUS.map((s) => s.label));
      const typeChips = (await sheet.locator('section[aria-label="종류"] button').allInnerTexts()).map((t) => t.trim());
      expect(typeChips, "종류 칩 = rules sensor.types").toEqual(SENSOR.types);
      const brokenLabel = STATUS[2].label;
      const checkLabel = STATUS[1].label;
      await sheet.locator('section[aria-label="상태"] button').filter({ hasText: exact(brokenLabel) }).click();
      await sheet.locator('section[aria-label="상태"] button').filter({ hasText: exact(checkLabel) }).click();
      const wantOr = live.filter((s) => s.status === STATUS[2].db || s.status === STATUS[1].db).length;
      await sheet.getByRole("button", { name: new RegExp(`^${wantOr}개 보기$`) }).click();
      await expect(rowsOf(page), "상태 고장 OR 점검 필요").toHaveCount(wantOr);
      for (const r of await rowsOf(page).locator(sel("sensor-status-badge")).allInnerTexts()) expect([brokenLabel, checkLabel]).toContain(r.trim());
      // 묶음 사이 AND: + 종류 '온도'(정상 센서) → 0 → 빈 카드
      sheet = await openFilter();
      await sheet.locator('section[aria-label="종류"] button').filter({ hasText: exact(SENSOR.types[0]) }).click();
      await sheet.getByRole("button", { name: /^0개 보기$/ }).click();
      await expect(rowsOf(page), "종류 AND 상태 → 0").toHaveCount(0);
      await expect(page.locator(`main ${sel("ex-empty-state-card")}`), "결과 0 = ex-empty-state-card").toHaveCount(1);
      // 회사 묶음 = 학교에 있는 회사 (직접 입력 회사 포함)
      sheet = await openFilter();
      const makerChips = (await sheet.locator('section[aria-label="회사"] button').allInnerTexts()).map((t) => t.trim()).sort();
      expect(makerChips, "회사 칩 = 학교 센서의 회사").toEqual([...new Set(live.map((s) => s.maker))].sort());
    } finally {
      await context.close();
    }
  });

  test(`[C1][S17] [R-ui][S17] 상세: 행 → /sensors/{id} (모바일 화면 / 데스크톱 detail-drawer) · sensor-detail 항목 ${DETAIL_KEYS.join("·")} = DB 값 · sensor-status-badge · 교사 sensor-edit '${EDIT_LABEL}' 1 · sensor-delete 1 · variants 17.detail`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const { page, context } = await openList({ browser }, info, f.teacher);
    try {
      const s = f.sensors.find((x) => x.memo && x.model)!;
      await openDetail(page, s);
      const scope = detailScope(page);
      for (const c of rules.variants["17"].detail) await expect(scope.locator(sel(c)).first(), `variants 17.detail ${c}`).toBeVisible();
      const d = scope.locator(sel("sensor-detail"));
      await expect(d.locator("dt"), "항목 글자").toHaveText(DETAIL_KEYS);
      const row = await sensorRow(s.id);
      const created = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(String(row!.created_at)));
      const want = [s.type, s.maker, s.model!, `${s.quantity}개`, s.location!, s.memo!, created];
      await expect(d.locator("dd"), "값 = DB").toHaveText(want);
      await expect(d.locator(sel("sensor-status-badge")), "상세 배지").toHaveText(exact(statusLabel(s.status)));
      await expect(scope.locator(sel("sensor-edit")), "교사 sensor-edit 1").toHaveCount(1);
      await expect(scope.locator(sel("sensor-edit")), `'${EDIT_LABEL}'`).toContainText(EDIT_LABEL);
      await expect(scope.locator(sel("sensor-delete")), "교사 sensor-delete 1").toHaveCount(1);
      await page.screenshot({ path: `test-results/v1-17-detail-${info.project.name}.png` });
    } finally {
      await context.close();
    }
  });

  test(`[C1][S17] [R-ui][S17] 등록 폼: '${ADD_LABEL}' → sensor-form(sensor-type-select 칩 ${SENSOR.types.length} = rules types · sensor-maker-select 묶음 ${MAKER_GROUPS.map((g) => g.title).join("·")} = rules makers + 끝 '${MAKER_DIRECT}' · 검색) · 회사 직접 입력 · 상태 고장 · 저장 → 상세 + DB 1행 / 이름 없이 저장 = 행 0`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const { page, context } = await openList({ browser }, info, f.teacher);
    try {
      await expect(async () => {
        await page.locator(`main ${sel("sensor-add")} a`).first().click({ timeout: 3_000 });
        await expect(page.locator(sel("sensor-form")), "sensor-form").toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 45_000 });
      await expect(page).toHaveURL(new RegExp(`${routeOf(SCREEN)}/new`));
      const form = page.locator(sel("sensor-form"));
      for (const c of rules.variants["17"].form) await expect(page.locator(sel(c)).first(), `variants 17.form ${c}`).toBeVisible();
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-component="sensor-form"]');
        return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
      });
      // 종류 칩
      const typeChips = form.locator(`${sel("sensor-type-select")} [role="radio"]`);
      await expect(typeChips, "종류 칩 = rules types").toHaveText(SENSOR.types);
      // 이름 없이 저장 → 행 0
      const before = (await liveSensors(f.school.id)).length;
      const actions = watchActions(page);
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await page.waitForTimeout(1_500);
      expect(actions.count(), "이름 없이 저장 → 서버 요청 0").toBe(0);
      expect((await liveSensors(f.school.id)).length, "이름 없이 저장 → DB 그대로").toBe(before);
      await expect(page, "폼에 남음").toHaveURL(new RegExp(`${routeOf(SCREEN)}/new`));

      const name = `새 센서 ${f.tag}-${info.project.name.slice(0, 1)}`;
      await form.getByLabel("이름", { exact: true }).fill(name);
      await typeChips.filter({ hasText: exact(SENSOR.types[6]) }).click();
      await expect(typeChips.filter({ hasText: exact(SENSOR.types[6]) }), "고른 종류").toHaveAttribute("aria-checked", "true");
      // 회사 고르기: 묶음 · 항목 · 끝 직접 입력
      const maker = page.locator(sel("sensor-maker-select"));
      await maker.locator('button[aria-haspopup="listbox"]').click();
      const panel = maker.getByRole("dialog");
      await expect(panel, "회사 고르기 열림").toBeVisible();
      const groups = panel.getByRole("group");
      await expect(groups, "묶음 = rules makers").toHaveCount(MAKER_GROUPS.length);
      for (const [i, g] of MAKER_GROUPS.entries()) {
        await expect(groups.nth(i), `묶음 ${g.title}`).toHaveAttribute("aria-label", g.title);
        await expect(groups.nth(i).getByRole("option"), `${g.title} 항목`).toHaveText(g.makers);
      }
      const options = panel.getByRole("option");
      await expect(options.last(), `맨 끝 '${MAKER_DIRECT}'`).toHaveText(exact(MAKER_DIRECT));
      // 검색: 첫 묶음 다섯 번째 회사 이름 일부
      const target = MAKER_GROUPS[0].makers[4];
      await panel.locator("input").fill(target.slice(0, 2));
      await expect(panel.getByRole("option").filter({ hasText: exact(target) }), "검색 결과에 회사").toHaveCount(1);
      await expect(panel.getByRole("option").filter({ hasText: exact(MAKER_GROUPS[0].makers[0]) }), "다른 회사 숨김").toHaveCount(MAKER_GROUPS[0].makers[0].includes(target.slice(0, 2)) ? 1 : 0);
      await panel.locator("input").fill("");
      await panel.getByRole("option").filter({ hasText: exact(MAKER_DIRECT) }).click();
      const custom = `직접회사${f.tag}`;
      const directInput = maker.locator("input");
      await expect(directInput, "직접 입력 칸").toHaveCount(1);
      await directInput.fill(custom);
      await form.getByLabel("수량", { exact: true }).fill("5");
      await form.getByLabel("보관 위치", { exact: true }).fill("준비실 2층");
      await form.getByRole("tab", { name: STATUS[2].label, exact: true }).click();
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await expect(page, "저장 → 상세").toHaveURL(new RegExp(`${routeOf(SCREEN)}/[0-9a-f-]{36}(\\?|$)`), { timeout: 45_000 });
      const id = /\/sensors\/([0-9a-f-]{36})/.exec(page.url())![1];
      const row = await sensorRow(id);
      expect(row, "DB 새 행").not.toBeNull();
      expect(
        { school_id: row!.school_id, name: row!.name, type: row!.type, maker: row!.maker, quantity: row!.quantity, location_text: row!.location_text, status: row!.status, created_by: row!.created_by },
        "DB 값",
      ).toEqual({ school_id: f.school.id, name, type: SENSOR.types[6], maker: custom, quantity: 5, location_text: "준비실 2층", status: STATUS[2].db, created_by: f.teacher.id });
      await expect(detailScope(page).locator(sel("sensor-detail")), "상세에 새 센서").toContainText(name);
      await expect(detailScope(page).locator(`${sel("sensor-detail")} ${sel("sensor-status-badge")}`)).toHaveText(exact(STATUS[2].label));
      await page.screenshot({ path: `test-results/v1-17-form-${info.project.name}.png` });
    } finally {
      await context.close();
    }
  });

  test(`[C1][S17] [R-ui][S17] 수정: 상세 '${EDIT_LABEL}' → 폼에 지금 값 → 상태 바꿔 저장 → 상세 배지 · DB 갱신`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const s = f.sensors.find((x) => x.name.startsWith("무선 힘 센서"))!;
    const { page, context } = await openTemp(browser, info, f.teacher, detailPath(s.id));
    try {
      const scope = detailScope(page);
      await expect(scope.locator(sel("sensor-detail")), "상세").toBeVisible({ timeout: 45_000 });
      await expect(async () => {
        await scope.locator(`${sel("sensor-edit")} a, ${sel("sensor-edit")} button`).first().click({ timeout: 3_000 });
        await expect(page.locator(sel("sensor-form"))).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 45_000 });
      await expect(page).toHaveURL(new RegExp(`${routeOf(SCREEN)}/${s.id}/edit`));
      const form = page.locator(sel("sensor-form"));
      await expect(form.getByLabel("이름", { exact: true }), "지금 이름").toHaveValue(s.name);
      await expect(form.getByLabel("수량", { exact: true }), "지금 수량").toHaveValue(String(s.quantity));
      await expect(form.locator(`${sel("sensor-type-select")} [aria-checked="true"]`), "지금 종류").toHaveText(exact(s.type));
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-component="sensor-form"]');
        return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
      });
      await form.getByRole("tab", { name: STATUS[1].label, exact: true }).click();
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await expect(page, "저장 → 상세").toHaveURL(new RegExp(`${routeOf(SCREEN)}/${s.id}(\\?|$)`), { timeout: 45_000 });
      await expect(detailScope(page).locator(`${sel("sensor-detail")} ${sel("sensor-status-badge")}`), "배지 갱신").toHaveText(exact(STATUS[1].label));
      expect((await sensorRow(s.id))?.status, "DB status").toBe(STATUS[1].db);
    } finally {
      // 다음 테스트를 위해 상태 되돌리기 (일회용 학교 교사 세션 — DB 함수)
      await f.teacherClient.rpc("upsert_sensor", { p_id: s.id, p_name: s.name, p_type: s.type, p_maker: s.maker, p_quantity: s.quantity, p_status: s.status, p_model: s.model, p_location_text: s.location });
      await context.close();
    }
  });

  test(`[C1][S17] [R-ui][S17] ⋯ 삭제: '${DELETE_ITEM}' → 확인 모달("'{이름}' 센서를 삭제할까요?" · '${SENSOR_DELETE_BODY}' · '${DELETE_NOTE}') · Esc = 닫힘 + 포커스 ⋯ (d7 §25 QA 7) · '${CONFIRM}' → 목록 + 토스트 '${SINGLE_DONE}' · DB 보관 · 상세 주소 = 404 카드`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const s = f.sensors.find((x) => x.name.startsWith("디지털 현미경"))!;
    const { page, context } = await openTemp(browser, info, f.teacher, detailPath(s.id));
    try {
      const scope = detailScope(page);
      await expect(scope.locator(sel("sensor-detail"))).toBeVisible({ timeout: 45_000 });
      const more = scope.locator(`${sel("sensor-delete")} button[aria-haspopup="menu"]`);
      const openConfirm = async () => {
        await expect(async () => {
          if (!(await page.getByRole("menuitem", { name: DELETE_ITEM }).isVisible())) await more.click({ timeout: 3_000 });
          await page.getByRole("menuitem", { name: DELETE_ITEM }).click({ timeout: 3_000 });
          await expect(page.getByRole("dialog", { name: singleDeleteTitle(s.name) })).toBeVisible({ timeout: 3_000 });
        }).toPass({ timeout: 30_000 });
        return page.getByRole("dialog", { name: singleDeleteTitle(s.name) });
      };
      let dialog = await openConfirm();
      await expect(dialog, "본문").toContainText(SENSOR_DELETE_BODY);
      await expect(dialog, "muted").toContainText(DELETE_NOTE);
      await expect(dialog.locator(sel("button-outline")), "취소 = button-outline").toHaveText(exact(CANCEL));
      await expect(dialog.locator(sel("button-primary")), "삭제 = button-primary").toHaveText(exact(CONFIRM));
      await page.keyboard.press("Escape");
      await expect(dialog, "Esc → 닫힘").toHaveCount(0);
      await expect.poll(() => more.evaluate((el) => el === document.activeElement), { message: "Esc 뒤 포커스 = ⋯" }).toBe(true);
      expect((await sensorRow(s.id))?.deleted_at, "Esc → DB 그대로").toBeNull();
      dialog = await openConfirm();
      await dialog.locator(sel("button-primary")).click();
      await expect(page, "삭제 → 목록").toHaveURL(new RegExp(`${routeOf(SCREEN)}(\\?|$)`), { timeout: 45_000 });
      await expect(page.locator(sel("ex-toast")).filter({ hasText: SINGLE_DONE }), `토스트 '${SINGLE_DONE}'`).toBeVisible({ timeout: 15_000 });
      const row = await sensorRow(s.id);
      expect(row?.deleted_at, "DB 보관 deleted_at").not.toBeNull();
      expect(row?.deleted_by, "DB 보관 deleted_by = 교사").toBe(f.teacher.id);
      await expect(rowNamed(page, s.name), "목록에서 빠짐").toHaveCount(0);
      const res = await page.goto(detailPath(s.id));
      expect(res?.status(), "삭제된 센서 상세 = 404").toBe(404);
      await expect(page.getByText(NOT_FOUND[0], { exact: true }), "404 카드 제목").toBeVisible();
      await expect(page.locator(sel("sensor-detail")), "상세 없음").toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S17] [R-ui][S17] 여러 개 삭제: '${SELECT_LABEL}' → 선택 모드(행 누르면 체크 · 상세로 안 감 · select-checkbox · '${selectedText(2)}') · bulk-action-bar → 확인 모달('${bulkTitle("센서", 2)}' · 이름 · '${SENSOR_DELETE_BODY}' · '${DELETE_NOTE}') · 취소 = 그대로 · 삭제 → 토스트 '${bulkDone("센서", 2)}' · 선택 모드 끝 · DB 보관 2`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    // 이 테스트 전용 센서 2개 (다른 테스트 행을 지우지 않게)
    const extra = [
      await makeSensor(f.teacherClient, { name: `묶음삭제A ${f.tag}`, type: SENSOR.types[7], maker: MAKERS[1], model: null, quantity: 1, location: null, status: STATUS[0].db, memo: null }),
      await makeSensor(f.teacherClient, { name: `묶음삭제B ${f.tag}`, type: SENSOR.types[8], maker: MAKERS[2], model: null, quantity: 1, location: null, status: STATUS[0].db, memo: null }),
    ];
    const { page, context } = await openList({ browser }, info, f.teacher, listPath({ q: "묶음삭제" }));
    try {
      await expect(rowsOf(page), "검색 ?q=묶음삭제 → 2행").toHaveCount(2);
      await expect(page.locator(sel("bulk-action-bar")), "선택 전 bulk-action-bar 0").toHaveCount(0);
      await expect(page.locator(sel("select-checkbox")), "선택 전 select-checkbox 0").toHaveCount(0);
      const toggle = page.locator(`main ${sel("list-select-toggle")}`);
      await expect(async () => {
        await toggle.getByRole("button", { name: SELECT_LABEL, exact: true }).click({ timeout: 3_000 });
        await expect(page.locator(`main ${sel("select-checkbox")}`).first()).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      for (const c of rules.variants["17"].select.filter((c) => c !== "bulk-action-bar")) await expect(page.locator(`main ${sel(c)}`).first(), `variants 17.select ${c}`).toBeVisible();
      const url = page.url();
      // 행 누르기 → 체크 (상세로 가지 않음)
      for (const s of extra) {
        const r = rowNamed(page, s.name);
        if (isDesk(page)) await r.getByRole("button", { name: s.name }).click();
        else await r.click();
      }
      expect(page.url(), "선택 모드 행 누르기 → 주소 그대로").toBe(url);
      await expect(page.locator(sel("detail-drawer")).or(page.locator(sel("sensor-detail"))), "상세 안 열림").toHaveCount(0);
      const bar = page.locator(sel("bulk-action-bar"));
      await expect(bar, "1개 이상 → bulk-action-bar 1").toHaveCount(1);
      await expect(bar, `'${selectedText(2)}'`).toContainText(selectedText(2));
      await expect(page.locator("main"), `머리 '${selectedText(2)}'`).toContainText(selectedText(2));
      const openConfirm = async () => {
        await bar.getByRole("button", { name: CONFIRM, exact: true }).click();
        const d = page.getByRole("dialog", { name: bulkTitle("센서", 2) });
        await expect(d, "확인 모달").toBeVisible();
        return d;
      };
      let dialog = await openConfirm();
      await expect(dialog, "이름 줄").toContainText(bulkNames(extra.map((s) => s.name).sort((a, b) => a.localeCompare(b, "ko"))));
      await expect(dialog, "본문").toContainText(SENSOR_DELETE_BODY);
      await expect(dialog, "muted").toContainText(DELETE_NOTE);
      await dialog.locator(sel("button-outline")).filter({ hasText: exact(CANCEL) }).click();
      await expect(dialog, "취소 → 닫힘").toHaveCount(0);
      await expect(bar, "취소 → 선택 그대로").toContainText(selectedText(2));
      for (const s of extra) expect((await sensorRow(s.id))?.deleted_at, "취소 → DB 그대로").toBeNull();
      dialog = await openConfirm();
      await dialog.locator(sel("button-primary")).filter({ hasText: exact(CONFIRM) }).click();
      await expect(page.locator(sel("ex-toast")).filter({ hasText: bulkDone("센서", 2) }), `토스트 '${bulkDone("센서", 2)}'`).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(sel("bulk-action-bar")), "선택 모드 끝 → bar 0").toHaveCount(0);
      await expect(page.locator(`main ${sel("select-checkbox")}`), "선택 모드 끝 → 체크 0").toHaveCount(0);
      await expect(toggle.getByRole("button", { name: SELECT_LABEL, exact: true }), "다시 '선택'").toBeVisible();
      expect(new URL(page.url()).pathname, "목록 그대로").toBe(routeOf(SCREEN));
      for (const s of extra) {
        const row = await sensorRow(s.id);
        expect(row?.deleted_at, `${s.name} 보관`).not.toBeNull();
        expect(row?.deleted_by, `${s.name} deleted_by`).toBe(f.teacher.id);
        await expect(rowNamed(page, s.name), `${s.name} 목록에서 빠짐`).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  });

  test(`[R-ui][S17] 학생 보기만: 목록 · 상세에 R5(${R5.join(" · ")}) 0 · /sensors/new · /sensors/{id}/edit 에 sensor-form 0 · 쓰기 요청 0`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const { page, context } = await openList({ browser }, info, f.student);
    try {
      const actions = watchActions(page);
      await expect(rowsOf(page), "학생도 목록은 봄").toHaveCount((await liveSensors(f.school.id)).length);
      for (const c of R5) await expect(page.locator(sel(c)), `학생 목록 ${c} 0`).toHaveCount(0);
      const s = f.sensors.find((x) => x.name.startsWith("무선 pH"))!;
      await openDetail(page, s);
      for (const c of R5) await expect(page.locator(sel(c)), `학생 상세 ${c} 0`).toHaveCount(0);
      for (const p of [`${routeOf(SCREEN)}/new`, `${detailPath(s.id)}/edit`]) {
        await page.goto(p);
        await page.waitForLoadState("load");
        await expect(page.locator(sel("sensor-form")), `학생 ${p} → sensor-form 0`).toHaveCount(0);
      }
      expect(actions.count(), "학생 쓰기 요청 0").toBe(0);
    } finally {
      await context.close();
    }
  });

  for (const role of ["teacher", "student"] as const) {
    test(`[C1][S17] [R-ui][S17] 빈 상태(센서 0개, ${role === "teacher" ? "교사" : "학생"}): ex-empty-state-card '${EMPTY_TITLE}' · '${EMPTY_BODY}' + sensor-add ${role === "teacher" ? 1 : 0} · variants 17.empty`, async ({ browser }, info) => {
      test.setTimeout(TIMEOUT);
      const f = await emptyFixture(info);
      expect(await liveSensors(f.school.id), "센서 0개 학교").toHaveLength(0);
      const { page, context } = await openList({ browser }, info, f[role], listPath(), "empty");
      try {
        const card = page.locator(`main ${sel("ex-empty-state-card")}`);
        await expect(card, "빈 카드 1").toHaveCount(1);
        await expect(card, "제목").toContainText(EMPTY_TITLE);
        await expect(card, "본문").toContainText(EMPTY_BODY);
        await expect(page.locator(`main ${sel("sensor-add")}`), `sensor-add ${role === "teacher" ? 1 : 0}`).toHaveCount(role === "teacher" ? 1 : 0);
        await expect(rowsOf(page), "sensor-row 0").toHaveCount(0);
        if (role === "teacher") {
          for (const c of rules.variants["17"].empty) await expect(page.locator(`main ${sel(c)}`).first(), `variants 17.empty ${c}`).toBeVisible();
          await page.screenshot({ path: `test-results/v1-17-empty-${info.project.name}.png` });
        }
      } finally {
        await context.close();
      }
    });
  }

  test(`[N1-ui][S17] [N1-db][S17] 다른 학교 격리: 학교 B 계정 /sensors 에 일회용 학교 센서 0 · /sensors/{그 id} · /sensors/{그 id}/edit = 404 카드('${NOT_FOUND[0]}') · 일회용 교사 화면에 학교 B 센서 0`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const s = f.sensors[0];
    const b = await openAs(browser, info, "schoolB", SCREEN);
    try {
      await b.page.waitForLoadState("load");
      const text = await mainText(b.page);
      for (const x of f.sensors) expect(text, `학교 B 목록에 ${x.name} 없음`).not.toContain(x.name);
      for (const p of [detailPath(s.id), `${detailPath(s.id)}/edit`]) {
        const res = await b.page.goto(p);
        expect(res?.status(), `학교 B → ${p} = 404`).toBe(404);
        await expect(b.page.getByText(NOT_FOUND[0], { exact: true }), "404 카드").toBeVisible();
        await expect(b.page.locator(sel("sensor-detail")), "상세 0").toHaveCount(0);
        await expect(b.page.locator(sel("sensor-form")), "폼 0").toHaveCount(0);
        expect(await mainText(b.page), "다른 학교 센서 이름 노출 0").not.toContain(s.name);
      }
    } finally {
      await b.context.close();
    }
  });
});
