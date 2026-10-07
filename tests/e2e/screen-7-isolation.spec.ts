// 화면 7 (입고·시약 등록) 학교 격리 N1-ui
//  - 화면 글자의 학교명 종류 = rules.json never.N1.distinct_school_names, 자기 학교명만 (다른 seed 학교·데모 학교명 없음)
//  - 시약 목록(reagent-row) = 자기 세션(RLS)으로 읽은 자기 학교 시약 전부와 정확히 같음 → 다른 학교·데모 학교 시약 0행
//  - 응답 본문(HTML·RSC)에도 다른 학교·데모 학교 시약명 없음
//  - 다른 학교 시약 id 로 ?reagent 접근: 선택되지 않음 · 이름 미노출 (학교 A ↔ 학교 B 양방향)
//  - 화면에서 새로 등록한 시약은 다른 학교 화면 목록·검색에 나오지 않음 (임시 시약, 끝나면 삭제)
// 다른 학교 시약이 실제로 있다는 양성 대조는 그 학교 계정의 브라우저 세션(RLS)으로 확인한다. service role 미사용.
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserSession, rules, sel, seedRows } from "./screen-helpers";
import { seedReagents, seedSchoolOf } from "./screen-3-helpers";
import { demoReagents, demoSchool } from "./guest-helpers";
import {
  EMPTY,
  SCREEN,
  STORAGE_CLASSES,
  TOAST,
  TOAST_REGISTER,
  UNITS,
  dbReagent,
  dbReagents,
  dbReagentsByName,
  dropTempReagents,
  expectNotSelected,
  expectSelected,
  fillRegister,
  intakePath,
  leaveAfterRegister,
  registerButton,
  rowNames,
  rows,
  searchInput,
  sweepTemp,
  tempName,
  waitIntake,
  DIRECT_PATH,
} from "./screen-7-helpers";

test.describe.configure({ mode: "default" });

const N1 = rules.never.N1;
const ROLES: Role[] = ["teacher", "admin", "schoolB"];
const GROUP = "iso";

test.afterAll(async ({}, info) => {
  expect(await sweepTemp(info, GROUP, ["teacher", "schoolB"]), "임시 시약 잔여").toBe(0);
});

const otherOf = (role: Role): Role => (role === "schoolB" ? "teacher" : "schoolB");

function checkSchoolNames(text: string, mine: string, foreignSchools: string[]): void {
  const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
  expect(names, "학교명 종류").toHaveLength(N1.distinct_school_names);
  for (const n of names) expect(mine, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
  expect(text, "자기 학교명 표시").toContain(mine);
  for (const s of foreignSchools) expect(text, `다른 학교명 ${s}`).not.toContain(s);
}

/** 화면을 다시 열어 읽은 행 이름과, 읽기 전·후가 같은 DB 스냅샷의 짝 (다른 테스트의 임시 시약이 드나들 수 있다) */
async function listSnapshot(page: Page): Promise<{ db: string[]; shown: string[]; html: string } | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = (await dbReagents(page)).map((r) => r.name).sort();
    const res = await page.goto(DIRECT_PATH);
    await waitIntake(page, "intake");
    await expect(rows(page).first()).toBeVisible();
    const shown = (await rowNames(page)).sort();
    const html = (await res?.text()) ?? "";
    const after = (await dbReagents(page)).map((r) => r.name).sort();
    if (JSON.stringify(before) === JSON.stringify(after)) return { db: after, shown, html };
  }
  return null;
}

