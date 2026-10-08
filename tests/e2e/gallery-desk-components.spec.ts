// 데스크톱 재구성 run b 컴포넌트 (D1) — data-table · detail-drawer 의 컴포넌트 수준 동작, 갤러리 /gallery/desk · /gallery (비로그인 공개).
// 기준: design/rules.json 1.24 desktop_shell(desktop_required · drawer_width), harness/dev-rules.json 1.12 components(data-table [2,8,9,10] ·
//       detail-drawer [3,4,9,10,16]), harness/d7-data.md §23 run b, 새 프레임 design/frames 2·3·4·9·10-desktop.
// 기대값: 치수·색·문구는 새 프레임 노드에서, 드로어 폭은 rules.json 에서 읽는다 (구현에서 읽지 않는다).
// 태그: [K1] 은 dev-rules test_rules 밖 (judge 규칙 집계에 섞이지 않음) — 화면 번호로 D1 실행에 포함된다.
import { test, expect, type Locator, type Page } from "@playwright/test";
import { DESKTOP_SHELL } from "../desktop-shell";
import { DRAWER, DRAWER_W, ROW, TABLE, boxOf, newFrame } from "./desk-helpers";
import { devRules, sel } from "./screen-helpers";

const GALLERY_DESK = "/gallery/desk";
const GALLERY = "/gallery";

type FNode = ReturnType<typeof newFrame>[number] & { cornerRadius?: number | null; strokes?: string[]; padding?: number[] | null };
const nodesOf = (f: string) => newFrame(f) as FNode[];
const first = (f: string, pred: (n: FNode) => boolean, what: string): FNode => {
  const n = nodesOf(f).find(pred);
  if (!n) throw new Error(`새 프레임 ${f} 에 ${what} 없음`);
  return n;
};

// ---------- 기대값: 새 프레임 ----------
const F2 = "2-desktop";
const F3 = "3-desktop";
const F4 = "4-desktop";
const F10 = "10-desktop";
const TABLE_NODE = first(F2, (n) => n.name === TABLE, "data-table");
const HEAD = first(F2, (n) => n.name === "table-head", "table-head");
const ROW_NODE = first(F2, (n) => n.name === ROW && n.path.includes(TABLE), "표 행");
const SELECTED_ROW = first(F3, (n) => n.name === ROW && n.path.includes(TABLE) && (n.fills ?? []).length > 0 && n.fills![0] !== "#ffffff", "선택 행");
const PAGE_CURRENT = first(F2, (n) => n.name === "page-number" && (n.fills ?? []).length > 0, "현재 쪽");
const GROUP_ROW = first(F10, (n) => n.name === "date-group-row", "date-group-row");
const GROUP_BAR = first(F10, (n) => n.name === "group-indicator", "group-indicator");
const GROUP_CAPTION = first(F10, (n) => n.name === "caption" && n.path.includes("date-group-row"), "묶음 머리 글자");
const DRAWER_NODE = first(F3, (n) => n.name === DRAWER, "detail-drawer");
const DRAWER_BODY = first(F3, (n) => n.name === "drawer-body", "drawer-body");
const DRAWER_CLOSE = first(F3, (n) => n.name === "drawer-close", "drawer-close");
const DRAWER_ACTIONS = first(F3, (n) => n.name === "drawer-actions", "drawer-actions");
const ROW_LABEL = first(F3, (n) => n.name === "row-label" && n.path.includes("info-row"), "info-row 라벨");
const BACK_TEXT = first(F4, (n) => n.name === "label" && n.path.includes("back-link"), "back-link 글자").text!.characters;

const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function open(page: Page, path: string): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `${path} 응답`).toBe(200);
  await page.waitForLoadState("load");
  await expect
    .poll(() => page.locator("main").evaluate((el) => Object.keys(el.querySelector("button") ?? el).some((k) => k.startsWith("__react"))), { message: "하이드레이션", timeout: 30_000 })
    .toBe(true);
}

const section = (page: Page, id: string) => page.locator(`section[aria-labelledby="g-${id}"]`);
const desktopProject = (page: Page) => (page.viewportSize()?.width ?? 0) >= devRules.viewports.desktop[0];

