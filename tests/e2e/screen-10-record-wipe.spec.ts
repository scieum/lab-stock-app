// 화면 10 기록 삭제 (harness/d7-data.md §29 "전체 삭제 진입" · "기록 삭제" · "기록 삭제 DB" · "테스트",
// design/rules.json 1.29 wipe.record · roles R5 · R8 · variants[10]["record-wipe"], 시안 10-record-wipe-mobile · 10-record-wipe-desktop) — R-ui · C1 · V1
// - 진입: admin 만 페이지 머리 page-more-menu ⋯ → record-wipe '기록 삭제' (교사 R8 · 학생 R5 · 학교 B 교사 0). 지울 기록 0건이면 비활성 + '지울 기록이 없어요'.
// - 모바일 바텀시트(ex-modal-card) / 데스크톱 detail-drawer: record-wipe-range(segmented '전체 | 이 날짜 이전', 기본 '이 날짜 이전' +
//   날짜 = 가장 최근 지난 3월 1일(오케스트레이터 결정 2026-10-13), 미래 불가, 그날 미포함) → wipe-preview = count_wipe_records(RLS) →
//   school-name-confirm → '기록 {N+M}건 삭제'(0건 · 학교명 다름 · 미래 날짜면 꺼짐).
// - 공용 학교 A 는 확인 버튼을 누르지 않는다(지우기 요청 가로채 막고 0) · DB 불변.
// - 성공 경로는 일회용 학교 admin 으로만: 토스트 '기록 {N}건을 삭제했어요' · 그날 미포함 · 재고 그대로 · '전체' → 0건 → 다시 ⋯ = 비활성.
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { browserClient, browserSession, devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { waitWidthSettled } from "./desk-helpers";
import { HAS_SERVICE, NO_RESIDUE, clientFor, openTemp, service, tempSchool } from "./screen-8-helpers";
import { loadShellFrameNodes } from "../frames";
import {
  DRAWER,
  MODAL,
  NAME_CONFIRM,
  PAGE_MORE,
  PREVIEW,
  PRIMARY,
  RANGE,
  RECORD_WIPE,
  T,
  TOAST,
  addIntake,
  addUsage,
  awayFromMidnight,
  cleanupTemp,
  expectDisabledLook,
  expectSharedIntact,
  guardWipe,
  kstDaysAgo,
  kstToday,
  lastMarchFirst,
  nameCaptionRe,
  nameInput,
  newReagent,
  openMore,
  sharedSnapshot,
  ymdMinus,
  type SharedSnap,
} from "./wipe-helpers";

const SCREEN = 10;
const GROUP = "wipeui10";
const NO_SERVICE = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 학교를 만들 수 없음 — 성공 경로는 일회용 학교에서만 (d7 §29 테스트)";
const VARIANT = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)]["record-wipe"];
const FRAME = (vp: ViewportName) => loadShellFrameNodes<{ name: string; path: string[]; width: number; text: { characters: string } | null }>(`${SCREEN}-record-wipe-${vp}`);
/** 폭별 담는 틀: 390 바텀시트 ex-modal-card · 1440 detail-drawer (rules wipe.record) */
const HOST = (vp: ViewportName) => (vp === "mobile" ? MODAL : DRAWER);
const squash = (s: string) => s.replace(/\s+/g, "");
const exactRe = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

async function waitHistory(page: Page): Promise<void> {
  await expect(page.locator(`main ${sel("segmented-control")}`).first()).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("load");
  await waitWidthSettled(page);
}

type Counts = { usage: number; intake: number };
/** count_wipe_records(p_before) — 로그인 세션(RLS) admin */
async function countRecords(client: SupabaseClient, before: string | null): Promise<Counts> {
  const r = await client.rpc("count_wipe_records", { p_before: before });
  expect(r.error, `count_wipe_records(${before}) ${r.error?.message}`).toBeNull();
  const row = (Array.isArray(r.data) ? r.data[0] : r.data) as Record<string, unknown>;
  return { usage: Number(row.usage_count), intake: Number(row.intake_count) };
}

