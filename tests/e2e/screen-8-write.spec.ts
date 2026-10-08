// 화면 8 (사용자 관리) 쓰기 흐름: 초대 · 역할 변경 · 삭제(내보내기) · 연타 · 본인 admin 해제 · 내보낸 세션 안내
// 기준: 디자인 s2-spec "## 화면 8"(ex-modal-card ①②③ · ex-toast 문구 · "초대 대기 (N)" 행), harness/d7-data.md §8
//       (초대·역할 변경·사용자 삭제·내보낸 계정·저장 후), design/frames/8-{mobile|desktop}.json, dev-rules route_auth 8.
//
// 전부 일회용 학교의 일회용 계정으로 한다 (screen-8-helpers 머리말). 공용 계정·학교 A·B·실사용 학교·데모 학교에는 쓰지 않는다.
// 일회용 admin 의 브라우저 세션은 쿠키로 심는다 (로그인 화면·가입 API 를 거치지 않는다 — 메일 발송 없음).
// service role 은 준비·정리·대조 조회에만 쓰고, 판정 대상은 브라우저 화면과 그 화면이 보낸 요청의 결과다.
// 한 워커에서 순서대로 돈다 (afterAll 정리가 다른 워커의 일회용 학교를 지우지 않게).
import { deskOnlyComponents } from "../desktop-shell";
import { isDeskPage, newFrame } from "./desk-helpers";
import { test, expect, type TestInfo } from "@playwright/test";
import { countComponent, routeOf, rules, sel } from "./screen-helpers";
import { expectShell, isShellComponent, shellNavLabel, shellNavLabels, shellSchoolScope } from "./shell-helpers";
import {
  CANCEL_BUTTON,
  CHANGE_BUTTON,
  CONFIRM_TITLE,
  DELETE_BUTTON,
  deleteBodyText,
  deleteButtonLabel,
  DELETE_USER_BUTTON,
  EMPTY,
  HOME_SCREEN,
  INPUT,
  INVITE_STATUS,
  LANDING_SCREEN,
  LAST_ADMIN_HINT,
  LOGIN_SCREEN,
  LOGOUT_BUTTON,
  MODAL,
  NAV_LABEL,
  NO_RESIDUE,
  NO_SCHOOL_TITLE,
  OUTLINE,
  PILL_SOFT,
  PRIMARY,
  ROLE_ORDER,
  ROLE_TEXT,
  ROW,
  SCREEN,
  SEGMENT,
  SEGMENT_ACTIVE,
  STAFF_NAV_LABEL,
  TOAST,
  TOAST_REMOVED,
  TOAST_ROLE,
  USER_MANAGE,
  addInviteEmail,
  addMember,
  authUserExists,
  clientFor,
  confirmDialog,
  countsOf,
  dbMembers,
  dbPendingInvites,
  exact,
  expectHeaderMatchesDb,
  frameCounts,
  inviteDialog,
  inviteRow,
  inviteSubmit,
  inviteSubmitLabel,
  inviteSubmitText,
  inviteEmailInput,
  deskInviteCount,
  invitesByService,
  invitesHeading,
  manage,
  memberRow,
  memberRows,
  membersByService,
  modal,
  openInviteSheet,
  openRoleSheet,
  openTemp,
  outlineIn,
  pickRole,
  primaryIn,
  profileByService,
  radio,
  readHeader,
  readInvites,
  readMembers,
  roleDialog,
  screenComponents,
  service,
  sharedSnapshot,
  sweep,
  tempEmail,
  tempSchool,
  toast,
  toastInvited,
  todayDots,
  inviteDay,
  inviteCaption,
  INVITE_DATE_DESK_EXAMPLE,
  viewportOf,
  waitUsers,
  watchActions,
  type TempSchool,
} from "./screen-8-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "write";
const USERS_HREF = routeOf(SCREEN);
const HOME = routeOf(HOME_SCREEN);
/** 저장 요청 + 목록 갱신까지 기다리는 한도 (토스트는 잠깐만 떠 있으므로 뜨는 순간을 잡는다) */
const SAVE_TIMEOUT = 20_000;
/** 토스트가 사라지기를 기다리는 한도 */
const TOAST_GONE_TIMEOUT = 15_000;

let before: Awaited<ReturnType<typeof sharedSnapshot>> | null = null;
let shared: Promise<TempSchool> | null = null;

/** 이 파일의 대부분 테스트가 같이 쓰는 일회용 학교 (워커당 1개 — admin 세션을 한 번만 만든다). 테스트마다 자기 멤버를 따로 넣는다 */
function sharedSchool(info: TestInfo): Promise<TempSchool> {
  shared ??= tempSchool(info, GROUP);
  return shared;
}

async function pendingByService(schoolId: string) {
  return (await invitesByService(schoolId)).filter((i) => i.accepted_at === null);
}

