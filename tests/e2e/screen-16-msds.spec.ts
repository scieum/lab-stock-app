// 화면 16 MSDS 요약 — 로그인 (/msds/[id], dev-rules routes["16"] · route_auth 16 "로그인 후 · 모든 역할 (자기 학교 시약만)").
// 기준: harness/d7-data.md §22 · design/rules.json 1.21 msds_summary·screens_required 16·variants 16·tab_bar·never.N2 · design/frames/16-mobile.json.
// [C1][S16]  학생·교사·admin: 화면 3 "MSDS 보기" → /msds/{id} (같은 창) · ‹ "MSDS · {시약명}" · 뒤로 = 화면 3
//            공단 주소가 아닌 시약 → 16-no-summary (variants: 원문 보기만, href = msds_url, 새 창 noopener)
//            공단 상세 주소 시약 → 이 환경은 공단 키가 없어 16-fail (출처 줄 + ex-empty-state-card 문구 + 원문 보기)
//            화면 10 기록 상세 "MSDS 보기" → /msds/{id}?from=usage → 뒤로 = /usage · MSDS 없는 시약 → /reagents/{id}
//            누름 높이 · N2 금지어 0 · 화면 16 밖 컴포넌트 0
// [C2][S16]  390 tab-bar 1 · tab-item 4 · 활성 = 시안 "시약", 1440 = 0
// [R-ui][S16] rules.json roles 검사 (이 화면에 걸리는 것)
// [N1-ui][S16] 다른 학교(B)·학교 A·데모 학교 시약 id · 없는 id → 404 (이름·주소 미노출) · 비로그인 → /login
// [V1][S16]  test-results/v1-16-{mobile|desktop}.png · v1-16-no-summary-* · v1-16-fail-*
//
// 모든 데이터는 일회용 학교(일회용 admin·교사·학생)에 service role 로 만든 학교·계정 + 그 admin 세션으로 등록한 임시 시약.
// 실제 공단(KOSHA) 은 부르지 않는다: 이 서버에 KOSHA_MSDS_API_KEY 가 있으면 공단 주소 시약을 여는 테스트는 건너뛴다(실호출 금지).
// 공용 학교 A·B·데모 학교는 읽기만 (afterAll 에서 불변 확인). afterAll 에서 일회용 잔여 0.
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { anonClient, signIn } from "./db-helpers";
import { countComponent, roleChecks, routeOf, sel } from "./screen-helpers";
import { HAS_SERVICE, anonContext, clientFor, openTemp, type TempUser } from "./screen-8-helpers";
import { NO_RESIDUE_69, cleanup, makeSchool, sharedSnapshot, type Fx } from "./screen-6-9-helpers";
import { historyPath, modal, rowTarget, rows, waitHistory } from "./screen-10-helpers";
import { waitDetail } from "./screen-3-helpers";
import {
  EMPTY,
  ENTRY,
  FAIL_TEXT,
  FRAME,
  GHS,
  ORIGINAL,
  REQUIRED,
  SCREEN,
  SKELETON,
  SUMMARY,
  VARIANTS,
  allowedComponents,
  entryLink,
  expectHeader,
  expectNoN2,
  expectOriginal,
  expectTabBar,
  foreignOnPage,
  koshaUrl,
  msdsPath,
  originalLink,
  reagentPath,
  redPaint,
  visibleText,
  waitMsds,
  scope16,
  visibleBack,
} from "./screen-16-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const GROUP = "s16";
const TIMEOUT = 300_000;
const HAS_KOSHA_KEY = Boolean(process.env.KOSHA_MSDS_API_KEY?.trim());
const NO_REAL_CALL = "이 서버에 KOSHA_MSDS_API_KEY 가 있어 공단 주소 시약을 열면 실제 공단을 부른다 — 실호출 금지 (요약 성공은 단위·갤러리에서)";

