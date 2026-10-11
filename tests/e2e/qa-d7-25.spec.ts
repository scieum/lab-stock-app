// d7 §25 기록 추가(화면 10) + QA 수정 8가지 중 화면에서 보이는 것 — C1 · R-ui (390 · 1440).
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §25 "기록 추가 (화면 10)" · "QA 수정 (디자인 없음)" (1)(4)(5)(6)(7)(8),
//   design/rules.json 1.26 record_add(component · shape · roles · flow) · screens_required["10"] · colors.highlight.
// 쓰기(사용 기록 · 시약)는 일회용 학교에만 — 준비는 그 학교 admin · 교사 세션의 DB 함수. 공용 학교 A 는 읽기 · 거부되는 입력만.
import { test, expect, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { routeOf, rules, sel } from "./screen-helpers";
import { isDeskPage } from "./desk-helpers";
import { HAS_SERVICE, clientFor, inviteEmailInput, inviteSubmit, openInviteSheet, openTemp, service, waitUsers, watchActions } from "./screen-8-helpers";
import { highlightSoft, makeFixture, type S11Fixture } from "./screen-11-helpers";
import { addReagents, amountOf, saveButton, usagePath, waitUsage, seedOwnReagents } from "./screen-4-helpers";
import { modal, openRow, rows, waitHistory } from "./screen-10-helpers";
import { textAcrossTabs, waitDetail } from "./screen-3-helpers";
import { NO_SENSOR_RESIDUE, cleanupSensors, d7Row, daysAgoKst, exact, quotes, ymdKst } from "./sensor-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "qa25";
const TIMEOUT = 300_000;
const STORAGE = (rules as unknown as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;
const RA = (rules as unknown as { record_add: { component: string; shape: string; roles: string; flow: string } }).record_add;
const QA = d7Row("QA 수정");
const ADD_RECORD = d7Row("기록 추가 (화면 10)");
/** (4) 사용량 0 = "사용량은 0보다 커야 해요" */
const AMOUNT_POSITIVE = (/\(4\) 사용량 0 = "([^"]+)"/.exec(QA) ?? [])[1];
/** (5) 기록 상세 라벨 두 폭 모두 "기록한 날" */
const RECORDED_LABEL = (/\(5\) 기록 상세 라벨 두 폭 모두 "([^"]+)"/.exec(QA) ?? [])[1];
/** (6) 초대 이메일 오류 문구 두 폭 같게 "이메일 주소를 확인해 주세요" */
const INVITE_ERROR = (/\(6\) 초대 이메일 오류 문구 두 폭 같게 "([^"]+)"/.exec(QA) ?? [])[1];
/** (8) MSDS 없는 시약 기록 상세에 "MSDS 보기" 진입 없음 */
const MSDS_VIEW = (/\(8\) MSDS 없는 시약 기록 상세에 "([^"]+)" 진입 없음/.exec(QA) ?? [])[1];
/** record_add.shape "button-primary '기록 추가'" */
const ADD_LABEL = quotes(RA.shape)[0];
const MSDS_URL = "https://example.com/msds/qa25.pdf";

const KMD = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;
const dots = (ymd: string) => ymd.replace(/-/g, ".");

type Fx = S11Fixture & { withMsds: { id: string; name: string }; noMsds: { id: string; name: string }; usedOnOld: string };
let fx: Promise<Fx> | null = null;
function fixture(info: TestInfo): Promise<Fx> {
  fx ??= (async () => {
    const base = await makeFixture(info, GROUP);
    const reg = async (name: string, msds: string | null) => {
      const r = await base.prep.rpc("register_reagent", { p_name: name, p_storage_class: STORAGE[0], p_stock: 100, p_unit: "g", p_intake_date: "2026-09-15", p_msds_url: msds });
      expect(r.error, `준비: register_reagent (${r.error?.message})`).toBeNull();
      return { id: ((Array.isArray(r.data) ? r.data[0] : r.data) as { id: string }).id, name };
    };
    const tag = info.project.name;
    const noMsds = await reg(`큐에이없음-${tag}`, null);
    const withMsds = await reg(`큐에이있음-${tag}`, MSDS_URL);
    const archived = await reg(`큐에이보관-${tag}`, null);
    const teacher = await clientFor(base.teacher);
    const usedOnOld = daysAgoKst(5);
    const batch = async (id: string, usedOn: string) => {
      const r = await teacher.rpc("record_usage_batch", { p_items: [{ reagent_id: id, amount: 1 }], p_used_on: usedOn, p_memo: null });
      expect(r.error, `준비: record_usage_batch (${r.error?.message})`).toBeNull();
    };
    // 기록 순서: 오래된 사용일 → 오늘 → (가장 최근 기록) 보관될 시약
    await batch(noMsds.id, usedOnOld);
    await batch(withMsds.id, ymdKst());
    await batch(archived.id, daysAgoKst(2));
    const a = await teacher.rpc("archive_reagent", { p_reagent_id: archived.id });
    expect(a.error, `준비: archive_reagent (${a.error?.message})`).toBeNull();
    return { ...base, withMsds, noMsds, usedOnOld };
  })();
  fx.catch(() => (fx = null));
  return fx;
}