test.beforeAll(async () => {
  before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  shared = null;
  const left = await sweep(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·초대·프로필 잔여물").toEqual(NO_RESIDUE);
  // 공용 계정(학교 A·B)의 프로필·초대는 그대로
  if (before) expect(await sharedSnapshot(), "학교 A·B 의 프로필·초대가 그대로").toEqual(before);
});

// =====================================================================
// C1 — 시안과 같은 상태 (멤버 목록 + 초대 대기 + 다른 멤버의 역할 변경 시트)
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 admin, 시안 1.17 과 같은 상태(멤버·초대 대기 + 다른 멤버의 삭제 확인 시트): 시안 8 프레임에 있는 화면 ${SCREEN} 컴포넌트가 프레임 개수 이상 · nav-pill·${USER_MANAGE}·${MODAL}·${INPUT} 는 정확히 프레임 개수 · 프레임에 없는 상태 컴포넌트는 0`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const school = await sharedSchool(info);
  const viewport = viewportOf(info).name;
  const frame = frameCounts(viewport);
  // 시안의 멤버 행 수 · 초대 대기 행 수: 390(시안 8-mobile) = member-name · invite-email 노드 /
  // 1440(새 프레임 8-desktop, d7 §23 run b) = 첫 data-table("멤버")의 행 · 둘째 data-table("초대 대기")의 행
  let wantMembers = frame["member-name"] ?? 0;
  let wantInvites = frame["invite-email"] ?? 0;
  if (viewport === "desktop") {
    const per: number[] = [];
    for (const n of newFrame(`${SCREEN}-desktop`)) {
      if (n.name === "data-table") per.push(0);
      else if (n.name === ROW && n.path.includes("data-table")) per[per.length - 1] += 1;
    }
    expect(per.length, "시안 8-desktop data-table = 멤버 · 초대 대기").toBe(2);
    [wantMembers, wantInvites] = per;
  }
  expect(wantMembers + wantInvites, `시안 ${ROW} = 멤버 + 초대`).toBe(frame[ROW]);
  expect(wantMembers, "시안 멤버 행").toBeGreaterThanOrEqual(2);
  while ((await membersByService(school.id)).length < wantMembers) await addMember(school, info, GROUP);
  const lack = wantInvites - (await pendingByService(school.id)).length;
  if (lack > 0) {
    const admin = await clientFor(school.admin);
    const emails = Array.from({ length: lack }, () => tempEmail(info, GROUP, "inv-"));
    const res = await admin.rpc("invite_members", { p_emails: emails, p_role: "student" });
    expect(res.error, `준비: 초대 ${lack}건 (${res.error?.message})`).toBeNull();
  }

  const { context, page } = await openTemp(browser, info, school.admin);
  try {
    await waitUsers(page);
    const members = await dbMembers(page);
    const invites = await dbPendingInvites(page);
    expect(members.length, "멤버 ≥ 시안").toBeGreaterThanOrEqual(wantMembers);
    expect(invites.length, "초대 대기 ≥ 시안").toBeGreaterThanOrEqual(wantInvites);
    const target = members.find((m) => m.user_id !== school.admin.id)!;
    // 시안 1.17 8 = 다른 멤버의 삭제 확인 시트 (역할 변경 시트 → "사용자 삭제" → 확인 시트)
    await outlineIn(await openRoleSheet(page, target.display_name), DELETE_USER_BUTTON).click();
    const dialog = confirmDialog(page);
    await expect(dialog, "삭제 확인 시트").toBeVisible();

    // 폭 390: 데스크톱 전용 data-table(run b, rules desktop_required · d7 §23)도 0
    const absent = [PILL_SOFT, SEGMENT, SEGMENT_ACTIVE, EMPTY, TOAST, ...(viewport === "mobile" ? deskOnlyComponents() : [])];
    let checked = 0;
    // 셸은 폭별 기대값 (390 nav-pill 1 · 탭바 / 1440 app-sidebar 1 · nav-pill 0 — rules 1.22 desktop_shell, C2 · C3)
    await expectShell(page, viewport, SCREEN, "삭제 확인 시트");
    for (const name of screenComponents()) {
      if (isShellComponent(name)) continue;
      const want = frame[name] ?? 0;
      // 공통 셸 예외(rules.json app_exceptions — 디자인 1.15 nav-account-menu)는 이 화면의 옛 시안 프레임에 없고 dev-rules 가 더한다:
      // 로그인 후 셸이 있는 화면마다 정확히 1개 (dev-rules components_note · route_auth.logout)
      if (name in (rules as unknown as { app_exceptions: Record<string, string> }).app_exceptions) {
        expect(await countComponent(page, name), `셸 ${name} = 1`).toBe(1);
        continue;
      }
      const n = await countComponent(page, name);
      if (want === 0) {
        // 프레임에 없는 상태(초대 시트·검색 0건·저장 직후)의 컴포넌트 — 이 상태에서는 없어야 한다 (dev-rules components_note)
        expect(absent, `프레임에 없는 화면 ${SCREEN} 컴포넌트 ${name}`).toContain(name);
        expect(n, `${name} (역할 변경 시트 상태)`).toBe(0);
        continue;
      }
      expect(n, `${name} ≥ 시안 ${want}`).toBeGreaterThanOrEqual(want);
      await expect(page.locator(sel(name)).locator("visible=true").first(), `${name} 보임`).toBeVisible();
      if (["nav-pill", USER_MANAGE, MODAL, INPUT].includes(name)) expect(n, `${name} = 시안 ${want}`).toBe(want);
      checked++;
    }
    // 예전엔 nav-pill 을 여기서 셌다(≥ 7) — 셸은 위 expectShell(폭별)로 봤다: 본문 컴포넌트 = 예전 프레임 8 의 본문 6종
    expect(checked, "프레임과 비교한 본문 컴포넌트 수").toBeGreaterThanOrEqual(6);
    await expect(manage(page).locator(sel(ROW)), `${ROW} = 멤버 + 초대 대기`).toHaveCount(members.length + invites.length);
    await expect(manage(page).getByRole("heading", { name: exact(invitesHeading(invites.length)) }), `"초대 대기 (N)"`).toBeVisible();
    // 시트 안 (시안 1.17 8): 제목 · × 닫기 · "{이름} · 사용·입고 기록은 남아요" · button-outline "취소" · button-primary "{이름} 삭제"
    await expect(dialog.locator(sel(OUTLINE)), `시트 안 ${OUTLINE} = 시안 ${frame[OUTLINE]}`).toHaveCount(frame[OUTLINE]);
    await expect(outlineIn(dialog, CANCEL_BUTTON)).toHaveCount(1);
    await expect(primaryIn(dialog, deleteButtonLabel(target.display_name))).toHaveCount(1);
    await expect(dialog.getByText(exact(deleteBodyText(target.display_name)))).toBeVisible();
    await expect(dialog.getByRole("button", { name: "닫기", exact: true }), "× 닫기").toHaveCount(1);
    await expect(dialog.getByRole("radio"), "삭제 확인 시트에는 역할 라디오 없음").toHaveCount(0);
    // 학교명은 자기 학교 하나 (셸: 390 nav-pill / 1440 app-sidebar)
    await expect(shellSchoolScope(page, viewport)).toContainText(school.name);
    expect((await readHeader(page)).school).toBe(school.name);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 초대
// =====================================================================

test(`[C1][S${SCREEN}] 초대 2명(교사): "${inviteSubmitLabel(2)}" → ${TOAST} "${toastInvited(2)}" → 시트 닫힘 → "초대 대기 (N)" 와 행(이메일·초대일·"${INVITE_STATUS}") → DB invites 일치(소문자·역할·대기), 요청 1건, 멤버 수 그대로`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const school = await sharedSchool(info);
  const { context, page } = await openTemp(browser, info, school.admin);
  try {
    await waitUsers(page);
    const pendingBefore = await pendingByService(school.id);
    const headerBefore = await expectHeaderMatchesDb(page, school.name);
    const e1 = tempEmail(info, GROUP, "inv-");
    const e2 = tempEmail(info, GROUP, "inv-");
    const day0 = todayDots();

    const dialog = await openInviteSheet(page);
    await expect(inviteSubmit(page)).toHaveText(exact(inviteSubmitText(page, 0)));
    if (isDeskPage(page)) {
      // 1440 초대 줄(시안 8-desktop): 빈 칸으로 "초대" → 안내만 · 요청 0
      const a0 = watchActions(page);
      await inviteSubmit(page).click();
      await expect(page.locator("main").getByRole("alert"), "빈 칸 → 안내").toHaveCount(1);
      expect(a0.count(), "빈 칸 → 요청 0").toBe(0);
    } else await expect(inviteSubmit(page)).toBeDisabled();
    // 대문자로 넣어도 소문자로 저장된다 (d7 §8 invites.email 소문자)
    await addInviteEmail(page, e1.toUpperCase(), 1);
    await addInviteEmail(page, e2, 2);
    await expect(inviteSubmit(page)).toBeEnabled();
    const seg = dialog.locator(sel(SEGMENT));
    await seg.getByText(exact(ROLE_TEXT.teacher)).click();
    await expect(seg.locator(sel(SEGMENT_ACTIVE))).toHaveText(exact(ROLE_TEXT.teacher));
    await expect(seg.locator(sel(SEGMENT_ACTIVE))).toHaveCount(1);

    const actions = watchActions(page);
    await inviteSubmit(page).click();
    await expect(toast(page), `${TOAST}`).toHaveText(exact(toastInvited(2)), { timeout: SAVE_TIMEOUT });
    await expect(toast(page)).toHaveCount(1);
    await expect(modal(page), "저장 후 시트 닫힘 (사용자 목록으로)").toHaveCount(0);

    // 목록 갱신: "초대 대기 (N)" + 행
    const wantN = pendingBefore.length + 2;
    await expect(manage(page).getByRole("heading", { name: exact(invitesHeading(wantN)) }), `"${invitesHeading(wantN)}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
    const day1 = todayDots();
    const shown = await readInvites(page);
    expect(shown, "초대 대기 행 수").toHaveLength(wantN);
    for (const email of [e1, e2]) {
      const row = shown.find((s) => s.email === email);
      expect(row, `초대 대기 행 ${email} (소문자)`).toBeTruthy();
      // 초대일 (새 프레임 8 — 오케스트레이터 결정): 390 = 보조줄 "{역할} · {M월 D일} 초대"(8-mobile invite-date) /
      // 1440 = 초대일 칸 "{M월 D일}"(8-desktop 초대 대기 표) + 역할 칸
      const days = [day0, day1].map((d) => inviteDay(new Date(`${d.replace(/\./g, "-")}T12:00:00+09:00`)));
      expect(INVITE_DATE_DESK_EXAMPLE, "시안 8-desktop 초대일 칸 틀 = M월 D일").toMatch(/^\d{1,2}월 \d{1,2}일$/);
      const dayTexts = isDeskPage(page) ? days : days.map((d) => inviteCaption(ROLE_TEXT.teacher, d));
      expect(row!.texts.some((t) => dayTexts.includes(t)), `초대일 "${dayTexts[1]}" (${row!.texts.join(" / ")})`).toBe(true);
      if (isDeskPage(page)) expect(row!.texts, "1440 초대 역할 칸 = 교사").toContain(ROLE_TEXT.teacher);
      expect(row!.texts, `상태 "${INVITE_STATUS}"`).toContain(INVITE_STATUS);
      await expect(inviteRow(page, email)).toBeVisible();
    }

    // DB (대조: service · 판정: 로그인 세션 RLS)
    const rows = (await invitesByService(school.id)).filter((i) => [e1, e2].includes(i.email));
    expect(rows.map((r) => r.email).sort(), "invites.email (소문자)").toEqual([e1, e2].sort());
    for (const r of rows) {
      expect(r.role, "초대 역할").toBe("teacher");
      expect(r.accepted_at, "대기").toBeNull();
      expect(r.school_id, "초대한 admin 의 학교").toBe(school.id);
      expect(r.invited_by, "초대한 사람").toBe(school.admin.id);
    }
    expect((await dbPendingInvites(page)).map((i) => i.email).sort(), "화면 초대 대기 = 로그인 세션 invites").toEqual(shown.map((s) => s.email).sort());
    expect(actions.count(), "초대 요청 1건").toBe(1);

    // 초대는 멤버가 아니다: 인원 수 그대로, 초대 행은 눌러도 시트가 열리지 않는다
    expect(await readHeader(page), "헤더 인원 그대로").toEqual(headerBefore);
    await inviteRow(page, e2).click();
    await expect(modal(page), "초대 대기 행은 누를 수 없다").toHaveCount(0);
    // 토스트는 잠깐 뒤 사라진다
    await expect(toast(page), "토스트가 사라짐").toHaveCount(0, { timeout: TOAST_GONE_TIMEOUT });
    // 다시 열면 빈 시트 (앞서 넣은 이메일이 남아 있지 않다) — 1440 은 초대 칸이 비었다
    await openInviteSheet(page);
    await expect(inviteSubmit(page)).toHaveText(exact(inviteSubmitText(page, 0)));
    if (isDeskPage(page)) await expect(inviteEmailInput(page), "보낸 뒤 초대 칸 비움").toHaveValue("");
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 초대 거부: 이미 초대한 이메일 · 이미 멤버인 이메일이 섞이면 시트 안 오류 문구에 그 이메일 · 시트 유지 · ${TOAST} 없음 · 같이 넣은 새 이메일도 초대되지 않음`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const school = await sharedSchool(info);
  const member = await addMember(school, info, GROUP, "기존멤버");
  const invited = tempEmail(info, GROUP, "inv-");
  const seed = await (await clientFor(school.admin)).rpc("invite_members", { p_emails: [invited], p_role: "student" });
  expect(seed.error, `준비: 대기 초대 1건 (${seed.error?.message})`).toBeNull();

  const { context, page } = await openTemp(browser, info, school.admin);
  try {
    const cases = [
      { what: "이미 초대한 이메일", bad: invited },
      { what: "이미 멤버인 이메일", bad: member.email },
    ];
    for (const c of cases) {
      await page.goto(USERS_HREF);
      await waitUsers(page);
      const pendingBefore = (await pendingByService(school.id)).map((i) => i.email).sort();
      const headingBefore = invitesHeading(pendingBefore.length);
      const fresh = tempEmail(info, GROUP, "inv-");
      const dialog = await openInviteSheet(page);
      await addInviteEmail(page, fresh, 1);
      await addInviteEmail(page, c.bad, 2);
      const actions = watchActions(page);
      await inviteSubmit(page).click();
      // 오류 문구: 390 = 시트 안 / 1440 = 초대 줄 바로 아래 (시트 없음)
      const alert = (isDeskPage(page) ? page.locator("main") : dialog).getByRole("alert");
      await expect(alert, `${c.what}: 시트 안 오류 문구`).toHaveCount(1, { timeout: SAVE_TIMEOUT });
      await expect(alert).toBeVisible();
      await expect(alert, `${c.what}: 문제 이메일`).toContainText(c.bad);
      expect(await alert.innerText(), `${c.what}: 문제없는 이메일은 오류 문구에 없다`).not.toContain(fresh);
      await expect(inviteDialog(page), `${c.what}: 시트 유지`).toBeVisible();
      if (isDeskPage(page)) await expect.poll(() => deskInviteCount(page), { message: "넣은 이메일이 그대로" }).toBe(2);
      else await expect(inviteSubmit(page), "넣은 이메일이 그대로").toHaveText(exact(inviteSubmitLabel(2)));
      await expect(toast(page), `${c.what}: 토스트 없음`).toHaveCount(0);
      expect(actions.count(), "요청 1건").toBe(1);
      // 전체 거부: 새 이메일도 초대되지 않았다
      expect((await pendingByService(school.id)).map((i) => i.email).sort(), `${c.what}: 초대 대기 그대로`).toEqual(pendingBefore);
      expect((await invitesByService(school.id)).filter((i) => i.email === fresh), `${c.what}: 새 이메일 초대 행`).toHaveLength(0);
      await expect(manage(page).getByRole("heading", { name: exact(headingBefore) }), "목록 그대로").toBeVisible();
      await expect(inviteRow(page, fresh)).toHaveCount(0);
    }
    // 멤버의 역할·프로필은 그대로
    expect((await profileByService(member.id))?.role).toBe("student");
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 역할 변경
// =====================================================================

test(`[C1][S${SCREEN}] 역할 변경 학생 → 교사: "${CHANGE_BUTTON}" → ${TOAST} "${TOAST_ROLE}" → 시트 닫힘 → 행의 역할·헤더 역할별 인원 갱신 → DB profiles.role 일치, 요청 1건 · 다시 열면 새 역할이 선택돼 있음`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const school = await sharedSchool(info);
  const m = await addMember(school, info, GROUP, "역할변경");
  const { context, page } = await openTemp(browser, info, school.admin);
  try {
    await waitUsers(page);
    const headerBefore = await expectHeaderMatchesDb(page, school.name);
    expect((await readMembers(page)).find((s) => s.name === m.name)?.role, "처음 역할 = 학생").toBe("student");

    const dialog = await openRoleSheet(page, m.name);
    await expect(radio(dialog, "student")).toBeChecked();
    await expect(dialog.getByText(LAST_ADMIN_HINT)).toHaveCount(0);
    await pickRole(dialog, "teacher");
    const actions = watchActions(page);
    await primaryIn(dialog, CHANGE_BUTTON).click();
    await expect(toast(page), `${TOAST}`).toHaveText(exact(TOAST_ROLE), { timeout: SAVE_TIMEOUT });
    await expect(modal(page), "저장 후 시트 닫힘").toHaveCount(0);

    await expect
      .poll(async () => (await readMembers(page)).find((s) => s.name === m.name)?.role, { message: "행의 역할 글자", timeout: SAVE_TIMEOUT })
      .toBe("teacher");
    const headerAfter = await expectHeaderMatchesDb(page, school.name);
    expect(headerAfter, "헤더: 학생 -1 · 교사 +1 · 전체 그대로").toEqual({
      ...headerBefore,
      student: headerBefore.student - 1,
      teacher: headerBefore.teacher + 1,
    });
    const prof = await profileByService(m.id);
    expect(prof?.role, "DB profiles.role").toBe("teacher");
    expect(prof?.school_id, "학교는 그대로").toBe(school.id);
    expect((await dbMembers(page)).find((x) => x.user_id === m.id)?.role, "로그인 세션으로 읽은 역할").toBe("teacher");
    expect(actions.count(), "역할 변경 요청 1건").toBe(1);
    // 다른 멤버는 그대로 (본인 admin 포함)
    expect((await profileByService(school.admin.id))?.role).toBe("admin");

    await expect(toast(page)).toHaveCount(0, { timeout: TOAST_GONE_TIMEOUT });
    const again = await openRoleSheet(page, m.name);
    await expect(radio(again, "teacher"), "다시 열면 새 역할").toBeChecked();
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 사용자 삭제(내보내기)
// =====================================================================

test(`[C1][S${SCREEN}] 사용자 삭제: "${DELETE_USER_BUTTON}" → 확인 카드("${CONFIRM_TITLE}" · × 닫기 · "{이름} · 사용·입고 기록은 남아요" · ${OUTLINE} "${CANCEL_BUTTON}" · ${PRIMARY} "{이름} ${DELETE_BUTTON}" — d7 §18) → "${CANCEL_BUTTON}" 은 역할 시트로 복귀(요청 0) → "${DELETE_BUTTON}" → ${TOAST} "${TOAST_REMOVED}" → 목록에서 사라짐·인원 감소 → DB profiles 행 없음·로그인 계정 존속`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const school = await sharedSchool(info);
  const m = await addMember(school, info, GROUP, "내보내기");
  const keep = await addMember(school, info, GROUP, "남는멤버");
  const { context, page } = await openTemp(browser, info, school.admin);
  try {
    await waitUsers(page);
    const headerBefore = await expectHeaderMatchesDb(page, school.name);
    const actions = watchActions(page);

    const dialog = await openRoleSheet(page, m.name);
    await outlineIn(dialog, DELETE_USER_BUTTON).click();
    const confirm = confirmDialog(page);
    await expect(confirm, "삭제 확인 카드").toBeVisible();
    await expect(modal(page), `${MODAL} 은 하나 (역할 시트가 확인 카드로 바뀐다)`).toHaveCount(1);
    await expect(confirm.getByRole("heading", { name: exact(CONFIRM_TITLE) })).toBeVisible();
    await expect(confirm.locator(sel(OUTLINE)), `확인 카드 ${OUTLINE}`).toHaveCount(1);
    await expect(outlineIn(confirm, CANCEL_BUTTON)).toHaveCount(1);
    await expect(confirm.locator(sel(PRIMARY)), `확인 카드 ${PRIMARY}`).toHaveCount(1);
    await expect(primaryIn(confirm, deleteButtonLabel(m.name)), `"${deleteButtonLabel(m.name)}"`).toHaveCount(1);
    await expect(primaryIn(confirm, deleteButtonLabel(m.name))).toBeEnabled();
    await expect(confirm.getByText(exact(deleteBodyText(m.name))), `본문 "${deleteBodyText(m.name)}"`).toBeVisible();
    await expect(confirm.getByRole("button", { name: "닫기", exact: true }), "오른쪽 위 × 닫기").toHaveCount(1);

    // "취소" → 390 = 역할 시트로 복귀 / 1440 = 가운데 확인 카드만 닫힘(시안 8-desktop — 삭제 진입은 행 끝 더보기) · 아무것도 지워지지 않는다
    await outlineIn(confirm, CANCEL_BUTTON).click();
    await expect(confirmDialog(page)).toHaveCount(0);
    if (isDeskPage(page)) {
      await expect(modal(page), '1440 "취소" → 카드 닫힘').toHaveCount(0);
    } else {
      await expect(roleDialog(page, m.name), '"취소" 는 역할 변경 시트로').toBeVisible();
      await expect(modal(page)).toHaveCount(1);
    }
    expect(actions.count(), "취소까지 쓰기 요청 없음").toBe(0);
    expect(await profileByService(m.id), "취소: 프로필 그대로").not.toBeNull();
    await expect(memberRow(page, m.name)).toHaveCount(1);

    // "사용자 삭제" → "삭제" (1440 = 행 끝 더보기 "삭제" → 확인 카드)
    if (isDeskPage(page)) {
      await memberRow(page, m.name).getByRole("button", { name: /더보기/ }).click();
      await page.getByRole("menuitem", { name: exact(DELETE_BUTTON) }).click();
    } else await outlineIn(roleDialog(page, m.name), DELETE_USER_BUTTON).click();
    await expect(confirmDialog(page)).toBeVisible();
    await primaryIn(confirmDialog(page), deleteButtonLabel(m.name)).click();
    await expect(toast(page), `${TOAST}`).toHaveText(exact(TOAST_REMOVED), { timeout: SAVE_TIMEOUT });
    await expect(modal(page), "저장 후 카드 닫힘").toHaveCount(0);
    await expect(memberRow(page, m.name), "목록에서 사라짐").toHaveCount(0, { timeout: SAVE_TIMEOUT });
    await expect(memberRow(page, keep.name), "다른 멤버는 그대로").toHaveCount(1);
    const headerAfter = await expectHeaderMatchesDb(page, school.name);
    expect(headerAfter, "헤더: 전체 -1 · 학생 -1").toEqual({ ...headerBefore, total: headerBefore.total - 1, student: headerBefore.student - 1 });

    expect(await profileByService(m.id), "DB profiles 행 없음").toBeNull();
    expect(await authUserExists(m.id), "로그인 계정은 남는다 (d7 §8)").toBe(true);
    expect((await dbMembers(page)).some((x) => x.user_id === m.id), "로그인 세션 profiles 에도 없음").toBe(false);
    expect((await profileByService(keep.id))?.role, "다른 멤버 프로필 그대로").toBe("student");
    expect(actions.count(), "삭제 요청 1건").toBe(1);
  } finally {
    await context.close();
  }
});

// =====================================================================
// C1 — 연타
// =====================================================================

test(`[C1][S${SCREEN}] 연타에도 요청 1건: "${CHANGE_BUTTON}" 3연타 · "${DELETE_BUTTON}" 3연타 · "N명 초대" 3연타 → 각각 서버 요청 1건·결과 1번`, async ({ browser }, info) => {
  test.setTimeout(300_000);
  const school = await sharedSchool(info);
  const m1 = await addMember(school, info, GROUP, "연타역할");
  const m2 = await addMember(school, info, GROUP, "연타삭제");
  const { context, page } = await openTemp(browser, info, school.admin);
  try {
    await waitUsers(page);
    const actions = watchActions(page);
    const TIMES = 3;

    // 역할 변경
    const d1 = await openRoleSheet(page, m1.name);
    await pickRole(d1, "teacher");
    await primaryIn(d1, CHANGE_BUTTON).click({ clickCount: TIMES });
    await expect(toast(page)).toHaveText(exact(TOAST_ROLE), { timeout: SAVE_TIMEOUT });
    await expect(toast(page)).toHaveCount(0, { timeout: TOAST_GONE_TIMEOUT });
    expect(actions.count(), `"${CHANGE_BUTTON}" ${TIMES}연타 → 요청`).toBe(1);
    expect((await profileByService(m1.id))?.role).toBe("teacher");

    // 삭제
    const d2 = await openRoleSheet(page, m2.name);
    await outlineIn(d2, DELETE_USER_BUTTON).click();
    await expect(confirmDialog(page)).toBeVisible();
    await primaryIn(confirmDialog(page), deleteButtonLabel(m2.name)).click({ clickCount: TIMES });
    await expect(toast(page)).toHaveText(exact(TOAST_REMOVED), { timeout: SAVE_TIMEOUT });
    await expect(memberRow(page, m2.name)).toHaveCount(0, { timeout: SAVE_TIMEOUT });
    await expect(toast(page)).toHaveCount(0, { timeout: TOAST_GONE_TIMEOUT });
    expect(actions.count(), `"${DELETE_BUTTON}" ${TIMES}연타 → 요청`).toBe(2);
    expect(await profileByService(m2.id)).toBeNull();
    // 연타가 다른 멤버를 건드리지 않았다
    expect((await profileByService(m1.id))?.role).toBe("teacher");
    expect((await profileByService(school.admin.id))?.role).toBe("admin");

    // 초대
    const email = tempEmail(info, GROUP, "inv-");
    await openInviteSheet(page);
    await addInviteEmail(page, email, 1);
    await inviteSubmit(page).click({ clickCount: TIMES });
    await expect(toast(page)).toHaveText(exact(toastInvited(1)), { timeout: SAVE_TIMEOUT });
    await expect(inviteRow(page, email)).toHaveCount(1, { timeout: SAVE_TIMEOUT });
    await expect(page.getByRole("alert").filter({ hasText: email }), "두 번째 요청의 '이미 초대' 오류가 뜨지 않는다").toHaveCount(0);
    expect(actions.count(), `"N명 초대" ${TIMES}연타 → 요청`).toBe(3);
    expect((await invitesByService(school.id)).filter((i) => i.email === email), "초대 행 1건").toHaveLength(1);
  } finally {
    await context.close();
  }
});

// =====================================================================
// R-ui — 본인 admin 해제 (admin 2명 학교)
// =====================================================================

test(`[R-ui][S${SCREEN}] admin 2명 학교에서 본인 admin → 교사: 라디오 활성·"${DELETE_USER_BUTTON}" 없음(본인) → "${CHANGE_BUTTON}" → ${HOME} 로 이동 · ${USER_MANAGE}·${USERS_HREF} 링크 0 · ${USERS_HREF} 재접근 → ${HOME} (R6)`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const school = await tempSchool(info, GROUP);
  const second = await addMember(school, info, GROUP, "둘째관리자");
  const promote = await (await clientFor(school.admin)).rpc("change_member_role", { p_user_id: second.id, p_role: "admin" });
  expect(promote.error, `준비: 두 번째 admin (${promote.error?.message})`).toBeNull();
  expect((await profileByService(second.id))?.role).toBe("admin");

  const { context, page, viewport } = await openTemp(browser, info, school.admin);
  try {
    await waitUsers(page);
    expect(await readHeader(page)).toEqual({ school: school.name, ...countsOf(await dbMembers(page)) });
    const dialog = await openRoleSheet(page, school.admin.name);
    // admin 이 2명이면 본인도 다른 역할로 바꿀 수 있다 (마지막 admin 이 아님). 본인은 삭제할 수 없다
    for (const r of ROLE_ORDER) await expect(radio(dialog, r), `${ROLE_TEXT[r]} 라디오 활성`).toBeEnabled();
    await expect(radio(dialog, "admin")).toBeChecked();
    await expect(dialog.getByText(LAST_ADMIN_HINT)).toHaveCount(0);
    await expect(outlineIn(dialog, DELETE_USER_BUTTON), `본인 행에는 "${DELETE_USER_BUTTON}" 없음`).toHaveCount(0);
    await pickRole(dialog, "teacher");
    await primaryIn(dialog, CHANGE_BUTTON).click();

    await page.waitForURL((u) => u.pathname === HOME, { timeout: 30_000 });
    await expect(page.locator(sel("home-summary")).first(), "교사의 홈").toBeVisible({ timeout: 30_000 });
    expect((await profileByService(school.admin.id))?.role, "DB: 본인 역할 = teacher").toBe("teacher");
    expect((await profileByService(second.id))?.role, "다른 admin 은 그대로").toBe("admin");

    // 이제 교사: 화면 8 진입점이 없다
    const usersLinks = page.locator(`a[href="${USERS_HREF}"]`);
    await expect(page.locator(sel(USER_MANAGE)), `${USER_MANAGE} (R6)`).toHaveCount(0);
    await expect(usersLinks, `${USERS_HREF} 링크`).toHaveCount(0);
    // 셸 링크 (390 nav-pill / 1440 app-sidebar — rules 1.22 desktop_shell.menu)
    const labels = await shellNavLabels(page, viewport);
    expect(labels, "교사 nav").not.toContain(shellNavLabel(viewport, SCREEN, NAV_LABEL));
    expect(labels, "교사 nav").toContain(shellNavLabel(viewport, 7, STAFF_NAV_LABEL));

    // 재접근 불가
    await page.goto(USERS_HREF);
    await page.waitForURL((u) => u.pathname === HOME, { timeout: 30_000 });
    await expect(page.locator(sel(USER_MANAGE))).toHaveCount(0);
    await expect(modal(page)).toHaveCount(0);
    const res = await context.request.get(USERS_HREF, { maxRedirects: 0 });
    expect(res.status(), "직접 요청은 리다이렉트").toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    const html = await res.text();
    expect(html).not.toContain(`data-component="${USER_MANAGE}"`);
    expect(html, "응답 본문에 다른 멤버 이름").not.toContain(second.name);
  } finally {
    await context.close();
  }
});

// =====================================================================
// R-ui — 내보낸 세션 (프로필 없는 세션)
// =====================================================================

test(`[R-ui][S${SCREEN}] 내보낸 사용자의 기존 세션: ${HOME} = "${NO_SCHOOL_TITLE}" + "${LOGOUT_BUTTON}" 만 (학교명·업무 데이터·tab-bar·앱 링크 0) · 앱 화면(시약 목록·사용 기록·입고·사용자 관리) → ${HOME} · "${LOGOUT_BUTTON}" → ${routeOf(LOGIN_SCREEN)}`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const school = await sharedSchool(info);
  const x = await addMember(school, info, GROUP, "내보낸세션");
  const { context, page, viewport } = await openTemp(browser, info, x, HOME);
  try {
    // 대조: 멤버일 때는 홈(화면 13)과 학교명이 보인다 (셸: 390 nav-pill / 1440 app-sidebar)
    await expect(page.locator(sel("home-summary")).first(), "멤버일 때 홈").toBeVisible({ timeout: 30_000 });
    await expect(shellSchoolScope(page, viewport)).toContainText(school.name);

    // 준비: 같은 학교 admin 이 내보낸다 (remove_member — 로그인 세션, 화면 8 "삭제" 와 같은 함수)
    const removed = await (await clientFor(school.admin)).rpc("remove_member", { p_user_id: x.id });
    expect(removed.error, `준비: 내보내기 (${removed.error?.message})`).toBeNull();
    expect(await profileByService(x.id), "프로필 행 없음").toBeNull();
    expect(await authUserExists(x.id), "로그인 계정은 남음").toBe(true);

    const tb = rules.tab_bar;
    const business = [tb.component, tb.item, "home-summary", "quick-action", "reagent-row", "reorder-alert-card", USER_MANAGE, ROW, MODAL, "stock-intake", "reagent-register"];
    const appPaths = [2, 10, 4, 7, SCREEN].map((s) => routeOf(s));
    const expectNotice = async (from: string) => {
      await page.waitForURL((u) => u.pathname === HOME, { timeout: 30_000 });
      await page.waitForLoadState("load");
      await expect(page.getByRole("heading", { name: exact(NO_SCHOOL_TITLE) }), `${from}: "${NO_SCHOOL_TITLE}"`).toBeVisible({ timeout: 30_000 });
      for (const c of business) expect(await countComponent(page, c), `${from}: ${c}`).toBe(0);
      const text = await page.locator("body").innerText();
      expect(text, `${from}: 전 학교명`).not.toContain(school.name);
      expect(text.match(new RegExp(rules.never.N1.school_name_pattern, "g")) ?? [], `${from}: 학교명`).toEqual([]);
      expect(text, `${from}: 같은 학교 사람 이름`).not.toContain(school.admin.name);
      // 누를 수 있는 것은 "로그아웃" 뿐, 링크는 워드마크(/) 뿐
      const buttons = (await page.getByRole("button").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
      expect(buttons, `${from}: 버튼`).toEqual([LOGOUT_BUTTON]);
      const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
      for (const h of hrefs) expect(h, `${from}: 링크 ${h}`).toBe(HOME);
    };

    await page.goto(HOME);
    await expectNotice(HOME);
    // 응답 본문에도 전 학교의 이름·데이터가 없다
    const homeRes = await context.request.get(HOME);
    expect(homeRes.status()).toBe(200);
    const html = await homeRes.text();
    expect(html, "응답 본문에 전 학교명").not.toContain(school.name);
    expect(html, "응답 본문에 같은 학교 사람 이름").not.toContain(school.admin.name);
    expect(html).not.toContain(`data-component="${tb.component}"`);

    for (const path of appPaths) {
      await page.goto(path);
      await expectNotice(path);
      const res = await context.request.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} 직접 요청은 리다이렉트`).toBeGreaterThanOrEqual(300);
      expect(res.status()).toBeLessThan(400);
      expect(new URL(res.headers()["location"], info.project.use.baseURL).pathname, `${path} → ${HOME}`).toBe(HOME);
      const body = await res.text();
      expect(body, `${path} 응답 본문에 전 학교명`).not.toContain(school.name);
    }

    // "로그아웃" → 로그인 화면, 세션이 끝난다
    await page.goto(HOME);
    await expectNotice(HOME);
    const logout = page.getByRole("button", { name: exact(LOGOUT_BUTTON) });
    await expect(async () => {
      if (new URL(page.url()).pathname === HOME) await logout.click({ timeout: 5_000 });
      await page.waitForURL((u) => u.pathname === routeOf(LOGIN_SCREEN), { timeout: 10_000 });
    }).toPass({ timeout: 45_000 });
    await expect(page.locator(sel("ex-auth-form-card")).first(), "로그인 화면").toBeVisible();
    await page.goto(HOME);
    await expect(page.locator(sel("landing-hero")).first(), `로그아웃 뒤 ${HOME} = 화면 ${LANDING_SCREEN} 랜딩`).toBeVisible({ timeout: 30_000 });
    await page.goto(routeOf(2));
    await page.waitForURL((u) => u.pathname === routeOf(LOGIN_SCREEN), { timeout: 30_000 });
    // 학교의 다른 멤버는 그대로
    expect((await profileByService(school.admin.id))?.role).toBe("admin");
    expect(await service().from("profiles").select("user_id").eq("user_id", x.id).then((r) => (r.data ?? []).length), "프로필이 다시 생기지 않았다").toBe(0);
  } finally {
    await context.close();
  }
});

