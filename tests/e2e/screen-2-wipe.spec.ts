// 화면 2 시약 전체 삭제 (harness/d7-data.md §29 "전체 삭제 진입" · "school-name-confirm" · "시약 전체 삭제" · "테스트",
// design/rules.json 1.29 wipe · roles R5 · R8 · guest.hidden_components · variants[2].wipe, 시안 2-wipe-mobile · 2-wipe-desktop) — R-ui · C1 · GM-ui · V1
// - 진입: admin 만 페이지 머리 page-more-menu ⋯ (두 폭) — 교사(R8) · 학생(R5) · 학교 B 교사 · 둘러보기 0. 선택 모드와 섞지 않음.
// - 확인 카드: 제목 '시약 {N}종을 모두 삭제할까요?'(N = RLS 로 센 우리 학교 시약) · 본문 · school-name-confirm(caption · placeholder = 학교명) ·
//   '전체 삭제' 꺼짐(#e0e0e0 / #707070) → 틀린 학교명 '학교 이름이 달라요' 꺼짐 → 맞는 학교명(앞뒤 공백 정리) 켜짐.
// - 공용 학교 A 는 확인 버튼을 누르지 않는다(지우기 요청은 가로채 막고 0 인지 본다) · DB 불변.
// - 성공 경로는 일회용 학교 admin 으로만: 토스트 '시약 {N}종을 삭제했어요' → 빈 목록 · DB 살아 있는 시약 0 · 사용 · 입고 기록 그대로 · 다시 ⋯ = 비활성 + '지울 시약이 없어요'.
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { browserClient, browserSession, devRules, roleChecks, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { waitWidthSettled } from "./desk-helpers";
import { RULE_ROLE } from "./shell-helpers";
import { GUEST, guestRouteOf, openGuest, waitGuestShell } from "./guest-helpers";
import { HAS_SERVICE, NO_RESIDUE, clientFor, openTemp, service, tempSchool } from "./screen-8-helpers";
import { loadShellFrameNodes } from "../frames";
import {
  DISABLED_RGB,
  EMPTY,
  MODAL,
  NAME_CONFIRM,
  OUTLINE,
  PAGE_MORE,
  PRIMARY,
  REAGENT_WIPE,
  RECORD_WIPE,
  T,
  TOAST,
  WIPE,
  cleanupTemp,
  expectDisabledLook,
  expectSharedIntact,
  guardWipe,
  kstDaysAgo,
  nameCaptionRe,
  nameInput,
  newReagent,
  addUsage,
  openMore,
  sharedSnapshot,
  type SharedSnap,
} from "./wipe-helpers";

const SCREEN = 2;
const GROUP = "wipeui2";
const NO_SERVICE = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 학교를 만들 수 없음 — 성공 경로는 일회용 학교에서만 (d7 §29 테스트)";
const VARIANT = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)].wipe;
const FRAME = (vp: ViewportName) => loadShellFrameNodes<{ name: string; path: string[]; width: number; text: { characters: string } | null }>(`${SCREEN}-wipe-${vp}`);

/** 목록이 그려지고 폭 정리가 끝날 때까지 */
async function waitList(page: Page): Promise<void> {
  await expect(page.locator(`main ${sel("segmented-control")}`).first()).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("load");
  await waitWidthSettled(page);
}

/** 로그인 세션(RLS)으로 센 우리 학교 살아 있는 시약 수 */
async function liveReagents(page: Page): Promise<number> {
  const { client } = await browserClient(page);
  const r = await client.from("reagents").select("id");
  expect(r.error, "reagents RLS").toBeNull();
  return (r.data ?? []).length;
}

const wipeCard = (page: Page) => page.locator(sel(MODAL)).filter({ has: page.locator(sel(REAGENT_WIPE)) });
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
  if (sharedBefore) await expectSharedIntact(sharedBefore, "화면 2 전체 삭제 스펙 전후");
});

// =====================================================================
// 기대값 원본
// =====================================================================

