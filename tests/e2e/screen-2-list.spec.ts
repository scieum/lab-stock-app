// 화면 2 (시약 목록) 목록이 DB 와 일치하는지 (C1 — reagent-row · badge-low-stock 은 dev-rules components 상 화면 2 컴포넌트).
// DB 값은 그 계정의 브라우저 세션(publishable 키 + RLS)으로 읽는다. service role 미사용.
//  - 전체: reagent-row 수 = 자기 학교 reagents 수, 행 링크 = routes["3"] 의 [id] 를 시약 id 로 바꾼 경로 (집합 일치)
//  - 재고 부족(stock < min_stock) 행에만 badge-low-stock, 행 밖 badge-low-stock 0
//  - ?filter=low-stock: 부족 시약 행만 (id 집합 일치), 부족 0종이면 행 0
// 같은 실행의 R-db 테스트가 임시 시약을 넣었다 지우므로, 화면을 읽기 전·후 DB 가 같은 시점(스냅샷)끼리만 비교한다.
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserClient, browserSession, countComponent, routeOf, sel } from "./screen-helpers";

import { PAGE_SIZE, isDeskPage, pagination } from "./desk-helpers";
const SCREEN = 2;
const DETAIL_SCREEN = 3;
const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];
const ROW = "reagent-row";
const BADGE = "badge-low-stock";
const TABLE = "data-table";
const DESK_ROW = "ex-data-table-cell";

type DbReagent = { id: string; name: string; low: boolean };

const detailHref = (id: string) => routeOf(DETAIL_SCREEN).replace(/\[[^\]]+\]/, id);

async function waitList(page: Page): Promise<void> {
  await expect(page.locator(sel("segmented-control")).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("load");
}

async function dbReagents(page: Page): Promise<DbReagent[]> {
  const { client } = await browserClient(page);
  const { data, error } = await client.from("reagents").select("id, name, stock, min_stock");
  expect(error, "자기 학교 reagents 조회").toBeNull();
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    low: Number(r.stock) < Number(r.min_stock),
  }));
}

type ShownRow = { href: string | null; badges: number; text: string };

/** 화면의 시약 행: 390 = reagent-row(링크) / 1440 = data-table 행(대표 칸 링크, 쪽마다 — d7 §23 run b) */
const rowLocator = (page: Page) => (isDeskPage(page) ? page.locator(`main ${sel(TABLE)} ${sel(DESK_ROW)}`) : page.locator(sel(ROW)));

/** 1440: 모든 쪽의 표 행 (쪽을 넘기며 읽고 1쪽으로 돌아온다) */
async function readDeskRows(page: Page): Promise<ShownRow[]> {
  const out: ShownRow[] = [];
  const nav = pagination(page.locator("main"));
  const pages = (await nav.count()) === 0 ? 1 : Math.max(...(await nav.locator("button, a").allInnerTexts()).map((t) => Number(t.trim())).filter(Number.isFinite));
  for (let p = 1; p <= pages; p++) {
    if (pages > 1) {
      await nav.getByRole("button", { name: String(p), exact: true }).click();
      await expect(nav.locator('[aria-current="true"]'), `${p}쪽`).toHaveText(String(p));
    }
    const rows = rowLocator(page);
    const n = await rows.count();
    expect(n, `${p}쪽 행 ≤ 한 쪽 ${PAGE_SIZE}`).toBeLessThanOrEqual(PAGE_SIZE);
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const raw = await row.locator("a[data-row-link]").getAttribute("href");
      out.push({ href: raw === null ? null : new URL(raw, "http://x").pathname, badges: await row.locator(sel(BADGE)).count(), text: await row.innerText() });
    }
  }
  if (pages > 1) await nav.getByRole("button", { name: "1", exact: true }).click();
  return out;
}

/** 화면의 reagent-row 각각: 링크 경로 · 행 안 배지 수 · 글자 */
async function readRows(page: Page): Promise<ShownRow[]> {
  if (isDeskPage(page)) return readDeskRows(page);
  const rows = page.locator(sel(ROW));
  const out: ShownRow[] = [];
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const raw = await row.getAttribute("href");
    out.push({
      href: raw === null ? null : new URL(raw, "http://x").pathname,
      badges: await row.locator(sel(BADGE)).count(),
      text: await row.innerText(),
    });
  }
  return out;
}

const key = (db: DbReagent[]) => JSON.stringify([...db].sort((a, b) => a.id.localeCompare(b.id)));

/**
 * DB(자기 세션 RLS) 읽기 → 화면 열기 → DB 다시 읽기. 앞뒤 DB 가 같으면 그 스냅샷과 화면 행을 돌려준다.
 * 동시에 도는 다른 테스트가 행을 바꾸는 중이면 다시 연다 (끝내 안정되지 않으면 실패).
 */
