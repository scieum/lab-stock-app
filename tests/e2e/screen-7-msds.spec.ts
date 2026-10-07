// 화면 7 새 시약 등록 — MSDS 칸 옆 "MSDS 찾기" (harness/d7-data.md §20 화면 7, design/rules.json 1.18 msds · variants["7"].msds · roles R5,
// design/frames/7-msds-{mobile|desktop}). C1 · R-ui · V1.
// - 실제 안전보건공단 호출 없음: /api/msds/search 응답을 가로챈다. 가로채지 않은 요청은 이 환경(키 없음)에서 503 문구를 보인다.
// - 공용 학교 A 교사·admin 으로 폼만 채우고 저장하지 않는다 (쓰기 요청 0 — 데이터 변경 없음).
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { countComponent, rules, sel } from "./screen-helpers";
import { SCREEN, intakePath, registerForm, waitIntake } from "./screen-7-helpers";
import { watchActions } from "./screen-11-helpers";
import {
  CONFIRM,
  FIND,
  MORE_DIRECT,
  MSDS_CANDIDATES,
  MSDS_SEARCH,
  NO_KEY_TEXT,
  NO_RESULT,
  candidatesFor,
  confirmButton,
  directLink,
  exact,
  expectCandidates,
  expectNoN2Terms,
  interceptSearch,
  radios,
  readRows,
  sheet,
} from "./msds-helpers";

const V7 = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)].msds;
const MIN_H = (rules as unknown as { button: { min_height: number } }).button.min_height;

const nameInput = (page: Page) => registerForm(page).getByRole("textbox", { name: /시약명/ }).first();
const msdsInput = (page: Page) => registerForm(page).locator('input[name="msds_url"]');
const findButton = (page: Page) => registerForm(page).locator(sel(MSDS_SEARCH));

async function openRegister(browser: Parameters<typeof openAs>[0], info: Parameters<typeof openAs>[1], role: Role) {
  const r = await openAs(browser, info, role, SCREEN, intakePath({ tab: "register" }));
  await waitIntake(r.page, "register");
  return r;
}

test(`[C1][S${SCREEN}] 전제: 시안·규칙 문구 (${FIND} · ${CONFIRM} · ${NO_RESULT} · ${MORE_DIRECT}) · variants["7"].msds`, () => {
  for (const s of [FIND, CONFIRM, NO_RESULT, MORE_DIRECT, NO_KEY_TEXT]) expect(s.length).toBeGreaterThan(0);
  expect(V7).toContain(MSDS_CANDIDATES);
});

