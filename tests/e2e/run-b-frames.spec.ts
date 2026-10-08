// 데스크톱 재구성 run b — 화면 2·3·4·8·9·10·16 을 새 프레임(design/frames, dev-rules 1.12 desktop_migrated_screens)과 대조 (C1).
// 기준: harness/d7-data.md §23 "2026-10-09 run b 세부", 새 프레임 {N}-desktop · {N}-mobile 과 상태 프레임 2-filter-empty · 4-past-date · 16-*.
// - 1440: 본문 제목·건수 줄 · data-table 머리행 열 이름 · 툴바 문구 · 드로어(제목 · 뒤로 · 정보/입력 줄 라벨 순서 · 아래 버튼 글자)
// - 390: 새 모바일 프레임의 화면 고유 문구 (모바일은 변경 없음 — 구조 검사는 각 화면 spec)
// - 문구·라벨은 새 프레임 글자에서 읽는다 (구현에서 읽지 않는다). 프레임의 예시 데이터(시약명·숫자)는 틀(정규식)로만 본다.
// - d7 이 프레임과 다르게 정한 것은 d7 을 따른다: 화면 8 멤버 표의 이메일 열 없음(d7 §8 "멤버의 이메일은 보여 주지 않는다").
// 계정: 공용 학교 A 학생·교사·admin (보기만 — 저장하지 않는다).
import { test, expect, type Locator, type Page } from "@playwright/test";
import { openAs } from "./auth-state";
import { DRAWER, TABLE, drawer, drawerTitle, newFrame, waitDrawer } from "./desk-helpers";
import { browserClient, routeOf, sel, type ViewportName } from "./screen-helpers";
import { dbHistory } from "./screen-10-helpers";

type FNode = ReturnType<typeof newFrame>[number];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** 프레임 글자 (조건) */
const txt = (f: string, pred: (n: FNode) => boolean): string[] => newFrame(f).filter((n) => n.text && pred(n)).map((n) => n.text!.characters);
const one = (f: string, pred: (n: FNode) => boolean, what: string): string => {
  const t = txt(f, pred);
  if (t.length === 0) throw new Error(`새 프레임 ${f} 에 ${what} 없음`);
  return t[0];
};
/** 프레임 i 번째 data-table 의 머리행 열 이름 */
function frameHeads(f: string, tableIndex = 0): string[] {
  const out: string[][] = [];
  for (const n of newFrame(f)) {
    if (n.name === TABLE) out.push([]);
    else if (n.text && n.name === "label" && n.path.includes("head-cell") && out.length) out[out.length - 1].push(n.text.characters);
  }
  return out[tableIndex] ?? [];
}
/** 프레임 드로어의 정보·입력 줄 라벨 (순서대로) */
const drawerLabels = (f: string) => txt(f, (n) => n.path.includes(DRAWER) && ((n.name === "row-label" && n.type === "TEXT") || (n.name === "label" && n.path.includes("row-label"))));
/** 프레임 drawer-actions 버튼 글자 */
const actionLabels = (f: string) => txt(f, (n) => n.path.includes("drawer-actions") && n.name === "label");
/** 프레임 숫자 예시를 틀로: "42종" → /^\d+종$/ */
const pattern = (example: string) => new RegExp(`^${esc(example).replace(/\d[\d,]*/g, "[\\d,]+")}$`);

/** 화면 표의 머리행 열 이름 (동작 열 제외) */
async function heads(table: Locator): Promise<string[]> {
  return table.locator("thead th").evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter((t) => t !== "" && t !== "동작"),
  );
}
/** 드로어의 정보·입력 줄 라벨 (info-row · form-row 첫 칸) */
async function shownDrawerLabels(page: Page): Promise<string[]> {
  return drawer(page)
    .locator('[data-name="info-row"], [data-name="form-row"], [data-component="reagent-location"], [data-component="reorder-threshold"]')
    .evaluateAll((els) =>
      els
        .filter((e) => !e.parentElement?.closest('[data-name="info-row"], [data-name="form-row"]'))
        .map((e) => {
          const first = e.querySelector("label, span");
          return (first?.textContent ?? "").replace(/\s+/g, " ").replace(/필수$/, "").trim();
        }),
    );
}
/** 드로어 아래 버튼 글자 */
async function shownActions(page: Page): Promise<string[]> {
  return drawer(page)
    .locator('[data-name="drawer-actions"]')
    .locator("a, button")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
}

