// 화면 7 (입고·시약 등록) 저장 흐름 C1 — 실제로 DB 를 바꾸는 테스트.
// 기준: harness/d7-data.md §6 (record_intake · register_reagent · 저장 후 ex-toast → 화면 2 · 시안에 없는 값),
//       디자인 s2-spec 화면 7 ex-toast ("입고를 기록했어요" / "시약을 등록했어요", 이후 화면 2).
// 운영 DB 주의:
//  - 테스트 학교 A 에서만 저장한다. 입고는 seed 시약이 아니라 이 테스트가 만든 임시 시약(이름 `S7-ui-test-{project}-…`)에만 한다
//    → seed 시약 stock 을 건드리지 않는다. 임시 시약을 지우면 intake_logs 도 cascade 로 지워진다.
//  - 등록으로 만든 시약도 같은 접두사 이름이고 테스트 끝(finally)에 지운다. 지운 뒤 0행인지 확인한다.
// DB 는 그 계정의 브라우저 세션(publishable 키 + RLS)으로만 읽고 쓴다. service role 미사용.
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserClient, browserSession, countComponent, routeOf, sel } from "./screen-helpers";
import {
  AFTER_SAVE_SCREEN,
  DATE_LABEL,
  SCREEN,
  STORAGE_CLASSES,
  TOAST,
  TOAST_INTAKE,
  TOAST_REGISTER,
  UNITS,
  chip,
  createTempReagent,
  dbIntakeLogs,
  dbReagent,
  dbReagentsByName,
  dropTempReagents,
  expectSelected,
  fillRegister,
  intakeButton,
  intakeForm,
  intakePath,
  mySchoolId,
  quantityInput,
  readPreview,
  registerButton,
  registerForm,
  searchAndSelect,
  sweepTemp,
  tempName,
  todayDigits,
  waitIntake,
} from "./screen-7-helpers";
import { AUTO_INTAKE_PERCENT, autoFromIntake } from "./reorder-auto-helpers";

test.describe.configure({ mode: "default" });

const STAFF: Role[] = ["teacher", "admin"];
const GROUP = "save";

// 시간 초과 등으로 finally 삭제가 돌지 못한 임시 시약까지 지운다 (이 파일·이 프로젝트 것만)
test.afterAll(async ({}, info) => {
  expect(await sweepTemp(info, GROUP, ["teacher"]), "임시 시약 잔여").toBe(0);
});
const START_STOCK = 3;

/** 저장 직후: ex-toast 문구(약 1.5초만 떠 있다) → 화면 2 로 이동 */
async function expectToastThenList(page: Page, message: string): Promise<void> {
  const toast = page.locator(sel(TOAST));
  await expect(toast.filter({ hasText: message }), `${TOAST} "${message}"`).toBeVisible({ timeout: 30_000 });
  expect(await toast.count(), `${TOAST} 1개`).toBe(1);
  await page.waitForURL((u) => u.pathname === routeOf(AFTER_SAVE_SCREEN), { timeout: 30_000 });
}

function watchWrites(page: Page): string[] {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname.startsWith(routeOf(SCREEN))) posts.push(r.url());
  });
  return posts;
}

// ---------- 기존 시약 입고 ----------
for (const role of STAFF) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 기존 시약 입고 저장: ${TOAST} "${TOAST_INTAKE}" → ${routeOf(AFTER_SAVE_SCREEN)} · DB stock +수량 · intake_date = 입고일 · intake_logs 자기 user_id·school_id 1행 (임시 시약, 끝나면 삭제)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const name = tempName(info, GROUP);
    const amount = 5;
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitIntake(page, "intake");
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const schoolId = await mySchoolId(page);
      const temp = await createTempReagent(page, name, START_STOCK, UNITS[0]);
      expect(temp.school_id, "임시 시약은 자기(테스트) 학교").toBe(schoolId);
      expect(await dbIntakeLogs(page, temp.id), "입고 전 intake_logs").toHaveLength(0);

      // 새로 만든 시약이 목록에 나오도록 다시 연다 → 이름으로 검색해 선택
      await page.goto(intakePath());
      await waitIntake(page, "intake");
      await searchAndSelect(page, name, name);
      await chip(intakeForm(page), amount).click();
      await expect(quantityInput(page)).toHaveValue(String(amount));
      expect(await readPreview(page), "미리보기").toEqual({ current: START_STOCK, after: START_STOCK + amount });
      expect(await countComponent(page, TOAST), `${TOAST} 저장 전`).toBe(0);

      await expect(intakeButton(page)).toBeEnabled();
      await intakeButton(page).click();
      await expectToastThenList(page, TOAST_INTAKE);

      const after = await dbReagent(page, temp.id);
      expect(after?.stock, "DB stock = 시작 + 수량").toBe(START_STOCK + amount);
      expect((after?.intake_date ?? "").replace(/\D/g, ""), "reagents.intake_date = 입고일(오늘)").toBe(todayDigits());
      const logs = await dbIntakeLogs(page, temp.id);
      expect(logs, "intake_logs 1행").toHaveLength(1);
      expect(logs[0].amount, "intake_logs.amount").toBe(amount);
      expect(logs[0].user_id, "intake_logs.user_id = 자기").toBe(me.userId);
      expect(logs[0].school_id, "intake_logs.school_id = 자기 학교").toBe(schoolId);
      expect(logs[0].intake_date.replace(/\D/g, ""), "intake_logs.intake_date = 오늘").toBe(todayDigits());

      // 다시 열면 화면의 현재 재고가 늘어난 값
      await page.goto(intakePath({ reagent: temp.id }));
      await waitIntake(page, "intake");
      await expectSelected(page, name);
      await chip(intakeForm(page), 1).click();
      expect((await readPreview(page))?.current, "화면 현재 재고 = 입고 후 값").toBe(START_STOCK + amount);
    } finally {
      const left = await dropTempReagents(page, name).catch(() => -1);
      await context.close();
      expect(left, "임시 시약 삭제 후 남은 행").toBe(0);
    }
  });
}

