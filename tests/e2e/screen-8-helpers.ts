// 화면 8 (사용자 관리, dev-rules.json routes["8"]) e2e 도우미.
// 기준: 디자인 s2-spec "## 화면 8", design/frames/8-{mobile|desktop}.json, harness/d7-data.md §8·§4, dev-rules route_auth 8.
//
// 절대 규칙 (공용 테스트 계정 4개 · 학교 A·B · 실사용 학교 · 데모 학교):
// - 공용 계정으로는 읽기·시트 열고 닫기·거부 확인만 한다. 역할·프로필을 바꾸지 않고, 학교 A·B 에 초대 행을 만들지 않는다.
// - 쓰기 흐름(초대·역할 변경·삭제·본인 admin 해제·내보낸 세션)은 일회용 학교의 일회용 계정으로만 한다.
//   일회용 계정·학교는 service role 로 만든다 (auth admin createUser + register_profile — signUp 을 부르지 않아 메일이 나가지 않는다).
//   service role 은 준비·정리·대조 조회에만 쓰고, 판정 대상은 항상 브라우저(로그인 세션 쿠키)의 화면이다.
// - 일회용 계정의 브라우저 세션은 로그인 화면을 거치지 않고 쿠키로 심는다: generateLink(magiclink) → verifyOtp 로 얻은 세션을
//   @supabase/ssr 쿠키 형식(sb-{ref}-auth-token = "base64-" + base64url(JSON))으로 넣는다 (비밀번호 로그인 한도를 쓰지 않는다).
// - 일회용 계정은 사용 기록(usage_logs)을 만들지 않는다 (계정 삭제가 FK 로 막히지 않게).
// - 이 파일의 접두사(s8ui-… / S8UI-…)는 D2 스펙(db-s8-user-manage: s8-test-… / S8-TEST-…)과 겹치지 않는다 — 서로의 정리가 지우지 않게.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Browser, type BrowserContext, type Locator, type Page, type Response, type TestInfo } from "@playwright/test";
import { createClient, type Session as AuthSession, type SupabaseClient } from "@supabase/supabase-js";
import { anonClient } from "./db-helpers";
import { isDeskPage, waitWidthSettled } from "./desk-helpers";
import { browserClient, devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";
import { framePath } from "../frames";
import { adjustPreDesktopShell } from "../desktop-shell";

export const SCREEN = 8;
export const HOME_SCREEN = 13;
export const LOGIN_SCREEN = 1;
export const SIGNUP_SCREEN = 14;
export const LANDING_SCREEN = 15;

export const USER_MANAGE = "user-manage";
export const ROW = "ex-data-table-cell";
export const MODAL = "ex-modal-card";
export const EMPTY = "ex-empty-state-card";
export const TOAST = "ex-toast";
export const SEGMENT = "segmented-control";
export const SEGMENT_ACTIVE = "segmented-control-active";
export const INPUT = "text-input";
export const PRIMARY = "button-primary";
export const OUTLINE = "button-outline";
export const PILL_SOFT = "button-pill-soft";

// ---------- 문구 (디자인 s2-spec 화면 8 · d7 §8) ----------
export const NAV_LABEL = "사용자 관리";
export const WORDMARK = "Lab_Stock";
export const INVITE_BUTTON = "초대";
export const SEARCH_PLACEHOLDER = "이름 검색";
export const SECTION_MEMBERS = "멤버";
export const INVITES_HEADING = /^초대 대기 \((\d+)\)$/;
export const invitesHeading = (n: number) => `초대 대기 (${n})`;
export const ME_BADGE = "나";
export const INVITE_STATUS = "대기";
export const ROLE_TEXT = { student: "학생", teacher: "교사", admin: "admin" } as const;
export type MemberRole = keyof typeof ROLE_TEXT;
export const ROLE_ORDER: MemberRole[] = ["student", "teacher", "admin"];
export const INVITE_ROLE_ORDER: MemberRole[] = ["student", "teacher"];
export const noteText = (school: string) => `같은 학교(${school}) 계정만 초대할 수 있어요`;
export const EMPTY_SEARCH = "찾는 사용자가 없어요";
export const roleSheetTitle = (name: string) => `${name}의 역할`;
export const CHANGE_BUTTON = "변경";
export const DELETE_USER_BUTTON = "사용자 삭제";
export const LAST_ADMIN_HINT = "admin이 최소 1명 있어야 해요";
export const CONFIRM_TITLE = "이 사용자를 삭제할까요?";
export const CANCEL_BUTTON = "취소";
export const DELETE_BUTTON = "삭제";
/** 시안 1.17 8 삭제 확인 버튼 "{이름} 삭제" (d7 §18) */
export const deleteButtonLabel = (name: string) => `${name} ${DELETE_BUTTON}`;
/** 시안 1.17 8 삭제 확인 본문 "{이름} · 사용·입고 기록은 남아요" (d7 §18) */
export const DELETE_NOTE = "사용·입고 기록은 남아요";
export const deleteBodyText = (name: string) => `${name} · ${DELETE_NOTE}`;
export const INVITE_TITLE = "사용자 초대";
export const COPY_LINK = "초대 링크 복사";
export const COPIED_NOTICE = "링크를 복사했어요";
export const inviteSubmitLabel = (n: number) => `${n}명 초대`;
export const toastInvited = (n: number) => `${n}명을 초대했어요`;
export const TOAST_ROLE = "역할을 바꿨어요";
export const TOAST_REMOVED = "사용자를 삭제했어요";
export const CLOSE_LABEL = "닫기";
/** 1440 행 끝 더보기 메뉴 (역할 바꾸기 · 삭제) */
export const ROLE_MENU = "역할 바꾸기";
export const ACTIVE_TAB_LABEL = "홈";
export const STAFF_NAV_LABEL = "입고·시약 등록";
export const NO_SCHOOL_TITLE = "소속 학교가 없어요";
export const LOGOUT_BUTTON = "로그아웃";

export const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

/** design/rules.json colors.highlight.values 의 연한 쪽(본인 행 배경 #e6f4fc) → computed style 표기 "rgb(r, g, b)" */
export function selfRowBackground(): string {
  const j = JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as {
    colors: { highlight: { values: string[] } };
  };
  const toRgb = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const vals = j.colors.highlight.values.map(toRgb);
  if (vals.length === 0) throw new Error("rules.json colors.highlight.values 없음");
  // 가장 밝은 값 = 배경용 연하늘
  const soft = vals.reduce((a, b) => (a.r + a.g + a.b >= b.r + b.g + b.b ? a : b));
  return `rgb(${soft.r}, ${soft.g}, ${soft.b})`;
}

/** 화면 8 에 속한 컴포넌트 이름 (dev-rules.json components) */
export function screenComponents(): string[] {
  return Object.entries(devRules.components)
    .filter(([, screens]) => screens.includes(SCREEN))
    .map(([name]) => name);
}

/** design/frames/8-{viewport}.json 의 노드 이름별 개수 */
export function frameCounts(viewport: ViewportName): Record<string, number> {
  const j = JSON.parse(readFileSync(framePath(`${SCREEN}-${viewport}`), "utf8")) as {
    frames: { nodes: { name: string }[] }[];
  };
  const out: Record<string, number> = {};
  for (const n of j.frames[0].nodes) out[n.name] = (out[n.name] ?? 0) + 1;
  // 예전 데스크톱 프레임의 nav-pill → 지금 셸 app-sidebar (rules 1.22 desktop_shell, d7 §23)
  return adjustPreDesktopShell(`${SCREEN}-${viewport}`, out);
}

// ---------- 화면 요소 ----------
export const manage = (page: Page) => page.locator(`main ${sel(USER_MANAGE)}`);
export const modal = (page: Page) => page.locator(sel(MODAL));
export const toast = (page: Page) => page.locator(sel(TOAST));
export const emptyCard = (page: Page) => manage(page).locator(sel(EMPTY));
export const searchInput = (page: Page) => manage(page).getByPlaceholder(SEARCH_PLACEHOLDER);
/**
 * 데스크톱 재구성 run b (d7 §23 세부, 새 프레임 8-desktop): 1440 = page-head(제목 "사용자" + "N명" · 역할별 인원 줄 / 초대: 이메일 + 학생·교사 + "초대")
 * → user-manage(이름 검색 · "멤버" data-table · "초대 대기 (N)" data-table · 유의사항), 역할 바꾸기·삭제 = 행 끝 더보기 → 가운데 확인 카드.
 * 390 은 그대로 (목록 + 하단 시트).
 */
const desk8 = (page: Page) => isDeskPage(page);
/** "초대": 390 = user-manage 헤더 버튼(시트를 연다) / 1440 = page-head 초대 줄의 버튼(바로 보낸다) */
export const inviteButton = (page: Page) =>
  desk8(page)
    ? page.locator('main [data-name="page-head"]').locator(sel(PRIMARY)).filter({ hasText: exact(INVITE_BUTTON) })
    : manage(page).locator(sel(PRIMARY)).filter({ hasText: exact(INVITE_BUTTON) });
export const memberList = (page: Page) =>
  desk8(page) ? manage(page).getByRole("table", { name: exact(SECTION_MEMBERS) }) : manage(page).getByRole("list", { name: exact(SECTION_MEMBERS) });
export const memberRows = (page: Page) => memberList(page).locator(sel(ROW));
export const inviteList = (page: Page) =>
  desk8(page) ? manage(page).getByRole("table", { name: "초대 대기", exact: true }) : manage(page).getByRole("list", { name: INVITES_HEADING });
export const inviteRows = (page: Page) => inviteList(page).locator(sel(ROW));
export const memberRow = (page: Page, name: string) => memberRows(page).filter({ has: page.getByText(exact(name)) });
export const inviteRow = (page: Page, email: string) => inviteRows(page).filter({ has: page.getByText(exact(email)) });
export const roleDialog = (page: Page, name: string) => page.getByRole("dialog", { name: exact(roleSheetTitle(name)) });
/** 초대: 390 = 하단 시트(dialog "사용자 초대") / 1440 = page-head 초대 줄(form "사용자 초대" — 시안 8-desktop page-actions, 시트 없음) */
export const inviteDialog = (page: Page) =>
  isDeskPage(page) ? page.getByRole("form", { name: exact(INVITE_TITLE) }) : page.getByRole("dialog", { name: exact(INVITE_TITLE) });
export const confirmDialog = (page: Page) => page.getByRole("dialog", { name: exact(CONFIRM_TITLE) });
export const closeIcon = (dialog: Locator) => dialog.getByRole("button", { name: exact(CLOSE_LABEL) });
export const primaryIn = (scope: Locator, label: string | RegExp) =>
  scope.locator(sel(PRIMARY)).filter({ hasText: typeof label === "string" ? exact(label) : label });
export const outlineIn = (scope: Locator, label: string) => scope.locator(sel(OUTLINE)).filter({ hasText: exact(label) });
export const radio = (dialog: Locator, role: MemberRole) => dialog.getByRole("radio", { name: exact(ROLE_TEXT[role]) });
/** 초대 시트의 "N명 초대" 버튼 */
export const inviteSubmit = (page: Page) =>
  isDeskPage(page) ? primaryIn(inviteDialog(page), exact(INVITE_BUTTON)) : primaryIn(inviteDialog(page), /^\s*\d+명 초대\s*$/);
/** 초대 버튼 글자: 390 = "N명 초대" / 1440 = "초대" (시안 8-desktop) */
export const inviteSubmitText = (page: Page, n: number) => (isDeskPage(page) ? INVITE_BUTTON : inviteSubmitLabel(n));
/** 초대 시트의 이메일 입력 (시트 안 text-input 의 입력 칸) */
export const inviteEmailInput = (page: Page) => inviteDialog(page).locator(`${sel(INPUT)} input`).first();
/** 1440 초대 칸에 담긴 이메일 수 (쉼표·공백으로 나눈 서로 다른 주소) */
export async function deskInviteCount(page: Page): Promise<number> {
  const v = await inviteEmailInput(page).inputValue();
  return new Set(v.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)).size;
}

