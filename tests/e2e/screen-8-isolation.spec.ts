// 화면 8 (사용자 관리) 학교 격리: N1-ui
// 기준: harness/d5-gates.md N1-ui (로그인 후 화면 텍스트의 학교명 종류 = 1), design/rules.json never.N1,
//       harness/d7-data.md §8 (같은 학교 사용자만 보인다 · 멤버의 이메일은 보여 주지 않는다 · invites 는 같은 학교 admin 만).
// 학교 A admin(공용 계정)은 읽기만 한다. 대조용으로 일회용 학교(멤버·대기 초대)를 하나 만들고 끝나면 지운다.
// service role 은 준비·정리·대조 조회(다른 학교의 이름·멤버·이메일 목록)에만 쓴다 — 판정 대상은 브라우저 화면과 응답 본문.
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { browserSession, routeOf, rules, sel } from "./screen-helpers";
import {
  NO_RESIDUE,
  ROW,
  SCREEN,
  addMember,
  clientFor,
  countsOf,
  dbMembers,
  dbPendingInvites,
  manage,
  memberEmails,
  modal,
  openInviteSheet,
  openRoleSheet,
  openTemp,
  otherSchools,
  readHeader,
  readInvites,
  readMembers,
  schoolNamesShown,
  sharedSnapshot,
  sweep,
  tempEmail,
  tempSchool,
  waitUsers,
  type OtherSchool,
  type TempSchool,
  type TempUser,
} from "./screen-8-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "iso";
const USERS_HREF = routeOf(SCREEN);
const N1 = rules.never.N1;

type Fixture = { school: TempSchool; members: TempUser[]; inviteEmail: string };
let before: Awaited<ReturnType<typeof sharedSnapshot>> | null = null;
let fixture: Promise<Fixture> | null = null;

/** 대조용 일회용 학교: admin + 멤버 2명 + 대기 초대 1건 (워커당 1개) */
function otherSchoolFixture(info: TestInfo): Promise<Fixture> {
  fixture ??= (async () => {
    const school = await tempSchool(info, GROUP);
    const members = [await addMember(school, info, GROUP, "격리멤버"), await addMember(school, info, GROUP, "격리멤버")];
    const inviteEmail = tempEmail(info, GROUP, "inv-");
    const res = await (await clientFor(school.admin)).rpc("invite_members", { p_emails: [inviteEmail], p_role: "teacher" });
    expect(res.error, `준비: 일회용 학교 초대 (${res.error?.message})`).toBeNull();
    return { school, members, inviteEmail };
  })();
  return fixture;
}