async function ownReagent(page: Page, withMsds = false): Promise<{ id: string; name: string }> {
  const { client } = await browserClient(page);
  const r = await client.from("reagents").select("id, name, msds_url, slot_id").order("id").limit(50);
  expect(r.error, "자기 학교 시약 (RLS)").toBeNull();
  const row = (r.data ?? []).find((x) => (withMsds ? String(x.msds_url ?? "").trim() !== "" : x.slot_id !== null)) ?? (r.data ?? [])[0];
  expect(row, "학교 A 시약").toBeTruthy();
  return { id: row!.id as string, name: row!.name as string };
}

async function settle(page: Page, viewport: ViewportName): Promise<void> {
  await page.waitForLoadState("load");
  // 하이드레이션 뒤 (폭 전용 사본이 빠진 뒤)
  if (viewport === "desktop") await expect(page.locator(sel("nav-pill"))).toHaveCount(0, { timeout: 45_000 });
  else await expect(page.locator(sel(DESKTOP_SIDEBAR))).toHaveCount(0, { timeout: 45_000 });
}
const DESKTOP_SIDEBAR = "app-sidebar";

// =====================================================================
// 화면 2
// =====================================================================

test(`[C1][S2] 학교A 교사 /reagents 새 프레임 대조: 1440 = 2-desktop page-head(제목 "${one("2-desktop", (n) => n.name === "title" && n.path.includes("page-title"), "제목")}" + "N종" · "재고 부족 n · MSDS 없음 n") · 검색 "${one("2-desktop", (n) => n.name === "placeholder", "검색")}" · 필터 · 전체/재고 부족 · 표 머리 ${frameHeads("2-desktop").join("·")} / 390 = 2-mobile 문구`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 2);
  try {
    await settle(page, viewport);
    const f = `2-${viewport}`;
    const segLabels = txt(f, (n) => n.name === "label" && (n.path.includes("segmented-control-active") || n.path.includes("segmented-control-option")) && !n.path.includes("list-filter-sheet"));
    const seg = page.locator(`main ${sel("segmented-control")}`).first();
    await expect(seg).toBeVisible({ timeout: 45_000 });
    expect((await seg.locator('[role="tab"]').allInnerTexts()).map(squash), `${f} 범위 탭`).toEqual(segLabels);
    const filterLabel = one(f, (n) => n.name === "label" && n.path.includes("list-filter-button"), "필터");
    await expect(page.locator(`main ${sel("list-filter-button")}`), `필터 "${filterLabel}"`).toContainText(filterLabel);
    if (viewport === "mobile") {
      const ph = one(f, (n) => n.name === "value" && n.path.includes("text-input"), "검색");
      await expect(page.locator("main").getByPlaceholder(ph), `검색 "${ph}"`).toHaveCount(1);
      return;
    }
    const head = page.locator('main [data-name="page-head"]').first();
    const title = one(f, (n) => n.name === "title" && n.path.includes("page-title"), "제목");
    await expect(head.getByRole("heading", { level: 1, name: title, exact: true }), `제목 "${title}"`).toBeVisible();
    await expect(head.getByText(pattern(one(f, (n) => n.name === "count", "건수")))).toHaveCount(1);
    await expect(head.getByText(pattern(one(f, (n) => n.name === "summary", "요약")))).toHaveCount(1);
    await expect(head.getByPlaceholder(one(f, (n) => n.name === "placeholder", "검색"))).toHaveCount(1);
    expect(await heads(page.locator(`main ${sel(TABLE)}`).first()), "표 머리 = 시안 2-desktop").toEqual(frameHeads(f));
  } finally {
    await context.close();
  }
});

