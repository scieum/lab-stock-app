// 화면 10 (사용 기록 내역) 학교 격리 N1-ui
//  - 화면 글자의 학교명 종류 = rules.json never.N1.distinct_school_names, 자기 학교명만 (다른 seed 학교·데모 학교명 없음)
//  - 기록 목록 = 자기 세션(RLS)으로 읽은 자기 학교 기록 → 다른 학교 기록·시약명·사용자 이름 0 (학교 A ↔ 학교 B 양방향)
//  - 응답 본문(HTML·RSC)에도 다른 학교 시약명·사용자 이름·학교명 없음
//  - ?q= 로 다른 학교 시약명을 검색해도 0건 (그 학교 계정에게는 같은 검색이 1건 이상 — 양성 대조)
// 다른 학교 기록이 실제로 있다는 양성 대조는 그 학교 계정의 브라우저 세션(RLS)으로 확인한다. service role 미사용.
// 이 파일은 DB 에 쓰지 않는다 (학교 B 기록이 0행일 때만 db-helpers ensureUsageLog 가 1행 만든다 — D2 스펙과 같은 준비).
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, ensureUsageLog, signIn, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserClient, browserSession, rules, seedRows } from "./screen-helpers";
import { seedReagents, seedSchoolOf } from "./screen-3-helpers";
import { demoSchool } from "./guest-helpers";
import {
  EMPTY,
  EMPTY_TITLE,
  MODAL,
  ROW,
  SCREEN,
  dbHistory,
  emptyCard,
  expectDetail,
  gotoAndMatch,
  historyPath,
  modal,
  myDisplayName,
  openRow,
  rows,
  waitHistory,
  type Filter,
} from "./screen-10-helpers";

const N1 = rules.never.N1;
const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];
const otherOf = (role: Role): Role => (role === "schoolB" ? "teacher" : "schoolB");
/** 기간 전체 — 학교의 기록이 오래돼도 보이게 */
const ALL: Filter = { period: "all" };

