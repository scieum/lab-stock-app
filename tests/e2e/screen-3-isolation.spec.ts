// 화면 3 (시약 상세) 학교 격리 N1-ui
//  - 자기 학교 시약 상세: 학교명 종류 = rules.json never.N1.distinct_school_names, 자기 학교명만, 다른 학교명·다른 학교 시약명 미노출
//  - 다른 학교 시약 id 로 직접 접근: HTTP 404, 응답 본문(HTML·RSC 포함)과 화면에 그 시약명 없음 (학교 A ↔ 학교 B 양방향)
//  - 없는 id: 다른 학교 id 와 같은 상태 코드·같은 화면 글자 (존재 여부 비노출)
// 다른 학교 시약 id 가 실제로 있다는 양성 대조는 그 학교 계정의 브라우저 세션(RLS)으로 확인한다. service role 미사용.
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserSession, rules, sel, seedRows } from "./screen-helpers";
import { SCREEN, dbDetail, detailPath, seedReagents, seedSchoolOf, waitDetail } from "./screen-3-helpers";

const N1 = rules.never.N1;
const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];

/** 다른 학교 계정 (학교 A 계정 → 학교 B 계정, 학교 B 계정 → 학교 A 교사) */
const otherOf = (role: Role): Role => (role === "schoolB" ? "teacher" : "schoolB");

/** 화면 글자 (nav·탭바 포함 body) — 404 화면 비교용, 공백 정리 */
async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

// ---------- 자기 학교 시약 상세: 학교명 ----------
for (const role of ROLES) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 시약 상세: 학교명 종류 = rules.json distinct_school_names · 다른 학교명·다른 학교 시약명 미노출`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const schools = seedRows("schools");
    expect(schools.length, "seed 학교가 2개 이상이어야 격리 검사가 의미 있음").toBeGreaterThan(1);
    expect(N1.screens_require_school_name, `화면 ${SCREEN} 은 학교명 표시 대상`).toContain(SCREEN);
    const school = seedSchoolOf(role);
    const all = seedReagents();
    const pick = all.find((r) => r.school_id === school.id);
    expect(pick, "자기 학교 seed 시약").toBeTruthy();
    const ownNames = all.filter((r) => r.school_id === school.id).map((r) => r.name);
    const foreignSchools = schools.filter((s) => s.id !== school.id);
    const foreignReagents = all.filter((r) => r.school_id !== school.id).map((r) => r.name);
    expect(foreignReagents.length, "다른 학교 seed 시약이 있어야 검사가 의미 있음").toBeGreaterThan(0);

    const { context, page } = await openAs(browser, info, role, SCREEN, detailPath(pick!.id));
    try {
      await waitDetail(page);
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);
      // 양성 대조: 그 시약 카드가 실제로 그려짐
      await expect(page.locator(sel("reagent-detail-card")).first()).toContainText(pick!.name);

      const text = await page.locator("body").innerText();
      const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
      expect(names, "학교명 종류").toHaveLength(N1.distinct_school_names);
      for (const n of names) expect(me.schoolName, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
      expect(text, "자기 학교명 표시").toContain(me.schoolName);
      for (const s of foreignSchools) expect(text, `다른 학교명 ${s.name}`).not.toContain(s.name);
      for (const n of foreignReagents) {
        if (ownNames.some((o) => o.includes(n))) continue; // 자기 학교 시약명의 부분 문자열이면 판정 불가
        expect(text, `다른 학교 시약명 ${n}`).not.toContain(n);
      }
    } finally {
      await context.close();
    }
  });
}

// ---------- 다른 학교 시약 id · 없는 id 직접 접근 ----------
for (const role of ROLES) {
  const other = otherOf(role);
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} → ${ROLE_LABEL[other]} 학교 시약 id 직접 접근: 404 · 시약명 미노출 · 없는 id 와 같은 응답`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const mySchool = seedSchoolOf(role);
    const otherSchool = seedSchoolOf(other);
    expect(otherSchool.id, "서로 다른 학교").not.toBe(mySchool.id);
    const all = seedReagents();
    const ownNames = all.filter((r) => r.school_id === mySchool.id).map((r) => r.name);
    const foreign = all.filter((r) => r.school_id === otherSchool.id);
    expect(foreign.length, "다른 학교 seed 시약이 있어야 검사가 의미 있음").toBeGreaterThan(0);
    const target = foreign[0];

    // 양성 대조: 다른 학교 계정 자기 세션(RLS)으로는 그 시약이 실제로 있고 상세 화면이 열린다
    const o = await openAs(browser, info, other, SCREEN, detailPath(target.id));
    try {
      expect(o.response?.status(), `${ROLE_LABEL[other]} 자기 시약 상세 응답`).toBe(200);
      await waitDetail(o.page);
      expect(await dbDetail(o.page, target.id), `${ROLE_LABEL[other]} 세션으로 ${target.name} 읽힘`).not.toBeNull();
      expect((await browserSession(o.page)).schoolName, "다른 학교 계정 학교").toBe(otherSchool.name);
    } finally {
      await o.context.close();
    }

    const { context, page, response } = await openAs(browser, info, role, SCREEN, detailPath(target.id));
    try {
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(mySchool.name);
      // 자기 세션(RLS)으로는 그 시약이 0행
      expect(await dbDetail(page, target.id), `${ROLE_LABEL[role]} 세션으로 다른 학교 시약 0행`).toBeNull();

      expect(response, "응답").not.toBeNull();
      expect(response!.status(), "다른 학교 시약 id → 404").toBe(404);
      const html = await response!.text();
      const shownForeign = await bodyText(page);
      expect(await page.locator(sel("reagent-detail-card")).count(), "다른 학교 시약 카드 없음").toBe(0);
      for (const r of foreign) {
        if (ownNames.some((n) => n.includes(r.name))) continue; // 자기 학교 시약명의 부분 문자열이면 판정 불가
        expect(html, `응답 본문에 다른 학교 시약명 ${r.name}`).not.toContain(r.name);
        expect(shownForeign, `화면에 다른 학교 시약명 ${r.name}`).not.toContain(r.name);
      }
      expect(html, `응답 본문에 다른 학교명 ${otherSchool.name}`).not.toContain(otherSchool.name);

      // 없는 id: 같은 상태 코드 · 같은 화면 글자
      const missingId = randomUUID();
      expect(all.some((r) => r.id === missingId), "무작위 id 는 seed 에 없음").toBe(false);
      const missRes = await page.goto(detailPath(missingId));
      await page.waitForLoadState("load");
      expect(missRes, "없는 id 응답").not.toBeNull();
      expect(missRes!.status(), "없는 id 상태 코드 = 다른 학교 id 상태 코드").toBe(response!.status());
      const shownMissing = await bodyText(page);
      expect(shownMissing, "없는 id 화면 글자 = 다른 학교 id 화면 글자").toBe(shownForeign);
    } finally {
      await context.close();
    }
  });
}
