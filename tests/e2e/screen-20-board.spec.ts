// 화면 20 게시판 UI — C1 · C2 · R-ui · N1-ui(게시판 예외) · V1
// 기대값: design/rules.json board · desktop_shell(board_link · drawer_width · form_width) · manage.back · roles R5·R8 · screens_required · variants 20,
//         design/frames/20-{,detail-,new-,empty-,student-}{mobile,desktop}.json, harness/d7-data.md §30, harness/dev-rules.json routes · route_auth.
// 글은 테스트 안에서 만들고 지운다 (screen-20-helpers — 제목 접두사 S20-db-, 글쓴이 세션으로 삭제). FAQ seed 는 읽기만.
// 운영자: 로컬 BOARD_OPERATOR_EMAIL 이 테스트 계정이 아니므로 운영자 화면은 "운영자가 아니면 0 · API 403" 진입점만 본다 (d7 §30 테스트,
//         운영자 확인 함수는 tests/unit/board-operator.test.ts).
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { roleChecks, routeOf, rules, devRules, sel } from "./screen-helpers";
import { signIn, ROLE_LABEL, type Role } from "./db-helpers";
import { anonContext, waitHydrated } from "./shell-helpers";
import {
  ANSWER_HEAD,
  AUTHOR_SUFFIX,
  BOARD,
  D7_LIST,
  D7_OPERATOR_UI,
  DS,
  EDIT_LOCKED,
  EMPTY_TITLE,
  EXPECTED_FAQ,
  FAQ_SEED_COUNT,
  LIST,
  MANAGE_BACK_RULE,
  NEW,
  OWN_DELETE,
  OWN_EDIT,
  PREFIX,
  PRIVACY_NOTE,
  SCREEN,
  STATUS_ANSWERED,
  STATUS_RECEIVED,
  SUBMIT_LABEL,
  TAB_KEYS,
  TAB_LABELS,
  TOAST_DELETED,
  TOAST_POSTED,
  WRITE_LABEL,
  authorLabel,
  box,
  cleanupPosts,
  css,
  detailPath,
  detailScope,
  fAll,
  fNode,
  fTexts,
  frameNodes,
  hexToRgb,
  idByTitle,
  isDesk,
  koDate,
  listPath,
  newPost,
  openBoard,
  prepAnswer,
  prepHidden,
  rowByTitle,
  schoolNameOf,
  settle,
  tabLabel,
  track,
} from "./screen-20-helpers";

test.afterAll(async () => {
  await cleanupPosts();
});

