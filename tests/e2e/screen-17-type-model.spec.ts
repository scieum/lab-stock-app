// 화면 17 센서 종류 고르기 · 필터 묶음 · 파스코 모델 자동완성 (d7 §28 "종류 고르기·필터" · "파스코 카탈로그",
// design/rules.json 1.28 sensor.type_groups · type_select · filter · catalog, 시안 17-type · 17-filter · 17-model) — 화면 연결(D3), 두 폭.
// - 등록 폼 sensor-type-select = 고르기 칸("종류 고르기") → sensor-type-sheet(모바일 바텀시트 / 데스크톱 드롭다운): 검색 + 묶음 4줄 처음 접힘,
//   누른 묶음만 펼침(여러 개 가능), 검색 = 맞는 묶음만 펼쳐 맞는 chip 만 / 없으면 '맞는 종류가 없어요', 하나 고르면 닫힘,
//   고른 종류가 있는 묶음은 처음부터 펼침, 고른 chip = highlight-soft + highlight 테두리.
// - 필터 시트 종류 = 같은 묶음(검색 없음) · 묶음 줄 "물리 · 2개" · 고른 게 있는 묶음 처음부터 펼침.
// - 회사 = 파스코 → 모델명 sensor-model-suggest(모델번호 · 이름 검색, 최대 6줄, 맞은 글자 bold, 끝 '목록에 없어요 — 그대로 적기'),
//   고르면(클릭 · 위아래 + Enter) 모델 · 종류 · (빈) 이름 채움 + catalog-fill-note, Esc = 닫기. 다른 회사 = 후보 없음.
// 등록 폼은 읽기만 하는 학교 A 교사(저장 안 함). 필터는 일회용 학교(교사가 DB 함수로 등록한 센서).
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { routeOf, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, openTemp } from "./screen-8-helpers";
import { NO_SENSOR_RESIDUE, cleanupSensors, liveSensors, listPath, rowsOf, sensorFixture, sharedSensorSnapshot, waitSensorList, type SensorFixture } from "./sensor-helpers";
import {
  FILL_NOTE,
  HIGHLIGHT_SOFT,
  MODEL_FRAME,
  PASCO,
  R,
  SUGGEST_MAX,
  SUGGEST_RAW,
  TYPE_GROUPS,
  TYPE_NONE,
  TYPE_PLACEHOLDER,
  TYPE_SEARCH,
  exact,
  fillNoteOf,
  filterGroupLabel,
  groupOf,
  loose,
  groupRow,
  rgbOf,
  typeChip,
  typeGroup,
  typeGroups,
  typeSheet,
  visibleTypes,
} from "./d7-28-helpers";

test.describe.configure({ mode: "default" });

const SCREEN = 17;
const NEW_PATH = `${routeOf(SCREEN)}/new`;
const GROUP = "s17tm";
const HIGHLIGHT = rgbOf(R.colors.highlight.values[0]);

async function waitForm(page: Page): Promise<Locator> {
  const form = page.locator(sel("sensor-form"));
  await expect(form, "sensor-form").toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("load");
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-component="sensor-form"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
  return form;
}
const typeBox = (page: Page) => page.locator(`${sel("sensor-form")} ${sel("sensor-type-select")}`).locator("button[aria-haspopup]").first();
const modelInput = (form: Locator) => form.getByLabel(/^모델명/);
const nameInput = (form: Locator) => form.getByLabel("이름", { exact: true });
const suggest = (page: Page) => page.locator(sel("sensor-model-suggest"));
const options = (page: Page) => suggest(page).getByRole("option");