async function snapshot(page: Page, url: string): Promise<{ db: DbReagent[]; rows: ShownRow[]; main: string }> {
  const lowOnly = url.includes("filter=low-stock");
  const ATTEMPTS = 5;
  let last: { db: DbReagent[]; rows: ShownRow[]; main: string } | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const before = await dbReagents(page);
    await page.goto(url);
    await waitList(page);
    const want = (lowOnly ? before.filter((r) => r.low) : before).map((r) => detailHref(r.id)).sort();
    await expect(rowLocator(page)).toHaveCount(isDeskPage(page) ? Math.min(PAGE_SIZE, want.length) : want.length, { timeout: 10_000 }).catch(() => undefined);
    // 1440: 하이드레이션 뒤 (모바일 사본이 빠진 뒤) 읽는다
    if (isDeskPage(page)) await expect(page.locator(sel(ROW)), "1440 reagent-row 0").toHaveCount(0, { timeout: 30_000 });
    const rows = await readRows(page);
    const main = await page.locator("main").innerText();
    const after = await dbReagents(page);
    if (key(before) !== key(after)) continue; // 읽는 사이 DB 가 바뀜 → 다시
    last = { db: after, rows, main };
    // 다른 테스트의 임시 시약이 읽기 전·후 사이에만 있었을 수 있어 행 집합이 다르면 다시 연다.
    // 마지막 시도 결과는 그대로 돌려줘 호출부가 엄격히 비교한다 (계속 다르면 실패).
    const got = rows.map((r) => r.href ?? "").sort();
    if (JSON.stringify(got) === JSON.stringify(want)) return last;
  }
  if (last) return last;
  throw new Error("자기 학교 reagents 가 계속 바뀌어 화면과 비교할 스냅샷을 얻지 못함");
}

for (const role of ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 시약 목록: 행 수·행 링크·${BADGE}(stock<min_stock 행만) 가 DB 와 일치`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitList(page);
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const { db, rows: shown } = await snapshot(page, routeOf(SCREEN));
      expect(db.length, "자기 학교 시약이 있어야 검사가 의미 있음 (seed.sql)").toBeGreaterThan(0);

      expect(shown.length, `${ROW} 수 = 자기 학교 reagents ${db.length}행`).toBe(db.length);

      const byHref = new Map(db.map((r) => [detailHref(r.id), r]));
      expect(shown.map((s) => s.href).sort(), "행 링크 = 시약 상세 경로 (DB id 집합)").toEqual([...byHref.keys()].sort());

      for (const s of shown) {
        const r = byHref.get(s.href ?? "")!;
        expect(s.text, `행 ${s.href} 에 시약명 ${r.name}`).toContain(r.name);
        expect(s.badges, `${r.name} (${r.low ? "부족" : "충분"}) 행 안 ${BADGE}`).toBe(r.low ? 1 : 0);
      }
      const lowN = db.filter((r) => r.low).length;
      if (isDeskPage(page)) {
        // 1440: 표는 쪽마다 — 모든 쪽 행의 배지 합 = 부족 수, 지금 쪽 화면 전체 배지 = 그 쪽 행 안 배지 (행 밖 배지 없음)
        expect(shown.reduce((a, s) => a + s.badges, 0), `모든 쪽 ${BADGE} = 부족 행 ${lowN}개`).toBe(lowN);
        const onPage = await rowLocator(page).locator(sel(BADGE)).count();
        expect(await countComponent(page, BADGE), `화면 전체 ${BADGE} = 표 행 안 배지 (행 밖 배지 없음)`).toBe(onPage);
      } else expect(await countComponent(page, BADGE), `화면 전체 ${BADGE} = 부족 행 ${lowN}개 (행 밖 배지 없음)`).toBe(lowN);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 시약 목록 ?filter=low-stock: 재고 부족 시약 행만 (DB 와 일치)`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      const { db, rows: shown, main: text } = await snapshot(page, `${routeOf(SCREEN)}?filter=low-stock`);
      expect(db.length, "자기 학교 시약이 있어야 검사가 의미 있음 (seed.sql)").toBeGreaterThan(0);
      const low = db.filter((r) => r.low);

      expect(shown.length, `부족 필터 ${ROW} 수 = 부족 ${low.length}종`).toBe(low.length);
      expect(shown.map((s) => s.href).sort(), "부족 필터 행 = 부족 시약 id 집합").toEqual(
        low.map((r) => detailHref(r.id)).sort(),
      );
      for (const s of shown) expect(s.badges, `부족 필터 행 ${s.href} 안 ${BADGE}`).toBe(1);

      for (const r of db.filter((x) => !x.low)) {
        if (low.some((l) => l.name.includes(r.name))) continue; // 부족 시약명의 부분 문자열이면 판정 불가
        expect(text, `부족 아닌 ${r.name} 은 부족 필터에 없음`).not.toContain(r.name);
      }
    } finally {
      await context.close();
    }
  });
}