const storageClasses = (JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;
const hex = () => randomBytes(3).toString("hex");

type R = { id: string; name: string; msds: string | null };
type S16Fx = Fx & { plain: R; kosha: R; none: R };

let fixtureCache: Promise<S16Fx> | null = null;
let before: string[] | null = null;

async function addReagent(f: Fx, tag: string, msds: string | null): Promise<R> {
  const name = `임시시약-${tag}-${hex()}`;
  const res = await f.prep.rpc("register_reagent", {
    p_name: name,
    p_storage_class: storageClasses[0],
    p_stock: 50,
    p_unit: "mL",
    p_intake_date: "2026-09-15",
    p_msds_url: msds,
  });
  expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as { id: string } | null;
  if (!row) throw new Error("준비: register_reagent 가 행을 돌려주지 않음");
  const back = await f.prep.from("reagents").select("id, name, msds_url").eq("id", row.id).single();
  expect(back.error).toBeNull();
  expect(back.data!.msds_url, `준비: ${tag} msds_url`).toBe(msds);
  return { id: row.id, name, msds };
}

async function fixture(info: TestInfo): Promise<S16Fx> {
  fixtureCache ??= (async () => {
    const f = await makeSchool(info, GROUP);
    // 직접 입력한 다른 주소 (.test = 실제로 풀리지 않는 도메인) · 공단 상세 주소 · MSDS 없음
    const plain = await addReagent(f, "직접주소", `https://msds-${hex()}.example.test/sheet.pdf`);
    const kosha = await addReagent(f, "공단", koshaUrl("000699"));
    const none = await addReagent(f, "없음", null);
    // 화면 10 기록 1건 (교사 세션)
    const used = await (await clientFor(f.teacher)).rpc("record_usage", { reagent_id: plain.id, amount: 1 });
    expect(used.error, `준비: 교사 record_usage (${used.error?.message})`).toBeNull();
    return { ...f, plain, kosha, none };
  })();
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·기록 잔여물").toEqual(NO_RESIDUE_69);
  if (before) expect(await sharedSnapshot(), "학교 A·B·데모의 시약·판매처가 그대로").toEqual(before);
});

const userOf = (f: S16Fx, role: "student" | "teacher" | "admin"): TempUser => (role === "admin" ? f.admin : f[role]);
const ROLE_KO = { student: "학생", teacher: "교사", admin: "admin" } as const;

async function counts(page: Page, names: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const n of names) out[n] = await countComponent(page, n);
  return out;
}

/** 상태별 컴포넌트: variants 16 의 그 상태 목록은 각각 ≥ 1, 요약 성공 컴포넌트(screens_required 중 그 상태에 없는 것)는 0 */
async function expectVariant(page: Page, state: "no-summary" | "fail", what: string): Promise<void> {
  const want = VARIANTS[state];
  expect(want, `rules.json variants 16 ${state}`).toBeTruthy();
  // 1440 = 드로어 안에서 센다 (16-no-summary · 16-fail-desktop 은 드로어 안 상태)
  const scope = scope16(page);
  for (const c of want) expect(await scope.locator(sel(c)).count(), `${what}: ${c} (variants ${state})`).toBeGreaterThanOrEqual(1);
  for (const c of REQUIRED.filter((x) => !want.includes(x))) expect(await scope.locator(sel(c)).count(), `${what}: 요약 성공 컴포넌트 ${c} 0`).toBe(0);
  expect(await countComponent(page, SKELETON), `${what}: 불러오는 중 끝 (${SKELETON} 0)`).toBe(0);
  const foreign = await foreignOnPage(page, allowedComponents());
  expect(foreign, `${what}: 화면 16(프레임 16-mobile · variants · components 16) 밖 컴포넌트 0`).toEqual({});
  const red = await redPaint(page);
  expect(red.outside, `${what}: GHS 빨강은 ghs-pictogram 밖에 없음`).toEqual([]);
}

