// 화면 3 (시약 상세) 디자인 1.15 — 보관 위치(reagent-location · location-edit · location-picker) · 재주문 기준(reorder-threshold · threshold-edit):
// C1 · R-ui · C2 · N1-ui
// 기준(구현이 아니라 여기서 도출): design/rules.json 1.15 (screens_required["3"], variants["3"].location, cabinet.class_mismatch·incompatible·
//       slot_assign_roles·number, reorder.threshold_edit, roles R5·R7, guest.hidden_components, tab_bar), harness/d7-data.md §11·§14,
//       디자인 run 20261006-1223 s2-spec "## 화면 3"·"## 상태 화면 3-location", design/frames/3-*.json.
//
// 쓰기 흐름(위치 저장·칸 없음으로·기준 저장)은 일회용 학교·일회용 계정·임시 시약으로만 한다. 공용 학교 A 계정은 읽기·피커 열고 닫기만(쓰기 0건).
import { readFileSync } from "node:fs";
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { ROLE_LABEL, SCHOOL_A_ROLES } from "./db-helpers";
import { demoReagents, guestDetailPath, openGuest } from "./guest-helpers";
import { browserClient, browserSession, countComponent, routeOf, rules, sel, seedRows } from "./screen-helpers";
import { detailPath, detailScope, waitDetail } from "./screen-3-helpers";
import { MANUAL_SOURCE_TEXT } from "./reorder-auto-helpers";
import { HAS_SERVICE, clientFor, openTemp, service } from "./screen-8-helpers";
import { expectedSuggestion, suggestRowsOf } from "./suggest-helpers";
import {
  CAB,
  DOUBLE,
  NO_S11_RESIDUE,
  NUMBER,
  SLOT,
  SWITCHER,
  boxOf,
  cleanup,
  dbView,
  dbViewByService,
  exact,
  expectBoard,
  hydrated,
  makeFixture,
  onTop,
  prepCabinet,
  prepLayout,
  prepPlace,
  prepReagent,
  purgeSchool,
  readPills,
  readSlots,
  sharedCabinetSnapshot,
  watchActions,
  type PrepReagent,
  type S11Fixture,
} from "./screen-11-helpers";
import { framePath } from "../frames";
import { DRAWER_W, drawer, isDeskPage, newFrame } from "./desk-helpers";
/** 시안 3-location-desktop location-picker 폭 (드로어 왼쪽 팝오버) */
const PICKER_W = newFrame("3-location-desktop").find((n) => n.name === "location-picker")!.width!;
import { adjustPreDesktopShell } from "../desktop-shell";

test.describe.configure({ mode: "default" });

const SCREEN = 3;
const GROUP = "s3l";
const SAVE_TIMEOUT = 20_000;
const CABINETS_HREF = routeOf(11);
const REORDER_HREF = routeOf(6);
const R5 = rules.roles.R5;
const R7 = rules.roles.R7;
// 1.17 variants["3"].location (suggest-badge 포함 — dev-rules 1.5 부터 components 안)
const VARIANT = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)].location;
const REQUIRED = rules.screens_required[String(SCREEN)] as string[];
const HIDDEN = (rules as unknown as { guest: { hidden_components: string[] } }).guest.hidden_components;

const LOC = "reagent-location";
const LOC_EDIT = "location-edit";
const PICKER = "location-picker";
const THRESH = "reorder-threshold";
const THRESH_EDIT = "threshold-edit";
const MIX = "mix-warning";
const BADGE = "badge-low-stock";
const CARD = "reagent-detail-card";
const TOAST = "ex-toast";
const COUNT = "slot-count";

// ---------- 문구 (s2-spec 1.15 화면 3 · 3-location, d7 §11·§14) ----------
const LOC_CAPTION = "보관 위치";
const LOC_EDIT_LABEL = "위치 바꾸기";
const PICKER_TITLE = "보관 위치 바꾸기";
const UNASSIGN_ACTION = `${CAB.unassigned_label}으로`;
const THRESH_CAPTION = "재주문 기준";
const THRESH_NONE = "아직 없어요";
/** 직접 입력한 기준(0 포함)의 출처 줄 (d7 §11-1 — D3 run 20261006-1934 부터 화면 3 에 표시) */
const THRESH_MANUAL = MANUAL_SOURCE_TEXT;
const TOAST_PLACED = "보관 위치를 바꿨어요";
const SAVE = "저장";
/** "1번 시약장 · 우 1단" (s2-spec 화면 3 reagent-location, 양문형) */
const slotTitle = (key: string) => `${key[0] === "L" ? "좌" : "우"} ${key.slice(1)}단`;
const locationText = (label: string, key: string) => `${label} · ${slotTitle(key)}`;
/** "재주문 기준을 3병으로 바꿨어요" (s2-spec 화면 3 ex-toast) */
const toastThreshold = (v: string, unit: string) => `재주문 기준을 ${v}${unit}으로 바꿨어요`;
const josa = (word: string, batchim: string, vowel: string) => {
  const code = word.charCodeAt(word.length - 1);
  return `${word}${(code - 0xac00) % 28 !== 0 ? batchim : vowel}`;
};
/** rules cabinet.class_mismatch + s2-spec 3-location mix-warning 문구 */
function placementLines(reagentClass: string, slotClasses: string[], others: string[]): { kind: "none" | "mismatch" | "incompatible"; lines: string[] } {
  const around = new Set([...slotClasses, ...others]);
  const pairs = CAB.incompatible.filter(([a, b]) => (a === reagentClass && around.has(b)) || (b === reagentClass && around.has(a)));
  if (pairs.length) return { kind: "incompatible", lines: [...pairs.map(([a, b]) => `${josa(a, "과", "와")} ${josa(b, "은", "는")} 섞으면 위험해요`), "그래도 저장할 수 있어요"] };
  if (slotClasses.length && !slotClasses.includes(reagentClass)) return { kind: "mismatch", lines: [`이 칸은 ${slotClasses[0]} 칸이에요 — 그래도 넣을 수 있어요`] };
  return { kind: "none", lines: [] };
}
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const nospace = (s: string) => s.replace(/[\s,]/g, "");