test(`[C1][S2] 학교A 교사 /reagents 필터 결과 0 = 새 프레임 2-filter-empty: 표 안 빈 상태 "${one("2-filter-empty-desktop", (n) => n.name === "empty-title", "빈 제목")}" · "${one("2-filter-empty-desktop", (n) => n.name === "empty-body", "빈 본문")}" · "${one("2-filter-empty-desktop", (n) => n.name === "label" && n.path.includes("ex-empty-state-card"), "빈 버튼")}" · 머리행 유지 (390 = 2-filter-empty-mobile 같은 문구)`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 2, `${routeOf(2)}?sort=stock&q=${encodeURIComponent("없는시약zzq")}`);
  try {
    await settle(page, viewport);
    const f = `2-filter-empty-${viewport}`;
    const card = page.locator(`main ${sel("ex-empty-state-card")}`);
    await expect(card, "빈 상태 카드 1").toHaveCount(1, { timeout: 45_000 });
    await expect(card).toContainText(one(f, (n) => n.name === "empty-title", "빈 제목"));
    await expect(card).toContainText(one(f, (n) => n.name === "empty-body", "빈 본문"));
    await expect(card.getByRole("button", { name: one(f, (n) => n.name === "label" && n.path.includes("ex-empty-state-card"), "빈 버튼") })).toHaveCount(1);
    if (viewport === "desktop") {
      const t = page.locator(`main ${sel(TABLE)}`).first();
      await expect(t.locator(sel("ex-empty-state-card")), "빈 상태는 표 안 (시안 2-filter-empty-desktop)").toHaveCount(1);
      expect(await heads(t), "머리행 유지").toEqual(frameHeads(f));
      await expect(t.locator(sel("ex-data-table-cell")), "행 0").toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 3 · 4 · 16 (시약 목록 옆 드로어)
// =====================================================================

test(`[C1][S3] 학교A 교사 시약 상세 새 프레임 대조: 1440 = 3-desktop 드로어(제목 = 시약명 · 탭 ${txt("3-desktop", (n) => n.path.includes(DRAWER) && n.name === "label" && n.path.includes("segmented-control")).join("/")} · 정보 줄 ${drawerLabels("3-desktop").slice(0, 4).join("→")} · MSDS 줄 · 아래 ${actionLabels("3-desktop").join("·")}) / 390 = 3-mobile(탭 · "MSDS 보기" · 아래 버튼)`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", 13);
  try {
    const r = await ownReagent(page);
    await page.goto(routeOf(3).replace(/\[[^\]]+\]/, r.id));
    await settle(page, viewport);
    const f = `3-${viewport}`;
    if (viewport === "mobile") {
      await expect(page.locator(sel("reagent-detail-card")).first()).toContainText(r.name, { timeout: 45_000 });
      const tabs = txt(f, (n) => n.name === "label" && n.path.includes("segmented-control"));
      expect((await page.locator(`main ${sel("segmented-control")} [role="tab"]`).allInnerTexts()).map(squash), "탭 = 시안 3-mobile").toEqual(tabs);
      return;
    }
    await waitDrawer(page);
    await expect(drawerTitle(page), "드로어 제목 = 시약명").toHaveText(r.name);
    const tabs = txt(f, (n) => n.path.includes(DRAWER) && n.name === "label" && n.path.includes("segmented-control"));
    expect((await drawer(page).locator(`${sel("segmented-control")} [role="tab"]`).allInnerTexts()).map(squash), "드로어 탭 = 시안 3-desktop").toEqual(tabs);
    // 정보 줄: 시안의 앞 네 줄(현재 재고 · 입고일 · 보관 위치 · 재주문 기준)이 이 순서로 (농도·용량 등 시안 예시 줄은 시약 데이터에 따라)
    const want = drawerLabels(f).slice(0, 4);
    const shown = await shownDrawerLabels(page);
    expect(shown.slice(0, 4), `정보 줄 앞 네 줄 = 시안 (${shown.join(" · ")})`).toEqual(want);
    await expect(drawer(page).locator(sel("msds-entry")), "드로어 안 msds-entry 1").toHaveCount(1);
    expect(await shownActions(page), "drawer-actions = 시안 (교사: 사용 기록 · 입고)").toEqual(actionLabels(f));
  } finally {
    await context.close();
  }
});

