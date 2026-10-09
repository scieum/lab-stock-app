// 화면 11 (시약장 설정) 구조·역할: R-ui · C1 · C2 · V1 — 공용 계정(학교 A)으로 읽기와 저장하지 않는 편집만.
// 기준: harness/d5-gates.md (R-ui·C1·C2·V1), harness/dev-rules.json (routes 11 · route_auth 11·11_note · components),
//       design/rules.json (roles R7 · screens_required 11 · variants 11 · cabinet · tab_bar),
//       디자인 run 20261004-2256 s2-spec "## 화면 11"·"## 상태 화면 11-delete", harness/d7-data.md §9.
// 공용 학교 A 의 시약장·칸·시약 배치는 바꾸지 않는다: "저장"·삭제 확인의 "삭제"·이름 시트의 "저장"·"시약장 추가" 는 누르지 않는다.
// 테스트마다 서버 액션(쓰기 요청) 0건을 단언한다. 쓰기 흐름·빈 상태·시안 상태는 screen-11-write.spec.ts (일회용 학교).
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, ROLE_NAME, browserClient, browserSession, countComponent, devRules, roleChecks, routeOf, rules, sel } from "./screen-helpers";
import { detailPath } from "./screen-3-helpers";
import { anonContext, componentCounts, expectShellHeader, shellNavLabel, shellSchoolScope } from "./shell-helpers";
import {
  ADD,
  CAB,
  CABINETS_HREF,
  CANCEL_BUTTON,
  CHIP,
  CONTINUE_BUTTON,
  DISCARD_BUTTON,
  ROW,
  SLOT_ASSIGN,
  SLOT_SHEET,
  UNSAVED_TITLE,
  acceptBeforeUnload,
  closeSlotSheet,
  expectPills,
  hydrated,
  pill,
  readSlots,
  slotSheet,
  unsavedBody,
  unsavedDialog,
  CLASSES,
  DELETE_BUTTON,
  DELETE_CAPTION,
  DETAIL_SCREEN,
  DOOR_SELECT,
  DOUBLE,
  EDIT,
  HOME_SCREEN,
  INPUT,
  LABEL_MAX,
  LIST_SCREEN,
  LOGIN_SCREEN,
  MIX,
  MIX_EXAMPLE,
  MODAL,
  NAV_LABEL,
  OUTLINE,
  PRIMARY,
  RENAME_BUTTON,
  REQUIRED,
  ROLE_RULES,
  SAVE_BUTTON,
  SCREEN,
  SHELF_SELECT,
  SLOT,
  SWITCHER,
  UNSET,
  VARIANTS,
  activePills,
  addButton,
  boxOf,
  dbView,
  deleteButton,
  deleteDialog,
  deleteNotice,
  dialogInput,
  doorRadio,
  edit,
  exact,
  expectActive,
  expectBoard,
  expectHeader,
  expectMix,
  expectTabBar,
  foreignComponents,
  frameCounts,
  gridKeys,
  highlightSoft,
  legendChips,
  main,
  mix,
  mixLine,
  mixLines,
  modal,
  onTop,
  outlineIn,
  pickChips,
  pickDoor,
  pickShelves,
  pillLabels,
  primaryIn,
  renameButton,
  renameDialog,
  saveButton,
  selectSlot,
  setChip,
  setClasses,
  shelfRadio,
  sidesOf,
  slotAt,
  slotCount,
  slotName,
  slots,
  switcher,
  waitCabinets,
  waitEditable,
  watchActions,
  type DbCabinet,
  type DbView,
} from "./screen-11-helpers";

const R7 = ROLE_RULES.R7;
const STAFF: Role[] = ["teacher", "admin"];
const withC = (id: string) => `${CABINETS_HREF}?c=${id}`;

/** 시약장의 칸 분류 (DB) — 행이 없는 칸은 미지정 */
const classesOf = (db: DbView, cab: DbCabinet) => db.classes[cab.id] ?? {};

/** 화면 11 을 연 채로 열린 시약장 = 첫 pill 의 시약장 (dev-rules 11_note: `?c` 가 없으면 첫 시약장) */
async function firstCabinet(page: Page, db: DbView): Promise<DbCabinet> {
  const first = (await pillLabels(page))[0];
  const cab = db.cabinets.find((c) => c.label === first);
  expect(cab, `첫 pill "${first}" 은 자기 학교 시약장`).toBeTruthy();
  return cab!;
}

/** 분류가 없는 칸 하나 (편집 흉내용 — 저장하지 않는다) */
function blankKey(db: DbView, cab: DbCabinet): string {
  const keys = gridKeys(cab.door_type, cab.shelves);
  const key = [...keys].reverse().find((k) => (classesOf(db, cab)[k] ?? []).length === 0);
  expect(key, `대조: "${cab.label}" 에 미지정 칸이 있다 (seed)`).toBeTruthy();
  return key!;
}

// =====================================================================
// R-ui
// =====================================================================

test(`[R-ui][S${SCREEN}] 규칙 전제: rules.json R7 = 학생의 ${EDIT}·${ADD} max · screens_required·variants ${SCREEN} · dev-rules routes·components ${SCREEN}`, () => {
  expect(R7.role).toBe(ROLE_NAME.student);
  expect(R7.components).toEqual(expect.arrayContaining([EDIT, ADD]));
  expect(typeof R7.max).toBe("number");
  // rules 1.15 R7 = cabinet-edit·cabinet-add·slot-assign·location-edit·qr-print — 화면 11 것과 화면 3 것(location-edit)이 섞여 있다.
  // R7 컴포넌트마다 dev-rules components 에 화면이 1개 이상 있고, 화면 11 것은 화면 11 에, 나머지는 화면 3 에 있다 (화면별 단언).
  const r7OnScreen = R7.components!.filter((c) => (devRules.components[c] ?? []).includes(SCREEN));
  for (const c of R7.components!) {
    const screens = devRules.components[c] ?? [];
    expect(screens.length, `dev-rules components ${c} 에 화면이 있다`).toBeGreaterThan(0);
    if (!screens.includes(SCREEN)) expect(screens, `R7 ${c} 은 화면 ${SCREEN} 이 아니면 화면 3 (location-edit)`).toContain(3);
  }
  expect(r7OnScreen, `R7 중 화면 ${SCREEN} 컴포넌트에 ${EDIT}·${ADD} 포함`).toEqual(expect.arrayContaining([EDIT, ADD]));
  const student = roleChecks(SCREEN, ROLE_NAME.student).filter((c) => c.rule === "R7");
  expect(student.map((c) => c.component).sort()).toEqual([...R7.components!].sort());
  for (const role of STAFF) expect(roleChecks(SCREEN, ROLE_NAME[role as keyof typeof ROLE_NAME]).filter((c) => c.rule === "R7")).toEqual([]);
  expect(REQUIRED.length, `screens_required ${SCREEN}`).toBeGreaterThan(0);
  for (const c of [...REQUIRED, ...VARIANTS.empty, ...VARIANTS.delete]) expect(devRules.components[c], `dev-rules components ${c}`).toContain(SCREEN);
  expect(CABINETS_HREF).toBe("/cabinets");
  expect(CAB.manage_roles.sort()).toEqual([ROLE_NAME.admin, ROLE_NAME.teacher].sort());
});