// 화면 목록에서 멤버 행 수가 DB 와 같은지 (쓰기 흐름이 끝난 뒤의 최종 상태)
test(`[C1][S${SCREEN}] 쓰기 흐름 뒤 일회용 학교 화면: 멤버 행(이름·역할)·헤더·"초대 대기 (N)" 가 로그인 세션 DB 와 일치 (새로 고침해도 같음)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const school = await sharedSchool(info);
  const { context, page } = await openTemp(browser, info, school.admin);
  try {
    for (const pass of ["처음", "새로 고침"]) {
      if (pass !== "처음") await page.reload();
      await waitUsers(page);
      const members = await dbMembers(page);
      expect(members.every((m) => m.school_id === school.id), "로그인 세션 profiles = 자기 학교").toBe(true);
      expect(members.length).toBe((await membersByService(school.id)).length);
      const shown = await readMembers(page);
      const key = (name: string, role: string | null) => `${name}|${role}`;
      expect(shown.map((s) => key(s.name, s.role)).sort(), `${pass}: 멤버 행 = DB`).toEqual(members.map((m) => key(m.display_name, m.role)).sort());
      expect(shown.filter((s) => s.self).map((s) => s.name), `${pass}: "나" 배지`).toEqual([school.admin.name]);
      expect(await readHeader(page), `${pass}: 헤더`).toEqual({ school: school.name, ...countsOf(members) });
      const invites = await dbPendingInvites(page);
      expect((await readInvites(page)).map((i) => i.email).sort(), `${pass}: 초대 대기 행`).toEqual(invites.map((i) => i.email).sort());
      if (invites.length > 0) await expect(manage(page).getByRole("heading", { name: exact(invitesHeading(invites.length)) })).toBeVisible();
      await expect(memberRows(page)).toHaveCount(members.length);
    }
  } finally {
    await context.close();
  }
});
