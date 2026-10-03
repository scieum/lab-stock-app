// 둘러보기(비회원, /demo) 화면 13g·2g·3g 공용 도우미.
// - 기대값: design/rules.json guest·tab_bar·never.N1·roles, harness/dev-rules.json routes *-guest·viewports,
//   토스트 문구는 harness/d7-data.md §5 에서 읽는다 (숫자·문구를 테스트에 하드코딩하지 않는다).
// - 데이터 비교는 anon 클라이언트(publishable 키, 로그인 없음)로 실제 RLS 를 거쳐 읽는다. service role 미사용.
// - 브라우저 컨텍스트는 storageState 없이 연다 (비로그인).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Browser, type BrowserContext, type Page, type Response, type TestInfo } from "@playwright/test";
import { anonClient } from "./db-helpers";
import { devRules, rules, sel, type ViewportName } from "./screen-helpers";

export const GUEST = rules.guest;
export const TAB = rules.tab_bar;
export const N1 = rules.never.N1;

/** dev-rules.json routes["{screen}-guest"] */
export function guestRouteOf(screen: number): string {
  const r = devRules.routes[`${screen}-guest`];
  if (!r) throw new Error(`dev-rules.json routes 에 ${screen}-guest 없음`);
  return r;
}

/** routes["3-guest"] 의 [id] 를 실제 id 로 */
export const guestDetailPath = (id: string) => guestRouteOf(3).replace(/\[[^\]]+\]/, id);

/** 둘러보기 화면끼리 이동하는 경로 접두(dev-rules guest_screens 의 routes) */
export function guestRoutePrefixes(): string[] {
  return devRules.guest_screens.map((s) => guestRouteOf(s).replace(/\/\[[^\]]+\].*$/, ""));
}