// ---------- 요소 ----------
/** 시약 정보 묶음: 390 = reagent-detail-card / 1440 = 시약 목록 옆 드로어 (시안 3-desktop 정보 줄 — d7 §23 run b) */
const card = (page: Page) => (isDeskPage(page) ? drawer(page) : page.locator(`main ${sel(CARD)}`));
const locRow = (page: Page) => page.locator(`main ${sel(LOC)}`);
const thrRow = (page: Page) => page.locator(`main ${sel(THRESH)}`);
const picker = (page: Page) => page.locator(sel(PICKER));
const locEditButton = (page: Page) => locRow(page).locator(sel(LOC_EDIT)).getByRole("button");
const pencil = (page: Page) => thrRow(page).locator(`${sel(THRESH_EDIT)} button`).first();
const thrInput = (page: Page) => thrRow(page).locator(`${sel("text-input")} input`);
const pickerPill = (page: Page, label: string) => picker(page).locator(`${sel(SWITCHER)} button`).filter({ has: page.getByText(exact(label)) });
const pickerSlot = (page: Page, door: string, key: string) => {
  const sides = door === DOUBLE ? ["L", "R"] : ["L"];
  const order = Array.from({ length: 4 }, (_, i) => i + 1).flatMap((s) => sides.map((x) => `${x}${s}`));
  return picker(page).locator(sel(SLOT)).nth(order.indexOf(key));
};
const pickerSave = (page: Page) => picker(page).locator(sel("button-primary")).filter({ hasText: exact(SAVE) });