const panelOf = (page: Page, vp: ViewportName): Locator => page.locator(sel(HOST(vp))).filter({ has: page.locator(sel(RECORD_WIPE)) });
const rangeTab = (panel: Locator, label: string) => panel.locator(`${sel(RANGE)} [role="tab"]`).filter({ hasText: exactRe(label) });
const dateInput = (panel: Locator) => panel.locator(`${sel(RANGE)} input`);
const confirmButton = (panel: Locator) => panel.locator(sel(PRIMARY)).filter({ hasText: /^\s*기록 [\d,]+건 삭제\s*$/ });

/** 미리보기(wipe-preview) 글자 = rules 문구 (0건 = '이 기간에 지울 기록이 없어요') · 버튼 글자 '기록 {N+M}건 삭제' */
async function expectPreview(panel: Locator, c: Counts, what: string): Promise<void> {
  const preview = panel.locator(sel(PREVIEW));
  await expect(preview, `${what}: ${PREVIEW} 1`).toHaveCount(1);
  const want = c.usage + c.intake === 0 ? T.previewEmpty : T.preview(c.usage, c.intake) + T.previewNote;
  await expect.poll(async () => squash(await preview.innerText()), { message: `${what}: 미리보기 '${want}'`, timeout: 30_000 }).toBe(squash(want));
  await expect(confirmButton(panel), `${what}: 버튼 '${T.recordButton(c.usage + c.intake)}'`).toHaveText(exactRe(T.recordButton(c.usage + c.intake)));
}

async function openPanel(page: Page, vp: ViewportName): Promise<Locator> {
  const item = await openMore(page, RECORD_WIPE);
  await expect(item).toHaveText(exactRe(T.recordItem));
  await expect(item, "지울 기록이 있으면 켜짐").toBeEnabled();
  await item.click();
  const panel = panelOf(page, vp);
  await expect(panel, `${HOST(vp)} 안 기록 삭제 1`).toHaveCount(1);
  await expect(panel).toBeVisible();
  return panel;
}

const shot = (page: Page, name: string, vp: ViewportName) => page.screenshot({ path: join(process.cwd(), "test-results", `v1-${name}-${vp}.png`) });

let sharedBefore: SharedSnap | null = null;
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (HAS_SERVICE) sharedBefore = await sharedSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  const { rows, left } = await cleanupTemp(GROUP, info.project.name);
  expect(rows, "일회용 학교 시약 · 기록 잔여물").toEqual({ reagents: 0, intake_logs: 0, usage_logs: 0, cabinets: 0 });
  expect(left, "일회용 계정 · 학교 잔여물").toEqual(NO_RESIDUE);
  if (sharedBefore) await expectSharedIntact(sharedBefore, "화면 10 기록 삭제 스펙 전후");
});

// =====================================================================
// 기대값 원본
// =====================================================================

test(`[R-ui][S${SCREEN}] 기대값 원본: variants[10]["record-wipe"] · 문구 = rules wipe.record = 시안 10-record-wipe · 기본 날짜 = 가장 최근 지난 3월 1일`, () => {
  expect(VARIANT).toEqual([PAGE_MORE, RECORD_WIPE, RANGE, PREVIEW, NAME_CONFIRM]);
  for (const c of VARIANT) expect(devRules.components[c] ?? [], `dev-rules components ${c}`).toContain(SCREEN);
  expect(T.recordItem).toBe("기록 삭제");
  expect(T.recordEmpty).toBe("지울 기록이 없어요");
  expect(T.rangeOptions).toEqual(["전체", "이 날짜 이전"]);
  expect(T.rangeDefault).toBe("이 날짜 이전");
  for (const vp of ["mobile", "desktop"] as ViewportName[]) {
    const nodes = FRAME(vp);
    const texts = nodes.filter((n) => n.text).map((n) => n.text!.characters);
    expect(nodes.filter((n) => n.name === HOST(vp) && n.path.length === 2).length, `시안 ${vp} 틀 = ${HOST(vp)}`).toBe(1);
    expect(texts, `시안 ${vp} 제목`).toContain(T.recordTitle);
    const p = texts.find((t) => /건을 지워요$/.test(t))!;
    const m = /사용 기록 (\d+)건 · 입고 기록 (\d+)건/.exec(p)!;
    expect(p, `시안 ${vp} 미리보기 = rules`).toBe(T.preview(Number(m[1]), Number(m[2])));
    expect(texts, `시안 ${vp} 버튼 = rules`).toContain(T.recordButton(Number(m[1]) + Number(m[2])));
    expect(texts, `시안 ${vp} 안내`).toContain(T.previewNote);
    const active = nodes.filter((n) => n.path.includes(RANGE) && n.path.includes("segmented-control-active") && n.text).map((n) => n.text!.characters);
    expect(active, `시안 ${vp} 기본 범위`).toEqual([T.rangeDefault]);
  }
  expect(lastMarchFirst("2026-10-14")).toBe("2026-03-01");
  expect(lastMarchFirst("2026-03-01")).toBe("2026-03-01");
  expect(lastMarchFirst("2026-02-28")).toBe("2025-03-01");
});

