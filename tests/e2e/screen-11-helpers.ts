// 화면 11 (시약장 설정, dev-rules.json routes["11"]) e2e 도우미.
// 기준: 디자인 run 20261004-2256 s2-spec "## 화면 11"·"## 상태 화면 11-empty"·"## 상태 화면 11-delete",
//       design/frames/11-*.json, design/rules.json(cabinet·roles R7·screens_required·variants·tab_bar), harness/d7-data.md §9,
//       harness/dev-rules.json(route_auth 11·11_note·components).
//
// 절대 규칙 (공용 테스트 계정 4개 · 학교 A·B · 실사용 학교 · 데모 학교):
// - 공용 계정으로는 읽기 · 편집 상태 조작(저장하지 않음) · 시트 열고 닫기만 한다. 공용 학교의 시약장·칸·시약 배치를 바꾸지 않는다.
// - 쓰기 흐름(추가·저장·이름 바꾸기·삭제)과 빈 상태는 일회용 학교의 일회용 계정으로만 한다 (screen-8-helpers:
//   service role 로 계정·학교 생성 — 메일이 나가지 않는다, 세션은 쿠키로 심는다).
//   service role 은 준비·정리·대조 조회에만 쓰고, 판정 대상은 항상 브라우저 화면과 그 화면이 보낸 요청의 결과다.
// - 일회용 계정은 usage_logs 를 만들지 않는다. 정리 순서: 시약 → 시약장(칸 cascade) → 프로필 → 계정 → 학교.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserClient, devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import {
  addMember,
  clientFor,
  exact,
  profileByService,
  service,
  sweep,
  tempSchool,
  type Residue,
  type TempSchool,
  type TempUser,
} from "./screen-8-helpers";

export const SCREEN = 11;
export const HOME_SCREEN = 13;
export const LIST_SCREEN = 2;
export const DETAIL_SCREEN = 3;
export const LOGIN_SCREEN = 1;
export const CABINETS_HREF = routeOf(SCREEN);

// ---------- 규칙 (design/rules.json) ----------

type CabinetRules = {
  cabinet: {
    door_types: string[];
    shelves: number[];
    storage_classes: string[];
    incompatible: [string, string][];
    default_name: string;
    unassigned_label: string;
    manage_roles: string[];
  };
  variants: Record<string, Record<string, string[]>>;
  screens_required: Record<string, string[] | string>;
  roles: Record<string, { role?: string; component?: string; components?: string[]; max?: number; only_roles?: string[] }>;
};
const raw = JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as CabinetRules;
export const CAB = raw.cabinet;
export const CLASSES = CAB.storage_classes;
export const VARIANTS = raw.variants[String(SCREEN)];
export const REQUIRED = raw.screens_required[String(SCREEN)] as string[];
export const ROLE_RULES = raw.roles;
/** d7 §9: 양문형 = 좌·우 두 쪽, 단문형 = 한쪽만 */
export const DOUBLE = "양문형";
export const SINGLE = "단문형";
/** d7 §9 "추가": 기본 양문형·4단 */
export const DEFAULT_DOOR = DOUBLE;
export const DEFAULT_SHELVES = 4;
/** d7 §9 "이름 바꾸기": trim 후 1~20자 */
export const LABEL_MAX = 20;

export const defaultName = (n: number) => CAB.default_name.replace("{n}", String(n));
export const sortClasses = (list: readonly string[]) => CLASSES.filter((c) => list.includes(c));
export const sidesOf = (door: string): ("L" | "R")[] => (door === SINGLE ? ["L"] : ["L", "R"]);
export const slotCount = (door: string, shelves: number) => sidesOf(door).length * shelves;
/** 격자의 칸 키 ("L1") — 위 단부터, 단마다 좌 → 우 (배치도 읽는 순서) */
export const gridKeys = (door: string, shelves: number) =>
  Array.from({ length: shelves }, (_, i) => i + 1).flatMap((shelf) => sidesOf(door).map((side) => `${side}${shelf}`));
/** 배치도에서 그 칸의 순서 (위 단부터, 좌 → 우) */
export const slotIndex = (door: string, key: string) => gridKeys(door, 99).indexOf(key);
/** 칸 이름 — s2-spec 화면 11 예시 "좌1단" (양문형). 단문형은 좌우가 없다 */
export const slotName = (door: string, key: string) =>
  door === SINGLE ? `${key.slice(1)}단` : `${key[0] === "L" ? "좌" : "우"}${key.slice(1)}단`;