// ---------- 기대값 원본 ----------
test(`[K1][S2] 기대값 원본: rules desktop_shell.desktop_required(2·8·9·10 ${TABLE} · 3·16 ${DRAWER}) = dev-rules 1.12 components · drawer_width ${DRAWER_W} = 새 프레임 드로어 폭 · 표 머리 ${HEAD.height} · 행 ${ROW_NODE.height} · radius ${TABLE_NODE.cornerRadius} · 선택 행 ${SELECTED_ROW.fills![0]}`, () => {
  const req = DESKTOP_SHELL.desktop_required;
  for (const s of devRules.components[TABLE]) expect(req[String(s)] ?? [], `desktop_required ${s} 에 ${TABLE}`).toContain(TABLE);
  for (const s of ["3", "16"]) expect(req[s], `desktop_required ${s} 에 ${DRAWER}`).toContain(DRAWER);
  expect(devRules.components[DRAWER], "dev-rules detail-drawer 화면").toEqual([3, 4, 9, 10, 16]);
  expect(devRules.components[TABLE], "dev-rules data-table 화면").toEqual([2, 8, 9, 10]);
  for (const f of ["3-desktop", "4-desktop", "9-desktop", "10-desktop", "16-desktop", "16-fail-desktop", "16-loading-desktop", "16-no-summary-desktop", "3-location-desktop", "3-msds-desktop", "4-past-date-desktop"]) {
    expect(first(f, (n) => n.name === DRAWER, "drawer").width, `${f} detail-drawer 폭 = rules drawer_width`).toBe(DRAWER_W);
  }
  expect(DRAWER_NODE.height, "드로어 높이 = 프레임 높이 (화면 높이)").toBe(900);
  expect([HEAD.height, ROW_NODE.height]).toEqual([40, 48]);
  expect(BACK_TEXT, "4-desktop 뒤로 링크").toMatch(/^‹ /);
});