test(`[R-ui][S${SCREEN}] 기대값 원본: rules wipe.roles = admin · R5(학생) · R8(교사) 에 ${PAGE_MORE}·${REAGENT_WIPE}·${RECORD_WIPE} max 0 · guest.hidden_components · variants[2].wipe · 문구 = 시안 2-wipe`, () => {
  expect(WIPE.roles, "rules wipe.roles").toEqual(["admin"]);
  const roles = rules.roles as Record<string, { role?: string; components?: string[]; max?: number }>;
  for (const id of ["R5", "R8"]) for (const c of [PAGE_MORE, REAGENT_WIPE, RECORD_WIPE]) expect(roles[id].components, `${id} ${c}`).toContain(c);
  expect(roles.R5.role).toBe("학생");
  expect(roles.R8.role).toBe("교사");
  expect([roles.R5.max, roles.R8.max]).toEqual([0, 0]);
  for (const c of [PAGE_MORE, REAGENT_WIPE, RECORD_WIPE, NAME_CONFIRM]) expect(GUEST.hidden_components, `guest.hidden_components ${c}`).toContain(c);
  expect(VARIANT, "variants[2].wipe").toEqual([PAGE_MORE, REAGENT_WIPE, MODAL, NAME_CONFIRM]);
  for (const c of VARIANT) expect(devRules.components[c] ?? [], `dev-rules components ${c}`).toContain(SCREEN);
  // 시안 2-wipe-mobile 글자 = rules 문구 (N = 시안 42)
  const texts = FRAME("mobile").filter((n) => n.text).map((n) => n.text!.characters);
  const n = Number(/시약 (\d+)종을 모두/.exec(texts.find((t) => /종을 모두/.test(t)) ?? "")?.[1]);
  expect(texts, "시안 제목").toContain(T.reagentTitle(n));
  const body = FRAME("mobile").filter((x) => x.text && x.name === "body" && x.path.includes(MODAL)).map((x) => x.text!.characters);
  expect(body.join(" "), "시안 ex-modal-card 본문 두 줄 = rules 본문").toBe(T.reagentBody);
  expect(texts).toContain(T.close);
  expect(texts).toContain(T.wipeAll);
  expect(T.reagentItem).toBe("시약 전체 삭제");
  expect(T.reagentEmpty).toBe("지울 시약이 없어요");
  expect(T.mismatch).toBe("학교 이름이 달라요");
  expect(T.reagentDone(3)).toBe("시약 3종을 삭제했어요");
  expect(DISABLED_RGB).toEqual({ background: "rgb(224, 224, 224)", color: "rgb(112, 112, 112)" });
  expect("확인을 위해 학교 이름 '샘플고등학교'를 입력하세요", "caption 조사 (받침 없음 → 를)").toMatch(nameCaptionRe("샘플고등학교"));
});

// =====================================================================
// R-ui: 진입은 admin 만
// =====================================================================