export const incompatiblePairsIn = (classes: readonly string[]) => CAB.incompatible.filter(([a, b]) => classes.includes(a) && classes.includes(b));

// ---------- 컴포넌트 이름 ----------
export const SWITCHER = "cabinet-switcher";
export const ADD = "cabinet-add";
export const EDIT = "cabinet-edit";
export const DOOR_SELECT = "cabinet-door-select";
export const SHELF_SELECT = "cabinet-shelf-select";
export const SLOT = "cabinet-slot";
export const CHIP = "storage-class-chip";
export const MIX = "mix-warning";
export const ROW = "reagent-row";
export const MODAL = "ex-modal-card";
export const EMPTY = "ex-empty-state-card";
export const TOAST = "ex-toast";
export const INPUT = "text-input";
export const PRIMARY = "button-primary";
export const OUTLINE = "button-outline";

// ---------- 문구 (s2-spec 화면 11 · 11-empty · 11-delete, d7 §9) ----------
export const NAV_LABEL = "시약장 설정";
export const ADD_LABEL = "시약장 추가";
export const RENAME_BUTTON = "이름 바꾸기";
export const DELETE_BUTTON = "삭제";
export const SAVE_BUTTON = "저장";
export const CANCEL_BUTTON = "취소";
export const UNSET = "미지정";
export const WARNING_TITLE = "주의사항";
export const RENAME_TITLE = "시약장 이름";
export const DELETE_TITLE = "이 시약장을 삭제할까요?";
export const DELETE_CAPTION = "시약 정보와 재고는 지워지지 않아요";
export const deleteNotice = (n: number) => `배치된 시약 ${n}개는 '${CAB.unassigned_label}'으로 바뀌어요`;
export const EMPTY_TITLE = "아직 시약장이 없어요";
export const EMPTY_STAFF = "'+ 시약장 추가'를 눌러 첫 시약장을 만들어 주세요";
export const EMPTY_STUDENT = "교사가 시약장을 추가하면 여기에 보여요";
export const TOAST_SAVED = "시약장 설정을 저장했어요";
export const TOAST_RENAMED = "이름을 바꿨어요";
export const toastAdded = (label: string) => `${label}을 추가했어요`;
export const toastDeleted = (label: string) => `${label}을 삭제했어요`;
export const shrinkNotice = (n: number) => `이 변경으로 시약 ${n}종이 '${CAB.unassigned_label}'이 돼요`;
export const SHRINK_NOTICE = /이 변경으로 시약 \d+종이 '칸 없음'이 돼요/;
export const unassignedHeading = (n: number) => `${CAB.unassigned_label} 시약 (${n})`;
export const UNASSIGNED_HEADING = /^\s*칸 없음 시약 \((\d+)\)\s*$/;
export const ACTIVE_TAB_LABEL = "시약";
/** s2-spec 화면 11 mix-warning 예시 문구 (좌1단 = 산 + 염기) */
export const MIX_EXAMPLE = "좌1단: 산과 염기는 섞이면 위험해요. 다른 칸에 나눠 보관하세요";
/** d7 §9: "{칸}: {A}과 {B}는 섞이면 위험해요. 다른 칸에 나눠 보관하세요" (조사는 받침에 따라 과/와 · 은/는) */
export const mixLine = (slot: string, a: string, b: string) =>
  new RegExp(`^\\s*${slot}: ${a}[과와] ${b}[은는] 섞이면 위험해요\\. 다른 칸에 나눠 보관하세요\\s*$`);

export { exact };

/** design/frames/{name}.json 의 노드 이름별 개수 (dev-rules.json components 에 있는 이름만) */
export function frameCounts(name: string): Record<string, number> {
  const j = JSON.parse(readFileSync(join(process.cwd(), "design", "frames", `${name}.json`), "utf8")) as {
    frames: { nodes: { name: string }[] }[];
  };
  const out: Record<string, number> = {};
  for (const n of j.frames[0].nodes) if (devRules.components[n.name]) out[n.name] = (out[n.name] ?? 0) + 1;
  return out;
}

/** 화면 11 에 속하지 않는 컴포넌트 이름 (dev-rules.json components) — 화면 11 에서는 0 이어야 한다 */
export function foreignComponents(): string[] {
  return Object.entries(devRules.components)
    .filter(([, screens]) => !screens.includes(SCREEN))
    .map(([name]) => name);
}

