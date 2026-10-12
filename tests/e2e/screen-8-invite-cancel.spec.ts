// 화면 8 초대 취소 (d7 §28 "초대 취소 (화면 8)" · design/rules.json 1.28 invite_cancel · 시안 8 · 8-invite-cancel-{mobile,desktop}) — 화면 연결(D3).
// admin: 초대 대기 행 invite-more-menu(⋯ — 모바일 카드 오른쪽 위 · 데스크톱 표 마지막 열) → invite-cancel '초대 취소' →
//   ex-modal-card "{이메일} 초대를 취소할까요?" + "보낸 초대로는 더 이상 가입할 수 없어요." + '닫기'(button-outline) · '초대 취소'(button-primary)
//   → 닫기 = 그대로 · 초대 취소 = 토스트 '초대를 취소했어요' + 행 빠짐 + DB 초대 지움. 교사·학생 = ⋯ 0.
// 쓰기는 일회용 학교 admin 으로만 (초대 준비 = 그 admin 세션의 invite_members). service role 은 준비 · 정리 · 대조 조회에만.
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { newFrame } from "./desk-helpers";
import { routeOf, rules, sel } from "./screen-helpers";
import {
  HAS_SERVICE,
  NO_RESIDUE,
  clientFor,
  inviteRow,
  inviteRows,
  invitesByService,
  invitesHeading,
  manage,
  openTemp,
  sharedSnapshot,
  sweep,
  tempEmail,
  tempSchool,
  waitUsers,
  type TempSchool,
} from "./screen-8-helpers";
import { INVITE_CANCEL, exact, rgbOf } from "./d7-28-helpers";

test.describe.configure({ mode: "default" });

const SCREEN = 8;
const GROUP = "invcancel";
const ACCENT = rgbOf((rules as unknown as { colors: { accent: { value: string } } }).colors.accent.value);

let before: Awaited<ReturnType<typeof sharedSnapshot>> | null = null;
let shared: Promise<TempSchool> | null = null;
function school(info: TestInfo): Promise<TempSchool> {
  shared ??= tempSchool(info, GROUP);
  shared.catch(() => (shared = null));
  return shared;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  shared = null;
  expect(await sweep(GROUP, info.project.name), "일회용 계정·학교·초대·프로필 잔여물").toEqual(NO_RESIDUE);
  if (before) expect(await sharedSnapshot(), "학교 A·B 의 프로필·초대 그대로").toEqual(before);
});

const pending = async (schoolId: string) => (await invitesByService(schoolId)).filter((i) => i.accepted_at === null);
const moreOf = (row: Locator) => row.locator(sel(INVITE_CANCEL.menu));
const cancelDialog = (page: Page, email: string) => page.getByRole("dialog", { name: exact(INVITE_CANCEL.title(email)) });

test(`[C1][S8] 기대값 원본: rules invite_cancel(admin · ${INVITE_CANCEL.menu} → ${INVITE_CANCEL.component} '${INVITE_CANCEL.item}' · 확인 문구 · '${INVITE_CANCEL.done}') = 시안 8-invite-cancel 글자 · dev-rules components`, async () => {
  const { devRules } = await import("./screen-helpers");
  expect(devRules.components[INVITE_CANCEL.menu], `${INVITE_CANCEL.menu} 화면`).toEqual([SCREEN]);
  expect(devRules.components[INVITE_CANCEL.component], `${INVITE_CANCEL.component} 화면`).toEqual([SCREEN]);
  for (const vp of ["mobile", "desktop"]) {
    const nodes = newFrame(`8-invite-cancel-${vp}`);
    const texts = nodes.filter((n) => n.path.includes("ex-modal-card") && n.text).map((n) => n.text!.characters);
    // 시안 확인 카드 제목의 이메일 = 시안 초대 대기 행에 있는 이메일
    const email = nodes.filter((n) => !n.path.includes("ex-modal-card") && n.text && /^\S+@\S+$/.test(n.text.characters)).map((n) => n.text!.characters).find((e) => texts.includes(INVITE_CANCEL.title(e))) ?? "";
    expect(email, `시안 8-invite-cancel-${vp} 제목 이메일 = 초대 대기 행 이메일`).not.toBe("");
    expect(texts, `시안 8-invite-cancel-${vp} 확인 카드 글자 = rules`).toEqual(
      expect.arrayContaining([INVITE_CANCEL.title(email), INVITE_CANCEL.body, INVITE_CANCEL.close, INVITE_CANCEL.confirm]),
    );
    expect(nodes.filter((n) => n.name === INVITE_CANCEL.menu).length, `시안 8-invite-cancel-${vp} 에 ⋯`).toBeGreaterThanOrEqual(1);
  }
});

