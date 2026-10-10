// C3 데스크톱 재구성 run c — 본문 페이지(5 · 7 · 11) · 홈(13) · 재주문(6) (harness/d5-gates.md C3, harness/d7-data.md §23 "run c 세부",
// design/rules.json 1.24 desktop_shell(heavy_pages · form_width · drawer_width · overlay), harness/dev-rules.json 1.13(desktop_migrated_screens + 5·6·7·11·13)).
// - heavy_pages 5·7·11 = 가운데 폼(form_width) + 본문 아래 고정 bottom-bar (시안 5 · 7 · 11-desktop): page-head 제목 · page-column 폭 · 바 위치·높이·버튼 글자
// - 7 서류 입고: 데스크톱 doc-upload(파일 선택 1개 — 촬영하기 없음) · 읽는 중 · 확인 표(전폭 page-column — 시안 7-doc-review) · 실패 · MSDS 후보 = 팝오버(시안 7-msds)
// - 11: 한 열(시안 순서) · 칸 시트 = 누른 칸 옆 팝오버(시안 11-slot) · QR 인쇄 = 오른쪽 detail-drawer + 시약장 드롭다운(11-print) ·
//       삭제 · 저장 안 한 변경 = 가운데 확인 카드(11-delete · 11-unsaved) · 0개(11-empty)
// - 13: page-head(학교명 · "오늘 M월 D일 · 전체 시약 N종" · 빠른 실행 버튼 줄) · "지금 처리할 것" 타일 · 위젯 격자 (역할별)
// - 6: 제목 + "N건" · 가운데 640 열 · 안내 박스 → 알림 카드 (bottom-bar 없음)
// - 폭 390 은 변경 없음 (각 테스트의 모바일 갈래) — 모바일 시안 문구만 본다.
// 기대값은 rules.json · dev-rules.json · 새 프레임(design/frames)에서 읽는다 (구현에서 읽지 않는다). 프레임의 예시 숫자는 틀(정규식)로만 본다.
// 계정: 공용 학교 A 학생·교사·admin(보기만 — 추출·검색 API 는 가로채고 저장 요청 0) + 일회용 학교(11 쓰기 상태 · 0개 상태 · 7 등록 뒤 추천 —
// service role 은 준비·정리에만, 판정은 로그인 세션).
import { join } from "node:path";
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { DESKTOP_SHELL } from "../desktop-shell";
import { desktopMigratedScreens } from "../frames";
import { openAs } from "./auth-state";
import { DRAWER, DRAWER_W, SIDEBAR_W, boxOf, newFrame, waitWidthSettled } from "./desk-helpers";
import { browserClient, browserSession, devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { HAS_SERVICE, openTemp } from "./screen-8-helpers";
import { NO_RESIDUE_69, cleanup } from "./screen-6-9-helpers";
import {
  DOUBLE,
  SINGLE,
  defaultName,
  deleteNotice,
  makeFixture,
  pickDoor,
  prepCabinet,
  prepLayout,
  prepPlace,
  prepReagent,
  sharedCabinetSnapshot,
  slotSheet,
  unsavedBody,
  waitCabinets,
  waitEditable,
  watchActions,
  type S11Fixture,
} from "./screen-11-helpers";
import { EXTRACT, blockSaves, mockExtract, toResult, waitManual } from "./screen-5-helpers";
import {
  CAMERA,
  DOC_PDF,
  PICK_FILE,
  READ,
  interceptExtract,
  item,
  pickFile,
  table as docTable,
  upload as docUpload,
  waitUpload,
} from "./doc-intake-helpers";
import { REGISTER_BUTTON, TOAST_REGISTER, fillRegister, intakePath, registerForm, waitIntake } from "./screen-7-helpers";
import { FIND, MSDS_CANDIDATES, MSDS_SEARCH, interceptSearch } from "./msds-helpers";
import { LATER, LOCATION_SUGGEST } from "./suggest-helpers";

const GROUP = "c3runc";
type DeskRulesC = { heavy_pages: number[]; form_width: number; overlay: string };
const DSC = DESKTOP_SHELL as unknown as typeof DESKTOP_SHELL & DeskRulesC;
/** rules.json desktop_shell.form_width (640) */
const FORM_W = DSC.form_width;
/** rules.json desktop_shell.heavy_pages (5 · 7 · 11) */
const HEAVY = DSC.heavy_pages;
const MIGRATED = desktopMigratedScreens();
const VIEW_W = devRules.viewports.desktop[0];
const VIEW_H = devRules.viewports.desktop[1];
const MOBILE_W = devRules.viewports.mobile[0];
const MOBILE_H = devRules.viewports.mobile[1];

// ---------- 기대값: 새 프레임 ----------
type FNode = ReturnType<typeof newFrame>[number] & { padding?: number[] | null };
const nodes = (f: string) => newFrame(f) as FNode[];
const fnode = (f: string, name: string, under?: string): FNode => {
  const n = nodes(f).find((x) => x.name === name && (!under || x.path.includes(under)));
  if (!n) throw new Error(`새 프레임 ${f} 에 ${under ? `${under}/` : ""}${name} 없음`);
  return n;
};
const ftexts = (f: string, pred: (n: FNode) => boolean): string[] => nodes(f).filter((n) => n.text && pred(n)).map((n) => n.text!.characters);
const ftext = (f: string, pred: (n: FNode) => boolean, what: string): string => {
  const t = ftexts(f, pred);
  if (t.length === 0) throw new Error(`새 프레임 ${f} 에 ${what} 없음`);
  return t[0];
};
const has = (f: string, name: string, under?: string) => nodes(f).some((x) => x.name === name && (!under || x.path.includes(under)));
/** 프레임 bottom-bar 안 버튼 글자 (왼쪽 → 오른쪽) */
const barLabels = (f: string) => ftexts(f, (n) => n.name === "label" && n.path.includes("bottom-bar"));
/** 프레임 page-head 제목 · 옆 숫자 예시 */
const titleOf = (f: string) => ftext(f, (n) => n.name === "title" && n.path.includes("page-title"), "page-head 제목");
const countOf = (f: string) => ftexts(f, (n) => n.name === "count" && n.path.includes("title-row"))[0] ?? null;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);
/** 프레임 숫자 예시를 틀로: "2개" → /^\d+개$/ */
const pattern = (example: string) => new RegExp(`^${esc(example).replace(/\d[\d,]*/g, "[\\d,]+")}$`);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const BAR = fnode("5-desktop", "bottom-bar");
/** 시안 bottom-bar 높이 (80) · 안쪽 여백 [위, 오른쪽, 아래, 왼쪽] */
const BAR_H = BAR.height!;
const BAR_PAD = (BAR.padding ?? [16, 32, 16, 32]) as number[];
/** 시안 main 안쪽 여백 (32) */
const MAIN_PAD = ((fnode("5-desktop", "main").padding ?? [32, 32, 32, 32]) as number[])[3];
/** 본문(사이드바 오른쪽) 가운데 x */
const BODY_CENTER = (SIDEBAR_W + VIEW_W) / 2;
const SLOT_SHEET_W = fnode("11-slot-desktop", "slot-sheet").width!;
const CAND7_W = fnode("7-msds-desktop", MSDS_CANDIDATES).width!;
const DEL_MODAL_W = fnode("11-delete-desktop", "ex-modal-card").width!;
const UNSAVED_MODAL_W = fnode("11-unsaved-desktop", "ex-modal-card").width!;
const PRINT_MAIN_W = fnode("11-print-desktop", "main").width!;
const REVIEW_COL_W = fnode("7-doc-review-desktop", "page-column").width!;