/** design/rules.json colors.highlight 의 연한 쪽 → computed style 표기 */
export function highlightSoft(): string {
  const j = JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as { colors: { highlight: { values: string[] } } };
  const rgb = j.colors.highlight.values.map((hex) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  });
  const soft = rgb.reduce((a, b) => (a.r + a.g + a.b >= b.r + b.g + b.b ? a : b));
  return `rgb(${soft.r}, ${soft.g}, ${soft.b})`;
}

// ---------- 화면 요소 ----------
export const main = (page: Page) => page.locator("main");
export const switcher = (page: Page) => main(page).locator(sel(SWITCHER));
/** 시약장 pill (cabinet-add 는 pill 이 아니다) */
export const pills = (page: Page) => switcher(page).locator(`a:not(${sel(ADD)}), button:not(${sel(ADD)})`);
export const activePills = (page: Page) => switcher(page).locator('[aria-current]:not([aria-current="false"])');
export const pill = (page: Page, label: string) => pills(page).filter({ hasText: exact(label) });
export const addButton = (page: Page) => main(page).locator(sel(ADD));
export const edit = (page: Page) => main(page).locator(sel(EDIT));
export const slots = (page: Page) => main(page).locator(sel(SLOT));
export const slotAt = (page: Page, door: string, key: string) => slots(page).nth(slotIndex(door, key));
/** 고르는 칩 (버튼) — 범례 칩은 버튼이 아니다 */
export const pickChips = (page: Page) => main(page).locator(`button${sel(CHIP)}`);
export const pickChip = (page: Page, cls: string) => pickChips(page).filter({ hasText: exact(cls) });
export const legendChips = (page: Page) => main(page).locator(`${sel(CHIP)}:not(button)`);
export const mix = (page: Page) => main(page).locator(sel(MIX));
export const mixLines = (page: Page) => mix(page).locator("li");
export const rows = (page: Page) => main(page).locator(sel(ROW));
export const modal = (page: Page) => page.locator(sel(MODAL));
export const toast = (page: Page) => page.locator(sel(TOAST));
export const emptyCard = (page: Page) => main(page).locator(sel(EMPTY));
export const title = (page: Page, label: string) => main(page).getByRole("heading", { level: 2, name: exact(label) });
export const saveButton = (page: Page) => edit(page).locator(sel(PRIMARY)).filter({ hasText: exact(SAVE_BUTTON) });
export const renameButton = (page: Page) => edit(page).locator(sel(OUTLINE)).filter({ hasText: exact(RENAME_BUTTON) });
export const deleteButton = (page: Page) => edit(page).getByRole("button", { name: exact(DELETE_BUTTON) });
export const renameDialog = (page: Page) => page.getByRole("dialog", { name: exact(RENAME_TITLE) });
export const deleteDialog = (page: Page) => page.getByRole("dialog", { name: exact(DELETE_TITLE) });
export const dialogInput = (page: Page) => renameDialog(page).locator(`${sel(INPUT)} input`);
export const primaryIn = (scope: Locator, label: string) => scope.locator(sel(PRIMARY)).filter({ hasText: exact(label) });
export const outlineIn = (scope: Locator, label: string) => scope.locator(sel(OUTLINE)).filter({ hasText: exact(label) });
export const doorRadio = (page: Page, door: string) => main(page).locator(sel(DOOR_SELECT)).getByRole("radio", { name: exact(door) });
export const shelfRadio = (page: Page, shelves: number) => main(page).locator(sel(SHELF_SELECT)).getByRole("radio", { name: exact(`${shelves}단`) });
export const unassignedTitle = (page: Page) => main(page).getByRole("heading", { name: UNASSIGNED_HEADING });
export const notice = (page: Page) => main(page).getByText(SHRINK_NOTICE);

/** 요소가 하이드레이션됐는지 (하이드레이션 전 누름은 아무 일도 하지 않는다) */
export async function hydrated(l: Locator): Promise<void> {
  await expect(l, "하이드레이션을 볼 요소 1개").toHaveCount(1);
  await expect
    .poll(() => l.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "하이드레이션", timeout: 30_000 })
    .toBe(true);
}

/** 화면 11 본문이 그려졌는지 (빈 화면·자리 표시에서 0개를 세어 통과하지 않도록). state: 시약장이 있는 화면 / 0개 화면 */
export async function waitCabinets(page: Page, state: "some" | "empty" = "some"): Promise<void> {
  await page.waitForLoadState("load");
  await expect.poll(() => new URL(page.url()).pathname, { message: "화면 11 경로", timeout: 45_000 }).toBe(CABINETS_HREF);
  if (state === "some") {
    await expect(switcher(page), `${SWITCHER}`).toBeVisible({ timeout: 45_000 });
    await expect(slots(page).first(), `${SLOT}`).toBeVisible();
  } else {
    await expect(emptyCard(page), `${EMPTY}`).toBeVisible({ timeout: 45_000 });
  }
  await expect(page.locator('main [aria-busy="true"]'), "자리 표시는 본문으로 바뀐다").toHaveCount(0);
}