for (const role of ["teacher", "admin"] as Role[]) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 새 시약 등록: MSDS 칸 옆 msds-search "${FIND}" 1개(높이 ≥ ${MIN_H}) · 시약명이 비면 비활성 · 누르면 시약명으로 찾기 → msds-candidates(가로챈 후보, 첫 행 선택) · 다른 행 고르고 "${CONFIRM}" → 시트 닫힘 · MSDS 칸 = 고른 msdsUrl · 저장 요청 0 · N2 금지어 0`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page, viewport } = await openRegister(browser, info, role);
    const actions = watchActions(page);
    try {
      const calls = await interceptSearch(page);
      await expect(findButton(page), `${MSDS_SEARCH} 1개 (폼 안)`).toHaveCount(1);
      await expect(findButton(page)).toHaveText(exact(FIND));
      expect((await findButton(page).boundingBox())!.height, `${MSDS_SEARCH} 높이`).toBeGreaterThanOrEqual(MIN_H);
      // MSDS 칸 옆 (같은 msds-field 묶음 안)
      const ib = (await msdsInput(page).boundingBox())!;
      const bb = (await findButton(page).boundingBox())!;
      expect(Math.abs(ib.y + ib.height / 2 - (bb.y + bb.height / 2)), "MSDS 칸 옆 (세로 가운데가 맞음)").toBeLessThanOrEqual(ib.height / 2);
      expect(bb.x, "MSDS 칸 오른쪽").toBeGreaterThanOrEqual(ib.x + ib.width - 1);
      await expect(findButton(page), "시약명 비어 있음 → 비활성").toBeDisabled();
      await nameInput(page).fill("   ");
      await expect(findButton(page), "공백뿐 → 비활성").toBeDisabled();
      const NAME = "질산칼륨";
      await nameInput(page).fill(NAME);
      await expect(findButton(page), "시약명 있음 → 활성").toBeEnabled();
      expect(await countComponent(page, MSDS_CANDIDATES), "누르기 전 시트 0").toBe(0);

      await findButton(page).click();
      const s = sheet(page);
      await expect(s, MSDS_CANDIDATES).toBeVisible();
      const cands = candidatesFor(NAME);
      await expectCandidates(s, cands, "후보");
      expect(calls.queries, "검색어 = 시약명").toEqual([NAME]);
      for (const c of V7) await expect(page.locator(sel(c)).first(), `variants["7"].msds ${c} 보임`).toBeVisible();
      await expect(directLink(s, MORE_DIRECT), `후보가 있으면 "${MORE_DIRECT}"`).toHaveCount(1);
      await expectNoN2Terms(page, "후보 시트");
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-7-msds-${viewport}.png`) });

      await radios(s).nth(1).click();
      expect((await readRows(s)).map((r) => r.checked), "두 번째 행 선택").toEqual([false, true, false]);
      await confirmButton(s).click();
      await expect(s, "고르면 시트 닫힘").toHaveCount(0);
      await expect(msdsInput(page), "MSDS 칸 = 고른 후보의 주소").toHaveValue(cands[1].msdsUrl);
      await expect(nameInput(page), "시약명 그대로").toHaveValue(NAME);

      // 시약명을 지우면 다시 비활성 (MSDS 칸 값은 그대로)
      await nameInput(page).fill("");
      await expect(findButton(page)).toBeDisabled();
      await expect(msdsInput(page)).toHaveValue(cands[1].msdsUrl);
      expect(actions.count(), "저장하지 않음 — 쓰기 요청 0").toBe(0);
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S${SCREEN}] ${ROLE_LABEL.teacher} 후보 0개 → "${NO_RESULT}" → 누르면 시트 닫힘 · MSDS 주소 칸 포커스 · 직접 입력 그대로 / × 닫기 → MSDS 칸 그대로`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openRegister(browser, info, "teacher");
  const actions = watchActions(page);
  try {
    const calls = await interceptSearch(page, () => ({ body: { candidates: [] } }));
    await nameInput(page).fill("없는물질zz");
    await findButton(page).click();
    const s = sheet(page);
    await expect(s).toBeVisible();
    await expect(directLink(s, NO_RESULT), `0개 → "${NO_RESULT}"`).toBeVisible({ timeout: 15_000 });
    await expect(radios(s), "후보 행 0").toHaveCount(0);
    await expect(confirmButton(s), `"${CONFIRM}" 비활성 (고를 것 없음)`).toBeDisabled();
    expect(calls.queries).toEqual(["없는물질zz"]);
    await directLink(s, NO_RESULT).click();
    await expect(s, "직접 입력 → 시트 닫힘").toHaveCount(0);
    await expect(msdsInput(page), "MSDS 주소 칸 포커스").toBeFocused();
    await msdsInput(page).fill("https://example.test/msds.pdf");
    await expect(msdsInput(page)).toHaveValue("https://example.test/msds.pdf");

    // 다시 찾기 → × 로 닫으면 칸 값 그대로
    await findButton(page).click();
    await expect(sheet(page)).toBeVisible();
    await sheet(page).getByRole("button", { name: exact("닫기") }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(msdsInput(page), "× → 칸 값 그대로").toHaveValue("https://example.test/msds.pdf");
    expect(actions.count(), "쓰기 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] ${ROLE_LABEL.admin} 가로채지 않음(이 환경 = 키 없음) → 시트에 "${NO_KEY_TEXT}" · 후보 0 · 키·외부 주소 문구 없음 · MSDS 칸 비어 있음`, async ({ browser }, info) => {
  test.skip(Boolean(process.env.KOSHA_MSDS_API_KEY?.trim()), "키가 있는 환경 — 실제 KOSHA 호출이 되므로 키 없는 환경에서만");
  test.setTimeout(120_000);
  const { context, page } = await openRegister(browser, info, "admin");
  try {
    const calls = await interceptSearch(page, () => null);
    await nameInput(page).fill("질산 은");
    await findButton(page).click();
    const s = sheet(page);
    await expect(s.getByText(NO_KEY_TEXT), `서버 503 문구`).toBeVisible({ timeout: 15_000 });
    await expect(radios(s)).toHaveCount(0);
    expect(calls.queries).toEqual(["질산 은"]);
    await expectNoN2Terms(page, "키 없음 오류");
    await sheet(page).getByRole("button", { name: exact("닫기") }).click();
    await expect(msdsInput(page)).toHaveValue("");
  } finally {
    await context.close();
  }
});
