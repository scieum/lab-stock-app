// 화면 11 (시약장 설정) 쓰기 흐름·빈 상태·시안 상태 — 전부 일회용 학교의 일회용 계정으로 한다.
// 기준: 디자인 run 20261004-2256 s2-spec "## 화면 11"·"## 상태 화면 11-empty"·"## 상태 화면 11-delete",
//       design/frames/11-*.json, design/rules.json (cabinet · variants 11 · roles R7 · tab_bar), harness/d7-data.md §9 (추가·이름·저장·칸 줄이기·삭제·저장 후).
//
// 공용 계정·학교 A·B·실사용 학교·데모 학교에는 쓰지 않는다 (screen-11-helpers 머리말). 테스트마다 일회용 학교를 비우고
// DB 함수(일회용 admin 세션)로 필요한 상태를 만든 뒤, 브라우저(일회용 교사·학생 세션 쿠키)의 화면과 그 화면이 보낸 요청의 결과를 본다.
// service role 은 준비·정리·대조 조회에만 쓴다. 한 워커에서 순서대로 돈다 (afterAll 정리가 다른 워커의 일회용 학교를 지우지 않게).
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { countComponent, rules, sel } from "./screen-helpers";
import { detailPath } from "./screen-3-helpers";
import { HAS_SERVICE, openTemp } from "./screen-8-helpers";
import { shellSchoolScope } from "./shell-helpers";
import {
  ADD,
  ADD_LABEL,
  CAB,
  CABINETS_HREF,
  CANCEL_BUTTON,
  CLASSES,
  DEFAULT_DOOR,
  DEFAULT_SHELVES,
  DELETE_BUTTON,
  DELETE_CAPTION,
  DOOR_SELECT,
  DOUBLE,
  EDIT,
  EMPTY,
  EMPTY_HEADING,
  expectEmptyHeading,
  incompatiblePairsIn,
  EMPTY_STAFF,
  EMPTY_STUDENT,
  EMPTY_TITLE,
  FRAME_LAYOUT,
  FRAME_LAYOUT_2,
  INPUT,
  LABEL_MAX,
  MIX,
  MIX_EXAMPLE,
  MODAL,
  NO_S11_RESIDUE,
  OUTLINE,
  PRIMARY,
  ROLE_RULES,
  ROW,
  SAVE_BUTTON,
  SCREEN,
  SHELF_SELECT,
  SINGLE,
  SLOT,
  SWITCHER,
  TOAST,
  TOAST_RENAMED,
  TOAST_SAVED,
  VARIANTS,
  addButton,
  boxOf,
  cleanup,
  dbViewByService,
  defaultName,
  deleteButton,
  deleteDialog,
  deleteNotice,
  dialogInput,
  doorRadio,
  emptyCard,
  exact,
  expectActive,
  expectBoard,
  expectHeader,
  expectMix,
  expectTabBar,
  frameCounts,
  gridKeys,
  legendChips,
  main,
  makeFixture,
  mix,
  mixLines,
  modal,
  notice,
  onTop,
  outlineIn,
  pickChips,
  pickDoor,
  pickShelves,
  pillLabels,
  pills,
  prepCabinet,
  prepLayout,
  prepPlace,
  prepReagent,
  primaryIn,
  purgeSchool,
  renameButton,
  renameDialog,
  rows,
  saveButton,
  selectSlot,
  setClasses,
  sharedCabinetSnapshot,
  shelfRadio,
  shrinkNotice,
  slots,
  squash,
  switcher,
  title,
  toast,
  toastAdded,
  toastDeleted,
  unassignedHeading,
  unassignedTitle,
  waitCabinets,
  waitEditable,
  watchActions,
  hydrated,
  ROW as ROW_NAME,
  SLOT_ASSIGN,
  SLOT_SHEET,
  FRAME_COUNTS,
  closeSlotSheet,
  expectPills,
  pill,
  slotAt,
  slotSheet,
  type DbCabinet,
  type PrepReagent,
  type S11Fixture,
} from "./screen-11-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const GROUP = "s11w";
const R7 = ROLE_RULES.R7;
/** 저장 요청 + 화면 갱신까지 기다리는 한도 (토스트는 잠깐만 떠 있으므로 뜨는 순간을 잡는다) */
const SAVE_TIMEOUT = 20_000;
const withC = (id: string) => `${CABINETS_HREF}?c=${id}`;

let before: string[] | null = null;
let fixtureCache: Promise<S11Fixture> | null = null;