/** 교사·admin 화면이 누를 준비가 됐는지 */
export async function waitEditable(page: Page): Promise<void> {
  await waitCabinets(page);
  await expect(edit(page), EDIT).toHaveCount(1);
  await hydrated(slots(page).first());
}

/** 문 형태 고르기 (옵션 글자를 누른다) */
export async function pickDoor(page: Page, door: string): Promise<void> {
  await main(page).locator(`${sel(DOOR_SELECT)} label`).filter({ hasText: exact(door) }).click();
  await expect(doorRadio(page, door), `문 형태 "${door}" 선택`).toBeChecked();
}

/** 단 수 고르기 */
export async function pickShelves(page: Page, shelves: number): Promise<void> {
  await main(page).locator(`${sel(SHELF_SELECT)} label`).filter({ hasText: exact(`${shelves}단`) }).click();
  await expect(shelfRadio(page, shelves), `단 수 "${shelves}단" 선택`).toBeChecked();
}

/** 칸 고르기 → 그 칸만 선택 상태 */
export async function selectSlot(page: Page, door: string, key: string): Promise<Locator> {
  const slot = slotAt(page, door, key);
  await slot.click();
  await expect(slot, `칸 ${key} 선택`).toHaveAttribute("aria-pressed", "true");
  await expect(main(page).locator(`${sel(SLOT)}[aria-pressed="true"]`), "선택된 칸은 하나").toHaveCount(1);
  return slot;
}

/** 칩이 원하는 눌림 상태가 되게 누른다 */
export async function setChip(page: Page, cls: string, on: boolean): Promise<void> {
  const chip = pickChip(page, cls);
  await expect(chip, `칩 "${cls}"`).toHaveCount(1);
  if ((await chip.getAttribute("aria-pressed")) !== String(on)) await chip.click();
  await expect(chip, `칩 "${cls}" ${on ? "선택" : "해제"}`).toHaveAttribute("aria-pressed", String(on));
}

/** 선택된 칸의 분류를 정확히 이 목록으로 맞춘다 */
export async function setClasses(page: Page, classes: readonly string[]): Promise<void> {
  for (const c of CLASSES) await setChip(page, c, classes.includes(c));
}

/** 칸 안 글자 → 분류 이름 목록 (보이는 순서). 분류가 없으면 ["미지정"] */
export const tokensOf = (text: string) => text.split(/[^가-힣A-Za-z0-9]+/).filter(Boolean);

export type ShownSlot = { tokens: string[]; warning: boolean; pressed: string | null; tag: string };

/** 배치도의 모든 칸 (읽는 순서): 글자·경고 아이콘·선택 상태·태그 */
export async function readSlots(page: Page): Promise<ShownSlot[]> {
  const list = await slots(page).evaluateAll((els) =>
    els.map((el) => ({
      text: (el as HTMLElement).innerText,
      warning: el.querySelector("svg") !== null,
      pressed: el.getAttribute("aria-pressed"),
      tag: el.tagName,
    })),
  );
  return list.map((s) => ({ tokens: s.text.split(/[^가-힣A-Za-z0-9]+/).filter(Boolean), warning: s.warning, pressed: s.pressed, tag: s.tag }));
}

/** 칸에 보여야 하는 글자: 분류 이름(규칙 순서), 없으면 "미지정" */
export const shownTokens = (classes: readonly string[]) => (sortClasses(classes).length ? sortClasses(classes) : [UNSET]);

/** 배치도가 기대(칸 키 → 분류)와 같은지: 칸 수 = 문 형태 × 단 수, 칸마다 분류 글자(규칙 순서)·경고 아이콘 */
export async function expectBoard(page: Page, door: string, shelves: number, want: Record<string, readonly string[]>, what: string): Promise<void> {
  const keys = gridKeys(door, shelves);
  await expect(slots(page), `${what}: 칸 수 = ${door} × ${shelves}단`).toHaveCount(keys.length);
  await expect(async () => {
    const shown = await readSlots(page);
    expect(shown.map((s) => s.tokens), `${what}: 칸 글자 (읽는 순서 ${keys.join(" ")})`).toEqual(keys.map((k) => shownTokens(want[k] ?? [])));
    expect(shown.map((s) => s.warning), `${what}: 칸 경고 아이콘`).toEqual(keys.map((k) => incompatiblePairsIn(want[k] ?? []).length > 0));
  }).toPass({ timeout: 15_000 });
}

