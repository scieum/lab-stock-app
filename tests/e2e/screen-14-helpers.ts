// 화면 14 (회원가입) e2e 공용 도우미.
// 기대값은 design/rules.json · harness/dev-rules.json 에서 읽는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type Response } from "@playwright/test";
import { rules, sel } from "./screen-helpers";

export const SCREEN = 14;
export const NEIS_PREFIX = "/api/neis/";
export const SIGNUP_API = "/api/auth/signup";

export const [SIDO, REGION, SCHOOL] = rules.never.N1.school_select_levels;

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