for (const role of ["student", "teacher", "schoolB"] as Role[]) {
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${routeOf(SCREEN)}: ${PAGE_MORE} · ${REAGENT_WIPE} · ${NAME_CONFIRM} 0 (rules ${role === "student" ? "R5" : "R8"} · wipe.roles admin 만) · 쓰기 요청 0`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      const me = await browserSession(page);
      const blocked = await guardWipe(page, me.schoolName);
      await waitList(page);
      expect(await liveReagents(page), "대조: 시약이 있다 (0 이라서 숨은 것이 아님)").toBeGreaterThan(0);
      for (const c of [PAGE_MORE, REAGENT_WIPE, NAME_CONFIRM]) await expect(page.locator(sel(c)), `${ROLE_LABEL[role]} ${c} 0`).toHaveCount(0);
      for (const c of roleChecks(SCREEN, RULE_ROLE[role]).filter((x) => x.op === "max" && [PAGE_MORE, REAGENT_WIPE].includes(x.component))) {
        expect(c.value, `${c.rule} ${c.component}`).toBe(0);
      }
      await expect(page.getByText(T.reagentItem, { exact: true }), `'${T.reagentItem}' 글자 0`).toHaveCount(0);
      expect(blocked(), "지우기 요청 0").toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test(`[GM-ui][R-ui][S${SCREEN}g] 둘러보기 ${guestRouteOf(SCREEN)}: ${PAGE_MORE} · ${REAGENT_WIPE} · ${NAME_CONFIRM} 0 (rules guest.hidden_components) · 쓰기 0`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  const { context, page } = await openGuest(browser, info, guestRouteOf(SCREEN));
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") writes.push(new URL(r.url()).pathname);
  });
  try {
    await waitGuestShell(page);
    await waitList(page);
    for (const c of [PAGE_MORE, REAGENT_WIPE, NAME_CONFIRM]) await expect(page.locator(sel(c)), `둘러보기 ${c} 0`).toHaveCount(0);
    await expect(page.getByText(T.reagentItem, { exact: true })).toHaveCount(0);
    expect(writes, "POST 0").toEqual([]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 공용 학교 A admin — 확인 버튼까지 (누르지 않음)
// =====================================================================

test(`[C1][R-ui][S${SCREEN}] 학교A admin: ${PAGE_MORE} 1(머리 오른쪽) → '${T.reagentItem}' → 확인 카드(제목 N = RLS 시약 수 · 본문 · caption · placeholder = 학교명 · 폭 = 시안) · '${T.wipeAll}' 꺼짐 모양 → 틀린 학교명 '${T.mismatch}' 꺼짐 → 맞는 학교명(앞뒤 공백) 켜짐 — 누르지 않음 · '${T.close}' · 선택 모드에서는 ⋯ 0 · 지우기 요청 0 · DB 불변`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "admin", SCREEN);
  try {
    const me = await browserSession(page);
    expect(me.role).toBe("admin");
    const blocked = await guardWipe(page, me.schoolName);
    await waitList(page);
    const n = await liveReagents(page);
    expect(n, "대조: 학교 A 시약 ≥1").toBeGreaterThan(0);
    // ⋯ = 페이지 머리 오른쪽 (제목보다 오른쪽 · 본문 위쪽)
    const more = page.locator(`main ${sel(PAGE_MORE)}`);
    await expect(more, `${PAGE_MORE} 1`).toHaveCount(1);
    await expect(more).toBeVisible();
    const mb = (await more.boundingBox())!;
    const main = (await page.locator("main").boundingBox())!;
    expect(mb.x + mb.width / 2, "⋯ 는 본문 오른쪽 절반").toBeGreaterThan(main.x + main.width / 2);
    await expect(page.locator(sel(REAGENT_WIPE)), "메뉴 닫힘: 항목 0").toHaveCount(0);

    const item = await openMore(page, REAGENT_WIPE);
    await expect(item).toHaveText(new RegExp(`^\\s*${T.reagentItem}\\s*$`));
    await expect(item, "지울 시약이 있으면 켜짐").toBeEnabled();
    await item.click();
    const card = wipeCard(page);
    await expect(card, "확인 카드 1").toHaveCount(1);
    await expect(card).toBeVisible();
    await expect(card.locator(sel(REAGENT_WIPE)), "제목").toHaveText(new RegExp(`^\\s*${T.reagentTitle(n).replace(/[?]/g, "\\?")}\\s*$`));
    expect((await card.innerText()).replace(/\s+/g, ""), "본문").toContain(T.reagentBody.replace(/\s+/g, ""));
    const confirm = card.locator(sel(NAME_CONFIRM));
    await expect(confirm, `${NAME_CONFIRM} 1`).toHaveCount(1);
    await expect(confirm.locator("label, p, span").filter({ hasText: /확인을 위해/ }).first(), "caption").toHaveText(nameCaptionRe(me.schoolName));
    const input = nameInput(card);
    await expect(input, "placeholder = 학교명").toHaveAttribute("placeholder", me.schoolName);
    await expect(input).toHaveValue("");
    const wipeBtn = card.locator(sel(PRIMARY)).filter({ hasText: T.wipeAll });
    const closeBtn = card.locator(sel(OUTLINE)).filter({ hasText: T.close });
    await expect(wipeBtn, `'${T.wipeAll}' 1`).toHaveCount(1);
    await expect(closeBtn, `'${T.close}' 1`).toHaveCount(1);
    await expectDisabledLook(wipeBtn, "학교명 빈칸");
    // 폭 = 시안 (모바일 바텀시트 390 · 데스크톱 카드 440)
    const want = FRAME(viewport).find((x) => x.name === MODAL)!.width;
    expect(Math.round((await card.boundingBox())!.width), `카드 폭 = 시안 ${SCREEN}-wipe-${viewport} ${want}`).toBe(want);
    await shot(page, `${SCREEN}-wipe`, viewport);
    // 틀린 학교명
    await input.fill(`${me.schoolName}x`);
    await expect(confirm.getByText(T.mismatch, { exact: true }), `'${T.mismatch}'`).toBeVisible();
    await expectDisabledLook(wipeBtn, "학교명 틀림");
    await input.fill(me.schoolName.slice(0, -1));
    await expectDisabledLook(wipeBtn, "학교명 일부");
    // 맞는 학교명 (앞뒤 공백만 정리)
    await input.fill(`  ${me.schoolName} `);
    await expect(confirm.getByText(T.mismatch, { exact: true }), "맞으면 안내 없음").toHaveCount(0);
    await expect(wipeBtn, "맞는 학교명 → 켜짐").toBeEnabled();
    // 누르지 않고 닫는다
    await closeBtn.click();
    await expect(card, "닫기 → 카드 0").toHaveCount(0);
    await expect(page.locator(sel(NAME_CONFIRM))).toHaveCount(0);
    // 다시 열면 빈칸
    await (await openMore(page, REAGENT_WIPE)).click();
    await expect(nameInput(wipeCard(page)), "다시 열면 빈칸").toHaveValue("");
    await wipeCard(page).locator(sel(OUTLINE)).filter({ hasText: T.close }).click();
    await expect(wipeCard(page)).toHaveCount(0);
    // 선택 모드와 섞지 않음: '선택' → ⋯ 0 → 취소 → ⋯ 1
    const toggle = page.locator(`main ${sel("list-select-toggle")}`);
    await expect(toggle, "선택 버튼").toHaveCount(1);
    await toggle.click();
    await expect(page.locator(`main ${sel("select-checkbox")}`).first(), "선택 모드 (행 select-checkbox)").toBeVisible({ timeout: 15_000 });
    await expect(page.locator(sel(PAGE_MORE)), "선택 모드에서 ⋯ 0").toHaveCount(0);
    await page.goto(routeOf(SCREEN));
    await waitList(page);
    await expect(page.locator(`main ${sel(PAGE_MORE)}`), "선택 모드 끝 → ⋯ 1").toHaveCount(1);
    expect(blocked(), "지우기 요청 0 (누르지 않았다)").toEqual([]);
    expect(await liveReagents(page), "DB 시약 수 불변").toBe(n);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 성공 경로 — 일회용 학교 admin 만
// =====================================================================

test(`[C1][R-ui][S${SCREEN}] 일회용 학교 admin: 시약 3종 → ⋯ '${T.reagentItem}' → 제목 '${T.reagentTitle(3)}' → 학교명 → '${T.wipeAll}' → 토스트 '${T.reagentDone(3)}' → 빈 목록(${EMPTY}) · DB 살아 있는 시약 0 · 사용 · 입고 기록 그대로 · 다시 ⋯ = 비활성 + '${T.reagentEmpty}'`, async ({ browser }, info) => {
  test.setTimeout(300_000);
  expect(HAS_SERVICE, NO_SERVICE).toBe(true);
  const school = await tempSchool(info, GROUP);
  const admin = await clientFor(school.admin);
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push(await newReagent(admin, 50 + i, kstDaysAgo(5)));
  await addUsage(admin, ids[0], 1, kstDaysAgo(1), { grade: 1, no: 1, subject: "과학" });
  const logs = async () => {
    const u = await service().from("usage_logs").select("id").eq("school_id", school.id);
    const i = await service().from("intake_logs").select("id").eq("school_id", school.id);
    return { usage: (u.data ?? []).map((x) => x.id as string).sort(), intake: (i.data ?? []).map((x) => x.id as string).sort() };
  };
  const before = await logs();
  expect(before.usage.length, "준비: 사용 기록 1").toBe(1);
  expect(before.intake.length, "준비: 입고 기록 3").toBe(3);

  const { context, page, viewport } = await openTemp(browser, info, school.admin, routeOf(SCREEN));
  try {
    await waitList(page);
    expect(await liveReagents(page), "RLS 시약 3").toBe(3);
    await (await openMore(page, REAGENT_WIPE)).click();
    const card = wipeCard(page);
    await expect(card.locator(sel(REAGENT_WIPE))).toHaveText(new RegExp(`^\\s*${T.reagentTitle(3).replace(/[?]/g, "\\?")}\\s*$`));
    await expect(card.locator(sel(NAME_CONFIRM)).getByText(/확인을 위해/)).toHaveText(nameCaptionRe(school.name));
    await nameInput(card).fill(school.name);
    const wipeBtn = card.locator(sel(PRIMARY)).filter({ hasText: T.wipeAll });
    await expect(wipeBtn).toBeEnabled();
    await wipeBtn.click();
    const toast = page.locator(sel(TOAST)).filter({ hasText: T.reagentDone(3) });
    await expect(toast, `토스트 '${T.reagentDone(3)}'`).toBeVisible({ timeout: 30_000 });
    await expect(card, "카드 닫힘").toHaveCount(0);
    await expect(page.locator(`main ${sel(EMPTY)}`).first(), "빈 목록 ex-empty-state-card").toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`main ${sel("reagent-row")}`), "시약 행 0").toHaveCount(0);
    await shot(page, `${SCREEN}-wipe-done`, viewport);
    // DB: 살아 있는 시약 0 (RLS) · 보관(deleted_at) 3 · 사용 · 입고 기록 그대로
    expect(await liveReagents(page), "RLS 살아 있는 시약 0").toBe(0);
    const archived = await service().from("reagents").select("id, deleted_at").eq("school_id", school.id);
    expect((archived.data ?? []).filter((r) => r.deleted_at !== null).map((r) => r.id as string).sort(), "3종 모두 보관 (deleted_at)").toEqual([...ids].sort());
    expect(await logs(), "사용 · 입고 기록은 남는다").toEqual(before);
    // 다시 ⋯ → 비활성 + 이유
    await page.reload();
    await waitList(page);
    const item = await openMore(page, REAGENT_WIPE);
    await expect(item, "0종 → 비활성").toBeDisabled();
    await expect(item, `caption '${T.reagentEmpty}'`).toContainText(T.reagentEmpty);
  } finally {
    await context.close();
  }
});