/** 화면 8 이 그려졌는지 (빈 화면에서 0개를 세어 통과하지 않도록) */
export async function waitUsers(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  // 서버 HTML 에는 두 폭 사본(모바일 목록 · 데스크톱 표)이 함께 있다 — 첫 그림은 .first() 로 보고, 맞지 않는 폭이 빠진 뒤 1개를 확인한다
  await expect(manage(page).first(), `${USER_MANAGE} 본문`).toBeVisible({ timeout: 30_000 });
  // 하이드레이션 뒤 맞지 않는 폭의 사본이 빠질 때까지 (개수 세기 전)
  await waitWidthSettled(page);
  await expect(manage(page), `${USER_MANAGE} 본문 1 (폭 정리 뒤)`).toHaveCount(1, { timeout: 30_000 });
  await expect(memberRows(page).first(), "멤버 행").toBeVisible();
}

export type ShownMember = { name: string; role: MemberRole | null; self: boolean; texts: string[] };

/** 행 안 글자 조각 (글자 노드마다 — 1440 표 칸·이름 옆 "나" 배지를 따로 읽는다) */
const rowTexts = (rows: Locator) =>
  rows.evaluateAll((els) =>
    els.map((el) => {
      const out: string[] = [];
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        if (t) out.push(t);
      }
      return out;
    }),
  );