const S = `[S${SCREEN}]`;
const vpOf = (page: Page) => (isDesk(page) ? "desktop" : "mobile");
const F = (variant: string, page: Page) => `${SCREEN}${variant ? `-${variant}` : ""}-${vpOf(page)}`;
const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
const tag = (info: { project: { name: string } }) => `${info.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** rules board.entry "모바일 tab-bar 활성 = '관리'" */
const MOBILE_TAB = /모바일 tab-bar 활성 = '([^']+)'/.exec(BOARD.entry)![1];
/** 시안 20-mobile nav-pill 워드마크 */
const WORDMARK = fNode("20-mobile", "nav-left/wordmark").text!.characters;
const PAGE_TITLE = fNode("20-mobile", "page-head/page-title").text!.characters;

const tabs = (page: Page) => page.locator(`main ${sel("board-tabs")} [role="tab"]`);
const activeTab = (page: Page) => page.locator(`main ${sel("board-tabs")} ${sel("segmented-control-active")}`);
const faqItems = (page: Page) => page.locator(`main ${sel("faq-item")}`);
const rows = (page: Page) => page.locator(`main ${sel("board-post-row")}`);

/** 요소 안 글자 잎(자식 요소가 없는 요소의 글자) — 문서 순서 */
function leafTexts(l: Locator): Promise<string[]> {
  return l.evaluate((root) => {
    const out: string[] = [];
    const walk = (el: Element) => {
      const kids = [...el.children].filter((c) => !["svg", "SVG"].includes(c.tagName) && getComputedStyle(c).display !== "none");
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join("").replace(/\s+/g, " ").trim();
      if (own) out.push(own);
      for (const k of kids) walk(k);
    };
    walk(root);
    return out;
  });
}

async function tabTexts(page: Page): Promise<string[]> {
  return tabs(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.trim()));
}

/** 제목 글자 (board-post-row 안 두 번째 잎 = 제목) */
async function rowTitles(page: Page): Promise<string[]> {
  return rows(page).evaluateAll((els) =>
    els.map((e) => {
      const line = e.querySelector("span > span");
      return (line?.children[1]?.textContent ?? "").trim();
    }),
  );
}

async function openMenu(page: Page): Promise<Locator> {
  const menu = detailScope(page).locator(sel("board-post-menu"));
  await expect(menu, "board-post-menu 1").toHaveCount(1);
  const btn = menu.locator("button").first();
  await waitHydrated(btn);
  await btn.click();
  const items = menu.locator('[role="menuitem"]');
  await expect(items.first()).toBeVisible();
  return menu;
}

async function expectRoleChecks(page: Page, role: Role, where: string): Promise<void> {
  const name = { student: "학생", teacher: "교사", admin: "admin", schoolB: "교사" }[role];
  for (const c of roleChecks(SCREEN, name)) {
    const n = await page.locator(sel(c.component)).count();
    if (c.op === "max") expect(n, `${where}: [${c.rule}] ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
    else expect(n, `${where}: [${c.rule}] ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
  }
}

// =====================================================================
// 기대값 원본
// =====================================================================
test(`[C1]${S} 기대값 원본: rules board · frames 20-* · d7 §30 · dev-rules 가 서로 맞다`, () => {
  expect(devRules.routes[String(SCREEN)]).toBe(LIST);
  expect(devRules.routes[`${SCREEN}-new`]).toBe(NEW);
  expect(TAB_LABELS).toHaveLength(3);
  expect(TAB_KEYS).toEqual(["faq", "bug", "idea"]);
  // 탭 글자 = 시안 20-mobile segment-label 순서
  expect(fTexts("20-mobile", "board-tabs")).toEqual(TAB_LABELS);
  expect(fTexts("20-desktop", "board-tabs")).toEqual(TAB_LABELS);
  // FAQ seed 수 = 가이드 + 예시 2개
  expect(EXPECTED_FAQ).toHaveLength(FAQ_SEED_COUNT);
  // screens_required 20 · variants 20 은 해당 프레임에 있다
  const req = (rules.screens_required as Record<string, string[]>)[String(SCREEN)];
  for (const c of req) expect(frameNodes("20-mobile").some((n) => n.name === c), `20-mobile 에 ${c}`).toBe(true);
  const variants = (rules.variants as Record<string, Record<string, string[]>>)[String(SCREEN)];
  for (const [v, comps] of Object.entries(variants)) {
    for (const vp of ["mobile", "desktop"]) {
      for (const c of comps) expect(frameNodes(`20-${v}-${vp}`).some((n) => n.name === c), `20-${v}-${vp} 에 ${c}`).toBe(true);
    }
  }
  // 문구 = 시안
  expect(fNode("20-empty-mobile", "empty-text/title").text!.characters).toBe(EMPTY_TITLE);
  expect(fNode("20-new-mobile", "board-privacy-note/note-text").text!.characters).toBe(PRIVACY_NOTE);
  expect(fTexts("20-student-mobile", "board-status-badge")).toEqual(expect.arrayContaining([STATUS_RECEIVED, STATUS_ANSWERED]));
  expect(fNode("20-mobile", "board-write/label").text!.characters).toBe(WRITE_LABEL);
  expect(fNode("20-new-mobile", "button-primary/label").text!.characters).toBe(SUBMIT_LABEL);
  expect(fNode("20-detail-mobile", "board-answer/answer-head").text!.characters.startsWith(ANSWER_HEAD)).toBe(true);
  expect(fNode("20-detail-mobile", "post-menu-popover/menu-item/caption").text!.characters).toBe(EDIT_LOCKED);
  // manage.back: 화면 20 목록 = '‹ 관리', 글 보기·쓰기 = '‹ 게시판' · dev-rules components manage-back 에 20
  expect(MANAGE_BACK_RULE.back).toMatch(new RegExp(`화면 ${SCREEN} 게시판 목록도 '‹ 관리'`));
  expect(MANAGE_BACK_RULE.back).toMatch(new RegExp(`${SCREEN} 글 보기·글쓰기는 '‹ 게시판'`));
  expect(devRules.components["manage-back"]).toContain(SCREEN);
  // 시안 20-mobile: manage-back 은 nav-pill 이 아니라 본문 head-row 에 · nav-pill 은 워드마크
  expect(fAll("20-mobile", "manage-back")[0].path).toContain("head-row");
  expect(fAll("20-mobile", "manage-back")[0].path).not.toContain("nav-pill");
  expect(WORDMARK).toBe("Lab_Stock");
  expect(MOBILE_TAB).toBe("관리");
  // d7 §30 운영자 화면 요소 = 운영자가 아니면 0
  expect(D7_OPERATOR_UI).toMatch(/운영자가 아니면 이 요소 0/);
  expect(D7_LIST).toMatch(/학생 0/);
});

// =====================================================================
// 목록 구성 · 순서 · 문구
// =====================================================================
for (const role of ["teacher", "admin"] as Role[]) {
  test(`[C1]${S} ${ROLE_LABEL[role]} ${LIST} (FAQ 탭): screens_required · 구성 순서(‹ 관리 → '${PAGE_TITLE}' + '${WRITE_LABEL}' → board-tabs → FAQ) · 탭 ${TAB_LABELS.join("·")} · 활성 FAQ`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page } = await openBoard(browser, info, role, LIST);
    try {
      const where = `${ROLE_LABEL[role]} ${LIST} (${vpOf(page)})`;
      for (const c of (rules.screens_required as Record<string, string[]>)[String(SCREEN)]) {
        await expect(page.locator(`main ${sel(c)}`).first(), `${where}: screens_required ${c}`).toBeVisible();
      }
      await expect(page.locator(`main ${sel("board-write")}`), `${where}: board-write 1`).toHaveCount(1);
      await expect(page.locator(`main ${sel("board-write")}`)).toHaveText(exact(WRITE_LABEL));
      await expect(page.locator(`main ${sel("board-write")} a`), "board-write → /board/new?category=bug (FAQ 탭이면 오류 문의, d7 §30)").toHaveAttribute("href", `${NEW}?category=bug`);
      const title = page.locator("main h1");
      await expect(title).toHaveText(exact(PAGE_TITLE));
      expect(await tabTexts(page), `${where}: 탭 글자·순서`).toEqual(TAB_LABELS);
      await expect(activeTab(page), `${where}: 기본 탭 FAQ`).toHaveText(exact(TAB_LABELS[0]));
      await expect(rows(page), `${where}: FAQ 탭에 board-post-row 0`).toHaveCount(0);

      const t = await box(title, "제목");
      const w = await box(page.locator(`main ${sel("board-write")}`), "board-write");
      const tb = await box(page.locator(`main ${sel("board-tabs")}`), "board-tabs");
      const fq = await box(faqItems(page).first(), "첫 faq-item");
      expect(w.x, "board-write 는 제목 오른쪽").toBeGreaterThan(t.x + t.width);
      expect(Math.abs(w.y + w.height / 2 - (t.y + t.height / 2)), "board-write 는 제목과 한 줄").toBeLessThanOrEqual(4);
      expect(tb.y, "board-tabs 는 제목 아래").toBeGreaterThanOrEqual(w.y + w.height);
      expect(fq.y, "FAQ 는 탭 아래").toBeGreaterThanOrEqual(tb.y + tb.height);

      if (isDesk(page)) {
        await expect(page.locator(sel("manage-back")), `${where}: 1440 manage-back 0`).toHaveCount(0);
        await expect(page.locator(sel("nav-pill")), `${where}: 1440 nav-pill 0`).toHaveCount(0);
      } else {
        const back = page.locator(`main ${sel("manage-back")}`);
        await expect(back, `${where}: manage-back 1 (본문 head-row)`).toHaveCount(1);
        await expect(back).toHaveText(exact("관리"));
        await expect(back, "manage-back → 관리(18)").toHaveAttribute("href", routeOf(MANAGE_BACK_RULE.screen));
        await expect(page.locator(`${sel("nav-pill")} ${sel("manage-back")}`), "시안 20-mobile: nav-pill 안 manage-back 0").toHaveCount(0);
        await expect(page.locator(sel("nav-pill")), "시안 20-mobile: nav-pill 왼쪽 = 워드마크").toContainText(WORDMARK);
        const b = await box(back, "manage-back");
        expect(b.y + b.height, "‹ 관리 는 제목 위").toBeLessThanOrEqual(t.y + 1);
        const active = page.locator(`${sel(rules.tab_bar.component)} ${sel(rules.tab_bar.item)}[aria-current="page"]`);
        await expect(active).toHaveCount(1);
        await expect(active, `rules board.entry: tab-bar 활성 '${MOBILE_TAB}'`).toContainText(MOBILE_TAB);
      }
    } finally {
      await context.close();
    }
  });
}

test(`[C1]${S} 모바일 '‹ 관리' 누르면 관리(18) · 데스크톱 사이드바 board-link 를 누르면 ${LIST}`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openBoard(browser, info, "teacher", isDeskProject(info) ? routeOf(13) : LIST);
  try {
    if (isDesk(page)) {
      const link = page.locator(`${sel(DS.component)} ${sel("board-link")}`);
      await waitHydrated(link);
      await link.click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(LIST);
      await settle(page);
      await expect(page.locator(`main ${sel("board-tabs")}`)).toBeVisible();
    } else {
      const back = page.locator(`main ${sel("manage-back")}`);
      await waitHydrated(back);
      await back.click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(routeOf(MANAGE_BACK_RULE.screen));
    }
  } finally {
    await context.close();
  }
});

function isDeskProject(info: { project: { name: string } }): boolean {
  return info.project.name === "desktop";
}

// =====================================================================
// 사이드바 board-link 현재 표시 (desktop_shell.board_link) · 모바일 tab-bar '관리'
// =====================================================================
for (const role of ["student", "teacher"] as Role[]) {
  test(`[C1]${S} ${ROLE_LABEL[role]} 1440 사이드바 board-link '게시판' 현재 표시(aria-current · 시안 하늘 바탕) · sidebar-item 현재 0 · guide-link 바로 위 / 390 tab-bar '${MOBILE_TAB}' 활성 · 글 보기에서도 같음`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const post = await newPost("teacher", `link-${tag(info)}`);
    const { context, page } = await openBoard(browser, info, role, LIST);
    try {
      for (const path of [LIST, detailPath(post.id)]) {
        if (path !== LIST) {
          await page.goto(path);
          await settle(page);
        }
        const where = `${ROLE_LABEL[role]} ${path} (${vpOf(page)})`;
        if (isDesk(page)) {
          const link = page.locator(`${sel(DS.component)} ${sel("board-link")}`);
          await expect(link, `${where}: board-link 1`).toHaveCount(1);
          await expect(link).toHaveAttribute("aria-current", "page");
          await expect(link).toContainText("게시판");
          expect(await css(link, "background-color"), `${where}: 현재 표시 바탕 = 시안 20-desktop board-link`).toBe(hexToRgb(fNode("20-desktop", "sidebar-guide/board-link").fills[0]));
          await expect(page.locator(`${sel(DS.component)} ${sel(DS.item)}[aria-current="page"]`), `${where}: sidebar-item 현재 0`).toHaveCount(0);
          const g = await box(page.locator(`${sel(DS.component)} ${sel("guide-link")}`), "guide-link");
          const b = await box(link, "board-link");
          expect(Math.abs(g.y - (b.y + b.height)), "board-link 는 guide-link 바로 위 (시안 gap)").toBeLessThanOrEqual(fNode("20-desktop", "sidebar-guide").gap! + 1);
          expect(b.height, "board-link 44").toBe(fNode("20-desktop", "sidebar-guide/board-link").height);
        } else {
          await expect(page.locator(sel("board-link")), `${where}: 390 본문·셸에 board-link 0 (진입은 관리 탭)`).toHaveCount(0);
          const active = page.locator(`${sel(rules.tab_bar.component)} ${sel(rules.tab_bar.item)}[aria-current="page"]`);
          await expect(active).toHaveCount(1);
          await expect(active, `${where}: tab-bar 활성 '${MOBILE_TAB}'`).toContainText(MOBILE_TAB);
        }
      }
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// FAQ 16
// =====================================================================
test(`[C1]${S} 학생 FAQ 탭: faq-item 앞 ${FAQ_SEED_COUNT}개 = 가이드 '자주 묻는 질문' 순서 → rules 예시 2개 (오래된 순, 문구 그대로) · 글쓴이·상태 배지 0 · › → 펼치면 ⌄ + 답 · 여러 개 동시 펼침`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openBoard(browser, info, "student", LIST);
  try {
    const items = faqItems(page);
    await expect(items.first()).toBeVisible();
    const qs = await items.evaluateAll((els) => els.map((e) => (e.querySelector("button")?.textContent ?? "").trim()));
    expect(qs.length, "faq-item 수 ≥ seed").toBeGreaterThanOrEqual(FAQ_SEED_COUNT);
    expect(qs.slice(0, FAQ_SEED_COUNT), "FAQ 순서·문구 = seed (d7 §30)").toEqual(EXPECTED_FAQ.map((f) => f.q));
    const list = page.locator('main [data-name="faq-list"]');
    await expect(list.locator(sel("board-status-badge")), "FAQ 상태 배지 0 (rules board.faq)").toHaveCount(0);
    await expect(list, "FAQ 글쓴이 표시 0").not.toContainText(AUTHOR_SUFFIX);
    // 닫힌 상태: 답 0, aria-expanded false
    for (let i = 0; i < 3; i++) await expect(items.nth(i).locator("button").first()).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText(EXPECTED_FAQ[0].a, { exact: true })).toHaveCount(0);
    // 첫째 · 셋째 펼침 → 둘 다 열림
    for (const i of [0, 2]) {
      const btn = items.nth(i).locator("button").first();
      await waitHydrated(btn);
      await btn.click();
      await expect(btn).toHaveAttribute("aria-expanded", "true");
    }
    for (const i of [0, 2]) {
      const ans = items.nth(i).getByText(EXPECTED_FAQ[i].a, { exact: true });
      await expect(ans, `FAQ ${i + 1} 답 = seed 문구`).toBeVisible();
    }
    await expect(items.nth(0).locator("button").first(), "여러 개 동시 펼침 (d7 §30)").toHaveAttribute("aria-expanded", "true");
    await expect(items.nth(1).locator("button").first()).toHaveAttribute("aria-expanded", "false");
    // 펼친 답 상자 = 시안 faq-answer (canvas-soft · radius · 안쪽)
    const fa = fNode(F("", page), "faq-item/faq-answer");
    const ansBox = items.nth(0).getByText(EXPECTED_FAQ[0].a, { exact: true });
    expect(await css(ansBox, "background-color"), "faq-answer 바탕").toBe(hexToRgb(fa.fills[0]));
    expect(await css(ansBox, "border-top-left-radius"), "faq-answer radius").toBe(`${fa.cornerRadius}px`);
    expect(await css(ansBox, "padding-top"), "faq-answer 안쪽").toBe(`${fa.padding![0]}px`);
    // 다시 누르면 닫힘
    await items.nth(0).locator("button").first().click();
    await expect(items.nth(0).locator("button").first()).toHaveAttribute("aria-expanded", "false");
  } finally {
    await context.close();
  }
});

// =====================================================================
// 탭 · 정렬 · 줄 · 상태 배지
// =====================================================================
test(`[C1]${S} 탭 전환 = 주소 ?tab= · '${tabLabel("bug")}' 탭 board-post-row 최신순(새 글이 위) · FAQ 0 · '${tabLabel("idea")}' 탭엔 그 글 0`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const t = tag(info);
  const older = await newPost("teacher", `sort-${t}-1`);
  const newer = await newPost("teacher", `sort-${t}-2`);
  const { context, page } = await openBoard(browser, info, "teacher", LIST);
  try {
    const bugTab = tabs(page).filter({ hasText: tabLabel("bug") });
    await waitHydrated(bugTab);
    await bugTab.click();
    await expect.poll(() => new URL(page.url()).search).toBe(`?tab=bug`);
    await expect(activeTab(page)).toHaveText(exact(tabLabel("bug")));
    await expect(rowByTitle(page, newer.title)).toHaveCount(1);
    await expect(rowByTitle(page, older.title)).toHaveCount(1);
    await expect(faqItems(page), "오류 문의 탭 faq-item 0").toHaveCount(0);
    const titles = await rowTitles(page);
    expect(titles.indexOf(newer.title), "최신순: 새 글이 먼저").toBeLessThan(titles.indexOf(older.title));
    expect(titles.indexOf(newer.title)).toBeGreaterThanOrEqual(0);
    // 이 탭의 줄은 모두 '오류 문의'
    const cats = await rows(page).evaluateAll((els) => els.map((e) => (e.querySelector("span > span > span")?.textContent ?? "").trim()));
    expect(new Set(cats), "줄 분류 = 오류 문의 만").toEqual(new Set([tabLabel("bug")]));
    await expect(page.locator(`main ${sel("board-write")} a`), "board-write → 지금 탭 분류").toHaveAttribute("href", `${NEW}?category=bug`);

    const ideaTab = tabs(page).filter({ hasText: tabLabel("idea") });
    await ideaTab.click();
    await expect.poll(() => new URL(page.url()).search).toBe(`?tab=idea`);
    await expect(activeTab(page)).toHaveText(exact(tabLabel("idea")));
    await expect(rowByTitle(page, newer.title), "개선 제안 탭에 오류 문의 글 0").toHaveCount(0);

    const faqTab = tabs(page).filter({ hasText: TAB_LABELS[0] });
    await faqTab.click();
    await expect.poll(() => new URL(page.url()).search).toBe("");
    await expect(faqItems(page).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test(`[C1]${S} board-post-row = 분류 · 제목 / '학교명 ${"선생님"} · M월 D일' + '${STATUS_RECEIVED}' 배지 (시안 20-student: 높이 · 안쪽 · 무채색) — 학생 화면`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const post = await newPost("teacher", `row-${tag(info)}`);
  const nameA = await schoolNameOf("teacher");
  const { context, page } = await openBoard(browser, info, "student", listPath("bug"));
  try {
    const row = rowByTitle(page, post.title);
    await expect(row).toHaveCount(1);
    expect(await leafTexts(row), "줄 글자 순서 (rules board.row)").toEqual([tabLabel("bug"), post.title, `${authorLabel(nameA)} · ${koDate(post.created_at)}`, STATUS_RECEIVED]);
    const fr = F("student", page);
    const fRow = fAll(fr, "board-post-row")[1];
    const r = await box(row, "board-post-row");
    expect(r.height, `줄 높이 = 시안 ${fRow.height} (rules ≥ 56)`).toBe(fRow.height);
    expect(await css(row, "padding-left"), "줄 안쪽 좌우").toBe(`${fRow.padding![1]}px`);
    const badge = row.locator(sel("board-status-badge"));
    const fB = fAll(fr, "board-status-badge").find((n) => n.fills[0] !== fAll(fr, "board-status-badge")[0].fills[0])!; // '접수'
    expect(await css(badge, "background-color"), "접수 바탕 = canvas-soft").toBe(hexToRgb(fB.fills[0]));
    const fBl = frameNodes(fr).find((n) => n.path.includes("board-status-badge") && n.text?.characters === STATUS_RECEIVED)!;
    expect(await css(badge, "color"), "접수 글자 = text-muted").toBe(hexToRgb(fBl.fills[0]));
    expect((await box(badge, "배지")).height, "배지 높이").toBe(fB.height);
    expect(await css(badge, "font-weight")).toBe(String(fBl.text!.fontWeight));
    expect(await css(badge, "font-size")).toBe(`${fBl.text!.fontSize}px`);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 답변 완료 · 상세 · board-post-menu
// =====================================================================
test(`[C1]${S} 답변 달린 내 글: 배지 '${STATUS_ANSWERED}'(ink · 흰 글자) · 상세 board-detail 순서 · board-answer '${ANSWER_HEAD} · 날짜' + 답 · ⋯ '${OWN_EDIT}' 비활성 + '${EDIT_LOCKED}' · '${OWN_DELETE}' 켜짐 · /edit → 글 보기`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const post = await newPost("teacher", `ans-${tag(info)}`, "bug", "본문 한 줄");
  const answer = "운영자 답변(테스트 준비)";
  const at = await prepAnswer(post.id, answer);
  const nameA = await schoolNameOf("teacher");
  const { context, page } = await openBoard(browser, info, "teacher", listPath("bug"));
  try {
    const fr = F("student", page);
    const row = rowByTitle(page, post.title);
    const badge = row.locator(sel("board-status-badge"));
    await expect(badge).toHaveText(exact(STATUS_ANSWERED));
    const fB = fAll(fr, "board-status-badge")[0];
    const fBl = frameNodes(fr).find((n) => n.path.includes("board-status-badge") && n.text?.characters === STATUS_ANSWERED)!;
    expect(await css(badge, "background-color"), "답변 완료 바탕 = ink").toBe(hexToRgb(fB.fills[0]));
    expect(await css(badge, "color"), "답변 완료 글자 = 흰색").toBe(hexToRgb(fBl.fills[0]));

    await page.goto(detailPath(post.id));
    await settle(page);
    const scope = detailScope(page);
    const detail = scope.locator(sel("board-detail"));
    await expect(detail).toHaveCount(1);
    expect(await leafTexts(detail), "board-detail 순서: 분류 → 제목 → 글쓴이·날짜 → 배지 → 본문").toEqual([
      tabLabel("bug"),
      post.title,
      `${authorLabel(nameA)} · ${koDate(post.created_at)}`,
      STATUS_ANSWERED,
      "본문 한 줄",
    ]);
    await expect(detail.locator("h1, h2").first(), "제목 heading").toHaveText(exact(post.title));
    const ans = scope.locator(sel("board-answer"));
    await expect(ans).toHaveCount(1);
    expect(await leafTexts(ans)).toEqual([`${ANSWER_HEAD} · ${koDate(at)}`, answer]);
    const fA = fNode(F("detail", page), "board-answer");
    expect(await css(ans, "background-color"), "board-answer canvas-soft").toBe(hexToRgb(fA.fills[0]));
    expect(await css(ans, "border-top-left-radius")).toBe(`${fA.cornerRadius}px`);
    expect(await css(ans, "padding-top")).toBe(`${fA.padding![0]}px`);
    const a = await box(ans, "board-answer");
    const d = await box(detail.locator("p").last(), "본문");
    expect(a.y, "답변은 본문 아래").toBeGreaterThanOrEqual(d.y + d.height);

    const menu = await openMenu(page);
    const items = menu.locator('[role="menuitem"]');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText(OWN_EDIT);
    await expect(items.nth(0), "답변 뒤 '수정' 비활성").toBeDisabled();
    await expect(items.nth(0)).toContainText(EDIT_LOCKED);
    await expect(items.nth(1)).toHaveText(exact(OWN_DELETE));
    await expect(items.nth(1)).toBeEnabled();

    await page.goto(`${detailPath(post.id)}/edit`);
    await settle(page);
    expect(new URL(page.url()).pathname, "답변 뒤 /edit → 글 보기").toBe(detailPath(post.id));
    await expect(page.locator(sel("board-form")), "board-form 0").toHaveCount(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 교사 글쓰기 → 수정 → 삭제
// =====================================================================
test(`[R-ui]${S} 교사: '${WRITE_LABEL}' → board-form(분류 오류 문의·개선 제안 → 제목 → privacy-note → 본문 → '${SUBMIT_LABEL}', 빈 칸이면 꺼짐) → 글 보기 + '${TOAST_POSTED}' → ⋯ ${OWN_EDIT} → 고친 제목 → ⋯ ${OWN_DELETE} → ex-modal-card → 목록 + '${TOAST_DELETED}' · DB 0행`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const title = `${PREFIX}flow-${tag(info)}`;
  const edited = `${title}-수정`;
  const { context, page } = await openBoard(browser, info, "teacher", listPath("bug"));
  let id = "";
  try {
    const write = page.locator(`main ${sel("board-write")} a`);
    await waitHydrated(write);
    await write.click();
    await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe(`${NEW}?category=bug`);
    await settle(page);
    const form = page.locator(sel("board-form"));
    await expect(form).toHaveCount(1);
    await expect(page.locator("main h1")).toHaveText(exact(fNode("20-new-mobile", "page-head/page-title").text!.characters));
    const order = await form.evaluate((f) =>
      [...f.querySelectorAll("[data-component]")]
        .map((e) => e.getAttribute("data-component")!)
        .filter((n) => ["segmented-control", "text-input", "board-privacy-note", "button-primary"].includes(n)),
    );
    expect(order, "board-form 순서 (rules board.form)").toEqual(["segmented-control", "text-input", "board-privacy-note", "text-input", "button-primary"]);
    const segs = await form.locator(`${sel("segmented-control")} [role="tab"]`).evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.trim()));
    expect(segs, "분류 = 오류 문의 · 개선 제안 (FAQ 없음)").toEqual(TAB_LABELS.slice(1));
    await expect(form.locator(sel("segmented-control-active")), "분류 기본 = 지금 탭").toHaveText(exact(tabLabel("bug")));
    await expect(form.locator(sel("board-privacy-note"))).toHaveText(exact(PRIVACY_NOTE));
    const submit = form.locator('button[type="submit"]');
    await expect(submit).toHaveText(exact(SUBMIT_LABEL));
    await expect(submit, "빈 제목·본문 = 꺼짐").toBeDisabled();
    await expect(async () => {
      await form.locator('input[name="title"]').fill(title);
      await expect(submit, "본문 비면 꺼짐").toBeDisabled({ timeout: 1_000 });
      await form.locator('textarea[name="body"]').fill("UI 테스트 본문");
      await expect(submit).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await submit.click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 45_000 }).toMatch(new RegExp(`^${LIST}/[0-9a-f-]{36}$`));
    id = new URL(page.url()).pathname.split("/").pop()!;
    track(id, "teacher");
    await expect(page.locator(sel("ex-toast")).filter({ hasText: TOAST_POSTED }), `토스트 '${TOAST_POSTED}'`).toBeVisible();
    await settle(page);
    await expect(detailScope(page).locator(`${sel("board-detail")} h1`)).toHaveText(exact(title));
    await expect(detailScope(page).locator(`${sel("board-detail")} ${sel("board-status-badge")}`)).toHaveText(exact(STATUS_RECEIVED));

    // 수정
    let menu = await openMenu(page);
    await menu.locator('[role="menuitem"]').filter({ hasText: OWN_EDIT }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`${detailPath(id)}/edit`);
    await settle(page);
    const f2 = page.locator(sel("board-form"));
    await expect(f2.locator('input[name="title"]'), "수정 = 채운 채").toHaveValue(title);
    await expect(f2.locator('textarea[name="body"]')).toHaveValue("UI 테스트 본문");
    await expect(async () => {
      await f2.locator('input[name="title"]').fill(edited);
      await expect(f2.locator('button[type="submit"]')).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await f2.locator('button[type="submit"]').click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 45_000 }).toBe(detailPath(id));
    await settle(page);
    await expect(detailScope(page).locator(`${sel("board-detail")} h1`)).toHaveText(exact(edited));

    // 삭제
    menu = await openMenu(page);
    await menu.locator('[role="menuitem"]').filter({ hasText: OWN_DELETE }).click();
    const modal = page.locator(sel("ex-modal-card"));
    await expect(modal, "삭제 확인 = ex-modal-card").toBeVisible();
    await modal.locator("button").filter({ hasText: exact(OWN_DELETE) }).click();
    await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`, { timeout: 45_000 }).toBe(listPath("bug"));
    await expect(page.locator(sel("ex-toast")).filter({ hasText: TOAST_DELETED }), `토스트 '${TOAST_DELETED}'`).toBeVisible();
    await settle(page);
    await expect(rowByTitle(page, edited), "목록에서 사라짐").toHaveCount(0);
    expect(await idByTitle("teacher", edited), "DB 0행 (실제 delete)").toEqual([]);
  } finally {
    if (!id) for (const x of await idByTitle("teacher", title)) track(x, "teacher");
    await context.close();
  }
});

