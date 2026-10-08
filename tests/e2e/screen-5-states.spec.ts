// 화면 5 (실험 매뉴얼) 상태·저장·학교 분리: C1(2단계 연결·미연결·고치기·재계산·기존 기준 · 저장 흐름 · 저장 실패 · 저장하지 않으면 불변) · N1-ui
// 기준: harness/d7-data.md §13(시약 연결 · 확인 표 · 저장 "더 큰 값 유지")·§11(화면 6 카드 문구), 디자인 s2-spec "## 화면 5", design/frames/5-*.json,
//       design/rules.json (never.N1, colors.highlight), harness/dev-rules.json (components_note 화면 5).
// 모든 저장과 연결 상태는 일회용 학교(일회용 admin·교사)의 임시 시약으로만 만든다 — 공용 학교 A·B 의 재주문 기준은 바꾸지 않는다
// (공용 계정은 N1 대조 화면에서 1단계·가짜 결과의 2단계를 읽기만 하고, 저장 요청은 blockSaves 로 끊어 둔다).
// 추출 API 는 가로채 가짜 응답을 준다 (실제 Gemini 호출 없음). service role 은 준비·정리·대조 조회에만 쓴다.
import { test, expect, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { browserClient, browserSession, countComponent, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, openTemp } from "./screen-8-helpers";
import { autoFromIntake } from "./reorder-auto-helpers";
import {
  CARD_AMOUNT,
  MANUAL_BUTTON,
  NO_RESIDUE_69,
  amountText as cardAmountText,
  basisText,
  checkSchoolNames,
  cleanup,
  exact,
  expectCardMatches,
  expectNoOtherSchool,
  hex,
  highlightSoft,
  makeSchool,
  manual as reorderManual,
  otherSchools,
  ownReagentsOf,
  ownSchoolId,
  purge,
  readAlerts,
  schoolNamesOf,
  sharedSnapshot,
  waitReorder,
  watchActions,
  type Fx,
} from "./screen-6-9-helpers";
import {
  BASIS_RE,
  CELL,
  FRAME_ITEMS,
  FRAME_ROWS,
  GROUPS,
  G_MAX,
  HEAD,
  INPUT,
  MANUAL_HREF,
  MANUAL_SCREEN,
  REORDER_HREF,
  RETRY,
  SAVE,
  TABLE,
  TITLE,
  TOAST,
  TOAST_SAVED,
  UNLINKED,
  OUR_REAGENT,
  UNITS,
  amountInput,
  backLink,
  basisOf,
  blockSaves,
  bodyRows,
  bottomNotices,
  chooseReagent,
  dropReagent,
  fileInput,
  groupsInput,
  linkedUnit,
  main,
  mockExtract,
  okReply,
  optionLabel,
  optionLabels,
  prepNamed,
  readRows,
  removeButton,
  requiredNumber,
  requiredText,
  retryButton,
  rowById,
  rowByName,
  saveButton,
  savedToast,
  schoolReagents,
  table,
  toNumber,
  toResult,
  unitSelect,
  uploadArea,
  waitManual,
  type FakeItem,
} from "./screen-5-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const SCREEN = MANUAL_SCREEN;
const GROUP = "s5st";
const TIMEOUT = 420_000;
const SOFT = highlightSoft();
/** 다른 스펙이 학교 A·B 에 잠깐 만드는 임시 시약 이름 접두사 (screen-6-9-helpers sharedSnapshot 과 같은 목록) */
const FOREIGN_TEMP = ["R-db-", "N1-db-", "S7-ui-"];

/** 시안 1.17 의 4행 (가짜 추출 결과): 염산 · 수산화나트륨 · 페놀프탈레인 용액 · 증류수 (변수 이름 ETOH = 넷째 행) */
const [HCL, NAOH, PHPH, ETOH] = FRAME_ITEMS;
/**
 * 일회용 학교에 등록하는 시약 이름 — 시안의 추출 이름과 표기만 다르다 (d7 §13 "시약 연결": 공백·대소문자·괄호 농도 표기 무시).
 * 페놀프탈레인은 등록하지 않는다 (미연결 행).
 */
const NAME = {
  /** "염산" ↔ 괄호 농도 표기 + 공백 */
  hcl: "염산(0.1 M)",
  /** "수산화나트륨" ↔ 공백 */
  naoh: "수산화 나트륨",
  /** "증류수" ↔ 앞 꾸밈말 "정제" */
  etoh: "정제 증류수",
  /** 추출 결과에 없는 다른 시약 (수동 연결 대상) */
  other: "메틸오렌지",
} as const;

let before: string[] | null = null;
let fixtureCache: Promise<Fx> | null = null;
let secondCache: Promise<Fx> | null = null;

function fixture(info: TestInfo): Promise<Fx> {
  fixtureCache ??= makeSchool(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

/** 두 번째 일회용 학교 (학교 분리 대조용) */
function second(info: TestInfo): Promise<Fx> {
  secondCache ??= makeSchool(info, GROUP);
  secondCache.catch(() => {
    secondCache = null;
  });
  return secondCache;
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
  secondCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·판매처·기록 잔여물").toEqual(NO_RESIDUE_69);
  if (before) expect(await sharedSnapshot(), "공통 판매처 목록 · 학교 A·B·데모의 판매처·시약 기준 열이 그대로").toEqual(before);
});

test(`[C1][S${SCREEN}] 기대값 원본: 시안 1.17 4행 = 염산 20 mL · 수산화나트륨 5 g · 페놀프탈레인 용액 2 mL · 증류수 150 mL, 조 수 ${GROUPS}`, () => {
  expect(FRAME_ITEMS).toEqual([
    { name: "염산", amount: 20, unit: "mL" },
    { name: "수산화나트륨", amount: 5, unit: "g" },
    { name: "페놀프탈레인 용액", amount: 2, unit: "mL" },
    { name: "증류수", amount: 150, unit: "mL" },
  ]);
  expect(GROUPS).toBe(4);
  expect(FRAME_ROWS.map((r) => r[3]), "시안의 필요량").toEqual(["80 mL", "20 g", "8 mL", "600 mL"]);
  expect(G_MAX, "조 수를 10 으로 바꿔 볼 수 있다").toBeGreaterThanOrEqual(10);
});

// =====================================================================
// C1 — 2단계: 연결·미연결·고치기·재계산
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 교사 2단계(시안 4행 · 대응 시약 일부만 등록): ${TABLE} 1 · 머리행 ${HEAD.length}열 · ${CELL} ≥ 프레임 · 행별 시약명·사용량·단위·필요량(× ${GROUPS}) · 표기만 다른 시약은 자동 연결·없는 시약은 "${UNLINKED}" + 저장 제외 안내 · 기존 기준 표시(변경/유지 예고) · 사용량 고치면 그 칸만 연하늘 + 필요량 재계산 · 조 수 ${GROUPS} → 10 재계산(추가 요청 0) · "${OUR_REAGENT}" 수동 연결 · 단위 불일치 → "${SAVE}" 비활성 + 이유 · 행 삭제 · 저장 요청 0건·DB 불변`, async ({ browser }, info) => {
  const f = await fresh(info);
  // 기존 기준: 염산 50 mL (새 필요량 80 이 더 크다 → 변경 예고), 수산화나트륨 20 g (새 필요량 20 과 같다 → 유지 예고), 증류수 없음
  // (d7 §11-1: 새 시약은 자동 기준 = 첫 입고량 × 20% 로 시작 → "기준 없음" 은 직접 지정한 0('manual')으로 만든다)
  const hcl = await prepNamed(f, { name: NAME.hcl, unit: HCL.unit, stock: 100, min: 50 });
  const naoh = await prepNamed(f, { name: NAME.naoh, unit: NAOH.unit, stock: 50, min: 20 });
  const etoh = await prepNamed(f, { name: NAME.etoh, unit: ETOH.unit, stock: 500, min: 0 });
  expect(etoh.min_stock, "준비: 증류수 기준 없음(0)").toBe(0);
  const other = await prepNamed(f, { name: NAME.other, unit: PHPH.unit, stock: 30 });
  const dbBefore = await schoolReagents(f.school.id);

  const { context, page } = await openTemp(browser, info, f.teacher, MANUAL_HREF);
  const actions = watchActions(page);
  try {
    await waitManual(page);
    const mock = await mockExtract(page);
    await toResult(page);
    expect(mock.seen().length, "추출 요청 1건").toBe(1);

    // 표 구성
    await expect(table(page), TABLE).toHaveCount(1);
    await expect(table(page).getByRole("heading", { name: TITLE, exact: true }), `제목 "${TITLE}"`).toBeVisible();
    await expect(table(page).getByRole("columnheader"), "머리행 4열").toHaveText(HEAD.map(exact));
    expect(await table(page).locator(sel(CELL)).count(), `${CELL} ≥ (머리 + 4행) × ${HEAD.length}`).toBeGreaterThanOrEqual((FRAME_ROWS.length + 1) * HEAD.length);
    let rows = await readRows(page);
    expect(rows.map((r) => r.cells), "행별 시약명·사용량·단위·필요량 = 시안").toEqual(FRAME_ROWS);
    for (const [i, item] of FRAME_ITEMS.entries()) expect(rows[i].cells[3], `${item.name} 필요량`).toBe(requiredText(item.amount!, GROUPS, item.unit));
    expect(rows.map((r) => r.inputs), `사용량 칸에만 ${INPUT}`).toEqual(FRAME_ROWS.map(() => [0, 1, 0, 0]));
    expect(rows.map((r) => r.edited), "추출 직후 고친 칸 없음").toEqual(FRAME_ROWS.map(() => false));

    // 자동 연결: 표기만 다른 시약은 연결, 등록되지 않은 시약은 미연결
    expect(rows.map((r) => r.linked), `"${OUR_REAGENT}" 선택 칸`).toEqual([optionLabel(hcl), optionLabel(naoh), UNLINKED, optionLabel(etoh)]);
    expect(rows.map((r) => r.status), "행 상태").toEqual(["ok", "ok", "unlinked", "ok"]);
    expect(rows[2].detail, "미연결 행: 저장 제외 안내").toMatch(/등록되지 않은 시약.*저장에서 빠/);
    expect(rows[2].cells[3], "미연결 행도 필요량은 보인다").toBe(requiredText(PHPH.amount!, GROUPS, PHPH.unit));
    for (const i of [0, 1, 3]) expect(rows[i].detail, `${rows[i].cells[0]} 행에는 저장 제외 안내 없음`).not.toContain("저장에서 빠");
    // 선택지 = 등록되지 않은 시약 + 우리 학교 시약 전부
    expect((await optionLabels(rowById(page, rows[2].id))).sort(), "선택지").toEqual([UNLINKED, ...[hcl, naoh, etoh, other].map(optionLabel)].sort());

    // 기존 기준
    const basis0 = BASIS_RE.exec(rows[0].detail);
    const basis1 = BASIS_RE.exec(rows[1].detail);
    expect(basis0 && [toNumber(basis0[1]), basis0[2].replace(/[^\w가-힣]/g, "")], `${HCL.name}: 기존 기준 ${hcl.min_stock} ${hcl.unit}`).toEqual([hcl.min_stock, hcl.unit]);
    expect(basis1 && [toNumber(basis1[1]), basis1[2].replace(/[^\w가-힣]/g, "")], `${NAOH.name}: 기존 기준 ${naoh.min_stock} ${naoh.unit}`).toEqual([naoh.min_stock, naoh.unit]);
    expect(requiredNumber(HCL.amount!, GROUPS), "대조: 염산 새 필요량 > 기존 기준").toBeGreaterThan(hcl.min_stock);
    expect(requiredNumber(NAOH.amount!, GROUPS), "대조: 수산화나트륨 새 필요량 ≤ 기존 기준").toBeLessThanOrEqual(naoh.min_stock);
    expect(rows[0].detail, "새 필요량이 더 크면 바뀐다고 알린다 (새 값 표시)").toContain(requiredText(HCL.amount!, GROUPS, HCL.unit));
    expect(rows[0].detail, "새 필요량이 더 크면 유지 예고가 아니다").not.toMatch(/그대로|유지/);
    expect(rows[1].detail, "기존 기준이 같거나 더 크면 그대로 둔다고 알린다").toMatch(/그대로|유지/);
    expect(rows[3].detail, "기준이 없는 시약에는 기존 기준 글자가 없다").not.toContain("기존 기준");
    expect(rows[2].detail, "미연결 행에는 기존 기준 글자가 없다").not.toContain("기존 기준");
    await expect(saveButton(page), "미연결 행이 있어도 저장 가능").toBeEnabled();
    expect(await bottomNotices(page), "저장할 수 없는 이유 없음").toEqual([]);

    // 사용량 고치기 → 그 칸만 연하늘 + 필요량 재계산 (7.5 × 4 = 30 > 기존 기준 20 → 이제 바뀐다고 알린다)
    await page.mouse.move(0, 0);
    expect(rows.flatMap((r) => r.inputBgs).filter((c) => c === SOFT), "고치기 전 연하늘 칸 없음").toEqual([]);
    const edited = "7.5";
    await amountInput(rowByName(page, NAOH.name)).fill(edited);
    await amountInput(rowByName(page, NAOH.name)).blur();
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await readRows(page)).map((r) => r.edited), { message: "고친 행만 표시" }).toEqual([false, true, false, false]);
    rows = await readRows(page);
    expect(rows[1].cells, "고친 행: 사용량·필요량").toEqual([NAOH.name, edited, NAOH.unit, requiredText(edited, GROUPS, NAOH.unit)]);
    expect(rows[1].inputBgs, "고친 칸 = 연하늘").toContain(SOFT);
    for (const i of [0, 2, 3]) {
      expect(rows[i].cells, `${FRAME_ROWS[i][0]} 행은 그대로`).toEqual(FRAME_ROWS[i]);
      expect(rows[i].inputBgs, `${FRAME_ROWS[i][0]} 칸은 연하늘이 아니다`).not.toContain(SOFT);
    }
    expect(requiredNumber(edited, GROUPS), "대조: 고친 뒤 필요량 > 기존 기준").toBeGreaterThan(naoh.min_stock);
    expect(rows[1].detail, "고친 뒤: 기존 기준은 그대로 보인다").toMatch(BASIS_RE);
    expect(rows[1].detail, "고친 뒤: 유지 예고가 사라진다").not.toMatch(/그대로|유지/);
    expect(rows[1].detail, "고친 뒤: 새 필요량으로 바뀐다고 알린다").toContain(requiredText(edited, GROUPS, NAOH.unit));

    // 조 수 4 → 10: 필요량 즉시 재계산, 추가 요청 없음
    const amounts = [String(HCL.amount), edited, String(PHPH.amount), String(ETOH.amount)];
    await groupsInput(page).fill("10");
    await expect
      .poll(async () => (await readRows(page)).map((r) => r.cells[3]), { message: "조 수 10 → 필요량 재계산" })
      .toEqual(FRAME_ITEMS.map((it, i) => requiredText(amounts[i], 10, it.unit)));
    rows = await readRows(page);
    expect(rows.map((r) => r.cells[1]), "조 수를 바꿔도 사용량은 그대로").toEqual(amounts);
    expect(rows.map((r) => r.edited), "고친 칸 표시는 그대로").toEqual([false, true, false, false]);
    expect(mock.seen().length, "조 수를 바꿔도 추가 추출 요청 0").toBe(1);
    await groupsInput(page).fill(String(GROUPS));
    await expect.poll(async () => (await readRows(page))[0].cells[3]).toBe(requiredText(HCL.amount!, GROUPS, HCL.unit));

    // 수동 연결: 미연결 행 → 우리 학교 시약
    const target = rowById(page, rows[2].id);
    const picked = await chooseReagent(target, (labels) => labels.indexOf(optionLabel(other)));
    expect(picked).toBe(optionLabel(other));
    await expect.poll(async () => (await readRows(page))[2].status, { message: "연결하면 저장 대상" }).toBe("ok");
    rows = await readRows(page);
    expect(rows[2].linked, "선택 칸 = 고른 시약").toBe(optionLabel(other));
    expect(rows[2].detail, "연결하면 저장 제외 안내가 사라진다").not.toContain("저장에서 빠");
    expect(rows[2].cells.slice(0, 3), "추출한 시약명·사용량·단위는 그대로").toEqual(FRAME_ROWS[2].slice(0, 3));
    await chooseReagent(target, (labels) => labels.indexOf(UNLINKED));
    await expect.poll(async () => (await readRows(page))[2].status, { message: "다시 미연결" }).toBe("unlinked");

    // 단위 불일치: 저장 비활성 + 이유
    const first = rowByName(page, HCL.name);
    const wrong = UNITS.find((u) => u !== hcl.unit)!;
    await unitSelect(first).selectOption({ label: wrong });
    await expect.poll(async () => (await readRows(page))[0].status, { message: "단위 불일치" }).toBe("mismatch");
    rows = await readRows(page);
    expect(linkedUnit(rows[0]), "연결 시약 단위").toBe(hcl.unit);
    expect(rows[0].cells[2], "고른 단위").toBe(wrong);
    expect(rows[0].detail, `경고에 우리 학교 시약 단위(${hcl.unit})`).toMatch(new RegExp(`단위[^.]{0,6}${hcl.unit}`));
    await expect(saveButton(page), "단위 불일치 → 저장 비활성").toBeDisabled();
    await expect.poll(async () => (await bottomNotices(page)).length, { message: "저장할 수 없는 이유" }).toBe(1);
    await saveButton(page).click({ force: true, timeout: 5_000 }).catch(() => undefined);
    await unitSelect(first).selectOption({ label: hcl.unit });
    await expect.poll(async () => (await readRows(page))[0].status).toBe("ok");
    await expect(saveButton(page), "단위를 맞추면 저장 가능").toBeEnabled();
    expect(await bottomNotices(page), "이유가 사라진다").toEqual([]);

    // 행 삭제
    const victim = rowByName(page, ETOH.name);
    await expect(removeButton(victim), `${ETOH.name} 삭제 버튼`).toHaveCount(1);
    await removeButton(victim).click();
    await expect(bodyRows(page), "한 행만 사라진다").toHaveCount(FRAME_ROWS.length - 1);
    rows = await readRows(page);
    expect(rows.map((r) => r.cells[0]), "나머지 행").toEqual([HCL.name, NAOH.name, PHPH.name]);
    expect(rows[1].cells[1], "고친 값은 그대로").toBe(edited);
    await expect(table(page).getByRole("columnheader")).toHaveText(HEAD.map(exact));

    // 2단계에서는 파일이 잠긴다 · 저장하지 않았다
    await expect(fileInput(page), "2단계 파일 잠금").toBeDisabled();
    expect(await countComponent(page, TOAST), "토스트 없음").toBe(0);
    expect(actions.count(), "저장(서버 액션) 요청 0건").toBe(0);
    expect(await schoolReagents(f.school.id), "저장 전에는 DB 불변").toEqual(dbBefore);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 저장 흐름
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 교사 저장: "${SAVE}" 연타에도 저장 요청 1건 → ex-toast "${TOAST_SAVED}" → ${REORDER_HREF} 도착 · DB: 연결 시약 min_stock = 1조 사용량 × ${GROUPS}·reorder_per_group·reorder_groups 일치 · 기존 기준이 더 큰 시약은 그대로 · 미연결 행·다른 시약은 불변 · 화면 6: 새 기준보다 재고가 적은 시약이 알림 카드로("1반 1회 실험량 … × ${GROUPS}조 기준"·"필요량 … / 현재 재고 …" = 저장값)`, async ({ browser }, info) => {
  const f = await fresh(info);
  // 염산 재고 50 < 새 필요량 80 → 알림
  const hcl = await prepNamed(f, { name: NAME.hcl, unit: HCL.unit, stock: 50 });
  // 기존 기준 30 g 이 새 필요량(5 × 4 = 20)보다 크다 → 그대로
  const naoh = await prepNamed(f, { name: NAME.naoh, unit: NAOH.unit, stock: 5, min: 30 });
  // 증류수 재고 1000 ≥ 새 필요량 600 → 알림 없음
  const etoh = await prepNamed(f, { name: NAME.etoh, unit: ETOH.unit, stock: 1000 });
  const other = await prepNamed(f, { name: NAME.other, unit: PHPH.unit, stock: 3 });
  const dbBefore = basisOf(await schoolReagents(f.school.id));
  // 염산·에탄올은 자동 기준(첫 입고량 × 20%, d7 §11-1) → 저장하면 필요량으로 바뀐다. 수산화나트륨은 직접 지정한 20 g('manual') → 더 큰 값만
  expect(dbBefore[hcl.name], "대조: 염산은 자동 기준").toEqual({ min: autoFromIntake(50), per: null, groups: null });
  const want = {
    ...dbBefore,
    [hcl.name]: { min: requiredNumber(HCL.amount!, GROUPS), per: HCL.amount, groups: GROUPS },
    [etoh.name]: { min: requiredNumber(ETOH.amount!, GROUPS), per: ETOH.amount, groups: GROUPS },
  };
  expect(want[naoh.name], "대조: 수산화나트륨은 그대로").toEqual({ min: 30, per: null, groups: null });
  expect(want[other.name], "대조: 추출 결과에 없는 시약은 그대로 (등록 때의 자동 기준)").toEqual({ min: autoFromIntake(3), per: null, groups: null });
  expect(requiredNumber(NAOH.amount!, GROUPS), "대조: 새 필요량 < 기존 기준").toBeLessThan(naoh.min_stock);

  const { context, page } = await openTemp(browser, info, f.teacher, MANUAL_HREF);
  const actions = watchActions(page);
  try {
    await waitManual(page);
    const mock = await mockExtract(page);
    await toResult(page);
    const rows = await readRows(page);
    expect(rows.map((r) => r.status), "행 상태 (페놀프탈레인은 미연결)").toEqual(["ok", "ok", "unlinked", "ok"]);
    await expect(saveButton(page)).toBeEnabled();
    expect(actions.count(), "누르기 전 저장 요청 0").toBe(0);
    expect(await schoolReagents(f.school.id).then(basisOf), "누르기 전 DB 불변").toEqual(dbBefore);

    // 연타
    await saveButton(page).dblclick();
    await expect(savedToast(page), `ex-toast "${TOAST_SAVED}"`).toBeVisible({ timeout: 30_000 });
    await expect(savedToast(page), "토스트는 하나").toHaveCount(1);
    await saveButton(page).click({ force: true, timeout: 3_000 }).catch(() => undefined);
    await expect.poll(() => new URL(page.url()).pathname, { message: `토스트 뒤 ${REORDER_HREF}`, timeout: 30_000 }).toBe(REORDER_HREF);
    await waitReorder(page);
    expect(actions.count(), "저장 요청은 1건 (연타에도)").toBe(1);
    expect(mock.seen().length, "추출 요청은 1건").toBe(1);

    // DB
    const after = await schoolReagents(f.school.id);
    expect(basisOf(after), "저장 뒤 재주문 기준").toEqual(want);
    expect(after.map((r) => `${r.name}|${r.stock}|${r.unit}`).sort(), "재고·단위·시약 수는 그대로").toEqual([hcl, naoh, etoh, other].map((r) => `${r.name}|${r.stock}|${r.unit}`).sort());

    // 화면 6
    const { client } = await browserClient(page);
    const own = await ownReagentsOf(client);
    const low = own.filter((r) => r.stock < r.min_stock);
    expect(low.map((r) => r.name).sort(), "대조: 부족 시약 = 염산(새 기준 80 > 재고 50) · 수산화나트륨(기존 기준 30 > 재고 5)").toEqual([hcl.name, naoh.name].sort());
    const shown = await readAlerts(page);
    expect(shown.map((s) => s.name).sort(), "알림 카드").toEqual(low.map((r) => r.name).sort());
    for (const card of shown) expectCardMatches(card, low.find((r) => r.name === card.name)!, `카드 "${card.name}"`);
    const hclRow = low.find((r) => r.name === hcl.name)!;
    expect(basisText(hclRow), "기준 문구 = 저장값").toBe(`1반 1회 실험량 ${HCL.amount} ${HCL.unit} × ${GROUPS}조 기준`);
    expect(cardAmountText(hclRow), "재주문 기준·현재 재고 문구 = 저장값 (d7 §11 1.21)").toBe(`${CARD_AMOUNT.need} ${requiredNumber(HCL.amount!, GROUPS)}${HCL.unit} / ${CARD_AMOUNT.stock} 50${HCL.unit}`);
    const hclCard = shown.find((s) => s.name === hcl.name)!;
    expect(hclCard.lines.map((l) => l.replace(/[\s,]/g, "")), "염산 카드 기준 문구").toContain(basisText(hclRow).replace(/[\s,]/g, ""));
    expect(basisText(low.find((r) => r.name === naoh.name)!), "수산화나트륨 카드는 기존 기준 문구 그대로").toBe(`재주문 기준 30 ${NAOH.unit}`);
    expect((await main(page).innerText()).includes(etoh.name), "재고가 충분한 증류수는 알림에 없다").toBe(false);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 일회용 학교 admin 저장: 이름 열쇠·단위가 같은 추출 행은 한 줄로 합침(d7 §13 중복) · 같은 시약에 연결한 2행은 저장 때 합산 · 수동 연결한 행 저장 · 고친 사용량·바꾼 조 수(10)로 저장 · 기존 기준보다 크면 바꾸고 작으면 그대로(근거 열 포함) · 미연결 행은 어떤 시약도 바꾸지 않음 → 화면 6 카드 = 저장값`, async ({ browser }, info) => {
  const f = await fresh(info);
  const hcl = await prepNamed(f, { name: NAME.hcl, unit: "mL", stock: 100 });
  // 기존 기준 20 g (2 g × 10조) — 고친 사용량 2.5 × 10 = 25 가 더 크다 → 바뀐다
  const naoh = await prepNamed(f, { name: NAME.naoh, unit: "g", stock: 5, min: 20, perGroup: 2, groups: 10 });
  const other = await prepNamed(f, { name: NAME.other, unit: "mL", stock: 3 });
  // 기존 기준 500 g (50 g × 10조) — 새 필요량 5 × 10 = 50 이 작다 → 그대로
  const keep = await prepNamed(f, { name: "아세트산", unit: "g", stock: 1, min: 500, perGroup: 50, groups: 10 });
  // "염산 0.1M"·"염산(0.1M)" 은 이름 열쇠·단위(mL)가 같다 → 2단계 표에서 한 줄(50 + 30 = 80)로 합쳐진다 (d7 §13 중복, 2026-10-06)
  const items: FakeItem[] = [
    { name: "염산 0.1M", amount: 50, unit: "mL" },
    { name: "염산(0.1M)", amount: 30, unit: "mL" },
    { name: "수산화나트륨", amount: 2, unit: "g" },
    { name: "지시약 엑스", amount: 1, unit: "mL" },
    { name: "아세트산", amount: 5, unit: "g" },
    { name: "페놀프탈레인", amount: 1, unit: "mL" },
  ];
  /** 합친 뒤의 표 (처음 나온 순서·이름) */
  const MERGED = [
    { name: "염산 0.1M", amount: 80, unit: "mL" },
    { name: "수산화나트륨", amount: 2, unit: "g" },
    { name: "지시약 엑스", amount: 1, unit: "mL" },
    { name: "아세트산", amount: 5, unit: "g" },
    { name: "페놀프탈레인", amount: 1, unit: "mL" },
  ];
  const NEW_GROUPS = 10;
  const EDITED = "2.5";
  const dbBefore = basisOf(await schoolReagents(f.school.id));
  // 염산 = 합친 줄(80) + 수동 연결한 "지시약 엑스"(1) → 저장 때 합산 81 (d7 §13 "합친 뒤에도 같은 우리 학교 시약에 연결된 행은 … 합산")
  const HCL_SUM = 80 + 1;
  const want = {
    ...dbBefore,
    [hcl.name]: { min: requiredNumber(HCL_SUM, NEW_GROUPS), per: HCL_SUM, groups: NEW_GROUPS },
    [naoh.name]: { min: requiredNumber(EDITED, NEW_GROUPS), per: Number(EDITED), groups: NEW_GROUPS },
  };
  expect(want[keep.name], "대조: 기존 기준이 더 큰 시약은 그대로").toEqual({ min: 500, per: 50, groups: 10 });
  expect(want[other.name], "대조: 어떤 행에도 연결하지 않은 시약은 그대로 (등록 때의 자동 기준)").toEqual({ min: autoFromIntake(3), per: null, groups: null });

  const { context, page } = await openTemp(browser, info, f.admin, MANUAL_HREF);
  const actions = watchActions(page);
  try {
    await waitManual(page);
    const mock = await mockExtract(page, okReply(items));
    await toResult(page);
    let rows = await readRows(page);
    // 중복 합치기: 같은 열쇠·같은 단위 2행 → 한 줄, 1조 사용량 = 합 (처음 나온 이름·순서)
    expect(rows.map((r) => r.cells[0]), "추출 행 (합친 뒤)").toEqual(MERGED.map((i) => i.name));
    expect(rows[0].cells.slice(1), "합친 줄: 사용량 50 + 30 · 단위 · 필요량").toEqual([String(MERGED[0].amount), "mL", requiredText(MERGED[0].amount, GROUPS, "mL")]);
    expect(rows.map((r) => r.edited), "합친 값은 추출값 (고친 칸 아님)").toEqual(MERGED.map(() => false));
    expect(rows.map((r) => r.linked), "자동 연결").toEqual([optionLabel(hcl), optionLabel(naoh), UNLINKED, optionLabel(keep), UNLINKED]);
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "unlinked", "ok", "unlinked"]);
    expect(rows[0].detail, "합친 줄은 같은 시약에 연결된 다른 행이 없어 저장 합산 안내가 없다").not.toMatch(/같은 시약 \d+행/);

    // 기존 기준 표시
    expect(BASIS_RE.exec(rows[1].detail)?.[1], "수산화나트륨 기존 기준 20").toBe("20");
    expect(toNumber(BASIS_RE.exec(rows[3].detail)?.[1] ?? "NaN"), "아세트산 기존 기준 500").toBe(500);
    expect(rows[3].detail, "아세트산: 기존 기준이 더 커서 그대로").toMatch(/그대로|유지/);

    // 수동 연결: "지시약 엑스" → 염산 — 같은 시약에 연결된 2행: 행마다 자기 필요량 + 합산 안내(합친 필요량)
    await chooseReagent(rowById(page, rows[2].id), (labels) => labels.indexOf(optionLabel(hcl)));
    await expect.poll(async () => (await readRows(page))[2].status).toBe("ok");
    rows = await readRows(page);
    const total = requiredText(HCL_SUM, GROUPS, "mL");
    for (const i of [0, 2]) {
      expect(rows[i].cells[3], `${rows[i].cells[0]} 행의 필요량은 그 행 것`).toBe(requiredText(MERGED[i].amount, GROUPS, "mL"));
      expect(rows[i].detail, `${rows[i].cells[0]} 합산 안내`).toMatch(/합쳐|합산|합친/);
      expect(rows[i].detail, `${rows[i].cells[0]} 합친 필요량 ${total}`).toContain(total);
    }

    // 사용량 고치기 · 조 수 바꾸기
    await amountInput(rowById(page, rows[1].id)).fill(EDITED);
    await groupsInput(page).fill(String(NEW_GROUPS));
    await expect
      .poll(async () => (await readRows(page)).map((r) => r.cells[3]), { message: "고친 값·조 수 10 으로 재계산" })
      .toEqual([
        requiredText(80, NEW_GROUPS, "mL"),
        requiredText(EDITED, NEW_GROUPS, "g"),
        requiredText(1, NEW_GROUPS, "mL"),
        requiredText(5, NEW_GROUPS, "g"),
        requiredText(1, NEW_GROUPS, "mL"),
      ]);
    rows = await readRows(page);
    expect(rows[0].detail, "합친 필요량도 조 수 10 으로").toContain(requiredText(HCL_SUM, NEW_GROUPS, "mL"));
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok", "unlinked"]);
    await expect(saveButton(page)).toBeEnabled();
    expect(actions.count(), "누르기 전 저장 요청 0").toBe(0);

    await saveButton(page).click();
    await expect(savedToast(page), `ex-toast "${TOAST_SAVED}"`).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => new URL(page.url()).pathname, { message: `토스트 뒤 ${REORDER_HREF}`, timeout: 30_000 }).toBe(REORDER_HREF);
    await waitReorder(page);
    expect(actions.count(), "저장 요청 1건").toBe(1);
    expect(mock.seen().length, "추출 요청 1건").toBe(1);

    const after = await schoolReagents(f.school.id);
    expect(basisOf(after), "저장 뒤 재주문 기준 (합산 · 수동 연결 · 더 큰 값 유지)").toEqual(want);
    expect(after.length, "시약 수 그대로 (미연결 행이 시약을 만들지 않는다)").toBe(4);

    // 화면 6: 저장한 두 시약 + 기존 기준이 더 큰 시약은 재고 < 기준 (연결하지 않은 시약은 자동 기준 그대로 — 재고보다 작다)
    const own = await ownReagentsOf((await browserClient(page)).client);
    const low = own.filter((r) => r.stock < r.min_stock);
    expect(low.map((r) => r.name).sort(), "대조: 부족 시약").toEqual([hcl.name, naoh.name, keep.name].sort());
    const shown = await readAlerts(page);
    expect(shown.map((s) => s.name).sort(), "알림 카드").toEqual(low.map((r) => r.name).sort());
    for (const card of shown) expectCardMatches(card, low.find((r) => r.name === card.name)!, `카드 "${card.name}"`);
    expect(basisText(low.find((r) => r.name === hcl.name)!), "염산 기준 문구 = 합산값").toBe(`1반 1회 실험량 ${HCL_SUM} mL × ${NEW_GROUPS}조 기준`);
    expect(basisText(low.find((r) => r.name === naoh.name)!), "수산화나트륨 기준 문구 = 고친 값").toBe(`1반 1회 실험량 ${EDITED} g × ${NEW_GROUPS}조 기준`);
    expect(basisText(low.find((r) => r.name === keep.name)!), "아세트산 기준 문구는 그대로").toBe("1반 1회 실험량 50 g × 10조 기준");
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 일회용 학교 교사: 추출하고 고치기만 하고 저장하지 않으면 DB 변화 0 — 화면 6 으로 떠났다 돌아와도·새로 고쳐도 기준 불변 · 저장 요청 0건`, async ({ browser }, info) => {
  const f = await fresh(info);
  await prepNamed(f, { name: NAME.hcl, unit: HCL.unit, stock: 100, min: 100 });
  await prepNamed(f, { name: NAME.naoh, unit: NAOH.unit, stock: 5 });
  await prepNamed(f, { name: NAME.etoh, unit: ETOH.unit, stock: 500 });
  const dbBefore = await schoolReagents(f.school.id);

  const { context, page } = await openTemp(browser, info, f.teacher, MANUAL_HREF);
  const actions = watchActions(page);
  page.on("dialog", (d) => void d.accept());
  try {
    await waitManual(page);
    const mock = await mockExtract(page);
    await toResult(page);
    const rows = await readRows(page);
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "unlinked", "ok"]);
    await amountInput(rowByName(page, HCL.name)).fill("999");
    await groupsInput(page).fill(String(G_MAX));
    await expect.poll(async () => (await readRows(page))[0].cells[3]).toBe(requiredText(999, G_MAX, HCL.unit));
    await expect(saveButton(page), "저장할 수 있는 상태지만 누르지 않는다").toBeEnabled();
    expect(await schoolReagents(f.school.id), "추출·고치기만으로는 DB 불변").toEqual(dbBefore);

    // "다시 추출" 도 저장하지 않는다
    await retryButton(page).click();
    await expect.poll(() => mock.seen().length, { message: `"${RETRY}" 재요청` }).toBe(2);
    await expect(table(page)).toHaveCount(1, { timeout: 20_000 });
    expect(await schoolReagents(f.school.id), `"${RETRY}" 뒤 DB 불변`).toEqual(dbBefore);

    // 화면 6 으로 떠난다 → 돌아온다
    await backLink(page).click();
    await waitReorder(page);
    const shown = await readAlerts(page);
    expect(shown.map((s) => s.name), "화면 6: 저장하지 않았으니 알림은 준비한 그대로(0건)").toEqual([]);
    const entry = reorderManual(page).locator(`a[href="${MANUAL_HREF}"]`).filter({ hasText: exact(MANUAL_BUTTON) });
    await expect(async () => {
      if (new URL(page.url()).pathname !== MANUAL_HREF) await entry.click({ timeout: 5_000 });
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe(MANUAL_HREF);
    }).toPass({ timeout: 45_000 });
    await waitManual(page);
    expect(await schoolReagents(f.school.id), "떠났다 돌아와도 DB 불변").toEqual(dbBefore);

    await page.reload();
    await waitManual(page);
    await expect(uploadArea(page)).toHaveCount(1);
    expect(await schoolReagents(f.school.id), "새로 고쳐도 DB 불변").toEqual(dbBefore);
    expect(actions.count(), "저장(서버 액션) 요청 0건").toBe(0);
    expect(await countComponent(page, TOAST), "토스트 없음").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 일회용 학교 교사 저장 실패(저장 직전에 연결된 시약이 사라짐): 오류 문구 표시 · 화면 5 2단계 유지(표·고친 값 그대로) · 토스트·이동 없음 · 다른 시약의 기준도 바뀌지 않음`, async ({ browser }, info) => {
  const f = await fresh(info);
  const hcl = await prepNamed(f, { name: NAME.hcl, unit: HCL.unit, stock: 100 });
  await prepNamed(f, { name: NAME.naoh, unit: NAOH.unit, stock: 5 });
  await prepNamed(f, { name: NAME.etoh, unit: ETOH.unit, stock: 500 });

  const { context, page } = await openTemp(browser, info, f.teacher, MANUAL_HREF);
  const actions = watchActions(page);
  try {
    await waitManual(page);
    await mockExtract(page);
    await toResult(page);
    expect((await readRows(page)).map((r) => r.status)).toEqual(["ok", "ok", "unlinked", "ok"]);
    const edited = "7";
    await amountInput(rowByName(page, NAOH.name)).fill(edited);
    await expect(saveButton(page)).toBeEnabled();
    expect(await bottomNotices(page), "누르기 전 안내 없음").toEqual([]);

    // 화면은 모르는 사이에 시약 하나가 지워졌다
    await dropReagent(hcl.id);
    const dbBefore = await schoolReagents(f.school.id);
    expect(dbBefore.map((r) => r.name).sort(), "대조: 남은 시약").toEqual([NAME.naoh, NAME.etoh].sort());

    await saveButton(page).click();
    await expect.poll(() => actions.count(), { message: "저장 요청이 나갔다", timeout: 20_000 }).toBe(1);
    await expect
      .poll(async () => (await bottomNotices(page)).length, { message: "저장 오류 문구", timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    const notices = await bottomNotices(page);
    expect(notices.length, "오류 문구 1개").toBe(1);
    expect(notices[0], "사람이 읽을 한국어 문구").toMatch(/[가-힣]/);
    expect(notices[0], "내부 오류 글자 없음").not.toMatch(/P0002|42501|TypeError|undefined|null|supabase|rpc/i);

    // 화면 유지
    expect(new URL(page.url()).pathname, "화면 5 그대로").toBe(MANUAL_HREF);
    await expect(table(page), "2단계 표 그대로").toHaveCount(1);
    expect((await readRows(page)).map((r) => r.cells[1]), "고친 값 그대로").toEqual([String(HCL.amount), edited, String(PHPH.amount), String(ETOH.amount)]);
    await expect(savedToast(page), "토스트 없음").toHaveCount(0);
    expect(await countComponent(page, TOAST)).toBe(0);
    expect(await schoolReagents(f.school.id), "실패한 저장은 다른 시약도 바꾸지 않는다").toEqual(dbBefore);
    expect(new URL(page.url()).pathname, "이동 없음").toBe(MANUAL_HREF);
    expect(actions.count(), "저장 요청 1건").toBe(1);
  } finally {
    await context.close();
  }
});

// =====================================================================
// N1-ui
// =====================================================================

test(`[N1-ui][S${SCREEN}] 일회용 학교 교사 ${MANUAL_HREF}: "${OUR_REAGENT}" 선택지 = 자기 학교 시약만(DB 대조) — 학교 A·B·다른 일회용 학교 시약 0 · 추출 결과의 시약명이 다른 학교에만 있는 이름이어도 연결되지 않음 · 응답 본문·1단계 화면에 다른 학교 학교명·시약명 0 · 학교명 종류 = rules.json distinct_school_names`, async ({ browser }, info) => {
  const f = await fresh(info);
  const g = await second(info);
  await purge([g.school.id]);
  // 자기 학교: 염산만 대응 시약이 있다. 메탄올·수산화칼륨은 추출 결과(증류수·수산화나트륨)와 다른 시약이다
  const mine = [
    await prepNamed(f, { name: NAME.hcl, unit: "mL", stock: 100 }),
    await prepNamed(f, { name: "메탄올 95%", unit: "mL", stock: 100 }),
    await prepNamed(f, { name: "수산화칼륨", unit: "g", stock: 100 }),
  ];
  // 다른 일회용 학교: 시안의 시약명 그대로 + 그 학교에만 있는 이름
  const unique = `격리시약-${hex()}`;
  const theirs = [
    await prepNamed(g, { name: PHPH.name, unit: "mL", stock: 10 }),
    await prepNamed(g, { name: NAOH.name, unit: "g", stock: 10 }),
    await prepNamed(g, { name: unique, unit: "g", stock: 10 }),
  ];

  const { context, page } = await openTemp(browser, info, f.teacher, MANUAL_HREF);
  const actions = watchActions(page);
  try {
    await waitManual(page);
    const me = await browserSession(page);
    expect(me.schoolName, "일회용 학교").toBe(f.school.name);
    const { client } = await browserClient(page);
    const own = await ownReagentsOf(client);
    expect(own.map((r) => r.name).sort(), "대조: 로그인 세션에 보이는 시약 = 자기 학교 시약").toEqual(mine.map((r) => r.name).sort());

    const others = await otherSchools(f.school.id);
    const schoolA = others.find((o) => o.neis === "TEST-SCHOOL-A");
    const schoolB = others.find((o) => o.neis === "TEST-SCHOOL-B");
    const temp = others.find((o) => o.id === g.school.id);
    expect(schoolA?.reagents.length, "대조: 학교 A 시약").toBeGreaterThan(0);
    expect(schoolB?.reagents.length, "대조: 학교 B 시약").toBeGreaterThan(0);
    expect(temp?.reagents.slice().sort(), "대조: 다른 일회용 학교 시약").toEqual(theirs.map((r) => r.name).sort());

    // 응답 본문 · 1단계 화면
    const res = await context.request.get(MANUAL_HREF);
    expect(res.status(), `${MANUAL_HREF} 응답`).toBe(200);
    const body = await res.text();
    const screenText = await page.locator("body").innerText();
    for (const r of mine) expect(body.includes(r.name), `대조: 응답 본문에 자기 학교 시약 '${r.name}' (선택지 자료)`).toBe(true);
    const compared = expectNoOtherSchool({ "응답 본문": body, "1단계 화면": screenText }, others, [me.schoolName, ...mine.map((r) => r.name)]);
    expect(compared[schoolA!.id], "대조: 학교 A 값 비교 수").toBeGreaterThanOrEqual(2);
    expect(compared[schoolB!.id], "대조: 학교 B 값 비교 수").toBeGreaterThanOrEqual(2);
    expect(compared[temp!.id], "대조: 다른 일회용 학교 값 비교 수 (학교명 + 시약 3)").toBe(4);
    checkSchoolNames(screenText, me.schoolName, "1단계 화면");
    for (const n of schoolNamesOf(body)) expect(me.schoolName, `응답 본문: 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);

    // 2단계: 다른 학교에만 있는 이름을 추출 결과에 섞는다
    const onlyA = schoolA!.reagents.find((n) => !mine.some((m) => m.name.includes(n)) && !FRAME_ITEMS.some((it) => it.name.includes(n)));
    const onlyB = schoolB!.reagents[0];
    expect(onlyA, "대조: 학교 A 에만 있는 시약명").toBeTruthy();
    const items: FakeItem[] = [...FRAME_ITEMS, { name: unique, amount: 3, unit: "g" }, { name: onlyA!, amount: 4, unit: "g" }, { name: onlyB, amount: 5, unit: "mL" }];
    await mockExtract(page, okReply(items));
    await toResult(page);
    const rows = await readRows(page);
    expect(rows.map((r) => r.cells[0]), "추출 행").toEqual(items.map((i) => i.name));
    expect(rows.map((r) => r.linked), "자기 학교에 있는 염산만 연결 — 다른 학교에만 있는 이름·다른 시약은 미연결").toEqual([
      optionLabel(mine[0]),
      UNLINKED,
      UNLINKED,
      UNLINKED,
      UNLINKED,
      UNLINKED,
      UNLINKED,
    ]);
    expect(rows.map((r) => r.status)).toEqual(["ok", ...rows.slice(1).map(() => "unlinked")]);

    // 선택지 = 자기 학교 시약만 (모든 행)
    const wantOptions = [UNLINKED, ...own.map(optionLabel)].sort();
    for (const r of rows) {
      const labels = await optionLabels(rowById(page, r.id));
      expect([...labels].sort(), `${r.cells[0]} 행의 선택지 = 자기 학교 시약`).toEqual(wantOptions);
      for (const o of [...theirs.map((t) => t.name), ...schoolB!.reagents, onlyA!]) {
        expect(labels.some((l) => l.startsWith(`${o} (`)), `${r.cells[0]} 행 선택지에 다른 학교 시약 '${o}'`).toBe(false);
      }
    }
    checkSchoolNames(await page.locator("body").innerText(), me.schoolName, "2단계 화면");
    expect(actions.count(), "저장 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[N1-ui][S${SCREEN}] 학교A 교사·admin ${MANUAL_HREF}: 응답 본문·화면에 다른 학교(학교B·일회용 학교·그 밖의 모든 학교)의 학교명·시약명 0 · 학교명 종류 = rules.json distinct_school_names(${rules.never.N1.distinct_school_names}) · 2단계 선택지 = 로그인 세션에 보이는 자기 학교 시약만 · 저장 요청 0건`, async ({ browser }, info) => {
  const f = await fresh(info);
  const unique = `격리시약-${hex()}`;
  await prepNamed(f, { name: unique, unit: "g", stock: 10 });
  for (const role of ["teacher", "admin"] as const) {
    const { context, page } = await openAs(browser, info, role, SCREEN);
    const saves = await blockSaves(context);
    try {
      await waitManual(page);
      const me = await browserSession(page);
      const schoolId = await ownSchoolId(page);
      expect(schoolId, "일회용 학교와 다른 학교").not.toBe(f.school.id);
      // 다른 스펙이 학교 A 에 잠깐 만들었다 지우는 임시 시약(접두사)은 견주지 않는다
      const stable = (name: string) => !FOREIGN_TEMP.some((p) => name.startsWith(p));
      const own = (await ownReagentsOf((await browserClient(page)).client)).filter((r) => stable(r.name));
      expect(own.length, "대조: 학교 A 시약").toBeGreaterThan(0);

      const others = await otherSchools(schoolId);
      const temp = others.find((o) => o.id === f.school.id);
      const schoolB = others.find((o) => o.neis === "TEST-SCHOOL-B");
      expect(temp?.reagents, "대조: 일회용 학교 시약").toEqual([unique]);
      expect(schoolB?.reagents.length, "대조: 학교 B 시약").toBeGreaterThan(0);

      const res = await context.request.get(MANUAL_HREF);
      expect(res.status(), `${MANUAL_HREF} 응답`).toBe(200);
      const body = await res.text();
      const screenText = await page.locator("body").innerText();
      const compared = expectNoOtherSchool({ "응답 본문": body, "1단계 화면": screenText }, others, [me.schoolName, ...own.map((r) => r.name)]);
      expect(compared[temp!.id], "대조: 일회용 학교 값 비교 수 (학교명 + 시약)").toBe(2);
      expect(compared[schoolB!.id], "대조: 학교 B 값 비교 수").toBeGreaterThanOrEqual(1);
      checkSchoolNames(screenText, me.schoolName, `${role} 1단계 화면`);
      for (const n of schoolNamesOf(body)) expect(me.schoolName, `${role} 응답 본문: 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);

      // 2단계: 다른 학교에만 있는 이름은 연결되지 않고, 선택지는 자기 학교 시약뿐
      const items: FakeItem[] = [...FRAME_ITEMS, { name: unique, amount: 3, unit: "g" }, { name: schoolB!.reagents[0], amount: 5, unit: "mL" }];
      await mockExtract(page, okReply(items));
      await toResult(page);
      const rows = await readRows(page);
      expect(rows.map((r) => r.cells[0])).toEqual(items.map((i) => i.name));
      expect(rows.slice(FRAME_ITEMS.length).map((r) => r.linked), "다른 학교에만 있는 이름은 미연결").toEqual([UNLINKED, UNLINKED]);
      const labels = await optionLabels(rowById(page, rows[rows.length - 1].id));
      expect(labels.filter(stable).sort(), `${role}: 선택지 = 자기 학교 시약`).toEqual([UNLINKED, ...own.map(optionLabel)].sort());
      for (const o of [unique, ...schoolB!.reagents]) expect(labels.some((l) => l.startsWith(`${o} (`)), `${role}: 선택지에 다른 학교 시약 '${o}'`).toBe(false);
      checkSchoolNames(await page.locator("body").innerText(), me.schoolName, `${role} 2단계 화면`);
      expect(saves.count(), "공용 계정 화면의 저장 요청 0건").toBe(0);
    } finally {
      await context.close();
    }
  }
});