/** 확인 카드 문구 (11-delete · 11-unsaved — 데스크톱 프레임) */
const DEL = {
  title: ftext("11-delete-desktop", (n) => n.name === "modal-title", "삭제 제목"),
  caption: ftext("11-delete-desktop", (n) => n.name === "modal-caption", "삭제 캡션"),
  buttons: ftexts("11-delete-desktop", (n) => n.name === "label" && n.path.includes("modal-actions")),
};
const UNSAVED = {
  title: ftext("11-unsaved-desktop", (n) => n.name === "modal-title", "저장 안 함 제목"),
  buttons: ftexts("11-unsaved-desktop", (n) => n.name === "label" && n.path.includes("modal-actions")),
};
const EMPTY11 = {
  title: ftext("11-empty-desktop", (n) => n.name === "empty-title", "빈 제목"),
  guide: ftext("11-empty-desktop", (n) => n.name === "empty-guide", "빈 안내"),
  add: ftext("11-empty-desktop", (n) => n.name === "label" && n.path.includes("cabinet-add"), "시약장 추가"),
  count: countOf("11-empty-desktop"),
};
const PRINT = {
  title: ftext("11-print-desktop", (n) => n.name === "sheet-title-text" && n.path.includes(DRAWER), "QR 인쇄 제목"),
  field: ftext("11-print-desktop", (n) => n.name === "field-label" && n.path.includes("print-target"), "시약장 라벨"),
  all: ftext("11-print-desktop", (n) => n.name === "value" && n.path.includes("print-target"), "모두"),
  action: ftext("11-print-desktop", (n) => n.name === "label" && n.path.includes("drawer-footer"), "인쇄"),
};
/** 7 서류 입고 문구 (데스크톱 프레임) */
const DOC = {
  modes: ftexts("7-desktop", (n) => n.name === "label" && n.path.includes("intake-mode")),
  uploadButtons: ftexts("7-desktop", (n) => n.name === "label" && n.path.includes("upload-actions")),
  reading: ftext("7-doc-upload-desktop", (n) => n.name === "heading" && n.path.includes("reading-text"), "읽는 중"),
  cancel: ftext("7-doc-upload-desktop", (n) => n.name === "label" && n.path.includes("doc-upload") && n.path.includes("button-outline"), "취소"),
  reviewHeads: ftexts("7-doc-review-desktop", (n) => n.name === "ex-data-table-cell" && n.path.includes("table-header")),
  failTitle: ftext("7-doc-fail-desktop", (n) => n.name === "heading" && n.path.includes("ex-empty-state-card"), "실패 제목"),
  failBody: ftext("7-doc-fail-desktop", (n) => n.name === "body" && n.path.includes("ex-empty-state-card"), "실패 본문"),
  failAction: ftext("7-doc-fail-desktop", (n) => n.name === "label" && n.path.includes("ex-empty-state-card"), "실패 버튼"),
  againHeading: ftext("7-doc-fail-desktop", (n) => n.name === "heading" && n.path.includes("doc-upload"), "다른 파일 올리기"),
};
/** 13 홈 (교사 시안 13-desktop) */
const HOME = {
  subtitle: ftext("13-desktop", (n) => n.name === "subtitle" && n.path.includes("page-title"), "부제"),
  todo: ftext("13-desktop", (n) => n.name === "section-title" && n.path.includes("todo-section"), "지금 처리할 것"),
  tileCaptions: ftexts("13-desktop", (n) => n.name === "caption" && n.path.includes("tile-row")),
  tileNotes: ftexts("13-desktop", (n) => n.name === "note" && n.path.includes("tile-row")),
  widgetTitles: ftexts("13-desktop", (n) => n.name === "widget-title" && n.path.includes("widget-grid")),
  more: ftexts("13-desktop", (n) => n.name === "label" && n.path.includes("widget-head") && n.path.includes("button-pill-soft")),
  heads: ftexts("13-desktop", (n) => n.path.includes("table-head") && n.path.includes("data-table") && (n.name === "label" || n.name === "head-cell")),
  rows: nodes("13-desktop").filter((n) => n.name === "ex-data-table-cell" && n.path.includes("recent-usage-widget")).length,
  cabNote: ftext("13-desktop", (n) => n.name === "note" && n.path.includes("widget-column") && n.path.includes("home-summary") && /칸/.test(n.text?.characters ?? ""), "시약장 요약 줄"),
  display: ftexts("13-desktop", (n) => n.name === "display" && n.path.includes("widget-column")),
};
/** 6 재주문 (6-desktop) */
const REORDER = {
  guide: ftext("6-desktop", (n) => n.name === "info-body", "안내 본문"),
  guideTitle: ftext("6-desktop", (n) => n.name === "info-title", "안내 제목"),
  guideMobile: ftext("6-mobile", (n) => n.name === "info-body", "모바일 안내 본문"),
};

// =====================================================================
// 기대값 원본
// =====================================================================

test(`[C3][S*] 기대값 원본 (run c): desktop_migrated_screens ⊇ 5·6·7·11·13 · heavy_pages ${HEAVY.join("·")} · form_width ${FORM_W} · bottom-bar 높이 ${BAR_H} · 팝오버 폭 ${SLOT_SHEET_W}/${CAND7_W} · QR 인쇄 드로어 ${DRAWER_W}(본문 ${PRINT_MAIN_W}) · 확인 카드 ${DEL_MODAL_W} · 확인 표 열 ${REVIEW_COL_W}`, () => {
  for (const s of [5, 6, 7, 11, 13]) expect(MIGRATED, `dev-rules 1.13 desktop_migrated_screens 에 ${s}`).toContain(s);
  for (const s of HEAVY) {
    expect(MIGRATED, `heavy_pages ${s} 이전됨`).toContain(s);
    expect(fnode(`${s}-desktop`, "page-column").width, `${s}-desktop page-column = form_width`).toBe(FORM_W);
    // 하단 고정 바 노드 이름: 5·7·11 = bottom-bar, 4(1.25, 디자인 run 20261010-1340) = save-bar — 같은 자리·같은 폭
    const barName = has(`${s}-desktop`, "bottom-bar", "main") ? "bottom-bar" : "save-bar";
    expect(has(`${s}-desktop`, barName, "main"), `${s}-desktop main 안 하단 고정 바(bottom-bar · save-bar)`).toBe(true);
    expect(fnode(`${s}-desktop`, barName).width, `${s}-desktop ${barName} = main 폭`).toBe(fnode(`${s}-desktop`, "main").width);
    expect(fnode(`${s}-desktop`, barName).height, `${s}-desktop ${barName} 높이 = 5-desktop bottom-bar`).toBe(BAR_H);
  }
  expect(SIDEBAR_W + fnode("5-desktop", "main").width!, "사이드바 + main = 1440").toBe(VIEW_W);
  expect(fnode("6-desktop", "page-column").width, "6-desktop page-column = form_width").toBe(FORM_W);
  expect(has("6-desktop", "bottom-bar"), "6-desktop bottom-bar 없음").toBe(false);
  expect(has("13-desktop", "page-column"), "13-desktop = 가운데 열 아님 (위젯 격자)").toBe(false);
  expect(has("13-desktop", "widget-grid") && has("13-desktop", "todo-section"), "13-desktop 타일 + 위젯 격자").toBe(true);
  expect(REVIEW_COL_W, "7-doc-review 확인 표 = 전폭 열 (main − 안쪽 여백 2)").toBe(fnode("7-doc-review-desktop", "main").width! - 2 * MAIN_PAD);
  expect(fnode("11-print-desktop", DRAWER).width, "11-print detail-drawer = drawer_width").toBe(DRAWER_W);
  expect(PRINT_MAIN_W + DRAWER_W + SIDEBAR_W, "11-print: 사이드바 + 본문 + 드로어 = 1440").toBe(VIEW_W);
  expect(nodes("11-print-desktop").some((n) => n.name === "qr-print-sheet" && n.path.includes(DRAWER)), "11-print: detail-drawer > qr-print-sheet").toBe(true);
  for (const w of [SLOT_SHEET_W, CAND7_W]) expect(w, "팝오버 폭 < form_width").toBeLessThan(FORM_W);
  expect(DSC.overlay, "rules overlay: 모달 = 확인·짧은 입력만 · 고르기 = 드롭다운·팝오버").toMatch(/모달 = 확인/);
  expect(DSC.overlay).toMatch(/팝오버/);
  expect(DEL.buttons.length, "11-delete 버튼 2").toBe(2);
  expect(UNSAVED.buttons.length, "11-unsaved 버튼 2").toBe(2);
  expect(barLabels("11-desktop"), "11 bottom-bar").toHaveLength(1);
  expect(barLabels("5-desktop"), "5 bottom-bar (결과)").toHaveLength(2);
  expect(DOC.uploadButtons, "7-desktop doc-upload 버튼 = 파일 선택 1개 (촬영하기 없음)").toEqual([PICK_FILE]);
  expect(DOC.uploadButtons).not.toContain(CAMERA);
  expect(HOME.tileCaptions.length, "13-desktop 타일 3").toBe(3);
  expect(REORDER.guideMobile, "6 안내 문구 두 폭 같음").toBe(REORDER.guide);
});

// =====================================================================
// 공용 도우미
// =====================================================================

async function hydrated(l: Locator): Promise<void> {
  await expect.poll(() => l.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__react"))), { message: "하이드레이션", timeout: 30_000 }).toBe(true);
}

/** 보이는 bottom-bar 들 */
async function visibleBars(page: Page): Promise<Locator[]> {
  const all = page.locator('main [data-name="bottom-bar"]');
  const out: Locator[] = [];
  for (let i = 0; i < (await all.count()); i++) if (await all.nth(i).isVisible()) out.push(all.nth(i));
  return out;
}
/** 범위 안 보이는 누를 것(버튼·링크) 글자 — 왼쪽부터 */
async function buttonLabels(scope: Locator): Promise<string[]> {
  return scope.locator("a, button").evaluateAll((els) =>
    els
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== "hidden";
      })
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      .map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
}

