// 화면 7 (입고·시약 등록, dev-rules.json routes["7"]) 테스트 공용 도우미.
// 기준: 디자인 s2-spec "## 화면 7", design/frames/7-{mobile|desktop}.json, harness/d7-data.md §6, dev-rules route_auth 7.
// - 문구(갈래 이름·버튼·안내·토스트)는 위 명세 문장에서 옮긴 상수다 (구현에서 읽지 않는다).
// - DB 값은 그 계정의 브라우저 세션(publishable 키 + RLS)으로만 읽고 쓴다. service role 미사용.
// - 운영 DB: 저장 성공 경로는 테스트 학교(A·B)의 임시 시약(이름 접두사 TEMP_PREFIX)에만. 테스트 끝에 지운다
//   (reagents 삭제 → intake_logs cascade).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { S7_UI_TEMP_PREFIX, signIn, uniqueTag, type Role } from "./db-helpers";
import { browserClient, devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";

export const SCREEN = 7;
export const INTAKE = "stock-intake";
export const REGISTER = "reagent-register";
export const TOAST = "ex-toast";
export const EMPTY = "ex-empty-state-card";
export const SEGMENT = "segmented-control";
export const SEGMENT_ACTIVE = "segmented-control-active";

// ---- s2-spec 화면 7 · 시안 7 프레임 문구 ----
export const TAB_INTAKE = "기존 시약 입고";
export const TAB_REGISTER = "새 시약 등록";
export const SEARCH_PLACEHOLDER = "시약명 검색";
export const SELECTED_CAPTION = "선택한 시약";
export const QUANTITY_LABEL = "입고 수량";
export const QUANTITY_HINT = "1 이상 입력하세요";
export const PRESETS = [1, 5, 10];
export const INTAKE_BUTTON = "입고";
export const REGISTER_BUTTON = "시약 등록";
export const DATE_LABEL = "입고일";
export const REQUIRED_MARK = "필수";
export const REGISTER_REQUIRED = ["시약명", "종류", "재고량", "입고일"];
export const REGISTER_OPTIONAL = ["MSDS 연결 주소"];
export const EMPTY_TITLE = "찾는 시약이 없어요";
export const EMPTY_BODY = "시약명을 확인하거나 새로 등록하세요";
export const TOAST_INTAKE = "입고를 기록했어요";
export const TOAST_REGISTER = "시약을 등록했어요";
export const ACTIVE_TAB_LABEL = "시약";
export const NAV_LABEL = "입고·시약 등록";
/** 모바일: 버튼 아래 끝과 tab-bar 위쪽 선 사이 (s2-spec button-primary) */
export const BUTTON_TAB_GAP = 16;
// ---- d7-data.md §6 ----
export const UNITS = ["병", "mL", "g"];
export const AFTER_SAVE_SCREEN = 2;

/** "종류" = design/rules.json cabinet.storage_classes */
export const STORAGE_CLASSES = (
  JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as { cabinet: { storage_classes: string[] } }
).cabinet.storage_classes;

export const TEMP_PREFIX = S7_UI_TEMP_PREFIX;

export type IntakeQuery = { tab?: string; reagent?: string };

/** routes["7"] + ?tab · ?reagent */
export function intakePath(q: IntakeQuery = {}): string {
  const p = new URLSearchParams();
  if (q.tab) p.set("tab", q.tab);
  if (q.reagent) p.set("reagent", q.reagent);
  const s = p.toString();
  return s ? `${routeOf(SCREEN)}?${s}` : routeOf(SCREEN);
}

export const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

/** 화면 7 에 속한 컴포넌트 (dev-rules components) */
export function screenComponents(): string[] {
  return Object.entries(devRules.components)
    .filter(([, screens]) => screens.includes(SCREEN))
    .map(([n]) => n);
}

/** design/frames/7-{viewport}.json 의 노드 이름별 개수 */
export function frameCounts(viewport: ViewportName): Record<string, number> {
  const j = JSON.parse(readFileSync(join(process.cwd(), "design", "frames", `${SCREEN}-${viewport}.json`), "utf8")) as {
    frames: { nodes: { name: string }[] }[];
  };
  const out: Record<string, number> = {};
  for (const n of j.frames[0].nodes) out[n.name] = (out[n.name] ?? 0) + 1;
  return out;
}

/** 프로젝트(mobile/desktop)·스펙 파일(group)·테스트마다 고유한 임시 시약 이름 */
export function tempName(info: TestInfo, group: string): string {
  return `${TEMP_PREFIX}${group}-${uniqueTag(info)}`;
}

/**
 * 이 스펙 파일(group)·프로젝트가 만든 임시 시약을 그 학교 교사 계정(RLS)으로 쓸어 낸다 — afterAll 용.
 * 테스트가 시간 초과로 끊기면 finally 의 브라우저 세션 삭제가 돌지 못하므로 한 번 더 지운다.
 * 남은 행 수를 돌려준다 (0 이어야 정상). service role 미사용.
 */
export async function sweepTemp(info: TestInfo, group: string, roles: Role[]): Promise<number> {
  const pattern = `${TEMP_PREFIX}${group}-test-${info.project.name}-%`;
  let left = 0;
  for (const role of roles) {
    const s = await signIn(role);
    await s.client.from("reagents").delete().like("name", pattern);
    const { data } = await s.client.from("reagents").select("id").like("name", pattern);
    left += (data ?? []).length;
  }
  return left;
}

/** 오늘 (Asia/Seoul) YYYYMMDD — 입고일 기본값 비교용 (표기 구분자와 무관하게 숫자만 비교) */
export function todayDigits(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date())
    .replace(/\D/g, "");
}