test(`[C1][S${SCREEN}] ${ROLE_LABEL.teacher} 입고 중복 제출 방지: "입고" 연타(더블 클릭 + Enter)에도 저장 요청 1건 · intake_logs 1행 · stock 한 번만 증가`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const name = tempName(info, GROUP);
  const amount = 10;
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  try {
    await waitIntake(page, "intake");
    const temp = await createTempReagent(page, name, START_STOCK, UNITS[2]);
    await page.goto(intakePath({ reagent: temp.id }));
    await waitIntake(page, "intake");
    await expectSelected(page, name);
    await chip(intakeForm(page), amount).click();
    await expect(intakeButton(page)).toBeEnabled();

    const posts = watchWrites(page);
    await intakeButton(page).dblclick();
    // 저장 중·토스트 표시 중에도 다시 제출되지 않는다
    await intakeButton(page).click({ force: true, timeout: 2_000 }).catch(() => undefined);
    await quantityInput(page).press("Enter", { timeout: 2_000 }).catch(() => undefined);
    await page.waitForURL((u) => u.pathname === routeOf(AFTER_SAVE_SCREEN), { timeout: 45_000 });
    await page.waitForLoadState("load");

    expect(posts.length, `저장 요청 수 (${posts.join(", ")})`).toBe(1);
    const logs = await dbIntakeLogs(page, temp.id);
    expect(logs, "intake_logs 1행").toHaveLength(1);
    expect(logs[0].amount).toBe(amount);
    expect((await dbReagent(page, temp.id))?.stock, "stock 은 한 번만 증가").toBe(START_STOCK + amount);
  } finally {
    const left = await dropTempReagents(page, name).catch(() => -1);
    await context.close();
    expect(left, "임시 시약 삭제 후 남은 행").toBe(0);
  }
});

// ---------- 새 시약 등록 ----------
STAFF.forEach((role, i) => {
  const storageClass = STORAGE_CLASSES[(i * 3 + 1) % STORAGE_CLASSES.length];
  const unit = UNITS[(i + 1) % UNITS.length];
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 새 시약 등록 저장(종류 ${storageClass} · 단위 ${unit}): ${TOAST} "${TOAST_REGISTER}" → ${routeOf(AFTER_SAVE_SCREEN)} · reagents 자기 학교 1행(min_stock 자동 = 첫 재고 × ${AUTO_INTAKE_PERCENT}% · 근거 입고 · slot·cas 없음) · intake_logs 첫 재고 1행 · 입고 갈래 목록에 표시 (끝나면 삭제)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const name = tempName(info, GROUP);
    const stock = 7;
    const { context, page } = await openAs(browser, info, role, SCREEN, intakePath({ tab: "register" }));
    try {
      await waitIntake(page, "register");
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const schoolId = await mySchoolId(page);
      expect(await dbReagentsByName(page, name), "등록 전 같은 이름 없음").toHaveLength(0);

      await fillRegister(page, { name, storageClass, stock: String(stock), unit });
      expect(await countComponent(page, TOAST), `${TOAST} 저장 전`).toBe(0);
      await expect(registerButton(page)).toBeEnabled();
      await registerButton(page).click();
      await expectToastThenList(page, TOAST_REGISTER);

      const made = await dbReagentsByName(page, name);
      expect(made, "reagents 1행").toHaveLength(1);
      const r = made[0];
      expect(r.school_id, "school_id = 자기 학교").toBe(schoolId);
      expect(r.storage_class, "storage_class = 종류").toBe(storageClass);
      expect(r.unit, "unit").toBe(unit);
      expect(r.stock, "stock = 재고량").toBe(stock);
      // d7 §11-1: 첫 재고 입고 → 자동 기준 = 마지막 입고량 × 비율, 근거 'intake'
      expect(
        [r.min_stock, r.min_stock_source, r.min_stock_auto_basis],
        "min_stock = 첫 재고 × 입고 비율 · 출처 'auto' · 근거 'intake' (d7 §11-1)",
      ).toEqual([autoFromIntake(stock), "auto", "intake"]);
      expect(r.slot_id, "slot_id = null (d7 §6)").toBeNull();
      expect(r.cas_no, "cas_no = null (d7 §6)").toBeNull();
      expect(r.msds_url, "MSDS 주소 비움 → null").toBeNull();
      expect((r.intake_date ?? "").replace(/\D/g, ""), "intake_date = 오늘").toBe(todayDigits());
      const logs = await dbIntakeLogs(page, r.id);
      expect(logs, "첫 재고 intake_logs 1행").toHaveLength(1);
      expect(logs[0].amount, "intake_logs.amount = 재고량").toBe(stock);
      expect(logs[0].user_id, "intake_logs.user_id = 자기").toBe(me.userId);
      expect(logs[0].school_id, "intake_logs.school_id = 자기 학교").toBe(schoolId);

      // 등록한 시약이 기존 시약 입고 갈래에서 검색·선택된다
      await page.goto(intakePath());
      await waitIntake(page, "intake");
      await searchAndSelect(page, name, name);
      await chip(intakeForm(page), 1).click();
      expect((await readPreview(page))?.current, "화면 현재 재고 = 등록한 재고량").toBe(stock);
    } finally {
      const left = await dropTempReagents(page, name).catch(() => -1);
      await context.close();
      expect(left, "임시 시약 삭제 후 남은 행").toBe(0);
    }
  });
});