function fixture(info: TestInfo): Promise<S11Fixture> {
  fixtureCache ??= makeFixture(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

/** 일회용 학교를 비운 채로 시작한다 */
async function fresh(info: TestInfo): Promise<S11Fixture> {
  test.setTimeout(360_000);
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

/** 한 번의 누름 안에서 여러 번 누른다 (연타) */
const burst = (l: Locator) =>
  l.evaluate((el) => {
    for (let i = 0; i < 3; i += 1) (el as HTMLElement).click();
  });

async function expectToast(page: Page, text: string): Promise<void> {
  await expect(toast(page).filter({ hasText: exact(text) }), `${TOAST} "${text}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
}

/** 칸 없음 시약 목록 = 기대 시약 (이름·재고+단위·"칸 없음"·상세 링크) */
async function expectUnassigned(page: Page, want: PrepReagent[], what: string): Promise<void> {
  await expect(unassignedTitle(page), `${what}: "${unassignedHeading(want.length)}"`).toHaveText(exact(unassignedHeading(want.length)), { timeout: SAVE_TIMEOUT });
  await expect(rows(page), `${what}: ${ROW} 수`).toHaveCount(want.length);
  for (const r of want) {
    const row = rows(page).filter({ hasText: r.name });
    await expect(row, `${what}: 행 "${r.name}"`).toHaveCount(1);
    const text = await row.innerText();
    expect(squash(text), `${what}: "${r.name}" 재고·단위`).toContain(`${r.stock}${r.unit}`);
    expect(text, `${what}: "${r.name}" 칸 자리 "${CAB.unassigned_label}"`).toContain(CAB.unassigned_label);
    expect(await row.getAttribute("href"), `${what}: "${r.name}" 행 → 시약 상세`).toBe(detailPath(r.id));
  }
}

/**
 * 시안 예시 상태: 1번 시약장(양문형 4단, 좌1단 = 산+염기 …, 칸별 시약 수 = s2-spec 1.15 화면 11 "좌1단 2, 좌2단 3, 우1단 1, 우3단 1")
 * · 2번 시약장(양문형 3단, 배치 시약 6) · 칸 없음 시약 2
 */
async function prepFrameState(f: S11Fixture): Promise<{ c1: DbCabinet; c2: DbCabinet; placed1: PrepReagent[]; placed2: PrepReagent[]; unassigned: PrepReagent[] }> {
  const c1 = await prepCabinet(f);
  const c2 = await prepCabinet(f);
  expect([c1.label, c2.label]).toEqual([defaultName(1), defaultName(2)]);
  await prepLayout(f, c1.id, DOUBLE, 4, FRAME_LAYOUT);
  await prepLayout(f, c2.id, DOUBLE, 3, FRAME_LAYOUT_2);
  const placed1: PrepReagent[] = [];
  for (const [key, n] of Object.entries(FRAME_COUNTS)) {
    for (let i = 0; i < n; i += 1) {
      const r = await prepReagent(f, `일번${key}${i}`, 5 + i, "g", FRAME_LAYOUT[key][0]);
      await prepPlace(f, r.id, c1.id, key);
      placed1.push(r);
    }
  }
  const placed2: PrepReagent[] = [];
  for (const key of gridKeys(DOUBLE, 3)) {
    const r = await prepReagent(f, `배치${key}`);
    await prepPlace(f, r.id, c2.id, key);
    placed2.push(r);
  }
  const unassigned = [await prepReagent(f, "칸없음가", 250, "g"), await prepReagent(f, "칸없음나", 300, "mL")];
  return { c1, c2, placed1, placed2, unassigned };
}

// =====================================================================
// 빈 상태 (11-empty) → 추가
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 교사 · 시약장 0개: "${EMPTY_HEADING}" + rules.json variants.empty(${VARIANTS.empty.join("·")}) · ${SWITCHER}·${SLOT}·${EDIT}·${MIX}·칸 없음 목록 0 → "${ADD_LABEL}" 연타 → 요청 1건 · "${defaultName(1)}" 활성 · ?c={id} · ${TOAST} · ${DEFAULT_DOOR} ${DEFAULT_SHELVES}단 칸 전부 미지정 · DB 일치`, async ({ browser }, info) => {
  const f = await fresh(info);
  // 칸 없음 시약이 있어도 빈 상태에는 목록을 두지 않는다 (s2-spec 11-empty)
  await prepReagent(f, "빈상태");
  const { context, page, viewport, response } = await openTemp(browser, info, f.teacher, CABINETS_HREF);
  const actions = watchActions(page);
  try {
    expect(response?.status()).toBe(200);
    await waitCabinets(page, "empty");
    await expectEmptyHeading(page, "교사 0개");
    for (const c of VARIANTS.empty) expect(await countComponent(page, c), `variants.empty ${c}`).toBeGreaterThanOrEqual(1);
    const frame = frameCounts(`${SCREEN}-empty-${viewport}`);
    for (const [name, n] of Object.entries(frame)) expect(await countComponent(page, name), `시안 11-empty ${name} = ${n}`).toBe(n);
    for (const c of [SWITCHER, SLOT, EDIT, MIX, ROW, MODAL, DOOR_SELECT, SHELF_SELECT, PRIMARY]) expect(await countComponent(page, c), `빈 상태 ${c}`).toBe(0);
    await expect(unassignedTitle(page), "빈 상태에 칸 없음 목록 없음").toHaveCount(0);
    const card = emptyCard(page);
    await expect(card.getByText(exact(EMPTY_TITLE))).toBeVisible();
    await expect(card.getByText(exact(EMPTY_STAFF))).toBeVisible();
    await expect(card.locator(sel(ADD)), `${ADD} 는 카드 안`).toHaveCount(1);
    await expect(card.locator(sel(ADD))).toContainText(ADD_LABEL);
    await expect(shellSchoolScope(page, viewport), "셸(390 nav-pill / 1440 app-sidebar) 학교명").toContainText(f.school.name);
    await expectTabBar(page, viewport, "빈 상태");
    expect(await dbViewByService(f.school.id)).toMatchObject({ cabinets: [] });

    // 추가 (연타)
    const add = addButton(page);
    await hydrated(add);
    await burst(add);
    await expectToast(page, toastAdded(defaultName(1)));
    await waitEditable(page);
    await expect.poll(async () => (await dbViewByService(f.school.id)).cabinets.length, { timeout: SAVE_TIMEOUT }).toBe(1);
    const db = await dbViewByService(f.school.id);
    const cab = db.cabinets[0];
    expect(cab, "DB: 첫 시약장").toMatchObject({ label: defaultName(1), door_type: DEFAULT_DOOR, shelves: DEFAULT_SHELVES });
    expect(Object.values(db.classes[cab.id]).flat(), "DB: 칸 전부 미지정").toEqual([]);
    expect(actions.count(), "연타에도 추가 요청 1건").toBe(1);
    await expect.poll(() => new URL(page.url()).searchParams.get("c"), { message: "주소의 c = 새 시약장", timeout: SAVE_TIMEOUT }).toBe(cab.id);
    expect(await pillLabels(page)).toEqual([defaultName(1)]);
    expect(cab.number, "DB: 첫 시약장 번호 1 (d7 §14)").toBe(1);
    await expectPills(page, db.cabinets, "추가 뒤");
    await expectActive(page, defaultName(1), "추가 뒤", cab.number);
    await expectHeader(page, defaultName(1), DEFAULT_DOOR, DEFAULT_SHELVES, "추가 뒤", cab.number);
    await expectBoard(page, DEFAULT_DOOR, DEFAULT_SHELVES, {}, "추가 뒤 (전부 미지정)");
    await expect(mix(page)).toHaveCount(0);
    await expect(emptyCard(page), "빈 상태 카드는 사라진다").toHaveCount(0);
    await expect(page.locator(sel(ADD)), `${ADD} 는 전환 줄 끝에 1개`).toHaveCount(1);
    await expect(switcher(page).locator(sel(ADD))).toHaveCount(1);
    await expect(doorRadio(page, DEFAULT_DOOR)).toBeChecked();
    await expect(shelfRadio(page, DEFAULT_SHELVES)).toBeChecked();
    await expect(saveButton(page), "새 시약장: 바뀐 것이 없다").toBeDisabled();
    // 시약은 그대로 칸 없음
    await expect(unassignedTitle(page)).toHaveText(exact(unassignedHeading(1)));
    await expectTabBar(page, viewport, "추가 뒤");
  } finally {
    await context.close();
  }
});

test(`[R-ui][S${SCREEN}] 일회용 학생 · 시약장 0개: ${EMPTY} 에 "${EMPTY_STUDENT}" · ${R7.components!.join("·")} 0 (R7) · 추가 안내 문구·버튼 없음 · 쓰기 요청 0건`, async ({ browser }, info) => {
  const f = await fresh(info);
  const { context, page, viewport, response } = await openTemp(browser, info, f.student, CABINETS_HREF);
  const actions = watchActions(page);
  try {
    expect(response?.status()).toBe(200);
    await waitCabinets(page, "empty");
    await expectEmptyHeading(page, "학생 0개");
    await expect(emptyCard(page)).toHaveCount(1);
    await expect(emptyCard(page).getByText(exact(EMPTY_TITLE))).toBeVisible();
    await expect(emptyCard(page).getByText(exact(EMPTY_STUDENT))).toBeVisible();
    await expect(page.getByText(EMPTY_STAFF), "학생에게 추가 안내 문구 없음").toHaveCount(0);
    for (const c of R7.components!) {
      expect(await countComponent(page, c), `R7 ${c}`).toBe(R7.max);
      expect(await response!.text(), `응답 본문에 ${c}`).not.toContain(`data-component="${c}"`);
    }
    await expect(main(page).getByRole("button"), "학생 빈 상태에 버튼 없음").toHaveCount(0);
    for (const c of [SWITCHER, SLOT, MIX, ROW, MODAL, PRIMARY, OUTLINE]) expect(await countComponent(page, c), `학생 빈 상태 ${c}`).toBe(0);
    await expectTabBar(page, viewport, "학생 빈 상태");
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
    expect((await dbViewByService(f.school.id)).cabinets).toHaveLength(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 설정 저장
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 교사: 칸 분류 지정(여러 칸·여러 분류) → "${SAVE_BUTTON}" 연타 → 요청 1건 · ${TOAST} "${TOAST_SAVED}"(390: tab-bar 위) · 저장 뒤 비활성 · 새로고침 후 유지 · DB 일치(규칙 순서) · 비호환 조합도 저장됨(경고만) · 문 형태·단 수 저장`, async ({ browser }, info) => {
  const f = await fresh(info);
  const cab = await prepCabinet(f);
  const { context, page, viewport } = await openTemp(browser, info, f.teacher, CABINETS_HREF);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    await expectBoard(page, DEFAULT_DOOR, DEFAULT_SHELVES, {}, "처음");
    await expect(saveButton(page)).toBeDisabled();

    const want: Record<string, string[]> = { L1: ["염기", "산"], R2: ["무기염"], L4: ["기타", "유기", "독성"] };
    for (const [key, classes] of Object.entries(want)) {
      await selectSlot(page, DEFAULT_DOOR, key);
      await setClasses(page, classes);
    }
    await expectBoard(page, DEFAULT_DOOR, DEFAULT_SHELVES, want, "저장 전");
    await expectMix(page, DEFAULT_DOOR, DEFAULT_SHELVES, want, "저장 전");
    expect(Object.values((await dbViewByService(f.school.id)).classes[cab.id]).flat(), "저장 전에는 DB 가 그대로").toEqual([]);
    expect(actions.count(), "저장 전 쓰기 요청 0건").toBe(0);

    await expect(saveButton(page)).toBeEnabled();
    await burst(saveButton(page));
    await expectToast(page, TOAST_SAVED);
    if (viewport === "mobile") {
      const bar = await boxOf(page.locator(sel(rules.tab_bar.component)));
      expect((await boxOf(toast(page))).bottom, "토스트는 tab-bar 위에 뜬다").toBeLessThanOrEqual(bar.top + 0.5);
    }
    await expect(saveButton(page), "저장 뒤에는 바뀐 것이 없다").toBeDisabled({ timeout: SAVE_TIMEOUT });
    expect(actions.count(), "연타에도 저장 요청 1건").toBe(1);
    const sorted = Object.fromEntries(Object.entries(want).map(([k, v]) => [k, CLASSES.filter((c) => v.includes(c))]));
    let db = await dbViewByService(f.school.id);
    expect(db.cabinets[0]).toMatchObject({ id: cab.id, door_type: DEFAULT_DOOR, shelves: DEFAULT_SHELVES, label: defaultName(1) });
    expect(Object.fromEntries(Object.entries(db.classes[cab.id]).filter(([, v]) => v.length > 0)), "DB 칸 분류 (규칙 순서)").toEqual(sorted);
    expect(Object.keys(db.classes[cab.id]).sort(), "DB 칸 행 = 격자").toEqual(gridKeys(DEFAULT_DOOR, DEFAULT_SHELVES).sort());
    await expectBoard(page, DEFAULT_DOOR, DEFAULT_SHELVES, want, "저장 뒤");
    await expectMix(page, DEFAULT_DOOR, DEFAULT_SHELVES, want, "저장 뒤");

    await page.reload();
    await waitEditable(page);
    await expectBoard(page, DEFAULT_DOOR, DEFAULT_SHELVES, want, "새로고침 뒤");
    await expectMix(page, DEFAULT_DOOR, DEFAULT_SHELVES, want, "새로고침 뒤");
    await expect(mixLines(page)).toHaveText(exact(MIX_EXAMPLE));
    await expect(saveButton(page)).toBeDisabled();

    // 문 형태·단 수 저장 (배치 시약이 없으므로 안내 없음)
    await pickDoor(page, SINGLE);
    await pickShelves(page, 3);
    await expect(notice(page), "배치 시약이 없으면 칸 줄이기 안내 없음").toHaveCount(0);
    await expect(saveButton(page)).toBeEnabled();
    await saveButton(page).click();
    await expectToast(page, TOAST_SAVED);
    await expect(saveButton(page)).toBeDisabled({ timeout: SAVE_TIMEOUT });
    expect(actions.count(), "저장 요청 2건째").toBe(2);
    db = await dbViewByService(f.school.id);
    expect(db.cabinets[0]).toMatchObject({ id: cab.id, door_type: SINGLE, shelves: 3 });
    expect(Object.keys(db.classes[cab.id]).sort(), "DB 칸 행 = 줄어든 격자").toEqual(gridKeys(SINGLE, 3).sort());
    expect(db.classes[cab.id].L1, "남은 칸의 분류는 그대로").toEqual(sorted.L1);
    await page.reload();
    await waitEditable(page);
    await expectHeader(page, defaultName(1), SINGLE, 3, "문 형태·단 수 저장 뒤");
    await expectBoard(page, SINGLE, 3, { L1: want.L1 }, "문 형태·단 수 저장 뒤");
    await expect(doorRadio(page, SINGLE)).toBeChecked();
    await expect(shelfRadio(page, 3)).toBeChecked();
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 일회용 교사 칸 줄이기: "${shrinkNotice(0).replace("0", "N")}" 의 N = 사라지는 칸에 배치된 시약 수(단문형·3단·둘 다) · 줄이지 않으면 안내 없음 · 저장 → 그 시약들이 "칸 없음 시약" 목록에 · DB slot_id null · 시약 행·재고 그대로`, async ({ browser }, info) => {
  const f = await fresh(info);
  const cab = await prepCabinet(f);
  await prepLayout(f, cab.id, DOUBLE, 4, FRAME_LAYOUT);
  const at: Record<string, PrepReagent[]> = { L1: [], R1: [], L4: [], R4: [] };
  for (const [key, n] of [["L1", 1], ["R1", 2], ["L4", 1], ["R4", 1]] as const) {
    for (let i = 0; i < n; i += 1) {
      const r = await prepReagent(f, `${key}-${i}`, 10 + i, "mL");
      await prepPlace(f, r.id, cab.id, key);
      at[key].push(r);
    }
  }
  const loose = await prepReagent(f, "원래칸없음", 3, "병");
  const count = (keys: string[]) => keys.reduce((n, k) => n + at[k].length, 0);
  const { context, page } = await openTemp(browser, info, f.teacher, CABINETS_HREF);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    await expectUnassigned(page, [loose], "처음");
    await expect(notice(page), "처음에는 안내 없음").toHaveCount(0);

    await pickDoor(page, SINGLE);
    await expect(notice(page), "단문형: 오른쪽 칸의 시약").toHaveText(exact(shrinkNotice(count(["R1", "R4"]))));
    await pickShelves(page, 3);
    await expect(notice(page), "단문형 3단").toHaveText(exact(shrinkNotice(count(["R1", "R4", "L4"]))));
    await pickDoor(page, DOUBLE);
    await expect(notice(page), "양문형 3단: 4단 칸의 시약").toHaveText(exact(shrinkNotice(count(["L4", "R4"]))));
    await pickShelves(page, 4);
    await expect(notice(page), "원래대로면 안내 없음").toHaveCount(0);
    // 분류만 바꾸는 편집에는 안내 없음
    await selectSlot(page, DOUBLE, "R2");
    await setClasses(page, ["기타"]);
    await expect(saveButton(page)).toBeEnabled();
    await expect(notice(page), "칸이 줄지 않으면 안내 없음").toHaveCount(0);
    await setClasses(page, FRAME_LAYOUT.R2);

    await pickDoor(page, SINGLE);
    await pickShelves(page, 3);
    const gone = [...at.R1, ...at.R4, ...at.L4];
    await expect(notice(page)).toHaveText(exact(shrinkNotice(gone.length)));
    // 안내는 저장 버튼 위
    expect((await boxOf(notice(page))).bottom, "안내는 저장 버튼 위").toBeLessThanOrEqual((await boxOf(saveButton(page))).top);
    const beforeSave = await dbViewByService(f.school.id);
    expect(beforeSave.unassigned.map((r) => r.id), "저장 전에는 DB 배치가 그대로").toEqual([loose.id]);
    expect(actions.count(), "저장 전 쓰기 요청 0건").toBe(0);

    await saveButton(page).click();
    await expectToast(page, TOAST_SAVED);
    await expect(saveButton(page)).toBeDisabled({ timeout: SAVE_TIMEOUT });
    expect(actions.count(), "저장 요청 1건").toBe(1);
    const db = await dbViewByService(f.school.id);
    expect(db.cabinets[0]).toMatchObject({ id: cab.id, door_type: SINGLE, shelves: 3 });
    expect(db.unassigned.map((r) => r.id).sort(), "DB: 사라진 칸의 시약 slot_id = null").toEqual([loose, ...gone].map((r) => r.id).sort());
    expect(db.placed[cab.id], "DB: 남은 칸의 시약은 그대로 배치").toBe(at.L1.length);
    expect(db.reagentNames.length, "시약 행은 지워지지 않는다").toBe(beforeSave.reagentNames.length);
    for (const r of gone) expect(db.unassigned.find((x) => x.id === r.id), `"${r.name}" 재고·단위 그대로`).toMatchObject({ stock: r.stock, unit: r.unit });
    expect(Object.keys(db.classes[cab.id]).sort()).toEqual(gridKeys(SINGLE, 3).sort());
    for (const k of gridKeys(SINGLE, 3)) expect(db.classes[cab.id][k], `남은 칸 ${k} 분류 그대로`).toEqual(CLASSES.filter((c) => FRAME_LAYOUT[k].includes(c)));

    await expect(notice(page), "저장 뒤 안내 없음").toHaveCount(0);
    await expectUnassigned(page, [loose, ...gone], "저장 뒤");
    await expectHeader(page, defaultName(1), SINGLE, 3, "저장 뒤");
    await expectBoard(page, SINGLE, 3, Object.fromEntries(gridKeys(SINGLE, 3).map((k) => [k, FRAME_LAYOUT[k]])), "저장 뒤");
    await page.reload();
    await waitEditable(page);
    await expectUnassigned(page, [loose, ...gone], "새로고침 뒤");
    await expect(notice(page)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 이름 바꾸기
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 교사 이름 바꾸기: 시트(글자 수 · 비면 비활성) · 같은 이름이면 오류가 시트 안에·시트 유지·DB 그대로 · 새 이름 "${SAVE_BUTTON}" 연타 → 요청 1건 · 시트 닫힘 · pill·제목 갱신 · ${TOAST} "${TOAST_RENAMED}" · 앞뒤 공백 제거 · DB 일치`, async ({ browser }, info) => {
  const f = await fresh(info);
  const c1 = await prepCabinet(f);
  const c2 = await prepCabinet(f);
  const { context, page } = await openTemp(browser, info, f.teacher, withC(c1.id));
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    await expectActive(page, c1.label, "처음");
    await renameButton(page).click();
    const dialog = renameDialog(page);
    await expect(dialog).toBeVisible();
    await expect(modal(page)).toHaveCount(1);
    await expect(dialogInput(page)).toHaveValue(c1.label);
    await expect(dialog).toContainText(new RegExp(`${[...c1.label].length}\\s*/\\s*${LABEL_MAX}`));
    const save = primaryIn(dialog, SAVE_BUTTON);
    await dialogInput(page).fill("");
    await expect(save, "비면 비활성").toBeDisabled();
    await expect(dialog).toContainText(new RegExp(`0\\s*/\\s*${LABEL_MAX}`));

    // 같은 학교에 같은 이름 불가 (d7 §9) — 오류는 시트 안, 시트는 열린 채
    await dialogInput(page).fill(c2.label);
    await expect(save).toBeEnabled();
    await save.click();
    const alert = dialog.getByRole("alert");
    await expect(alert, "오류 안내는 시트 안").toBeVisible({ timeout: SAVE_TIMEOUT });
    expect((await alert.innerText()).trim().length, "오류 문구").toBeGreaterThan(0);
    await expect(dialog, "오류 뒤에도 시트는 열려 있다").toBeVisible();
    await expect(dialogInput(page), "입력한 값이 남는다").toHaveValue(c2.label);
    await expect(toast(page).filter({ hasText: TOAST_RENAMED }), "실패에는 토스트 없음").toHaveCount(0);
    expect((await dbViewByService(f.school.id)).cabinets.map((c) => c.label), "DB 이름 그대로").toEqual([c1.label, c2.label]);
    expect(await pillLabels(page)).toEqual([c1.label, c2.label]);
    const failed = actions.count();
    expect(failed, "중복 이름 요청 1건").toBe(1);

    // 새 이름 (앞뒤 공백은 떼고 저장)
    const name = "화학 준비실 시약장";
    await dialogInput(page).fill(`  ${name}  `);
    await expect(save).toBeEnabled();
    await burst(save);
    await expectToast(page, TOAST_RENAMED);
    await expect(modal(page), "성공하면 시트가 닫힌다").toHaveCount(0);
    expect(actions.count() - failed, "연타에도 이름 요청 1건").toBe(1);
    await expect.poll(async () => (await dbViewByService(f.school.id)).cabinets.map((c) => c.label), { timeout: SAVE_TIMEOUT }).toEqual([name, c2.label]);
    await expect(title(page, name), "제목 갱신").toBeVisible({ timeout: SAVE_TIMEOUT });
    await expect(title(page, c1.label), "예전 이름 제목 없음").toHaveCount(0);
    await expect.poll(() => pillLabels(page), { message: "pill 갱신", timeout: SAVE_TIMEOUT }).toEqual([name, c2.label]);
    await expectActive(page, name, "이름을 바꾼 뒤");
    expect(new URL(page.url()).searchParams.get("c"), "보고 있던 시약장 그대로").toBe(c1.id);
    const db = await dbViewByService(f.school.id);
    expect(db.cabinets.find((c) => c.id === c1.id), "문 형태·단 수는 그대로").toMatchObject({ door_type: c1.door_type, shelves: c1.shelves });

    // 다시 열면 새 이름이 들어 있고, 최대 길이까지 쓸 수 있다 (앞 토스트가 사라진 뒤에 — 같은 문구의 새 토스트를 본다)
    await expect(toast(page)).toHaveCount(0, { timeout: SAVE_TIMEOUT });
    await renameButton(page).click();
    await expect(dialogInput(page)).toHaveValue(name);
    const longest = "가".repeat(LABEL_MAX);
    await dialogInput(page).fill(`${longest}나다`);
    expect([...(await dialogInput(page).inputValue())].length, `입력은 ${LABEL_MAX}자까지`).toBeLessThanOrEqual(LABEL_MAX);
    await dialogInput(page).fill(longest);
    await expect(renameDialog(page)).toContainText(new RegExp(`${LABEL_MAX}\\s*/\\s*${LABEL_MAX}`));
    await primaryIn(renameDialog(page), SAVE_BUTTON).click();
    await expectToast(page, TOAST_RENAMED);
    await expect(modal(page)).toHaveCount(0);
    await expect.poll(async () => (await dbViewByService(f.school.id)).cabinets.map((c) => c.label), { timeout: SAVE_TIMEOUT }).toEqual([longest, c2.label]);
    await expect(title(page, longest)).toBeVisible({ timeout: SAVE_TIMEOUT });
    // 긴 이름에도 가로로 넘치지 않는다
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "가로 스크롤 없음").toBe(true);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 두 번째 추가 → 삭제 확인(11-delete) → 삭제 → 마지막 삭제 → 빈 상태
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 교사: 두 번째 추가 "${defaultName(2)}" → 삭제 확인(rules.json variants.delete · 배치 시약 수 = DB · "${DELETE_CAPTION}" · 뒤 컨트롤 비활성 · "${CANCEL_BUTTON}" 은 요청 0건) → "${DELETE_BUTTON}" 연타 → 요청 1건 · ${TOAST} · pill 에서 빠짐 · 남은 시약장 활성 · 배치 시약이 칸 없음으로(행·재고 그대로) → 마지막 시약장 삭제 → 빈 상태`, async ({ browser }, info) => {
  const f = await fresh(info);
  const c1 = await prepCabinet(f);
  await prepLayout(f, c1.id, DOUBLE, 4, FRAME_LAYOUT);
  const inFirst = await prepReagent(f, "첫시약장", 40, "g");
  await prepPlace(f, inFirst.id, c1.id, "L2");
  const loose = await prepReagent(f, "칸없음", 5, "병");
  const { context, page, viewport } = await openTemp(browser, info, f.teacher, CABINETS_HREF);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    await expectActive(page, c1.label, "처음");

    // 두 번째 추가
    await burst(addButton(page));
    await expectToast(page, toastAdded(defaultName(2)));
    await expect.poll(() => pillLabels(page), { timeout: SAVE_TIMEOUT }).toEqual([defaultName(1), defaultName(2)]);
    expect(actions.count(), "연타에도 추가 요청 1건").toBe(1);
    let db = await dbViewByService(f.school.id);
    expect(db.cabinets.map((c) => c.label)).toEqual([defaultName(1), defaultName(2)]);
    const c2 = db.cabinets[1];
    expect(c2).toMatchObject({ door_type: DEFAULT_DOOR, shelves: DEFAULT_SHELVES });
    await expect.poll(() => new URL(page.url()).searchParams.get("c"), { timeout: SAVE_TIMEOUT }).toBe(c2.id);
    await expectActive(page, defaultName(2), "추가 뒤 새 시약장이 활성");
    await expectHeader(page, defaultName(2), DEFAULT_DOOR, DEFAULT_SHELVES, "추가 뒤");
    await expectBoard(page, DEFAULT_DOOR, DEFAULT_SHELVES, {}, "새 시약장은 전부 미지정");
    expect(db.classes[c1.id].L1, "첫 시약장은 그대로").toEqual(CLASSES.filter((c) => FRAME_LAYOUT.L1.includes(c)));

    // 준비: 2번 시약장에 시약 2종 배치
    const inSecond = [await prepReagent(f, "둘째가", 11, "mL"), await prepReagent(f, "둘째나", 12, "g")];
    await prepPlace(f, inSecond[0].id, c2.id, "L2");
    await prepPlace(f, inSecond[1].id, c2.id, "R3");
    await page.goto(withC(c2.id));
    await waitEditable(page);
    await expectUnassigned(page, [loose], "삭제 전");
    const base = actions.count();

    // 삭제 확인 → 취소
    await deleteButton(page).click();
    let dialog = deleteDialog(page);
    await expect(dialog).toBeVisible();
    await expect(modal(page)).toHaveCount(1);
    for (const c of VARIANTS.delete) expect(await countComponent(page, c), `variants.delete ${c}`).toBeGreaterThanOrEqual(1);
    await expect(switcher(page)).toBeVisible();
    await expectActive(page, defaultName(2), "삭제 확인 뒤의 활성 pill");
    await expect(dialog.getByText(exact(deleteNotice(inSecond.length))), "배치 시약 수 = DB").toBeVisible();
    await expect(dialog.getByText(exact(DELETE_CAPTION))).toBeVisible();
    await expect(addButton(page), "열린 동안 추가 비활성").toBeDisabled();
    await expect(renameButton(page)).toBeDisabled();
    await expect(deleteButton(page)).toBeDisabled();
    for (const d of CAB.door_types) await expect(doorRadio(page, d)).toBeDisabled();
    expect(await slots(page).evaluateAll((els) => els.every((e) => (e as HTMLButtonElement).disabled)), "열린 동안 칸 비활성").toBe(true);
    await expectTabBar(page, viewport, "삭제 확인");
    await outlineIn(dialog, CANCEL_BUTTON).click();
    await expect(modal(page)).toHaveCount(0);
    expect(actions.count() - base, "취소는 요청 0건").toBe(0);
    expect((await dbViewByService(f.school.id)).cabinets.map((c) => c.id), "취소하면 그대로").toEqual([c1.id, c2.id]);

    // 삭제
    await deleteButton(page).click();
    dialog = deleteDialog(page);
    await expect(dialog).toBeVisible();
    await burst(primaryIn(dialog, DELETE_BUTTON));
    await expectToast(page, toastDeleted(defaultName(2)));
    await expect(modal(page)).toHaveCount(0);
    await expect.poll(() => pillLabels(page), { message: "pill 에서 빠진다", timeout: SAVE_TIMEOUT }).toEqual([defaultName(1)]);
    expect(actions.count() - base, "연타에도 삭제 요청 1건").toBe(1);
    await expectActive(page, defaultName(1), "남은 시약장이 활성");
    await expectHeader(page, defaultName(1), DOUBLE, 4, "삭제 뒤");
    await expectBoard(page, DOUBLE, 4, FRAME_LAYOUT, "삭제 뒤 남은 시약장");
    expect(new URL(page.url()).pathname).toBe(CABINETS_HREF);
    expect(new URL(page.url()).searchParams.get("c"), "지운 id 가 주소에 남지 않는다").not.toBe(c2.id);
    db = await dbViewByService(f.school.id);
    expect(db.cabinets.map((c) => c.id), "DB: 2번 시약장 삭제").toEqual([c1.id]);
    expect(Object.keys(db.classes), "DB: 2번 시약장 칸 삭제").toEqual([c1.id]);
    expect(db.unassigned.map((r) => r.id).sort(), "DB: 배치 시약이 칸 없음으로").toEqual([loose, ...inSecond].map((r) => r.id).sort());
    for (const r of inSecond) expect(db.unassigned.find((x) => x.id === r.id), `"${r.name}" 행·재고 그대로`).toMatchObject({ name: r.name, stock: r.stock, unit: r.unit });
    expect(db.placed[c1.id], "첫 시약장 배치는 그대로").toBe(1);
    await expectUnassigned(page, [loose, ...inSecond], "삭제 뒤");

    // 마지막 시약장 삭제 → 빈 상태
    const base2 = actions.count();
    await hydrated(deleteButton(page));
    await deleteButton(page).click();
    dialog = deleteDialog(page);
    await expect(dialog.getByText(exact(deleteNotice(1))), "배치 시약 수 = DB").toBeVisible();
    await primaryIn(dialog, DELETE_BUTTON).click();
    await expectToast(page, toastDeleted(defaultName(1)));
    await waitCabinets(page, "empty");
    expect(actions.count() - base2, "삭제 요청 1건").toBe(1);
    await expectEmptyHeading(page, "마지막 삭제 뒤 0개");
    for (const c of VARIANTS.empty) expect(await countComponent(page, c), `variants.empty ${c}`).toBeGreaterThanOrEqual(1);
    for (const c of [SWITCHER, SLOT, EDIT, MIX, MODAL]) expect(await countComponent(page, c), `빈 상태 ${c}`).toBe(0);
    db = await dbViewByService(f.school.id);
    expect(db.cabinets, "DB: 시약장 0개").toEqual([]);
    expect(db.unassigned.map((r) => r.id).sort(), "DB: 모든 시약이 남아 있고 칸 없음").toEqual([loose, inFirst, ...inSecond].map((r) => r.id).sort());
    expect(db.unassigned.find((x) => x.id === inFirst.id)).toMatchObject({ stock: inFirst.stock, unit: inFirst.unit });
  } finally {
    await context.close();
  }
});

// =====================================================================
// 시안 상태 (프레임 11 · 11-delete) — 개수·문구·칸 없음 목록
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 교사 · 시안 상태(시약장 2개 · 1번 양문형 4단 좌1단 = 산+염기 · 칸 없음 시약 2): 컴포넌트 개수 ≥ design/frames/11-{폭} · 이름·요약·칸·경고("${MIX_EXAMPLE}") = DB · 칸 없음 시약 목록 = DB slot_id null (이름·재고·"${CAB.unassigned_label}", 어느 시약장에서나 같음) · 행 → 시약 상세 · 2번 시약장 삭제 확인 개수 ≥ 11-delete-{폭}`, async ({ browser }, info) => {
  const f = await fresh(info);
  const st = await prepFrameState(f);
  const { context, page, viewport } = await openTemp(browser, info, f.teacher, CABINETS_HREF);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    const db = await dbViewByService(f.school.id);
    expect(db.unassigned.map((r) => r.id).sort(), "대조: DB 의 칸 없음 시약").toEqual(st.unassigned.map((r) => r.id).sort());
    expect(db.placed[st.c2.id], "대조: 2번 시약장 배치 시약").toBe(st.placed2.length);

    // 기본 상태 (프레임 11)
    expect(await pillLabels(page)).toEqual([defaultName(1), defaultName(2)]);
    await expectPills(page, db.cabinets, "기본");
    expect(db.counts[st.c1.id], "대조: 1번 시약장 칸별 시약 수 = s2-spec 예시").toEqual(FRAME_COUNTS);
    await expectActive(page, defaultName(1), "기본", st.c1.number);
    await expectHeader(page, defaultName(1), DOUBLE, 4, "기본", st.c1.number);
    await expectBoard(page, DOUBLE, 4, FRAME_LAYOUT, "기본", db.counts[st.c1.id]);
    await expectMix(page, DOUBLE, 4, FRAME_LAYOUT, "기본");
    await expect(mixLines(page)).toHaveText(exact(MIX_EXAMPLE));
    await selectSlot(page, DOUBLE, "L1");
    expect(await pickChips(page).evaluateAll((els) => els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => (e as HTMLElement).innerText.trim())), "좌1단의 눌린 칩").toEqual(CLASSES.filter((c) => FRAME_LAYOUT.L1.includes(c)));
    await expect(legendChips(page), "범례 칩(미지정 · 선택 칸)").toHaveCount(2);
    const frame = frameCounts(`${SCREEN}-${viewport}`);
    for (const [name, n] of Object.entries(frame)) expect(await countComponent(page, name), `시안 11 ${name} ≥ ${n}`).toBeGreaterThanOrEqual(n);
    for (const name of [SWITCHER, ADD, EDIT, DOOR_SELECT, SHELF_SELECT, SLOT, MIX, ROW]) expect(await countComponent(page, name), `시안 11 ${name} = ${frame[name]}`).toBe(frame[name]);
    await expectUnassigned(page, st.unassigned, "1번 시약장");
    await expect(saveButton(page)).toBeDisabled();

    // 2번 시약장에서도 같은 칸 없음 목록
    await pill(page, defaultName(2)).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("c"), { timeout: SAVE_TIMEOUT }).toBe(st.c2.id);
    await expectActive(page, defaultName(2), "전환", st.c2.number);
    await expectHeader(page, defaultName(2), DOUBLE, 3, "2번 시약장", st.c2.number);
    await expectBoard(page, DOUBLE, 3, FRAME_LAYOUT_2, "2번 시약장", db.counts[st.c2.id]);
    await expectMix(page, DOUBLE, 3, FRAME_LAYOUT_2, "2번 시약장");
    await expectUnassigned(page, st.unassigned, "2번 시약장");

    // 삭제 확인 (프레임 11-delete: 2번 시약장, 배치 시약 6)
    await hydrated(deleteButton(page));
    await deleteButton(page).click();
    const dialog = deleteDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(exact(deleteNotice(st.placed2.length)))).toBeVisible();
    await expect(dialog.getByText(exact(DELETE_CAPTION))).toBeVisible();
    const del = frameCounts(`${SCREEN}-delete-${viewport}`);
    // mix-warning 은 칸 분류 데이터에 달렸다: 이 테스트의 2번 시약장 = FRAME_LAYOUT_2(11-delete-mobile — 위험 조합 없음, 위 expectMix 로 0줄 확인).
    // 새 프레임 11-delete-desktop 은 2번 시약장 좌1단에 산·염기를 그려 mix-warning 이 있다 — 데이터가 다르므로 개수 대조에서 뺀다.
    for (const [name, n] of Object.entries(del)) {
      if (name === MIX && !Object.values(FRAME_LAYOUT_2).some((cls) => incompatiblePairsIn(cls).length > 0)) continue;
      expect(await countComponent(page, name), `시안 11-delete ${name} ≥ ${n}`).toBeGreaterThanOrEqual(n);
    }
    for (const name of [MODAL, SWITCHER, SLOT]) expect(await countComponent(page, name), `시안 11-delete ${name} = ${del[name]}`).toBe(del[name]);
    expect(await dialog.locator(sel(OUTLINE)).count(), "확인 카드 button-outline (취소)").toBe(1);
    expect(await dialog.locator(sel(PRIMARY)).count(), "확인 카드 button-primary (삭제)").toBe(1);
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);

    // 행 → 시약 상세
    const target = st.unassigned[0];
    await rows(page).filter({ hasText: target.name }).click();
    await page.waitForURL((u) => u.pathname === detailPath(target.id), { timeout: 45_000 });
    // 도착 = 화면 3 (390 reagent-detail-card / 1440 시약 목록 옆 오른쪽 detail-drawer — d7 §23 run b)
    const detail = page.locator(`main ${sel(viewport === "desktop" ? "detail-drawer" : "reagent-detail-card")}`).first();
    await expect(detail).toBeVisible({ timeout: 45_000 });
    await expect(viewport === "desktop" ? detail : page.locator("main")).toContainText(target.name);
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 학생 — 같은 일회용 학교를 보기 전용으로
// =====================================================================

test(`[R-ui][S${SCREEN}] 일회용 학생 · 시안 상태의 같은 학교: ${R7.components!.join("·")} 0 (R7) · 문 형태·단 수·고르는 칩·저장·이름 바꾸기·삭제 0 · 본문 버튼 = 칸뿐 · 칸 누름 → ${SLOT_SHEET} 목록만(${SLOT_ASSIGN}·"빼기"·선택 표시 0) · 전환 pill·배치도(slot-count)·범례·${MIX}("${MIX_EXAMPLE}")·칸 없음 목록은 보임 · pill 로 전환 가능 · 쓰기 요청 0건`, async ({ browser }, info) => {
  const f = await fresh(info);
  const st = await prepFrameState(f);
  const { context, page, viewport, response } = await openTemp(browser, info, f.student, CABINETS_HREF);
  const actions = watchActions(page);
  try {
    expect(response?.status()).toBe(200);
    await waitCabinets(page);
    for (const c of R7.components!) {
      expect(await countComponent(page, c), `R7 ${c}`).toBe(R7.max);
      expect(await response!.text(), `응답 본문에 ${c}`).not.toContain(`data-component="${c}"`);
    }
    for (const c of [DOOR_SELECT, SHELF_SELECT, PRIMARY, OUTLINE, MODAL, INPUT]) expect(await countComponent(page, c), `학생 화면 ${c}`).toBe(0);
    await expect(pickChips(page)).toHaveCount(0);
    // 1.15: 학생도 칸을 눌러 칸 시트(목록만)를 연다 — 본문의 버튼은 칸뿐 (편집·추가·이름·삭제·저장 버튼 없음)
    await expect(main(page).getByRole("button"), "학생 본문 버튼 = 칸 수").toHaveCount(await slots(page).count());
    expect(await main(page).getByRole("button").evaluateAll((els, s) => els.every((e) => e.matches(s)), sel(SLOT)), "학생 본문 버튼은 모두 칸").toBe(true);
    await expect(main(page).getByRole("radio")).toHaveCount(0);
    const db0 = await dbViewByService(f.school.id);

    expect(await pillLabels(page)).toEqual([defaultName(1), defaultName(2)]);
    await expectPills(page, db0.cabinets, "학생");
    await expectActive(page, defaultName(1), "학생", st.c1.number);
    await expectHeader(page, defaultName(1), DOUBLE, 4, "학생", st.c1.number);
    await expectBoard(page, DOUBLE, 4, FRAME_LAYOUT, "학생", db0.counts[st.c1.id]);
    await expectMix(page, DOUBLE, 4, FRAME_LAYOUT, "학생");
    await expect(mixLines(page), "학생에게도 같은 경고").toHaveText(exact(MIX_EXAMPLE));
    await expect(legendChips(page).first()).toBeVisible();
    await expectUnassigned(page, st.unassigned, "학생");
    await expectTabBar(page, viewport, "학생");
    // 칸 누름 → 칸 시트 = 그 칸 시약 목록만 (행 → 시약 상세 링크), 넣기·빼기·선택 표시 없음
    await hydrated(slots(page).first());
    for (const key of Object.keys(FRAME_COUNTS)) {
      await slotAt(page, DOUBLE, key).click();
      const sheet = slotSheet(page);
      await expect(sheet, `학생 칸 ${key} → ${SLOT_SHEET}`).toBeVisible();
      const want = db0.inSlot[st.c1.id][key] ?? [];
      await expect(sheet.locator(sel(ROW_NAME)), `${SLOT_SHEET} 행 수 = DB ${key} 시약 수`).toHaveCount(want.length);
      for (const r of want) {
        const row = sheet.locator(sel(ROW_NAME)).filter({ hasText: r.name });
        await expect(row, `${SLOT_SHEET} 행 "${r.name}"`).toHaveCount(1);
        await expect(row.locator(`a[href="${detailPath(r.id)}"]`).or(row.and(page.locator(`a[href="${detailPath(r.id)}"]`))), `"${r.name}" 행 → 시약 상세`).toHaveCount(1);
      }
      await expect(sheet.locator(sel(SLOT_ASSIGN)), `학생 ${SLOT_ASSIGN}`).toHaveCount(0);
      await expect(sheet.getByRole("button", { name: /빼기/ }), `학생 "빼기"`).toHaveCount(0);
      await expect(pickChips(page)).toHaveCount(0);
      expect(await slots(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed"))), "선택 칸 없음").not.toContain("true");
      await closeSlotSheet(page);
    }
    await expect(modal(page)).toHaveCount(0);

    // 전환
    await hydrated(pills(page).last());
    await pill(page, defaultName(2)).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("c"), { timeout: SAVE_TIMEOUT }).toBe(st.c2.id);
    await expectActive(page, defaultName(2), "학생 전환", st.c2.number);
    await expectHeader(page, defaultName(2), DOUBLE, 3, "학생 2번 시약장", st.c2.number);
    await expectBoard(page, DOUBLE, 3, FRAME_LAYOUT_2, "학생 2번 시약장", db0.counts[st.c2.id]);
    await expect(mix(page), "2번 시약장에는 비호환 칸이 없다").toHaveCount(0);
    await expectUnassigned(page, st.unassigned, "학생 2번 시약장");
    for (const c of R7.components!) expect(await countComponent(page, c), `전환 뒤 R7 ${c}`).toBe(R7.max);

    // 칸 없음 행 → 시약 상세
    const target = st.unassigned[1];
    await rows(page).filter({ hasText: target.name }).click();
    await page.waitForURL((u) => u.pathname === detailPath(target.id), { timeout: 45_000 });
    await expect(page.locator("main")).toContainText(target.name, { timeout: 45_000 });
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
    const db = await dbViewByService(f.school.id);
    expect(db.cabinets.map((c) => c.id), "DB 그대로").toEqual([st.c1.id, st.c2.id]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C2 — 맨 아래까지 스크롤했을 때 마지막 칸 없음 행
// =====================================================================

test(`[C2][S${SCREEN}] 일회용 학교: 맨 아래까지 스크롤하면 마지막 칸 없음 행이 가려지지 않음 — 폭 390 교사: "${SAVE_BUTTON}" 줄 위(칸 줄이기 안내가 있을 때는 안내 위) · 학생: tab-bar 위 / 폭 1440: 화면 안 · rules.json tab_bar 개수`, async ({ browser }, info) => {
  const f = await fresh(info);
  const st = await prepFrameState(f);
  const extra = [await prepReagent(f, "칸없음다", 1, "병"), await prepReagent(f, "칸없음라", 2, "g"), await prepReagent(f, "칸없음마", 3, "mL")];
  const all = [...st.unassigned, ...extra];
  const tb = rules.tab_bar;
  const toBottom = async (page: Page) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight)).toBe(true);
  };

  // ---------- 교사 ----------
  const t = await openTemp(browser, info, f.teacher, withC(st.c2.id));
  try {
    const { page, viewport } = t;
    await waitEditable(page);
    await expectTabBar(page, viewport, "교사");
    await expect(rows(page)).toHaveCount(all.length);
    const last = rows(page).last();
    const vp = page.viewportSize()!;
    await toBottom(page);
    let lastBox = await boxOf(last);
    const save = saveButton(page);
    if (viewport === "mobile") {
      const bar = await boxOf(page.locator(sel(tb.component)));
      expect(lastBox.bottom, "마지막 행 아래 끝 ≤ 저장 버튼 위").toBeLessThanOrEqual((await boxOf(save)).top);
      expect(lastBox.bottom, "마지막 행 아래 끝 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual(bar.top);
      expect((await boxOf(save)).bottom, "저장 버튼 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual(bar.top + 0.5);
    } else {
      expect(lastBox.bottom, "마지막 행이 화면 안").toBeLessThanOrEqual(vp.height);
    }
    expect(await onTop(last), "마지막 행이 다른 것에 가려지지 않음").toBe(true);
    expect(await onTop(save), "저장 버튼이 가려지지 않음").toBe(true);

    // 칸 줄이기 안내가 있을 때 (2번 시약장은 칸마다 시약 1종)
    await page.evaluate(() => window.scrollTo(0, 0));
    await pickDoor(page, SINGLE);
    await expect(notice(page)).toHaveText(exact(shrinkNotice(3)));
    await toBottom(page);
    lastBox = await boxOf(last);
    const n = await boxOf(notice(page));
    expect(n.bottom, "안내는 저장 버튼 위").toBeLessThanOrEqual((await boxOf(save)).top);
    expect(await onTop(notice(page)), "안내가 가려지지 않음").toBe(true);
    if (viewport === "mobile") {
      const bar = await boxOf(page.locator(sel(tb.component)));
      expect(lastBox.bottom, "안내가 있을 때: 마지막 행 아래 끝 ≤ 안내 위").toBeLessThanOrEqual(n.top);
      expect((await boxOf(save)).bottom, "저장 버튼 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual(bar.top + 0.5);
      expect(bar.top - (await boxOf(save)).bottom, "저장 줄은 tab-bar 바로 위").toBeLessThanOrEqual(24);
    } else {
      expect(lastBox.bottom, "마지막 행이 화면 안").toBeLessThanOrEqual(vp.height);
    }
    expect(await onTop(last), "안내가 있을 때: 마지막 행이 가려지지 않음").toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "가로 스크롤 없음").toBe(true);
  } finally {
    await t.context.close();
  }

  // ---------- 학생 ----------
  const s = await openTemp(browser, info, f.student, CABINETS_HREF);
  try {
    const { page, viewport } = s;
    await waitCabinets(page);
    await expectTabBar(page, viewport, "학생");
    await expect(rows(page)).toHaveCount(all.length);
    await toBottom(page);
    const last = rows(page).last();
    const lastBox = await boxOf(last);
    if (viewport === "mobile") expect(lastBox.bottom, "학생: 마지막 행 아래 끝 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual((await boxOf(page.locator(sel(tb.component)))).top);
    else expect(lastBox.bottom, "학생: 마지막 행이 화면 안").toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(await onTop(last), "학생: 마지막 행이 가려지지 않음").toBe(true);
  } finally {
    await s.context.close();
  }
  expect((await dbViewByService(f.school.id)).cabinets.find((c) => c.id === st.c2.id), "저장하지 않았다").toMatchObject({ door_type: DOUBLE, shelves: 3 });
});
