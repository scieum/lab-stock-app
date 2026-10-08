// 화면 4 (사용 기록 입력) 기록 흐름 C1 — 실제로 재고를 바꾸는 테스트.
//  - 학생·교사·admin 각각 ?reagent={자기 학교 시약} 에서 작은 양 기록
//    → ex-toast 표시, 화면 재고와 DB stock 이 amount 만큼 감소, usage_logs 에 자기 user_id·school_id 행 1개 추가
//  - 재고 초과 · 0 · 음수 · 숫자 아님: 에러 표시 + ex-toast 없음 + DB stock·usage_logs 불변
//  - 테스트마다 교사 계정 세션으로 stock 을 시작 값으로 원복한다.
// DB 는 각 계정의 브라우저 세션(publishable 키 + RLS)으로만 읽고 쓴다. service role 미사용.
// 시약: 프로젝트(mobile/desktop)마다 다른 칸, db 테스트가 재고를 바꾸는 칸과 겹치지 않게 (screen-4-helpers recordReagentFor).
// 같은 시약을 쓰는 테스트끼리 겹치지 않도록 이 파일은 한 워커에서 순서대로 돈다.
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserSession, countComponent, sel } from "./screen-helpers";
import {
  CARD,
  SCREEN,
  TOAST,
  amountInput,
  cardShowsStock,
  dbLogs,
  dbStock,
  mySchoolId,
  openTeacher,
  recordReagentFor,
  restoreStockAs,
  submitButton,
  usagePath,
  waitUsage,
  reagentHead,
} from "./screen-4-helpers";

test.describe.configure({ mode: "default" });

/** 기록할 작은 양 (재고를 부족 여부 경계 너머로 옮기지 않도록 1 단위) */
const AMOUNT = 1;

async function submitAmount(page: Page, value: string): Promise<void> {
  const input = amountInput(page);
  await expect(input, "사용량 입력 1개").toHaveCount(1);
  await input.fill(value);
  await expect(input).toHaveValue(value);
  // 입력이 바뀌면 이전 에러는 지워진다 — 이전 제출의 에러를 새 결과로 오인하지 않도록 확인
  await expect(page.locator('main [role="alert"]'), "입력 후 이전 에러 없음").toHaveCount(0);
  const btn = submitButton(page);
  await expect(btn, "저장 button-primary 1개").toHaveCount(1);
  await expect(btn).toBeEnabled();
  await btn.click();
}