// ---------- data-table ----------
test.describe("data-table (/gallery/desk)", () => {
  test(`[K1][S2] 시약 표 예시: 머리행 열 이름 = 시안 2-desktop · 머리 높이 ${HEAD.height} · 행 높이 ${ROW_NODE.height} · 테두리 radius ${TABLE_NODE.cornerRadius} · 행 = ${ROW}`, async ({ page }) => {
    await open(page, GALLERY_DESK);
    const t = section(page, "table").locator(sel(TABLE));
    await expect(t, "data-table 1").toHaveCount(1);
    const want = nodesOf(F2).filter((n) => n.name === "label" && n.path.includes("head-cell") && n.text).map((n) => n.text!.characters);
    const got = await t.locator("thead th").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
    expect(got, "머리행 열 이름 (시안 2-desktop 순서)").toEqual(want);
    const rows = t.locator(sel(ROW));
    expect(await rows.count(), "예시 행 ≥ 2").toBeGreaterThanOrEqual(2);
    if (!desktopProject(page)) return; // 치수는 1440 에서 (갤러리 칸 폭 차이)
    expect(Math.round((await boxOf(t.locator('[data-name="table-head"]'), "머리행")).height), "머리행 높이").toBe(HEAD.height);
    for (const r of await rows.all()) expect(Math.round((await boxOf(r, "행")).height), "행 높이").toBe(ROW_NODE.height);
    expect(await css(t, "border-top-left-radius"), "표 radius").toBe(`${TABLE_NODE.cornerRadius}px`);
    expect(await css(t, "border-top-color"), "표 테두리 색 = 시안").toBe(rgb(TABLE_NODE.strokes![0]));
  });

  test(`[K1][S2] 정렬 머리: aria-sort(ascending/descending) 1개 · 정렬 가능한 열은 버튼 · 다른 열을 누르면 그 열로 옮겨 간다`, async ({ page }) => {
    await open(page, GALLERY_DESK);
    const t = section(page, "table").locator(sel(TABLE));
    const sorted = t.locator('th[aria-sort="ascending"], th[aria-sort="descending"]');
    await expect(sorted, "정렬 중인 열 1").toHaveCount(1);
    await expect(sorted).toContainText("시약명");
    const sortable = t.locator("thead th button");
    const labels = (await sortable.allInnerTexts()).map((s) => s.trim());
    // 시안: sort-arrow 가 있는 머리 칸 = 정렬 가능
    const ns = nodesOf(F2);
    const frameSortable: string[] = [];
    ns.forEach((n, i) => {
      if (n.name !== "head-cell") return;
      const end = ns.slice(i + 1).findIndex((k) => k.path.length <= n.path.length);
      const sub = end < 0 ? ns.slice(i + 1) : ns.slice(i + 1, i + 1 + end);
      if (sub.some((k) => k.name === "sort-arrow")) frameSortable.push(sub.find((k) => k.name === "label")?.text?.characters ?? "");
    });
    expect(frameSortable.length, "시안 정렬 열").toBeGreaterThan(0);
    expect(labels, "정렬 버튼 = 시안 sort-arrow 열").toEqual(frameSortable);
    await sortable.filter({ hasText: "재고" }).click();
    await expect(t.locator('th[aria-sort="ascending"], th[aria-sort="descending"]'), "정렬 열 1 (재고)").toHaveText(/재고/);
  });

  test(`[K1][S3] 선택 행: data-selected 1 · 바탕 = 시안 3-desktop 선택 행 ${SELECTED_ROW.fills![0]} · 다른 행을 누르면 선택이 옮겨 간다 (aria-current)`, async ({ page }) => {
    await open(page, GALLERY_DESK);
    const t = section(page, "table").locator(sel(TABLE));
    const sel1 = t.locator(`${sel(ROW)}[data-selected="true"]`);
    await expect(sel1, "선택 행 1").toHaveCount(1);
    expect(await css(sel1, "background-color"), "선택 행 바탕").toBe(rgb(SELECTED_ROW.fills![0]));
    const other = t.locator(`${sel(ROW)}:not([data-selected])`).first();
    expect(await css(other, "background-color"), "다른 행은 선택 바탕 아님").not.toBe(rgb(SELECTED_ROW.fills![0]));
    const name = (await other.locator("td").first().innerText()).trim();
    await other.locator("[data-row-link]").click();
    await expect(t.locator(`${sel(ROW)}[data-selected="true"]`), "누른 행이 선택").toContainText(name);
    await expect(t.locator(`${sel(ROW)}[data-selected="true"]`)).toHaveCount(1);
  });

  test(`[K1][S10] 묶음 머리 행(시안 10-desktop date-group-row): 막대 ${GROUP_BAR.width}×${GROUP_BAR.height} ${GROUP_BAR.fills![0]} · 글자 ${GROUP_CAPTION.fills![0]} · 행 아래 캡션 "N월 N일에 기록"`, async ({ page }) => {
    await open(page, GALLERY_DESK);
    const t = section(page, "group").locator(sel(TABLE)).first();
    const group = t.locator('[data-name="date-group-row"]');
    expect(await group.count(), "묶음 머리 ≥ 1").toBeGreaterThanOrEqual(1);
    await expect(group.first()).toHaveText(GROUP_CAPTION.text!.characters);
    expect(await css(group.first().locator("th").first(), "color"), "묶음 글자 색").toBe(rgb(GROUP_CAPTION.fills![0]));
    const bar = await group.first().locator("th").first().evaluate((th) => {
      const el = [...th.querySelectorAll("*")].find((e) => getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, bg: getComputedStyle(el).backgroundColor };
    });
    expect(bar, "막대").not.toBeNull();
    expect([Math.round(bar!.w), Math.round(bar!.h)], "막대 크기").toEqual([GROUP_BAR.width, GROUP_BAR.height]);
    expect(bar!.bg, "막대 색").toBe(rgb(GROUP_BAR.fills![0]));
    await expect(t.locator(sel(ROW)).filter({ hasText: /\d{1,2}월 \d{1,2}일에 기록/ }), "캡션 행").toHaveCount(1);
    expect(Math.round((await boxOf(group.first(), "묶음 머리")).height), "묶음 머리 높이").toBe(GROUP_ROW.height);
  });

  test(`[K1][S9] 행 끝 더보기(시안 9-desktop more-menu): 버튼 aria-haspopup=menu · 누르면 menuitem "수정"·"삭제" · Esc 로 닫히고 포커스는 버튼`, async ({ page }) => {
    await open(page, GALLERY_DESK);
    const more = section(page, "group").getByRole("button", { name: /더보기/ });
    await expect(more, "더보기 1").toHaveCount(1);
    await expect(more).toHaveAttribute("aria-haspopup", "menu");
    // data-table 은 데스크톱 전용 (rules desktop_required · d7 §23 — 390 에는 없다): 메뉴 동작은 1440 에서 본다
    if (!desktopProject(page)) return;
    await more.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText(["수정", "삭제"]);
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  test(`[K1][S2] 빈 상태(시안 2-filter-empty): 머리행 아래 ex-empty-state-card 1 · 행 0`, async ({ page }) => {
    await open(page, GALLERY_DESK);
    const t = section(page, "empty").locator(sel(TABLE));
    await expect(t.locator(sel(ROW)), "행 0").toHaveCount(0);
    await expect(t.locator(sel("ex-empty-state-card")), "빈 상태 카드 1").toHaveCount(1);
    const want = first("2-filter-empty-desktop", (n) => n.name === "empty-title" || (n.name === "title" && n.path.includes("ex-empty-state-card")), "빈 상태 제목").text!.characters;
    await expect(t.locator(sel("ex-empty-state-card"))).toContainText(want);
    const head = await boxOf(t.locator('[data-name="table-head"]'), "머리행");
    const card = await boxOf(t.locator(sel("ex-empty-state-card")), "빈 카드");
    expect(card.y, "카드는 머리행 아래").toBeGreaterThanOrEqual(head.y + head.height - 0.5);
  });

  test(`[K1][S2] 쪽 번호(시안 pagination): 현재 쪽 aria-current=true 1 · 바탕 ${PAGE_CURRENT.fills![0]} · ${PAGE_CURRENT.width}×${PAGE_CURRENT.height} 원 · 누르면 현재 쪽이 옮겨 간다`, async ({ page }) => {
    await open(page, GALLERY_DESK);
    const nav = section(page, "table").locator('nav[data-name="pagination"]');
    await expect(nav).toHaveCount(1);
    const cur = nav.locator('[aria-current="true"]');
    await expect(cur, "현재 쪽 1").toHaveCount(1);
    await expect(cur).toHaveText("1");
    expect(await css(cur, "background-color"), "현재 쪽 바탕").toBe(rgb(PAGE_CURRENT.fills![0]));
    if (desktopProject(page)) {
      const b = await boxOf(cur, "현재 쪽");
      expect([Math.round(b.width), Math.round(b.height)], "쪽 번호 크기").toEqual([PAGE_CURRENT.width, PAGE_CURRENT.height]);
      expect(parseFloat(await css(cur, "border-top-left-radius")), "원").toBeGreaterThanOrEqual(PAGE_CURRENT.width! / 2);
    }
    await nav.getByRole("button", { name: "2", exact: true }).click();
    await expect(nav.locator('[aria-current="true"]'), "2쪽이 현재").toHaveText("2");
    await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
  });
});

// ---------- detail-drawer ----------
test.describe("detail-drawer (/gallery/desk)", () => {
  test(`[K1][S3] 드로어(시안 3-desktop): role=dialog · aria-modal=false · 이름 = 제목 · × "닫기" ${DRAWER_CLOSE.width}×${DRAWER_CLOSE.height} · 안쪽 ${DRAWER_BODY.padding?.[0]} · 아래 drawer-actions(안쪽 ${DRAWER_ACTIONS.padding?.join("·")}) · 정보 줄 라벨 ${ROW_LABEL.fills![0]}`, async ({ page }) => {
    await open(page, GALLERY_DESK);
    const d = section(page, "drawer").locator(sel(DRAWER));
    await expect(d).toHaveCount(1);
    await expect(d).toHaveAttribute("role", "dialog");
    await expect(d).toHaveAttribute("aria-modal", "false");
    await expect(page.getByRole("dialog", { name: "과산화수소" }), "접근 이름 = 제목").toHaveCount(1);
    await expect(d.getByRole("heading", { name: "과산화수소" })).toBeVisible();
    const close = d.getByRole("link", { name: "닫기", exact: true }).or(d.getByRole("button", { name: "닫기", exact: true }));
    await expect(close, "× 1").toHaveCount(1);
    const cb = await boxOf(close, "×");
    expect([Math.round(cb.width), Math.round(cb.height)], "× 누름 크기").toEqual([DRAWER_CLOSE.width, DRAWER_CLOSE.height]);
    expect(await css(d.locator('[data-name="drawer-body"]'), "padding-top"), "drawer-body 안쪽").toBe(`${DRAWER_BODY.padding![0]}px`);
    const act = d.locator('[data-name="drawer-actions"]');
    await expect(act).toHaveCount(1);
    expect(await act.evaluate((el) => { const s = getComputedStyle(el); return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((v) => parseFloat(v)); }), "drawer-actions 안쪽").toEqual(DRAWER_ACTIONS.padding);
    const label = d.locator('[data-name="info-row"]').first().locator("span").first();
    expect(await css(label, "color"), "정보 줄 라벨 색").toBe(rgb(ROW_LABEL.fills![0]));
    // 버튼 줄: 사용 기록(주) + 입고
    await expect(act.locator(sel("button-primary"))).toHaveCount(1);
    await expect(act.locator(sel("button-outline"))).toHaveCount(1);
  });

  test(`[K1][S4] 입력 드로어(시안 4-desktop): drawer-nav "${BACK_TEXT}" 링크 + × → drawer-title(제목 + 캡션) → form-row(라벨 칸 + 입력, 라벨 클릭 = 입력 포커스) · "필수" 표시`, async ({ page }) => {
    await open(page, GALLERY_DESK);
    const d = section(page, "drawer-form").locator(sel(DRAWER));
    const nav = d.locator('[data-name="drawer-nav"]');
    await expect(nav.getByRole("link", { name: BACK_TEXT, exact: true }), `뒤로 "${BACK_TEXT}"`).toHaveCount(1);
    await expect(nav.getByRole("link", { name: "닫기", exact: true }), "×").toHaveCount(1);
    const tb = d.locator('[data-name="drawer-title"]');
    await expect(tb.getByRole("heading", { name: "사용 기록" })).toBeVisible();
    await expect(tb).toContainText("에탄올 · 현재 1,200 mL");
    const nb = await boxOf(nav, "drawer-nav");
    const tbb = await boxOf(tb, "drawer-title");
    expect(nb.y + nb.height, "뒤로 줄 아래에 제목").toBeLessThanOrEqual(tbb.y + 0.5);
    await expect(d.locator('[data-name="form-row"]').first()).toContainText("필수");
    await d.locator("label", { hasText: "사용량" }).click();
    await expect(d.getByLabel("사용량", { exact: true }), "라벨 → 입력 포커스").toBeFocused();
  });

  test(`[K1][S3] /gallery 드로어 예시: 폭 = rules drawer_width ${DRAWER_W} (1440) · 표 예시 ${TABLE} 1 + 선택 행 1`, async ({ page }) => {
    await open(page, GALLERY);
    const d = page.locator(sel(DRAWER));
    expect(await d.count(), "/gallery detail-drawer ≥ 1").toBeGreaterThanOrEqual(1);
    const t = page.locator(sel(TABLE));
    expect(await t.count(), "/gallery data-table ≥ 1").toBeGreaterThanOrEqual(1);
    await expect(t.first().locator(`${sel(ROW)}[data-selected="true"]`)).toHaveCount(1);
    if (desktopProject(page)) expect(Math.round((await boxOf(d.first(), "드로어")).width), "드로어 폭").toBe(DRAWER_W);
  });
});