// ---------- 학교명 · 시약 목록 ----------
for (const role of ROLES) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 입고·시약 등록: 학교명 종류 = rules.json distinct_school_names · 시약 목록 = 자기 학교 시약(RLS) 전부 · 다른 학교·데모 학교 시약 0`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const schools = seedRows("schools");
    expect(schools.length, "seed 학교가 2개 이상이어야 격리 검사가 의미 있음").toBeGreaterThan(1);
    expect(N1.screens_require_school_name, `화면 ${SCREEN} 은 학교명 표시 대상`).toContain(SCREEN);
    const school = seedSchoolOf(role);
    const all = seedReagents();
    const ownSeed = all.filter((r) => r.school_id === school.id).map((r) => r.name);
    const foreign = all.filter((r) => r.school_id !== school.id).map((r) => r.name);
    expect(foreign.length, "다른 학교 seed 시약이 있어야 검사가 의미 있음").toBeGreaterThan(0);
    const demo = await demoSchool();
    const demoNames = (await demoReagents()).map((r) => r.name);
    const foreignSchools = [...schools.filter((s) => s.id !== school.id).map((s) => s.name), demo.name];

    const { context, page, response } = await openAs(browser, info, role, SCREEN, DIRECT_PATH);
    try {
      expect(response?.status(), "화면 7 응답").toBe(200);
      await waitIntake(page, "intake");
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);

      // 자기 세션(RLS) 시약은 전부 자기 학교
      for (const r of await dbReagents(page)) expect(r.school_id, "RLS 로 자기 학교 시약만").toBe(school.id);

      const snap = await listSnapshot(page);
      expect(snap, "시약 목록이 계속 바뀌어 화면과 비교할 스냅샷을 얻지 못함").not.toBeNull();
      for (const n of ownSeed) expect(snap!.db, `자기 학교 seed 시약 ${n}`).toContain(n);
      expect(snap!.shown, "시약 목록(빈 검색어) = 자기 학교 시약 전부").toEqual(snap!.db);

      // 기존 시약 입고 갈래 · 새 시약 등록 갈래 모두에서 학교명 1종
      const text = await page.locator("body").innerText();
      checkSchoolNames(text, me.schoolName, foreignSchools);
      for (const n of [...foreign, ...demoNames]) {
        if (snap!.db.some((o) => o.includes(n))) continue; // 자기 학교 시약명의 부분 문자열이면 판정 불가
        expect(text, `화면에 다른 학교·데모 학교 시약명 ${n}`).not.toContain(n);
        expect(snap!.html, `응답 본문에 다른 학교·데모 학교 시약명 ${n}`).not.toContain(n);
      }
      for (const s of foreignSchools) expect(snap!.html, `응답 본문에 다른 학교명 ${s}`).not.toContain(s);

      // 다른 학교 시약명으로 검색 → 0건 (빈 상태 카드), 행 없음
      for (const n of foreign) {
        if (snap!.db.some((o) => o.includes(n))) continue;
        await searchInput(page).fill(n);
        await expect(rows(page), `검색 "${n}" 결과 행`).toHaveCount(0);
        await expect(page.locator(`main ${sel(EMPTY)}`), `검색 "${n}" → 빈 상태 카드`).toHaveCount(1);
      }

      const res2 = await page.goto(intakePath({ tab: "register" }));
      await waitIntake(page, "register");
      checkSchoolNames(await page.locator("body").innerText(), me.schoolName, foreignSchools);
      const html2 = (await res2?.text()) ?? "";
      for (const s of foreignSchools) expect(html2, `등록 갈래 응답 본문에 다른 학교명 ${s}`).not.toContain(s);
    } finally {
      await context.close();
    }
  });
}

// ---------- 다른 학교 시약 id 로 ?reagent ----------
for (const role of ["teacher", "schoolB"] as Role[]) {
  const other = otherOf(role);
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} → ${ROLE_LABEL[other]} 학교 시약 id 로 ?reagent 접근: 선택되지 않음 · 시약명 미노출 · 없는 id 와 같은 상태`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const mySchool = seedSchoolOf(role);
    const otherSchool = seedSchoolOf(other);
    expect(otherSchool.id, "서로 다른 학교").not.toBe(mySchool.id);
    const all = seedReagents();
    const ownNames = all.filter((r) => r.school_id === mySchool.id).map((r) => r.name);
    const foreign = all.filter((r) => r.school_id === otherSchool.id);
    expect(foreign.length, "다른 학교 seed 시약이 있어야 검사가 의미 있음").toBeGreaterThan(0);
    const target = foreign[0];

    // 양성 대조: 그 학교 계정으로는 같은 주소에서 그 시약이 선택된 상태로 열린다
    const o = await openAs(browser, info, other, SCREEN, intakePath({ reagent: target.id }));
    try {
      await waitIntake(o.page, "intake");
      await expectSelected(o.page, target.name);
      expect(await dbReagent(o.page, target.id), `${ROLE_LABEL[other]} 세션으로 ${target.name} 읽힘`).not.toBeNull();
    } finally {
      await o.context.close();
    }

    const { context, page, response } = await openAs(browser, info, role, SCREEN, intakePath({ reagent: target.id }));
    try {
      await waitIntake(page, "intake");
      const me = await browserSession(page);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(mySchool.name);
      expect(await dbReagent(page, target.id), `${ROLE_LABEL[role]} 세션으로 다른 학교 시약 0행`).toBeNull();

      await expectNotSelected(page);
      const html = (await response?.text()) ?? "";
      const text = await page.locator("body").innerText();
      for (const r of foreign) {
        if (ownNames.some((n) => n.includes(r.name))) continue;
        expect(html, `응답 본문에 다른 학교 시약명 ${r.name}`).not.toContain(r.name);
        expect(text, `화면에 다른 학교 시약명 ${r.name}`).not.toContain(r.name);
        await expect(rows(page).filter({ hasText: r.name }), `결과 행에 ${r.name}`).toHaveCount(0);
      }
      expect(html, `응답 본문에 다른 학교명 ${otherSchool.name}`).not.toContain(otherSchool.name);
      checkSchoolNames(text, me.schoolName, [otherSchool.name]);
      // 목록에는 자기 학교 시약만 그대로
      const shown = await rowNames(page);
      for (const n of ownNames) expect(shown, `자기 학교 seed 시약 ${n}`).toContain(n);

      // 없는 id · 형식이 틀린 id 도 같은 상태 (존재 여부 비노출)
      for (const bad of [randomUUID(), "not-a-reagent-id"]) {
        const res = await page.goto(intakePath({ reagent: bad }));
        expect(res?.status(), `없는 id(${bad}) 상태 코드 = 다른 학교 id 상태 코드`).toBe(response?.status());
        await waitIntake(page, "intake");
        await expectNotSelected(page);
      }

      // 데모 학교 시약 id 도 선택되지 않는다
      const demo = (await demoReagents())[0];
      const res = await page.goto(intakePath({ reagent: demo.id }));
      expect(res?.status(), "데모 시약 id 상태 코드").toBe(response?.status());
      await waitIntake(page, "intake");
      await expectNotSelected(page);
      expect(await dbReagent(page, demo.id), "로그인 세션으로 데모 시약 0행").toBeNull();
    } finally {
      await context.close();
    }
  });
}