for (const role of SCHOOL_A_ROLES) {
  const roleName = ROLE_NAME[role as keyof typeof ROLE_NAME];
  const staff = STAFF.includes(role);
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${CABINETS_HREF} 렌더(리다이렉트 없음) · roles R1~R7 개수 · ${EDIT}·${ADD} ${staff ? "= 시안 개수" : "0 (R7) — 문 형태·단 수 선택·고르는 칩·저장·이름 바꾸기·삭제 0, 칸은 누를 수 없는 요소"} · 화면 ${SCREEN} 밖 컴포넌트 0`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, viewport, response } = await openAs(browser, info, role, SCREEN);
    const actions = watchActions(page);
    try {
      expect(response?.status(), `${CABINETS_HREF} 응답`).toBe(200);
      await waitCabinets(page);
      expect(new URL(page.url()).pathname, "리다이렉트 없음").toBe(CABINETS_HREF);
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const db = await dbView(page);
      expect(db.cabinets.length, "대조: 자기 학교 시약장 ≥1").toBeGreaterThan(0);

      // rules.json roles R1~R7
      for (const c of roleChecks(SCREEN, roleName)) {
        const n = await countComponent(page, c.component);
        if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
        else expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
      }
      // 화면 11 에 속하지 않는 컴포넌트(다른 역할 제한 컴포넌트 포함: stock-intake·reagent-register·user-manage …)는 0
      const foreign = foreignComponents();
      for (const c of ["stock-intake", "reagent-register", "user-manage"]) expect(foreign, `대조: ${c} 는 화면 ${SCREEN} 밖`).toContain(c);
      expect(await componentCounts(page.locator("body"), foreign), `화면 ${SCREEN} 밖 컴포넌트`).toEqual(Object.fromEntries(foreign.map((n) => [n, 0])));

      // 보기는 모든 역할: 전환 pill = 자기 학교 시약장(번호 = DB number · 이름), 배치도(칸마다 slot-count = DB), 범례
      await expect(switcher(page)).toHaveCount(1);
      expect((await pillLabels(page)).sort(), "pill = 자기 학교 시약장 이름").toEqual(db.cabinets.map((c) => c.label).sort());
      await expectPills(page, db.cabinets, ROLE_LABEL[role]);
      const cab = await firstCabinet(page, db);
      await expectHeader(page, cab.label, cab.door_type, cab.shelves, ROLE_LABEL[role], cab.number);
      await expectBoard(page, cab.door_type, cab.shelves, classesOf(db, cab), ROLE_LABEL[role], db.counts[cab.id]);
      await expect(legendChips(page).filter({ hasText: exact(UNSET) }), `범례 칩 "${UNSET}"`).toHaveCount(1);

      const frame = frameCounts(`${SCREEN}-${viewport}`);
      if (staff) {
        await expect(edit(page), `${EDIT} = 시안 개수`).toHaveCount(frame[EDIT]);
        await expect(page.locator(sel(ADD)), `${ADD} = 시안 개수`).toHaveCount(frame[ADD]);
        await expect(addButton(page)).toBeVisible();
        await expect(renameButton(page)).toBeVisible();
        await expect(deleteButton(page)).toBeVisible();
        await expect(saveButton(page)).toHaveCount(1);
        await expect(main(page).locator(sel(DOOR_SELECT))).toHaveCount(frame[DOOR_SELECT]);
        await expect(main(page).locator(sel(SHELF_SELECT))).toHaveCount(frame[SHELF_SELECT]);
        // 칸은 누르는 요소
        for (const tag of await slots(page).evaluateAll((els) => els.map((e) => e.tagName))) expect(tag, "교사·admin 의 칸은 버튼").toBe("BUTTON");
      } else {
        for (const c of R7.components!) {
          expect(await countComponent(page, c), `R7 ${c}`).toBe(R7.max);
          expect(await response!.text(), `응답 본문에 ${c}`).not.toContain(`data-component="${c}"`);
        }
        for (const c of [DOOR_SELECT, SHELF_SELECT, PRIMARY, OUTLINE, MODAL, INPUT]) expect(await countComponent(page, c), `학생 화면 ${c}`).toBe(0);
        await expect(pickChips(page), "학생 화면에 고르는 칩").toHaveCount(0);
        for (const label of [SAVE_BUTTON, RENAME_BUTTON, DELETE_BUTTON]) {
          await expect(main(page).getByRole("button", { name: exact(label) }), `학생 화면 "${label}" 버튼`).toHaveCount(0);
        }
        await expect(main(page).getByRole("button", { name: /시약장 추가/ }), "학생 화면 시약장 추가").toHaveCount(0);
        await expect(main(page).getByRole("radio"), "학생 화면 선택 컨트롤").toHaveCount(0);
        // 칸 (1.15 s2-spec 화면 11 cabinet-slot: 학생도 칸을 눌러 그 칸 시약 목록(slot-sheet)을 본다 — 목록만):
        // 칸 안에 다른 누르는 요소 없음, 선택 상태(연하늘) 없음, 눌러도 고르는 칩·선택 표시가 생기지 않는다
        const info0 = await slots(page).evaluateAll((els) =>
          els.map((e) => ({ inner: e.querySelectorAll("button, a, input").length, pressed: e.getAttribute("aria-pressed") })),
        );
        for (const s of info0) {
          expect(s.inner, "칸 안에 누르는 요소 없음").toBe(0);
          expect(s.pressed, "학생 칸에 선택 상태 없음").not.toBe("true");
        }
        const bg = await slots(page).evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
        expect(bg, "학생 화면에 선택된 칸(연하늘) 없음").not.toContain(highlightSoft());
        await hydrated(slots(page).first());
        for (const key of [gridKeys(cab.door_type, cab.shelves)[0], gridKeys(cab.door_type, cab.shelves).at(-1)!]) {
          await slotAt(page, cab.door_type, key).click();
          const sheet = slotSheet(page);
          await expect(sheet, `학생 칸 ${key} 누름 → ${SLOT_SHEET}`).toBeVisible();
          const want = (db.inSlot[cab.id][key] ?? []).map((r) => r.name).sort();
          expect((await sheet.locator(sel(ROW)).allInnerTexts()).length, `${SLOT_SHEET} 행 수 = DB 그 칸 시약 수`).toBe(want.length);
          for (const n of want) await expect(sheet.locator(sel(ROW)).filter({ hasText: n }), `${SLOT_SHEET} 행 "${n}"`).toHaveCount(1);
          await expect(sheet.locator(sel(SLOT_ASSIGN)), `학생 ${SLOT_SHEET} 에 ${SLOT_ASSIGN}`).toHaveCount(0);
          await expect(sheet.getByRole("button", { name: /빼기/ }), `학생 ${SLOT_SHEET} 에 "빼기"`).toHaveCount(0);
          await expect(pickChips(page), "학생에게 고르는 칩 없음").toHaveCount(0);
          expect(await slots(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed"))), "눌러도 선택 칸이 생기지 않는다").not.toContain("true");
          expect(await slots(page).evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor)), "눌러도 칸 모양이 그대로").toEqual(bg);
          await closeSlotSheet(page);
        }
        await expect(legendChips(page).filter({ hasText: /선택/ }), "학생 범례에 '선택 칸' 없음").toHaveCount(0);
      }

      // 셸: 데스크탑 = app-sidebar 현재 메뉴(시안 11-desktop "시약장") / 모바일 = nav-pill 제목 (rules 1.22 desktop_shell)
      const nav = shellSchoolScope(page, viewport);
      await expect(nav).toHaveCount(1);
      if (viewport === "desktop") {
        await expect(nav.locator('a[aria-current="page"]'), "현재 메뉴 링크").toHaveText(exact(shellNavLabel(viewport, SCREEN, NAV_LABEL)));
        await expectShellHeader(page, viewport, { schoolName: me.schoolName }, "화면 11");
      } else {
        await expect(nav.getByText(exact(NAV_LABEL)).first(), `nav-pill 제목 "${NAV_LABEL}"`).toBeVisible();
      }
      await expect(nav, "셸 학교명").toContainText(me.schoolName);
      expect(actions.count(), "쓰기 요청 0건").toBe(0);
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S${SCREEN}] 비로그인 ${CABINETS_HREF}(· ?c=) 접근 → ${routeOf(LOGIN_SCREEN)} · 화면 ${SCREEN} 컴포넌트·학교명·시약장 이름 미노출`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  // 대조: 학교 A 시약장 id·이름 (교사 세션으로 읽기)
  const t = await openAs(browser, info, "teacher", SCREEN);
  let db: DbView;
  try {
    await waitCabinets(t.page);
    db = await dbView(t.page);
  } finally {
    await t.context.close();
  }
  const context = await anonContext(browser, info);
  try {
    const page = await context.newPage();
    for (const path of [CABINETS_HREF, withC(db.cabinets[0].id)]) {
      const res = await context.request.get(path, { maxRedirects: 0 });
      expect(res.status(), `비로그인 ${path} 는 리다이렉트`).toBeGreaterThanOrEqual(300);
      expect(res.status()).toBeLessThan(400);
      expect(new URL(res.headers()["location"], info.project.use.baseURL).pathname).toBe(routeOf(LOGIN_SCREEN));
      const html = await res.text();
      for (const c of [SWITCHER, EDIT, ADD, SLOT, MIX]) expect(html, `응답 본문에 ${c}`).not.toContain(`data-component="${c}"`);
      expect(html, "응답 본문에 학교명").not.toMatch(new RegExp(rules.never.N1.school_name_pattern));
      for (const c of db.cabinets) expect(html, `응답 본문에 시약장 이름 "${c.label}"`).not.toContain(c.label);

      await page.goto(path);
      await page.waitForURL((u) => u.pathname === routeOf(LOGIN_SCREEN), { timeout: 30_000 });
      await expect(page.locator(sel("ex-auth-form-card")).first(), "로그인 화면").toBeVisible();
      for (const c of [SWITCHER, EDIT, ADD, SLOT, CHIP, MIX]) expect(await countComponent(page, c), `비로그인 ${c}`).toBe(0);
    }
  } finally {
    await context.close();
  }
});