test(`[C1][S4] 학교A 학생 사용 기록 입력 새 프레임 대조: 1440 = 4-desktop 드로어(뒤로 "${one("4-desktop", (n) => n.name === "label" && n.path.includes("back-link"), "뒤로")}" · 제목 "${one("4-desktop", (n) => n.name === "title" && n.path.includes("drawer-title"), "제목")}" · 캡션 "{시약명} · 현재 {재고}" · 입력 줄 ${drawerLabels("4-desktop").join("→")} · "필수" 3 · 메모 안내 · 아래 "${actionLabels("4-desktop").join("")}") · 지난 날짜 = 4-past-date(past-date-note 가 저장 버튼 위) / 390 = 4-mobile 라벨`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "student", 13);
  try {
    const r = await ownReagent(page);
    await page.goto(`${routeOf(4)}?reagent=${r.id}`);
    await settle(page, viewport);
    const f = `4-${viewport}`;
    if (viewport === "mobile") {
      const labels = txt(f, (n) => n.name === "field-label" && !n.path.includes("reagent-detail-card"));
      for (const l of labels) await expect(page.locator("main").getByText(l, { exact: true }).first(), `390 라벨 "${l}"`).toBeVisible({ timeout: 45_000 });
      await expect(page.locator("main").getByRole("button", { name: one(f, (n) => n.name === "label" && n.path.includes("button-primary"), "저장") })).toHaveCount(1);
      return;
    }
    await waitDrawer(page);
    const back = drawer(page).locator('[data-name="back-link"]');
    await expect(back, "뒤로 글자 = 시안").toHaveText(one(f, (n) => n.name === "label" && n.path.includes("back-link"), "뒤로"));
    await expect(drawerTitle(page)).toHaveText(one(f, (n) => n.name === "title" && n.path.includes("drawer-title"), "제목"));
    const cap = one(f, (n) => n.name === "caption" && n.path.includes("drawer-title"), "캡션");
    expect(cap, "시안 캡션 틀").toMatch(/^.+ · 현재 [\d,]+ \S+$/);
    await expect(drawer(page).locator('[data-name="drawer-title"]')).toContainText(new RegExp(`${esc(r.name)} · 현재 [\\d.,]+ ?\\S+`));
    expect(await shownDrawerLabels(page), "입력 줄 라벨 순서 = 시안 4-desktop").toEqual(drawerLabels(f));
    const required = newFrame(f).filter((n) => n.name === "required").length;
    await expect(drawer(page).locator('[data-name="form-row"]').getByText("필수", { exact: true }), `"필수" = 시안 ${required}`).toHaveCount(required);
    const memoPh = one(f, (n) => n.name === "placeholder" && n.path.includes("form-row"), "메모 안내");
    await expect(drawer(page).getByPlaceholder(memoPh), `메모 안내 "${memoPh}"`).toHaveCount(1);
    expect(await shownActions(page), "drawer-actions = 시안").toEqual(actionLabels(f));
    // 4-past-date: 지난 날짜 → past-date-note 가 drawer-actions 안 저장 버튼 위 (시안 4-past-date-desktop)
    const pd = newFrame("4-past-date-desktop");
    expect(pd.some((n) => n.name === "past-date-note" && n.path.includes("drawer-actions")), "시안: past-date-note 는 drawer-actions 안").toBe(true);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - 3 * 86_400_000));
    await drawer(page).locator(`${sel("usage-date")} input`).fill(day);
    const note = drawer(page).locator(`[data-name="drawer-actions"] ${sel("past-date-note")}`);
    await expect(note, "past-date-note (drawer-actions 안)").toHaveCount(1);
    const nb = (await note.boundingBox())!;
    const sb = (await drawer(page).locator(`[data-name="drawer-actions"] ${sel("button-primary")}`).boundingBox())!;
    expect(nb.y + nb.height, "past-date-note 는 저장 버튼 위").toBeLessThanOrEqual(sb.y + 1);
  } finally {
    await context.close();
  }
});