async function openTypeSheet(page: Page): Promise<Locator> {
  await expect(async () => {
    if (!(await typeSheet(page).isVisible())) await typeBox(page).click({ timeout: 3_000 });
    await expect(typeSheet(page)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  return typeSheet(page);
}

async function pickMaker(page: Page, maker: string): Promise<void> {
  const ms = page.locator(sel("sensor-maker-select"));
  await ms.locator('button[aria-haspopup="listbox"]').click();
  const panel = ms.getByRole("dialog");
  await expect(panel, "회사 고르기 열림").toBeVisible();
  await panel.getByRole("option").filter({ hasText: exact(maker) }).click();
  await expect(panel, "회사 고르면 닫힘").toHaveCount(0);
}

test(`[C1][S17] 기대값 원본: rules type_groups(${TYPE_GROUPS.map((g) => `${g.title} ${g.types.length}`).join(" · ")}) = sensor.types · catalog 최대 ${SUGGEST_MAX}줄 · 시안 17-model 후보 ${MODEL_FRAME.rows.length}줄(입력 '${MODEL_FRAME.query}')`, () => {
  expect(TYPE_GROUPS.flatMap((g) => g.types), "묶음 = 27종 (순서)").toEqual(R.sensor.types);
  expect(SUGGEST_MAX, "최대 줄").toBeGreaterThan(0);
  expect(MODEL_FRAME.rows.length, "시안 후보").toBeGreaterThan(0);
  expect(MODEL_FRAME.rows.length, "시안 후보 ≤ 최대").toBeLessThanOrEqual(SUGGEST_MAX);
  for (const r of MODEL_FRAME.rows) {
    expect(r.model.startsWith(MODEL_FRAME.query), `${r.model} 이 입력으로 시작`).toBe(true);
    expect(R.sensor.types, `${r.model} 종류 ${r.type} = 27종 중`).toContain(r.type);
  }
  expect(MODEL_FRAME.rows.map((r) => r.model), "시안 모델명 칸 값 = 후보 중").toContain(MODEL_FRAME.value);
});

test(`[C1][S17] 종류 고르기(두 폭): '${TYPE_PLACEHOLDER}' 칸 → sensor-type-sheet(390 바텀시트 / 1440 드롭다운) · '${TYPE_SEARCH}' · 묶음 ${TYPE_GROUPS.length}줄 이름+개수 처음 접힘 · 누른 묶음만 펼침(둘 동시) · 검색 = 맞는 chip 만 / '${TYPE_NONE}' · 고르면 닫힘 + 칸 값 · 다시 열면 그 묶음만 펼침 + 고른 chip highlight-soft`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN, NEW_PATH);
  try {
    const form = await waitForm(page);
    await expect(form.locator(sel("sensor-type-select")), "sensor-type-select 1").toHaveCount(1);
    await expect(form.locator(`${sel("sensor-type-select")} [role="radio"]`), "예전 chip 줄 0 (고르기 칸)").toHaveCount(0);
    await expect(typeBox(page), `빈 칸 = '${TYPE_PLACEHOLDER}'`).toHaveText(exact(TYPE_PLACEHOLDER));
    await expect(typeSheet(page), "열기 전 시트 0").toHaveCount(0);
    let sheet = await openTypeSheet(page);
    await expect(typeSheet(page), "시트 1").toHaveCount(1);
    // 자리: 390 = 화면 아래 붙은 바텀시트 / 1440 = 고르기 칸 아래 드롭다운
    const vh = page.viewportSize()!.height;
    const sb = (await sheet.boundingBox())!;
    const bb = (await typeBox(page).boundingBox())!;
    if (viewport === "mobile") {
      // 시안 17-type-mobile: 시트(위 모서리만 둥근 바텀시트)가 화면 아래 tab-bar 바로 위에 붙는다 (tab-bar 가 없으면 화면 끝)
      const tab = await page.locator(sel(rules.tab_bar.component)).first().boundingBox();
      const floor = tab ? tab.y : vh;
      expect(Math.abs(sb.y + sb.height - floor), `390 바텀시트 아래 = ${tab ? "tab-bar 위" : "화면 아래"}`).toBeLessThanOrEqual(2);
      expect(sb.width, "390 바텀시트 = 전폭").toBeGreaterThanOrEqual(page.viewportSize()!.width - 2);
    }
    else {
      expect(sb.y, "1440 드롭다운 = 칸 아래").toBeGreaterThanOrEqual(bb.y + bb.height - 1);
      expect(sb.x, "1440 드롭다운 = 칸 왼쪽 맞춤").toBeGreaterThanOrEqual(bb.x - 1);
    }
    const search = sheet.getByPlaceholder(TYPE_SEARCH);
    await expect(search, `'${TYPE_SEARCH}' 칸`).toBeVisible();
    const groups = typeGroups(sheet);
    await expect(groups, `묶음 ${TYPE_GROUPS.length}줄`).toHaveCount(TYPE_GROUPS.length);
    for (const [i, g] of TYPE_GROUPS.entries()) {
      const row = groupRow(groups.nth(i));
      await expect(row, `묶음 ${i + 1} = ${g.title} ${g.types.length}`).toHaveText(new RegExp(`^\\s*${g.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*${g.types.length}\\s*$`));
      await expect(row, `${g.title} 처음 접힘`).toHaveAttribute("aria-expanded", "false");
    }
    expect(await visibleTypes(sheet), "처음 = chip 0 (27종을 한꺼번에 펼치지 않음)").toEqual([]);
    const [phys, chem] = TYPE_GROUPS;
    await groupRow(typeGroup(sheet, chem.title)).click();
    expect(await visibleTypes(sheet), `${chem.title} 만 펼침`).toEqual(chem.types);
    await groupRow(typeGroup(sheet, phys.title)).click();
    expect(await visibleTypes(sheet), `${phys.title} + ${chem.title} 동시 펼침`).toEqual([...phys.types, ...chem.types]);
    await expect(groupRow(typeGroup(sheet, phys.title))).toHaveAttribute("aria-expanded", "true");
    await groupRow(typeGroup(sheet, phys.title)).click();
    expect(await visibleTypes(sheet), `${phys.title} 다시 접힘`).toEqual(chem.types);
    // 검색: 맞는 chip 이 있는 묶음만 · 맞는 chip 만
    const q = "온";
    const hits = R.sensor.types.filter((t) => t.includes(q));
    expect(hits.length, `'${q}' 맞는 종류 (rules)`).toBeGreaterThan(1);
    await search.fill(q);
    await expect.poll(() => visibleTypes(sheet), { message: `검색 '${q}' = 맞는 chip 만` }).toEqual(hits);
    await expect(groups, "검색 = 맞는 묶음만").toHaveCount(new Set(hits.map((t) => groupOf(t).title)).size);
    await search.fill("없는종류zz");
    await expect(sheet.getByText(TYPE_NONE, { exact: true }), `'${TYPE_NONE}'`).toBeVisible();
    expect(await visibleTypes(sheet), "맞는 것 없음 → chip 0").toEqual([]);
    await search.fill("");
    // 고르기 → 닫힘 + 칸 값
    const target = chem.types.find((t) => t === "편광") ?? chem.types[5];
    if ((await typeChip(sheet, target).count()) === 0) await groupRow(typeGroup(sheet, chem.title)).click();
    await typeChip(sheet, target).click();
    await expect(typeSheet(page), "하나 고르면 닫힘").toHaveCount(0);
    await expect(typeBox(page), `칸 값 = ${target}`).toHaveText(exact(target));
    // 다시 열기 → 고른 종류의 묶음만 처음부터 펼침 · 고른 chip 색
    sheet = await openTypeSheet(page);
    for (const g of TYPE_GROUPS) await expect(groupRow(typeGroup(sheet, g.title)), `${g.title} ${g === chem ? "펼침" : "접힘"}`).toHaveAttribute("aria-expanded", g === chem ? "true" : "false");
    expect(await visibleTypes(sheet), "고른 묶음 chip 만").toEqual(chem.types);
    const chip = typeChip(sheet, target);
    expect(await chip.evaluate((e) => getComputedStyle(e).backgroundColor), "고른 chip = highlight-soft").toBe(HIGHLIGHT_SOFT);
    expect(await chip.evaluate((e) => getComputedStyle(e).borderTopColor), "고른 chip 테두리 = highlight").toBe(HIGHLIGHT);
    await page.screenshot({ path: `test-results/v1-17-type-${viewport}.png` });
  } finally {
    await context.close();
  }
});

test(`[C1][S17] 파스코 모델 자동완성(두 폭): 회사 '${PASCO}' → 모델명 '${MODEL_FRAME.query}' = 시안 17-model 후보(모델번호 + '이름 · 종류', 맞은 글자 bold) · 끝 '${SUGGEST_RAW}' · 최대 ${SUGGEST_MAX}줄 · 클릭 = 모델·종류·(빈) 이름 채움 + '${FILL_NOTE}' · 위아래+Enter = 그 후보(이름 있으면 종류만 — '${fillNoteOf(["종류"])}') · Esc = 닫힘 · 다른 회사 = 후보 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN, NEW_PATH);
  try {
    const form = await waitForm(page);
    await expect(nameInput(form), "이름 처음 빔").toHaveValue("");
    await pickMaker(page, PASCO);
    const model = modelInput(form);
    await model.click();
    await model.fill(MODEL_FRAME.query);
    await expect(suggest(page), "sensor-model-suggest 1").toHaveCount(1);
    await expect(suggest(page)).toBeVisible();
    const n = await options(page).count();
    expect(n, `후보 ≤ ${SUGGEST_MAX}`).toBeLessThanOrEqual(SUGGEST_MAX);
    expect(n, `후보 ≥ 시안 ${MODEL_FRAME.rows.length}`).toBeGreaterThanOrEqual(MODEL_FRAME.rows.length);
    for (const r of MODEL_FRAME.rows) {
      const o = options(page).filter({ hasText: new RegExp(`^\\s*${r.model}`) });
      await expect(o, `후보 ${r.model}`).toHaveCount(1);
      await expect(o, `${r.model} caption '${r.caption}'`).toContainText(r.caption);
    }
    // 맞은 글자 bold (입력과 같은 앞부분)
    const weight = await options(page)
      .first()
      .evaluate((el, q) => {
        const hit = Array.from(el.querySelectorAll("*")).find((e) => e.children.length === 0 && (e as HTMLElement).innerText === q);
        return hit ? Number(getComputedStyle(hit).fontWeight) : 0;
      }, MODEL_FRAME.query);
    expect(weight, `맞은 글자 '${MODEL_FRAME.query}' bold`).toBeGreaterThanOrEqual(700);
    await expect(suggest(page).getByText(SUGGEST_RAW, { exact: true }), `끝 '${SUGGEST_RAW}'`).toBeVisible();
    // 클릭으로 고르기 (시안 17-model: 모델명 칸 = PS-3215 → 이름 · 종류 채움)
    const want = MODEL_FRAME.rows.find((r) => r.model === MODEL_FRAME.value)!;
    await options(page).filter({ hasText: new RegExp(`^\\s*${want.model}`) }).click();
    await expect(suggest(page), "고르면 닫힘").toHaveCount(0);
    await expect(model, "모델명 = 모델번호").toHaveValue(want.model);
    await expect(typeBox(page), `종류 = ${want.type}`).toHaveText(exact(want.type));
    await expect(nameInput(form), `빈 이름 = ${want.nameKo}`).toHaveValue(want.nameKo);
    const note = page.locator(sel("catalog-fill-note"));
    await expect(note, "catalog-fill-note 1").toHaveCount(1);
    await expect(note, `'${FILL_NOTE}'`).toHaveText(exact(FILL_NOTE));
    await page.screenshot({ path: `test-results/v1-17-model-${viewport}.png` });

    // 최대 줄: 앞 글자만 → 알려진 카탈로그 모델(시안 + rules 따옴표) 이 최대보다 많으면 정확히 최대
    const prefix = MODEL_FRAME.query.slice(0, 4);
    const known = new Set([...MODEL_FRAME.rows.map((r) => r.model), ...[...R.sensor.catalog.suggest.matchAll(/'(PS-\d+)'/g), ...R.sensor.list.matchAll(/(PS-\d+)/g)].map((m) => m[1])]);
    const knownHits = [...known].filter((m) => m.startsWith(prefix));
    await model.fill(prefix);
    await expect(suggest(page)).toBeVisible();
    if (knownHits.length > SUGGEST_MAX) await expect(options(page), `'${prefix}' → 최대 ${SUGGEST_MAX}줄`).toHaveCount(SUGGEST_MAX);
    else expect(await options(page).count(), `'${prefix}' → ≤ ${SUGGEST_MAX}`).toBeLessThanOrEqual(SUGGEST_MAX);

    // 키보드: 아래 2번 → 둘째 후보 가리킴 → Enter = 고르기 (폼 제출 아님). 이름이 있으면 이름은 그대로, 종류만
    await model.fill(MODEL_FRAME.query);
    await expect(suggest(page)).toBeVisible();
    const second = options(page).nth(1);
    const secondText = (await second.innerText()).replace(/\s+/g, " ").trim();
    const secondModel = MODEL_FRAME.rows.map((r) => r.model).find((m) => secondText.startsWith(m)) ?? secondText.split(" ")[0];
    const secondRow = MODEL_FRAME.rows.find((r) => r.model === secondModel);
    await model.press("ArrowDown");
    await model.press("ArrowDown");
    const secondId = await second.getAttribute("id");
    expect(secondId, "후보 id").toBeTruthy();
    await expect(model, "가리킨 후보 = 둘째 (aria-activedescendant)").toHaveAttribute("aria-activedescendant", secondId!);
    await model.press("Enter");
    await expect(suggest(page), "Enter → 닫힘").toHaveCount(0);
    await expect(page, "Enter = 폼 제출 아님").toHaveURL(new RegExp(`${NEW_PATH}$`));
    await expect(model, `모델명 = ${secondModel}`).toHaveValue(secondModel);
    if (secondRow) await expect(typeBox(page), `종류 = ${secondRow.type}`).toHaveText(exact(secondRow.type));
    await expect(nameInput(form), "이름이 있으면 그대로").toHaveValue(want.nameKo);
    await expect(note, `'${fillNoteOf(["종류"])}'`).toHaveText(exact(fillNoteOf(["종류"])));

    // Esc = 목록만 닫힘
    await model.fill(prefix);
    await expect(suggest(page)).toBeVisible();
    await model.press("Escape");
    await expect(suggest(page), "Esc → 닫힘").toHaveCount(0);
    await expect(page, "Esc → 폼 그대로").toHaveURL(new RegExp(`${NEW_PATH}$`));
    await expect(form, "폼 그대로").toBeVisible();

    // 다른 회사 = 후보 없음
    const other = (rules as unknown as { sensor: { makers: Record<string, string[] | string> } }).sensor.makers["센서"];
    await pickMaker(page, (other as string[]).find((m) => m !== PASCO)!);
    await model.fill(MODEL_FRAME.query);
    await page.waitForTimeout(500);
    await expect(suggest(page), "다른 회사 → 후보 0").toHaveCount(0);
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------- 필터 묶음 (일회용 학교)

let fx: Promise<SensorFixture> | null = null;
function fixture(info: TestInfo): Promise<SensorFixture> {
  fx ??= sensorFixture(info, GROUP, true);
  fx.catch(() => (fx = null));
  return fx;
}
let sharedBefore: string[] | null = null;
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (HAS_SERVICE) sharedBefore = await sharedSensorSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fx = null;
  expect(await cleanupSensors(GROUP, info.project.name), "일회용 계정·학교·센서 잔여물").toEqual(NO_SENSOR_RESIDUE);
  if (sharedBefore) expect(await sharedSensorSnapshot(), "학교 A·B·데모 센서 그대로").toEqual(sharedBefore);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음");

  test(`[C1][S17] 필터 종류 묶음(두 폭): 묶음 ${TYPE_GROUPS.length}줄 처음 접힘 · 검색 칸 없음 · chip 여러 개 → 묶음 줄 '${filterGroupLabel(TYPE_GROUPS[0].title, 2)}' · 고른 chip highlight-soft · 'N개 보기' = DB · 다시 열면 그 묶음만 펼침`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const f = await fixture(info);
    const { page, context, viewport } = await openTemp(browser, info, f.teacher, listPath());
    try {
      await waitSensorList(page);
      const live = await liveSensors(f.school.id);
      const openFilter = async () => {
        await expect(async () => {
          await page.locator(`main ${sel("list-filter-button")}`).first().click({ timeout: 3_000 });
          await expect(page.getByRole("dialog", { name: "필터" })).toBeVisible({ timeout: 3_000 });
        }).toPass({ timeout: 20_000 });
        return page.getByRole("dialog", { name: "필터" });
      };
      let sheet = await openFilter();
      const typeSec = sheet.locator('section[aria-label="종류"]');
      const groups = typeGroups(typeSec);
      await expect(groups, `종류 묶음 ${TYPE_GROUPS.length}줄`).toHaveCount(TYPE_GROUPS.length);
      await expect(typeSec.locator("input"), "필터 종류 = 검색 없음").toHaveCount(0);
      for (const [i, g] of TYPE_GROUPS.entries()) {
        await expect(groupRow(groups.nth(i)), `${g.title} 처음 접힘 · 개수 없음`).toHaveText(exact(g.title));
        await expect(groupRow(groups.nth(i))).toHaveAttribute("aria-expanded", "false");
      }
      expect(await visibleTypes(typeSec), "처음 = chip 0").toEqual([]);
      const phys = TYPE_GROUPS[0];
      const picks = live.map((s) => s.type).filter((t, i, a) => phys.types.includes(t) && a.indexOf(t) === i).slice(0, 2);
      expect(picks.length, "일회용 학교에 물리 종류 센서 2종").toBe(2);
      await groupRow(typeGroup(typeSec, phys.title)).click();
      expect(await visibleTypes(typeSec), `${phys.title} 펼침`).toEqual(phys.types);
      for (const t of picks) await typeChip(typeSec, t).click();
      await expect(groupRow(typeGroup(typeSec, phys.title)), `묶음 줄 '${filterGroupLabel(phys.title, 2)}'`).toHaveText(loose(filterGroupLabel(phys.title, 2)));
      for (const t of picks) expect(await typeChip(typeSec, t).evaluate((e) => getComputedStyle(e).backgroundColor), `${t} 고름 = highlight-soft`).toBe(HIGHLIGHT_SOFT);
      const want = live.filter((s) => picks.includes(s.type)).length;
      await sheet.getByRole("button", { name: new RegExp(`^${want}개 보기$`) }).click();
      await expect(rowsOf(page), `종류 ${picks.join("·")} → ${want}행`).toHaveCount(want);
      sheet = await openFilter();
      const typeSec2 = sheet.locator('section[aria-label="종류"]');
      for (const g of TYPE_GROUPS) {
        await expect(groupRow(typeGroup(typeSec2, g.title)), `${g.title} ${g === phys ? "펼침" : "접힘"}`).toHaveAttribute("aria-expanded", g === phys ? "true" : "false");
      }
      await expect(groupRow(typeGroup(typeSec2, phys.title)), "다시 열어도 '· 2개'").toHaveText(loose(filterGroupLabel(phys.title, 2)));
      await page.screenshot({ path: `test-results/v1-17-filter-${viewport}.png` });
    } finally {
      await context.close();
    }
  });
});
