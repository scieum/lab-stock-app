// 화면 7 (입고·시약 등록) 새 컴포넌트의 컴포넌트 수준 동작 — 갤러리(/gallery, 비로그인 공개) 대상.
// 기준: 디자인 s2-spec "## 화면 7" (stock-intake · reagent-register · ex-empty-state-card), harness/d7-data.md §6.
// 기대값: 종류 = design/rules.json cabinet.storage_classes. 프리셋(1·5·10)·단위(병·mL·g)·문구는 rules.json 에 없어
//         위 명세 문장에서 그대로 옮긴 상수다 (구현에서 읽지 않는다).
// 태그: [K1] 은 dev-rules test_rules 에 없으므로 judge 의 규칙별 e2e 집계에 섞이지 않는다. [S7] 로 화면 7 실행에 포함된다.
// /intake 화면(D3)·DB(D2) 검사는 여기서 하지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const SCREEN = 7;
const GALLERY = "/gallery";

type Rules = { cabinet: { storage_classes: string[] } };
type Dev = { components: Record<string, number[]> };
const rules = JSON.parse(readFileSync(join(process.cwd(), "design/rules.json"), "utf8")) as Rules;
const dev = JSON.parse(readFileSync(join(process.cwd(), "harness/dev-rules.json"), "utf8")) as Dev;

// s2-spec 화면 7 문장 그대로
const QUANTITY_HINT = "1 이상 입력하세요";
const PRESETS = [1, 5, 10];
const SEARCH_PLACEHOLDER = "시약명 검색";
const EMPTY_TITLE = "찾는 시약이 없어요";
const EMPTY_BODY = "시약명을 확인하거나 새로 등록하세요";
const EMPTY_ACTION = "새 시약 등록";
const INTAKE_BUTTON = "입고";
const REGISTER_BUTTON = "시약 등록";
const REGISTER_REQUIRED = ["시약명", "종류", "재고량", "입고일"];
const REGISTER_OPTIONAL = ["MSDS 연결 주소"];
// d7-data.md §6 단위
const UNITS = ["병", "mL", "g"];

const sel = (name: string) => `[data-component="${name}"]`;
const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

async function open(page: Page): Promise<void> {
  const res = await page.goto(GALLERY, { waitUntil: "networkidle" });
  expect(res?.status(), "갤러리 응답").toBe(200);
}

/** 갤러리의 stock-intake (시약 1개가 이미 선택된 상태로 놓여 있어야 수량 행을 볼 수 있다) */
async function intakeOf(page: Page): Promise<Locator> {
  const intake = page.locator(sel("stock-intake"));
  await expect(intake, "갤러리 stock-intake").toHaveCount(1);
  return intake;
}

const quantityInput = (intake: Locator) => intake.getByRole("textbox", { name: "입고 수량" });
const intakeButton = (intake: Locator) => intake.locator(sel("button-primary")).filter({ hasText: exact(INTAKE_BUTTON) });
const chip = (intake: Locator, n: number) => intake.locator(sel("button-pill-soft")).filter({ hasText: exact(String(n)) });

/** "현재 N단위 → 입고 후 M단위" 미리보기에서 N·M 을 읽는다 */
async function readPreview(intake: Locator): Promise<{ current: number; after: number; unitNow: string; unitAfter: string }> {
  const text = (await intake.innerText()).replace(/\s+/g, " ");
  const m = /현재\s*([\d.,]+)\s*([^\s→\d]+)\s*→\s*입고 후\s*([\d.,]+)\s*([^\s\d]+)/.exec(text);
  expect(m, `"현재 N → 입고 후 M" 미리보기 문구 (실제 텍스트: ${text.slice(0, 200)})`).not.toBeNull();
  const num = (s: string) => Number(s.replace(/,/g, ""));
  return { current: num(m![1]), unitNow: m![2], after: num(m![3]), unitAfter: m![4] };
}

async function setQuantity(intake: Locator, value: string): Promise<void> {
  const input = quantityInput(intake);
  await input.fill(value);
  await expect(input).toHaveValue(value);
}