// =====================================================================
// 역할: 학생 쓰기 0 (R5) · 운영자 요소 0 (R8 · d7 §30)
// =====================================================================
test(`[R-ui]${S} 학생: board-write · board-form · board-post-menu 0 (R5) — 목록 FAQ·오류 문의·글 보기 / ${NEW} → ${LIST} · 남의 글 /edit = 404`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const post = await newPost("teacher", `stu-${tag(info)}`);
  const { context, page } = await openBoard(browser, info, "student", LIST);
  try {
    for (const path of [LIST, listPath("bug"), detailPath(post.id)]) {
      if (path !== LIST) {
        await page.goto(path);
        await settle(page);
      }
      const where = `학생 ${path} (${vpOf(page)})`;
      if (path === listPath("bug")) await expect(rowByTitle(page, post.title), `${where}: 교사 글은 보인다`).toHaveCount(1);
      if (path === detailPath(post.id)) await expect(detailScope(page).locator(sel("board-detail"))).toHaveCount(1);
      await expectRoleChecks(page, "student", where);
      for (const c of ["board-write", "board-form", "board-post-menu", "page-more-menu"]) await expect(page.locator(sel(c)), `${where}: ${c} 0`).toHaveCount(0);
    }
    for (const p of [NEW, `${NEW}?category=idea`]) {
      await page.goto(p);
      await expect.poll(() => new URL(page.url()).pathname, { message: `학생 ${p} → ${LIST}` }).toBe(LIST);
      await settle(page);
      await expect(page.locator(sel("board-form"))).toHaveCount(0);
    }
    const res = await page.goto(`${detailPath(post.id)}/edit`);
    expect(res?.status(), "남의 글 /edit = 404").toBe(404);
    await expect(page.locator(sel("board-form"))).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test(`[R-ui]${S} 교사(운영자 아님): 운영자 요소 0 — page-more-menu 0(R8) · '+ FAQ 추가' · FAQ '고치기' · '답변' 입력 0 · 남의 글 board-post-menu 0 · ${NEW}?category=faq → ${LIST} · 운영자 API 403`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const other = await newPost("admin", `op-${tag(info)}`);
  const mine = await newPost("teacher", `op-${tag(info)}`);
  const { context, page } = await openBoard(browser, info, "teacher", LIST);
  try {
    // FAQ 탭: 펼쳐도 '고치기 · 삭제' 0, '+ FAQ 추가' 0
    const first = faqItems(page).first().locator("button").first();
    await waitHydrated(first);
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("main").getByText("+ FAQ 추가", { exact: true }), "'+ FAQ 추가' 0").toHaveCount(0);
    await expect(faqItems(page).first().locator(sel("button-outline")), "FAQ '고치기 · 삭제' 0").toHaveCount(0);
    await expectRoleChecks(page, "teacher", `교사 ${LIST}`);
    for (const id of [other.id, mine.id]) {
      await page.goto(detailPath(id));
      await settle(page);
      const where = `교사 ${detailPath(id)} (${vpOf(page)})`;
      await expect(page.locator(sel("page-more-menu")), `${where}: page-more-menu(숨기기) 0`).toHaveCount(0);
      await expect(page.locator('textarea[name="answer"]'), `${where}: 답변 입력 0`).toHaveCount(0);
      await expect(page.getByRole("button", { name: /답변 (등록|고치기)/ }), `${where}: 답변 버튼 0`).toHaveCount(0);
      await expect(detailScope(page).locator(sel("board-post-menu")), `${where}: board-post-menu = 글쓴이 본인만`).toHaveCount(id === mine.id ? 1 : 0);
      await expectRoleChecks(page, "teacher", where);
    }
    await page.goto(`${NEW}?category=faq`);
    await expect.poll(() => new URL(page.url()).pathname, { message: "FAQ 추가 = 운영자만" }).toBe(LIST);
    // 운영자 쓰기 API: 운영자가 아니면 403 (d7 §30) — 테스트 글과 없는 id 만 대상으로 (seed FAQ 는 건드리지 않음)
    const none = "00000000-0000-4000-8000-000000000000";
    const calls: [string, "PUT" | "POST" | "PATCH" | "DELETE", unknown][] = [
      [`/api/board/posts/${mine.id}/answer`, "PUT", { answer: "운영자 아님" }],
      [`/api/board/posts/${other.id}/hidden`, "PUT", { hidden: true }],
      ["/api/board/faq", "POST", { title: `${PREFIX}faq-${tag(info)}`, body: "x" }],
      [`/api/board/faq/${none}`, "PATCH", { title: "x", body: "x" }],
      [`/api/board/faq/${none}`, "DELETE", undefined],
    ];
    for (const [url, method, data] of calls) {
      const r = await page.request.fetch(url, { method, data: data === undefined ? undefined : data, headers: { "content-type": "application/json" } });
      expect(r.status(), `교사 ${method} ${url} = 403`).toBe(403);
    }
    const s = await signIn("teacher");
    const chk = await s.client.from("board_posts").select("answer").eq("id", mine.id).single();
    expect((chk.data as { answer: string | null }).answer, "답변 안 써짐").toBeNull();
  } finally {
    await context.close();
  }
});