// ---------- 화면 locator ----------
export const intakeForm = (page: Page) => page.locator(`main ${sel(INTAKE)}`);
export const registerForm = (page: Page) => page.locator(`main ${sel(REGISTER)}`);
export const searchInput = (page: Page) => intakeForm(page).getByPlaceholder(SEARCH_PLACEHOLDER);
export const rows = (page: Page) => intakeForm(page).locator(sel("reagent-row"));
export const quantityInput = (page: Page) => intakeForm(page).getByRole("textbox", { name: QUANTITY_LABEL });
export const intakeButton = (page: Page) => intakeForm(page).locator(sel("button-primary")).filter({ hasText: exact(INTAKE_BUTTON) });
export const registerButton = (page: Page) =>
  registerForm(page).locator(sel("button-primary")).filter({ hasText: exact(REGISTER_BUTTON) });
export const chip = (scope: Locator, label: string | number) =>
  scope.locator(sel("button-pill-soft")).filter({ hasText: exact(String(label)) });
export const stepperButton = (page: Page, label: "−" | "+") =>
  intakeForm(page).locator(sel("button-outline")).filter({ hasText: exact(label) });
export const activeSegment = (page: Page) => page.locator(`main ${sel(SEGMENT)} ${sel(SEGMENT_ACTIVE)}`);
export const segmentOption = (page: Page, label: string) => page.locator(`main ${sel(SEGMENT)}`).getByText(exact(label));

/** reagent-row 첫 줄 = 시약명 */
export async function rowNames(page: Page): Promise<string[]> {
  return (await rows(page).allInnerTexts()).map((t) => t.split(/\r?\n/)[0].trim());
}

async function waitHydrated(page: Page, component: string): Promise<void> {
  await page.waitForFunction(
    (s) => {
      const f = document.querySelector(s);
      return !!f && Object.keys(f).some((k) => k.startsWith("__reactProps"));
    },
    `main ${sel(component)}`,
    { timeout: 30_000 },
  );
}

