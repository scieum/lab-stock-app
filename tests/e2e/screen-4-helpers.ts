// 화면 4 (사용 기록 입력, dev-rules.json routes["4"]) 테스트 공용 도우미.
// - 시약 id 는 seed.sql 에서 고르고, DB 값은 그 계정의 브라우저 세션(publishable 키 + RLS)으로 읽는다.
// - service role 미사용. 계정 값은 db-helpers.ts 의 환경변수 로딩만 쓴다.
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { REAGENT_SLOT, projectIndex, type Role } from "./db-helpers";
import { openAs, type RolePage } from "./auth-state";
import { browserClient, routeOf, sel } from "./screen-helpers";
import { drawer, isDeskPage, waitDrawer } from "./desk-helpers";
import { seedReagents, seedSchoolOf, squash } from "./screen-3-helpers";

export const SCREEN = 4;
export const CARD = "reagent-detail-card";
export const TOAST = "ex-toast";

/** routes["4"] + ?reagent={id} */
export const usagePath = (id?: string) => (id === undefined ? routeOf(SCREEN) : `${routeOf(SCREEN)}?reagent=${encodeURIComponent(id)}`);

/** 이 역할 계정 학교의 seed 시약 (id 순 = db-helpers ownReagents 순서) */
export function seedOwnReagents(role: Role) {
  const school = seedSchoolOf(role);
  const own = seedReagents()
    .filter((r) => r.school_id === school.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (own.length === 0) throw new Error(`seed.sql 에 학교 ${school.name} 시약 없음`);
  return { school, own };
}

/**
 * 재고를 실제로 바꾸는 화면 4 기록 테스트용 시약 칸 (학교 A, 프로젝트별 1개).
 * db-r-roles 가 재고를 바꾸는 칸(recordUsage·studentStockAttempt, +프로젝트 번호)과 겹치지 않는 가장 앞 칸.
 * (ensureLog 칸은 학교 usage_logs 가 0행일 때만 쓰이며 usage_logs 는 삭제 불가라 이미 행이 있으면 동작하지 않는다)
 */
export function recordSlotIndexes(): number[] {
  const busy = new Set<number>();
  for (const base of [REAGENT_SLOT.recordUsage, REAGENT_SLOT.studentStockAttempt]) {
    busy.add(base);
    busy.add(base + 1);
  }
  const free: number[] = [];
  for (let i = 0; free.length < 2 && i < 64; i++) if (!busy.has(i)) free.push(i);
  return free;
}

export function recordReagentFor(info: TestInfo) {
  const { school, own } = seedOwnReagents("teacher");
  const idx = recordSlotIndexes()[projectIndex(info)];
  if (idx === undefined || idx >= own.length) {
    throw new Error(`학교 ${school.name} seed 시약 ${own.length}개로는 db 테스트와 겹치지 않는 기록용 칸(${idx})이 없음`);
  }
  return { school, reagent: own[idx], index: idx };
}

/** 사용 기록 화면이 그려질 때까지 (시약 지정 시 카드, 아니면 시약 선택 상자) + 하이드레이션 완료 */
export async function waitUsage(page: Page, withReagent: boolean): Promise<void> {
  if (isDeskPage(page)) {
    // 폭 1440 (d7 §23 run b 세부): 시약 목록 옆 오른쪽 detail-drawer — 시안 4-desktop 에 reagent-detail-card 없음 (시약명은 drawer-title 캡션)
    await waitDrawer(page);
    if (!withReagent) await expect(drawer(page).locator('button[aria-haspopup="listbox"]').first()).toBeVisible({ timeout: 30_000 });
  } else if (withReagent) await expect(page.locator(sel(CARD)).first()).toBeVisible({ timeout: 30_000 });
  else await expect(page.locator('main button[aria-haspopup="listbox"]').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("load");
  // React 가 폼에 이벤트 핸들러를 붙인 뒤에 입력·제출해야 한다 (하이드레이션 전 제출은 기본 GET 제출이 됨)
  await page.waitForFunction(
    () => {
      const f = document.querySelector("main form");
      return !!f && Object.keys(f).some((k) => k.startsWith("__reactProps"));
    },
    undefined,
    { timeout: 30_000 },
  );
}

const fmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

/** 카드 글자에 재고 {stock}{unit} 이 (앞자리 숫자 없이) 보이는지 */
export function cardShowsStock(cardText: string, stock: number, unit: string): boolean {
  const want = squash(`${fmt.format(stock)}${unit}`).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\d.])${want}`).test(squash(cardText));
}

/** 자기 세션(RLS)으로 시약 stock·unit 읽기 */
export async function dbStock(page: Page, id: string): Promise<{ stock: number; unit: string } | null> {
  const { client } = await browserClient(page);
  const { data, error } = await client.from("reagents").select("stock, unit").eq("id", id).maybeSingle();
  expect(error, "자기 세션 reagents 조회").toBeNull();
  return data ? { stock: Number(data.stock), unit: data.unit as string } : null;
}

export type LogRow = { id: string; user_id: string; school_id: string; reagent_id: string; amount: number };

/** 자기 세션(RLS)으로 이 시약의 usage_logs 행 */
export async function dbLogs(page: Page, reagentId: string): Promise<LogRow[]> {
  const { client } = await browserClient(page);
  const { data, error } = await client
    .from("usage_logs")
    .select("id, user_id, school_id, reagent_id, amount")
    .eq("reagent_id", reagentId);
  expect(error, "자기 세션 usage_logs 조회").toBeNull();
  return (data ?? []).map((r) => ({ ...(r as LogRow), amount: Number(r.amount) }));
}

/** 자기 세션 profiles.school_id */
export async function mySchoolId(page: Page): Promise<string> {
  const { client, userId } = await browserClient(page);
  const { data, error } = await client.from("profiles").select("school_id").eq("user_id", userId).single();
  expect(error, "자기 profiles 조회").toBeNull();
  return data!.school_id as string;
}

/** 교사 계정 세션 (stock 원복용). 화면 4 기본 경로로 열어 세션 쿠키만 쓴다 */
export async function openTeacher(browser: Browser, info: TestInfo): Promise<RolePage> {
  return openAs(browser, info, "teacher", SCREEN);
}

/** 교사 세션으로 stock 을 절대값으로 되돌리고 다시 읽어 확인 */
export async function restoreStockAs(teacherPage: Page, id: string, stock: number): Promise<void> {
  const { client } = await browserClient(teacherPage);
  const { data, error } = await client.from("reagents").update({ stock }).eq("id", id).select("stock");
  expect(error, "교사 세션 stock 원복").toBeNull();
  expect(data?.length, "교사 세션 stock 원복 1행").toBe(1);
  expect(Number(data![0].stock), "원복 후 stock").toBe(stock);
}

/** main 안 사용량 입력·제출 */
export const amountInput = (page: Page) => page.locator('main input[name="amount"]');
/** 저장 버튼: 폭 390 = 폼 안 / 폭 1440 = 드로어 아래 drawer-actions (form 속성으로 폼과 이어짐) */
export const submitButton = (page: Page) =>
  isDeskPage(page)
    ? drawer(page).locator(`button[type="submit"]${sel("button-primary")}`)
    : page.locator(`main form button[type="submit"]${sel("button-primary")}`);
/** 화면 4 본문 범위: 폭 390 = main / 폭 1440 = 드로어 (뒤 시약 목록은 화면 2 몫) */
export const usageScope = (page: Page) => (isDeskPage(page) ? drawer(page) : page.locator("main"));

/**
 * 고른 시약을 보여 주는 곳: 390 = reagent-detail-card / 1440 = 드로어 drawer-title(제목 "사용 기록" + 캡션 "시약명 · 현재 N 단위",
 * 시안 4-desktop — d7 §23 run b). 시약을 고르지 않았으면 둘 다 없다 (1440 은 drawer-head 만).
 */
export const reagentHead = (page: Page) => (isDeskPage(page) ? drawer(page).locator('[data-name="drawer-title"]') : page.locator(sel(CARD)));