// =====================================================================
// N1 예외: 다른 학교 글 = 학교명만
// =====================================================================
test(`[N1-ui]${S} 학교 B 교사: 학교 A 글이 '학교A명 ${"선생님"}' 으로만 보인다 (목록·글 보기) — 글쓴이 이름·이메일·user id 는 HTML·RSC 어디에도 0 · ⋯ 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const post = await newPost("teacher", `n1-${tag(info)}`);
  const nameA = await schoolNameOf("teacher");
  const nameB = await schoolNameOf("schoolB");
  expect(nameB).not.toBe(nameA);
  const t = await signIn("teacher");
  const prof = await t.client.from("profiles").select("display_name").eq("user_id", t.userId).single();
  const display = ((prof.data as { display_name: string | null } | null)?.display_name ?? "").trim();
  const email = process.env.TEST_TEACHER_EMAIL ?? "";
  expect(email, "TEST_TEACHER_EMAIL").not.toBe("");
  const { context, page } = await openBoard(browser, info, "schoolB", listPath("bug"));
  try {
    for (const path of [listPath("bug"), detailPath(post.id)]) {
      if (path !== listPath("bug")) {
        await page.goto(path);
        await settle(page);
      }
      const where = `학교B 교사 ${path} (${vpOf(page)})`;
      const meta = `${authorLabel(nameA)} · ${koDate(post.created_at)}`;
      if (path === listPath("bug")) expect(await leafTexts(rowByTitle(page, post.title)), `${where}: 줄`).toContain(meta);
      else {
        await expect(detailScope(page).locator(`${sel("board-detail")} h1`)).toHaveText(exact(post.title));
        expect(await leafTexts(detailScope(page).locator(sel("board-detail"))), `${where}: 글 보기`).toContain(meta);
        await expect(detailScope(page).locator(sel("board-post-menu")), `${where}: 남의 글 ⋯ 0`).toHaveCount(0);
      }
      const html = await page.content();
      expect(html.includes(email), `${where}: 글쓴이 이메일 0`).toBe(false);
      expect(html.includes(t.userId), `${where}: 글쓴이 user id 0`).toBe(false);
      if (display.length >= 2) expect(html.includes(display), `${where}: 글쓴이 이름 0`).toBe(false);
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// 비로그인 → /login · 404
// =====================================================================
test(`[C2]${S} 비로그인: ${LIST} · ${listPath("bug")} · ${NEW} · 글 보기 · /edit → ${routeOf(1)} (둘러보기 없음)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const post = await newPost("teacher", `anon-${tag(info)}`);
  const context = await anonContext(browser, info);
  try {
    const page = await context.newPage();
    for (const p of [LIST, listPath("bug"), NEW, detailPath(post.id), `${detailPath(post.id)}/edit`]) {
      await page.goto(p);
      await expect.poll(() => new URL(page.url()).pathname, { message: `비로그인 ${p}` }).toBe(routeOf(1));
      await expect(page.locator(sel("board-detail")), `${p}: 글 내용 0`).toHaveCount(0);
      expect(await page.content(), `${p}: 글 제목이 HTML 에 없음`).not.toContain(post.title);
    }
  } finally {
    await context.close();
  }
});