/** 두 상자 사이 거리 (겹치면 0) */
function gap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.hypot(dx, dy);
}

type BodyOpts = { frame: string; bar: string[] | null; wide?: boolean; count?: RegExp | null; drawerOpen?: boolean };
/**
 * 데스크톱 본문 페이지 틀 (시안 5 · 7 · 11 · 6-desktop):
 * page-head 제목(h1) = 프레임 제목 (+ 옆 숫자 틀) · page-column 폭 = form_width(또는 전폭 열) 가운데 ·
 * bottom-bar = 사이드바 오른쪽 본문 아래 고정(높이 · 오른쪽 끝 버튼 · 글자 = 프레임) · 마지막 블록이 바에 가리지 않음 · 가로 스크롤 없음
 */
async function expectBodyPage(page: Page, o: BodyOpts, what: string): Promise<void> {
  await expect(page.locator(sel("nav-pill")), `${what}: nav-pill 0`).toHaveCount(0, { timeout: 45_000 });
  await expect(page.locator(sel(rules.tab_bar.component)), `${what}: tab-bar 0`).toHaveCount(0);
  const head = page.locator('main [data-name="page-head"]').first();
  await expect(head, `${what}: page-head`).toBeVisible({ timeout: 45_000 });
  const h1 = head.locator("h1");
  await expect(h1, `${what}: page-head h1 1`).toHaveCount(1);
  expect(squash(await h1.innerText()), `${what}: 제목 = 프레임 ${o.frame} "${titleOf(o.frame)}"`).toBe(titleOf(o.frame));
  const sb = await boxOf(page.locator(sel(DESKTOP_SHELL.component)), "사이드바");
  const hb = await boxOf(h1, "제목");
  expect(Math.round(hb.x), `${what}: 제목 왼쪽 = 사이드바 + main 안쪽 여백 ${MAIN_PAD}`).toBe(Math.round(sb.x + sb.width + MAIN_PAD));
  if (o.count !== undefined && o.count !== null) {
    const row = head.locator('[data-name="title-row"]');
    const rest = squash((await row.innerText()).replace(squash(await h1.innerText()), ""));
    expect(rest, `${what}: 제목 옆 숫자 틀 ${o.count}`).toMatch(o.count);
  }
  const col = page.locator('main [data-name="page-column"]').first();
  const cb = await boxOf(col, `${what} page-column`);
  if (o.wide) {
    const want = REVIEW_COL_W;
    expect(Math.abs(cb.width - want), `${what}: 전폭 열 ${want} (시안 7-doc-review page-column)`).toBeLessThanOrEqual(1);
    expect(Math.abs(cb.x - (SIDEBAR_W + MAIN_PAD)), `${what}: 전폭 열 왼쪽 = 사이드바 + ${MAIN_PAD}`).toBeLessThanOrEqual(1);
  } else {
    expect(Math.abs(cb.width - FORM_W), `${what}: page-column 폭 = rules form_width ${FORM_W} (지금 ${cb.width})`).toBeLessThanOrEqual(1);
    if (!o.drawerOpen) expect(Math.abs(cb.x + cb.width / 2 - BODY_CENTER), `${what}: page-column 은 본문 가운데 (${BODY_CENTER})`).toBeLessThanOrEqual(1);
  }
  const bars = await visibleBars(page);
  if (o.bar === null) {
    expect(bars.length, `${what}: bottom-bar 없음 (시안 ${o.frame})`).toBe(0);
  } else {
    expect(bars.length, `${what}: 보이는 bottom-bar 1`).toBe(1);
    const bar = bars[0];
    expect(await bar.evaluate((el) => getComputedStyle(el).position), `${what}: bottom-bar 고정`).toBe("fixed");
    const bb = await boxOf(bar, "bottom-bar");
    expect(Math.round(bb.x), `${what}: bottom-bar 왼쪽 = 사이드바 오른쪽`).toBe(Math.round(sb.x + sb.width));
    if (!o.drawerOpen) expect(Math.round(bb.x + bb.width), `${what}: bottom-bar 오른쪽 = 화면 끝`).toBe(VIEW_W);
    expect(Math.round(bb.y + bb.height), `${what}: bottom-bar 아래 = 화면 아래`).toBe(VIEW_H);
    expect(Math.abs(bb.height - BAR_H), `${what}: bottom-bar 높이 = 시안 ${BAR_H} (지금 ${bb.height})`).toBeLessThanOrEqual(1);
    expect(await buttonLabels(bar), `${what}: bottom-bar 버튼 = ${o.bar.join(" · ")}`).toEqual(o.bar);
    const btns = bar.locator("a, button").filter({ visible: true });
    const last = await boxOf(btns.last(), "마지막 버튼");
    expect(Math.abs(bb.x + bb.width - BAR_PAD[1] - (last.x + last.width)), `${what}: 버튼 오른쪽 끝 = 바 오른쪽 − ${BAR_PAD[1]}`).toBeLessThanOrEqual(1);
    // 본문 맨 아래까지 내렸을 때 마지막 블록이 바에 가리지 않는다
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const contentBottom = await col.evaluate((el) => {
      let max = 0;
      const walk = (e: Element) => {
        for (const c of Array.from(e.children)) {
          if (c.closest('[data-name="bottom-bar"]')) continue;
          const st = getComputedStyle(c);
          if (st.position === "fixed" || st.display === "none" || st.visibility === "hidden") continue;
          const r = c.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) max = Math.max(max, r.bottom);
          if (st.display === "contents" || r.height === 0) walk(c);
        }
      };
      walk(el);
      return max;
    });
    const bar2 = await boxOf(bar, "bottom-bar (내린 뒤)");
    expect(contentBottom, `${what}: 맨 아래 블록이 bottom-bar 위 (가리지 않음)`).toBeLessThanOrEqual(bar2.y + 1);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${what}: 가로 스크롤 없음`).toBe(true);
}

/** 390: 모바일 셸 그대로 (nav-pill 1 · tab-bar 1 · 사이드바 0) */
async function expectMobileShell(page: Page, what: string): Promise<void> {
  await expect(page.locator(sel("nav-pill")), `${what}: 390 nav-pill 1`).toHaveCount(1, { timeout: 45_000 });
  await expect(page.locator(sel(rules.tab_bar.component)), `${what}: 390 tab-bar 1`).toHaveCount(1);
  await expect(page.locator(sel(DESKTOP_SHELL.component)), `${what}: 390 app-sidebar 0`).toHaveCount(0);
}

/** 390 하단 시트의 아래 끝 = tab-bar 위 (tab-bar 가 보이면) · 아니면 화면 아래 */
async function mobileSheetBottom(page: Page): Promise<number> {
  const bar = page.locator(sel(rules.tab_bar.component));
  if ((await bar.count()) === 0 || !(await bar.first().isVisible())) return MOBILE_H;
  return Math.round((await boxOf(bar.first(), "tab-bar")).y);
}

/** 확인 카드(모달): 폭 = 시안 · 화면 안 · 가로 가운데(화면 또는 본문) */
async function expectConfirmCard(page: Page, card: Locator, width: number, what: string): Promise<void> {
  const b = await boxOf(card, what);
  expect(Math.abs(b.width - width), `${what}: 폭 = 시안 ${width} (지금 ${b.width})`).toBeLessThanOrEqual(1);
  expect(b.y, `${what}: 화면 안`).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height, `${what}: 화면 안`).toBeLessThanOrEqual(VIEW_H + 1);
  const cx = b.x + b.width / 2;
  expect(Math.min(Math.abs(cx - VIEW_W / 2), Math.abs(cx - BODY_CENTER)), `${what}: 가로 가운데 (화면 ${VIEW_W / 2} 또는 본문 ${BODY_CENTER}, 지금 ${cx})`).toBeLessThanOrEqual(2);
}

const shot = (page: Page, name: string, viewport: ViewportName) =>
  page.screenshot({ path: join(process.cwd(), "test-results", `v1-${name}-${viewport}.png`) });

// =====================================================================
// 화면 5 — 실험 매뉴얼 (공용 학교 A 교사 · 추출 가로챔 · 저장 0)
// =====================================================================

test(`[C3][S5] 학교A 교사 /manual: 1440 = 제목 "${titleOf("5-desktop")}"(뒤로 없음) · page-column ${FORM_W} 가운데 · bottom-bar "${EXTRACT}" → 추출 결과 = bottom-bar ${barLabels("5-desktop").join(" · ")}(시안 5-desktop) · extraction-table 열 폭 · 저장 요청 0 / 390 = 모바일 셸`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 5);
  const saves = await blockSaves(context);
  try {
    await waitManual(page);
    await waitWidthSettled(page);
    if (viewport === "mobile") {
      await expectMobileShell(page, "화면 5");
      return;
    }
    await expectBodyPage(page, { frame: "5-desktop", bar: [EXTRACT] }, "화면 5 처음");
    await expect(page.locator('main [data-name="page-head"]').getByRole("link", { name: "뒤로", exact: true }), "page-head 뒤로 없음 (시안)").toHaveCount(0);
    const col = page.locator('main [data-name="page-column"]').first();
    await expect(col.locator(sel("manual-upload")), "업로드 영역은 가운데 열 안").toHaveCount(1);
    await mockExtract(page);
    await toResult(page);
    await expectBodyPage(page, { frame: "5-desktop", bar: barLabels("5-desktop") }, "화면 5 추출 결과");
    const t = col.locator(sel("extraction-table"));
    await expect(t, "extraction-table 은 가운데 열 안").toHaveCount(1);
    expect(Math.abs((await boxOf(t, "표")).width - fnode("5-desktop", "extraction-table").width!), "표 폭 = 시안 extraction-table").toBeLessThanOrEqual(1);
    await shot(page, "5-result", viewport);
    expect(saves.count(), "저장 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 6 — 재주문 알림 (공용 학교 A 교사 · 보기만)
// =====================================================================

test(`[C3][S6] 학교A 교사 /reorder: 1440 = 제목 "${titleOf("6-desktop")}" + "${countOf("6-desktop")}" 틀(= 카드 수) · page-column ${FORM_W} 가운데 · bottom-bar 없음 · 안내 박스 "${REORDER.guideTitle}" → 알림 카드(열 폭 그대로, 위→아래) · 카드 안 줄 순서(배지 → 시약명 → 수량 → 날짜 → 판매처 연결) / 390 = 같은 안내 문구`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 6);
  try {
    await page.waitForLoadState("load");
    await waitWidthSettled(page);
    const guide = page.locator(`main ${sel("manual-upload")}`);
    await expect(guide, "안내 박스").toBeVisible({ timeout: 45_000 });
    await expect(guide.getByText(viewport === "mobile" ? REORDER.guideMobile : REORDER.guide, { exact: true }), "안내 문구 = 새 프레임 info-body").toBeVisible();
    if (viewport === "mobile") {
      await expectMobileShell(page, "화면 6");
      return;
    }
    const cards = page.locator(`main ${sel("reorder-alert-card")}`);
    const n = await cards.count();
    const cnt = countOf("6-desktop");
    await expectBodyPage(page, { frame: "6-desktop", bar: null, count: cnt ? pattern(cnt) : null }, "화면 6");
    const head = squash(await page.locator('main [data-name="page-head"] [data-name="title-row"]').innerText());
    expect(head, `제목 옆 숫자 = 카드 수 ${n}`).toBe(`${titleOf("6-desktop")} ${cnt!.replace(/\d+/, String(n))}`);
    const col = page.locator('main [data-name="page-column"]').first();
    const cb = await boxOf(col, "열");
    const g = await boxOf(guide, "안내 박스");
    expect(Math.abs(g.width - cb.width), "안내 박스 = 열 폭").toBeLessThanOrEqual(1);
    let prev = g.y + g.height;
    for (let i = 0; i < n; i++) {
      const c = await boxOf(cards.nth(i), `카드 ${i + 1}`);
      expect(Math.abs(c.width - cb.width), `카드 ${i + 1} = 열 폭`).toBeLessThanOrEqual(1);
      expect(c.y, `카드 ${i + 1} 은 위 블록 아래`).toBeGreaterThanOrEqual(prev - 1);
      prev = c.y + c.height;
    }
    if (n > 0) {
      const card = cards.first();
      const ys = [
        (await boxOf(card.locator(sel("badge-low-stock")), "배지")).y,
        (await boxOf(card.getByRole("heading"), "시약명")).y,
        (await boxOf(card.getByText(/^재주문 기준 /).first(), "수량 줄")).y,
        (await boxOf(card.getByText(/알림$/).first(), "날짜")).y,
        (await boxOf(card.locator(sel("vendor-link")), "판매처 연결")).y,
      ];
      expect(ys, "카드 줄 순서 = 시안 6-desktop (위→아래)").toEqual([...ys].sort((a, b) => a - b));
    }
    await shot(page, "6", viewport);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 7 — 입고 (공용 학교 A 교사 · 추출·검색 가로챔 · 저장 0)
// =====================================================================

test(`[C3][S7] 학교A 교사 /intake 서류 입고: 1440 = 제목 "${titleOf("7-desktop")}" · page-column ${FORM_W} · 모드 ${DOC.modes.join("/")} · doc-upload 버튼 "${DOC.uploadButtons.join("")}"(촬영하기 없음) · bottom-bar "${barLabels("7-desktop").join("")}" → 읽는 중 "${DOC.reading}"·"${DOC.cancel}" → 확인 표 = 전폭 열 ${REVIEW_COL_W} · 머리 ${DOC.reviewHeads.join("·")} · bottom-bar "${barLabels("7-doc-review-desktop").join("")}" / 390 = 촬영하기 · 파일 선택`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 7);
  const actions = watchActions(page);
  try {
    await waitUpload(page);
    await waitWidthSettled(page);
    const up = docUpload(page);
    const pills = async () => (await up.locator(sel("button-pill-soft")).filter({ visible: true }).allInnerTexts()).map(squash);
    if (viewport === "mobile") {
      await expectMobileShell(page, "화면 7");
      expect(await pills(), "390 doc-upload = 촬영하기 · 파일 선택 (시안 7-mobile)").toEqual([CAMERA, PICK_FILE]);
      return;
    }
    await expectBodyPage(page, { frame: "7-desktop", bar: barLabels("7-desktop") }, "화면 7 서류 처음");
    expect(await pills(), "1440 doc-upload 버튼 = 시안 7-desktop (촬영하기 없음)").toEqual(DOC.uploadButtons);
    expect((await page.locator(`main ${sel("intake-mode")} button`).allInnerTexts()).map(squash), "모드 = 시안").toEqual(DOC.modes);
    const col = page.locator('main [data-name="page-column"]').first();
    await expect(col.locator(sel("doc-upload")), "doc-upload 은 가운데 열 안").toHaveCount(1);
    // 읽는 중 (응답 지연) → 확인 표
    await interceptExtract(page, () => ({
      body: { ok: true, docDate: null, items: [item("염산 35% 500mL", 500, "mL", 4, { suggestedClass: "산" }), item("질산칼륨 500g", 500, "g", 1, { suggestedClass: "산화제" })] },
      delayMs: 3_000,
    }));
    await pickFile(page, DOC_PDF);
    const read = page.locator('main [data-name="bottom-bar"]').getByRole("button", { name: exact(READ) });
    await expect(read, `bottom-bar "${READ}" 활성`).toBeEnabled();
    await read.click();
    await expect(up.getByText(DOC.reading, { exact: true }), `읽는 중 "${DOC.reading}"`).toBeVisible({ timeout: 10_000 });
    await expect(up.locator(sel("button-outline")).filter({ hasText: exact(DOC.cancel) }), `"${DOC.cancel}"`).toBeVisible();
    await expect(docTable(page), "확인 표").toHaveCount(1, { timeout: 30_000 });
    await expectBodyPage(page, { frame: "7-doc-review-desktop", bar: barLabels("7-doc-review-desktop"), wide: true }, "화면 7 확인 표");
    const tb = await boxOf(docTable(page), "확인 표");
    expect(Math.abs(tb.width - REVIEW_COL_W), "확인 표 = 전폭 열 (시안 doc-intake-table)").toBeLessThanOrEqual(1);
    const tableText = squash(await docTable(page).innerText());
    let at = -1;
    for (const h of DOC.reviewHeads) {
      const i = tableText.indexOf(h, at + 1);
      expect(i, `확인 표 머리 "${h}" (시안 순서 ${DOC.reviewHeads.join("·")})`).toBeGreaterThan(at);
      at = i;
    }
    await shot(page, "7-doc-review", viewport);
    expect(actions.count(), "저장 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C3][S7] 학교A 교사 /intake 서류 읽기 실패(품목 0): 1440 = 7-doc-fail — 가운데 열 안 ex-empty-state-card "${DOC.failTitle}" · "${DOC.failBody}" · "${DOC.failAction}" + doc-upload "${DOC.againHeading}" · bottom-bar "${barLabels("7-doc-fail-desktop").join("")}" / 390 = 같은 문구`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 7);
  const actions = watchActions(page);
  try {
    await waitUpload(page);
    await waitWidthSettled(page);
    await interceptExtract(page, () => ({ body: { ok: true, docDate: null, items: [] } }));
    await pickFile(page, DOC_PDF);
    await page.locator("main").locator(sel("button-primary")).filter({ hasText: exact(READ) }).filter({ visible: true }).click();
    const card = page.locator(`main ${sel("ex-empty-state-card")}`);
    await expect(card, "실패 카드").toHaveCount(1, { timeout: 30_000 });
    await expect(card).toContainText(DOC.failTitle);
    await expect(card).toContainText(DOC.failBody);
    await expect(card.getByRole("button", { name: exact(DOC.failAction) }).or(card.getByRole("link", { name: exact(DOC.failAction) })), `"${DOC.failAction}"`).toHaveCount(1);
    await expect(docUpload(page).getByText(DOC.againHeading, { exact: true }), `"${DOC.againHeading}"`).toBeVisible();
    if (viewport === "mobile") return;
    await expectBodyPage(page, { frame: "7-doc-fail-desktop", bar: barLabels("7-doc-fail-desktop") }, "화면 7 실패");
    const col = page.locator('main [data-name="page-column"]').first();
    await expect(col.locator(sel("ex-empty-state-card")), "실패 카드는 가운데 열 안").toHaveCount(1);
    const cy = (await boxOf(card, "실패 카드")).y;
    expect(cy, "실패 카드 → 다른 파일 올리기 (위→아래)").toBeLessThan((await boxOf(docUpload(page), "doc-upload")).y);
    await shot(page, "7-doc-fail", viewport);
    expect(actions.count(), "저장 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C3][S7] 학교A 교사 /intake 새 시약 등록 "${FIND}" → ${MSDS_CANDIDATES} = 누른 버튼 옆 팝오버(폭 ${CAND7_W}, 시안 7-msds-desktop — 바텀시트 아님) · 화면 안 · Esc 로 닫힘 · 직접 입력 = page-column ${FORM_W} + bottom-bar / 390 = 전폭 하단 시트`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 7, intakePath({ tab: "register" }));
  const actions = watchActions(page);
  try {
    await waitIntake(page, "register");
    await waitWidthSettled(page);
    await interceptSearch(page);
    if (viewport === "desktop") {
      // 직접 입력(등록) 갈래도 가운데 폼 + 하단 고정 바 (d7 §23 run c "7 입고(서류·직접 입력)")
      const col = page.locator('main [data-name="page-column"]').first();
      expect(Math.abs((await boxOf(col, "열")).width - FORM_W), `직접 입력 page-column = ${FORM_W}`).toBeLessThanOrEqual(1);
      await expect(col.locator(sel("reagent-register")), "등록 폼은 가운데 열 안").toHaveCount(1);
      const bars = await visibleBars(page);
      expect(bars.length, "직접 입력 bottom-bar 1").toBe(1);
      expect(await bars[0].evaluate((el) => getComputedStyle(el).position), "bottom-bar 고정").toBe("fixed");
      await expect(bars[0].locator(sel("button-primary")).filter({ hasText: exact(REGISTER_BUTTON) }), `bottom-bar "${REGISTER_BUTTON}"`).toHaveCount(1);
    }
    const form = registerForm(page);
    await form.getByRole("textbox", { name: /시약명/ }).first().fill("질산칼륨");
    const find = form.locator(sel(MSDS_SEARCH));
    await hydrated(find);
    await find.click();
    const cand = page.locator(sel(MSDS_CANDIDATES));
    await expect(cand, "후보 열림").toBeVisible({ timeout: 30_000 });
    const c = await boxOf(cand, "후보");
    if (viewport === "mobile") {
      expect(Math.round(c.width), "390 후보 = 전폭 하단 시트").toBe(MOBILE_W);
      expect(Math.round(c.y + c.height), "390 후보 = 아래(tab-bar 위) 붙음").toBe(await mobileSheetBottom(page));
      return;
    }
    expect(Math.abs(c.width - CAND7_W), `후보 폭 = 시안 7-msds-desktop ${CAND7_W} (지금 ${c.width})`).toBeLessThanOrEqual(1);
    expect(c.x, "사이드바를 덮지 않음").toBeGreaterThanOrEqual(SIDEBAR_W - 1);
    expect(c.x + c.width, "화면 안").toBeLessThanOrEqual(VIEW_W + 1);
    expect(c.y, "화면 안").toBeGreaterThanOrEqual(-1);
    expect(c.y + c.height, "화면 안 (바텀시트 아님)").toBeLessThanOrEqual(VIEW_H + 1);
    expect(gap(c, await boxOf(find, "MSDS 찾기")), "누른 버튼 옆 (거리 ≤ 24)").toBeLessThanOrEqual(24);
    await shot(page, "7-msds", viewport);
    await page.keyboard.press("Escape");
    await expect(cand, "Esc → 닫힘").toHaveCount(0);
    expect(actions.count(), "저장 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 11 — 시약장 (공용 학교 A — 보기만)
// =====================================================================

test(`[C3][S11] 학교A 교사 /cabinets: 1440 = 제목 "${titleOf("11-desktop")}" + "${countOf("11-desktop")}" 틀(= 시약장 수) · page-column ${FORM_W} 한 열(시안 순서 switcher → 이름 → 관리 줄 → 문 형태·단 수 → 배치도 → 범례 → 분류 칩 → 칸 없음 시약) · 요약 "문 형태 · N단"(칸 수 없음) · bottom-bar "${barLabels("11-desktop").join("")}" / 390 = 요약 같은 꼴`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 11);
  try {
    await waitCabinets(page);
    await waitWidthSettled(page);
    const { client } = await browserClient(page);
    const cabs = await client.from("cabinets").select("id");
    expect(cabs.error).toBeNull();
    const n = (cabs.data ?? []).length;
    expect(n, "학교 A 시약장 ≥ 1").toBeGreaterThan(0);
    const title = page.locator("main").getByRole("heading", { level: 2 }).first();
    const meta = await title.evaluate((el) => (el.nextElementSibling as HTMLElement | null)?.innerText ?? "");
    expect(squash(meta), "요약 = \"문 형태 · N단\" (새 프레임 11-mobile · 11-desktop — 칸 수 없음)").toMatch(/^(양문형|단문형) · \d+단$/);
    if (viewport === "mobile") {
      await expectMobileShell(page, "화면 11");
      return;
    }
    const cnt = countOf("11-desktop")!;
    await expectBodyPage(page, { frame: "11-desktop", bar: barLabels("11-desktop"), count: pattern(cnt) }, "화면 11");
    expect(squash(await page.locator('main [data-name="page-head"] [data-name="title-row"]').innerText()), `제목 옆 = 시약장 수 ${n}`).toBe(`${titleOf("11-desktop")} ${cnt.replace(/\d+/, String(n))}`);
    const col = page.locator('main [data-name="page-column"]').first();
    const cb = await boxOf(col, "열");
    const order: [string, Locator][] = [
      ["cabinet-switcher", col.locator(sel("cabinet-switcher"))],
      ["이름", title],
      ["이름 바꾸기", col.locator(sel("cabinet-edit")).locator(sel("button-outline")).first()],
      ["문 형태", col.locator(sel("cabinet-door-select"))],
      ["배치도", col.locator(sel("cabinet-slot")).first()],
      ["범례", col.locator(`${sel("storage-class-chip")}:not(button)`).first()],
      ["분류 칩", col.locator(`button${sel("storage-class-chip")}`).first()],
      ["칸 없음 시약", col.getByRole("heading", { name: /^칸 없음 시약/ })],
    ];
    let prevY = -1;
    for (const [what, l] of order) {
      if ((await l.count()) === 0 && what === "칸 없음 시약") continue;
      const b = await boxOf(l, what);
      expect(b.y, `${what} 은 앞 블록 아래 (시안 11-desktop 한 열)`).toBeGreaterThan(prevY);
      expect(b.x, `${what} 은 열 안 (왼쪽)`).toBeGreaterThanOrEqual(cb.x - 1);
      expect(b.x + b.width, `${what} 은 열 안 (오른쪽)`).toBeLessThanOrEqual(cb.x + cb.width + 1);
      prevY = b.y;
    }
    await shot(page, "11", viewport);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 13 — 홈 (공용 학교 A 학생·교사·admin — 보기만)
// =====================================================================

const kstToday = () => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).formatToParts(new Date());
  return `${Number(p.find((x) => x.type === "month")!.value)}월 ${Number(p.find((x) => x.type === "day")!.value)}일`;
};
const capacity = (door: string, shelves: number) => (door === SINGLE ? 1 : 2) * shelves;

for (const role of ["student", "teacher", "admin"] as const) {
  test(`[C3][S13] 학교A ${role === "student" ? "학생" : role === "teacher" ? "교사" : "admin"} 홈: 1440 = page-head(학교명 h1 · "${HOME.subtitle}" 틀 = 오늘·시약 수 · 오른쪽 quick-action 버튼 줄) · "${HOME.todo}" 타일 ${role === "student" ? "재고 부족 (reorder-alert-card 0 — R2)" : HOME.tileCaptions.join(" · ")} 한 줄 = DB 숫자 · 위젯 격자(${HOME.widgetTitles.join(" · ")} — 표 머리 ${HOME.heads.join("·")} · "${HOME.more[0]}") / 390 = data-table · todo-section 0`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, viewport } = await openAs(browser, info, role, 13);
    try {
      await page.waitForLoadState("load");
      await waitWidthSettled(page);
      if (viewport === "mobile") {
        await expectMobileShell(page, "화면 13");
        await expect(page.locator(`main ${sel("data-table")}`), "390 data-table 0").toHaveCount(0);
        await expect(page.locator('main [data-name="todo-section"]'), "390 타일 줄 0").toHaveCount(0);
        await expect(page.locator(`main ${sel("quick-action")}`), "390 quick-action 1").toHaveCount(1);
        return;
      }
      const me = await browserSession(page);
      const { client } = await browserClient(page);
      const r = await client.from("reagents").select("stock, min_stock, msds_url");
      expect(r.error).toBeNull();
      const rows = r.data ?? [];
      const low = rows.filter((x) => Number(x.stock) < Number(x.min_stock)).length;
      const noMsds = rows.filter((x) => !x.msds_url || String(x.msds_url).trim() === "").length;
      const cabs = await client.from("cabinets").select("door_type, shelves");
      expect(cabs.error).toBeNull();
      const slotsTotal = (cabs.data ?? []).reduce((s, c) => s + capacity(String(c.door_type), Number(c.shelves)), 0);
      const logs = await client.from("usage_logs").select("id", { count: "exact", head: true });

      await expect(page.locator(sel("nav-pill")), "nav-pill 0").toHaveCount(0, { timeout: 45_000 });
      const head = page.locator('main [data-name="page-head"]').first();
      await expect(head.locator("h1"), "학교명 h1").toHaveText(me.schoolName);
      const sub = squash(await head.locator('[data-name="page-title"]').innerText()).replace(me.schoolName, "").trim();
      expect(sub, `부제 틀 "${HOME.subtitle}"`).toMatch(pattern(HOME.subtitle));
      expect(sub, "부제 = 오늘(한국) · 전체 시약 수 (DB)").toBe(HOME.subtitle.replace(/\d+월 \d+일/, kstToday()).replace(/\d+종/, `${rows.length}종`));
      const quick = head.locator(`[data-name="page-actions"] ${sel("quick-action")}`);
      await expect(quick, "quick-action 은 page-head 오른쪽 page-actions 안").toHaveCount(1);
      const qb = await boxOf(quick, "quick-action");
      expect(Math.round(qb.x + qb.width), "quick-action 오른쪽 끝 = 본문 오른쪽 − 안쪽 여백").toBe(VIEW_W - MAIN_PAD);
      // 지금 처리할 것
      const todo = page.locator('main [data-name="todo-section"]');
      await expect(todo.getByRole("heading", { name: exact(HOME.todo) }), `"${HOME.todo}"`).toBeVisible();
      const tiles = todo.locator('[data-name="tile-row"] > *');
      const want = role === "student" ? HOME.tileCaptions.filter((c) => c !== HOME.tileCaptions[1] && c !== HOME.tileCaptions[2]) : HOME.tileCaptions;
      const caps: string[] = [];
      for (let i = 0; i < (await tiles.count()); i++) caps.push(squash(await tiles.nth(i).innerText()));
      expect(caps.map((t) => want.find((w) => t.startsWith(w)) ?? t), `타일 = ${want.join(" · ")}`).toEqual(want);
      if (role === "student") await expect(page.locator(sel("reorder-alert-card")), "학생 reorder-alert-card 0 (R2)").toHaveCount(0);
      const tb = await Promise.all(Array.from({ length: want.length }, (_, i) => boxOf(tiles.nth(i), `타일 ${i + 1}`)));
      for (const b of tb.slice(1)) expect(Math.abs(b.y - tb[0].y), "타일 한 줄").toBeLessThanOrEqual(1);
      const nums = async (i: number) => ((await tiles.nth(i).locator('[data-name="tile-value"]').innerText()).match(/\d+/g) ?? []).map(Number);
      expect((await nums(0))[0], `타일 "${want[0]}" 숫자 = 재고 부족 ${low}`).toBe(low);
      if (role !== "student") {
        expect(await nums(1), `타일 "${want[1]}" = ${low} + "${low}건"`).toEqual([low, low]);
        await expect(tiles.nth(1)).toHaveAttribute("data-component", "reorder-alert-card");
        const go = tiles.nth(1).locator(sel("button-pill-soft"));
        await expect(go, "재주문 알림 → 화면 6").toHaveAttribute("href", routeOf(6));
        expect(await nums(2), `타일 "${want[2]}" = MSDS 없는 시약 ${noMsds}`).toEqual([noMsds]);
      }
      // 위젯 격자
      const grid = page.locator('main [data-name="widget-grid"]');
      await expect(grid).toBeVisible();
      const titles = (await grid.getByRole("heading").allInnerTexts()).map(squash);
      expect(titles, "위젯 제목 = 시안 13-desktop").toEqual(HOME.widgetTitles);
      const recent = grid.locator('[data-name="recent-usage-widget"]');
      const table = recent.locator(sel("data-table"));
      await expect(table, "최근 사용 기록 = data-table").toHaveCount(1);
      expect((await table.locator('[data-name="table-head"] th, thead th').allInnerTexts()).map(squash).filter(Boolean), "표 머리 = 시안").toEqual(HOME.heads);
      await expect(table.locator(sel("ex-data-table-cell")), `행 = min(시안 ${HOME.rows}, 기록 수)`).toHaveCount(Math.min(HOME.rows, logs.count ?? 0));
      const rb = await boxOf(recent, "최근 사용 기록");
      const colW = await boxOf(grid.locator('[data-name="widget-column"]'), "오른쪽 위젯 열");
      expect(Math.abs(rb.y - colW.y), "위젯 두 열 위쪽 같음").toBeLessThanOrEqual(1);
      expect(rb.x + rb.width, "최근 사용 기록 = 왼쪽 넓은 열").toBeLessThanOrEqual(colW.x);
      expect(rb.width, "왼쪽 열이 더 넓음 (시안 752 : 368)").toBeGreaterThan(colW.width);
      const more = grid.locator(sel("button-pill-soft")).filter({ hasText: exact(HOME.more[0]) });
      await expect(more, `"${HOME.more[0]}" = 위젯 수`).toHaveCount(HOME.widgetTitles.length);
      const hrefs = (await more.evaluateAll((els) => els.map((e) => new URL((e as HTMLAnchorElement).href).pathname)));
      expect(hrefs, '"전체 보기" → 기록 · 시약 · 시약장').toEqual([routeOf(10), routeOf(2), routeOf(11)]);
      const cabWidget = grid.locator('[data-name="widget-column"] > *').nth(1);
      const cabText = squash(await cabWidget.innerText());
      expect(cabText, `시약장 요약 = "${(cabs.data ?? []).length}개"`).toContain(`${(cabs.data ?? []).length}개`);
      const m = new RegExp(pattern(HOME.cabNote).source.replace(/^\^|\$$/g, "")).exec(cabText);
      expect(m, `시약장 요약 줄 틀 "${HOME.cabNote}"`).not.toBeNull();
      const [S, A, B] = (m![0].match(/\d+/g) ?? []).map(Number);
      expect(S, "칸 수 = DB 시약장 칸 합").toBe(slotsTotal);
      expect(A + B, "지정 + 미지정 = 칸 수").toBe(S);
      await shot(page, `13-${role}`, viewport);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 일회용 학교 — 11 상태(0개 · 칸 시트 · QR 인쇄 · 삭제 · 저장 안 한 변경) · 7 등록 뒤 추천
// =====================================================================

type RunC = { f: S11Fixture; cabs: { id: string; label: string }[]; placed: string };
let fx: Promise<S11Fixture> | null = null;
let filled: Promise<RunC> | null = null;
let beforeSnap: string[] | null = null;

function fixture(info: TestInfo): Promise<S11Fixture> {
  fx ??= makeFixture(info, GROUP);
  fx.catch(() => {
    fx = null;
  });
  return fx;
}
/** 시약장 2개(1번 양문형 4단 · 분류 몇 칸 · 시약 1개 배치) — 0개 상태 테스트 뒤에 만든다 */
function withCabinets(info: TestInfo): Promise<RunC> {
  filled ??= (async () => {
    const f = await fixture(info);
    const c1 = await prepCabinet(f);
    const c2 = await prepCabinet(f);
    await prepLayout(f, c1.id as string, DOUBLE, 4, { L1: ["산"], R1: ["염기"], L2: ["산화제"] });
    await prepLayout(f, c2.id as string, DOUBLE, 3, {});
    const r = await prepReagent(f, "c3c", 10, "g", "산");
    await prepPlace(f, r.id, c1.id as string, "L1");
    return { f, cabs: [{ id: c1.id as string, label: defaultName(1) }, { id: c2.id as string, label: defaultName(2) }], placed: r.id };
  })();
  filled.catch(() => {
    filled = null;
  });
  return filled;
}

test.describe("일회용 학교 (run c 11 상태 · 7 추천)", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

  test.beforeAll(async () => {
    beforeSnap = await sharedCabinetSnapshot();
  });
  test.afterAll(async ({}, info) => {
    info.setTimeout(300_000);
    fx = null;
    filled = null;
    const left = await cleanup(GROUP, info.project.name);
    expect(left, "일회용 계정·학교·시약 잔여물").toEqual(NO_RESIDUE_69);
    if (beforeSnap) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치가 그대로").toEqual(beforeSnap);
  });

  test(`[C3][S11] 일회용 교사 시약장 0개 = 11-empty: 1440 제목 "${titleOf("11-empty-desktop")}" + "${EMPTY11.count}" · 가운데 열 안 ex-empty-state-card "${EMPTY11.title}" · "${EMPTY11.guide}" · 카드 안 cabinet-add "${EMPTY11.add}" · bottom-bar 없음 / 390 = 같은 문구 + nav-account-menu ▾ (d7 §23)`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const f = await fixture(info);
    const { context, page, viewport } = await openTemp(browser, info, f.teacher, routeOf(11));
    try {
      await waitCabinets(page, "empty");
      await waitWidthSettled(page);
      const card = page.locator(`main ${sel("ex-empty-state-card")}`);
      await expect(card).toContainText(EMPTY11.title);
      await expect(card).toContainText(EMPTY11.guide);
      await expect(card.locator(sel("cabinet-add")), `카드 안 cabinet-add`).toHaveCount(1);
      await expect(card.locator(sel("cabinet-add"))).toContainText(EMPTY11.add);
      if (viewport === "mobile") {
        await expectMobileShell(page, "화면 11 0개");
        await expect(page.locator(`${sel("nav-pill")} ${sel("nav-account-menu")}`), "390 nav-pill 계정 메뉴 ▾ (시안 11-empty-mobile)").toHaveCount(1);
        return;
      }
      await expectBodyPage(page, { frame: "11-empty-desktop", bar: null, count: new RegExp(`^${esc(EMPTY11.count!)}$`) }, "화면 11 0개");
      await expect(page.locator('main [data-name="page-column"]').first().locator(sel("ex-empty-state-card")), "빈 카드는 가운데 열 안").toHaveCount(1);
      await shot(page, "11-empty", viewport);
    } finally {
      await context.close();
    }
  });

  test(`[C3][S11] 일회용 교사 칸 시트 = 11-slot: 칸을 누르면 slot-sheet 가 그 칸 옆 팝오버(폭 ${SLOT_SHEET_W}) — 누른 칸을 덮지 않음 · 화면 안 · 사이드바 밖 · Esc 로 닫힘 / 390 = 전폭 하단 시트`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const s = await withCabinets(info);
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, routeOf(11));
    const actions = watchActions(page);
    try {
      await waitEditable(page);
      await waitWidthSettled(page);
      const slot = page.locator(`main ${sel("cabinet-slot")}`).nth(2);
      await hydrated(slot);
      await slot.click();
      const sheet = slotSheet(page);
      await expect(sheet, "칸 시트").toBeVisible();
      const b = await boxOf(sheet, "칸 시트");
      if (viewport === "mobile") {
        expect(Math.round(b.width), "390 칸 시트 = 전폭").toBe(MOBILE_W);
        expect(Math.round(b.y + b.height), "390 칸 시트 = 아래(tab-bar 위) 붙음").toBe(await mobileSheetBottom(page));
        return;
      }
      expect(Math.abs(b.width - SLOT_SHEET_W), `칸 시트 폭 = 시안 11-slot-desktop ${SLOT_SHEET_W} (지금 ${b.width})`).toBeLessThanOrEqual(1);
      expect(b.x, "사이드바를 덮지 않음").toBeGreaterThanOrEqual(SIDEBAR_W - 1);
      expect(b.x + b.width, "화면 안").toBeLessThanOrEqual(VIEW_W + 1);
      expect(b.y, "화면 안").toBeGreaterThanOrEqual(-1);
      expect(b.y + b.height, "화면 안 (바텀시트 아님)").toBeLessThanOrEqual(VIEW_H + 1);
      const sb = await boxOf(slot, "누른 칸");
      expect(gap(b, sb), "누른 칸 옆 (거리 ≤ 24)").toBeLessThanOrEqual(24);
      const seen = await slot.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && el.contains(hit);
      });
      expect(seen, "누른 칸은 팝오버에 덮이지 않음").toBe(true);
      await shot(page, "11-slot", viewport);
      await page.keyboard.press("Escape");
      await expect(slotSheet(page), "Esc → 닫힘").toHaveCount(0);
      expect(actions.count(), "저장 요청 0").toBe(0);
    } finally {
      await context.close();
    }
  });

  test(`[C3][S11] 일회용 교사 QR 인쇄 = 11-print: 오른쪽 ${DRAWER}(폭 ${DRAWER_W} · 위 0 · 화면 높이) 안 제목 "${PRINT.title}" · print-target "${PRINT.field}" 드롭다운(listbox — 시약장 pill 아님, 선택지 = 시약장들 + "${PRINT.all}") · "${PRINT.action}" · 본문은 드로어 왼쪽(page-column · bottom-bar 가 드로어에 덮이지 않음) · Esc 로 닫힘 / 390 = 드로어 0`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const s = await withCabinets(info);
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, routeOf(11));
    const actions = watchActions(page);
    try {
      await waitEditable(page);
      await waitWidthSettled(page);
      const open = page.locator(`main ${sel("qr-print")}`).getByRole("button");
      await hydrated(open);
      await open.click();
      const sheet = page.locator(sel("qr-print-sheet"));
      await expect(sheet.getByRole("heading", { name: exact(PRINT.title) }), `제목 "${PRINT.title}"`).toBeVisible();
      if (viewport === "mobile") {
        await expect(page.locator(sel(DRAWER)), "390 detail-drawer 0").toHaveCount(0);
        return;
      }
      const d = page.locator(sel(DRAWER));
      await expect(d, "detail-drawer 1").toHaveCount(1);
      const db = await boxOf(d, "드로어");
      expect(Math.round(db.width), `드로어 폭 = rules drawer_width ${DRAWER_W}`).toBe(DRAWER_W);
      expect(Math.round(db.x + db.width), "드로어 오른쪽 끝 = 화면 끝").toBe(VIEW_W);
      expect(Math.round(db.y), "드로어 위 = 0").toBe(0);
      expect(Math.round(db.height), "드로어 높이 = 화면 높이").toBe(VIEW_H);
      expect(await d.evaluate((el, s2) => !!el.closest(s2) || !!el.querySelector(s2), sel("qr-print-sheet")), "드로어 = qr-print-sheet 묶음").toBe(true);
      await expect(d.getByRole("heading", { name: exact(PRINT.title) }), "제목은 드로어 안").toBeVisible();
      const target = d.locator('[data-name="print-target"]');
      await expect(target.getByText(PRINT.field, { exact: true }), `"${PRINT.field}" 라벨`).toBeVisible();
      await expect(target.locator(sel("cabinet-chip")).or(target.locator("[aria-pressed]")), "시약장 pill 0 (드롭다운)").toHaveCount(0);
      const combo = target.locator('[aria-haspopup="listbox"]');
      await expect(combo, "드롭다운 버튼 1").toHaveCount(1);
      await combo.click();
      const options = page.getByRole("listbox").getByRole("option");
      expect((await options.allInnerTexts()).map(squash), `선택지 = 시약장 ${s.cabs.map((c) => c.label).join(" · ")} + "${PRINT.all}"`).toEqual([...s.cabs.map((c) => c.label), PRINT.all]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("listbox"), "Esc → 드롭다운 먼저 닫힘").toHaveCount(0);
      await expect(d, "드로어는 그대로").toHaveCount(1);
      await expect(d.locator(sel("button-primary")).filter({ hasText: exact(PRINT.action) }), `"${PRINT.action}"`).toHaveCount(1);
      const col = await boxOf(page.locator('main [data-name="page-column"]').first(), "열");
      expect(col.x + col.width, "page-column 은 드로어 왼쪽").toBeLessThanOrEqual(db.x + 1);
      const bars = await visibleBars(page);
      expect(bars.length, "bottom-bar 1").toBe(1);
      const bb = await boxOf(bars[0], "bottom-bar");
      expect(Math.round(bb.x + bb.width), `bottom-bar 오른쪽 = 드로어 왼쪽 (시안 11-print main ${PRINT_MAIN_W})`).toBe(Math.round(db.x));
      await shot(page, "11-print", viewport);
      await page.keyboard.press("Escape");
      await expect(page.locator(sel(DRAWER)), "Esc → 드로어 닫힘").toHaveCount(0);
      expect(actions.count(), "저장 요청 0").toBe(0);
    } finally {
      await context.close();
    }
  });

  test(`[C3][S11] 일회용 교사 삭제 확인 = 11-delete: 가운데 확인 카드(폭 ${DEL_MODAL_W}) "${DEL.title}" · "배치된 시약 N개는 '칸 없음'으로 바뀌어요"(N = DB) · "${DEL.caption}" · 버튼 ${DEL.buttons.join(" → ")} · "${DEL.buttons[0]}" → 닫힘 · DB 그대로 / 390 = 같은 문구`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const s = await withCabinets(info);
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, routeOf(11));
    const actions = watchActions(page);
    try {
      await waitEditable(page);
      await waitWidthSettled(page);
      const del = page.locator(`main ${sel("cabinet-edit")}`).getByRole("button", { name: exact(DEL.buttons[1]) });
      await hydrated(del);
      await del.click();
      const dialog = page.getByRole("dialog", { name: exact(DEL.title) });
      await expect(dialog, "삭제 확인").toBeVisible();
      await expect(dialog).toContainText(deleteNotice(1));
      await expect(dialog).toContainText(DEL.caption);
      const card = dialog.locator(sel("ex-modal-card")).or(dialog.and(page.locator(sel("ex-modal-card")))).first();
      expect((await buttonLabels(card)).filter((l) => DEL.buttons.includes(l)), `버튼 ${DEL.buttons.join(" → ")}`).toEqual(DEL.buttons);
      if (viewport === "desktop") {
        await expectConfirmCard(page, card, DEL_MODAL_W, "삭제 확인 카드");
        await shot(page, "11-delete", viewport);
      }
      await card.getByRole("button", { name: exact(DEL.buttons[0]) }).click();
      await expect(dialog, `"${DEL.buttons[0]}" → 닫힘`).toHaveCount(0);
      const { client } = await browserClient(page);
      const left = await client.from("cabinets").select("id");
      expect((left.data ?? []).length, "DB 시약장 그대로").toBe(s.cabs.length);
      expect(actions.count(), "저장 요청 0").toBe(0);
    } finally {
      await context.close();
    }
  });

  test(`[C3][S11] 일회용 교사 저장 안 한 변경 = 11-unsaved: 문 형태를 바꾸고 다른 시약장 pill → 가운데 확인 카드(폭 ${UNSAVED_MODAL_W}) "${UNSAVED.title}" · "이동하면 {이름}에서 바꾼 내용이 사라져요" · 버튼 ${UNSAVED.buttons.join(" → ")} · "${UNSAVED.buttons[1]}" → 그 자리 · 바꾼 값 유지 · DB 그대로`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const s = await withCabinets(info);
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, routeOf(11));
    const actions = watchActions(page);
    try {
      await waitEditable(page);
      await waitWidthSettled(page);
      await pickDoor(page, SINGLE);
      const other = page.locator(`main ${sel("cabinet-switcher")}`).locator("a, button").filter({ hasText: s.cabs[1].label });
      await other.first().click();
      const dialog = page.getByRole("dialog", { name: exact(UNSAVED.title) });
      await expect(dialog, "저장 안 한 변경 확인").toBeVisible();
      await expect(dialog).toContainText(unsavedBody(s.cabs[0].label));
      const card = dialog.locator(sel("ex-modal-card")).or(dialog.and(page.locator(sel("ex-modal-card")))).first();
      expect((await buttonLabels(card)).filter((l) => UNSAVED.buttons.includes(l)), `버튼 ${UNSAVED.buttons.join(" → ")}`).toEqual(UNSAVED.buttons);
      if (viewport === "desktop") {
        await expectConfirmCard(page, card, UNSAVED_MODAL_W, "저장 안 한 변경 카드");
        await shot(page, "11-unsaved", viewport);
      }
      await card.getByRole("button", { name: exact(UNSAVED.buttons[1]) }).click();
      await expect(dialog, `"${UNSAVED.buttons[1]}" → 닫힘`).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("cabinet") ?? s.cabs[0].id, "그 자리 (1번 시약장)").toBe(s.cabs[0].id);
      await expect(page.locator(`main ${sel("cabinet-door-select")}`).getByRole("radio", { name: exact(SINGLE) }), "바꾼 값 유지").toBeChecked();
      expect(actions.count(), "저장 요청 0").toBe(0);
    } finally {
      await context.close();
    }
  });

  test(`[C3][S7] 일회용 교사 새 시약 등록 뒤 추천 = 7-suggest: 1440 = 가운데 열 안 ${LOCATION_SUGGEST} · bottom-bar 왼쪽 "${LATER}"(시안 ${barLabels("7-suggest-desktop").join(" · ")} 중) · 바에 가리지 않음 → "${LATER}" → 화면 2 / 390 = ${LOCATION_SUGGEST} 안 "${LATER}"`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const s = await withCabinets(info);
    const { context, page, viewport } = await openTemp(browser, info, s.f.teacher, intakePath({ tab: "register" }));
    try {
      await waitIntake(page, "register");
      await waitWidthSettled(page);
      await fillRegister(page, { name: `런씨추천-${Math.random().toString(36).slice(2, 6)}`, storageClass: "산화제", stock: "1", unit: "병" });
      const reg = page.locator("main").locator(sel("button-primary")).filter({ hasText: exact(REGISTER_BUTTON) }).filter({ visible: true });
      await expect(reg).toBeEnabled();
      await reg.click();
      await expect(page.locator(sel("ex-toast")).filter({ hasText: TOAST_REGISTER }), `토스트 "${TOAST_REGISTER}"`).toBeVisible({ timeout: 30_000 });
      const box = page.locator(`main ${sel(LOCATION_SUGGEST)}`);
      await expect(box, LOCATION_SUGGEST).toHaveCount(1, { timeout: 30_000 });
      const later = page.locator("main").getByRole("button", { name: exact(LATER) }).filter({ visible: true });
      await expect(later, `"${LATER}" 1`).toHaveCount(1);
      if (viewport === "desktop") {
        const col = page.locator('main [data-name="page-column"]').first();
        const cb = await boxOf(col, "열");
        expect(Math.abs(cb.width - FORM_W), `page-column ${FORM_W}`).toBeLessThanOrEqual(1);
        await expect(col.locator(sel(LOCATION_SUGGEST)), "추천은 가운데 열 안").toHaveCount(1);
        const bars = await visibleBars(page);
        expect(bars.length, "bottom-bar 1").toBe(1);
        const labels = await buttonLabels(bars[0]);
        expect(labels[0], `bottom-bar 왼쪽 끝 = "${LATER}" (시안 7-suggest-desktop bar-start)`).toBe(LATER);
        for (const l of labels) expect(barLabels("7-suggest-desktop"), `bottom-bar 버튼 "${l}" 은 시안 7-suggest-desktop 의 것`).toContain(l);
        const lb = await boxOf(later, LATER);
        const bb = await boxOf(bars[0], "bottom-bar");
        expect(Math.abs(lb.x - (bb.x + BAR_PAD[3])), `"${LATER}" = 바 왼쪽 + ${BAR_PAD[3]}`).toBeLessThanOrEqual(1);
        const sbox = await boxOf(box, LOCATION_SUGGEST);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        expect((await boxOf(box, LOCATION_SUGGEST)).y + sbox.height, "추천 블록이 bottom-bar 에 가리지 않음").toBeLessThanOrEqual((await boxOf(bars[0], "bottom-bar")).y + 1);
        await shot(page, "7-suggest-c3", viewport);
      } else {
        await expect(box.getByRole("button", { name: exact(LATER) }), `390 "${LATER}" 은 ${LOCATION_SUGGEST} 안`).toHaveCount(1);
      }
      await later.click();
      await page.waitForURL((u) => u.pathname === routeOf(2), { timeout: 30_000 });
    } finally {
      await context.close();
    }
  });
});