// =====================================================================
test(`[C1][S${SCREEN}] 기대값 원본: routes 16 = /msds/[id] · screens_required 16 = ${REQUIRED.join("·")} · variants 16(no-summary·fail·loading) · 시안 제목·원문 보기 문구`, () => {
  expect(routeOf(SCREEN)).toMatch(/^\/msds\/\[[^\]]+\]$/);
  expect(REQUIRED).toEqual(expect.arrayContaining([SUMMARY, GHS, ORIGINAL]));
  expect(VARIANTS["no-summary"]).toEqual([ORIGINAL]);
  expect(VARIANTS.fail).toEqual(expect.arrayContaining([ORIGINAL, EMPTY]));
  expect(VARIANTS.loading).toEqual(expect.arrayContaining([SUMMARY, SKELETON]));
  expect(FRAME.title).toMatch(/^MSDS · /);
  expect(FRAME.original).not.toBe("");
  expect(FAIL_TEXT).not.toBe("");
});

for (const role of ["student", "teacher", "admin"] as const) {
  test(`[C1][C2][R-ui][S${SCREEN}] 일회용 ${ROLE_KO[role]}: 화면 3 "MSDS 보기" → ${routeOf(SCREEN)} (같은 창) · 16-no-summary(직접 입력 주소: ${VARIANTS["no-summary"]?.join("·")} 만 · href = msds_url · 새 창 noopener) · ‹ "MSDS · {시약명}" · 뒤로 = 화면 3 · 탭바 · 누름 높이 · N2 0`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const r = f.plain;
    const { context, page, viewport } = await openTemp(browser, info, userOf(f, role), reagentPath(r.id));
    try {
      await waitDetail(page);
      const link = entryLink(page);
      await expect(link, `화면 3 ${ENTRY} "MSDS 보기" 1`).toHaveCount(1);
      await expect(link, "화면 16 으로").toHaveAttribute("href", msdsPath(r.id));
      expect(await link.getAttribute("target"), "같은 창").toBeNull();
      await link.scrollIntoViewIfNeeded();
      await expect(async () => {
        if (new URL(page.url()).pathname !== msdsPath(r.id)) await link.click({ timeout: 3_000 });
        await page.waitForURL((u) => u.pathname === msdsPath(r.id), { timeout: 5_000 });
      }).toPass({ timeout: 30_000 });
      await waitMsds(page);
      expect(context.pages(), "새 창 없음").toHaveLength(1);

      await expectHeader(page, r.name, reagentPath(r.id), "16-no-summary", f.school.name);
      await expect(visibleText(page, FRAME.source), "직접 입력 주소: 공단 출처 줄 없음").toHaveCount(0);
      await expect(page.getByText(FAIL_TEXT), "실패 문구 없음").toHaveCount(0);
      await expectVariant(page, "no-summary", "16-no-summary");
      await expectOriginal(page, viewport, r.msds!, "16-no-summary");
      await expectTabBar(page, viewport, "16-no-summary");
      for (const c of roleChecks(SCREEN, role)) {
        const n = await countComponent(page, c.component);
        if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
        else expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
      }
      await expectNoN2(page, await page.request.get(msdsPath(r.id)), "16-no-summary");

      // 뒤로 → 화면 3
      const back = visibleBack(page);
      await back.click();
      await page.waitForURL((u) => u.pathname === reagentPath(r.id), { timeout: 30_000 });
      await waitDetail(page);
    } finally {
      await context.close();
    }
  });
}