// =====================================================================
// R-ui: 진입은 admin 만
// =====================================================================

for (const role of ["student", "teacher", "schoolB"] as Role[]) {
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${routeOf(SCREEN)}: ${VARIANT.join(" · ")} 0 (rules ${role === "student" ? "R5" : "R8"} · wipe.roles admin 만) · 지우기 요청 0`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      const me = await browserSession(page);
      const blocked = await guardWipe(page, me.schoolName);
      await waitHistory(page);
      await expect(page.locator(`main ${sel("ex-data-table-cell")}`).first(), "대조: 기록이 있다").toBeVisible({ timeout: 30_000 });
      for (const c of VARIANT) await expect(page.locator(sel(c)), `${ROLE_LABEL[role]} ${c} 0`).toHaveCount(0);
      await expect(page.locator(`[role="menuitem"]`).filter({ hasText: exactRe(T.recordItem) }), `'${T.recordItem}' 메뉴 0`).toHaveCount(0);
      // 교사 · 학생은 DB 함수도 거부 (count_wipe_records — 읽기 함수라 공용 학교에 불러도 된다)
      const { client } = await browserClient(page);
      const r = await client.rpc("count_wipe_records", { p_before: null });
      expect(r.error, `${ROLE_LABEL[role]} count_wipe_records 거부`).not.toBeNull();
      expect(blocked(), "지우기 요청 0").toEqual([]);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 공용 학교 A admin — 확인 버튼까지 (누르지 않음)
// =====================================================================

test(`[C1][R-ui][S${SCREEN}] 학교A admin: ${PAGE_MORE} 1 → '${T.recordItem}' → (390 ${MODAL} / 1440 ${DRAWER}) 범위 기본 '${T.rangeDefault}' · 날짜 = 가장 최근 지난 3월 1일 · max 오늘 · 미리보기 = count_wipe_records(RLS) · '전체' 로 바꾸면 다시 셈 · 미래 날짜 · 0건 · 학교명 틀림 → 꺼짐 · 맞으면 켜짐 — 누르지 않음 · 지우기 요청 0 · DB 불변`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  await awayFromMidnight();
  const { context, page, viewport } = await openAs(browser, info, "admin", SCREEN);
  try {
    const me = await browserSession(page);
    expect(me.role).toBe("admin");
    const blocked = await guardWipe(page, me.schoolName);
    await waitHistory(page);
    const { client } = await browserClient(page);
    const today = kstToday();
    const def = lastMarchFirst(today);
    const all = await countRecords(client, null);
    const atDef = await countRecords(client, def);
    expect(all.usage + all.intake, "대조: 학교 A 기록 ≥1").toBeGreaterThan(0);
    // ⋯ 는 페이지 머리 오른쪽
    const more = page.locator(`main ${sel(PAGE_MORE)}`);
    await expect(more, `${PAGE_MORE} 1`).toHaveCount(1);
    const mb = (await more.boundingBox())!;
    const main = (await page.locator("main").boundingBox())!;
    expect(mb.x + mb.width / 2, "⋯ 는 본문 오른쪽 절반").toBeGreaterThan(main.x + main.width / 2);

    const panel = await openPanel(page, viewport);
    expect(Math.round((await panel.boundingBox())!.width), `틀 폭 = 시안 10-record-wipe-${viewport}`).toBe(FRAME(viewport).find((n) => n.name === HOST(viewport) && n.path.length === 2)!.width);
    await expect(panel.locator(sel(RECORD_WIPE)), "제목").toHaveText(exactRe(T.recordTitle));
    // 범위: 기본 '이 날짜 이전' + 날짜
    const range = panel.locator(sel(RANGE));
    await expect(range).toHaveCount(1);
    await expect(range.locator(sel("segmented-control-active")), "기본 범위").toHaveText(exactRe(T.rangeDefault));
    for (const o of T.rangeOptions) await expect(rangeTab(panel, o), `범위 '${o}'`).toHaveCount(1);
    await expect(dateInput(panel), "기본 날짜 = 가장 최근 지난 3월 1일").toHaveValue(def);
    await expect(dateInput(panel), "미래 불가 (max = 오늘)").toHaveAttribute("max", today);
    await expectPreview(panel, atDef, `기본(${def} 이전)`);
    // 학교명 caption · placeholder
    const confirm = panel.locator(sel(NAME_CONFIRM));
    await expect(confirm.getByText(/확인을 위해/)).toHaveText(nameCaptionRe(me.schoolName));
    await expect(nameInput(panel)).toHaveAttribute("placeholder", me.schoolName);
    await expectDisabledLook(confirmButton(panel), "학교명 빈칸");
    await shot(page, `${SCREEN}-record-wipe`, viewport);
    // '전체' → count(null)
    await rangeTab(panel, T.rangeOptions[0]).click();
    await expect(range.locator(sel("segmented-control-active"))).toHaveText(exactRe(T.rangeOptions[0]));
    await expect(dateInput(panel), "'전체' 는 날짜 칸 없음").toHaveCount(0);
    await expectPreview(panel, all, "전체");
    // 다시 '이 날짜 이전' → 먼 과거(0건) → 미래
    await rangeTab(panel, T.rangeDefault).click();
    await expectPreview(panel, atDef, "다시 기본");
    const old = "2000-01-01";
    expect(await countRecords(client, old), "대조: 2000-01-01 이전 0건").toEqual({ usage: 0, intake: 0 });
    await dateInput(panel).fill(old);
    await expectPreview(panel, { usage: 0, intake: 0 }, "0건");
    await nameInput(panel).fill(me.schoolName);
    await expectDisabledLook(confirmButton(panel), "0건 (학교명 맞음)");
    const tomorrow = kstDaysAgo(-1);
    await dateInput(panel).fill(tomorrow);
    await expectDisabledLook(confirmButton(panel), `미래 날짜 ${tomorrow}`);
    // 그날 미포함: 오늘 날짜 = 어제까지 → count(오늘)
    await dateInput(panel).fill(today);
    await expectPreview(panel, await countRecords(client, today), "오늘(그날 미포함)");
    // 학교명: 틀림 → 꺼짐 + 안내 / 맞음(앞뒤 공백) → 켜짐 (기록이 있을 때)
    await dateInput(panel).fill(def);
    await expectPreview(panel, atDef, "기본 날짜로");
    await nameInput(panel).fill(`${me.schoolName}x`);
    await expect(confirm.getByText(T.mismatch, { exact: true })).toBeVisible();
    await expectDisabledLook(confirmButton(panel), "학교명 틀림");
    await nameInput(panel).fill(` ${me.schoolName}  `);
    await expect(confirm.getByText(T.mismatch, { exact: true })).toHaveCount(0);
    if (atDef.usage + atDef.intake > 0) await expect(confirmButton(panel), "학교명 맞음 → 켜짐").toBeEnabled();
    else await expectDisabledLook(confirmButton(panel), "기본 날짜 이전 0건");
    // 누르지 않는다
    await page.goto(routeOf(SCREEN));
    await waitHistory(page);
    expect(blocked(), "지우기 요청 0 (누르지 않았다)").toEqual([]);
    expect(await countRecords(client, null), "DB 기록 수 불변").toEqual(all);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 성공 경로 — 일회용 학교 admin 만
// =====================================================================

test(`[C1][R-ui][S${SCREEN}] 일회용 학교 admin: 기본 '${T.rangeDefault}'(3월 1일) → 미리보기 사용 1 · 입고 1 → 학교명 → '${T.recordButton(2)}' → 토스트 '${T.recordDone(2)}' · 그날 · 뒤 기록은 남음 · '전체' → '${T.recordDone(3)}' → 0건 · 재고 · 입고일 · 재주문 기준 그대로 · 다시 ⋯ = 비활성 + '${T.recordEmpty}'`, async ({ browser }, info) => {
  test.setTimeout(300_000);
  expect(HAS_SERVICE, NO_SERVICE).toBe(true);
  await awayFromMidnight();
  const def = lastMarchFirst();
  const school = await tempSchool(info, GROUP);
  const admin = await clientFor(school.admin);
  // 3월 1일 이전: 입고(등록) 1 · 사용 1 / 그날 · 뒤: 입고 1 · 사용 2
  const rid = await newReagent(admin, 100, ymdMinus(def, 20));
  await addUsage(admin, rid, 2, ymdMinus(def, 10), { grade: 2, no: 3, subject: "화학" });
  await addUsage(admin, rid, 1, def);
  await addUsage(admin, rid, 1, kstDaysAgo(1));
  await addIntake(admin, rid, 5, kstDaysAgo(3));
  expect(await countRecords(admin, def), `준비: ${def} 이전`).toEqual({ usage: 1, intake: 1 });
  expect(await countRecords(admin, null), "준비: 전체").toEqual({ usage: 3, intake: 2 });
  const STOCK_COLS = "stock, intake_date, min_stock, low_stock_since, reorder_per_group, reorder_groups";
  const stockOf = async () => (await service().from("reagents").select(STOCK_COLS).eq("id", rid).single()).data;
  const stockBefore = await stockOf();
  const logs = async () => {
    const u = await service().from("usage_logs").select("used_on").eq("school_id", school.id).order("used_on");
    const i = await service().from("intake_logs").select("intake_date").eq("school_id", school.id).order("intake_date");
    return { usage: (u.data ?? []).map((x) => String(x.used_on)), intake: (i.data ?? []).map((x) => String(x.intake_date)) };
  };

  const { context, page, viewport } = await openTemp(browser, info, school.admin, routeOf(SCREEN));
  try {
    await waitHistory(page);
    let panel = await openPanel(page, viewport);
    await expect(dateInput(panel)).toHaveValue(def);
    await expectPreview(panel, { usage: 1, intake: 1 }, "기본");
    await expect(panel.locator(sel(NAME_CONFIRM)).getByText(/확인을 위해/)).toHaveText(nameCaptionRe(school.name));
    await nameInput(panel).fill(school.name);
    await expect(confirmButton(panel)).toBeEnabled();
    await confirmButton(panel).click();
    await expect(page.locator(sel(TOAST)).filter({ hasText: T.recordDone(2) }), `토스트 '${T.recordDone(2)}'`).toBeVisible({ timeout: 30_000 });
    await expect(panelOf(page, viewport), "닫힘").toHaveCount(0);
    const after1 = await logs();
    expect(after1.usage, "그날(3월 1일) · 뒤 사용 기록은 남는다").toEqual([def, kstDaysAgo(1)].sort());
    expect(after1.intake, "뒤 입고 기록은 남는다").toEqual([kstDaysAgo(3)]);
    expect(await stockOf(), "재고 · 입고일 · 재주문 기준 그대로").toEqual(stockBefore);
    await shot(page, `${SCREEN}-record-wipe-done`, viewport);
    // '전체'
    await page.reload();
    await waitHistory(page);
    panel = await openPanel(page, viewport);
    await rangeTab(panel, T.rangeOptions[0]).click();
    await expectPreview(panel, { usage: 2, intake: 1 }, "전체");
    await nameInput(panel).fill(school.name);
    await confirmButton(panel).click();
    await expect(page.locator(sel(TOAST)).filter({ hasText: T.recordDone(3) }), `토스트 '${T.recordDone(3)}'`).toBeVisible({ timeout: 30_000 });
    expect(await logs(), "전체 → 기록 0").toEqual({ usage: [], intake: [] });
    expect(await stockOf(), "재고 그대로 (전체 삭제 뒤)").toEqual(stockBefore);
    expect(await countRecords(admin, null)).toEqual({ usage: 0, intake: 0 });
    // 다시 ⋯ → 비활성 + 이유
    await page.reload();
    await waitHistory(page);
    const item = await openMore(page, RECORD_WIPE);
    await expect(item, "0건 → 비활성").toBeDisabled();
    await expect(item).toContainText(T.recordEmpty);
  } finally {
    await context.close();
  }
});
