// 시약 위치 추천 (d7 §17, 2026-10-07 — design/rules.json 1.17 suggest · cabinet.incompatible · variants["3"].location · variants["7"].suggest ·
// roles R7 · guest.hidden_components · button.min_height, dev-rules 1.5 components suggest-badge [3,7,11] · location-suggest [7]) — C1 · R-ui · V1.
// 화면 3 위치 피커 · 화면 11 칸 시트 시약 넣기 목록 · 화면 7 새 시약 등록 직후 location-suggest.
//
// 기대 추천 칸은 구현이 아니라 d7 §17 규칙 문장을 테스트 쪽(suggest-helpers expectedSuggestion)에서 옮겨,
// 그 계정 세션(publishable 키 + RLS)으로 읽은 DB 행으로 계산한다 → 화면에 보인 추천 = 서버 계산 = 기대값.
// 데이터: 일회용 학교(admin·교사·학생 — service role 로 생성, 계정 세션은 generateLink/verifyOtp)에서만 쓴다.
//   준비 = admin 세션 add_cabinet · save_cabinet_layout · register_reagent, 교사 세션 place_reagent (screen-11-helpers).
//   공용 학교 A·B·데모 학교는 건드리지 않는다 (afterAll 스냅숏 대조), 일회용 학교·계정 잔여물 0.
import { join } from "node:path";
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { countComponent, routeOf, rules, sel } from "./screen-helpers";
import { detailPath, waitDetail } from "./screen-3-helpers";
import { HAS_SERVICE, clientFor, openTemp, service, type TempUser } from "./screen-8-helpers";
import { REGISTER_BUTTON, TOAST_REGISTER, fillRegister, intakePath, registerForm, waitIntake } from "./screen-7-helpers";
import {
  DOUBLE,
  NO_S11_RESIDUE,
  SLOT,
  SLOT_ASSIGN,
  SLOT_SHEET,
  SWITCHER,
  boxOf,
  cleanup,
  closeSlotSheet,
  exact,
  hydrated,
  makeFixture,
  onTop,
  prepCabinet,
  prepLayout,
  prepPlace,
  prepReagent,
  purgeSchool,
  readPills,
  sharedCabinetSnapshot,
  slotAt,
  slotSheet,
  waitEditable,
  watchActions,
  type PrepReagent,
  type S11Fixture,
} from "./screen-11-helpers";
import {
  BADGE_TEXT,
  LATER,
  LOCATION_SUGGEST,
  NO_SLOT_TEXT,
  OTHER_SLOT,
  PLACE_HERE,
  SUGGEST_BADGE,
  SUGGEST_PREFIX,
  expectedSuggestion,
  gridOrder,
  placeText,
  suggestRowsOf,
  type ExpectedSuggestion,
} from "./suggest-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "sugg";
const SAVE_TIMEOUT = 20_000;
const MIN_H = (rules as unknown as { button: { min_height: number } }).button.min_height;
const VARIANTS = rules as unknown as { variants: Record<string, Record<string, string[]>> };
const V3 = VARIANTS.variants["3"].location;
const V7 = VARIANTS.variants["7"].suggest;
const R7 = rules.roles.R7;
const COLORS = rules as unknown as { colors: { allowed: string[]; accent: { value: string }; accent_soft: { value: string }; highlight: { values: string[] } } };
const LIST_HREF = routeOf(2);
const CABINETS_HREF = routeOf(11);
const PICK_QUERY = "pick=location";
const PICKER = "location-picker";
const PICKER_SUGGEST_ROW = '[data-testid="location-picker-suggest"]';
const SUGGEST_ROW = '[data-testid="location-suggest-row"]';
const TOAST = "ex-toast";
const TOAST_PLACED = "보관 위치를 바꿨어요";
const PLACED_TEXT = "여기에 뒀어요";

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const HL = COLORS.colors.highlight.values.map((v) => v.toLowerCase());
const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
/** rules suggest.badge: highlight-soft(밝은 하늘색) 채움 + highlight(진한 하늘색) 1px 테두리, 글자 ink(허용색 중 가장 어두운 색). 핑크 금지 */
const HL_SOFT = hexToRgb([...HL].sort((a, b) => lum(b) - lum(a))[0]);
const HL_STRONG = hexToRgb([...HL].sort((a, b) => lum(a) - lum(b))[0]);
const INK = hexToRgb([...COLORS.colors.allowed].sort((a, b) => lum(a) - lum(b))[0]);
const PINK = [COLORS.colors.accent.value, COLORS.colors.accent_soft.value].map((v) => hexToRgb(v.toLowerCase()));

const picker = (page: Page) => page.locator(sel(PICKER));
const locEdit = (page: Page) => page.locator(`main ${sel("location-edit")}`).getByRole("button");
const pickerSlot = (p: Locator, door: string, shelves: number, key: string) => p.locator(sel(SLOT)).nth(gridOrder(door, shelves).indexOf(key));
const pickerSave = (p: Locator) => p.locator(sel("button-primary")).filter({ hasText: exact("저장") });
const suggestBox = (page: Page) => page.locator(`main ${sel(LOCATION_SUGGEST)}`);

