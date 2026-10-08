// 화면 6 (재주문 알림) 상태·격리: C1(정렬·카드 문구·0건·판매처 연결 모달 전체 흐름·프레임 개수) · C2(모바일 시트·목록 끝) · R-ui · N1-ui
// 기준: harness/d7-data.md §11·§12, 디자인 s2-spec "## 화면 6", design/frames/6-*.json, design/rules.json (colors.accent·highlight, roles, never.N1),
//       harness/dev-rules.json (components_note 화면 6: 프레임 = 알림 1건 + 모달 열림, 0건은 프레임에 없는 상태).
// 모든 상태는 일회용 학교(일회용 admin·교사·학생)에서 만든다 — 공용 학교 A·B 에는 쓰지 않는다 (공용 계정은 N1 대조 화면을 읽기만).
// service role 은 준비·정리·대조 조회에만 쓴다. 새 창은 외부 사이트를 불러오지 않는다 (stubExternal).
import { test, expect, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { browserClient, browserSession, countComponent, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, openTemp, service } from "./screen-8-helpers";
import { locationPath } from "./shell-helpers";
import {
  BADGE,
  BADGE_TEXT,
  BASIS_WORD,
  CARD,
  COMMON_NAMES,
  COMMON_SEED,
  DIRECT_OPEN,
  EMPTY,
  EMPTY_ALERTS,
  HOME_HREF,
  LINK,
  LINK_BUTTON,
  MANUAL,
  MODAL,
  NO_RESIDUE_69,
  PINK,
  REGISTER,
  REORDER,
  REORDER_HREF,
  SKY,
  amountText,
  basisText,
  MANUAL_BASIS_TEXT,
  boxOf,
  cancelButton,
  cardOf,
  cards,
  checkSchoolNames,
  cleanup,
  commonSearchOf,
  confirmButton,
  countsOf,
  dateText,
  directLink,
  emptyCard,
  exact,
  expectNoOtherSchool,
  expectTabBar,
  fakeSite,
  frameCounts,
  hex,
  hrefOf,
  infoOf,
  linkButton,
  linkDialog,
  linksTo,
  makeSchool,
  modal,
  onTop,
  openLinkModal,
  optionNames,
  otherSchools,
  ownReagentsOf,
  ownSchoolId,
  paintedWith,
  pickVendor,
  prepReagent,
  prepVendor,
  purge,
  readAlerts,
  readOptions,
  schoolNamesOf,
  scrollToEnd,
  searchHref,
  sharedSnapshot,
  stubExternal,
  tabBarTop,
  vendorsBySchool,
  visibleVendors,
  waitReorder,
  watchWrites,
  type DbReagent,
  type Fx,
} from "./screen-6-9-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const SCREEN = REORDER;
const GROUP = "s6st";
const TIMEOUT = 420_000;
const AUTO_BADGE = "auto-threshold-badge";
const STORAGE_CLASS = (rules as unknown as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes[0];

let before: string[] | null = null;
let fixtureCache: Promise<Fx> | null = null;

function fixture(info: TestInfo): Promise<Fx> {
  fixtureCache ??= makeSchool(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

/** 일회용 학교를 비운 상태에서 시작 */
async function fresh(info: TestInfo): Promise<Fx> {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id]);
  return f;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·판매처·기록 잔여물").toEqual(NO_RESIDUE_69);
  if (before) expect(await sharedSnapshot(), "공통 판매처 목록 · 학교 A·B·데모의 판매처·시약 기준 열이 그대로").toEqual(before);
});

// =====================================================================
// C1 — 정렬 · 카드 문구
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 교사: 알림 = stock < min_stock 인 시약만(같음·기준 0 은 제외) · 부족 비율(모자란 양 ÷ 필요량) 큰 순 · 카드 줄 = "${BADGE_TEXT}" → 시약명 → "재주문 기준 {min}{unit} / 현재 재고 {stock}{unit}"(d7 §11 1.21) → 기준 문구(per_group × groups 있음 = "1반 1회 …" / 없음 = "${MANUAL_BASIS_TEXT}") → "M월 D일 알림"(low_stock_since 한국 날짜, 올해가 아니면 "YYYY년 M월 D일 알림") → "${LINK_BUTTON}" · 핑크는 ${BADGE} 에만 · 카드 안 하늘색 0`, async ({ browser }, info) => {
  const f = await fresh(info);
  const half = await prepReagent(f, { tag: "절반", stock: 30, min: 60, unit: "g", perGroup: 10, groups: 6 });
  const most = await prepReagent(f, { tag: "거의없음", stock: 1, min: 10, unit: "병" });
  const quarter = await prepReagent(f, { tag: "조금", stock: 150, min: 200, unit: "mL", perGroup: 25, groups: 8 });
  const enough = await prepReagent(f, { tag: "충분", stock: 50, min: 20, unit: "g" });
  const equal = await prepReagent(f, { tag: "같음", stock: 20, min: 20, unit: "g" });
  const noRule = await prepReagent(f, { tag: "기준없음", stock: 5, min: 0, unit: "g" });
  const want: DbReagent[] = [most, half, quarter];
  expect(basisText(half), "기준 문구 (per_group × groups)").toBe("1반 1회 실험량 10 g × 6조 기준");
  expect(basisText(most), "기준 문구 (근거 없음 = d7 §11 직접 입력 문구)").toBe(MANUAL_BASIS_TEXT);

  const { context, page, response } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  try {
    expect(response?.status(), "응답").toBe(200);
    await waitReorder(page);
    const low = await (async () => (await ownReagentsOf((await browserClient(page)).client)).filter((r) => r.stock < r.min_stock))();
    expect(low.map((r) => r.id).sort(), "대조: 로그인 세션으로 읽은 부족 시약").toEqual(want.map((r) => r.id).sort());

    const shown = await readAlerts(page);
    expect(shown.map((s) => s.name), "알림 카드 순서 = 부족 비율 큰 순").toEqual(want.map((r) => r.name));
    for (const [i, r] of want.entries()) {
      const fromDb = low.find((x) => x.id === r.id)!;
      expect(fromDb.low_stock_since, `${r.name} low_stock_since`).not.toBeNull();
      expect(shown[i].lines, `카드 "${r.name}" 줄`).toEqual([BADGE_TEXT, r.name, amountText(r), basisText(r), dateText(fromDb), LINK_BUTTON]);
      expect(shown[i].badges, `카드 "${r.name}" ${BADGE}`).toEqual([BADGE_TEXT]);
      expect(shown[i].links, `카드 "${r.name}" ${LINK}`).toBe(1);
    }
    const body = await page.locator("main").innerText();
    for (const r of [enough, equal, noRule]) expect(body.includes(r.name), `부족하지 않은 시약 "${r.name}" 미표시`).toBe(false);
    expect(await countComponent(page, EMPTY), `${EMPTY}`).toBe(0);
    expect(await countComponent(page, MANUAL), `${MANUAL}`).toBe(1);

    // 색: 핑크는 badge-low-stock 에만 (시안 6: 카드 바탕은 회색), 카드 안에는 하늘색 없음 (rules.json highlight.forbidden_within)
    const pink = await paintedWith(page, PINK, [BADGE]);
    expect(pink.outside, `${BADGE} 밖의 핑크`).toEqual([]);
    expect(pink.inside, `${BADGE} 는 핑크`).toBeGreaterThanOrEqual(want.length);
    expect((await paintedWith(page, SKY, [], CARD)).outside, `${CARD} 안의 하늘색`).toEqual([]);
    await openLinkModal(page, cardOf(page, half.name));
    expect((await paintedWith(page, PINK, [BADGE])).outside, `모달 열림: ${BADGE} 밖의 핑크`).toEqual([]);
    expect((await paintedWith(page, SKY, [], CARD)).outside, `모달 열림: ${CARD} 안의 하늘색`).toEqual([]);
    expect((await paintedWith(page, SKY, [MODAL], MODAL)).inside, "모달의 선택된 판매처 행은 하늘색 (s2-spec)").toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 일회용 학교 admin: 시안 1.17 6 상태(알림 = 프레임의 ${CARD} 수 · 그중 1장은 자동 기준 · 첫 카드는 판매처 "확인" 뒤 새 창 안내 줄)에서 프레임 6 의 컴포넌트 개수 이상`, async ({ browser }, info) => {
  const f = await fresh(info);
  const frame = frameCounts(`${SCREEN}-${info.project.name}`);
  // 시안 1.17 (d7 §18): 카드 3 · auto-threshold-badge 1 · 새 창 안내 줄의 "직접 열기" pill + 안내 박스 pill = button-pill-soft 2 · 모달 없음
  expect(frame[CARD], "프레임의 알림 카드 수").toBeGreaterThan(1);
  expect(frame[AUTO_BADGE], "프레임: 자동 기준 카드 1장").toBe(1);
  expect(frame[MODAL] ?? 0, "1.17 프레임은 모달이 닫힌 상태").toBe(0);
  expect(frame["button-pill-soft"], "프레임: 안내 박스 + 직접 열기").toBe(2);
  const made: DbReagent[] = [];
  for (let i = 0; i < frame[CARD] - frame[AUTO_BADGE]; i++) made.push(await prepReagent(f, { tag: `시안${i}`, stock: 30 - i, min: 60, unit: "g", perGroup: 10, groups: 6 }));
  // 자동(입고) 기준 시약: 등록(자동 = 첫 입고량 × 비율) 뒤 재고만 낮춘다 (service role — 사용 기록 없이 부족 상태를 만들 길이 함수에 없다)
  const autoName = `임시시약-자동-${hex()}`;
  const reg = await f.prep.rpc("register_reagent", { p_name: autoName, p_storage_class: STORAGE_CLASS, p_stock: 100, p_unit: "mL", p_intake_date: "2026-09-15", p_msds_url: null });
  expect(reg.error, `준비: register_reagent (${reg.error?.message})`).toBeNull();
  const autoId = ((Array.isArray(reg.data) ? reg.data[0] : reg.data) as { id: string }).id;
  const low = await service().from("reagents").update({ stock: 1 }).eq("id", autoId).select("min_stock_source, min_stock, stock");
  expect(low.error, `준비: 재고 낮추기 (${low.error?.message})`).toBeNull();
  const autoRow = (low.data ?? [])[0] as { min_stock_source: string; min_stock: number; stock: number };
  expect(autoRow.min_stock_source, "대조: 자동 기준").toBe("auto");
  expect(autoRow.stock < autoRow.min_stock, "대조: 자동 기준 시약이 부족").toBe(true);
  const vendor = await prepVendor(f, { note: "평균 2일 배송", website: fakeSite("a") });

  const { context, page, viewport } = await openTemp(browser, info, f.admin, REORDER_HREF);
  await stubExternal(context, info);
  try {
    await waitReorder(page);
    await expect(cards(page), CARD).toHaveCount(made.length + 1);
    await expect(cardOf(page, autoName).locator(sel(AUTO_BADGE)), "자동 기준 카드에 배지").toHaveCount(1);
    // 첫 (자동 아닌) 카드: 판매처 "확인" → 새 창 → 그 카드 안에 안내 줄
    const first = cardOf(page, made[0].name);
    await openLinkModal(page, first);
    await pickVendor(page, vendor.name);
    const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 20_000 }), confirmButton(page).click()]);
    await popup.close();
    await expect(linkDialog(page), "확인 뒤 모달 닫힘").toHaveCount(0);
    await expect(first.getByRole("status").filter({ has: directLink(page) }), "첫 카드 안 새 창 안내 줄").toHaveCount(1);
    const got = await countsOf(page, Object.keys(frame));
    for (const [name, n] of Object.entries(frame)) expect(got[name], `${viewport} ${name} ≥ 프레임 ${n}`).toBeGreaterThanOrEqual(n);
    expect(got[CARD], `${CARD} = 알림 수`).toBe(made.length + 1);
    expect(got[LINK], `${LINK} = 알림 수`).toBe(made.length + 1);
    expect(got[AUTO_BADGE], `${AUTO_BADGE} = 자동 기준 카드 수`).toBe(1);
    expect(got[MANUAL], MANUAL).toBe(1);
    expect(await countComponent(page, MODAL), `${MODAL} 닫힘`).toBe(0);
    // 6-mobile 프레임은 목록 아래 vendor-register 를 그리지 않았다(화면 밖) — admin 화면에는 1 (R3)
    expect(await countComponent(page, REGISTER), `admin ${REGISTER}`).toBe(1);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 0건