test(`[C1]${S} 글 보기 404: 숨긴 글 · 없는 글 · FAQ id (목록에서 펼친다, d7 §30)`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const hidden = await newPost("teacher", `hid-${tag(info)}`);
  await prepHidden(hidden.id);
  const s = await signIn("teacher");
  const faq = await s.client.from("board_posts").select("id").eq("category", "faq").limit(1).single();
  expect(faq.error).toBeNull();
  const { context, page } = await openBoard(browser, info, "teacher", LIST);
  try {
    for (const [what, id] of [
      ["숨긴 글(내 글)", hidden.id],
      ["없는 글", "00000000-0000-4000-8000-000000000000"],
      ["FAQ", (faq.data as { id: string }).id],
    ] as const) {
      const res = await page.goto(detailPath(id));
      expect(res?.status(), `${what} = 404`).toBe(404);
      await expect(page.locator(sel("board-detail")), `${what}: board-detail 0`).toHaveCount(0);
    }
    await page.goto(listPath("bug"));
    await settle(page);
    await expect(rowByTitle(page, hidden.title), "숨긴 글은 목록에도 0").toHaveCount(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 상세 · 드로어
// =====================================================================
test(`[C1]${S} 글 보기: 1440 = 같은 분류 목록(고른 줄 현재 표시) + detail-drawer ${DS.drawer_width} · ✕ → 목록 / 390 = 전용 화면 '‹ 게시판' → 목록 · 드로어·탭 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const post = await newPost("teacher", `drw-${tag(info)}`);
  const { context, page } = await openBoard(browser, info, "student", listPath("bug"));
  try {
    const row = rowByTitle(page, post.title);
    await waitHydrated(row);
    await row.click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 45_000 }).toBe(detailPath(post.id));
    await settle(page);
    if (isDesk(page)) {
      const drawer = page.locator(sel("detail-drawer"));
      await expect(drawer).toHaveCount(1);
      const d = await box(drawer, "detail-drawer");
      expect(d.width, "드로어 폭 = desktop_shell.drawer_width").toBe(DS.drawer_width);
      const fD = fNode("20-detail-desktop", "detail-drawer");
      await expect(drawer.locator(sel("board-detail"))).toHaveCount(1);
      const bd = await box(drawer.locator(sel("board-detail")), "board-detail");
      expect(Math.round(bd.x - d.x), "드로어 안쪽 왼쪽 = 시안").toBe(fD.padding![3]);
      await expect(drawer.locator(`${sel("board-detail")} h1`)).toHaveText(exact(post.title));
      await expect(activeTab(page), "왼쪽 목록 = 같은 분류 탭").toHaveText(exact(tabLabel("bug")));
      const sel_ = rowByTitle(page, post.title);
      await expect(sel_).toHaveAttribute("aria-current", "page");
      const fSel = fAll("20-detail-desktop", "board-post-row")[0];
      expect(await css(sel_, "background-color"), "고른 줄 바탕 = 시안 20-detail-desktop").toBe(hexToRgb(fSel.fills[0]));
      const close = drawer.locator('[data-name="drawer-close"]');
      await waitHydrated(close);
      await close.click();
      await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe(listPath("bug"));
      await expect(page.locator(sel("detail-drawer"))).toHaveCount(0);
    } else {
      await expect(page.locator(sel("detail-drawer")), "390 드로어 0").toHaveCount(0);
      await expect(page.locator(`main ${sel("board-tabs")}`), "390 글 보기에 탭 0").toHaveCount(0);
      await expect(page.locator(`main ${sel("manage-back")}`), "글 보기는 '‹ 게시판' (manage-back 0)").toHaveCount(0);
      const back = page.locator('main [data-name="board-back"]');
      await expect(back).toHaveCount(1);
      await expect(back).toHaveText(exact(fNode("20-detail-mobile", "board-back/label").text!.characters));
      await expect(back, "‹ 게시판 → 같은 분류 목록").toHaveAttribute("href", listPath("bug"));
      await waitHydrated(back);
      await back.click();
      await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe(listPath("bug"));
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// 빈 상태 (20-empty: 개선 제안 0건)
// =====================================================================
async function waitIdeaEmpty(): Promise<void> {
  const s = await signIn("teacher");
  await expect
    .poll(
      async () => {
        const { data, error } = await s.client.from("board_posts").select("title").eq("category", "idea");
        if (error) throw new Error(error.message);
        const titles = (data ?? []).map((r) => String((r as { title: string }).title));
        const real = titles.filter((x) => !x.startsWith("S20-db-"));
        if (real.length > 0) throw new Error(`개선 제안에 테스트가 아닌 글 ${real.length}개 — 20-empty 를 실제 화면으로 볼 수 없음`);
        return titles.length;
      },
      { message: "다른 테스트가 만든 개선 제안 글이 지워질 때까지", timeout: 240_000, intervals: [3_000] },
    )
    .toBe(0);
}

for (const role of ["teacher", "student"] as Role[]) {
  test(`[C1]${S} 20-empty ${ROLE_LABEL[role]} '${tabLabel("idea")}' 0건: ex-empty-state-card '${EMPTY_TITLE}' + 시안 보조 문구 · board-write ${role === "student" ? "0 (R5)" : "카드 안 1 + 머리 1"} · 탭 그대로`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    await waitIdeaEmpty();
    const { context, page } = await openBoard(browser, info, role, listPath("idea"));
    try {
      const card = page.locator(`main ${sel("ex-empty-state-card")}`);
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(EMPTY_TITLE);
      const fr = F("empty", page);
      await expect(card, "보조 문구 = 시안 20-empty").toContainText(fNode(fr, "empty-text/body").text!.characters);
      await expect(activeTab(page)).toHaveText(exact(tabLabel("idea")));
      await expect(rows(page)).toHaveCount(0);
      if (role === "student") {
        await expect(page.locator(sel("board-write")), "학생 board-write 0").toHaveCount(0);
      } else {
        await expect(card.locator(sel("board-write")), "카드 안 board-write").toHaveCount(1);
        await expect(card.locator(`${sel("board-write")} a`)).toHaveAttribute("href", `${NEW}?category=idea`);
        await expect(page.locator(`main ${sel("board-write")}`), "머리 + 카드").toHaveCount(2);
      }
      const fC = fNode(fr, "ex-empty-state-card");
      expect(await css(card, "background-color")).toBe(hexToRgb(fC.fills[0]));
      expect(await css(card, "border-top-left-radius")).toBe(`${fC.cornerRadius}px`);
      const tb = await box(page.locator(`main ${sel("board-tabs")}`), "board-tabs");
      const c = await box(card, "빈 카드");
      const gap = isDesk(page) ? 16 + fNode(fr, "empty-wrap").padding![0] : fNode("20-empty-mobile", "tabs-wrap").padding![2] + fNode(fr, "empty-wrap").padding![0];
      expect(Math.round(c.y - (tb.y + tb.height)), "탭 ↔ 카드 간격 = 시안").toBe(gap);
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-empty-${vpOf(page)}${role === "student" ? "-student" : ""}.png`), fullPage: true });
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 여백 (시안 20-*)
// =====================================================================
test(`[C1]${S} 여백 목록 (시안 20-mobile · 20-desktop): manage-back 높이·글자 · 탭 위치·폭·높이 · FAQ 줄 안쪽 · 데스크톱 본문 32 · 탭 360`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openBoard(browser, info, "teacher", LIST);
  try {
    const fr = F("", page);
    const tabsEl = page.locator(`main ${sel("board-tabs")}`);
    const fTabs = fNode(fr, "board-tabs");
    const tb = await box(tabsEl, "board-tabs");
    const fSeg = fNode(fr, "segmented-control/segmented-control-active");
    expect.soft(tb.height, "board-tabs 높이").toBe(fTabs.height);
    expect.soft((await box(activeTab(page), "활성 칸")).height, "칸 높이").toBe(fSeg.height);
    const w = await box(page.locator(`main ${sel("board-write")}`), "board-write");
    expect.soft(w.height, "board-write 높이").toBe(fNode(fr, "page-head/board-write").height);
    const q = faqItems(page).first().locator("button").first();
    const fQ = fNode(fr, "faq-item/faq-question");
    expect.soft(await css(q, "padding-top"), "FAQ 질문 안쪽 위").toBe(`${fQ.padding![0]}px`);
    expect.soft(await css(q, "padding-bottom"), "FAQ 질문 안쪽 아래").toBe(`${fQ.padding![2]}px`);
    const qt = frameNodes(fr).find((n) => n.name === "question")!;
    expect.soft(await q.locator("span").first().evaluate((e) => getComputedStyle(e).fontSize), "질문 글자 크기").toBe(`${qt.text!.fontSize}px`);
    expect.soft(await q.locator("span").first().evaluate((e) => getComputedStyle(e).fontWeight), "질문 글자 굵기").toBe(String(qt.text!.fontWeight));
    if (isDesk(page)) {
      const main = fNode(fr, "main");
      const title = await box(page.locator("main h1"), "제목");
      expect.soft(Math.round(title.x), "본문 왼쪽 = 사이드바 + 32").toBe(DS.width + main.padding![3]);
      expect.soft(Math.round(w.y), "본문 위 = 32").toBe(main.padding![0]);
      expect.soft(tb.width, "데스크톱 board-tabs 폭 = 시안 360").toBe(fTabs.width);
      expect.soft(Math.round(tb.y - (w.y + w.height)), "page-head ↔ 탭 = main gap 16").toBe(main.gap);
      const fq = await box(faqItems(page).first(), "첫 FAQ");
      expect.soft(Math.round(fq.y - (tb.y + tb.height)), "탭 ↔ FAQ = gap 16 + faq-list 위 8").toBe(main.gap! + fNode(fr, "faq-list").padding![0]);
    } else {
      const back = page.locator(`main ${sel("manage-back")}`);
      const fBack = fNode(fr, "head-row/manage-back");
      const b = await box(back, "manage-back");
      expect.soft(b.height, `manage-back 높이 = 시안 head-row ${fBack.height}`).toBe(fBack.height);
      const fLabel = fNode(fr, "manage-back/label");
      const lab = back.locator("span").filter({ hasText: "관리" }).first();
      expect.soft(await css(lab, "font-weight"), "‹ 관리 글자 굵기 = 시안").toBe(String(fLabel.text!.fontWeight));
      expect.soft(await css(lab, "font-size")).toBe(`${fLabel.text!.fontSize}px`);
      const top = fNode(fr, "top-bar");
      expect.soft(Math.round(b.y), "head-row 는 top-bar 바로 아래").toBe(top.height);
      expect.soft(Math.round(w.y - (b.y + b.height)), "head-row ↔ page-head 0").toBe(0);
      const tw = fNode(fr, "tabs-wrap");
      expect.soft(Math.round(tb.y - (w.y + w.height)), "page-head ↔ 탭 = tabs-wrap 위 16").toBe(tw.padding![0]);
      expect.soft(Math.round(tb.x), "탭 왼쪽 16").toBe(tw.padding![3]);
      expect.soft(tb.width, "탭 폭 358").toBe(fTabs.width);
      const fq = await box(faqItems(page).first(), "첫 FAQ");
      expect.soft(Math.round(fq.y - (tb.y + tb.height)), "탭 ↔ FAQ = tabs-wrap 아래 8").toBe(tw.padding![2]);
      expect.soft(Math.round(fq.x), "FAQ 왼쪽 16").toBe(fNode(fr, "faq-list").padding![3]);
    }
  } finally {
    await context.close();
  }
});