async function badgePaint(badge: Locator): Promise<{ bg: string; border: string; bw: number; color: string; text: string }> {
  return badge.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, border: cs.borderTopColor, bw: parseFloat(cs.borderTopWidth), color: cs.color, text: (el.textContent ?? "").trim() };
  });
}
async function expectBadgeLook(badge: Locator, what: string): Promise<void> {
  const p = await badgePaint(badge);
  expect(p.text, `${what}: 글자 "${BADGE_TEXT}"`).toBe(BADGE_TEXT);
  expect(p.bg, `${what}: highlight-soft 채움`).toBe(HL_SOFT);
  expect(p.border, `${what}: highlight 테두리`).toBe(HL_STRONG);
  expect(p.bw, `${what}: 테두리 1px`).toBe(1);
  expect(p.color, `${what}: 글자 ink`).toBe(INK);
  expect([p.bg, p.border, p.color].filter((c) => PINK.includes(c)), `${what}: 핑크 없음`).toEqual([]);
}

/** reagents.slot_id (대조 조회 — service role 읽기) */
async function slotIdOf(id: string): Promise<string | null> {
  const r = await service().from("reagents").select("slot_id").eq("id", id).single();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data?.slot_id as string | null) ?? null;
}
async function reagentByName(schoolId: string, name: string): Promise<{ id: string; slot_id: string | null; storage_class: string | null }> {
  const r = await service().from("reagents").select("id, slot_id, storage_class").eq("school_id", schoolId).eq("name", name);
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  expect(r.data ?? [], `등록된 "${name}" 1행`).toHaveLength(1);
  return r.data![0] as { id: string; slot_id: string | null; storage_class: string | null };
}
/** 그 계정 세션(RLS)으로 읽은 DB 로 계산한 기대 추천 칸 */
async function expectedFor(u: TempUser, reagent: { id?: string | null; storage_class: string | null }): Promise<ExpectedSuggestion | null> {
  return expectedSuggestion(await suggestRowsOf(await clientFor(u)), reagent);
}

// =====================================================================
// 일회용 학교
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
async function fresh(info: TestInfo): Promise<S11Fixture> {
  test.setTimeout(420_000);
  const f = await fixture(info);
  await purgeSchool(f.school.id);
  return f;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedCabinetSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약장·칸·시약 잔여물").toEqual(NO_S11_RESIDUE);
  if (before) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치가 그대로").toEqual(before);
});

const nameOf = (tail: string) => `임시${Math.random().toString(36).slice(2, 7)}${tail}`;
const OX = "산화제";
const ORG = "유기";
const FLAM = "인화성";
const TOX = "독성";

type Cab = { id: string; number: number; label: string };
type State = { c1: Cab; c2: Cab; shelves: number; layout1: Record<string, string[]>; layout2: Record<string, string[]> };

/**
 * 두 시약장 (양문형 3단):
 *  1번: 좌1단 유기(에탄올 1) · 우1단 산화제(산화제 시약 1) · 좌2단 산화제(인화성 시약 1 — 산화제와 위험 조합 → 산화제 후보에서 빠짐)
 *  2번: 좌1단 산화제(비어 있음) · 좌2단 유기(유기 시약 1)
 * → 칸 없는 산화제 시약의 추천 = 2번 시약장 좌1단 (시약 수 0). 독성 칸은 없다 (추천 없음 사례).
 */
async function prepState(f: S11Fixture): Promise<State> {
  const shelves = 3;
  const k1 = await prepCabinet(f);
  const k2 = await prepCabinet(f);
  const layout1 = { L1: [ORG], R1: [OX], L2: [OX] };
  const layout2 = { L1: [OX], L2: [ORG] };
  await prepLayout(f, k1.id, DOUBLE, shelves, layout1);
  await prepLayout(f, k2.id, DOUBLE, shelves, layout2);
  const e1 = await prepReagent(f, "에탄올", 200, "mL", ORG, nameOf("에탄올"));
  await prepPlace(f, e1.id, k1.id, "L1");
  const o1 = await prepReagent(f, "질산칼륨", 1, "병", OX, nameOf("질산칼륨"));
  await prepPlace(f, o1.id, k1.id, "R1");
  const fl = await prepReagent(f, "아세톤", 300, "mL", FLAM, nameOf("아세톤"));
  await prepPlace(f, fl.id, k1.id, "L2");
  const e2 = await prepReagent(f, "메탄올", 100, "mL", ORG, nameOf("메탄올"));
  await prepPlace(f, e2.id, k2.id, "L2");
  const c = (k: { id: string; number: number; label: string }) => ({ id: k.id, number: Number(k.number), label: k.label });
  return { c1: c(k1), c2: c(k2), shelves, layout1, layout2 };
}