// =====================================================================

for (const who of ["teacher", "admin"] as const) {
  test(`[C1][S${SCREEN}] 일회용 학교 ${who === "admin" ? "admin" : "교사"}: 부족 시약 0건 → ${EMPTY} "${EMPTY_ALERTS}" 1 · ${CARD}·${LINK}·${BADGE}·${MODAL} 0 · ${MANUAL} 1 · ${REGISTER} ${who === "admin" ? 1 : 0}`, async ({ browser }, info) => {
    const f = await fresh(info);
    const ok = await prepReagent(f, { tag: "충분", stock: 50, min: 20, unit: "g" });
    const { context, page, response } = await openTemp(browser, info, f[who], REORDER_HREF);
    try {
      expect(response?.status(), "응답").toBe(200);
      await waitReorder(page);
      await expect(emptyCard(page), EMPTY).toHaveCount(1);
      await expect(emptyCard(page).getByText(exact(EMPTY_ALERTS)), `"${EMPTY_ALERTS}"`).toHaveCount(1);
      await expect(emptyCard(page)).toBeVisible();
      const got = await countsOf(page, [CARD, LINK, BADGE, MODAL, MANUAL, REGISTER, EMPTY]);
      expect(got, "0건 상태 개수").toEqual({ [CARD]: 0, [LINK]: 0, [BADGE]: 0, [MODAL]: 0, [MANUAL]: 1, [REGISTER]: who === "admin" ? 1 : 0, [EMPTY]: 1 });
      expect((await page.locator("main").innerText()).includes(ok.name), "부족하지 않은 시약 미표시").toBe(false);
      expect((await paintedWith(page, PINK, [])).outside, "0건 화면에 핑크 없음").toEqual([]);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// C1 — 판매처 연결 모달
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 교사: 판매처 연결 모달 — 행 = 우리 학교 판매처 먼저 → 공통 ${COMMON_SEED.length}곳 · 행 = 판매처명 + 부가 정보 · 웹사이트 없는 판매처 → "확인" 비활성 + 연락처 안내(새 창 없음) · 공통 판매처 "확인" → 새 창 = 검색 주소(d7 §11) / 학교 판매처 → website · 모달 닫힘 · "${DIRECT_OPEN}"(href·target=_blank·rel noopener) · Esc·취소·같은 버튼으로 닫힘 + 포커스 복귀 · 쓰기 요청 0건 · DB 불변`, async ({ browser }, info) => {
  const f = await fresh(info);
  const reagent = await prepReagent(f, { tag: "모달", stock: 3, min: 12, unit: "g" });
  const other = await prepReagent(f, { tag: "모달둘", stock: 9, min: 12, unit: "g" });
  const withSite = await prepVendor(f, { contact: "043-000-1111", note: "시약·실험 기구", website: fakeSite("with") }, "사이트있음");
  const phoneOnly = await prepVendor(f, { contact: "043-000-2222" }, "전화만");
  const bare = await prepVendor(f, {}, "정보없음");
  const school = [withSite, phoneOnly, bare];
  const vendorsBefore = await vendorsBySchool(f.school.id);

  const { context, page } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  const stub = await stubExternal(context, info);
  const writes = watchWrites(page);
  try {
    await waitReorder(page);
    const reagentsBefore = await ownReagentsOf((await browserClient(page)).client);
    const card = cardOf(page, reagent.name);
    await expect(card, "대상 카드").toHaveCount(1);
    const button = linkButton(card);

    // 구성·순서
    let dlg = await openLinkModal(page, card);
    await expect(dlg.getByText(exact(`판매처 · ${reagent.name}`)), `"판매처 · ${reagent.name}"`).toHaveCount(1);
    const options = await readOptions(page);
    const names = options.map((o) => o.lines[0]);
    expect(names.length, "행 수 = 학교 판매처 + 공통").toBe(school.length + COMMON_SEED.length);
    expect(names.slice(0, school.length).sort(), "앞쪽 = 우리 학교 판매처").toEqual(school.map((v) => v.name).sort());
    expect(names.slice(school.length).sort(), "뒤쪽 = 공통 목록").toEqual([...COMMON_NAMES].sort());
    expect(options[names.indexOf(withSite.name)].lines, "행 = 판매처명 + 부가 정보").toEqual([withSite.name, infoOf(withSite)]);
    expect(options[names.indexOf(phoneOnly.name)].lines, "행 = 판매처명 + 부가 정보(연락처)").toEqual([phoneOnly.name, infoOf(phoneOnly)]);
    expect(options[names.indexOf(bare.name)].lines, "부가 정보가 없는 행은 판매처명만").toEqual([bare.name]);
    await expect(cancelButton(page), '"취소"').toHaveCount(1);
    await expect(confirmButton(page), '"확인"').toHaveCount(1);

    // 웹사이트 없는 판매처
    await pickVendor(page, phoneOnly.name);
    await expect(confirmButton(page), "웹사이트 없는 판매처 → 확인 비활성").toBeDisabled();
    await expect(dlg.getByRole("status").filter({ hasText: phoneOnly.contact! }), "연락처 안내").toHaveCount(1);
    await expect(dlg.getByRole("status").filter({ hasText: phoneOnly.contact! })).toBeVisible();
    const pagesBefore = context.pages().length;
    await confirmButton(page).click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(800);
    expect(context.pages().length, "비활성 확인을 눌러도 새 창 없음").toBe(pagesBefore);
    await expect(dlg, "모달은 그대로").toBeVisible();
    await pickVendor(page, bare.name);
    await expect(confirmButton(page), "웹사이트·연락처 없는 판매처 → 확인 비활성").toBeDisabled();

    // 새 창: 공통 판매처 → 검색 주소(d7 §11 검색어 자동 입력, {q} = 카드 시약 이름) / 학교 판매처 → website (search_url 없음)
    for (const pick of [
      { name: COMMON_SEED[0].name, url: searchHref(commonSearchOf(COMMON_SEED[0].name), reagent.name), what: "공통 판매처 검색 주소" },
      { name: withSite.name, url: hrefOf(withSite.website!), what: "학교 판매처 website" },
    ]) {
      dlg = await openLinkModal(page, card);
      await pickVendor(page, pick.name);
      await expect(confirmButton(page), `${pick.name}: 확인 활성`).toBeEnabled();
      const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 20_000 }), confirmButton(page).click()]);
      await popup.waitForURL((u) => u.href !== "about:blank", { timeout: 20_000 });
      expect(popup.url(), `${pick.name}: 새 창 주소 = ${pick.what}`).toBe(pick.url);
      expect(await popup.evaluate(() => window.opener), "새 창은 opener 없음 (noopener)").toBeNull();
      await popup.close();
      await expect(linkDialog(page), "확인 뒤 모달 닫힘").toHaveCount(0);
      expect(new URL(page.url()).pathname, "화면은 그대로").toBe(REORDER_HREF);
      const direct = directLink(page);
      await expect(direct, `"${DIRECT_OPEN}" 링크`).toHaveCount(1);
      expect(new URL((await direct.getAttribute("href"))!).href, `"${DIRECT_OPEN}" href = 새 창 주소`).toBe(pick.url);
      await expect(direct).toHaveAttribute("target", "_blank");
      expect(((await direct.getAttribute("rel")) ?? "").split(/\s+/), `"${DIRECT_OPEN}" rel`).toContain("noopener");
      await expect(page.getByRole("status").filter({ has: direct }), "안내 줄에 판매처명").toContainText(pick.name);
    }
    const allowedHosts = [commonSearchOf(COMMON_SEED[0].name), withSite.website!].map((w) => new URL(w).host);
    expect(stub.hits().filter((u) => !allowedHosts.includes(new URL(u).host)), "고르지 않은 주소로의 요청 0").toEqual([]);

    // 닫기 3가지 + 포커스 복귀
    await openLinkModal(page, card);
    await page.keyboard.press("Escape");
    await expect(linkDialog(page), "Esc 로 닫힘").toHaveCount(0);
    await expect(button, "Esc 뒤 포커스 = 누른 버튼").toBeFocused();
    await openLinkModal(page, card);
    await cancelButton(page).click();
    await expect(linkDialog(page), "취소로 닫힘").toHaveCount(0);
    await expect(button, "취소 뒤 포커스 = 누른 버튼").toBeFocused();
    await openLinkModal(page, card);
    await button.click();
    await expect(linkDialog(page), "같은 버튼을 다시 눌러 닫힘").toHaveCount(0);

    // 다른 카드의 모달은 그 시약 이름으로
    const dlg2 = await openLinkModal(page, cardOf(page, other.name));
    await expect(dlg2.getByText(exact(`판매처 · ${other.name}`))).toHaveCount(1);
    await expect(modal(page), "모달은 한 번에 하나").toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);

    // 저장 없음
    expect(writes.list(), "쓰기 요청 0건").toEqual([]);
    expect(await vendorsBySchool(f.school.id), "판매처 불변").toEqual(vendorsBefore);
    expect(await ownReagentsOf((await browserClient(page)).client), "시약 불변").toEqual(reagentsBefore);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C2
// =====================================================================

test(`[C2][S${SCREEN}] 일회용 학교 교사(알림 5건): 390 tab-bar 1·tab-item ${rules.tab_bar.items}·활성 "시약" / 1440 = 0 · 모바일: 목록 끝이 tab-bar 에 가려지지 않음 · 마지막 카드에서 연 시트 아래 끝 ≤ tab-bar 위쪽 선 · 시트가 떠 있어도 누른 버튼·마지막 카드가 시트 위에 보임`, async ({ browser }, info) => {
  const f = await fresh(info);
  const made: DbReagent[] = [];
  for (let i = 0; i < 5; i++) made.push(await prepReagent(f, { tag: `줄${i}`, stock: 1 + i, min: 10, unit: "g" }));
  await prepVendor(f, { contact: "043-000-3333", website: fakeSite("c2") });
  const { context, page, viewport } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  try {
    await waitReorder(page);
    await expect(cards(page)).toHaveCount(made.length);
    await expectTabBar(page, viewport, SCREEN, "모달 닫힘");
    const last = cards(page).last();
    const vp = page.viewportSize()!;

    await scrollToEnd(page);
    const limit = viewport === "mobile" ? await tabBarTop(page) : vp.height;
    expect((await boxOf(last)).bottom, "끝까지 내리면 마지막 카드 아래 끝 ≤ tab-bar 위쪽 선(모바일)·화면 아래(데스크탑)").toBeLessThanOrEqual(limit + 0.5);
    expect(await onTop(linkButton(last)), "마지막 카드의 버튼이 가려지지 않음").toBe(true);

    const dlg = await openLinkModal(page, last);
    await expectTabBar(page, viewport, SCREEN, "모달 열림");
    const sheet = await boxOf(dlg);
    expect(sheet.top, "모달 위 끝이 화면 안").toBeGreaterThanOrEqual(0);
    expect(sheet.bottom, "모달 아래 끝 ≤ tab-bar 위쪽 선(모바일)·화면 아래(데스크탑)").toBeLessThanOrEqual(limit + 0.5);
    expect(await onTop(confirmButton(page)), '"확인" 이 가려지지 않음').toBe(true);
    expect(await onTop(cancelButton(page)), '"취소" 가 가려지지 않음').toBe(true);
    if (viewport === "mobile") {
      expect(Math.round(sheet.width), "모바일 시트 전폭").toBe(vp.width);
      expect(Math.abs(sheet.bottom - limit), "모바일 시트는 tab-bar 위쪽 선에 붙는다").toBeLessThanOrEqual(1.5);
      // 누른 버튼이 시트에 가려지지 않는다
      await expect.poll(async () => (await boxOf(linkButton(last))).bottom, { message: "누른 버튼 아래 끝 ≤ 시트 위 끝", timeout: 5_000 }).toBeLessThanOrEqual(sheet.top + 0.5);
      expect(await onTop(linkButton(last)), "누른 버튼이 시트에 덮이지 않음").toBe(true);
      // 시트가 떠 있어도 끝까지 내리면 마지막 카드가 시트 위에 다 보인다
      await scrollToEnd(page);
      expect((await boxOf(last)).bottom, "시트 열림: 마지막 카드 아래 끝 ≤ 시트 위 끝").toBeLessThanOrEqual((await boxOf(dlg)).top + 0.5);
    } else {
      expect(sheet.right, "모달 오른쪽 끝이 화면 안").toBeLessThanOrEqual(vp.width + 0.5);
    }
  } finally {
    await context.close();
  }
});

// =====================================================================
// R-ui
// =====================================================================

test(`[R-ui][S${SCREEN}] 일회용 학교(부족 시약·판매처 있음): 학생 ${REORDER_HREF} → ${HOME_HREF} (3xx · 본문에 그 학교 시약명·판매처명·공통 판매처명·"${BASIS_WORD}" 없음 · 홈에 ${CARD}·${LINK}·${MANUAL} 0·${REORDER_HREF} 링크 0) · 교사 ${REGISTER} 0 · admin ${REGISTER} 1`, async ({ browser }, info) => {
  const f = await fresh(info);
  const reagent = await prepReagent(f, { tag: "역할", stock: 2, min: 9, unit: "g" });
  const vendor = await prepVendor(f, { contact: "043-000-4444", website: fakeSite("role") });

  const student = await openTemp(browser, info, f.student, REORDER_HREF);
  try {
    await student.page.waitForURL((u) => u.pathname === HOME_HREF, { timeout: 30_000 });
    await expect(student.page.locator(sel("home-summary")).first(), "홈으로 보내졌다").toBeVisible();
    expect((await browserSession(student.page)).role, "일회용 학생 역할").toBe("student");
    expect(await countsOf(student.page, [CARD, LINK, MANUAL, REGISTER, MODAL]), "학생 홈").toEqual({ [CARD]: 0, [LINK]: 0, [MANUAL]: 0, [REGISTER]: 0, [MODAL]: 0 });
    await expect(linksTo(student.page, REORDER_HREF), `학생 홈 ${REORDER_HREF} 링크`).toHaveCount(0);
    const res = await student.context.request.get(REORDER_HREF, { maxRedirects: 0 });
    expect(res.status(), "응답 코드").toBeGreaterThanOrEqual(300);
    expect(res.status(), "응답 코드").toBeLessThan(400);
    expect(locationPath(res.headers()["location"], info), "Location").toBe(HOME_HREF);
    const body = await res.text();
    for (const word of [reagent.name, vendor.name, vendor.contact!, ...COMMON_NAMES, BASIS_WORD]) expect(body.includes(word), `3xx 응답 본문에 '${word}'`).toBe(false);
    expect(await visibleVendors(student.page), "대조: 학생 세션에는 판매처가 0행 (d7 §12)").toEqual([]);
  } finally {
    await student.context.close();
  }

  for (const who of ["teacher", "admin"] as const) {
    const { context, page } = await openTemp(browser, info, f[who], REORDER_HREF);
    try {
      await waitReorder(page);
      await expect(cardOf(page, reagent.name), `${who}: 알림 카드`).toHaveCount(1);
      expect(await countComponent(page, REGISTER), `${who} ${REGISTER} (R3)`).toBe(who === "admin" ? 1 : 0);
      expect(await countComponent(page, MANUAL), `${who} ${MANUAL}`).toBe(1);
      expect(await countComponent(page, LINK), `${who} ${LINK}`).toBe(1);
    } finally {
      await context.close();
    }
  }
});

// =====================================================================
// N1-ui
// =====================================================================

/** 화면 글자(모달 열림 포함) + 응답 본문 */
async function collect(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  out["화면"] = await page.locator("body").innerText();
  if ((await cards(page).count()) > 0) {
    await openLinkModal(page, cards(page).first());
    out["화면(모달 열림)"] = await page.locator("body").innerText();
  }
  const res = await context.request.get(REORDER_HREF);
  expect(res.status(), `${REORDER_HREF} 응답`).toBe(200);
  out["응답 본문"] = await res.text();
  return out;
}

test(`[N1-ui][S${SCREEN}] 학교A 교사·admin ${REORDER_HREF}: 화면(모달 포함)·응답 본문에 다른 학교(학교B·일회용 학교·그 밖의 모든 학교)의 학교명·시약명·판매처명 0 · 학교명 종류 = rules.json distinct_school_names · 모달 판매처 = 로그인 세션에 보이는 것(공통)만`, async ({ browser }, info) => {
  const f = await fresh(info);
  const reagent = await prepReagent(f, { tag: "격리", stock: 1, min: 8, unit: "g" });
  const vendor = await prepVendor(f, { contact: "043-000-5555", website: fakeSite("iso") }, "격리판매처");
  for (const role of ["teacher", "admin"] as const) {
    const { context, page } = await openAs(browser, info, role, SCREEN);
    const writes = watchWrites(page);
    try {
      await waitReorder(page);
      const me = await browserSession(page);
      const schoolId = await ownSchoolId(page);
      expect(schoolId, "일회용 학교와 다른 학교").not.toBe(f.school.id);
      const ownReagents = await ownReagentsOf((await browserClient(page)).client);
      const visible = await visibleVendors(page);
      expect(visible.filter((v) => v.school_id !== null && v.school_id !== schoolId), "대조: 세션에 다른 학교 판매처 0행").toEqual([]);

      const others = await otherSchools(schoolId);
      const temp = others.find((o) => o.id === f.school.id);
      const schoolB = others.find((o) => o.neis === "TEST-SCHOOL-B");
      expect(temp?.reagents, "대조: 일회용 학교 시약").toEqual([reagent.name]);
      expect(temp?.vendors, "대조: 일회용 학교 판매처").toEqual([vendor.name]);
      expect(schoolB?.reagents.length, "대조: 학교 B 시약").toBeGreaterThan(0);

      const texts = await collect(page, context);
      const own = [me.schoolName, ...ownReagents.map((r) => r.name), ...visible.map((v) => v.name)];
      const compared = expectNoOtherSchool(texts, others, own);
      expect(compared[temp!.id], "대조: 일회용 학교 값 비교 수 (학교명 + 시약 + 판매처)").toBe(3);
      expect(compared[schoolB!.id], "대조: 학교 B 값 비교 수").toBeGreaterThanOrEqual(1);
      for (const [where, text] of Object.entries(texts)) {
        if (where.startsWith("화면")) checkSchoolNames(text, me.schoolName, `${role} ${where}`);
        else for (const n of schoolNamesOf(text)) expect(me.schoolName, `${role} ${where}: 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
        expect(text.includes(vendor.contact!), `${role} ${where} 에 일회용 학교 판매처 연락처`).toBe(false);
      }
      if ((await cards(page).count()) > 0) {
        expect((await optionNames(page)).sort(), `${role}: 모달 판매처 = 세션에 보이는 판매처`).toEqual(visible.map((v) => v.name).sort());
        expect(await optionNames(page), `${role}: 모달에 일회용 학교 판매처 없음`).not.toContain(vendor.name);
      }
      expect(writes.list(), "쓰기 요청 0건").toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test(`[N1-ui][S${SCREEN}] 일회용 학교 교사 ${REORDER_HREF}: 자기 학교 알림·판매처만 — 화면(모달 포함)·응답 본문에 학교 A·B·그 밖의 학교의 학교명·시약명·판매처명 0 · 학교명 1종 · 모달 판매처 = 자기 학교 + 공통만`, async ({ browser }, info) => {
  const f = await fresh(info);
  const reagent = await prepReagent(f, { tag: "격리", stock: 1, min: 8, unit: "g" });
  const vendor = await prepVendor(f, { contact: "043-000-6666", website: fakeSite("iso") }, "격리판매처");
  const { context, page } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  try {
    await waitReorder(page);
    const me = await browserSession(page);
    expect(me.schoolName, "일회용 학교").toBe(f.school.name);
    const others = await otherSchools(f.school.id);
    const schoolA = others.find((o) => o.neis === "TEST-SCHOOL-A");
    const schoolB = others.find((o) => o.neis === "TEST-SCHOOL-B");
    expect(schoolA?.reagents.length, "대조: 학교 A 시약").toBeGreaterThan(0);
    expect(schoolB?.reagents.length, "대조: 학교 B 시약").toBeGreaterThan(0);

    const texts = await collect(page, context);
    const compared = expectNoOtherSchool(texts, others, [me.schoolName, reagent.name, vendor.name, ...COMMON_NAMES]);
    expect(compared[schoolA!.id], "대조: 학교 A 값 비교 수 (학교명 + 시약)").toBeGreaterThanOrEqual(2);
    expect(compared[schoolB!.id], "대조: 학교 B 값 비교 수").toBeGreaterThanOrEqual(2);
    for (const [where, text] of Object.entries(texts)) {
      if (where.startsWith("화면")) checkSchoolNames(text, me.schoolName, where);
      else for (const n of schoolNamesOf(text)) expect(me.schoolName, `${where}: 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
    }
    expect((await readAlerts(page)).map((a) => a.name), "알림 = 자기 학교 시약만").toEqual([reagent.name]);
    const names = await optionNames(page);
    expect(names[0], "모달 맨 앞 = 자기 학교 판매처").toBe(vendor.name);
    expect(names.slice(1).sort(), "그다음 = 공통 목록").toEqual([...COMMON_NAMES].sort());
  } finally {
    await context.close();
  }
});