/** harness/d7-data.md §5 — guest-lock 을 눌렀을 때의 ex-toast 문구 */
export function lockToastMessage(): string {
  const md = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
  const m = md.match(/ex-toast\s*["“]([^"”]+)["”]/);
  if (!m) throw new Error("harness/d7-data.md 에 ex-toast 문구 없음");
  return m[1];
}

function viewportOf(info: TestInfo): { name: ViewportName; width: number; height: number } {
  const name = info.project.name as ViewportName;
  const vp = devRules.viewports[name];
  if (!vp) throw new Error(`dev-rules.json viewports 에 '${name}' 없음`);
  return { name, width: vp[0], height: vp[1] };
}

export type GuestPage = { context: BrowserContext; page: Page; viewport: ViewportName; response: Response | null };

/** 비로그인 새 컨텍스트(프로젝트 viewport)로 경로를 연다 */
export async function openGuest(browser: Browser, info: TestInfo, path: string): Promise<GuestPage> {
  const baseURL = info.project.use.baseURL;
  if (!baseURL) throw new Error("playwright.config baseURL 없음");
  const vp = viewportOf(info);
  const context = await browser.newContext({ baseURL, viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const response = await page.goto(path);
  await page.waitForLoadState("load");
  return { context, page, viewport: vp.name, response };
}

/** 둘러보기 셸이 그려졌는지 (배너가 보일 때까지 — 빈 화면에서 0개를 세어 통과하지 않도록) */
export async function waitGuestShell(page: Page): Promise<void> {
  await expect(page.locator(sel(GUEST.banner)).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("load");
}

// ---------- anon 데모 데이터 ----------

export type DemoSchool = { id: string; name: string };

/** anon 이 보는 schools = 데모 학교 1행 (GM-db 가 보장; 여기서는 id·name 만 쓴다) */
export async function demoSchool(): Promise<DemoSchool> {
  const { data, error } = await anonClient().from("schools").select("id, name").eq("is_demo", true);
  expect(error, "anon schools(is_demo) 조회").toBeNull();
  expect(data ?? [], "anon 에 보이는 데모 학교 1행").toHaveLength(1);
  const s = data![0];
  expect(s.name, "데모 학교 이름 = rules.json guest.school_name").toBe(GUEST.school_name);
  return { id: s.id as string, name: s.name as string };
}

export type DemoReagent = { id: string; name: string; unit: string; stock: number; min_stock: number; low: boolean };

/** anon 이 보는 데모 reagents 전체 (RLS 로 데모 학교 행만; school_id 도 확인) */
export async function demoReagents(): Promise<DemoReagent[]> {
  const school = await demoSchool();
  const { data, error } = await anonClient().from("reagents").select("id, school_id, name, unit, stock, min_stock").order("name");
  expect(error, "anon reagents 조회").toBeNull();
  const rows = data ?? [];
  expect(rows.length, "데모 시약이 있어야 검사가 의미 있음 (demo seed)").toBeGreaterThan(0);
  expect(rows.filter((r) => r.school_id !== school.id), "anon reagents 는 전부 데모 학교 행").toHaveLength(0);
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    unit: r.unit as string,
    stock: Number(r.stock),
    min_stock: Number(r.min_stock),
    low: Number(r.stock) < Number(r.min_stock),
  }));
}

export type DemoDetail = DemoReagent & {
  cas_no: string | null;
  cabinet: string | null;
  shelf: number | null;
  storage_class: string | null;
};

/** anon 으로 데모 시약 1건 + 보관 칸·시약장 (없으면 null) */
export async function demoDetail(id: string): Promise<DemoDetail | null> {
  const { data, error } = await anonClient()
    .from("reagents")
    .select("id, name, cas_no, unit, stock, min_stock, slot:cabinet_slots(shelf, storage_class, cabinet:cabinets(label))")
    .eq("id", id)
    .maybeSingle();
  expect(error, "anon reagents 1건 조회").toBeNull();
  if (!data) return null;
  const slot = (Array.isArray(data.slot) ? data.slot[0] : data.slot) as
    | { shelf: number; storage_class: string; cabinet: { label: string } | { label: string }[] | null }
    | null;
  const cab = slot ? (Array.isArray(slot.cabinet) ? slot.cabinet[0] : slot.cabinet) : null;
  return {
    id: data.id as string,
    name: data.name as string,
    unit: data.unit as string,
    stock: Number(data.stock),
    min_stock: Number(data.min_stock),
    low: Number(data.stock) < Number(data.min_stock),
    cas_no: (data.cas_no as string | null) ?? null,
    cabinet: cab?.label ?? null,
    shelf: slot ? Number(slot.shelf) : null,
    storage_class: slot?.storage_class ?? null,
  };
}

// ---------- GM-ui 공용 검사 ----------

/** 배너 1개 · 그 안 button-primary(banner_cta) 1개 → routes["14"](회원가입) */
export async function checkBanner(page: Page): Promise<void> {
  const banner = page.locator(sel(GUEST.banner));
  await expect(banner, `${GUEST.banner} 1개`).toHaveCount(1);
  await expect(banner).toBeVisible();
  const cta = banner.locator(sel(GUEST.banner_cta));
  await expect(cta, `${GUEST.banner} 안 ${GUEST.banner_cta} 1개`).toHaveCount(1);
  await expect(cta).toBeVisible();
  const href = await cta.getAttribute("href");
  expect(href, "가입 버튼은 링크").not.toBeNull();
  const signup = devRules.routes[String(rules.never.N1.school_select_screen)];
  expect(signup, "dev-rules routes 에 회원가입 화면").toBeTruthy();
  expect(new URL(href!, "http://x").pathname, "가입 버튼 → 회원가입 경로").toBe(signup);
}

/** rules.json guest.hidden_components 전부 0 */
export async function checkHidden(page: Page): Promise<void> {
  expect(GUEST.hidden_components.length, "guest.hidden_components 항목").toBeGreaterThan(0);
  for (const name of GUEST.hidden_components) {
    expect(await page.locator(sel(name)).count(), `둘러보기에 ${name} 0개`).toBe(0);
  }
}

/** seed.sql schools 이름 (실제 학교) — 둘러보기에 노출되면 안 된다 */
export function realSchoolNames(): string[] {
  const sql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
  const m = sql.match(/insert into public\.schools\s*\(([^)]*)\)\s*values([\s\S]*?);/i);
  if (!m) throw new Error("seed.sql 에 schools insert 없음");
  const cols = m[1].split(",").map((c) => c.trim());
  const idx = cols.indexOf("name");
  const rows = [...m[2].matchAll(/\(([^()]*)\)/g)].map((r) => [...r[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
  const names = rows.map((r) => r[idx]).filter(Boolean);
  if (names.length === 0) throw new Error("seed.sql schools 이름 0개");
  return names;
}

/**
 * 학교명: 화면 글자(body)와 응답 본문(HTML·RSC) 모두
 *  - N1 패턴(…고등학교) 일치 = 0 (실제 학교명 없음), guest.school_name 표시 → 학교명 종류 = {guest.school_name} 하나
 *  - seed 실제 학교명 미노출
 */
export async function checkSchoolName(page: Page, html: string | null): Promise<void> {
  const body = await page.locator("body").innerText();
  const found = new Set<string>(body.match(new RegExp(N1.school_name_pattern, "g")) ?? []);
  if (body.includes(GUEST.school_name)) found.add(GUEST.school_name);
  expect([...found], "둘러보기 화면의 학교명 종류 = guest.school_name 하나").toEqual([GUEST.school_name]);
  expect([...found].length, "학교명 종류 수 = rules distinct_school_names").toBe(N1.distinct_school_names);
  for (const n of realSchoolNames()) {
    expect(body, `실제 학교명 ${n} 미노출 (화면)`).not.toContain(n);
    if (html !== null) expect(html, `실제 학교명 ${n} 미노출 (응답 본문)`).not.toContain(n);
  }
  if (html !== null) {
    const inHtml = new Set<string>(html.match(new RegExp(N1.school_name_pattern, "g")) ?? []);
    expect([...inHtml], "응답 본문에 …고등학교 형태 학교명 없음").toEqual([]);
  }
}

/**
 * 탭바 (rules.json tab_bar + guest): 390 = tab-bar 1·tab-item items 개·라벨 순서, 탭바 안 guest-lock = tab_locks 개,
 * 잠금이 붙은 탭 라벨 = locked_tabs, 잠기지 않은 탭 링크는 둘러보기 경로 안. 1440 = tab-bar 0.
 */
export async function checkTabBar(page: Page, viewport: ViewportName, screen: number): Promise<void> {
  const shown = viewport === "mobile" && TAB.mobile_screens.includes(screen);
  const bar = page.locator(sel(TAB.component));
  await expect(bar, `${viewport} ${TAB.component}`).toHaveCount(shown ? 1 : 0);
  await expect(page.locator(sel(TAB.item)), `${viewport} ${TAB.item}`).toHaveCount(shown ? TAB.items : 0);
  if (!shown) return;
  expect(TAB.labels.length, "rules.json tab_bar labels 수 = items").toBe(TAB.items);
  await expect(bar).toBeVisible();
  const items = bar.locator(sel(TAB.item));
  await expect(items, "tab-item 은 tab-bar 안에").toHaveCount(TAB.items);
  const labels = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  expect(labels, "탭 라벨 순서").toEqual(TAB.labels);

  await expect(bar.locator(sel(GUEST.lock)), `탭바 안 ${GUEST.lock} = guest.tab_locks`).toHaveCount(GUEST.tab_locks);
  expect(GUEST.locked_tabs.length, "guest.locked_tabs 수 = tab_locks").toBe(GUEST.tab_locks);
  const lockedItems = bar.locator(`${sel(TAB.item)}:has(${sel(GUEST.lock)})`);
  await expect(lockedItems, "잠금이 붙은 탭 수").toHaveCount(GUEST.tab_locks);
  const lockedLabels = (await lockedItems.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).sort();
  expect(lockedLabels, "잠금 탭 라벨 = guest.locked_tabs").toEqual([...GUEST.locked_tabs].sort());
  for (const label of GUEST.locked_tabs) {
    const locked = bar.locator(sel(TAB.item), { hasText: label }).first();
    expect(await locked.getAttribute("href"), `잠금 탭 ${label} 은 링크가 아님`).toBeNull();
  }
  // 잠기지 않은 탭은 둘러보기 경로로만 이동
  const prefixes = guestRoutePrefixes();
  const open = bar.locator(`${sel(TAB.item)}:not(:has(${sel(GUEST.lock)}))`);
  await expect(open, "잠기지 않은 탭 수").toHaveCount(TAB.items - GUEST.tab_locks);
  for (let i = 0; i < TAB.items - GUEST.tab_locks; i++) {
    const href = await open.nth(i).getAttribute("href");
    expect(href, `탭 ${i} 링크`).not.toBeNull();
    const path = new URL(href!, "http://x").pathname;
    expect(
      prefixes.some((p) => path === p || path.startsWith(p + "/")),
      `탭 링크 ${path} 는 둘러보기 경로(${prefixes.join("·")}) 안`,
    ).toBe(true);
  }
}

/** 보이는 잠금 호스트: guest-lock 을 품은 button (390 에서는 데스크톱 nav 잠금 링크가 숨김 → 보이는 것만) */
export async function visibleLockHosts(page: Page) {
  const all = page.locator(`button:has(${sel(GUEST.lock)})`);
  const n = await all.count();
  const out = [];
  for (let i = 0; i < n; i++) if (await all.nth(i).isVisible()) out.push(all.nth(i));
  return out;
}

/** guest-lock 이 button 밖(링크 등)에 붙은 것은 없어야 한다 — 모든 잠금은 토스트만 띄우는 button 안 */
export async function checkLocksAreButtons(page: Page): Promise<void> {
  const total = await page.locator(sel(GUEST.lock)).count();
  const inButtons = await page.locator(`button ${sel(GUEST.lock)}`).count();
  expect(inButtons, `${GUEST.lock} 전부 button 안 (링크·폼 아님)`).toBe(total);
  expect(await page.locator(`a:has(${sel(GUEST.lock)}), form:has(${sel(GUEST.lock)})`).count(), "링크·폼 안 잠금").toBe(0);
}

/**
 * 보이는 잠금 호스트를 하나씩 눌러: ex-toast(문구 = d7 §5) 표시 · 경로 유지 · non-GET 요청 0건.
 * 호스트가 0개면 호출부가 미리 ≥1 을 확인한다 (여기서도 0개면 실패).
 */
export async function clickAllLocks(page: Page): Promise<number> {
  const message = lockToastMessage();
  const writes: string[] = [];
  const onRequest = (r: { method(): string; url(): string }) => {
    if (r.method() !== "GET" && r.method() !== "HEAD") writes.push(`${r.method()} ${r.url()}`);
  };
  page.on("request", onRequest);
  const before = new URL(page.url()).pathname;
  const hosts = await visibleLockHosts(page);
  expect(hosts.length, "보이는 잠금 호스트 ≥1").toBeGreaterThan(0);
  const toast = page.locator(sel("ex-toast"));
  try {
    for (const host of hosts) {
      // 앞 클릭의 토스트가 아직 떠 있으면 사라질 때까지 (이 클릭이 토스트를 띄웠는지 구분)
      await expect(toast).toHaveCount(0, { timeout: 6_000 });
      await host.scrollIntoViewIfNeeded();
      await host.click();
      await expect(toast, "잠금 클릭 → ex-toast").toHaveCount(1, { timeout: 5_000 });
      await expect(toast).toBeVisible();
      await expect(toast).toContainText(message);
      expect(new URL(page.url()).pathname, "잠금 클릭 후 경로 유지").toBe(before);
    }
    await page.waitForTimeout(500);
    await page.waitForLoadState("load");
    expect(new URL(page.url()).pathname, "모든 잠금 클릭 후 경로 유지").toBe(before);
    expect(writes, "잠금 클릭으로 생긴 non-GET 요청").toEqual([]);
  } finally {
    page.off("request", onRequest);
  }
  return hosts.length;
}

/** 공백·천 단위 쉼표 제거 (재고 1,500 mL ↔ 1500mL 비교용) */
export const squash = (s: string) => s.replace(/[\s,]/g, "");