test.describe("일회용 학교 admin", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음");

  test(`[C1][S8] [R-ui][S8] 초대 취소 흐름(두 폭): 초대 대기 행마다 ⋯ 1(행 오른쪽 끝) → '${INVITE_CANCEL.item}' → 확인 카드(제목 · 본문 · '${INVITE_CANCEL.close}' button-outline · '${INVITE_CANCEL.confirm}' button-primary 검정) → '${INVITE_CANCEL.close}' = 그대로 → '${INVITE_CANCEL.confirm}' = 토스트 '${INVITE_CANCEL.done}' · 행 빠짐 · "초대 대기 (N-1)" · DB 초대 지움 · 다른 초대 그대로`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const s = await school(info);
    const admin = await clientFor(s.admin);
    const target = tempEmail(info, GROUP, "cx-");
    const keep = tempEmail(info, GROUP, "keep-");
    const made = await admin.rpc("invite_members", { p_emails: [target, keep], p_role: "teacher" });
    expect(made.error, `준비: 초대 2건 (${made.error?.message})`).toBeNull();
    const start = await pending(s.id);
    expect(start.map((i) => i.email), "준비 초대").toEqual(expect.arrayContaining([target, keep]));

    const { context, page, viewport } = await openTemp(browser, info, s.admin);
    try {
      await waitUsers(page);
      await expect(inviteRows(page), "초대 대기 행 = DB").toHaveCount(start.length);
      // 행마다 ⋯ 1 · 행 오른쪽 끝
      for (const inv of start) {
        const row = inviteRow(page, inv.email);
        await expect(moreOf(row), `${inv.email} ⋯ 1`).toHaveCount(1);
        const more = moreOf(row).locator("button").first();
        await expect(more, "⋯ 보임").toBeVisible();
        const mb = (await more.boundingBox())!;
        const rightMost = await row.evaluate((el, me) => {
          const texts = Array.from(el.querySelectorAll("*")).filter((e) => !e.closest(me) && e.children.length === 0 && (e as HTMLElement).innerText?.trim());
          return Math.max(...texts.map((e) => e.getBoundingClientRect().right));
        }, sel(INVITE_CANCEL.menu));
        expect(mb.x + mb.width, `${inv.email} ⋯ = 행 오른쪽 끝 (${viewport === "desktop" ? "표 마지막 열" : "카드 오른쪽"})`).toBeGreaterThanOrEqual(rightMost);
        if (viewport === "mobile") {
          const rb = (await row.boundingBox())!;
          expect(mb.y, "모바일 ⋯ = 카드 위쪽").toBeLessThan(rb.y + rb.height / 2);
        }
      }
      // 멤버 행에는 초대 ⋯ 없음
      await expect(manage(page).locator(sel(INVITE_CANCEL.menu)), "⋯ 전체 = 초대 행 수").toHaveCount(start.length);
      await expect(page.locator(sel(INVITE_CANCEL.component)), "메뉴 열기 전 invite-cancel 0").toHaveCount(0);

      const openConfirm = async () => {
        const row = inviteRow(page, target);
        await expect(async () => {
          const item = page.getByRole("menuitem", { name: INVITE_CANCEL.item, exact: true });
          if (!(await item.isVisible())) await moreOf(row).locator("button").first().click({ timeout: 3_000 });
          await expect(page.locator(sel(INVITE_CANCEL.component)), "메뉴 안 invite-cancel 1").toHaveCount(1, { timeout: 3_000 });
          await item.click({ timeout: 3_000 });
          await expect(cancelDialog(page, target)).toBeVisible({ timeout: 3_000 });
        }).toPass({ timeout: 30_000 });
        return cancelDialog(page, target);
      };
      let dialog = await openConfirm();
      await expect(page.locator(sel("ex-modal-card")).filter({ hasText: INVITE_CANCEL.title(target) }), "확인 = ex-modal-card 1").toHaveCount(1);
      await expect(dialog, "본문").toContainText(INVITE_CANCEL.body);
      const outline = dialog.locator(sel("button-outline"));
      const primary = dialog.locator(sel("button-primary"));
      await expect(outline, `'${INVITE_CANCEL.close}' = button-outline`).toHaveText(exact(INVITE_CANCEL.close));
      await expect(primary, `'${INVITE_CANCEL.confirm}' = button-primary`).toHaveText(exact(INVITE_CANCEL.confirm));
      const ob = (await outline.boundingBox())!;
      const pb = (await primary.boundingBox())!;
      expect(ob.x, "왼쪽 = 닫기").toBeLessThan(pb.x);
      expect(await primary.evaluate((e) => getComputedStyle(e).backgroundColor), "초대 취소 버튼 핑크 아님").not.toBe(ACCENT);
      await expect(dialog.getByRole("button", { name: /^취소$/ }), "'취소' 글자 버튼 0 (왼쪽은 '닫기')").toHaveCount(0);
      await page.screenshot({ path: `test-results/v1-8-invite-cancel-${viewport}.png` });
      // 닫기 → 그대로
      await outline.click();
      await expect(cancelDialog(page, target), "닫기 → 카드 닫힘").toHaveCount(0);
      await expect(inviteRow(page, target), "닫기 → 행 그대로").toHaveCount(1);
      expect((await pending(s.id)).map((i) => i.email), "닫기 → DB 그대로").toContain(target);
      // 초대 취소
      dialog = await openConfirm();
      await dialog.locator(sel("button-primary")).click();
      await expect(page.locator(sel("ex-toast")).filter({ hasText: INVITE_CANCEL.done }), `토스트 '${INVITE_CANCEL.done}'`).toBeVisible({ timeout: 20_000 });
      await expect(cancelDialog(page, target), "카드 닫힘").toHaveCount(0);
      await expect(inviteRow(page, target), "취소한 초대 행 빠짐").toHaveCount(0);
      await expect(inviteRow(page, keep), "다른 초대 그대로").toHaveCount(1);
      const after = await pending(s.id);
      expect(after.map((i) => i.email), "DB: 취소한 초대 없음").not.toContain(target);
      expect(after.map((i) => i.email), "DB: 다른 초대 그대로").toContain(keep);
      expect((await invitesByService(s.id)).map((i) => i.email), "DB: 초대 행 지움 (수락 표시 아님)").not.toContain(target);
      await expect(manage(page).getByRole("heading", { name: exact(invitesHeading(after.length)) }), `"초대 대기 (${after.length})"`).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

for (const role of ["teacher", "student"] as const) {
  test(`[R-ui][S8] ${role === "teacher" ? "교사" : "학생"}: ${routeOf(SCREEN)} → 홈 · ${INVITE_CANCEL.menu} 0 · ${INVITE_CANCEL.component} 0`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page } = await openAs(browser, info, role, 13);
    try {
      await page.goto(routeOf(SCREEN));
      await expect.poll(() => new URL(page.url()).pathname, { message: "홈으로", timeout: 45_000 }).toBe(routeOf(13));
      await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 45_000 });
      await expect(page.locator(sel(INVITE_CANCEL.menu)), `${INVITE_CANCEL.menu} 0`).toHaveCount(0);
      await expect(page.locator(sel(INVITE_CANCEL.component)), `${INVITE_CANCEL.component} 0`).toHaveCount(0);
      await expect(page.locator(sel("user-manage")), "user-manage 0").toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