test(`[C1][S10] 기대값 원본: d7 §25 기록 추가(모든 역할 · 빈 화면 4 → 저장 → 화면 10 + highlight-soft) · rules record_add '${ADD_LABEL}' · screens_required 10 · QA 문구 (4) '${AMOUNT_POSITIVE}' (5) '${RECORDED_LABEL}' (6) '${INVITE_ERROR}' (8) '${MSDS_VIEW}'`, () => {
  expect(rules.screens_required["10"], "screens_required 10 에 record-add").toContain(RA.component);
  expect(ADD_LABEL).toBe("기록 추가");
  expect(RA.shape, "떠 있는 버튼 없음").toMatch(/떠 있는 버튼\(FAB\) 없음/);
  expect(ADD_RECORD).toMatch(/모든 역할/);
  expect(ADD_RECORD).toMatch(/빈 화면 4 → 저장하면 화면 10 으로 돌아오고 새 기록 행을 잠깐 highlight-soft/);
  expect([AMOUNT_POSITIVE, RECORDED_LABEL, INVITE_ERROR, MSDS_VIEW]).toEqual(["사용량은 0보다 커야 해요", "기록한 날", "이메일 주소를 확인해 주세요", "MSDS 보기"]);
  expect(QA, "(4) 음수도 같은 문구").toMatch(/음수도 같은 문구/);
  expect(QA, "(7) Esc 뒤 포커스 ⋯").toMatch(/\(7\) 삭제 확인 모달 Esc 뒤 포커스 ⋯ 로 복귀/);
});

