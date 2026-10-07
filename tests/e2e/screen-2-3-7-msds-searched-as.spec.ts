// MSDS 찾기 검색 보강 — 화면 3 · 2 일괄 · 7 (harness/d7-data.md §20 "검색 보강" 행, 2026-10-08 사용자 보고 "묽은 염산" 0건).
// C1:
//   - 응답 searchedAs 가 원래 검색어와 다르면 후보 시트에 한 줄 "{원래 이름} → {찾은 이름}(으)로 찾았어요" (d7 문구 틀) · 같거나 없거나 후보 0개면 없음
//   - 화면 3 · 2 일괄은 시약의 cas_no 를 cas 로 넘긴다 (cas_no 없으면 cas 없음) · 화면 3 검색 상자에서 이름을 바꿔 찾으면 cas 없음 · 화면 7 은 이름만
// - 실제 안전보건공단 호출 없음: /api/msds/search 응답을 가로챈다 (d7 §20 테스트 줄).
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

const GROUP = "msdsnote";
const BOOST = S20.split("\n").find((l) => l.startsWith("| 검색 보강")) ?? "";
/** d7 안내 줄 틀 "{원래 이름} → {찾은 이름}(으)로 찾았어요" */
const NOTE_TEMPLATE = (/"(\{원래 이름\}[^"]+찾았어요)"/.exec(BOOST) ?? [])[1] ?? "";
const NOTE_TAIL = NOTE_TEMPLATE.replace(/^.*\(으\)로\s*/, ""); // "찾았어요"
/** d7 사용자 보고 값 */
const KOSHA_NAME = (/"(염화수소)"/.exec(BOOST) ?? [])[1] ?? "";
const HCL_CAS = (/"염화수소"\((\d+-\d+-\d)\)/.exec(BOOST) ?? [])[1] ?? "";
const REPORT_QUERY = (/"(묽은 염산)"/.exec(BOOST) ?? [])[1] ?? "";
const OTHER_CAS = "64-17-5";

/** 받침(ㄹ 제외) → 으로, 아니면 로 (테스트 쪽 독립 계산) */
function ro(word: string): string {
  const code = word.slice(-1).charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "(으)로";
  const jong = code % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}
const noteText = (orig: string, found: string) => NOTE_TEMPLATE.replace("{원래 이름}", orig).replace("{찾은 이름}(으)로", `${found}${ro(found)}`);
const nameOf = (tail: string) => `임시${randomBytes(3).toString("hex")}${tail}`;

type Call = { q: string; cas: string | null };
type Reply = { status?: number; body: unknown };
/** /api/msds/search 가로채기 — q · cas 모두 기록 */
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