test(`[C1]${S} 여백 글 보기 (시안 20-detail): 390 '‹ 게시판' 높이 · head-row ↔ 본문 8 · 묶음 사이 24 / 1440 드로어 안쪽 24 · 머리 ↔ 본문 24`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const post = await newPost("teacher", `gap-${tag(info)}`);
  await prepAnswer(post.id, "운영자 답변(여백 준비)");
  const { context, page } = await openBoard(browser, info, "teacher", detailPath(post.id));
  try {
    const fr = F("detail", page);
    const scope = detailScope(page);
    const det = await box(scope.locator(sel("board-detail")), "board-detail");
    const ans = await box(scope.locator(sel("board-answer")), "board-answer");
    const fTitle = frameNodes(fr).find((n) => n.name === "detail-title")!;
    const h1 = scope.locator(`${sel("board-detail")} h1`);
    expect.soft(await css(h1, "font-size"), "제목 heading-2").toBe(`${fTitle.text!.fontSize}px`);
    expect.soft(await css(h1, "font-weight")).toBe(String(fTitle.text!.fontWeight));
    if (isDesk(page)) {
      const fD = fNode(fr, "detail-drawer");
      const head = await box(scope.locator('[data-name="drawer-head"]'), "drawer-head");
      expect.soft(Math.round(det.y - (head.y + head.height)), "드로어 머리 ↔ board-detail = gap 24").toBe(fD.gap);
      expect.soft(Math.round(ans.y - (det.y + det.height)), "board-detail ↔ board-answer = 24").toBe(fD.gap);
      expect.soft(head.height, "drawer-head 44").toBe(fNode(fr, "drawer-head").height);
    } else {
      const back = page.locator('main [data-name="board-back"]');
      const b = await box(back, "board-back");
      const fB = fNode(fr, "head-row/board-back");
      expect.soft(b.height, `'‹ 게시판' 높이 = 시안 head-row ${fB.height}`).toBe(fB.height);
      const fW = fNode(fr, "detail-wrap");
      expect.soft(Math.round(det.y - (b.y + b.height)), "head-row ↔ board-detail = 위 8").toBe(fW.padding![0]);
      expect.soft(Math.round(ans.y - (det.y + det.height)), "board-detail ↔ board-answer = 24").toBe(fW.gap);
      expect.soft(Math.round(det.x), "왼쪽 16").toBe(fW.padding![3]);
    }
  } finally {
    await context.close();
  }
});