test(`[C1][S${SCREEN}] 공단 상세 주소 시약 (일회용 학교): 이 환경은 공단 키 없음 → 16-fail: 출처 줄 "${FRAME.source}" · ${EMPTY} "${FAIL_TEXT}" · 원문 보기(href = 공단 주소) · 요약 0 · 응답 본문 N2 0`, async ({ browser }, info) => {
  test.skip(HAS_KOSHA_KEY, NO_REAL_CALL);
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  const r = f.kosha;
  const { context, page, viewport } = await openTemp(browser, info, f.teacher, reagentPath(r.id));
  try {
    await waitDetail(page);
    await expect(entryLink(page)).toHaveAttribute("href", msdsPath(r.id));
    const res = await page.goto(msdsPath(r.id));
    expect(res?.status(), "응답 200").toBe(200);
    await waitMsds(page);
    await expectHeader(page, r.name, reagentPath(r.id), "16-fail", f.school.name);
    await expect(visibleText(page, FRAME.source), "출처 줄 1").toHaveCount(1);
    const card = page.locator(sel(EMPTY));
    await expect(card, `${EMPTY} 1`).toHaveCount(1);
    await expect(card, `"${FAIL_TEXT}"`).toContainText(FAIL_TEXT);
    await expectVariant(page, "fail", "16-fail");
    await expectOriginal(page, viewport, r.msds!, "16-fail");
    const src = await visibleText(page, FRAME.source).boundingBox();
    const cb = await card.boundingBox();
    expect(cb!.y, "실패 카드는 출처 줄 아래").toBeGreaterThanOrEqual(src!.y + src!.height - 1);
    if (viewport === "desktop") {
      const ob = await originalLink(page).boundingBox();
      expect(ob!.y, "데스크톱: 원문 보기는 실패 카드 아래").toBeGreaterThanOrEqual(cb!.y + cb!.height - 1);
    }
    await expectTabBar(page, viewport, "16-fail");
    await expectNoN2(page, res, "16-fail");
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 일회용 학생: 화면 10 기록 상세 "MSDS 보기" → ${routeOf(SCREEN)}?from=usage (같은 창) → 뒤로 = ${routeOf(10)}`, async ({ browser }, info) => {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  const r = f.plain;
  const { context, page } = await openTemp(browser, info, f.student, historyPath({ q: r.name }));
  try {
    await waitHistory(page);
    const row = rows(page).filter({ hasText: r.name });
    await expect(row, "그 시약 기록 행").toHaveCount(1, { timeout: 30_000 });
    await expect(async () => {
      if ((await modal(page).count()) === 0) await rowTarget(page, row).click({ timeout: 3_000 });
      await expect(modal(page)).toHaveCount(1, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    const link = modal(page).locator(`${sel(ENTRY)} a`);
    await expect(link).toHaveCount(1);
    const want = `${msdsPath(r.id)}?from=usage`;
    await expect(link, "화면 16 (from=usage)").toHaveAttribute("href", want);
    expect(await link.getAttribute("target"), "같은 창").toBeNull();
    await link.click();
    await page.waitForURL((u) => u.pathname === msdsPath(r.id) && u.searchParams.get("from") === "usage", { timeout: 30_000 });
    await waitMsds(page);
    expect(context.pages(), "새 창 없음").toHaveLength(1);
    await expectHeader(page, r.name, routeOf(10), "화면 10 에서 온 16", f.school.name);
    await visibleBack(page).click();
    await page.waitForURL((u) => u.pathname === routeOf(10), { timeout: 30_000 });
    await waitHistory(page);
  } finally {
    await context.close();
  }
});

test(`[C1][S${SCREEN}] 일회용 admin: MSDS 없는 시약 → ${routeOf(SCREEN)} 는 화면 3(/reagents/{id}) 으로 · 화면 3 에 화면 16 링크 없음`, async ({ browser }, info) => {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  const r = f.none;
  const { context, page } = await openTemp(browser, info, f.admin, msdsPath(r.id));
  try {
    await page.waitForURL((u) => u.pathname === reagentPath(r.id), { timeout: 30_000 });
    await waitDetail(page);
    await expect(page.locator(`a[href^="${msdsPath(r.id)}"]`), "화면 16 링크 0").toHaveCount(0);
    expect(await countComponent(page, ORIGINAL), `${ORIGINAL} 0`).toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
/** 404 화면: 상태 404 · 그 시약 이름·MSDS 주소·요약 컴포넌트 없음 */
async function expect404(page: Page, path: string, hide: string[], what: string): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `${what}: 404`).toBe(404);
  expect(new URL(page.url()).pathname, `${what}: 다른 화면으로 보내지 않음`).toBe(path);
  const body = await page.locator("body").innerText();
  const html = (await res?.text()) ?? "";
  for (const h of hide.filter(Boolean)) {
    expect(body, `${what}: 화면에 "${h}" 없음`).not.toContain(h);
    expect(html, `${what}: 응답 본문에 "${h}" 없음`).not.toContain(h);
  }
  for (const c of [SUMMARY, ORIGINAL, GHS, SKELETON]) expect(await countComponent(page, c), `${what}: ${c} 0`).toBe(0);
}

test(`[N1-ui][S${SCREEN}] 일회용 교사: 다른 학교(B)·학교 A·데모 학교 시약 id · 없는 id · 형식이 틀린 id → 모두 404 (이름·MSDS 주소 미노출)`, async ({ browser }, info) => {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  const b = await signIn("schoolB");
  const bRows = await b.client.from("reagents").select("id, name, msds_url").limit(1);
  expect(bRows.error).toBeNull();
  expect(bRows.data ?? [], "학교 B 시약 (양성 대조)").toHaveLength(1);
  const a = await signIn("teacher");
  const aRows = await a.client.from("reagents").select("id, name, msds_url").not("msds_url", "is", null).limit(1);
  expect(aRows.error).toBeNull();
  expect(aRows.data ?? [], "학교 A 의 MSDS 있는 시약 (양성 대조)").toHaveLength(1);
  const demo = await anonClient().from("reagents").select("id, name, msds_url").not("msds_url", "is", null).limit(1);
  expect(demo.error).toBeNull();
  expect(demo.data ?? [], "데모 학교 MSDS 있는 시약").toHaveLength(1);
  const { context, page } = await openTemp(browser, info, f.teacher, msdsPath(f.plain.id));
  try {
    await waitMsds(page);
    expect(await originalLink(page).count(), "양성 대조: 자기 학교 시약은 보인다").toBe(1);
    const others = [
      { what: "학교 B 시약", row: bRows.data![0] },
      { what: "학교 A 시약", row: aRows.data![0] },
      { what: "데모 학교 시약", row: demo.data![0] },
    ];
    for (const o of others) {
      await expect404(page, msdsPath(o.row.id as string), [o.row.name as string, (o.row.msds_url as string | null) ?? ""], o.what);
    }
    await expect404(page, msdsPath("00000000-0000-4000-8000-000000000000"), [], "없는 id");
    await expect404(page, msdsPath("not-a-uuid"), [], "형식이 틀린 id");
  } finally {
    await context.close();
  }
});

test(`[N1-ui][S${SCREEN}] 비로그인: ${routeOf(SCREEN)} → ${routeOf(1)} (시약 이름·주소 미노출)`, async ({ browser }, info) => {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  const context = await anonContext(browser, info);
  try {
    const page = await context.newPage();
    const res = await page.goto(msdsPath(f.plain.id));
    await page.waitForURL((u) => u.pathname === routeOf(1), { timeout: 30_000 });
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(f.plain.name);
    expect((await res?.text()) ?? "").not.toContain(f.plain.msds!);
    expect(await countComponent(page, ORIGINAL)).toBe(0);
  } finally {
    await context.close();
  }
});

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
async function shot(browser: Browser, info: TestInfo, u: TempUser, path: string, file: string): Promise<void> {
  const { context, page, viewport } = await openTemp(browser, info, u, path);
  try {
    await waitMsds(page).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${file}-${viewport}.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

test(`[V1][S${SCREEN}] 화면 16 스크린샷: v1-16 (공단 주소 시약 — 이 환경은 키가 없어 실패 상태) · v1-16-no-summary · v1-16-fail`, async ({ browser }, info) => {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  await shot(browser, info, f.teacher, msdsPath(f.plain.id), "16-no-summary");
  if (!HAS_KOSHA_KEY) {
    await shot(browser, info, f.teacher, msdsPath(f.kosha.id), "16");
    await shot(browser, info, f.teacher, msdsPath(f.kosha.id), "16-fail");
  }
});