/** 기대 경고 줄 (위 단부터 좌 → 우, 칸 안에서는 규칙 순서) */
export function expectedMixLines(door: string, shelves: number, want: Record<string, readonly string[]>): RegExp[] {
  return gridKeys(door, shelves).flatMap((k) => incompatiblePairsIn(want[k] ?? []).map(([a, b]) => mixLine(slotName(door, k), a, b)));
}

export async function expectMix(page: Page, door: string, shelves: number, want: Record<string, readonly string[]>, what: string): Promise<void> {
  const lines = expectedMixLines(door, shelves, want);
  await expect(mix(page), `${what}: ${MIX} 개수`).toHaveCount(lines.length ? 1 : 0);
  if (!lines.length) return;
  await expect(mix(page).getByRole("heading", { name: exact(WARNING_TITLE) }), `${what}: "${WARNING_TITLE}"`).toHaveCount(1);
  await expect(mixLines(page), `${what}: 경고 줄 수`).toHaveCount(lines.length);
  const texts = (await mixLines(page).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  for (const re of lines) expect(texts.some((t) => re.test(t)), `${what}: 경고 줄 ${re} (보이는 줄: ${texts.join(" / ")})`).toBe(true);
}

/** 시약장 이름 + 요약 — 시안 11 프레임 "양문형 · 4단 · 8칸" (칸 수 = 문 형태 × 단 수) */
export async function expectHeader(page: Page, label: string, door: string, shelves: number, what: string): Promise<void> {
  await expect(title(page, label), `${what}: 시약장 이름 "${label}"`).toHaveCount(1);
  await expect(title(page, label)).toBeVisible();
  const text = `${door} · ${shelves}단 · ${slotCount(door, shelves)}칸`;
  const meta = main(page).getByText(exact(text));
  await expect(meta, `${what}: 요약 "${text}"`).toHaveCount(1);
  await expect(meta).toBeVisible();
}

/** 활성 pill 은 정확히 하나이고 그 이름이다 */
export async function expectActive(page: Page, label: string, what: string): Promise<void> {
  await expect(activePills(page), `${what}: 활성 pill 1개`).toHaveCount(1);
  await expect(activePills(page), `${what}: 활성 pill = "${label}"`).toHaveText(exact(label));
}

export const pillLabels = async (page: Page) => (await pills(page).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());

/** 서버 액션 요청(쓰기 요청) 수 — Next 서버 액션 = POST + next-action 헤더 */
export function watchActions(page: Page): { count: () => number } {
  let n = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) n += 1;
  });
  return { count: () => n };
}

export const boxOf = (l: Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  });

/** 요소 가운데 지점의 맨 위 요소가 그 요소인지 (다른 것에 덮이지 않음) */
export const onTop = (l: Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });

export const squash = (s: string) => s.replace(/[\s,]/g, "");

/** rules.json tab_bar 검사: 390 = 1개·항목 수·라벨·활성 "시약", 1440 = 0 */
export async function expectTabBar(page: Page, viewport: ViewportName, state: string): Promise<void> {
  const tb = rules.tab_bar;
  const shown = viewport === "mobile" && tb.mobile_screens.includes(SCREEN);
  if (viewport === "mobile") expect(shown, `rules.json tab_bar.mobile_screens 에 화면 ${SCREEN}`).toBe(true);
  await expect(page.locator(sel(tb.component)), `${state}: ${viewport} ${tb.component}`).toHaveCount(shown ? 1 : 0);
  await expect(page.locator(sel(tb.item)), `${state}: ${viewport} ${tb.item}`).toHaveCount(shown ? tb.items : 0);
  if (!shown) return;
  expect(tb.labels.length, "rules.json tab_bar labels 수 = items").toBe(tb.items);
  expect(tb.labels, `tab_bar labels 에 "${ACTIVE_TAB_LABEL}"`).toContain(ACTIVE_TAB_LABEL);
  const bar = page.locator(sel(tb.component));
  await expect(bar).toBeVisible();
  const items = bar.locator(sel(tb.item));
  await expect(items, "tab-item 은 tab-bar 안에").toHaveCount(tb.items);
  expect((await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()), `${state}: 탭 라벨 순서`).toEqual(tb.labels);
  const active = bar.locator(`${sel(tb.item)}[aria-current="page"]`);
  await expect(active, `${state}: 활성 tab-item 1개`).toHaveCount(1);
  await expect(active, `${state}: 활성 탭 "${ACTIVE_TAB_LABEL}"`).toHaveText(exact(ACTIVE_TAB_LABEL));
  const t = (await bar.boundingBox())!;
  expect(Math.round(t.y + t.height), `${state}: tab-bar 는 화면 아래 끝`).toBe(page.viewportSize()!.height);
  expect(Math.round(t.width), `${state}: tab-bar 전폭`).toBe(page.viewportSize()!.width);
}

