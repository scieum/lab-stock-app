// 화면 14 (회원가입) e2e 공용 도우미.
// 기대값은 design/rules.json · harness/dev-rules.json 에서 읽는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type Response } from "@playwright/test";
import { routeOf, rules, sel } from "./screen-helpers";

export const SCREEN = 14;
export const NEIS_PREFIX = "/api/neis/";
export const SIGNUP_API = "/api/auth/signup";

// rules.json 1.18: 시/도 → 지역 → 학교급 → 학교 (4단계)
export const [SIDO, REGION, KIND, SCHOOL] = rules.never.N1.school_select_levels;
export const KINDS = rules.neis.school_kinds;

export const selectBox = (page: Page, level: string) => page.locator(`${sel(level)} button[aria-haspopup="listbox"]`);
export const selectOptions = (page: Page, level: string) => page.locator(`${sel(level)} [role=option]`);

/** 화면 14 가 그려지고 하이드레이션 + 시/도 목록 로딩까지 끝났는지 (빈 화면에서 0개를 세어 통과하지 않도록) */
export async function waitSignupScreen(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await expect(page.locator(sel("ex-auth-form-card")).first()).toBeVisible();
  await expect(selectBox(page, SIDO)).toBeEnabled({ timeout: 60_000 });
}

export function waitNeis(page: Page, path: string): Promise<Response> {
  return page.waitForResponse((r) => new URL(r.url()).pathname === NEIS_PREFIX + path, { timeout: 60_000 });
}

export async function jsonList<T>(res: Response, key: string): Promise<T[]> {
  expect(res.status(), `${new URL(res.url()).pathname} HTTP`).toBe(200);
  const body = (await res.json()) as Record<string, T[]>;
  expect(Array.isArray(body[key]), `${key} 배열`).toBe(true);
  return body[key];
}

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (t: string) => new RegExp(`^\\s*${escapeRe(t)}\\s*$`);

export const pickOption = (page: Page, level: string, label: string) =>
  selectOptions(page, level).filter({ hasText: exact(label) }).click();

/** 학교급(school-select-kind) 칸 — segmented-control 의 role=tab 버튼 (rules.json school_kind_select.shape) */
export const kindTabs = (page: Page) => page.locator(`${sel(KIND)} [role="tab"]`);
export const kindTab = (page: Page, kind: string) => kindTabs(page).filter({ hasText: exact(kind) });
/** 고른 학교급 칸 (aria-selected=true) */
export const kindSelected = (page: Page) => page.locator(`${sel(KIND)} [role="tab"][aria-selected="true"]`);

export async function optionLabels(page: Page, level: string): Promise<string[]> {
  return (await selectOptions(page, level).allTextContents()).map((t) => t.trim());
}

/** 이 단계가 아직 열리지 않았는지: 선택 상자 비활성 + 옵션 0개 */
export async function expectLocked(page: Page, level: string): Promise<void> {
  await expect(selectBox(page, level), `${level} 비활성`).toBeDisabled();
  await expect(selectOptions(page, level), `${level} 옵션 없음`).toHaveCount(0);
}

type FrameNode = { name: string };
type FrameFile = { frames: { name: string; nodes: FrameNode[] }[] };

/** design/frames/{screen}-{viewport}.json 에서 이름이 name 인 노드 개수 */
export function frameCount(screen: number, viewport: string, name: string): number {
  const file = JSON.parse(
    readFileSync(join(process.cwd(), "design", "frames", `${screen}-${viewport}.json`), "utf8"),
  ) as FrameFile;
  const frame = file.frames.find((f) => f.name === `${screen}-${viewport}`);
  if (!frame) throw new Error(`design/frames/${screen}-${viewport}.json 에 프레임 ${screen}-${viewport} 없음`);
  return frame.nodes.filter((n) => n.name === name).length;
}

type NeisSchoolRow = { name: string; neis_code: string };

/**
 * 비로그인 /signup 에서 학교(rules.json neis 기본 시/도·지역·default_kind 의 첫 학교, 실제 /api/neis 응답)를 고르고
 * 계정 입력·필수 약관 동의까지 채운다. 형식이 모두 맞아 클라이언트 검사를 통과하는 상태가 된다.
 * 가입 요청 자체는 호출한 테스트가 page.route 로 가로채야 한다 (실제 계정 생성 금지).
 */
export async function fillValidSignup(page: Page, email: string): Promise<NeisSchoolRow> {
  const sidoRes = waitNeis(page, "sido");
  await page.goto(routeOf(SCREEN));
  await waitSignupScreen(page);
  await sidoRes;

  const regionRes = waitNeis(page, "regions");
  await selectBox(page, SIDO).click();
  await pickOption(page, SIDO, rules.neis.default_sido);
  await regionRes;
  await expect(selectBox(page, REGION)).toBeEnabled();
  await selectBox(page, REGION).click();
  await pickOption(page, REGION, rules.neis.default_region);
  await expect(selectBox(page, REGION)).toContainText(rules.neis.default_region);
  // 학교급(1.18) — 고르기 전에는 학교 목록 요청이 없다. 고른 뒤 schools?kind= 응답을 기다린다
  const schoolRes = waitNeis(page, "schools");
  await expect(kindTab(page, rules.neis.default_kind)).toBeEnabled();
  await kindTab(page, rules.neis.default_kind).click();
  const schools = await jsonList<NeisSchoolRow>(await schoolRes, "schools");
  expect(schools.length, "학교 응답").toBeGreaterThan(0);
  const chosen = schools[0];
  await expect(selectBox(page, SCHOOL)).toBeEnabled();
  await selectBox(page, SCHOOL).click();
  await pickOption(page, SCHOOL, chosen.name);
  await expect(selectBox(page, SCHOOL)).toContainText(chosen.name);

  const password = "e2e-Intercept-1234";
  await page.locator('input[name="displayName"]').fill("e2e 가로챔");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="passwordConfirm"]').fill(password);
  const boxes = page.locator('form input[type="checkbox"]');
  const n = await boxes.count();
  expect(n, "약관 체크박스").toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await boxes.nth(i).check({ force: true });
  return chosen;
}
