// 화면 14 가입 오류 요약 — C1 · N1-d (390 · 1440). 비로그인, 가입 요청은 보내지 않는다(가로채서 0건 확인).
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §25 "가입 오류 (화면 14)"(가입하기 → 첫 오류 칸으로 스크롤 · 포커스 + 버튼 바로 위
//   signup-error-summary 한 줄(첫 오류, 여럿이면 "… 외 N개"), 두 폭), design/rules.json 1.26 signup_error · variants["14"].error ·
//   never.N1.school_select_levels, 새 프레임 14-error-*.
import { test, expect, type Page } from "@playwright/test";
import { routeOf, rules, sel } from "./screen-helpers";
import { newFrame } from "./desk-helpers";
import { SCHOOL, SIGNUP_API, fillValidSignup, waitSignupScreen } from "./screen-14-helpers";
import { quotes } from "./sensor-helpers";

const SE = (rules as unknown as { signup_error: { summary: string; scroll: string } }).signup_error;
const SUMMARY = "signup-error-summary";
/** rules signup_error.summary 예: 첫 오류 '약관에 동의해 주세요' · 여럿이면 '… 외 N개' */
const [TERMS_FIRST, MANY_TPL] = quotes(SE.summary);
const many = (first: string, total: number) => MANY_TPL.replace("…", first).replace("N", String(total - 1));

function blockSignup(page: Page): () => number {
  let n = 0;
  void page.route(`**${SIGNUP_API}`, (r) => {
    n++;
    return r.abort();
  });
  return () => n;
}

/** 가입하기 (폼 제출 버튼) */
const submit = (page: Page) => page.locator('form button[type="submit"]');
const summary = (page: Page) => page.locator(sel(SUMMARY));

async function submitAndWait(page: Page): Promise<void> {
  await expect(async () => {
    await submit(page).click({ timeout: 3_000 });
    await expect(summary(page)).toHaveCount(1, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

test(`[C1][S14] 기대값 원본: variants 14.error = ${SUMMARY} · rules signup_error 첫 오류 예 '${TERMS_FIRST}' · '${MANY_TPL}' = 프레임 14-error (버튼 바로 위 한 줄)`, () => {
  expect(rules.variants["14"].error, "variants 14.error").toEqual([SUMMARY]);
  expect(TERMS_FIRST).toBe("약관에 동의해 주세요");
  expect(MANY_TPL).toBe("… 외 N개");
  expect(SE.scroll).toMatch(/첫 오류 칸으로 스크롤하고 포커스/);
  for (const vp of ["mobile", "desktop"]) {
    const f = newFrame(`14-error-${vp}`);
    const s = f.filter((n) => n.path.includes(SUMMARY) && n.text).map((n) => n.text!.characters);
    expect(s, `14-error-${vp} ${SUMMARY} 글자`).toEqual([TERMS_FIRST]);
    const iSum = f.findIndex((n) => n.name === SUMMARY);
    const iBtn = f.findIndex((n, i) => i > iSum && n.name === "button-primary");
    expect(iSum, `14-error-${vp} ${SUMMARY} 있음`).toBeGreaterThanOrEqual(0);
    expect(f.slice(iSum + 1, iBtn).filter((n) => /^[a-z]+(-[a-z]+)+$/.test(n.name) && !n.path.includes(SUMMARY) && n.name !== "icon-info").map((n) => n.name), `${SUMMARY} 바로 다음 = 가입하기 버튼`).toEqual([]);
  }
});

test(`[C1][S14] [N1-d][S14] 빈 폼 가입하기: 오류 전 ${SUMMARY} 0 → 누르면 1 ('첫 오류 외 N개') · 포커스 = 학교 선택(${SCHOOL} 쪽 첫 칸) · 가입 요청 0 · V1`, async ({ page }, info) => {
  test.setTimeout(120_000);
  const sent = blockSignup(page);
  await page.goto(routeOf(14));
  await waitSignupScreen(page);
  await expect(summary(page), "오류 전 0").toHaveCount(0);
  await submitAndWait(page);
  const text = (await summary(page).innerText()).trim();
  expect(text, "여럿이면 '… 외 N개'").toMatch(/ 외 \d+개$/);
  const n = Number(/ 외 (\d+)개$/.exec(text)![1]);
  expect(n, "빈 폼 = 학교 · 이름 · 이메일 · 비밀번호 · 약관 → 외 4개 이상").toBeGreaterThanOrEqual(4);
  // 첫 오류 = 학교 (rules N1 school_select_levels 순서상 맨 위 칸)
  const focusedInSchool = await page.evaluate((levels) => {
    const a = document.activeElement;
    if (!a) return false;
    return levels.some((l) => a.closest(`[data-component="${l}"]`)) || !!a.closest("[data-name='section-school']");
  }, rules.never.N1.school_select_levels);
  expect(focusedInSchool, "포커스 = 학교 선택 칸").toBe(true);
  // 버튼 바로 위 (세로 순서)
  const sb = await summary(page).boundingBox();
  const bb = await submit(page).boundingBox();
  expect(sb && bb && sb.y + sb.height <= bb.y + 1, "요약 = 가입하기 버튼 위").toBe(true);
  await page.screenshot({ path: `test-results/v1-14-error-${info.project.name}.png` });
  expect(sent(), "가입 요청 0").toBe(0);
});

test(`[C1][S14] 약관만 빠짐 → ${SUMMARY} '${TERMS_FIRST}' (외 N개 없음) · 포커스 = 동의 안 한 약관 · 이메일도 틀리면 '이메일 … 외 1개' + 포커스 = 이메일 칸 · 고치면 사라짐 · 가입 요청 0`, async ({ page }) => {
  test.setTimeout(180_000);
  const sent = blockSignup(page);
  await fillValidSignup(page, `e2e-summary-${Date.now()}@example.test`);
  const boxes = page.locator('form input[type="checkbox"]');
  // 약관 체크박스는 화면 밖으로 숨긴 input — 좌표 클릭 대신 요소 click() 으로 바꾼다 (모두 동의 → 둘 다)
  const setTerms = async (on: boolean) => {
    const all = boxes.first();
    if ((await all.isChecked()) !== on) await all.evaluate((el) => (el as HTMLInputElement).click());
    for (let i = 0; i < (await boxes.count()); i++) await expect(boxes.nth(i), `약관 ${i} ${on ? "동의" : "해제"}`).toBeChecked({ checked: on });
  };
  await setTerms(false);
  await submitAndWait(page);
  await expect(summary(page), "약관만 → 한 줄").toHaveText(TERMS_FIRST);
  expect(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type), "포커스 = 약관 체크박스").toBe("checkbox");
  // 이메일도 틀림 → 첫 오류 = 이메일 (위에서 아래 순서)
  await page.locator('input[name="email"]').fill("not-an-email");
  await submit(page).click();
  await expect(summary(page), "이메일 + 약관").toHaveText(/ 외 1개$/);
  const first = (await summary(page).innerText()).replace(/ 외 1개$/, "").trim();
  expect(first, "첫 오류 = 이메일 문구").toMatch(/이메일/);
  expect(await summary(page).innerText()).toBe(many(first, 2));
  expect(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name), "포커스 = 이메일 칸").toBe("email");
  // 고치면 사라짐
  await page.locator('input[name="email"]').fill(`e2e-summary-${Date.now()}@example.test`);
  await setTerms(true);
  await expect(summary(page), "모두 고침 → 0").toHaveCount(0);
  expect(sent(), "가입 요청 0").toBe(0);
});