// ======================================================================
// DB (로그인 세션 RLS — 공용 학교는 읽기만)
// ======================================================================

export type Row = Record<string, unknown>;
export type DbCabinet = { id: string; label: string; door_type: string; shelves: number; created_at: string };
export type DbView = {
  cabinets: DbCabinet[];
  /** 시약장 id → 칸 키("L1") → 분류 (규칙 순서) */
  classes: Record<string, Record<string, string[]>>;
  /** 시약장 id → 배치된 시약 수 */
  placed: Record<string, number>;
  /** 칸 없음 시약 */
  unassigned: { id: string; name: string; stock: number; unit: string }[];
  /** 모든 시약 이름 */
  reagentNames: string[];
};

function classesOfRow(s: Row): string[] {
  if (Array.isArray(s.storage_classes)) return sortClasses(s.storage_classes as string[]);
  return typeof s.storage_class === "string" ? [s.storage_class] : [];
}

async function viewOf(client: SupabaseClient, schoolId?: string): Promise<DbView> {
  let cq = client.from("cabinets").select("id, label, door_type, shelves, created_at").order("created_at").order("id");
  let sq = client.from("cabinet_slots").select("*");
  let rq = client.from("reagents").select("id, name, stock, unit, slot_id").order("name").order("id");
  if (schoolId) {
    cq = cq.eq("school_id", schoolId);
    sq = sq.eq("school_id", schoolId);
    rq = rq.eq("school_id", schoolId);
  }
  const [c, s, r] = await Promise.all([cq, sq, rq]);
  for (const q of [c, s, r]) if (q.error) throw new Error(`대조 조회 실패: ${q.error.message}`);
  const cabinets = (c.data ?? []) as DbCabinet[];
  const slotRows = (s.data ?? []) as Row[];
  const reagents = (r.data ?? []) as Row[];
  const classes: DbView["classes"] = {};
  const placed: DbView["placed"] = {};
  const cabinetOfSlot = new Map<string, string>();
  for (const cab of cabinets) {
    classes[cab.id] = {};
    placed[cab.id] = 0;
  }
  for (const row of slotRows) {
    const cabId = row.cabinet_id as string;
    cabinetOfSlot.set(row.id as string, cabId);
    if (classes[cabId]) classes[cabId][`${row.side}${row.shelf}`] = classesOfRow(row);
  }
  for (const re of reagents) {
    const cabId = re.slot_id ? cabinetOfSlot.get(re.slot_id as string) : undefined;
    if (cabId && placed[cabId] !== undefined) placed[cabId] += 1;
  }
  return {
    cabinets,
    classes,
    placed,
    unassigned: reagents.filter((re) => !re.slot_id).map((re) => ({ id: re.id as string, name: re.name as string, stock: Number(re.stock), unit: re.unit as string })),
    reagentNames: reagents.map((re) => re.name as string),
  };
}

/** 브라우저 로그인 세션(RLS)으로 읽은 자기 학교 시약장·칸·시약 */
export async function dbView(page: Page): Promise<DbView> {
  const { client } = await browserClient(page);
  return viewOf(client);
}

/** 대조 조회 (service role): 한 학교의 시약장·칸·시약 */
export const dbViewByService = (schoolId: string) => viewOf(service(), schoolId);