/** 화면 7 이 그려지고 하이드레이션될 때까지 (갈래: intake = stock-intake, register = reagent-register) */
export async function waitIntake(page: Page, tab: "intake" | "register" = "intake"): Promise<void> {
  const form = tab === "intake" ? intakeForm(page) : registerForm(page);
  await expect(form.first(), `${tab === "intake" ? INTAKE : REGISTER} 보임`).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("load");
  await waitHydrated(page, tab === "intake" ? INTAKE : REGISTER);
}

/** segmented-control 로 갈래 전환 */
export async function switchTab(page: Page, tab: "intake" | "register"): Promise<void> {
  const label = tab === "intake" ? TAB_INTAKE : TAB_REGISTER;
  await expect(async () => {
    if (!exact(label).test(await activeSegment(page).innerText())) await segmentOption(page, label).click();
    await expect(activeSegment(page)).toHaveText(exact(label), { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await waitIntake(page, tab);
}

/** 검색어 입력 → 그 이름의 결과 행 선택 → "선택한 시약" 카드에 이름이 보일 때까지 */
export async function searchAndSelect(page: Page, query: string, name: string): Promise<void> {
  await searchInput(page).fill(query);
  const row = rows(page).filter({ hasText: name }).first();
  await expect(row, `검색 결과에 ${name}`).toBeVisible();
  await row.click();
  await expectSelected(page, name);
}

export async function expectSelected(page: Page, name: string): Promise<void> {
  const form = intakeForm(page);
  await expect(form.getByText(exact(SELECTED_CAPTION)), `"${SELECTED_CAPTION}" 카드`).toBeVisible();
  await expect(quantityInput(page), "입고 수량 입력").toBeVisible();
  // 카드 = 캡션 바로 옆 시약명. 결과 행(reagent-row) 밖에서 이름이 보여야 한다
  const outsideRows = await form.evaluate((el, s) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(s).forEach((n) => n.remove());
    return clone.textContent ?? "";
  }, sel("reagent-row"));
  expect(outsideRows, `선택한 시약 카드에 ${name}`).toContain(name);
}

export async function expectNotSelected(page: Page): Promise<void> {
  await expect(intakeForm(page).getByText(exact(SELECTED_CAPTION)), `"${SELECTED_CAPTION}" 카드 없음`).toHaveCount(0);
  await expect(quantityInput(page), "입고 수량 입력 없음").toHaveCount(0);
  await expect(intakeButton(page), "시약 미선택 → 입고 비활성").toBeDisabled();
}

/** "현재 N단위 → 입고 후 M단위" 미리보기에서 N·M (없으면 null) */
export async function readPreview(page: Page): Promise<{ current: number; after: number } | null> {
  const text = (await intakeForm(page).innerText()).replace(/\s+/g, " ");
  const m = /현재\s*([\d.,]+)\s*[^\s→\d]*\s*→\s*입고 후\s*([\d.,]+)/.exec(text);
  if (!m) return null;
  const num = (s: string) => Number(s.replace(/,/g, ""));
  return { current: num(m[1]), after: num(m[2]) };
}

/** "종류" 드롭다운을 열어 옵션 글자를 읽는다 (열린 채로 둔다) */
export async function openClassOptions(page: Page): Promise<Locator> {
  const form = registerForm(page);
  const box = form.getByRole("button", { name: /종류/ }).first();
  const list = form.getByRole("listbox");
  await expect(async () => {
    if ((await list.count()) === 0) await box.click();
    await expect(list).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return list.getByRole("option");
}

export type RegisterInput = { name: string; storageClass: string; stock: string; unit: string };

/** 새 시약 등록 폼의 필수 항목 채우기 (입고일은 기본값 = 오늘 그대로) */
export async function fillRegister(page: Page, v: RegisterInput): Promise<void> {
  const form = registerForm(page);
  await form.getByLabel("시약명").fill(v.name);
  const options = await openClassOptions(page);
  await options.filter({ hasText: exact(v.storageClass) }).click();
  await form.getByLabel("재고량").fill(v.stock);
  await chip(form, v.unit).click();
}

// ---------- 자기 세션(RLS) DB ----------
export type ReagentRow = {
  id: string;
  school_id: string;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
  storage_class: string | null;
  intake_date: string | null;
  slot_id: string | null;
  cas_no: string | null;
  msds_url: string | null;
};
const REAGENT_COLS = "id, school_id, name, unit, stock, min_stock, storage_class, intake_date, slot_id, cas_no, msds_url";

function toReagent(r: Record<string, unknown>): ReagentRow {
  return { ...(r as ReagentRow), stock: Number(r.stock), min_stock: Number(r.min_stock) };
}

export async function mySchoolId(page: Page): Promise<string> {
  const { client, userId } = await browserClient(page);
  const { data, error } = await client.from("profiles").select("school_id").eq("user_id", userId).single();
  expect(error, "자기 profiles 조회").toBeNull();
  return data!.school_id as string;
}

/** 자기 세션으로 보이는 시약 전부 (RLS = 자기 학교) */
export async function dbReagents(page: Page): Promise<ReagentRow[]> {
  const { client } = await browserClient(page);
  const { data, error } = await client.from("reagents").select(REAGENT_COLS).order("name");
  expect(error, "자기 세션 reagents 조회").toBeNull();
  return (data ?? []).map(toReagent);
}

export async function dbReagent(page: Page, id: string): Promise<ReagentRow | null> {
  const { client } = await browserClient(page);
  const { data, error } = await client.from("reagents").select(REAGENT_COLS).eq("id", id).maybeSingle();
  expect(error, "자기 세션 reagents 1건 조회").toBeNull();
  return data ? toReagent(data) : null;
}

export async function dbReagentsByName(page: Page, name: string): Promise<ReagentRow[]> {
  const { client } = await browserClient(page);
  const { data, error } = await client.from("reagents").select(REAGENT_COLS).eq("name", name);
  expect(error, "자기 세션 reagents 이름 조회").toBeNull();
  return (data ?? []).map(toReagent);
}

export type IntakeLog = { id: string; school_id: string; reagent_id: string; user_id: string; amount: number; intake_date: string };

export async function dbIntakeLogs(page: Page, reagentId: string): Promise<IntakeLog[]> {
  const { client } = await browserClient(page);
  const { data, error } = await client
    .from("intake_logs")
    .select("id, school_id, reagent_id, user_id, amount, intake_date")
    .eq("reagent_id", reagentId);
  expect(error, "자기 세션 intake_logs 조회").toBeNull();
  return (data ?? []).map((r) => ({ ...(r as IntakeLog), amount: Number(r.amount) }));
}

/** 교사·admin 세션으로 자기 학교에 임시 시약을 만든다 (입고 대상). */
export async function createTempReagent(page: Page, name: string, stock: number, unit: string): Promise<ReagentRow> {
  expect(name.startsWith(TEMP_PREFIX), "임시 시약 이름 접두사").toBe(true);
  const { client } = await browserClient(page);
  const schoolId = await mySchoolId(page);
  const { data, error } = await client
    .from("reagents")
    .insert({ school_id: schoolId, name, unit, stock, min_stock: 0 })
    .select(REAGENT_COLS)
    .single();
  expect(error, `임시 시약 생성: ${error?.message}`).toBeNull();
  return toReagent(data!);
}

/** 이 이름(임시 접두사)의 시약을 자기 세션으로 지운다. 남은 행 수를 돌려준다 (0 이어야 정상) */
export async function dropTempReagents(page: Page, name: string): Promise<number> {
  if (!name.startsWith(TEMP_PREFIX)) throw new Error(`임시 시약 이름이 아님: ${name}`);
  const { client } = await browserClient(page);
  await client.from("reagents").delete().eq("name", name);
  const { data } = await client.from("reagents").select("id").eq("name", name);
  return (data ?? []).length;
}

export { rules };