test(`[C1][S${SCREEN}] ${ROLE_LABEL.teacher} 등록 중복 제출 방지: "시약 등록" 연타에도 저장 요청 1건 · reagents 1행 · intake_logs 1행`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const name = tempName(info, GROUP);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN, intakePath({ tab: "register" }));
  try {
    await waitIntake(page, "register");
    await fillRegister(page, { name, storageClass: STORAGE_CLASSES[STORAGE_CLASSES.length - 1], stock: "2", unit: UNITS[0] });
    await expect(registerButton(page)).toBeEnabled();

    const posts = watchWrites(page);
    await registerButton(page).dblclick();
    await registerButton(page).click({ force: true, timeout: 2_000 }).catch(() => undefined);
    await registerForm(page).getByLabel("시약명").press("Enter", { timeout: 2_000 }).catch(() => undefined);
    await page.waitForURL((u) => u.pathname === routeOf(AFTER_SAVE_SCREEN), { timeout: 45_000 });
    await page.waitForLoadState("load");

    expect(posts.length, `저장 요청 수 (${posts.join(", ")})`).toBe(1);
    const made = await dbReagentsByName(page, name);
    expect(made, "reagents 1행 (연타에도 중복 등록 없음)").toHaveLength(1);
    expect(await dbIntakeLogs(page, made[0].id), "intake_logs 1행").toHaveLength(1);
  } finally {
    const left = await dropTempReagents(page, name).catch(() => -1);
    await context.close();
    expect(left, "임시 시약 삭제 후 남은 행").toBe(0);
  }
});

test(`[C1][S${SCREEN}] ${ROLE_LABEL.teacher} 입고일을 바꿔 저장: intake_logs.intake_date · reagents.intake_date = 고른 날짜`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const name = tempName(info, GROUP);
  const picked = "2026-09-15";
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  try {
    await waitIntake(page, "intake");
    const temp = await createTempReagent(page, name, START_STOCK, UNITS[1]);
    await page.goto(intakePath({ reagent: temp.id }));
    await waitIntake(page, "intake");
    await expectSelected(page, name);
    await chip(intakeForm(page), 1).click();
    await intakeForm(page).getByLabel(DATE_LABEL).fill(picked);
    await expect(intakeButton(page)).toBeEnabled();
    await intakeButton(page).click();
    await expectToastThenList(page, TOAST_INTAKE);

    const { client } = await browserClient(page);
    const { data } = await client.from("intake_logs").select("intake_date, amount").eq("reagent_id", temp.id);
    expect(data ?? [], "intake_logs 1행").toHaveLength(1);
    expect(data![0].intake_date, "intake_logs.intake_date").toBe(picked);
    const after = await dbReagent(page, temp.id);
    expect(after?.intake_date, "reagents.intake_date").toBe(picked);
    expect(after?.stock, "stock +1").toBe(START_STOCK + 1);
  } finally {
    const left = await dropTempReagents(page, name).catch(() => -1);
    await context.close();
    expect(left, "임시 시약 삭제 후 남은 행").toBe(0);
  }
});