for (const role of ["student", "teacher", "admin"] as const) {
  test(`[C1][S10] [R-ui][S10] ${role}: /usage 머리에 record-add 1 = button-primary '${ADD_LABEL}' → 화면 4 경로 (모든 역할 · rules record_add.roles)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { page, context } = await openAs(browser, info, role, 10);
    try {
      await waitHistory(page);
      const add = page.locator(`main ${sel(RA.component)}`);
      await expect(add, "record-add 1").toHaveCount(1);
      await expect(add.locator(sel("button-primary")), `'${ADD_LABEL}'`).toHaveText(exact(ADD_LABEL));
      const href = await add.locator("a").first().getAttribute("href");
      expect(new URL(href!, "http://x").pathname, "→ 화면 4").toBe(routeOf(4));
      const fixedLike = await add.evaluate((el) => getComputedStyle(el).position === "fixed" || getComputedStyle(el.querySelector("a") ?? el).position === "fixed");
      expect(fixedLike, "떠 있는 버튼(FAB) 아님").toBe(false);
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S4] 사용량 0 · 음수 → '${AMOUNT_POSITIVE}' (d7 §25 QA 4) · 저장 요청 0 (학교 A 학생, 쓰기 없음)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { own } = seedOwnReagents("student");
  const { page, context } = await openAs(browser, info, "student", 4, usagePath(own[0].id));
  try {
    await waitUsage(page);
    const actions = watchActions(page);
    const input = amountOf(page, own[0].name);
    for (const v of ["0", "-3"]) {
      await input.fill(v);
      await input.press("Tab");
      await expect(page.locator("main").getByText(AMOUNT_POSITIVE, { exact: true }), `${v} → '${AMOUNT_POSITIVE}'`).toBeVisible();
      if (await saveButton(page).isEnabled()) await saveButton(page).click();
      await page.waitForTimeout(800);
    }
    expect(actions.count(), "저장 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[R-ui][S8] 초대 이메일 오류 문구 두 폭 같음 '${INVITE_ERROR}' (d7 §25 QA 6, 학교 A admin · 초대 요청 0)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { page, context } = await openAs(browser, info, "admin", 8);
  try {
    await waitUsers(page);
    const actions = watchActions(page);
    await openInviteSheet(page);
    const input = inviteEmailInput(page);
    await input.fill("not-an-email");
    if (isDeskPage(page)) await inviteSubmit(page).click();
    else await input.press("Enter");
    await expect(page.getByText(INVITE_ERROR, { exact: true }), `'${INVITE_ERROR}' (그대로, 덧붙임 없음)`).toBeVisible();
    await expect(page.getByText(new RegExp(`${INVITE_ERROR}\\s*\\(`)), "주소 덧붙임 없음").toHaveCount(0);
    expect(actions.count(), "초대 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음");
  test.afterAll(async ({}, info) => {
    info.setTimeout(TIMEOUT);
    fx = null;
    expect(await cleanupSensors(GROUP, info.project.name), "잔여물").toEqual(NO_SENSOR_RESIDUE);
  });

  test("[R-ui][S3] 사용 기록 탭 날짜 = 사용일(used_on, d7 §25 QA 1) — 기록한 날(오늘)이 아니라", async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const t = await openTemp(browser, info, f.teacher, `${routeOf(2)}/${f.noMsds.id}`);
    try {
      await waitDetail(t.page);
      const text = await textAcrossTabs(t.page);
      const shown = text.includes(dots(f.usedOnOld)) || text.includes(KMD(f.usedOnOld)) || text.includes(f.usedOnOld);
      expect(shown, `사용일 ${f.usedOnOld} 표시`).toBe(true);
      for (const v of [dots(ymdKst()), ymdKst()]) expect(text, `기록한 날(오늘 ${v}) 표시 안 함`).not.toContain(v);
    } finally {
      await t.context.close();
    }
  });

  test("[R-ui][S13] 홈 최근 기록 날짜 = 사용일 (보관 시약 기록이 끼어도 행과 날짜가 같은 출처, d7 §25 QA 1)", async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const t = await openTemp(browser, info, f.teacher, routeOf(13));
    try {
      const page = t.page;
      await expect(page.locator(sel("home-summary")).first()).toBeAttached({ timeout: 45_000 });
      const row = isDeskPage(page)
        ? page.locator('[data-name="recent-usage-widget"] tr').filter({ hasText: f.noMsds.name })
        : page.locator(`main ${sel("reagent-row")}`).filter({ hasText: f.noMsds.name });
      await expect(row, "최근 기록에 사용일 오래된 기록 행").toHaveCount(1, { timeout: 45_000 });
      const txt = (await row.innerText()).replace(/\s+/g, " ");
      expect(txt, `날짜 = 사용일 ${KMD(f.usedOnOld)}`).toContain(KMD(f.usedOnOld));
      expect(txt, "기록 시각(오늘) 아님").not.toMatch(/오늘/);
      const todayRow = isDeskPage(page)
        ? page.locator('[data-name="recent-usage-widget"] tr').filter({ hasText: f.withMsds.name })
        : page.locator(`main ${sel("reagent-row")}`).filter({ hasText: f.withMsds.name });
      const t2 = (await todayRow.innerText()).replace(/\s+/g, " ");
      expect(t2.includes("오늘") || t2.includes(KMD(ymdKst())), "오늘 사용 기록 = 오늘").toBe(true);
      expect(t2, "오늘 기록에 다른 행 날짜 안 섞임").not.toContain(KMD(daysAgoKst(2)));
    } finally {
      await t.context.close();
    }
  });

  test(`[C1][S10] [R-ui][S10] 기록 상세: 라벨 '${RECORDED_LABEL}' 두 폭 (QA 5) · MSDS 없는 시약 = '${MSDS_VIEW}' 0 (QA 8) / 있는 시약 = 1`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const t = await openTemp(browser, info, f.teacher, routeOf(10));
    try {
      const page = t.page;
      await waitHistory(page);
      const indexOf = async (name: string) => {
        const texts = await rows(page).allInnerTexts();
        const i = texts.findIndex((x) => x.includes(name));
        expect(i, `${name} 행`).toBeGreaterThanOrEqual(0);
        return i;
      };
      await openRow(page, await indexOf(f.noMsds.name));
      const d = modal(page);
      await expect(d.getByText(RECORDED_LABEL, { exact: true }), `'${RECORDED_LABEL}' 라벨`).toHaveCount(1);
      await expect(d.getByText("기록 시각", { exact: true }), "상세에 '기록 시각' 라벨 없음").toHaveCount(0);
      await expect(d.locator("a, button").filter({ hasText: MSDS_VIEW }), `MSDS 없음 → '${MSDS_VIEW}' 0`).toHaveCount(0);
      await page.keyboard.press("Escape");
      await page.goto(routeOf(10));
      await waitHistory(page);
      await openRow(page, await indexOf(f.withMsds.name));
      await expect(modal(page).locator("a, button").filter({ hasText: MSDS_VIEW }), `MSDS 있음 → '${MSDS_VIEW}' 1`).toHaveCount(1);
      await expect(modal(page).getByText(RECORDED_LABEL, { exact: true })).toHaveCount(1);
    } finally {
      await t.context.close();
    }
  });

  test("[R-ui][S3] 시약 삭제 확인 모달 Esc → 닫힘 + 포커스 ⋯ 복귀 (d7 §25 QA 7) · DB 그대로", async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const t = await openTemp(browser, info, f.teacher, `${routeOf(2)}/${f.withMsds.id}`);
    try {
      const page = t.page;
      await waitDetail(page);
      const scope = isDeskPage(page) ? page.locator(sel("detail-drawer")) : page.locator(`main ${sel("reagent-detail-card")}`);
      const more = scope.locator(`${sel("reagent-more-menu")} button[aria-haspopup="menu"]`);
      await expect(async () => {
        if (!(await page.getByRole("menuitem").first().isVisible())) await more.click({ timeout: 3_000 });
        await page.locator(sel("reagent-delete")).click({ timeout: 3_000 });
        await expect(page.locator(sel("ex-modal-card"))).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      await page.keyboard.press("Escape");
      await expect(page.locator(sel("ex-modal-card")), "Esc → 닫힘").toHaveCount(0);
      await expect.poll(() => more.evaluate((el) => el === document.activeElement), { message: "포커스 = ⋯" }).toBe(true);
      const r = await service().from("reagents").select("deleted_at").eq("id", f.withMsds.id).single();
      expect(r.data?.deleted_at, "DB 그대로").toBeNull();
    } finally {
      await t.context.close();
    }
  });

  test(`[C1][S10] [R-ui][S10] 기록 추가 흐름: '${ADD_LABEL}' → 빈 화면 4(담은 시약 0) → 시약 담고 저장 → 화면 10 으로 돌아옴 + 새 기록 행 잠깐 highlight-soft(${highlightSoft()}) · DB 1행`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const t = await openTemp(browser, info, f.teacher, routeOf(10));
    try {
      const page = t.page;
      await waitHistory(page);
      const before = ((await service().from("usage_logs").select("id").eq("reagent_id", f.withMsds.id)).data ?? []).length;
      await expect(async () => {
        await page.locator(`main ${sel(RA.component)} a`).first().click({ timeout: 3_000 });
        await expect(page).toHaveURL(new RegExp(`${routeOf(4)}(\\?|$)`), { timeout: 10_000 });
      }).toPass({ timeout: 45_000 });
      await waitUsage(page);
      await expect(page.locator(`main ${sel("usage-item-row")}`), "빈 화면 4 (담은 시약 0)").toHaveCount(0);
      await addReagents(page, [f.withMsds.name]);
      await amountOf(page, f.withMsds.name).fill("2");
      const soft = highlightSoft();
      const sawHighlight = page.waitForFunction(
        ({ name, color }) =>
          location.pathname === "/usage" &&
          [...document.querySelectorAll('main [data-component="ex-data-table-cell"]')].some(
            (el) => (el as HTMLElement).innerText.includes(name) && getComputedStyle(el).backgroundColor === color,
          ),
        { name: f.withMsds.name, color: soft },
        { timeout: 60_000, polling: 50 },
      );
      await saveButton(page).click();
      await expect(page, "저장 → 화면 10").toHaveURL(new RegExp(`${routeOf(10)}(\\?|$)`), { timeout: 45_000 });
      await sawHighlight;
      const after = await service().from("usage_logs").select("id, user_id, amount").eq("reagent_id", f.withMsds.id);
      expect((after.data ?? []).length, "DB 새 기록 1").toBe(before + 1);
      await expect(rows(page).filter({ hasText: f.withMsds.name }).first(), "새 기록 행 보임").toBeVisible();
    } finally {
      await t.context.close();
    }
  });
});