test(`[C1]${S} 여백 글쓰기 (시안 20-new): 폼 묶음 사이 · 본문 칸 높이 · '${SUBMIT_LABEL}' 폭 · 1440 폼 열 ${DS.form_width}`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openBoard(browser, info, "teacher", `${NEW}?category=bug`);
  try {
    const fr = F("new", page);
    const form = page.locator(sel("board-form"));
    const fForm = fNode(fr, "board-form");
    expect.soft(await css(form, "row-gap"), "board-form 묶음 사이").toBe(`${fForm.gap}px`);
    const area = form.locator('textarea[name="body"]');
    const areaBox = await box(area.locator(".."), "본문 칸");
    const fArea = fAll(fr, "input-box")[1];
    expect.soft(areaBox.height, `본문 칸 높이 = 시안 ${fArea.height}`).toBe(fArea.height);
    const titleBox = await box(form.locator('input[name="title"]').locator(".."), "제목 칸");
    expect.soft(titleBox.height, "제목 칸 높이").toBe(fAll(fr, "input-box")[0].height);
    const submit = await box(form.locator('button[type="submit"]'), "등록");
    const fBtn = fNode(fr, "button-primary");
    expect.soft(submit.width, `'${SUBMIT_LABEL}' 폭 = 시안`).toBe(fBtn.width);
    expect.soft(submit.height).toBe(fBtn.height);
    const f = await box(form, "board-form");
    if (isDesk(page)) {
      expect.soft(f.width, "폼 열 = desktop_shell.form_width").toBe(DS.form_width);
      expect.soft(f.width).toBe(fNode(fr, "form-column").width);
    } else {
      expect.soft(f.width, "폼 폭 358").toBe(fForm.width);
      expect.soft(Math.round(f.x)).toBe(fNode(fr, "form-wrap").padding![3]);
      const b = await box(page.locator('main [data-name="board-back"]'), "board-back");
      expect.soft(b.height, "'‹ 게시판' 높이 = 시안 head-row").toBe(fNode(fr, "head-row/board-back").height);
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// V1 스크린샷
// =====================================================================
test(`[V1]${S} 화면 ${SCREEN} 스크린샷 저장 (목록 FAQ 교사 · 오류 문의 학생 · 글 보기 · 글쓰기)`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const post = await newPost("teacher", `v1-${tag(info)}`, "bug", "사용 기록을 저장한 뒤 홈 숫자가 새로고침해야 바뀌어요.");
  await prepAnswer(post.id, "알려 주셔서 고마워요.");
  const shots: [Role, string, string][] = [
    ["teacher", LIST, ""],
    ["student", listPath("bug"), "-student"],
    ["teacher", detailPath(post.id), "-detail"],
    ["teacher", `${NEW}?category=bug`, "-new"],
  ];
  for (const [role, path, suffix] of shots) {
    const { context, page } = await openBoard(browser, info, role, path);
    try {
      if (path === LIST) {
        const first = faqItems(page).first().locator("button").first();
        await waitHydrated(first);
        await first.click();
      }
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}${suffix}-${vpOf(page)}.png`), fullPage: true });
    } finally {
      await context.close();
    }
  }
});
