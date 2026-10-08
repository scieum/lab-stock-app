// 화면 4 (사용 기록 입력) 학교 격리 N1-ui
//  - 자기 학교 시약(?reagent): 학교명 종류 = rules.json never.N1.distinct_school_names, 자기 학교명만, 다른 학교명·다른 학교 시약명 미노출
//  - 다른 학교 시약 id 로 직접 접근: 응답 404, 응답 본문(HTML·RSC 포함)과 화면에 그 시약명·학교명 없음 (학교 A ↔ 학교 B 양방향)
//  - 없는 id · 형식이 틀린 id: 다른 학교 id 와 같은 상태 코드·같은 화면 글자 (존재 여부 비노출)
//  - ?reagent 없이: 시약 선택 목록 = 자기 세션(RLS)으로 읽은 자기 학교 시약 전부, 다른 학교 시약 없음
// 다른 학교 시약이 실제로 있다는 양성 대조는 그 학교 계정의 브라우저 세션(RLS)으로 확인한다. service role 미사용.
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserClient, browserSession, rules, seedRows } from "./screen-helpers";
import { seedReagents, seedSchoolOf } from "./screen-3-helpers";
import { SCREEN, dbStock, usagePath, waitUsage, reagentHead } from "./screen-4-helpers";

const N1 = rules.never.N1;
const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];

/** 다른 학교 계정 (학교 A 계정 → 학교 B 계정, 학교 B 계정 → 학교 A 교사) */
const otherOf = (role: Role): Role => (role === "schoolB" ? "teacher" : "schoolB");

async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

function checkSchoolNames(text: string, mine: string, foreignSchools: string[]): void {
  const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
  expect(names, "학교명 종류").toHaveLength(N1.distinct_school_names);
  for (const n of names) expect(mine, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
  expect(text, "자기 학교명 표시").toContain(mine);
  for (const s of foreignSchools) expect(text, `다른 학교명 ${s}`).not.toContain(s);
}

// ---------- 자기 학교 시약(?reagent) · 시약 선택 화면: 학교명 ----------
for (const role of ROLES) {
  for (const withReagent of [true, false]) {
    test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 사용 기록 입력(${withReagent ? "?reagent 자기 학교 시약" : "?reagent 없음"}): 학교명 종류 = rules.json distinct_school_names · 다른 학교명·시약명 미노출`, async ({ browser }, info) => {
      test.setTimeout(120_000);
      const schools = seedRows("schools");
      expect(schools.length, "seed 학교가 2개 이상이어야 격리 검사가 의미 있음").toBeGreaterThan(1);
      expect(N1.screens_require_school_name, `화면 ${SCREEN} 은 학교명 표시 대상`).toContain(SCREEN);
      const school = seedSchoolOf(role);
      const all = seedReagents();
      const own = all.filter((r) => r.school_id === school.id);
      const ownNames = own.map((r) => r.name);
      const foreign = all.filter((r) => r.school_id !== school.id).map((r) => r.name);
      expect(own.length, "자기 학교 seed 시약").toBeGreaterThan(0);
      expect(foreign.length, "다른 학교 seed 시약이 있어야 검사가 의미 있음").toBeGreaterThan(0);

      const { context, page } = await openAs(browser, info, role, SCREEN, usagePath(withReagent ? own[0].id : undefined));
      try {
        await waitUsage(page, withReagent);
        const me = await browserSession(page);
        expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
        expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);
        if (withReagent) await expect(reagentHead(page).first()).toContainText(own[0].name);

        const text = await page.locator("body").innerText();
        checkSchoolNames(text, me.schoolName, schools.filter((s) => s.id !== school.id).map((s) => s.name));
        for (const n of foreign) {
          if (ownNames.some((o) => o.includes(n))) continue; // 자기 학교 시약명의 부분 문자열이면 판정 불가
          expect(text, `다른 학교 시약명 ${n}`).not.toContain(n);
        }
      } finally {
        await context.close();
      }
    });
  }
}

// ---------- ?reagent 없이: 선택 목록 = 자기 학교 시약만 ----------
for (const role of ROLES) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} ?reagent 없이 진입: 시약 선택 목록 = 자기 학교 시약(RLS) 전부 · 다른 학교 시약 없음`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const school = seedSchoolOf(role);
    const all = seedReagents();
    const ownSeed = all.filter((r) => r.school_id === school.id).map((r) => r.name);
    const foreign = all.filter((r) => r.school_id !== school.id).map((r) => r.name);
    expect(foreign.length, "다른 학교 seed 시약이 있어야 검사가 의미 있음").toBeGreaterThan(0);

    const { context, page, response } = await openAs(browser, info, role, SCREEN, usagePath());
    try {
      expect(response?.status(), "?reagent 없이 진입 응답").toBe(200);
      await waitUsage(page, false);
      const me = await browserSession(page);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);
      expect(await reagentHead(page).count(), "시약 미지정이면 시약 카드 없음").toBe(0);

      // 자기 세션(RLS)으로 읽은 자기 학교 시약명 (양성 대조: seed 자기 학교 시약이 모두 포함)
      // 자기 세션(RLS)으로 읽은 자기 학교 시약명 (양성 대조: seed 자기 학교 시약이 모두 포함)
      const { client } = await browserClient(page);
      const readDb = async (): Promise<string[]> => {
        const { data, error } = await client.from("reagents").select("name, school_id");
        expect(error, "자기 세션 reagents 조회").toBeNull();
        for (const r of data ?? []) expect(r.school_id, "RLS 로 자기 학교 시약만").toBe(school.id);
        return (data ?? []).map((r) => r.name as string).sort();
      };
      const box = page.locator('main button[aria-haspopup="listbox"]').first();
      const list = page.locator('main [role="listbox"]');
      const readOptions = async (): Promise<string[]> => {
        await expect(async () => {
          if ((await box.getAttribute("aria-expanded")) !== "true") await box.click();
          await expect(list).toBeVisible({ timeout: 1_000 });
        }).toPass({ timeout: 15_000 });
        return (await list.locator('[role="option"]').allInnerTexts()).map((t) => t.trim()).sort();
      };

      // 같은 실행의 R-db 테스트가 임시 시약을 넣었다 지우므로, 화면을 읽기 전·후 DB 가 같을 때의 짝으로 비교한다
      let pair: { db: string[]; options: string[] } | null = null;
      for (let attempt = 0; attempt < 5 && !pair; attempt++) {
        const before = await readDb();
        await page.goto(usagePath());
        await waitUsage(page, false);
        const options = await readOptions();
        const after = await readDb();
        if (JSON.stringify(before) === JSON.stringify(after)) pair = { db: after, options };
      }
      expect(pair, "시약 목록이 계속 바뀌어 화면과 비교할 스냅샷을 얻지 못함").not.toBeNull();
      for (const n of ownSeed) expect(pair!.db, `자기 학교 seed 시약 ${n}`).toContain(n);
      expect(pair!.options, "선택 목록 = 자기 학교 시약 전부").toEqual(pair!.db);
      const listText = await list.innerText();
      for (const n of foreign) {
        if (ownSeed.some((o) => o.includes(n))) continue;
        expect(listText, `선택 목록에 다른 학교 시약 ${n}`).not.toContain(n);
      }
      const html = await response!.text();
      for (const n of foreign) {
        if (ownSeed.some((o) => o.includes(n))) continue;
        expect(html, `응답 본문에 다른 학교 시약명 ${n}`).not.toContain(n);
      }
    } finally {
      await context.close();
    }
  });
}