for (const role of SCHOOL_A_ROLES) {
  const roleName = ROLE_NAME[role as keyof typeof ROLE_NAME];
  // rules 1.15 R7 = cabinet-edit·cabinet-add·slot-assign·location-edit·qr-print. 화면마다 그 화면 소속(dev-rules components) R7 컴포넌트는
  // 학생 0 · 교사·admin ≥ 1, 소속이 아닌 R7 컴포넌트는 모든 역할 0 (예: location-edit 는 화면 3 에서 교사·admin 에게 있다)
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 홈·시약 목록·시약 상세: R7(${(R7.components ?? []).join("·")}) 중 그 화면 소속이 아닌 것 0${role === "student" ? " · 소속인 것도 0 (R7)" : " · 소속인 것(시약 상세 location-edit)은 있음"} · 응답 본문도 같음`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const first = await openAs(browser, info, role, HOME_SCREEN);
    try {
      const { page, context } = first;
      const db = await dbView(page);
      expect(db.reagentNames.length, "대조: 자기 학교 시약").toBeGreaterThan(0);
      const { client } = await browserClient(page);
      const one = await client.from("reagents").select("id").not("slot_id", "is", null).order("id").limit(1).single();
      expect(one.error, "대조: 칸에 배치된 시약 1개").toBeNull();
      // 화면 2·3 표식: 390 = reagent-row · reagent-detail-card / 1440 = data-table 행 · 오른쪽 detail-drawer (d7 §23 run b)
      const desk = first.viewport === "desktop";
      const visits: [number, string, string][] = [
        [HOME_SCREEN, routeOf(HOME_SCREEN), sel("home-summary")],
        [LIST_SCREEN, routeOf(LIST_SCREEN), desk ? `${sel("data-table")} ${sel("ex-data-table-cell")}` : sel("reagent-row")],
        [DETAIL_SCREEN, detailPath(one.data!.id as string), desk ? sel("detail-drawer") : sel("reagent-detail-card")],
      ];
      for (const [screen, path, marker] of visits) {
        const res = await page.goto(path);
        expect(res?.status(), `${path} 응답`).toBe(200);
        await expect(page.locator(`main ${marker}`).first(), `화면 ${screen} 본문`).toBeVisible({ timeout: 45_000 });
        await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
        const html = await (await context.request.get(path)).text();
        let onScreen = 0;
        for (const c of R7.components!) {
          const belongs = (devRules.components[c] ?? []).includes(screen);
          if (belongs && role !== "student") {
            onScreen += 1;
            expect(await countComponent(page, c), `화면 ${screen} ${c} (교사·admin, 화면 소속)`).toBeGreaterThanOrEqual(1);
            expect(html, `화면 ${screen} 응답 본문에 ${c}`).toContain(`data-component="${c}"`);
            continue;
          }
          expect(await countComponent(page, c), `화면 ${screen} ${c}`).toBe(R7.max);
          expect(html, `화면 ${screen} 응답 본문에 ${c}`).not.toContain(`data-component="${c}"`);
        }
        if (screen === DETAIL_SCREEN && role !== "student") expect(onScreen, "대조: 시약 상세에 화면 소속 R7 컴포넌트(location-edit)가 있다").toBeGreaterThanOrEqual(1);
        for (const c of roleChecks(screen, roleName).filter((x) => x.rule === "R7")) {
          expect(await countComponent(page, c.component), `${c.rule} ${c.component} ≤ ${c.value} (화면 ${screen})`).toBeLessThanOrEqual(c.value);
        }
      }
    } finally {
      await first.context.close();
    }
  });
}

for (const role of STAFF) {
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 편집 가능: 칸 선택 → 칩 토글이 칸 글자에 반영 · 문 형태·단 수 변경 → 칸 수 · "${SAVE_BUTTON}" 활성 (저장하지 않음 — 새로 열면 DB 값 그대로, 쓰기 요청 0건)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    const actions = watchActions(page);
    try {
      await waitEditable(page);
      const before = await dbView(page);
      const cab = await firstCabinet(page, before);
      const want = { ...classesOf(before, cab) };
      await expect(saveButton(page), "처음에는 바뀐 것이 없다").toBeDisabled();

      const key = blankKey(before, cab);
      await selectSlot(page, cab.door_type, key);
      await expect(pickChips(page), "고르는 칩 = 분류 종류 수").toHaveCount(CLASSES.length);
      const cls = CLASSES[CLASSES.length - 1];
      await setChip(page, cls, true);
      want[key] = [cls];
      await expectBoard(page, cab.door_type, cab.shelves, want, "칩을 켠 뒤");
      await expect(saveButton(page), "바뀐 것이 있으면 저장 가능").toBeEnabled();

      const otherDoor = CAB.door_types.find((d) => d !== cab.door_type)!;
      const otherShelves = CAB.shelves.find((n) => n !== cab.shelves)!;
      await pickDoor(page, otherDoor);
      await pickShelves(page, otherShelves);
      await expect(slots(page), "칸 수 = 문 형태 × 단 수").toHaveCount(slotCount(otherDoor, otherShelves));
      await expect(saveButton(page)).toBeEnabled();

      // 저장하지 않고 다시 연다 → 브라우저 기본 확인(beforeunload, d7 §14)을 받아들이면 DB 값 그대로
      const unload = acceptBeforeUnload(page);
      await page.reload();
      expect(unload.count(), "편집 중 새로고침 = 브라우저 기본 확인 1번").toBe(1);
      await waitEditable(page);
      const after = await dbView(page);
      expect(after.cabinets, "시약장 행 그대로").toEqual(before.cabinets);
      expect(after.classes, "칸 분류 그대로").toEqual(before.classes);
      await expectBoard(page, cab.door_type, cab.shelves, classesOf(before, cab), "다시 연 뒤");
      await expect(saveButton(page)).toBeDisabled();
      expect(actions.count(), "쓰기 요청 0건").toBe(0);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// C1 (학교 A 교사 — 저장하지 않음)
// =====================================================================

test(`[C1][S${SCREEN}] 학교A 교사 기본 상태: rules.json screens_required[${SCREEN}] 전부 존재 (${MIX} 은 한 칸에 비호환 조합을 골라 확인 — 저장하지 않음) · 칩 ${CLASSES.length}종 = 규칙 순서`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    const db = await dbView(page);
    const cab = await firstCabinet(page, db);
    for (const c of REQUIRED.filter((x) => x !== MIX)) {
      expect(await countComponent(page, c), `screens_required ${c}`).toBeGreaterThanOrEqual(1);
      await expect(main(page).locator(sel(c)).first(), `${c} 보임`).toBeVisible();
    }
    // 저장된 상태의 경고 = DB 의 칸 분류로 정해진다
    await expectMix(page, cab.door_type, cab.shelves, classesOf(db, cab), "저장된 상태");

    const key = blankKey(db, cab);
    await selectSlot(page, cab.door_type, key);
    expect((await pickChips(page).allInnerTexts()).map((t) => t.trim()), "칩 = rules.json cabinet.storage_classes 순서").toEqual(CLASSES);
    const pair = CAB.incompatible[0];
    await setClasses(page, pair);
    expect(REQUIRED, `screens_required 에 ${MIX}`).toContain(MIX);
    await expect(mix(page), `screens_required ${MIX}`).toHaveCount(1);
    await expect(mix(page)).toBeVisible();
    await expectMix(page, cab.door_type, cab.shelves, { ...classesOf(db, cab), [key]: pair }, "비호환 조합을 고른 뒤");
    for (const c of REQUIRED) expect(await countComponent(page, c), `screens_required ${c}`).toBeGreaterThanOrEqual(1);
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A 교사: 시약장마다 ?c={id} → 이름·요약(문 형태 · 단 수)·칸 수(문 형태 × 단 수)·칸 글자 = DB · 활성 pill 1개 · 배치도 좌/우 열·단 행 배치`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  try {
    await waitCabinets(page);
    const db = await dbView(page);
    expect(db.cabinets.length, "대조: 학교 A 시약장 2개 이상 (seed)").toBeGreaterThanOrEqual(2);
    expect((await pillLabels(page)).sort()).toEqual(db.cabinets.map((c) => c.label).sort());
    await expectPills(page, db.cabinets, "학교 A");
    for (const cab of db.cabinets) {
      const res = await page.goto(withC(cab.id));
      expect(res?.status()).toBe(200);
      await waitCabinets(page);
      expect(new URL(page.url()).searchParams.get("c"), "주소의 c").toBe(cab.id);
      await expectActive(page, cab.label, cab.label);
      await expectHeader(page, cab.label, cab.door_type, cab.shelves, cab.label);
      await expectActive(page, cab.label, `${cab.label} 번호`, cab.number);
      await expectHeader(page, cab.label, cab.door_type, cab.shelves, `${cab.label} 번호`, cab.number);
      await expectBoard(page, cab.door_type, cab.shelves, classesOf(db, cab), cab.label, db.counts[cab.id]);
      await expectMix(page, cab.door_type, cab.shelves, classesOf(db, cab), cab.label);
      await expect(doorRadio(page, cab.door_type), "문 형태 선택 = DB").toBeChecked();
      await expect(shelfRadio(page, cab.shelves), "단 수 선택 = DB").toBeChecked();
      await expect(main(page).locator(`${sel(DOOR_SELECT)} input:checked`), "문 형태는 하나만 선택").toHaveCount(1);
      await expect(main(page).locator(`${sel(SHELF_SELECT)} input:checked`), "단 수는 하나만 선택").toHaveCount(1);

      // 배치: 같은 단은 같은 높이, 단은 위에서 아래로, 양문형은 좌 열이 우 열의 왼쪽
      const keys = gridKeys(cab.door_type, cab.shelves);
      const boxes = await slots(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })));
      const at = (k: string) => boxes[keys.indexOf(k)];
      for (let shelf = 1; shelf <= cab.shelves; shelf += 1) {
        if (shelf > 1) expect(at(`L${shelf}`).y, `${shelf}단은 ${shelf - 1}단 아래`).toBeGreaterThan(at(`L${shelf - 1}`).y);
        if (sidesOf(cab.door_type).length === 2) {
          expect(Math.abs(at(`L${shelf}`).y - at(`R${shelf}`).y), `${shelf}단 좌·우 같은 높이`).toBeLessThanOrEqual(1);
          expect(at(`L${shelf}`).x + at(`L${shelf}`).w, `${shelf}단: 좌 칸이 우 칸의 왼쪽`).toBeLessThanOrEqual(at(`R${shelf}`).x);
        }
        expect(Math.abs(at(`L${shelf}`).w - at("L1").w), "칸은 같은 크기").toBeLessThanOrEqual(1);
        expect(Math.abs(at(`L${shelf}`).h - at("L1").h), "칸은 같은 크기").toBeLessThanOrEqual(1);
      }
    }
    const doors = new Set(db.cabinets.map((c) => `${c.door_type}/${c.shelves}`));
    expect(doors.size, "대조: 서로 다른 문 형태·단 수의 시약장을 봤다").toBeGreaterThanOrEqual(2);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A 교사: 문 형태(${CAB.door_types.join("/")})·단 수(${CAB.shelves.join("/")}) 를 바꾸면 칸 수 = 문 형태 × 단 수 로 즉시 바뀜 (열 수·행 수) · 옵션은 한 번에 하나 · 원래대로 돌리면 "${SAVE_BUTTON}" 비활성 (저장하지 않음)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    const db = await dbView(page);
    const cab = await firstCabinet(page, db);
    expect((await main(page).locator(`${sel(DOOR_SELECT)} label`).allInnerTexts()).map((t) => t.trim()), "문 형태 옵션 = rules.json").toEqual(CAB.door_types);
    expect((await main(page).locator(`${sel(SHELF_SELECT)} label`).allInnerTexts()).map((t) => t.trim()), "단 수 옵션 = rules.json").toEqual(CAB.shelves.map((n) => `${n}단`));
    await expect(saveButton(page)).toBeDisabled();
    for (const door of CAB.door_types) {
      for (const shelves of CAB.shelves) {
        await pickDoor(page, door);
        await pickShelves(page, shelves);
        await expect(slots(page), `${door} ${shelves}단 칸 수`).toHaveCount(slotCount(door, shelves));
        await expect(main(page).locator(`${sel(DOOR_SELECT)} input:checked`)).toHaveCount(1);
        await expect(main(page).locator(`${sel(SHELF_SELECT)} input:checked`)).toHaveCount(1);
        const boxes = await slots(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: Math.round(r.left), y: Math.round(r.top) })));
        expect(new Set(boxes.map((b) => b.x)).size, `${door}: 열 수`).toBe(sidesOf(door).length);
        expect(new Set(boxes.map((b) => b.y)).size, `${shelves}단: 행 수`).toBe(shelves);
        const changed = door !== cab.door_type || shelves !== cab.shelves;
        if (changed) await expect(saveButton(page), `${door} ${shelves}단: 바뀌었으면 저장 가능`).toBeEnabled();
        else await expect(saveButton(page), `${door} ${shelves}단: DB 와 같으면 저장 비활성`).toBeDisabled();
        // 남아 있는 칸의 분류는 그대로 보인다
        const keep = Object.fromEntries(gridKeys(door, shelves).map((k) => [k, classesOf(db, cab)[k] ?? []]));
        await expectBoard(page, door, shelves, keep, `${door} ${shelves}단`);
      }
    }
    await pickDoor(page, cab.door_type);
    await pickShelves(page, cab.shelves);
    await expectBoard(page, cab.door_type, cab.shelves, classesOf(db, cab), "원래대로");
    await expect(saveButton(page), "원래대로 돌리면 저장 비활성").toBeDisabled();
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
    expect((await dbView(page)).cabinets, "DB 그대로").toEqual(db.cabinets);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A 교사: 칸 선택(한 번에 하나, 선택 칸 = 연하늘) · 분류 여러 개 토글 → 칸 글자가 규칙 순서로 갱신 · 끄면 빠지고 다 끄면 "${UNSET}" · 다른 칸을 고르면 그 칸의 분류가 눌린 상태 · "${SAVE_BUTTON}" 은 바뀐 것이 있을 때만 활성 (저장하지 않음)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    const db = await dbView(page);
    const cab = await firstCabinet(page, db);
    const base = classesOf(db, cab);
    const want: Record<string, readonly string[]> = { ...base };
    const pressed = async () => (await pickChips(page).evaluateAll((els) => els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => (e as HTMLElement).innerText.trim())));

    const key = blankKey(db, cab);
    const slot = await selectSlot(page, cab.door_type, key);
    expect(await slot.evaluate((e) => getComputedStyle(e).backgroundColor), "선택된 칸 배경 = rules.json highlight 연하늘").toBe(highlightSoft());
    await expect(legendChips(page).filter({ hasText: /선택/ }), "범례에 선택 칸 칩").toHaveCount(1);
    await expect(pickChips(page)).toHaveCount(CLASSES.length);
    expect(await pressed(), "미지정 칸: 눌린 칩 없음").toEqual([]);
    await expect(saveButton(page)).toBeDisabled();

    // 규칙 순서의 반대로 세 개를 켠다 → 칸 글자는 규칙 순서
    const picks = [CLASSES[CLASSES.length - 1], CLASSES[5], CLASSES[0]];
    expect(CAB.incompatible.some(([a, b]) => picks.includes(a) && picks.includes(b)), "대조: 고른 분류는 서로 호환").toBe(false);
    const on: string[] = [];
    for (const c of picks) {
      await setChip(page, c, true);
      on.push(c);
      want[key] = [...on];
      await expectBoard(page, cab.door_type, cab.shelves, want, `"${on.join("·")}" 를 켠 뒤`);
      expect(await pressed(), "눌린 칩 (규칙 순서)").toEqual(CLASSES.filter((x) => on.includes(x)));
      await expect(saveButton(page)).toBeEnabled();
    }
    await expectMix(page, cab.door_type, cab.shelves, want, "호환 조합");

    // 다른 칸(분류가 있는 칸)을 고르면 그 칸의 분류가 눌려 있다
    const filled = gridKeys(cab.door_type, cab.shelves).find((k) => (base[k] ?? []).length > 0 && k !== key);
    expect(filled, "대조: 분류가 있는 칸 (seed)").toBeTruthy();
    await selectSlot(page, cab.door_type, filled!);
    expect(await pressed(), `칸 ${filled} 의 분류`).toEqual(base[filled!]);
    expect(await slot.evaluate((e) => getComputedStyle(e).backgroundColor), "앞서 고른 칸은 선택이 풀린다").not.toBe(highlightSoft());
    await expectBoard(page, cab.door_type, cab.shelves, want, "다른 칸을 고른 뒤 (편집은 남는다)");

    // 다시 돌아와 하나씩 끈다
    await selectSlot(page, cab.door_type, key);
    expect(await pressed()).toEqual(CLASSES.filter((x) => on.includes(x)));
    for (const c of [...picks]) {
      await setChip(page, c, false);
      on.splice(on.indexOf(c), 1);
      want[key] = [...on];
      await expectBoard(page, cab.door_type, cab.shelves, want, `"${c}" 를 끈 뒤`);
    }
    expect((await readSlots(page))[gridKeys(cab.door_type, cab.shelves).indexOf(key)].tokens, "다 끄면 미지정").toEqual([UNSET]);
    await expect(saveButton(page), "원래대로 돌아오면 저장 비활성").toBeDisabled();
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
    expect((await dbView(page)).classes, "DB 그대로").toEqual(db.classes);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A 교사: rules.json cabinet.incompatible ${CAB.incompatible.length}쌍마다 ${MIX} 한 줄 "{칸}: {A}과 {B}는 섞이면 위험해요. 다른 칸에 나눠 보관하세요" + 칸 경고 아이콘, 풀면 사라짐 · 시안 예시 "${MIX_EXAMPLE}" · 두 쌍이면 두 줄 · 경고가 있어도 "${SAVE_BUTTON}" 활성 (저장하지 않음)`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    const db = await dbView(page);
    // 양문형 시약장에서 한다 (칸 이름 "좌1단")
    const cab = db.cabinets.find((c) => c.door_type === DOUBLE);
    expect(cab, "대조: 양문형 시약장 (seed)").toBeTruthy();
    await page.goto(withC(cab!.id));
    await waitEditable(page);
    const base = classesOf(db, cab!);
    expect(gridKeys(cab!.door_type, cab!.shelves).flatMap((k) => (CAB.incompatible.some(([a, b]) => (base[k] ?? []).includes(a) && (base[k] ?? []).includes(b)) ? [k] : [])), "대조: 저장된 상태에는 비호환 칸이 없다").toEqual([]);
    await expect(mix(page), "비호환 조합이 없으면 경고 없음").toHaveCount(0);

    const key = blankKey(db, cab!);
    const name = slotName(cab!.door_type, key);
    const slot = await selectSlot(page, cab!.door_type, key);
    for (const [a, b] of CAB.incompatible) {
      await setClasses(page, [a, b]);
      await expect(mix(page), `${a}+${b}: ${MIX}`).toHaveCount(1);
      await expect(mixLines(page), `${a}+${b}: 한 줄`).toHaveCount(1);
      await expect(mixLines(page)).toHaveText(mixLine(name, a, b));
      await expect(slot.locator("svg"), `${a}+${b}: 칸 경고 아이콘`).toHaveCount(1);
      await expectBoard(page, cab!.door_type, cab!.shelves, { ...base, [key]: [a, b] }, `${a}+${b}`);
      await expect(saveButton(page), "경고는 저장을 막지 않는다").toBeEnabled();
      // 한쪽을 끄면 사라진다
      await setChip(page, b, false);
      await expect(mix(page), `${b} 해제: 경고 사라짐`).toHaveCount(0);
      await expect(slot.locator("svg"), "칸 경고 아이콘 사라짐").toHaveCount(0);
    }
    // 한 칸에 두 쌍 → 두 줄
    const triple = CLASSES.filter((c) => ["산", "염기", "인화성"].includes(c));
    const pairs = CAB.incompatible.filter(([a, b]) => triple.includes(a) && triple.includes(b));
    expect(pairs.length, "대조: 산·염기·인화성 안의 비호환 쌍").toBeGreaterThanOrEqual(2);
    await setClasses(page, triple);
    await expectMix(page, cab!.door_type, cab!.shelves, { ...base, [key]: triple }, "세 분류");
    await expect(mixLines(page)).toHaveCount(pairs.length);
    await setClasses(page, []);
    await expect(mix(page)).toHaveCount(0);

    // 시안 예시: 좌1단 = 산 + 염기
    await selectSlot(page, cab!.door_type, "L1");
    await setClasses(page, ["산", "염기"]);
    await expect(mixLines(page)).toHaveCount(1);
    await expect(mixLines(page), "시안 예시 문구").toHaveText(exact(MIX_EXAMPLE));
    await expect(mix(page).getByRole("heading", { name: exact("주의사항") })).toBeVisible();
    await expect(slotAt(page, cab!.door_type, "L1").locator("svg")).toHaveCount(1);
    // 문 형태를 단문형으로 바꿔도 남는 칸(왼쪽 1단)의 경고는 남고, 4단 → 3단처럼 칸이 사라지면 그 칸의 경고도 사라진다
    await selectSlot(page, cab!.door_type, `L${cab!.shelves}`);
    await setClasses(page, CAB.incompatible[1]);
    await expect(mixLines(page), "두 칸에 경고").toHaveCount(2);
    const fewer = CAB.shelves.find((n) => n < cab!.shelves);
    if (fewer) {
      await pickShelves(page, fewer);
      await expect(mixLines(page), "사라진 칸의 경고는 없다").toHaveCount(1);
      await expect(mixLines(page)).toHaveText(exact(MIX_EXAMPLE));
    }
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
    expect((await dbView(page)).classes, "DB 그대로").toEqual(db.classes);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A 교사: pill 을 누르면 ?c={id} 로 바뀌고 이름·배치도가 그 시약장 · 직접 URL · 없는 id·uuid 아닌 값 → 첫 시약장(200) · 저장 안 한 편집 중 전환 → 확인 카드(rules.json cabinet.unsaved_confirm): "${CONTINUE_BUTTON}" = 머묾·편집 유지, "${DISCARD_BUTTON}" = 버리고 이동 · 편집이 없으면 확인 없이 이동`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    const db = await dbView(page);
    const first = await firstCabinet(page, db);
    const second = db.cabinets.find((c) => c.id !== first.id)!;
    expect(second, "대조: 시약장 2개 이상").toBeTruthy();
    await expectActive(page, first.label, "c 없음 = 첫 시약장");
    await expectHeader(page, first.label, first.door_type, first.shelves, "c 없음");

    // 저장 안 한 편집
    const key = blankKey(db, first);
    await selectSlot(page, first.door_type, key);
    await setChip(page, CLASSES[0], true);
    await expect(saveButton(page)).toBeEnabled();
    const edited = { ...classesOf(db, first), [key]: [CLASSES[0]] };

    // pill 로 전환 → 확인 카드 → 계속 편집: 머묾·편집 유지
    const urlBefore = page.url();
    await pill(page, second.label).click();
    const confirm = unsavedDialog(page);
    await expect(confirm, `편집 중 전환 → "${UNSAVED_TITLE}"`).toBeVisible();
    await expect(page.locator(sel(MODAL)), `확인 카드 = ${MODAL} 1개`).toHaveCount(1);
    await expect(confirm.getByText(exact(unsavedBody(first.label))), "안내 = 편집 중인 시약장 이름").toBeVisible();
    await primaryIn(confirm, CONTINUE_BUTTON).click();
    await expect(confirm, `"${CONTINUE_BUTTON}" → 카드 닫힘`).toHaveCount(0);
    expect(page.url(), `"${CONTINUE_BUTTON}" → 주소 그대로`).toBe(urlBefore);
    await expectActive(page, first.label, `"${CONTINUE_BUTTON}" 뒤`);
    await expectBoard(page, first.door_type, first.shelves, edited, `"${CONTINUE_BUTTON}" 뒤 (편집 유지)`);
    await expect(saveButton(page), "편집 유지 → 저장 가능").toBeEnabled();

    // 다시 전환 → 버리고 이동
    await pill(page, second.label).click();
    await expect(confirm).toBeVisible();
    await outlineIn(confirm, DISCARD_BUTTON).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("c"), { message: "주소의 c = 누른 시약장", timeout: 30_000 }).toBe(second.id);
    await expect(confirm).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(CABINETS_HREF);
    await expectActive(page, second.label, "전환 뒤", second.number);
    await expectHeader(page, second.label, second.door_type, second.shelves, "전환 뒤", second.number);
    await expectBoard(page, second.door_type, second.shelves, classesOf(db, second), "전환 뒤", db.counts[second.id]);
    await expect(saveButton(page), "전환한 시약장은 바뀐 것이 없다").toBeDisabled();

    // 편집이 없으면 확인 없이 이동 · 되돌아오면 앞의 편집은 버려져 있다
    await pill(page, first.label).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("c"), { timeout: 30_000 }).toBe(first.id);
    await expect(unsavedDialog(page), "편집이 없으면 확인 카드 없음").toHaveCount(0);
    await expectActive(page, first.label, "되돌아온 뒤");
    await expectBoard(page, first.door_type, first.shelves, classesOf(db, first), "되돌아온 뒤 (편집은 버려진다)", db.counts[first.id]);
    await expect(saveButton(page)).toBeDisabled();

    // 직접 URL
    for (const cab of [second, first]) {
      await page.goto(withC(cab.id));
      await waitCabinets(page);
      await expectActive(page, cab.label, `직접 ${withC(cab.id)}`);
      await expectHeader(page, cab.label, cab.door_type, cab.shelves, "직접 URL");
    }
    // 잘못된 id → 첫 시약장
    for (const bad of ["00000000-0000-4000-8000-000000000000", "abc", "", `${second.id}x`, "null"]) {
      const res = await page.goto(`${CABINETS_HREF}?c=${encodeURIComponent(bad)}`);
      expect(res?.status(), `c="${bad}" 응답`).toBe(200);
      await waitCabinets(page);
      await expectActive(page, first.label, `c="${bad}" → 첫 시약장`);
      await expectHeader(page, first.label, first.door_type, first.shelves, `c="${bad}"`);
      await expectBoard(page, first.door_type, first.shelves, classesOf(db, first), `c="${bad}"`);
    }
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 학교A 교사 시트(쓰기 0건): "${RENAME_BUTTON}" → ${MODAL} "시약장 이름" + ${INPUT}(지금 이름) + 글자 수 + "${SAVE_BUTTON}"(비면 비활성) + "${CANCEL_BUTTON}" / "${DELETE_BUTTON}" → rules.json variants.delete(${VARIANTS.delete.join("·")}) + 배치 시약 수 = DB + "${DELETE_CAPTION}" · 열린 동안 뒤 컨트롤 비활성 · Esc·"${CANCEL_BUTTON}" 로 닫힘`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    const db = await dbView(page);
    const cab = await firstCabinet(page, db);
    await expect(modal(page), "처음에는 시트 없음").toHaveCount(0);

    /** 시트가 열린 동안 뒤의 편집 컨트롤은 눌리지 않는다 */
    const expectLocked = async (what: string) => {
      await expect(addButton(page), `${what}: ${ADD}`).toBeDisabled();
      await expect(renameButton(page), `${what}: "${RENAME_BUTTON}"`).toBeDisabled();
      await expect(deleteButton(page), `${what}: "${DELETE_BUTTON}"`).toBeDisabled();
      await expect(saveButton(page), `${what}: "${SAVE_BUTTON}"`).toBeDisabled();
      for (const d of CAB.door_types) await expect(doorRadio(page, d), `${what}: 문 형태 ${d}`).toBeDisabled();
      for (const n of CAB.shelves) await expect(shelfRadio(page, n), `${what}: 단 수 ${n}`).toBeDisabled();
      expect(await slots(page).evaluateAll((els) => els.every((e) => (e as HTMLButtonElement).disabled)), `${what}: 칸`).toBe(true);
      expect(await pickChips(page).evaluateAll((els) => els.every((e) => (e as HTMLButtonElement).disabled)), `${what}: 칩`).toBe(true);
    };
    const expectUnlocked = async () => {
      await expect(modal(page)).toHaveCount(0);
      await expect(renameButton(page)).toBeEnabled();
      await expect(deleteButton(page)).toBeEnabled();
      await expect(addButton(page)).toBeEnabled();
      await expect(slots(page).first()).toBeEnabled();
    };

    // ---------- 이름 시트 ----------
    for (const close of ["Escape", CANCEL_BUTTON]) {
      await renameButton(page).click();
      const dialog = renameDialog(page);
      await expect(dialog, "이름 시트").toBeVisible();
      await expect(modal(page), `${MODAL} 은 한 번에 하나`).toHaveCount(1);
      await expect(dialog.locator(sel(INPUT)), `${INPUT} 1개`).toHaveCount(1);
      await expect(dialogInput(page), "입력에 지금 이름").toHaveValue(cab.label);
      await expect(dialog, "글자 수").toContainText(new RegExp(`${[...cab.label].length}\\s*/\\s*${LABEL_MAX}`));
      await expect(primaryIn(dialog, SAVE_BUTTON)).toHaveCount(1);
      await expect(outlineIn(dialog, CANCEL_BUTTON)).toHaveCount(1);
      await expectLocked("이름 시트");
      await expectTabBar(page, viewport, "이름 시트");
      // 글자 수는 입력을 따라가고, 비면 저장할 수 없다 (공백만 있어도)
      await dialogInput(page).fill("가나다");
      await expect(dialog).toContainText(new RegExp(`3\\s*/\\s*${LABEL_MAX}`));
      await expect(primaryIn(dialog, SAVE_BUTTON)).toBeEnabled();
      for (const blank of ["", "   "]) {
        await dialogInput(page).fill(blank);
        await expect(primaryIn(dialog, SAVE_BUTTON), `이름 "${blank}" 이면 저장 비활성`).toBeDisabled();
      }
      expect(await dialogInput(page).getAttribute("maxlength"), `입력 한도 ${LABEL_MAX}자`).toBe(String(LABEL_MAX));
      if (close === "Escape") await page.keyboard.press("Escape");
      else await outlineIn(dialog, CANCEL_BUTTON).click();
      await expectUnlocked();
      await expectHeader(page, cab.label, cab.door_type, cab.shelves, "이름 시트를 닫은 뒤");
    }
    // 다시 열면 입력은 지금 이름부터 (닫으며 버린 입력이 남지 않는다)
    await renameButton(page).click();
    await expect(dialogInput(page)).toHaveValue(cab.label);
    await page.keyboard.press("Escape");
    await expectUnlocked();

    // ---------- 삭제 확인 ----------
    for (const target of db.cabinets) {
      await page.goto(withC(target.id));
      await waitEditable(page);
      for (const close of ["Escape", CANCEL_BUTTON]) {
        await deleteButton(page).click();
        const dialog = deleteDialog(page);
        await expect(dialog, "삭제 확인 카드").toBeVisible();
        await expect(modal(page)).toHaveCount(1);
        for (const c of VARIANTS.delete) expect(await countComponent(page, c), `variants.delete ${c}`).toBeGreaterThanOrEqual(1);
        await expect(switcher(page), "뒤에 전환 줄이 그대로 보인다").toBeVisible();
        await expectActive(page, target.label, "삭제 확인");
        expect(db.placed[target.id], `대조: "${target.label}" 에 배치된 시약 (seed)`).toBeGreaterThan(0);
        await expect(dialog.getByText(exact(deleteNotice(db.placed[target.id]))), `배치 시약 수 = DB (${db.placed[target.id]})`).toBeVisible();
        await expect(dialog.getByText(exact(DELETE_CAPTION))).toBeVisible();
        await expect(outlineIn(dialog, CANCEL_BUTTON)).toHaveCount(1);
        await expect(primaryIn(dialog, DELETE_BUTTON)).toHaveCount(1);
        await expect(dialog.locator(sel(INPUT)), "삭제 확인에는 입력 없음").toHaveCount(0);
        // 시안 11-delete: 취소(왼쪽) + 삭제(오른쪽) 가로 2버튼
        const c = await boxOf(outlineIn(dialog, CANCEL_BUTTON));
        const d = await boxOf(primaryIn(dialog, DELETE_BUTTON));
        expect(c.right, "취소가 삭제의 왼쪽").toBeLessThanOrEqual(d.left);
        expect(Math.abs(c.top - d.top), "같은 줄").toBeLessThanOrEqual(1);
        await expectLocked("삭제 확인");
        await expectTabBar(page, viewport, "삭제 확인");
        if (close === "Escape") await page.keyboard.press("Escape");
        else await outlineIn(dialog, CANCEL_BUTTON).click();
        await expectUnlocked();
      }
    }
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
    const after = await dbView(page);
    expect(after.cabinets, "시약장 그대로").toEqual(db.cabinets);
    expect(after.placed, "배치 그대로").toEqual(db.placed);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C2
// =====================================================================

for (const role of SCHOOL_A_ROLES) {
  test(`[C2][S${SCREEN}] ${ROLE_LABEL[role]} ${CABINETS_HREF}: 탭바 = rules.json tab_bar (390 = 1개·항목 수·라벨·활성 "시약", 1440 = 0)${STAFF.includes(role) ? " — 이름 시트·삭제 확인을 열어도 같음" : ""}`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN);
    try {
      await waitCabinets(page);
      await expectTabBar(page, viewport, "기본");
      if (STAFF.includes(role)) {
        await waitEditable(page);
        await renameButton(page).click();
        await expect(renameDialog(page)).toBeVisible();
        await expectTabBar(page, viewport, "이름 시트");
        await page.keyboard.press("Escape");
        await expect(modal(page)).toHaveCount(0);
        await deleteButton(page).click();
        await expect(deleteDialog(page)).toBeVisible();
        await expectTabBar(page, viewport, "삭제 확인");
        await page.keyboard.press("Escape");
        await expect(modal(page)).toHaveCount(0);
      }
      // 다른 시약장으로 바꿔도 같음
      const db = await dbView(page);
      await page.goto(withC(db.cabinets[db.cabinets.length - 1].id));
      await waitCabinets(page);
      await expectTabBar(page, viewport, "다른 시약장");
    } finally {
      await context.close();
    }
  });
}

test(`[C2][S${SCREEN}] 학교A 교사 폭 390: "${SAVE_BUTTON}" 줄은 tab-bar 바로 위 고정(스크롤해도 같은 자리·가려지지 않음) · 이름 시트·삭제 확인의 아래 끝 = tab-bar 위쪽 선(전폭, tab-bar 를 가리지 않음) / 폭 1440: tab-bar 0 · "${SAVE_BUTTON}" 은 본문 아래 고정 bottom-bar 오른쪽 끝(새 프레임 11-desktop — 맨 아래까지 내려도 편집 컨트롤을 가리지 않음) · 시트는 화면 가운데 카드`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const tb = rules.tab_bar;
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    const vp = page.viewportSize()!;
    const save = saveButton(page);
    await expect(save).toBeVisible();

    const openSheets: [string, () => Promise<void>, () => ReturnType<typeof renameDialog>][] = [
      ["이름 시트", () => renameButton(page).click(), () => renameDialog(page)],
      ["삭제 확인", () => deleteButton(page).click(), () => deleteDialog(page)],
    ];

    if (viewport === "mobile") {
      const bar = page.locator(sel(tb.component));
      await expect(bar).toHaveCount(1);
      const barBox = await boxOf(bar);
      const check = async (when: string) => {
        const s = await boxOf(save);
        expect(s.bottom, `${when}: 저장 버튼 아래 끝 ≤ tab-bar 위쪽 선`).toBeLessThanOrEqual(barBox.top + 0.5);
        expect(barBox.top - s.bottom, `${when}: 저장 줄은 tab-bar 바로 위 (사이 ≤ 24)`).toBeLessThanOrEqual(24);
        expect(s.left, `${when}: 저장 버튼 왼쪽 여백 ≥ 0`).toBeGreaterThanOrEqual(0);
        expect(s.right, `${when}: 저장 버튼은 화면 안`).toBeLessThanOrEqual(vp.width);
        expect(s.width, `${when}: 저장 버튼은 전폭(좌우 여백 16)`).toBeGreaterThanOrEqual(vp.width - 2 * 24);
        expect(s.height, `${when}: 저장 버튼 높이 ≥ rules.json button.min_height`).toBeGreaterThanOrEqual(44);
        expect(await onTop(save), `${when}: 저장 버튼이 다른 것에 가려지지 않음`).toBe(true);
        expect(await onTop(bar.locator(sel(tb.item)).first()), `${when}: tab-bar 가 가려지지 않음`).toBe(true);
        return s;
      };
      const top = await check("맨 위");
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight)).toBe(true);
      const bottom = await check("맨 아래");
      expect(Math.abs(bottom.top - top.top), "저장 줄은 스크롤해도 같은 자리 (고정)").toBeLessThanOrEqual(1);
      // 편집 영역의 마지막 내용(칩)이 저장 줄에 가려지지 않는다
      const lastChip = pickChips(page).last();
      if ((await lastChip.count()) > 0) {
        await lastChip.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        expect((await boxOf(lastChip)).bottom, "맨 아래에서 마지막 칩이 저장 줄 위").toBeLessThanOrEqual((await boxOf(save)).top);
      }
      await page.evaluate(() => window.scrollTo(0, 0));

      for (const [name, open, dialogOf] of openSheets) {
        await open();
        const dialog = dialogOf();
        await expect(dialog, name).toBeVisible();
        const d = await boxOf(dialog);
        expect(d.bottom, `${name}: 아래 끝 ≤ tab-bar 위쪽 선`).toBeLessThanOrEqual(barBox.top + 0.5);
        expect(barBox.top - d.bottom, `${name}: tab-bar 위쪽 선에 붙는다`).toBeLessThanOrEqual(1);
        expect(Math.round(d.left), `${name}: 전폭 (왼쪽)`).toBe(0);
        expect(Math.round(d.right), `${name}: 전폭 (오른쪽)`).toBe(vp.width);
        expect(d.top, `${name}: 화면 안`).toBeGreaterThanOrEqual(0);
        for (const b of await dialog.locator("button").all()) {
          expect((await boxOf(b)).bottom, `${name}: 시트 버튼이 tab-bar 위`).toBeLessThanOrEqual(barBox.top + 0.5);
          expect(await onTop(b), `${name}: 시트 버튼이 가려지지 않음`).toBe(true);
        }
        expect(await onTop(bar.locator(sel(tb.item)).first()), `${name}: tab-bar 를 가리지 않음`).toBe(true);
        await expectTabBar(page, viewport, name);
        // 위쪽의 전환 줄·시약장 이름은 그대로 보인다 (s2-spec 11-delete 모바일)
        expect(await onTop(activePills(page)), `${name}: 활성 pill 이 가려지지 않음`).toBe(true);
        await page.keyboard.press("Escape");
        await expect(modal(page)).toHaveCount(0);
      }
    } else {
      await expect(page.locator(sel(tb.component)), "1440 tab-bar").toHaveCount(0);
      await expect(page.locator(sel(tb.item)), "1440 tab-item").toHaveCount(0);
      // 새 프레임 11-desktop (데스크톱 재구성 run c): "저장" = 본문 아래 고정 bottom-bar 오른쪽 끝 (rules desktop_shell heavy_pages · d7 §23)
      const bar = main(page).locator('[data-name="bottom-bar"]').filter({ has: page.locator(sel("button-primary")).filter({ hasText: exact(SAVE_BUTTON) }) });
      await expect(bar, '"저장" 은 bottom-bar 안').toHaveCount(1);
      expect(await bar.evaluate((el) => getComputedStyle(el).position), "bottom-bar 고정").toBe("fixed");
      const bb = await boxOf(bar);
      expect(Math.round(bb.bottom), "bottom-bar 아래 = 화면 아래").toBe(vp.height);
      const s = await boxOf(save);
      expect(s.right, '"저장" 은 바 오른쪽 끝 쪽').toBeGreaterThan(bb.left + bb.width / 2);
      // 맨 아래까지 내리면 편집 컨트롤(관리 줄 · 문 형태 · 단 수 · 마지막 칩)이 바 위에 있다 (가리지 않음)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const top = (await boxOf(bar)).top;
      for (const other of [renameButton(page), main(page).locator(sel(DOOR_SELECT)), main(page).locator(sel(SHELF_SELECT)), pickChips(page).last()]) {
        if ((await other.count()) === 0) continue;
        expect((await boxOf(other)).bottom, "맨 아래에서 편집 컨트롤은 저장 바 위").toBeLessThanOrEqual(top + 0.5);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "가로 스크롤 없음").toBe(true);

      for (const [name, open, dialogOf] of openSheets) {
        await open();
        const dialog = dialogOf();
        await expect(dialog, name).toBeVisible();
        const d = await boxOf(dialog);
        expect(d.top, `${name}: 화면 안 (위)`).toBeGreaterThanOrEqual(0);
        expect(d.bottom, `${name}: 화면 안 (아래)`).toBeLessThanOrEqual(vp.height);
        // 새 프레임 11-delete-desktop · 11-unsaved-desktop: 확인 카드는 화면 위 가운데 — 프레임에 좌표가 없어 화면 가운데 또는 본문(사이드바 오른쪽) 가운데
        const bodyCenter = (rules.desktop_shell.width + vp.width) / 2;
        const cx = (d.left + d.right) / 2;
        expect(Math.min(Math.abs(cx - vp.width / 2), Math.abs(cx - bodyCenter)), `${name}: 가로 가운데 (화면 ${vp.width / 2} 또는 본문 ${bodyCenter}, 지금 ${cx})`).toBeLessThanOrEqual(16);
        expect(Math.abs((d.top + d.bottom) / 2 - vp.height / 2), `${name}: 화면 세로 가운데`).toBeLessThanOrEqual(16);
        expect(d.width, `${name}: 전폭이 아닌 카드`).toBeLessThan(vp.width / 2);
        for (const b of await dialog.locator("button").all()) expect(await onTop(b), `${name}: 카드 버튼이 가려지지 않음`).toBe(true);
        await page.keyboard.press("Escape");
        await expect(modal(page)).toHaveCount(0);
      }
    }
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// V1 (보고용 스크린샷, 실패 조건 아님) — 시안과 가까운 상태: 교사, 첫 시약장, 좌1단 = 산 + 염기 (저장하지 않는 편집)
// =====================================================================
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (학교A 교사, 첫 시약장 · 좌1단 선택 · 산+염기 경고 — 저장하지 않음)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    await (async () => {
      await waitEditable(page);
      const db = await dbView(page);
      const cab = db.cabinets.find((c) => c.door_type === DOUBLE && c.shelves === 4) ?? db.cabinets[0];
      if (new URL(page.url()).searchParams.get("c") !== cab.id) {
        await page.goto(withC(cab.id));
        await waitEditable(page);
      }
      await selectSlot(page, cab.door_type, "L1");
      await setClasses(page, ["산", "염기"]);
      await expect(mix(page)).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
    })().catch(() => undefined);
    // 시안 프레임 크기(390×844 · 1440×900) 그대로
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: false });
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});