/** 대조 조회 (service role): 칸 행 전체 (id 포함 — 시약 배치 준비용) */
export async function slotRowsByService(cabinetId: string): Promise<Row[]> {
  const r = await service().from("cabinet_slots").select("*").eq("cabinet_id", cabinetId);
  if (r.error) throw new Error(`칸 대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as Row[];
}

/** 공용 학교 A·B·데모 학교의 시약장·칸·시약 배치 스냅숏 (service role 읽기) — 이 스펙들이 건드리지 않았는지 대조한다 */
export async function sharedCabinetSnapshot(): Promise<string[]> {
  const sb = service();
  const schools = await sb.from("schools").select("id, neis_code, is_demo").or("neis_code.like.TEST-SCHOOL-%,is_demo.eq.true");
  if (schools.error) throw new Error(`schools 대조 조회 실패: ${schools.error.message}`);
  const ids = (schools.data ?? []).map((s) => s.id as string);
  expect(ids.length, "대조: 학교 A·B·데모 학교").toBeGreaterThanOrEqual(3);
  const [c, s, r] = await Promise.all([
    sb.from("cabinets").select("id, school_id, label, door_type, shelves").in("school_id", ids),
    sb.from("cabinet_slots").select("*").in("school_id", ids),
    sb.from("reagents").select("id, slot_id").in("school_id", ids).not("slot_id", "is", null),
  ]);
  for (const q of [c, s, r]) if (q.error) throw new Error(`대조 조회 실패: ${q.error.message}`);
  return [
    ...(c.data ?? []).map((x) => `cabinet|${x.school_id}|${x.id}|${x.label}|${x.door_type}|${x.shelves}`),
    ...((s.data ?? []) as Row[]).map((x) => `slot|${x.cabinet_id}|${x.id}|${x.side}${x.shelf}|${classesOfRow(x).join("+")}|${x.storage_class ?? ""}`),
    ...(r.data ?? []).map((x) => `placed|${x.id}|${x.slot_id}`),
  ].sort();
}

// ======================================================================
// 일회용 학교 (쓰기 흐름·빈 상태·시안 상태)
// ======================================================================

export interface S11Fixture {
  school: TempSchool;
  /** 학교의 첫 가입자 (admin) */
  admin: TempUser;
  teacher: TempUser;
  student: TempUser;
  /** admin 세션의 supabase-js 클라이언트 (publishable 키 + RLS) — 준비용 DB 함수 호출 */
  prep: SupabaseClient;
}

/** 일회용 학교: admin + 교사 + 학생 */
export async function makeFixture(info: TestInfo, group: string): Promise<S11Fixture> {
  const school = await tempSchool(info, group);
  const teacher = await addMember(school, info, group, "교사");
  const student = await addMember(school, info, group, "학생");
  const prep = await clientFor(school.admin);
  const up = await prep.rpc("change_member_role", { p_user_id: teacher.id, p_role: "teacher" });
  expect(up.error, `준비: 일회용 교사 역할 지정 (${up.error?.message})`).toBeNull();
  expect((await profileByService(teacher.id))?.role).toBe("teacher");
  expect((await profileByService(student.id))?.role).toBe("student");
  return { school, admin: school.admin, teacher, student, prep };
}

/** 일회용 학교의 시약·시약장·칸을 비운다 (service role — 준비) */
export async function purgeSchool(schoolId: string): Promise<void> {
  const sb = service();
  const r = await sb.from("reagents").delete().eq("school_id", schoolId);
  expect(r.error, `일회용 학교 시약 정리: ${r.error?.message}`).toBeNull();
  const c = await sb.from("cabinets").delete().eq("school_id", schoolId);
  expect(c.error, `일회용 학교 시약장 정리: ${c.error?.message}`).toBeNull();
}

function firstRow(data: unknown): Row {
  const row = Array.isArray(data) ? (data[0] as Row | undefined) : (data as Row | null);
  if (!row) throw new Error("준비 호출이 행을 돌려주지 않음");
  return row;
}

/** 준비: 시약장 추가 (DB 함수 add_cabinet — admin 세션) */
export async function prepCabinet(f: S11Fixture): Promise<DbCabinet> {
  const res = await f.prep.rpc("add_cabinet");
  expect(res.error, `준비: add_cabinet (${res.error?.message})`).toBeNull();
  return firstRow(res.data) as unknown as DbCabinet;
}

/** 준비: 문 형태·단 수·칸 분류 저장 (DB 함수 save_cabinet_layout — admin 세션) */
export async function prepLayout(f: S11Fixture, cabinetId: string, door: string, shelves: number, want: Record<string, readonly string[]>): Promise<void> {
  const cells = gridKeys(door, shelves).map((k) => ({ side: k[0], shelf: Number(k.slice(1)), classes: sortClasses(want[k] ?? []) }));
  const res = await f.prep.rpc("save_cabinet_layout", { p_cabinet_id: cabinetId, p_door_type: door, p_shelves: shelves, p_slots: cells });
  expect(res.error, `준비: save_cabinet_layout (${res.error?.message})`).toBeNull();
}

/** 준비: 이름 바꾸기 (DB 함수 rename_cabinet — admin 세션) */
export async function prepRename(f: S11Fixture, cabinetId: string, label: string): Promise<void> {
  const res = await f.prep.rpc("rename_cabinet", { p_cabinet_id: cabinetId, p_label: label });
  expect(res.error, `준비: rename_cabinet (${res.error?.message})`).toBeNull();
}

export type PrepReagent = { id: string; name: string; stock: number; unit: string };

/** 준비: 임시 시약 (DB 함수 register_reagent — admin 세션). 새 시약은 "칸 없음" (d7 §6·§9) */
export async function prepReagent(f: S11Fixture, tag: string, stock = 7, unit = "g"): Promise<PrepReagent> {
  const name = `임시시약-${tag}-${randomBytes(3).toString("hex")}`;
  const res = await f.prep.rpc("register_reagent", {
    p_name: name,
    p_storage_class: CLASSES[0],
    p_stock: stock,
    p_unit: unit,
    p_intake_date: "2026-09-15",
    p_msds_url: null,
  });
  expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
  const row = firstRow(res.data);
  expect(row.slot_id, "새로 등록한 시약은 칸 없음").toBeNull();
  return { id: row.id as string, name, stock, unit };
}

/** 준비: 시약을 칸에 배치 — admin 세션의 reagents.slot_id update (d7 §9). 막혀 있으면 service role 로 한다 */
export async function prepPlace(f: S11Fixture, reagentId: string, cabinetId: string, key: string): Promise<void> {
  const slot = (await slotRowsByService(cabinetId)).find((s) => `${s.side}${s.shelf}` === key);
  if (!slot) throw new Error(`준비: 칸 ${key} 행이 없음`);
  const up = await f.prep.from("reagents").update({ slot_id: slot.id }).eq("id", reagentId).select("id");
  if (!up.error && (up.data ?? []).length === 1) return;
  const forced = await service().from("reagents").update({ slot_id: slot.id }).eq("id", reagentId).select("id");
  expect(forced.error, `준비: service role 배치 (${forced.error?.message})`).toBeNull();
  expect(forced.data ?? []).toHaveLength(1);
}

/** s2-spec 화면 11 예시 상태의 1번 시약장 칸 분류 (양문형 4단) */
/** s2-spec 상태 화면 11-delete 예시의 2번 시약장 (양문형 3단, 프레임 11-delete 의 칸 글자) */
export const FRAME_LAYOUT_2: Record<string, string[]> = { L1: ["무기염"], R1: ["유기"], L2: ["산"], R2: ["기타"], L3: ["염기"], R3: ["인화성"] };
export const EMPTY_HEADING = "시약장 0개";

export const FRAME_LAYOUT: Record<string, string[]> = {
  L1: ["산", "염기"],
  L2: ["유기"],
  L3: ["인화성"],
  L4: ["기타"],
  R1: ["산화제"],
  R2: ["무기염"],
  R3: ["독성"],
  R4: ["기타"],
};

export type S11Residue = Residue & { cabinets: number; cabinet_slots: number; reagents: number; intake_logs: number; usage_logs: number };
export const NO_S11_RESIDUE: S11Residue = { users: 0, schools: 0, invites: 0, profiles: 0, cabinets: 0, cabinet_slots: 0, reagents: 0, intake_logs: 0, usage_logs: 0 };

/** 이 묶음(group)·프로젝트의 일회용 학교·계정과 그 학교의 시약·시약장을 지우고 남은 수를 돌려준다 */
export async function cleanup(group: string, project: string): Promise<S11Residue> {
  const sb = service();
  const schools = await sb.from("schools").select("id").like("neis_code", `S8UI-${group}-${project}-%`);
  const ids = (schools.data ?? []).map((s) => s.id as string);
  if (ids.length) {
    await sb.from("reagents").delete().in("school_id", ids);
    await sb.from("cabinets").delete().in("school_id", ids);
  }
  const left = await sweep(group, project);
  const rest: Record<string, number> = {};
  for (const table of ["cabinets", "cabinet_slots", "reagents", "intake_logs", "usage_logs"]) {
    const r = ids.length ? await sb.from(table).select("id").in("school_id", ids) : { data: [] as unknown[] };
    rest[table] = (r.data ?? []).length;
  }
  return { ...left, ...(rest as Omit<S11Residue, keyof Residue>) };
}