test("[C1][S*] 전제: d7 §20 검색 보강 문구 틀 · 사용자 보고 값", () => {
  expect(NOTE_TEMPLATE).toContain("{원래 이름}");
  expect(NOTE_TEMPLATE).toContain("→");
  expect(NOTE_TAIL.length).toBeGreaterThan(0);
  expect([KOSHA_NAME, HCL_CAS, REPORT_QUERY].every((x) => x.length > 0)).toBe(true);
  expect(noteText(REPORT_QUERY, KOSHA_NAME)).toBe(`${REPORT_QUERY} → ${KOSHA_NAME}로 ${NOTE_TAIL}`);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

  test(`[C1][S3] 일회용 교사 CAS 있는 시약 "MSDS 찾기": 요청 cas = 시약 cas_no · 응답 searchedAs "${KOSHA_NAME}" → 시트에 "{시약 이름} → ${KOSHA_NAME}${ro(KOSHA_NAME)} ${NOTE_TAIL}" 1줄 / 검색 상자에서 이름을 바꿔 찾으면 cas 없음 · searchedAs = 검색어 → 안내 줄 없음 / 다른 이름으로 찾았으면 그 이름 안내 / 쓰기 0`, async ({ browser }, info) => {
    const f = await fresh(info);
    const a = await prep(f, "묽은 염산", HCL_CAS);
    const { context, page, viewport } = await openTemp(browser, info, f.teacher, detailPath(a.id));
    const actions = watchActions(page);
    try {
      const calls = await intercept(page, (c) => {
        if (c.q === a.name) return { body: { candidates: candidatesFor(c.q), searchedAs: KOSHA_NAME } };
        if (c.q === KOSHA_NAME) return { body: { candidates: candidatesFor(c.q), searchedAs: KOSHA_NAME } };
        if (c.q === `${REPORT_QUERY} 0.1M`) return { body: { candidates: candidatesFor(c.q), searchedAs: "염산" } };
        return { body: { candidates: candidatesFor(c.q), searchedAs: c.q } };
      });
      await waitDetail(page);
      const find = page.locator(`main ${sel(MSDS_SEARCH)}`).first();
      await hydrated(find);
      await find.click();
      const s = sheet(page);
      await expectCandidates(s, candidatesFor(a.name), "처음 찾기");
      expect(calls, "처음 찾기: q = 시약 이름 · cas = 시약 cas_no").toEqual([{ q: a.name, cas: HCL_CAS }]);
      await expect(s.getByText(noteText(a.name, KOSHA_NAME), { exact: true }), "안내 줄 문구 (d7 틀)").toBeVisible();
      await expect(notes(s), "안내 줄 1").toHaveCount(1);
      await expectNoN2Terms(page, "안내 줄");
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-3-msds-searched-as-${viewport}.png`) });

      // 검색 상자에서 이름을 바꿔 찾기 → cas 없음 · searchedAs = 검색어 → 안내 줄 없음
      const box = searchBox(s);
      await expect(box, "화면 3 시트 검색 상자").toHaveCount(1);
      await box.fill(KOSHA_NAME);
      await box.press("Enter");
      await expectCandidates(s, candidatesFor(KOSHA_NAME), "이름 바꿔 찾기");
      expect(calls[1], "이름을 바꾸면 cas 없음").toEqual({ q: KOSHA_NAME, cas: null });
      await expect(notes(s), "searchedAs = 검색어 → 안내 줄 없음").toHaveCount(0);

      // 다른 이름 → 정리한 이름으로 찾았다는 응답 → "{검색어} → 염산으로 …"
      const q2 = `${REPORT_QUERY} 0.1M`;
      await box.fill(q2);
      await box.press("Enter");
      await expectCandidates(s, candidatesFor(q2), "정리한 이름");
      expect(calls[2]).toEqual({ q: q2, cas: null });
      await expect(s.getByText(noteText(q2, "염산"), { exact: true }), `"${noteText(q2, "염산")}"`).toBeVisible();
      await expect(notes(s)).toHaveCount(1);
      expect(actions.count(), "찾기만 — 쓰기 0").toBe(0);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S3] 일회용 교사 안내 줄 조건: searchedAs "CAS {시약 CAS}" → CAS 를 담은 "… ${NOTE_TAIL}" / searchedAs 없음 · 후보 0개 → 안내 줄 없음 / CAS 없는 시약 → 요청에 cas 없음 · CAS 꼴 검색어를 그대로 찾았으면 없음`, async ({ browser }, info) => {
    const f = await fresh(info);
    const withCas = await prep(f, "에탄올 특급", OTHER_CAS);
    const noCas = await prep(f, "질산은 용액", null);
    const { context, page } = await openTemp(browser, info, f.teacher, detailPath(withCas.id));
    const actions = watchActions(page);
    try {
      let mode: "cas" | "none" | "empty" = "cas";
      const calls = await intercept(page, (c) => {
        if (/^\d+-\d+-\d$/.test(c.q)) return { body: { candidates: candidatesFor(c.q), searchedAs: `CAS ${c.q}` } };
        if (mode === "cas") return { body: { candidates: candidatesFor(c.q), searchedAs: `CAS ${OTHER_CAS}` } };
        if (mode === "none") return { body: { candidates: candidatesFor(c.q) } };
        return { body: { candidates: [], searchedAs: "다른이름" } };
      });
      await waitDetail(page);
      let find = page.locator(`main ${sel(MSDS_SEARCH)}`).first();
      await hydrated(find);
      await find.click();
      let s = sheet(page);
      await expectCandidates(s, candidatesFor(withCas.name), "CAS 로 찾음");
      expect(calls[0]).toEqual({ q: withCas.name, cas: OTHER_CAS });
      const casNote = notes(s);
      await expect(casNote, "CAS 안내 줄 1").toHaveCount(1);
      await expect(casNote).toContainText(`CAS ${OTHER_CAS}`);
      await expect(casNote, "64-17-5 (오) → 로").toHaveText(new RegExp(`CAS ${OTHER_CAS}\\s?로 ${NOTE_TAIL}$`));

      // CAS 꼴 검색어를 그대로 찾음 → 없음
      await searchBox(s).fill(OTHER_CAS);
      await searchBox(s).press("Enter");
      await expectCandidates(s, candidatesFor(OTHER_CAS), "CAS 검색어");
      await expect(notes(s), "검색어 CAS = 찾은 CAS → 없음").toHaveCount(0);
      await s.getByRole("button", { name: exact("닫기") }).click();
      await expect(s).toHaveCount(0);

      // CAS 없는 시약: cas 없음 · searchedAs 없음 → 없음
      mode = "none";
      await page.goto(detailPath(noCas.id));
      await waitDetail(page);
      find = page.locator(`main ${sel(MSDS_SEARCH)}`).first();
      await hydrated(find);
      await find.click();
      s = sheet(page);
      await expectCandidates(s, candidatesFor(noCas.name), "CAS 없는 시약");
      expect(calls[calls.length - 1], "cas_no 없음 → 요청에 cas 없음").toEqual({ q: noCas.name, cas: null });
      await expect(notes(s), "searchedAs 없음 → 없음").toHaveCount(0);

      // 후보 0개 (searchedAs 가 달라도) → 없음
      mode = "empty";
      await searchBox(s).fill(`${noCas.name}x`);
      await searchBox(s).press("Enter");
      await expect(radios(s)).toHaveCount(0, { timeout: 15_000 });
      await expect(s.getByRole("button", { name: /직접 입력/ }), "0개 표시").toBeVisible({ timeout: 15_000 });
      await expect(notes(s), "후보 0개 → 없음").toHaveCount(0);
      expect(actions.count(), "쓰기 0").toBe(0);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S2] 일회용 교사 ?nomsds=1 일괄 찾기: 시약마다 요청 cas = 그 시약 cas_no (없으면 cas 없음) · searchedAs "${KOSHA_NAME}" → "{시약 이름} → ${KOSHA_NAME}${ro(KOSHA_NAME)} ${NOTE_TAIL}" / searchedAs = 시약 이름 → 안내 줄 없음 · 쓰기 0`, async ({ browser }, info) => {
    const f = await fresh(info);
    const hcl = await prep(f, "묽은 염산", HCL_CAS);
    const plain = await prep(f, "아세톤", null);
    const casOf = new Map([
      [hcl.name, HCL_CAS],
      [plain.name, null],
    ]);
    const { context, page, viewport } = await openTemp(browser, info, f.teacher, `${routeOf(2)}?nomsds=1`);
    const actions = watchActions(page);
    try {
      const calls = await intercept(page, (c) => ({
        body: { candidates: candidatesFor(c.q), searchedAs: c.q === hcl.name ? KOSHA_NAME : c.q },
      }));
      await expect(page.locator(sel("segmented-control")).first()).toBeVisible({ timeout: 30_000 });
      const banner = page.locator(sel(MSDS_BULK_BANNER));
      await expect(banner).toHaveCount(1);
      const start = banner.getByRole("button", { name: exact(BULK_START) });
      await hydrated(start);
      await start.click();
      const s = sheet(page);
      for (let i = 0; i < 2; i++) {
        await expect(radios(s)).toHaveCount(3, { timeout: 15_000 });
        await expect.poll(() => calls.length).toBe(i + 1);
        const c = calls[i];
        expect(casOf.has(c.q), `대상 시약 (${c.q})`).toBe(true);
        expect(c.cas, `${c.q}: cas = 시약 cas_no`).toBe(casOf.get(c.q));
        await expectCandidates(s, candidatesFor(c.q), `${i + 1}번째`);
        if (c.q === hcl.name) {
          await expect(s.getByText(noteText(hcl.name, KOSHA_NAME), { exact: true }), "안내 줄").toBeVisible();
          await expect(notes(s)).toHaveCount(1);
          await page.screenshot({ path: join(process.cwd(), "test-results", `v1-2-msds-searched-as-${viewport}.png`) });
        } else {
          await expect(notes(s), "searchedAs = 시약 이름 → 없음").toHaveCount(0);
        }
        if (i === 0) await s.getByRole("button", { name: exact(SKIP) }).click();
      }
      await s.getByRole("button", { name: exact("닫기") }).click();
      await expect(s).toHaveCount(0);
      expect(calls.map((c) => c.q).sort()).toEqual([hcl.name, plain.name].sort());
      expect(actions.count(), "건너뛰기·닫기 — 쓰기 0").toBe(0);
    } finally {
      await context.close();
    }
  });
});

// =====================================================================
// 화면 7 (공용 학교 A 교사 — 저장 안 함)
// =====================================================================
test(`[C1][S${S7}] 교사 새 시약 등록 "MSDS 찾기": 이름만 보낸다(cas 없음) · searchedAs "${KOSHA_NAME}" → "${noteText(REPORT_QUERY || "묽은 염산", KOSHA_NAME || "염화수소")}" / searchedAs = 검색어 → 안내 줄 없음 · 쓰기 0`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page, viewport } = await openAs(browser, info, "teacher", S7, intakePath({ tab: "register" }));
  const actions = watchActions(page);
  try {
    await waitIntake(page, "register");
    let same = false;
    const calls = await intercept(page, (c) => ({ body: { candidates: candidatesFor(c.q), searchedAs: same ? c.q : KOSHA_NAME } }));
    const form = registerForm(page);
    const name = form.getByRole("textbox", { name: /시약명/ }).first();
    const find = form.locator(sel(MSDS_SEARCH));
    await name.fill(REPORT_QUERY);
    await expect(find).toBeEnabled();
    await find.click();
    const s = sheet(page);
    await expectCandidates(s, candidatesFor(REPORT_QUERY), "화면 7");
    expect(calls, "화면 7: q = 시약명 · cas 없음").toEqual([{ q: REPORT_QUERY, cas: null }]);
    await expect(s.getByText(noteText(REPORT_QUERY, KOSHA_NAME), { exact: true }), "안내 줄 문구 (d7 틀)").toBeVisible();
    await expect(notes(s)).toHaveCount(1);
    await expectNoN2Terms(page, "화면 7 안내 줄");
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-7-msds-searched-as-${viewport}.png`) });
    await s.getByRole("button", { name: exact("닫기") }).click();
    await expect(s).toHaveCount(0);

    same = true;
    await find.click();
    await expectCandidates(sheet(page), candidatesFor(REPORT_QUERY), "화면 7 다시");
    expect(calls[1]).toEqual({ q: REPORT_QUERY, cas: null });
    await expect(notes(sheet(page)), "searchedAs = 검색어 → 없음").toHaveCount(0);
    await sheet(page).getByRole("button", { name: exact("닫기") }).click();
    expect(actions.count(), "저장하지 않음 — 쓰기 0").toBe(0);
  } finally {
    await context.close();
  }
});
