// MSDS 찾기 AI 보조 — 화면 3 · 2 일괄 · 7 (harness/d7-data.md §20 "AI 보조" 행, 2026-10-08 사용자 결정).
// C1:
//   - 응답 searchedVia "ai" + searchedAs 가 원래 검색어와 다름 → 후보 시트 안내 줄 = d7 틀 "{원래 이름} → AI가 찾은 이름 {물질명}(CAS {번호})(으)로 찾았어요"
//     (CAS 없는 이름 차례면 "{원래 이름} → AI가 찾은 이름 {물질명}(으)로 찾았어요")
//   - searchedVia 없음 → 기존 문구 "{원래 이름} → {찾은 이름}(으)로 찾았어요" (AI 글자 없음)
//   - searchedVia "ai" 여도 searchedAs = 검색어 · 후보 0개 → 안내 줄 없음
// - 실제 안전보건공단·Gemini 호출 없음: /api/msds/search 응답을 가로챈다 (d7 §20 AI 보조 "자동 테스트는 Gemini 를 가로채 대체").
// - 화면 3 · 2 는 일회용 학교(service role 로 생성)의 시약만 쓰고 저장하지 않는다(쓰기 0). 화면 7 은 공용 학교 A 교사 — 폼만 채우고 저장하지 않는다.
// - afterAll: 일회용 계정·학교·시약 잔여 0, 학교 A·B·데모 시약장·칸·배치 스냅숏 그대로.
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { test, expect, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { routeOf, sel } from "./screen-helpers";
import { detailPath, waitDetail } from "./screen-3-helpers";
import { HAS_SERVICE, openTemp, service } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, prepReagent, purgeSchool, sharedCabinetSnapshot, watchActions, type S11Fixture } from "./screen-11-helpers";
import { SCREEN as S7, intakePath, registerForm, waitIntake } from "./screen-7-helpers";
import { API, BULK_START, MSDS_BULK_BANNER, MSDS_SEARCH, S20, SKIP, candidatesFor, exact, expectCandidates, expectNoN2Terms, radios, sheet } from "./msds-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "msdsai";
const BOOST = S20.split("\n").find((l) => l.startsWith("| 검색 보강")) ?? "";
const AI = S20.split("\n").find((l) => l.startsWith("| AI 보조")) ?? "";
/** d7 AI 안내 줄 틀 */
const AI_TEMPLATE = (/"(\{원래 이름\}[^"]*AI[^"]+찾았어요)"/.exec(AI) ?? [])[1] ?? "";
/** d7 검색 보강 안내 줄 틀 */
const NOTE_TEMPLATE = (/"(\{원래 이름\}[^"]+찾았어요)"/.exec(BOOST) ?? [])[1] ?? "";
const NOTE_TAIL = NOTE_TEMPLATE.replace(/^.*\(으\)로\s*/, ""); // "찾았어요"
/** d7 사용자 보고 값 */
const KOSHA_NAME = (/"(염화수소)"/.exec(BOOST) ?? [])[1] ?? "";
const HCL_CAS = (/"염화수소"\((\d+-\d+-\d)\)/.exec(BOOST) ?? [])[1] ?? "";
const REPORT_QUERY = (/"(묽은 염산)"/.exec(BOOST) ?? [])[1] ?? "";
const FOUND_CAS = `${KOSHA_NAME}(CAS ${HCL_CAS})`;

/** 받침(ㄹ 제외) → 으로, 아니면 로 (테스트 쪽 독립 계산) */
function ro(word: string): string {
  const code = word.slice(-1).charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "(으)로";
  const jong = code % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}
/** AI 차례 CAS 검색 결과 안내 줄 */
const aiNote = (orig: string, name: string, cas: string) =>
  AI_TEMPLATE.replace("{원래 이름}", orig).replace("{물질명}", name).replace("{번호}", cas).replace("(으)로", ro(name));
/** AI 차례 국문명 검색 결과 안내 줄 (CAS 없음) */
const aiNoteNoCas = (orig: string, name: string) => AI_TEMPLATE.replace("{원래 이름}", orig).replace("{물질명}(CAS {번호})(으)로", `${name}${ro(name)}`);
/** 기존 안내 줄 */
const plainNote = (orig: string, found: string, particleOf = found) =>
  NOTE_TEMPLATE.replace("{원래 이름}", orig).replace("{찾은 이름}(으)로", `${found}${ro(particleOf)}`);
const nameOf = (tail: string) => `임시${randomBytes(3).toString("hex")}${tail}`;