/** 한 번의 누름 안에서 여러 번 누른다 (연타) */
const burst = (l: Locator) =>
  l.evaluate((el) => {
    for (let i = 0; i < 3; i += 1) (el as HTMLElement).click();
  });

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator(sel(TOAST)).filter({ hasText: typeof text === "string" ? exact(text) : text }), `${TOAST} "${text}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
}

/** reagent-location 값: 번호(cabinet-number) · 문구 */
async function readLocation(page: Page): Promise<{ number: string | null; text: string }> {
  return locRow(page).evaluate(
    (el, [numSel, editSel]) => {
      const n = el.querySelector(numSel)?.textContent?.trim() ?? null;
      // 보이는 글자(innerText)에서 번호 원·위치 바꾸기 버튼을 뺀다: 잠깐 숨기고 읽는다
      const hide = Array.from(el.querySelectorAll<HTMLElement>(`${numSel}, ${editSel}`));
      const prev = hide.map((h) => h.style.display);
      for (const h of hide) h.style.display = "none";
      const text = (el as HTMLElement).innerText;
      hide.forEach((h, i) => (h.style.display = prev[i]));
      return { number: n, text: text.replace(/\s+/g, " ").trim() };
    },
    [sel(NUMBER), sel(LOC_EDIT)] as const,
  );
}

async function expectLocation(page: Page, want: { number: number; label: string; key: string } | null, what: string): Promise<void> {
  await expect
    .poll(() => readLocation(page), { message: `${what}: ${LOC}`, timeout: SAVE_TIMEOUT })
    .toEqual(want ? { number: String(want.number), text: `${LOC_CAPTION} ${locationText(want.label, want.key)}` } : { number: null, text: `${LOC_CAPTION} ${CAB.unassigned_label}` });
}

/** reorder-threshold 글자 (연필 버튼 제외) */
async function thresholdText(page: Page): Promise<string> {
  return thrRow(page).evaluate((el, editSel) => {
    const hide = Array.from(el.querySelectorAll<HTMLElement>(editSel));
    const prev = hide.map((h) => h.style.display);
    for (const h of hide) h.style.display = "none";
    const text = (el as HTMLElement).innerText;
    hide.forEach((h, i) => (h.style.display = prev[i]));
    return text.replace(/\s+/g, " ").trim();
  }, sel(THRESH_EDIT));
}

function frameCounts(name: string): Record<string, number> {
  const j = JSON.parse(readFileSync(framePath(`${name}`), "utf8")) as { frames: { nodes: { name: string }[] }[] };
  const out: Record<string, number> = {};
  for (const n of j.frames[0].nodes) out[n.name] = (out[n.name] ?? 0) + 1;
  // 예전 데스크톱 프레임의 nav-pill → 지금 셸 app-sidebar (rules 1.22 desktop_shell, d7 §23)
  return adjustPreDesktopShell(name, out);
}

type DbReagent = {
  id: string;
  slot_id: string | null;
  min_stock: number;
  stock: number;
  reorder_per_group: number | null;
  reorder_groups: number | null;
  min_stock_source: string;
};
async function reagentByService(id: string): Promise<DbReagent> {
  const r = await service().from("reagents").select("id, slot_id, min_stock, stock, reorder_per_group, reorder_groups, min_stock_source").eq("id", id).single();
  if (r.error) throw new Error(`시약 대조 조회 실패: ${r.error.message}`);
  const d = r.data as Record<string, unknown>;
  return {
    id: d.id as string,
    slot_id: (d.slot_id as string | null) ?? null,
    min_stock: Number(d.min_stock),
    stock: Number(d.stock),
    reorder_per_group: d.reorder_per_group === null ? null : Number(d.reorder_per_group),
    reorder_groups: d.reorder_groups === null ? null : Number(d.reorder_groups),
    min_stock_source: d.min_stock_source as string,
  };
}

/**
 * 준비: 재주문 기준을 'manual' 0(알림 없음)으로 — 일회용 교사 세션의 set_reorder_threshold (d7 §14).
 * d7 §11-1(2026-10-06) 부터 새 시약은 자동 기준(첫 입고량 × 20%)으로 시작하므로, "기준 없음(아직 없어요)" 상태는 이렇게 만든다.
 */
async function prepNoThreshold(f: S11Fixture, id: string): Promise<void> {
  const teacher = await clientFor(f.teacher);
  const res = await teacher.rpc("set_reorder_threshold", { p_reagent_id: id, p_min_stock: 0 });
  expect(res.error, `준비: set_reorder_threshold 0 (${res.error?.message})`).toBeNull();
  expect(await reagentByService(id), "준비: 기준 없음 (manual 0)").toMatchObject({ min_stock: 0, min_stock_source: "manual" });
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

type LocState = {
  c1: { id: string; number: number; label: string };
  c2: { id: string; number: number; label: string };
  layout2: Record<string, string[]>;
  x: PrepReagent & { cls: string };
};

/**
 * s2-spec 3-location 예시: 과산화수소(산화제)가 1번 시약장 · 우 1단(산화제) — 2번 시약장 좌 2단(유기)으로 옮기면 산화제·유기 강한 경고.
 * 2번 시약장: 좌1단 = 산(시약 1: 산) · 좌2단 = 유기(시약 1: 유기) → slot-count 가 있는 피커.
 */
async function prepLocState(f: S11Fixture): Promise<LocState> {
  const c1 = await prepCabinet(f);
  const c2 = await prepCabinet(f);
  const xCls = "산화제";
  await prepLayout(f, c1.id, DOUBLE, 3, { R1: [xCls] });
  const layout2 = { L1: ["산"], L2: ["유기"] };
  await prepLayout(f, c2.id, DOUBLE, 3, layout2);
  const x = { ...(await prepReagent(f, "과산화수소", 2, "병", xCls, nameOf("과산화수소"))), cls: xCls };
  await prepPlace(f, x.id, c1.id, "R1");
  const a = await prepReagent(f, "염산", 1, "병", "산", nameOf("염산"));
  await prepPlace(f, a.id, c2.id, "L1");
  const e = await prepReagent(f, "에탄올", 200, "mL", "유기", nameOf("에탄올"));
  await prepPlace(f, e.id, c2.id, "L2");
  return { c1: { id: c1.id, number: Number(c1.number), label: c1.label }, c2: { id: c2.id, number: Number(c2.number), label: c2.label }, layout2, x };
}

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

  test(`[C1][S${SCREEN}] 일회용 교사 보관 위치: ${LOC} = DB(번호·시약장 이름·칸) · "${LOC_EDIT_LABEL}" → ${PICKER}(variants["3"].location ${VARIANT.join("·")} + ${COUNT}·${MIX}) · 시약장 전환·칸 선택·경고 문구(rules class_mismatch·incompatible) · 저장 연타 → 요청 1건·토스트·${LOC} 갱신·DB slot_id·화면 11 slot-count 반영 · "${UNASSIGN_ACTION}" → slot_id null·"${CAB.unassigned_label}"`, async ({ browser }, info) => {
    const f = await fresh(info);
    const st = await prepLocState(f);
    const { context, page, viewport } = await openTemp(browser, info, f.teacher, detailPath(st.x.id));
    const actions = watchActions(page);
    try {
      await waitDetail(page);
      for (const c of REQUIRED) expect(await countComponent(page, c), `screens_required ${c}`).toBeGreaterThanOrEqual(1);
      await expectLocation(page, { number: st.c1.number, label: st.c1.label, key: "R1" }, "처음");
      // s2-spec 화면 3 순서: 입고일 → 보관 위치 → 재주문 기준 (카드 안)
      const lb = await boxOf(locRow(page));
      const tb = await boxOf(thrRow(page));
      expect(lb.bottom, `${LOC} 는 ${THRESH} 위`).toBeLessThanOrEqual(tb.top + 0.5);
      const cb = await boxOf(card(page));
      expect(lb.top >= cb.top && tb.bottom <= cb.bottom + 0.5, `${LOC}·${THRESH} 는 ${CARD} 안`).toBe(true);
      await expect(locEditButton(page), `${LOC_EDIT} "${LOC_EDIT_LABEL}"`).toHaveText(exact(LOC_EDIT_LABEL));
      for (const c of VARIANT) expect(await countComponent(page, c), `기본 상태 ${c} 0 (피커는 닫힘)`).toBe(0);

      await hydrated(locEditButton(page));
      await locEditButton(page).click();
      const p = picker(page);
      await expect(p, PICKER).toBeVisible();
      await expect(p.getByRole("heading", { name: exact(PICKER_TITLE) })).toBeVisible();
      await expect(p.getByText(exact(`${st.x.name} · ${st.x.cls}`)), "보조 caption = 시약명 · 분류").toBeVisible();
      for (const c of VARIANT) expect(await countComponent(page, c), `variants["3"].location ${c}`).toBeGreaterThanOrEqual(1);
      // 피커의 시약장 전환 = 자기 학교 시약장(번호·이름), 처음 = 지금 위치의 시약장
      expect(await readPills(page, p.locator(sel(SWITCHER))), "피커 pill = DB 시약장 (번호 순)").toEqual([
        { number: st.c1.number, label: st.c1.label },
        { number: st.c2.number, label: st.c2.label },
      ]);
      await expect(p.locator(`${sel(SWITCHER)} [aria-current="true"]`).getByText(exact(st.c1.label)), "처음 = 지금 시약장").toHaveCount(1);
      await expect(p.locator(sel("cabinet-add")), "피커 안에 cabinet-add 없음").toHaveCount(0);
      await expect(pickerSave(page), "칸을 고르기 전 저장 비활성").toBeDisabled();
      let db = await dbViewByService(f.school.id);
      expect((await readSlots(page, p)).map((s) => s.count), "1번 시약장 칸 slot-count = DB").toEqual(["L1", "R1", "L2", "R2", "L3", "R3"].map((k) => db.counts[st.c1.id][k] ?? 0));

      // 2번 시약장으로 전환
      await pickerPill(page, st.c2.label).click();
      await expect(p.locator(`${sel(SWITCHER)} [aria-current="true"]`).getByText(exact(st.c2.label))).toHaveCount(1);
      await expect(p.locator(sel(SLOT)), "2번 시약장 칸 수 = 양문형 × 3단").toHaveCount(6);
      await expect
        .poll(async () => (await readSlots(page, p)).map((s) => s.count), { message: "2번 시약장 slot-count = DB" })
        .toEqual(["L1", "R1", "L2", "R2", "L3", "R3"].map((k) => db.counts[st.c2.id][k] ?? 0));
      await expect(p.locator(sel(COUNT)).first(), `${COUNT} 보임`).toBeVisible();
      const mix = p.locator(sel(MIX));
      for (const key of ["L1", "R3", "L2"]) {
        await pickerSlot(page, DOUBLE, key).click();
        await expect(pickerSlot(page, DOUBLE, key), `칸 ${key} 고름`).toHaveAttribute("aria-pressed", "true");
        await expect(p.locator(`${sel(SLOT)}[aria-pressed="true"]`), "고른 칸은 하나").toHaveCount(1);
        const others = (db.inSlot[st.c2.id][key] ?? []).map((r) => r.storage_class ?? "").filter(Boolean);
        const w = placementLines(st.x.cls, st.layout2[key] ?? [], others);
        if (w.kind === "none") await expect(mix, `칸 ${key}: 경고 없음`).toHaveCount(0);
        else {
          await expect(mix, `칸 ${key}: ${w.kind} ${MIX}`).toHaveCount(1);
          const text = squash(await mix.innerText());
          for (const line of w.lines) expect(text, `칸 ${key} 경고 "${line}"`).toContain(line);
        }
        await expect(pickerSave(page), `칸 ${key}: 저장 활성 (경고는 막지 않는다)`).toBeEnabled();
      }
      // 시안 3-location 상태: 모든 상태 컴포넌트
      for (const c of [...VARIANT, COUNT, MIX, NUMBER]) expect(await countComponent(page, c), `3-location ${c}`).toBeGreaterThanOrEqual(1);
      const frame = frameCounts(`${SCREEN}-location-${viewport}`);
      expect(await countComponent(page, PICKER), `시안 3-location ${PICKER} = ${frame[PICKER]}`).toBe(frame[PICKER]);
      expect(await p.locator(sel(SLOT)).count(), `시안 3-location ${SLOT} = ${frame[SLOT]} (양문형 3단)`).toBe(frame[SLOT]);
      await expectLocation(page, { number: st.c1.number, label: st.c1.label, key: "R1" }, "저장 전 (옛 위치)");
      expect(actions.count(), "저장 전 쓰기 요청 0건").toBe(0);

      // 저장 (연타)
      await burst(pickerSave(page));
      await expectToast(page, TOAST_PLACED);
      await expect(p, "저장 → 피커 닫힘").toHaveCount(0);
      expect(actions.count(), "연타에도 저장 요청 1건").toBe(1);
      db = await dbViewByService(f.school.id);
      expect((await reagentByService(st.x.id)).slot_id, "DB: slot_id = 2번 시약장 좌2단").toBe(db.slotIds[st.c2.id].L2);
      await expectLocation(page, { number: st.c2.number, label: st.c2.label, key: "L2" }, "저장 뒤");

      // 화면 11 의 slot-count 반영
      await page.goto(`${CABINETS_HREF}?c=${st.c2.id}`);
      await expect(page.locator(`main ${sel(SWITCHER)}`)).toBeVisible({ timeout: 45_000 });
      await expectBoard(page, DOUBLE, 3, st.layout2, "화면 11 (옮긴 뒤)", db.counts[st.c2.id]);
      expect(db.counts[st.c2.id].L2, "대조: 좌2단 시약 2").toBe(2);

      // 칸 없음으로
      await page.goto(detailPath(st.x.id));
      await waitDetail(page);
      await hydrated(locEditButton(page));
      await locEditButton(page).click();
      await expect(p).toBeVisible();
      // d7 §17: 지금 칸(2번 좌2단 유기)은 산화제의 추천 칸이 아니다 — 추천 칸(DB 로 계산: 1번 우1단, 이제 비었음)이 다른 시약장이면 그 시약장으로 열고 처음 선택으로 둔다
      const sug = expectedSuggestion(await suggestRowsOf(await clientFor(f.teacher)), { id: st.x.id, storage_class: st.x.cls });
      expect([sug?.cabinetId, sug?.key], "대조: 추천 칸 = 1번 시약장 우1단").toEqual([st.c1.id, "R1"]);
      await expect(p.locator(`${sel(SWITCHER)} [aria-current="true"]`).getByText(exact(st.c1.label)), "처음 = 추천 칸의 시약장(1번, 지금 위치 2번이 아니라)").toHaveCount(1);
      await expect(p.locator(`${sel(SLOT)}[aria-pressed="true"]`), "처음 선택 = 추천 칸 하나").toHaveCount(1);
      await expect(pickerSlot(page, DOUBLE, "R1"), "처음 선택 = 우1단").toHaveAttribute("aria-pressed", "true");
      await expect(pickerSlot(page, DOUBLE, "R1").locator(sel("suggest-badge")), "추천 칸 suggest-badge").toHaveCount(1);
      const unassign = p.getByRole("button", { name: exact(UNASSIGN_ACTION) });
      await expect(unassign, `"${UNASSIGN_ACTION}"`).toHaveCount(1);
      await burst(unassign);
      await expectToast(page, new RegExp(CAB.unassigned_label));
      await expect(p).toHaveCount(0);
      expect(actions.count(), `"${UNASSIGN_ACTION}" 연타에도 요청 1건`).toBe(2);
      expect((await reagentByService(st.x.id)).slot_id, "DB: slot_id null").toBeNull();
      await expectLocation(page, null, "칸 없음으로 뒤");
      await expect(locRow(page).locator(sel(NUMBER)), "칸 없음이면 번호 없음").toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "가로 스크롤 없음").toBe(true);
    } finally {
      await context.close();
    }
  });

  test(`[R-ui][S${SCREEN}] 일회용 학생 시약 상세: ${LOC}·${THRESH} 값은 보임 · ${LOC_EDIT}·${THRESH_EDIT}·${PICKER} 0 (R5·R7) · 응답 본문에 그 컴포넌트 없음 · 학생 상세 본문(390 main / 1440 드로어)에 피커 데이터(다른 시약장 이름) 없음 — 같은 시약의 교사는 위치 바꾸기에서 보임(대조) · 쓰기 0건`, async ({ browser }, info) => {
    const f = await fresh(info);
    const st = await prepLocState(f);
    // 학생에게 보이는 재주문 기준 줄 = 직접 입력 0 상태 ("아직 없어요" + 출처 "직접 입력", d7 §11-1 — 모든 역할 같은 표시)
    await prepNoThreshold(f, st.x.id);
    expect(R5.components, "R5 에 threshold-edit").toContain(THRESH_EDIT);
    expect(R7.components, "R7 에 location-edit").toContain(LOC_EDIT);
    // 대조: 교사는 위치 바꾸기(피커)에서 옮길 수 있는 다른 시약장 이름을 본다.
    // (d7 §23 run b: 응답 HTML 에는 폭 전용 사본으로 데스크톱 시약 목록이 함께 렌더되어, 같은 학교 시약장 이름이 목록·필터 몫으로 들어간다 —
    //  같은 학교 데이터라 노출 금지 대상이 아니다(다른 학교 노출 금지 N1 은 screen-3-isolation). 그래서 "피커 데이터 없음"은 상세 본문에서 본다)
    const t = await openTemp(browser, info, f.teacher, detailPath(st.x.id));
    try {
      await waitDetail(t.page);
      await expect(async () => {
        if (!(await picker(t.page).isVisible())) await locEditButton(t.page).click({ timeout: 5_000 });
        await expect(picker(t.page)).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await expect(picker(t.page), "대조: 교사 피커에 다른 시약장 이름").toContainText(st.c2.label);
    } finally {
      await t.context.close();
    }
    const { context, page, response } = await openTemp(browser, info, f.student, detailPath(st.x.id));
    const actions = watchActions(page);
    try {
      await waitDetail(page);
      const html = await response!.text();
      for (const c of [LOC_EDIT, THRESH_EDIT, PICKER, "slot-assign", "qr-print"]) {
        expect(await countComponent(page, c), `학생 ${c}`).toBe(0);
        expect(html, `학생 응답 본문 ${c}`).not.toContain(`data-component="${c}"`);
      }
      expect(await detailScope(page).innerText(), "학생 상세 본문(390 main / 1440 드로어)에 피커 데이터(다른 시약장 이름) 없음").not.toContain(st.c2.label);
      await expectLocation(page, { number: st.c1.number, label: st.c1.label, key: "R1" }, "학생");
      expect(await thresholdText(page), "학생 재주문 기준 줄 (값 + 출처)").toBe(`${THRESH_CAPTION} ${THRESH_NONE} ${THRESH_MANUAL}`);
      await expect(locRow(page).getByRole("button"), "학생 보관 위치 줄에 버튼 없음").toHaveCount(0);
      await expect(thrRow(page).getByRole("button"), "학생 재주문 기준 줄에 버튼 없음").toHaveCount(0);
      expect(actions.count(), "쓰기 요청 0건").toBe(0);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S${SCREEN}] 일회용 교사 재주문 기준(rules reorder.threshold_edit · d7 §14): ${THRESH} 문구 = DB(근거 있음 "1반 1회 실험량 … × …조 기준" / 직접 값 / 0 = "${THRESH_NONE}") · 연필 → 숫자 입력·검증(빈 값·음수·문자 → 안내·요청 0) · 저장 연타 → 요청 1건·토스트·문구 갱신·DB min_stock 덮어씀·근거 null · 재고보다 크면 ${BADGE}·화면 6 알림 · 0 → 알림 없음`, async ({ browser }, info) => {
    const f = await fresh(info);
    const teacherClient = await clientFor(f.teacher);
    const basis = await prepReagent(f, "근거", 30, "g", CAB.storage_classes[0], nameOf("시약가"));
    const r1 = await teacherClient.rpc("save_reorder_basis", { p_items: [{ reagent_id: basis.id, per_group: 10, groups: 6 }] });
    expect(r1.error, `준비: save_reorder_basis (${r1.error?.message})`).toBeNull();
    const direct = await prepReagent(f, "직접", 30, "g", CAB.storage_classes[0], nameOf("시약나"));
    const r2 = await teacherClient.rpc("set_reorder_threshold", { p_reagent_id: direct.id, p_min_stock: 5 });
    expect(r2.error, `준비: set_reorder_threshold (${r2.error?.message})`).toBeNull();
    const none = await prepReagent(f, "없음", 7, "g", CAB.storage_classes[0], nameOf("시약다"));
    await prepNoThreshold(f, none.id);
    // 근거 있는 시약: 자동 기준(새 시약)에 save_reorder_basis → 항상 바뀜 → 'basis' (d7 §11-1)
    expect(await reagentByService(basis.id), "대조: 근거 있는 시약").toMatchObject({ min_stock: 60, reorder_per_group: 10, reorder_groups: 6, min_stock_source: "basis" });
    expect(await reagentByService(direct.id), "대조: 직접 값 시약").toMatchObject({ min_stock: 5, reorder_per_group: null, min_stock_source: "manual" });
    expect(await reagentByService(none.id), "대조: 기준 없음").toMatchObject({ min_stock: 0, min_stock_source: "manual" });

    const { context, page } = await openTemp(browser, info, f.teacher, detailPath(basis.id));
    const actions = watchActions(page);
    try {
      // 문구 두 형태 + 없음 (d7 §11: 근거가 있으면 "1반 1회 실험량 {per_group} {unit} × {groups}조 기준")
      await waitDetail(page);
      const t1 = await thresholdText(page);
      expect(nospace(t1), "근거 있는 시약: 값 60g").toContain(nospace(`${THRESH_CAPTION}60g`));
      expect(nospace(t1), "근거 문구").toContain(nospace("1반 1회 실험량 10 g × 6조 기준"));
      await expect(card(page).locator(sel(BADGE)), "재고 30 < 기준 60 → 재고 부족 배지").toHaveCount(1);
      await page.goto(detailPath(direct.id));
      await waitDetail(page);
      expect(nospace(await thresholdText(page)), "직접 값 시약: 값 5g · 근거 문구 대신 출처 \"직접 입력\"").toBe(nospace(`${THRESH_CAPTION} 5g ${THRESH_MANUAL}`));
      await page.goto(detailPath(none.id));
      await waitDetail(page);
      expect(await thresholdText(page), "직접 입력 0 = 아직 없어요 + 출처").toBe(`${THRESH_CAPTION} ${THRESH_NONE} ${THRESH_MANUAL}`);
      await expect(card(page).locator(sel(BADGE)), "기준 없음 → 배지 없음").toHaveCount(0);

      // 연필 → 입력 · 검증
      await hydrated(pencil(page));
      await pencil(page).click();
      await expect(thrInput(page), "숫자 text-input").toBeVisible();
      await expect(thrRow(page), "단위 suffix").toContainText("g");
      const save = thrRow(page).locator(sel("button-primary")).filter({ hasText: exact(SAVE) });
      await expect(save, `"${SAVE}" button-primary`).toHaveCount(1);
      for (const [bad, hint] of [["-1", /0 이상/], ["abc", /숫자/], ["", /입력/]] as const) {
        await thrInput(page).fill(bad);
        const shown = squash(await thrRow(page).innerText());
        expect(shown, `"${bad}" → 안내 ${hint}`).toMatch(hint);
        await save.click({ force: true }).catch(() => undefined);
        await expect(thrInput(page), `"${bad}" 는 저장되지 않는다`).toBeVisible();
      }
      expect(actions.count(), "잘못된 값은 요청 0건").toBe(0);
      expect((await reagentByService(none.id)).min_stock, "DB 그대로").toBe(0);

      // 재고(7)보다 큰 기준 9 → 저장 (연타)
      await thrInput(page).fill("9");
      await expect(save).toBeEnabled();
      await burst(save);
      await expectToast(page, toastThreshold("9", "g"));
      expect(actions.count(), "연타에도 저장 요청 1건").toBe(1);
      await expect.poll(async () => (await reagentByService(none.id)).min_stock, { timeout: SAVE_TIMEOUT }).toBe(9);
      expect((await reagentByService(none.id)).min_stock_source, "직접 입력 → 'manual'").toBe("manual");
      await expect.poll(() => thresholdText(page), { timeout: SAVE_TIMEOUT }).toBe(`${THRESH_CAPTION} 9g ${THRESH_MANUAL}`);
      await expect(card(page).locator(sel(BADGE)), "재고 7 < 기준 9 → 재고 부족 배지").toHaveCount(1, { timeout: SAVE_TIMEOUT });
      // 화면 6 알림에 나타남
      await page.goto(REORDER_HREF);
      await expect(page.locator(`main ${sel("reorder-alert-card")}`).filter({ hasText: none.name }), "화면 6 알림에 그 시약").toHaveCount(1, { timeout: 45_000 });

      // 0 저장 → 알림 없음
      await page.goto(detailPath(none.id));
      await waitDetail(page);
      await hydrated(pencil(page));
      await pencil(page).click();
      await thrInput(page).fill("0");
      await save.click();
      await expectToast(page, /^\s*재주문 기준을 0/);
      await expect.poll(async () => (await reagentByService(none.id)).min_stock, { timeout: SAVE_TIMEOUT }).toBe(0);
      await expect.poll(() => thresholdText(page), { timeout: SAVE_TIMEOUT }).toBe(`${THRESH_CAPTION} ${THRESH_NONE} ${THRESH_MANUAL}`);
      await expect(card(page).locator(sel(BADGE)), "기준 0 → 배지 없음").toHaveCount(0);
      await page.goto(REORDER_HREF);
      await expect(page.locator("main").first()).toBeVisible({ timeout: 45_000 });
      await expect(page.locator(`main ${sel("manual-upload")}`).first(), "화면 6 본문").toBeVisible({ timeout: 45_000 });
      await expect(page.locator(`main ${sel("reorder-alert-card")}`).filter({ hasText: none.name }), "기준 0 → 알림 없음").toHaveCount(0);

      // 근거 있는 시약을 더 작은 값으로 직접 입력 → 그대로 덮어씀(화면 5 의 "더 큰 값 유지"와 다름) · 근거 null
      await page.goto(detailPath(basis.id));
      await waitDetail(page);
      await hydrated(pencil(page));
      await pencil(page).click();
      await expect(thrInput(page), "입력 처음 값 = 지금 기준").toHaveValue("60");
      await thrInput(page).fill("2");
      await save.click();
      await expectToast(page, toastThreshold("2", "g"));
      await expect.poll(async () => reagentByService(basis.id), { timeout: SAVE_TIMEOUT }).toMatchObject({ min_stock: 2, reorder_per_group: null, reorder_groups: null, min_stock_source: "manual" });
      await expect.poll(() => thresholdText(page), { timeout: SAVE_TIMEOUT }).toBe(`${THRESH_CAPTION} 2g ${THRESH_MANUAL}`);
      await expect(card(page).locator(sel(BADGE)), "재고 30 ≥ 기준 2 → 배지 없음").toHaveCount(0);
      expect(actions.count(), "쓰기 요청 = 9 · 0 · 2 세 번").toBe(3);
    } finally {
      await context.close();
    }
  });
});