test.beforeAll(async () => {
  before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  fixture = null;
  const left = await sweep(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·초대·프로필 잔여물").toEqual(NO_RESIDUE);
  if (before) expect(await sharedSnapshot(), "학교 A·B 의 프로필·초대가 그대로").toEqual(before);
});

/** 화면 글자: 기본 · 역할 변경 시트 · 초대 시트 상태를 모두 모은다 (시트 안 글자도 격리 대상) */
async function collectTexts(page: Page, sheetMemberName: string): Promise<string> {
  const out: string[] = [];
  const body = () => page.locator("body").innerText();
  out.push(await body());
  await openRoleSheet(page, sheetMemberName);
  out.push(await body());
  await page.keyboard.press("Escape");
  await expect(modal(page)).toHaveCount(0);
  await openInviteSheet(page);
  out.push(await body());
  await page.keyboard.press("Escape");
  await expect(modal(page)).toHaveCount(0);
  return out.join("\n");
}

/**
 * 다른 학교의 이름·멤버 이름·이메일이 글자(화면·응답 본문)에 없는지.
 * 자기 학교의 글자에 우연히 포함되는 값(같은 이름 등)은 비교에서 빼고, 비교한 값의 수를 돌려준다.
 */
function expectNoOtherSchool(texts: Record<string, string>, others: OtherSchool[], ownStrings: string[]): number {
  let compared = 0;
  const own = ownStrings.map((s) => s.toLowerCase());
  const distinct = (v: string) => v.trim().length >= 2 && !own.some((o) => o.includes(v.toLowerCase()));
  for (const o of others) {
    for (const v of [o.name, ...o.memberNames, ...o.emails]) {
      if (!distinct(v)) continue;
      compared++;
      for (const [where, text] of Object.entries(texts)) {
        expect(text.toLowerCase().includes(v.toLowerCase()), `${where} 에 다른 학교(${o.name})의 '${v}'`).toBe(false);
      }
    }
  }
  return compared;
}

/**
 * 학교명 종류 = rules.json distinct_school_names, 보이는 학교명은 자기 학교명(의 패턴에 걸리는 부분)뿐이고 자기 학교명이 표시된다.
 * (패턴은 "…고등학교" 까지만 잡으므로 "테스트고등학교A" 는 "테스트고등학교" 로 걸린다 — 화면 10 격리 스펙과 같은 비교)
 */
function checkSchoolNames(text: string, mine: string, where: string): void {
  const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
  expect(names, `${where}: 학교명 종류`).toHaveLength(N1.distinct_school_names);
  for (const n of names) expect(mine, `${where}: 보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
  expect(text, `${where}: 자기 학교명 표시`).toContain(mine);
}

test(`[N1-ui][S${SCREEN}] 학교A admin ${USERS_HREF}: 화면·응답 본문에 다른 학교(학교B·일회용 학교·그 밖의 모든 학교)의 학교명·사용자 이름·이메일 0 · 학교명 종류 = rules.json distinct_school_names · 멤버·초대 행 = 자기 학교 것만 · 멤버 이메일 미표시`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const fx = await otherSchoolFixture(info);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitUsers(page);
    const me = await browserSession(page);
    const members = await dbMembers(page);
    const schoolId = members[0].school_id;
    expect(new Set(members.map((m) => m.school_id)).size, "로그인 세션 profiles 는 한 학교").toBe(1);
    expect(schoolId, "일회용 학교와 다른 학교").not.toBe(fx.school.id);

    const others = await otherSchools(schoolId);
    const temp = others.find((o) => o.id === fx.school.id);
    expect(temp, "대조: 일회용 학교가 다른 학교 목록에 있음").toBeTruthy();
    expect(temp!.memberNames.length, "대조: 일회용 학교 멤버").toBeGreaterThanOrEqual(3);
    expect(temp!.emails, "대조: 일회용 학교 대기 초대").toContain(fx.inviteEmail);
    expect(others.length, "대조: 다른 학교(학교B·일회용·실사용·데모) 수").toBeGreaterThanOrEqual(3);

    const target = members.find((m) => m.user_id !== me.userId)!;
    const text = await collectTexts(page, target.display_name);
    const res = await context.request.get(USERS_HREF);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html, "응답 본문이 화면 8 (대조)").toContain(me.schoolName);

    const ownStrings = [me.schoolName, ...members.map((m) => m.display_name)];
    const compared = expectNoOtherSchool({ "화면 글자": text, "응답 본문": html }, others, ownStrings);
    expect(compared, "비교한 다른 학교 값 수 (학교명·이름·이메일)").toBeGreaterThanOrEqual(others.length + 4);

    // 학교명 종류 = 1 (자기 학교)
    expect(N1.screens_require_school_name, `rules.json screens_require_school_name 에 화면 ${SCREEN}`).toContain(SCREEN);
    checkSchoolNames(text, me.schoolName, "화면 글자(기본·시트)");
    checkSchoolNames(html, me.schoolName, "응답 본문");
    expect(await schoolNamesShown(page), "지금 화면의 학교명 종류").toHaveLength(N1.distinct_school_names);
    expect((await readHeader(page)).school).toBe(me.schoolName);

    // 행 = 자기 학교 것만
    const shown = await readMembers(page);
    expect(shown.map((s) => s.name).sort(), "멤버 행 = 로그인 세션 profiles").toEqual(members.map((m) => m.display_name).sort());
    const invites = await dbPendingInvites(page);
    expect(invites.every((i) => i.school_id === schoolId), "로그인 세션 invites 는 자기 학교").toBe(true);
    expect((await readInvites(page)).map((i) => i.email).sort(), "초대 행 = 로그인 세션 invites").toEqual(invites.map((i) => i.email).sort());
    await expect(manage(page).locator(sel(ROW))).toHaveCount(members.length + invites.length);

    // d7 §8: 멤버의 이메일은 보여 주지 않는다 (화면에도 응답 본문에도)
    const emails = await memberEmails(schoolId);
    expect(emails.length, "대조: 자기 학교 멤버 이메일").toBe(members.length);
    for (const e of emails) {
      expect(text.toLowerCase().includes(e), `화면 글자에 멤버 이메일`).toBe(false);
      expect(html.toLowerCase().includes(e), `응답 본문에 멤버 이메일`).toBe(false);
    }
  } finally {
    await context.close();
  }
});

test(`[N1-ui][S${SCREEN}] 일회용 학교 admin ${USERS_HREF}: 자기 학교 멤버·초대만 보이고 학교 A·B·다른 학교의 학교명·사용자 이름·이메일 0 (화면·응답 본문) · 학교명 1종 · 멤버 이메일 미표시`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const fx = await otherSchoolFixture(info);
  const { context, page } = await openTemp(browser, info, fx.school.admin);
  try {
    await waitUsers(page);
    const members = await dbMembers(page);
    expect(members.every((m) => m.school_id === fx.school.id), "로그인 세션 profiles = 일회용 학교").toBe(true);
    expect(members.map((m) => m.user_id).sort(), "일회용 학교 멤버").toEqual([fx.school.admin.id, ...fx.members.map((m) => m.id)].sort());

    const others = await otherSchools(fx.school.id);
    // 대조: 공용 계정의 학교 A(멤버 3명 이상)·B 가 다른 학교 목록에 있다
    expect(others.filter((o) => o.memberNames.length > 0).length, "대조: 멤버가 있는 다른 학교").toBeGreaterThanOrEqual(2);

    const text = await collectTexts(page, fx.members[0].name);
    const res = await context.request.get(USERS_HREF);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html, "응답 본문이 화면 8 (대조)").toContain(fx.school.name);

    const ownStrings = [fx.school.name, fx.inviteEmail, ...members.map((m) => m.display_name)];
    const compared = expectNoOtherSchool({ "화면 글자": text, "응답 본문": html }, others, ownStrings);
    expect(compared, "비교한 다른 학교 값 수").toBeGreaterThanOrEqual(others.length + 4);

    checkSchoolNames(text, fx.school.name, "화면 글자(기본·시트)");
    checkSchoolNames(html, fx.school.name, "응답 본문");
    expect(await schoolNamesShown(page), "지금 화면의 학교명").toEqual([fx.school.name]);

    const shown = await readMembers(page);
    expect(shown.map((s) => s.name).sort(), "멤버 행 = 일회용 학교 멤버").toEqual([fx.school.admin.name, ...fx.members.map((m) => m.name)].sort());
    expect((await readInvites(page)).map((i) => i.email), "초대 행 = 일회용 학교 초대").toEqual([fx.inviteEmail]);
    expect(await readHeader(page)).toEqual({ school: fx.school.name, ...countsOf(members) });

    // 멤버(가입한 사람)의 이메일은 보이지 않는다 — 초대 대기의 이메일만 보인다
    for (const u of [fx.school.admin, ...fx.members]) {
      expect(text.toLowerCase().includes(u.email), "화면 글자에 멤버 이메일").toBe(false);
      expect(html.toLowerCase().includes(u.email), "응답 본문에 멤버 이메일").toBe(false);
    }
    expect(text, "초대 대기 이메일은 보인다 (대조)").toContain(fx.inviteEmail);
  } finally {
    await context.close();
  }
});