test(`[C1][S16] 학교A 학생 MSDS 요약 새 프레임 대조: 1440 = 16-desktop 드로어(뒤로 "${one("16-desktop", (n) => n.name === "label" && n.path.includes("back-link"), "뒤로")}" · 제목 "MSDS · {시약명}" · 원문 "${one("16-desktop", (n) => n.name === "label" && n.path.includes("msds-original-link"), "원문")}") — 16-fail 이면 출처 줄 + "${one("16-fail-desktop", (n) => n.name === "empty-title", "실패 제목")}" + 원문은 drawer-actions, 16-no-summary 면 원문은 본문 / 390 = 16-mobile 제목·원문`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "student", 13);
  try {
    const r = await ownReagent(page, true);
    await page.goto(routeOf(16).replace(/\[[^\]]+\]/, r.id));
    await settle(page, viewport);
    const titlePrefix = one("16-desktop", (n) => n.name === "title" && n.path.includes("drawer-title"), "제목").split(" · ")[0];
    const original = one(`16-${viewport}`, (n) => n.name === "label" && n.path.includes("msds-original-link"), "원문");
    await expect(page.locator(`${sel("msds-original-link")}`).first(), `원문 "${original}"`).toContainText(original, { timeout: 45_000 });
    await expect(page.locator(sel("msds-skeleton")), "불러오는 중 끝").toHaveCount(0, { timeout: 45_000 });
    if (viewport === "mobile") {
      await expect(page.getByText(`${titlePrefix} · ${r.name}`, { exact: true }).filter({ visible: true }), "390 제목").toHaveCount(1);
      return;
    }
    await waitDrawer(page);
    await expect(drawerTitle(page)).toHaveText(`${titlePrefix} · ${r.name}`);
    await expect(drawer(page).locator('[data-name="back-link"]')).toHaveText(one("16-desktop", (n) => n.name === "label" && n.path.includes("back-link"), "뒤로"));
    const failed = (await drawer(page).locator(sel("ex-empty-state-card")).count()) > 0;
    const summary = (await drawer(page).locator(sel("msds-summary")).count()) > 0;
    if (failed) {
      // 16-fail-desktop: 출처 줄 · 실패 카드(제목 · 본문) · 원문 = drawer-actions
      await expect(drawer(page).locator('[data-name="drawer-title"]')).toContainText(one("16-fail-desktop", (n) => n.name === "source-line", "출처"));
      await expect(drawer(page).locator(sel("ex-empty-state-card"))).toContainText(one("16-fail-desktop", (n) => n.name === "empty-title", "실패 제목"));
      await expect(drawer(page).locator(sel("ex-empty-state-card"))).toContainText(one("16-fail-desktop", (n) => n.name === "empty-body", "실패 본문"));
      await expect(drawer(page).locator(`[data-name="drawer-actions"] ${sel("msds-original-link")}`), "16-fail: 원문 = drawer-actions").toHaveCount(1);
    } else if (!summary) {
      // 16-no-summary-desktop: 출처 줄 없음 · 원문 = 본문 (drawer-actions 없음)
      expect(newFrame("16-no-summary-desktop").some((n) => n.name === "drawer-actions"), "시안 16-no-summary: drawer-actions 없음").toBe(false);
      await expect(drawer(page).locator('[data-name="drawer-actions"]'), "16-no-summary: 아래 버튼 줄 없음").toHaveCount(0);
      await expect(drawer(page).locator(`[data-name="drawer-body"] ${sel("msds-original-link")}`), "16-no-summary: 원문 = 본문").toHaveCount(1);
    } else {
      await expect(drawer(page).locator(`[data-name="drawer-actions"] ${sel("msds-original-link")}`), "16: 원문 = drawer-actions").toHaveCount(1);
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 8 · 9 · 10 (목록 표)
// =====================================================================

test(`[C1][S8] 학교A admin /users 새 프레임 대조: 1440 = 8-desktop(제목 "${one("8-desktop", (n) => n.name === "title" && n.path.includes("page-title"), "제목")}" + "N명" · 역할별 인원 줄 · 초대 줄 · 이름 검색 · "${one("8-desktop", (n) => n.name === "section-title", "멤버")}" 표 머리 ${frameHeads("8-desktop", 0).filter((h) => h !== "이메일").join("·")}(이메일 열 없음 — d7 §8) · 초대 대기 표 머리 ${frameHeads("8-desktop", 1).join("·")} · 유의사항) / 390 = 8-mobile 문구`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "admin", 8);
  try {
    await settle(page, viewport);
    const f = `8-${viewport}`;
    const manage = page.locator(`main ${sel("user-manage")}`);
    await expect(manage).toBeVisible({ timeout: 45_000 });
    const countLine = one(f, (n) => n.name === "user-count-line", "역할별 인원");
    await expect(page.locator("main").getByText(pattern(countLine)), `역할별 인원 줄 틀 "${countLine}"`).toHaveCount(1);
    const ph = one(f, (n) => n.name === "placeholder" && n.path.includes("user-manage"), "이름 검색");
    await expect(manage.getByPlaceholder(ph), `검색 "${ph}"`).toHaveCount(1);
    // 유의사항 틀: 시안 "같은 학교(샘플고등학교) 계정만 …" 의 괄호 안(학교명)만 자기 학교로
    const note = one(f, (n) => n.name === "notice", "유의사항");
    const [pre, post] = [note.slice(0, note.indexOf("(") + 1), note.slice(note.indexOf(")"))];
    await expect(manage.getByText(new RegExp(`^${esc(pre)}.+${esc(post)}$`)), "유의사항 틀").toHaveCount(1);
    if (viewport === "mobile") {
      await expect(page.locator(sel("nav-pill")).getByText(one(f, (n) => n.name === "nav-title", "제목"), { exact: true }).filter({ visible: true })).toHaveCount(1);
      return;
    }
    const head = page.locator('main [data-name="page-head"]');
    await expect(head.getByRole("heading", { level: 1, name: one(f, (n) => n.name === "title" && n.path.includes("page-title"), "제목"), exact: true })).toBeVisible();
    await expect(head.getByText(pattern(one(f, (n) => n.name === "count", "N명")))).toHaveCount(1);
    await expect(head.getByPlaceholder(one(f, (n) => n.name === "placeholder" && n.path.includes("page-actions"), "초대 이메일"))).toHaveCount(1);
    for (const l of txt(f, (n) => n.path.includes("page-actions") && n.name === "label")) await expect(head.getByText(l, { exact: true }).first(), `초대 줄 "${l}"`).toBeVisible();
    const tables = manage.locator(sel(TABLE));
    expect(await heads(tables.first()), "멤버 표 머리 = 시안 8-desktop (이메일 열 제외 — d7 §8)").toEqual(frameHeads(f, 0).filter((h) => h !== "이메일"));
    if ((await tables.count()) > 1) expect(await heads(tables.nth(1)), "초대 대기 표 머리 = 시안").toEqual(frameHeads(f, 1));
  } finally {
    await context.close();
  }
});