function checkSchoolNames(text: string, mine: string, foreignSchools: string[]): void {
  const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
  expect(names, "학교명 종류").toHaveLength(N1.distinct_school_names);
  for (const n of names) expect(mine, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
  expect(text, "자기 학교명 표시").toContain(mine);
  for (const s of foreignSchools) expect(text, `다른 학교명 ${s}`).not.toContain(s);
}

type Known = { schoolName: string; reagents: string[]; users: string[]; ids: string[] };

/** 이 세션(RLS)으로 보이는 것: 학교명, 시약명(시약 표 + 기록), 사용자 이름(자기 + 기록) */
async function knownOf(page: Page): Promise<Known> {
  const me = await browserSession(page);
  const { client } = await browserClient(page);
  const r = await client.from("reagents").select("name");
  expect(r.error, "자기 세션 reagents 조회").toBeNull();
  const hist = await dbHistory(page, ALL);
  return {
    schoolName: me.schoolName,
    reagents: [...new Set([...(r.data ?? []).map((x) => x.name as string), ...hist.map((h) => h.reagent_name)])],
    users: [...new Set([await myDisplayName(page), ...hist.map((h) => h.user_name).filter(Boolean)])],
    ids: hist.map((h) => h.id),
  };
}

test.beforeAll(async ({}, info) => {
  // 학교 B 에 usage_logs ≥ 1행 (교차 학교 0건의 양성 대조군). 이미 있으면 아무것도 하지 않는다.
  await ensureUsageLog(await signIn("schoolB"), info);
});

for (const role of ROLES) {
  const other = otherOf(role);
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 사용 기록 내역: 학교명 종류 = rules.json distinct_school_names(자기 학교) · 목록 = 자기 학교 기록(RLS) · ${ROLE_LABEL[other]} 학교의 시약명·사용자 이름·학교명이 화면·응답 본문에 0 (상세를 열어도)`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const schools = seedRows("schools");
    expect(schools.length, "seed 학교가 2개 이상이어야 격리 검사가 의미 있음").toBeGreaterThan(1);
    expect(N1.screens_require_school_name, `화면 ${SCREEN} 은 학교명 표시 대상`).toContain(SCREEN);
    const school = seedSchoolOf(role);
    const demo = await demoSchool();
    const foreignSchools = [...schools.filter((s) => s.id !== school.id).map((s) => s.name), demo.name];

    // 다른 학교 계정의 세션으로: 그 학교의 시약명·사용자 이름·기록 (양성 대조)
    const o = await openAs(browser, info, other, SCREEN);
    let theirs: Known;
    try {
      await waitHistory(o.page);
      theirs = await knownOf(o.page);
      expect(theirs.schoolName, "다른 학교 계정").toBe(seedSchoolOf(other).name);
      expect(theirs.ids.length, `${ROLE_LABEL[other]} 학교에 기록이 있어야 검사가 의미 있음`).toBeGreaterThan(0);
    } finally {
      await o.context.close();
    }

    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitHistory(page);
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);
      const mine = await knownOf(page);
      // 자기 세션(RLS) 기록과 다른 학교 기록은 한 건도 겹치지 않는다
      expect(mine.ids.filter((id) => theirs.ids.includes(id)), "두 학교 기록 id 교집합").toEqual([]);

      // 화면에 나오면 안 되는 다른 학교 값 (자기 학교에도 같은 글자가 있으면 판정 불가라 뺀다)
      const foreignReagents = [
        ...new Set([...theirs.reagents, ...seedReagents().filter((r) => r.school_id !== school.id).map((r) => r.name)]),
      ].filter((n) => !mine.reagents.some((x) => x.includes(n)) && !mine.users.some((x) => x.includes(n)));
      const foreignUsers = theirs.users.filter((n) => !mine.users.some((x) => x.includes(n)) && !mine.reagents.some((x) => x.includes(n)));
      expect(foreignReagents.length, "구별되는 다른 학교 시약명이 있어야 검사가 의미 있음").toBeGreaterThan(0);
      expect(foreignUsers.length, "구별되는 다른 학교 사용자 이름이 있어야 검사가 의미 있음").toBeGreaterThan(0);

      const clean = (text: string, where: string) => {
        for (const n of foreignReagents) expect(text, `${where}: 다른 학교 시약명 ${n}`).not.toContain(n);
        for (const n of foreignUsers) expect(text, `${where}: 다른 학교 사용자 이름 ${n}`).not.toContain(n);
        for (const s of foreignSchools) expect(text, `${where}: 다른 학교명 ${s}`).not.toContain(s);
      };

      for (const f of [{}, ALL, { ...ALL, mine: true }] as Filter[]) {
        const where = `${ROLE_LABEL[role]} ${historyPath(f)}`;
        // 목록 = 자기 세션 DB (다른 학교 기록 0행)
        const snap = await gotoAndMatch(page, f);
        for (const r of snap.shown) expect(theirs.ids, `${where}: 다른 학교 기록 id`).not.toContain(r.id);
        for (const r of snap.flat) {
          expect(mine.users, `${where}: 행의 사용자 이름은 자기 학교 사용자`).toContain(r.user);
          expect(mine.reagents, `${where}: 행의 시약명은 자기 학교 시약`).toContain(r.name);
        }
        const text = await page.locator("body").innerText();
        checkSchoolNames(text, me.schoolName, foreignSchools);
        clean(text, `${where} 화면`);
        clean(snap.html, `${where} 응답 본문`);
        if (snap.flat.length > 0) {
          // 상세를 열어도 같다
          await openRow(page, 0);
          await expectDetail(page, snap.shown[0]);
          const opened = await page.locator("body").innerText();
          checkSchoolNames(opened, me.schoolName, foreignSchools);
          clean(opened, `${where} 상세 열림`);
          clean(await modal(page).innerText(), `${where} ${MODAL}`);
        }
      }
      // 기간 전체에는 자기 학교 기록이 보인다 (빈 화면에서 0 을 세지 않도록)
      await page.goto(historyPath(ALL));
      await waitHistory(page);
      await expect(rows(page).first(), "자기 학교 기록 행").toBeVisible();
    } finally {
      await context.close();
    }
  });
}

for (const role of ["student", "teacher", "schoolB"] as Role[]) {
  const other = otherOf(role);
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} → ${ROLE_LABEL[other]} 학교의 시약명으로 ?q= 검색: ${ROW} 0 · ${EMPTY} "${EMPTY_TITLE}" · 응답 본문에 그 학교 사용자 이름·학교명 없음 (그 학교 계정에게는 1건 이상)`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const school = seedSchoolOf(role);
    const otherSchool = seedSchoolOf(other);
    expect(otherSchool.id, "서로 다른 학교").not.toBe(school.id);

    // 양성 대조: 그 학교 계정은 자기 시약명 검색으로 기록이 보인다
    const o = await openAs(browser, info, other, SCREEN);
    let targets: { q: string; count: number }[] = [];
    let theirUsers: string[] = [];
    try {
      await waitHistory(o.page);
      const hist = await dbHistory(o.page, ALL);
      expect(hist.length, `${ROLE_LABEL[other]} 학교 기록`).toBeGreaterThan(0);
      theirUsers = [...new Set([await myDisplayName(o.page), ...hist.map((h) => h.user_name).filter(Boolean)])];
      const names = [...new Set(hist.map((h) => h.reagent_name))].slice(0, 3);
      for (const q of names) {
        const snap = await gotoAndMatch(o.page, { ...ALL, q });
        expect(snap.flat.length, `${ROLE_LABEL[other]} 가 "${q}" 검색 → 1건 이상`).toBeGreaterThan(0);
        targets.push({ q, count: snap.flat.length });
      }
    } finally {
      await o.context.close();
    }

    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitHistory(page);
      const me = await browserSession(page);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);
      const { client } = await browserClient(page);
      const own = await client.from("reagents").select("name");
      expect(own.error).toBeNull();
      const ownNames = (own.data ?? []).map((x) => x.name as string);
      const myUsers = [...new Set([await myDisplayName(page), ...(await dbHistory(page, ALL)).map((h) => h.user_name)])];
      // 자기 학교 시약명에도 걸리는 검색어는 판정 불가라 뺀다
      targets = targets.filter((t) => !ownNames.some((n) => n.toLowerCase().includes(t.q.toLowerCase())));
      expect(targets.length, "자기 학교에는 없는 다른 학교 시약명이 있어야 검사가 의미 있음").toBeGreaterThan(0);
      const foreignUsers = theirUsers.filter((n) => !myUsers.some((x) => x.includes(n)));

      for (const t of targets) {
        for (const f of [{ q: t.q }, { ...ALL, q: t.q }, { ...ALL, q: t.q, mine: true }] as Filter[]) {
          const where = `${ROLE_LABEL[role]} ${historyPath(f)}`;
          expect(await dbHistory(page, f), `${where}: 자기 세션 DB 0행`).toHaveLength(0);
          const snap = await gotoAndMatch(page, f);
          expect(snap.flat, `${where}: 행 0`).toHaveLength(0);
          await expect(rows(page), `${where}: ${ROW} 0`).toHaveCount(0);
          await expect(modal(page)).toHaveCount(0);
          await expect(emptyCard(page), `${where}: ${EMPTY}`).toHaveCount(1);
          await expect(emptyCard(page)).toContainText(EMPTY_TITLE);
          // 검색어 자체(주소·입력 칸의 값)는 응답에 있을 수 있다 — 그 학교의 다른 값이 새지 않는지 본다
          for (const n of foreignUsers) expect(snap.html, `${where}: 응답 본문에 다른 학교 사용자 이름 ${n}`).not.toContain(n);
          expect(snap.html, `${where}: 응답 본문에 다른 학교명`).not.toContain(otherSchool.name);
          const text = await page.locator("body").innerText();
          checkSchoolNames(text, me.schoolName, [otherSchool.name]);
          for (const n of foreignUsers) expect(text, `${where}: 화면에 다른 학교 사용자 이름 ${n}`).not.toContain(n);
        }
      }
    } finally {
      await context.close();
    }
  });
}