/** 멤버 행에 보이는 글자 → 이름(첫 줄)·역할 글자·"나" 배지 */
export async function readMembers(page: Page): Promise<ShownMember[]> {
  const raw = desk8(page)
    ? await rowTexts(memberRows(page))
    : await memberRows(page).evaluateAll((els) =>
        els.map((el) =>
          (el as HTMLElement).innerText
            .split(/\n/)
            .map((t) => t.replace(/\s+/g, " ").trim())
            .filter(Boolean),
        ),
      );
  return raw.map((texts) => {
    const role = ROLE_ORDER.find((r) => texts.slice(1).includes(ROLE_TEXT[r])) ?? null;
    return { name: texts[0] ?? "", role, self: texts.slice(1).includes(ME_BADGE), texts };
  });
}

export type ShownInvite = { email: string; texts: string[] };

export async function readInvites(page: Page): Promise<ShownInvite[]> {
  if (desk8(page)) return (await rowTexts(inviteRows(page))).map((texts) => ({ email: texts[0] ?? "", texts }));
  const raw = await inviteRows(page).evaluateAll((els) =>
    els.map((el) =>
      (el as HTMLElement).innerText
        .split(/\n/)
        .map((t) => t.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  );
  return raw.map((texts) => ({ email: texts[0] ?? "", texts }));
}

export type HeaderCounts = { school: string; total: number; student: number; teacher: number; admin: number };

/** 헤더 "{학교명} 사용자 N명" + "학생 a · 교사 b · admin c" (d7 §8) */
export async function readHeader(page: Page): Promise<HeaderCounts> {
  if (desk8(page)) {
    // 1440 page-head (시안 8-desktop): 제목 "사용자" + "N명" · "학생 a · 교사 b · admin c" — 학교명은 사이드바(셸)·user-manage 이름
    const head = page.locator('main [data-name="page-head"]');
    await expect(head.getByRole("heading", { level: 1, name: "사용자", exact: true }), '제목 "사용자"').toHaveCount(1);
    const total = head.getByText(/^\s*\d+명\s*$/);
    await expect(total, '"N명"').toHaveCount(1);
    const line = head.getByText(/^\s*학생 \d+ · 교사 \d+ · admin \d+\s*$/);
    await expect(line, '"학생 a · 교사 b · admin c"').toHaveCount(1);
    const c = ((await line.innerText()).replace(/\s+/g, " ").trim().match(/^학생 (\d+) · 교사 (\d+) · admin (\d+)$/) ?? []) as string[];
    const label = (await manage(page).getAttribute("aria-label")) ?? "";
    const school = (/^(.+) 사용자$/.exec(label) ?? [])[1] ?? "";
    return { school, total: Number((await total.innerText()).replace(/\D/g, "")), student: Number(c[1]), teacher: Number(c[2]), admin: Number(c[3]) };
  }
  const heading = manage(page).getByRole("heading", { name: /사용자 \d+명\s*$/ });
  await expect(heading, '헤더 "{학교명} 사용자 N명"').toHaveCount(1);
  const h = ((await heading.innerText()).replace(/\s+/g, " ").trim().match(/^(.+) 사용자 (\d+)명$/) ?? []) as string[];
  const line = manage(page).getByText(/^\s*학생 \d+ · 교사 \d+ · admin \d+\s*$/);
  await expect(line, '헤더 "학생 a · 교사 b · admin c"').toHaveCount(1);
  const c = ((await line.innerText()).replace(/\s+/g, " ").trim().match(/^학생 (\d+) · 교사 (\d+) · admin (\d+)$/) ?? []) as string[];
  return { school: h[1] ?? "", total: Number(h[2]), student: Number(c[1]), teacher: Number(c[2]), admin: Number(c[3]) };
}

export type DbMember = { user_id: string; school_id: string; role: MemberRole; display_name: string };
export type DbInvite = { id: string; school_id: string; email: string; role: string; invited_by: string | null; invited_at: string; accepted_at: string | null };

/** 브라우저 로그인 세션(RLS)으로 읽은 같은 학교 profiles — admin 에게는 같은 학교 전체가 보인다 (d7 §2·§8) */
export async function dbMembers(page: Page): Promise<DbMember[]> {
  const { client } = await browserClient(page);
  const r = await client.from("profiles").select("user_id, school_id, role, display_name");
  if (r.error) throw new Error(`profiles 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as DbMember[];
}

/** 브라우저 로그인 세션(RLS)으로 읽은 대기 중 초대 (같은 학교 admin 만 보인다) */
export async function dbPendingInvites(page: Page): Promise<DbInvite[]> {
  const { client } = await browserClient(page);
  const r = await client.from("invites").select("*").is("accepted_at", null);
  if (r.error) throw new Error(`invites 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as DbInvite[];
}

export function countsOf(members: { role: string }[]): Omit<HeaderCounts, "school"> {
  const n = (role: string) => members.filter((m) => m.role === role).length;
  return { total: members.length, student: n("student"), teacher: n("teacher"), admin: n("admin") };
}

/** 헤더 인원 수가 로그인 세션으로 읽은 같은 학교 profiles 와 같아질 때까지 (저장 직후 목록 갱신을 기다린다) */
export async function expectHeaderMatchesDb(page: Page, schoolName: string): Promise<HeaderCounts> {
  let last: HeaderCounts | null = null;
  await expect(async () => {
    const want = countsOf(await dbMembers(page));
    last = await readHeader(page);
    expect(last, "헤더 인원 = DB").toEqual({ school: schoolName, ...want });
  }).toPass({ timeout: 20_000 });
  return last!;
}

/**
 * 멤버 행을 눌러 역할 변경 시트를 연다. 하이드레이션 전 누름은 아무 일도 하지 않고, 같은 행을 다시 누르면 닫히므로
 * "닫혀 있을 때만 누른다" 를 열릴 때까지 되풀이한다.
 */
export async function openRoleSheet(page: Page, name: string): Promise<Locator> {
  const row = memberRow(page, name);
  await expect(row, `멤버 행 "${name}"`).toHaveCount(1);
  const dialog = roleDialog(page, name);
  if (desk8(page)) {
    // 1440: 행 끝 더보기 → "역할 바꾸기" → 가운데 확인 카드 (시안 8-desktop)
    await expect(async () => {
      if (!(await dialog.isVisible())) {
        const item = page.getByRole("menuitem", { name: exact(ROLE_MENU) });
        if (!(await item.isVisible())) await row.getByRole("button", { name: /더보기/ }).click({ timeout: 5_000 });
        await item.click({ timeout: 2_000 });
      }
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(modal(page), `${MODAL} 은 한 번에 하나`).toHaveCount(1);
    return dialog;
  }
  await expect(async () => {
    if (!(await dialog.isVisible())) await row.click({ timeout: 5_000 });
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(modal(page), `${MODAL} 은 한 번에 하나`).toHaveCount(1);
  return dialog;
}

/** 헤더 "초대" 를 눌러 초대 시트를 연다 (다시 누르면 닫히므로 닫혀 있을 때만 누른다) */
export async function openInviteSheet(page: Page): Promise<Locator> {
  const dialog = inviteDialog(page);
  if (isDeskPage(page)) {
    // 1440: 초대 줄은 늘 보인다 (열 시트 없음) — 모달 0
    await expect(dialog, "1440 초대 줄").toBeVisible({ timeout: 30_000 });
    await expect(modal(page), "1440 초대는 모달이 아니다").toHaveCount(0);
    return dialog;
  }
  await expect(async () => {
    if (!(await dialog.isVisible())) await inviteButton(page).click({ timeout: 5_000 });
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(modal(page), `${MODAL} 은 한 번에 하나`).toHaveCount(1);
  return dialog;
}

/** 역할 라디오 고르기 (이름이 역할 글자인 라디오를 누른다) */
export async function pickRole(dialog: Locator, role: MemberRole): Promise<void> {
  await radio(dialog, role).check({ timeout: 10_000 });
  await expect(radio(dialog, role)).toBeChecked();
}

/** 초대 시트에 이메일 한 개 담기 (입력 후 Enter) → "N명 초대" 의 N 이 늘어난다 */
export async function addInviteEmail(page: Page, email: string, expectedCount: number): Promise<void> {
  const input = inviteEmailInput(page);
  if (isDeskPage(page)) {
    // 1440 초대 줄: 한 칸에 여러 주소(쉼표로 이어 쓰기)
    const cur = await input.inputValue();
    await input.fill(cur.trim() ? `${cur.trim()}, ${email}` : email);
    await expect.poll(() => deskInviteCount(page), { message: `초대 칸 주소 ${expectedCount}개` }).toBe(expectedCount);
    return;
  }
  await input.fill(email);
  await input.press("Enter");
  await expect(inviteSubmit(page), `"${inviteSubmitLabel(expectedCount)}"`).toHaveText(exact(inviteSubmitLabel(expectedCount)));
}

/** 서버 액션 요청(쓰기 요청) 수를 센다 — Next 서버 액션 = POST + next-action 헤더 */
export function watchActions(page: Page): { count: () => number; urls: () => string[] } {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) seen.push(r.url());
  });
  return { count: () => seen.length, urls: () => [...seen] };
}

/** 한국 시간 오늘 "YYYY.MM.DD" (초대일 표시) */
export function todayDots(at: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  return p.replace(/-/g, ".");
}

/** 요소 사각형 (viewport 좌표) */
export const boxOf = (l: Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  });

/** 요소 가운데 지점의 맨 위 요소가 그 요소인지 (다른 것에 덮이지 않음) */
export const onTop = (l: Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });

/** 화면에 보이는 글자에서 학교명 패턴(rules.json never.N1.school_name_pattern)에 맞는 이름 종류 */
export async function schoolNamesShown(page: Page): Promise<string[]> {
  const text = await page.locator("body").innerText();
  return [...new Set(text.match(new RegExp(rules.never.N1.school_name_pattern, "g")) ?? [])];
}

// ======================================================================
// service role (준비·정리·대조 조회 전용)
// ======================================================================

export const HAS_SERVICE = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

let serviceCache: SupabaseClient | null = null;
export function service(): SupabaseClient {
  if (!serviceCache) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("일회용 계정·학교를 만들 수 없음: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local) 가 필요합니다");
    }
    serviceCache = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  return serviceCache;
}

export interface TempUser {
  id: string;
  email: string;
  password: string;
  name: string;
}

export interface TempSchool {
  id: string;
  neis: string;
  name: string;
  admin: TempUser;
}

const rand = () => randomBytes(4).toString("hex");
/**
 * 이 실행(Playwright worker 프로세스) 고유 토큰. 일회용 계정 이메일·학교 neis_code 에 넣어, 정리(sweep)·잔여물 검사가
 * 이 실행이 만든 것만 세고 지우게 한다 — 같은 group·project 를 쓰는 다른 worker(동시에 도는 다른 spec·같은 spec 의 다른 반복)의
 * 일회용 데이터를 세거나 지우지 않는다. afterAll 은 데이터를 만든 같은 worker 에서 돌므로 토큰이 같다.
 */
export const RUN_TOKEN = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const baseEmailPrefix = (group: string, project: string) => `s8ui-${group}-${project}-`;
const baseSchoolPrefix = (group: string, project: string) => `S8UI-${group}-${project}-`;
const emailPrefix = (group: string, project: string) => `${baseEmailPrefix(group, project)}${RUN_TOKEN}-`;
const schoolPrefix = (group: string, project: string) => `${baseSchoolPrefix(group, project)}${RUN_TOKEN}-`;
/** 이 실행이 만든 일회용 학교의 neis_code like 패턴 (정리·잔여물 검사용) */
export const tempSchoolLike = (group: string, project: string) => `${schoolPrefix(group, project)}%`;
/** 지난 실행(worker 가 afterAll 없이 끝난 경우)의 잔여물로 보는 나이 — 이보다 오래된 같은 group·project 데이터만 지운다(세지 않는다) */
const STALE_MS = 3 * 60 * 60 * 1000;

/** 이 스펙 묶음(group)이 만드는 이메일 (실제 발송 없음: example.test) */
export function tempEmail(info: TestInfo, group: string, tag = ""): string {
  return `${emailPrefix(group, info.project.name)}${tag}${Date.now()}-${rand()}@example.test`;
}

/** 일회용 이름 — 학교 A·B 의 이름("테스트 …", "B학교 …")과 겹치지 않는 글자 */
export function tempName(tag: string): string {
  return `임시${tag}-${rand()}`;
}

async function createUser(email: string, name: string): Promise<TempUser> {
  const password = randomBytes(18).toString("base64url");
  const made = await service().auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user) throw new Error(`일회용 계정 생성 실패: ${made.error?.message}`);
  return { id: made.data.user.id, email, password, name };
}

/** 가입의 학교 연결 단계와 같은 호출 (lib/server/onboard → register_profile, service_role 전용) */
async function registerProfile(user: TempUser, neis: string, schoolName: string): Promise<{ school_id: string; role: string }> {
  const res = await service().rpc("register_profile", {
    p_user_id: user.id,
    p_neis_code: neis,
    p_office_code: "S8T",
    p_school_name: schoolName,
    p_sido: "임시",
    p_region: "임시",
    p_display_name: user.name,
  });
  if (res.error) throw new Error(`register_profile 실패: ${res.error.message}`);
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as { school_id: string; role: string } | null;
  if (!row) throw new Error("register_profile 이 행을 돌려주지 않음");
  return row;
}

/** 일회용 학교 + 첫 가입자(admin). 학교명은 rules.json 학교명 패턴("…고등학교")에 맞춘다 */
export async function tempSchool(info: TestInfo, group: string): Promise<TempSchool> {
  const neis = `${schoolPrefix(group, info.project.name)}${Date.now()}-${rand()}`;
  const name = `임시${rand()}고등학교`;
  expect(name, "일회용 학교명은 rules.json 학교명 패턴에 맞아야 함").toMatch(new RegExp(`^${rules.never.N1.school_name_pattern}$`));
  const admin = await createUser(tempEmail(info, group, "adm-"), tempName("관리자"));
  const prof = await registerProfile(admin, neis, name);
  expect(prof.role, "학교의 첫 가입자는 admin (d7 §4)").toBe("admin");
  return { id: prof.school_id, neis, name, admin };
}

/** 일회용 학교에 멤버 추가 (초대 없음 → student) */
export async function addMember(school: TempSchool, info: TestInfo, group: string, tag = "멤버"): Promise<TempUser> {
  const u = await createUser(tempEmail(info, group), tempName(tag));
  const prof = await registerProfile(u, school.neis, school.name);
  expect(prof.role, "초대 없는 두 번째 이후 가입자는 student").toBe("student");
  expect(prof.school_id).toBe(school.id);
  return u;
}

export async function profileByService(userId: string): Promise<DbMember | null> {
  const r = await service().from("profiles").select("user_id, school_id, role, display_name").eq("user_id", userId).maybeSingle();
  if (r.error) throw new Error(`프로필 대조 조회 실패: ${r.error.message}`);
  return (r.data as DbMember | null) ?? null;
}

export async function membersByService(schoolId: string): Promise<DbMember[]> {
  const r = await service().from("profiles").select("user_id, school_id, role, display_name").eq("school_id", schoolId);
  if (r.error) throw new Error(`프로필 대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as DbMember[];
}

export async function invitesByService(schoolId: string): Promise<DbInvite[]> {
  const r = await service().from("invites").select("*").eq("school_id", schoolId).order("invited_at").order("email");
  if (r.error) throw new Error(`초대 대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as DbInvite[];
}

/** 로그인 계정(auth.users)이 남아 있는지 */
export async function authUserExists(userId: string): Promise<boolean> {
  const r = await service().auth.admin.getUserById(userId);
  return !r.error && r.data.user?.id === userId;
}

export type OtherSchool = { id: string; name: string; memberNames: string[]; emails: string[] };

/** 대조 조회: 주어진 학교가 아닌 모든 학교의 이름·멤버 이름·멤버 이메일·초대 이메일 */
export async function otherSchools(ownSchoolId: string): Promise<OtherSchool[]> {
  const sb = service();
  const schools = await sb.from("schools").select("id, name").neq("id", ownSchoolId);
  if (schools.error) throw new Error(`schools 대조 조회 실패: ${schools.error.message}`);
  const profs = await sb.from("profiles").select("user_id, school_id, display_name").neq("school_id", ownSchoolId);
  if (profs.error) throw new Error(`profiles 대조 조회 실패: ${profs.error.message}`);
  const invs = await sb.from("invites").select("school_id, email").neq("school_id", ownSchoolId);
  if (invs.error) throw new Error(`invites 대조 조회 실패: ${invs.error.message}`);
  const emailOf = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const list = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (list.error) throw new Error(`auth 사용자 대조 조회 실패: ${list.error.message}`);
    for (const u of list.data.users) if (u.email) emailOf.set(u.id, u.email.toLowerCase());
    if (list.data.users.length < 200) break;
  }
  return (schools.data ?? []).map((s) => {
    const mine = (profs.data ?? []).filter((p) => p.school_id === s.id);
    return {
      id: s.id as string,
      name: s.name as string,
      memberNames: mine.map((p) => p.display_name as string).filter(Boolean),
      emails: [
        ...mine.map((p) => emailOf.get(p.user_id as string) ?? "").filter(Boolean),
        ...(invs.data ?? []).filter((i) => i.school_id === s.id).map((i) => i.email as string),
      ],
    };
  });
}

/** 대조 조회: 한 학교 멤버의 로그인 이메일 */
export async function memberEmails(schoolId: string): Promise<string[]> {
  const members = await membersByService(schoolId);
  const out: string[] = [];
  for (const m of members) {
    const u = await service().auth.admin.getUserById(m.user_id);
    if (u.data.user?.email) out.push(u.data.user.email.toLowerCase());
  }
  return out;
}

// ---------- 일회용 계정의 브라우저 세션 ----------

type AuthErr = { status?: number; code?: string; message?: string } | null;
const isRateLimited = (e: AuthErr): boolean =>
  Boolean(e) && (e?.status === 429 || e?.code === "over_request_rate_limit" || /rate limit/i.test(e?.message ?? ""));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LOGIN_RETRY_WAIT_MS = 11_000;
const LOGIN_RETRY_TOTAL_MS = 300_000;

const sessions = new Map<string, AuthSession>();

/**
 * 일회용 계정의 로그인 세션. service role 이 만든 일회용 로그인 토큰(generateLink — 메일을 보내지 않는다)을 verifyOtp 로 바꾼다
 * (토큰 확인 한도는 비밀번호 로그인 한도와 따로 센다). 안 되면 비밀번호 로그인, 한도에 걸리면 기다렸다 다시.
 * 결과는 그 사용자의 authenticated 세션이다 (service role 권한이 섞이지 않는다). 워커 안에서 계정당 한 번만 만든다.
 */
export async function sessionFor(u: TempUser): Promise<AuthSession> {
  const cached = sessions.get(u.id);
  if (cached) return cached;
  const deadline = Date.now() + LOGIN_RETRY_TOTAL_MS;
  for (;;) {
    let last: AuthErr = null;
    const link = await service().auth.admin.generateLink({ type: "magiclink", email: u.email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (!link.error && tokenHash) {
      const v = await anonClient().auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (!v.error && v.data.session && v.data.user?.id === u.id) {
        sessions.set(u.id, v.data.session);
        return v.data.session;
      }
      last = v.error;
    } else {
      last = link.error;
    }
    const signed = await anonClient().auth.signInWithPassword({ email: u.email, password: u.password });
    if (!signed.error && signed.data.session && signed.data.user?.id === u.id) {
      sessions.set(u.id, signed.data.session);
      return signed.data.session;
    }
    if (!(isRateLimited(signed.error) || isRateLimited(last)) || Date.now() > deadline) {
      throw new Error(`일회용 계정 세션 실패: 토큰 확인 = ${last?.message ?? "-"}, 비밀번호 = ${signed.error?.message ?? "-"}`);
    }
    await sleep(LOGIN_RETRY_WAIT_MS);
  }
}

/**
 * 워커가 기억해 둔 일회용 계정 세션을 잊는다 — 다음 sessionFor·contextFor 가 새 세션을 만든다.
 * 로그아웃 테스트용: 로그아웃은 그 계정의 세션을 서버에서 끝내므로(signOut 기본 scope = global) 끝난 세션을 다시 심지 않게 한다.
 */
export function forgetSession(userId: string): void {
  sessions.delete(userId);
}

/** 일회용 계정 세션의 supabase-js 클라이언트 (publishable 키 + RLS) — 준비용 호출(같은 학교 admin 으로 초대·역할 지정)에 쓴다 */
export async function clientFor(u: TempUser): Promise<SupabaseClient> {
  const s = await sessionFor(u);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY 없음");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${s.access_token}` } },
  });
}

/** @supabase/ssr 가 쿠키 하나에 담는 최대 길이 (넘으면 .0 .1 … 로 나눈다) */
const COOKIE_CHUNK = 3180;

/** 세션 → @supabase/ssr 쿠키 (lib/supabase/server.ts·proxy.ts 가 읽는 형식: sb-{ref}-auth-token = "base64-" + base64url(JSON)) */
function sessionCookies(session: AuthSession, baseURL: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const parts = value.length <= COOKIE_CHUNK ? [value] : (value.match(new RegExp(`.{1,${COOKIE_CHUNK}}`, "g")) ?? []);
  const domain = new URL(baseURL).hostname;
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  return parts.map((v, i) => ({
    name: parts.length === 1 ? name : `${name}.${i}`,
    value: v,
    domain,
    path: "/",
    expires,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));
}

function baseURLOf(info: TestInfo): string {
  const u = info.project.use.baseURL;
  if (!u) throw new Error("playwright.config baseURL 없음");
  return u;
}

export function viewportOf(info: TestInfo): { name: ViewportName; width: number; height: number } {
  const name = info.project.name as ViewportName;
  const vp = devRules.viewports[name];
  if (!vp) throw new Error(`dev-rules.json viewports 에 '${name}' 없음`);
  return { name, width: vp[0], height: vp[1] };
}

/** 일회용 계정으로 로그인된 새 브라우저 컨텍스트 (세션 쿠키를 심는다 — 로그인 화면·로그인 API 를 거치지 않는다) */
export async function contextFor(browser: Browser, info: TestInfo, u: TempUser): Promise<BrowserContext> {
  const vp = viewportOf(info);
  const baseURL = baseURLOf(info);
  const context = await browser.newContext({ baseURL, viewport: { width: vp.width, height: vp.height } });
  await context.addCookies(sessionCookies(await sessionFor(u), baseURL));
  return context;
}

/** 로그인하지 않은 새 브라우저 컨텍스트 (프로젝트 viewport) */
export async function anonContext(browser: Browser, info: TestInfo): Promise<BrowserContext> {
  const vp = viewportOf(info);
  return browser.newContext({ baseURL: baseURLOf(info), viewport: { width: vp.width, height: vp.height } });
}

export type TempPage = { context: BrowserContext; page: Page; viewport: ViewportName; response: Response | null };

/** 일회용 계정으로 화면을 연다 (기본 = 화면 8) */
export async function openTemp(browser: Browser, info: TestInfo, u: TempUser, path: string = routeOf(SCREEN)): Promise<TempPage> {
  const context = await contextFor(browser, info, u);
  const page = await context.newPage();
  const response = await page.goto(path);
  await page.waitForLoadState("load");
  return { context, page, viewport: viewportOf(info).name, response };
}

export type Residue = { users: number; schools: number; invites: number; profiles: number };

/** 이 묶음(group)·프로젝트 접두사의 잔여물(초대·프로필·계정·학교)을 지우고, 남은 수를 돌려준다 */
/** 지난 실행 잔여물(같은 group·project, 다른 토큰, STALE_MS 보다 오래된 것)을 지운다 — 동시에 도는 다른 실행의 데이터는 건드리지 않는다. 세지 않는다 */
async function sweepStale(group: string, project: string): Promise<void> {
  const sb = service();
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const schools = await sb.from("schools").select("id").like("neis_code", `${baseSchoolPrefix(group, project)}%`).lt("created_at", cutoff);
  const ids = (schools.data ?? []).map((s) => s.id as string);
  if (ids.length) {
    for (const table of ["vendor_favorites", "usage_logs", "invites", "reagents", "vendors", "cabinets", "profiles"]) await sb.from(table).delete().in("school_id", ids);
  }
  for (let page = 1; page <= 20; page++) {
    const list = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const users = list.data?.users ?? [];
    for (const u of users) {
      if (!u.email?.startsWith(baseEmailPrefix(group, project)) || u.email.startsWith(emailPrefix(group, project))) continue;
      if (!u.created_at || u.created_at >= cutoff) continue;
      await sb.from("profiles").delete().eq("user_id", u.id);
      await sb.auth.admin.deleteUser(u.id);
    }
    if (users.length < 200) break;
  }
  if (ids.length) await sb.from("schools").delete().in("id", ids);
}

export async function sweep(group: string, project: string): Promise<Residue> {
  await sweepStale(group, project).catch(() => undefined);
  const sb = service();
  const ePrefix = emailPrefix(group, project);
  const sLike = `${schoolPrefix(group, project)}%`;
  const schools = await sb.from("schools").select("id").like("neis_code", sLike);
  const schoolIds = (schools.data ?? []).map((s) => s.id as string);

  await sb.from("invites").delete().like("email", `${ePrefix}%`);
  if (schoolIds.length) {
    await sb.from("invites").delete().in("school_id", schoolIds);
    await sb.from("profiles").delete().in("school_id", schoolIds);
  }

  // 1) 이 실행 토큰의 계정을 먼저 모두 모은 뒤 2) 지운다 — 목록을 넘기면서 지우면 뒤 쪽 계정이 앞 쪽으로 밀려 건너뛰어진다.
  // 지우기는 몇 번 다시 시도한다: Auth 관리 API 가 동시 부하에서 잠깐 실패(5xx·한도)하면 계정 1개가 남아 잔여물로 잡혔다
  // (run 20261008-2117 screen-4-10-used-on · screen-8-isolation users:1 — 그 계정을 가리키는 행은 없었다).
  const mine: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const list = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const users = list.data?.users ?? [];
    for (const u of users) if (u.email?.startsWith(ePrefix)) mine.push(u.id);
    if (users.length < 200) break;
  }
  const leftUsers: string[] = [];
  for (const id of mine) {
    await sb.from("profiles").delete().eq("user_id", id);
    let lastError = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1_000 * attempt));
      const del = await sb.auth.admin.deleteUser(id);
      if (!del.error) {
        lastError = "";
        break;
      }
      lastError = del.error.message;
      // 이미 지워졌으면(다른 시도가 성공) 끝
      if (/not.?found/i.test(lastError)) {
        lastError = "";
        break;
      }
    }
    if (lastError) {
      console.warn(`[sweep ${group}/${project}] 일회용 계정 삭제 실패: ${lastError}`);
      leftUsers.push(id);
    }
    sessions.delete(id);
  }
  if (schoolIds.length) await sb.from("schools").delete().in("id", schoolIds);

  const leftSchools = await sb.from("schools").select("id").like("neis_code", sLike);
  const leftInvites = await sb.from("invites").select("id").like("email", `${ePrefix}%`);
  const leftProfiles = schoolIds.length ? await sb.from("profiles").select("user_id").in("school_id", schoolIds) : { data: [] as unknown[] };
  return {
    users: leftUsers.length,
    schools: (leftSchools.data ?? []).length,
    invites: (leftInvites.data ?? []).length,
    profiles: (leftProfiles.data ?? []).length,
  };
}