for (const role of SCHOOL_A_ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 사용 기록 저장: ${TOAST} 표시 · 화면 재고와 DB stock ${AMOUNT} 감소 · usage_logs 자기 user_id·school_id 1행 추가 (교사 세션으로 원복)`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { school, reagent } = recordReagentFor(info);
    const t = await openTeacher(browser, info);
    let start: number | null = null;
    try {
      expect((await browserSession(t.page)).role, "원복용 교사 계정 역할").toBe(PROFILE_ROLE.teacher);
      const base = await dbStock(t.page, reagent.id);
      expect(base, `교사 세션으로 ${reagent.name} 읽힘`).not.toBeNull();
      start = base!.stock;
      expect(start, `기록할 만큼 재고가 있어야 함 (${reagent.name})`).toBeGreaterThan(AMOUNT);

      const { context, page, response } = await openAs(browser, info, role, SCREEN, usagePath(reagent.id));
      try {
        expect(response?.status(), "사용 기록 화면 응답").toBe(200);
        await waitUsage(page, true);
        const me = await browserSession(page);
        expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
        expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);
        const schoolId = await mySchoolId(page);

        const before = await dbStock(page, reagent.id);
        expect(before, "자기 세션으로 시약 읽힘").not.toBeNull();
        expect(before!.stock, "자기 세션 stock = 교사 세션 stock").toBe(start);
        const card = reagentHead(page);
        await expect(card, `${CARD} 1개`).toHaveCount(1);
        await expect(card).toContainText(reagent.name);
        expect(cardShowsStock(await card.innerText(), start!, before!.unit), `제출 전 카드 재고 ${start}${before!.unit}`).toBe(true);
        expect(await countComponent(page, TOAST), `제출 전 ${TOAST}`).toBe(0);
        const logsBefore = new Set((await dbLogs(page, reagent.id)).map((l) => l.id));

        await submitAmount(page, String(AMOUNT));

        // 저장 성공 토스트
        await expect(page.locator(sel(TOAST)), `제출 후 ${TOAST}`).toHaveCount(1, { timeout: 30_000 });
        await expect(page.locator(sel(TOAST))).toBeVisible();
        await expect(page.locator('main [role="alert"]'), "성공 시 에러 없음").toHaveCount(0);

        // 화면 재고 감소
        const expected = start! - AMOUNT;
        await expect
          .poll(async () => cardShowsStock(await card.innerText(), expected, before!.unit), {
            message: `제출 후 카드 재고 ${expected}${before!.unit}`,
            timeout: 15_000,
          })
          .toBe(true);

        // DB stock 감소
        expect((await dbStock(page, reagent.id))!.stock, `DB stock = ${start} - ${AMOUNT}`).toBe(expected);

        // usage_logs 새 행: 정확히 1개, 자기 user_id · school_id · amount
        const added = (await dbLogs(page, reagent.id)).filter((l) => !logsBefore.has(l.id));
        expect(added, "usage_logs 새 행 1개").toHaveLength(1);
        expect(added[0].user_id, "usage_logs.user_id = 자기").toBe(me.userId);
        expect(added[0].school_id, "usage_logs.school_id = 자기 학교").toBe(schoolId);
        expect(added[0].reagent_id, "usage_logs.reagent_id").toBe(reagent.id);
        expect(added[0].amount, "usage_logs.amount").toBe(AMOUNT);
      } finally {
        await context.close();
      }
    } finally {
      if (start !== null) await restoreStockAs(t.page, reagent.id, start);
      await t.context.close();
    }
  });
}

/** 잘못된 입력: 값 만들기 (재고 초과는 현재 재고 + 1) */
const INVALID: { label: string; value: (stock: number) => string }[] = [
  { label: "재고 초과", value: (s) => String(s + 1) },
  { label: "0", value: () => "0" },
  { label: "음수", value: () => `-${AMOUNT}` },
  { label: "숫자 아님", value: () => "abc" },
];

for (const role of SCHOOL_A_ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 잘못된 사용량(${INVALID.map((i) => i.label).join("·")}): 에러 표시 · ${TOAST} 없음 · DB stock·usage_logs 불변`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { reagent } = recordReagentFor(info);
    const t = await openTeacher(browser, info);
    let start: number | null = null;
    try {
      const base = await dbStock(t.page, reagent.id);
      expect(base, `교사 세션으로 ${reagent.name} 읽힘`).not.toBeNull();
      start = base!.stock;

      const { context, page } = await openAs(browser, info, role, SCREEN, usagePath(reagent.id));
      try {
        await waitUsage(page, true);
        expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
        const card = reagentHead(page);
        await expect(card, `${CARD} 1개`).toHaveCount(1);

        for (const bad of INVALID) {
          const stock = (await dbStock(page, reagent.id))!;
          expect(stock.stock, `${bad.label}: 시작 stock`).toBe(start);
          const logs = (await dbLogs(page, reagent.id)).map((l) => l.id).sort();
          const value = bad.value(stock.stock);

          await submitAmount(page, value);

          const alert = page.locator('main [role="alert"]');
          await expect(alert, `${bad.label}(${value}): 에러 표시`).toHaveCount(1, { timeout: 30_000 });
          await expect(alert).toBeVisible();
          expect((await alert.innerText()).trim().length, `${bad.label}: 에러 글자`).toBeGreaterThan(0);
          await expect(amountInput(page), `${bad.label}: 입력에 aria-invalid`).toHaveAttribute("aria-invalid", "true");
          expect(await countComponent(page, TOAST), `${bad.label}: ${TOAST} 없음`).toBe(0);

          expect((await dbStock(page, reagent.id))!.stock, `${bad.label}: DB stock 불변`).toBe(stock.stock);
          expect((await dbLogs(page, reagent.id)).map((l) => l.id).sort(), `${bad.label}: usage_logs 불변`).toEqual(logs);
          expect(cardShowsStock(await card.innerText(), stock.stock, stock.unit), `${bad.label}: 카드 재고 불변`).toBe(true);
        }
      } finally {
        await context.close();
      }
    } finally {
      if (start !== null) await restoreStockAs(t.page, reagent.id, start);
      await t.context.close();
    }
  });
}

// 기록용 시약이 db 테스트 칸과 겹치지 않고, 프로젝트끼리도 다른지 (seed 기준)
test(`[C1][S${SCREEN}] 기록 흐름 시약: 프로젝트별로 다르고 db 테스트가 재고를 바꾸는 시약과 겹치지 않음`, async ({}, info) => {
  const mine = recordReagentFor(info);
  const otherInfo = { ...info, project: { ...info.project, name: info.project.name === "mobile" ? "desktop" : "mobile" } } as typeof info;
  const theirs = recordReagentFor(otherInfo);
  expect(mine.reagent.id, "mobile·desktop 기록 시약이 다름").not.toBe(theirs.reagent.id);
});