/** 피커의 시약장 전환에서 지금 고른 시약장 이름 */
async function activePickerPill(p: Locator): Promise<string> {
  const active = p.locator(`${sel(SWITCHER)} [aria-current="true"]`);
  await expect(active, "활성 시약장 1개").toHaveCount(1);
  return active.evaluate((el) => {
    const c = el.cloneNode(true) as Element;
    for (const n of Array.from(c.querySelectorAll('[data-component="cabinet-number"]'))) n.remove();
    return (c.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}
async function pressedKeys(p: Locator, door: string, shelves: number): Promise<string[]> {
  const order = gridOrder(door, shelves);
  const out: string[] = [];
  const all = p.locator(sel(SLOT));
  const n = await all.count();
  for (let i = 0; i < n; i++) if ((await all.nth(i).getAttribute("aria-pressed")) === "true") out.push(order[i]);
  return out;
}
async function badgeKeys(p: Locator, door: string, shelves: number): Promise<string[]> {
  const order = gridOrder(door, shelves);
  const out: string[] = [];
  const all = p.locator(sel(SLOT));
  const n = await all.count();
  for (let i = 0; i < n; i++) if ((await all.nth(i).locator(sel(SUGGEST_BADGE)).count()) > 0) out.push(order[i]);
  return out;
}

async function openPicker(page: Page): Promise<Locator> {
  await hydrated(locEdit(page));
  await locEdit(page).click();
  const p = picker(page);
  await expect(p, PICKER).toBeVisible();
  return p;
}

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

  // ---------------------------------------------------------------
  // 화면 3 — 위치 피커
  // ---------------------------------------------------------------
  for (const who of ["teacher", "admin"] as const) {
    test(`[C1][S3] 일회용 ${who === "teacher" ? "교사" : "admin"} 위치 피커 추천 (d7 §17): 추천 칸 = DB 로 계산한 기대값(분류 포함 칸 · 위험 조합 칸 제외 · 시약 수 → 번호 → 칸 순 · 자기 제외) · 다른 시약장이면 그 시약장으로 열림 · 소제목 "추천"·"전체" · 추천 줄(번호 · 위치 · ${SUGGEST_BADGE}) · 배치도 추천 칸 ${SUGGEST_BADGE} · 처음 선택 = 추천 칸 · ${SUGGEST_BADGE} 색(rules suggest.badge) · variants["3"].location(${V3.join("·")}) · 다른 시약장으로 바꾸면 선택 풀림·추천 줄로 다시 선택 · 저장 → DB slot_id = 추천 칸`, async ({ browser }, info) => {
      const f = await fresh(info);
      const st = await prepState(f);
      // 대상: 산화제 시약을 1번 시약장 우1단(산화제 시약 1 + 자기)에 둔다 → 자기 제외 1 · 2번 좌1단 0 → 2번 좌1단 추천
      const x = await prepReagent(f, "과산화수소", 2, "병", OX, nameOf("과산화수소"));
      await prepPlace(f, x.id, st.c1.id, "R1");
      const user = who === "teacher" ? f.teacher : f.admin;
      const want = await expectedFor(user, { id: x.id, storage_class: OX });
      expect(want, "기대 추천 칸 (DB 계산)").not.toBeNull();
      expect([want!.cabinetId, want!.key, want!.count], "준비 상태 대조: 2번 시약장 좌1단 · 시약 0").toEqual([st.c2.id, "L1", 0]);
      const { context, page, viewport } = await openTemp(browser, info, user, detailPath(x.id));
      const actions = watchActions(page);
      try {
        await waitDetail(page);
        expect(await countComponent(page, SUGGEST_BADGE), "피커를 열기 전 suggest-badge 0").toBe(0);
        const p = await openPicker(page);
        for (const c of V3) expect(await countComponent(page, c), `variants["3"].location ${c}`).toBeGreaterThanOrEqual(1);
        // 추천 시약장으로 열림 · 추천 칸 처음 선택 · 저장 활성
        expect(await activePickerPill(p), "처음 = 추천 칸의 시약장 (지금 위치 1번이 아니라)").toBe(want!.label);
        expect(await pressedKeys(p, DOUBLE, st.shelves), "처음 선택 = 추천 칸").toEqual([want!.key]);
        expect(await badgeKeys(p, DOUBLE, st.shelves), "배치도 suggest-badge = 추천 칸만").toEqual([want!.key]);
        await expect(pickerSave(p), "추천 칸이 골라져 저장 활성").toBeEnabled();
        // 소제목 · 추천 줄
        await expect(p.getByRole("heading", { name: exact("추천") }), '소제목 "추천"').toHaveCount(1);
        await expect(p.getByRole("heading", { name: exact("전체") }), '소제목 "전체"').toHaveCount(1);
        const row = p.locator(PICKER_SUGGEST_ROW);
        await expect(row, "추천 줄 1개").toHaveCount(1);
        await expect(row.locator(sel("cabinet-number")), "추천 줄 번호").toHaveText(exact(String(want!.number)));
        await expect(row.getByText(placeText(want!), { exact: true }), `추천 줄 "${placeText(want!)}"`).toBeVisible();
        await expect(row.locator(sel(SUGGEST_BADGE)), "추천 줄 suggest-badge").toHaveCount(1);
        expect((await boxOf(row)).bottom, "추천 줄은 시약장 전환 위").toBeLessThanOrEqual((await boxOf(p.locator(sel(SWITCHER)))).top + 0.5);
        expect(await countComponent(page, SUGGEST_BADGE), "suggest-badge = 추천 줄 + 추천 칸").toBe(2);
        await expectBadgeLook(row.locator(sel(SUGGEST_BADGE)), "추천 줄 배지");
        await expectBadgeLook(pickerSlot(p, DOUBLE, st.shelves, want!.key).locator(sel(SUGGEST_BADGE)), "추천 칸 배지");
        // 추천 칸은 분류 경고 없음 (분류 일치)
        await expect(p.locator(sel("mix-warning")), "추천 칸 = 경고 없음").toHaveCount(0);
        if (who === "teacher") await page.screenshot({ path: join(process.cwd(), "test-results", `v1-3-location-suggest-${viewport}.png`), fullPage: false });

        // 지금 위치의 시약장으로 바꾸면: 선택 풀림 · 그 배치도에는 추천 배지 없음 · 추천 줄은 그대로
        await p.locator(`${sel(SWITCHER)} button`).filter({ has: page.getByText(exact(st.c1.label)) }).click();
        await expect.poll(() => activePickerPill(p)).toBe(st.c1.label);
        expect(await pressedKeys(p, DOUBLE, st.shelves), "시약장을 바꾸면 고른 칸 풀림").toEqual([]);
        expect(await badgeKeys(p, DOUBLE, st.shelves), "1번 배치도에는 추천 칸 없음").toEqual([]);
        await expect(pickerSave(p), "칸을 고르기 전 저장 비활성").toBeDisabled();
        await expect(row, "추천 줄은 그대로").toHaveCount(1);
        // 추천 줄 누름 → 추천 시약장 · 추천 칸 다시 선택
        await row.click();
        await expect.poll(() => activePickerPill(p)).toBe(want!.label);
        expect(await pressedKeys(p, DOUBLE, st.shelves), "추천 줄 → 추천 칸 선택").toEqual([want!.key]);
        expect(actions.count(), "저장 전 쓰기 0건").toBe(0);

        // 저장 → DB
        await pickerSave(p).click();
        await expect(page.locator(sel(TOAST)).filter({ hasText: exact(TOAST_PLACED) }), `토스트 "${TOAST_PLACED}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
        await expect(p, "저장 → 피커 닫힘").toHaveCount(0);
        expect(actions.count(), "저장 요청 1건").toBe(1);
        await expect.poll(() => slotIdOf(x.id), { message: "DB slot_id = 추천 칸", timeout: SAVE_TIMEOUT }).toBe(want!.slotId);
      } finally {
        await context.close();
      }
    });
  }

  test(`[C1][S3] 일회용 교사 위치 피커: 이미 추천 칸에 있는 시약 → 처음 선택 없음 · 지금 시약장으로 열림 · 추천 줄·추천 칸 ${SUGGEST_BADGE}만 (저장 비활성) / 추천 없음(맞는 분류 칸 없음 · 분류 없음) → 추천 줄·${SUGGEST_BADGE}·소제목 0, 지금 시약장(없으면 첫 시약장)으로 열림 · 처음 선택 없음`, async ({ browser }, info) => {
    const f = await fresh(info);
    const st = await prepState(f);
    const here = await prepReagent(f, "과산화수소", 2, "병", OX, nameOf("과산화수소"));
    await prepPlace(f, here.id, st.c2.id, "L1");
    const tox = await prepReagent(f, "납", 1, "병", TOX, nameOf("납"));
    await prepPlace(f, tox.id, st.c2.id, "L2");
    // 분류 없는 시약: register_reagent 는 분류를 요구하므로(22023) 준비만 service role 로 넣는다 (예전 데이터·seed 처럼 storage_class null)
    const noneIns = await service().from("reagents").insert({ school_id: f.school.id, name: nameOf("증류수"), unit: "병", stock: 1, min_stock: 0 }).select("id, storage_class").single();
    expect(noneIns.error, `준비: 분류 없는 시약 (${noneIns.error?.message})`).toBeNull();
    expect(noneIns.data!.storage_class, "준비: 분류 없음").toBeNull();
    const none = { id: noneIns.data!.id as string };
    const wantHere = await expectedFor(f.teacher, { id: here.id, storage_class: OX });
    expect([wantHere?.cabinetId, wantHere?.key], "대조: 추천 칸 = 지금 칸(2번 좌1단, 자기 제외 0)").toEqual([st.c2.id, "L1"]);
    expect(await expectedFor(f.teacher, { id: tox.id, storage_class: TOX }), "대조: 독성 칸 없음 → 추천 없음").toBeNull();
    const { context, page } = await openTemp(browser, info, f.teacher, detailPath(here.id));
    const actions = watchActions(page);
    try {
      // 이미 추천 칸
      await waitDetail(page);
      let p = await openPicker(page);
      expect(await activePickerPill(p), "지금 시약장").toBe(st.c2.label);
      expect(await pressedKeys(p, DOUBLE, st.shelves), "처음 선택 없음 (이미 추천 칸)").toEqual([]);
      expect(await badgeKeys(p, DOUBLE, st.shelves), "배치도 suggest-badge = 지금 칸(추천 칸)").toEqual(["L1"]);
      await expect(p.locator(PICKER_SUGGEST_ROW), "추천 줄").toHaveCount(1);
      await expect(p.locator(PICKER_SUGGEST_ROW).locator(sel(SUGGEST_BADGE))).toHaveCount(1);
      await expect(pickerSave(p), "지금 위치 그대로 → 저장 비활성").toBeDisabled();
      await p.getByRole("button", { name: exact("닫기") }).click();
      await expect(p).toHaveCount(0);

      // 추천 없음 (분류에 맞는 칸 없음) — 지금 시약장
      await page.goto(detailPath(tox.id));
      await waitDetail(page);
      p = await openPicker(page);
      expect(await countComponent(page, SUGGEST_BADGE), "추천 없음 → suggest-badge 0").toBe(0);
      await expect(p.locator(PICKER_SUGGEST_ROW), "추천 없음 → 추천 줄 0").toHaveCount(0);
      await expect(p.getByRole("heading", { name: exact("추천") }), '추천 없음 → 소제목 "추천" 없음').toHaveCount(0);
      expect(await activePickerPill(p), "추천 없음 → 지금 시약장").toBe(st.c2.label);
      expect(await pressedKeys(p, DOUBLE, st.shelves), "처음 선택 없음").toEqual([]);
      await expect(pickerSave(p)).toBeDisabled();
      await p.getByRole("button", { name: exact("닫기") }).click();

      // 분류 없음 · 칸 없음 — 첫 시약장
      await page.goto(detailPath(none.id));
      await waitDetail(page);
      p = await openPicker(page);
      expect(await countComponent(page, SUGGEST_BADGE), "분류 없음 → suggest-badge 0").toBe(0);
      await expect(p.locator(PICKER_SUGGEST_ROW)).toHaveCount(0);
      const pills = await readPills(page, p.locator(sel(SWITCHER)));
      expect(await activePickerPill(p), "칸 없음 · 추천 없음 → 첫 시약장 (번호 순)").toBe(pills[0].label);
      expect(await pressedKeys(p, DOUBLE, st.shelves)).toEqual([]);
      expect(actions.count(), "쓰기 0건").toBe(0);
    } finally {
      await context.close();
    }
  });

  test(`[R-ui][S3] 일회용 학생 시약 상세 (?${PICK_QUERY} 포함): ${PICKER}·${SUGGEST_BADGE}·추천 줄·location-edit 0 (R7 · 학생에게는 추천 계산 결과를 내려보내지 않음) · 응답 본문에 ${SUGGEST_BADGE} 없음 — 같은 시약의 교사 화면에는 있음(대조)`, async ({ browser }, info) => {
    const f = await fresh(info);
    const st = await prepState(f);
    const x = await prepReagent(f, "과산화수소", 2, "병", OX, nameOf("과산화수소"));
    expect(R7.components, "R7 에 location-edit").toContain("location-edit");
    const t = await openTemp(browser, info, f.teacher, `${detailPath(x.id)}?${PICK_QUERY}`);
    try {
      await waitDetail(t.page);
      await expect(picker(t.page), "대조: 교사 ?pick=location → 피커 열림").toBeVisible({ timeout: SAVE_TIMEOUT });
      await expect(t.page.locator(sel(SUGGEST_BADGE)).first(), "대조: 교사 suggest-badge").toBeVisible();
    } finally {
      await t.context.close();
    }
    for (const path of [detailPath(x.id), `${detailPath(x.id)}?${PICK_QUERY}`]) {
      const { context, page, response } = await openTemp(browser, info, f.student, path);
      const actions = watchActions(page);
      try {
        await waitDetail(page);
        const html = await response!.text();
        for (const c of [PICKER, SUGGEST_BADGE, "location-edit", LOCATION_SUGGEST]) {
          expect(await countComponent(page, c), `학생 ${path}: ${c}`).toBe(0);
          expect(html, `학생 응답 본문 ${c}`).not.toContain(`data-component="${c}"`);
        }
        await expect(page.locator(PICKER_SUGGEST_ROW), "학생 추천 줄 0").toHaveCount(0);
        expect(html, "학생 응답 본문에 다른 시약장(피커 데이터) 이름 없음").not.toContain(st.c2.label);
        expect(actions.count(), "쓰기 0건").toBe(0);
      } finally {
        await context.close();
      }
    }
  });

  // ---------------------------------------------------------------
  // 화면 11 — 칸 시트 시약 넣기 목록
  // ---------------------------------------------------------------
  test(`[C1][S11] 일회용 교사 칸 시트 "시약 넣기" 목록 (d7 §17): 이 칸이 추천 칸인 시약(= DB 로 계산한 기대값)에만 ${SUGGEST_BADGE} "${BADGE_TEXT}" · 그 시약들이 목록 위(나머지는 그 아래) · 다른 칸 시트에는 그 칸이 추천인 시약만 · 넣기 → DB slot_id · 칸 시약 수가 바뀌면 남은 시약의 추천도 다시 계산(배지 갱신)`, async ({ browser }, info) => {
    const f = await fresh(info);
    const st = await prepState(f);
    // 칸 없음 시약: 산화제 둘 · 유기 · 독성
    const a: PrepReagent = await prepReagent(f, "과산화수소", 2, "병", OX, `임시가${Math.random().toString(36).slice(2, 6)}과산화수소`);
    const b: PrepReagent = await prepReagent(f, "질산은", 1, "병", OX, `임시나${Math.random().toString(36).slice(2, 6)}질산은`);
    const c: PrepReagent = await prepReagent(f, "헥세인", 1, "병", ORG, `임시다${Math.random().toString(36).slice(2, 6)}헥세인`);
    const d: PrepReagent = await prepReagent(f, "납", 1, "병", TOX, `임시라${Math.random().toString(36).slice(2, 6)}납`);
    const unassigned = [
      { r: a, cls: OX },
      { r: b, cls: OX },
      { r: c, cls: ORG },
      { r: d, cls: TOX },
    ];
    const expectAll = async () => {
      const rows = await suggestRowsOf(await clientFor(f.teacher));
      return new Map(unassigned.map((u) => [u.r.id, expectedSuggestion(rows, { id: u.r.id, storage_class: u.cls })]));
    };
    let want = await expectAll();
    const suggestedIn = (cab: string, key: string) => unassigned.filter((u) => want.get(u.r.id)?.cabinetId === cab && want.get(u.r.id)?.key === key).map((u) => u.r.name);
    expect(suggestedIn(st.c2.id, "L1").sort(), "대조: 2번 좌1단 = 산화제 둘의 추천 칸").toEqual([a.name, b.name].sort());
    expect(suggestedIn(st.c1.id, "L1"), "대조: 1번 좌1단 = 유기의 추천 칸 (2번 좌2단과 수가 같아 번호 순)").toEqual([c.name]);
    expect(want.get(d.id), "대조: 독성 = 추천 없음").toBeNull();

    const { context, page, viewport } = await openTemp(browser, info, f.teacher, `${CABINETS_HREF}?c=${st.c2.id}`);
    const actions = watchActions(page);
    /** 칸 시트를 열고 "시약 넣기" → 후보 목록 (이름 · 배지 여부, 화면 순서) */
    const openCandidates = async (cab: Cab, key: string): Promise<{ sheet: Locator; list: () => Promise<{ name: string; badge: boolean }[]> }> => {
      if (!page.url().includes(`c=${cab.id}`)) {
        await page.goto(`${CABINETS_HREF}?c=${cab.id}`);
      }
      await waitEditable(page);
      await hydrated(slotAt(page, DOUBLE, key));
      await slotAt(page, DOUBLE, key).click();
      const sheet = slotSheet(page);
      await expect(sheet, SLOT_SHEET).toBeVisible();
      await sheet.locator(sel(SLOT_ASSIGN)).getByRole("button").click();
      const region = sheet.getByRole("region", { name: exact("넣을 시약 고르기") });
      await expect(region).toBeVisible();
      const list = async () =>
        region.locator(sel("reagent-row")).evaluateAll(
          (els, s) => els.map((e) => ({ text: (e.textContent ?? "").replace(/\s+/g, " ").trim(), badge: e.querySelector(s) !== null })),
          sel(SUGGEST_BADGE),
        ).then((xs) => xs.map((x) => ({ name: unassigned.map((u) => u.r.name).find((n) => x.text.includes(n)) ?? x.text, badge: x.badge })));
      return { sheet, list };
    };
    try {
      // 2번 좌1단 (산화제): 산화제 둘에 배지, 맨 위
      let { sheet, list } = await openCandidates(st.c2, "L1");
      let shown = await list();
      expect(shown.length, "후보 = 칸 없음 시약 4").toBe(4);
      const top = suggestedIn(st.c2.id, "L1");
      expect(shown.slice(0, top.length).map((x) => x.name).sort(), "추천 시약이 목록 위").toEqual([...top].sort());
      expect(shown.map((x) => x.badge), "배지 = 위의 추천 시약만").toEqual(shown.map((_, i) => i < top.length));
      // 추천 시약끼리 · 나머지끼리는 이름순 (칸 없음 목록 순서 그대로)
      const names = (xs: { name: string }[]) => xs.map((x) => x.name);
      expect(names(shown.slice(0, top.length)), "추천 시약끼리 이름순").toEqual([...names(shown.slice(0, top.length))].sort((p, q) => p.localeCompare(q, "ko")));
      expect(names(shown.slice(top.length)), "나머지 이름순").toEqual([...names(shown.slice(top.length))].sort((p, q) => p.localeCompare(q, "ko")));
      await expectBadgeLook(sheet.locator(sel(SUGGEST_BADGE)).first(), "칸 시트 배지");
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-11-slot-suggest-${viewport}.png`), fullPage: false });
      await closeSlotSheet(page);

      // 1번 좌1단 (유기): 유기 시약 하나만 배지
      ({ sheet, list } = await openCandidates(st.c1, "L1"));
      shown = await list();
      expect(shown.filter((x) => x.badge).map((x) => x.name), "1번 좌1단 배지 = 유기 시약").toEqual([c.name]);
      expect(shown[0].name, "그 시약이 맨 위").toBe(c.name);
      await closeSlotSheet(page);
      // 2번 우3단 (분류 없음): 배지 없음
      ({ sheet, list } = await openCandidates(st.c2, "R3"));
      expect((await list()).filter((x) => x.badge), "분류 없는 칸: 배지 0").toEqual([]);
      await closeSlotSheet(page);
      expect(actions.count(), "고르기까지 쓰기 0건").toBe(0);

      // 2번 좌1단에 추천 시약 하나 넣기 → DB
      ({ sheet, list } = await openCandidates(st.c2, "L1"));
      const first = (await list())[0].name;
      const put = unassigned.find((u) => u.r.name === first)!;
      await sheet.getByRole("region", { name: exact("넣을 시약 고르기") }).locator(sel("reagent-row")).filter({ hasText: first }).click();
      await sheet.locator(sel(SLOT_ASSIGN)).getByRole("button").click();
      await expect(page.locator(sel(TOAST)).first(), "넣기 토스트").toBeVisible({ timeout: SAVE_TIMEOUT });
      await expect.poll(() => slotIdOf(put.r.id), { message: "DB slot_id = 2번 좌1단", timeout: SAVE_TIMEOUT }).toBe(want.get(put.r.id)!.slotId);
      expect(actions.count(), "넣기 요청 1건").toBe(1);
      await closeSlotSheet(page);

      // 남은 산화제 시약의 추천 다시 계산 (2번 좌1단 수 1 ↔ 1번 우1단 수 1 → 번호 순 1번) → 배지 갱신
      unassigned.splice(unassigned.indexOf(put), 1);
      want = await expectAll();
      const other = unassigned.find((u) => u.cls === OX)!;
      expect([want.get(other.r.id)?.cabinetId, want.get(other.r.id)?.key], "대조: 남은 산화제 → 1번 우1단").toEqual([st.c1.id, "R1"]);
      await page.reload();
      ({ sheet, list } = await openCandidates(st.c2, "L1"));
      await expect.poll(async () => (await list()).filter((x) => x.badge).map((x) => x.name), { message: "2번 좌1단 배지 = 다시 계산한 기대값", timeout: SAVE_TIMEOUT }).toEqual(suggestedIn(st.c2.id, "L1"));
      await closeSlotSheet(page);
      ({ sheet, list } = await openCandidates(st.c1, "R1"));
      expect((await list()).filter((x) => x.badge).map((x) => x.name), "1번 우1단 배지 = 남은 산화제").toEqual(suggestedIn(st.c1.id, "R1"));
      expect(suggestedIn(st.c1.id, "R1"), "대조").toEqual([other.r.name]);
    } finally {
      await context.close();
    }
  });

  // ---------------------------------------------------------------
  // 화면 7 — 새 시약 등록 직후 location-suggest
  // ---------------------------------------------------------------
  async function register(page: Page, name: string, cls: string): Promise<void> {
    await waitIntake(page, "register");
    await fillRegister(page, { name, storageClass: cls, stock: "1", unit: "병" });
    const btn = registerForm(page).locator(sel("button-primary")).filter({ hasText: exact(REGISTER_BUTTON) });
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(page.locator(sel(TOAST)).filter({ hasText: TOAST_REGISTER }), `토스트 "${TOAST_REGISTER}"`).toBeVisible({ timeout: 30_000 });
  }
  /** location-suggest 안 누를 것(버튼·링크)의 높이 ≥ rules button.min_height */
  async function expectTapHeights(scope: Locator): Promise<void> {
    const els = scope.locator("button, a");
    const n = await els.count();
    expect(n, "누를 것 있음").toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const b = await els.nth(i).boundingBox();
      const label = (await els.nth(i).innerText()).trim();
      expect(b!.height, `"${label}" 누름 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    }
  }

  for (const who of ["teacher", "admin"] as const) {
    test(`[C1][S7] 일회용 ${who === "teacher" ? "교사" : "admin"} 새 시약 등록 → 토스트 "${TOAST_REGISTER}" + ${LOCATION_SUGGEST}(화면 2 로 바로 가지 않음): "보관 위치 정하기" · 시약명 · 분류 · "${SUGGEST_PREFIX}" + 번호 + "N번 시약장 · 좌 1단"(= DB 로 계산한 추천) + ${SUGGEST_BADGE} · [${OTHER_SLOT}] [${PLACE_HERE}] · 누름 높이 ≥ ${MIN_H} · variants["7"].suggest · [${PLACE_HERE}] → "${PLACED_TEXT}" · DB slot_id = 추천 칸 → 화면 2`, async ({ browser }, info) => {
      const f = await fresh(info);
      await prepState(f);
      const user = who === "teacher" ? f.teacher : f.admin;
      const name = nameOf("과산화수소");
      const { context, page, viewport } = await openTemp(browser, info, user, intakePath({ tab: "register" }));
      try {
        await register(page, name, OX);
        const box = suggestBox(page);
        await expect(box, `${LOCATION_SUGGEST} 1개`).toHaveCount(1, { timeout: SAVE_TIMEOUT });
        expect(new URL(page.url()).pathname, "등록 뒤 화면 7 에 머문다").toBe(routeOf(7));
        const made = await reagentByName(f.school.id, name);
        expect(made.slot_id, "등록 직후 칸 없음").toBeNull();
        const want = await expectedFor(user, { id: made.id, storage_class: OX });
        expect(want, "기대 추천 (DB 계산)").not.toBeNull();
        for (const c of V7) expect(await countComponent(page, c), `variants["7"].suggest ${c}`).toBeGreaterThanOrEqual(1);
        await expect(box.getByRole("heading", { name: exact("보관 위치 정하기") })).toBeVisible();
        const row = box.locator(SUGGEST_ROW);
        await expect(row, "시약 줄 1개 (새 시약 1개)").toHaveCount(1);
        const text = (await row.innerText()).replace(/\s+/g, " ");
        for (const t of [name, OX, SUGGEST_PREFIX, String(want!.number), placeText(want!), BADGE_TEXT]) expect(text, `줄 글자 "${t}"`).toContain(t);
        await expect(row.locator(sel(SUGGEST_BADGE)), "추천 위치 줄 suggest-badge").toHaveCount(1);
        await expectBadgeLook(row.locator(sel(SUGGEST_BADGE)), "등록 직후 배지");
        await expect(row.getByRole("link", { name: new RegExp(OTHER_SLOT) }).or(row.getByRole("button", { name: new RegExp(OTHER_SLOT) })), `[${OTHER_SLOT}]`).toHaveCount(1);
        await expect(row.getByRole("button", { name: new RegExp(PLACE_HERE) }), `[${PLACE_HERE}]`).toHaveCount(1);
        await expect(box.getByRole("button", { name: exact(LATER) }), `"${LATER}"`).toHaveCount(1);
        await expectTapHeights(box);
        // 모바일: tab-bar 가 가리지 않음 · 데스크톱: tab-bar 없음
        if (viewport === "mobile") {
          const bar = page.locator(sel(rules.tab_bar.component));
          await expect(bar).toHaveCount(1);
          await box.getByRole("button", { name: exact(LATER) }).scrollIntoViewIfNeeded();
          expect(await onTop(box.getByRole("button", { name: exact(LATER) })), `"${LATER}" 가려지지 않음`).toBe(true);
        } else await expect(page.locator(sel(rules.tab_bar.component))).toHaveCount(0);
        if (who === "teacher") await page.screenshot({ path: join(process.cwd(), "test-results", `v1-7-suggest-${viewport}.png`), fullPage: false });

        await row.getByRole("button", { name: new RegExp(PLACE_HERE) }).click();
        await expect(row.getByText(PLACED_TEXT), `"${PLACED_TEXT}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
        await expect.poll(() => slotIdOf(made.id), { message: "DB slot_id = 추천 칸", timeout: SAVE_TIMEOUT }).toBe(want!.slotId);
        await page.waitForURL((u) => u.pathname === LIST_HREF, { timeout: 30_000 });
      } finally {
        await context.close();
      }
    });
  }

  test(`[C1][S7] 일회용 교사 등록 직후 [${OTHER_SLOT}] → 화면 3 ?${PICK_QUERY} · 위치 피커가 열린 채 · 추천 칸 처음 선택 (DB slot_id 그대로) / "${LATER}" → 화면 2 · slot_id 그대로 null`, async ({ browser }, info) => {
    const f = await fresh(info);
    const st = await prepState(f);
    const { context, page } = await openTemp(browser, info, f.teacher, intakePath({ tab: "register" }));
    try {
      const name = nameOf("질산은");
      await register(page, name, OX);
      await expect(suggestBox(page)).toHaveCount(1, { timeout: SAVE_TIMEOUT });
      const made = await reagentByName(f.school.id, name);
      const want = (await expectedFor(f.teacher, { id: made.id, storage_class: OX }))!;
      const other = suggestBox(page).locator(SUGGEST_ROW).getByRole("link", { name: new RegExp(OTHER_SLOT) }).or(suggestBox(page).locator(SUGGEST_ROW).getByRole("button", { name: new RegExp(OTHER_SLOT) }));
      await other.click();
      await page.waitForURL((u) => u.pathname === detailPath(made.id) && u.searchParams.get("pick") === "location", { timeout: 30_000 });
      await waitDetail(page);
      const p = picker(page);
      await expect(p, "피커가 열린 채").toBeVisible({ timeout: SAVE_TIMEOUT });
      expect(await activePickerPill(p), "추천 시약장").toBe(want.label);
      expect(await pressedKeys(p, DOUBLE, st.shelves), "처음 선택 = 추천 칸").toEqual([want.key]);
      await expect(p.locator(PICKER_SUGGEST_ROW)).toHaveCount(1);
      expect(await slotIdOf(made.id), "[다른 칸] 만으로는 DB 그대로").toBeNull();

      // 나중에
      const name2 = nameOf("과망가니즈산칼륨");
      await page.goto(intakePath({ tab: "register" }));
      await register(page, name2, OX);
      await expect(suggestBox(page)).toHaveCount(1, { timeout: SAVE_TIMEOUT });
      await suggestBox(page).getByRole("button", { name: exact(LATER) }).click();
      await page.waitForURL((u) => u.pathname === LIST_HREF, { timeout: 30_000 });
      expect((await reagentByName(f.school.id, name2)).slot_id, `"${LATER}" → slot_id 그대로 null`).toBeNull();
    } finally {
      await context.close();
    }
  });

  test(`[C1][S7] 일회용 교사 등록 직후 추천 없음(분류에 맞는 칸 없음): ${LOCATION_SUGGEST} "${NO_SLOT_TEXT}" + 시약장 설정(${CABINETS_HREF}) · ${SUGGEST_BADGE}·[${PLACE_HERE}] 0 · "${LATER}" → 화면 2 / 시약장 0개 학교: ${LOCATION_SUGGEST} 없이 바로 화면 2`, async ({ browser }, info) => {
    const f = await fresh(info);
    await prepState(f);
    const { context, page } = await openTemp(browser, info, f.teacher, intakePath({ tab: "register" }));
    try {
      const name = nameOf("납");
      await register(page, name, TOX);
      const box = suggestBox(page);
      await expect(box).toHaveCount(1, { timeout: SAVE_TIMEOUT });
      const made = await reagentByName(f.school.id, name);
      expect(await expectedFor(f.teacher, { id: made.id, storage_class: TOX }), "대조: 추천 없음").toBeNull();
      await expect(box.getByText(NO_SLOT_TEXT, { exact: true }), `"${NO_SLOT_TEXT}"`).toBeVisible();
      const settings = box.locator(`a[href="${CABINETS_HREF}"]`);
      await expect(settings, "시약장 설정 링크").toHaveCount(1);
      await expect(settings).toContainText("시약장 설정");
      expect(await countComponent(page, SUGGEST_BADGE), "추천 없음 → suggest-badge 0").toBe(0);
      await expect(box.getByRole("button", { name: new RegExp(PLACE_HERE) }), `[${PLACE_HERE}] 0`).toHaveCount(0);
      await expectTapHeights(box);
      await box.getByRole("button", { name: exact(LATER) }).click();
      await page.waitForURL((u) => u.pathname === LIST_HREF, { timeout: 30_000 });
      expect((await reagentByName(f.school.id, name)).slot_id).toBeNull();

      // 시약장 0개
      await purgeSchool(f.school.id);
      const name2 = nameOf("황산구리");
      await page.goto(intakePath({ tab: "register" }));
      await register(page, name2, OX);
      await page.waitForURL((u) => u.pathname === LIST_HREF, { timeout: 30_000 });
      expect(await countComponent(page, LOCATION_SUGGEST), "시약장 0개 → location-suggest 없음").toBe(0);
      expect((await reagentByName(f.school.id, name2)).slot_id).toBeNull();
    } finally {
      await context.close();
    }
  });
});