export const NO_RESIDUE: Residue = { users: 0, schools: 0, invites: 0, profiles: 0 };

/** 공용 테스트 계정이 있는 학교(seed 의 TEST-SCHOOL-*)의 프로필·초대 스냅숏 — 일회용 쓰기 흐름이 건드리지 않았는지 대조한다 */
export async function sharedSnapshot(): Promise<{ profiles: string[]; invites: number }> {
  const sb = service();
  const schools = await sb.from("schools").select("id, neis_code").like("neis_code", "TEST-SCHOOL-%");
  if (schools.error) throw new Error(`schools 대조 조회 실패: ${schools.error.message}`);
  const ids = (schools.data ?? []).map((s) => s.id as string);
  const profs = await sb.from("profiles").select("user_id, school_id, role, display_name").in("school_id", ids);
  if (profs.error) throw new Error(`profiles 대조 조회 실패: ${profs.error.message}`);
  const invs = await sb.from("invites").select("id").in("school_id", ids);
  if (invs.error) throw new Error(`invites 대조 조회 실패: ${invs.error.message}`);
  return {
    profiles: (profs.data ?? []).map((p) => `${p.school_id}|${p.user_id}|${p.role}|${p.display_name}`).sort(),
    invites: (invs.data ?? []).length,
  };
}