// ---------- 새로 등록한 시약은 다른 학교에 보이지 않는다 ----------
for (const role of ["teacher", "schoolB"] as Role[]) {
  const other = otherOf(role);
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 가 화면에서 등록한 시약: 자기 학교 목록에 표시 · ${ROLE_LABEL[other]} 화면 목록·검색·DB 에 0 (끝나면 삭제)`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const name = tempName(info, GROUP);
    const mySchool = seedSchoolOf(role);
    const { context, page } = await openAs(browser, info, role, SCREEN, intakePath({ tab: "register" }));
    try {
      await waitIntake(page, "register");
      const me = await browserSession(page);
      expect(me.schoolName, "테스트 계정 학교 = seed(테스트) 학교").toBe(mySchool.name);
      await fillRegister(page, { name, storageClass: STORAGE_CLASSES[0], stock: "1", unit: UNITS[UNITS.length - 1] });
      await expect(registerButton(page)).toBeEnabled();
      await registerButton(page).click();
      await expect(page.locator(sel(TOAST)).filter({ hasText: TOAST_REGISTER }), `${TOAST} "${TOAST_REGISTER}"`).toBeVisible({ timeout: 30_000 });
      // 시약장이 있는 학교는 location-suggest → "나중에" → 화면 2 (d7 §17)
      await leaveAfterRegister(page);

      const made = await dbReagentsByName(page, name);
      expect(made, "등록된 시약 1행").toHaveLength(1);
      expect(made[0].school_id, "school_id = 등록한 사람의 학교").toBe(mySchool.id);

      // 양성 대조: 등록한 학교의 입고 목록에는 보인다
      await page.goto(DIRECT_PATH);
      await waitIntake(page, "intake");
      await expect(rows(page).filter({ hasText: name }), "자기 학교 목록에 새 시약").toHaveCount(1);

      // 다른 학교: 목록·검색·응답 본문·DB(RLS) 어디에도 없다
      const o = await openAs(browser, info, other, SCREEN, DIRECT_PATH);
      try {
        await waitIntake(o.page, "intake");
        expect((await browserSession(o.page)).schoolName, "다른 학교 계정").not.toBe(me.schoolName);
        const res = await o.page.goto(DIRECT_PATH);
        await waitIntake(o.page, "intake");
        await expect(rows(o.page).first()).toBeVisible();
        expect(await rowNames(o.page), `${ROLE_LABEL[other]} 목록`).not.toContain(name);
        expect((await res?.text()) ?? "", `${ROLE_LABEL[other]} 응답 본문`).not.toContain(name);
        expect(await o.page.locator("body").innerText(), `${ROLE_LABEL[other]} 화면 글자`).not.toContain(name);
        await searchInput(o.page).fill(name);
        await expect(rows(o.page), `${ROLE_LABEL[other]} 검색 결과`).toHaveCount(0);
        await expect(o.page.locator(`main ${sel(EMPTY)}`), "검색 0건 카드").toHaveCount(1);
        expect(await dbReagentsByName(o.page, name), `${ROLE_LABEL[other]} 세션 DB`).toHaveLength(0);
        // id 를 알아도 선택되지 않는다
        await o.page.goto(intakePath({ reagent: made[0].id }));
        await waitIntake(o.page, "intake");
        await expectNotSelected(o.page);
        expect(await o.page.locator("body").innerText()).not.toContain(name);
      } finally {
        await o.context.close();
      }
    } finally {
      const left = await dropTempReagents(page, name).catch(() => -1);
      await context.close();
      expect(left, "임시 시약 삭제 후 남은 행").toBe(0);
    }
  });
}