test(`[C1][S9] 학교A admin /vendors 새 프레임 대조: 1440 = 9-desktop(제목 "${one("9-desktop", (n) => n.name === "title" && n.path.includes("page-title"), "제목")}" + "N곳" · "판매처 등록" · 탭 · 검색 · 표 머리 ${frameHeads("9-desktop").join("·")}) · 등록 드로어(제목 · 안내 · 입력 줄 ${drawerLabels("9-desktop").join("→")} · 안내 글자 · 아래 ${actionLabels("9-desktop").join("·")}) — 저장하지 않음 / 390 = 9-mobile 문구`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "admin", 9);
  try {
    await settle(page, viewport);
    const f = `9-${viewport}`;
    const tabs = txt(f, (n) => n.name === "label" && (n.path.includes("segmented-control-active") || n.path.includes("segment") || n.path.includes("segmented-control-option")) && !n.path.includes("ex-modal-card"));
    const seg = page.locator(`main ${sel("segmented-control")}`).first();
    await expect(seg).toBeVisible({ timeout: 45_000 });
    expect((await seg.locator('[role="tab"]').allInnerTexts()).map(squash), "탭 = 시안").toEqual(tabs);
    if (viewport === "mobile") {
      await expect(page.locator(sel("nav-pill")).getByText(one(f, (n) => n.name === "nav-title", "제목"), { exact: true }).filter({ visible: true })).toHaveCount(1);
      return;
    }
    const head = page.locator('main [data-name="page-head"]');
    await expect(head.getByRole("heading", { level: 1, name: one(f, (n) => n.name === "title" && n.path.includes("page-title"), "제목"), exact: true })).toBeVisible();
    await expect(head.getByText(pattern(one(f, (n) => n.name === "count", "N곳")))).toHaveCount(1);
    expect(await heads(page.locator(`main ${sel(TABLE)}`).first()), "표 머리 = 시안 9-desktop").toEqual(frameHeads(f));
    await page.goto(`${routeOf(9)}?form=new`);
    await waitDrawer(page);
    await expect(drawerTitle(page)).toHaveText(one(f, (n) => n.name === "title" && n.path.includes("drawer-head"), "드로어 제목"));
    await expect(drawer(page).getByText(one(f, (n) => n.name === "helper", "안내"), { exact: true })).toBeVisible();
    expect(await shownDrawerLabels(page), "입력 줄 라벨 = 시안 9-desktop").toEqual(drawerLabels(f));
    for (const ph of txt(f, (n) => n.name === "placeholder" && n.path.includes("form-row"))) await expect(drawer(page).getByPlaceholder(ph), `안내 글자 "${ph}"`).toHaveCount(1);
    expect(await shownActions(page), "drawer-actions = 시안").toEqual(actionLabels(f));
  } finally {
    await context.close();
  }
});