// ---------- 초대 대기 줄 초대일 (새 프레임 8-mobile invite-date "교사 · 10월 6일 초대" · 8-desktop 초대일 칸 "10월 6일") ----------
const F8M_INVITE = JSON.parse(readFileSync(join(process.cwd(), "design", "frames", "8-mobile.json"), "utf8")) as { frames: { nodes: { name: string; text: { characters: string } | null }[] }[] };
const F8D_INVITE = JSON.parse(readFileSync(join(process.cwd(), "design", "frames", "8-desktop.json"), "utf8")) as { frames: { nodes: { name: string; path: string[]; text: { characters: string } | null }[] }[] };
/** 시안 8-mobile 초대 보조줄 예시 → 틀 [역할 자리 뒤 구분, 날짜 뒤 꼬리] ("교사 · 10월 6일 초대" → " · ", " 초대") */
export const INVITE_CAPTION_FRAME = (() => {
  const t = F8M_INVITE.frames[0].nodes.find((n) => n.name === "invite-date" && n.text)?.text?.characters ?? "";
  const m = /^(\S+)( · )(\d{1,2}월 \d{1,2}일)(.*)$/.exec(t);
  if (!m) throw new Error(`시안 8-mobile invite-date 틀을 읽지 못함: "${t}"`);
  return { example: t, sep: m[2], tail: m[4] };
})();
/** 시안 8-desktop 초대 대기 표의 초대일 칸 예시 ("10월 6일") — 날짜만 */
export const INVITE_DATE_DESK_EXAMPLE = (() => {
  const nodes = F8D_INVITE.frames[0].nodes;
  let tables = 0;
  const cells: string[] = [];
  for (const n of nodes) {
    if (n.name === "data-table") tables += 1;
    else if (tables === 2 && n.name === "cell" && n.text) cells.push(n.text.characters);
  }
  const d = cells.find((c) => /^\d{1,2}월 \d{1,2}일$/.test(c));
  if (!d) throw new Error("시안 8-desktop 초대일 칸 예시 없음");
  return d;
})();
/** 한국 날짜 → "M월 D일" (시안 8 초대일) */
export function inviteDay(at: Date = new Date()): string {
  const [, m, d] = todayDots(at).split(".").map(Number);
  return `${m}월 ${d}일`;
}
/** 390 초대 보조줄 = "{역할} · {M월 D일} 초대" (시안 8-mobile 틀) */
export const inviteCaption = (roleText: string, day: string) => `${roleText}${INVITE_CAPTION_FRAME.sep}${day}${INVITE_CAPTION_FRAME.tail}`;