// ---------- 갤러리 등장 (K1 의 DOM 판) ----------
test(`[K1][S${SCREEN}] 갤러리 DOM 에 dev-rules components 중 화면 ${SCREEN} 컴포넌트가 각각 1개 이상`, async ({ page }) => {
  const names = Object.entries(dev.components)
    .filter(([, screens]) => screens.includes(SCREEN))
    .map(([n]) => n);
  expect(names.length, `dev-rules components 에 화면 ${SCREEN} 컴포넌트`).toBeGreaterThan(0);
  for (const n of ["stock-intake", "reagent-register", "ex-empty-state-card"]) {
    expect(names, `dev-rules components 화면 ${SCREEN} 에 ${n}`).toContain(n);
  }
  await open(page);
  for (const n of names) {
    expect(await page.locator(sel(n)).count(), `갤러리 ${n}`).toBeGreaterThanOrEqual(1);
  }
});

// ---------- stock-intake ----------
test.describe("stock-intake", () => {
  test(`[K1][S${SCREEN}] stock-intake 구성: 검색 바 · 결과 reagent-row · 스테퍼(−·수량·+) · 프리셋 칩 · 입고일 · "${INTAKE_BUTTON}" 버튼`, async ({ page }) => {
    await open(page);
    const intake = await intakeOf(page);
    await expect(intake.getByPlaceholder(SEARCH_PLACEHOLDER), "검색 바").toHaveCount(1);
    expect(await intake.locator(sel("reagent-row")).count(), "검색 결과 reagent-row").toBeGreaterThanOrEqual(1);
    await expect(quantityInput(intake), "수량 칸").toHaveCount(1);
    await expect(intake.getByText("입고 수량", { exact: true }), "라벨 입고 수량").toBeVisible();
    await expect(intake.locator(sel("button-outline")).filter({ hasText: exact("−") }), "스테퍼 −").toHaveCount(1);
    await expect(intake.locator(sel("button-outline")).filter({ hasText: exact("+") }), "스테퍼 +").toHaveCount(1);
    for (const p of PRESETS) await expect(chip(intake, p), `프리셋 칩 ${p}`).toHaveCount(1);
    await expect(intake.getByLabel("입고일", { exact: true }), "입고일 입력").toHaveCount(1);
    await expect(intake.getByLabel("입고일", { exact: true }), "입고일 기본값(오늘 날짜)이 채워져 있음").not.toHaveValue("");
    await expect(intakeButton(intake), "입고 버튼").toHaveCount(1);
  });

  for (const [label, value] of [
    ["빈 값", ""],
    ["0", "0"],
    ["음수", "-1"],
  ] as const) {
    test(`[K1][S${SCREEN}] stock-intake 수량 ${label} → "${QUANTITY_HINT}" 안내 + "${INTAKE_BUTTON}" 버튼 비활성`, async ({ page }) => {
      await open(page);
      const intake = await intakeOf(page);
      // 먼저 유효한 값에서는 안내가 없고 버튼이 켜져 있어야 한다 (항상 비활성인 구현을 걸러 낸다)
      await setQuantity(intake, "3");
      await expect(intake.getByText(QUANTITY_HINT), "유효한 수량에서는 안내 없음").toHaveCount(0);
      await expect(intakeButton(intake), "유효한 수량에서는 입고 버튼 활성").toBeEnabled();

      await setQuantity(intake, value);
      await expect(intake.getByText(QUANTITY_HINT), `수량 ${label} 안내`).toBeVisible();
      await expect(intakeButton(intake), `수량 ${label} 에서 입고 버튼`).toBeDisabled();
    });
  }

  test(`[K1][S${SCREEN}] stock-intake 수량 0 이면 스테퍼 "−" 비활성, 1 이상이면 활성`, async ({ page }) => {
    await open(page);
    const intake = await intakeOf(page);
    const minus = intake.locator(sel("button-outline")).filter({ hasText: exact("−") });
    await setQuantity(intake, "0");
    await expect(minus).toBeDisabled();
    await setQuantity(intake, "2");
    await expect(minus).toBeEnabled();
  });

  test(`[K1][S${SCREEN}] stock-intake 스테퍼 + / − 가 수량을 1씩 바꾼다`, async ({ page }) => {
    await open(page);
    const intake = await intakeOf(page);
    await setQuantity(intake, "2");
    await intake.locator(sel("button-outline")).filter({ hasText: exact("+") }).click();
    await expect(quantityInput(intake)).toHaveValue("3");
    await intake.locator(sel("button-outline")).filter({ hasText: exact("−") }).click();
    await intake.locator(sel("button-outline")).filter({ hasText: exact("−") }).click();
    await expect(quantityInput(intake)).toHaveValue("1");
  });

  test(`[K1][S${SCREEN}] stock-intake 프리셋 칩 ${PRESETS.join("·")} 을 누르면 수량 칸에 그 값이 들어간다`, async ({ page }) => {
    await open(page);
    const intake = await intakeOf(page);
    await setQuantity(intake, "");
    for (const p of PRESETS) {
      await chip(intake, p).click();
      await expect(quantityInput(intake), `칩 ${p} → 수량`).toHaveValue(String(p));
      await expect(intake.getByText(QUANTITY_HINT), `칩 ${p} 뒤 안내 없음`).toHaveCount(0);
      await expect(intakeButton(intake), `칩 ${p} 뒤 입고 버튼`).toBeEnabled();
    }
  });

  test(`[K1][S${SCREEN}] stock-intake 미리보기 "현재 N → 입고 후 M": M = N + 수량, 단위 동일`, async ({ page }) => {
    await open(page);
    const intake = await intakeOf(page);
    for (const q of [...PRESETS, 7]) {
      await setQuantity(intake, String(q));
      await expect
        .poll(async () => {
          const p = await readPreview(intake);
          return p.after - p.current;
        }, { message: `수량 ${q} 일 때 입고 후 − 현재` })
        .toBe(q);
      const p = await readPreview(intake);
      expect(p.unitAfter, "미리보기 앞뒤 단위").toBe(p.unitNow);
      expect(UNITS, "미리보기 단위는 병·mL·g 중 하나").toContain(p.unitNow);
    }
  });

  test(`[K1][S${SCREEN}] stock-intake 검색 0건 → 검색 바 유지 + ex-empty-state-card 1개("${EMPTY_TITLE}") + button-pill-soft "${EMPTY_ACTION}"`, async ({ page }) => {
    await open(page);
    const intake = await intakeOf(page);
    const search = intake.getByPlaceholder(SEARCH_PLACEHOLDER);
    await expect(intake.locator(sel("ex-empty-state-card")), "결과가 있을 때는 빈 상태 카드 없음").toHaveCount(0);

    const nothing = "zz-없는-시약-zz";
    await search.fill(nothing);
    await expect(search, "검색 바 유지").toHaveValue(nothing);
    const card = intake.locator(sel("ex-empty-state-card"));
    await expect(card, "검색 0건 빈 상태 카드").toHaveCount(1);
    await expect(intake.locator(sel("reagent-row")), "검색 0건 결과 행").toHaveCount(0);
    await expect(card.getByText(EMPTY_TITLE, { exact: true })).toBeVisible();
    await expect(card.getByText(EMPTY_BODY, { exact: true })).toBeVisible();
    await expect(
      card.locator(sel("button-pill-soft")).filter({ hasText: exact(EMPTY_ACTION) }),
      `빈 상태 카드 안 "${EMPTY_ACTION}" 버튼`,
    ).toHaveCount(1);
  });
});

