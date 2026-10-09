// 화면 11 (시약장 설정, dev-rules.json routes["11"]) e2e 도우미.
// 기준: 디자인 run 20261004-2256 s2-spec "## 화면 11"·"## 상태 화면 11-empty"·"## 상태 화면 11-delete",
//       디자인 run 20261006-1223 s2-spec (1.15: cabinet-number · slot-count · 11-slot · 11-print · 11-unsaved), design/frames/11-*.json, design/rules.json(cabinet·roles R7·screens_required·variants·tab_bar), harness/d7-data.md §9,
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
import { tempSchoolLike,
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
import { framePath } from "../frames";
import { adjustPreDesktopShell } from "../desktop-shell";

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
    qr_label_text: string[];
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
export const NUMBER = "cabinet-number";
export const COUNT = "slot-count";
export const SLOT_SHEET = "slot-sheet";
export const SLOT_ASSIGN = "slot-assign";
export const QR_PRINT = "qr-print";
export const QR_SHEET = "qr-print-sheet";
export const QR_LABEL = "qr-label";
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
/** s2-spec 11-slot · 11-print · 3-location: 시트 오른쪽 위 × (읽기 이름 "닫기") */
export const CLOSE_LABEL = "닫기";
/** s2-spec 11-unsaved · rules.json cabinet.unsaved_confirm */
export const UNSAVED_TITLE = "저장하지 않은 변경이 있어요";
export const unsavedBody = (label: string) => `이동하면 ${label}에서 바꾼 내용이 사라져요`;
export const DISCARD_BUTTON = "버리고 이동";
export const CONTINUE_BUTTON = "계속 편집";
/** s2-spec 화면 11 mix-warning 예시 문구 (좌1단 = 산 + 염기) */
export const MIX_EXAMPLE = "좌1단: 산과 염기는 섞이면 위험해요. 다른 칸에 나눠 보관하세요";
/** d7 §9: "{칸}: {A}과 {B}는 섞이면 위험해요. 다른 칸에 나눠 보관하세요" (조사는 받침에 따라 과/와 · 은/는) */
export const mixLine = (slot: string, a: string, b: string) =>
  new RegExp(`^\\s*${slot}: ${a}[과와] ${b}[은는] 섞이면 위험해요\\. 다른 칸에 나눠 보관하세요\\s*$`);

export { exact };

/** design/frames/{name}.json 의 노드 이름별 개수 (dev-rules.json components 에 있는 이름만) */
export function frameCounts(name: string): Record<string, number> {
  const j = JSON.parse(readFileSync(framePath(`${name}`), "utf8")) as {
    frames: { nodes: { name: string }[] }[];
  };
  const out: Record<string, number> = {};
  for (const n of j.frames[0].nodes) if (devRules.components[n.name]) out[n.name] = (out[n.name] ?? 0) + 1;
  // 예전 데스크톱 프레임의 nav-pill → 지금 셸 app-sidebar (rules 1.22 desktop_shell, d7 §23)
  return adjustPreDesktopShell(name, out);
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
/** 이름이 label 인 pill (1.15: pill 글자 = cabinet-number + 이름 — 이름 부분으로 찾는다) */
export const pill = (page: Page, label: string) => pills(page).filter({ has: page.getByText(exact(label)) });
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
/** 칸 시트 (s2-spec 11-slot) — 모든 역할이 칸을 누르면 열린다 */
export const slotSheet = (page: Page) => page.locator(sel(SLOT_SHEET));
export const sheetClose = (sheet: Locator) => sheet.getByRole("button", { name: exact(CLOSE_LABEL) });

/** 저장 안 한 편집 확인 카드 (ex-modal-card "저장하지 않은 변경이 있어요") */
export const unsavedDialog = (page: Page) => page.getByRole("dialog", { name: exact(UNSAVED_TITLE) });

/**
 * 브라우저 기본 확인(beforeunload, d7 §14 "새로고침·창 닫기는 브라우저 기본 확인")을 받아들이고 그 수를 센다.
 * Playwright 는 처리기가 없으면 대화상자를 닫아(dismiss) 이동이 취소된다.
 */
export function acceptBeforeUnload(page: Page): { count: () => number } {
  let n = 0;
  page.on("dialog", (d) => {
    if (d.type() === "beforeunload") n += 1;
    void d.accept().catch(() => undefined);
  });
  return { count: () => n };
}

/** 열린 칸 시트를 × 로 닫는다 */
export async function closeSlotSheet(page: Page): Promise<void> {
  const sheet = slotSheet(page);
  await expect(sheet, `${SLOT_SHEET} 열림`).toHaveCount(1);
  await sheetClose(sheet).click();
  await expect(sheet, `${SLOT_SHEET} 닫힘`).toHaveCount(0);
}

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

/**
 * 칸 고르기 → 그 칸만 선택 상태 (교사·admin).
 * 1.15: 칸을 누르면 칸 시트(slot-sheet)가 열리고 같은 누름으로 그 칸이 선택 칸이 된다(s2-spec 11-slot) — 분류 칩은 시트를 × 로 닫고 고친다.
 */
export async function selectSlot(page: Page, door: string, key: string): Promise<Locator> {
  const slot = slotAt(page, door, key);
  await slot.click();
  await expect(slotSheet(page), `칸 ${key} 을 누르면 ${SLOT_SHEET}`).toBeVisible();
  await closeSlotSheet(page);
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

export type ShownSlot = { tokens: string[]; count: number; warning: boolean; pressed: string | null; tag: string };

/**
 * 배치도의 모든 칸 (읽는 순서): 분류 글자·slot-count 숫자·경고 아이콘·선택 상태·태그.
 * 1.15: 칸 안 slot-count(시약 수) 는 분류 글자에서 떼어 count 로 읽는다 (없으면 0). scope 기본 = 화면 본문(main)
 */
export async function readSlots(page: Page, scope: Locator = main(page)): Promise<ShownSlot[]> {
  const list = await scope.locator(sel(SLOT)).evaluateAll(
    (els, countSel) =>
      els.map((el) => {
        const counts = Array.from(el.querySelectorAll(countSel)).map((c) => (c.textContent ?? "").trim());
        // 보이는 글자에서 slot-count 를 뺀다: slot-count 를 잠깐 숨기고 innerText 를 읽는다
        const hidden = Array.from(el.querySelectorAll<HTMLElement>(countSel));
        const prev = hidden.map((h) => h.style.display);
        for (const h of hidden) h.style.display = "none";
        const text = (el as HTMLElement).innerText;
        hidden.forEach((h, i) => (h.style.display = prev[i]));
        return { text, counts, warning: el.querySelector("svg") !== null, pressed: el.getAttribute("aria-pressed"), tag: el.tagName };
      }),
    sel(COUNT),
  );
  return list.map((s) => {
    expect(s.counts.length, `칸 하나에 ${COUNT} 는 0~1개`).toBeLessThanOrEqual(1);
    if (s.counts.length) expect(s.counts[0], `${COUNT} 는 숫자`).toMatch(/^\d+$/);
    const tokens = s.text.split(/[^가-힣A-Za-z0-9]+/).filter(Boolean);
    expect(tokens.filter((t) => /\d/.test(t)), "칸 분류 글자에 숫자 없음 (숫자는 slot-count 뿐)").toEqual([]);
    return { tokens, count: s.counts.length ? Number(s.counts[0]) : 0, warning: s.warning, pressed: s.pressed, tag: s.tag };
  });
}

/** 칸에 보여야 하는 글자: 분류 이름(규칙 순서), 없으면 "미지정" */
export const shownTokens = (classes: readonly string[]) => (sortClasses(classes).length ? sortClasses(classes) : [UNSET]);

/**
 * 배치도가 기대(칸 키 → 분류)와 같은지: 칸 수 = 문 형태 × 단 수, 칸마다 분류 글자(규칙 순서)·경고 아이콘.
 * counts(칸 키 → 시약 수, DB)를 주면 칸마다 slot-count = 그 수 (0 이면 slot-count 없음 — d7 §14 "0 이면 표시 안 함")
 */
export async function expectBoard(
  page: Page,
  door: string,
  shelves: number,
  want: Record<string, readonly string[]>,
  what: string,
  counts?: Record<string, number>,
): Promise<void> {
  const keys = gridKeys(door, shelves);
  await expect(slots(page), `${what}: 칸 수 = ${door} × ${shelves}단`).toHaveCount(keys.length);
  await expect(async () => {
    const shown = await readSlots(page);
    expect(shown.map((s) => s.tokens), `${what}: 칸 글자 (읽는 순서 ${keys.join(" ")})`).toEqual(keys.map((k) => shownTokens(want[k] ?? [])));
    expect(shown.map((s) => s.warning), `${what}: 칸 경고 아이콘`).toEqual(keys.map((k) => incompatiblePairsIn(want[k] ?? []).length > 0));
    if (counts) expect(shown.map((s) => s.count), `${what}: 칸마다 ${COUNT} = DB 그 칸 시약 수 (읽는 순서 ${keys.join(" ")})`).toEqual(keys.map((k) => counts[k] ?? 0));
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

/** 폭 390(dev-rules viewports.mobile) 화면인지 */
export const isMobile = (page: Page) => page.viewportSize()!.width === devRules.viewports.mobile[0];

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 데스크톱 요약 꼴: 프레임 11-desktop cabinet-meta 가 "… · N칸" 이면 칸 수까지, 아니면 모바일과 같은 "문 형태 · N단".
 * (예전 1.15 데스크톱 시안 = "양문형 · 4단 · 8칸" → 새 프레임(데스크톱 재구성 run c, desktop_migrated_screens 에 11) = "양문형 · 4단")
 */
export const DESK_META_WITH_SLOTS = (() => {
  const nodes = (JSON.parse(readFileSync(framePath(`${SCREEN}-desktop`), "utf8")) as { frames: { nodes: { name: string; text: { characters: string } | null }[] }[] }).frames[0].nodes;
  const meta = nodes.find((n) => n.name === "cabinet-meta" && n.text)?.text?.characters ?? "";
  if (!meta) throw new Error(`${SCREEN}-desktop cabinet-meta 없음`);
  return /칸$/.test(meta);
})();

/**
 * 시약장 이름 + 요약 — 모바일 11-mobile "양문형 · 4단", 데스크톱 = 프레임 11-desktop 꼴(DESK_META_WITH_SLOTS — 새 프레임은 칸 수 없음).
 * 보이는 글자(innerText)로 본다. number 를 주면 제목 앞 cabinet-number = 그 번호 (DB cabinets.number).
 */
export async function expectHeader(page: Page, label: string, door: string, shelves: number, what: string, number?: number): Promise<void> {
  await expect(title(page, label), `${what}: 시약장 이름 "${label}"`).toHaveCount(1);
  await expect(title(page, label)).toBeVisible();
  const text = isMobile(page) || !DESK_META_WITH_SLOTS ? `${door} · ${shelves}단` : `${door} · ${shelves}단 · ${slotCount(door, shelves)}칸`;
  const head = title(page, label).locator("xpath=..");
  await expect
    .poll(async () => (await head.innerText()).replace(/\s+/g, " ").trim(), { message: `${what}: 제목 줄 = [번호] 이름 + 요약 "${text}"` })
    .toMatch(new RegExp(`(^|\\s)${escapeRe(label)} ?${escapeRe(text)}$`));
  if (number !== undefined) {
    await expect(head.locator(sel(NUMBER)), `${what}: 제목 앞 ${NUMBER} 1개`).toHaveCount(1);
    await expect(head.locator(sel(NUMBER)), `${what}: 제목 ${NUMBER} = DB number ${number}`).toHaveText(exact(String(number)));
  }
}

/** 전환 pill 마다 {cabinet-number 숫자, 이름} (pill 글자에서 번호 원을 뗀 나머지가 이름) */
export async function readPills(page: Page, scope: Locator = switcher(page)): Promise<{ number: number | null; label: string }[]> {
  const list = await scope.locator(`a:not(${sel(ADD)}), button:not(${sel(ADD)})`).evaluateAll(
    (els, numSel) =>
      els.map((el) => {
        const nums = Array.from(el.querySelectorAll(numSel)).map((n) => (n.textContent ?? "").trim());
        const clone = el.cloneNode(true) as HTMLElement;
        for (const n of Array.from(clone.querySelectorAll(numSel))) n.remove();
        return { nums, label: (clone.textContent ?? "").replace(/\s+/g, " ").trim() };
      }),
    sel(NUMBER),
  );
  return list.map((p) => {
    expect(p.nums.length, `pill "${p.label}" 의 ${NUMBER} 는 0~1개`).toBeLessThanOrEqual(1);
    return { number: p.nums.length ? Number(p.nums[0]) : null, label: p.label };
  });
}

/** 활성 pill 은 정확히 하나이고 그 이름이다 (number 를 주면 pill 의 cabinet-number 도) */
export async function expectActive(page: Page, label: string, what: string, number?: number): Promise<void> {
  await expect(activePills(page), `${what}: 활성 pill 1개`).toHaveCount(1);
  await expect(activePills(page).getByText(exact(label)), `${what}: 활성 pill = "${label}"`).toHaveCount(1);
  if (number !== undefined) await expect(activePills(page).locator(sel(NUMBER)), `${what}: 활성 pill 번호 = ${number}`).toHaveText(exact(String(number)));
}

/** pill 이름들 (cabinet-number 를 뗀 글자) — 번호까지는 readPills */
export const pillLabels = async (page: Page) => (await readPills(page)).map((p) => p.label);

/** pill = DB 시약장 (번호 순): 번호(cabinet-number) = DB number · 이름 = DB label */
export async function expectPills(page: Page, cabinets: readonly { number: number; label: string }[], what: string): Promise<void> {
  const want = [...cabinets].sort((a, b) => a.number - b.number).map((c) => ({ number: c.number, label: c.label }));
  await expect.poll(() => readPills(page), { message: `${what}: pill = DB 시약장 (번호 순 · 번호 = cabinets.number)`, timeout: 15_000 }).toEqual(want);
}

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
export type DbCabinet = { id: string; number: number; label: string; door_type: string; shelves: number; created_at: string };
export type DbView = {
  cabinets: DbCabinet[];
  /** 시약장 id → 칸 키("L1") → 분류 (규칙 순서) */
  classes: Record<string, Record<string, string[]>>;
  /** 시약장 id → 배치된 시약 수 */
  placed: Record<string, number>;
  /** 시약장 id → 칸 키("L1") → 그 칸 시약 수 (slot-count) */
  counts: Record<string, Record<string, number>>;
  /** 시약장 id → 칸 키 → 그 칸 시약 (이름순) */
  inSlot: Record<string, Record<string, { id: string; name: string; storage_class: string | null }[]>>;
  /** 시약장 id → 칸 키 → 칸 행 id */
  slotIds: Record<string, Record<string, string>>;
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
  let cq = client.from("cabinets").select("id, number, label, door_type, shelves, created_at").order("created_at").order("id");
  let sq = client.from("cabinet_slots").select("*");
  let rq = client.from("reagents").select("id, name, stock, unit, slot_id, storage_class").order("name").order("id");
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
  const counts: DbView["counts"] = {};
  const inSlot: DbView["inSlot"] = {};
  const slotIds: DbView["slotIds"] = {};
  const cabinetOfSlot = new Map<string, string>();
  const keyOfSlot = new Map<string, string>();
  for (const cab of cabinets) {
    cab.number = Number(cab.number);
    classes[cab.id] = {};
    placed[cab.id] = 0;
    counts[cab.id] = {};
    inSlot[cab.id] = {};
    slotIds[cab.id] = {};
  }
  for (const row of slotRows) {
    const cabId = row.cabinet_id as string;
    const key = `${row.side}${row.shelf}`;
    cabinetOfSlot.set(row.id as string, cabId);
    keyOfSlot.set(row.id as string, key);
    if (classes[cabId]) {
      classes[cabId][key] = classesOfRow(row);
      slotIds[cabId][key] = row.id as string;
    }
  }
  for (const re of reagents) {
    const cabId = re.slot_id ? cabinetOfSlot.get(re.slot_id as string) : undefined;
    if (cabId && placed[cabId] !== undefined) {
      placed[cabId] += 1;
      const key = keyOfSlot.get(re.slot_id as string)!;
      counts[cabId][key] = (counts[cabId][key] ?? 0) + 1;
      (inSlot[cabId][key] ??= []).push({ id: re.id as string, name: re.name as string, storage_class: (re.storage_class as string | null) ?? null });
    }
  }
  return {
    cabinets,
    classes,
    placed,
    counts,
    inSlot,
    slotIds,
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
    sb.from("cabinets").select("id, school_id, number, label, door_type, shelves").in("school_id", ids),
    sb.from("cabinet_slots").select("*").in("school_id", ids),
    sb.from("reagents").select("id, slot_id").in("school_id", ids).not("slot_id", "is", null),
  ]);
  for (const q of [c, s, r]) if (q.error) throw new Error(`대조 조회 실패: ${q.error.message}`);
  return [
    ...(c.data ?? []).map((x) => `cabinet|${x.school_id}|${x.id}|${x.number}|${x.label}|${x.door_type}|${x.shelves}`),
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

/**
 * 일회용 학교의 시약·시약장·칸을 비운다 (service role — 준비).
 * 시약장 번호는 학교의 마지막 번호(schools.cabinet_seq)를 이어 쓰므로(d7 §14 삭제된 번호 재사용 안 함),
 * 다음 테스트가 "새 학교"(1번부터)에서 시작하도록 이 일회용 학교의 cabinet_seq 만 0 으로 되돌린다.
 */
export async function purgeSchool(schoolId: string): Promise<void> {
  const sb = service();
  const r = await sb.from("reagents").delete().eq("school_id", schoolId);
  expect(r.error, `일회용 학교 시약 정리: ${r.error?.message}`).toBeNull();
  const c = await sb.from("cabinets").delete().eq("school_id", schoolId);
  expect(c.error, `일회용 학교 시약장 정리: ${c.error?.message}`).toBeNull();
  const s = await sb.from("schools").update({ cabinet_seq: 0 }).eq("id", schoolId).like("neis_code", "S8UI-%").select("id");
  expect(s.error, `일회용 학교 cabinet_seq 되돌리기: ${s.error?.message}`).toBeNull();
  expect(s.data ?? [], "되돌린 학교 = 이 일회용 학교").toHaveLength(1);
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

/**
 * 준비: 임시 시약 (DB 함수 register_reagent — admin 세션). 새 시약은 "칸 없음" (d7 §6·§9).
 * cls = 시약 보관 분류(기본 = 규칙의 첫 분류), name 을 주면 그 이름 그대로 (토스트 조사를 정하려고 끝 글자를 고를 때)
 */
export async function prepReagent(f: S11Fixture, tag: string, stock = 7, unit = "g", cls: string | null = CLASSES[0], name?: string): Promise<PrepReagent> {
  name ??= `임시시약-${tag}-${randomBytes(3).toString("hex")}`;
  const res = await f.prep.rpc("register_reagent", {
    p_name: name,
    p_storage_class: cls,
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

/**
 * 준비: 시약을 칸에 배치 — 일회용 교사 세션의 DB 함수 place_reagent (d7 §14: 배치는 함수 경유, slot_id 직접 update 는 닫힘).
 * service role 로 대신하지 않는다 — 함수가 실패하면 준비 실패로 알린다.
 */
export async function prepPlace(f: S11Fixture, reagentId: string, cabinetId: string, key: string): Promise<void> {
  const slot = (await slotRowsByService(cabinetId)).find((s) => `${s.side}${s.shelf}` === key);
  if (!slot) throw new Error(`준비: 칸 ${key} 행이 없음`);
  const teacher = await clientFor(f.teacher);
  const res = await teacher.rpc("place_reagent", { p_reagent_id: reagentId, p_slot_id: slot.id });
  expect(res.error, `준비: 교사 place_reagent (${res.error?.code} ${res.error?.message})`).toBeNull();
  const out = (Array.isArray(res.data) ? res.data[0] : res.data) as Row | null;
  expect(out?.slot_id, "준비: place_reagent 반환 slot_id").toBe(slot.id);
  const now = await service().from("reagents").select("slot_id").eq("id", reagentId).single();
  expect(now.data?.slot_id, "준비: 배치 반영 (대조 조회)").toBe(slot.id);
}

/** s2-spec 화면 11 예시 상태의 1번 시약장 칸 분류 (양문형 4단) */
/** s2-spec 상태 화면 11-delete 예시의 2번 시약장 (양문형 3단, 프레임 11-delete 의 칸 글자) */
export const FRAME_LAYOUT_2: Record<string, string[]> = { L1: ["무기염"], R1: ["유기"], L2: ["산"], R2: ["기타"], L3: ["염기"], R3: ["인화성"] };
export const EMPTY_HEADING = "시약장 0개";

/**
 * 0개 상태 제목 줄: 390 = 본문 제목 "시약장 0개" (heading), 1440 = 새 프레임 11-empty-desktop page-head — h1 "시약장" + 옆 회색 "0개"
 * (제목 줄 글자 = 프레임 title + count = "시약장 0개").
 */
export async function expectEmptyHeading(page: Page, what: string): Promise<void> {
  if (isMobile(page)) {
    await expect(main(page).getByRole("heading", { name: exact(EMPTY_HEADING) }), `${what}: 제목 줄 "${EMPTY_HEADING}"`).toBeVisible();
    return;
  }
  const nodes = (JSON.parse(readFileSync(framePath(`${SCREEN}-empty-desktop`), "utf8")) as { frames: { nodes: { name: string; path: string[]; text: { characters: string } | null }[] }[] }).frames[0].nodes;
  const t = nodes.find((n) => n.name === "title" && n.path.includes("title-row"))?.text?.characters ?? "";
  const c = nodes.find((n) => n.name === "count" && n.path.includes("title-row"))?.text?.characters ?? "";
  expect(`${t} ${c}`, "프레임 11-empty-desktop 제목 줄 = EMPTY_HEADING").toBe(EMPTY_HEADING);
  const row = main(page).locator('[data-name="page-head"] [data-name="title-row"]');
  await expect(row.getByRole("heading", { level: 1, name: exact(t) }), `${what}: 1440 h1 "${t}"`).toBeVisible();
  await expect.poll(async () => (await row.innerText()).replace(/\s+/g, " ").trim(), { message: `${what}: 1440 제목 줄 "${EMPTY_HEADING}"` }).toBe(EMPTY_HEADING);
}

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

/** s2-spec 1.15 화면 11 예시 "칸별 시약 수: 좌1단 2, 좌2단 3, 우1단 1, 우3단 1" (프레임 11 slot-count 4개) */
export const FRAME_COUNTS: Record<string, number> = { L1: 2, L2: 3, R1: 1, R3: 1 };

export type S11Residue =Residue & { cabinets: number; cabinet_slots: number; reagents: number; intake_logs: number; usage_logs: number };
export const NO_S11_RESIDUE: S11Residue = { users: 0, schools: 0, invites: 0, profiles: 0, cabinets: 0, cabinet_slots: 0, reagents: 0, intake_logs: 0, usage_logs: 0 };

/** 이 묶음(group)·프로젝트의 일회용 학교·계정과 그 학교의 시약·시약장을 지우고 남은 수를 돌려준다 */
export async function cleanup(group: string, project: string): Promise<S11Residue> {
  const sb = service();
  const schools = await sb.from("schools").select("id").like("neis_code", tempSchoolLike(group, project));
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