// ---------- 다른 학교 시약 id · 없는 id 직접 접근 ----------
for (const role of ROLES) {
  const other = otherOf(role);
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} → ${ROLE_LABEL[other]} 학교 시약 id 로 ?reagent 접근: 404 · 시약명 미노출 · 없는 id 와 같은 응답`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const mySchool = seedSchoolOf(role);
    const otherSchool = seedSchoolOf(other);
    expect(otherSchool.id, "서로 다른 학교").not.toBe(mySchool.id);
    const all = seedReagents();
    const ownNames = all.filter((r) => r.school_id === mySchool.id).map((r) => r.name);
    const foreign = all.filter((r) => r.school_id === otherSchool.id);
    expect(foreign.length, "다른 학교 seed 시약이 있어야 검사가 의미 있음").toBeGreaterThan(0);
    const target = foreign[0];

    // 양성 대조: 다른 학교 계정 자기 세션으로는 그 시약이 있고 사용 기록 화면이 열린다
    const o = await openAs(browser, info, other, SCREEN, usagePath(target.id));
    try {
      expect(o.response?.status(), `${ROLE_LABEL[other]} 자기 시약 사용 기록 응답`).toBe(200);
      await waitUsage(o.page, true);
      await expect(reagentHead(o.page).first()).toContainText(target.name);
      expect(await dbStock(o.page, target.id), `${ROLE_LABEL[other]} 세션으로 ${target.name} 읽힘`).not.toBeNull();
    } finally {
      await o.context.close();
    }

    const { context, page, response } = await openAs(browser, info, role, SCREEN, usagePath(target.id));
    try {
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(mySchool.name);
      expect(await dbStock(page, target.id), `${ROLE_LABEL[role]} 세션으로 다른 학교 시약 0행`).toBeNull();

      expect(response, "응답").not.toBeNull();
      expect(response!.status(), "다른 학교 시약 id → 404").toBe(404);
      const html = await response!.text();
      const shownForeign = await bodyText(page);
      expect(await reagentHead(page).count(), "다른 학교 시약 카드 없음").toBe(0);
      expect(await page.locator('main input[name="amount"]').count(), "다른 학교 시약 사용량 입력 없음").toBe(0);
      for (const r of foreign) {
        if (ownNames.some((n) => n.includes(r.name))) continue;
        expect(html, `응답 본문에 다른 학교 시약명 ${r.name}`).not.toContain(r.name);
        expect(shownForeign, `화면에 다른 학교 시약명 ${r.name}`).not.toContain(r.name);
      }
      expect(html, `응답 본문에 다른 학교명 ${otherSchool.name}`).not.toContain(otherSchool.name);

      // 없는 id (무작위 uuid) · 형식이 틀린 id: 같은 상태 코드 · 같은 화면 글자
      const missingId = randomUUID();
      expect(all.some((r) => r.id === missingId), "무작위 id 는 seed 에 없음").toBe(false);
      for (const bad of [missingId, "not-a-reagent-id"]) {
        const res = await page.goto(usagePath(bad));
        await page.waitForLoadState("load");
        expect(res, `없는 id(${bad}) 응답`).not.toBeNull();
        expect(res!.status(), `없는 id(${bad}) 상태 코드 = 다른 학교 id 상태 코드`).toBe(response!.status());
        expect(await bodyText(page), `없는 id(${bad}) 화면 글자 = 다른 학교 id 화면 글자`).toBe(shownForeign);
      }
    } finally {
      await context.close();
    }
  });
}