// =====================================================================
// 공용 학교 A — 읽기·피커 열고 닫기만 (쓰기 0건)
// =====================================================================

/** 학교 A 의 칸에 놓인 시약 1개 (RLS) */
async function placedReagent(page: Page): Promise<string> {
  const { client } = await browserClient(page);
  const one = await client.from("reagents").select("id").not("slot_id", "is", null).order("id").limit(1).single();
  expect(one.error, "대조: 칸에 놓인 시약").toBeNull();
  return one.data!.id as string;
}

test(`[C2][S${SCREEN}] 학교A 교사 시약 상세: 폭 390 = ${PICKER} 아래 끝 = tab-bar 위쪽 선(전폭·tab-bar 가리지 않음)·"${SAVE}" 가려지지 않음 · 카드 → 탭 → MSDS 한 열 / 폭 1440 = tab-bar 0 · 시약 목록 옆 드로어(rules drawer_width) 안 탭 → 정보 줄 → MSDS · ${PICKER} = 드로어 왼쪽 팝오버(시안 3-location-desktop 폭) (쓰기 0건)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const tb = rules.tab_bar;
  const first = await openAs(browser, info, "teacher", 13);
  const id = await placedReagent(first.page);
  await first.context.close();
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN, detailPath(id));
  const actions = watchActions(page);
  try {
    await waitDetail(page);
    const vp = page.viewportSize()!;
    if (viewport === "mobile") {
      const blocks = [card(page), page.locator(`main ${sel("segmented-control")}`).first(), page.locator(`main ${sel("msds-entry")}`).first()];
      const boxes = [];
      for (const b of blocks) boxes.push(await boxOf(b));
      for (let i = 1; i < boxes.length; i += 1) {
        expect(boxes[i].top, "한 열: 카드 → 탭 → MSDS 위에서 아래로").toBeGreaterThan(boxes[i - 1].top);
        expect(Math.abs(boxes[i].left - boxes[0].left), "한 열: 같은 왼쪽").toBeLessThanOrEqual(1);
        expect(Math.abs(boxes[i].width - boxes[0].width), "한 열: 같은 폭").toBeLessThanOrEqual(1);
      }
      expect(Math.abs(boxes[0].width - (vp.width - 32)), "모바일 한 열 폭 = 390 - 좌우 16").toBeLessThanOrEqual(2);
      const bar = page.locator(sel(tb.component));
      await expect(bar).toHaveCount(1);
      await expect(page.locator(sel(tb.item))).toHaveCount(tb.items);
      const barBox = await boxOf(bar);
      await hydrated(locEditButton(page));
      await locEditButton(page).click();
      const p = picker(page);
      await expect(p).toBeVisible();
      const s = await boxOf(p);
      expect(s.bottom, "피커 아래 끝 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual(barBox.top + 0.5);
      expect(barBox.top - s.bottom, "피커는 tab-bar 위쪽 선에 붙는다").toBeLessThanOrEqual(1);
      expect(Math.round(s.left), "피커 전폭(왼쪽)").toBe(0);
      expect(Math.round(s.right), "피커 전폭(오른쪽)").toBe(vp.width);
      expect(s.top, "피커는 화면 안").toBeGreaterThanOrEqual(0);
      expect(await onTop(bar.locator(sel(tb.item)).first()), "tab-bar 가 가려지지 않음").toBe(true);
      await pickerSave(page).scrollIntoViewIfNeeded();
      expect((await boxOf(pickerSave(page))).bottom, `"${SAVE}" 은 tab-bar 위`).toBeLessThanOrEqual(barBox.top + 0.5);
      expect(await onTop(pickerSave(page)), `"${SAVE}" 가려지지 않음`).toBe(true);
    } else {
      await expect(page.locator(sel(tb.component)), "1440 tab-bar").toHaveCount(0);
      await expect(page.locator(sel(tb.item)), "1440 tab-item").toHaveCount(0);
      // 1440 = 시약 목록 옆 오른쪽 드로어 (rules desktop_shell.drawer_width · 시안 3-desktop): 안의 순서 = 탭 → 정보 줄(보관 위치 · 재주문 기준) → MSDS
      const d = await boxOf(drawer(page));
      expect(Math.abs(d.width - DRAWER_W), `드로어 폭 = rules drawer_width ${DRAWER_W}`).toBeLessThanOrEqual(1);
      expect(Math.abs(d.right - vp.width), "드로어는 화면 오른쪽 끝").toBeLessThanOrEqual(1);
      const inner = [drawer(page).locator(sel("segmented-control")).first(), locRow(page), thrRow(page), drawer(page).locator(sel("msds-entry")).first()];
      const ib = [];
      for (const b of inner) ib.push(await boxOf(b));
      for (let i = 1; i < ib.length; i += 1) expect(ib[i].top, "드로어 안: 탭 → 보관 위치 → 재주문 기준 → MSDS 위에서 아래로").toBeGreaterThan(ib[i - 1].top);
      for (const b of ib) expect(b.left >= d.left - 0.5 && b.right <= d.right + 0.5, "드로어 안").toBe(true);
      await hydrated(locEditButton(page));
      await locEditButton(page).click();
      const p = picker(page);
      await expect(p).toBeVisible();
      const s = await boxOf(p);
      // 피커 = 드로어 왼쪽 팝오버 (rules desktop_shell.overlay — 바텀시트·가운데 카드 아님, 시안 3-location-desktop)
      expect(Math.abs(s.width - PICKER_W), `피커 폭 = 시안 ${PICKER_W}`).toBeLessThanOrEqual(1);
      expect(s.right, "피커는 드로어 왼쪽").toBeLessThanOrEqual(d.left + 1);
      expect(s.top, "피커 화면 안 (위)").toBeGreaterThanOrEqual(0);
      expect(s.bottom, "피커 화면 안 (아래)").toBeLessThanOrEqual(vp.height);
      expect(s.width, "피커는 전폭이 아니다").toBeLessThan(vp.width / 2);
    }
    await picker(page).getByRole("button", { name: exact("닫기") }).click();
    await expect(picker(page)).toHaveCount(0);
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[N1-ui][S${SCREEN}] 학교A 교사 ${PICKER}: 시약장 = 자기 학교(RLS 대조, 번호·이름) · 다른 학교 시약장 이름 0 (화면·응답 본문) · 학교명 1종 (쓰기 0건)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const first = await openAs(browser, info, "teacher", 13);
  const id = await placedReagent(first.page);
  await first.context.close();
  const { context, page, response } = await openAs(browser, info, "teacher", SCREEN, detailPath(id));
  const actions = watchActions(page);
  try {
    await waitDetail(page);
    const me = await browserSession(page);
    const db = await dbView(page);
    const ownLabels = new Set(db.cabinets.map((c) => c.label));
    const otherLabels = seedRows("cabinets").map((c) => c.label).filter((l) => !ownLabels.has(l));
    expect(otherLabels.length, "대조: 다른 학교 seed 시약장 이름").toBeGreaterThan(0);
    await hydrated(locEditButton(page));
    await locEditButton(page).click();
    const p = picker(page);
    await expect(p).toBeVisible();
    expect(await readPills(page, p.locator(sel(SWITCHER))), "피커 시약장 = 자기 학교 (번호 순)").toEqual(
      [...db.cabinets].sort((a, b) => a.number - b.number).map((c) => ({ number: c.number, label: c.label })),
    );
    const shown = await page.locator("body").innerText();
    const html = await response!.text();
    for (const l of otherLabels) {
      expect(shown, `화면에 다른 학교 시약장 "${l}"`).not.toContain(l);
      expect(html, `응답 본문에 다른 학교 시약장 "${l}"`).not.toContain(l);
    }
    const names = [...new Set(shown.match(new RegExp(rules.never.N1.school_name_pattern, "g")) ?? [])];
    expect(names, "학교명 종류 = rules never.N1.distinct_school_names").toHaveLength(rules.never.N1.distinct_school_names);
    for (const n of names) expect(me.schoolName, `보이는 학교명 "${n}" 은 자기 학교명의 일부`).toContain(n);
    await p.getByRole("button", { name: exact("닫기") }).click();
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

for (const role of SCHOOL_A_ROLES) {
  const staff = role !== "student";
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 시약 상세: ${THRESH_EDIT}·${LOC_EDIT} ${staff ? "= 시안 3-{폭} 개수" : "0 (R5·R7) · 응답 본문에도 없음"} · ${LOC}·${THRESH} 는 모든 역할`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const first = await openAs(browser, info, role, 13);
    const id = await placedReagent(first.page);
    await first.context.close();
    const { context, page, viewport, response } = await openAs(browser, info, role, SCREEN, detailPath(id));
    try {
      await waitDetail(page);
      const frame = frameCounts(`${SCREEN}-${viewport}`);
      const html = await (response ? response.text() : (await context.request.get(detailPath(id))).text());
      for (const c of [LOC, THRESH]) expect(await countComponent(page, c), `${c}`).toBe(frame[c]);
      for (const c of [THRESH_EDIT, LOC_EDIT]) {
        if (staff) expect(await countComponent(page, c), `${c} = 시안 ${frame[c]}`).toBe(frame[c]);
        else {
          expect(await countComponent(page, c), `학생 ${c}`).toBe(0);
          expect(html, `학생 응답 본문 ${c}`).not.toContain(`data-component="${c}"`);
        }
      }
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S${SCREEN}] 둘러보기 ${routeOf(SCREEN).replace("/reagents", "/demo/reagents")}: rules.json guest.hidden_components(${HIDDEN.filter((c) => [THRESH_EDIT, LOC_EDIT, "slot-assign", "qr-print", "cabinet-add"].includes(c)).join("·")} 포함) 0 · 응답 본문에도 없음`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  for (const c of [THRESH_EDIT, LOC_EDIT, "slot-assign", "qr-print", "cabinet-add"]) expect(HIDDEN, `guest.hidden_components 에 ${c}`).toContain(c);
  const demo = (await demoReagents())[0];
  const { context, page, response } = await openGuest(browser, info, guestDetailPath(demo.id));
  try {
    await expect(card(page).first(), "상세 (390 카드 / 1440 드로어)").toBeVisible({ timeout: 45_000 });
    const html = await response!.text();
    for (const c of HIDDEN) {
      expect(await countComponent(page, c), `둘러보기 ${c}`).toBe(0);
      expect(html, `둘러보기 응답 본문 ${c}`).not.toContain(`data-component="${c}"`);
    }
    expect(await countComponent(page, PICKER), `둘러보기 ${PICKER}`).toBe(0);
  } finally {
    await context.close();
  }
});