// ---------- ex-empty-state-card (단독) ----------
test(`[K1][S${SCREEN}] ex-empty-state-card 단독: 제목 "${EMPTY_TITLE}" + 보조 문구 + button-pill-soft "${EMPTY_ACTION}"`, async ({ page }) => {
  await open(page);
  const card = page.locator(sel("ex-empty-state-card")).filter({ hasText: EMPTY_TITLE }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText(EMPTY_BODY, { exact: true })).toBeVisible();
  await expect(card.locator(sel("button-pill-soft")).filter({ hasText: exact(EMPTY_ACTION) })).toHaveCount(1);
});

// ---------- reagent-register ----------
test.describe("reagent-register", () => {
  async function registerOf(page: Page): Promise<Locator> {
    const reg = page.locator(sel("reagent-register"));
    await expect(reg, "갤러리 reagent-register").toHaveCount(1);
    return reg;
  }
  const submit = (reg: Locator) => reg.locator(sel("button-primary")).filter({ hasText: exact(REGISTER_BUTTON) });
  const kind = (reg: Locator) => reg.getByRole("button", { name: "종류" });

  async function chooseKind(page: Page, reg: Locator, value: string): Promise<void> {
    await kind(reg).click();
    await reg.getByRole("option", { name: value, exact: true }).click();
    await expect(kind(reg)).toContainText(value);
  }

  test(`[K1][S${SCREEN}] reagent-register 구성: ${[...REGISTER_REQUIRED, ...REGISTER_OPTIONAL].join(" · ")} + "${REGISTER_BUTTON}", "필수" 표시 = 필수 항목 수`, async ({ page }) => {
    await open(page);
    const reg = await registerOf(page);
    for (const label of [...REGISTER_REQUIRED, ...REGISTER_OPTIONAL]) {
      await expect(reg.getByText(label, { exact: true }), `라벨 ${label}`).toBeVisible();
    }
    await expect(reg.getByText("필수", { exact: true }), "필수 caption 수").toHaveCount(REGISTER_REQUIRED.length);
    await expect(submit(reg)).toHaveCount(1);
    await expect(reg.getByLabel("입고일", { exact: true }), "입고일 기본값(오늘 날짜)").not.toHaveValue("");
  });

  test(`[K1][S${SCREEN}] reagent-register 종류 목록 = rules.json cabinet.storage_classes (${rules.cabinet.storage_classes.length}종, 순서 포함)`, async ({ page }) => {
    const expected = rules.cabinet.storage_classes;
    expect(expected.length, "rules.json cabinet.storage_classes").toBeGreaterThan(0);
    await open(page);
    const reg = await registerOf(page);
    await kind(reg).click();
    const options = reg.getByRole("option");
    await expect(options).toHaveCount(expected.length);
    expect((await options.allInnerTexts()).map((t) => t.trim())).toEqual(expected);
  });

  test(`[K1][S${SCREEN}] reagent-register 단위 선택지 = ${UNITS.join("·")}, 고르면 재고량 suffix 에 반영`, async ({ page }) => {
    await open(page);
    const reg = await registerOf(page);
    const chips = reg.locator(sel("button-pill-soft"));
    await expect(chips).toHaveCount(UNITS.length);
    expect((await chips.allInnerTexts()).map((t) => t.trim())).toEqual(UNITS);
    const stockField = reg.locator(sel("text-input")).filter({ hasText: "재고량" });
    await expect(stockField).toHaveCount(1);
    for (const u of [...UNITS].reverse()) {
      await chips.filter({ hasText: exact(u) }).click();
      await expect(stockField.getByText(u, { exact: true }), `재고량 suffix ${u}`).toBeVisible();
    }
  });

  test(`[K1][S${SCREEN}] reagent-register 필수 항목(${REGISTER_REQUIRED.join("·")})이 하나라도 비면 "${REGISTER_BUTTON}" 비활성, 다 차면 활성`, async ({ page }) => {
    await open(page);
    const reg = await registerOf(page);
    const name = reg.getByLabel("시약명", { exact: true });
    const stock = reg.getByLabel("재고량", { exact: true });
    const date = reg.getByLabel("입고일", { exact: true });

    await expect(submit(reg), "처음(시약명·종류·재고량 빈 상태)").toBeDisabled();

    // 종류만 빈 상태
    await name.fill("염화나트륨");
    await stock.fill("2");
    const today = await date.inputValue();
    expect(today, "입고일 기본값").toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(submit(reg), "종류만 빈 상태").toBeDisabled();

    // 전부 채움
    await chooseKind(page, reg, rules.cabinet.storage_classes[0]);
    await expect(submit(reg), "필수 항목 전부 채움").toBeEnabled();

    // 시약명만 비움 (공백만 있는 값 포함)
    for (const blank of ["", "   "]) {
      await name.fill(blank);
      await expect(submit(reg), `시약명 "${blank}"`).toBeDisabled();
    }
    await name.fill("염화나트륨");
    await expect(submit(reg)).toBeEnabled();

    // 재고량만 비움
    await stock.fill("");
    await expect(submit(reg), "재고량 빈 값").toBeDisabled();
    await stock.fill("2");
    await expect(submit(reg)).toBeEnabled();

    // 입고일만 비움
    await date.fill("");
    await expect(submit(reg), "입고일 빈 값").toBeDisabled();
    await date.fill(today);
    await expect(submit(reg)).toBeEnabled();
  });

  test(`[K1][S${SCREEN}] reagent-register MSDS 연결 주소는 선택 항목 (비워도 "${REGISTER_BUTTON}" 활성)`, async ({ page }) => {
    await open(page);
    const reg = await registerOf(page);
    await reg.getByLabel("시약명", { exact: true }).fill("염화나트륨");
    await reg.getByLabel("재고량", { exact: true }).fill("2");
    await chooseKind(page, reg, rules.cabinet.storage_classes[rules.cabinet.storage_classes.length - 1]);
    await expect(reg.getByLabel("MSDS 연결 주소", { exact: true })).toHaveValue("");
    await expect(submit(reg)).toBeEnabled();
  });
});