type Call = { q: string; cas: string | null };
type Reply = { status?: number; body: unknown };
async function intercept(page: Page, reply: (c: Call) => Reply): Promise<Call[]> {
  const calls: Call[] = [];
  await page.route(
    (u) => u.pathname === API,
    async (route: Route) => {
      const sp = new URL(route.request().url()).searchParams;
      const c = { q: sp.get("q") ?? "", cas: sp.get("cas") };
      calls.push(c);
      const r = reply(c);
      await route.fulfill({ status: r.status ?? 200, contentType: "application/json", body: JSON.stringify(r.body) });
    },
  );
  return calls;
}
/** 시트 안 안내 줄 ("… 찾았어요") */
const notes = (s: Locator) => s.getByText(new RegExp(`${NOTE_TAIL}\\s*$`));
const searchBox = (s: Locator) => s.getByRole("searchbox");

async function hydrated(scope: Locator): Promise<void> {
  await expect
    .poll(() => scope.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "하이드레이션", timeout: 30_000 })
    .toBe(true);
}

// =====================================================================
// 일회용 학교
// =====================================================================
let before: string[] | null = null;
let fixtureCache: Promise<S11Fixture> | null = null;
function fixture(info: TestInfo): Promise<S11Fixture> {
  fixtureCache ??= makeFixture(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}
async function fresh(info: TestInfo): Promise<S11Fixture> {
  test.setTimeout(420_000);
  const f = await fixture(info);
  await purgeSchool(f.school.id);
  return f;
}
async function prep(f: S11Fixture, tail: string, cas: string | null): Promise<{ id: string; name: string }> {
  const r = await prepReagent(f, tail, 3, "병", undefined, nameOf(tail));
  if (cas) {
    const u = await service().from("reagents").update({ cas_no: cas }).eq("id", r.id).eq("school_id", f.school.id).select("id");
    expect(u.error, `준비: cas_no (${u.error?.message})`).toBeNull();
    expect(u.data ?? []).toHaveLength(1);
  }
  return { id: r.id, name: r.name };
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedCabinetSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약 잔여물").toEqual(NO_S11_RESIDUE);
  if (before) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치가 그대로").toEqual(before);
});