test(`[C1][S10] 학교A 학생 /usage 새 프레임 대조: 1440 = 10-desktop(제목 "${one("10-desktop", (n) => n.name === "title" && n.path.includes("page-title"), "제목")}" + "N건" · 검색 · 전체/내 기록 · 기간 · 표 머리 ${frameHeads("10-desktop").join("·")} · 상세 드로어 정보 줄 ${drawerLabels("10-desktop").join("→")} · 아래 "${actionLabels("10-desktop").join("")}") / 390 = 10-mobile 문구`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page, viewport } = await openAs(browser, info, "student", 10);
  try {
    await settle(page, viewport);
    const f = `10-${viewport}`;
    const tabs = txt(f, (n) => n.name === "label" && (n.path.includes("segmented-control-active") || n.path.includes("segmented-control-option")));
    const seg = page.locator(`main ${sel("segmented-control")}`).first();
    await expect(seg).toBeVisible({ timeout: 45_000 });
    expect((await seg.locator('[role="tab"]').allInnerTexts()).map(squash), "범위 탭 = 시안").toEqual(tabs);
    if (viewport === "mobile") {
      await expect(page.locator(sel("nav-pill")).getByText(one(f, (n) => n.name === "nav-title", "제목"), { exact: true }).filter({ visible: true })).toHaveCount(1);
      return;
    }
    const head = page.locator('main [data-name="page-head"]');
    await expect(head.getByRole("heading", { level: 1, name: one(f, (n) => n.name === "title" && n.path.includes("page-title"), "제목"), exact: true })).toBeVisible();
    await expect(head.getByText(pattern(one(f, (n) => n.name === "count", "N건")))).toHaveCount(1);
    await expect(head.getByPlaceholder(one(f, (n) => n.name === "placeholder", "검색"))).toHaveCount(1);
    const period = one(f, (n) => n.name === "value" && n.path.includes("toolbar"), "기간");
    expect((await page.locator('main [data-name="toolbar"] select').evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? "")).trim(), `기간 기본 = "${period}"`).toBe(period);
    expect(await heads(page.locator(`main ${sel(TABLE)}`).first()), "표 머리 = 시안 10-desktop").toEqual(frameHeads(f));
    const rows = await dbHistory(page, {});
    expect(rows.length, "학교 A 최근 기록").toBeGreaterThan(0);
    await page.goto(`${routeOf(10)}?id=${rows[0].id}`);
    await waitDrawer(page);
    expect(await shownDrawerLabels(page), "드로어 정보 줄 = 시안 10-desktop").toEqual(drawerLabels(f));
    await expect(drawer(page).locator(sel("msds-entry")), "드로어 안 msds-entry").toHaveCount(1);
    expect(await shownActions(page), "drawer-actions = 시안").toEqual(actionLabels(f));
  } finally {
    await context.close();
  }
});
