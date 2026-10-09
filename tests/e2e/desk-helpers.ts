// 데스크톱 재구성 run b (d7 §23 "2026-10-09 run b 세부", design/rules.json 1.24 desktop_shell, dev-rules 1.12) 테스트 공용 도우미.
// - 목록 2·8·9·10 = data-table, 한 건 보기·짧은 폼 3·4·9·10·16 = 오른쪽 detail-drawer(폭 desktop_shell.drawer_width).
// - 데스크톱에서 3 /reagents/[id] · 16 /msds/[id] · 4 /usage/new = 시약 목록(data-table) 위 오른쪽 드로어 — 그 화면의 본문은 드로어 안이다.
// - 폭 390 은 변경 없음 (모바일 전용 화면).
// 기대값은 rules.json · dev-rules.json · 새 프레임(design/frames)에서만 읽는다 (구현에서 읽지 않는다).
import { readFileSync, readdirSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";
import { DESKTOP_SHELL } from "../desktop-shell";
import { NEW_FRAMES_DIR } from "../frames";
import { devRules, sel, type ViewportName } from "./screen-helpers";

export const DRAWER = "detail-drawer";
export const TABLE = "data-table";
export const ROW = "ex-data-table-cell";

type DeskRules = { drawer_width: number; width: number; overlay: string };
const DS = DESKTOP_SHELL as unknown as typeof DESKTOP_SHELL & DeskRules;

/** rules.json desktop_shell.drawer_width (480) */
export const DRAWER_W = DS.drawer_width;
/** rules.json desktop_shell.width (사이드바 240) */
export const SIDEBAR_W = DS.width;

type FNode = { name: string; type: string; path: string[]; width?: number; height?: number; fills?: string[]; text?: { characters: string } | null };
/** 새 프레임 노드 (design/frames — 이전된 화면 대조) */
export function newFrame(name: string): FNode[] {
  const file = name.endsWith(".json") ? name : `${name}.json`;
  return (JSON.parse(readFileSync(`${NEW_FRAMES_DIR}/${file}`, "utf8")) as { frames: { nodes: FNode[] }[] }).frames[0].nodes;
}

/** 시안 2-desktop data-table 의 행 수 = 한 쪽 행 수 (시안은 10행 + 쪽 번호) */
export const PAGE_SIZE = newFrame("2-desktop").filter((n) => n.name === ROW && n.path.includes(TABLE)).length;

/**
 * 데스크톱에서 시약 목록(화면 2 data-table) 위 오른쪽 드로어로 여는 화면 (d7 §23 run b 세부: 3 · 16 · 4).
 * 이 화면들의 본문 = 드로어 안 (뒤 목록은 화면 2).
 */
export const REAGENT_DRAWER_SCREENS = [3, 4, 16];

/** 프로젝트 폭이 데스크톱인가 (dev-rules viewports.desktop 폭) */
export const isDeskPage = (page: Page): boolean => (page.viewportSize()?.width ?? 0) >= devRules.viewports.desktop[0];

export const drawer = (page: Page): Locator => page.locator(sel(DRAWER));
export const deskTables = (page: Page): Locator => page.locator(`main ${sel(TABLE)}`);
/** 데스크톱 시약 목록 표 (드로어 화면 3·4·16 의 뒤 목록 포함) */
export const deskTable = (page: Page): Locator => deskTables(page).first();
export const tableRows = (scope: Locator): Locator => scope.locator(sel(ROW));

/**
 * 화면 본문 범위: 데스크톱 3·4·16 = 드로어(뒤 목록은 화면 2 몫), 그 밖 = 문서 전체.
 * 화면 컴포넌트 개수를 셀 때 쓴다 (예: 드로어 화면의 badge-low-stock 은 드로어 안만 — 목록 행의 배지는 화면 2 것).
 */
export function screenScope(page: Page, screen: number, viewport: ViewportName): Locator {
  if (viewport === "desktop" && REAGENT_DRAWER_SCREENS.includes(screen)) return drawer(page);
  return page.locator("body");
}

/** scope 안 data-component 개수 */
export function countIn(scope: Locator, name: string): Promise<number> {
  return scope.locator(sel(name)).count();
}

/** 드로어 1개가 보일 때까지 + 하이드레이션 (폭 전용 사본이 빠져 1개) */
export async function waitDrawer(page: Page, timeout = 45_000): Promise<Locator> {
  const d = drawer(page);
  await expect(d, "detail-drawer 1").toHaveCount(1, { timeout });
  await expect(d, "detail-drawer 보임").toBeVisible({ timeout });
  await page.waitForLoadState("load");
  await expect
    .poll(() => d.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__react"))), { message: "드로어 하이드레이션", timeout })
    .toBe(true);
  return d;
}

/** 드로어 제목 (h2 — 접근 이름 = aria-labelledby) */
export const drawerTitle = (page: Page): Locator => drawer(page).locator("h2").first();
/** 드로어 × (aria-label "닫기") */
export const drawerClose = (page: Page): Locator => drawer(page).locator('[data-name="drawer-close"]');

/** 쪽 번호 줄 (표 아래) */
export const pagination = (scope: Locator): Locator => scope.locator('nav[data-name="pagination"]');

/** 데스크톱 시약 목록 표에서 첫 칸 글자가 name 인 행 — 없으면 쪽을 넘기며 찾는다. 못 찾으면 실패 */
export async function findDeskRow(page: Page, name: string): Promise<Locator> {
  const table = deskTable(page);
  await expect(table, "시약 목록 data-table").toBeVisible({ timeout: 45_000 });
  for (let guard = 0; guard < 50; guard++) {
    const exactRow = tableRows(table).filter({ has: page.getByText(name, { exact: true }) });
    if ((await exactRow.count()) > 0) return exactRow.first();
    const pager = pagination(page.locator("main"));
    if ((await pager.count()) === 0) break;
    const current = pager.locator('[aria-current="true"]');
    const cur = Number((await current.innerText()).trim());
    const next = pager.getByRole("button", { name: String(cur + 1), exact: true }).or(pager.getByRole("link", { name: String(cur + 1), exact: true }));
    if ((await next.count()) === 0) break;
    await next.first().click();
    await expect(pager.locator('[aria-current="true"]'), `${cur + 1}쪽`).toHaveText(String(cur + 1));
  }
  throw new Error(`데스크톱 시약 목록에 "${name}" 행 없음 (모든 쪽)`);
}

/** 표의 머리 칸 글자 (보이는 것, 동작 열 제외) */
export async function headLabels(table: Locator): Promise<string[]> {
  return table.locator("thead th").evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter((t) => t !== "" && t !== "동작"),
  );
}

/** 행의 칸 글자 (td 마다) */
export async function cellTexts(row: Locator): Promise<string[]> {
  return row.locator("td").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
}

/** 요소 상자 (보이는지 확인 포함) */
export async function boxOf(l: Locator, what = "요소"): Promise<{ x: number; y: number; width: number; height: number }> {
  await expect(l, `${what} 보임`).toBeVisible();
  const b = await l.boundingBox();
  if (!b) throw new Error(`${what} 상자 없음`);
  return b;
}

/** 새 프레임 {name} 에서 조상 경로에 ancestor 가 있는(또는 자신인) 노드 이름 집합 — 드로어 화면의 "드로어 안" 컴포넌트 */
export function frameNamesIn(name: string, ancestor: string): Set<string> {
  return new Set(newFrame(name).filter((n) => n.path.includes(ancestor)).map((n) => n.name));
}

/**
 * 이전된 화면 S 의 "모바일 전용" 본문 컴포넌트: dev-rules components 에서 화면 S 소속이고, 새 프레임 S-mobile(상태 프레임 포함, 둘러보기 제외)에는
 * 있지만 어느 S-*-desktop 프레임에도 없는 것 (셸 제외). 예: 2 reagent-row · 3·4 reagent-detail-card · 9 ex-modal-card(등록 시트).
 * 데스크톱에서 그 자리는 data-table · detail-drawer 가 대신한다 (d7 §23 run b).
 */
export function mobileOnlyOf(screen: number, shell: string[]): string[] {
  const files = readdirSync(NEW_FRAMES_DIR).filter((f) => new RegExp(`^${screen}-`).test(f) && !f.includes("guest"));
  const mob = new Set<string>();
  const desk = new Set<string>();
  for (const f of files) {
    const names = newFrame(f).map((n) => n.name);
    for (const n of names) (f.endsWith("-mobile.json") ? mob : desk).add(n);
  }
  return Object.entries(devRules.components)
    .filter(([n, ss]) => ss.includes(screen) && mob.has(n) && !desk.has(n) && !shell.includes(n))
    .map(([n]) => n);
}

/** scope 안(자신 포함) data-component 개수 — 드로어를 범위로 셀 때 detail-drawer 자신도 1 로 센다 */
export function countScoped(scope: Locator, name: string): Promise<number> {
  return scope.evaluateAll(
    (els, n) => els.reduce((acc, el) => acc + (el.getAttribute("data-component") === n ? 1 : 0) + el.querySelectorAll(`[data-component="${n}"]`).length, 0),
    name,
  );
}

/**
 * 폭 정리 대기: 서버 HTML 에는 두 폭(모바일 전용 · 데스크톱 전용 묶음)이 함께 들어 있고, 하이드레이션 뒤 맞지 않는 폭이 DOM 에서 빠진다.
 * 개수를 세기 전에 그 폭이 정리될 때까지 기다린다 (d7 §23 "모바일은 지금처럼 전용 화면", rules desktop_shell).
 * - 390: 데스크톱 전용 app-sidebar · data-table · detail-drawer 0
 * - 1440: 모바일 셸 nav-pill · tab-bar 0, 모바일 전용 본문 reagent-detail-card 0
 */
export async function waitWidthSettled(page: Page, timeout = 45_000): Promise<void> {
  const gone = isDeskPage(page) ? ["nav-pill", "tab-bar", "reagent-detail-card"] : [DESKTOP_SHELL.component, TABLE, DRAWER];
  // 둘러보기(/demo)도 run d 부터 같은 규칙 (1440 = app-sidebar 셸 + 표·드로어, d7 §23 "run d 세부")
  for (const n of gone) await expect(page.locator(sel(n)), `폭 정리 대기: ${n} 0 (하이드레이션 뒤)`).toHaveCount(0, { timeout });
}