test("[C1][S*] 전제: d7 §20 AI 보조 안내 줄 틀 · 검색 보강 틀 · 사용자 보고 값", () => {
  expect(AI.length, "d7 §20 AI 보조 행").toBeGreaterThan(0);
  for (const k of ["{원래 이름}", "{물질명}", "{번호}", "(으)로", "AI"]) expect(AI_TEMPLATE, `AI 틀에 ${k}`).toContain(k);
  expect(NOTE_TAIL.length).toBeGreaterThan(0);
  expect([KOSHA_NAME, HCL_CAS, REPORT_QUERY].every((x) => x.length > 0)).toBe(true);
  expect(aiNote(REPORT_QUERY, KOSHA_NAME, HCL_CAS)).toBe(`${REPORT_QUERY} → AI가 찾은 이름 ${KOSHA_NAME}(CAS ${HCL_CAS})로 ${NOTE_TAIL}`);
  expect(aiNoteNoCas("x", "수산화나트륨")).toBe(`x → AI가 찾은 이름 수산화나트륨으로 ${NOTE_TAIL}`);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

  test(`[C1][S3] 일회용 교사 "MSDS 찾기": 응답 searchedVia "ai" + searchedAs "${FOUND_CAS}" → 안내 줄 "{시약 이름} → AI가 찾은 이름 ${FOUND_CAS}${ro(KOSHA_NAME)} ${NOTE_TAIL}" 1줄 / AI 이름 차례 → CAS 없는 AI 문구 / searchedVia 없음 → 기존 문구(AI 글자 없음) / searchedVia "ai" 여도 searchedAs = 검색어 · 후보 0개 → 없음 · 쓰기 0`, async ({ browser }, info) => {
    const f = await fresh(info);
    const a = await prep(f, "이상한 염산", null);
    const { context, page, viewport } = await openTemp(browser, info, f.teacher, detailPath(a.id));
    const actions = watchActions(page);
    try {
      const q2 = nameOf("AI이름");
      const q3 = nameOf("보통");
      const q4 = nameOf("같음");
      const q5 = nameOf("영개");
      const calls = await intercept(page, (c) => {
        if (c.q === a.name) return { body: { candidates: candidatesFor(c.q), searchedAs: FOUND_CAS, searchedVia: "ai" } };
        if (c.q === q2) return { body: { candidates: candidatesFor(c.q), searchedAs: "수산화나트륨", searchedVia: "ai" } };
        if (c.q === q3) return { body: { candidates: candidatesFor(c.q), searchedAs: FOUND_CAS } };
        if (c.q === q4) return { body: { candidates: candidatesFor(c.q), searchedAs: c.q, searchedVia: "ai" } };
        if (c.q === q5) return { body: { candidates: [], searchedAs: KOSHA_NAME, searchedVia: "ai" } };
        return { body: { candidates: candidatesFor(c.q), searchedAs: c.q } };
      });
      await waitDetail(page);
      const find = page.locator(`main ${sel(MSDS_SEARCH)}`).first();
      await hydrated(find);
      await find.click();
      const s = sheet(page);
      await expectCandidates(s, candidatesFor(a.name), "처음 찾기");
      expect(calls[0].q).toBe(a.name);
      const want = aiNote(a.name, KOSHA_NAME, HCL_CAS);
      await expect(s.getByText(want, { exact: true }), `AI 안내 줄 "${want}" (d7 틀)`).toBeVisible();
      await expect(notes(s), "안내 줄 1").toHaveCount(1);
      await expectNoN2Terms(page, "AI 안내 줄");
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-3-msds-ai-${viewport}.png`) });

      const box = searchBox(s);
      await expect(box, "화면 3 시트 검색 상자").toHaveCount(1);

      // AI 이름 차례 (CAS 없음)
      await box.fill(q2);
      await box.press("Enter");
      await expectCandidates(s, candidatesFor(q2), "AI 이름 차례");
      await expect(s.getByText(aiNoteNoCas(q2, "수산화나트륨"), { exact: true }), `"${aiNoteNoCas(q2, "수산화나트륨")}"`).toBeVisible();
      await expect(notes(s)).toHaveCount(1);

      // searchedVia 없음 → 기존 문구
      await box.fill(q3);
      await box.press("Enter");
      await expectCandidates(s, candidatesFor(q3), "보통 차례");
      await expect(s.getByText(plainNote(q3, FOUND_CAS, KOSHA_NAME), { exact: true }), `기존 문구 "${plainNote(q3, FOUND_CAS, KOSHA_NAME)}"`).toBeVisible();
      await expect(notes(s)).toHaveCount(1);
      await expect(notes(s), "AI 글자 없음").not.toContainText("AI");

      // searchedVia "ai" + searchedAs = 검색어 → 없음
      await box.fill(q4);
      await box.press("Enter");
      await expectCandidates(s, candidatesFor(q4), "같은 이름");
      await expect(notes(s), "searchedAs = 검색어 → 없음").toHaveCount(0);

      // searchedVia "ai" + 후보 0개 → 없음
      await box.fill(q5);
      await box.press("Enter");
      await expect(radios(s)).toHaveCount(0, { timeout: 15_000 });
      await expect(s.getByRole("button", { name: /직접 입력/ }), "0개 표시").toBeVisible({ timeout: 15_000 });
      await expect(notes(s), "후보 0개 → 없음").toHaveCount(0);
      await expect(s.getByText(/AI가 찾은/), "AI 글자 없음").toHaveCount(0);

      expect(calls.map((c) => c.q)).toEqual([a.name, q2, q3, q4, q5]);
      expect(actions.count(), "찾기만 — 쓰기 0").toBe(0);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S2] 일회용 교사 ?nomsds=1 일괄 찾기: searchedVia "ai" 응답 → "{시약 이름} → AI가 찾은 이름 ${FOUND_CAS}${ro(KOSHA_NAME)} ${NOTE_TAIL}" / searchedVia 없는 다른 시약 → 기존 문구 · 쓰기 0`, async ({ browser }, info) => {
    const f = await fresh(info);
    const odd = await prep(f, "이상한 염산", null);
    const plain = await prep(f, "묽은 염산", HCL_CAS);
    const { context, page, viewport } = await openTemp(browser, info, f.teacher, `${routeOf(2)}?nomsds=1`);
    const actions = watchActions(page);
    try {
      const calls = await intercept(page, (c) => ({
        body: c.q === odd.name ? { candidates: candidatesFor(c.q), searchedAs: FOUND_CAS, searchedVia: "ai" } : { candidates: candidatesFor(c.q), searchedAs: FOUND_CAS },
      }));
      await expect(page.locator(sel("segmented-control")).first()).toBeVisible({ timeout: 30_000 });
      const banner = page.locator(sel(MSDS_BULK_BANNER));
      await expect(banner).toHaveCount(1);
      const start = banner.getByRole("button", { name: exact(BULK_START) });
      await hydrated(start);
      await start.click();
      const s = sheet(page);
      const seen: string[] = [];
      for (let i = 0; i < 2; i++) {
        await expect(radios(s)).toHaveCount(3, { timeout: 15_000 });
        await expect.poll(() => calls.length).toBe(i + 1);
        const c = calls[i];
        seen.push(c.q);
        await expectCandidates(s, candidatesFor(c.q), `${i + 1}번째`);
        if (c.q === odd.name) {
          const want = aiNote(odd.name, KOSHA_NAME, HCL_CAS);
          await expect(s.getByText(want, { exact: true }), `AI 안내 줄 "${want}"`).toBeVisible();
          await expect(notes(s)).toHaveCount(1);
          await page.screenshot({ path: join(process.cwd(), "test-results", `v1-2-msds-ai-${viewport}.png`) });
        } else {
          expect(c.q).toBe(plain.name);
          const want = plainNote(plain.name, FOUND_CAS, KOSHA_NAME);
          await expect(s.getByText(want, { exact: true }), `기존 문구 "${want}"`).toBeVisible();
          await expect(notes(s)).toHaveCount(1);
          await expect(notes(s), "AI 글자 없음").not.toContainText("AI");
        }
        if (i === 0) await s.getByRole("button", { name: exact(SKIP) }).click();
      }
      await s.getByRole("button", { name: exact("닫기") }).click();
      await expect(s).toHaveCount(0);
      expect(seen.sort()).toEqual([odd.name, plain.name].sort());
      expect(actions.count(), "건너뛰기·닫기 — 쓰기 0").toBe(0);
    } finally {
      await context.close();
    }
  });
});

// =====================================================================
// 화면 7 (공용 학교 A 교사 — 저장 안 함)
// =====================================================================
test(`[C1][S${S7}] 교사 새 시약 등록 "MSDS 찾기": searchedVia "ai" → "${REPORT_QUERY} → AI가 찾은 이름 ${FOUND_CAS}${ro(KOSHA_NAME)} ${NOTE_TAIL}" / searchedVia 없음 → 기존 문구 / "ai" + 후보 0개 → 없음 · 쓰기 0`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", S7, intakePath({ tab: "register" }));
  const actions = watchActions(page);
  try {
    await waitIntake(page, "register");
    let mode: "ai" | "plain" | "empty" = "ai";
    const calls = await intercept(page, (c) => {
      if (mode === "ai") return { body: { candidates: candidatesFor(c.q), searchedAs: FOUND_CAS, searchedVia: "ai" } };
      if (mode === "plain") return { body: { candidates: candidatesFor(c.q), searchedAs: FOUND_CAS } };
      return { body: { candidates: [], searchedAs: FOUND_CAS, searchedVia: "ai" } };
    });
    const form = registerForm(page);
    const name = form.getByRole("textbox", { name: /시약명/ }).first();
    const find = form.locator(sel(MSDS_SEARCH));
    await name.fill(REPORT_QUERY);
    await expect(find).toBeEnabled();
    await find.click();
    const s = sheet(page);
    await expectCandidates(s, candidatesFor(REPORT_QUERY), "화면 7 AI");
    expect(calls[0]).toEqual({ q: REPORT_QUERY, cas: null });
    const want = aiNote(REPORT_QUERY, KOSHA_NAME, HCL_CAS);
    await expect(s.getByText(want, { exact: true }), `AI 안내 줄 "${want}" (d7 틀)`).toBeVisible();
    await expect(notes(s)).toHaveCount(1);
    await expectNoN2Terms(page, "화면 7 AI 안내 줄");
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-7-msds-ai-${viewport}.png`) });
    await s.getByRole("button", { name: exact("닫기") }).click();
    await expect(s).toHaveCount(0);

    mode = "plain";
    await find.click();
    await expectCandidates(sheet(page), candidatesFor(REPORT_QUERY), "화면 7 보통");
    const plain = plainNote(REPORT_QUERY, FOUND_CAS, KOSHA_NAME);
    await expect(sheet(page).getByText(plain, { exact: true }), `기존 문구 "${plain}"`).toBeVisible();
    await expect(notes(sheet(page)), "AI 글자 없음").not.toContainText("AI");
    await sheet(page).getByRole("button", { name: exact("닫기") }).click();
    await expect(sheet(page)).toHaveCount(0);

    mode = "empty";
    await find.click();
    await expect(sheet(page).getByRole("button", { name: /직접 입력/ }), "0개 표시").toBeVisible({ timeout: 15_000 });
    await expect(radios(sheet(page))).toHaveCount(0);
    await expect(notes(sheet(page)), "후보 0개 → 없음").toHaveCount(0);
    await sheet(page).getByRole("button", { name: exact("닫기") }).click();
    expect(calls).toHaveLength(3);
    expect(actions.count(), "저장하지 않음 — 쓰기 0").toBe(0);
  } finally {
    await context.close();
  }
});
